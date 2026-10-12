const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const {
    runMigrations,
    splitStatements,
    resolveConnectionConfig,
    isForbiddenDatabase,
    isOdWorkflowMigrationApplied,
    FORBIDDEN_DB,
} = require('../scripts/runMigrations');

const SCRIPT_SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'runMigrations.js'), 'utf8');

function makeTempMigrations(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
    return dir;
}

function makeFakeConnection({ failOn, tables, columns, foreignKeys, onQuery } = {}) {
    const executed = [];
    const currentTables = tables || [];
    const currentColumns = columns || [];
    const currentForeignKeys = foreignKeys || [];
    return {
        executed,
        async query(statement) {
            if (/^SELECT\b/i.test(statement.trim()) && statement.includes('information_schema.tables')) {
                return [currentTables];
            }
            if (/^SELECT\b/i.test(statement.trim()) && statement.includes('information_schema.columns')) {
                return [currentColumns];
            }
            if (/^SELECT\b/i.test(statement.trim()) && statement.includes('information_schema.key_column_usage')) {
                return [currentForeignKeys];
            }
            executed.push(statement);
            if (onQuery) await onQuery(statement, { columns: currentColumns, foreignKeys: currentForeignKeys });
            const key = Object.keys(failOn || {}).find(match => statement.includes(match));
            if (key) {
                const error = new Error(failOn[key].message);
                error.code = failOn[key].code;
                throw error;
            }
            return [{ affectedRows: 0 }];
        },
        async end() {},
    };
}

const baseTables = ['events', 'od_applications', 'users'].map(table_name => ({ table_name }));
const baseColumns = [
    { table_name: 'events', column_name: 'department_id' },
    { table_name: 'od_applications', column_name: 'event_id' },
    { table_name: 'od_applications', column_name: 'status' },
    { table_name: 'users', column_name: 'id' },
];
const appliedColumns = [
    { table_name: 'events', column_name: 'target_hod_id', column_type: 'int', is_nullable: 'YES' },
    { table_name: 'od_applications', column_name: 'hod_id', column_type: 'int', is_nullable: 'YES' },
    { table_name: 'od_applications', column_name: 'status', column_type: "enum('Auto Approved','Pending','HOD Approved','Rejected')", column_default: 'Auto Approved' },
];
const appliedForeignKeys = [
    { table_name: 'events', constraint_name: 'fk_events_target_hod', column_name: 'target_hod_id', referenced_table_name: 'users', referenced_column_name: 'id', delete_rule: 'SET NULL' },
    { table_name: 'od_applications', constraint_name: 'fk_od_hod', column_name: 'hod_id', referenced_table_name: 'users', referenced_column_name: 'id', delete_rule: 'SET NULL' },
];

test('refuses protected database names using case-insensitive substring matching', () => {
    for (const name of ['prod', 'PROD', 'production', 'recovery', 'live', 'real', 'myproddb', 'app_live_2', 'institution_od_recovery']) {
        assert.equal(isForbiddenDatabase(name), true, `expected ${name} to be refused`);
    }
    assert.match(FORBIDDEN_DB.source, /prod|production|recovery|live|real/);
    assert.match(FORBIDDEN_DB.flags, /i/);
    for (const name of ['institution_od_dev', 'staging_clone', 'test_db', 'sandbox_1']) assert.equal(isForbiddenDatabase(name), false);
});

test('requires explicit database name before opening a connection', async () => {
    await assert.rejects(() => runMigrations('', {}), /explicit database name is required/);
});

