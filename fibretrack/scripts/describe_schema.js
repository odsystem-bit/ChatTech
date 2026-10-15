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
    $stmt = $pdo->query("DESCRIBE interventions");
    foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $col) {
      echo sprintf("%-30s %-20s\n", $col["Field"], $col["Type"]);
    }
  '`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      console.log('COLUMNS:\n' + out);
      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
