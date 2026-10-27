<?php
// Export Excel hebdomadaire multi-feuilles (GS BTP)
// Conforme au canevas officiel GS BTP 121026.xlsx / GS BTP 090926.xlsx
// Endpoint: ?action=export_hebdo&code=ADMIN_CODE&week_start=YYYY-MM-DD

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/_env.php';

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'u795734321_fibre');
define('DB_USER', getenv('DB_USER') ?: 'u795734321_fibretrack');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_CHARSET', getenv('DB_CHARSET') ?: 'utf8mb4');

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

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;

$materialColumns = [
    'ont'          => 'E',
    'pto'          => 'F',
    'jarretiere'   => 'G',
    'piton'        => 'H',
    'cheville'     => 'I',
    'connecteur'   => 'J',
    'closer'       => 'K',
    'fibre_1fo'    => 'L',
    'cpc_50'       => 'M',
    'cpc_100'      => 'N',
    'cpc_150'      => 'O',
    'cpc_200'      => 'P',
    'cpc_250'      => 'Q',
    'cpc_300'      => 'R',
    'cpc_350'      => 'S',
    'crochets'     => 'T',
    'pince'        => 'U',
    'susp'         => 'V',
    'traverse_13t' => 'W',
    'traverse_15t' => 'X',
];

header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Access-Control-Allow-Origin: *');

$params = $_GET;
if (empty($params)) {
    $url = $_SERVER['REQUEST_URI'] ?? '';
    if (strpos($url, '?') !== false) {
        parse_str(parse_url($url, PHP_URL_QUERY), $params);
    }
}

$action = $params['action'] ?? '';
$code = $params['code'] ?? '';

function requireExcelAdmin($code) {
    if ($code === '9999') return;
    if (preg_match('/^\d{4}$/', (string)$code)) {
        $stmtAcc = db()->prepare('SELECT id, nom FROM accounts WHERE code = ?');
        $stmtAcc->execute([$code]);
        if ($stmtAcc->fetch()) return;
    }
    http_response_code(401);
    exit;
}

