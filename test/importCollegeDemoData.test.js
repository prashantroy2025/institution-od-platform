const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const importer = require('../scripts/importCollegeDemoData');

const ROOT = path.resolve(__dirname, '..');
const emptyData = () => Object.fromEntries(Object.keys(importer.HEADERS).map(kind => [kind, []]));
const person = (changes = {}) => ({ demo_person_id: 'STU1', full_name: 'Demo Student', email: 'student@demo.invalid', role: 'student', college_id: 'COL1', roll_number: 'ENR1', department_code: 'CSE', department_name: 'Computer Science and Engineering', programme: 'B.Tech CSE', batch: '2025-2029', semester: '1', section: 'A', date_of_birth: '2005-01-01', phone: '', guardian_name: '', guardian_phone: '', avatar_path: '', is_demo: 'true', ...changes });
const subject = (changes = {}) => ({ demo_subject_id: 'SUB1', subject_code: 'CS101', subject_name: 'Foundations', department_code: 'CSE', semester: '1', credits: '3', is_demo: 'true', ...changes });
const attendance = (changes = {}) => ({ demo_attendance_id: 'ATT1', demo_person_id: 'STU1', roll_number: 'ENR1', demo_subject_id: 'SUB1', subject_code: 'CS101', attendance_date: '2026-08-03', status: 'Present', class_start: '09:00', room_code: 'C-101', is_demo: 'true', ...changes });
const mark = (changes = {}) => ({ demo_mark_id: 'MRK1', demo_person_id: 'STU1', roll_number: 'ENR1', demo_subject_id: 'SUB1', subject_code: 'CS101', subject_name: 'Foundations', academic_session: '2025-2026', semester: '1', internal_marks: '20', internal_max: '30', final_marks: '50', final_max: '70', total_marks: '70', total_max: '100', grade: 'A', result_status: 'PASS', is_demo: 'true', ...changes });

test('actual CSV headers match the six import contracts', () => {
    const files = { students: 'students_1000.csv', faculty: 'faculty_42.csv', hod: 'hod_6.csv', subjects: 'subjects_36.csv', attendance: 'attendance_sample_12000.csv', marks: 'marks_results_6000.csv' };
    for (const [kind, file] of Object.entries(files)) {
        const headers = fs.readFileSync(path.join(ROOT, 'demo_data', file), 'utf8').split(/\r?\n/, 1)[0].split(',');
        assert.doesNotThrow(() => importer.validateHeaders(headers, importer.HEADERS[kind]));
    }
});

test('rejects missing and unexpected CSV columns', () => {
    assert.throws(() => importer.validateHeaders(['demo_person_id'], importer.HEADERS.students), /missing required columns/);
    assert.throws(() => importer.validateHeaders([...importer.HEADERS.students, 'unexpected'], importer.HEADERS.students), /unexpected columns/);
});

test('rejects invalid roles and department mappings', () => {
    const data = emptyData();
    data.students = [person({ role: 'admin' }), person({ demo_person_id: 'STU2', department_code: 'EE', department_name: 'Computer Science and Engineering' })];
    const issues = importer.validateBundle(data).issues.map(issue => issue.reason).join(' ');
    assert.match(issues, /role must be student/);
    assert.match(issues, /exact supported mapping/);
});

test('detects duplicate stable IDs across person files', () => {
    const data = emptyData();
    data.students = [person()];
    data.faculty = [{ ...person({ role: 'organizer' }), employee_code: 'EMP1' }];
    assert.equal(importer.validateBundle(data).duplicateIds.length, 1);
});

test('rejects invalid mark bounds, totals, and result statuses', () => {
    for (const overrides of [{ total_marks: '71' }, { internal_marks: '31' }, { final_marks: '-1' }, { total_max: '99' }, { result_status: 'UNKNOWN' }]) {
        const data = emptyData();
        data.marks = [mark(overrides)];
        assert.ok(importer.validateBundle(data).issues.some(issue => issue.reason.includes('mark arithmetic')));
    }
});

test('rejects impossible dates and flags missing source relationships', () => {
    assert.equal(importer.validDate('2026-02-30'), false);
    assert.equal(importer.validDate('2024-02-29'), true);
    const data = emptyData();
    data.students = [person()];
    data.subjects = [subject({ semester: '7' })];
    data.attendance = [attendance()];
    data.marks = [mark({ semester: '2' })];
    assert.equal(importer.validateBundle(data).references.length, 2);
    data.subjects = [];
    assert.match(importer.validateBundle(data).references[0].reason, /subject relationship is unresolved/);
});

test('refuses unsafe environments and target databases', () => {
    assert.throws(() => importer.checkSafety({ NODE_ENV: 'production', DB_NAME: 'institution_od_demo' }), /NODE_ENV/);
    assert.throws(() => importer.checkSafety({ NODE_ENV: 'test', DB_NAME: 'institution_od_recovery' }), /only to the explicit/);
    assert.throws(() => importer.checkSafety({ NODE_ENV: 'test', DB_NAME: 'institution_od_demo', MYSQLDATABASE: 'institution_od_recovery' }), /must agree/);
    assert.doesNotThrow(() => importer.checkSafety({ NODE_ENV: 'development', DB_NAME: 'institution_od_demo' }));
});

test('dry-run reports all six files and never connects', async () => {
    let connections = 0;
    const result = await importer.runImporter(['--dry-run'], { env: { NODE_ENV: 'test' }, mysql: { createConnection: async () => { connections++; throw new Error('must stay offline'); } } });
    assert.equal(connections, 0);
    assert.deepEqual(Object.fromEntries(Object.entries(result.files).map(([key, summary]) => [key, summary.rows])), { students: 1000, faculty: 42, hod: 6, subjects: 36, attendance: 12000, marks: 6000 });
    assert.equal(result.mode, 'dry-run');
});
