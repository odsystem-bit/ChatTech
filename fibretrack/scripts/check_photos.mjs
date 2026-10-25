const id = process.argv[2];
const res = await fetch('https://fibretrack.mantota.com/api/index.php?action=intervention_get&user_code=9999', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-User-Code': '9999' },
  body: JSON.stringify({ id }),
});
const j = await res.json();
if (!j.whatsapp_photos) { console.log(JSON.stringify(j).slice(0, 300)); process.exit(1); }
for (const p of j.whatsapp_photos) {
  const r = await fetch(p.url, { method: 'HEAD' });
  console.log(r.status, p.slot, p.url.split('/').pop());
}
