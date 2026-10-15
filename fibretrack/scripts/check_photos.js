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
    $stmt = $pdo->query("SELECT id, nom_client, whatsapp_photos, points_gps FROM interventions");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
      $wa = json_decode($row["whatsapp_photos"] ?? "[]", true);
      $pts = json_decode($row["points_gps"] ?? "[]", true);
      foreach ($wa as $w) {
        $encoded = json_encode($w);
        if (strpos($encoded, "6.385448") !== false || strpos($encoded, "14:01:44") !== false) {
          echo "FOUND IN WA of " . $row["id"] . ": slot=" . ($w["slot"] ?? "") . " name=" . ($w["name"] ?? "") . " url=" . ($w["url"] ?? "") . "\n";
        }
      }
      foreach ($pts as $p) {
        $encoded = json_encode($p);
        if (strpos($encoded, "6.385448") !== false || strpos($encoded, "14:01:44") !== false) {
          echo "FOUND IN PTS of " . $row["id"] . ": type=" . ($p["type"] ?? "") . " photo=" . ($p["photo"] ?? "") . "\n";
        }
      }
    }
    echo "\n=== POINTS_GPS ===\n";
    foreach ($pts as $p) {
      $type = $p["type"] ?? "";
      $num = $p["numero"] ?? "";
      $photo = $p["photo"] ?? "";
      echo "$type #$num | " . substr($photo, 0, 80) . "\n";
    }
  '`, (err, stream) => {
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
