// Development-only static audit: detects inline-script references to element IDs
// that are not defined in the page markup (a common cause of browser console errors),
// and reports blocking dialog calls (alert/confirm/prompt) that break keyboard and
// assistive-technology flows.
// Usage: node scripts/auditUiIds.js public/page.html [more pages...]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BLOCKING = [
    ['prompt(', 'blocking prompt() dialog'],
    ['confirm(', 'blocking confirm() dialog'],
    ['alert(', 'blocking alert() dialog'],
    ['document.write(', 'document.write() call']
];

// Reports referenced local scripts/stylesheets that do not exist on disk,
// which produce 404 console errors and unstyled pages at runtime.
function missingAssets(file, source) {
    const problems = [];
    const refs = [
        ...source.matchAll(/<script[^>]*\bsrc="([^"]+)"/g),
        ...source.matchAll(/<link[^>]*\bhref="([^"]+\.css)"/g)
    ].map(match => match[1]);
    for (const ref of refs) {
        if (/^(https?:)?\/\//.test(ref)) continue;
        // Served at runtime by the Socket.IO server attached in server.js.
        if (ref === '/socket.io/socket.io.js') continue;
        const local = ref.replace(/^\//, '');
        const candidates = [path.resolve(process.cwd(), local), path.resolve(path.dirname(file), local), path.resolve(process.cwd(), 'public', local)];
        if (!candidates.some(candidate => fs.existsSync(candidate))) problems.push(`missing referenced asset: ${ref}`);
    }
    return problems;
}

// Parses each inline script so syntax errors are caught before the browser hits them.
function inlineSyntaxErrors(file, scripts) {
    const problems = [];
    scripts.forEach((code, index) => {
        if (!code.trim()) return;
        try { new vm.Script(code, { filename: `${file}#inline-${index + 1}` }); }
        catch (error) { problems.push(`inline script #${index + 1} syntax error: ${error.message}`); }
    });
    return problems;
}

const files = process.argv.slice(2);
let problems = 0;
for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const scripts = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
    const inline = scripts.join('\n');
    const markup = source.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '');
    const defined = new Set([...markup.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
    const referenced = new Set();
    for (const pattern of [/\$\('([^']+)'\)/g, /getElementById\('([^']+)'\)/g, /getElementById\("([^"]+)"\)/g]) {
        for (const match of inline.matchAll(pattern)) referenced.add(match[1]);
    }
    // ids built dynamically (template literals / createElement) cannot be checked statically
    const dynamic = new Set();
    for (const match of inline.matchAll(/\$\('([^']*)\$\{/g)) dynamic.add(match[1]);
    for (const match of inline.matchAll(/getElementById\(([^)]*)\$\{/g)) dynamic.add(match[1]);
    // ids the page creates itself at runtime (e.g. a shared toast host)
    for (const match of inline.matchAll(/(?:createElement\('([^']+)'\)|id\s*=\s*'([^']+)')/g)) { if (match[1]) dynamic.add(match[1]); if (match[2]) dynamic.add(match[2]); }
    for (const match of inline.matchAll(/host\.id\s*=\s*'([^']+)'/g)) dynamic.add(match[1]);
    const missing = [...referenced].filter(ref => !defined.has(ref) && !dynamic.has(ref)).sort();
    const blocking = BLOCKING.filter(([needle]) => inline.includes(needle)).map(([, label]) => label);
    const zoomBlocked = /name="viewport"[^>]*user-scalable=no/.test(source) ? 'viewport meta blocks pinch-zoom (WCAG 1.4.4)' : null;
    const findings = [...missing.map(ref => `missing element id #${ref}`), ...blocking, ...(zoomBlocked ? [zoomBlocked] : [])];
    findings.push(...missingAssets(file, source));
    findings.push(...inlineSyntaxErrors(file, scripts));
    console.log(`${path.basename(file)}: ${defined.size} ids, ${referenced.size} referenced`);
    if (findings.length) { problems += findings.length; findings.forEach(finding => console.log(`  FINDING: ${finding}`)); }
}
process.exit(problems ? 1 : 0);

