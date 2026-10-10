const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const ROOT = path.resolve(__dirname, '..');
const PORT = 33600 + (process.pid % 300);
const DB_NAME = `institution_od_phase4a_${process.pid}`;
const JWT_SECRET = 'phase4a-integration-secret-0123456789012345';
const TIMEOUT_MS = 5000;
const baseUrl = `http://127.0.0.1:${PORT}`;
const users = {
    admin: { id: 1, role: 'super_admin', department_id: 1 },
    hodOne: { id: 2, role: 'hod', department_id: 1 },
    hodTwo: { id: 3, role: 'hod', department_id: 2 },
    organizer: { id: 4, role: 'organizer', department_id: 1 },
    student: { id: 5, role: 'student', department_id: 1 }
};
const tokens = Object.fromEntries(Object.entries(users).map(([key, user]) => [key, jwt.sign(user, JWT_SECRET, { expiresIn: '1h' })]));

function mysqlCli(sql, database) { execFileSync('mysql', ['--batch', '--skip-column-names', ...(database ? [database] : [])], { input: sql, cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT_MS }); }
async function request(method, resource, actor, body) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try { const response = await fetch(`${baseUrl}${resource}`, { method, signal: controller.signal, headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let data = null; try { data = await response.json(); } catch {} return { status: response.status, data }; } finally { clearTimeout(timer); }
}
async function waitForServer() { const deadline = Date.now() + TIMEOUT_MS; while (Date.now() < deadline) { try { if ((await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(400) })).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 60)); } throw new Error('Server readiness timeout'); }

