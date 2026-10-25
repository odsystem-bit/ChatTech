import { Client } from 'ssh2';
import fs from 'fs';

const base = '/home/u795734321/domains/fibretrack.mantota.com/public_html/api';
const tmp = `${base}/_lint_tmp.php`;
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    sftp.fastPut('api/index.php', tmp, (e) => {
      if (e) throw e;
      conn.exec(`php -l ${tmp}; rm -f ${tmp}`, (err2, stream) => {
        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));
        stream.on('close', () => conn.end());
      });
    });
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519'),
});
