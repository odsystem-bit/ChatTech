<?php
require_once __DIR__ . '/_env.php';
require_once __DIR__ . '/vendor/autoload.php';

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'u795734321_fibre');
define('DB_USER', getenv('DB_USER') ?: 'u795734321_fibretrack');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_CHARSET', getenv('DB_CHARSET') ?: 'utf8mb4');

// Correspondance stricte entre les en-tetes du fichier Excel d'inventaire
// (feuille "POINT GENERAL", bloc STOCK RESTANT) et les designations internes.
// Seuls ces articles existent en stock (choix explicite : remplacement strict).
define('STOCK_EXCEL_MAP', [
  'ont'            => ['excel_header' => 'ONT',     'label' => 'ONT'],
  'pto'            => ['excel_header' => 'PTO',     'label' => 'PTO'],
  'jarretiere'     => ['excel_header' => 'JAR',     'label' => 'Jarretière'],
  'piton'          => ['excel_header' => 'PIT',     'label' => 'Piton'],
  'cheville'       => ['excel_header' => 'CHE',     'label' => 'Cheville'],
  'connecteur'     => ['excel_header' => 'CON',     'label' => 'Connecteur'],
  'closer'         => ['excel_header' => 'CLO',     'label' => 'Closer'],
  'fibre_1fo'      => ['excel_header' => '1FO',     'label' => 'Câble Fibre 1FO'],
  'cpc_50'         => ['excel_header' => 'CPC 50',  'label' => 'Câble CPC 50'],
  'cpc_100'        => ['excel_header' => 'CPC 100', 'label' => 'Câble CPC 100'],
  'cpc_150'        => ['excel_header' => 'CPC 150', 'label' => 'Câble CPC 150'],
  'cpc_200'        => ['excel_header' => 'CPC 200', 'label' => 'Câble CPC 200'],
  'cpc_250'        => ['excel_header' => 'CPC 250', 'label' => 'Câble CPC 250'],
  'cpc_300'        => ['excel_header' => 'CPC 300', 'label' => 'Câble CPC 300'],
  'cpc_350'        => ['excel_header' => 'CPC 350', 'label' => 'Câble CPC 350'],
  'crochets'       => ['excel_header' => 'CRO',     'label' => 'Crochets'],
  'pince'          => ['excel_header' => 'PINCE',   'label' => 'Pince'],
  'susp'           => ['excel_header' => 'SUS',     'label' => 'Suspente'],
  'traverse_13t'   => ['excel_header' => 'CT 13',   'label' => 'Traverse 13T'],
  'traverse_15t'   => ['excel_header' => 'CT 15',   'label' => 'Traverse 15T'],
]);

function canonicalDesignation($designation) {
  $normalized = strtolower(trim((string)$designation));
  $aliases = [
    'connecteur mecanique' => 'connecteur',
    'connecteur mécanique' => 'connecteur',
    'connecteur' => 'connecteur',
    'ont box' => 'ont',
    'box ont' => 'ont',
    'routeur ont' => 'ont',
    'otp' => 'ont',
    'otp / ont' => 'ont',
    'ont / otp' => 'ont',
    'pto fibre' => 'pto',
    'prise pto' => 'pto',
  ];
  return $aliases[$normalized] ?? trim((string)$designation);
}

function buildTotalMaterielPose(array $d): array {
  $incomingMat = $d['materiel_pose'] ?? [];
  if (is_object($incomingMat)) $incomingMat = (array)$incomingMat;
  if (!is_array($incomingMat)) $incomingMat = [];

  // Déduplication stricte OTP / ONT pour éviter tout double décompte de stock
  if (isset($incomingMat['otp']) || isset($incomingMat['ont'])) {
    $ontVal = max((int)($incomingMat['ont'] ?? 0), (int)($incomingMat['otp'] ?? 0));
    unset($incomingMat['otp']);
    $incomingMat['ont'] = $ontVal;
  }

  $total = [];
  foreach ($incomingMat as $rawDesig => $qty) {
    $canon = canonicalDesignation($rawDesig);
    $q = (int)$qty;
    if ($q > 0) {
      $total[$canon] = ($total[$canon] ?? 0) + $q;
    }
  }

  // Déduction automatique ONT posé (1 unité) si serial number / mac renseigné
  if (!empty($d['ont_sn']) || !empty($d['sn']) || !empty($d['mac'])) {
    if (!isset($total['ont'])) {
      $total['ont'] = 1;
    }
  }

  // Déduction automatique PTO posé
  $ptoQte = (int)($d['pto_qte'] ?? 0);
  if ($ptoQte > 0 && !isset($total['pto'])) {
    $total['pto'] = $ptoQte;
  }

  // Déduction automatique Répéteur WiFi posé
  $repeteurQte = (int)($d['repeteur_wifi_qte'] ?? 0);
  if ($repeteurQte > 0 && !isset($total['repeteur_wifi'])) {
    $total['repeteur_wifi'] = $repeteurQte;
  }

  // Déduction automatique Jarretière optique si renseignée
  $jarretiereQte = (int)($d['jarretiere_qte'] ?? 0);
  if ($jarretiereQte > 0 && !isset($total['jarretiere'])) {
    $total['jarretiere'] = $jarretiereQte;
  }

  return $total;
}

function saveBase64ImageToDisk(string $base64, string $interventionId, string $filenamePrefix = 'photo'): string {
  if (empty($base64)) return '';
  // Si c'est déjà une URL HTTP/HTTPS, ne rien faire
  if (str_starts_with($base64, 'http://') || str_starts_with($base64, 'https://')) {
    return $base64;
  }
  // Si ce n'est pas un format data:image, retourner tel quel
  if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,(.+)$#si', $base64, $m)) {
    return $base64;
  }

  $binary = base64_decode($m[2]);
  if (!$binary) return $base64;

  // Compression à 1280px max / 78 qualité avant écriture sur disque SSD
  $src = @imagecreatefromstring($binary);
  if ($src) {
    $w = imagesx($src);
    $h = imagesy($src);
    $maxDim = 1280;
    if ($w > $maxDim || $h > $maxDim) {
      if ($w > $h) {
        $targetH = (int)round(($h * $maxDim) / $w);
        $targetW = $maxDim;
      } else {
        $targetW = (int)round(($w * $maxDim) / $h);
        $targetH = $maxDim;
      }
      $dst = imagecreatetruecolor($targetW, $targetH);
      imagecopyresampled($dst, $src, 0, 0, 0, 0, $targetW, $targetH, $w, $h);
      imagedestroy($src);
      $src = $dst;
    }
    ob_start();
    imagejpeg($src, null, 78);
    $outBin = ob_get_clean();
    imagedestroy($src);
    if ($outBin) $binary = $outBin;
  }

  $safeIntvId = preg_replace('/[^a-zA-Z0-9_-]/', '', $interventionId) ?: 'common';
  $relativeDir = 'uploads/photos/' . $safeIntvId;
  $absoluteDir = __DIR__ . '/' . $relativeDir;
  if (!is_dir($absoluteDir)) {
    @mkdir($absoluteDir, 0755, true);
  }

  $safePrefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $filenamePrefix) ?: 'photo';
  $filename = $safePrefix . '_' . substr(md5($binary), 0, 10) . '.jpg';
  $filePath = $absoluteDir . '/' . $filename;
  file_put_contents($filePath, $binary);

  return 'https://fibretrack.mantota.com/api/' . $relativeDir . '/' . $filename;
}



function lockStockQuantity(PDO $pdo, string $designation): int {
  $ensure = $pdo->prepare('INSERT INTO stock (designation, quantite) VALUES (?, 0) ON DUPLICATE KEY UPDATE designation = VALUES(designation)');
  $ensure->execute([$designation]);
  $stmt = $pdo->prepare('SELECT quantite FROM stock WHERE designation = ? FOR UPDATE');
  $stmt->execute([$designation]);
  return (int)$stmt->fetchColumn();
}

