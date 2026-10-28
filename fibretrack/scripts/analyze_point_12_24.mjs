import fs from 'node:fs';

const raw = fs.readFileSync('scripts/point_12_24_output.txt', 'utf8');

const sections = raw.split('--- ');
let stockText = '';
let intvText = '';
let movText = '';

for (const sec of sections) {
  if (sec.startsWith('STOCK TABLE')) stockText = sec;
  if (sec.startsWith('INTERVENTIONS')) intvText = sec;
  if (sec.startsWith('STOCK MOVEMENTS')) movText = sec;
}

console.log('=== STOCK TABLE ===');
const stockLines = stockText.split('\n').filter(l => l.trim() && !l.includes('STOCK TABLE') && !l.includes('designation\tquantite'));
const stock = {};
for (const line of stockLines) {
  const [des, qty] = line.split('\t');
  if (des && qty !== undefined) {
    stock[des.trim()] = parseInt(qty.trim(), 10);
    console.log(`  ${des.trim()}: ${qty.trim()}`);
  }
}

// Function to determine CPC key
function determineCpcKey(intv, mat) {
  for (const k of ['cpc_50', 'cpc_100', 'cpc_150', 'cpc_200', 'cpc_250', 'cpc_300', 'cpc_350']) {
    if (mat[k] && parseInt(mat[k], 10) > 0) return k;
  }
  for (const k of ['cpc50', 'cpc100', 'cpc150', 'cpc200', 'cpc250', 'cpc300', 'cpc350']) {
    if (mat[k] && parseInt(mat[k], 10) > 0) return k.replace('cpc', 'cpc_');
  }
  let linear = 0;
  if (intv.lineaire_m && !isNaN(parseFloat(intv.lineaire_m)) && parseFloat(intv.lineaire_m) > 0) {
    linear = parseFloat(intv.lineaire_m);
  }
  if (linear <= 0 && intv.arrivee_m && intv.depart_m && !isNaN(parseFloat(intv.arrivee_m)) && !isNaN(parseFloat(intv.depart_m))) {
    linear = Math.abs(parseFloat(intv.arrivee_m) - parseFloat(intv.depart_m));
  }
  if (linear <= 0 && intv.arrivee_m && !isNaN(parseFloat(intv.arrivee_m)) && parseFloat(intv.arrivee_m) > 0) {
    linear = parseFloat(intv.arrivee_m);
  }
  if (linear <= 0 && intv.depart_m && !isNaN(parseFloat(intv.depart_m)) && parseFloat(intv.depart_m) > 0) {
    linear = parseFloat(intv.depart_m);
  }
  if (linear <= 0 && intv.type_cable) {
    const m = intv.type_cable.match(/(\d+)/);
    if (m) linear = parseFloat(m[1]);
  }
  if (linear <= 0 && mat.lineaire && !isNaN(parseFloat(mat.lineaire))) {
    linear = parseFloat(mat.lineaire);
  }
  if (linear <= 0 && mat.lineaire_m && !isNaN(parseFloat(mat.lineaire_m))) {
    linear = parseFloat(mat.lineaire_m);
  }

  if (linear <= 0) return null;
  if (linear <= 50) return 'cpc_50';
  if (linear <= 100) return 'cpc_100';
  if (linear <= 150) return 'cpc_150';
  if (linear <= 200) return 'cpc_200';
  if (linear <= 250) return 'cpc_250';
  if (linear <= 300) return 'cpc_300';
  return 'cpc_350';
}

console.log('\n=== PARSING INTERVENTIONS ===');
const intvLines = intvText.split('\n').filter(l => l.trim() && !l.includes('INTERVENTIONS') && !l.includes('id\tdate\tstatut'));

const completed = [];
const nonTraite = [];
const otherStatut = [];

const matKeys = [
  'ont', 'pto', 'jarretiere', 'piton', 'cheville', 'connecteur', 'closer', 'fibre_1fo',
  'cpc_50', 'cpc_100', 'cpc_150', 'cpc_200', 'cpc_250', 'cpc_300', 'cpc_350',
  'crochets', 'pince', 'susp', 'traverse_13t', 'traverse_15t'
];

const totalUsed = Object.fromEntries(matKeys.map(k => [k, 0]));

for (const line of intvLines) {
  const parts = line.split('\t');
  if (parts.length < 11) continue;
  const [id, date, statut, motif, client, tel, typeCable, dep, arr, lin, matJson, matDeduit] = parts;
  
  const isNonTraite = ['non_traite', 'non_traitee', 'annule', 'annulee', 'inacheve', 'inachevee'].includes((statut || '').toLowerCase())
    || (motif && motif.trim() && statut !== 'termine');
  const isTermine = !isNonTraite && (statut === 'termine');

  let mat = {};
  try {
    mat = JSON.parse(matJson || '{}');
  } catch (e) {}

  const item = {
    id, date, statut, motif, client, tel, typeCable,
    depart_m: dep, arrivee_m: arr, lineaire_m: lin,
    materiel_pose: mat,
    materiel_deduit: matDeduit
  };

  if (isTermine) {
    completed.push(item);

    // Apply Cheville = Piton rule
    const piton = parseInt(mat.piton || 0, 10);
    let cheville = parseInt(mat.cheville || 0, 10);
    if (cheville <= 0 && piton > 0) {
      cheville = piton;
      mat.cheville = cheville;
    }

    // Apply CPC rule
    const cpc = determineCpcKey(item, mat);
    for (const ck of ['cpc_50', 'cpc_100', 'cpc_150', 'cpc_200', 'cpc_250', 'cpc_300', 'cpc_350']) {
      delete mat[ck];
    }
    if (cpc) {
      mat[cpc] = 1;
    }

    item.resolvedMat = mat;

    for (const k of matKeys) {
      totalUsed[k] += parseInt(mat[k] || 0, 10);
    }
  } else if (isNonTraite) {
    nonTraite.push(item);
  } else {
    otherStatut.push(item);
  }
}

console.log(`Total Completed: ${completed.length}`);
console.log(`Total Non Traite: ${nonTraite.length}`);
console.log(`Total Other: ${otherStatut.length}`);

console.log('\n=== TOTAL MATERIALS USED (12 to 24 OCT 2026) ===');
for (const k of matKeys) {
  if (totalUsed[k] > 0) {
    console.log(`  ${k.toUpperCase().padEnd(15)}: ${totalUsed[k]}`);
  } else {
    console.log(`  ${k.toUpperCase().padEnd(15)}: 0`);
  }
}

console.log('\n=== DETAIL DES INTERVENTIONS TERMINEES (12 au 24 OCT) ===');
completed.forEach((c, i) => {
  const mats = Object.entries(c.resolvedMat).filter(([k, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', ');
  console.log(`${(i+1).toString().padStart(2)}. ${c.date.substring(0, 10)} | ${c.client.padEnd(30)} | Ligne: ${c.lineaire_m || c.typeCable || '-'}m | Deduit: ${c.materiel_deduit} | [${mats}]`);
});

if (nonTraite.length > 0) {
  console.log('\n=== INTERVENTIONS NON TRAITEES (12 au 24 OCT) ===');
  nonTraite.forEach((c, i) => {
    console.log(`${i+1}. ${c.date.substring(0, 10)} | ${c.client} | Statut: ${c.statut} | Motif: ${c.motif || '-'} | Deduit: ${c.materiel_deduit}`);
  });
}
