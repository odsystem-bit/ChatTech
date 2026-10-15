import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const backupDir = path.join(projectRoot, 'backups');

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

conn.on('ready', () => {
  console.log('✓ Tar des uploads sur le serveur...');
  const remoteTar = `${remoteBase}/api/uploads_backup.tar.gz`;
  const localTar = path.join(backupDir, 'uploads_backup.tar.gz');

  conn.exec(`tar -czf ${remoteTar} -C ${remoteBase}/api uploads 2>/dev/null; ls -lh ${remoteTar}`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => {
      console.log('Archive créée sur le serveur:\n' + out);
      conn.sftp((err, sftp) => {
        if (err) throw err;
        sftp.fastGet(remoteTar, localTar, (err) => {
          if (err) console.error('Erreur download tar:', err);
          else {
            const sz = fs.statSync(localTar).size;
            console.log(`✓ ARCHIVE PHOTOS TÉLÉCHARGÉE : ${localTar} (${(sz/1024).toFixed(1)} KB)`);
          }
          conn.end();
        });
      });
    });
  });
});

conn.connect({ host, port, username, privateKey });
