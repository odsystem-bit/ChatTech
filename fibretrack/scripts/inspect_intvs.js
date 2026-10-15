import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

conn.on('ready', () => {
  conn.exec(`php -r '
    require_once "${remoteBase}/api/_env.php";
    $pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"));
    $stmt = $pdo->query("SELECT id, nom_client, nom_dossier, telephone_ligne, mobile, nom_technicien, modifie_par, modifie_le, date FROM interventions ORDER BY date DESC LIMIT 10");
    foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
      echo sprintf("%-36s | %-20s | %-20s | %-12s | %-20s\\n", $row["id"], substr($row["nom_client"]??"", 0, 20), substr($row["nom_dossier"]??"", 0, 20), $row["telephone_ligne"]??"", $row["modifie_le"]??"");
    }
  '`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      console.log('LATEST 10 INTERVENTIONS IN MYSQL:');
      console.log('ID                                   | NOM_CLIENT           | NOM_DOSSIER          | TEL_LIGNE    | MODIFIE_LE');
      console.log('-------------------------------------+----------------------+----------------------+--------------+---------------------');
      console.log(out);
      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
