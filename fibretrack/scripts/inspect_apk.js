import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apkPath = path.join(__dirname, 'fibretrack.apk');

async function main() {
  const dexFiles = ['classes.dex', 'classes2.dex'].map(f => path.join(__dirname, 'apk_extracted', f)).filter(fs.existsSync);
  console.log('Dex files found:', dexFiles.length);

  for (const dexPath of dexFiles) {
    console.log(`\n--- Inspecting ${path.basename(dexPath)} ---`);
    const buf = fs.readFileSync(dexPath);
    const str = buf.toString('latin1');

    const urls = [...new Set(str.match(/https?:\/\/[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.\/\?=&#]+/g) || [])];
    console.log('URLs:', urls.filter(u => u.includes('fibre') || u.includes('mantota') || u.includes('api') || u.includes('odsysteme') || u.includes('action=')));

    const actions = [...new Set(str.match(/[a-zA-Z0-9_]*action=[a-zA-Z0-9_]+/g) || [])];
    console.log('Actions API:', actions);

    const tables = [...new Set(str.match(/CREATE TABLE\s+[a-zA-Z0-9_]+/gi) || [])];
    console.log('SQLite Tables:', tables);

    const prefs = [...new Set(str.match(/[a-zA-Z0-9_]+_preferences/gi) || [])];
    console.log('SharedPreferences:', prefs);

    const appMatches = [...new Set(str.match(/com\.[a-zA-Z0-9_\.]+/g) || [])];
    console.log('App Packages:', appMatches.filter(p => p.includes('fibre') || p.includes('chap') || p.includes('od')));
  }
}

main().catch(console.error);
