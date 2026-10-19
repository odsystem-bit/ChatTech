import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

const rawPhp = `
require_once "${remoteBase}/api/_env.php";
$pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"));

// 1. Récupérer tous les médias vidéo
$stmt = $pdo->query("SELECT * FROM intervention_media WHERE type IN ('video', 'video_terrain') OR file_path LIKE '%.mp4' OR file_path LIKE '%.mov' OR file_path LIKE '%.webm'");
$medias = $stmt->fetchAll(PDO::FETCH_ASSOC);

$byIntv = [];
foreach ($medias as $m) {
    $intvId = $m['intervention_id'];
    if (!isset($byIntv[$intvId])) $byIntv[$intvId] = [];
    $byIntv[$intvId][] = $m;
}

echo "Found videos for " . count($byIntv) . " interventions:\\n";
foreach ($byIntv as $intvId => $vids) {
    $stmtIntv = $pdo->prepare("SELECT id, nom_client, videos_terrain FROM interventions WHERE id = ?");
    $stmtIntv->execute([$intvId]);
    $intv = $stmtIntv->fetch(PDO::FETCH_ASSOC);
    $client = $intv ? $intv['nom_client'] : 'UNKNOWN';
    $existingVids = $intv ? json_decode($intv['videos_terrain'] ?? '[]', true) : [];
    if (!is_array($existingVids)) $existingVids = [];
    echo "Intervention: $intvId ($client) => " . count($vids) . " videos in media table, " . count($existingVids) . " in videos_terrain column\\n";
}
`;

const b64 = Buffer.from(rawPhp).toString('base64');

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
