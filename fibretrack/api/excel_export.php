<?php
// Export Excel "point de matériel" automatique depuis la base de données.
// Reproduit le format du fichier d'inventaire (feuille POINT GENERAL) :
// une ligne par client avec le matériel utilisé, + stock initial/reçu/restant.
// Accès réservé admin (protégé par code 9999 ou compte valide).

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/_env.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'u795734321_fibre');
define('DB_USER', getenv('DB_USER') ?: 'u795734321_fibretrack');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_CHARSET', getenv('DB_CHARSET') ?: 'utf8mb4');

define('COL_MAP', [
  'ont'            => 'E',  'pto'            => 'F',  'jarretiere'     => 'G',
  'piton'          => 'H',  'cheville'       => 'I',  'connecteur'     => 'J',
  'closer'         => 'K',  'fibre_1fo'      => 'L',  'cpc_50'         => 'M',
  'cpc_100'        => 'N',  'cpc_150'        => 'O',  'cpc_200'        => 'P',
  'cpc_250'        => 'Q',  'cpc_300'        => 'R',  'cpc_350'        => 'S',
  'crochets'       => 'T',  'pince'          => 'U',  'susp'           => 'V',
  'traverse_13t'   => 'W',  'traverse_15t'   => 'X',
]);

define('HEADERS', [
  'E'=>'ONT','F'=>'PTO','G'=>'JAR','H'=>'PIT','I'=>'CHE','J'=>'CON','K'=>'CLO',
  'L'=>'1FO','M'=>'CPC 50','N'=>'CPC 100','O'=>'CPC 150','P'=>'CPC 200',
  'Q'=>'CPC 250','R'=>'CPC 300','S'=>'CPC 350','T'=>'CRO','U'=>'PINCE',
  'V'=>'SUS','W'=>'CT 13','X'=>'CT 15',
]);

if (!function_exists('db')) {
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
}

header('Access-Control-Allow-Origin: *');

$action = $_GET['action'] ?? '';
$code = $_GET['code'] ?? '';

$isAllowed = ($code === '9999');
if (!$isAllowed && preg_match('/^\d{4}$/', (string)$code)) {
  $stmtAcc = db()->prepare('SELECT id, nom FROM accounts WHERE code = ?');
  $stmtAcc->execute([$code]);
  if ($stmtAcc->fetch()) {
    $isAllowed = true;
  }
}
if (!$isAllowed) {
  http_response_code(403);
  header('Content-Type: application/json');
  echo json_encode(['error' => 'Accès refusé - code valide requis']);
  exit;
}

if ($action !== 'export_point_materiel') {
  http_response_code(400);
  header('Content-Type: application/json');
  echo json_encode(['error' => 'Action inconnue']);
  exit;
}

function determineCpcKeyExport(array $intervention, array $materials): ?string {
    foreach (['cpc_50', 'cpc_100', 'cpc_150', 'cpc_200', 'cpc_250', 'cpc_300', 'cpc_350'] as $k) {
        if (!empty($materials[$k]) && (int)$materials[$k] > 0) return $k;
    }
    foreach (['cpc50', 'cpc100', 'cpc150', 'cpc200', 'cpc250', 'cpc300', 'cpc350'] as $k) {
        if (!empty($materials[$k]) && (int)$materials[$k] > 0) return str_replace('cpc', 'cpc_', $k);
    }
    $linear = 0;
    if (isset($intervention['lineaire_m']) && is_numeric($intervention['lineaire_m']) && (float)$intervention['lineaire_m'] > 0) {
        $linear = (float)$intervention['lineaire_m'];
    }
    if ($linear <= 0 && isset($intervention['arrivee_m'], $intervention['depart_m']) 
        && is_numeric($intervention['arrivee_m']) && is_numeric($intervention['depart_m'])) {
        $linear = abs((float)$intervention['arrivee_m'] - (float)$intervention['depart_m']);
    }
    if ($linear <= 0 && !empty($intervention['arrivee_m']) && is_numeric($intervention['arrivee_m']) && (float)$intervention['arrivee_m'] > 0) {
        $linear = (float)$intervention['arrivee_m'];
    }
    if ($linear <= 0 && !empty($intervention['depart_m']) && is_numeric($intervention['depart_m']) && (float)$intervention['depart_m'] > 0) {
        $linear = (float)$intervention['depart_m'];
    }
    if ($linear <= 0 && !empty($intervention['type_cable'])) {
        if (preg_match('/(\d+)/', (string)$intervention['type_cable'], $m)) {
            $linear = (float)$m[1];
        }
    }
    if ($linear <= 0 && !empty($materials['lineaire']) && is_numeric($materials['lineaire'])) {
        $linear = (float)$materials['lineaire'];
    }
    if ($linear <= 0) return null;

    if ($linear <= 50) return 'cpc_50';
    if ($linear <= 100) return 'cpc_100';
    if ($linear <= 150) return 'cpc_150';
    if ($linear <= 200) return 'cpc_200';
    if ($linear <= 250) return 'cpc_250';
    if ($linear <= 300) return 'cpc_300';
    return 'cpc_350';
}

