import { Client } from 'ssh2';
import fs from 'fs';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`find /home/u795734321/domains/fibretrack.mantota.com/public_html/api/uploads/ -type f \\( -name "*.mp4" -o -name "*.mov" -o -name "*.webm" \\) -ls`, (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '82.29.191.42', port: 65002, username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
