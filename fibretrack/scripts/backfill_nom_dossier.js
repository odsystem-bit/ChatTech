import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

const phpCode = `
require_once '${remoteBase}/api/_env.php';
$pdo = new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_NAME'), getenv('DB_USER'), getenv('DB_PASS'));
$aff1 = $pdo->exec("UPDATE interventions SET nom_dossier = nom_client WHERE (nom_dossier IS NULL OR nom_dossier = '') AND nom_client IS NOT NULL AND nom_client != ''");
$aff2 = $pdo->exec("UPDATE interventions SET nom_client = nom_dossier WHERE (nom_client IS NULL OR nom_client = '') AND nom_dossier IS NOT NULL AND nom_dossier != ''");
echo "Updated nom_dossier rows: $aff1, nom_client rows: $aff2\\n";
$stmt = $pdo->query("SELECT id, nom_client, nom_dossier, telephone_ligne, mobile, modifie_le FROM interventions ORDER BY modifie_le DESC LIMIT 5");
foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
  echo sprintf("%-36s | %-20s | %-20s | %-12s | %-20s\\n", $row['id'], substr($row['nom_client']??'', 0, 20), substr($row['nom_dossier']??'', 0, 20), $row['telephone_ligne']??'', $row['modifie_le']??'');
}
`;

conn.on('ready', () => {
  const b64 = Buffer.from(phpCode).toString('base64');
  conn.exec(`php -r 'eval(base64_decode("${b64}"));'`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      console.log('RESULT:');
      console.log(out);
      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
