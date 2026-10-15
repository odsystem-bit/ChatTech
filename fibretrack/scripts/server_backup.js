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

console.log('--- Connexion SSH pour Sauvegarde Complète ---');
const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

function execCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', (code) => {
        if (code !== 0 && stderr) {
          console.warn(`[WARN cmd: ${cmd.slice(0, 40)}] code ${code}: ${stderr.trim()}`);
        }
        resolve({ code, stdout, stderr });
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✓ Connecté en SSH sur Hostinger');
  try {
    // 1. Lire _env.php sur le serveur
    const envRes = await execCommand(conn, `cat ${remoteBase}/api/_env.php`);
    console.log('--- Paramètres de connexion BDD détectés ---');
    
    // Extraire les identifiants depuis _env.php
    let dbUser = 'u795734321_fibretrack';
    let dbPass = '';
    let dbName = 'u795734321_fibre';
    let dbHost = 'localhost';

    const envContent = envRes.stdout;
    const userMatch = envContent.match(/DB_USER['"]?\s*,\s*['"]([^'"]+)['"]/);
    if (userMatch) dbUser = userMatch[1];
    const passMatch = envContent.match(/DB_PASS['"]?\s*,\s*['"]([^'"]+)['"]/);
    if (passMatch) dbPass = passMatch[1];
    const nameMatch = envContent.match(/DB_NAME['"]?\s*,\s*['"]([^'"]+)['"]/);
    if (nameMatch) dbName = nameMatch[1];
    const hostMatch = envContent.match(/DB_HOST['"]?\s*,\s*['"]([^'"]+)['"]/);
    if (hostMatch) dbHost = hostMatch[1];

    console.log(`BDD: ${dbName} | User: ${dbUser} | Host: ${dbHost}`);

    // 2. Dump complet de la base de données via mysqldump
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const remoteDumpPath = `/tmp/dump_${dbName}_${timestamp}.sql`;
    const localDumpPath = path.join(backupDir, `db_backup_${timestamp}.sql`);

    console.log('Exécution du dump SQL sur le serveur...');
    const dumpCmd = `mysqldump -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} > ${remoteDumpPath}`;
    await execCommand(conn, dumpCmd);

    // Télécharger le dump via SFTP
    conn.sftp((err, sftp) => {
      if (err) throw err;
      console.log(`Téléchargement du dump SQL vers ${localDumpPath}...`);
      sftp.fastGet(remoteDumpPath, localDumpPath, async (err) => {
        if (err) {
          console.error('Erreur téléchargement dump:', err);
        } else {
          const stats = fs.statSync(localDumpPath);
          console.log(`✓ SAUVEGARDE BDD RÉUSSIE : ${(stats.size / 1024).toFixed(1)} KB enregistrés dans ${localDumpPath}`);
        }

        // 3. Inspecter les interventions et les médias
        const statsRes = await execCommand(conn, `mysql -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} -e "SELECT COUNT(*) as nb_interventions FROM interventions; SELECT statut, COUNT(*) FROM interventions GROUP BY statut; SELECT COUNT(*) as nb_media FROM intervention_media; SELECT COUNT(*) as nb_comptes FROM accounts;"`);
        console.log('\n--- État actuel de la Base de Données ---');
        console.log(statsRes.stdout);

        // 4. Lister les dossiers uploads/photos et uploads/interventions
        const uploadsRes = await execCommand(conn, `ls -lh ${remoteBase}/api/uploads/photos 2>/dev/null | wc -l; ls -lh ${remoteBase}/api/uploads/interventions 2>/dev/null | wc -l`);
        console.log('--- Fichiers Médias sur le disque distant ---');
        console.log(uploadsRes.stdout);

        // 5. Voir les 15 dernières interventions créées ou modifiées
        const recentRes = await execCommand(conn, `mysql -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} -e "SELECT id, date, statut, nom_technicien, nom_client, modifie_par, modifie_le FROM interventions ORDER BY modifie_le DESC LIMIT 15;"`);
        console.log('--- 15 Dernières interventions en BDD ---');
        console.log(recentRes.stdout);

        // 6. Nettoyer le dump temporaire sur le serveur
        await execCommand(conn, `rm -f ${remoteDumpPath}`);

        conn.end();
      });
    });

  } catch (err) {
    console.error('Erreur dans server_backup:', err);
    conn.end();
  }
});

conn.on('error', (err) => {
  console.error('Erreur connexion SSH:', err);
});

conn.connect({ host, port, username, privateKey });
