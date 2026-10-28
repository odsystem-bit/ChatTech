import { Client } from 'ssh2';
import fs from 'fs';

const conn = new Client();
conn.on('ready', () => {
  conn.exec('ls -la /home/u795734321/domains/app-fibretrack.com/public_html/api', (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
