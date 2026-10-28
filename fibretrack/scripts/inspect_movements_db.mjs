import fs from 'node:fs';
import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const sql = "SHOW TABLES; SELECT id, nom, code, created_at FROM accounts; SELECT nom_technicien, nom_equipe, COUNT(*) as cnt FROM interventions GROUP BY nom_technicien, nom_equipe;";
  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "${sql}"`, (err, stream) => {
    let out = '';
    stream.on('close', () => {
      console.log('Live DB Info:\n' + out);
      conn.end();
    });
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => process.stderr.write(d));
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:\\Users\\Davyh\\.ssh\\id_ed25519')
});
