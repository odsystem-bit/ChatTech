const API_URL = "https://fibretrack.mantota.com/api/index.php";

async function apiRequest(action, code, body = null) {
  const url = `${API_URL}?action=${action}&user_code=${encodeURIComponent(code)}&_t=${Date.now()}`;
  const opts = {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-User-Code": String(code)
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function run() {
  console.log("=================================================");
  console.log("TEST AUTOMATISÉ DE SYNCHRONISATION BIDIRECTIONNELLE");
  console.log("=================================================\n");

  const adminCode = "9999";
  const techCode1 = "4040"; // Rodolpho
  const techCode2 = "1010"; // NOUEMOU STANISLAS

  // TEST 1: ADMIN crée une intervention -> Est-elle visible par TOUS les techniciens ?
  console.log("▶ TEST 1 : L'Administrateur crée une intervention");
  const testIdAdmin = "test-sync-admin-" + Date.now();
  const adminIntervention = {
    id: testIdAdmin,
    date: new Date().toISOString(),
    statut: "en_cours",
    nom_technicien: "ADMIN",
    nom_client: "CLIENT TEST ADMIN",
    adresse_zone: "Zone Test Cotonou",
    offre_souscrite: "Fibre Pro",
    modifie_par: "ADMIN",
    modifie_le: new Date().toISOString()
  };

  const saveResAdmin = await apiRequest("intervention_save", adminCode, adminIntervention);
  console.log("  ✓ Intervention créée par ADMIN enregistrée avec succès (updated_at:", saveResAdmin.updated_at, ")");

  // Vérification de la visibilité chez Rodolpho (tech 1)
  const listRodolpho = await apiRequest("interventions_list_light", techCode1);
  const foundRodolpho = listRodolpho.find(i => i.id === testIdAdmin);
  if (!foundRodolpho) throw new Error("ÉCHEC : L'intervention ADMIN n'est pas visible par Rodolpho !");
  console.log("  ✓ VALIDÉ : Rodolpho (4040) voit l'intervention créée par l'Admin ! (Client:", foundRodolpho.nom_client, ")");

  // Vérification de la visibilité chez Stanislas (tech 2)
  const listStanislas = await apiRequest("interventions_list_light", techCode2);
  const foundStanislas = listStanislas.find(i => i.id === testIdAdmin);
  if (!foundStanislas) throw new Error("ÉCHEC : L'intervention ADMIN n'est pas visible par Stanislas !");
  console.log("  ✓ VALIDÉ : Stanislas (1010) voit l'intervention créée par l'Admin ! (Client:", foundStanislas.nom_client, ")");

  // TEST 2: Un technicien crée une intervention -> Est-elle visible par l'Admin et les autres techniciens ?
  console.log("\n▶ TEST 2 : Le technicien (Stanislas) crée une intervention");
  const testIdTech = "test-sync-tech-" + Date.now();
  const techIntervention = {
    id: testIdTech,
    date: new Date().toISOString(),
    statut: "en_cours",
    nom_technicien: "NOUEMOU STANISLAS",
    nom_client: "CLIENT TEST STANISLAS TERRAIN",
    adresse_zone: "Calavi Arconville",
    offre_souscrite: "Pro Max",
    modifie_par: "NOUEMOU STANISLAS",
    modifie_le: new Date().toISOString()
  };

  const saveResTech = await apiRequest("intervention_save", techCode2, techIntervention);
  console.log("  ✓ Intervention créée par Stanislas enregistrée avec succès (updated_at:", saveResTech.updated_at, ")");

  // Vérification de la visibilité chez ADMIN
  const listAdmin = await apiRequest("interventions_list_light", adminCode);
  const foundAdmin = listAdmin.find(i => i.id === testIdTech);
  if (!foundAdmin) throw new Error("ÉCHEC : L'intervention de Stanislas n'est pas visible par l'ADMIN !");
  console.log("  ✓ VALIDÉ : ADMIN (9999) voit l'intervention créée par Stanislas ! (Client:", foundAdmin.nom_client, "| Tech:", foundAdmin.nom_technicien, ")");

  // Vérification de la visibilité chez un autre technicien (Rodolpho)
  const listRodolpho2 = await apiRequest("interventions_list_light", techCode1);
  const foundRodolpho2 = listRodolpho2.find(i => i.id === testIdTech);
  if (!foundRodolpho2) throw new Error("ÉCHEC : L'intervention de Stanislas n'est pas visible par Rodolpho !");
  console.log("  ✓ VALIDÉ : Rodolpho (4040) voit l'intervention créée par Stanislas ! (Client:", foundRodolpho2.nom_client, ")");

  // NETTOYAGE : Suppression propre des deux interventions de test
  console.log("\n▶ NETTOYAGE DES DONNÉES DE TEST");
  await apiRequest("intervention_delete", adminCode, { id: testIdAdmin });
  console.log("  ✓ Intervention test Admin supprimée.");
  await apiRequest("intervention_delete", adminCode, { id: testIdTech });
  console.log("  ✓ Intervention test Tech supprimée.");

  console.log("\n=================================================");
  console.log("RÉSULTAT : 100% SUCCÈS - SYNCHRONISATION PARFAITE");
  console.log("=================================================");
}

run().catch(err => {
  console.error("\n❌ ERREUR LORS DU TEST :", err.message);
  process.exit(1);
});
