const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migrationPath = 'db/migrations/002_academic_foundation.sql';

test('academic migration is additive and rerunnable', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS academic_sessions/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS sections/);
    assert.match(migration, /information_schema\.table_constraints/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('timetable migration is additive and rerunnable', () => {
    const migration = fs.readFileSync('db/migrations/003_timetable_scheduling.sql', 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS classrooms/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS timetable_entries/);
    assert.match(migration, /chk_timetable_times/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('class attendance migration is additive and rerunnable', () => {
    const migration = fs.readFileSync('db/migrations/004_class_attendance.sql', 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS attendance_settings/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS class_attendance_sessions/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS class_attendance_records/);
    assert.match(migration, /uq_class_attendance_timetable_date/);
    assert.match(migration, /uq_class_attendance_student/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('faculty attendance migration is additive and rerunnable', () => {
    const migration = fs.readFileSync('db/migrations/005_faculty_attendance.sql', 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS faculty_attendance/);
    assert.match(migration, /uq_faculty_attendance_day/);
    assert.match(migration, /chk_faculty_attendance_times/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('learning migration is additive and rerunnable', () => {
    const migration = fs.readFileSync('db/migrations/006_learning_module.sql', 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS learning_assignments/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS learning_submissions/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS learning_materials/);
    assert.match(migration, /uq_learning_submission_version/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('examination migration is additive and rerunnable', () => {
    const migration = fs.readFileSync('db/migrations/007_examination_management.sql', 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS examinations/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS examination_registrations/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS examination_seats/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS examination_marks/);
    assert.match(migration, /grading_rules JSON/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('finance migration is additive and rerunnable', () => {
    const migration = fs.readFileSync('db/migrations/008_finance_core.sql', 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS finance_invoices/);
    assert.match(migration, /amount_paise BIGINT UNSIGNED/);
    assert.match(migration, /finance_payments/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('library migration is additive and rerunnable', () => {
    const migration = fs.readFileSync('db/migrations/009_library_core.sql', 'utf8');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_books/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_copies/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_loans/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_reservations/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('academic routes expose CRUD resources behind token middleware', () => {
    const routes = fs.readFileSync('routes/academicRoutes.js', 'utf8');
    assert.match(routes, /router\.get\(`\/:entity/);
    assert.match(routes, /verifyToken/);
    assert.match(routes, /allowRoles\('super_admin', 'hod'(, 'student', 'organizer')?\)/);
    assert.match(routes, /router\.patch/);
    assert.match(routes, /router\.delete/);
});

test('academic service uses parameterized pagination/search and ownership checks', () => {
    const service = fs.readFileSync('services/academicService.js', 'utf8');
    assert.match(service, /LIMIT \? OFFSET \?/);
    assert.match(service, /LIKE \?/);
    assert.match(service, /Department ownership violation/);
    assert.match(service, /auditService\.log/);
});

test('academic route is mounted without changing existing workflow routes', () => {
    const server = fs.readFileSync('server.js', 'utf8');
    assert.match(server, /app\.use\('\/api\/academics', academicRoutes\)/);
    assert.match(server, /app\.use\('\/api\/events', eventRoutes\)/);
    assert.match(server, /app\.use\('\/api\/qr', qrRoutes\)/);
});

test('student Academic endpoints are identity-scoped and staff decisions are role protected', () => {
    const routes = fs.readFileSync('routes/academicRoutes.js', 'utf8');
    for (const path of ['subjects','faculty','mentor','syllabus','registrations','calendar','requests']) assert.match(routes, new RegExp(`/student/${path}`));
    assert.match(routes, /allowRoles\('student'\), studentController\.register/);
    assert.match(routes, /allowRoles\('super_admin', 'hod'\), studentController\.reviewRegistration/);
    assert.match(routes, /allowRoles\('super_admin', 'hod'\), studentController\.reviewRequest/);
});

test('Academic service migration adds rerunnable data structures without destructive SQL', () => {
    const migration=fs.readFileSync('db/migrations/014_academic_services.sql','utf8');
    for(const table of ['syllabus_units','academic_calendar_events','academic_course_registrations','academic_requests']) assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(migration,/UNIQUE KEY uq_academic_course_registration/);
    assert.doesNotMatch(migration,/DROP TABLE|DROP DATABASE|TRUNCATE|DELETE FROM/i);
});

test('Academic landing exposes all twelve real service destinations', () => {
    const page=fs.readFileSync('public/academic.html','utf8');
    const script=fs.readFileSync('public/academic.js','utf8');
    assert.match(page,/academic-management|serviceGrid/);
    for(const key of ['subjects','assignments','materials','timetable','syllabus','faculty','calendar','results','classroom','mentor','registration','requests']) assert.match(script,new RegExp(`['\\\"]${key}['\\\"]`));
    assert.match(fs.readFileSync('public/home.js','utf8'),/href: 'academic\.html'/);
    assert.match(fs.readFileSync('public/dashboard.html','utf8'),/\['Academic','▣','academic\.html'/);
});

test('Academic demo seed is restricted to the development demo database', () => {
    const seed=fs.readFileSync('scripts/seedAcademicDemoData.js','utf8');
    assert.match(seed,/NODE_ENV.*development.*test/);
    assert.match(seed,/database !== 'institution_od_demo'/);
    assert.match(seed,/DEMO DATA/);
});
