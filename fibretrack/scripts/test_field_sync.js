import { fetch } from 'undici';

const API_URL = 'https://fibretrack.mantota.com/api/index.php';

async function testFieldSync() {
  console.log('--- TEST SYNCHRONISATION DES CHAMPS EN TEMPS RÉEL ---');
  const testId = 'test-sync-fields-' + Date.now();

  // 1. L'Administrateur crée une intervention avec des valeurs initiales
  const createRes = await fetch(`${API_URL}?action=intervention_save&user_code=9999`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Code': '9999' },
    body: JSON.stringify({
      id: testId,
      nom_client: 'CLIENT INITIAL',
      nom_dossier: 'DOSSIER INITIAL',
      telephone_ligne: '0121000000',
      mobile: '0197000000',
      adresse_zone: 'Zone Initiale',
      nom_technicien: 'Rodolpho',
      statut: 'en_cours',
      date: new Date().toISOString().slice(0, 19).replace('T', ' '),
    }),
  });
  const created = await createRes.json();
  console.log('1. Création initiale réussie:', created.ok, 'updated_at:', created.updated_at);

  // 2. L'Administrateur (ou un agent) tape et modifie nom_dossier, nom_client, telephone_ligne et mobile
  const patchRes = await fetch(`${API_URL}?action=intervention_save&user_code=9999`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Code': '9999' },
    body: JSON.stringify({
      id: testId,
      nom_client: 'NOUVEAU CLIENT SAISI',
      nom_dossier: 'NOUVEAU DOSSIER SAISI',
      telephone_ligne: '0121293029',
      mobile: '0197337800',
      changed_fields: ['nom_client', 'nom_dossier', 'telephone_ligne', 'mobile', 'modifie_par', 'modifie_le'],
      modifie_par: 'Admin',
      modifie_le: new Date().toISOString(),
    }),
  });
  const patched = await patchRes.json();
  console.log('2. Modification champs (auto-save patch):', patched.ok, 'updated_at:', patched.updated_at);

  // 3. Rodolpho (4040) appelle intervention_updated_at
  const updatedRes = await fetch(`${API_URL}?action=intervention_updated_at&user_code=4040`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Code': '4040' },
    body: JSON.stringify({ id: testId }),
  });
  const updatedData = await updatedRes.json();
  console.log('3. Rodolpho vérifie timestamp distant:', updatedData.updated_at);

  // 4. Rodolpho (4040) lit l'intervention via intervention_get_light
  const getLightRes = await fetch(`${API_URL}?action=intervention_get_light&user_code=4040`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Code': '4040' },
    body: JSON.stringify({ id: testId }),
  });
  const lightData = await getLightRes.json();
  console.log('4. Rodolpho reçoit les champs légers:');
  console.log('   - nom_client:', lightData.nom_client);
  console.log('   - nom_dossier:', lightData.nom_dossier);
  console.log('   - telephone_ligne:', lightData.telephone_ligne);
  console.log('   - mobile:', lightData.mobile);

  if (
    lightData.nom_client === 'NOUVEAU CLIENT SAISI' &&
    lightData.nom_dossier === 'NOUVEAU DOSSIER SAISI' &&
    lightData.telephone_ligne === '0121293029' &&
    lightData.mobile === '0197337800'
  ) {
    console.log('✓ VALIDÉ : Les modifications de champs sont 100% synchronisées vers les autres techniciens !');
  } else {
    console.error('❌ ÉCHEC : Incohérence des champs reçus.');
    process.exit(1);
  }

  // 5. Stanislas (1010) liste les interventions et vérifie la liste accueil
  const listRes = await fetch(`${API_URL}?action=interventions_list_light&user_code=1010&_t=${Date.now()}`);
  const listData = await listRes.json();
  const foundInList = listData.find((item) => item.id === testId);
  console.log('5. Stanislas voit dans la liste accueil:');
  console.log('   - nom_client:', foundInList?.nom_client);
  console.log('   - nom_dossier:', foundInList?.nom_dossier);

  if (foundInList && foundInList.nom_dossier === 'NOUVEAU DOSSIER SAISI') {
    console.log('✓ VALIDÉ : La liste d\'accueil des autres techniciens affiche immédiatement le nouveau nom de dossier !');
  } else {
    console.error('❌ ÉCHEC : Non trouvé dans la liste accueil.');
    process.exit(1);
  }

  // 6. Nettoyage
  await fetch(`${API_URL}?action=intervention_delete&user_code=9999`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Code': '9999' },
    body: JSON.stringify({ id: testId }),
  });
  console.log('✓ Nettoyage terminé.');
}

testFieldSync().catch(console.error);
