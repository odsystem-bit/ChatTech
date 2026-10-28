import fs from 'fs';
import JSZip from 'jszip';

async function inspectSheet(filename) {
  const data = fs.readFileSync(filename);
  const zip = await JSZip.loadAsync(data);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('text') || '';
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('text') || '';

  // Extract shared strings
  const strings = [];
  const strMatches = sharedXml.matchAll(/<t[^>]*>(.*?)<\/t>/gs);
  for (const m of strMatches) {
    strings.push(m[1]);
  }

  // Extract rows
  const rowMatches = sheetXml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  for (const rMatch of rowMatches) {
    const rowNum = parseInt(rMatch[1]);
    if (rowNum <= 15 || rowNum >= 45) { // inspect headers, first rows, and total rows
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

inspectSheet('api/GS BTP 121026.xlsx');