test('Phase 4A timetable CRUD, conflicts, permissions and regressions', { timeout: 45000 }, async () => {
    const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', port: Number(process.env.DB_PORT || 3306), multipleStatements: true });
    let server; const results = [];
    const check = async (name, callback) => { try { await callback(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); } catch (error) { results.push({ name, status: 'FAIL', evidence: error.message }); console.error(`FAIL ${name}: ${error.message}`); } };
    let output = '';
    try {
        await connection.query(`CREATE DATABASE \`${DB_NAME}\``); await connection.changeUser({ database: DB_NAME });
        await connection.query(`
            CREATE TABLE departments (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, hod_id INT NULL, deleted TINYINT DEFAULT 0);
            CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, college_id VARCHAR(50), name VARCHAR(100) NOT NULL, email VARCHAR(100), password VARCHAR(255) NOT NULL, role ENUM('student','organizer','hod','super_admin') NOT NULL, is_active TINYINT DEFAULT 1, department_id INT NULL, deleted TINYINT DEFAULT 0);
            CREATE TABLE audit_logs (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NULL, action TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, entity VARCHAR(50), entity_id INT NULL);
            INSERT INTO departments VALUES (1,'CSE',NULL,0),(2,'IT',NULL,0);
            INSERT INTO users (id,name,password,role,department_id) VALUES (1,'Admin','x','super_admin',1),(2,'HOD One','x','hod',1),(3,'HOD Two','x','hod',2),(4,'Organizer','x','organizer',1),(5,'Student','x','student',1);
        `);
        mysqlCli(fs.readFileSync(path.join(ROOT, 'db/migrations/002_academic_foundation.sql'), 'utf8'), DB_NAME);
        mysqlCli(fs.readFileSync(path.join(ROOT, 'db/migrations/003_timetable_scheduling.sql'), 'utf8'), DB_NAME);
        mysqlCli(fs.readFileSync(path.join(ROOT, 'db/migrations/003_timetable_scheduling.sql'), 'utf8'), DB_NAME);
        await connection.query(`
            INSERT INTO academic_sessions (id,code,name,start_date,end_date) VALUES (1,'4A','Phase 4A','2026-01-01','2026-12-31');
            INSERT INTO semesters (id,session_id,number,name) VALUES (1,1,1,'Semester 1');
            INSERT INTO courses (id,department_id,code,name) VALUES (1,1,'4A-CSE','CSE'),(2,2,'4A-IT','IT');
            INSERT INTO subjects (id,course_id,semester_id,code,name) VALUES (1,1,1,'4A-MATH','Math'),(2,2,1,'4A-IT','IT Subject');
            INSERT INTO batches (id,course_id,session_id,name) VALUES (1,1,1,'Batch A'),(2,2,1,'Batch B');
            INSERT INTO sections (id,batch_id,name) VALUES (1,1,'A'),(2,2,'B');
            INSERT INTO classrooms (id,department_id,code,name) VALUES (1,1,'ROOM-A','Room A'),(2,2,'ROOM-B','Room B'),(3,1,'ROOM-C','Room C');
            INSERT INTO student_profiles (user_id,batch_id,section_id) VALUES (5,1,1);
        `);
        server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DB_NAME, JWT_SECRET, DB_HOST: process.env.DB_HOST || 'localhost', DB_USER: process.env.DB_USER || 'root', DB_PASSWORD: process.env.DB_PASSWORD || '', DB_PORT: String(process.env.DB_PORT || 3306) }, stdio: ['ignore', 'pipe', 'pipe'] });
        server.stdout.on('data', (chunk) => { output += chunk; }); server.stderr.on('data', (chunk) => { output += chunk; }); await waitForServer();

        const entry = { session_id: 1, semester_id: 1, subject_id: 1, batch_id: 1, section_id: 1, faculty_id: 2, classroom_id: 1, weekday: 1, start_time: '09:00', end_time: '10:00' };
        await check('unauthenticated timetable denied', async () => assert.equal((await fetch(`${baseUrl}/api/timetable`)).status, 403));
        await check('classroom list and weekly empty view', async () => { const classrooms = await request('GET', '/api/timetable/classrooms?search=ROOM', 'admin'); assert.equal(classrooms.status, 200); assert.equal(classrooms.data.items.length, 3); const week = await request('GET', '/api/timetable?weekday=1&limit=10', 'admin'); assert.equal(week.status, 200); assert.equal(week.data.pagination.total, 0); });
        await check('HOD same-department classroom create', async () => { const result = await request('POST', '/api/timetable/classrooms', 'hodOne', { code: 'ROOM-A2', name: 'Room A2', capacity: 40 }); assert.equal(result.status, 201); });
        await check('HOD cross-department classroom denied', async () => assert.equal((await request('POST', '/api/timetable/classrooms', 'hodOne', { department_id: 2, code: 'BAD', name: 'Bad' })).status, 403));
        const created = await request('POST', '/api/timetable', 'hodOne', entry);
        await check('timetable create', async () => assert.equal(created.status, 201));
        const entryId = created.data.id;
        await check('timetable weekly filter and joined view', async () => { const result = await request('GET', '/api/timetable?weekday=1&session_id=1&semester_id=1', 'student'); assert.equal(result.status, 200); assert.equal(result.data.items[0].subject_name, 'Math'); });
        await check('timetable update', async () => assert.equal((await request('PATCH', `/api/timetable/${entryId}`, 'hodOne', { end_time: '10:30' })).status, 200));
        await check('faculty overlap conflict', async () => assert.equal((await request('POST', '/api/timetable', 'admin', { ...entry, start_time: '10:15', end_time: '11:00', section_id: 1, classroom_id: 1 })).status, 409));
        await check('room overlap conflict', async () => assert.equal((await request('POST', '/api/timetable', 'admin', { ...entry, faculty_id: 4, start_time: '09:30', end_time: '10:15', section_id: 1 })).status, 409));
        await check('section overlap conflict', async () => assert.equal((await request('POST', '/api/timetable', 'admin', { ...entry, faculty_id: 4, classroom_id: 3, start_time: '09:30', end_time: '10:15', section_id: 1 })).status, 409));
        await check('invalid weekday and time validation', async () => { assert.equal((await request('POST', '/api/timetable', 'admin', { ...entry, weekday: 8 })).status, 400); assert.equal((await request('POST', '/api/timetable', 'admin', { ...entry, start_time: '11:00', end_time: '10:00' })).status, 400); });
        await check('relationship validation', async () => assert.equal((await request('POST', '/api/timetable', 'admin', { ...entry, subject_id: 2 })).status, 400));
        await check('HOD cross-department timetable denied', async () => assert.equal((await request('POST', '/api/timetable', 'hodOne', { ...entry, subject_id: 2, batch_id: 2, section_id: 2, classroom_id: 2 })).status, 403));
        await check('student and organizer writes denied', async () => { assert.equal((await request('POST', '/api/timetable', 'student', entry)).status, 403); assert.equal((await request('PATCH', `/api/timetable/${entryId}`, 'organizer', { end_time: '11:00' })).status, 403); });
        await check('audit changes recorded', async () => { const [rows] = await connection.query("SELECT COUNT(*) AS total FROM audit_logs WHERE entity IN ('timetable_entries','classrooms')"); assert.ok(Number(rows[0].total) >= 3); });
        await check('timetable delete', async () => assert.equal((await request('DELETE', `/api/timetable/${entryId}`, 'hodOne')).status, 204));
        await check('existing event QR route regression', async () => { const source = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'); assert.match(source, /app\.use\('\/api\/events', eventRoutes\)/); assert.match(source, /app\.use\('\/api\/qr', qrRoutes\)/); });
        assert.equal(results.filter((result) => result.status === 'FAIL').length, 0, JSON.stringify(results, null, 2));
    } catch (error) { error.message += `\nServer output:\n${output || '(none)'}`; throw error; }
    finally { if (server) { server.kill('SIGTERM'); await new Promise((resolve) => setTimeout(resolve, 250)); if (!server.killed) server.kill('SIGKILL'); } await connection.changeUser({ database: undefined }); await connection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``); await connection.end(); }
});