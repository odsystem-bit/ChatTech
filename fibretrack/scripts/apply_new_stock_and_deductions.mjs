import fs from 'node:fs';
import { Client } from 'ssh2';

// Stock initial au 26/10/2026
const stockInitial = {
  ont: 6, pto: 6, jarretiere: 5, piton: 5, cheville: 5,
  connecteur: 5, closer: 7, fibre_1fo: 1000,
  cpc_50: 7, cpc_100: 11, cpc_150: 3, cpc_200: 3, cpc_250: 3, cpc_300: 3, cpc_350: 1,
  crochets: 49, pince: 0, susp: 0, traverse_13t: 1, traverse_15t: 4
};

// Réception du 26/10/2026
const stockRecu = {
  ont: 40, pto: 40, jarretiere: 40, piton: 40, cheville: 40,
  connecteur: 0, closer: 0, fibre_1fo: 0,
  cpc_50: 0, cpc_100: 8, cpc_150: 12, cpc_200: 8, cpc_250: 3, cpc_300: 2, cpc_350: 3,
  crochets: 300, pince: 0, susp: 0, traverse_13t: 0, traverse_15t: 6
};

// Les 5 dossiers terminés du 26/10 au 27/10
const dossiers = [
  {
    id: '2b1b29bd-beed-4763-b5b5-dc98063f6d16',
    date: '2026-10-26 08:56:28',
    client: 'SAIZONOU Finagnon Gérard',
    tech: 'BTP',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, closer: 1, cpc_150: 1, crochets: 6 }
  },
  {
    id: 'c0621fc2-d565-4185-8dfd-c2b26adbe923',
    date: '2026-10-26 08:56:28',
    client: 'HOUESSINOU ABIRE BALARIBA',
    tech: 'BTP',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, cpc_150: 1, crochets: 8 }
  },
  {
    id: '1c228c2b-5870-494f-9701-9e1b16ac2bc8',
    date: '2026-10-27 06:44:44',
    client: 'AREMOU CLEMENT',
    tech: 'BTP',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, cpc_350: 1, crochets: 12 }
  },
  {
    id: '276f7134-7244-4b65-a095-37650dd79e6a',
    date: '2026-10-27 06:44:44',
    client: 'Adam Djibril Razack',
    tech: 'BTP',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, cpc_100: 1, crochets: 4 }
  },
  {
    id: '7b80b955-951b-4ae3-bde0-71c34b6ac2ba',
    date: '2026-10-27 11:02:28',
    client: 'MAHADI ALHALIB',
    tech: 'BTP',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, cpc_200: 1, crochets: 8 }
  }
];

// Calcul du stock final
const finalStock = {};
for (const [art, qInit] of Object.entries(stockInitial)) {
  const qRecu = stockRecu[art] || 0;
  finalStock[art] = qInit + qRecu;
}
for (const d of dossiers) {
  for (const [art, q] of Object.entries(d.conso)) {
    finalStock[art] = (finalStock[art] || 0) - q;
  }
}

console.log('Stock final calculé :', finalStock);

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to SSH, executing stock reset and deductions...');

  let sql = `
    -- 1. Réinitialiser la table stock à 0
    UPDATE stock SET quantite = 0;

    -- 2. Clôturer l'ancien historique en marquant le nouveau cycle
    INSERT INTO stock_movements (date_mouvement, type, designation, quantite, motif, nom_technicien)
    VALUES (NOW(), 'ajustement', 'ont', 0, '=== OUVERTURE NOUVEAU STOCK SEMAINE 26/10/2026 ===', 'ADMIN');

    -- 3. Enregistrer les stocks initiaux et réceptions
  `;

  for (const [art, q] of Object.entries(stockInitial)) {
    if (q > 0) {
      sql += `INSERT INTO stock_movements (date_mouvement, type, designation, quantite, motif, nom_technicien)
        VALUES ('2026-10-26 08:00:00', 'entree', '${art}', ${q}, 'Stock Initial au 26/10/2026', 'ADMIN');\n`;
    }
  }

  for (const [art, q] of Object.entries(stockRecu)) {
    if (q > 0) {
      sql += `INSERT INTO stock_movements (date_mouvement, type, designation, quantite, motif, nom_technicien)
        VALUES ('2026-10-26 08:30:00', 'entree', '${art}', ${q}, 'Réception bon de livraison 26/10/2026', 'ADMIN');\n`;
    }
  }

  // 4. Déductions pour les 5 dossiers
  for (const d of dossiers) {
    for (const [art, q] of Object.entries(d.conso)) {
      sql += `INSERT INTO stock_movements (date_mouvement, type, designation, quantite, intervention_id, nom_client, nom_technicien, motif)
        VALUES ('${d.date}', 'sortie', '${art}', ${q}, '${d.id}', '${d.client.replace(/'/g, "''")}', '${d.tech}', 'Pose matériel intervention');\n`;
    }
    // Mettre à jour materiel_pose complet et materiel_deduit = 1
    const matJson = JSON.stringify(d.conso);
    sql += `UPDATE interventions SET materiel_pose = '${matJson}', materiel_deduit = 1 WHERE id = '${d.id}';\n`;
  }

  // 5. Mettre à jour les soldes finaux exacts dans la table stock
  for (const [art, q] of Object.entries(finalStock)) {
    sql += `INSERT INTO stock (designation, quantite) VALUES ('${art}', ${q}) ON DUPLICATE KEY UPDATE quantite = ${q};\n`;
  }

  // 6. Supprimer tout article parasite hors des 20 articles officiels
  const canevasKeys = Object.keys(stockInitial);
  sql += `DELETE FROM stock WHERE designation NOT IN ('${canevasKeys.join("','")}');\n`;

  // 7. Afficher le résultat final du stock
  sql += `SELECT designation, quantite FROM stock ORDER BY designation;\n`;

  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "${sql}"`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', () => {
      console.log('Result of final stock query:\n' + out);
      conn.end();
    });
    stream.on('data', d => { out += d; });
    stream.stderr.on('data', d => process.stderr.write(d));
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:\\Users\\Davyh\\.ssh\\id_ed25519')
});
