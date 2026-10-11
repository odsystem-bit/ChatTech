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
  ];
  return $aliases[$normalized] ?? trim((string)$designation);
}

function lockStockQuantity(PDO $pdo, string $designation): int {
  $ensure = $pdo->prepare('INSERT INTO stock (designation, quantite) VALUES (?, 0) ON DUPLICATE KEY UPDATE designation = VALUES(designation)');
  $ensure->execute([$designation]);
  $stmt = $pdo->prepare('SELECT quantite FROM stock WHERE designation = ? FOR UPDATE');
  $stmt->execute([$designation]);
  return (int)$stmt->fetchColumn();
}

function changeStockQuantity(PDO $pdo, string $designation, int $delta, array $details = []): int {
  $designation = trim($designation);
  if ($designation === '') throw new Exception('Désignation requise');
  $current = lockStockQuantity($pdo, $designation);
  $next = $current + $delta;
  if ($next < 0) throw new Exception("Stock insuffisant pour $designation");
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
  return changeStockQuantity($pdo, trim($designation), $quantity - $current, $details);
}

function db() {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
  }
  return $pdo;
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Code');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
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
  $r['depart_m'] = is_numeric($r['depart_m'] ?? null) ? (float)$r['depart_m'] : 0.0;
  $r['arrivee_m'] = is_numeric($r['arrivee_m'] ?? null) ? (float)$r['arrivee_m'] : 0.0;
  $r['lineaire_m'] = is_numeric($r['lineaire_m'] ?? null) ? (float)$r['lineaire_m'] : 0.0;
  $r['puissance_fat_dbm'] = is_numeric($r['puissance_fat_dbm'] ?? null) ? (float)$r['puissance_fat_dbm'] : 0.0;
  $r['puissance_pto_dbm'] = is_numeric($r['puissance_pto_dbm'] ?? null) ? (float)$r['puissance_pto_dbm'] : 0.0;
  $r['nb_poteaux_traverses'] = (int)($r['nb_poteaux_traverses'] ?? 0);
  $r['nb_poteaux_implantes'] = (int)($r['nb_poteaux_implantes'] ?? 0);
  $r['nb_poteaux_armes'] = (int)($r['nb_poteaux_armes'] ?? 0);
  $r['pto_qte'] = (int)($r['pto_qte'] ?? 0);
  $r['repeteur_wifi_qte'] = (int)($r['repeteur_wifi_qte'] ?? 0);
  $r['port_disponible'] = (int)($r['port_disponible'] ?? 0);
  $r['ports_disponibles'] = (string)($r['ports_disponibles'] ?? '');
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
}

