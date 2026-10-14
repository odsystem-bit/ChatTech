import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dexPath = path.join(__dirname, 'apk_extracted', 'classes.dex');

const buf = fs.readFileSync(dexPath);

// Parser simple pour extraire les strings du header DEX
// Dex format:
// string_ids_size at 0x38 (uint)
// string_ids_off at 0x3C (uint)
const stringIdsSize = buf.readUInt32LE(0x38);
const stringIdsOff = buf.readUInt32LE(0x3C);

console.log(`DEX strings count: ${stringIdsSize}`);
const strings = [];
for (let i = 0; i < stringIdsSize; i++) {
  const strDataOff = buf.readUInt32LE(stringIdsOff + i * 4);
  // LEB128 length followed by MUTF-8 string terminated by null
  let pos = strDataOff;
  // skip uleb128
  while ((buf[pos] & 0x80) !== 0) pos++;
  pos++;
  // read null-terminated string
  let end = pos;
  while (buf[end] !== 0) end++;
  strings.push(buf.toString('utf8', pos, end));
}

const fibreStrings = strings.filter(s => 
  s.includes('action') || 
  s.includes('interventions') || 
  s.includes('intervention_') || 
  s.includes('fibretrack') ||
  s.includes('local') ||
  s.includes('offline') ||
  s.includes('draft') ||
  s.includes('cache') ||
  s.includes('sqlite') ||
  s.includes('Room') ||
  s.includes('preferences') ||
  s.includes('save')
);

console.log('--- FibreTrack Strings in DEX (sample of interesting ones) ---');
console.log(fibreStrings.filter(s => s.length > 3 && s.length < 100));

fs.writeFileSync(path.join(__dirname, 'apk_strings.json'), JSON.stringify(strings, null, 2));
console.log('All strings dumped to scripts/apk_strings.json');
