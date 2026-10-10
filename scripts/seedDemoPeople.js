#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const root = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const fileArg = process.argv.find((value) => value.startsWith('--file='));
const source = fileArg ? path.resolve(fileArg.slice(7)) : path.join(root, 'data/demo/college_erp_demo_people_100.csv');
const config = require('../config/db').getDbConfig();

function refuseUnsafeEnvironment() {
    const env = String(process.env.NODE_ENV || '').toLowerCase();
    const database = String(config.database || '').toLowerCase();
    if (!['development', 'test'].includes(env)) throw new Error('Demo import requires NODE_ENV=development or NODE_ENV=test');
    if (env === 'production' || /prod|production|recovery|real|live/.test(database)) throw new Error('Demo import refuses production, recovery, live or real database names');
    if (!database.includes('demo') && !database.includes('test') && !database.includes('dev')) throw new Error('Demo import requires an explicitly named demo/dev/test database');
}
function requiredColumns(row) { for (const field of ['demo_id','full_name','role','email','college_id','department','programme','batch','semester','section','designation','employee_code','status','is_demo_data']) if (!(field in row)) throw new Error(`CSV is missing required column: ${field}`); }
function readRows() { return new Promise((resolve, reject) => { const rows=[]; fs.createReadStream(source).pipe(csv()).on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject); }); }
async function resolveAcademic(conn, row) {
    const [departments] = await conn.query('SELECT id FROM departments WHERE name=? AND (deleted=0 OR deleted IS NULL) LIMIT 1', [row.department]);
    if (!departments[0]) return null;
    const [courses] = await conn.query('SELECT id FROM courses WHERE department_id=? AND name=? LIMIT 1', [departments[0].id, row.programme]);
    if (!courses[0]) return null;
    const [batches] = await conn.query('SELECT id FROM batches WHERE course_id=? AND (name=? OR CONCAT(start_year,"-",end_year)=?) LIMIT 1', [courses[0].id, row.batch, row.batch]);
    if (!batches[0]) return null;
    const [semesters] = await conn.query('SELECT id FROM semesters WHERE number=? ORDER BY id LIMIT 1', [Number(row.semester)]);
    if (!semesters[0]) return null;
    const [sections] = await conn.query('SELECT id FROM sections WHERE batch_id=? AND name=? LIMIT 1', [batches[0].id, row.section]);
    if (!sections[0]) return null;
    return { departmentId: departments[0].id, courseId: courses[0].id, batchId: batches[0].id, semesterId: semesters[0].id, sectionId: sections[0].id };
}
async function cleanup(conn) {
    await conn.beginTransaction();
    try {
        const [rows] = await conn.query('SELECT user_id FROM erp_demo_registry WHERE entity_type="user" AND user_id IS NOT NULL');
        const ids = rows.map(row => row.user_id).filter(Boolean);
        if (ids.length) {
            const marks = ids.map(() => '?').join(',');
            await conn.query(`DELETE FROM erp_profile_details WHERE user_id IN (${marks})`, ids);
            await conn.query(`DELETE FROM erp_profile_documents WHERE user_id IN (${marks})`, ids);
            await conn.query(`DELETE FROM student_profiles WHERE user_id IN (${marks})`, ids);
            await conn.query(`DELETE FROM faculty_profiles WHERE user_id IN (${marks})`, ids);
            await conn.query(`DELETE FROM erp_demo_registry WHERE user_id IN (${marks})`, ids);
            await conn.query(`DELETE FROM users WHERE id IN (${marks})`, ids);
        }
        await conn.commit(); console.log(`Removed ${ids.length} demo users.`);
    } catch (error) { await conn.rollback(); throw error; }
}
async function main() {
    refuseUnsafeEnvironment();
    if (!fs.existsSync(source)) throw new Error(`CSV not found: ${source}`);
    const rows = await readRows(); if (!rows.length) throw new Error('CSV contains no rows'); requiredColumns(rows[0]);
    const conn = await mysql.createConnection({ ...config, multipleStatements: false });
    try {
        if (args.has('--cleanup')) return await cleanup(conn);
        await conn.beginTransaction(); let imported=0, skipped=0;
        try {
            for (const row of rows) {
                if (String(row.is_demo_data).toLowerCase() !== 'true') { skipped++; continue; }
                const academic = await resolveAcademic(conn, row);
                if (!academic) { skipped++; console.warn(`Skipped ${row.demo_id}: academic relationships not found`); continue; }
                const [existing] = await conn.query('SELECT id FROM users WHERE email=? OR college_id=? LIMIT 1', [row.email, row.college_id]);
                if (existing[0]) { skipped++; continue; }
                const role = row.role === 'organizer' ? 'organizer' : row.role;
                if (!['student','organizer','hod'].includes(role)) { skipped++; continue; }
                const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
                const [created] = await conn.query('INSERT INTO users(college_id,name,email,password,role,department_id,is_active,deleted) VALUES(?,?,?,?,?,?,1,0)', [row.college_id,row.full_name,row.email,passwordHash,role,academic.departmentId]);
                if (role === 'student') await conn.query('INSERT INTO student_profiles(user_id,enrollment_no,batch_id,section_id) VALUES(?,?,?,?)', [created.insertId,row.college_id,academic.batchId,academic.sectionId]);
                else await conn.query('INSERT INTO faculty_profiles(user_id,employee_code,designation) VALUES(?,?,?)', [created.insertId,row.employee_code || row.college_id,row.designation || null]);
                await conn.query('INSERT INTO erp_demo_registry(demo_id,user_id,entity_type) VALUES(?,?,"user")', [row.demo_id,created.insertId]); imported++;
            }
            await conn.commit(); console.log(JSON.stringify({ source, imported, skipped }, null, 2));
        } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
}
main().catch(error => { console.error(`Demo import refused/failed: ${error.message}`); process.exitCode=1; });