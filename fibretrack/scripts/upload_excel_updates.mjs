import fs from 'node:fs';
import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection ready, opening SFTP...');
  conn.sftp((err, sftp) => {
    if (err) throw err;

    const baseDirs = [
      '/home/u795734321/domains/fibretrack.mantota.com/public_html/api',
      '/home/u795734321/public_html/api'
    ];

    const localFiles = [
      { local: 'api/GS BTP 121026.xlsx', name: 'GS BTP 121026.xlsx' },
      { local: 'api/GS BTP 121026.xlsx', name: 'GS BTP 090926.xlsx' },
      { local: 'api/excel_hebdo.php', name: 'excel_hebdo.php' },
      { local: 'api/excel_export.php', name: 'excel_export.php' },
      { local: 'api/index.php', name: 'index.php' },
      { local: 'api/pdf.php', name: 'pdf.php' }
    ];

    const queue = [];
    for (const dir of baseDirs) {
      for (const f of localFiles) {
        queue.push({ local: f.local, remote: `${dir}/${f.name}` });
      }
    }

    let count = 0;
    for (const item of queue) {
      console.log(`Uploading ${item.local} -> ${item.remote}...`);
      sftp.fastPut(item.local, item.remote, (err) => {
        if (err) {
          console.error(`Error uploading to ${item.remote}:`, err.message);
        } else {
          console.log(`✓ Uploaded ${item.remote}`);
        }
        count++;
        if (count === queue.length) {
          console.log('\nAll uploads finished successfully.');
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
