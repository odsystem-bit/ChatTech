import fs from 'node:fs';
import { Client } from 'ssh2';

const query = process.argv[2] || 'SELECT id, nom_client, statut, modifie_le FROM interventions ORDER BY modifie_le DESC LIMIT 5';
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "${query}"`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end());
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:\\Users\\Davyh\\.ssh\\id_ed25519')
});
