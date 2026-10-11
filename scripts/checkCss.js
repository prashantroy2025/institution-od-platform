// Static CSS sanity check: verifies public/home.css parses as flat (non-nested)
// CSS, reports unbalanced braces and stray declaration blocks. Development only.
const fs = require('fs');

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const problems = [];
const rules = [];

let i = 0;
let line = 1;

while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') { line += 1; i += 1; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i += 1; continue; }
    if (ch === '}') { problems.push(`stray '}' at line ${line}`); i += 1; continue; }
    if (ch === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end < 0) { problems.push(`unterminated comment at line ${line}`); break; }
        line += src.slice(i, end).split('\n').length - 1;
        i = end + 2;
        continue;
    }
    if (ch === '/' && src[i + 1] === '/') { const end = src.indexOf('\n', i); i = end < 0 ? src.length : end; continue; }
    if (ch === '{') {
        // The selector is the text since the previous closing brace.
        const sel = src.slice(src.lastIndexOf('}', i) + 1, i).trim();
        const isAtRule = /^@(media|supports|keyframes|-webkit-keyframes|layer|container|scope)/i.test(sel);
        if (!isAtRule) {
            if (sel.indexOf('{') >= 0) problems.push(`selector contains '{' (nesting) at line ${line}: ${sel.slice(-70)}`);
            if (!sel) problems.push(`empty selector at line ${line}`);
            rules.push({ sel, line });
        } else rules.push({ sel, line, atRule: true });
        let depth = 1;
        let j = i + 1;
        while (j < src.length && depth > 0) {
            if (src[j] === '{') {
                depth += 1;
                if (!isAtRule) problems.push(`nested '{' inside rule "${sel.slice(0, 40)}" at line ${line + src.slice(i + 1, j).split('\n').length - 1}`);
            }
            else if (src[j] === '}') depth -= 1;
            if (src[j] === '\n') line += 1;
            if (depth > 0) j += 1;
        }
        i = j + 1;
        continue;
    }
    i += 1;
}

console.log(`${file}: ${rules.length} top-level rules`);
if (problems.length) {
    console.log('PROBLEMS:');
    problems.forEach(p => console.log('  - ' + p));
    process.exit(1);
}
console.log('OK - flat CSS, no nesting or brace problems');
