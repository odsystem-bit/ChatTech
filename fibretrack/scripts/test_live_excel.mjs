import fs from 'node:fs';

async function testExport() {
  const url = 'https://fibretrack.mantota.com/api/excel_hebdo.php?action=export_hebdo&code=9999&week_start=2026-10-12';
  console.log('Fetching:', url);
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
  const buf = await resp.arrayBuffer();
  const filePath = 'scripts/test_live_gs_btp.xlsx';
  fs.writeFileSync(filePath, Buffer.from(buf));
  console.log(`Saved ${buf.byteLength} bytes to ${filePath}`);
}

testExport().catch(console.error);