function changeStockQuantity(PDO $pdo, string $designation, int $delta, array $details = [], bool $allowNegative = false): int {
  $designation = canonicalDesignation($designation);
  if ($designation === '') throw new Exception('Désignation requise');
  $current = lockStockQuantity($pdo, $designation);
  $next = $current + $delta;
  if (!$allowNegative && $next < 0) {
    throw new Exception("Stock insuffisant pour $designation (actuel: $current, demandé: " . abs($delta) . ")");
  }
  $stmt = $pdo->prepare('UPDATE stock SET quantite = ? WHERE designation = ?');
  $stmt->execute([$next, $designation]);
  if ($delta !== 0) {
    $type = $delta > 0 ? 'entree' : 'sortie';
    $stmt = $pdo->prepare('INSERT INTO stock_movements (designation, type, quantite, intervention_id, nom_client, nom_technicien, motif) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$designation, $type, abs($delta), $details['intervention_id'] ?? null, $details['nom_client'] ?? null, $details['nom_technicien'] ?? null, $details['motif'] ?? null]);
  }
  return $next;
}

function setStockQuantity(PDO $pdo, string $designation, int $quantity, array $details = []): int {
  if ($quantity < 0) throw new Exception('La quantité ne peut pas être négative');
  $current = lockStockQuantity($pdo, trim($designation));
  return changeStockQuantity($pdo, trim($designation), $quantity - $current, $details, false);
}

function db() {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    try {
      $hasCol = $pdo->query("SHOW COLUMNS FROM interventions LIKE 'videos_terrain'")->fetch();
      if (!$hasCol) {
        $pdo->exec("ALTER TABLE interventions ADD COLUMN videos_terrain LONGTEXT NULL");
      }
      // Correction rétroactive du bug d'addition ONT/OTP (1+1=2) sur les interventions récentes créées sans matériel posé
      $pdo->exec("UPDATE interventions SET materiel_pose = JSON_SET(materiel_pose, '$.ont', 1) 
                  WHERE JSON_EXTRACT(materiel_pose, '$.ont') = 2 
                    AND (ont_sn IS NULL OR ont_sn = '') 
                    AND (points_gps IS NULL OR points_gps = '[]' OR points_gps = '')
                    AND date >= DATE_SUB(NOW(), INTERVAL 3 DAY)");
      $pdo->exec("UPDATE interventions SET materiel_pose = JSON_REMOVE(materiel_pose, '$.otp') 
                  WHERE JSON_CONTAINS_PATH(materiel_pose, 'one', '$.otp')");
    } catch (Exception $e) {}
  }
  return $pdo;
}

function normalizeMaterielPose(&$mp) {
  if (is_string($mp)) $mp = json_decode($mp, true);
  if (!is_array($mp)) return;
  if (isset($mp['otp'])) {
    $mp['ont'] = max((int)($mp['ont'] ?? 0), (int)$mp['otp']);
    unset($mp['otp']);
  }
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Code, x-user-code, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$rawAction = (string)($_GET['action'] ?? '');
$action = explode('?', $rawAction)[0];
$action = explode('&', $action)[0];
$action = trim($action);
$rawBody = file_get_contents('php://input');
$input = json_decode($rawBody, true);
// Corps présent mais JSON indécodable (requête tronquée par une limite
// serveur : client_max_body_size, post_max_size…) → erreur explicite
// au lieu de poursuivre avec un tableau vide (sauvegarde fantôme).
if ($input === null && strlen((string)$rawBody) > 0) {
  http_response_code(400);
  echo json_encode(['error' => 'Corps de requête invalide ou tronqué (taille ?)']);
  exit;
}
$input = $input ?? [];

function normalizeInterventionTypes(array &$r): void {
  $r['nom_technicien'] = (string)($r['nom_technicien'] ?? '');
  $r['nom_client'] = (string)($r['nom_client'] ?? '');
  $r['nom_dossier'] = (string)($r['nom_dossier'] ?? $r['nom_client'] ?? '');
  if ($r['nom_dossier'] !== '' && $r['nom_client'] === '') {
    $r['nom_client'] = $r['nom_dossier'];
  } elseif ($r['nom_client'] !== '' && $r['nom_dossier'] === '') {
    $r['nom_dossier'] = $r['nom_client'];
  }
  $r['adresse_zone'] = (string)($r['adresse_zone'] ?? '');
  $r['telephone_ligne'] = (string)($r['telephone_ligne'] ?? '');
  $r['mobile'] = (string)($r['mobile'] ?? '');
  $r['etat'] = (string)($r['etat'] ?? 'PON');
  $r['msan'] = (string)($r['msan'] ?? '');
  $r['fat_ref'] = (string)($r['fat_ref'] ?? '');
  $r['port'] = (string)($r['port'] ?? '');
  $r['ports_disponibles'] = (string)($r['ports_disponibles'] ?? '');
  $r['type_cable'] = (string)($r['type_cable'] ?? '');
  $r['mac'] = (string)($r['mac'] ?? '');
  $r['sn'] = (string)($r['sn'] ?? '');
  $r['ont_sn'] = (string)($r['ont_sn'] ?? '');
  $r['emplacement_ont'] = (string)($r['emplacement_ont'] ?? '');
  $r['offre_souscrite'] = (string)($r['offre_souscrite'] ?? 'Fibre Pro');
  $r['appreciation_satisfaction_libre'] = (string)($r['appreciation_satisfaction_libre'] ?? '');
  $r['qualite'] = (string)($r['qualite'] ?? 'Satisfait');
  $r['delais'] = (string)($r['delais'] ?? 'Satisfait');
  $r['professionnalisme'] = (string)($r['professionnalisme'] ?? 'Satisfait');
  $r['nom_client_declaration'] = (string)($r['nom_client_declaration'] ?? '');
  $r['remarque_libre'] = (string)($r['remarque_libre'] ?? '');
  $r['signature_client'] = (string)($r['signature_client'] ?? '');
  $r['signature_technicien'] = (string)($r['signature_technicien'] ?? '');
  $r['modifie_par'] = (string)($r['modifie_par'] ?? '');
  $r['statut'] = (string)($r['statut'] ?? 'en_cours');
  $r['depart_m'] = is_numeric($r['depart_m'] ?? null) ? (float)$r['depart_m'] : 0.0;
  $r['arrivee_m'] = is_numeric($r['arrivee_m'] ?? null) ? (float)$r['arrivee_m'] : 0.0;
  $r['lineaire_m'] = is_numeric($r['lineaire_m'] ?? null) ? (float)$r['lineaire_m'] : 0.0;
  $r['puissance_fat_dbm'] = is_numeric($r['puissance_fat_dbm'] ?? null) ? (float)$r['puissance_fat_dbm'] : 0.0;
  $r['puissance_pto_dbm'] = is_numeric($r['puissance_pto_dbm'] ?? null) ? (float)$r['puissance_pto_dbm'] : 0.0;
  $r['debit_descendant'] = (string)($r['debit_descendant'] ?? '');
  $r['debit_montant'] = (string)($r['debit_montant'] ?? '');
  $r['debit_ping'] = (string)($r['debit_ping'] ?? '');
  $r['nb_poteaux_traverses'] = (int)($r['nb_poteaux_traverses'] ?? 0);
  $r['nb_poteaux_implantes'] = (int)($r['nb_poteaux_implantes'] ?? 0);
  $r['nb_poteaux_armes'] = (int)($r['nb_poteaux_armes'] ?? 0);
  $r['pto_qte'] = (int)($r['pto_qte'] ?? 0);
  $r['repeteur_wifi_qte'] = (int)($r['repeteur_wifi_qte'] ?? 0);
  $r['port_disponible'] = (int)($r['port_disponible'] ?? 0);
  $r['client_confirme_emplacement'] = (bool)($r['client_confirme_emplacement'] ?? false);
  $r['remise_equipement_ok'] = (bool)($r['remise_equipement_ok'] ?? false);
  $r['travaux_conformes'] = (bool)($r['travaux_conformes'] ?? false);
  $r['emplacement_valide'] = (bool)($r['emplacement_valide'] ?? false);
  $r['travail_propre'] = (bool)($r['travail_propre'] ?? false);
  $r['service_teste'] = (bool)($r['service_teste'] ?? false);
  $r['service_fonctionne'] = (bool)($r['service_fonctionne'] ?? false);
  $r['explications_donnees'] = (bool)($r['explications_donnees'] ?? false);
  $r['recommanderait'] = (bool)($r['recommanderait'] ?? false);
  $r['accepte_recontact'] = (bool)($r['accepte_recontact'] ?? false);
  $r['videos_terrain'] = is_array($r['videos_terrain'] ?? null) ? $r['videos_terrain'] : (json_decode($r['videos_terrain'] ?? '[]', true) ?: []);
}

function authenticatedUser() {
  static $user = null;
  static $checked = false;
  if ($checked) return $user;
  $checked = true;
  $headerCode = '';
  if (function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    foreach ($headers as $k => $v) {
      if (strcasecmp($k, 'X-User-Code') === 0) {
        $headerCode = trim($v);
        break;
      }
    }
  }
  global $input;
  $candidates = [
    $_SERVER['HTTP_X_USER_CODE'] ?? null,
    $_SERVER['REDIRECT_HTTP_X_USER_CODE'] ?? null,
    $headerCode,
    $_GET['user_code'] ?? null,
    $_GET['code'] ?? null,
    $_POST['user_code'] ?? null,
    $_POST['code'] ?? null,
    $input['user_code'] ?? null,
    $input['code'] ?? null,
  ];
  $code = '';
  foreach ($candidates as $c) {
    if ($c !== null) {
      $val = trim((string)$c);
      if ($val !== '') {
        $code = $val;
        break;
      }
    }
  }
  if ($code === '9999') return $user = ['id' => 'admin', 'nom' => 'ADMIN', 'is_admin' => true];
  if ($code === '' || !preg_match('/^\d{4}$/', $code)) return null;
  $stmt = db()->prepare('SELECT id, nom FROM accounts WHERE code = ?');
  $stmt->execute([$code]);
  $row = $stmt->fetch();
  return $user = $row ? ['id' => $row['id'], 'nom' => $row['nom'], 'is_admin' => false] : null;
}

function requireAuth($adminOnly = false) {
  $user = authenticatedUser();
  if (!$user || ($adminOnly && !$user['is_admin'])) {
    http_response_code(401);
    echo json_encode(['error' => $adminOnly ? 'Droits administrateur requis' : 'Authentification requise']);
    exit;
  }
  return $user;
}

$publicActions = ['account_validate', 'app_version'];
$adminActions = ['accounts_list', 'account_add', 'account_delete', 'stock_save', 'stock_import', 'stock_import_excel'];
if (!in_array($action, $publicActions, true)) {
  requireAuth(in_array($action, $adminActions, true));
}

try {
  if ($action === 'media_upload') {
    $user = requireAuth();
    $interventionId = trim($_POST['intervention_id'] ?? '');
    $interventionId = preg_replace('/[^a-zA-Z0-9_-]/', '', $interventionId);
    $type = $_POST['type'] ?? '';
    if (!$interventionId || !in_array($type, ['photo', 'video', 'fiche'], true) || empty($_FILES['file']['tmp_name'])) {
      http_response_code(400);
      echo json_encode(['error' => 'Intervention, type et fichier requis']);
      return;
    }
    // Ne pas exiger que la fiche existe déjà : sur terrain à réseau
    // intermittent, le média peut arriver avant le premier save —
    // le rejet forçait le technicien à refaire la prise plusieurs fois.
    $extension = 'jpg';
    if ($type === 'video') {
      $clientExt = strtolower(pathinfo($_FILES['file']['name'] ?? '', PATHINFO_EXTENSION));
      $extension = in_array($clientExt, ['mp4', 'webm', 'mov', 'm4v'], true) ? $clientExt : 'mp4';
    } elseif ($type === 'fiche' && strtolower(pathinfo($_FILES['file']['name'] ?? '', PATHINFO_EXTENSION)) === 'pdf') {
      $extension = 'pdf';
    }
    $mediaId = bin2hex(random_bytes(16));
    $relativeDir = 'uploads/interventions/' . $interventionId;
    $absoluteDir = __DIR__ . '/' . $relativeDir;
    if (!is_dir($absoluteDir)) mkdir($absoluteDir, 0755, true);
    $relativePath = $relativeDir . '/' . $mediaId . '.' . $extension;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], __DIR__ . '/' . $relativePath)) {
      http_response_code(500); echo json_encode(['error' => 'Impossible de stocker le média']); return;
    }

    $thumbUrl = '';
    if (!empty($_POST['thumbnail_base64'])) {
      $rawThumb = (string)$_POST['thumbnail_base64'];
      $thumbBin = base64_decode(preg_replace('#^data:image/\w+;base64,#i', '', $rawThumb));
      if ($thumbBin) {
        $thumbRelative = $relativeDir . '/' . $mediaId . '_thumb.jpg';
        file_put_contents(__DIR__ . '/' . $thumbRelative, $thumbBin);
        $thumbUrl = 'https://fibretrack.mantota.com/api/' . $thumbRelative;
      }
    }

    $capturedAt = !empty($_POST['captured_at']) ? date('Y-m-d H:i:s', strtotime($_POST['captured_at'])) : null;
    $stmt = db()->prepare('INSERT INTO intervention_media (id, intervention_id, type, file_path, latitude, longitude, precision_m, captured_at, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$mediaId, $interventionId, $type, $relativePath, $_POST['latitude'] ?? null, $_POST['longitude'] ?? null, $_POST['precision_m'] ?? null, $capturedAt, $user['nom']]);

    $fullUrl = 'https://fibretrack.mantota.com/api/' . $relativePath;
    $fileSize = (int)@filesize(__DIR__ . '/' . $relativePath);
    echo json_encode([
      'ok' => true,
      'id' => $mediaId,
      'path' => $relativePath,
      'url' => $fullUrl,
      'thumbnail_url' => $thumbUrl,
      'size' => $fileSize,
      'duration' => (float)($_POST['duration'] ?? 0),
      'label' => trim((string)($_POST['label'] ?? 'Vidéo terrain')),
    ]);
    return;
  }
  if ($action === 'app_version') {
    $versionFile = __DIR__ . '/app/version.json';
    $info = is_file($versionFile) ? json_decode(file_get_contents($versionFile), true) : null;
    if (!is_array($info) || empty($info['versionCode'])) {
      http_response_code(404);
      echo json_encode(['error' => 'Version indisponible']);
      return;
    }
    $info['apkUrl'] = 'https://fibretrack.mantota.com/api/app/fibretrack.apk';
    echo json_encode($info);
    return;
  }
  if ($action === 'media_list') {
    $interventionId = trim((string)($_GET['intervention_id'] ?? ''));
    if ($interventionId === '') {
      http_response_code(400);
      echo json_encode(['error' => 'Intervention requise']);
      return;
    }
    $stmt = db()->prepare('SELECT id, intervention_id, type, file_path, latitude, longitude, precision_m, captured_at, added_by, created_at FROM intervention_media WHERE intervention_id = ? ORDER BY created_at DESC');
    $stmt->execute([$interventionId]);
    $media = $stmt->fetchAll();
    foreach ($media as &$item) {
      $item['url'] = 'https://fibretrack.mantota.com/api/' . ltrim($item['file_path'], '/');
    }
    unset($item);
    echo json_encode($media);
    return;
  }
  if ($action === 'media_delete') {
    $user = requireAuth();
    $mediaId = trim((string)($input['id'] ?? ''));
    if ($mediaId === '') {
      http_response_code(400);
      echo json_encode(['error' => 'Média requis']);
      return;
    }
    $stmt = db()->prepare('SELECT file_path, added_by FROM intervention_media WHERE id = ?');
    $stmt->execute([$mediaId]);
    $media = $stmt->fetch();
    if (!$media) {
      http_response_code(404);
      echo json_encode(['error' => 'Média introuvable']);
      return;
    }
    // Autoriser tout technicien ou administrateur authentifié à supprimer le média
    $relativePath = ltrim((string)$media['file_path'], '/');
    if (strpos($relativePath, 'uploads/interventions/') !== 0 || strpos($relativePath, '..') !== false) {
      http_response_code(400);
      echo json_encode(['error' => 'Chemin de média invalide']);
      return;
    }
    $absolutePath = __DIR__ . '/' . $relativePath;
    if (is_file($absolutePath) && !unlink($absolutePath)) {
      http_response_code(500);
      echo json_encode(['error' => 'Impossible de supprimer le fichier média']);
      return;
    }
    $thumbPath = preg_replace('/\.\w+$/', '_thumb.jpg', $absolutePath);
    if (is_file($thumbPath)) @unlink($thumbPath);
    $delete = db()->prepare('DELETE FROM intervention_media WHERE id = ?');
    $delete->execute([$mediaId]);
    echo json_encode(['ok' => true]);
    return;
  }
  switch ($action) {
    case 'deleted_interventions_list':
      $stmt = db()->query('SELECT id FROM deleted_interventions WHERE deleted_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)');
      echo json_encode($stmt->fetchAll(PDO::FETCH_COLUMN));
      break;

    case 'interventions_list_light':
      $stmt = db()->query('SELECT id, date, statut, nom_technicien, nom_equipe,
        COALESCE(NULLIF(nom_client, \'\'), nom_dossier, \'\') AS nom_client,
        COALESCE(NULLIF(nom_dossier, \'\'), nom_client, \'\') AS nom_dossier,
        adresse_zone, telephone_ligne, mobile, etat, msan, fat_ref, port, offre_souscrite, modifie_le, modifie_le AS updated_at FROM interventions ORDER BY date DESC');
      echo json_encode($stmt->fetchAll());
      break;

    case 'interventions_list':
      // signature_client/signature_technicien exclus : LONGTEXT lourds, inutiles
      // dans une liste. Meme traitement light que intervention_get_light pour
      // les photos (base64 dans points_gps/whatsapp_photos = plusieurs Mo par
      // intervention, la liste pesait >100 Mo et ne chargeait plus sur mobile).
      $stmt = db()->query('SELECT id, date, statut, nom_technicien, nom_equipe,
        COALESCE(NULLIF(nom_client, \'\'), nom_dossier, \'\') AS nom_client,
        COALESCE(NULLIF(nom_dossier, \'\'), nom_client, \'\') AS nom_dossier,
        adresse_zone, telephone_ligne, mobile, etat, msan, fat_ref, port,
        ports_disponibles, port_disponible, type_cable, depart_m, arrivee_m, lineaire_m, puissance_fat_dbm,
        puissance_pto_dbm, debit_descendant, debit_montant, debit_ping, mac, sn, nb_poteaux_traverses, nb_poteaux_implantes, nb_poteaux_armes,
        materiel_pose, points_gps, ont_sn, pto_qte, repeteur_wifi_qte, emplacement_ont,
        client_confirme_emplacement, offre_souscrite, remise_equipement_ok,
        appreciation_satisfaction_libre, travaux_conformes, emplacement_valide,
        travail_propre, service_teste, service_fonctionne, explications_donnees,
        recommanderait, accepte_recontact, qualite, delais, professionnalisme,
        nom_client_declaration, remarque_libre, whatsapp_photos, modifie_par, modifie_le, modifie_le AS updated_at
        FROM interventions ORDER BY date DESC');
      $rows = $stmt->fetchAll();
      foreach ($rows as &$r) {
        $r['materiel_pose'] = json_decode($r['materiel_pose'] ?? '{}', true) ?? [];
        normalizeMaterielPose($r['materiel_pose']);
        $gps = json_decode($r['points_gps'] ?? '[]', true) ?? [];
        foreach ($gps as &$pt) { unset($pt['photo']); }
        unset($pt);
        $r['points_gps'] = $gps;
        $wa = json_decode($r['whatsapp_photos'] ?? '[]', true) ?? [];
        foreach ($wa as &$ph) { unset($ph['url']); }
        unset($ph);
        $r['whatsapp_photos'] = $wa;
        $r['signature_client'] = '';
        $r['signature_technicien'] = '';
        normalizeInterventionTypes($r);
      }
      unset($r);
      echo json_encode($rows);
      break;

    case 'intervention_get_light':
      // signature_client/signature_technicien exclues de la requete : elles sont
      // de toute facon ecrasees par '' ci-dessous, inutile de les transferer depuis
      // MySQL (LONGTEXT, potentiellement plusieurs dizaines de Ko chacune).
      $stmt = db()->prepare('SELECT id, date, statut, nom_technicien, nom_equipe,
        COALESCE(NULLIF(nom_client, \'\'), nom_dossier, \'\') AS nom_client,
        COALESCE(NULLIF(nom_dossier, \'\'), nom_client, \'\') AS nom_dossier,
        adresse_zone, telephone_ligne, mobile, etat, msan, fat_ref, port,
        ports_disponibles, port_disponible, type_cable, depart_m, arrivee_m, lineaire_m, puissance_fat_dbm,
          puissance_pto_dbm, debit_descendant, debit_montant, debit_ping, mac, sn, nb_poteaux_traverses, nb_poteaux_implantes, nb_poteaux_armes,
        materiel_pose, points_gps, ont_sn, pto_qte, repeteur_wifi_qte, emplacement_ont,
        client_confirme_emplacement, offre_souscrite, remise_equipement_ok,
        appreciation_satisfaction_libre, travaux_conformes, emplacement_valide,
        travail_propre, service_teste, service_fonctionne, explications_donnees,
        recommanderait, accepte_recontact, qualite, delais, professionnalisme,
        nom_client_declaration, remarque_libre, whatsapp_photos, modifie_par, modifie_le AS updated_at
        FROM interventions WHERE id = ?');
      $id = $input['id'] ?? $_GET['id'] ?? $_POST['id'] ?? null;
      $stmt->execute([$id]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); break; }
      $mp = json_decode($r['materiel_pose'] ?? '{}', true) ?? [];
      normalizeMaterielPose($mp);
      $r['materiel_pose'] = empty($mp) ? new stdClass() : $mp;
      $gps = json_decode($r['points_gps'] ?? '[]', true) ?? [];
      foreach ($gps as &$pt) { unset($pt['photo']); }
      $r['points_gps'] = $gps;
      $wa = json_decode($r['whatsapp_photos'] ?? '[]', true) ?? [];
      foreach ($wa as &$ph) { unset($ph['url']); }
      $r['whatsapp_photos'] = $wa;
      $r['signature_client'] = '';
      $r['signature_technicien'] = '';
      normalizeInterventionTypes($r);
      echo json_encode($r);
      break;

    case 'intervention_updated_at':
      header('Cache-Control: no-cache, no-store, must-revalidate');
      header('Pragma: no-cache');
      header('Expires: 0');
      // Relevé léger pour le live refresh mobile : une seule colonne,
      // aucune donnée base64. L'APK compare puis appelle intervention_get_light
      // seulement si la valeur a changé.
      $id = $input['id'] ?? $_GET['id'] ?? $_POST['id'] ?? null;
      $stmt = db()->prepare('SELECT modifie_le AS updated_at FROM interventions WHERE id = ?');
      $stmt->execute([$id]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); break; }
      echo json_encode(['updated_at' => $r['updated_at'] ?? '']);
      break;

    case 'intervention_get_photos':
      $id = $input['id'] ?? $_GET['id'] ?? $_POST['id'] ?? null;
      $stmt = db()->prepare('SELECT points_gps, whatsapp_photos, signature_client, signature_technicien FROM interventions WHERE id = ?');
      $stmt->execute([$id]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); break; }
      $r['points_gps'] = json_decode($r['points_gps'] ?? '[]', true) ?? [];
      $r['whatsapp_photos'] = json_decode($r['whatsapp_photos'] ?? '[]', true) ?? [];
      echo json_encode($r);
      break;

    case 'download_photos_zip':
    case 'intervention_photos_zip':
      $id = $input['id'] ?? $_GET['id'] ?? $_POST['id'] ?? null;
      if (!$id) { http_response_code(400); echo json_encode(['error' => 'ID requis']); break; }
      $stmt = db()->prepare('SELECT id, nom_client, nom_dossier, points_gps, whatsapp_photos FROM interventions WHERE id = ?');
      $stmt->execute([$id]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Intervention non trouvée']); break; }

      $nomClient = trim($r['nom_client'] ?: ($r['nom_dossier'] ?: 'client'));
      $slugClient = preg_replace('/[^a-zA-Z0-9_-]/', '_', @iconv('UTF-8', 'ASCII//TRANSLIT', $nomClient) ?: $nomClient);
      $slugClient = strtoupper(preg_replace('/_+/', '_', trim($slugClient, '_'))) ?: 'DOSSIER_CLIENT';

      $zip = new ZipArchive();
      $tmpZip = tempnam(sys_get_temp_dir(), 'ft_zip_');
      if ($zip->open($tmpZip, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        http_response_code(500); echo json_encode(['error' => 'Impossible de générer l\'archive ZIP']); break;
      }

      $folderPrefix = $slugClient . '/';
      $zip->addEmptyDir($slugClient);

      // 1. Fichiers présents sur le serveur dans uploads/photos/<id>
      $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $id);
      $photoDir = __DIR__ . '/uploads/photos/' . $safeId;
      if (is_dir($photoDir)) {
        foreach (scandir($photoDir) as $f) {
          if ($f !== '.' && $f !== '..' && is_file($photoDir . '/' . $f)) {
            $zip->addFile($photoDir . '/' . $f, $folderPrefix . $f);
          }
        }
      }

      // 2. Fichiers en base64 dans whatsapp_photos
      $wa = json_decode($r['whatsapp_photos'] ?? '[]', true) ?? [];
      $idx = 1;
      foreach ($wa as $p) {
        $url = $p['url'] ?? '';
        if (str_starts_with($url, 'data:image')) {
          if (preg_match('#^data:image/(jpeg|jpg|png|webp);base64,(.+)$#si', $url, $m)) {
            $bin = base64_decode($m[2]);
            if ($bin) {
              $ext = ($m[1] === 'png') ? 'png' : (($m[1] === 'webp') ? 'webp' : 'jpg');
              $rawSlot = $p['slot'] ?? ($p['name'] ?? ('photo_' . $idx));
              $name = preg_replace('/[^a-zA-Z0-9_-]/', '_', $rawSlot) . '.' . $ext;
              $zip->addFromString($folderPrefix . $name, $bin);
              $idx++;
            }
          }
        }
      }

      // 3. Fichiers en base64 dans points_gps
      $gps = json_decode($r['points_gps'] ?? '[]', true) ?? [];
      foreach ($gps as $pt) {
        $ph = $pt['photo'] ?? '';
        if (str_starts_with($ph, 'data:image')) {
          if (preg_match('#^data:image/(jpeg|jpg|png|webp);base64,(.+)$#si', $ph, $m)) {
            $bin = base64_decode($m[2]);
            if ($bin) {
              $ext = ($m[1] === 'png') ? 'png' : (($m[1] === 'webp') ? 'webp' : 'jpg');
              $ptName = 'poteau_' . ($pt['numero'] ?? uniqid()) . '.' . $ext;
              $zip->addFromString($folderPrefix . $ptName, $bin);
            }
          }
        }
      }

      $zip->close();

      header('Content-Type: application/zip');
      header('Content-Disposition: attachment; filename="Photos_' . $slugClient . '.zip"');
      header('Content-Length: ' . filesize($tmpZip));
      header('Cache-Control: no-cache, no-store, must-revalidate');
      readfile($tmpZip);
      @unlink($tmpZip);
      exit;

    case 'intervention_get':
      $id = $input['id'] ?? $_GET['id'] ?? $_POST['id'] ?? null;
      $stmt = db()->prepare('SELECT * FROM interventions WHERE id = ?');
      $stmt->execute([$id]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); break; }
      $mp = json_decode($r['materiel_pose'] ?? '{}', true) ?? [];
      normalizeMaterielPose($mp);
      $r['materiel_pose'] = empty($mp) ? new stdClass() : $mp;
      $r['points_gps'] = json_decode($r['points_gps'] ?? '[]', true) ?? [];
      $r['whatsapp_photos'] = json_decode($r['whatsapp_photos'] ?? '[]', true) ?? [];
      $r['updated_at'] = (string)($r['modifie_le'] ?? '');
      normalizeInterventionTypes($r);
      echo json_encode($r);
      break;

    case 'intervention_delete':
      requireAuth(true);
      $interventionId = trim((string)($input['id'] ?? ''));
      if ($interventionId === '') { http_response_code(400); echo json_encode(['error' => 'ID requis']); break; }
      $pdo = db();
      $pdo->beginTransaction();
      try {
        $stmt = $pdo->prepare('SELECT id, nom_client, nom_technicien FROM interventions WHERE id = ? FOR UPDATE');
        $stmt->execute([$interventionId]);
        $intervention = $stmt->fetch();
        if (!$intervention) {
          $pdo->commit();
          echo json_encode(['ok' => true, 'already_deleted' => true, 'stock_restored' => 0]);
          break;
        }

        $stmt = $pdo->prepare("SELECT designation, SUM(CASE WHEN type = 'sortie' THEN quantite WHEN type = 'entree' THEN -quantite ELSE 0 END) AS quantite FROM stock_movements WHERE intervention_id = ? GROUP BY designation");
        $stmt->execute([$interventionId]);
        $outgoing = $stmt->fetchAll();
        $restored = 0;
        foreach ($outgoing as $movement) {
          $quantity = (int)$movement['quantite'];
          if ($quantity <= 0) continue;
          changeStockQuantity($pdo, $movement['designation'], $quantity, [
            'intervention_id' => $interventionId,
            'nom_client' => $intervention['nom_client'],
            'nom_technicien' => $intervention['nom_technicien'],
            'motif' => 'Retour - suppression intervention',
          ]);
          $restored += $quantity;
        }

        $stmt = $pdo->prepare('DELETE FROM interventions WHERE id = ?');
        $stmt->execute([$interventionId]);
        try {
          $stmtDelLog = $pdo->prepare('INSERT INTO deleted_interventions (id, deleted_at) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE deleted_at = NOW()');
          $stmtDelLog->execute([$interventionId]);
        } catch (Exception $e) {}
        $pdo->commit();
        echo json_encode(['ok' => true, 'stock_restored' => $restored]);
      } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
      }
      break;

    case 'intervention_save':
      $d = $input;
      normalizeInterventionTypes($d);
      $portDisponible = (int)($d['port_disponible'] ?? 0);
      if ($portDisponible < 0 || $portDisponible > 32) {
        http_response_code(400);
        echo json_encode(['error' => 'Le nombre de ports disponibles doit être compris entre 0 et 32']);
        break;
      }
      $portsDisponibles = trim((string)($d['ports_disponibles'] ?? ''));
      if ($portsDisponibles !== '') {
        $rawPorts = array_values(array_filter(array_map('trim', explode(',', $portsDisponibles))));
        $normalizedPorts = [];
        foreach ($rawPorts as $rp) {
          if (preg_match('/^(?:Port\s*)?(\d{1,2})$/i', $rp, $m)) {
            $pNum = (int)$m[1];
            if ($pNum >= 1 && $pNum <= 32) {
              $normalizedPorts[] = "Port $pNum";
            }
          } elseif ($rp !== '') {
            $normalizedPorts[] = $rp;
          }
        }
        if (!empty($normalizedPorts)) {
          $normalizedPorts = array_values(array_unique($normalizedPorts));
          $d['ports_disponibles'] = implode(', ', $normalizedPorts);
          $d['port_disponible'] = count($normalizedPorts);
        }
      }
      // L'APK envoie des dates ISO 8601 (Instant.toString() →
      // '2026-10-09T08:25:34Z'). En mode SQL strict : INSERT rejeté
      // (erreur 1292, le save échoue). En mode permissif : tronqué à
      // '0000-00-00' → la fiche part en bas de liste (ORDER BY date
      // DESC) et paraît « ne pas arriver ». Normalisation côté serveur.
      foreach (['date', 'modifie_le'] as $champDate) {
        if (!empty($d[$champDate])) {
          $ts = strtotime($d[$champDate]);
          if ($ts !== false) $d[$champDate] = date('Y-m-d H:i:s', $ts);
        }
      }
      $d['nom_dossier'] = trim((string)($d['nom_dossier'] ?? ''));
      $d['nom_client'] = trim((string)($d['nom_client'] ?? ''));
      if ($d['nom_dossier'] !== '' && $d['nom_client'] === '') {
        $d['nom_client'] = $d['nom_dossier'];
      } elseif ($d['nom_client'] !== '' && $d['nom_dossier'] === '') {
        $d['nom_dossier'] = $d['nom_client'];
      }
      $isLight = ($d['_light'] ?? false) === true;
      $fields = [
        'id', 'date', 'statut', 'nom_technicien', 'nom_equipe',
        'nom_client', 'nom_dossier', 'adresse_zone', 'telephone_ligne', 'mobile',
        'etat', 'msan', 'fat_ref', 'port', 'ports_disponibles', 'port_disponible', 'type_cable',
        'depart_m', 'arrivee_m', 'lineaire_m', 'puissance_fat_dbm', 'puissance_pto_dbm',
        'debit_descendant', 'debit_montant', 'debit_ping',
        'mac', 'sn', 'nb_poteaux_traverses', 'nb_poteaux_implantes', 'nb_poteaux_armes',
        'ont_sn', 'pto_qte', 'repeteur_wifi_qte', 'emplacement_ont',
        'client_confirme_emplacement', 'offre_souscrite', 'remise_equipement_ok',
        'appreciation_satisfaction_libre',
        'travaux_conformes', 'emplacement_valide', 'travail_propre',
        'service_teste', 'service_fonctionne', 'explications_donnees',
        'recommanderait', 'accepte_recontact',
        'qualite', 'delais', 'professionnalisme',
        'nom_client_declaration', 'remarque_libre',
        'signature_client', 'signature_technicien',
        'modifie_par', 'modifie_le'
      ];
      $setClause = implode(', ', array_map(fn($f) => "$f = :$f", $fields));

      // ===== MERGE ANTI-PERTE DES PHOTOS/SIGNATURES =====
      // intervention_get_light renvoie les entrées points_gps/whatsapp_photos
      // SANS les champs photo/url. Si l'app renvoie ces listes, les entrées
      // existent mais avec photo vide -> il faut restaurer depuis la base.
      $pdo = db();
      $pdo->beginTransaction();
      $existing = null;
      $expectedUpdatedAt = trim((string)($d['expected_updated_at'] ?? ''));
      $changedFields = isset($d['changed_fields']) && is_array($d['changed_fields']) ? array_values($d['changed_fields']) : null;
      if (!empty($d['id'])) {
        $stmtEx = $pdo->prepare('SELECT points_gps, whatsapp_photos, videos_terrain, signature_client, signature_technicien, materiel_pose, materiel_deduit, statut, nom_client, nom_technicien, modifie_le FROM interventions WHERE id = ? FOR UPDATE');
        $stmtEx->execute([$d['id']]);
        $existing = $stmtEx->fetch() ?: null;
      }

      // --- points_gps : restaurer la photo serveur si l'entrée entrante a photo vide ---
      // --- points_gps : restaurer la photo serveur si l'entrée entrante a photo vide SAUF si explicitement supprimée ---
      $incomingGps = $d['points_gps'] ?? [];
      if (!is_array($incomingGps)) $incomingGps = [];
      $deletedWaPhotos = array_fill_keys($d['deleted_whatsapp_photos'] ?? [], true);
      $deletedPoints = array_fill_keys($d['deleted_points'] ?? [], true);
      $isGpsDirty = ($changedFields !== null && in_array('points_gps', $changedFields, true));

      if ($existing) {
        $serverGps = json_decode($existing['points_gps'] ?? '[]', true) ?? [];
        if (empty($incomingGps) && !$isGpsDirty) {
          // Liste vide envoyée -> garder la liste serveur complète seulement si points_gps n'est pas dans changed_fields
          $incomingGps = $serverGps;
        } else {
          $serverByIdOrHoro = [];
          foreach ($serverGps as $pt) {
            $k = !empty($pt['id']) ? $pt['id'] : ($pt['horodatage'] ?? '');
            if ($k !== '') $serverByIdOrHoro[$k] = $pt;
          }
          foreach ($incomingGps as &$pt) {
            $k = !empty($pt['id']) ? $pt['id'] : ($pt['horodatage'] ?? '');
            $ptType = strtolower(trim((string)($pt['type'] ?? '')));
            $isPhotoDeleted = !empty($pt['photo_deleted']) ||
              ($k !== '' && (isset($deletedWaPhotos[$k]) || isset($deletedPoints[$k]))) ||
              ($ptType !== '' && (isset($deletedWaPhotos[$ptType]) || isset($deletedWaPhotos['slot_' . $ptType])));
            if (empty($pt['photo']) && $k !== '' && isset($serverByIdOrHoro[$k]) && !$isPhotoDeleted) {
              $pt['photo'] = $serverByIdOrHoro[$k]['photo'] ?? '';
            }
          }
          unset($pt);
        }
      }

      // --- whatsapp_photos : restaurer l'url serveur si vide (match par id) ---
      $incomingWa = $d['whatsapp_photos'] ?? [];
      if (!is_array($incomingWa)) $incomingWa = [];
      $isWaDirty = ($changedFields !== null && in_array('whatsapp_photos', $changedFields, true));

      if ($existing) {
        $serverWa = json_decode($existing['whatsapp_photos'] ?? '[]', true) ?? [];
        if (empty($incomingWa) && !$isWaDirty) {
          $incomingWa = $serverWa;
        } else {
          $serverById = [];
          foreach ($serverWa as $ph) {
            if (!empty($ph['id'])) $serverById[$ph['id']] = $ph;
          }
          foreach ($incomingWa as &$ph) {
            if (empty($ph['url']) && !empty($ph['id']) && isset($serverById[$ph['id']])) {
              $ph['url'] = $serverById[$ph['id']]['url'] ?? '';
            }
          }
          unset($ph);
        }
      } elseif (!empty($d['id'])) {
        $mStmt = $pdo->prepare('SELECT id, type, file_path, latitude, longitude, precision_m, captured_at, added_by FROM intervention_media WHERE intervention_id = ?');
        $mStmt->execute([$d['id']]);
        $medias = $mStmt->fetchAll();
        if (!empty($medias)) {
          foreach ($medias as $m) {
            $incomingWa[] = [
              'id' => $m['id'],
              'slot' => 'media_' . $m['id'],
              'type' => $m['type'],
              'url' => 'https://fibretrack.mantota.com/api/' . ltrim($m['file_path'], '/'),
              'lat' => $m['latitude'] !== null ? (float)$m['latitude'] : null,
              'lng' => $m['longitude'] !== null ? (float)$m['longitude'] : null,
              'precision_m' => $m['precision_m'] !== null ? (float)$m['precision_m'] : null,
              'horodatage' => $m['captured_at'] ?: date('Y-m-d H:i:s'),
              'ajoute_par' => $m['added_by'] ?? '',
            ];
          }
        }
      }

      // --- signatures : garder la serveur si l'entrante est vide ---
      if ($existing) {
        if (empty($d['signature_client'])) $d['signature_client'] = $existing['signature_client'];
        if (empty($d['signature_technicien'])) $d['signature_technicien'] = $existing['signature_technicien'];
      }

      // --- materiel_pose : déduplication stricte des alias et initialisation par défaut ---
      $incomingMat = $d['materiel_pose'] ?? [];
      if (is_object($incomingMat)) $incomingMat = (array)$incomingMat;
      if (!is_array($incomingMat)) $incomingMat = [];
      if ($existing && empty($incomingMat) && !($changedFields !== null && in_array('materiel_pose', $changedFields, true))) {
        $incomingMat = json_decode($existing['materiel_pose'] ?? '{}', true) ?? [];
      }

      // Fusion / déduplication préalable ONT et OTP pour ne JAMAIS additionner 1+1=2
      if (isset($incomingMat['otp']) || isset($incomingMat['ont'])) {
        $ontVal = max((int)($incomingMat['ont'] ?? 0), (int)($incomingMat['otp'] ?? 0));
        unset($incomingMat['otp']);
        $incomingMat['ont'] = $ontVal;
      }

      $canonicalMat = [];
      foreach ($incomingMat as $designation => $quantity) {
        $canonical = canonicalDesignation($designation);
        $canonicalMat[$canonical] = ($canonicalMat[$canonical] ?? 0) + (int)$quantity;
      }

      if (isset($canonicalMat['otp']) || isset($canonicalMat['ont'])) {
        $canonicalMat['ont'] = max((int)($canonicalMat['ont'] ?? 0), (int)($canonicalMat['otp'] ?? 0));
        unset($canonicalMat['otp']);
      }
      $incomingMat = $canonicalMat;

      // Valeurs par défaut obligatoires pour les nouvelles interventions (ONT: 1, PTO: 1, Piton: 1)
      if (!$existing) {
        if (!isset($incomingMat['piton']) || (int)$incomingMat['piton'] === 0) $incomingMat['piton'] = 1;
        if (!isset($incomingMat['pto']) || (int)$incomingMat['pto'] === 0) $incomingMat['pto'] = 1;
        if (!isset($incomingMat['ont']) || (int)$incomingMat['ont'] === 0) $incomingMat['ont'] = 1;
      }

      $patchMode = $existing && $changedFields !== null;
      $materialPatch = $patchMode && count(array_filter($changedFields, fn($name) => $name === 'materiel_pose' || str_starts_with((string)$name, 'materiel_pose.'))) > 0;
      if ($materialPatch && !in_array('materiel_pose', $changedFields, true)) {
        $mergedMat = json_decode($existing['materiel_pose'] ?? '{}', true) ?? [];
        foreach ($changedFields as $changedField) {
          if (!str_starts_with((string)$changedField, 'materiel_pose.')) continue;
          $designation = canonicalDesignation(substr((string)$changedField, strlen('materiel_pose.')));
          if (array_key_exists($designation, $incomingMat)) $mergedMat[$designation] = $incomingMat[$designation];
          else unset($mergedMat[$designation]);
        }
        if (isset($mergedMat['otp'])) {
          $mergedMat['ont'] = max((int)($mergedMat['ont'] ?? 0), (int)$mergedMat['otp']);
          unset($mergedMat['otp']);
        }
        $incomingMat = $mergedMat;
      }
      if ($patchMode && in_array('points_gps', $changedFields, true)) {
        $serverByIdOrHoro = [];
        $deletedPoints = array_fill_keys($d['deleted_points'] ?? [], true);
        foreach (json_decode($existing['points_gps'] ?? '[]', true) ?? [] as $point) {
          $idKey = $point['id'] ?? '';
          $horoKey = $point['horodatage'] ?? '';
          if (($idKey !== '' && isset($deletedPoints[$idKey])) || ($horoKey !== '' && isset($deletedPoints[$horoKey]))) {
            continue;
          }
          $itemKey = $idKey !== '' ? $idKey : ($horoKey !== '' ? $horoKey : uniqid());
          $serverByIdOrHoro[$itemKey] = $point;
        }
        foreach ($incomingGps as $point) {
          $idKey = $point['id'] ?? '';
          $horoKey = $point['horodatage'] ?? '';
          if (($idKey !== '' && isset($deletedPoints[$idKey])) || ($horoKey !== '' && isset($deletedPoints[$horoKey]))) {
            continue;
          }
          $itemKey = $idKey !== '' ? $idKey : ($horoKey !== '' ? $horoKey : uniqid());
          $serverByIdOrHoro[$itemKey] = array_merge($serverByIdOrHoro[$itemKey] ?? [], $point);
        }
        $incomingGps = array_values($serverByIdOrHoro);
      }
      if ($patchMode && in_array('whatsapp_photos', $changedFields, true)) {
        $deletedPhotos = array_fill_keys($d['deleted_whatsapp_photos'] ?? [], true);

        // Supprimer physiquement du disque SSD les fichiers des photos expressément supprimées
        if (!empty($deletedPhotos) && !empty($existing['whatsapp_photos'])) {
          foreach (json_decode($existing['whatsapp_photos'], true) ?? [] as $oldPh) {
            $id = $oldPh['id'] ?? '';
            $slot = $oldPh['slot'] ?? '';
            $type = $oldPh['type'] ?? '';
            $isDel = ($id !== '' && isset($deletedPhotos[$id])) ||
                     ($slot !== '' && (isset($deletedPhotos[$slot]) || isset($deletedPhotos['slot_' . $slot]))) ||
                     ($type !== '' && (isset($deletedPhotos[$type]) || isset($deletedPhotos['slot_' . $type])));
            if ($isDel && !empty($oldPh['url']) && strpos($oldPh['url'], 'uploads/interventions/') !== false) {
              $rel = substr($oldPh['url'], strpos($oldPh['url'], 'uploads/interventions/'));
              $abs = __DIR__ . '/' . $rel;
              if (is_file($abs)) @unlink($abs);
            }
          }
        }

        // Conserver uniquement les photos de incomingWa qui ne sont pas dans deleted_whatsapp_photos
        $cleanWa = [];
        foreach ($incomingWa as $photo) {
          $idKey = $photo['id'] ?? '';
          $slotKey = $photo['slot'] ?? '';
          $typeKey = $photo['type'] ?? '';
          if ($idKey !== '' && isset($deletedPhotos[$idKey])) continue;
          $isMulti = !empty($photo['additionnelle']) || !empty($photo['is_additionnelle']) ||
                     $slotKey === 'additionnelle' || str_starts_with($slotKey, 'additionnelle_') ||
                     $slotKey === 'autre_poteau' || str_starts_with($slotKey, 'autre_poteau');
          if (!$isMulti) {
            if ($slotKey !== '' && (isset($deletedPhotos[$slotKey]) || isset($deletedPhotos['slot_' . $slotKey]))) continue;
            if ($typeKey !== '' && (isset($deletedPhotos[$typeKey]) || isset($deletedPhotos['slot_' . $typeKey]))) continue;
          }
          $cleanWa[] = $photo;
        }
        $incomingWa = $cleanWa;
      } elseif (!$patchMode && !empty($d['deleted_whatsapp_photos'])) {
        $deletedPhotos = array_fill_keys($d['deleted_whatsapp_photos'], true);
        $cleanWa = [];
        foreach ($incomingWa as $photo) {
          $idKey = $photo['id'] ?? '';
          $slotKey = $photo['slot'] ?? '';
          $typeKey = $photo['type'] ?? '';
          if ($idKey !== '' && isset($deletedPhotos[$idKey])) continue;
          $isMulti = !empty($photo['additionnelle']) || !empty($photo['is_additionnelle']) ||
                     $slotKey === 'additionnelle' || str_starts_with($slotKey, 'additionnelle_') ||
                     $slotKey === 'autre_poteau' || str_starts_with($slotKey, 'autre_poteau');
          if (!$isMulti) {
            if ($slotKey !== '' && (isset($deletedPhotos[$slotKey]) || isset($deletedPhotos['slot_' . $slotKey]))) continue;
            if ($typeKey !== '' && (isset($deletedPhotos[$typeKey]) || isset($deletedPhotos['slot_' . $typeKey]))) continue;
          }
          $cleanWa[] = $photo;
        }
        $incomingWa = $cleanWa;
      }

      // Sauvegarde des photos sur le disque SSD Hostinger et conversion en URLs pour alléger la BDD à 99%
      $intvIdForPhotos = !empty($d['id']) ? $d['id'] : 'temp_' . uniqid();
      foreach ($incomingWa as &$ph) {
        if (!empty($ph['url']) && strpos((string)$ph['url'], 'data:image') === 0) {
          $slot = !empty($ph['slot']) ? $ph['slot'] : (!empty($ph['type']) ? $ph['type'] : 'wa');
          $ph['url'] = saveBase64ImageToDisk((string)$ph['url'], $intvIdForPhotos, $slot);
        }
      }
      unset($ph);

      foreach ($incomingGps as &$pt) {
        if (!empty($pt['photo']) && strpos((string)$pt['photo'], 'data:image') === 0) {
          $ptType = !empty($pt['type']) ? $pt['type'] : 'poteau';
          $num = $pt['numero'] ?? '';
          $prefix = $ptType . ($num !== '' ? '_' . $num : '');
          $pt['photo'] = saveBase64ImageToDisk((string)$pt['photo'], $intvIdForPhotos, $prefix);
        }
      }
      unset($pt);

      // Recompute pole counts from points_gps to ensure DB consistency
      if (is_array($incomingGps)) {
        $uniquePoles = [];
        foreach ($incomingGps as $p) {
          if (($p['type'] ?? '') === 'Poteau') {
            $num = (int)($p['numero'] ?? 0);
            $isImp = !empty($p['implante']) || in_array(strtolower(trim($p['sous_type'] ?? '')), ['implanté', 'implante'], true);
            $isArm = !empty($p['arme']) || in_array(strtolower(trim($p['sous_type'] ?? '')), ['armé', 'arme'], true);
            $cat = $isImp ? 'implante' : ($isArm && empty($p['traverse']) ? 'arme' : 'traverse');

            $pLat = isset($p['lat']) ? (float)$p['lat'] : null;
            $pLng = isset($p['lng']) ? (float)$p['lng'] : null;
            $foundKey = null;

            foreach ($uniquePoles as $k => $ex) {
              $exLat = isset($ex['lat']) ? (float)$ex['lat'] : null;
              $exLng = isset($ex['lng']) ? (float)$ex['lng'] : null;
              if ($pLat !== null && $pLng !== null && $exLat !== null && $exLng !== null) {
                if (abs($pLat - $exLat) < 0.00005 && abs($pLng - $exLng) < 0.00005) {
                  $foundKey = $k;
                  break;
                }
              }
              if ($num > 0 && ($k === "{$cat}_{$num}")) {
                $foundKey = $k;
                break;
              }
            }

            if ($foundKey === null) {
              $key = $num > 0 ? "{$cat}_{$num}" : ($p['id'] ?? uniqid());
              $uniquePoles[$key] = $p;
            } else {
              $ex = $uniquePoles[$foundKey];
              if (empty($ex['type_poteau']) && !empty($p['type_poteau'])) $ex['type_poteau'] = $p['type_poteau'];
              if (empty($ex['photo']) && !empty($p['photo'])) $ex['photo'] = $p['photo'];
              if (empty($ex['lat']) && !empty($p['lat'])) $ex['lat'] = $p['lat'];
              if (empty($ex['lng']) && !empty($p['lng'])) $ex['lng'] = $p['lng'];
              $uniquePoles[$foundKey] = $ex;
            }
          }
        }
        $calcImp = 0;
        $calcArm = 0;
        $calcTrav = 0;
        foreach ($uniquePoles as $p) {
          $isImp = !empty($p['implante']) || in_array(strtolower(trim($p['sous_type'] ?? '')), ['implanté', 'implante'], true);
          $isArm = !empty($p['arme']) || in_array(strtolower(trim($p['sous_type'] ?? '')), ['armé', 'arme'], true);
          $isTrav = !empty($p['traverse']) || (!$isImp && in_array(strtolower(trim($p['sous_type'] ?? '')), ['traversé', 'traverse', ''], true));
          if ($isImp) $calcImp++;
          if ($isArm) $calcArm++;
          if ($isTrav) $calcTrav++;
        }
        if (!$patchMode || in_array('points_gps', $changedFields, true) || $calcTrav > 0) {
          $d['nb_poteaux_implantes'] = $calcImp;
          $d['nb_poteaux_armes'] = $calcArm;
          $d['nb_poteaux_traverses'] = $calcTrav;
        }
      }

      // --- Déduction stock : à faire seulement au premier passage à 'termine' ---
      $finalStatus = $d['statut'] ?? ($existing['statut'] ?? '');

      $shouldDeductStock = $finalStatus === 'termine'
        && (!$existing || (int)($existing['materiel_deduit'] ?? 0) === 0)
        && (!$patchMode || in_array('statut', $changedFields, true) || $materialPatch);
      $shouldReconcileStock = $finalStatus === 'termine'
        && ($shouldDeductStock || ($existing && (int)($existing['materiel_deduit'] ?? 0) === 1 && $materialPatch));

      $serverNow = date('Y-m-d H:i:s');
      try {
        if ($patchMode) {
          if (in_array('nom_dossier', $changedFields, true) && !in_array('nom_client', $changedFields, true)) {
            $changedFields[] = 'nom_client';
            if (empty($d['nom_client'])) $d['nom_client'] = $d['nom_dossier'];
          } elseif (in_array('nom_client', $changedFields, true) && !in_array('nom_dossier', $changedFields, true)) {
            $changedFields[] = 'nom_dossier';
            if (empty($d['nom_dossier'])) $d['nom_dossier'] = $d['nom_client'];
          }
          $patchColumns = array_values(array_filter($fields, fn($field) => !in_array($field, ['id', 'modifie_le'], true) && in_array($field, $changedFields, true) && array_key_exists($field, $d)));
          $patchAssignments = array_map(fn($field) => "$field = :$field", $patchColumns);
          if ($materialPatch) $patchAssignments[] = 'materiel_pose = :materiel_pose';
          if (in_array('points_gps', $changedFields, true)) {
            $patchAssignments[] = 'points_gps = :points_gps';
            $patchAssignments[] = 'nb_poteaux_implantes = :nb_poteaux_implantes_calc';
            $patchAssignments[] = 'nb_poteaux_armes = :nb_poteaux_armes_calc';
            $patchAssignments[] = 'nb_poteaux_traverses = :nb_poteaux_traverses_calc';
          }
          if (in_array('whatsapp_photos', $changedFields, true)) $patchAssignments[] = 'whatsapp_photos = :whatsapp_photos';
          if (in_array('videos_terrain', $changedFields, true) || isset($d['videos_terrain'])) $patchAssignments[] = 'videos_terrain = :videos_terrain';
          if ($shouldDeductStock) $patchAssignments[] = 'materiel_deduit = 1';
          $patchAssignments[] = 'modifie_par = :modifie_par';
          $patchAssignments[] = 'modifie_le = :modifie_le';
          $stmt = $pdo->prepare('UPDATE interventions SET ' . implode(', ', array_unique($patchAssignments)) . ' WHERE id = :id');
          foreach ($patchColumns as $field) {
            $value = $d[$field];
            if (is_bool($value)) $value = $value ? 1 : 0;
            $stmt->bindValue(':' . $field, $value);
          }
          if ($materialPatch) $stmt->bindValue(':materiel_pose', json_encode(empty($incomingMat) ? (object)[] : $incomingMat));
          if (in_array('points_gps', $changedFields, true)) {
            $stmt->bindValue(':points_gps', json_encode($incomingGps));
            $stmt->bindValue(':nb_poteaux_implantes_calc', (int)$d['nb_poteaux_implantes']);
            $stmt->bindValue(':nb_poteaux_armes_calc', (int)$d['nb_poteaux_armes']);
            $stmt->bindValue(':nb_poteaux_traverses_calc', (int)$d['nb_poteaux_traverses']);
          }
          if (in_array('whatsapp_photos', $changedFields, true)) $stmt->bindValue(':whatsapp_photos', json_encode($incomingWa));
          if (in_array('videos_terrain', $changedFields, true) || isset($d['videos_terrain'])) $stmt->bindValue(':videos_terrain', json_encode($incomingVideos));
          $stmt->bindValue(':modifie_par', $d['modifie_par'] ?? '');
          $stmt->bindValue(':modifie_le', $serverNow);
          $stmt->bindValue(':id', $d['id']);
          $stmt->execute();
        } else {
          $d['modifie_le'] = $serverNow;
          $stmt = $pdo->prepare("INSERT INTO interventions SET " .
            implode(', ', array_map(fn($f) => "$f = :$f", $fields)) .
            ", materiel_pose = :materiel_pose, points_gps = :points_gps, whatsapp_photos = :whatsapp_photos, videos_terrain = :videos_terrain" .
            ($shouldDeductStock ? ", materiel_deduit = 1" : "") .
            " ON DUPLICATE KEY UPDATE " . $setClause .
            ", materiel_pose = :materiel_pose" .
            ", points_gps = :points_gps" .
            ", whatsapp_photos = :whatsapp_photos" .
            ", videos_terrain = :videos_terrain" .
            ($shouldDeductStock ? ", materiel_deduit = 1" : ""));

          foreach ($fields as $f) {
            $val = $d[$f] ?? null;
            if (is_bool($val)) $val = $val ? 1 : 0;
            $stmt->bindValue(':' . $f, $val);
          }
          $stmt->bindValue(':materiel_pose', json_encode(empty($incomingMat) ? (object)[] : $incomingMat));
          $stmt->bindValue(':points_gps', json_encode($incomingGps));
          $stmt->bindValue(':whatsapp_photos', json_encode($incomingWa));
          $stmt->bindValue(':videos_terrain', json_encode($incomingVideos));
          $stmt->execute();
        }

        $deducted = 0;
        if ($shouldReconcileStock) {
          $usageStmt = $pdo->prepare("SELECT designation, SUM(CASE WHEN type = 'sortie' THEN quantite WHEN type = 'entree' THEN -quantite ELSE 0 END) AS quantite FROM stock_movements WHERE intervention_id = ? GROUP BY designation");
          $usageStmt->execute([$d['id']]);
          $recordedUsage = [];
          foreach ($usageStmt->fetchAll() as $movement) $recordedUsage[$movement['designation']] = (int)$movement['quantite'];
          $totalMat = buildTotalMaterielPose($d);
          $designations = array_unique(array_merge(array_keys($recordedUsage), array_keys($totalMat)));
          foreach ($designations as $desig) {
            $target = (int)($totalMat[$desig] ?? 0);
            if ($target < 0) continue;
            $delta = $target - ($recordedUsage[$desig] ?? 0);
            if ($delta === 0) continue;
            changeStockQuantity($pdo, $desig, -$delta, [
              'intervention_id' => $d['id'],
              'nom_client' => $d['nom_client'] ?? ($existing['nom_client'] ?? ''),
              'nom_technicien' => $d['nom_technicien'] ?? ($existing['nom_technicien'] ?? ''),
              'motif' => $delta > 0 ? 'Pose intervention' : 'Correction matériel intervention',
            ], true);
            $deducted++;
          }
        }

        $updatedStmt = $pdo->prepare('SELECT modifie_le FROM interventions WHERE id = ?');
        $updatedStmt->execute([$d['id'] ?? '']);
        $updatedAt = (string)($updatedStmt->fetchColumn() ?: '');
        $pdo->commit();
        echo json_encode(['ok' => true, 'stock_deducted' => $deducted, 'updated_at' => $updatedAt]);
      } catch (Exception $e) {
        $pdo->rollBack();
        // Trace serveur : sans ça un save qui échoue est invisible —
        // le technicien retentait à l'aveugle plusieurs fois.
        error_log('[intervention_save] ' . $e->getMessage()
          . ' — id=' . ($d['id'] ?? '?')
          . ' body=' . strlen((string)$rawBody) . 'o');
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
      }
      break;

    case 'stock_list':
      $stmt = db()->query('SELECT designation, quantite FROM stock ORDER BY designation');
      $rows = $stmt->fetchAll();
      $result = [];
      foreach ($rows as $r) { $result[$r['designation']] = (int)$r['quantite']; }
      echo json_encode($result);
      break;

    case 'stock_save':
      $designation = trim((string)($input['designation'] ?? ''));
      $quantite = filter_var($input['quantite'] ?? null, FILTER_VALIDATE_INT);
      if ($designation === '' || $quantite === false || $quantite < 0) { http_response_code(400); echo json_encode(['error' => 'Désignation et quantité valide requises']); break; }
      $pdo = db();
      $pdo->beginTransaction();
      try {
        setStockQuantity($pdo, $designation, $quantite, ['motif' => 'Ajustement manuel du stock']);
        $pdo->commit();
        echo json_encode(['ok' => true]);
      } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
      }
      break;

    case 'stock_move':
      $user = requireAuth();
      $designation = trim((string)($input['designation'] ?? ''));
      $quantite = filter_var($input['quantite'] ?? null, FILTER_VALIDATE_INT);
      $type = $input['type'] ?? '';
      if ($designation === '' || $quantite === false || $quantite <= 0 || !in_array($type, ['entree', 'sortie'], true)) {
        http_response_code(400); echo json_encode(['error' => 'Désignation, quantité positive et type de mouvement requis']); break;
      }
      $pdo = db();
      $pdo->beginTransaction();
      try {
        $delta = $type === 'entree' ? $quantite : -$quantite;
        changeStockQuantity($pdo, $designation, $delta, [
          'nom_technicien' => $user['nom'],
          'motif' => trim((string)($input['motif'] ?? 'Mouvement manuel')),
        ]);
        $pdo->commit();
        echo json_encode(['ok' => true]);
      } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
      }
      break;

    case 'stock_import':
      $items = $input['items'] ?? [];
      if (empty($items)) { http_response_code(400); echo json_encode(['error' => 'Aucun item']); break; }
      $mode = $input['mode'] ?? 'set';
      if (!in_array($mode, ['add', 'set'], true)) { http_response_code(400); echo json_encode(['error' => 'Mode d’import invalide']); break; }
      $pdo = db();
      $pdo->beginTransaction();
      try {
        $count = 0;
        foreach ($items as $item) {
          $desig = trim((string)($item['designation'] ?? ''));
          $qty = (int)($item['quantite'] ?? 0);
          if (!$desig) continue;
          if ($qty < 0) throw new Exception("Quantité négative interdite pour $desig");
          if ($mode === 'add') {
            if ($qty === 0) continue;
            changeStockQuantity($pdo, $desig, $qty, ['motif' => 'Import hebdomadaire - ajout']);
          } else {
            setStockQuantity($pdo, $desig, $qty, ['motif' => 'Inventaire - import canevas']);
          }
          $count++;
        }
        $pdo->commit();
        echo json_encode(['ok' => true, 'count' => $count, 'mode' => $mode]);
      } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
      }
      break;

    case 'stock_movements':
      $limit = (int)($_GET['limit'] ?? 100);
      $stmt = db()->prepare('SELECT sm.*, i.nom_client as int_nom_client, i.date as int_date
        FROM stock_movements sm
        LEFT JOIN interventions i ON sm.intervention_id COLLATE utf8mb4_unicode_ci = i.id COLLATE utf8mb4_unicode_ci
        ORDER BY sm.date_mouvement DESC
        LIMIT ' . $limit);
      $stmt->execute();
      echo json_encode($stmt->fetchAll());
      break;

    case 'stock_usage':
      $interventionId = $input['id'] ?? '';
      if (!$interventionId) { http_response_code(400); echo json_encode(['error' => 'ID requis']); break; }
      $stmt = db()->prepare('SELECT designation, type, quantite, date_mouvement, motif
        FROM stock_movements
        WHERE intervention_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
        ORDER BY designation');
      $stmt->execute([$interventionId]);
      echo json_encode($stmt->fetchAll());
      break;

    case 'stock_deduct':
      requireAuth(true);
      // NOTE: la déduction se fait désormais automatiquement dans intervention_save
      // (transaction atomique + garde materiel_deduit). Cet endpoint reste appelable
      // par d'anciennes versions de l'app mais devient un no-op si déjà déduit.
      $interventionId = $input['intervention_id'] ?? '';
      $nomClient = $input['nom_client'] ?? '';
      $nomTech = $input['nom_technicien'] ?? '';
      $materiel = $input['materiel_pose'] ?? [];
      if (empty($materiel)) { echo json_encode(['ok' => true, 'deducted' => 0]); break; }

      if ($interventionId) {
        $chk = db()->prepare('SELECT materiel_deduit FROM interventions WHERE id = ?');
        $chk->execute([$interventionId]);
        $row = $chk->fetch();
        if ($row && (int)$row['materiel_deduit'] === 1) {
          echo json_encode(['ok' => true, 'deducted' => 0, 'already_done' => true]);
          break;
        }
      }

      $pdo = db();
      $pdo->beginTransaction();
      try {
        $deducted = 0;
        foreach ($materiel as $rawDesig => $qty) {
          $desig = canonicalDesignation($rawDesig);
          $qty = (int)$qty;
          if ($qty <= 0) continue;
          changeStockQuantity($pdo, $desig, -$qty, [
            'intervention_id' => $interventionId ?: null,
            'nom_client' => $nomClient ?: null,
            'nom_technicien' => $nomTech ?: null,
            'motif' => 'Pose intervention',
          ], true);
          $deducted++;
        }
        if ($interventionId) {
          $pdo->prepare('UPDATE interventions SET materiel_deduit = 1 WHERE id = ?')->execute([$interventionId]);
        }
        $pdo->commit();
        echo json_encode(['ok' => true, 'deducted' => $deducted]);
      } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
      }
      break;

    case 'stock_template':
      $designations = array_keys(STOCK_EXCEL_MAP);
      $result = [];
      foreach ($designations as $d) {
        $result[] = ['designation' => $d, 'label' => STOCK_EXCEL_MAP[$d]['label'], 'quantite' => 0];
      }
      echo json_encode($result);
      break;

    case 'stock_import_excel':
      // Import strict depuis la feuille "POINT GENERAL", bloc "STOCK RESTANT".
      $fileBase64 = $input['file_base64'] ?? '';
      $mode = $input['mode'] ?? 'set';
      if (!in_array($mode, ['add', 'set'], true)) { http_response_code(400); echo json_encode(['error' => 'Mode d’import invalide']); break; }
      if (!$fileBase64) { http_response_code(400); echo json_encode(['error' => 'Fichier requis']); break; }
      $fileData = base64_decode($fileBase64);
      if (!$fileData) { http_response_code(400); echo json_encode(['error' => 'Fichier invalide']); break; }

      $tmpFile = tempnam(sys_get_temp_dir(), 'stock') . '.xlsx';
      file_put_contents($tmpFile, $fileData);

      try {
        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($tmpFile);
        $sheet = $spreadsheet->getSheetByName('POINT GENERAL') ?? $spreadsheet->getSheet(0);
        $rows = $sheet->toArray(null, true, false, false);

        $headerRowIdx = null;
        $valueRowIdx = null;
        foreach ($rows as $i => $row) {
          $first = trim((string)($row[0] ?? ''));
          if (strcasecmp($first, 'STOCK RESTANT') === 0) { $valueRowIdx = $i; }
          if ($headerRowIdx === null && (strcasecmp($first, 'N°') === 0 || strcasecmp(trim((string)($row[1] ?? '')), 'CLIENTS') === 0)) {
            $headerRowIdx = $i;
          }
        }
        @unlink($tmpFile);

        if ($valueRowIdx === null || $headerRowIdx === null) {
          http_response_code(400);
          echo json_encode(['error' => 'Structure Excel non reconnue (bloc STOCK RESTANT ou en-tete introuvable)']);
          break;
        }

        $headerRow = $rows[$headerRowIdx];
        $valueRow = $rows[$valueRowIdx];

        // Normalise les en-tetes (trim, uppercase) -> index de colonne
        $colByHeader = [];
        foreach ($headerRow as $colIdx => $h) {
          $h = strtoupper(trim((string)$h));
          if ($h !== '') $colByHeader[$h] = $colIdx;
        }

        $items = [];
        $notFound = [];
        foreach (STOCK_EXCEL_MAP as $designation => $meta) {
          $colIdx = $colByHeader[$meta['excel_header']] ?? null;
          if ($colIdx === null) { $notFound[] = $meta['excel_header']; continue; }
          $qty = (int)($valueRow[$colIdx] ?? 0);
          if ($qty < 0) throw new Exception("Quantité négative interdite pour $designation");
          $items[] = ['designation' => $designation, 'label' => $meta['label'], 'quantite' => $qty];
        }

        if (empty($items)) {
          http_response_code(400);
          echo json_encode(['error' => 'Aucune colonne reconnue dans le fichier Excel']);
          break;
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
          foreach ($items as $item) {
            if ($mode === 'add') {
              if ($item['quantite'] === 0) continue;
              changeStockQuantity($pdo, $item['designation'], $item['quantite'], ['motif' => 'Import Excel hebdomadaire - ajout']);
            } else {
              setStockQuantity($pdo, $item['designation'], $item['quantite'], ['motif' => 'Inventaire Excel - stock restant']);
            }
          }
          $pdo->commit();
          echo json_encode(['ok' => true, 'count' => count($items), 'not_found' => $notFound, 'mode' => $mode]);
        } catch (Exception $e) {
          $pdo->rollBack();
          http_response_code(500);
          echo json_encode(['error' => $e->getMessage()]);
        }
      } catch (Exception $e) {
        @unlink($tmpFile);
        http_response_code(500);
        echo json_encode(['error' => 'Erreur lecture Excel: ' . $e->getMessage()]);
      }
      break;

    case 'accounts_list':
      $stmt = db()->query('SELECT id, nom, code FROM accounts ORDER BY nom');
      echo json_encode($stmt->fetchAll());
      break;

    case 'account_add':
      $nom = trim($input['nom'] ?? '');
      $code = trim($input['code'] ?? '');
      if (!$nom) { http_response_code(400); echo json_encode(['error' => 'Nom requis']); break; }
      if (!$code || strlen($code) !== 4 || !ctype_digit($code)) {
        http_response_code(400); echo json_encode(['error' => 'Code a 4 chiffres requis']); break;
      }
      $id = bin2hex(random_bytes(16));
      $stmt = db()->prepare('INSERT INTO accounts (id, nom, code) VALUES (?, ?, ?)');
      $stmt->execute([$id, $nom, $code]);
      echo json_encode(['ok' => true, 'id' => $id]);
      break;

    case 'account_delete':
      $id = $input['id'] ?? '';
      if (!$id) { http_response_code(400); echo json_encode(['error' => 'ID requis']); break; }
      $stmt = db()->prepare('DELETE FROM accounts WHERE id = ?');
      $stmt->execute([$id]);
      echo json_encode(['ok' => true]);
      break;

    case 'account_validate':
      $code = trim($input['code'] ?? '');
      if (!$code) { http_response_code(400); echo json_encode(['error' => 'Code requis']); break; }
      $stmt = db()->prepare('SELECT id, nom FROM accounts WHERE code = ?');
      $stmt->execute([$code]);
      $user = $stmt->fetch();
      if (!$user) { http_response_code(404); echo json_encode(['error' => 'Code invalide']); break; }
      echo json_encode($user);
      break;

    default:
      http_response_code(404);
      echo json_encode(['error' => 'Action inconnue: ' . $action]);
  }
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['error' => $e->getMessage()]);
}
