import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKey = fs.readFileSync('C:\\Users\\Davyh\\.ssh\\id_ed25519');
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const rawPhp = `
require_once "${remoteBase}/api/_env.php";
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"));

$stmt = $pdo->prepare("SELECT * FROM interventions WHERE id = ?");
$stmt->execute(['ea3ed5e5-9db6-4935-99a7-e2a6f53e7911']);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

$pts = json_decode($row['points_gps'] ?? '[]', true);
$mp = json_decode($row['materiel_pose'] ?? '{}', true);

foreach ($pts as &$p) {
    if (isset($p['type']) && strtolower($p['type']) === 'poteau') {
        $p['type_poteau'] = 'Petit Jean';
        $p['proprietaire'] = 'Petit Jean';
        $p['sous_type'] = 'Traversé';
        $p['traverse'] = true;
    }
}
unset($p);

$mp['crochets'] = 4;
$mp['piton'] = 1;
$mp['pto'] = 1;
$mp['ont'] = 1;
$mp['cheville'] = 1;

$up = $pdo->prepare("UPDATE interventions SET points_gps = ?, materiel_pose = ?, nb_poteaux_traverses = 2, modifie_le = NOW() WHERE id = ?");
$up->execute([json_encode($pts), json_encode($mp), 'ea3ed5e5-9db6-4935-99a7-e2a6f53e7911']);

echo "SUCCESS: Intervention mise a jour avec 2 poteaux Petit Jean et 4 crochets\n";

$check = $pdo->prepare("SELECT points_gps, materiel_pose FROM interventions WHERE id = ?");
$check->execute(['ea3ed5e5-9db6-4935-99a7-e2a6f53e7911']);
$res = $check->fetch(PDO::FETCH_ASSOC);
echo "points_gps: " . $res['points_gps'] . "\n";
echo "materiel_pose: " . $res['materiel_pose'] . "\n";
`;

const b64 = Buffer.from(rawPhp).toString('base64');
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`php -r 'eval(base64_decode("${b64}"));'`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});
conn.connect({ host, port, username, privateKey });
