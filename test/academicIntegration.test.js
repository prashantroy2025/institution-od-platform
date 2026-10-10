const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const ROOT = path.resolve(__dirname, '..');
const PORT = 33100 + (process.pid % 500);
const DB_NAME = `institution_od_phase3c_${process.pid}`;
const JWT_SECRET = 'phase3c-integration-secret-0123456789012345';
const TIMEOUT_MS = 5000;
const baseUrl = `http://127.0.0.1:${PORT}`;

const users = {
    admin: { id: 1, role: 'super_admin', department_id: 1 },
    hodOne: { id: 2, role: 'hod', department_id: 1 },
    hodTwo: { id: 3, role: 'hod', department_id: 2 },
    student: { id: 4, role: 'student', department_id: 1 },
    otherStudent: { id: 5, role: 'student', department_id: 2 },
    organizer: { id: 6, role: 'organizer', department_id: 1 }
};

const tokenFor = (user) => jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
const tokens = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, tokenFor(user)]));

function runMysql(sql, database) {
    const args = ['--batch', '--skip-column-names'];
    if (database) args.push(database);
    execFileSync('mysql', args, { input: sql, cwd: ROOT, env: process.env, encoding: 'utf8', timeout: TIMEOUT_MS });
}

async function request(method, resource, actor, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(`${baseUrl}${resource}`, {
            method,
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${tokens[actor]}`,
                'Content-Type': 'application/json'
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        let data = null;
        try { data = await response.json(); } catch {}
        return { status: response.status, data };
    } finally {
        clearTimeout(timer);
    }
}

async function waitForServer() {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 75));
    }
    throw new Error('Test server did not become ready within the timeout');
}

test('Phase 3C authenticated academic API integration', { timeout: 45000 }, async () => {
    const adminConnection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: Number(process.env.DB_PORT || 3306),
        multipleStatements: true
    });
    let server;
    const records = [];
    const results = [];

    const check = async (name, callback) => {
        try {
            await callback();
            results.push({ name, status: 'PASS' });
            console.log(`PASS ${name}`);
        } catch (error) {
            results.push({ name, status: 'FAIL', evidence: error.message });
            console.error(`FAIL ${name}: ${error.message}`);
        }
    };

    const create = async (entity, actor, body) => {
        const response = await request('POST', `/api/academics/${entity}`, actor, body);
        if (response.status === 201 && response.data?.id) records.push([entity, response.data.id]);
        return response;
    };

    try {
        await adminConnection.query(`CREATE DATABASE \`${DB_NAME}\``);
        await adminConnection.changeUser({ database: DB_NAME });
        await adminConnection.query(`
            CREATE TABLE departments (
                id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                hod_id INT NULL,
                deleted TINYINT DEFAULT 0
            ) ENGINE=InnoDB;
            CREATE TABLE users (
                id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                college_id VARCHAR(50) UNIQUE,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('student','organizer','hod','super_admin') NOT NULL,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                department_id INT NULL,
                deleted TINYINT DEFAULT 0,
                club_name VARCHAR(100) NULL,
                CONSTRAINT test_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;
            CREATE TABLE audit_logs (
                id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                action TEXT NOT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                entity VARCHAR(50) NULL,
                entity_id INT NULL,
                CONSTRAINT test_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;
            INSERT INTO departments (id, name) VALUES (1, 'Test CSE'), (2, 'Test IT');
            INSERT INTO users (id, college_id, name, email, password, role, department_id) VALUES
                (1, 'ADMIN3C', 'Admin', 'admin3c@example.edu', 'x', 'super_admin', 1),
                (2, 'HOD3C1', 'HOD One', 'hod1-3c@example.edu', 'x', 'hod', 1),
                (3, 'HOD3C2', 'HOD Two', 'hod2-3c@example.edu', 'x', 'hod', 2),
                (4, 'STU3C1', 'Student One', 'student1-3c@example.edu', 'x', 'student', 1),
                (5, 'STU3C2', 'Student Two', 'student2-3c@example.edu', 'x', 'student', 2),
                (6, 'ORG3C1', 'Organizer One', 'organizer-3c@example.edu', 'x', 'organizer', 1);
        `);

        runMysql(fs.readFileSync(path.join(ROOT, 'db/migrations/002_academic_foundation.sql'), 'utf8'), DB_NAME);
        runMysql(fs.readFileSync(path.join(ROOT, 'db/migrations/002_academic_foundation.sql'), 'utf8'), DB_NAME);

        server = spawn(process.execPath, ['server.js'], {
            cwd: ROOT,
            env: {
                ...process.env,
                NODE_ENV: 'test',
                PORT: String(PORT),
                DB_NAME,
                JWT_SECRET,
                DB_HOST: process.env.DB_HOST || 'localhost',
                DB_USER: process.env.DB_USER || 'root',
                DB_PASSWORD: process.env.DB_PASSWORD || '',
                DB_PORT: String(process.env.DB_PORT || 3306)
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let serverOutput = '';
        server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
        server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
        await waitForServer();

        await check('unauthenticated access denied', async () => assert.equal((await fetch(`${baseUrl}/api/academics/sessions`)).status, 403));

        let response = await create('sessions', 'admin', { code: '3C-SESSION', name: 'Phase 3C Session', start_date: '2026-01-01', end_date: '2026-12-31' });
        await check('sessions create', async () => assert.equal(response.status, 201));
        const sessionId = response.data.id;
        await check('sessions update', async () => assert.equal((await request('PATCH', `/api/academics/sessions/${sessionId}`, 'admin', { name: 'Phase 3C Updated' })).status, 200));
        await check('sessions search and pagination', async () => { const result = await request('GET', '/api/academics/sessions?search=Updated&limit=1&offset=0', 'admin'); assert.equal(result.status, 200); assert.equal(result.data.pagination.total, 1); });

        response = await create('semesters', 'admin', { session_id: sessionId, number: 1, name: 'Phase 3C Semester' });
        await check('semesters create', async () => assert.equal(response.status, 201));
        const semesterId = response.data.id;
        await check('semesters update', async () => assert.equal((await request('PATCH', `/api/academics/semesters/${semesterId}`, 'admin', { name: 'Phase 3C Semester Updated' })).status, 200));

        response = await create('courses', 'admin', { department_id: 1, code: '3C-COURSE', name: 'Phase 3C Course', duration_semesters: 8 });
        await check('courses create', async () => assert.equal(response.status, 201));
        const courseId = response.data.id;
        await check('courses update', async () => assert.equal((await request('PATCH', `/api/academics/courses/${courseId}`, 'admin', { name: 'Phase 3C Course Updated' })).status, 200));

        response = await create('subjects', 'admin', { course_id: courseId, semester_id: semesterId, code: '3C-SUBJECT', name: 'Phase 3C Subject', credits: 3 });
        await check('subjects create', async () => assert.equal(response.status, 201));
        const subjectId = response.data.id;
        await check('subjects update', async () => assert.equal((await request('PATCH', `/api/academics/subjects/${subjectId}`, 'admin', { name: 'Phase 3C Subject Updated' })).status, 200));

        response = await create('batches', 'admin', { course_id: courseId, session_id: sessionId, name: 'Phase 3C Batch', start_year: 2026, end_year: 2030 });
        await check('batches create', async () => assert.equal(response.status, 201));
        const batchId = response.data.id;
        await check('batches update', async () => assert.equal((await request('PATCH', `/api/academics/batches/${batchId}`, 'admin', { name: 'Phase 3C Batch Updated' })).status, 200));

        response = await create('sections', 'admin', { batch_id: batchId, name: 'A', advisor_id: 2 });
        await check('sections create', async () => assert.equal(response.status, 201));
        const sectionId = response.data.id;
        await check('sections update', async () => assert.equal((await request('PATCH', `/api/academics/sections/${sectionId}`, 'admin', { name: 'B' })).status, 200));

        response = await create('studentProfiles', 'student', { user_id: 4, enrollment_no: '3C-STUDENT', phone: '5550300', batch_id: batchId, section_id: sectionId });
        await check('student profile self-create', async () => assert.equal(response.status, 201));
        await check('student profile self-update', async () => assert.equal((await request('PATCH', '/api/academics/studentProfiles/4', 'student', { phone: '5550301' })).status, 200));

        response = await create('facultyProfiles', 'organizer', { user_id: 6, designation: 'Faculty Organizer', employee_code: '3C-FACULTY' });
        await check('faculty profile self-create', async () => assert.equal(response.status, 201));
        await check('faculty profile self-update', async () => assert.equal((await request('PATCH', '/api/academics/facultyProfiles/6', 'organizer', { phone: '5550302' })).status, 200));

        await check('HOD same-department create allowed', async () => { const result = await create('courses', 'hodOne', { department_id: 1, code: '3C-HOD-OWN', name: 'HOD Own Course' }); assert.equal(result.status, 201); });
        await check('HOD cross-department create denied', async () => assert.equal((await request('POST', '/api/academics/courses', 'hodOne', { department_id: 2, code: '3C-HOD-WRONG', name: 'Wrong Department' })).status, 403));
        await check('HOD cross-department update denied', async () => { const result = await create('courses', 'admin', { department_id: 2, code: '3C-OTHER', name: 'Other Department Course' }); assert.equal((await request('PATCH', `/api/academics/courses/${result.data.id}`, 'hodOne', { name: 'Should Fail' })).status, 403); });
        await check('HOD same-department listing scoped', async () => { const result = await request('GET', '/api/academics/courses', 'hodOne'); assert.equal(result.status, 200); assert.ok(result.data.items.every((item) => item.department_id === 1)); });
        await check('student cross-profile denied', async () => assert.equal((await request('PATCH', '/api/academics/studentProfiles/5', 'student', { phone: 'x' })).status, 403));
        await check('organizer cross-profile denied', async () => assert.equal((await request('PATCH', '/api/academics/facultyProfiles/2', 'organizer', { phone: 'x' })).status, 403));
        await check('student master-data denied', async () => assert.equal((await request('POST', '/api/academics/courses', 'student', { department_id: 1, code: '3C-STUDENT-NO', name: 'Denied' })).status, 403));
        await check('organizer master-data denied', async () => assert.equal((await request('POST', '/api/academics/courses', 'organizer', { department_id: 1, code: '3C-ORG-NO', name: 'Denied' })).status, 403));
        await check('invalid date validation', async () => assert.equal((await request('POST', '/api/academics/sessions', 'admin', { code: '3C-BAD-DATE', name: 'Bad', start_date: '2026-02-30', end_date: '2026-12-31' })).status, 400));
        await check('foreign-key error', async () => assert.equal((await request('POST', '/api/academics/courses', 'admin', { department_id: 999999, code: '3C-BAD-FK', name: 'Bad FK' })).status, 400));
        await check('duplicate error', async () => assert.equal((await request('POST', '/api/academics/sessions', 'admin', { code: '3C-SESSION', name: 'Duplicate', start_date: '2026-01-01', end_date: '2026-12-31' })).status, 409));
        await check('audit logs recorded', async () => { const [rows] = await adminConnection.query("SELECT COUNT(*) AS total FROM audit_logs WHERE entity IN ('academic_sessions','semesters','courses','subjects','batches','sections','student_profiles','faculty_profiles')"); assert.ok(Number(rows[0].total) >= 10); });
        await check('all eight resource deletes', async () => {
            const deleted = [];
            for (const [entity, id] of [...records].reverse()) {
                const result = await request('DELETE', `/api/academics/${entity}/${id}`, 'admin');
                assert.equal(result.status, 204, `${entity}/${id} returned ${result.status}`);
                deleted.push([entity, id]);
            }
            records.length = 0;
            assert.equal(deleted.length >= 8, true);
        });
        await check('existing health endpoint regression', async () => { const result = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) }); assert.equal(result.status, 200); });
        await check('existing event and QR route regression', async () => { const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'); assert.match(serverSource, /app\.use\('\/api\/events', eventRoutes\)/); assert.match(serverSource, /app\.use\('\/api\/qr', qrRoutes\)/); });

        assert.equal(results.filter((result) => result.status === 'FAIL').length, 0, JSON.stringify(results, null, 2));
    } catch (error) {
        error.message += `\nServer output:\n${serverOutput || '(none)'}`;
        throw error;
    } finally {
        if (server) {
            server.kill('SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 250));
            if (!server.killed) server.kill('SIGKILL');
        }
        await adminConnection.changeUser({ database: undefined });
        await adminConnection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
        await adminConnection.end();
    }
});