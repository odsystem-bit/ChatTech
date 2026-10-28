import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }
    const remotePath = '/home/u795734321/domains/app-fibretrack.com/public_html/api/GS BTP 090926.xlsx';
    const localPath = path.resolve('api/GS BTP 090926.xlsx');
    
    const readStream = sftp.createReadStream(remotePath);
    const writeStream = fs.createWriteStream(localPath);

    readStream.pipe(writeStream);

    writeStream.on('finish', () => {
      console.log('Successfully downloaded to', localPath, 'size:', fs.statSync(localPath).size);
      conn.end();
    });

    readStream.on('error', (err) => {
      console.error('Read error:', err);
      conn.end();
    });

    writeStream.on('error', (err) => {
      console.error('Write error:', err);
      conn.end();
    });
  });
}).on('error', (err) => {
  console.error('Conn error:', err);
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
