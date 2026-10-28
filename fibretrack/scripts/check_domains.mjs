import fs from 'node:fs';
import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  conn.exec('ls -la /home/u795734321/domains', (err, stream) => {
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
