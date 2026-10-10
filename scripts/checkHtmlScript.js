// Development helper: extracts the inline browser script from an HTML page and
// reports whether it parses. Usage: node scripts/checkHtmlScript.js <file...>
const fs = require('fs');
const vm = require('vm');
let failed = false;
for (const file of process.argv.slice(2)) {
    const html = fs.readFileSync(file, 'utf8');
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    if (!scripts.length) { console.log(`NO_INLINE_SCRIPT ${file}`); continue; }
    scripts.forEach((match, index) => {
        try {
            new vm.Script(match[1], { filename: `${file}#script${index + 1}` });
            console.log(`PASS ${file} script ${index + 1} (${match[1].length} chars)`);
        } catch (error) {
            failed = true;
            console.log(`FAIL ${file} script ${index + 1}: ${error.message}`);
        }
    });
}
process.exit(failed ? 1 : 0);
