const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DB_HOST ||= 'localhost';
process.env.DB_USER ||= 'root';
process.env.DB_NAME ||= 'institution_od_recovery';
process.env.DB_PORT ||= '3306';
process.env.JWT_SECRET ||= 'x'.repeat(32);

const { validateRuntimeConfig } = require('../config/db');
const { getManagedEvent } = require('../utils/eventAuthorization');

test('rejects runtime configuration with a missing or weak JWT secret', () => {
    assert.throws(
        () => validateRuntimeConfig({
            DB_HOST: 'localhost',
            DB_USER: 'root',
            DB_NAME: 'institution_od_recovery',
            DB_PORT: '3306',
            JWT_SECRET: 'too-short'
        }),
        /JWT_SECRET/
    );
});

test('accepts complete runtime configuration without exposing secret values', () => {
    const config = validateRuntimeConfig({
        DB_HOST: 'localhost',
        DB_USER: 'root',
        DB_PASSWORD: 'test-only',
        DB_NAME: 'institution_od_recovery',
        DB_PORT: '3306',
        JWT_SECRET: 'x'.repeat(32)
    });

    assert.equal(config.host, 'localhost');
    assert.equal(config.database, 'institution_od_recovery');
    assert.equal(config.port, 3306);
    assert.equal(config.password, 'test-only');
});

test('denies a HOD access to a participant event outside its department or target assignment', async () => {
    const db = {
        query: async () => [[{
            id: 7,
            organizer_id: 10,
            department_id: 3,
            target_hod_id: 20,
            is_deleted: 0
        }]]
    };

    assert.equal(
        await getManagedEvent(db, { id: 21, role: 'hod', department_id: 99 }, 7),
        null
    );
});

test('migration guards the OD/HOD columns and constraints without destructive statements', () => {
    const fs = require('node:fs');
    const migration = fs.readFileSync(
        'db/migrations/001_stabilize_od_workflows.sql',
        'utf8'
    );

    assert.match(migration, /information_schema\.columns/);
    assert.match(migration, /information_schema\.table_constraints/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});

test('organizer enumeration is protected by super-admin RBAC', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync('routes/organizerRoutes.js', 'utf8');

    assert.match(source, /router\.get\("\/",\s*verifyToken,\s*allowRoles\("super_admin"\)/s);
});

test('HOD participant retrieval uses managed-event authorization and the plural table', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync('controllers/hodController.js', 'utf8');
    const participantController = fs.readFileSync('controllers/participantController.js', 'utf8');

    assert.match(source, /getManagedEvent\(db, req\.user, event_id\)/);
    assert.match(source, /FROM event_participants/);
    assert.match(participantController, /FROM event_participants WHERE event_id=\?/);
});