import { Client } from 'ssh2';
import fs from 'fs';

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    sftp.readdir('/home/u795734321/domains/app-fibretrack.com/public_html/api', (err, list) => {
      if (err) throw err;
      for (const item of list) {
        console.log(JSON.stringify({ name: item.filename, longname: item.longname, size: item.attrs?.size }));
      }
      conn.end();
    });
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
