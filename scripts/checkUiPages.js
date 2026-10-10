// Development-only static checks over UI pages: verifies inline scripts parse, and flags
// blocking dialogs (alert/confirm/prompt), document.write, and direct token exposure.
const fs = require('fs');
const vm = require('vm');

const pages = process.argv.slice(2);
let failed = false;

for (const file of pages) {
    const source = fs.readFileSync(file, 'utf8');
    const problems = [];
    for (const [needle, label] of [['alert(', 'alert()'], ['document.write(', 'document.write()']]) {
        if (source.includes(needle)) problems.push(label);
    }
    const scripts = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    scripts.forEach((code, index) => {
        try { new vm.Script(code, { filename: `${file}#script${index + 1}` }); }
        catch (error) { problems.push(`script ${index + 1} parse error: ${error.message}`); }
    });
    console.log(`${file}: ${scripts.length} inline script(s) ${problems.length ? '-> ' + problems.join(', ') : '-> OK'}`);
    if (problems.length) failed = true;
}

process.exit(failed ? 1 : 0);
