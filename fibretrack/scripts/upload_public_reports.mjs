import fs from 'node:fs';
import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const files = [
      { local: 'C:/Users/Davyh/Downloads/Point_Materiels_12_au_24_Octobre_2026.pdf', remote: '/home/u795734321/domains/fibretrack.mantota.com/public_html/Point_Materiels_12_au_24_Octobre_2026.pdf' },
      { local: 'C:/Users/Davyh/Downloads/Point_Materiels_12_au_24_Octobre_2026.xlsx', remote: '/home/u795734321/domains/fibretrack.mantota.com/public_html/Point_Materiels_12_au_24_Octobre_2026.xlsx' },
      { local: 'C:/Users/Davyh/Downloads/Point_Materiels_12_au_24_Octobre_2026.pdf', remote: '/home/u795734321/public_html/Point_Materiels_12_au_24_Octobre_2026.pdf' },
      { local: 'C:/Users/Davyh/Downloads/Point_Materiels_12_au_24_Octobre_2026.xlsx', remote: '/home/u795734321/public_html/Point_Materiels_12_au_24_Octobre_2026.xlsx' }
    ];
    let count = 0;
    for (const f of files) {
      sftp.fastPut(f.local, f.remote, (err) => {
        if (err) console.error(err);
        else console.log('Uploaded public link:', f.remote);
        count++;
        if (count === files.length) {
          console.log('All public files uploaded.');
          conn.end();
        }
      });
    }
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:\\Users\\Davyh\\.ssh\\id_ed25519')
});
