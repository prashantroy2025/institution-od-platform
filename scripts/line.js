// Development helper: prints an exact line range of a file as JSON so it can be reused
// in an edit without manual transcription. Usage: node scripts/line.js <file> <start> <end>
const fs = require('fs');
const [file, start, end] = process.argv.slice(2);
const lines = fs.readFileSync(file, 'utf8').split('\n');
const from = Number(start);
const to = Number(end || start);
const slice = lines.slice(from - 1, to);
if (slice.length === 0) { console.error('empty range'); process.exit(1); }
console.log(JSON.stringify(slice.join('\n')));
