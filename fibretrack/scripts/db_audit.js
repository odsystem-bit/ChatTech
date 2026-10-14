import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';

const phpScript = `<?php
require '/home/u795734321/domains/fibretrack.mantota.com/public_html/api/_env.php';
\$pdo = new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_NAME').';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASS'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

// Inspect Tchiakpe
echo "\\n=== TCHIAKPE INSPECT ===\\n";
\$t = \$pdo->query("SELECT whatsapp_photos, points_gps FROM interventions WHERE nom_client LIKE '%TCHIAKPE%'")->fetch(PDO::FETCH_ASSOC);
\$wa = json_decode(\$t['whatsapp_photos'] ?? '[]', true);
foreach (\$wa as \$p) {
  echo 'WA slot: ' . (\$p['slot'] ?? '') . ' len: ' . strlen(\$p['url'] ?? '') . ' prefix: ' . substr(\$p['url'] ?? '', 0, 40) . PHP_EOL;
}
\$gps = json_decode(\$t['points_gps'] ?? '[]', true);
foreach (\$gps as \$pt) {
  echo 'GPS type: ' . (\$pt['type'] ?? '') . ' len: ' . strlen(\$pt['photo'] ?? '') . ' prefix: ' . substr(\$pt['photo'] ?? '', 0, 40) . PHP_EOL;
}


// 2. Top interventions les plus lourdes
echo "\\n=== TOP 10 INTERVENTIONS LES PLUS LOURDES ===\\n";
\$max = \$pdo->query("SELECT id, nom_client, statut, 
  round(length(whatsapp_photos)/1024/1024, 2) as wa_mb,
  round(length(points_gps)/1024/1024, 2) as gps_mb,
  round((length(coalesce(whatsapp_photos,'')) + length(coalesce(points_gps,'')) + length(coalesce(signature_client,'')) + length(coalesce(signature_technicien,'')))/1024/1024, 2) as total_mb,
  modifie_le
FROM interventions 
ORDER BY (length(coalesce(whatsapp_photos,'')) + length(coalesce(points_gps,''))) DESC LIMIT 10");
print_r(\$max->fetchAll(PDO::FETCH_ASSOC));

// 3. MySQL / PHP limites
echo "\\n=== CONFIG PHP / MYSQL ===\\n";
echo "post_max_size: " . ini_get('post_max_size') . "\\n";
echo "upload_max_filesize: " . ini_get('upload_max_filesize') . "\\n";
echo "memory_limit: " . ini_get('memory_limit') . "\\n";
echo "max_execution_time: " . ini_get('max_execution_time') . "\\n";
// 4. Dossou photos inspection
echo "\\n=== DOSSOU PHOTOS DETAILS ===\\n";
\$dossou = \$pdo->query("SELECT id, nom_client, whatsapp_photos, points_gps FROM interventions WHERE id = '1e64109d-26b6-47aa-87ee-1fa60d0bd59b'")->fetch(PDO::FETCH_ASSOC);
\$wa = json_decode(\$dossou['whatsapp_photos'] ?? '[]', true) ?? [];
echo "Nombre de photos WA: " . count(\$wa) . "\\n";
foreach (\$wa as \$idx => \$p) {
  \$len = strlen(\$p['url'] ?? '');
  echo "  Photo WA #" . (\$idx+1) . " [id=" . (\$p['id'] ?? '') . ", slot=" . (\$p['slot'] ?? '') . "] size: " . round(\$len/1024, 1) . " KB (format: " . substr(\$p['url'] ?? '', 0, 30) . "...)\\n";
}
\$gps = json_decode(\$dossou['points_gps'] ?? '[]', true) ?? [];
echo "Nombre de points GPS: " . count(\$gps) . "\\n";
foreach (\$gps as \$idx => \$pt) {
  \$len = strlen(\$pt['photo'] ?? '');
  if (\$len > 0) {
    echo "  Point GPS #" . (\$idx+1) . " [id=" . (\$pt['id'] ?? '') . ", type=" . (\$pt['type'] ?? '') . "] photo size: " . round(\$len/1024, 1) . " KB\\n";
  }
}
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }
    const ws = sftp.createWriteStream('/home/u795734321/audit_test.php');
    ws.on('close', () => {
      conn.exec('php /home/u795734321/audit_test.php && rm /home/u795734321/audit_test.php', (execErr, stream) => {
        if (execErr) {
          console.error('Exec error:', execErr);
          conn.end();
          return;
        }
        stream.on('close', () => conn.end());
        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));
      });
    });
    ws.on('error', (e) => {
      console.error('write error:', e);
      conn.end();
    });
    ws.end(phpScript);
  });
}).connect({
  host,
  port,
  username,
  privateKey: fs.readFileSync(privateKeyPath)
});

