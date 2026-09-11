<?php
// Génération PDF côté serveur - utilise tFPDF (UTF-8 natif)
// Endpoints: ?action=pdf_fiches&id=XXX, ?action=pdf_rapport&id=XXX
// Fond de page = images gabarits, overlay = données manuscrites (Caveat TTF)

require_once __DIR__ . '/vendor/tfpdf/tfpdf.php';
require_once __DIR__ . '/vendor/tfpdf/font/unifont/ttfonts.php';
require_once __DIR__ . '/_env.php';

define('_SYSTEM_TTFONTS', __DIR__ . '/fonts/');

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

function getIntervention($id) {
  $stmt = db()->prepare('SELECT * FROM interventions WHERE id = ?');
  $stmt->execute([$id]);
  $r = $stmt->fetch();
  if (!$r) return null;
  $r['materiel_pose'] = json_decode($r['materiel_pose'] ?? '{}', true);
  $r['points_gps'] = json_decode($r['points_gps'] ?? '[]', true);
  $r['whatsapp_photos'] = json_decode($r['whatsapp_photos'] ?? '[]', true);
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
  return $r;
}

class ChaptechPDF extends tFPDF {

  function __construct($orientation = 'P', $unit = 'mm', $size = 'A4') {
    parent::__construct($orientation, $unit, $size);
    $this->AddFont('Caveat', '', 'Caveat-Regular.ttf', true);
  }

  function Header() {}
  function Footer() {
    $this->SetY(-15);
    $this->SetFont('Helvetica', '', 7);
    $this->SetTextColor(150, 150, 150);
    $this->Cell(0, 5, 'CHAPTECH - Page ' . $this->PageNo(), 0, 0, 'C');
    $this->SetTextColor(0, 0, 0);
  }

  function drawText($x, $y, $txt, $size = 10, $font = 'Helvetica', $style = '', $color = [0, 0, 0]) {
    if (strpos($font, '-') !== false) {
      $parts = explode('-', $font);
      $font = $parts[0];
      $styleMap = ['Bold' => 'B', 'Oblique' => 'I', 'BoldOblique' => 'BI'];
      $style = $styleMap[$parts[1] ?? ''] ?? $style;
    }
    $this->SetFont($font, $style, $size);
    $this->SetTextColor($color[0], $color[1], $color[2]);
    $this->SetXY($x, $y);
    $this->Cell(0, $size * 0.35, $txt);
    $this->SetTextColor(0, 0, 0);
  }

  function drawHand($x, $y, $txt, $size = 11, $color = [0, 0, 100]) {
    $this->SetFont('Caveat', '', $size);
    $this->SetTextColor($color[0], $color[1], $color[2]);
    $this->SetXY($x, $y);
    $this->Cell(0, $size * 0.4, $txt);
    $this->SetTextColor(0, 0, 0);
  }

  function drawRect($x, $y, $w, $h, $style = 'D') {
    $this->Rect($x, $y, $w, $h, $style);
  }

  function drawLine($x1, $y1, $x2, $y2) {
    $this->Line($x1, $y1, $x2, $y2);
  }

  function drawCheckbox($x, $y, $checked = false, $size = 4) {
    $this->Rect($x, $y, $size, $size);
    if ($checked) {
      $this->SetFont('Helvetica', 'B', 8);
      $this->SetXY($x + 0.5, $y - 0.5);
      $this->Cell($size - 1, $size + 1, 'X');
    }
  }

  function drawCheckboxHand($x, $y, $checked = false, $size = 5) {
    if ($checked) {
      $this->SetFont('Caveat', '', 14);
      $this->SetTextColor(0, 0, 100);
      $this->SetXY($x + 0.5, $y - 2);
      $this->Cell($size + 2, $size + 3, 'X');
      $this->SetTextColor(0, 0, 0);
    }
  }

  function drawSignature($x, $y, $w, $label, $name, $signature = null) {
    $this->drawRect($x, $y, $w, 30);
    $this->drawText($x + 2, $y + 2, $label, 7, 'Helvetica-Bold');
    if ($name) {
      $this->drawHand($x + 2, $y + 12, $name, 13);
    }
    if ($signature && strpos($signature, 'data:image') === 0) {
      $base64 = explode(',', $signature)[1] ?? '';
      $imgData = base64_decode($base64);
      if ($imgData) {
        $tmpFile = tempnam(sys_get_temp_dir(), 'sig') . '.png';
        file_put_contents($tmpFile, $imgData);
        try {
          $this->Image($tmpFile, $x + $w * 0.5, $y + 8, $w * 0.4, 18);
        } catch (Exception $e) {}
        @unlink($tmpFile);
      }
    }
  }

