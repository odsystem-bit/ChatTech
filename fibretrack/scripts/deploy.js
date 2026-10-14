import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

console.log('--- Démarrage Déploiement FibreTrack Hostinger ---');

if (!fs.existsSync(distDir)) {
  console.error('Erreur: Dossier dist introuvable. Exécutez npm run build.');
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

conn.on('ready', () => {
  console.log('✓ Connecté en SSH sur Hostinger');
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      process.exit(1);
    }

    async function ensureRemoteDir(remotePath) {
      return new Promise((resolve) => {
        sftp.mkdir(remotePath, (err) => {
          resolve(); // ignore if already exists
        });
      });
    }

    async function uploadFile(localPath, remotePath) {
      return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(localPath);
        const writeStream = sftp.createWriteStream(remotePath);
        writeStream.on('close', () => {
          const stat = fs.statSync(localPath);
          console.log(`  ✓ Uploadé: ${path.relative(distDir, localPath)} (${(stat.size / 1024).toFixed(1)} KB)`);
          resolve();
        });
        writeStream.on('error', (e) => reject(e));
        readStream.pipe(writeStream);
      });
    }

    async function walkAndUpload(localCurrent, remoteCurrent) {
      const items = fs.readdirSync(localCurrent, { withFileTypes: true });
      for (const item of items) {
        const localItemPath = path.join(localCurrent, item.name);
        const remoteItemPath = `${remoteCurrent}/${item.name}`;

        if (item.isDirectory()) {
          // Si c'est le dossier tesseract et qu'il existe déjà sur le serveur, on peut le sauter
          if (item.name === 'tesseract') {
            console.log('  ℹ Dossier tesseract déjà présent sur le serveur (conservé)');
            continue;
          }
          await ensureRemoteDir(remoteItemPath);
          await walkAndUpload(localItemPath, remoteItemPath);
        } else {
          await uploadFile(localItemPath, remoteItemPath);
        }
      }
    }

    walkAndUpload(distDir, remoteBase)
      .then(async () => {
        const localApiFile = path.join(projectRoot, 'api', 'index.php');
        if (fs.existsSync(localApiFile)) {
          await ensureRemoteDir(`${remoteBase}/api`);
          await uploadFile(localApiFile, `${remoteBase}/api/index.php`);
          console.log('✓ api/index.php mis à jour sur Hostinger !');
        }
        console.log('✓ Tous les fichiers mis à jour avec succès sur Hostinger !');
        // Vérification
        conn.exec(`cat ${remoteBase}/version.json`, (err, stream) => {
          if (err) throw err;
          let output = '';
          stream.on('data', (d) => { output += d.toString(); });
          stream.on('close', () => {
            console.log('✓ Version distante active:\n', output.trim());
            conn.end();
          });
        });
      })
      .catch((err) => {
        console.error('Erreur upload:', err);
        conn.end();
        process.exit(1);
      });
  });
});

conn.on('error', (err) => {
  console.error('Erreur connexion SSH:', err);
  process.exit(1);
});

conn.connect({
  host,
  port,
  username,
  privateKey,
});
