import fs from 'node:fs';
import { Client } from 'ssh2';

const standardItems = [
  'ont', 'pto', 'jarretiere', 'piton', 'cheville', 'connecteur',
  'closer', 'fibre_1fo', 'cpc_50', 'cpc_100', 'cpc_150', 'cpc_200',
  'cpc_250', 'cpc_300', 'cpc_350', 'crochets', 'pince', 'susp',
  'traverse_13t', 'traverse_15t', 'poteau_sbee_arme'
];

const conn = new Client();

conn.on('ready', () => {
  console.log('Connected to SSH, executing stock reset...');

  const query = `
    -- 1. Enregistrer le mouvement d'ajustement / remise à zéro pour chaque article non nul
    INSERT INTO stock_movements (date_mouvement, type, designation, quantite, motif, nom_technicien)
    SELECT NOW(), 'ajustement', designation, ABS(quantite), 
           CONCAT('Cloture periode precedente (solde etait: ', quantite, ') - Remise a zero pour nouveau stock'), 
           'ADMIN'
    FROM stock
    WHERE quantite != 0;

    -- 2. Mettre tous les articles existants à zéro
    UPDATE stock SET quantite = 0;

    -- 3. S'assurer que tous les 20 articles du canevas existent avec quantite = 0
    ${standardItems.map(item => `INSERT INTO stock (designation, quantite) VALUES ('${item}', 0) ON DUPLICATE KEY UPDATE quantite = 0;`).join('\n')}

    -- 4. Afficher le résultat
    SELECT designation, quantite FROM stock ORDER BY designation;
  `;

  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "${query}"`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', () => {
      console.log('Result:\n' + out);
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
