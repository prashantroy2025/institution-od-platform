/* Guarded demo password reset for local development.
 *
 * Safety (mirrors the existing import/seed guards):
 *   - Requires NODE_ENV=development or NODE_ENV=test.
 *   - Only ever targets the explicit `institution_od_demo` database.
 *   - Updates ONLY the `password` column of the target user. It never touches
 *     id, role, department_id, email, or any academic relationship.
 *   - Uses the project's own hashing (bcryptjs, cost 10) exactly like
 *     controllers/authController.js createUser, so the real login flow accepts it.
 *
 * Usage:
 *   set -a && . ./.env && set +a
 *   NODE_ENV=development DB_NAME=institution_od_demo \
 *     node scripts/resetDemoStudentPassword.js --user-id=22 --password='<choose>'
 */
'use strict';

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
// NOTE: requiring ../config/db opens a MySQL pool that keeps the event loop
// alive. We only need getDbConfig here, and we close the pool before exiting.
const db = require('../config/db');
const dbConfig = db.getDbConfig();

function parseArgs(argv) {
    const options = {};
    for (const arg of argv) {
        if (arg === '--apply') options.apply = true;
        else if (arg === '--dry-run') options.apply = false;
        else if (arg.startsWith('--user-id=')) options.userId = Number(arg.slice('--user-id='.length));
        else if (arg.startsWith('--password=')) options.password = arg.slice('--password='.length);
        else if (arg.startsWith('--')) throw new Error(`Unsupported option: ${arg.split('=')[0]}`);
    }
    return options;
}

function assertSafeTarget(env = process.env) {
    if (!['development', 'test'].includes(String(env.NODE_ENV || '').toLowerCase())) {
        throw new Error('Demo password reset requires NODE_ENV=development or NODE_ENV=test');
    }
    const database = env.DB_NAME || env.MYSQLDATABASE;
    if (database !== 'institution_od_demo') {
        throw new Error('Demo password reset may only target the explicit institution_od_demo database (set DB_NAME)');
    }
    if (env.DB_NAME && env.MYSQLDATABASE && env.DB_NAME !== env.MYSQLDATABASE) {
        throw new Error('DB_NAME and MYSQLDATABASE must agree');
    }
    if (typeof options.password !== 'string' || options.password.length < 8) {
        throw new Error('Provide --password= with at least 8 characters');
    }
    if (!Number.isInteger(options.userId) || options.userId < 1) {
        throw new Error('Provide --user-id=<positive integer>');
    }
}

const options = parseArgs(process.argv.slice(2));

async function main() {
    assertSafeTarget();
    const connection = await mysql.createConnection({ ...dbConfig, database: 'institution_od_demo', multipleStatements: false });
    try {
        const [dbRows] = await connection.execute('SELECT DATABASE() AS database_name');
        if (!dbRows[0] || dbRows[0].database_name !== 'institution_od_demo') {
            throw new Error('Connected database verification failed; refusing writes');
        }
        const [rows] = await connection.execute(
            'SELECT id, name, email, role, is_active, deleted FROM users WHERE id = ?',
            [options.userId]
        );
        if (!rows[0]) throw new Error(`User ${options.userId} not found`);
        const user = rows[0];
        if (user.deleted || !user.is_active) throw new Error(`User ${options.userId} is not active; refusing`);
        if (user.role !== 'student') throw new Error(`User ${options.userId} is role=${user.role}; this helper is for demo students only`);

        const hashed = await bcrypt.hash(options.password, 10);

        if (!options.apply) {
            console.log(JSON.stringify({ mode: 'dry-run', would_reset: { id: user.id, email: user.email, role: user.role, changes: 'password column only' } }, null, 2));
            return;
        }
        const [result] = await connection.execute('UPDATE users SET password = ? WHERE id = ? AND role = ?', [hashed, options.userId, 'student']);
        if (result.affectedRows !== 1) throw new Error(`Password reset affected ${result.affectedRows} rows; expected 1`);
        console.log(JSON.stringify({ mode: 'apply', reset: { id: user.id, email: user.email, role: user.role }, note: 'password column only; id/role/email/academic relationships unchanged', hash_prefix: hashed.slice(0, 7), cost: 10 }, null, 2));
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    main()
        .then(() => { try { db.end && db.end(); } catch { /* pool may not expose end */ } process.exit(process.exitCode || 0); })
        .catch((error) => { console.error(`Demo password reset refused/failed: ${error.message}`); process.exit(1); });
}

module.exports = { parseArgs, assertSafeTarget };
