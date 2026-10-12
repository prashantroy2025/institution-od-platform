const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');
const FORBIDDEN_DB = /prod|production|recovery|live|real/i;
const PREREQUISITES = {
    '001_stabilize_od_workflows.sql': {
        tables: ['events', 'od_applications', 'users'],
        columns: {
            events: ['department_id'],
            od_applications: ['event_id', 'status'],
            users: ['id'],
        },
    },
    '002_academic_foundation.sql': { tables: ['users', 'departments'], columns: { users: ['id'], departments: ['id'] } },
    '003_timetable_scheduling.sql': { tables: ['academic_sessions', 'semesters', 'subjects', 'batches', 'sections', 'users', 'departments'], columns: { academic_sessions: ['id'], semesters: ['id'], subjects: ['id'], batches: ['id'], sections: ['id'], users: ['id'], departments: ['id'] } },
    '004_class_attendance.sql': { tables: ['timetable_entries', 'users'], columns: { timetable_entries: ['id'], users: ['id'] } },
    '005_faculty_attendance.sql': { tables: ['users'], columns: { users: ['id'] } },
    '006_learning_module.sql': { tables: ['subjects', 'batches', 'sections', 'courses', 'users'], columns: { subjects: ['id'], batches: ['id'], sections: ['id'], courses: ['id'], users: ['id'] } },
    '007_examination_management.sql': { tables: ['academic_sessions', 'semesters', 'subjects', 'batches', 'sections', 'classrooms', 'users'], columns: { academic_sessions: ['id'], semesters: ['id'], subjects: ['id'], batches: ['id'], sections: ['id'], classrooms: ['id'], users: ['id'] } },
    '008_finance_core.sql': { tables: ['users', 'departments'], columns: { users: ['id'], departments: ['id'] } },
    '009_library_core.sql': { tables: ['users'], columns: { users: ['id'] } },
    '010_profile_feed_messages.sql': { tables: ['users', 'departments', 'batches', 'sections'], columns: { users: ['id'], departments: ['id'], batches: ['id'], sections: ['id'] } },
    '011_library_features.sql': { tables: ['users', 'library_loans', 'library_books', 'finance_invoices', 'finance_invoice_items'], columns: { users: ['id'], library_loans: ['id'], library_books: ['id'], finance_invoices: ['id'], finance_invoice_items: ['id'] } },
};

function resolveConnectionConfig(env = process.env) {
    return {
        host: env.DB_HOST || env.MYSQLHOST || 'localhost',
        user: env.DB_USER || env.MYSQLUSER || 'root',
        password: env.DB_PASSWORD ?? env.MYSQLPASSWORD ?? '',
        port: Number(env.DB_PORT || env.MYSQLPORT || 3306),
    };
}

function splitStatements(sql) {
    const statements = [];
    let buffer = '';
    let delimiter = ';';
    let quote = null;
    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < sql.length;) {
        if (index === 0 || sql[index - 1] === '\n') {
            const lineEnd = sql.indexOf('\n', index);
            const end = lineEnd === -1 ? sql.length : lineEnd;
            const line = sql.slice(index, end);
            const directive = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
            if (directive && !quote && !lineComment && !blockComment) {
                delimiter = directive[1];
                index = lineEnd === -1 ? end : end + 1;
                continue;
            }
        }

        const char = sql[index];
        const next = sql[index + 1];

        if (lineComment) {
            buffer += char;
            if (char === '\n') lineComment = false;
            index += 1;
            continue;
        }
        if (blockComment) {
            buffer += char;
            if (char === '*' && next === '/') {
                buffer += next;
                index += 2;
                blockComment = false;
            } else {
                index += 1;
            }
            continue;
        }
        if (quote) {
            buffer += char;
            if (char === '\\' && quote !== '`' && next) {
                buffer += next;
                index += 2;
                continue;
            }
            if (char === quote) {
                if (next === quote) {
                    buffer += next;
                    index += 2;
                    continue;
                }
                quote = null;
            }
            index += 1;
            continue;
        }

        if (char === '/' && next === '*') {
            buffer += '/*';
            blockComment = true;
            index += 2;
            continue;
        }
        if (char === '#' || (char === '-' && next === '-' && (!sql[index + 2] || /\s/.test(sql[index + 2])))) {
            buffer += char === '#' ? char : '--';
            lineComment = true;
            index += char === '#' ? 1 : 2;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char;
            buffer += char;
            index += 1;
            continue;
        }
        if (sql.startsWith(delimiter, index)) {
            const statement = buffer.trim();
            if (statement) statements.push(statement);
            buffer = '';
            index += delimiter.length;
            continue;
        }

        buffer += char;
        index += 1;
    }

    if (buffer.trim()) statements.push(buffer.trim());
    return statements;
}

function isForbiddenDatabase(name) {
    return FORBIDDEN_DB.test(name || '');
}

function requireSafeDatabase(database) {
    if (typeof database !== 'string' || !database.trim()) {
        throw new Error('an explicit database name is required');
    }
    if (isForbiddenDatabase(database)) {
        throw new Error(`refusing to migrate database named "${database}": matches a protected name (prod/production/recovery/live/real)`);
    }
}

