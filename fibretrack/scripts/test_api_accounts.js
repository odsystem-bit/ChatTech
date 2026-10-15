const API_URL = "https://fibretrack.mantota.com/api/index.php";

async function testApi(name, code) {
  console.log(`\n=== TEST API POUR ${name} (Code: ${code}) ===`);
  try {
    const res = await fetch(`${API_URL}?action=interventions_list_light&_t=${Date.now()}`, {
      headers: { "X-User-Code": String(code) }
    });
    console.log(`Status HTTP: ${res.status}`);
    const data = await res.json();
    if (!res.ok) {
      console.error(`Erreur:`, data);
      return;
    }
    console.log(`Nb interventions reçues: ${data.length}`);
    const enCours = data.filter(i => i.statut !== 'termine');
    console.log(`Nb en cours: ${enCours.length}`);
    for (const ec of enCours) {
      console.log(`  - [${ec.id.slice(0, 8)}] Tech: ${ec.nom_technicien || '(vide)'} | Client: ${ec.nom_client || '(vide)'} | Statut: ${ec.statut} | Date: ${ec.date}`);
    }
  } catch (err) {
    console.error(`Exception pour ${name}:`, err.message);
  }
}

async function run() {
  await testApi("ADMIN", "9999");
  await testApi("Rodolpho", "4040");
  await testApi("NOUEMOU STANISLAS", "1010");
  await testApi("STEEVE GONTRAN", "6060");
  await testApi("SANS CODE (Anonyme)", "");
}

run();
