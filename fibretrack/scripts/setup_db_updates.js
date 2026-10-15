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
    error_reporting(E_ALL);
    ini_set("display_errors", "1");
    try {
      require_once "${remoteBase}/api/_env.php";
      $pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
      
      $pdo->exec("CREATE TABLE IF NOT EXISTS deleted_interventions (
        id VARCHAR(64) PRIMARY KEY,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
      echo "TABLE deleted_interventions: OK\n";

      try {
        $pdo->exec("ALTER TABLE interventions ADD COLUMN nom_dossier VARCHAR(255) NULL AFTER nom_client");
        echo "COLUMN nom_dossier added: OK\n";
      } catch (Exception $e) {
        echo "COLUMN nom_dossier: " . $e->getMessage() . "\n";
      }

      $updated = $pdo->exec("UPDATE interventions SET nom_dossier = nom_client WHERE CHAR_LENGTH(COALESCE(nom_client, \"\")) > 0");
      echo "DATA UPDATE nom_dossier = nom_client rows affected: $updated\n";
    } catch (Throwable $e) {
      echo "FATAL: " . $e->getMessage() . "\n";
    }
  '`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      console.log('OUTPUT:\n' + out);
      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
