<?php
// Export Excel hebdomadaire simplifié (sans template)
// Endpoint: ?action=export_hebdo&code=ADMIN_CODE

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/_env.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

function db() {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . (getenv('DB_HOST') ?: 'localhost') . ';dbname=' . (getenv('DB_NAME') ?: 'u795734321_fibre') . ';charset=utf8mb4',
            getenv('DB_USER') ?: '',
            getenv('DB_PASS') ?: '',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Access-Control-Allow-Origin: *');

$action = $_GET['action'] ?? '';
$code = $_GET['code'] ?? ($_SERVER['HTTP_X_USER_CODE'] ?? '');
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
$token = trim($_GET['token'] ?? '');
if (!$token && preg_match('/^Bearer\s+([a-f0-9]{32,128})$/i', trim($authHeader), $m)) {
    $token = $m[1];
}
$requestedTeamId = trim($_GET['team_id'] ?? ($_SERVER['HTTP_X_TEAM_ID'] ?? ''));

if ($action !== 'export_hebdo') {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Action invalide']);
    exit;
}

$pdoAuth = db();
$authRow = null;
if ($token !== '' && preg_match('/^[a-f0-9]{32,128}$/i', $token)) {
    $stmtAuth = $pdoAuth->prepare('SELECT a.id, a.role, a.team_id, a.actif, t.nom_equipe FROM accounts a LEFT JOIN teams t ON t.id = a.team_id WHERE a.session_token = ? LIMIT 1');
    $stmtAuth->execute([$token]);
    $authRow = $stmtAuth->fetch();
}
if (!$authRow && $code === '9999') {
    $authRow = ['id' => 'admin-9999', 'role' => 'chef_equipe', 'team_id' => $requestedTeamId ?: 'team_telecom_btp_001', 'actif' => 1, 'nom_equipe' => 'BTP'];
}
if (!$authRow && preg_match('/^\d{4}$/', (string)$code)) {
    $stmtAuth = $pdoAuth->prepare('SELECT a.id, a.role, a.team_id, a.actif, t.nom_equipe FROM accounts a LEFT JOIN teams t ON t.id = a.team_id WHERE a.code = ? ORDER BY (a.team_id = "team_telecom_btp_001") DESC LIMIT 1');
    $stmtAuth->execute([$code]);
    $authRow = $stmtAuth->fetch();
}
if (!$authRow || (isset($authRow['actif']) && !(int)$authRow['actif'])) {
    http_response_code(401);
    exit;
}
if ($requestedTeamId !== '' && $requestedTeamId !== $authRow['team_id'] && ($authRow['role'] ?? '') !== 'super_admin') {
    http_response_code(403);
    exit;
}
$teamId = ($requestedTeamId !== '' && ($authRow['role'] ?? '') === 'super_admin') ? $requestedTeamId : ($authRow['team_id'] ?: 'team_telecom_btp_001');
$teamName = $authRow['nom_equipe'] ?: 'BTP';

try {
    // Déterminer la semaine courante (lundi-dimanche)
    $requestedDate = $_GET['week_start'] ?? date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $requestedDate) || strtotime($requestedDate) === false) {
        throw new Exception('Date de semaine invalide');
    }
    $weekStart = date('Y-m-d', strtotime('monday this week', strtotime($requestedDate)));
    $weekEnd = date('Y-m-d', strtotime('sunday this week', strtotime($requestedDate)));
    $weekEndExclusive = date('Y-m-d', strtotime('+1 day', strtotime($weekEnd)));
    
    // Récupérer les interventions de la semaine pour cette équipe
    $stmt = db()->prepare("
        SELECT * FROM interventions 
        WHERE team_id = ? AND date >= ? AND date < ?
        ORDER BY date ASC
    ");
    $stmt->execute([$teamId, $weekStart, $weekEndExclusive]);
    $interventions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Créer un nouveau fichier Excel
    $spreadsheet = new Spreadsheet();
    
    // === FEUILLE 1: POINT GENERAL ===
    $sheetPoint = $spreadsheet->getActiveSheet();
    $sheetPoint->setTitle('POINT GENERAL');
    $sheetPoint->setCellValue('A1', 'DATE DE RECEPTION :');
    $sheetPoint->setCellValue('B1', date('d/m/y', strtotime($weekStart)));
    $sheetPoint->setCellValue('A3', 'DATE DE RETOUR :');
    $sheetPoint->setCellValue('B3', date('d/m/y', strtotime($weekEnd)));
    $sheetPoint->setCellValue('A5', 'EQUIPE :');
    $sheetPoint->setCellValue('B5', $teamName);
    $sheetPoint->setCellValue('A7', 'Nombre d\'interventions :');
    $sheetPoint->setCellValue('B7', count($interventions));
    
    // === FEUILLE 2: MATERIELS RECEPTIONNES ===
    $sheetMateriels = $spreadsheet->createSheet();
    $sheetMateriels->setTitle('MATERIELS RECEPTIONNES');
    $sheetMateriels->setCellValue('A1', 'DATE DE RECEPTION :');
    $sheetMateriels->setCellValue('B1', date('d/m/y', strtotime($weekStart)));
    $sheetMateriels->setCellValue('A3', 'DATE');
    $sheetMateriels->setCellValue('B3', 'CLIENT');
    $sheetMateriels->setCellValue('C3', 'ONT');
    $sheetMateriels->setCellValue('D3', 'PTO');
    $sheetMateriels->setCellValue('E3', 'REPETEUR');
    $sheetMateriels->setCellValue('F3', 'TECHNICIEN');
    
    $row = 4;
    $totalOnt = 0;
    $totalPto = 0;
    $totalRepeteur = 0;
    
    foreach ($interventions as $int) {
        $ontQte = (int)($int['ont_qte'] ?? 0);
        $ptoQte = (int)($int['pto_qte'] ?? 0);
        $repeteurQte = (int)($int['repeteur_wifi_qte'] ?? 0);
        
        if ($ontQte > 0 || $ptoQte > 0 || $repeteurQte > 0) {
            $sheetMateriels->setCellValue('A' . $row, date('d/m/Y', strtotime($int['date'])));
            $sheetMateriels->setCellValue('B' . $row, $int['nom_client'] ?? '');
            $sheetMateriels->setCellValue('C' . $row, $ontQte);
            $sheetMateriels->setCellValue('D' . $row, $ptoQte);
            $sheetMateriels->setCellValue('E' . $row, $repeteurQte);
            $sheetMateriels->setCellValue('F' . $row, $int['nom_technicien'] ?? '');
            
            $totalOnt += $ontQte;
            $totalPto += $ptoQte;
            $totalRepeteur += $repeteurQte;
            $row++;
        }
    }
    
    // Totaux
    $sheetMateriels->setCellValue('A' . $row, 'TOTAL');
    $sheetMateriels->setCellValue('C' . $row, $totalOnt);
    $sheetMateriels->setCellValue('D' . $row, $totalPto);
    $sheetMateriels->setCellValue('E' . $row, $totalRepeteur);
    
    // === FEUILLE 3: POTEAUX IMPLANTES ===
    $sheetPoteauxImp = $spreadsheet->createSheet();
    $sheetPoteauxImp->setTitle('POTEAUX IMPLANTES');
    $sheetPoteauxImp->setCellValue('A1', 'Date');
    $sheetPoteauxImp->setCellValue('B1', 'Nom du client');
    $sheetPoteauxImp->setCellValue('C1', 'N° de ligne');
    $sheetPoteauxImp->setCellValue('D1', 'ZONE');
    $sheetPoteauxImp->setCellValue('E1', 'EQUIPE');
    $sheetPoteauxImp->setCellValue('F1', 'Nbr poteaux imp');
    $sheetPoteauxImp->setCellValue('G1', 'GPS Poteau 1');
    $sheetPoteauxImp->setCellValue('H1', 'GPS Poteau 2');
    
    $row = 2;
    foreach ($interventions as $int) {
        $matchingGps = [];
        $allPolesWithCoords = [];
        foreach (json_decode($int['points_gps'] ?? '[]', true) ?: [] as $point) {
            if (($point['type'] ?? '') !== 'Poteau') continue;
            $hasCoords = (!empty($point['lat']) || !empty($point['lng']));
            if ($hasCoords) $allPolesWithCoords[] = $point;
            $isImplante = !empty($point['implante']) 
                || in_array(strtolower(trim($point['sous_type'] ?? '')), ['implanté', 'implante'], true);
            if ($isImplante) {
                $matchingGps[] = $point;
            }
        }
        $nbPoteaux = max((int)($int['nb_poteaux_implantes'] ?? 0), count($matchingGps));
        if ($nbPoteaux > 0) {
            $sheetPoteauxImp->setCellValue('A' . $row, date('d/m/Y', strtotime($int['date'])));
            $sheetPoteauxImp->setCellValue('B' . $row, trim($int['nom_client'] ?? ''));
            $sheetPoteauxImp->setCellValue('C' . $row, $int['telephone_ligne'] ?? '');
            $sheetPoteauxImp->setCellValue('D' . $row, trim($int['adresse_zone'] ?? ''));
            $sheetPoteauxImp->setCellValue('E' . $row, 'BTP');
            $sheetPoteauxImp->setCellValue('F' . $row, $nbPoteaux);

            $gpsPointsToUse = !empty($matchingGps) ? $matchingGps : $allPolesWithCoords;
            $gpsIndex = 7;
            foreach ($gpsPointsToUse as $point) {
                $lat = $point['lat'] ?? null;
                $lng = $point['lng'] ?? null;
                if ($lat !== null && $lng !== null && $lat !== '' && $lng !== '') {
                    $gpsColumn = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($gpsIndex++);
                    $sheetPoteauxImp->setCellValue($gpsColumn . $row, $lat . ',' . $lng);
                }
            }
            $row++;
        }
    }
    
    // === FEUILLE 4: POTEAUX ARMES ===
    $sheetPoteauxArm = $spreadsheet->createSheet();
    $sheetPoteauxArm->setTitle('POTEAUX ARMES');
    $sheetPoteauxArm->setCellValue('A1', 'Date');
    $sheetPoteauxArm->setCellValue('B1', 'Nom du client');
    $sheetPoteauxArm->setCellValue('C1', 'N° de ligne');
    $sheetPoteauxArm->setCellValue('D1', 'ZONE');
    $sheetPoteauxArm->setCellValue('E1', 'EQUIPE');
    $sheetPoteauxArm->setCellValue('F1', 'Nbr poteaux armés');
    $sheetPoteauxArm->setCellValue('G1', 'GPS Poteau 1');
    $sheetPoteauxArm->setCellValue('H1', 'GPS Poteau 2');
    
    $row = 2;
    foreach ($interventions as $int) {
        $matchingGps = [];
        $allPolesWithCoords = [];
        foreach (json_decode($int['points_gps'] ?? '[]', true) ?: [] as $point) {
            if (($point['type'] ?? '') !== 'Poteau') continue;
            $hasCoords = (!empty($point['lat']) || !empty($point['lng']));
            if ($hasCoords) $allPolesWithCoords[] = $point;
            $isArme = !empty($point['arme']) 
                || in_array(strtolower(trim($point['sous_type'] ?? '')), ['armé', 'arme'], true);
            if ($isArme) {
                $matchingGps[] = $point;
            }
        }
        $nbPoteaux = max((int)($int['nb_poteaux_armes'] ?? 0), count($matchingGps));
        if ($nbPoteaux > 0) {
            $sheetPoteauxArm->setCellValue('A' . $row, date('d/m/Y', strtotime($int['date'])));
            $sheetPoteauxArm->setCellValue('B' . $row, trim($int['nom_client'] ?? ''));
            $sheetPoteauxArm->setCellValue('C' . $row, $int['telephone_ligne'] ?? '');
            $sheetPoteauxArm->setCellValue('D' . $row, trim($int['adresse_zone'] ?? ''));
            $sheetPoteauxArm->setCellValue('E' . $row, 'BTP');
            $sheetPoteauxArm->setCellValue('F' . $row, $nbPoteaux);

            $gpsPointsToUse = !empty($matchingGps) ? $matchingGps : $allPolesWithCoords;
            $gpsIndex = 7;
            foreach ($gpsPointsToUse as $point) {
                $lat = $point['lat'] ?? null;
                $lng = $point['lng'] ?? null;
                if ($lat !== null && $lng !== null && $lat !== '' && $lng !== '') {
                    $gpsColumn = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($gpsIndex++);
                    $sheetPoteauxArm->setCellValue($gpsColumn . $row, $lat . ',' . $lng);
                }
            }
            $row++;
        }
    }
    
    // === FEUILLE 5: MATERIELS DEFECTUEUX ===
    $sheetDefectueux = $spreadsheet->createSheet();
    $sheetDefectueux->setTitle('MATERIELS DEFECTUEUX');
    $sheetDefectueux->setCellValue('A1', 'DATE');
    $sheetDefectueux->setCellValue('B1', 'CLIENTS');
    $sheetDefectueux->setCellValue('C1', 'LIGNE');
    $sheetDefectueux->setCellValue('D1', 'TYPE DE MATERIELS DEFECTUEUX');
    $sheetDefectueux->setCellValue('E1', 'QUANTITE');
    
    // Nom du fichier avec la date de la semaine
    $filename = 'GS_BTP_' . date('d-m-Y', strtotime($weekStart)) . '.xlsx';
    
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    
    $writer = new Xlsx($spreadsheet);
    $writer->save('php://output');
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
}
