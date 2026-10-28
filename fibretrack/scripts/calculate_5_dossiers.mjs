import fs from 'node:fs';
import { Client } from 'ssh2';

const ids = [
  '2b1b29bd-beed-4763-b5b5-dc98063f6d16',
  'c0621fc2-d565-4185-8dfd-c2b26adbe923',
  '1c228c2b-5870-494f-9701-9e1b16ac2bc8',
  '276f7134-7244-4b65-a095-37650dd79e6a',
  '7b80b955-951b-4ae3-bde0-71c34b6ac2ba'
];

const conn = new Client();

conn.on('ready', () => {
  const query = `
    SELECT id, date, nom_client, telephone_ligne, statut, materiel_pose, lineaire_m, arrivee_m, depart_m, type_cable
    FROM interventions
    WHERE id IN ('${ids.join("','")}')
    ORDER BY date ASC;
  `;

  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "${query}"`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', () => {
      console.log('Result of 5 dossiers:');
      const lines = out.trim().split('\n');
      console.log(lines.join('\n'));
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
