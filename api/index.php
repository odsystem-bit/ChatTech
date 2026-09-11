<?php
require_once __DIR__ . '/_env.php';

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'u795734321_fibre');
define('DB_USER', getenv('DB_USER') ?: 'u795734321_fibretrack');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_CHARSET', getenv('DB_CHARSET') ?: 'utf8mb4');

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
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? [];

try {
  switch ($action) {
    case 'interventions_list_light':
      $stmt = db()->query('SELECT id, date, statut, nom_technicien, nom_equipe, nom_client, adresse_zone, telephone_ligne, etat, msan, fat_ref, port, offre_souscrite FROM interventions ORDER BY date DESC');
      echo json_encode($stmt->fetchAll());
      break;

    case 'interventions_list':
      $stmt = db()->query('SELECT * FROM interventions ORDER BY date DESC');
      $rows = $stmt->fetchAll();
      foreach ($rows as &$r) {
        $r['materiel_pose'] = json_decode($r['materiel_pose'] ?? '{}', true);
        $r['points_gps'] = json_decode($r['points_gps'] ?? '[]', true);
        $r['whatsapp_photos'] = json_decode($r['whatsapp_photos'] ?? '[]', true);
        $r['port_disponible'] = (bool)$r['port_disponible'];
        $r['remise_equipement_ok'] = (bool)$r['remise_equipement_ok'];
        $r['travaux_conformes'] = (bool)$r['travaux_conformes'];
        $r['emplacement_valide'] = (bool)$r['emplacement_valide'];
        $r['travail_propre'] = (bool)$r['travail_propre'];
        $r['service_teste'] = (bool)$r['service_teste'];
        $r['service_fonctionne'] = (bool)$r['service_fonctionne'];
        $r['explications_donnees'] = (bool)$r['explications_donnees'];
        $r['recommanderait'] = (bool)$r['recommanderait'];
        $r['accepte_recontact'] = (bool)$r['accepte_recontact'];
      }
      echo json_encode($rows);
      break;

    case 'intervention_get_light':
      $stmt = db()->prepare('SELECT * FROM interventions WHERE id = ?');
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
      $r['port_disponible'] = (bool)$r['port_disponible'];
      $r['client_confirme_emplacement'] = (bool)$r['client_confirme_emplacement'];
      $r['remise_equipement_ok'] = (bool)$r['remise_equipement_ok'];
      $r['travaux_conformes'] = (bool)$r['travaux_conformes'];
      $r['emplacement_valide'] = (bool)$r['emplacement_valide'];
      $r['travail_propre'] = (bool)$r['travail_propre'];
      $r['service_teste'] = (bool)$r['service_teste'];
      $r['service_fonctionne'] = (bool)$r['service_fonctionne'];
      $r['explications_donnees'] = (bool)$r['explications_donnees'];
      $r['recommanderait'] = (bool)$r['recommanderait'];
      $r['accepte_recontact'] = (bool)$r['accepte_recontact'];
      echo json_encode($r);
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
      $r['port_disponible'] = (bool)$r['port_disponible'];
      $r['client_confirme_emplacement'] = (bool)$r['client_confirme_emplacement'];
      $r['remise_equipement_ok'] = (bool)$r['remise_equipement_ok'];
      $r['travaux_conformes'] = (bool)$r['travaux_conformes'];
      $r['emplacement_valide'] = (bool)$r['emplacement_valide'];
      $r['travail_propre'] = (bool)$r['travail_propre'];
      $r['service_teste'] = (bool)$r['service_teste'];
      $r['service_fonctionne'] = (bool)$r['service_fonctionne'];
      $r['explications_donnees'] = (bool)$r['explications_donnees'];
      $r['recommanderait'] = (bool)$r['recommanderait'];
      $r['accepte_recontact'] = (bool)$r['accepte_recontact'];
      echo json_encode($r);
      break;

    case 'intervention_delete':
      $stmt = db()->prepare('DELETE FROM interventions WHERE id = ?');
      $stmt->execute([$input['id']]);
      echo json_encode(['ok' => true]);
      break;

    case 'intervention_save':
      $d = $input;
      $isLight = ($d['_light'] ?? false) === true;
      $fields = [
        'id', 'date', 'statut', 'nom_technicien', 'nom_equipe',
        'nom_client', 'adresse_zone', 'telephone_ligne', 'mobile',
        'etat', 'msan', 'fat_ref', 'port', 'port_disponible', 'type_cable',
        'depart_m', 'arrivee_m', 'lineaire_m', 'puissance_fat_dbm', 'puissance_pto_dbm',
        'mac', 'sn', 'nb_poteaux_traverses', 'nb_poteaux_implantes',
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
      $placeholders = array_map(fn($f) => ':' . $f, $fields);
      $setClause = implode(', ', array_map(fn($f) => "$f = :$f", $fields));

      if ($isLight) {
        $stmt = db()->prepare("INSERT INTO interventions SET " .
          implode(', ', array_map(fn($f) => "$f = :$f", $fields)) .
          ", materiel_pose = :materiel_pose, points_gps = :points_gps, whatsapp_photos = :whatsapp_photos " .
          "ON DUPLICATE KEY UPDATE " . $setClause .
          ", materiel_pose = COALESCE(NULLIF(:materiel_pose, '{}'), materiel_pose)" .
          ", points_gps = COALESCE(NULLIF(:points_gps, '[]'), points_gps)" .
          ", whatsapp_photos = COALESCE(NULLIF(:whatsapp_photos, '[]'), whatsapp_photos)" .
          ", signature_client = COALESCE(NULLIF(:signature_client, ''), signature_client)" .
          ", signature_technicien = COALESCE(NULLIF(:signature_technicien, ''), signature_technicien)");
      } else {
        $stmt = db()->prepare("INSERT INTO interventions SET " .
          implode(', ', array_map(fn($f) => "$f = :$f", $fields)) .
          ", materiel_pose = :materiel_pose, points_gps = :points_gps, whatsapp_photos = :whatsapp_photos " .
          "ON DUPLICATE KEY UPDATE " . $setClause .
          ", materiel_pose = :materiel_pose, points_gps = :points_gps, whatsapp_photos = :whatsapp_photos");
      }

      foreach ($fields as $f) {
        $val = $d[$f] ?? null;
        if (is_bool($val)) $val = $val ? 1 : 0;
        $stmt->bindValue(':' . $f, $val);
      }
      $stmt->bindValue(':materiel_pose', json_encode($d['materiel_pose'] ?? (object)[]));
      $stmt->bindValue(':points_gps', json_encode($d['points_gps'] ?? []));
      $stmt->bindValue(':whatsapp_photos', json_encode($d['whatsapp_photos'] ?? []));
      $stmt->execute();
      echo json_encode(['ok' => true]);
      break;

    case 'stock_list':
      $stmt = db()->query('SELECT designation, quantite FROM stock ORDER BY designation');
      $rows = $stmt->fetchAll();
      $result = [];
      foreach ($rows as $r) { $result[$r['designation']] = (int)$r['quantite']; }
      echo json_encode($result);
      break;

    case 'stock_save':
      $designation = $input['designation'] ?? '';
      $quantite = $input['quantite'] ?? 0;
      $stmt = db()->prepare('INSERT INTO stock (designation, quantite) VALUES (?, ?) ON DUPLICATE KEY UPDATE quantite = ?');
      $stmt->execute([$designation, $quantite, $quantite]);
      echo json_encode(['ok' => true]);
      break;

    case 'stock_import':
      $items = $input['items'] ?? [];
      if (empty($items)) { http_response_code(400); echo json_encode(['error' => 'Aucun item']); break; }
      $pdo = db();
      $pdo->beginTransaction();
      try {
        $stmt = $pdo->prepare('INSERT INTO stock (designation, quantite) VALUES (?, ?) ON DUPLICATE KEY UPDATE quantite = ?');
        $mvStmt = $pdo->prepare('INSERT INTO stock_movements (designation, type, quantite, motif) VALUES (?, ?, ?, ?)');
        foreach ($items as $item) {
          $desig = $item['designation'] ?? '';
          $qty = (int)($item['quantite'] ?? 0);
          if (!$desig) continue;
          $stmt->execute([$desig, $qty, $qty]);
          $mvStmt->execute([$desig, 'entree', $qty, 'Import stock']);
        }
        $pdo->commit();
        echo json_encode(['ok' => true, 'count' => count($items)]);
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
      $interventionId = $input['intervention_id'] ?? '';
      $nomClient = $input['nom_client'] ?? '';
      $nomTech = $input['nom_technicien'] ?? '';
      $materiel = $input['materiel_pose'] ?? [];
      if (empty($materiel)) { echo json_encode(['ok' => true, 'deducted' => 0]); break; }

      $pdo = db();
      $pdo->beginTransaction();
      try {
        $deducted = 0;
        $updStmt = $pdo->prepare('UPDATE stock SET quantite = GREATEST(0, quantite - ?) WHERE designation = ?');
        $mvStmt = $pdo->prepare('INSERT INTO stock_movements (designation, type, quantite, intervention_id, nom_client, nom_technicien, motif) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($materiel as $desig => $qty) {
          $qty = (int)$qty;
          if ($qty <= 0) continue;
          $updStmt->execute([$qty, $desig]);
          if ($updStmt->rowCount() === 0) {
            $pdo->prepare('INSERT INTO stock (designation, quantite) VALUES (?, 0) ON DUPLICATE KEY UPDATE quantite = quantite')->execute([$desig]);
            $updStmt->execute([$qty, $desig]);
          }
          $mvStmt->execute([$desig, 'sortie', $qty, $interventionId, $nomClient, $nomTech, 'Pose intervention']);
          $deducted++;
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
      $designations = [
        'rue', 'pince', 'crochets', 'susp', 'piton', 'closer', 'rp1',
        'traverse_13t', 'traverse_15t', 'semelle_eq', 'poteau_sbee_non_arme',
        'poteau_sbee_arme', 'ont', 'pto', 'repeteur_wifi', 'jarretiere',
        'cpc_50', 'cpc_100', 'cpc_150', 'cpc_200', 'cpc_300', 'cpc_350',
        'connecteur', 'boulon', 'bouchon_feuillard'
      ];
      $labels = [
        'rue' => 'Rue', 'pince' => 'Pince', 'crochets' => 'Crochets',
        'susp' => 'Suspente', 'piton' => 'Piton', 'closer' => 'Closer',
        'rp1' => 'RP1', 'traverse_13t' => 'Traverse 13T', 'traverse_15t' => 'Traverse 15T',
        'semelle_eq' => 'Semelle Eq', 'poteau_sbee_non_arme' => 'Poteau SBEE non armé',
        'poteau_sbee_arme' => 'Poteau SBEE armé', 'ont' => 'ONT', 'pto' => 'PTO',
        'repeteur_wifi' => 'Répéteur WIFI', 'jarretiere' => 'Jarretière',
        'cpc_50' => 'Câble CPC 50', 'cpc_100' => 'Câble CPC 100',
        'cpc_150' => 'Câble CPC 150', 'cpc_200' => 'Câble CPC 200',
        'cpc_300' => 'Câble CPC 300', 'cpc_350' => 'Câble CPC 350',
        'connecteur' => 'Connecteur', 'boulon' => 'Boulon',
        'bouchon_feuillard' => 'Bouchon feuillard'
      ];
      $result = [];
      foreach ($designations as $d) {
        $result[] = ['designation' => $d, 'label' => $labels[$d] ?? $d, 'quantite' => 0];
      }
      echo json_encode($result);
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
