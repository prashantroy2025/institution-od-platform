const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const ROOT = path.resolve(__dirname, '..');
const PORT = 33900 + (process.pid % 200);
const DB_NAME = `institution_od_phase4b_${process.pid}`;
const JWT_SECRET = 'phase4b-integration-secret-0123456789012345';
const TIMEOUT_MS = 5000;
const baseUrl = `http://127.0.0.1:${PORT}`;
const users = {
    admin: { id: 1, role: 'super_admin', department_id: 1 },
    hodOne: { id: 2, role: 'hod', department_id: 1 },
    hodTwo: { id: 3, role: 'hod', department_id: 2 },
    faculty: { id: 4, role: 'organizer', department_id: 1 },
    student: { id: 5, role: 'student', department_id: 1 },
    otherStudent: { id: 6, role: 'student', department_id: 2 }
};
const tokens = Object.fromEntries(Object.entries(users).map(([key, user]) => [key, jwt.sign(user, JWT_SECRET, { expiresIn: '1h' })]));

function mysqlCli(sql, database) { execFileSync('mysql', ['--batch', '--skip-column-names', ...(database ? [database] : [])], { input: sql, cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT_MS }); }
async function request(method, resource, actor, body) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); try { const response = await fetch(`${baseUrl}${resource}`, { method, signal: controller.signal, headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let data = null; try { data = await response.json(); } catch {} return { status: response.status, data }; } finally { clearTimeout(timer); } }
async function waitForServer() { const deadline = Date.now() + TIMEOUT_MS; while (Date.now() < deadline) { try { if ((await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(400) })).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 60)); } throw new Error('Server readiness timeout'); }

