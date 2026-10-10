// Development helper: index-based text replacement in a file.
// Usage: node scripts/replaceRange.js <file> <startMarker> <endMarker> <newTextFile>
// Replaces the span from startMarker up to (not including) endMarker.
const fs = require('fs');
const [file, startMarker, endMarker, newTextFile] = process.argv.slice(2);
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf(startMarker);
if (start < 0) { console.error(`start marker not found: ${JSON.stringify(startMarker)}`); process.exit(1); }
const end = source.indexOf(endMarker, start + startMarker.length);
if (end < 0) { console.error(`end marker not found after start: ${JSON.stringify(endMarker)}`); process.exit(1); }
const replacement = fs.readFileSync(newTextFile, 'utf8').replace(/\n$/, '');
const occurrences = source.split(startMarker).length - 1;
if (occurrences !== 1) { console.error(`start marker is ambiguous (${occurrences} occurrences); refine the marker`); process.exit(1); }
fs.writeFileSync(file, source.slice(0, start) + replacement + source.slice(end));
console.log(`replaced ${end - start} chars with ${replacement.length} chars in ${file}`);