test('resolves connection settings from project environment variables', () => {
    const config = resolveConnectionConfig({ DB_HOST: 'db.internal', DB_USER: 'migrator', DB_PASSWORD: 'secret', DB_PORT: '3307' });
    assert.deepEqual(config, { host: 'db.internal', user: 'migrator', password: 'secret', port: 3307 });
    const fallback = resolveConnectionConfig({ MYSQLHOST: 'mysql-host', MYSQLUSER: 'alt-user', MYSQLPASSWORD: 'alt-pass', MYSQLPORT: '3399' });
    assert.equal(fallback.host, 'mysql-host');
    assert.equal(fallback.user, 'alt-user');
    assert.equal(fallback.password, 'alt-pass');
    assert.equal(fallback.port, 3399);
    assert.doesNotMatch(SCRIPT_SOURCE, /createConnection\(\{\s*host:\s*['"]localhost['"]/);
});

test('parses custom delimiters without splitting procedure bodies or replacing delimiter text', () => {
    const statements = splitStatements(`-- header\nDELIMITER $$\nCREATE PROCEDURE p()\nBEGIN\n SELECT '$$' AS marker;\n SET @value = 1;\nEND$$\nCALL p()$$\nDROP PROCEDURE p$$\nDELIMITER ;\nCREATE TABLE t (v VARCHAR(8) DEFAULT ';');`);
    assert.equal(statements.length, 4);
    assert.match(statements[0], /BEGIN[\s\S]*SELECT '\$\$'[\s\S]*SET @value = 1;[\s\S]*END$/);
    assert.equal(statements[1], 'CALL p()');
    assert.equal(statements[2], 'DROP PROCEDURE p');
    assert.match(statements[3], /CREATE TABLE t/);
});

test('executes migration 001 procedure statements in order and preserves their bodies', async () => {
    const migration = fs.readFileSync(path.resolve(__dirname, '..', 'db/migrations/001_stabilize_od_workflows.sql'), 'utf8');
    const dir = makeTempMigrations({ '001_stabilize_od_workflows.sql': migration });
    const connection = makeFakeConnection({
        tables: baseTables,
        columns: [...baseColumns],
        foreignKeys: [],
        onQuery(statement, schema) {
            if (statement.includes('CALL ensure_od_workflow_schema()')) {
                schema.columns.push(...appliedColumns);
                schema.foreignKeys.push(...appliedForeignKeys);
            }
        },
    });
    await runMigrations('sandbox_1', { connection, migrationsDir: dir });
    const procedureIndex = connection.executed.findIndex(sql => sql.includes('CREATE PROCEDURE ensure_od_workflow_schema'));
    const callIndex = connection.executed.findIndex(sql => sql.includes('CALL ensure_od_workflow_schema()'));
    const dropIndex = connection.executed.findIndex(sql => sql.includes('DROP PROCEDURE ensure_od_workflow_schema'));
    assert.ok(procedureIndex >= 0 && procedureIndex < callIndex && callIndex < dropIndex);
    assert.match(connection.executed[procedureIndex], /ALTER TABLE od_applications[\s\S]*MODIFY COLUMN status ENUM/);
});

test('stops on syntax and foreign-key errors without running later migrations', async t => {
    for (const [label, error] of [
        ['syntax error', { message: 'You have an error in your SQL syntax', code: 'ER_PARSE_ERROR' }],
        ['foreign key error', { message: 'Cannot add foreign key constraint', code: 'ER_CANT_CREATE_TABLE' }],
    ]) {
        await t.test(label, async () => {
            const dir = makeTempMigrations({
                '001_first.sql': 'CREATE TABLE a (id INT);',
                '002_boom.sql': 'THIS IS NOT VALID SQL;',
                '003_third.sql': 'CREATE TABLE c (id INT);',
            });
            const connection = makeFakeConnection({ failOn: { 'THIS IS NOT VALID SQL': error } });
            await assert.rejects(() => runMigrations('sandbox_1', { connection, migrationsDir: dir }), /migration failed, stopping/);
            assert.ok(connection.executed.some(sql => sql.includes('THIS IS NOT VALID SQL')));
            assert.ok(!connection.executed.some(sql => sql.includes('CREATE TABLE c')));
        });
    }
});

test('reports missing prerequisites before attempting the migration SQL', async () => {
    const dir = makeTempMigrations({ '001_stabilize_od_workflows.sql': 'CREATE TABLE unexpected (id INT);' });
    const connection = makeFakeConnection({ tables: [{ table_name: 'events' }] });
    await assert.rejects(() => runMigrations('sandbox_1', { connection, migrationsDir: dir }), /missing prerequisites:.*od_applications.*users/);
    assert.equal(connection.executed.length, 0);
});

test('recognizes migration 001 only when columns, foreign keys, and enum match', async () => {
    const connection = makeFakeConnection({ columns: appliedColumns, foreignKeys: appliedForeignKeys });
    assert.equal(await isOdWorkflowMigrationApplied(connection), true);
    const wrongEnum = makeFakeConnection({
        columns: appliedColumns.map(row => row.column_name === 'status' ? { ...row, column_type: "enum('Pending','Rejected')" } : row),
        foreignKeys: appliedForeignKeys,
    });
    assert.equal(await isOdWorkflowMigrationApplied(wrongEnum), false);
    const missingForeignKey = makeFakeConnection({ columns: appliedColumns, foreignKeys: appliedForeignKeys.slice(1) });
    assert.equal(await isOdWorkflowMigrationApplied(missingForeignKey), false);
});

test('reports migration 001 as already applied and skips its SQL when exact schema exists', async () => {
    const dir = makeTempMigrations({ '001_stabilize_od_workflows.sql': 'THIS SQL MUST NOT RUN;' });
    const connection = makeFakeConnection({ tables: baseTables, columns: [...baseColumns, ...appliedColumns], foreignKeys: appliedForeignKeys });
    const results = await runMigrations('sandbox_1', { connection, migrationsDir: dir });
    assert.deepEqual(results, ['001_stabilize_od_workflows.sql: already applied']);
    assert.equal(connection.executed.length, 0);
});

test('preserves deterministic migration ordering by filename', async () => {
    const dir = makeTempMigrations({
        '003_third.sql': 'CREATE TABLE c (id INT);',
        '001_first.sql': 'CREATE TABLE a (id INT);',
        '002_second.sql': 'CREATE TABLE b (id INT);',
    });
    const connection = makeFakeConnection();
    await runMigrations('sandbox_1', { connection, migrationsDir: dir });
    const positions = ['CREATE TABLE a', 'CREATE TABLE b', 'CREATE TABLE c'].map(sql => connection.executed.findIndex(query => query.includes(sql)));
    assert.ok(positions[0] >= 0 && positions[0] < positions[1] && positions[1] < positions[2]);
});

test('runner contains no destructive database or table operations', () => {
    assert.doesNotMatch(SCRIPT_SOURCE, /DROP\s+DATABASE/i);
    assert.doesNotMatch(SCRIPT_SOURCE, /CREATE\s+DATABASE/i);
    assert.doesNotMatch(SCRIPT_SOURCE, /DROP\s+TABLE/i);
    assert.doesNotMatch(SCRIPT_SOURCE, /TRUNCATE/i);
    assert.doesNotMatch(SCRIPT_SOURCE, /DELETE\s+FROM/i);
});
