const r = await fetch('https://fibretrack.mantota.com/api/index.php?action=intervention_get&user_code=9999', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-User-Code': '9999' },
  body: JSON.stringify({ id: process.argv[2] }),
});
const j = await r.json();
const filt = process.argv[3] || '';
for (const p of j.whatsapp_photos) {
  if (filt && !String(p.slot).includes(filt) && !String(p.type).includes(filt)) continue;
  console.log(JSON.stringify({ id: p.id, slot: p.slot, type: p.type, label: p.label, h: p.horodatage, by: p.ajoute_par, name: p.name, added: p.added, url: String(p.url).split('/').pop() }));
}
