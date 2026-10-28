import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const buf = fs.readFileSync('api/GS_BTP_12-10-2026.xlsx');
  const zip = await JSZip.loadAsync(buf);
  const sheet1Xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  for (const r of [7, 8, 9, 10]) {
    const m = sheet1Xml.match(new RegExp(`<row[^>]*r="${r}"[^>]*>(.*?)</row>`, 's'));
    if (m) {
      const cellRefs = [...m[1].matchAll(/<c r="([A-Z0-9]+)"/g)].map(x => x[1]);
      console.log(`Row ${r} cell refs:`, cellRefs.join(', '));
    }
  }
}

run().catch(console.error);
