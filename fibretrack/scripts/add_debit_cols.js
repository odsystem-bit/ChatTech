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
  const phpCode = `<?php
    require_once "${remoteBase}/api/_env.php";
    $pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    
    $cols = [
      "debit_descendant" => "VARCHAR(64) NULL AFTER puissance_pto_dbm",
      "debit_montant" => "VARCHAR(64) NULL AFTER debit_descendant",
      "debit_ping" => "VARCHAR(64) NULL AFTER debit_montant"
    ];

    foreach ($cols as $col => $def) {
      try {
        $pdo->exec("ALTER TABLE interventions ADD COLUMN $col $def");
        echo "ADDED $col: OK\\n";
      } catch (Exception $e) {
        echo "RESULT $col: " . $e->getMessage() . "\\n";
      }
    }
  `;
  const b64 = Buffer.from(phpCode).toString('base64');
  conn.exec(`echo "${b64}" | base64 -d | php`, (err, stream) => {
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
