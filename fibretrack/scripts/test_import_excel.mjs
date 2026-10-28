import fs from 'node:fs';

async function testFile(filename, mode = 'set') {
  console.log(`\n--- Testing ${filename} (mode: ${mode}) ---`);
  const buf = fs.readFileSync(filename);
  const base64 = buf.toString('base64');

  const res = await fetch('https://fibretrack.mantota.com/api/index.php?action=stock_import_excel&code=9999', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Code': '9999',
    },
    body: JSON.stringify({
      file_base64: base64,
      mode: mode,
    }),
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  try {
    const json = JSON.parse(text);
    console.log('Response JSON:', json);
  } catch {
    console.log('Response text:', text);
  }
}

async function run() {
  await testFile('api/GS_BTP_12-10-2026.xlsx', 'set');
}

run().catch(console.error);
