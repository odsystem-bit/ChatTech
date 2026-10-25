import fs from 'node:fs';
import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "SELECT * FROM interventions WHERE id = '6b2ed8ff-c90d-42d1-acf3-1384d42c022f'\\G"`, (err, stream) => {
    if (err) throw err;
    let data = '';
    stream.on('data', d => { data += d.toString(); });
    stream.on('close', () => {
      fs.writeFileSync('sagbohan_dump.txt', data);
      console.log('Saved to sagbohan_dump.txt, length:', data.length);
      conn.end();
    });
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:\\Users\\Davyh\\.ssh\\id_ed25519')
});
