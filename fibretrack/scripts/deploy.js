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

    async function getRemoteSize(remotePath) {
      return new Promise((resolve) => {
        sftp.stat(remotePath, (err, stats) => {
          if (err || !stats) resolve(-1);
          else resolve(stats.size);
        });
      });
    }

    async function uploadFile(localPath, remotePath) {
      const stat = fs.statSync(localPath);
      // Skip heavy binary assets if size didn't change
      if (/\.(png|jpg|jpeg|svg|ico|woff2?|ttf|eot|pdf)$/i.test(localPath)) {
        const remSize = await getRemoteSize(remotePath);
        if (remSize === stat.size) {
          console.log(`  = Ignoré (identique): ${path.relative(distDir, localPath)}`);
          return;
        }
      }

      return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(localPath);
        const writeStream = sftp.createWriteStream(remotePath);
        writeStream.on('close', () => {
          console.log(`  ✓ Uploadé: ${path.relative(projectRoot, localPath)} (${(stat.size / 1024).toFixed(1)} KB)`);
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

    (async () => {
      // 1. Mettre à jour l'API backend en priorité
      const apiFiles = ['index.php', 'pdf.php', 'excel_hebdo.php', 'excel_hebdo_simple.php', 'excel_export.php', '.htaccess', '.user.ini'];
      await ensureRemoteDir(`${remoteBase}/api`);
      for (const apiFile of apiFiles) {
        const localPath = path.join(projectRoot, 'api', apiFile);
        if (fs.existsSync(localPath)) {
          await uploadFile(localPath, `${remoteBase}/api/${apiFile}`);
          console.log(`✓ api/${apiFile} mis à jour sur Hostinger !`);
        }
      }

      // 2. Mettre à jour le frontend dist
      await walkAndUpload(distDir, remoteBase);
      console.log('✓ Tous les fichiers mis à jour avec succès sur Hostinger !');

      // 3. Vérification de la version distante active
      conn.exec(`cat ${remoteBase}/version.json`, (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', (d) => { output += d.toString(); });
        stream.on('close', () => {
          console.log('✓ Version distante active:\n', output.trim());
          conn.end();
        });
      });
    })()
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
  keepaliveInterval: 10000,
  keepaliveCountMax: 8,
  readyTimeout: 60000,
});
