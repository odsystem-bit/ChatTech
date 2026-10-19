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

echo "=== 1. INTERVENTIONS WITH VIDEOS_TERRAIN ===\\n";
$stmt = $pdo->query("SELECT id, nom_client, videos_terrain, modifie_le FROM interventions WHERE videos_terrain IS NOT NULL AND videos_terrain != '[]' AND videos_terrain != ''");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "Count: " . count($rows) . "\\n";
foreach ($rows as $r) {
    echo $r['id'] . " | " . $r['nom_client'] . " | " . $r['modifie_le'] . "\\n";
    echo "  JSON: " . substr($r['videos_terrain'], 0, 500) . "\\n";
}

echo "\\n=== 2. ALL INTERVENTION_MEDIA ROWS ===\\n";
$stmt2 = $pdo->query("SELECT id, intervention_id, type, file_path, file_size, created_at FROM intervention_media WHERE type LIKE '%video%' OR file_path LIKE '%.mp4' OR file_path LIKE '%.webm' OR file_path LIKE '%.mov'");
$rows2 = $stmt2->fetchAll(PDO::FETCH_ASSOC);
echo "Count video media: " . count($rows2) . "\\n";
foreach ($rows2 as $r2) {
    echo $r2['id'] . " | " . $r2['intervention_id'] . " | " . $r2['type'] . " | " . $r2['file_path'] . " | " . $r2['file_size'] . " | " . $r2['created_at'] . "\\n";
}

echo "\\n=== 3. FILES ON DISK IN UPLOADS/ ===\\n";
function listDir($path) {
    if (!is_dir($path)) {
        echo "Dir does not exist: $path\\n";
        return;
    }
    $sc = scandir($path);
    foreach ($sc as $f) {
        if ($f === '.' || $f === '..') continue;
        $full = "$path/$f";
        if (is_dir($full)) {
            echo "DIR: $full\\n";
            listDir($full);
        } else {
            echo "FILE: $full (" . filesize($full) . " bytes)\\n";
        }
    }
}
listDir("${remoteBase}/api/uploads/videos");

echo "\\n=== 4. RECENT INTERVENTIONS MODIFIED TODAY ===\\n";
$stmt4 = $pdo->query("SELECT id, nom_client, modifie_le, LENGTH(videos_terrain) as v_len, videos_terrain FROM interventions ORDER BY modifie_le DESC LIMIT 5");
$rows4 = $stmt4->fetchAll(PDO::FETCH_ASSOC);
foreach ($rows4 as $r4) {
    echo $r4['id'] . " | " . $r4['nom_client'] . " | " . $r4['modifie_le'] . " | v_len=" . $r4['v_len'] . " | " . substr($r4['videos_terrain'] ?? '', 0, 100) . "\\n";
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
