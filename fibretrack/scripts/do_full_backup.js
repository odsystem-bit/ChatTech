import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const backupDir = path.join(projectRoot, 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

conn.on('ready', () => {
  console.log('✓ Connecté SSH.');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const localTool = path.join(projectRoot, 'api', 'backup_tool.php');
    const remoteTool = `${remoteBase}/api/backup_tool.php`;
    sftp.fastPut(localTool, remoteTool, (err) => {
      if (err) throw err;
      console.log('✓ backup_tool.php uploadé. Exécution...');
      conn.exec(`php ${remoteTool}`, (err, stream) => {
        if (err) throw err;
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
        stream.on('close', () => {
          console.log('OUTPUT:\n' + out);
          const match = out.match(/SAVED_TO:\s*([^\s]+)/);
          if (match) {
            const remoteFile = match[1];
            const localFile = path.join(backupDir, path.basename(remoteFile));
            sftp.fastGet(remoteFile, localFile, (err) => {
              if (err) console.error('Erreur download:', err);
              else {
                const sz = fs.statSync(localFile).size;
                console.log(`✓✓✓ SAUVEGARDE COMPLÈTE TÉLÉCHARGÉE : ${localFile} (${(sz/1024).toFixed(1)} KB)`);
              }
              // Suppression du script temporaire
              sftp.unlink(remoteTool, () => {
                conn.end();
              });
            });
          } else {
            conn.end();
          }
        });
      });
    });
  });
});

conn.connect({ host, port, username, privateKey });
