import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';

const phpScript = `<?php
require '/home/u795734321/domains/fibretrack.mantota.com/public_html/api/_env.php';
\$pdo = new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_NAME').';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASS'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

function compressBase64(string \$dataUrl, int \$maxDim = 1280, int \$quality = 75): string {
  if (strlen(\$dataUrl) < 180000) return \$dataUrl; // déjà léger (< 180 KB)
  if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,(.+)$#si', \$dataUrl, \$m)) return \$dataUrl;
  \$binary = base64_decode(\$m[2]);
  if (!\$binary) return \$dataUrl;
  \$src = @imagecreatefromstring(\$binary);
  if (!\$src) return \$dataUrl;
  \$w = imagesx(\$src);
  \$h = imagesy(\$src);
  if (\$w <= 0 || \$h <= 0) { imagedestroy(\$src); return \$dataUrl; }

  \$targetW = \$w;
  \$targetH = \$h;
  if (\$w > \$maxDim || \$h > \$maxDim) {
    if (\$w > \$h) {
      \$targetH = (int)round((\$h * \$maxDim) / \$w);
      \$targetW = \$maxDim;
    } else {
      \$targetW = (int)round((\$w * \$maxDim) / \$h);
      \$targetH = \$maxDim;
    }
  }

  \$dst = imagecreatetruecolor(\$targetW, \$targetH);
  imagecopyresampled(\$dst, \$src, 0, 0, 0, 0, \$targetW, \$targetH, \$w, \$h);
  imagedestroy(\$src);

  ob_start();
  imagejpeg(\$dst, null, \$quality);
  \$outBin = ob_get_clean();
  imagedestroy(\$dst);

  if (\$outBin && strlen(\$outBin) < strlen(\$binary)) {
    return 'data:image/jpeg;base64,' . base64_encode(\$outBin);
  }
  return \$dataUrl;
}

echo "=== MIGRATION COMPRESSION DES PHOTOS EN BASE DE DONNEES ===\\n";
\$stmt = \$pdo->query("SELECT id, nom_client, length(whatsapp_photos) as wa_len, length(points_gps) as gps_len FROM interventions WHERE length(whatsapp_photos) > 200000 OR length(points_gps) > 200000");
\$heavy = \$stmt->fetchAll(PDO::FETCH_ASSOC);
echo "Nombre d'interventions avec photos lourdes: " . count(\$heavy) . "\\n";

\$totalSaved = 0;

foreach (\$heavy as \$idx => \$row) {
  \$id = \$row['id'];
  \$full = \$pdo->query("SELECT whatsapp_photos, points_gps FROM interventions WHERE id = " . \$pdo->quote(\$id))->fetch(PDO::FETCH_ASSOC);
  \$initialSize = strlen(\$full['whatsapp_photos'] ?? '') + strlen(\$full['points_gps'] ?? '');

  // 1. WhatsApp photos
  \$wa = json_decode(\$full['whatsapp_photos'] ?? '[]', true) ?? [];
  \$seenSlots = [];
  \$cleanWa = [];
  foreach (\$wa as \$p) {
    if (empty(\$p)) continue;
    \$slot = \$p['slot'] ?? '';
    // Si c'est un slot unique (pas additionnelle), éviter les doublons stricts
    if (!empty(\$slot) && empty(\$p['additionnelle']) && empty(\$p['is_additionnelle'])) {
      if (isset(\$seenSlots[\$slot])) {
        // Déjà vu ce slot, ne pas dupliquer
        continue;
      }
      \$seenSlots[\$slot] = true;
    }
    if (!empty(\$p['url'])) {
      \$p['url'] = compressBase64(\$p['url'], 1280, 75);
    }
    \$cleanWa[] = \$p;
  }

  // 2. Points GPS
  \$gps = json_decode(\$full['points_gps'] ?? '[]', true) ?? [];
  \$cleanGps = [];
  foreach (\$gps as \$pt) {
    if (empty(\$pt)) continue;
    if (!empty(\$pt['photo'])) {
      \$pt['photo'] = compressBase64(\$pt['photo'], 1280, 75);
    }
    \$cleanGps[] = \$pt;
  }

  \$newWaJson = json_encode(\$cleanWa);
  \$newGpsJson = json_encode(\$cleanGps);
  \$finalSize = strlen(\$newWaJson) + strlen(\$newGpsJson);

  \$up = \$pdo->prepare("UPDATE interventions SET whatsapp_photos = ?, points_gps = ? WHERE id = ?");
  \$up->execute([\$newWaJson, \$newGpsJson, \$id]);

  \$saved = \$initialSize - \$finalSize;
  \$totalSaved += \$saved;
  echo "[" . (\$idx+1) . "/" . count(\$heavy) . "] " . \$row['nom_client'] . ": " . round(\$initialSize/1024/1024, 2) . " MB -> " . round(\$finalSize/1024/1024, 2) . " MB (gain: " . round(\$saved/1024/1024, 2) . " MB)\\n";
}

echo "\\n=== MIGRATION TERMINEE ===\\n";
echo "Espace total gagne: " . round(\$totalSaved/1024/1024, 2) . " MB\\n";

\$s = \$pdo->query("SELECT 
  count(*) as total_interventions,
  round(sum(length(whatsapp_photos))/1024/1024, 2) as wa_mb,
  round(sum(length(points_gps))/1024/1024 as gps_mb
FROM interventions");
print_r(\$s->fetch(PDO::FETCH_ASSOC));
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }
    const ws = sftp.createWriteStream('/home/u795734321/db_compress_task.php');
    ws.on('close', () => {
      conn.exec('php /home/u795734321/db_compress_task.php && rm /home/u795734321/db_compress_task.php', (execErr, stream) => {
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