async function checkPrerequisites(connection, file) {
    const prerequisites = PREREQUISITES[file];
    if (!prerequisites) return;

    const expectedTables = prerequisites.tables || [];
    const [tableRows] = expectedTables.length
        ? await connection.query(
            'SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?)',
            [expectedTables]
        )
        : [[]];
    const existingTables = new Set(tableRows.map(row => row.table_name));
    const missingTables = expectedTables.filter(table => !existingTables.has(table));

    const expectedColumns = Object.entries(prerequisites.columns || {}).flatMap(([table, columns]) => columns.map(column => ({ table, column })));
    let missingColumns = [];
    if (expectedColumns.length) {
        const [columnRows] = await connection.query(
            'SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN (?)',
            [[...new Set(expectedColumns.map(item => item.table))]]
        );
        const existingColumns = new Set(columnRows.map(row => `${row.table_name}.${row.column_name}`));
        missingColumns = expectedColumns
            .filter(item => existingTables.has(item.table) && !existingColumns.has(`${item.table}.${item.column}`))
            .map(item => `${item.table}.${item.column}`);
    }

    if (missingTables.length || missingColumns.length) {
        const missing = [...missingTables, ...missingColumns];
        throw new Error(`${file}: missing prerequisites: ${missing.join(', ')}`);
    }
}

async function isOdWorkflowMigrationApplied(connection) {
    const [columns] = await connection.query(
        `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type,
                IS_NULLABLE AS is_nullable, COLUMN_DEFAULT AS column_default
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND ((table_name = 'events' AND column_name = 'target_hod_id')
             OR (table_name = 'od_applications' AND column_name IN ('hod_id', 'status')))`
    );
    const [foreignKeys] = await connection.query(
        `SELECT kcu.TABLE_NAME AS table_name, kcu.CONSTRAINT_NAME AS constraint_name,
                kcu.COLUMN_NAME AS column_name, kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
                kcu.REFERENCED_COLUMN_NAME AS referenced_column_name, rc.DELETE_RULE AS delete_rule
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
          AND rc.TABLE_NAME = kcu.TABLE_NAME
          AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
           AND ((kcu.TABLE_NAME = 'events' AND kcu.CONSTRAINT_NAME = 'fk_events_target_hod')
             OR (kcu.TABLE_NAME = 'od_applications' AND kcu.CONSTRAINT_NAME = 'fk_od_hod'))`
    );

    const columnByKey = new Map(columns.map(row => [`${row.table_name}.${row.column_name}`, row]));
    const targetHod = columnByKey.get('events.target_hod_id');
    const applicationHod = columnByKey.get('od_applications.hod_id');
    const status = columnByKey.get('od_applications.status');
    const hasColumn = column => column?.column_type.toLowerCase() === 'int' && column.is_nullable === 'YES';
    const hasForeignKey = (table, name, column) => foreignKeys.some(key =>
        key.table_name === table && key.constraint_name === name && key.column_name === column &&
        key.referenced_table_name === 'users' && key.referenced_column_name === 'id' && key.delete_rule === 'SET NULL'
    );

    return hasColumn(targetHod) && hasColumn(applicationHod) &&
        hasForeignKey('events', 'fk_events_target_hod', 'target_hod_id') &&
        hasForeignKey('od_applications', 'fk_od_hod', 'hod_id') &&
        status?.column_type.toLowerCase() === "enum('auto approved','pending','hod approved','rejected')" &&
        status.column_default === 'Auto Approved';
}

async function runMigrations(database, options = {}) {
    requireSafeDatabase(database);
    const migrationsDir = options.migrationsDir || MIGRATIONS_DIR;
    const files = fs.readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort();
    const ownsConnection = !options.connection;
    const connection = options.connection || await mysql.createConnection({
        ...resolveConnectionConfig(options.env),
        database,
        multipleStatements: false,
    });
    const results = [];
    process.stdout.write(`target database: ${database}\n`);

    try {
        for (const file of files) {
            await checkPrerequisites(connection, file);
            if (file === '001_stabilize_od_workflows.sql' && await isOdWorkflowMigrationApplied(connection)) {
                const line = `${file}: already applied`;
                results.push(line);
                process.stdout.write(`${line}\n`);
                continue;
            }

            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            try {
                for (const statement of splitStatements(sql)) await connection.query(statement);
                if (file === '001_stabilize_od_workflows.sql' && !await isOdWorkflowMigrationApplied(connection)) {
                    throw new Error('migration did not produce the expected OD workflow columns, foreign keys, and status enum');
                }
            } catch (error) {
                const failure = `${file}: ${error.message}`;
                process.stderr.write(`${failure}\n`);
                throw new Error(`migration failed, stopping: ${failure}`, { cause: error });
            }
            const line = `${file}: applied`;
            results.push(line);
            process.stdout.write(`${line}\n`);
        }
    } finally {
        if (ownsConnection) await connection.end();
    }

    process.stdout.write(`migrations complete for "${database}": ${results.length} file(s) processed successfully\n`);
    return results;
}

if (require.main === module) {
    const database = process.argv[2];
    try {
        requireSafeDatabase(database);
    } catch (error) {
        console.error(`${error.message}\nusage: node scripts/runMigrations.js <database>`);
        process.exit(1);
    }
    runMigrations(database).catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = {
    runMigrations,
    splitStatements,
    resolveConnectionConfig,
    isForbiddenDatabase,
    isOdWorkflowMigrationApplied,
    FORBIDDEN_DB,
};
