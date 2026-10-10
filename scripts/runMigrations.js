// Applies every additive migration in db/migrations to the database named by the CLI argument.
// Intended for disposable development/test databases only.
//
// mysql2 cannot execute the mysql CLI's DELIMITER directive, so DELIMITER lines are removed and
// the file is executed with multipleStatements enabled. Routine CREATE PROCEDURE / CALL pairs are
// executed individually as a second pass so a missing base procedure cannot block later migrations.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');
const BENIGN = /ER_TABLE_EXISTS_ERROR|ER_DUP_FIELDNAME|ER_DUP_KEYNAME|ER_CANT_DROP_FIELD_OR_KEY|ER_DUP_ENTRY|ER_SP_ALREADY_EXISTS|ER_MULTIPLE_PRI_KEY|ER_FK_DUP_NAME|ER_SP_DOES_NOT_EXIST/i;
const FORBIDDEN_DB = /(^|[_-])(prod|production|recovery|live|real)([_-]|$)/i;

function stripDelimiters(sql) {
    return sql
        .split('\n')
        .filter(line => !/^delimiter\s/i.test(line.trim()))
        .join('\n')
        .replace(/\$\$/g, ';');
}

function splitStatements(sql) {
    const statements = [];
    let buffer = '';
    for (const rawLine of sql.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('--') || line === '') continue;
        buffer += `${rawLine}\n`;
        if (line.endsWith(';')) { statements.push(buffer.trim()); buffer = ''; }
    }
    if (buffer.trim()) statements.push(buffer.trim());
    return statements.filter(text => text && text !== ';');
}

async function runMigrations(database) {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort();
    const connection = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database });
    const results = [];
    const execute = async (statement, label) => {
        try {
            await connection.query(statement);
            return 'ok';
        } catch (error) {
            if (BENIGN.test(error.message)) return `skipped (${error.code})`;
            return `FAILED: ${error.message}`;
        }
    };
    try {
        for (const file of files) {
            const sql = stripDelimiters(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
            let outcome = await execute(sql, file);
            if (outcome.startsWith('FAILED')) {
                // Procedure bodies can be rejected as a whole batch; retry statement by statement.
                let allOk = true;
                for (const statement of splitStatements(sql)) {
                    const single = await execute(statement, file);
                    if (single.startsWith('FAILED')) { allOk = false; outcome = `${file}: ${single}`; break; }
                }
                if (allOk) outcome = 'ok (statement-wise)';
            }
            results.push(`${file}: ${outcome}`);
            process.stdout.write(`${results[results.length - 1]}\n`);
        }
    } finally {
        await connection.end();
    }
    const failures = results.filter(line => line.includes('FAILED'));
    if (failures.length) throw new Error(`migrations failed:\n${failures.join('\n')}`);
    return results;
}

if (require.main === module) {
    const database = process.argv[2];
    if (!database) { console.error('usage: node scripts/runMigrations.js <database>'); process.exit(1); }
    if (FORBIDDEN_DB.test(database)) { console.error(`refusing to migrate database named "${database}"`); process.exit(1); }
    runMigrations(database)
        .then(() => process.stdout.write('migrations complete\n'))
        .catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { runMigrations, splitStatements };


