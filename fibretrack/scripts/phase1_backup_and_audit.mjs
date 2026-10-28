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

function execCommand(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✓ Connecté en SSH sur Hostinger');
  try {
    const envRes = await execCommand(`cat ${remoteBase}/api/_env.php`);
    const envContent = envRes.stdout;

    const dbHostMatch = envContent.match(/putenv\(['"]DB_HOST=(.*?)['"]\)/) || envContent.match(/DB_HOST['"],\s*['"](.*?)['"]/);
    const dbNameMatch = envContent.match(/putenv\(['"]DB_NAME=(.*?)['"]\)/) || envContent.match(/DB_NAME['"],\s*['"](.*?)['"]/);
    const dbUserMatch = envContent.match(/putenv\(['"]DB_USER=(.*?)['"]\)/) || envContent.match(/DB_USER['"],\s*['"](.*?)['"]/);
    const dbPassMatch = envContent.match(/putenv\(['"]DB_PASS=(.*?)['"]\)/) || envContent.match(/DB_PASS['"],\s*['"](.*?)['"]/);

    const dbHost = dbHostMatch ? dbHostMatch[1] : 'localhost';
    const dbName = dbNameMatch ? dbNameMatch[1] : 'u795734321_fibre';
    const dbUser = dbUserMatch ? dbUserMatch[1] : 'u795734321_fibretrack';
    const dbPass = dbPassMatch ? dbPassMatch[1] : '';

    console.log(`BDD: ${dbName} | User: ${dbUser} | Host: ${dbHost}`);

    const remoteDumpPath = `/home/u795734321/backup_pre_saas_20261028.sql`;
    const localDumpPath = path.join(backupDir, 'backup_pre_saas_20261028.sql');

    console.log('Exécution mysqldump sur le serveur...');
    const dumpRes = await execCommand(`mysqldump --no-tablespaces -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} > ${remoteDumpPath}`);
    if (dumpRes.code !== 0) {
      console.error('STDERR mysqldump:', dumpRes.stderr);
    }
    const statRemote = await execCommand(`ls -lh ${remoteDumpPath}`);
    console.log('Fichier distant:', statRemote.stdout.trim());

    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.fastGet(remoteDumpPath, localDumpPath, (err) => {
          if (err) return reject(err);
          const sz = fs.statSync(localDumpPath).size;
          console.log(`✓ SAUVEGARDE SQL TÉLÉCHARGÉE : ${localDumpPath} (${(sz / 1024).toFixed(1)} KB)`);
          resolve();
        });
      });
    });

    const inspectSql = `
      SHOW TABLES;
      SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA='${dbName}';
      SELECT * FROM accounts;
      SELECT * FROM stock ORDER BY designation;
      SELECT COUNT(*) as total_interventions FROM interventions;
      SELECT statut, COUNT(*) as cnt FROM interventions GROUP BY statut;
      SELECT COUNT(*) as total_movements FROM stock_movements;
      SELECT COUNT(*) as total_media FROM intervention_media;
      SELECT COUNT(*) as total_deleted FROM deleted_interventions;
    `;
    const inspectRes = await execCommand(`mysql -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} -e "${inspectSql}"`);
    console.log('\n--- ÉTAT ACTUEL DE LA BDD ---\n' + inspectRes.stdout);
    if (inspectRes.stderr) console.error('STDERR:', inspectRes.stderr);

  } catch (err) {
    console.error('Erreur:', err);
  } finally {
    conn.end();
  }
});

conn.connect({ host, port, username, privateKey });
