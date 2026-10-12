const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const page = fs.readFileSync('public/library.html', 'utf8');
const routeSource = fs.readFileSync('routes/libraryRoutes.js', 'utf8');
const migration = fs.readFileSync('db/migrations/011_library_features.sql', 'utf8');

function inlinePageScript() {
    const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    return scripts.at(-1)?.[1] || '';
}

test('Library page script parses and provides ten isolated feature destinations', () => {
    assert.doesNotThrow(() => new vm.Script(inlinePageScript()));
    const labels = ['Search Catalogue', 'My Issued Books', 'Renew Books', 'Reservations', 'Digital Library', 'E-Books & Journals', 'Reading History', 'Fines & Payments', 'Library Rules', 'Study Spaces & Facilities'];
    for (const label of labels) assert.ok(page.includes(label), `missing Library feature: ${label}`);
    assert.ok(page.includes("const rootPath = 'library.html';") && page.includes('?feature='));
    assert.doesNotMatch(page, /Campus Feed|Academic Dashboard shortcuts/);
});

test('Library feature APIs are authenticated and private student operations are role protected', () => {
    assert.match(routeSource, /router\.use\(verifyToken\)/);
    for (const path of ['/loans/:id/renew', '/reservations', '/reading-history', '/fines', '/facilities/:id/bookings', '/books/:id/download']) {
        assert.ok(routeSource.includes(path), `missing Library API path: ${path}`);
    }
    assert.match(routeSource, /router\.get\('\/my-loans', students/);
    assert.match(routeSource, /router\.delete\('\/reservations\/:id', students/);
});

test('Library feature migration is additive and includes renewal, digital history, rules, and spaces', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_loan_renewals/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_digital_activity/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_policies/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_facilities/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS library_space_bookings/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|DELETE FROM/i);
});