if (!in_array($action, ['export_hebdo', 'export_mois', 'export_periode', 'export_historique'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Action invalide']);
    exit;
}

requireExcelAdmin($code);

function trouverTemplate(): ?string {
    $candidates = [
        __DIR__ . '/GS BTP 121026.xlsx',
        __DIR__ . '/GS BTP 090926.xlsx',
        dirname(__DIR__) . '/GS BTP 121026.xlsx',
        dirname(__DIR__) . '/GS BTP 090926.xlsx',
    ];
    foreach ($candidates as $candidate) {
        if (file_exists($candidate) && filesize($candidate) > 1000) {
            return $candidate;
        }
    }
    return null;
}

/**
 * Détermine la clé de colonne CPC (cpc_50, cpc_100, ..., cpc_350)
 * à partir des données de l'intervention ou du matériel posé.
 */
function determineCpcKey(array $intervention, array $materials): ?string {
    // 1. Clé explicite déjà dans $materials
    foreach (['cpc_50', 'cpc_100', 'cpc_150', 'cpc_200', 'cpc_250', 'cpc_300', 'cpc_350'] as $k) {
        if (!empty($materials[$k]) && (int)$materials[$k] > 0) {
            return $k;
        }
    }
    foreach (['cpc50', 'cpc100', 'cpc150', 'cpc200', 'cpc250', 'cpc300', 'cpc350'] as $k) {
        if (!empty($materials[$k]) && (int)$materials[$k] > 0) {
            return str_replace('cpc', 'cpc_', $k);
        }
    }

    // 2. Longueur de linéaire en mètres depuis interventions
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

    // 3. Détection dans la chaîne type_cable (ex: "Cpc 50", "CPC 150", "cpc 100")
    if ($linear <= 0 && !empty($intervention['type_cable'])) {
        if (preg_match('/(\d+)/', (string)$intervention['type_cable'], $m)) {
            $linear = (float)$m[1];
        }
    }

    // 4. Détection dans $materials si linéaire numérique présent
    if ($linear <= 0 && !empty($materials['lineaire']) && is_numeric($materials['lineaire'])) {
        $linear = (float)$materials['lineaire'];
    }
    if ($linear <= 0 && !empty($materials['lineaire_m']) && is_numeric($materials['lineaire_m'])) {
        $linear = (float)$materials['lineaire_m'];
    }

    if ($linear <= 0) {
        return null;
    }

    // Attribution au touret correspondant (50, 100, 150, 200, 250, 300, 350)
    if ($linear <= 50) return 'cpc_50';
    if ($linear <= 100) return 'cpc_100';
    if ($linear <= 150) return 'cpc_150';
    if ($linear <= 200) return 'cpc_200';
    if ($linear <= 250) return 'cpc_250';
    if ($linear <= 300) return 'cpc_300';
    return 'cpc_350';
}

/**
 * Construit le classeur GS BTP pour la plage [$debut, $finExclusive[.
 * $debut / $finExclusive : 'YYYY-MM-DD'.
 */
function construireClasseur(string $debut, string $finExclusive): Spreadsheet {
    global $materialColumns;

    $templateFile = trouverTemplate();
    if ($templateFile === null) {
        throw new Exception('Modèle Excel introuvable (GS BTP 121026.xlsx ou GS BTP 090926.xlsx)');
    }
    $spreadsheet = IOFactory::load($templateFile);

    $weekStart = $debut;
    $weekEnd = date('Y-m-d', strtotime('-1 day', strtotime($finExclusive)));
    $weekEndExclusive = $finExclusive;
    
    // Récupérer les interventions terminées de la semaine
    // Les interventions non traitées / annulées ne doivent pas consommer de matériel
    $stmt = db()->prepare("
        SELECT id, date, statut, nom_technicien, nom_equipe, nom_client,
          adresse_zone, telephone_ligne, materiel_pose, points_gps,
          nb_poteaux_implantes, nb_poteaux_traverses, nb_poteaux_armes,
          lineaire_m, arrivee_m, depart_m, type_cable
        FROM interventions
        WHERE date >= ? AND date < ? 
          AND statut = 'termine'
          AND (motif_non_traite IS NULL OR motif_non_traite = '')
        ORDER BY date ASC
    ");
    $stmt->execute([$weekStart, $weekEndExclusive]);
    $interventions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $sheetPoint = $spreadsheet->getSheetByName('POINT GENERAL');

    // Mouvements explicites de stock pour la semaine (Initial et Réception)
    $initStmt = db()->prepare("SELECT designation, SUM(quantite) as qte FROM stock_movements 
        WHERE date_mouvement >= ? AND date_mouvement < ? 
          AND (motif LIKE '%Stock Initial%' OR motif LIKE '%initial%')
        GROUP BY designation");
    $initStmt->execute([$weekStart, $weekEndExclusive]);
    $explicitInit = $initStmt->fetchAll(PDO::FETCH_KEY_PAIR);

    $recuStmt = db()->prepare("SELECT designation, SUM(quantite) as qte FROM stock_movements 
        WHERE date_mouvement >= ? AND date_mouvement < ? 
          AND (motif LIKE '%Réception%' OR motif LIKE '%reception%' OR motif LIKE '%livraison%')
        GROUP BY designation");
    $recuStmt->execute([$weekStart, $weekEndExclusive]);
    $explicitRecu = $recuStmt->fetchAll(PDO::FETCH_KEY_PAIR);

    // Fallback réceptions générales si pas de motif explicite
    if (empty($explicitRecu)) {
        $entreeStmt = db()->prepare("SELECT designation, SUM(quantite) as qte FROM stock_movements 
            WHERE date_mouvement >= ? AND date_mouvement < ? 
              AND type = 'entree' 
              AND motif NOT LIKE '%Stock Initial%' AND motif NOT LIKE '%initial%'
            GROUP BY designation");
        $entreeStmt->execute([$weekStart, $weekEndExclusive]);
        $explicitRecu = $entreeStmt->fetchAll(PDO::FETCH_KEY_PAIR);
    }

    $hasExplicitInit = !empty($explicitInit);
    $hasExplicitRecu = !empty($explicitRecu);

    $stockInitial = [];
    $stockReceived = [];
    foreach ($materialColumns as $key => $column) {
        // Stock initial
        if ($hasExplicitInit) {
            $stockInitial[$key] = (int)($explicitInit[$key] ?? 0);
        } elseif ($sheetPoint) {
            $existingInit = $sheetPoint->getCell($column . '7')->getValue();
            $stockInitial[$key] = (is_numeric($existingInit) && (int)$existingInit > 0) ? (int)$existingInit : 0;
        } else {
            $stockInitial[$key] = 0;
        }

        // Stock reçu
        if ($hasExplicitRecu) {
            $stockReceived[$key] = (int)($explicitRecu[$key] ?? 0);
        } elseif ($sheetPoint) {
            $existingRecu = $sheetPoint->getCell($column . '8')->getValue();
            $stockReceived[$key] = (is_numeric($existingRecu) && (int)$existingRecu > 0) ? (int)$existingRecu : 0;
        } else {
            $stockReceived[$key] = 0;
        }
    }

    // === FEUILLE 1: POINT GENERAL ===
    if ($sheetPoint) {
        // En-têtes conformes au canevas
        $sheetPoint->setCellValue('A1', 'DATE DE RECEPTION : ' . date('d/m/Y', strtotime($weekStart)));
        $sheetPoint->setCellValue('A3', 'DATE DE RETOUR : ' . date('d/m/Y', strtotime($weekEnd)));
        $sheetPoint->setCellValue('A5', 'EQUIPE : BTP');
        $sheetPoint->setCellValue('A7', 'STOCK INITIAL');
        $sheetPoint->setCellValue('A8', 'STOCK RECU');
        $sheetPoint->setCellValue('A9', 'STOCK RESTANT');

        // Ligne 7 : STOCK INITIAL
        // Ligne 8 : STOCK RECU
        foreach ($materialColumns as $key => $column) {
            $sheetPoint->setCellValue($column . '7', $stockInitial[$key] ?? 0);
            $sheetPoint->setCellValue($column . '8', $stockReceived[$key] ?? 0);
        }

        $maxTemplateClients = 41; // Le canevas standard comporte 41 lignes clients (11 à 51)
        $clientCount = count($interventions);
        $extraRows = max(0, $clientCount - $maxTemplateClients);
        if ($extraRows > 0) {
            $sheetPoint->insertNewRowBefore(52, $extraRows);
        }
        $lastClientRow = 10 + max($maxTemplateClients, $clientCount);
        $totalRow = $lastClientRow + 1;

        // Remplissage des lignes clients
        for ($idx = 0; $idx < max($maxTemplateClients, $clientCount); $idx++) {
            $r = 11 + $idx;

            if ($idx < $clientCount) {
                $intervention = $interventions[$idx];
                $materials = json_decode($intervention['materiel_pose'] ?? '{}', true) ?: [];

                // Règle 1 : Chevilles équivaut aux pitons (1 piton = 1 cheville)
                $piton = (int)($materials['piton'] ?? 0);
                $cheville = (int)($materials['cheville'] ?? 0);
                if ($cheville <= 0 && $piton > 0) {
                    $cheville = $piton;
                    $materials['cheville'] = $cheville;
                }

                // Règle 2 : Attribution précise du linéaire CPC dans la bonne colonne (CPC 50, 100, ..., 350)
                $cpcKey = determineCpcKey($intervention, $materials);
                // Vider les clés CPC brutes du JSON pour ne pas dupliquer
                foreach (['cpc_50', 'cpc_100', 'cpc_150', 'cpc_200', 'cpc_250', 'cpc_300', 'cpc_350'] as $ck) {
                    unset($materials[$ck]);
                }
                if ($cpcKey !== null) {
                    $materials[$cpcKey] = 1; // 1 linéaire utilisé pour ce client
                }

                $sheetPoint->setCellValue('A' . $r, $idx + 1);
                $sheetPoint->setCellValue('B' . $r, trim($intervention['nom_client'] ?? ''));
                $sheetPoint->setCellValue('C' . $r, trim($intervention['telephone_ligne'] ?? ''));
                $sheetPoint->setCellValue('D' . $r, date('d/m/Y', strtotime($intervention['date'])));

                // Règle 3 : Remplissage des matériels
                // Si non utilisé, laisser la case STRICTEMENT VIDE (null) et JAMAIS '0' ou '000' !
                foreach ($materialColumns as $key => $column) {
                    $quantity = (int)($materials[$key] ?? 0);
                    if ($quantity > 0) {
                        $sheetPoint->setCellValue($column . $r, $quantity);
                    } else {
                        $sheetPoint->setCellValue($column . $r, null);
                    }
                }
            } else {
                // Ligne vierge du canevas : vider toutes les cases
                $sheetPoint->setCellValue('A' . $r, null);
                $sheetPoint->setCellValue('B' . $r, null);
                $sheetPoint->setCellValue('C' . $r, null);
                $sheetPoint->setCellValue('D' . $r, null);
                foreach ($materialColumns as $key => $column) {
                    $sheetPoint->setCellValue($column . $r, null);
                }
            }
        }

        // Règle 4 : PRÉSERVER STRICTEMENT LES FORMULES DU CANEVAS SANS LES CASSER
        // Ligne QUANTITÉ UTILISÉE : =SUM(E11:E51)
        $sheetPoint->setCellValue('A' . $totalRow, 'QUANTITE UTILISEE');
        foreach ($materialColumns as $key => $column) {
            $sheetPoint->setCellValue($column . $totalRow, "=SUM({$column}11:{$column}{$lastClientRow})");
        }

        // Ligne 9 STOCK RESTANT : =E7+E8-E52 (recalcul automatique si modification)
        $sheetPoint->setCellValue('A9', 'STOCK RESTANT');
        foreach ($materialColumns as $key => $column) {
            $sheetPoint->setCellValue($column . '9', "={$column}7+{$column}8-{$column}{$totalRow}");
        }

        // Nettoyage de toute ligne parasite en-dessous de QUANTITE UTILISEE
        $cleanRow = $totalRow + 1;
        $sheetPoint->setCellValue('A' . $cleanRow, null);
        foreach ($materialColumns as $key => $column) {
            $sheetPoint->setCellValue($column . $cleanRow, null);
        }
    }
    
    // === FEUILLE 2: MATERIELS RECEPTIONNES ===
    // Respecte scrupuleusement la grille pré-formatée du canevas
    $sheetMateriels = $spreadsheet->getSheetByName('MATERIELS RECEPTIONNES');
    if ($sheetMateriels) {
        $sheetMateriels->setCellValue('A1', 'DATE DE RECEPTION : ' . date('d/m/Y', strtotime($weekStart)));
        
        $sheet2RowMap = [
            'ont'          => 4,
            'pto'          => 5,
            'jarretiere'   => 6,
            'piton'        => 7,
            'cheville'     => 8,
            'connecteur'   => 9,
            'closer'       => 10,
            'fibre_1fo'    => 11,
            'cpc_50'       => 12,
            'cpc_100'      => 13,
            'cpc_150'      => 14,
            'cpc_200'      => 15,
            'cpc_250'      => 16,
            'cpc_300'      => 17,
            'cpc_350'      => 18,
            'crochets'     => 19,
            'pince'        => 20,
            'susp'         => 21,
            'traverse_13t' => 22,
            'traverse_15t' => 23,
        ];

        foreach ($sheet2RowMap as $key => $rIdx) {
            $recu = (int)($stockReceived[$key] ?? 0);
            $sheetMateriels->setCellValue('B' . $rIdx, $recu > 0 ? $recu : 0);
            $sheetMateriels->setCellValue('E' . $rIdx, 0);
        }
    }
    
    // === FEUILLE 3: POTEAUX IMPLANTES ===
    $sheetPoteauxImp = $spreadsheet->getSheetByName('POTEAUX IMPLANTES');
    if ($sheetPoteauxImp) {
        $row = 2; // Après l'en-tête ligne 1
        
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
                $gpsIndex = 7; // Colonne G
                foreach ($gpsPointsToUse as $point) {
                    $lat = $point['lat'] ?? null;
                    $lng = $point['lng'] ?? null;
                    if ($lat !== null && $lng !== null && $lat !== '' && $lng !== '') {
                        $gpsColumn = Coordinate::stringFromColumnIndex($gpsIndex++);
                        $sheetPoteauxImp->setCellValue($gpsColumn . $row, $lat . ',' . $lng);
                    }
                }
                $row++;
            }
        }

        // Nettoyer les lignes restantes éventuelles du template
        for ($cl = $row; $cl <= max(50, $row + 10); $cl++) {
            $existingVal = $sheetPoteauxImp->getCell('A' . $cl)->getValue();
            if ($existingVal !== null && $existingVal !== '') {
                for ($colIdx = 1; $colIdx <= 15; $colIdx++) {
                    $sheetPoteauxImp->setCellValue(Coordinate::stringFromColumnIndex($colIdx) . $cl, null);
                }
            }
        }
    }
    
    // === FEUILLE 4: POTEAUX ARMES ===
    $sheetPoteauxArm = $spreadsheet->getSheetByName('POTEAUX ARMES');
    if ($sheetPoteauxArm) {
        $row = 2; // Après l'en-tête ligne 1
        
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
                $gpsIndex = 7; // Colonne G
                foreach ($gpsPointsToUse as $point) {
                    $lat = $point['lat'] ?? null;
                    $lng = $point['lng'] ?? null;
                    if ($lat !== null && $lng !== null && $lat !== '' && $lng !== '') {
                        $gpsColumn = Coordinate::stringFromColumnIndex($gpsIndex++);
                        $sheetPoteauxArm->setCellValue($gpsColumn . $row, $lat . ',' . $lng);
                    }
                }
                $row++;
            }
        }

        // Nettoyer les lignes restantes éventuelles du template
        for ($cl = $row; $cl <= max(50, $row + 10); $cl++) {
            $existingVal = $sheetPoteauxArm->getCell('A' . $cl)->getValue();
            if ($existingVal !== null && $existingVal !== '') {
                for ($colIdx = 1; $colIdx <= 20; $colIdx++) {
                    $sheetPoteauxArm->setCellValue(Coordinate::stringFromColumnIndex($colIdx) . $cl, null);
                }
            }
        }
    }
    
    // === FEUILLE 5: MATERIELS DEFECTUEUX ===
    $sheetDefectueux = $spreadsheet->getSheetByName('MATERIELS DEFECTUEUX');
    if ($sheetDefectueux) {
        // Préserver l'en-tête de la feuille
    }
    
    return $spreadsheet;
}

try {
    if (trouverTemplate() === null && $action === 'export_hebdo') {
        require __DIR__ . '/excel_hebdo_simple.php';
        exit;
    }

    if ($action === 'export_hebdo') {
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

    // export_historique : un classeur par mois dans un ZIP
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
