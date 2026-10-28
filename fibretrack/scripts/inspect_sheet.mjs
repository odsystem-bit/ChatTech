import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const filePath = process.argv[2] || 'api/GS BTP 121026.xlsx';
  console.log('Inspecting:', filePath);
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  
  // Workbook sheets
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  console.log('--- WORKBOOK SHEETS ---');
  const sheetMatches = wbXml.match(/<sheet [^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"/g);
  console.log(sheetMatches);

  // Shared strings
  let sharedStrings = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const sstXml = await zip.file('xl/sharedStrings.xml').async('string');
    const siMatches = [...sstXml.matchAll(/<si>(.*?)<\/si>/gs)];
    sharedStrings = siMatches.map(m => {
      const tMatches = [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)];
      return tMatches.map(t => t[1]).join('');
    });
  }

  // Inspect sheet1.xml (POINT GENERAL)
  const sheet1Xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  console.log('--- SHEET 1 ROWS ---');
  for (const r of [1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 51, 52, 53]) {
    const rowRegex = new RegExp(`<row[^>]*r="${r}"[^>]*>(.*?)</row>`, 's');
    const m = sheet1Xml.match(rowRegex);
    if (m) {
      console.log(`\n=== ROW ${r} ===`);
      const cells = [...m[1].matchAll(/<c r="([A-Z0-9]+)"([^>]*)>(.*?)<\/c>/gs)];
      for (const c of cells) {
        console.log(`Cell ${c[1]}: ${c[0]}`);
      }
    } else {
      console.log(`Row ${r}: (not found)`);
    }
  }

  // Inspect sheet2.xml (MATERIELS RECEPTIONNES)
  if (zip.file('xl/worksheets/sheet2.xml')) {
    console.log('--- SHEET 2 (MATERIELS RECEPTIONNES) ---');
    const sheet2Xml = await zip.file('xl/worksheets/sheet2.xml').async('string');
    for (let r = 1; r <= 30; r++) {
      const rowRegex = new RegExp(`<row[^>]*r="${r}"[^>]*>(.*?)</row>`, 's');
      const m = sheet2Xml.match(rowRegex);
      if (m) {
        const cells = [...m[1].matchAll(/<c r="([A-Z0-9]+)"([^>]*)>(.*?)<\/c>/gs)];
        const rowContent = cells.map(c => {
          const ref = c[1];
          const isString = c[2].includes('t="s"');
          const fMatch = c[3].match(/<f[^>]*>(.*?)<\/f>/);
          const vMatch = c[3].match(/<v>(.*?)<\/v>/);
          const formula = fMatch ? `[f: =${fMatch[1]}]` : '';
          let val = vMatch ? vMatch[1] : '';
          if (isString && sharedStrings[parseInt(val, 10)] !== undefined) {
            val = `"${sharedStrings[parseInt(val, 10)]}"`;
          }
          return `${ref}=${val}${formula}`;
        }).join(', ');
        if (rowContent) console.log(`Row ${r}: ${rowContent}`);
      }
    }
  }
}

run().catch(console.error);
