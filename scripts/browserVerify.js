// Browser verification for the four approved ERP screens (Home, Messages,
// Attendance, Profile) at mobile and desktop widths using system Chrome.
//
// Safety contract:
//   - Requires NODE_ENV=development or NODE_ENV=test AND BROWSER_VERIFY_ALLOW=1.
//   - Creates its own disposable sandbox-named MySQL database via
//     scripts/liveTestHarness and always drops it (plus the spawned server and
//     temp upload dir) in the finally block. Never touches other databases.
//
// Usage: NODE_ENV=test BROWSER_VERIFY_ALLOW=1 node scripts/browserVerify.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE_ENV_OK = ['development', 'test'].includes(process.env.NODE_ENV);
const ALLOWED = process.env.BROWSER_VERIFY_ALLOW === '1';
if (!NODE_ENV_OK || !ALLOWED) {
    console.error('Refusing: requires NODE_ENV=development|test and BROWSER_VERIFY_ALLOW=1');
    process.exit(2);
}

// config.js pins local API calls to http://localhost:3000, so the server MUST run there.
const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const DB = `erp_browser_sandbox_${process.pid}`;
const PASSWORD = process.env.LIVE_TEST_PASSWORD || 'LiveTest#2026';
const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome'
].filter(Boolean);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const record = (role, viewport, name, ok, detail = '') => {
    results.push({ role, viewport, name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${role} | ${viewport} | ${name}${detail ? ` — ${detail}` : ''}`);
};

let server = null;
let browser = null;
let uploadDir = '';

async function startServer() {
    // Hard precheck: the browser (and Chrome's config.js) requires the real server on :3000.
    const probe = await new Promise(resolve => {
        const socket = require('node:net').connect(PORT, '127.0.0.1');
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => resolve(false));
    }).catch(() => false);
    if (probe) throw new Error(`port ${PORT} is already occupied by another process; kill it before verifying`);
    process.env.DESTROYING_LIVE_TEST_DB = '1';
    const harness = require(path.join(ROOT, 'scripts/liveTestHarness'));
    await harness.createDatabase(DB);
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-browser-uploads-'));
    server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: {
            ...process.env,
            NODE_ENV: 'test', // keeps the rate limiter out of the way of verification traffic
            PORT: String(PORT),
            DB_NAME: DB,
            DB_HOST: process.env.DB_HOST || 'localhost',
            DB_USER: process.env.DB_USER || 'root',
            DB_PASSWORD: process.env.DB_PASSWORD || '',
            JWT_SECRET: process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
                ? process.env.JWT_SECRET
                : 'browser-verify-secret-0123456789abcdefghijklmnop',
            LEARNING_UPLOAD_DIR: uploadDir
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        // Fail fast if the child crashed (e.g. a stale process is squatting on port 3000).
        if (server.exitCode !== null) throw new Error(`server exited during boot with code ${server.exitCode}; port ${PORT} may be occupied`);
        try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* booting */ }
        await sleep(150);
    }
    throw new Error('server did not become healthy on port ' + PORT);
}

async function launchBrowser() {
    const puppeteer = require('puppeteer-core');
    const executablePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!executablePath) throw new Error('No Chrome/Chromium found; set CHROME_PATH');
    browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    return executablePath;
}

async function cleanup() {
    try { if (browser) await browser.close(); } catch { /* already closed */ }
    if (server && server.exitCode === null) {
        server.kill('SIGTERM');
        const deadline = Date.now() + 3000;
        while (server.exitCode === null && Date.now() < deadline) await sleep(50);
        if (server.exitCode === null) server.kill('SIGKILL');
    }
    try { fs.rmSync(uploadDir, { recursive: true, force: true }); } catch { /* gone */ }
    try {
        process.env.DESTROYING_LIVE_TEST_DB = '1';
        const harness = require(path.join(ROOT, 'scripts/liveTestHarness'));
        await harness.dropDatabase(DB);
    } catch (error) { console.error('cleanup: drop database failed:', error.message); }
}
const IGNORED_ERRORS = [/favicon\.ico/i, /net::ERR_ABORTED/i, /the network connection was reset/i];

function attachDiagnostics(page, sink) {
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (!IGNORED_ERRORS.some(pattern => pattern.test(text))) sink.push(`console: ${text}`);
    });
    page.on('pageerror', error => sink.push(`pageerror: ${error.message}`));
    page.on('requestfailed', request => {
        const failure = request.failure() ? request.failure().errorText : '';
        const url = request.url();
        if (!IGNORED_ERRORS.some(pattern => pattern.test(`${url}${failure}`))) sink.push(`requestfailed: ${url} ${failure}`);
    });
    page.on('response', response => {
        if (response.status() >= 400 && !IGNORED_ERRORS.some(pattern => pattern.test(response.url()))) {
            sink.push(`http-${response.status()}: ${response.url()}`);
        }
    });
    page.on('dialog', async dialog => {
        sink.push(`unexpected-dialog: ${dialog.type()} "${dialog.message()}"`);
        try { await dialog.dismiss(); } catch { /* already gone */ }
    });
}

const overflow = page => page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    overflowing: document.documentElement.scrollWidth > window.innerWidth + 1
}));

async function loginAs(page, role, email, errors) {
    await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.click(`[data-role="${role}"]`);
    await page.type('#email', email);
    await page.type('#password', PASSWORD);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
        page.click('#loginButton')
    ]);
    const url = page.url();
    if (!url.includes('dashboard.html')) throw new Error(`login for ${role} did not reach the dashboard (url=${url}, errors=${errors.join(' | ')})`);
}

async function checkDashboard(page, role, viewport, errors) {
    await page.waitForSelector('#welcome', { timeout: 10000 });
    await page.waitForFunction(() => /Welcome back,/.test(document.getElementById('welcome').textContent), { timeout: 10000 });
    await sleep(1200); // let feed and moderation requests settle before asserting
    const welcome = await page.$eval('#welcome', el => el.textContent);
    record(role, viewport, 'welcome shows the authenticated name', /Live (Student|HOD|Admin|Faculty)/.test(welcome), welcome);
    const featureCount = await page.$$eval('#features .feature-card, #features > *', nodes => nodes.filter(n => !n.classList.contains('state')).length);
    record(role, viewport, 'feature grid renders real module cards', featureCount >= 4, `${featureCount} cards`);
    const feedText = await page.$eval('#feed', el => el.innerText.trim());
    record(role, viewport, 'campus feed reaches a loaded/empty state', feedText.length > 0, feedText.slice(0, 60).replace(/\n/g, ' '));
    const moderationHidden = await page.$eval('#moderationCard', el => el.hidden);
    const shouldBeHidden = role === 'student';
    record(role, viewport, 'moderation panel visibility matches role', moderationHidden === shouldBeHidden, `hidden=${moderationHidden}`);

    // Feed filter switching must not error.
    for (const filter of ['following', 'classmates', 'saved', 'college']) {
        await page.click(`[data-filter="${filter}"]`);
        await sleep(350);
    }
    const filterErrors = errors.filter(e => /feed|community/i.test(e));
    record(role, viewport, 'feed filters switch without errors', filterErrors.length === 0, filterErrors.join(' | '));

    const nav = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('.bottom-nav [data-bottom]')];
        return {
            count: buttons.length,
            labels: buttons.map(b => b.textContent.replace(/\s+/g, ' ').trim()),
            sidebarVisible: getComputedStyle(document.querySelector('.dashboard-sidebar')).display !== 'none',
            bottomNavVisible: getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none'
        };
    });
    if (viewport === 'mobile') {
        record(role, viewport, 'bottom navigation has Home/Messages/Attendance/Profile', nav.count === 4 && nav.bottomNavVisible, JSON.stringify(nav.labels));
    } else {
        record(role, viewport, 'desktop uses sidebar and hides mobile bottom nav', nav.sidebarVisible && !nav.bottomNavVisible, `sidebar=${nav.sidebarVisible} bottom=${nav.bottomNavVisible}`);
    }
    const o = await overflow(page);
    record(role, viewport, 'no horizontal overflow on Home', !o.overflowing, `scrollWidth=${o.scrollWidth} innerWidth=${o.innerWidth}`);
}
async function checkAttendance(page, role, viewport) {
    await page.goto(`${BASE}/attendance.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForFunction(() => {
        const el = document.getElementById('summaryMeta');
        return el && !/^Loading/.test(el.textContent);
    }, { timeout: 10000 });
    const summary = await page.$eval('#summaryMeta', el => el.textContent);
    record(role, viewport, 'attendance summary renders real counts', /\d+ record/.test(summary), summary);
    const contentVisible = await page.$eval('#content', el => !el.hidden);
    record(role, viewport, 'attendance content becomes visible', contentVisible);
    const o = await overflow(page);
    record(role, viewport, 'no horizontal overflow on Attendance', !o.overflowing, `scrollWidth=${o.scrollWidth}`);
}

async function checkProfile(page, role, viewport, expectedName) {
    await page.goto(`${BASE}/profile.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForFunction(() => document.getElementById('name') && document.getElementById('name').textContent.trim().length > 0, { timeout: 10000 });
    const name = await page.$eval('#name', el => el.textContent.trim());
    const completion = await page.$eval('#completion', el => el.textContent);
    record(role, viewport, 'profile shows the authenticated user', name === expectedName, `${name} (${completion} complete)`);
    const hasSections = await page.$$eval('dl.profile-list', lists => lists.length);
    record(role, viewport, 'profile sections render data lists', hasSections >= 3, `${hasSections} sections`);
    const o = await overflow(page);
    record(role, viewport, 'no horizontal overflow on Profile', !o.overflowing, `scrollWidth=${o.scrollWidth}`);
}

async function checkMessages(page, role, viewport) {
    await page.goto(`${BASE}/messages.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForSelector('#conversations', { timeout: 10000 });
    await sleep(1000);
    const realtime = await page.$eval('#realtime', el => el.textContent.trim());
    record(role, viewport, 'messages realtime indicator reports a state', ['Live', 'Connecting...', 'Offline - showing saved history', 'Offline - reconnecting...', 'Realtime unavailable'].includes(realtime), realtime);
    const lists = await page.evaluate(() => ({
        conversations: Boolean(document.getElementById('conversations')),
        groups: Boolean(document.getElementById('groups')),
        chat: Boolean(document.getElementById('chatHeader'))
    }));
    record(role, viewport, 'messages layout renders conversations/groups/chat', lists.conversations && lists.groups && lists.chat, JSON.stringify(lists));
    const o = await overflow(page);
    record(role, viewport, 'no horizontal overflow on Messages', !o.overflowing, `scrollWidth=${o.scrollWidth}`);
}
const ACCOUNTS = [
    { role: 'student', dataRole: 'student', email: 'live.student@test.local', name: 'Live Student One' },
    { role: 'organizer', dataRole: 'organizer', email: 'live.organizer@test.local', name: 'Live Faculty' },
    { role: 'hod', dataRole: 'hod', email: 'live.hod@test.local', name: 'Live HOD' },
    { role: 'super_admin', dataRole: 'super_admin', email: 'live.super_admin@test.local', name: 'Live Admin' }
];
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

async function verifyRoleViewport(account, viewportName, size) {
    const page = await browser.newPage();
    const errors = [];
    attachDiagnostics(page, errors);
    await page.setViewport(size);
    try {
        await loginAs(page, account.dataRole, account.email, errors);
        record(account.role, viewportName, 'login reaches the role dashboard', true);
        await checkDashboard(page, account.role, viewportName, errors);
        await checkAttendance(page, account.role, viewportName);
        await checkProfile(page, account.role, viewportName, account.name);
        await checkMessages(page, account.role, viewportName);
        const pageErrors = errors.filter(e => /^(pageerror|unexpected-dialog)/.test(e));
        record(account.role, viewportName, 'no JavaScript errors or dialogs across the four screens', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
        const resourceErrors = errors.filter(e => /^(console|requestfailed|http-\d)/.test(e));
        record(account.role, viewportName, 'no console/asset errors across the four screens', resourceErrors.length === 0, resourceErrors.slice(0, 3).join(' | '));
    } catch (error) {
        record(account.role, viewportName, 'verification flow completed', false, `${error.message} | errors: ${errors.slice(0, 3).join(' | ')}`);
    } finally {
        await page.close().catch(() => {});
    }
}
(async () => {
    let exitCode = 0;
    try {
        const executablePath = await launchBrowser();
        console.log(`Chrome: ${executablePath}`);
        await startServer();
        console.log(`Server ready at ${BASE} with disposable database ${DB}`);
        for (const account of ACCOUNTS) {
            for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
                await verifyRoleViewport(account, viewportName, size);
            }
        }
        // Mobile bottom navigation must actually move between the four screens.
        const navPage = await browser.newPage();
        const navErrors = [];
        attachDiagnostics(navPage, navErrors);
        await navPage.setViewport(VIEWPORTS.mobile);
        try {
            await loginAs(navPage, 'student', 'live.student@test.local', navErrors);
            for (const [label, expected] of [['attendance', 'attendance.html'], ['profile', 'profile.html'], ['messages', 'messages.html'], ['home', 'dashboard.html']]) {
                await navPage.click(`.bottom-nav [data-bottom="${label}"]`);
                await navPage.waitForFunction(exp => location.pathname.endsWith(exp), { timeout: 10000 }, expected);
                record('student', 'mobile', `bottom nav "${label}" opens ${expected}`, navPage.url().endsWith(expected), navPage.url());
            }
        } catch (error) {
            record('student', 'mobile', 'bottom navigation flow', false, error.message);
        } finally {
            await navPage.close().catch(() => {});
        }
    } catch (error) {
        record('setup', '-', 'browser verification harness starts', false, error.message);
        exitCode = 1;
    } finally {
        await cleanup();
    }

    const failed = results.filter(r => !r.ok);
    console.log(`\n=== BROWSER VERIFY: ${results.length - failed.length}/${results.length} checks passed ===`);
    if (failed.length) {
        console.log('Failed checks:');
        for (const f of failed) console.log(`  FAIL | ${f.role} | ${f.viewport} | ${f.name} — ${f.detail}`);
        exitCode = 1;
    }
    process.exit(exitCode);
})();




