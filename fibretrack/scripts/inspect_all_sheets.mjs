import fs from 'fs';
import JSZip from 'jszip';

async function run() {
  const buf = fs.readFileSync('api/GS BTP 121026.xlsx');
  const zip = await JSZip.loadAsync(buf);

  let sharedStrings = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const sstXml = await zip.file('xl/sharedStrings.xml').async('string');
    const siMatches = [...sstXml.matchAll(/<si>(.*?)<\/si>/gs)];
    sharedStrings = siMatches.map(m => {
      const tMatches = [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)];
      return tMatches.map(t => t[1]).join('');
    });
  }

  for (let s = 1; s <= 5; s++) {
    const f = zip.file(`xl/worksheets/sheet${s}.xml`);
    if (!f) continue;
    const xml = await f.async('string');
    console.log(`\n================ SHEET ${s} ================`);
    for (let r = 1; r <= 10; r++) {
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

run().catch(console.error);
