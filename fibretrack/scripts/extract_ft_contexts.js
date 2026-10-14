import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dexPath = path.join(__dirname, 'apk_extracted', 'classes.dex');
const buf = fs.readFileSync(dexPath);

// Find all occurrences of "com/fibretrack/app" in dex
const matches = [];
let idx = 0;
while ((idx = buf.indexOf('com/fibretrack/app', idx)) !== -1) {
  // read context around idx
  const start = Math.max(0, idx - 100);
  const end = Math.min(buf.length, idx + 200);
  const chunk = buf.slice(start, end).toString('latin1').replace(/[^\x20-\x7E\n]/g, '.');
  matches.push(chunk);
  idx += 18;
}

console.log(`Found ${matches.length} occurrences.`);
fs.writeFileSync(path.join(__dirname, 'apk_ft_contexts.txt'), matches.join('\n---\n'));
console.log('Saved to scripts/apk_ft_contexts.txt');
