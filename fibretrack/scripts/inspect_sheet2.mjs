import fs from 'fs';
import JSZip from 'jszip';

async function pSheet2() {
  const zip = await JSZip.loadAsync(fs.readFileSync('api/GS BTP 121026.xlsx'));
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('text') || '';
  const strings = [...sharedXml.matchAll(/<si>(.*?)<\/si>/gs)].map(m => [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(x => x[1]).join(''));
  const sheetXml = await zip.file('xl/worksheets/sheet2.xml')?.async('text') || '';
  const rowMatches = sheetXml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  for (const r of rowMatches) {
    const rowNum = parseInt(r[1]);
    const cellMatches = r[2].matchAll(/<c\b([^>]*)>(?:<f[^>]*>(.*?)<\/f>)?(?:<v>(.*?)<\/v>)?<\/c>/gs);
    const cells = {};
    for (const c of cellMatches) {
      const col = c[1].match(/r="([A-Z]+)\d+"/)?.[1];
      const isString = c[1].includes('t="s"');
      const v = c[3];
      let val = v;
      if (isString && v !== undefined) val = strings[parseInt(v)];
      cells[col] = val;
    }
    console.log('Sheet2 Row ' + rowNum + ':', cells);
  }
}
pSheet2();
