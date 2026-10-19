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

echo "=== MEDIA FOR ea3 AND f19 ===\\n";
$stmt = $pdo->query("SELECT * FROM intervention_media WHERE intervention_id IN ('ea3ed5e5-9db6-4935-99a7-e2a6f53e7911', 'f19eec05-f921-4a07-9b3b-4ffcd6cacee8')");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

echo "\\n=== ALL MEDIA CREATED TODAY (2026-10-17) ===\\n";
$stmt2 = $pdo->query("SELECT * FROM intervention_media WHERE created_at >= '2026-10-17 00:00:00'");
print_r($stmt2->fetchAll(PDO::FETCH_ASSOC));
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
