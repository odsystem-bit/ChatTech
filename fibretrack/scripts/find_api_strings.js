import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dexPath = path.join(__dirname, 'apk_extracted', 'classes.dex');
const buf = fs.readFileSync(dexPath);

// Look for ApiService string constants
const strings = JSON.parse(fs.readFileSync(path.join(__dirname, 'apk_strings.json')));

// Find strings containing index.php, action=, or intervention
const apiStrings = strings.filter(s => 
  s.includes('action=') || 
  s.startsWith('intervention_') || 
  s.startsWith('stock_') ||
  s.startsWith('account_') ||
  s.includes('expected_updated_at') ||
  s.includes('changed_fields') ||
  s.includes('points_gps') ||
  s.includes('whatsapp_photos')
);

console.log('API Strings in APK:');
console.log(apiStrings);
