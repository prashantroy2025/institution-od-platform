// Development helper: prints an exact line of a file as a JSON string so it can be
// pasted into an edit without transcription errors. Usage: node scripts/line.js <file> <n>
const fs = require('fs');
const [file, number] = process.argv.slice(2);
const lines = fs.readFileSync(file, 'utf8').split('\n');
const line = lines[Number(number) - 1];
if (line === undefined) { console.error('line out of range'); process.exit(1); }
console.log(JSON.stringify(line));

