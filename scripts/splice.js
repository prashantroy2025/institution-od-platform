// Development helper: replaces a line range [from, to) of a text file with a payload file.
// Usage: node scripts/splice.js <target-file> <payload-file> <fromLine> <toLine>
// Splice by line number so large original blocks never have to be retyped.
const fs = require('fs');
const [target, payloadFile, fromLine, toLine] = process.argv.slice(2);
const from = Number(fromLine);
const to = Number(toLine);
if (!fs.existsSync(target) || !fs.existsSync(payloadFile)) { console.error('missing file'); process.exit(1); }
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) { console.error(`bad range ${from}..${to}`); process.exit(1); }
const lines = fs.readFileSync(target, 'utf8').split('\n');
const payload = fs.readFileSync(payloadFile, 'utf8').replace(/\n$/, '');
const next = [...lines.slice(0, from - 1), payload, ...lines.slice(to)];
fs.writeFileSync(target, next.join('\n'));
console.log(`spliced ${target} lines ${from}-${to - 1} (${to - from} line(s)) with ${payloadFile}`);
