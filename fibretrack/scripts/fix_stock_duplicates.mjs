import fs from 'node:fs';
import { Client } from 'ssh2';

const canonical20 = [
  'ont', 'pto', 'jarretiere', 'piton', 'cheville', 'connecteur',
  'closer', 'fibre_1fo', 'cpc_50', 'cpc_100', 'cpc_150', 'cpc_200',
  'cpc_250', 'cpc_300', 'cpc_350', 'crochets', 'pince', 'susp',
  'traverse_13t', 'traverse_15t'
];

const conn = new Client();

conn.on('ready', () => {
  console.log('Connected to SSH...');

  // 1. Nettoyer les désignations parasites hors canevas
  // 2. Nettoyer les mouvements de test récents (id >= 1880)
  const query = `
    DELETE FROM stock WHERE designation NOT IN ('${canonical20.join("','")}');
    DELETE FROM stock_movements WHERE id >= 1880 AND nom_technicien IS NULL AND (motif LIKE '%Import Excel%' OR motif LIKE '%Inventaire Excel%');
    SELECT designation, quantite FROM stock ORDER BY designation;
  `;

  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "${query}"`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', () => {
      console.log('Result of cleanup query:\n' + out);
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