  function embedPhoto($base64Data, $x, $y, $w, $h) {
    if (!$base64Data || strpos($base64Data, 'data:image') !== 0) return false;
    $base64 = explode(',', $base64Data)[1] ?? '';
    $imgData = base64_decode($base64);
    if (!$imgData) return false;
    $tmpFile = tempnam(sys_get_temp_dir(), 'photo') . '.jpg';
    file_put_contents($tmpFile, $imgData);
    try {
      $this->Image($tmpFile, $x, $y, $w, $h);
      @unlink($tmpFile);
      return true;
    } catch (Exception $e) {
      @unlink($tmpFile);
      return false;
    }
  }
}

function generateFichesPDF($d) {
  $pdf = new ChaptechPDF();
  $pdf->SetAutoPageBreak(false);

  $dateStr = date('d/m/Y', strtotime($d['date'] ?? 'now'));
  $etat = $d['etat'] ?? '';
  $gabaritsDir = __DIR__ . '/../public/templates/gabarits';
  if (!is_dir($gabaritsDir)) {
    $gabaritsDir = __DIR__ . '/../templates/gabarits';
  }
  $sbinBg = $gabaritsDir . '/fiche_sbin_word.jpg';
  $satBg = $gabaritsDir . '/fiche_satisfaction_word.jpg';

  // ===== Page 1: FICHE SBIN - image de fond + overlay données =====
  $pdf->AddPage();
  if (file_exists($sbinBg)) {
    $pdf->Image($sbinBg, 0, 0, 210, 297);
  }

  // --- Identification (coordonnées mesurées sur l'image) ---
  $pdf->drawHand(55, 25, $dateStr, 12);
  $pdf->drawHand(65, 31, $d['nom_client'] ?? '', 12);
  if ($etat === 'PON' || $etat === 'FTTH') {
    $pdf->drawCheckboxHand(22, 31);
  }
  if ($etat === 'Cuivre') {
    $pdf->drawCheckboxHand(50, 31);
  }
  $pdf->drawHand(55, 37, $dateStr, 12);
  $pdf->drawHand(55, 43, $dateStr, 12);

  $pdf->drawHand(135, 25, $d['nom_client'] ?? '', 12);
  $pdf->drawHand(145, 31, $d['telephone_ligne'] ?? '', 12);
  $pdf->drawHand(145, 37, $d['mobile'] ?? '', 12);
  $pdf->drawHand(135, 43, $d['mail'] ?? '', 12);

  // --- Installation ---
  $pdf->drawHand(55, 61, $d['ont_sn'] ?? $d['sn'] ?? '', 12);
  $pdf->drawHand(55, 67, (string)($d['pto_qte'] ?? ''), 12);
  $pdf->drawHand(60, 73, (string)($d['repeteur_wifi_qte'] ?? ''), 12);
  $pdf->drawHand(65, 80, $d['emplacement_ont'] ?? '', 11);

  // --- Offres (checkboxes) ---
  $offreVal = $d['offre_souscrite'] ?? '';
  $offreY = [
    'Fibre Pro' => 109,
    'Fibre Pro Max' => 115,
    'Fibre Pro Mega' => 121,
    'Fibre Office Max' => 127,
    'Fibre Office Mega' => 133,
  ];
  foreach ($offreY as $off => $oy) {
    if ($offreVal === $off) {
      $pdf->drawCheckboxHand(8, $oy);
    }
  }

  // Résultat Oui/Non pour les offres (sauf Fibre Pro = NA)
  $remiseOk = $d['remise_equipement_ok'] ?? false;
  $resultY = [115, 121, 127, 133];
  foreach ($resultY as $ry) {
    if ($remiseOk) {
      $pdf->drawCheckboxHand(140, $ry);
    } else {
      $pdf->drawCheckboxHand(162, $ry);
    }
  }

  // --- Matériels récupérés ---
  $pdf->drawHand(7, 186, $d['materiel_recupere'] ?? '', 11);
  $pdf->drawHand(70, 194, (string)($d['rdv_manques'] ?? ''), 12);
  $pdf->drawHand(70, 200, ($d['appreciation_satisfaction_libre'] ?? '') . ' /10', 12);
  $pdf->drawHand(7, 208, $d['autre_element'] ?? '', 11);
  $pdf->drawHand(70, 216, ($d['appreciation_generale'] ?? '') . ' /10', 12);

  // --- Signatures ---
  $nomClient = $d['nom_client_declaration'] ?? $d['nom_client'] ?? '';
  $nomTech = $d['nom_technicien'] ?? '';
  if ($nomClient) {
    $pdf->drawHand(7, 240, $nomClient, 13);
  }
  if ($nomTech) {
    $pdf->drawHand(112, 240, $nomTech, 13);
  }
  $sigClient = $d['signature_client'] ?? null;
  $sigTech = $d['signature_technicien'] ?? null;
  if ($sigClient && strpos($sigClient, 'data:image') === 0) {
    $base64 = explode(',', $sigClient)[1] ?? '';
    $imgData = base64_decode($base64);
    if ($imgData) {
      $tmpFile = tempnam(sys_get_temp_dir(), 'sig') . '.png';
      file_put_contents($tmpFile, $imgData);
      try { $pdf->Image($tmpFile, 30, 228, 40, 15); } catch (Exception $e) {}
      @unlink($tmpFile);
    }
  }
  if ($sigTech && strpos($sigTech, 'data:image') === 0) {
    $base64 = explode(',', $sigTech)[1] ?? '';
    $imgData = base64_decode($base64);
    if ($imgData) {
      $tmpFile = tempnam(sys_get_temp_dir(), 'sig') . '.png';
      file_put_contents($tmpFile, $imgData);
      try { $pdf->Image($tmpFile, 135, 228, 40, 15); } catch (Exception $e) {}
      @unlink($tmpFile);
    }
  }

  // ===== Page 2: Fiche Satisfaction - image de fond + overlay données =====
  $pdf->AddPage();
  if (file_exists($satBg)) {
    $pdf->Image($satBg, 0, 0, 210, 297);
  }

  // --- Informations client (2 colonnes) ---
  // Gauche: data x=55 ; Droite: data x=140
  $pdf->drawHand(55, 30, $d['nom_client'] ?? '', 12);
  $pdf->drawHand(55, 36, $d['telephone_ligne'] ?? '', 12);
  $pdf->drawHand(55, 42, $d['adresse_zone'] ?? '', 12);
  $pdf->drawHand(55, 48, $dateStr, 12);

  $pdf->drawHand(140, 30, substr($d['id'] ?? '', 0, 8), 12);
  $pdf->drawHand(140, 36, $d['telephone_ligne'] ?? '', 12);
  $pdf->drawHand(140, 42, $d['adresse_zone'] ?? '', 12);
  $pdf->drawHand(140, 48, $dateStr, 12);

  // --- Validation (Oui/Non checkboxes) ---
  $validations = [
    $d['travaux_conformes'] ?? false,
    $d['emplacement_valide'] ?? false,
    $d['travail_propre'] ?? false,
    $d['service_teste'] ?? false,
    $d['service_fonctionne'] ?? false,
    $d['explications_donnees'] ?? false,
    $d['recommanderait'] ?? false,
    $d['accepte_recontact'] ?? false,
  ];
  $valY = 62;
  foreach ($validations as $checked) {
    if ($checked) {
      $pdf->drawCheckboxHand(172, $valY);
    } else {
      $pdf->drawCheckboxHand(192, $valY);
    }
    $valY += 7;
  }

  // --- Niveau de satisfaction (checkboxes) ---
  $niveaux = ['Très satisfait', 'Satisfait', 'Peu satisfait', 'Insatisfait'];
  $satX = [72, 107, 142, 182];
  $criteres = [
    $d['qualite'] ?? '',
    $d['delais'] ?? '',
    $d['professionnalisme'] ?? '',
  ];
  $satY = 131;
  foreach ($criteres as $val) {
    for ($i = 0; $i < 4; $i++) {
      if ($val === $niveaux[$i]) {
        $pdf->drawCheckboxHand($satX[$i], $satY);
      }
    }
    $satY += 7;
  }

  // --- Déclaration ---
  $pdf->drawHand(7, 160, $d['nom_client_declaration'] ?? $d['nom_client'] ?? '', 13);

  // --- Remarque libre ---
  $pdf->drawHand(7, 175, $d['remarque_libre'] ?? '', 11);

  // --- Signatures ---
  $nomClient2 = $d['nom_client_declaration'] ?? $d['nom_client'] ?? '';
  $nomTech2 = $d['nom_technicien'] ?? '';
  if ($nomClient2) {
    $pdf->drawHand(7, 210, $nomClient2, 13);
  }
  if ($nomTech2) {
    $pdf->drawHand(112, 210, $nomTech2, 13);
  }
  if ($sigClient && strpos($sigClient, 'data:image') === 0) {
    $base64 = explode(',', $sigClient)[1] ?? '';
    $imgData = base64_decode($base64);
    if ($imgData) {
      $tmpFile = tempnam(sys_get_temp_dir(), 'sig2') . '.png';
      file_put_contents($tmpFile, $imgData);
      try { $pdf->Image($tmpFile, 30, 198, 40, 15); } catch (Exception $e) {}
      @unlink($tmpFile);
    }
  }
  if ($sigTech && strpos($sigTech, 'data:image') === 0) {
    $base64 = explode(',', $sigTech)[1] ?? '';
    $imgData = base64_decode($base64);
    if ($imgData) {
      $tmpFile = tempnam(sys_get_temp_dir(), 'sig2') . '.png';
      file_put_contents($tmpFile, $imgData);
      try { $pdf->Image($tmpFile, 135, 198, 40, 15); } catch (Exception $e) {}
      @unlink($tmpFile);
    }
  }

  return $pdf;
}

