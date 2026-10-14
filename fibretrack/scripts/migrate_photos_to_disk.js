import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';

const phpScript = `<?php
require '/home/u795734321/domains/fibretrack.mantota.com/public_html/api/_env.php';
\$pdo = new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_NAME').';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASS'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

function saveBase64ImageToDisk(string \$base64, string \$interventionId, string \$filenamePrefix = 'photo'): string {
  if (empty(\$base64)) return '';
  if (str_starts_with(\$base64, 'http://') || str_starts_with(\$base64, 'https://')) return \$base64;
  if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,(.+)$#si', \$base64, \$m)) return \$base64;

  \$binary = base64_decode(\$m[2]);
  if (!\$binary) return \$base64;

  \$src = @imagecreatefromstring(\$binary);
  if (\$src) {
    \$w = imagesx(\$src);
    \$h = imagesy(\$src);
    \$maxDim = 1280;
    if (\$w > \$maxDim || \$h > \$maxDim) {
      if (\$w > \$h) {
        \$targetH = (int)round((\$h * \$maxDim) / \$w);
        \$targetW = \$maxDim;
      } else {
        \$targetW = (int)round((\$w * \$maxDim) / \$h);
        \$targetH = \$maxDim;
      }
      \$dst = imagecreatetruecolor(\$targetW, \$targetH);
      imagecopyresampled(\$dst, \$src, 0, 0, 0, 0, \$targetW, \$targetH, \$w, \$h);
      imagedestroy(\$src);
      \$src = \$dst;
    }
    ob_start();
    imagejpeg(\$src, null, 78);
    \$outBin = ob_get_clean();
    imagedestroy(\$src);
    if (\$outBin) \$binary = \$outBin;
  }

  \$safeIntvId = preg_replace('/[^a-zA-Z0-9_-]/', '', \$interventionId) ?: 'common';
  \$relativeDir = 'uploads/photos/' . \$safeIntvId;
  \$baseDir = '/home/u795734321/domains/fibretrack.mantota.com/public_html/api';
  \$absoluteDir = \$baseDir . '/' . \$relativeDir;
  if (!is_dir(\$absoluteDir)) {
    @mkdir(\$absoluteDir, 0755, true);
  }

  \$safePrefix = preg_replace('/[^a-zA-Z0-9_-]/', '', \$filenamePrefix) ?: 'photo';
  \$filename = \$safePrefix . '_' . substr(md5(\$binary), 0, 10) . '.jpg';
  \$filePath = \$absoluteDir . '/' . \$filename;
  file_put_contents(\$filePath, \$binary);

  return 'https://fibretrack.mantota.com/api/' . \$relativeDir . '/' . \$filename;
}

echo "=== MIGRATION PHOTOS EN FICHIERS REELS SUR DISQUE SSD HOSTINGER ===\\n";

// 1. Taille initiale BDD
\$s1 = \$pdo->query("SELECT 
  round(sum(length(whatsapp_photos))/1024/1024, 2) as wa_mb,
  round(sum(length(points_gps))/1024/1024, 2) as gps_mb
FROM interventions")->fetch(PDO::FETCH_ASSOC);
echo "Taille BDD initiale : WA = " . \$s1['wa_mb'] . " MB, GPS = " . \$s1['gps_mb'] . " MB\\n";



\$stmt = \$pdo->query("SELECT id, nom_client, whatsapp_photos, points_gps FROM interventions WHERE whatsapp_photos LIKE '%data:image%' OR points_gps LIKE '%data:image%'");
\$rows = \$stmt->fetchAll(PDO::FETCH_ASSOC);
echo "Nombre d'interventions avec photos Base64 à migrer : " . count(\$rows) . "\\n\\n";

\$totalFilesCreated = 0;

foreach (\$rows as \$idx => \$row) {
  \$id = \$row['id'];
  \$wa = json_decode(\$row['whatsapp_photos'] ?? '[]', true) ?? [];
  \$gps = json_decode(\$row['points_gps'] ?? '[]', true) ?? [];

  \$modified = false;

  foreach (\$wa as &\$ph) {
    if (!empty(\$ph['url']) && str_starts_with(\$ph['url'], 'data:image')) {
      \$slot = !empty(\$ph['slot']) ? \$ph['slot'] : (!empty(\$ph['type']) ? \$ph['type'] : 'wa');
      \$ph['url'] = saveBase64ImageToDisk(\$ph['url'], \$id, \$slot);
      \$totalFilesCreated++;
      \$modified = true;
    }
  }
  unset(\$ph);

  foreach (\$gps as &\$pt) {
    if (!empty(\$pt['photo']) && str_starts_with(\$pt['photo'], 'data:image')) {
      \$ptType = !empty(\$pt['type']) ? \$pt['type'] : 'poteau';
      \$num = \$pt['numero'] ?? '';
      \$prefix = \$ptType . (\$num !== '' ? '_' . \$num : '');
      \$pt['photo'] = saveBase64ImageToDisk(\$pt['photo'], \$id, \$prefix);
      \$totalFilesCreated++;
      \$modified = true;
    }
  }
  unset(\$pt);

  if (\$modified) {
    \$up = \$pdo->prepare("UPDATE interventions SET whatsapp_photos = ?, points_gps = ? WHERE id = ?");
    \$up->execute([json_encode(\$wa), json_encode(\$gps), \$id]);
    echo "[" . (\$idx+1) . "/" . count(\$rows) . "] Migré: " . \$row['nom_client'] . " (" . count(\$wa) . " photos WA, " . count(\$gps) . " points GPS)\\n";
  }
}

echo "\\n=== MIGRATION TERMINEE AVEC SUCCES ===\\n";
echo "Total fichiers créés sur le disque SSD : " . \$totalFilesCreated . "\\n";

\$s2 = \$pdo->query("SELECT 
  count(*) as total_interventions,
  round(sum(length(whatsapp_photos))/1024, 2) as wa_kb,
  round(sum(length(points_gps))/1024, 2) as gps_kb
FROM interventions")->fetch(PDO::FETCH_ASSOC);
echo "Taille BDD finale : WA = " . \$s2['wa_kb'] . " KB, GPS = " . \$s2['gps_kb'] . " KB\\n";
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }
    const ws = sftp.createWriteStream('/home/u795734321/migrate_disk_task.php');
    ws.on('close', () => {
      conn.exec('php /home/u795734321/migrate_disk_task.php && rm /home/u795734321/migrate_disk_task.php', (execErr, stream) => {
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
