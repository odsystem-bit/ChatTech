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

$stmt = $pdo->query("SELECT id, intervention_id, type, file_path, latitude, longitude, precision_m, captured_at, added_by FROM intervention_media WHERE type IN ('video', 'video_terrain') OR file_path LIKE '%.mp4' OR file_path LIKE '%.mov' OR file_path LIKE '%.webm'");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "TOTAL VIDEO MEDIA ROWS: " . count($rows) . "\\n";
foreach ($rows as $r) {
    $full = "${remoteBase}/api/" . ltrim($r['file_path'], '/');
    $size = file_exists($full) ? filesize($full) : -1;
    echo $r['id'] . " | intv=" . $r['intervention_id'] . " | path=" . $r['file_path'] . " | size=" . $size . " | " . $r['captured_at'] . " | " . $r['added_by'] . "\\n";
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
