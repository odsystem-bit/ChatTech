import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const jsonPath = path.join(projectRoot, 'backups', 'backup_20261015_085403.json');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('=== AUDIT DES DONNÉES EN BDD ===');
console.log('Nb Interventions:', data.interventions.length);
console.log('Nb Media:', data.intervention_media.length);
console.log('Nb Comptes:', data.accounts.length);

console.log('\n--- Comptes configurés ---');
for (const acc of data.accounts) {
  console.log(`- ID: ${acc.id} | Nom: ${acc.nom} | Code: ${acc.code} | Équipe: ${acc.nom_equipe || 'N/A'}`);
}

console.log('\n--- 10 Dernières Interventions en BDD ---');
const sorted = [...data.interventions].sort((a, b) => (b.modifie_le || b.date || '').localeCompare(a.modifie_le || a.date || ''));
for (const intv of sorted.slice(0, 15)) {
  console.log(`- ID: ${intv.id} | Date: ${intv.date} | Statut: ${intv.statut} | Tech: ${intv.nom_technicien} | Client: ${intv.nom_client} | Modifié par: ${intv.modifie_par} (${intv.modifie_le})`);
}

// Analyser les techniciens présents dans les interventions
const techs = {};
for (const intv of data.interventions) {
  const t = intv.nom_technicien || 'NON_DEFINI';
  techs[t] = (techs[t] || 0) + 1;
}
console.log('\n--- Répartition par Technicien en BDD ---', techs);

// Analyser les statuts
const statuts = {};
for (const intv of data.interventions) {
  const s = intv.statut || 'NON_DEFINI';
  statuts[s] = (statuts[s] || 0) + 1;
}
console.log('\n--- Répartition par Statut en BDD ---', statuts);
