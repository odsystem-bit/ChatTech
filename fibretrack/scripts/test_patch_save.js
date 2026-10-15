import { fetch } from 'undici';

async function testSave() {
  const code = '9999'; // admin code
  const url = 'https://fibretrack.mantota.com/api/index.php?action=intervention_save&user_code=' + code;

  const payload = {
    action: 'intervention_save',
    id: '8a80e337-0db9-4188-a393-09410dce374b',
    nom_client: 'EOULO OGOUDARE NICOLE',
    nom_dossier: 'DOSSIER NICOLE TEST',
    telephone_ligne: '0121293029',
    mobile: '0197337800',
    changed_fields: ['nom_client', 'nom_dossier', 'telephone_ligne', 'mobile', 'modifie_par', 'modifie_le'],
    modifie_par: 'Admin',
    modifie_le: new Date().toISOString(),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Code': code,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log('STATUS:', res.status);
  console.log('RESPONSE:', text);
}

testSave();
