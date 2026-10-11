// Live-integration harness for a disposable development/test MySQL database.
//
// Safety contract:
//   - The target database name must look disposable (dev/test/demo/scratch/tmp/sandbox/live_it).
//   - The target database name must NOT look like production/recovery/live/real/main/master.
//   - DESTROYING_LIVE_TEST_DB=1 must be set explicitly before any CREATE/DROP executes.
//
// The harness creates the schema, applies every additive migration, seeds a known set of
// bcrypt-hashed users covering all four roles, and the caller always drops the database in finally.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');
const BLOCKED = /(^|[_-])(prod|production|recovery|live|real|main|master)([_-]|$)/i;
const SAFE = /(demo|dev|test|scratch|tmp|sandbox|live_it)/i;
const BENIGN = /ER_TABLE_EXISTS_ERROR|ER_DUP_FIELDNAME|ER_DUP_KEYNAME|ER_CANT_DROP_FIELD_OR_KEY|ER_DUP_ENTRY|ER_SP_ALREADY_EXISTS|ER_MULTIPLE_PRI_KEY|ER_FK_DUP_NAME|ER_SP_DOES_NOT_EXIST/i;
const ALLOW_DESTRUCTIVE = process.env.DESTROYING_LIVE_TEST_DB === '1';

function assertDisposable(name) {
    if (!ALLOW_DESTRUCTIVE) throw new Error('Refusing live DB operations without DESTROYING_LIVE_TEST_DB=1');
    if (BLOCKED.test(name)) throw new Error(`Refusing to operate on database "${name}": name matches production/recovery/live/real`);
    if (!SAFE.test(name)) throw new Error(`Refusing to operate on database "${name}": name does not look disposable`);
}

function stripDelimiters(sql) {
    return sql.split('\n').filter(line => !/^delimiter\s/i.test(line.trim())).join('\n').replace(/\$\$/g, ';');
}