function authenticatedUser() {
  static $user = null;
  static $checked = false;
  if ($checked) return $user;
  $checked = true;
  $code = trim($_SERVER['HTTP_X_USER_CODE'] ?? '');
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
    if ($type === 'video') $extension = 'mp4';
    elseif ($type === 'fiche' && strtolower(pathinfo($_FILES['file']['name'] ?? '', PATHINFO_EXTENSION)) === 'pdf') $extension = 'pdf';
    $mediaId = bin2hex(random_bytes(16));
    $relativeDir = 'uploads/interventions/' . $interventionId;
    $absoluteDir = __DIR__ . '/' . $relativeDir;
    if (!is_dir($absoluteDir)) mkdir($absoluteDir, 0755, true);
    $relativePath = $relativeDir . '/' . $mediaId . '.' . $extension;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], __DIR__ . '/' . $relativePath)) {
      http_response_code(500); echo json_encode(['error' => 'Impossible de stocker le média']); return;
    }
    $capturedAt = !empty($_POST['captured_at']) ? date('Y-m-d H:i:s', strtotime($_POST['captured_at'])) : null;
    $stmt = db()->prepare('INSERT INTO intervention_media (id, intervention_id, type, file_path, latitude, longitude, precision_m, captured_at, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$mediaId, $interventionId, $type, $relativePath, $_POST['latitude'] ?? null, $_POST['longitude'] ?? null, $_POST['precision_m'] ?? null, $capturedAt, $user['nom']]);
    echo json_encode(['ok' => true, 'id' => $mediaId, 'path' => $relativePath]);
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
    if (empty($user['is_admin']) && strcasecmp((string)$media['added_by'], (string)$user['nom']) !== 0) {
      http_response_code(403);
      echo json_encode(['error' => 'Seul le technicien qui a ajouté ce média ou un administrateur peut le supprimer']);
      return;
    }
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
    $delete = db()->prepare('DELETE FROM intervention_media WHERE id = ?');
    $delete->execute([$mediaId]);
    echo json_encode(['ok' => true]);
    return;
  }
  switch ($action) {
    case 'interventions_list_light':
      $stmt = db()->query('SELECT id, date, statut, nom_technicien, nom_equipe, nom_client, adresse_zone, telephone_ligne, etat, msan, fat_ref, port, offre_souscrite FROM interventions ORDER BY date DESC');
      echo json_encode($stmt->fetchAll());
      break;

    case 'interventions_list':
      // signature_client/signature_technicien exclus : LONGTEXT lourds, inutiles
      // dans une liste. Meme traitement light que intervention_get_light pour
      // les photos (base64 dans points_gps/whatsapp_photos = plusieurs Mo par
      // intervention, la liste pesait >100 Mo et ne chargeait plus sur mobile).
      $stmt = db()->query('SELECT id, date, statut, nom_technicien, nom_equipe,
        nom_client, adresse_zone, telephone_ligne, mobile, etat, msan, fat_ref, port,
        ports_disponibles, port_disponible, type_cable, depart_m, arrivee_m, lineaire_m, puissance_fat_dbm,
        puissance_pto_dbm, mac, sn, nb_poteaux_traverses, nb_poteaux_implantes, nb_poteaux_armes,
        materiel_pose, points_gps, ont_sn, pto_qte, repeteur_wifi_qte, emplacement_ont,
        client_confirme_emplacement, offre_souscrite, remise_equipement_ok,
        appreciation_satisfaction_libre, travaux_conformes, emplacement_valide,
        travail_propre, service_teste, service_fonctionne, explications_donnees,
        recommanderait, accepte_recontact, qualite, delais, professionnalisme,
        nom_client_declaration, remarque_libre, whatsapp_photos, modifie_par, modifie_le
        FROM interventions ORDER BY date DESC');
      $rows = $stmt->fetchAll();
      foreach ($rows as &$r) {
        $r['materiel_pose'] = json_decode($r['materiel_pose'] ?? '{}', true);
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
        nom_client, adresse_zone, telephone_ligne, mobile, etat, msan, fat_ref, port,
        ports_disponibles, port_disponible, type_cable, depart_m, arrivee_m, lineaire_m, puissance_fat_dbm,
          puissance_pto_dbm, mac, sn, nb_poteaux_traverses, nb_poteaux_implantes, nb_poteaux_armes,
        materiel_pose, points_gps, ont_sn, pto_qte, repeteur_wifi_qte, emplacement_ont,
        client_confirme_emplacement, offre_souscrite, remise_equipement_ok,
        appreciation_satisfaction_libre, travaux_conformes, emplacement_valide,
        travail_propre, service_teste, service_fonctionne, explications_donnees,
        recommanderait, accepte_recontact, qualite, delais, professionnalisme,
        nom_client_declaration, remarque_libre, whatsapp_photos, modifie_par, modifie_le AS updated_at
        FROM interventions WHERE id = ?');
      $stmt->execute([$input['id']]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); break; }
      $mp = json_decode($r['materiel_pose'] ?? '{}', true) ?? [];
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
      // Relevé léger pour le live refresh mobile : une seule colonne,
      // aucune donnée base64. L'APK compare puis appelle intervention_get_light
      // seulement si la valeur a changé.
      $stmt = db()->prepare('SELECT modifie_le AS updated_at FROM interventions WHERE id = ?');
      $stmt->execute([$input['id']]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); break; }
      echo json_encode(['updated_at' => $r['updated_at'] ?? '']);
      break;

    case 'intervention_get_photos':
      $stmt = db()->prepare('SELECT points_gps, whatsapp_photos, signature_client, signature_technicien FROM interventions WHERE id = ?');
      $stmt->execute([$input['id']]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); break; }
      $r['points_gps'] = json_decode($r['points_gps'] ?? '[]', true) ?? [];
      $r['whatsapp_photos'] = json_decode($r['whatsapp_photos'] ?? '[]', true) ?? [];
      echo json_encode($r);
      break;

    case 'intervention_get':
      $stmt = db()->prepare('SELECT * FROM interventions WHERE id = ?');
      $stmt->execute([$input['id']]);
      $r = $stmt->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); break; }
      $mp = json_decode($r['materiel_pose'] ?? '{}', true) ?? [];
      $r['materiel_pose'] = empty($mp) ? new stdClass() : $mp;
      $r['points_gps'] = json_decode($r['points_gps'] ?? '[]', true) ?? [];
      $r['whatsapp_photos'] = json_decode($r['whatsapp_photos'] ?? '[]', true) ?? [];
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
        $pdo->commit();
        echo json_encode(['ok' => true, 'stock_restored' => $restored]);
      } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
      }
      break;

    case 'intervention_save':
      $d = $input;
      $portDisponible = (int)($d['port_disponible'] ?? 0);
      if ($portDisponible < 0 || $portDisponible > 8) {
        http_response_code(400);
        echo json_encode(['error' => 'Le nombre de ports disponibles doit être compris entre 0 et 8']);
        break;
      }
      $portsDisponibles = trim((string)($d['ports_disponibles'] ?? ''));
      if ($portsDisponibles !== '') {
        $ports = array_values(array_filter(array_map('trim', explode(',', $portsDisponibles))));
        $invalidPorts = array_filter($ports, fn($port) => !preg_match('/^Port [1-8]$/', $port));
        if ($invalidPorts || count($ports) !== count(array_unique($ports))) {
          http_response_code(400);
          echo json_encode(['error' => 'Les ports disponibles doivent être une liste unique de Port 1 à Port 8']);
          break;
        }
        $d['ports_disponibles'] = implode(', ', $ports);
        $d['port_disponible'] = count($ports);
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
      $isLight = ($d['_light'] ?? false) === true;
      $fields = [
        'id', 'date', 'statut', 'nom_technicien', 'nom_equipe',
        'nom_client', 'adresse_zone', 'telephone_ligne', 'mobile',
        'etat', 'msan', 'fat_ref', 'port', 'ports_disponibles', 'port_disponible', 'type_cable',
        'depart_m', 'arrivee_m', 'lineaire_m', 'puissance_fat_dbm', 'puissance_pto_dbm',
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
        $stmtEx = $pdo->prepare('SELECT points_gps, whatsapp_photos, signature_client, signature_technicien, materiel_pose, materiel_deduit, statut, nom_client, nom_technicien FROM interventions WHERE id = ? FOR UPDATE');
        $stmtEx->execute([$d['id']]);
        $existing = $stmtEx->fetch() ?: null;
      }

      // --- points_gps : restaurer la photo serveur si l'entrée entrante a photo vide ---
      $incomingGps = $d['points_gps'] ?? [];
      if (!is_array($incomingGps)) $incomingGps = [];
      if ($existing) {
        $serverGps = json_decode($existing['points_gps'] ?? '[]', true) ?? [];
        if (empty($incomingGps)) {
          // Liste vide envoyée -> garder la liste serveur complète
          $incomingGps = $serverGps;
        } else {
          $serverByHoro = [];
          foreach ($serverGps as $pt) {
            if (!empty($pt['horodatage'])) $serverByHoro[$pt['horodatage']] = $pt;
          }
          foreach ($incomingGps as &$pt) {
            if (empty($pt['photo']) && !empty($pt['horodatage']) && isset($serverByHoro[$pt['horodatage']])) {
              $pt['photo'] = $serverByHoro[$pt['horodatage']]['photo'] ?? '';
            }
          }
          unset($pt);
        }
      }

      // --- whatsapp_photos : restaurer l'url serveur si vide (match par id) ---
      $incomingWa = $d['whatsapp_photos'] ?? [];
      if (!is_array($incomingWa)) $incomingWa = [];
      if ($existing) {
        $serverWa = json_decode($existing['whatsapp_photos'] ?? '[]', true) ?? [];
        if (empty($incomingWa)) {
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
      }

      // --- signatures : garder la serveur si l'entrante est vide ---
      if ($existing) {
        if (empty($d['signature_client'])) $d['signature_client'] = $existing['signature_client'];
        if (empty($d['signature_technicien'])) $d['signature_technicien'] = $existing['signature_technicien'];
      }

      // --- materiel_pose : garder le serveur si entrant vide ---
      $incomingMat = $d['materiel_pose'] ?? [];
      if (is_object($incomingMat)) $incomingMat = (array)$incomingMat;
      if (!is_array($incomingMat)) $incomingMat = [];
      if ($existing && empty($incomingMat) && !($changedFields !== null && in_array('materiel_pose', $changedFields, true))) {
        $incomingMat = json_decode($existing['materiel_pose'] ?? '{}', true) ?? [];
      }
      $canonicalMat = [];
      foreach ($incomingMat as $designation => $quantity) {
        $canonical = canonicalDesignation($designation);
        $canonicalMat[$canonical] = ($canonicalMat[$canonical] ?? 0) + (int)$quantity;
      }
      $incomingMat = $canonicalMat;
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
        $incomingMat = $mergedMat;
      }
      if ($patchMode && in_array('points_gps', $changedFields, true)) {
        $serverByHoro = [];
        $deletedPoints = array_fill_keys($d['deleted_points'] ?? [], true);
        foreach (json_decode($existing['points_gps'] ?? '[]', true) ?? [] as $point) {
          $key = $point['horodatage'] ?? '';
          if ($key !== '' && !isset($deletedPoints[$key])) $serverByHoro[$key] = $point;
        }
        foreach ($incomingGps as $point) {
          $key = $point['horodatage'] ?? '';
          if ($key !== '' && !isset($deletedPoints[$key])) $serverByHoro[$key] = array_merge($serverByHoro[$key] ?? [], $point);
        }
        $incomingGps = array_values($serverByHoro);
      }
      if ($patchMode && in_array('whatsapp_photos', $changedFields, true)) {
        $serverById = [];
        $deletedPhotos = array_fill_keys($d['deleted_whatsapp_photos'] ?? [], true);
        foreach (json_decode($existing['whatsapp_photos'] ?? '[]', true) ?? [] as $photo) {
          $key = $photo['id'] ?? '';
          if ($key !== '' && !isset($deletedPhotos[$key])) $serverById[$key] = $photo;
        }
        foreach ($incomingWa as $photo) {
          $key = $photo['id'] ?? '';
          if ($key !== '' && !isset($deletedPhotos[$key])) $serverById[$key] = array_merge($serverById[$key] ?? [], $photo);
        }
        $incomingWa = array_values($serverById);
      }
      // --- Déduction stock : à faire seulement au premier passage à 'termine' ---
      $finalStatus = $d['statut'] ?? ($existing['statut'] ?? '');
      $shouldDeductStock = $finalStatus === 'termine'
        && (!$existing || (int)($existing['materiel_deduit'] ?? 0) === 0)
        && (!$patchMode || in_array('statut', $changedFields, true) || $materialPatch);
      $shouldReconcileStock = $finalStatus === 'termine'
        && ($shouldDeductStock || ($existing && (int)($existing['materiel_deduit'] ?? 0) === 1 && $materialPatch));

      try {
        if ($patchMode) {
          $patchColumns = array_values(array_filter($fields, fn($field) => $field !== 'id' && in_array($field, $changedFields, true) && array_key_exists($field, $d)));
          $patchAssignments = array_map(fn($field) => "$field = :$field", $patchColumns);
          if ($materialPatch) $patchAssignments[] = 'materiel_pose = :materiel_pose';
          if (in_array('points_gps', $changedFields, true)) $patchAssignments[] = 'points_gps = :points_gps';
          if (in_array('whatsapp_photos', $changedFields, true)) $patchAssignments[] = 'whatsapp_photos = :whatsapp_photos';
          if ($shouldDeductStock) $patchAssignments[] = 'materiel_deduit = 1';
          if ($patchAssignments) {
            $patchAssignments[] = 'modifie_par = :modifie_par';
            $patchAssignments[] = 'modifie_le = :modifie_le';
            $stmt = $pdo->prepare('UPDATE interventions SET ' . implode(', ', array_unique($patchAssignments)) . ' WHERE id = :id');
            foreach ($patchColumns as $field) {
              $value = $d[$field];
              if (is_bool($value)) $value = $value ? 1 : 0;
              $stmt->bindValue(':' . $field, $value);
            }
            if ($materialPatch) $stmt->bindValue(':materiel_pose', json_encode(empty($incomingMat) ? (object)[] : $incomingMat));
            if (in_array('points_gps', $changedFields, true)) $stmt->bindValue(':points_gps', json_encode($incomingGps));
            if (in_array('whatsapp_photos', $changedFields, true)) $stmt->bindValue(':whatsapp_photos', json_encode($incomingWa));
            $stmt->bindValue(':modifie_par', $d['modifie_par'] ?? '');
            $stmt->bindValue(':modifie_le', $d['modifie_le'] ?? date('Y-m-d H:i:s'));
            $stmt->bindValue(':id', $d['id']);
            $stmt->execute();
          }
        } else {
          $stmt = $pdo->prepare("INSERT INTO interventions SET " .
            implode(', ', array_map(fn($f) => "$f = :$f", $fields)) .
            ", materiel_pose = :materiel_pose, points_gps = :points_gps, whatsapp_photos = :whatsapp_photos" .
            ($shouldDeductStock ? ", materiel_deduit = 1" : "") .
            " ON DUPLICATE KEY UPDATE " . $setClause .
            ", materiel_pose = :materiel_pose" .
            ", points_gps = :points_gps" .
            ", whatsapp_photos = :whatsapp_photos" .
            ($shouldDeductStock ? ", materiel_deduit = 1" : ""));

          foreach ($fields as $f) {
            $val = $d[$f] ?? null;
            if (is_bool($val)) $val = $val ? 1 : 0;
            $stmt->bindValue(':' . $f, $val);
          }
          $stmt->bindValue(':materiel_pose', json_encode(empty($incomingMat) ? (object)[] : $incomingMat));
          $stmt->bindValue(':points_gps', json_encode($incomingGps));
          $stmt->bindValue(':whatsapp_photos', json_encode($incomingWa));
          $stmt->execute();
        }

        $deducted = 0;
        if ($shouldReconcileStock) {
          $usageStmt = $pdo->prepare("SELECT designation, SUM(CASE WHEN type = 'sortie' THEN quantite WHEN type = 'entree' THEN -quantite ELSE 0 END) AS quantite FROM stock_movements WHERE intervention_id = ? GROUP BY designation");
          $usageStmt->execute([$d['id']]);
          $recordedUsage = [];
          foreach ($usageStmt->fetchAll() as $movement) $recordedUsage[$movement['designation']] = (int)$movement['quantite'];
          $designations = array_unique(array_merge(array_keys($recordedUsage), array_keys($incomingMat)));
          foreach ($designations as $desig) {
            $target = (int)($incomingMat[$desig] ?? 0);
            if ($target < 0) throw new Exception("Quantité invalide pour $desig");
            $delta = $target - ($recordedUsage[$desig] ?? 0);
            if ($delta === 0) continue;
            changeStockQuantity($pdo, $desig, -$delta, [
              'intervention_id' => $d['id'],
              'nom_client' => $d['nom_client'] ?? ($existing['nom_client'] ?? ''),
              'nom_technicien' => $d['nom_technicien'] ?? ($existing['nom_technicien'] ?? ''),
              'motif' => $delta > 0 ? 'Pose intervention' : 'Correction matériel intervention',
            ]);
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
        $updStmt = $pdo->prepare('UPDATE stock SET quantite = quantite - ? WHERE designation = ?');
        $mvStmt = $pdo->prepare('INSERT INTO stock_movements (designation, type, quantite, intervention_id, nom_client, nom_technicien, motif) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($materiel as $rawDesig => $qty) {
          $desig = canonicalDesignation($rawDesig);
          $qty = (int)$qty;
          if ($qty <= 0) continue;
          $updStmt = $pdo->prepare('UPDATE stock SET quantite = quantite - ? WHERE designation = ? AND quantite >= ?');
          $updStmt->execute([$qty, $desig, $qty]);
          if ($updStmt->rowCount() !== 1) throw new Exception("Stock insuffisant pour $desig");
          $mvStmt->execute([$desig, 'sortie', $qty, $interventionId, $nomClient, $nomTech, 'Pose intervention']);
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
