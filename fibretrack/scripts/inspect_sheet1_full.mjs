import fs from 'fs';
import JSZip from 'jszip';

async function inspectStrings() {
  const data = fs.readFileSync('api/GS BTP 121026.xlsx');
  const zip = await JSZip.loadAsync(data);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('text') || '';
  const strings = [];
  const strMatches = sharedXml.matchAll(/<si>(.*?)<\/si>/gs);
  for (const m of strMatches) {
    // concatenate all <t> in <si>
    const tMatches = [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(x => x[1]).join('');
    strings.push(tMatches);
  }

  const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('text') || '';
  const rowMatches = sheetXml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  for (const rMatch of rowMatches) {
    const rowNum = parseInt(rMatch[1]);
    if (rowNum <= 12 || rowNum >= 51) {
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

inspectStrings();
