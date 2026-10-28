import fs from 'fs';
import JSZip from 'jszip';

async function printSheet() {
  const zip = await JSZip.loadAsync(fs.readFileSync('api/GS BTP 121026.xlsx'));
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('text') || '';
  const strings = [...sharedXml.matchAll(/<si>(.*?)<\/si>/gs)].map(m => [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(x => x[1]).join(''));
  
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('text') || '';
  const rowMatches = sheetXml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  for (const rMatch of rowMatches) {
    const rowNum = parseInt(rMatch[1]);
    const rowContent = rMatch[2];
    const cellMatches = rowContent.matchAll(/<c\b([^>]*)>(?:<f[^>]*>(.*?)<\/f>)?(?:<v>(.*?)<\/v>)?<\/c>/gs);
    const cells = {};
    for (const c of cellMatches) {
      const attrs = c[1];
      const formula = c[2];
      const val = c[3];
      const col = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
      const isString = attrs.includes('t="s"');
      let displayVal = val;
      if (isString && val !== undefined) {
        displayVal = strings[parseInt(val)];
      }
      cells[col] = formula ? `[=${formula}] ${displayVal ?? ''}` : displayVal;
    }
    if (Object.keys(cells).length > 0) {
      console.log(`Row ${rowNum}:`, cells);
    }
  }
}
printSheet();
