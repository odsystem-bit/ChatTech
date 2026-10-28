import fs from 'node:fs';
import { Client } from 'ssh2';

const dossiers = [
  {
    id: '2b1b29bd-beed-4763-b5b5-dc98063f6d16',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, closer: 1, cpc_150: 1, crochets: 6 }
  },
  {
    id: 'c0621fc2-d565-4185-8dfd-c2b26adbe923',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, cpc_150: 1, crochets: 8 }
  },
  {
    id: '1c228c2b-5870-494f-9701-9e1b16ac2bc8',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, cpc_350: 1, crochets: 12 }
  },
  {
    id: '276f7134-7244-4b65-a095-37650dd79e6a',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, cpc_100: 1, crochets: 4 }
  },
  {
    id: '7b80b955-951b-4ae3-bde0-71c34b6ac2ba',
    conso: { ont: 1, pto: 1, jarretiere: 1, piton: 1, cheville: 1, cpc_200: 1, crochets: 8 }
  }
];

const conn = new Client();
conn.on('ready', () => {
  let sql = '';
  for (const d of dossiers) {
    const jsonStr = JSON.stringify(d.conso);
    sql += `UPDATE interventions SET materiel_pose = '${jsonStr}' WHERE id = '${d.id}';\n`;
  }
  sql += `SELECT id, nom_client, materiel_pose FROM interventions WHERE id IN ('${dossiers.map(d=>d.id).join("','")}');\n`;

  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', () => {
      console.log('Result:\n' + out);
      conn.end();
    });
    stream.on('data', d => { out += d; });
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.write(sql);
    stream.end();
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:\\Users\\Davyh\\.ssh\\id_ed25519')
});
