import fs from 'fs';
import JSZip from 'jszip';

async function inspect(filename) {
  console.log(`\n=================== ${filename} ===================`);
  const buf = fs.readFileSync(filename);
  const zip = await JSZip.loadAsync(buf);

  // Read workbook.xml to get sheet names
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  console.log('workbook.xml sheets:');
  const sheets = [...wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"/g)].map(m => ({ name: m[1], id: m[2] }));
  console.log(sheets);

  let sharedStrings = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const sstXml = await zip.file('xl/sharedStrings.xml').async('string');
    const siMatches = [...sstXml.matchAll(/<si>(.*?)<\/si>/gs)];
    sharedStrings = siMatches.map(m => {
      const tMatches = [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)];
      return tMatches.map(t => t[1]).join('');
    });
  }

  // Inspect sheet 1 (or sheet matching Point General)
  const f = zip.file('xl/worksheets/sheet1.xml');
  if (f) {
    const xml = await f.async('string');
    for (let r = 6; r <= 12; r++) {
      const m = xml.match(new RegExp(`<row[^>]*r="${r}"[^>]*>(.*?)</row>`, 's'));
      if (m) {
        const cells = [...m[1].matchAll(/<c r="([A-Z0-9]+)"([^>]*)>(.*?)<\/c>/gs)];
        const content = cells.map(c => {
          const ref = c[1];
          const isString = c[2].includes('t="s"');
          const fMatch = c[3].match(/<f[^>]*>(.*?)<\/f>/);
          const vMatch = c[3].match(/<v>(.*?)<\/v>/);
          const formula = fMatch ? `[=${fMatch[1]}]` : '';
          let val = vMatch ? vMatch[1] : '';
          if (isString && sharedStrings[parseInt(val, 10)] !== undefined) {
            val = `"${sharedStrings[parseInt(val, 10)]}"`;
          }
          return `${ref}=${val}${formula}`;
        }).join(', ');
        if (content) console.log(`Row ${r}: ${content}`);
      }
    }
  }
}

async function run() {
  await inspect('api/GS BTP 121026.xlsx');
  await inspect('api/GS_BTP_12-10-2026.xlsx');
}

run().catch(console.error);