function generateRapportPDF($d) {
  $pdf = new ChaptechPDF();
  $pdf->SetAutoPageBreak(true, 20);
  $margin = 15;
  $pageW = 210;
  $contentW = $pageW - 2 * $margin;

  $pdf->AddPage();
  $y = $margin;

  // Logo
  $logoPath = __DIR__ . '/../templates/logos/logo_sbin.jpg';
  if (file_exists($logoPath)) {
    $pdf->Image($logoPath, $margin, $y, 25);
  }
  $pdf->drawText($margin + 30, $y + 4, 'Rapport d\'intervention - TELECOM BTP Services', 12, 'Helvetica-Bold', '', [13, 25, 90]);
  $y += 12;
  $pdf->drawLine($margin, $y, $margin + $contentW, $y);
  $y += 6;

  // Infos generales
  $pdf->drawText($margin, $y, 'Informations generales', 10, 'Helvetica-Bold', '', [13, 25, 90]);
  $y += 6;
  $infos = [
    ['Chef d\'equipe', $d['nom_technicien'] ?? ''],
    ['Client', $d['nom_client'] ?? ''],
    ['Adresse / Zone', $d['adresse_zone'] ?? ''],
    ['Telephone', $d['telephone_ligne'] ?? ''],
    ['Mobile', $d['mobile'] ?? ''],
    ['Date', date('d/m/Y', strtotime($d['date'] ?? 'now'))],
    ['Etat', $d['etat'] ?? ''],
    ['Statut', ($d['statut'] ?? '') === 'termine' ? 'Terminee' : 'En cours'],
  ];
  foreach ($infos as $row) {
    $pdf->drawRect($margin, $y, 70, 6);
    $pdf->drawRect($margin + 70, $y, $contentW - 70, 6);
    $pdf->drawText($margin + 2, $y + 1, $row[0], 7, 'Helvetica-Bold');
    $pdf->drawHand($margin + 72, $y + 1, $row[1], 10);
    $y += 6;
  }
  $y += 4;

  // Donnees techniques
  $pdf->drawText($margin, $y, 'Donnees techniques', 10, 'Helvetica-Bold', '', [13, 25, 90]);
  $y += 6;
  $tech = [
    ['MSAN', $d['msan'] ?? ''],
    ['FAT', $d['fat_ref'] ?? ''],
    ['Port', $d['port'] ?? ''],
    ['Type de cable', $d['type_cable'] ?? ''],
    ['Depart (m)', $d['depart_m'] ?? ''],
    ['Arrivee (m)', $d['arrivee_m'] ?? ''],
    ['Lineaire (m)', $d['lineaire_m'] ?? ''],
    ['Puissance FAT (dBm)', $d['puissance_fat_dbm'] ?? ''],
    ['Puissance PTO (dBm)', $d['puissance_pto_dbm'] ?? ''],
    ['MAC', $d['mac'] ?? ''],
    ['SN / ONT', $d['sn'] ?? ''],
    ['Offre souscrite', $d['offre_souscrite'] ?? ''],
  ];
  foreach ($tech as $row) {
    $pdf->drawRect($margin, $y, 70, 6);
    $pdf->drawRect($margin + 70, $y, $contentW - 70, 6);
    $pdf->drawText($margin + 2, $y + 1, $row[0], 7, 'Helvetica-Bold');
    $pdf->drawHand($margin + 72, $y + 1, $row[1], 10);
    $y += 6;
  }
  $y += 4;

  // Materiel pose
  $mp = $d['materiel_pose'] ?? [];
  if (!empty($mp)) {
    $pdf->drawText($margin, $y, 'Materiel pose', 10, 'Helvetica-Bold', '', [13, 25, 90]);
    $y += 6;
    foreach ($mp as $key => $qte) {
      if (!$qte) continue;
      $pdf->drawRect($margin, $y, 70, 6);
      $pdf->drawRect($margin + 70, $y, $contentW - 70, 6);
      $pdf->drawText($margin + 2, $y + 1, $key, 7, 'Helvetica-Bold');
      $pdf->drawHand($margin + 72, $y + 1, str_pad($qte, 2, '0', STR_PAD_LEFT), 10);
      $y += 6;
    }
    $y += 4;
  }

  // Points GPS avec photos
  $points = $d['points_gps'] ?? [];
  if (!empty($points)) {
    $pdf->drawText($margin, $y, 'Points GPS releves (' . count($points) . ')', 10, 'Helvetica-Bold', '', [13, 25, 90]);
    $y += 8;

    foreach ($points as $point) {
      if ($y > 250) { $pdf->AddPage(); $y = $margin; }

      $label = trim(($point['type'] ?? '') . ' ' . ($point['sous_type'] ?? '') . ' ' . ($point['numero'] ?? ''));
      $pdf->drawText($margin, $y, $label, 10, 'Helvetica-Bold', '', [13, 25, 90]);
      $y += 6;

      // Photo
      $photoW = 80;
      $photoH = 60;
      $hasPhoto = false;
      if (!empty($point['photo'])) {
        $hasPhoto = $pdf->embedPhoto($point['photo'], $margin, $y, $photoW, $photoH);
      }

      $textX = $hasPhoto ? $margin + $photoW + 5 : $margin;
      $pdf->drawHand($textX, $y, ($point['lat'] ?? 0) . ', ' . ($point['lng'] ?? 0), 10);
      $pdf->drawText($textX, $y + 5, 'Precision: +/' . ($point['precision_m'] ?? 0) . 'm', 7);
      $pdf->drawText($textX, $y + 10, date('d/m/Y H:i', strtotime($point['horodatage'] ?? 'now')), 7);
      if (!empty($point['proprietaire'])) {
        $pdf->drawText($textX, $y + 15, 'Proprietaire: ' . $point['proprietaire'], 7);
      }
      $pdf->drawText($textX, $y + 20, 'Ajoute par ' . ($point['ajoute_par'] ?? ''), 6.5, 'Helvetica', '', [150, 150, 150]);

      $y += $hasPhoto ? $photoH + 5 : 25;
    }
  }

  // Photos WhatsApp (hors rapport)
  $waPhotos = $d['whatsapp_photos'] ?? [];
  if (!empty($waPhotos)) {
    if ($y > 240) { $pdf->AddPage(); $y = $margin; }
    $pdf->drawText($margin, $y, 'Photos terrain (' . count($waPhotos) . ')', 10, 'Helvetica-Bold', '', [13, 25, 90]);
    $y += 8;

    $thumbW = 55;
    $thumbH = 42;
    $thumbGap = 12;
    $cols = 3;
    $colW = $contentW / $cols;
    $rowIdx = 0;

    foreach ($waPhotos as $i => $photo) {
      $col = $i % $cols;
      if ($col === 0 && $i > 0) $rowIdx++;
      $px = $margin + $col * $colW;
      $py = $y + $rowIdx * ($thumbH + $thumbGap);

      if ($py + $thumbH > 275) {
        $pdf->AddPage();
        $y = $margin;
        $rowIdx = 0;
        $py = $y;
      }

      $hasPhoto = $pdf->embedPhoto($photo['url'] ?? '', $px, $py, $thumbW, $thumbH);
      if ($hasPhoto) {
        $pdf->drawText($px, $py + $thumbH + 1, sprintf('%.4f', $photo['lat'] ?? 0) . ', ' . sprintf('%.4f', $photo['lng'] ?? 0), 6);
        $pdf->drawText($px, $py + $thumbH + 5, date('d/m/Y H:i', strtotime($photo['horodatage'] ?? 'now')), 6);
      } else {
        $pdf->drawText($px, $py, 'Photo ' . ($i + 1), 7);
      }
    }
    $totalRows = ceil(count($waPhotos) / $cols);
    $y += $totalRows * ($thumbH + $thumbGap);
  }

  return $pdf;
}

