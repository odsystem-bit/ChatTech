import { Client } from 'ssh2';
import fs from 'fs';

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const targets = [
      '/home/u795734321/domains/app-fibretrack.com/public_html/GS BTP 090926.xlsx',
      '/home/u795734321/domains/app-fibretrack.com/GS BTP 090926.xlsx',
      '/home/u795734321/GS BTP 090926.xlsx'
    ];
    for (const p of targets) {
      sftp.stat(p, (err, stats) => {
        if (!err) {
          console.log('FOUND AT:', p, 'size:', stats.size);
          sftp.createReadStream(p).pipe(fs.createWriteStream('api/GS BTP 090926.xlsx')).on('finish', () => {
            console.log('Downloaded to api/GS BTP 090926.xlsx successfully!');
            conn.end();
          });
        } else {
          console.log('Not at:', p);
        }
      });
    }
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
