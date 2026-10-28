import fs from 'node:fs';
import { Client } from 'ssh2';

const conn = new Client();

const script = `
SELECT '--- STOCK TABLE ---';
SELECT designation, quantite FROM stock ORDER BY designation;

SELECT '--- INTERVENTIONS 12-24 OCT 2026 ---';
SELECT id, date, statut, motif_non_traite, nom_client, telephone_ligne, type_cable, depart_m, arrivee_m, lineaire_m, materiel_pose, materiel_deduit
FROM interventions
WHERE date >= '2026-10-12 00:00:00' AND date <= '2026-10-24 23:59:59'
ORDER BY date ASC;

SELECT '--- STOCK MOVEMENTS 12-24 OCT 2026 ---';
SELECT id, date_mouvement, type, designation, quantite, intervention_id, nom_client, nom_technicien, motif
FROM stock_movements
WHERE date_mouvement >= '2026-10-12' AND date_mouvement <= '2026-10-24 23:59:59'
ORDER BY date_mouvement ASC;
`;

conn.on('ready', () => {
  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "${script}"`, (err, stream) => {
    if (err) throw err;
    let data = '';
    stream.on('close', () => {
      fs.writeFileSync('scripts/point_12_24_output.txt', data);
      console.log('Output written to scripts/point_12_24_output.txt, size:', data.length);
      conn.end();
    });
    stream.on('data', d => { data += d; });
    stream.stderr.on('data', d => process.stderr.write(d));
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:\\Users\\Davyh\\.ssh\\id_ed25519')
});
