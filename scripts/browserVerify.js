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

/* Scroll an element to a position clear of the fixed bottom navigation, then click it.
   home.html keeps its bottom bar fixed over the page (as designed), so a target that
   would land underneath it must be scrolled above the bar first. */
async function clickClearOfFixedNav(page, selector) {
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.evaluate(target => {
        const node = document.querySelector(target);
        const bar = document.querySelector('.stu-bottom, .bottom-nav');
        const clearance = (bar ? bar.getBoundingClientRect().height : 0) + 28;
        const rect = node.getBoundingClientRect();
        const desired = window.scrollY + rect.top + rect.height / 2 - (window.innerHeight - clearance);
        if (desired > window.scrollY) window.scrollTo({ top: desired, behavior: 'instant' });
    }, selector);
    await page.click(selector);
}

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
    const isStudentHome = role === 'student' && url.includes('home.html');
    if (!url.includes('dashboard.html') && !isStudentHome) throw new Error(`login for ${role} did not reach a workspace (url=${url}, errors=${errors.join(' | ')})`);
}

/* Student home dashboard (home.html): verifies the mobile-first blue/white layout,
   quick information cards, service shortcuts, event banner, campus feed filters,
   post composer and the five-item bottom navigation. */
async function checkStudentHome(page, role, viewport, errors) {
    await page.waitForSelector('#heroName', { timeout: 10000 });
    await page.waitForFunction(() => !/^Loading/.test(document.getElementById('heroName').textContent), { timeout: 10000 });
    const name = await page.$eval('#heroName', el => el.textContent.trim());
    record(role, viewport, 'home banner shows the authenticated name', /Live (Student|HOD|Admin|Faculty)/.test(name), name);

    // Quick information cards must render real API data, not placeholders.
    await page.waitForFunction(() => {
        const cards = document.querySelectorAll('#quickCards .stu-qcard');
        return cards.length >= 3 && ![...cards].some(c => c.classList.contains('stu-skel'));
    }, { timeout: 15000 });
    const quickText = await page.$eval('#quickCards', el => el.innerText.replace(/\n/g, ' ').trim());
    record(role, viewport, 'quick info cards render real data', quickText.length > 10, quickText.slice(0, 80));

    // Service shortcuts: all 12 tiles plus the More Services panel.
    const serviceCount = await page.$$eval('#serviceGrid .stu-svc', nodes => nodes.length);
    record(role, viewport, 'all 12 service shortcuts render', serviceCount === 12, `${serviceCount} tiles`);
    const labels = await page.$$eval('#serviceGrid .stu-svc .lbl', nodes => nodes.map(n => n.textContent.trim()));
    const required = ['Academic', 'Attendance', 'Examinations', 'Assignments', 'Library', 'Fees', 'Events', 'Notices', 'Transport', 'Hostel', 'Certificates', 'More Services'];
    record(role, viewport, 'service shortcuts match the required module list', required.every(r => labels.includes(r)), labels.join(','));

    // More Services panel is searchable.
    await page.click('#allServicesBtn');
    await page.waitForSelector('#moreServices.open', { timeout: 5000 });
    await page.type('#moreSearch', 'library');
    const filtered = await page.$$eval('#moreList a', nodes => nodes.map(n => n.textContent.trim()));
    record(role, viewport, 'More Services panel filters by search term', filtered.length >= 1 && filtered.every(t => /librar/i.test(t)), filtered.join(','));
    await page.evaluate(() => document.getElementById('moreSearch').value = '');
    await page.click('#moreServices .cancel');
    await page.waitForFunction(() => !document.getElementById('moreServices').classList.contains('open'), { timeout: 5000 });

    // Quick create sheet.
    await page.click('#quickCreateBtn');
    await page.waitForSelector('#sheetBack.open', { timeout: 5000 });
    record(role, viewport, 'quick create sheet opens', true);
    await page.click('#sheetBack .cancel');
    await page.waitForFunction(() => !document.getElementById('sheetBack').classList.contains('open'), { timeout: 5000 });

    // Campus feed filters must all load without an error.
    if (process.env.DBG_PROBE) {
        const info = await page.evaluate(() => {
            const tab = document.querySelector('#feedTabs [data-filter="for_you"]');
            if (!tab) return { missing: true, url: location.pathname, scrollY: Math.round(window.scrollY) };
            tab.scrollIntoViewIfNeeded();
            const r = tab.getBoundingClientRect();
            const x = Math.round(r.left + r.width / 2);
            const y = Math.round(r.top + r.height / 2);
            const top = document.elementFromPoint(x, y);
            const nav = document.querySelector('.stu-bottom').getBoundingClientRect();
            return {
                url: location.pathname, scrollY: Math.round(window.scrollY),
                tabY: Math.round(r.top), navTop: Math.round(nav.top),
                interceptedBy: top && top !== tab && !tab.contains(top) ? `${top.tagName.toLowerCase()}.${top.className}`.slice(0, 60) : null
            };
        });
        record(role, viewport, 'probe before feed filters', true, JSON.stringify(info));
    }
    await page.waitForSelector('#feedTabs .stu-tab', { timeout: 10000 });
    // Record every real click so an unexpected navigation can be attributed.
    await page.evaluate(() => {
        window.__clicks = [];
        document.addEventListener('click', event => {
            const node = event.target instanceof Element ? event.target : null;
            window.__clicks.push({
                on: `${node ? node.tagName.toLowerCase() : '?'}.${node && node.className ? node.className.toString().slice(0, 40) : ''}`,
                href: node && node.closest('a') ? node.closest('a').getAttribute('href') : null,
                x: Math.round(event.clientX), y: Math.round(event.clientY)
            });
        }, true);
    });
    for (const filter of ['for_you', 'official', 'events', 'following', 'all']) {
        await clickClearOfFixedNav(page, `#feedTabs [data-filter="${filter}"]`);
        await sleep(300);
        // Each click must leave the filter row intact and the page on home.
        const stillThere = await page.evaluate(() => ({
            url: location.pathname,
            tabs: document.querySelectorAll('#feedTabs [data-filter]').length,
            scrollY: Math.round(window.scrollY)
        }));
        if (stillThere.tabs !== 5 || !stillThere.url.endsWith('home.html')) {
            record(role, viewport, 'feed filter row stays intact after switching', false, JSON.stringify(stillThere));
            throw new Error('feed filter row lost after switching filters');
        }
    }
    await clickClearOfFixedNav(page, '#feedTabs [data-filter="for_you"]');
    await sleep(300);
    const feedText = await page.$eval('#posts', el => el.innerText.trim());
    record(role, viewport, 'campus feed reaches a loaded/empty state', feedText.length > 0, feedText.slice(0, 60).replace(/\n/g, ' '));
    const filterErrors = errors.filter(e => /feed|community|http-5/i.test(e));
    record(role, viewport, 'feed filters switch without errors', filterErrors.length === 0, filterErrors.join(' | '));

    // Notification bell must show a badge or a populated panel, and never 500.
    await page.click('#bellBtn');
    await sleep(400);
    const notifText = await page.$eval('#notifList', el => el.innerText.trim());
    record(role, viewport, 'notification panel lists notifications', notifText.length > 0, notifText.slice(0, 50));
    const notifErrors = errors.filter(e => /notifications/i.test(e) && /http-5/i.test(e));
    record(role, viewport, 'notification API responds successfully', notifErrors.length === 0, notifErrors.join(' | '));

    const nav = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.stu-bottom a, .stu-bottom button')];
        return {
            count: items.length,
            labels: items.map(i => i.textContent.replace(/\s+/g, ' ').trim()),
            homeActive: Boolean(document.querySelector('.stu-bottom a[href="home.html"]'))
        };
    });
    if (viewport === 'mobile') {
        record(role, viewport, 'mobile bottom navigation has Home/Messages/Create/Attendance/Profile',
            nav.count === 5 && nav.homeActive, JSON.stringify(nav.labels));
    }

    // ---- Publish a real post with an image attachment, then exercise the
    // ---- interactions against the live API instead of only checking styling.
    await page.evaluate(() => {
        document.querySelector('#postBody').scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    const marker = `browser-verify post ${Date.now()}`;
    const png = path.join(os.tmpdir(), `erp-verify-post-${process.pid}.png`);
    fs.writeFileSync(png, Buffer.from(
        '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c6360000002000100ffff030000060005',
        'hex'));
    await page.click('#postBody');
    await page.type('#postBody', marker);
    await (await page.$('#postImage')).uploadFile(png);
    await page.waitForFunction(() => !document.getElementById('postSubmitBtn').disabled, { timeout: 5000 });
    await page.click('#postSubmitBtn');
    await page.waitForFunction(text => {
        const posts = [...document.querySelectorAll('.stu-post')];
        return posts.length > 0 && posts.some(p => p.innerText.includes(text));
    }, { timeout: 25000 }, marker);
    const published = await page.$$eval('.stu-post .txt', nodes => nodes.map(n => n.textContent.trim()));
    record(role, viewport, 'composer publishes a real post to the campus feed',
        published.some(t => t.includes('browser-verify post')), `${published.length} post(s) in view`);
    const attached = await page.$$eval('.stu-post .media img, .stu-post .media video', nodes => nodes.length);
    // Attachments are private: the proof is that a blob URL was produced by an
    // authenticated fetch, not that a bare (403-rejected) src attribute exists.
    const attachmentLoaded = await page.evaluate(() =>
        [...document.querySelectorAll('.stu-post .media img, .stu-post .media video')].some(n => n.currentSrc.startsWith('blob:') || n.src.startsWith('blob:')));
    record(role, viewport, 'published post renders its uploaded image', attached >= 1 && attachmentLoaded,
        `${attached} media node(s), blob loaded=${attachmentLoaded}`);

    const postId = await page.evaluate(text => {
        const row = [...document.querySelectorAll('.stu-post')].find(p => p.innerText.includes(text));
        return row ? row.dataset.id : null;
    }, marker);
    if (!postId) throw new Error('published post disappeared before interaction');

    // Liking must be answered by the API and reflected in aria-pressed, not just re-styled.
    const likeBefore = await page.$eval(`.stu-post[data-id="${postId}"] [data-act="like"]`, el => el.getAttribute('aria-pressed'));
    await clickClearOfFixedNav(page, `.stu-post[data-id="${postId}"] [data-act="like"]`);
    await page.waitForFunction(({ id, before }) => {
        const row = document.querySelector(`.stu-post[data-id="${id}"]`);
        return row && row.querySelector('[data-act="like"]').getAttribute('aria-pressed') !== before;
    }, { timeout: 15000 }, { id: postId, before: likeBefore });
    const likeAfter = await page.$eval(`.stu-post[data-id="${postId}"] [data-act="like"]`, el => el.getAttribute('aria-pressed'));
    record(role, viewport, 'like is persisted by the API and re-rendered', likeBefore !== likeAfter, `${likeBefore} -> ${likeAfter}`);

    // Saving must round-trip: the saved post is the student's own record.
    const saveBefore = await page.$eval(`.stu-post[data-id="${postId}"] [data-act="save"]`, el => el.getAttribute('aria-pressed'));
    if (process.env.DBG_PROBE) {
        const p = await page.evaluate(sel => {
            const node = document.querySelector(sel);
            if (!node) return { missing: true };
            const r = node.getBoundingClientRect();
            const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
            const top = document.elementFromPoint(x, y);
            const nav = document.querySelector('.stu-bottom').getBoundingClientRect();
            const row = node.closest('.actions').getBoundingClientRect();
            return { rect: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top) }, rowRight: Math.round(row.right), navTop: Math.round(nav.top), atPoint: top ? `${top.tagName.toLowerCase()}.${top.className}`.slice(0, 50) : null, isNode: top === node };
        }, `.stu-post[data-id="${postId}"] [data-act="save"]`);
        record(role, viewport, 'probe save button', true, JSON.stringify(p));
    }
    await clickClearOfFixedNav(page, `.stu-post[data-id="${postId}"] [data-act="save"]`);
    await page.waitForFunction(({ id, before }) => {
        const row = document.querySelector(`.stu-post[data-id="${id}"]`);
        return row && row.querySelector('[data-act="save"]').getAttribute('aria-pressed') !== before;
    }, { timeout: 15000 }, { id: postId, before: saveBefore });
    record(role, viewport, 'save is persisted by the API and re-rendered',
        saveBefore !== await page.$eval(`.stu-post[data-id="${postId}"] [data-act="save"]`, el => el.getAttribute('aria-pressed')), 'toggled');

    // Comments post to the API and are rendered for the post.
    await clickClearOfFixedNav(page, `.stu-post[data-id="${postId}"] [data-act="comment"]`);
    await page.waitForSelector(`.stu-post[data-id="${postId}"] .comments:not([hidden])`, { timeout: 5000 });
    if (process.env.DBG_PROBE) {
        const p = await page.evaluate(sel => {
            const row = document.querySelector(sel);
            const input = row ? row.querySelector('.comments input') : null;
            return {
                hasRow: Boolean(row), hasInput: Boolean(input),
                inputName: input ? input.name : null,
                value: input ? input.value : null,
                crows: row ? row.querySelectorAll('.crow').length : 0,
                errors: window.__pageErrors || []
            };
        }, `.stu-post[data-id="${postId}"]`);
        record(role, viewport, 'probe comment area', true, JSON.stringify(p));
    }
    await page.evaluate(() => {
        window.__pageErrors = [];
        window.addEventListener('error', e => window.__pageErrors.push(String(e.message)));
        window.addEventListener('unhandledrejection', e => window.__pageErrors.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));
    });
    if (process.env.DBG_PROBE) {
        await page.type(`.stu-post[data-id="${postId}"] .comments input`, 'probe');
        const typed = await page.evaluate(sel => {
            const row = document.querySelector(sel);
            const input = row.querySelector('.comments input');
            const form = row.querySelector('[data-form="comment"]');
            return { value: input.value, hasForm: Boolean(form), formBodyIsInput: form.body === input, formElements: [...form.elements].map(e => e.name) };
        }, `.stu-post[data-id="${postId}"]`);
        record(role, viewport, 'probe after typing', true, JSON.stringify(typed));
        const submitted = await page.evaluate(sel => {
            const row = document.querySelector(sel);
            const form = row.querySelector('[data-form="comment"]');
            let fired = false;
            form.addEventListener('submit', () => { fired = true; }, { once: true });
            form.querySelector('input').value = 'probe2';
            form.requestSubmit();
            return { fired, crows: row.querySelectorAll('.crow').length, value: form.querySelector('input').value };
        }, `.stu-post[data-id="${postId}"]`);
        record(role, viewport, 'probe requestSubmit', true, JSON.stringify(submitted));
    }
    await page.type(`.stu-post[data-id="${postId}"] .comments input`, `verify comment ${Date.now()}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(id => {
        const row = document.querySelector(`.stu-post[data-id="${id}"]`);
        return row && [...row.querySelectorAll('.crow')].length > 0;
    }, { timeout: 15000 }, postId);
    record(role, viewport, 'comment is posted to the API and rendered', true);

    // Feed search must filter posts server-side by text.
    await page.evaluate(() => document.getElementById('feedSearchForm').classList.add('open'));
    await page.type('#feedSearchInput', marker);
    await page.keyboard.press('Enter');
    await page.waitForFunction(text => {
        const posts = [...document.querySelectorAll('.stu-post')];
        return posts.length > 0 && posts.every(p => p.innerText.includes(text));
    }, { timeout: 15000 }, marker);
    const searchResults = await page.$$eval('.stu-post .txt', nodes => nodes.map(n => n.textContent.trim()));
    record(role, viewport, 'feed search filters posts server-side',
        searchResults.length >= 1 && searchResults.every(t => t.includes('browser-verify post')), `${searchResults.length} result(s)`);
    await page.click('#feedSearchClear');
    await page.waitForTimeout(800);

    // Cleanup: remove the post so the sandbox database stays tidy.
    await page.click(`.stu-post[data-id="${postId}"] [data-act="remove"]`);
    await page.waitForSelector('.ui-modal-backdrop', { timeout: 5000 });
    await page.click('.ui-modal-backdrop [data-confirm]');
    await page.waitForFunction(id => !document.querySelector(`.stu-post[data-id="${id}"]`), { timeout: 15000 }, postId);
    fs.rmSync(png, { force: true });

    const o = await overflow(page);
    record(role, viewport, 'no horizontal overflow on Home', !o.overflowing, `scrollWidth=${o.scrollWidth} innerWidth=${o.innerWidth}`);
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
        // Students land on the mobile-first home dashboard; every other role on dashboard.html.
        if (account.role === 'student') await checkStudentHome(page, account.role, viewportName, errors);
        else await checkDashboard(page, account.role, viewportName, errors);
        await checkAttendance(page, account.role, viewportName);
        await checkProfile(page, account.role, viewportName, account.name);
        await checkMessages(page, account.role, viewportName);
        const pageErrors = errors.filter(e => /^(pageerror|unexpected-dialog)/.test(e));
        record(account.role, viewportName, 'no JavaScript errors or dialogs across the four screens', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
        const resourceErrors = errors.filter(e => /^(console|requestfailed|http-\d)/.test(e));
        record(account.role, viewportName, 'no console/asset errors across the four screens', resourceErrors.length === 0, resourceErrors.slice(0, 3).join(' | '));
    } catch (error) {
        if (process.env.DBG_STACK) console.log(`[dbg ${account.role}/${viewportName}] ${error.stack}`);
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
            for (const [label, selector, expected] of [
                ['attendance', '.stu-bottom a[href="attendance.html"]', 'attendance.html'],
                ['profile', '.stu-bottom a[href="profile.html"]', 'profile.html'],
                ['messages', '.stu-bottom a[href="messages.html"]', 'messages.html'],
                ['home', '.stu-bottom a[href="home.html"]', 'home.html']
            ]) {
                await navPage.goto(`${BASE}/home.html`, { waitUntil: 'networkidle2', timeout: 20000 });
                await navPage.waitForSelector(selector, { timeout: 10000 });
                await navPage.click(selector);
                await navPage.waitForFunction(exp => location.pathname.endsWith(exp), { timeout: 10000 }, expected);
                record('student', 'mobile', `bottom nav "${label}" opens ${expected}`, navPage.url().endsWith(expected), navPage.url());
            }
            // The centre Quick Create button must open the post composer sheet.
            await navPage.goto(`${BASE}/home.html`, { waitUntil: 'networkidle2', timeout: 20000 });
            await navPage.click('#quickCreateBtn');
            await navPage.waitForSelector('#sheetBack.open', { timeout: 5000 });
            record('student', 'mobile', 'bottom nav quick-create opens the composer', true);
            await navPage.click('#sheetBack [data-close="sheet"]');
            await navPage.waitForFunction(() => !document.getElementById('sheetBack').classList.contains('open'), { timeout: 5000 });
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




