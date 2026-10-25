import { Client } from 'ssh2';
import fs from 'fs';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`tail -n 50 /home/u795734321/domains/fibretrack.mantota.com/public_html/api/error_log 2>/dev/null || tail -n 50 /home/u795734321/logs/* 2>/dev/null || echo "No log files found"`, (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '82.29.191.42', port: 65002, username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
