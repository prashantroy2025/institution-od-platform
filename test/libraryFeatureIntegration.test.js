const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const rootPath = path.resolve(__dirname, '..');
const port = 35100 + (process.pid % 200);
const database = `institution_od_library_features_${process.pid}`;
const secret = 'library-features-integration-secret-0123456789';
const base = `http://127.0.0.1:${port}`;
const admin = { id: 1, role: 'super_admin', department_id: 1 };
const student = { id: 5, role: 'student', department_id: 1 };
const otherStudent = { id: 6, role: 'student', department_id: 1 };
const token = user => jwt.sign(user, secret);

async function request(method, url, user, body) {
    const response = await fetch(base + url, {
        method,
        headers: { Authorization: `Bearer ${token(user)}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => null) };
}

async function waitForServer() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 70));
    }
    throw new Error('Library feature test server did not start');
}

test('Library renewal, private records, reservations, policies, and space booking persist through APIs', { timeout: 60000 }, async () => {
    const root = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: Number(process.env.DB_PORT || 3306),
        multipleStatements: true,
    });
    let server;
    try {
        await root.query(`CREATE DATABASE \`${database}\``);
        await root.changeUser({ database });
        await root.query("CREATE TABLE departments(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(80),deleted TINYINT DEFAULT 0); CREATE TABLE users(id INT AUTO_INCREMENT PRIMARY KEY,college_id VARCHAR(50),name VARCHAR(100),password VARCHAR(255),role ENUM('student','organizer','hod','super_admin'),department_id INT,is_active TINYINT DEFAULT 1,deleted TINYINT DEFAULT 0); CREATE TABLE audit_logs(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,action TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,entity VARCHAR(60),entity_id INT); CREATE TABLE student_profiles(user_id INT PRIMARY KEY,batch_id INT,section_id INT); CREATE TABLE batches(id INT AUTO_INCREMENT PRIMARY KEY,course_id INT); CREATE TABLE courses(id INT AUTO_INCREMENT PRIMARY KEY,department_id INT); INSERT INTO departments VALUES(1,'CSE',0); INSERT INTO users(id,name,password,role,department_id) VALUES(1,'Admin','x','super_admin',1),(5,'Student','x','student',1),(6,'Other Student','x','student',1);");
        for (const file of ['008_finance_core.sql', '009_library_core.sql', '011_library_features.sql']) {
            await root.query(fs.readFileSync(path.join(rootPath, 'db/migrations', file), 'utf8'));
        }
        server = spawn(process.execPath, ['server.js'], {
            cwd: rootPath,
            env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DB_NAME: database, JWT_SECRET: secret, DB_HOST: process.env.DB_HOST || 'localhost', DB_USER: process.env.DB_USER || 'root', DB_PASSWORD: process.env.DB_PASSWORD || '', DB_PORT: String(process.env.DB_PORT || 3306) },
            stdio: 'ignore',
        });
        await waitForServer();

        const create = await request('POST', '/api/library/books', admin, { title: 'Feature Integration Book', copy_accessions: ['FEATURE-COPY-1'] });
        assert.equal(create.status, 201);
        const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16).replace('T', ' ');
        const copy = await root.query('SELECT id FROM library_copies WHERE book_id=?', [create.data.id]);
        assert.equal((await request('POST', '/api/library/issue', admin, { student_id: student.id, copy_id: copy[0][0].id, due_at: due })).status, 201);
        assert.equal((await request('GET', '/api/library/my-loans', otherStudent)).data.length, 0);
        assert.equal((await request('PUT', '/api/library/settings', admin, { max_renewals: 2, renewal_days: 7 })).status, 200);
        const loans = await request('GET', '/api/library/my-loans', student);
        const renewed = await request('POST', `/api/library/loans/${loans.data[0].id}/renew`, student, {});
        assert.equal(renewed.status, 200);
        assert.ok(new Date(renewed.data.due_at) > new Date(due));
        await root.query('UPDATE library_loans SET issued_at=DATE_SUB(NOW(),INTERVAL 2 DAY),due_at=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE id=?', [loans.data[0].id]);
        assert.equal((await request('POST', `/api/library/loans/${loans.data[0].id}/return`, admin, {})).status, 200);
        const fines = await request('GET', '/api/library/fines', student);
        assert.equal(fines.status, 200);
        assert.ok(Number(fines.data[0].fine_paise) > 0);
        assert.equal((await request('GET', '/api/library/fines', otherStudent)).data.length, 0);
        const payment = await request('POST', '/api/finance/payments', student, { invoice_id: fines.data[0].invoice_id, amount_paise: String(fines.data[0].fine_paise), method: 'Offline', reference_no: 'FEATURE-PAYMENT-1' });
        assert.equal(payment.status, 201);
        assert.equal(payment.data.status, 'Pending');

        const noCopies = await request('POST', '/api/library/books', admin, { title: 'Reservation Integration Book' });
        assert.equal(noCopies.status, 201);
        const reservation = await request('POST', `/api/library/books/${noCopies.data.id}/reserve`, student, {});
        assert.equal(reservation.status, 201);
        assert.equal((await request('GET', '/api/library/reservations', otherStudent)).data.length, 0);
        assert.equal((await request('DELETE', `/api/library/reservations/${reservation.data.id}`, student)).data.status, 'Cancelled');
        assert.equal((await request('GET', '/api/library/reading-history', student)).data[0].activity_type, 'Loan');

        assert.equal((await request('POST', '/api/library/rules', admin, { title: 'Quiet areas', body: 'Keep study rooms quiet.' })).status, 201);
        assert.equal((await request('GET', '/api/library/rules', student)).data.configured, true);
        const facility = await request('POST', '/api/library/facilities', admin, { name: 'Study Room', capacity: 2, opens_at: '08:00', closes_at: '20:00' });
        assert.equal(facility.status, 201);
        const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const booking = await request('POST', `/api/library/facilities/${facility.data.id}/bookings`, student, { booking_date: date, starts_at: '10:00', ends_at: '11:00' });
        assert.equal(booking.status, 201);
        assert.equal((await request('GET', '/api/library/bookings', otherStudent)).data.length, 0);
        assert.equal((await request('DELETE', `/api/library/bookings/${booking.data.id}`, student)).data.status, 'Cancelled');
    } finally {
        if (server) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
        await root.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => {});
        await root.end();
    }
});
