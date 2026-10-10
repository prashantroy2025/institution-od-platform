const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isDateOnly,
    isEmail,
    isNonEmptyString,
    isPositiveInteger,
    isQRToken
} = require('../utils/requestValidation');
const { getManagedEvent } = require('../utils/eventAuthorization');

test('validates positive integer identifiers', () => {
    assert.equal(isPositiveInteger(12), true);
    assert.equal(isPositiveInteger('12'), true);
    assert.equal(isPositiveInteger('0'), false);
    assert.equal(isPositiveInteger('12abc'), false);
});

test('validates real YYYY-MM-DD dates', () => {
    assert.equal(isDateOnly('2026-10-09'), true);
    assert.equal(isDateOnly('2026-02-30'), false);
    assert.equal(isDateOnly('09/10/2026'), false);
});

test('validates QR token format and credentials', () => {
    assert.equal(isQRToken('0123456789abcdef0123456789abcdef'), true);
    assert.equal(isQRToken('not-a-token'), false);
    assert.equal(isEmail('student@example.edu'), true);
    assert.equal(isEmail('not-an-email'), false);
    assert.equal(isNonEmptyString('password'), true);
    assert.equal(isNonEmptyString('   '), false);
});

test('authorizes event access by ownership, department, and deletion state', async () => {
    const event = {
        id: 7,
        organizer_id: 10,
        department_id: 3,
        target_hod_id: 20,
        is_deleted: 0
    };
    const db = {
        query: async () => [[event]]
    };

    assert.equal((await getManagedEvent(db, { id: 10, role: 'organizer' }, 7)).id, 7);
    assert.equal((await getManagedEvent(db, { id: 20, role: 'hod', department_id: 99 }, 7)).id, 7);
    assert.equal((await getManagedEvent(db, { id: 21, role: 'hod', department_id: 3 }, 7)).id, 7);
    assert.equal(await getManagedEvent(db, { id: 30, role: 'organizer' }, 7), null);
    assert.equal(await getManagedEvent(db, { id: 10, role: 'organizer' }, 'bad-id'), null);
});