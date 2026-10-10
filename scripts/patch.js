// Development helper: applies a literal string replacement inside a file.
// Usage: node scripts/patch.js <file> <startMarker> <endMarker> <newContentFile>
// Replaces the slice [startMarker, endMarker) with the contents of newContentFile.
const fs = require('fs');
const [file, start, end, contentFile] = process.argv.slice(2);
const source = fs.readFileSync(file, 'utf8');
const from = source.indexOf(start);
const to = source.indexOf(end, from + start.length);
if (from < 0 || to < 0) { console.error(`markers not found (from=${from}, to=${to})`); process.exit(1); }
const replacement = fs.readFileSync(contentFile, 'utf8');
fs.writeFileSync(file, source.slice(0, from) + replacement + source.slice(to));
console.log(`patched ${file}: replaced ${to - from} chars with ${replacement.length} chars`);
