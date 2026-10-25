import fs from 'node:fs';
import ssh2 from 'ssh2';
const { Client } = ssh2;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`php -r '
    require_once "/home/u795734321/domains/fibretrack.mantota.com/public_html/api/_env.php";
    $pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"));
    $stmt = $pdo->query("SELECT id, nom_client, statut, updated_at, (CASE WHEN video_url IS NOT NULL AND video_url != \"\" THEN 1 ELSE 0 END) as has_video FROM interventions ORDER BY updated_at DESC LIMIT 6");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_PRETTY_PRINT);
  '`, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('ERR:', d.toString()));
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