// ===== Stock PDF =====

function generateStockPDF() {
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

  $stmt = db()->query('SELECT designation, quantite FROM stock ORDER BY designation');
  $items = $stmt->fetchAll();

  $pdf = new ChaptechPDF();
  $pdf->SetAutoPageBreak(true, 20);
  $margin = 15;
  $pageW = 210;
  $contentW = $pageW - 2 * $margin;

  $pdf->AddPage();
  $y = $margin;

  $logoPath = __DIR__ . '/../templates/logos/logo_sbin.jpg';
  if (file_exists($logoPath)) {
    $pdf->Image($logoPath, $margin, $y, 25);
  }
  $pdf->drawText($margin + 30, $y + 4, 'Inventaire de Stock - CHAPTECH', 14, 'Helvetica-Bold', '', [13, 25, 90]);
  $y += 14;
  $pdf->drawLine($margin, $y, $margin + $contentW, $y);
  $y += 6;

  $pdf->drawText($margin, $y, 'Date: ' . date('d/m/Y H:i'), 9, 'Helvetica');
  $y += 8;

  $pdf->drawText($margin, $y, 'Désignation', 8, 'Helvetica-Bold');
  $pdf->drawText($margin + 120, $y, 'Quantité', 8, 'Helvetica-Bold');
  $pdf->drawText($margin + 150, $y, 'Statut', 8, 'Helvetica-Bold');
  $y += 5;
  $pdf->drawLine($margin, $y, $margin + $contentW, $y);
  $y += 3;

  $total = 0;
  foreach ($items as $item) {
    $desig = $item['designation'];
    $qty = (int)$item['quantite'];
    $label = $labels[$desig] ?? $desig;
    $total += $qty;

    $pdf->drawText($margin, $y, $label, 9);
    $pdf->drawHand($margin + 120, $y - 1, str_pad($qty, 3, '0', STR_PAD_LEFT), 12);
    if ($qty == 0) {
      $pdf->drawText($margin + 150, $y, 'RUPTURE', 8, 'Helvetica-Bold', '', [200, 0, 0]);
    } elseif ($qty < 10) {
      $pdf->drawText($margin + 150, $y, 'FAIBLE', 8, 'Helvetica-Bold', '', [200, 140, 0]);
    } else {
      $pdf->drawText($margin + 150, $y, 'OK', 8, 'Helvetica-Bold', '', [0, 150, 0]);
    }
    $y += 7;
  }

  $y += 3;
  $pdf->drawLine($margin, $y, $margin + $contentW, $y);
  $y += 5;
  $pdf->drawText($margin, $y, 'Total articles en stock: ' . $total, 10, 'Helvetica-Bold');
  $y += 8;

  // Mouvements récents
  $stmt = db()->prepare('SELECT sm.*, i.nom_client as int_nom_client
    FROM stock_movements sm
    LEFT JOIN interventions i ON sm.intervention_id COLLATE utf8mb4_unicode_ci = i.id COLLATE utf8mb4_unicode_ci
    ORDER BY sm.date_mouvement DESC
    LIMIT 30');
  $stmt->execute();
  $movements = $stmt->fetchAll();

  if (!empty($movements)) {
    if ($y > 240) { $pdf->AddPage(); $y = $margin; }
    $pdf->drawText($margin, $y, 'Mouvements récents (30 derniers)', 10, 'Helvetica-Bold', '', [13, 25, 90]);
    $y += 6;
    $pdf->drawText($margin, $y, 'Date', 7, 'Helvetica-Bold');
    $pdf->drawText($margin + 30, $y, 'Désignation', 7, 'Helvetica-Bold');
    $pdf->drawText($margin + 90, $y, 'Type', 7, 'Helvetica-Bold');
    $pdf->drawText($margin + 115, $y, 'Qté', 7, 'Helvetica-Bold');
    $pdf->drawText($margin + 135, $y, 'Client', 7, 'Helvetica-Bold');
    $y += 5;
    $pdf->drawLine($margin, $y, $margin + $contentW, $y);
    $y += 3;

    foreach ($movements as $mv) {
      if ($y > 270) { $pdf->AddPage(); $y = $margin; }
      $dateMv = date('d/m H:i', strtotime($mv['date_mouvement']));
      $pdf->drawText($margin, $y, $dateMv, 7);
      $pdf->drawText($margin + 30, $y, $labels[$mv['designation']] ?? $mv['designation'], 7);
      $typeLabel = $mv['type'] === 'entree' ? 'Entrée' : ($mv['type'] === 'sortie' ? 'Sortie' : 'Ajust.');
      $typeColor = $mv['type'] === 'entree' ? [0, 150, 0] : ($mv['type'] === 'sortie' ? [200, 0, 0] : [150, 150, 0]);
      $pdf->drawText($margin + 90, $y, $typeLabel, 7, 'Helvetica-Bold', '', $typeColor);
      $pdf->drawHand($margin + 115, $y - 1, str_pad($mv['quantite'], 3, '0', STR_PAD_LEFT), 10);
      $clientName = $mv['int_nom_client'] ?? $mv['nom_client'] ?? '';
      $pdf->drawText($margin + 135, $y, substr($clientName, 0, 25), 7);
      $y += 6;
    }
  }

  return $pdf;
}

function generateStockUsagePDF($interventionId) {
  $stmt = db()->prepare('SELECT * FROM interventions WHERE id = ?');
  $stmt->execute([$interventionId]);
  $d = $stmt->fetch();
  if (!$d) return null;

  $materiel = json_decode($d['materiel_pose'] ?? '{}', true) ?? [];

  $stmt = db()->prepare('SELECT designation, type, quantite, date_mouvement, motif
    FROM stock_movements
    WHERE intervention_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
    ORDER BY designation');
  $stmt->execute([$interventionId]);
  $movements = $stmt->fetchAll();

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

  $pdf = new ChaptechPDF();
  $pdf->SetAutoPageBreak(true, 20);
  $margin = 15;
  $pageW = 210;
  $contentW = $pageW - 2 * $margin;

  $pdf->AddPage();
  $y = $margin;

  $logoPath = __DIR__ . '/../templates/logos/logo_premium_company_benin.jpeg';
  if (file_exists($logoPath)) {
    $pdf->Image($logoPath, $margin, $y, 30);
  }
  $pdf->drawText($margin + 35, $y + 4, 'Fiche de matériel - Intervention', 14, 'Helvetica-Bold', '', [13, 25, 90]);
  $y += 14;
  $pdf->drawLine($margin, $y, $margin + $contentW, $y);
  $y += 6;

  $dateStr = date('d/m/Y', strtotime($d['date'] ?? 'now'));
  $infos = [
    ['Client', $d['nom_client'] ?? ''],
    ['Technicien', $d['nom_technicien'] ?? ''],
    ['Date', $dateStr],
    ['Adresse', $d['adresse_zone'] ?? ''],
  ];
  foreach ($infos as $row) {
    $pdf->drawRect($margin, $y, 50, 6);
    $pdf->drawRect($margin + 50, $y, $contentW - 50, 6);
    $pdf->drawText($margin + 2, $y + 1, $row[0], 7, 'Helvetica-Bold');
    $pdf->drawHand($margin + 52, $y + 0.5, $row[1], 11);
    $y += 6;
  }
  $y += 5;

  $pdf->drawText($margin, $y, 'Matériel posé', 10, 'Helvetica-Bold', '', [13, 25, 90]);
  $y += 6;
  $pdf->drawText($margin, $y, 'Désignation', 8, 'Helvetica-Bold');
  $pdf->drawText($margin + 120, $y, 'Quantité', 8, 'Helvetica-Bold');
  $y += 5;
  $pdf->drawLine($margin, $y, $margin + $contentW, $y);
  $y += 3;

  $total = 0;
  foreach ($materiel as $desig => $qty) {
    if ((int)$qty <= 0) continue;
    $label = $labels[$desig] ?? $desig;
    $pdf->drawText($margin, $y, $label, 9);
    $pdf->drawHand($margin + 120, $y - 1, str_pad($qty, 3, '0', STR_PAD_LEFT), 12);
    $y += 7;
    $total += (int)$qty;
  }
  if ($total == 0) {
    $pdf->drawText($margin, $y, 'Aucun matériel posé', 9, 'Helvetica', '', [150, 150, 150]);
    $y += 7;
  }
  $y += 3;
  $pdf->drawLine($margin, $y, $margin + $contentW, $y);
  $y += 5;
  $pdf->drawText($margin, $y, 'Total: ' . $total . ' articles', 10, 'Helvetica-Bold');
  $y += 10;

  // Stock restant
  $stmt = db()->query('SELECT designation, quantite FROM stock ORDER BY designation');
  $stockItems = $stmt->fetchAll();
  $stockMap = [];
  foreach ($stockItems as $s) { $stockMap[$s['designation']] = (int)$s['quantite']; }

  if ($y > 230) { $pdf->AddPage(); $y = $margin; }
  $pdf->drawText($margin, $y, 'Stock restant (inventaire actuel)', 10, 'Helvetica-Bold', '', [13, 25, 90]);
  $y += 6;
  $pdf->drawText($margin, $y, 'Désignation', 8, 'Helvetica-Bold');
  $pdf->drawText($margin + 120, $y, 'Quantité', 8, 'Helvetica-Bold');
  $pdf->drawText($margin + 150, $y, 'Statut', 8, 'Helvetica-Bold');
  $y += 5;
  $pdf->drawLine($margin, $y, $margin + $contentW, $y);
  $y += 3;

  foreach ($stockMap as $desig => $qty) {
    if ($y > 270) { $pdf->AddPage(); $y = $margin; }
    $label = $labels[$desig] ?? $desig;
    $pdf->drawText($margin, $y, $label, 8);
    $pdf->drawHand($margin + 120, $y - 1, str_pad($qty, 3, '0', STR_PAD_LEFT), 11);
    if ($qty == 0) {
      $pdf->drawText($margin + 150, $y, 'RUPTURE', 7, 'Helvetica-Bold', '', [200, 0, 0]);
    } elseif ($qty < 10) {
      $pdf->drawText($margin + 150, $y, 'FAIBLE', 7, 'Helvetica-Bold', '', [200, 140, 0]);
    } else {
      $pdf->drawText($margin + 150, $y, 'OK', 7, 'Helvetica-Bold', '', [0, 150, 0]);
    }
    $y += 6;
  }

  return $pdf;
}

// ===== Routing =====
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? '';

try {
  if ($action === 'pdf_stock') {
    $pdf = generateStockPDF();
    $filename = 'stock_' . date('Y-m-d') . '.pdf';
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Access-Control-Allow-Origin: *');
    $pdf->Output('D', $filename);
  } elseif ($action === 'pdf_stock_view') {
    $pdf = generateStockPDF();
    header('Content-Type: application/pdf');
    header('Access-Control-Allow-Origin: *');
    $pdf->Output('I');
  } elseif ($action === 'pdf_stock_usage') {
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'ID requis']); exit; }
    $pdf = generateStockUsagePDF($id);
    if (!$pdf) { http_response_code(404); echo json_encode(['error' => 'Intervention introuvable']); exit; }
    $filename = 'materiel_' . $id . '.pdf';
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Access-Control-Allow-Origin: *');
    $pdf->Output('D', $filename);
  } elseif ($action === 'pdf_stock_usage_view') {
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'ID requis']); exit; }
    $pdf = generateStockUsagePDF($id);
    if (!$pdf) { http_response_code(404); echo json_encode(['error' => 'Intervention introuvable']); exit; }
    header('Content-Type: application/pdf');
    header('Access-Control-Allow-Origin: *');
    $pdf->Output('I');
  } elseif (!$id) {
    http_response_code(400);
    echo json_encode(['error' => 'ID requis']);
  } else {
    $d = getIntervention($id);
    if (!$d) {
      http_response_code(404);
      echo json_encode(['error' => 'Intervention introuvable']);
      exit;
    }

    if ($action === 'pdf_fiches') {
      $pdf = generateFichesPDF($d);
      $filename = 'fiches_' . ($d['nom_client'] ?? $id) . '.pdf';
      header('Content-Type: application/pdf');
      header('Content-Disposition: attachment; filename="' . $filename . '"');
      header('Access-Control-Allow-Origin: *');
      $pdf->Output('D', $filename);
    } elseif ($action === 'pdf_rapport') {
      $pdf = generateRapportPDF($d);
      $filename = 'rapport_' . ($d['nom_client'] ?? $id) . '.pdf';
      header('Content-Type: application/pdf');
      header('Content-Disposition: attachment; filename="' . $filename . '"');
      header('Access-Control-Allow-Origin: *');
      $pdf->Output('D', $filename);
    } elseif ($action === 'pdf_fiches_view') {
      $pdf = generateFichesPDF($d);
      header('Content-Type: application/pdf');
      header('Access-Control-Allow-Origin: *');
      $pdf->Output('I');
    } elseif ($action === 'pdf_rapport_view') {
      $pdf = generateRapportPDF($d);
      header('Content-Type: application/pdf');
      header('Access-Control-Allow-Origin: *');
      $pdf->Output('I');
    } else {
      http_response_code(404);
      echo json_encode(['error' => 'Action PDF inconnue: ' . $action]);
    }
  }
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['error' => $e->getMessage()]);
}
