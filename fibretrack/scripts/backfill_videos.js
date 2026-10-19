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
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// 1. Récupérer toutes les vidéos dans intervention_media
$stmt = $pdo->query("SELECT * FROM intervention_media WHERE type IN ('video', 'video_terrain') OR file_path LIKE '%.mp4' OR file_path LIKE '%.mov' OR file_path LIKE '%.webm' ORDER BY captured_at ASC");
$medias = $stmt->fetchAll(PDO::FETCH_ASSOC);

$byIntv = [];
foreach ($medias as $m) {
    $intvId = $m['intervention_id'];
    if (!isset($byIntv[$intvId])) $byIntv[$intvId] = [];
    $byIntv[$intvId][] = $m;
}

$updatedCount = 0;

foreach ($byIntv as $intvId => $vids) {
    $stmtIntv = $pdo->prepare("SELECT id, nom_client, videos_terrain FROM interventions WHERE id = ?");
    $stmtIntv->execute([$intvId]);
    $intv = $stmtIntv->fetch(PDO::FETCH_ASSOC);
    if (!$intv) continue;

    $currVideos = json_decode($intv['videos_terrain'] ?? '[]', true);
    if (!is_array($currVideos)) $currVideos = [];

    $existingById = [];
    foreach ($currVideos as $v) {
        if (!empty($v['id'])) $existingById[$v['id']] = $v;
    }

    $idx = count($currVideos);
    foreach ($vids as $m) {
        $mId = $m['id'];
        $filePath = ltrim($m['file_path'], '/');
        $fullPath = "${remoteBase}/api/" . $filePath;
        $size = file_exists($fullPath) ? (int)filesize($fullPath) : 0;
        $url = "https://fibretrack.mantota.com/api/" . $filePath;
        
        $thumbRelative = dirname($filePath) . '/' . $mId . '_thumb.jpg';
        $thumbFull = "${remoteBase}/api/" . $thumbRelative;
        $thumbUrl = file_exists($thumbFull) ? "https://fibretrack.mantota.com/api/" . $thumbRelative : ($existingById[$mId]['thumbnail_url'] ?? '');

        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $isMov = ($ext === 'mov');

        if (!isset($existingById[$mId])) {
            $idx++;
            $currVideos[] = [
                'id' => $mId,
                'url' => $url,
                'thumbnail_url' => $thumbUrl,
                'size' => $size,
                'duration' => 0,
                'label' => "Vidéo Terrain #$idx - " . ($intv['nom_client'] ?: 'Dossier'),
                'nom_client' => $intv['nom_client'] ?: '',
                'lieu' => '',
                'lat' => ($m['latitude'] !== null && (float)$m['latitude'] != 0) ? (float)$m['latitude'] : null,
                'lng' => ($m['longitude'] !== null && (float)$m['longitude'] != 0) ? (float)$m['longitude'] : null,
                'precision_m' => ($m['precision_m'] !== null && (float)$m['precision_m'] != 0) ? (float)$m['precision_m'] : null,
                'horodatage' => $m['captured_at'] ?: date('Y-m-d H:i:s'),
                'captured_at' => $m['captured_at'] ?: date('Y-m-d H:i:s'),
                'ajoute_par' => $m['added_by'] ?: 'Technicien',
                'is_imported' => ($m['latitude'] === null || (float)$m['latitude'] == 0),
                'source' => ($m['latitude'] !== null && (float)$m['latitude'] != 0) ? 'camera' : 'gallery',
                'format' => $ext,
            ];
        } else {
            // Mettre à jour l'URL et la taille si manquantes
            foreach ($currVideos as &$cv) {
                if ($cv['id'] === $mId) {
                    if (empty($cv['url'])) $cv['url'] = $url;
                    if (empty($cv['thumbnail_url']) && $thumbUrl) $cv['thumbnail_url'] = $thumbUrl;
                    if (!$cv['size'] && $size) $cv['size'] = $size;
                    if (!isset($cv['format'])) $cv['format'] = $ext;
                    break;
                }
            }
            unset($cv);
        }
    }

    $upStmt = $pdo->prepare("UPDATE interventions SET videos_terrain = ?, modifie_le = NOW() WHERE id = ?");
    $upStmt->execute([json_encode($currVideos, JSON_UNESCAPED_UNICODE), $intvId]);
    $updatedCount++;
    echo "Reconciled $intvId (" . $intv['nom_client'] . ") => " . count($currVideos) . " videos\\n";
}

echo "TOTAL RECONCILED: $updatedCount interventions updated!\\n";
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
