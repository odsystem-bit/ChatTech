import fs from 'fs';
import JSZip from 'jszip';

async function test() {
  const url = 'https://fibretrack.mantota.com/api/excel_hebdo.php?action=export_hebdo&code=9999&week_start=2026-10-26';
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  let strings = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const sstXml = await zip.file('xl/sharedStrings.xml').async('string');
    strings = [...sstXml.matchAll(/<si>(.*?)<\/si>/gs)].map(m => {
      return [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(t => t[1]).join('');
    });
  }
  const f = zip.file('xl/worksheets/sheet1.xml');
  const xml = await f.async('string');

  const rowMatches = xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  for (const rMatch of rowMatches) {
    const rowNum = parseInt(rMatch[1]);
    if ([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 52].includes(rowNum)) {
      const rowContent = rMatch[2];
      const cellMatches = rowContent.matchAll(/<c r="([A-Z]+)\d+"(?: t="([^"]*)")?[^>]*>(?:<f[^>]*>(.*?)<\/f>)?(?:<v>(.*?)<\/v>)?<\/c>/gs);
      const cells = {};
      for (const c of cellMatches) {
        const col = c[1];
        const type = c[2];
        const formula = c[3];
        const val = c[4];
        let displayVal = val;
        if (type === 's' && val !== undefined) {
          displayVal = strings[parseInt(val)];
        }
        cells[col] = formula ? `[=${formula}] ${displayVal ?? ''}` : displayVal;
      }
      console.log(`Row ${rowNum}:`, cells);
    }
  }
}

test().catch(console.error);
