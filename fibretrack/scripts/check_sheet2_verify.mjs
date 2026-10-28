import JSZip from 'jszip';

async function checkSheet2() {
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
  const f = zip.file('xl/worksheets/sheet2.xml');
  const xml = await f.async('string');

  const rowMatches = xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  for (const rMatch of rowMatches) {
    const rowNum = parseInt(rMatch[1]);
    if (rowNum >= 1 && rowNum <= 25) {
      const rowContent = rMatch[2];
      const cellMatches = rowContent.matchAll(/<c r="([A-Z]+)\d+"(?: t="([^"]*)")?[^>]*>(?:<f[^>]*>(.*?)<\/f>)?(?:<v>(.*?)<\/v>)?<\/c>/gs);
      const cells = {};
      for (const c of cellMatches) {
        const col = c[1];
        const type = c[2];
        const val = c[4];
        let displayVal = val;
        if (type === 's' && val !== undefined) {
          displayVal = strings[parseInt(val)];
        }
        cells[col] = displayVal;
      }
      console.log(`Sheet 2 Row ${rowNum}:`, cells);
    }
  }
}

checkSheet2().catch(console.error);
