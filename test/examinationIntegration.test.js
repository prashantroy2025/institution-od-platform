const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const ROOT = path.resolve(__dirname, '..'); const PORT = 34500 + (process.pid % 200); const DB_NAME = `institution_od_phase5_${process.pid}`; const SECRET = 'phase5-examination-integration-secret-012345'; const base = `http://127.0.0.1:${PORT}`;
const users = { admin: { id: 1, role: 'super_admin', department_id: 1, name: 'Admin' }, hod: { id: 2, role: 'hod', department_id: 1, name: 'HOD' }, faculty: { id: 4, role: 'organizer', department_id: 1, name: 'Faculty' }, other: { id: 6, role: 'organizer', department_id: 2, name: 'Other' }, student: { id: 5, role: 'student', department_id: 1, name: 'Student', college_id: 'S5' }, otherStudent: { id: 7, role: 'student', department_id: 2, name: 'Other Student', college_id: 'S7' } };
const tokens = Object.fromEntries(Object.entries(users).map(([key, user]) => [key, jwt.sign(user, SECRET, { expiresIn: '1h' })]));
const cli = (sql) => execFileSync('mysql', ['--batch', '--skip-column-names', DB_NAME], { input: sql, cwd: ROOT, encoding: 'utf8' });
async function request(method, url, actor, body) { const r = await fetch(`${base}${url}`, { method, headers: { Authorization: `Bearer ${tokens[actor]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const data = await r.json().catch(() => null); return { status: r.status, data }; }
async function waitForServer() { const end = Date.now() + 5000; while (Date.now() < end) { try { if ((await fetch(`${base}/health`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 80)); } throw new Error('server did not start'); }

test('Phase 5 examination CRUD, registration, seating, marks, publication and regressions', { timeout: 50000 }, async () => {
    const root = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', port: Number(process.env.DB_PORT || 3306), multipleStatements: true }); let server;
    try {
        await root.query(`CREATE DATABASE \`${DB_NAME}\``); await root.changeUser({ database: DB_NAME });
        await root.query(`CREATE TABLE departments (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100),hod_id INT NULL,deleted TINYINT DEFAULT 0); CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY,college_id VARCHAR(50),name VARCHAR(100),email VARCHAR(100),password VARCHAR(255),role ENUM('student','organizer','hod','super_admin'),is_active TINYINT DEFAULT 1,department_id INT NULL,deleted TINYINT DEFAULT 0); CREATE TABLE audit_logs (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,action TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,entity VARCHAR(50),entity_id INT NULL); INSERT INTO departments VALUES (1,'CSE',NULL,0),(2,'IT',NULL,0); INSERT INTO users (id,college_id,name,password,role,department_id) VALUES (1,'A1','Admin','x','super_admin',1),(2,'H2','HOD','x','hod',1),(4,'F4','Faculty','x','organizer',1),(5,'S5','Student','x','student',1),(6,'F6','Other','x','organizer',2),(7,'S7','Other Student','x','student',2);`);
        cli(fs.readFileSync(path.join(ROOT, 'db/migrations/002_academic_foundation.sql'), 'utf8')); cli(fs.readFileSync(path.join(ROOT, 'db/migrations/003_timetable_scheduling.sql'), 'utf8')); cli(fs.readFileSync(path.join(ROOT, 'db/migrations/007_examination_management.sql'), 'utf8')); cli(fs.readFileSync(path.join(ROOT, 'db/migrations/007_examination_management.sql'), 'utf8'));
        await root.query(`INSERT INTO academic_sessions (id,code,name,start_date,end_date) VALUES (1,'S5','Session 5','2026-01-01','2026-12-31'); INSERT INTO semesters (id,session_id,number,name) VALUES (1,1,1,'One'); INSERT INTO courses (id,department_id,code,name) VALUES (1,1,'CSE5','CSE'),(2,2,'IT5','IT'); INSERT INTO subjects (id,course_id,semester_id,code,name) VALUES (1,1,1,'M5','Math'),(2,2,1,'I5','IT'); INSERT INTO batches (id,course_id,session_id,name) VALUES (1,1,1,'A'),(2,2,1,'B'); INSERT INTO sections (id,batch_id,name) VALUES (1,1,'A1'),(2,2,'B1'); INSERT INTO faculty_profiles (user_id,employee_code) VALUES (4,'F4'),(6,'F6'); INSERT INTO student_profiles (user_id,batch_id,section_id) VALUES (5,1,1),(7,2,2); INSERT INTO classrooms (id,department_id,code,name,capacity) VALUES (1,1,'R5','Room 5',2); INSERT INTO timetable_entries (id,session_id,semester_id,subject_id,batch_id,section_id,faculty_id,classroom_id,weekday,start_time,end_time) VALUES (1,1,1,1,1,1,4,1,1,'09:00:00','10:00:00');`);
        server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DB_NAME, JWT_SECRET: SECRET, DB_HOST: process.env.DB_HOST || 'localhost', DB_USER: process.env.DB_USER || 'root', DB_PASSWORD: process.env.DB_PASSWORD || '', DB_PORT: String(process.env.DB_PORT || 3306) }, stdio: 'ignore' }); await waitForServer();
        // Deterministic datetimes relative to "now" so the registration window is
        // OPEN at test time regardless of the calendar date the suite runs on.
        // The production rule (reject if not yet open / past deadline) is unchanged.
        const pad = n => String(n).padStart(2, '0');
        const dtLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const now = Date.now(); const DAY = 86400000;
        const body = { session_id: 1, semester_id: 1, subject_id: 1, batch_id: 1, section_id: 1, title: 'Final Mathematics', exam_type: 'Final', registration_open_at: dtLocal(new Date(now - DAY)), registration_deadline: dtLocal(new Date(now + 30 * DAY)), scheduled_start: dtLocal(new Date(now + 31 * DAY)), scheduled_end: dtLocal(new Date(now + 31 * DAY + 3 * 3600000)), room_id: 1, maximum_marks: 100, pass_marks: 40, grading_rules: { bands: [{ grade: 'A', min_percent: 80 }, { grade: 'B', min_percent: 60 }, { grade: 'C', min_percent: 40 }, { grade: 'F', min_percent: 0 }] }, status: 'Registration Open' };
        const created = await request('POST', '/api/examinations', 'faculty', body); assert.equal(created.status, 201, JSON.stringify(created.data)); const examId = created.data.id;
        assert.equal((await request('POST', '/api/examinations', 'other', body)).status, 403);
        assert.equal((await request('GET', `/api/examinations/${examId}`, 'otherStudent')).status, 403);
        assert.equal((await request('POST', `/api/examinations/${examId}/register`, 'student')).status, 201);
        assert.equal((await request('POST', `/api/examinations/${examId}/register`, 'student')).status, 409);
        assert.equal((await request('POST', `/api/examinations/${examId}/register`, 'otherStudent')).status, 403);
        // Explicit registration-window scenarios (production rules unchanged):
        // (a) not-yet-open window must be rejected; (b) past-deadline window must be rejected.
        const notOpen = { ...body, title: 'Opens Later', registration_open_at: dtLocal(new Date(now + 5 * DAY)), registration_deadline: dtLocal(new Date(now + 30 * DAY)), scheduled_start: null, scheduled_end: null, room_id: null };
        const notOpenExam = await request('POST', '/api/examinations', 'faculty', notOpen); assert.equal(notOpenExam.status, 201, JSON.stringify(notOpenExam.data));
        assert.equal((await request('POST', `/api/examinations/${notOpenExam.data.id}/register`, 'student')).status, 400);
        const closed = { ...body, title: 'Closed Earlier', registration_open_at: dtLocal(new Date(now - 30 * DAY)), registration_deadline: dtLocal(new Date(now - 1 * DAY)), scheduled_start: null, scheduled_end: null, room_id: null };
        const closedExam = await request('POST', '/api/examinations', 'faculty', closed); assert.equal(closedExam.status, 201, JSON.stringify(closedExam.data));
        assert.equal((await request('POST', `/api/examinations/${closedExam.data.id}/register`, 'student')).status, 400);
        const seats = await request('POST', `/api/examinations/${examId}/allocate-seats`, 'hod'); assert.equal(seats.status, 200); assert.equal(seats.data.allocated, 1);
        assert.equal((await request('POST', `/api/examinations/${examId}/marks`, 'faculty', { student_id: 5, marks: 85 })).status, 200);
        assert.equal((await request('POST', `/api/examinations/${examId}/marks`, 'faculty', { student_id: 5, marks: 101 })).status, 400);
        assert.equal((await request('GET', `/api/examinations/${examId}/result`, 'student')).status, 403);
        assert.equal((await request('POST', `/api/examinations/${examId}/publish`, 'faculty')).status, 403);
        assert.equal((await request('POST', `/api/examinations/${examId}/publish`, 'hod')).status, 200);
        const result = await request('GET', `/api/examinations/${examId}/result`, 'student'); assert.equal(result.status, 200); assert.equal(result.data.summary.grade, 'A'); assert.equal(result.data.summary.pass, true);
        const card = await fetch(`${base}/api/examinations/${examId}/admit-card`, { headers: { Authorization: `Bearer ${tokens.student}` } }); assert.equal(card.status, 200); assert.match(await card.text(), /ADMIT CARD/);
        const csv = await fetch(`${base}/api/examinations/reports/export`, { headers: { Authorization: `Bearer ${tokens.hod}` } }); assert.equal(csv.status, 200); assert.match(await csv.text(), /Final Mathematics/);
        const [auditRows] = await root.query("SELECT COUNT(*) total FROM audit_logs WHERE entity IN ('examinations','examination_registrations','examination_marks','examination_seats')"); assert.ok(Number(auditRows[0].total) >= 5);
        const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'); assert.match(serverSource, /app\.use\('\/api\/learning', learningRoutes\)/); assert.match(serverSource, /app\.use\('\/api\/timetable', timetableRoutes\)/); assert.match(serverSource, /app\.use\('\/api\/events', eventRoutes\)/);
    } finally { if (server) { server.kill('SIGTERM'); await new Promise(resolve => setTimeout(resolve, 200)); } await root.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``); await root.end(); }
});