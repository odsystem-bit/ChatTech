<?php
// Export Excel hebdomadaire multi-feuilles (GS BTP)
// Génère un fichier Excel avec les 5 feuilles basées sur les interventions de la semaine courante
// Endpoint: ?action=export_hebdo&code=ADMIN_CODE

require_once __DIR__ . '/vendor/autoload.php';
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

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;

$materialColumns = [
    'ont' => 'E', 'pto' => 'F', 'jarretiere' => 'G', 'piton' => 'H',
    'cheville' => 'I', 'connecteur' => 'J', 'closer' => 'K', 'fibre_1fo' => 'L',
    'cpc_50' => 'M', 'cpc_100' => 'N', 'cpc_150' => 'O', 'cpc_200' => 'P',
    'cpc_250' => 'Q', 'cpc_300' => 'R', 'cpc_350' => 'S', 'crochets' => 'T',
    'pince' => 'U', 'susp' => 'V', 'traverse_13t' => 'W', 'traverse_15t' => 'X',
];

if (!function_exists('db')) {
    function db() {
        static $pdo = null;
        if ($pdo === null) {
            $dsn = 'mysql:host=' . (getenv('DB_HOST') ?: 'localhost')
                . ';dbname=' . (getenv('DB_NAME') ?: 'u795734321_fibre')
                . ';charset=' . (getenv('DB_CHARSET') ?: 'utf8mb4');
            $pdo = new PDO($dsn, getenv('DB_USER') ?: 'u795734321_fibretrack', getenv('DB_PASS') ?: '', [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        }
        return $pdo;
    }
}

header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Access-Control-Allow-Origin: *');

// Récupérer les paramètres depuis $_GET ou depuis l'URL
$params = $_GET;
if (empty($params)) {
    // Parser l'URL si les paramètres ne sont pas dans $_GET
    $url = $_SERVER['REQUEST_URI'] ?? '';
    if (strpos($url, '?') !== false) {
        parse_str(parse_url($url, PHP_URL_QUERY), $params);
    }
}

$action = $params['action'] ?? '';
$code = $params['code'] ?? '';

function requireExcelAdmin($code) {
    if ($code !== '9999') {
        http_response_code(401);
        exit;
    }
}

if (!in_array($action, ['export_hebdo', 'export_mois', 'export_periode', 'export_historique'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Action invalide']);
    exit;
}

requireExcelAdmin($code);

function trouverTemplate(): ?string {
    foreach ([__DIR__ . '/GS BTP 090926.xlsx', dirname(__DIR__) . '/GS BTP 090926.xlsx'] as $candidate) {
        if (file_exists($candidate)) return $candidate;
    }
    return null;
}

/**
 * Construit le classeur GS BTP pour la plage [$debut, $finExclusive[.
 * $debut / $finExclusive : 'YYYY-MM-DD'.
 */
function construireClasseur(string $debut, string $finExclusive): Spreadsheet {
    global $materialColumns;

    $templateFile = trouverTemplate();
    if ($templateFile === null) {
        throw new Exception('Modèle Excel introuvable (GS BTP 090926.xlsx)');
    }
    $spreadsheet = IOFactory::load($templateFile);

    $weekStart = $debut;
    $weekEnd = date('Y-m-d', strtotime('-1 day', strtotime($finExclusive)));
    $weekEndExclusive = $finExclusive;
    
    // Récupérer les interventions de la semaine
    $stmt = db()->prepare("
        SELECT id, date, statut, nom_technicien, nom_equipe, nom_client,
          adresse_zone, telephone_ligne, materiel_pose, points_gps,
          nb_poteaux_implantes, nb_poteaux_traverses, nb_poteaux_armes
        FROM interventions
        WHERE date >= ? AND date < ?
        ORDER BY date ASC
    ");
    $stmt->execute([$weekStart, $weekEndExclusive]);
    $interventions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $movementStmt = db()->prepare('SELECT date_mouvement, type, designation, quantite, nom_client, nom_technicien, motif
        FROM stock_movements WHERE date_mouvement >= ? AND date_mouvement < ? ORDER BY date_mouvement ASC');
    $movementStmt->execute([$weekStart, $weekEndExclusive]);
    $weekMovements = $movementStmt->fetchAll(PDO::FETCH_ASSOC);

    $afterStmt = db()->prepare('SELECT type, designation, quantite FROM stock_movements WHERE date_mouvement >= ?');
    $afterStmt->execute([$weekEndExclusive]);
    $afterMovements = $afterStmt->fetchAll(PDO::FETCH_ASSOC);

    $stockRows = db()->query('SELECT designation, quantite FROM stock')->fetchAll(PDO::FETCH_KEY_PAIR);
    $stockInitial = $stockReceived = $stockUsed = $stockRemaining = [];
    foreach ($materialColumns as $key => $_column) {
        $weekAdd = $weekOut = $afterNet = 0;
        foreach ($weekMovements as $movement) {
            if ($movement['designation'] !== $key) continue;
            if (in_array($movement['type'], ['entree', 'ajustement'], true)) $weekAdd += (int)$movement['quantite'];
            if ($movement['type'] === 'sortie') $weekOut += (int)$movement['quantite'];
        }
        foreach ($afterMovements as $movement) {
            if ($movement['designation'] !== $key) continue;
            $afterNet += in_array($movement['type'], ['entree', 'ajustement'], true)
                ? (int)$movement['quantite'] : -(int)$movement['quantite'];
        }
        $current = (int)($stockRows[$key] ?? 0);
        $stockInitial[$key] = $current - ($weekAdd - $weekOut) - $afterNet;
        $stockReceived[$key] = $weekAdd;
        $stockUsed[$key] = $weekOut;
        $stockRemaining[$key] = $stockInitial[$key] + $weekAdd - $weekOut;
    }

    $reference = null;
    $refFile = __DIR__ . '/config/stock_reference.php';
    if (file_exists($refFile)) {
        foreach ((require $refFile) as $ref) {
            if ($ref['debut'] === $weekStart && $ref['fin'] === $weekEnd) { $reference = $ref; break; }
        }
    }
    if ($reference !== null) {
        foreach ($materialColumns as $key => $_column) {
            $stockInitial[$key] = (int)($reference['initial'][$key] ?? 0);
            $stockReceived[$key] = (int)($reference['recu'][$key] ?? 0);
            $stockRemaining[$key] = $stockInitial[$key] + $stockReceived[$key];
        }
    }
    
    // === FEUILLE 1: POINT GENERAL ===
    $sheetPoint = $spreadsheet->getSheetByName('POINT GENERAL');
    if ($sheetPoint) {
        // Date de réception (début de semaine)
        $sheetPoint->setCellValue('B1', date('d/m/y', strtotime($weekStart)));
        // Date de retour (fin de semaine)
        $sheetPoint->setCellValue('B3', date('d/m/y', strtotime($weekEnd)));
        // Équipe (BTP)
        $sheetPoint->setCellValue('B5', 'BTP');
        
        // Nombre d'interventions de la semaine
        $sheetPoint->setCellValue('B7', count($interventions));
        $sheetPoint->setCellValue('B3', date('d/m/y', strtotime($weekEnd)));
        foreach ($materialColumns as $key => $column) {
            $sheetPoint->setCellValue($column . '7', $stockInitial[$key]);
            $sheetPoint->setCellValue($column . '8', $stockReceived[$key]);
            $sheetPoint->setCellValue($column . '9', $stockRemaining[$key]);
        }

        $row = 11;
        $totals = array_fill_keys(array_keys($materialColumns), 0);
        foreach ($interventions as $intervention) {
            $materials = json_decode($intervention['materiel_pose'] ?? '{}', true) ?: [];
            $sheetPoint->setCellValue('A' . $row, $row - 10);
            $sheetPoint->setCellValue('B' . $row, trim($intervention['nom_client'] ?? ''));
            $sheetPoint->setCellValue('C' . $row, $intervention['telephone_ligne'] ?? '');
            $sheetPoint->setCellValue('D' . $row, date('d/m/y', strtotime($intervention['date'])));
            foreach ($materialColumns as $key => $column) {
                $quantity = max(0, (int)($materials[$key] ?? 0));
                $sheetPoint->setCellValue($column . $row, $quantity);
                $totals[$key] += $quantity;
            }
            $row++;
        }
        $totalRow = max(52, $row);
        $sheetPoint->setCellValue('A' . $totalRow, 'TOTAL');
        foreach ($materialColumns as $key => $column) $sheetPoint->setCellValue($column . $totalRow, $totals[$key]);
        if ($reference !== null) {
            $sheetPoint->setCellValue('A' . ($totalRow + 1), 'STOCK FINAL');
            foreach ($materialColumns as $key => $column) {
                $sheetPoint->setCellValue($column . ($totalRow + 1), max(0, $stockRemaining[$key] - $totals[$key]));
            }
        }
    }
    
    // === FEUILLE 2: MATERIELS RECEPTIONNES ===
    $sheetMateriels = $spreadsheet->getSheetByName('MATERIELS RECEPTIONNES');
    if ($sheetMateriels) {
        // Date de réception
        $sheetMateriels->setCellValue('B1', date('d/m/y', strtotime($weekStart)));
        
        $row = 4;
        foreach ($weekMovements as $movement) {
            if (!in_array($movement['type'], ['entree', 'ajustement'], true)) continue;
            $sheetMateriels->setCellValue('A' . $row, date('d/m/Y', strtotime($movement['date_mouvement'])));
            $sheetMateriels->setCellValue('B' . $row, strtoupper($movement['designation']));
            $sheetMateriels->setCellValue('C' . $row, (int)$movement['quantite']);
            $sheetMateriels->setCellValue('D' . $row, $movement['nom_client'] ?? '');
            $sheetMateriels->setCellValue('E' . $row, $movement['nom_technicien'] ?? '');
            $row++;
        }
        $sheetMateriels->setCellValue('A' . $row, 'TOTAL RECU');
        $sheetMateriels->setCellValue('C' . $row, array_sum($stockReceived));
    }
    
    // === FEUILLE 3: POTEAUX IMPLANTES ===
    $sheetPoteauxImp = $spreadsheet->getSheetByName('POTEAUX IMPLANTES');
    if ($sheetPoteauxImp) {
        $row = 2; // Commencer à la ligne 2 (après l'en-tête)
        
        foreach ($interventions as $int) {
            $nbGps = 0;
            foreach (json_decode($int['points_gps'] ?? '[]', true) ?: [] as $point) {
                if (($point['type'] ?? '') === 'Poteau' && ($point['sous_type'] ?? '') === 'Implanté') $nbGps++;
            }
            $nbPoteaux = max((int)($int['nb_poteaux_implantes'] ?? 0), $nbGps);
            if ($nbPoteaux > 0) {
                $sheetPoteauxImp->setCellValue('A' . $row, date('d/m/Y', strtotime($int['date'])));
                $sheetPoteauxImp->setCellValue('B' . $row, trim($int['nom_client'] ?? ''));
                $sheetPoteauxImp->setCellValue('C' . $row, $int['telephone_ligne'] ?? '');
                $sheetPoteauxImp->setCellValue('D' . $row, trim($int['adresse_zone'] ?? ''));
                $sheetPoteauxImp->setCellValue('E' . $row, 'BTP');
                $sheetPoteauxImp->setCellValue('F' . $row, $nbPoteaux);
                $gpsIndex = 7;
                foreach (json_decode($int['points_gps'] ?? '[]', true) ?: [] as $point) {
                    if (($point['type'] ?? '') !== 'Poteau' || ($point['sous_type'] ?? '') !== 'Implanté') continue;
                    $gpsColumn = PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($gpsIndex++);
                    $sheetPoteauxImp->setCellValue($gpsColumn . $row, ($point['lat'] ?? '') . ',' . ($point['lng'] ?? ''));
                }
                $row++;
            }
        }
    }
    
    // === FEUILLE 4: POTEAUX ARMES ===
    $sheetPoteauxArm = $spreadsheet->getSheetByName('POTEAUX ARMES');
    if ($sheetPoteauxArm) {
        $row = 2; // Commencer à la ligne 2
        
        foreach ($interventions as $int) {
            $nbGps = 0;
            foreach (json_decode($int['points_gps'] ?? '[]', true) ?: [] as $point) {
                if (($point['type'] ?? '') === 'Poteau' && ($point['sous_type'] ?? '') === 'Armé') $nbGps++;
            }
            $nbPoteaux = max((int)($int['nb_poteaux_armes'] ?? 0), $nbGps);
            if ($nbPoteaux > 0) {
                $sheetPoteauxArm->setCellValue('A' . $row, date('d/m/Y', strtotime($int['date'])));
                $sheetPoteauxArm->setCellValue('B' . $row, trim($int['nom_client'] ?? ''));
                $sheetPoteauxArm->setCellValue('C' . $row, $int['telephone_ligne'] ?? '');
                $sheetPoteauxArm->setCellValue('D' . $row, trim($int['adresse_zone'] ?? ''));
                $sheetPoteauxArm->setCellValue('E' . $row, 'BTP');
                $sheetPoteauxArm->setCellValue('F' . $row, $nbPoteaux);
                $gpsIndex = 7;
                foreach (json_decode($int['points_gps'] ?? '[]', true) ?: [] as $point) {
                    if (($point['type'] ?? '') !== 'Poteau' || ($point['sous_type'] ?? '') !== 'Armé') continue;
                    $gpsColumn = PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($gpsIndex++);
                    $sheetPoteauxArm->setCellValue($gpsColumn . $row, ($point['lat'] ?? '') . ',' . ($point['lng'] ?? ''));
                }
                $row++;
            }
        }
    }
    
    // === FEUILLE 5: MATERIELS DEFECTUEUX ===
    $sheetDefectueux = $spreadsheet->getSheetByName('MATERIELS DEFECTUEUX');
    if ($sheetDefectueux) {
        $row = 2; // Commencer à la ligne 2
        
        // Pour l'instant, il n'y a pas de champ "matériel défectueux" dans le formulaire
        // On peut ajouter ce champ plus tard si nécessaire
        // Pour l'instant, la feuille reste vide
    }
    
    return $spreadsheet;
}

try {
    if (trouverTemplate() === null && $action === 'export_hebdo') {
        // Fallback historique sans modèle : comportement inchangé.
        require __DIR__ . '/excel_hebdo_simple.php';
        exit;
    }

    if ($action === 'export_hebdo') {
        // Semaine lundi-dimanche
        $requestedDate = $params['week_start'] ?? date('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $requestedDate) || strtotime($requestedDate) === false) {
            throw new Exception('Date de semaine invalide');
        }
        $debut = date('Y-m-d', strtotime('monday this week', strtotime($requestedDate)));
        $fin = date('Y-m-d', strtotime('monday next week', strtotime($debut)));

        $spreadsheet = construireClasseur($debut, $fin);
        $filename = 'GS_BTP_' . date('d-m-Y', strtotime($debut)) . '.xlsx';
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        IOFactory::createWriter($spreadsheet, 'Xlsx')->save('php://output');
        exit;
    }

    if ($action === 'export_mois') {
        // Clôture mensuelle : même classeur GS BTP, plage = mois choisi.
        $mois = $params['mois'] ?? date('Y-m');
        if (!preg_match('/^\d{4}-\d{2}$/', $mois) || strtotime($mois . '-01') === false) {
            throw new Exception('Mois invalide (format AAAA-MM)');
        }
        $debut = $mois . '-01';
        $fin = date('Y-m-d', strtotime('first day of next month', strtotime($debut)));

        $spreadsheet = construireClasseur($debut, $fin);
        $filename = 'GS_BTP_' . $mois . '.xlsx';
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        IOFactory::createWriter($spreadsheet, 'Xlsx')->save('php://output');
        exit;
    }

    if ($action === 'export_periode') {
        // Point sur une plage libre : debut et fin inclus (AAAA-MM-JJ).
        $d1 = $params['debut'] ?? '';
        $d2 = $params['fin'] ?? '';
        foreach ([$d1, $d2] as $d) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || strtotime($d) === false) {
                throw new Exception('Dates invalides (format AAAA-MM-JJ)');
            }
        }
        if ($d2 < $d1) { [$d1, $d2] = [$d2, $d1]; }
        $fin = date('Y-m-d', strtotime('+1 day', strtotime($d2)));

        $spreadsheet = construireClasseur($d1, $fin);
        $filename = 'GS_BTP_' . $d1 . '_au_' . $d2 . '.xlsx';
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        IOFactory::createWriter($spreadsheet, 'Xlsx')->save('php://output');
        exit;
    }

    // export_historique : tout le dossier depuis la 1re fiche, un classeur
    // par mois dans un ZIP (clôture mensuelle en une seule récupération).
    $premiere = db()->query('SELECT MIN(date) FROM interventions')->fetchColumn();
    if (!$premiere) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Aucune intervention à exporter']);
        exit;
    }

    $zipPath = tempnam(sys_get_temp_dir(), 'gsbtp_');
    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::OVERWRITE) !== true) {
        throw new Exception('Impossible de créer l\'archive ZIP');
    }

    $moisCourant = new DateTime(date('Y-m-01', strtotime($premiere)));
    $limite = new DateTime('first day of next month');
    while ($moisCourant < $limite) {
        $debut = $moisCourant->format('Y-m-01');
        $moisCourant->modify('first day of next month');
        $fin = $moisCourant->format('Y-m-01');

        $spreadsheet = construireClasseur($debut, $fin);
        $tmpXlsx = tempnam(sys_get_temp_dir(), 'gsbtp_x_');
        IOFactory::createWriter($spreadsheet, 'Xlsx')->save($tmpXlsx);
        $spreadsheet->disconnectWorksheets();
        unset($spreadsheet);

        $zip->addFile($tmpXlsx, 'GS_BTP_' . substr($debut, 0, 7) . '.xlsx');
    }
    $zip->close();

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="GS_BTP_archives_' . date('Y-m-d') . '.zip"');
    header('Content-Length: ' . filesize($zipPath));
    readfile($zipPath);
    unlink($zipPath);
    exit;

} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
}
