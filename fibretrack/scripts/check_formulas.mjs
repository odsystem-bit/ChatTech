import fs from 'fs';
import JSZip from 'jszip';

async function checkRows() {
  const zip = await JSZip.loadAsync(fs.readFileSync('api/GS BTP 121026.xlsx'));
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('text') || '';
  const rowMatches = sheetXml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  
  for (const rMatch of rowMatches) {
    const rowNum = parseInt(rMatch[1]);
    if ([7, 8, 9, 52].includes(rowNum)) {
      const rowContent = rMatch[2];
      const cellMatches = rowContent.matchAll(/<c\b([^>]*)>(?:<f[^>]*>(.*?)<\/f>)?(?:<v>(.*?)<\/v>)?<\/c>/gs);
      const cells = {};
      for (const c of cellMatches) {
        const col = c[1].match(/r="([A-Z]+)\d+"/)?.[1];
        const f = c[2];
        const v = c[3];
        cells[col] = f ? `[=${f}] ${v}` : v;
      }
      console.log(`Row ${rowNum}:`, cells);
    }
  }
}
checkRows();
