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
echo json_encode($row, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
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
      fs.writeFileSync('C:\\Users\\Davyh\\.gemini\\antigravity\\scratch\\ChatTech\\current_intervention.json', out);
      console.log('Saved to current_intervention.json, length:', out.length);
      conn.end();
    });
  });
});
conn.connect({ host, port, username, privateKey });
