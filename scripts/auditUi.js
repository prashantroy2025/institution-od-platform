#!/usr/bin/env node
/**
 * Static UI audit for the four approved ERP screens.
 *
 * Detects the defect classes that surface as browser console errors or dead controls:
 *   - duplicate element ids within a page
 *   - references to element ids that do not exist in the markup
 *   - alert()/prompt()/confirm() usage (blocking dialogs; not accessible)
 *   - duplicate function declarations inside the page script
 *   - horizontal-overflow risks (fixed pixel widths wider than a 360px phone)
 *
 * Usage: node scripts/auditUi.js [file ...]
 */
const fs = require('fs');

const FILES = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ['public/dashboard.html', 'public/messages.html', 'public/attendance.html', 'public/profile.html'];

let problems = 0;
const report = (file, severity, message) => {
    problems += severity === 'ERROR' ? 1 : 0;
    console.log(`${severity === 'ERROR' ? 'FAIL' : 'WARN'} ${file}: ${message}`);
};

for (const file of FILES) {
    const source = fs.readFileSync(file, 'utf8');
    const markup = source.slice(0, source.lastIndexOf('<' + 'script')) || source;

    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const seen = new Set();
    for (const value of ids) {
        if (seen.has(value)) report(file, 'ERROR', `duplicate element id "${value}"`);
        seen.add(value);
    }

    const script = source.slice(source.indexOf('<' + 'script', source.indexOf('</head>')) || 0);
    const referenced = new Set([...script.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
    for (const value of referenced) {
        if (!seen.has(value) && !['toastHost'].includes(value)) {
            report(file, 'ERROR', `script references missing element id "${value}"`);
        }
    }

    for (const dialog of ['alert(', 'prompt(', 'confirm(']) {
        const count = script.split(dialog).length - 1;
        if (count) report(file, 'ERROR', `uses blocking ${dialog.slice(0, -1)}() ${count} time(s)`);
    }

    const declared = [...script.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)].map(m => m[1]);
    const functions = new Set();
    for (const name of declared) {
        if (functions.has(name)) report(file, 'ERROR', `duplicate function declaration "${name}"`);
        functions.add(name);
    }

    for (const match of markup.matchAll(/width\s*:\s*(\d{3,})px/g)) {
        if (Number(match[1]) > 380) report(file, 'WARN', `fixed width ${match[1]}px may overflow a 360px viewport`);
    }
}

console.log(`\nUI audit complete: ${problems} error(s) across ${FILES.length} page(s).`);
process.exit(problems ? 1 : 0);
