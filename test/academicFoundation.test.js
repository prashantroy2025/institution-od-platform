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