import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

console.log('--- Démarrage de l\'audit SSH & Base de données FibreTrack ---');

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

function execCommand(command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
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
    // 1. Lister l'arborescence du site et du compte
    console.log('\n--- 1. Inspection des répertoires distants ---');
    const lsRemote = await execCommand(`ls -la ${remoteBase}`);
    console.log(lsRemote.stdout);

    const lsApi = await execCommand(`ls -la ${remoteBase}/api`);
    console.log('\n--- Fichiers dans api/ ---');
    console.log(lsApi.stdout);

    // 2. Vérifier les autres domaines et dossiers sur le serveur
    const lsDomains = await execCommand('ls -la /home/u795734321/domains');
    console.log('\n--- Domaines sur le compte Hostinger ---');
    console.log(lsDomains.stdout);

    // 3. Lire api/_env.php
    console.log('\n--- 2. Lecture sécurisée des variables d\'environnement (_env.php) ---');
    const envCat = await execCommand(`cat ${remoteBase}/api/_env.php`);
    console.log(envCat.stdout);

    // 4. Extraction des identifiants MySQL depuis _env.php
    const dbHostMatch = envCat.stdout.match(/putenv\(['"]DB_HOST=(.*?)['"]\)/) || envCat.stdout.match(/DB_HOST['"],\s*['"](.*?)['"]/);
    const dbNameMatch = envCat.stdout.match(/putenv\(['"]DB_NAME=(.*?)['"]\)/) || envCat.stdout.match(/DB_NAME['"],\s*['"](.*?)['"]/);
    const dbUserMatch = envCat.stdout.match(/putenv\(['"]DB_USER=(.*?)['"]\)/) || envCat.stdout.match(/DB_USER['"],\s*['"](.*?)['"]/);
    const dbPassMatch = envCat.stdout.match(/putenv\(['"]DB_PASS=(.*?)['"]\)/) || envCat.stdout.match(/DB_PASS['"],\s*['"](.*?)['"]/);

    const dbHost = dbHostMatch ? dbHostMatch[1] : 'localhost';
    const dbName = dbNameMatch ? dbNameMatch[1] : 'u795734321_fibre';
    const dbUser = dbUserMatch ? dbUserMatch[1] : 'u795734321_fibretrack';
    const dbPass = dbPassMatch ? dbPassMatch[1] : '';

    console.log(`\nBase détectée: ${dbName} sur ${dbHost} avec utilisateur ${dbUser}`);

    // 5. Sauvegarde de la base de données via mysqldump
    console.log('\n--- 3. SAUVEGARDE DE SÉCURITÉ DE LA BASE DE DONNÉES ---');
    const backupRemoteFile = `/home/u795734321/backup_fibretrack_audit_${Date.now()}.sql`;
    const dumpCmd = `mysqldump -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} > ${backupRemoteFile}`;
    const dumpRes = await execCommand(dumpCmd);
    if (dumpRes.code === 0) {
      console.log(`✓ Sauvegarde distante créée avec succès : ${backupRemoteFile}`);
      const statRes = await execCommand(`ls -lh ${backupRemoteFile}`);
      console.log(`  Taille du dump: ${statRes.stdout.trim()}`);
    } else {
      console.error('Erreur mysqldump:', dumpRes.stderr);
    }

    // 6. Inspection SQL : Liste des tables et statistiques
    console.log('\n--- 4. Inspection des tables MySQL ---');
    const queryTables = `mysql -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} -e "SHOW TABLES; SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA='${dbName}';"`;
    const tablesRes = await execCommand(queryTables);
    console.log(tablesRes.stdout);

    // 7. Statistique détaillée des interventions
    console.log('\n--- 5. Statistiques détaillées des interventions ---');
    const queryIntv = `mysql -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} -e "
      SELECT COUNT(*) as total_interventions,
             SUM(CASE WHEN statut = 'termine' THEN 1 ELSE 0 END) as terminees,
             SUM(CASE WHEN statut = 'en_cours' THEN 1 ELSE 0 END) as en_cours,
             MIN(date) as premiere_date,
             MAX(date) as derniere_date,
             MIN(cree_le) as premier_cree_le,
             MAX(modifie_le) as dernier_modifie_le
      FROM interventions;
    "`;
    const intvRes = await execCommand(queryIntv);
    console.log(intvRes.stdout);

    // 8. Vérification des photos et points GPS dans les interventions
    console.log('\n--- 6. Analyse des photos et du stockage ---');
    const queryPhotos = `mysql -h ${dbHost} -u ${dbUser} -p'${dbPass}' ${dbName} -e "
      SELECT id, nom_client, date, statut,
             LENGTH(whatsapp_photos) as taille_whatsapp_photos,
             JSON_LENGTH(whatsapp_photos) as nb_photos_wa,
             LENGTH(points_gps) as taille_points_gps,
             JSON_LENGTH(points_gps) as nb_points_gps,
             modifie_le
      FROM interventions
      ORDER BY modifie_le DESC
      LIMIT 25;
    "`;
    const photosRes = await execCommand(queryPhotos);
    console.log(photosRes.stdout);

    // 9. Vérification des dossiers d'uploads ou médias éventuels sur le serveur
    console.log('\n--- 7. Recherche de répertoires uploads / photos sur le serveur ---');
    const findUploads = await execCommand(`find /home/u795734321/ -maxdepth 3 -type d -name "*upload*" -o -name "*photo*" -o -name "*media*" 2>/dev/null`);
    console.log(findUploads.stdout || 'Aucun dossier uploads / photos trouvé');

    // 10. Vérifier s'il y a d'autres bases de données
    console.log('\n--- 8. Vérification des autres bases de données de l\'utilisateur ---');
    const dbsRes = await execCommand(`mysql -h ${dbHost} -u ${dbUser} -p'${dbPass}' -e "SHOW DATABASES;"`);
    console.log(dbsRes.stdout);

  } catch (err) {
    console.error('Erreur durant l\'audit:', err);
  } finally {
    conn.end();
    console.log('\n✓ Connexion SSH fermée.');
  }
});

conn.on('error', (err) => {
  console.error('Erreur SSH:', err);
});
conn.connect({ host, port, username, privateKey });