test('Phase 4B class attendance CRUD, bulk marking, reports and regressions', { timeout: 45000 }, async () => {
    const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', port: Number(process.env.DB_PORT || 3306), multipleStatements: true });
    let server; let output = ''; const results = [];
    const check = async (name, callback) => { try { await callback(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); } catch (error) { results.push({ name, status: 'FAIL', evidence: error.message }); console.error(`FAIL ${name}: ${error.message}`); } };
    try {
        await connection.query(`CREATE DATABASE \`${DB_NAME}\``); await connection.changeUser({ database: DB_NAME });
        await connection.query(`
            CREATE TABLE departments (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100),hod_id INT NULL,deleted TINYINT DEFAULT 0);
            CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY,college_id VARCHAR(50),name VARCHAR(100),email VARCHAR(100),password VARCHAR(255),role ENUM('student','organizer','hod','super_admin'),is_active TINYINT DEFAULT 1,department_id INT NULL,deleted TINYINT DEFAULT 0);
            CREATE TABLE audit_logs (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,action TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,entity VARCHAR(50),entity_id INT NULL);
            INSERT INTO departments VALUES (1,'CSE',NULL,0),(2,'IT',NULL,0);
            INSERT INTO users (id,name,password,role,department_id) VALUES (1,'Admin','x','super_admin',1),(2,'HOD One','x','hod',1),(3,'HOD Two','x','hod',2),(4,'Faculty','x','organizer',1),(5,'Student','x','student',1),(6,'Other Student','x','student',2);
        `);
        mysqlCli(fs.readFileSync(path.join(ROOT, 'db/migrations/002_academic_foundation.sql'), 'utf8'), DB_NAME);
        mysqlCli(fs.readFileSync(path.join(ROOT, 'db/migrations/003_timetable_scheduling.sql'), 'utf8'), DB_NAME);
        mysqlCli(fs.readFileSync(path.join(ROOT, 'db/migrations/004_class_attendance.sql'), 'utf8'), DB_NAME);
        mysqlCli(fs.readFileSync(path.join(ROOT, 'db/migrations/004_class_attendance.sql'), 'utf8'), DB_NAME);
        await connection.query(`
            INSERT INTO academic_sessions (id,code,name,start_date,end_date) VALUES (1,'4B','Phase 4B','2026-01-01','2026-12-31');
            INSERT INTO semesters (id,session_id,number,name) VALUES (1,1,1,'Semester 1');
            INSERT INTO courses (id,department_id,code,name) VALUES (1,1,'4B-CSE','CSE'),(2,2,'4B-IT','IT');
            INSERT INTO subjects (id,course_id,semester_id,code,name) VALUES (1,1,1,'4B-MATH','Math'),(2,2,1,'4B-IT','IT Subject');
            INSERT INTO batches (id,course_id,session_id,name) VALUES (1,1,1,'Batch A'),(2,2,1,'Batch B');
            INSERT INTO sections (id,batch_id,name) VALUES (1,1,'A'),(2,2,'B');
            INSERT INTO faculty_profiles (user_id,designation) VALUES (4,'Faculty');
            INSERT INTO student_profiles (user_id,batch_id,section_id) VALUES (5,1,1),(6,2,2);
            INSERT INTO classrooms (id,department_id,code,name) VALUES (1,1,'4B-ROOM','Room 4B');
            INSERT INTO timetable_entries (id,session_id,semester_id,subject_id,batch_id,section_id,faculty_id,classroom_id,weekday,start_time,end_time) VALUES (1,1,1,1,1,1,4,1,1,'09:00:00','10:00:00');
        `);
        server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DB_NAME, JWT_SECRET, DB_HOST: process.env.DB_HOST || 'localhost', DB_USER: process.env.DB_USER || 'root', DB_PASSWORD: process.env.DB_PASSWORD || '', DB_PORT: String(process.env.DB_PORT || 3306) }, stdio: ['ignore', 'pipe', 'pipe'] });
        server.stdout.on('data', (chunk) => { output += chunk; }); server.stderr.on('data', (chunk) => { output += chunk; }); await waitForServer();
        const marks = { attendance_date: '2026-03-02', records: [{ student_id: 5, status: 'Present' }] };
        await check('unauthenticated class attendance denied', async () => assert.equal((await fetch(`${baseUrl}/api/class-attendance/history`)).status, 403));
        await check('assigned faculty bulk marking', async () => { const result = await request('POST', '/api/class-attendance/timetable/1', 'faculty', { ...marks, records: [{ student_id: 5, status: 'Present' }] }); assert.equal(result.status, 201); });
        await check('duplicate session prevention', async () => { const result = await request('POST', '/api/class-attendance/timetable/1', 'faculty', { ...marks, records: [{ student_id: 5, status: 'Late' }] }); assert.equal(result.status, 201); const [rows] = await connection.query('SELECT COUNT(*) total FROM class_attendance_sessions WHERE timetable_id=1 AND attendance_date=\'2026-03-02\''); assert.equal(Number(rows[0].total), 1); });
        await check('attendance edit and history', async () => { const result = await request('GET', '/api/class-attendance/timetable/1/2026-03-02', 'student'); assert.equal(result.status, 200); assert.equal(result.data.students[0].status, 'Late'); const history = await request('GET', '/api/class-attendance/history?date=2026-03-02&student_id=5', 'student'); assert.equal(history.status, 200); assert.equal(history.data.items[0].status, 'Late'); });
        await check('invalid date and status validation', async () => { assert.equal((await request('POST', '/api/class-attendance/timetable/1', 'faculty', { ...marks, attendance_date: '2026-03-03' })).status, 400); assert.equal((await request('POST', '/api/class-attendance/timetable/1', 'faculty', { ...marks, records: [{ student_id: 5, status: 'Unknown' }] })).status, 400); });
        await check('unassigned faculty denied', async () => assert.equal((await request('POST', '/api/class-attendance/timetable/1', 'hodTwo', marks)).status, 403));
        await check('cross-department student denied', async () => assert.equal((await request('GET', '/api/class-attendance/history?student_id=5', 'otherStudent')).status, 403));
        await check('student self-only access', async () => { assert.equal((await request('GET', '/api/class-attendance/history?student_id=6', 'student')).status, 403); assert.equal((await request('GET', '/api/class-attendance/history?student_id=5', 'student')).status, 200); });
        await check('shortage report calculation', async () => { const report = await request('GET', '/api/class-attendance/reports/shortage?threshold=80', 'student'); assert.equal(report.status, 200); assert.equal(Number(report.data.items[0].attendance_percentage), 100); assert.equal(report.data.items[0].shortage, false); });
        await check('threshold configuration and audit', async () => { assert.equal((await request('PATCH', '/api/class-attendance/threshold', 'hodOne', { threshold: 80 })).status, 403); assert.equal((await request('PATCH', '/api/class-attendance/threshold', 'admin', { threshold: 80 })).status, 200); const [rows] = await connection.query("SELECT COUNT(*) total FROM audit_logs WHERE entity IN ('class_attendance_sessions','attendance_settings')"); assert.ok(Number(rows[0].total) >= 2); });
        await check('existing academic timetable and QR routes preserved', async () => { const source = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'); assert.match(source, /app\.use\('\/api\/academics', academicRoutes\)/); assert.match(source, /app\.use\('\/api\/timetable', timetableRoutes\)/); assert.match(source, /app\.use\('\/api\/qr', qrRoutes\)/); });
        assert.equal(results.filter((result) => result.status === 'FAIL').length, 0, JSON.stringify(results, null, 2));
    } catch (error) { error.message += `\nServer output:\n${output || '(none)'}`; throw error; }
    finally { if (server) { server.kill('SIGTERM'); await new Promise((resolve) => setTimeout(resolve, 250)); if (!server.killed) server.kill('SIGKILL'); } await connection.changeUser({ database: undefined }); await connection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``); await connection.end(); }
});