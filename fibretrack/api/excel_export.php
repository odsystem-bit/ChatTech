<?php
// Export Excel "point de matériel" automatique depuis la base de données.
// Reproduit le format du fichier d'inventaire (feuille POINT GENERAL) :
// une ligne par client avec le matériel utilisé, + stock initial/reçu/restant.
// Accès réservé admin (vérifié côté app Android avant d'afficher le bouton;
// protégé ici par un code d'accès simple transmis en paramètre).

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

// Même correspondance que dans index.php (STOCK_EXCEL_MAP)
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

header('Access-Control-Allow-Origin: *');

$action = $_GET['action'] ?? '';
$code = $_GET['code'] ?? '';

// Protection : code admin (9999) ou code technicien enregistré valide
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

try {
  $pdo = db();

  // Stock actuel (= stock restant) pour la ligne récap
  $stockRows = $pdo->query('SELECT designation, quantite FROM stock')->fetchAll();
  $stockActuel = [];
  foreach ($stockRows as $r) { $stockActuel[$r['designation']] = (int)$r['quantite']; }

  // Total reçu / sorti par désignation (pour reconstituer le point complet)
  $movRows = $pdo->query("SELECT designation,
      SUM(CASE WHEN type='entree' THEN quantite ELSE 0 END) as entree,
      SUM(CASE WHEN type='sortie' THEN quantite ELSE 0 END) as sortie
    FROM stock_movements GROUP BY designation")->fetchAll();
  $totEntree = []; $totSortie = [];
  foreach ($movRows as $r) {
    $totEntree[$r['designation']] = (int)$r['entree'];
    $totSortie[$r['designation']] = (int)$r['sortie'];
  }

  // Toutes les interventions (triées par date)
  $stmt = $pdo->query("SELECT id, nom_client, telephone_ligne, adresse_zone, nom_equipe,
      nom_technicien, date, statut, materiel_pose, motif_non_traite
    FROM interventions ORDER BY date");
  $interventions = $stmt->fetchAll();

  $spreadsheet = new Spreadsheet();
  $sheet = $spreadsheet->getActiveSheet();
  $sheet->setTitle('POINT GENERAL');

  $sheet->setCellValue('A1', 'POINT DE MATERIEL - GENERE AUTOMATIQUEMENT');
  $sheet->setCellValue('A2', 'Date export : ' . date('d/m/Y H:i'));

  $headerRow = 4;
  $sheet->setCellValue('A' . $headerRow, 'N°');
  $sheet->setCellValue('B' . $headerRow, 'CLIENT');
  $sheet->setCellValue('C' . $headerRow, 'LIGNE');
  $sheet->setCellValue('D' . $headerRow, 'DATE');
  $sheet->setCellValue('E' . $headerRow, 'ZONE');
  $sheet->setCellValue('F' . $headerRow, 'EQUIPE/TECH');
  $sheet->setCellValue('G' . $headerRow, 'STATUT');
  foreach (HEADERS as $col => $label) {
    $sheet->setCellValue($col . $headerRow, $label);
  }
  $lastMatCol = 'X';
  $lastCol = 'X';

  // Style en-tête
  $headerRange = 'A' . $headerRow . ':' . $lastCol . $headerRow;
  $sheet->getStyle($headerRange)->getFont()->setBold(true);
  $sheet->getStyle($headerRange)->getFill()
    ->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('D9E1F2');
  $sheet->getStyle($headerRange)->getBorders()->getAllBorders()
    ->setBorderStyle(Border::BORDER_THIN);

  $row = $headerRow + 1;
  $num = 1;
  $colSums = [];
  foreach (COL_MAP as $col) { $colSums[$col] = 0; }

  foreach ($interventions as $iv) {
    $mp = json_decode($iv['materiel_pose'] ?? '{}', true) ?? [];

    $statutNorm = strtolower(trim((string)($iv['statut'] ?? '')));
    $hasMotif = !empty(trim((string)($iv['motif_non_traite'] ?? '')));
    $isNonTraite = in_array($statutNorm, ['non_traite', 'non_traitee', 'annule', 'annulee', 'inacheve', 'inachevee'], true) || ($hasMotif && $statutNorm !== 'termine');
    $isTermine = !$isNonTraite && ($statutNorm === 'termine');

    if (empty($mp) && !$isTermine) continue;

    $statutLabel = $isTermine ? 'Terminé' : ($isNonTraite ? 'Non traité' : ($statutNorm === 'en_attente' ? 'En attente' : 'En cours'));

    $sheet->setCellValue('A' . $row, $num);
    $sheet->setCellValue('B' . $row, trim($iv['nom_client'] ?? ''));
    $sheet->setCellValue('C' . $row, $iv['telephone_ligne'] ?? '');
    $sheet->setCellValue('D' . $row, $iv['date'] ? date('d/m/y', strtotime($iv['date'])) : '');
    $sheet->setCellValue('E' . $row, trim($iv['adresse_zone'] ?? ''));
    $sheet->setCellValue('F' . $row, $iv['nom_technicien'] ?: ($iv['nom_equipe'] ?? ''));
    $sheet->setCellValue('G' . $row, $statutLabel);

    // Ne comptabiliser et n'afficher le matériel que si l'intervention est réellement terminée
    if ($isTermine && !empty($mp)) {
      foreach ($mp as $key => $qty) {
        $qty = (int)$qty;
        if ($qty <= 0) continue;
        $col = COL_MAP[$key] ?? null;
        if ($col === null) continue;
        $existing = (int)($sheet->getCell($col . $row)->getValue() ?: 0);
        $sheet->setCellValue($col . $row, $existing + $qty);
        $colSums[$col] += $qty;
      }
    }

    $sheet->getStyle('A' . $row . ':' . $lastCol . $row)->getBorders()->getAllBorders()
      ->setBorderStyle(Border::BORDER_THIN);
    $row++;
    $num++;
  }

  $totalRow = $row + 1;
  $sheet->setCellValue('B' . $totalRow, 'TOTAL UTILISÉ');
  $sheet->getStyle('B' . $totalRow)->getFont()->setBold(true);
  foreach (COL_MAP as $key => $col) {
    $sheet->setCellValue($col . $totalRow, $colSums[$col]);
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

  // Largeur des colonnes
  $sheet->getColumnDimension('A')->setWidth(5);
  $sheet->getColumnDimension('B')->setWidth(28);
  $sheet->getColumnDimension('C')->setWidth(14);
  $sheet->getColumnDimension('D')->setWidth(10);
  $sheet->getColumnDimension('E')->setWidth(16);
  $sheet->getColumnDimension('F')->setWidth(16);
  $sheet->getColumnDimension('G')->setWidth(10);
  foreach (array_keys(HEADERS) as $col) { $sheet->getColumnDimension($col)->setWidth(8); }

  // ===== Feuille MOUVEMENTS DETAILLES =====
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