try {
  $pdo = db();

  // Stock actuel
  $stockRows = $pdo->query('SELECT designation, quantite FROM stock')->fetchAll();
  $stockActuel = [];
  foreach ($stockRows as $r) { $stockActuel[$r['designation']] = (int)$r['quantite']; }

  // Total reçu / sorti
  $movRows = $pdo->query("SELECT designation,
      SUM(CASE WHEN type IN ('entree', 'ajustement') THEN quantite ELSE 0 END) as entree,
      SUM(CASE WHEN type='sortie' THEN quantite ELSE 0 END) as sortie
    FROM stock_movements GROUP BY designation")->fetchAll();
  $totEntree = []; $totSortie = [];
  foreach ($movRows as $r) {
    $totEntree[$r['designation']] = (int)$r['entree'];
    $totSortie[$r['designation']] = (int)$r['sortie'];
  }

  // Interventions
  $stmt = $pdo->query("SELECT id, nom_client, telephone_ligne, adresse_zone, nom_equipe,
      nom_technicien, date, statut, materiel_pose, motif_non_traite,
      lineaire_m, arrivee_m, depart_m, type_cable
    FROM interventions 
    WHERE statut = 'termine' AND (motif_non_traite IS NULL OR motif_non_traite = '')
    ORDER BY date ASC");
  $interventions = $stmt->fetchAll();

  $spreadsheet = new Spreadsheet();
  $sheet = $spreadsheet->getActiveSheet();
  $sheet->setTitle('POINT GENERAL');

  $sheet->setCellValue('A1', 'POINT DE MATERIEL - GENERE AUTOMATIQUEMENT');
  $sheet->setCellValue('A2', 'Date export : ' . date('d/m/Y H:i'));

  $headerRow = 4;
  $sheet->setCellValue('A' . $headerRow, 'N°');
  $sheet->setCellValue('B' . $headerRow, 'CLIENTS');
  $sheet->setCellValue('C' . $headerRow, 'LIGNE');
  $sheet->setCellValue('D' . $headerRow, 'DATE');
  foreach (HEADERS as $col => $label) {
    $sheet->setCellValue($col . $headerRow, $label);
  }
  // Infos supplémentaires après les matériels
  $sheet->setCellValue('Y' . $headerRow, 'ZONE');
  $sheet->setCellValue('Z' . $headerRow, 'EQUIPE/TECH');
  $lastCol = 'Z';

  // Style en-tête
  $headerRange = 'A' . $headerRow . ':' . $lastCol . $headerRow;
  $sheet->getStyle($headerRange)->getFont()->setBold(true);
  $sheet->getStyle($headerRange)->getFill()
    ->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('D9E1F2');
  $sheet->getStyle($headerRange)->getBorders()->getAllBorders()
    ->setBorderStyle(Border::BORDER_THIN);

  $row = $headerRow + 1;
  $startRow = $row;
  $num = 1;

  foreach ($interventions as $iv) {
    $mp = json_decode($iv['materiel_pose'] ?? '{}', true) ?: [];

    // Cheville = Piton
    $piton = (int)($mp['piton'] ?? 0);
    $cheville = (int)($mp['cheville'] ?? 0);
    if ($cheville <= 0 && $piton > 0) {
      $cheville = $piton;
      $mp['cheville'] = $cheville;
    }

    // Attribution CPC
    $cpcKey = determineCpcKeyExport($iv, $mp);
    foreach (['cpc_50', 'cpc_100', 'cpc_150', 'cpc_200', 'cpc_250', 'cpc_300', 'cpc_350'] as $ck) {
      unset($mp[$ck]);
    }
    if ($cpcKey !== null) {
      $mp[$cpcKey] = 1;
    }

    $sheet->setCellValue('A' . $row, $num);
    $sheet->setCellValue('B' . $row, trim($iv['nom_client'] ?? ''));
    $sheet->setCellValue('C' . $row, trim($iv['telephone_ligne'] ?? ''));
    $sheet->setCellValue('D' . $row, $iv['date'] ? date('d/m/Y', strtotime($iv['date'])) : '');

    foreach (COL_MAP as $key => $col) {
      $qty = (int)($mp[$key] ?? 0);
      if ($qty > 0) {
        $sheet->setCellValue($col . $row, $qty);
      } else {
        $sheet->setCellValue($col . $row, null);
      }
    }

    $sheet->setCellValue('Y' . $row, trim($iv['adresse_zone'] ?? ''));
    $sheet->setCellValue('Z' . $row, $iv['nom_technicien'] ?: ($iv['nom_equipe'] ?? ''));

    $sheet->getStyle('A' . $row . ':' . $lastCol . $row)->getBorders()->getAllBorders()
      ->setBorderStyle(Border::BORDER_THIN);
    $row++;
    $num++;
  }

  $lastClientRow = max($startRow, $row - 1);
  $totalRow = $row;

  // Ligne QUANTITÉ UTILISÉE avec formules SUM
  $sheet->setCellValue('B' . $totalRow, 'TOTAL UTILISÉ');
  $sheet->getStyle('B' . $totalRow)->getFont()->setBold(true);
  foreach (COL_MAP as $key => $col) {
    $sheet->setCellValue($col . $totalRow, "=SUM({$col}{$startRow}:{$col}{$lastClientRow})");
    $sheet->getStyle($col . $totalRow)->getFont()->setBold(true);
  }

  $recuRow = $totalRow + 1;
  $sheet->setCellValue('B' . $recuRow, 'TOTAL REÇU');
  foreach (COL_MAP as $key => $col) {
    $sheet->setCellValue($col . $recuRow, $totEntree[$key] ?? 0);
  }

  $restantRow = $recuRow + 1;
  $sheet->setCellValue('B' . $restantRow, 'STOCK RESTANT (ACTUEL)');
  $sheet->getStyle('B' . $restantRow)->getFont()->setBold(true);
  $sheet->getStyle('B' . $restantRow . ':' . $lastCol . $restantRow)->getFill()
    ->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('FCE4D6');
  foreach (COL_MAP as $key => $col) {
    $val = $stockActuel[$key] ?? 0;
    $sheet->setCellValue($col . $restantRow, $val);
    $sheet->getStyle($col . $restantRow)->getFont()->setBold(true);
    if ($val <= 0) {
      $sheet->getStyle($col . $restantRow)->getFont()->getColor()->setRGB('CC0000');
    }
  }

  // Largeurs
  $sheet->getColumnDimension('A')->setWidth(6);
  $sheet->getColumnDimension('B')->setWidth(28);
  $sheet->getColumnDimension('C')->setWidth(14);
  $sheet->getColumnDimension('D')->setWidth(12);
  foreach (array_keys(HEADERS) as $col) { $sheet->getColumnDimension($col)->setWidth(9); }
  $sheet->getColumnDimension('Y')->setWidth(20);
  $sheet->getColumnDimension('Z')->setWidth(16);

  // Feuille 2 : MOUVEMENTS
  $sheet2 = $spreadsheet->createSheet();
  $sheet2->setTitle('MOUVEMENTS');
  $sheet2->setCellValue('A1', 'Date');
  $sheet2->setCellValue('B1', 'Type');
  $sheet2->setCellValue('C1', 'Désignation');
  $sheet2->setCellValue('D1', 'Quantité');
  $sheet2->setCellValue('E1', 'Client');
  $sheet2->setCellValue('F1', 'Technicien');
  $sheet2->setCellValue('G1', 'Motif');
  $sheet2->getStyle('A1:G1')->getFont()->setBold(true);
  $sheet2->getStyle('A1:G1')->getFill()
    ->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('D9E1F2');

  $allMov = $pdo->query('SELECT date_mouvement, type, designation, quantite, nom_client, nom_technicien, motif
    FROM stock_movements ORDER BY date_mouvement DESC')->fetchAll();
  $r2 = 2;
  foreach ($allMov as $mv) {
    $sheet2->setCellValue('A' . $r2, $mv['date_mouvement']);
    $sheet2->setCellValue('B' . $r2, $mv['type']);
    $sheet2->setCellValue('C' . $r2, $mv['designation']);
    $sheet2->setCellValue('D' . $r2, (int)$mv['quantite']);
    $sheet2->setCellValue('E' . $r2, $mv['nom_client'] ?? '');
    $sheet2->setCellValue('F' . $r2, $mv['nom_technicien'] ?? '');
    $sheet2->setCellValue('G' . $r2, $mv['motif'] ?? '');
    $r2++;
  }
  foreach (['A','B','C','D','E','F','G'] as $c) { $sheet2->getColumnDimension($c)->setAutoSize(true); }

  $spreadsheet->setActiveSheetIndex(0);

  $filename = 'Point_Materiel_' . date('Y-m-d_His') . '.xlsx';
  header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  header('Content-Disposition: attachment; filename="' . $filename . '"');
  header('Cache-Control: max-age=0');

  $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
  $writer->save('php://output');
} catch (Exception $e) {
  http_response_code(500);
  header('Content-Type: application/json');
  echo json_encode(['error' => $e->getMessage()]);
}