async function runMigrations(connection) {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort();
    const applied = [];
    for (const file of files) {
        const sql = stripDelimiters(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        try {
            await connection.query(sql);
            applied.push(`${file}: ok`);
        } catch (error) {
            if (BENIGN.test(error.message)) { applied.push(`${file}: skipped (${error.code})`); continue; }
            throw new Error(`${file}: ${error.message}`);
        }
    }
    return applied;
}

const USERS = [
    { id: 1, college_id: 'LIVE-ADMIN', email: 'live.super_admin@test.local', role: 'super_admin', department_id: 1, name: 'Live Admin' },
    { id: 2, college_id: 'LIVE-HOD', email: 'live.hod@test.local', role: 'hod', department_id: 1, name: 'Live HOD' },
    { id: 3, college_id: 'LIVE-FAC', email: 'live.organizer@test.local', role: 'organizer', department_id: 1, name: 'Live Faculty' },
    { id: 4, college_id: 'LIVE-S1', email: 'live.student@test.local', role: 'student', department_id: 1, name: 'Live Student One' },
    { id: 5, college_id: 'LIVE-S2', email: 'live.classmate@test.local', role: 'student', department_id: 1, name: 'Live Student Two' },
    { id: 6, college_id: 'LIVE-S3', email: 'live.outsider@test.local', role: 'student', department_id: 2, name: 'Live Student Three' }
];

const PASSWORD = process.env.LIVE_TEST_PASSWORD || 'LiveTest#2026';

const BASE_SCHEMA = `CREATE TABLE departments(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(120) NULL,hod_id INT NULL,deleted TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE users(id INT AUTO_INCREMENT PRIMARY KEY,college_id VARCHAR(50) NULL,email VARCHAR(160) NULL,name VARCHAR(120) NULL,password VARCHAR(255) NULL,role ENUM('student','organizer','hod','super_admin') NULL,department_id INT NULL,club_name VARCHAR(120) NULL,is_active TINYINT DEFAULT 1,deleted TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE audit_logs(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,action TEXT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,entity VARCHAR(80) NULL,entity_id INT NULL);
CREATE TABLE notifications(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,title VARCHAR(200) NULL,message TEXT NULL,is_read TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO departments(id,name,hod_id,deleted) VALUES (1,'Computer Science',2,0),(2,'Information Technology',NULL,0);
 CREATE TABLE events(id INT AUTO_INCREMENT PRIMARY KEY,organizer_id INT NULL,title VARCHAR(200) NOT NULL,from_date DATE NOT NULL,to_date DATE NOT NULL,is_full_day TINYINT(1) DEFAULT 0,status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',proof_file VARCHAR(255) NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,department_id INT NOT NULL,target_hod_id INT NULL,start_time TIME NULL,end_time TIME NULL,attendance_active TINYINT(1) DEFAULT 0,is_deleted TINYINT DEFAULT 0,attendance_status ENUM('pending','submitted','approved','resubmitted') DEFAULT 'pending');
 CREATE TABLE event_participants(id INT AUTO_INCREMENT PRIMARY KEY,event_id INT NOT NULL,student_id INT NOT NULL,scan_time TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uniq_event_student(event_id,student_id));
 CREATE TABLE od_applications(id INT AUTO_INCREMENT PRIMARY KEY,student_id INT NOT NULL,event_id INT NOT NULL,hod_id INT NULL,applied_date DATE NOT NULL,status ENUM('Auto Approved','Pending','HOD Approved','Rejected') DEFAULT 'Auto Approved',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,KEY idx_od_student(student_id),KEY idx_od_event(event_id));`;

const ACADEMIC_FIXTURE = `INSERT INTO academic_sessions(id,code,name,start_date,end_date) VALUES (1,'L2627','Live Session','2026-06-01','2027-04-30');
INSERT INTO semesters(id,session_id,number,name) VALUES (1,1,5,'Semester 5');
INSERT INTO courses(id,department_id,code,name) VALUES (1,1,'CSE','Computer Science'),(2,2,'IT','Information Technology');
INSERT INTO batches(id,course_id,session_id,name) VALUES (1,1,1,'CSE-2028'),(2,2,1,'IT-2028');
INSERT INTO sections(id,batch_id,name) VALUES (1,1,'A'),(2,2,'B');
INSERT INTO subjects(id,course_id,semester_id,code,name) VALUES (1,1,1,'CS501','Database Systems');
INSERT INTO classrooms(id,department_id,code,name) VALUES (1,1,'LH-1','Lecture Hall 1');
INSERT INTO student_profiles(user_id,batch_id,section_id,enrollment_no) VALUES (4,1,1,'LIVE-S1'),(5,1,1,'LIVE-S2'),(6,2,2,'LIVE-S3');
INSERT INTO faculty_profiles(user_id,employee_code,designation) VALUES (3,'EMP-3','Assistant Professor');
INSERT INTO timetable_entries(id,session_id,semester_id,subject_id,batch_id,section_id,faculty_id,classroom_id,weekday,start_time,end_time,created_by) VALUES (1,1,1,1,1,1,3,1,1,'09:00:00','10:00:00',3);
INSERT INTO class_attendance_sessions(id,timetable_id,attendance_date,created_by) VALUES (1,1,'2026-03-02',3),(2,1,'2026-03-09',3);
INSERT INTO class_attendance_records(attendance_session_id,student_id,status,marked_by) VALUES (1,4,'Present',3),(1,5,'Present',3),(2,4,'Absent',3),(2,5,'Late',3);
INSERT INTO erp_profile_details(user_id,allow_profile_discovery,allow_direct_messages) VALUES (3,1,1),(4,1,1),(5,1,1),(6,1,1);
INSERT INTO notifications(user_id,title,message) VALUES (4,'Fee reminder','Semester fee is due');`;

async function createDatabase(name) {
    assertDisposable(name);
    const connection = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', multipleStatements: true });
    try {
        await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
        await connection.query(`CREATE DATABASE \`${name}\``);
        await connection.changeUser({ database: name });
        await connection.query(BASE_SCHEMA);
        const migrations = await runMigrations(connection);
        const hash = await bcrypt.hash(PASSWORD, 10);
        for (const user of USERS) {
            await connection.query('INSERT INTO users(id,college_id,email,name,password,role,department_id) VALUES(?,?,?,?,?,?,?)', [user.id, user.college_id, user.email, user.name, hash, user.role, user.department_id]);
        }
        await connection.query(ACADEMIC_FIXTURE);
        return migrations;
    } finally {
        await connection.end();
    }
}

async function dropDatabase(name) {
    assertDisposable(name);
    const connection = await mysql.createConnection({ host: 'localhost', user: 'root', password: '' });
    try { await connection.query(`DROP DATABASE IF EXISTS \`${name}\``); } finally { await connection.end(); }
}

module.exports = { createDatabase, dropDatabase, USERS, PASSWORD };

