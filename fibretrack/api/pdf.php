<?php
// Génération PDF côté serveur - utilise tFPDF (UTF-8 natif)
// Endpoints: ?action=pdf_fiches&id=XXX, ?action=pdf_rapport&id=XXX
// Fond de page = images gabarits, overlay = données manuscrites (Caveat TTF)

require_once __DIR__ . '/vendor/tfpdf/tfpdf.php';
require_once __DIR__ . '/vendor/tfpdf/font/unifont/ttfonts.php';
require_once __DIR__ . '/_env.php';

define('_SYSTEM_TTFONTS', __DIR__ . '/fonts/');

define('PDF_DPI', 150);

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

function requirePdfAuth() {
  $code = trim($_GET['code'] ?? ($_SERVER['HTTP_X_USER_CODE'] ?? ''));
  if ($code === '9999') return;
  if (!preg_match('/^\d{4}$/', $code)) { http_response_code(401); exit; }
  $stmt = db()->prepare('SELECT id FROM accounts WHERE code = ?');
  $stmt->execute([$code]);
  if (!$stmt->fetch()) { http_response_code(401); exit; }
}

function compressJpeg($imgData, $maxW, $maxH, $quality = 75) {
  if (!function_exists('imagecreatefromjpeg')) return $imgData;
  $tmp = tempnam(sys_get_temp_dir(), 'cmp') . '.jpg';
  file_put_contents($tmp, $imgData);
  $src = @imagecreatefromjpeg($tmp);
  @unlink($tmp);
  if (!$src) return $imgData;
  $srcW = imagesx($src);
  $srcH = imagesy($src);
  $scale = min($maxW / $srcW, $maxH / $srcH, 1);
  $dstW = (int)($srcW * $scale);
  $dstH = (int)($srcH * $scale);
  $dst = imagecreatetruecolor($dstW, $dstH);
  imagecopyresampled($dst, $src, 0, 0, 0, 0, $dstW, $dstH, $srcW, $srcH);
  imagedestroy($src);
  ob_start();
  imagejpeg($dst, null, $quality);
  $out = ob_get_clean();
  imagedestroy($dst);
  return $out ?: $imgData;
}

function compressGabarit($path, $maxW, $maxH) {
  static $cache = [];
  $key = $path . '_' . $maxW . 'x' . $maxH;
  if (isset($cache[$key])) return $cache[$key];
  $compressed = compressJpeg(file_get_contents($path), $maxW, $maxH, 80);
  $tmp = tempnam(sys_get_temp_dir(), 'gab') . '.jpg';
  file_put_contents($tmp, $compressed);
  $cache[$key] = $tmp;
  return $tmp;
}

function mmToPxAtDpi($mm, $dpi) {
  return (int)($mm * $dpi / 25.4);
}

function getIntervention($id) {
  $stmt = db()->prepare('SELECT * FROM interventions WHERE id = ?');
  $stmt->execute([$id]);
  $r = $stmt->fetch();
  if (!$r) return null;
  $r['materiel_pose'] = json_decode($r['materiel_pose'] ?? '{}', true);
  $r['points_gps'] = json_decode($r['points_gps'] ?? '[]', true);
  $r['whatsapp_photos'] = json_decode($r['whatsapp_photos'] ?? '[]', true);
  $r['videos_terrain'] = json_decode($r['videos_terrain'] ?? '[]', true);
  $r['port_disponible'] = (int)$r['port_disponible'];
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

/** UTF-8 → Windows-1252 pour Cell() avec les polices core FPDF (Latin-1). */
function pdfT($s) {
  return mb_convert_encoding((string)$s, 'Windows-1252', 'UTF-8');
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
    $this->Cell(0, $size * 0.35, pdfT($txt));
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

  function embedPhoto($src, $x, $y, $w, $h) {
    if (empty($src)) return false;
    $imgData = null;
    if (strpos($src, 'data:image') === 0) {
      $base64 = explode(',', $src)[1] ?? '';
      $imgData = base64_decode($base64);
    } elseif (strpos($src, 'http://') === 0 || strpos($src, 'https://') === 0) {
      $prefix = 'https://fibretrack.mantota.com/api/';
      if (strpos($src, $prefix) === 0) {
        $localPath = __DIR__ . '/' . substr($src, strlen($prefix));
        if (is_file($localPath)) {
          $imgData = file_get_contents($localPath);
        }
      }
      if (!$imgData) {
        $ctx = stream_context_create(['http' => ['timeout' => 5]]);
        $imgData = @file_get_contents($src, false, $ctx);
      }
    } elseif (is_file($src)) {
      $imgData = file_get_contents($src);
    }
    if (!$imgData) return false;

    $maxW = mmToPxAtDpi($w, PDF_DPI);
    $maxH = mmToPxAtDpi($h, PDF_DPI);
    $imgData = compressJpeg($imgData, $maxW, $maxH, 75);
    $tmpFile = tempnam(sys_get_temp_dir(), 'photo') . '.jpg';
    file_put_contents($tmpFile, $imgData);
    try {
      $size = @getimagesize($tmpFile);
      if ($size && $size[0] > 0 && $size[1] > 0) {
        $ratio = min($w / $size[0], $h / $size[1]);
        $dw = $size[0] * $ratio;
        $dh = $size[1] * $ratio;
        $this->Image($tmpFile, $x + ($w - $dw) / 2, $y + ($h - $dh) / 2, $dw, $dh);
      } else {
        $this->Image($tmpFile, $x, $y, $w, $h);
      }
      @unlink($tmpFile);
      return true;
    } catch (Exception $e) {
      @unlink($tmpFile);
      return false;
    }
  }
}



function renderSbinPage($pdf, $d) {
  $dateStr = date('d/m/Y', strtotime($d['date'] ?? 'now'));
  $etat = $d['etat'] ?? '';
  $gabaritsDir = __DIR__ . '/../public/templates/gabarits';
  if (!is_dir($gabaritsDir)) {
    $gabaritsDir = __DIR__ . '/../templates/gabarits';
  }
  $sbinBg = $gabaritsDir . '/fiche_sbin_word.jpg';
  if (!file_exists($sbinBg)) {
    $sbinBg = $gabaritsDir . '/fiche_sbin_mise_en_service.jpg';
  }
  $gabMaxW = mmToPxAtDpi(210, PDF_DPI);
  $gabMaxH = mmToPxAtDpi(297, PDF_DPI);

  $pdf->AddPage();
  if (file_exists($sbinBg)) {
    $pdf->Image(compressGabarit($sbinBg, $gabMaxW, $gabMaxH), 0, 0, 210, 297);
  }

  // --- En-tête identification (gabarit fiche_sbin_word.jpg) ---
  $pdf->drawHand(62, 47, $dateStr, 10);
  $pdf->drawHand(125, 47, $d['nom_client'] ?? '', 10);

  // Service FTTH/CUIVRE
  if ($etat === 'PON' || $etat === 'FTTH' || strtolower($d['service_type'] ?? '') === 'ftth') {
    $pdf->drawCheckboxHand(35, 52, true);
  }
  if ($etat === 'Cuivre' || strtolower($d['service_type'] ?? '') === 'cuivre') {
    $pdf->drawCheckboxHand(52, 52, true);
  }

  $pdf->drawHand(125, 55, $d['telephone_ligne'] ?? '', 10);
  $pdf->drawHand(62, 60, $dateStr, 10);
  $pdf->drawHand(125, 60, $d['mobile'] ?? '', 10);
  $pdf->drawHand(62, 66, $dateStr, 10);
  $pdf->drawHand(125, 66, $d['mail'] ?? '', 10);

  // --- 1. INSTALLATION ---
  $pdf->drawHand(105, 80, $d['ont_sn'] ?? $d['sn'] ?? '', 9);
  $pdf->drawHand(105, 85, (string)($d['pto_qte'] ?? ''), 9);
  $pdf->drawHand(105, 90, (string)($d['repeteur_wifi_qte'] ?? ''), 9);
  $pdf->drawHand(105, 100, $d['emplacement_ont'] ?? '', 8);
  $pdf->drawHand(15, 112, $d['appreciation_satisfaction_libre'] ?? '', 9);

  // --- 2. VÉRIFICATION SUR LES OFFRES FTTH B2B2G ---
  $offreVal = $d['offre_souscrite'] ?? 'Fibre Pro';
  $offreY = [
    'Fibre Pro' => 130,
    'Fibre Pro Max' => 135,
    'Fibre Pro Mega' => 140,
    'Fibre Office Max' => 147,
    'Fibre Office Mega' => 155,
  ];
  foreach ($offreY as $off => $oy) {
    if (strpos(strtolower($offreVal), strtolower($off)) !== false) {
      $pdf->drawCheckboxHand(53, $oy, true);
    }
  }

  $remiseOk = $d['remise_equipement_ok'] ?? true;
  $ouiX = 170;
  $nonX = 185;
  foreach ([135, 140, 147, 155] as $ry) {
    $pdf->drawCheckboxHand($remiseOk ? $ouiX : $nonX, $ry, true);
  }

  // --- 3. INTERVENTIONS (CONSTATS ET TRAVAUX EXÉCUTÉS) ---
  if (!empty($d['constat_diagnostic'])) $pdf->drawHand(15, 175, $d['constat_diagnostic'], 8);
  if (!empty($d['travaux_executes'])) $pdf->drawHand(80, 175, $d['travaux_executes'], 8);
  if (!empty($d['observations_intervention'])) $pdf->drawHand(150, 175, $d['observations_intervention'], 8);

  $pdf->drawHand(15, 207, $d['materiel_recupere'] ?? '', 9);
  $pdf->drawHand(62, 215, (string)($d['rdv_manques'] ?? '0'), 10);
  $pdf->drawHand(78, 220, ($d['note_qualite_equipe'] ?? $d['appreciation_satisfaction_libre'] ?? '10'), 10);
  $pdf->drawHand(15, 230, $d['autre_element'] ?? '', 9);
  $pdf->drawHand(100, 240, ($d['note_appreciation_client'] ?? '10'), 10);

  // Signatures Fiche SBIN
  $nomClient = $d['nom_client_declaration'] ?? $d['nom_client'] ?? '';
  $nomTech = $d['nom_technicien'] ?? '';
  if ($nomClient) $pdf->drawHand(15, 258, $nomClient, 10);
  if ($nomTech) $pdf->drawHand(155, 258, $nomTech, 10);

  $sigClient = $d['signature_client'] ?? null;
  $sigTech = $d['signature_technicien'] ?? null;
  if ($sigClient && strpos($sigClient, 'data:image') === 0) {
    $base64 = explode(',', $sigClient)[1] ?? '';
    $imgData = base64_decode($base64);
    if ($imgData) {
      $tmpFile = tempnam(sys_get_temp_dir(), 'sig_sbin_c') . '.png';
      file_put_contents($tmpFile, $imgData);
      try { $pdf->Image($tmpFile, 15, 263, 45, 20); } catch (Exception $e) {}
      @unlink($tmpFile);
    }
  }
  if ($sigTech && strpos($sigTech, 'data:image') === 0) {
    $base64 = explode(',', $sigTech)[1] ?? '';
    $imgData = base64_decode($base64);
    if ($imgData) {
      $tmpFile = tempnam(sys_get_temp_dir(), 'sig_sbin_t') . '.png';
      file_put_contents($tmpFile, $imgData);
      try { $pdf->Image($tmpFile, 155, 263, 45, 20); } catch (Exception $e) {}
      @unlink($tmpFile);
    }
  }
}

function renderSatisfactionPage($pdf, $d) {
  $dateStr = date('d/m/Y', strtotime($d['date'] ?? 'now'));
  $gabaritsDir = __DIR__ . '/../public/templates/gabarits';
  if (!is_dir($gabaritsDir)) {
    $gabaritsDir = __DIR__ . '/../templates/gabarits';
  }
  $satBg = $gabaritsDir . '/fiche_satisfaction_word.jpg';
  if (!file_exists($satBg)) {
    $satBg = $gabaritsDir . '/fiche_satisfaction_client.jpg';
  }
  $gabMaxW = mmToPxAtDpi(210, PDF_DPI);
  $gabMaxH = mmToPxAtDpi(297, PDF_DPI);

  $pdf->AddPage();
  if (file_exists($satBg)) {
    $pdf->Image(compressGabarit($satBg, $gabMaxW, $gabMaxH), 0, 0, 210, 297);
  }

  // --- Référence dossier / ticket ---
  $dossierRef = substr($d['id'] ?? '', 0, 8);
  if (!empty($d['numero_dossier'])) $dossierRef = $d['numero_dossier'];
  $pdf->drawHand(62, 38, $dossierRef, 10);

  // --- 1. Informations client ---
  $pdf->drawHand(95, 48, $d['nom_client'] ?? '', 9);
  $pdf->drawHand(95, 53, $d['telephone_ligne'] ?? $d['mobile'] ?? '', 9);
  $pdf->drawHand(95, 58, $d['adresse_zone'] ?? '', 9);

  // Type intervention
  $typeIntv = strtolower($d['type_intervention_satisfaction'] ?? 'installation');
  if ($typeIntv === 'sav') {
    $pdf->drawCheckboxHand(130, 63, true);
  } elseif ($typeIntv === 'maintenance') {
    $pdf->drawCheckboxHand(155, 63, true);
  } else {
    $pdf->drawCheckboxHand(100, 63, true);
  }
  $pdf->drawHand(95, 68, $dateStr, 9);

  // --- 2. Validation de l'intervention (cases Oui/Non) ---
  $validations = [
    $d['travaux_conformes'] ?? true,
    $d['emplacement_valide'] ?? true,
    $d['travail_propre'] ?? true,
    $d['service_teste'] ?? true,
    $d['service_fonctionne'] ?? true,
    $d['explications_donnees'] ?? true,
  ];
  $valY = [82, 87, 92, 97, 102, 107];
  $ouiX = 180;
  $nonX = 193;
  foreach ($validations as $i => $checked) {
    $pdf->drawCheckboxHand($checked ? $ouiX : $nonX, $valY[$i], true);
  }

  // Recommanderiez-vous
  $recom = $d['recommanderait'] ?? true;
  $pdf->drawCheckboxHand($recom ? $ouiX : $nonX, 112, true);

  // Recontacté
  $recont = $d['accepte_recontact'] ?? true;
  $pdf->drawCheckboxHand($recont ? $ouiX : $nonX, 117, true);

  // --- 3. Niveau de satisfaction ---
  $niveaux = ['Très satisfait', 'Satisfait', 'Peu satisfait', 'Insatisfait'];
  $satX = [122, 142, 162, 182];
  $satY = [132, 137, 142];
  $criteres = [
    $d['qualite'] ?? 'Satisfait',
    $d['delais'] ?? 'Satisfait',
    $d['professionnalisme'] ?? 'Satisfait',
  ];
  foreach ($criteres as $ci => $val) {
    foreach ($niveaux as $i => $niv) {
      if ($val === $niv) $pdf->drawCheckboxHand($satX[$i], $satY[$ci], true);
    }
  }

  // --- 4. Déclaration du client ---
  $pdf->drawHand(45, 155, $d['nom_client_declaration'] ?? $d['nom_client'] ?? '', 10);

  // --- 5. Remarque ---
  $remarque = $d['remarque_libre'] ?? '';
  $aucune = $d['remarque_aucune'] ?? (empty($remarque));
  if ($aucune || empty($remarque)) {
    $pdf->drawCheckboxHand(15, 243, true);
  } else {
    $pdf->drawCheckboxHand(15, 248, true);
    $pdf->drawHand(55, 249, $remarque, 9);
  }

  // Signatures Fiche Satisfaction
  $nomClient2 = $d['nom_client_declaration'] ?? $d['nom_client'] ?? '';
  $nomTech2 = $d['nom_technicien'] ?? '';
  if ($nomClient2) $pdf->drawHand(15, 275, $nomClient2, 9);
  if ($nomTech2) $pdf->drawHand(115, 275, $nomTech2, 9);

  $sigClient = $d['signature_client'] ?? null;
  $sigTech = $d['signature_technicien'] ?? null;
  if ($sigClient && strpos($sigClient, 'data:image') === 0) {
    $base64 = explode(',', $sigClient)[1] ?? '';
    $imgData = base64_decode($base64);
    if ($imgData) {
      $tmpFile = tempnam(sys_get_temp_dir(), 'sig_sat_c') . '.png';
      file_put_contents($tmpFile, $imgData);
      try { $pdf->Image($tmpFile, 55, 270, 35, 15); } catch (Exception $e) {}
      @unlink($tmpFile);
    }
  }
  if ($sigTech && strpos($sigTech, 'data:image') === 0) {
    $base64 = explode(',', $sigTech)[1] ?? '';
    $imgData = base64_decode($base64);
    if ($imgData) {
      $tmpFile = tempnam(sys_get_temp_dir(), 'sig_sat_t') . '.png';
      file_put_contents($tmpFile, $imgData);
      try { $pdf->Image($tmpFile, 165, 270, 35, 15); } catch (Exception $e) {}
      @unlink($tmpFile);
    }
  }
}

function generateSbinPDF($d) {
  $pdf = new ChaptechPDF();
  $pdf->SetAutoPageBreak(false);
  renderSbinPage($pdf, $d);
  return $pdf;
}

function generateSatisfactionPDF($d) {
  $pdf = new ChaptechPDF();
  $pdf->SetAutoPageBreak(false);
  renderSatisfactionPage($pdf, $d);
  return $pdf;
}

function generateFichesPDF($d) {
  $pdf = new ChaptechPDF();
  $pdf->SetAutoPageBreak(false);
  renderSbinPage($pdf, $d);
  renderSatisfactionPage($pdf, $d);
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
  if (!empty($d['debit_descendant'])) $tech[] = ['Debit Descendant (Wi-Fi)', $d['debit_descendant'] . ' Mb/s'];
  if (!empty($d['debit_montant'])) $tech[] = ['Debit Montant (Wi-Fi)', $d['debit_montant'] . ' Mb/s'];
  if (!empty($d['debit_ping'])) $tech[] = ['Latence / Ping (Wi-Fi)', $d['debit_ping'] . ' ms'];
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
    'ont' => 'ONT', 'pto' => 'PTO', 'jarretiere' => 'Jarretière',
    'piton' => 'Piton', 'cheville' => 'Cheville', 'connecteur' => 'Connecteur',
    'closer' => 'Closer', 'fibre_1fo' => 'Câble Fibre 1FO',
    'cpc_50' => 'Câble CPC 50', 'cpc_100' => 'Câble CPC 100',
    'cpc_150' => 'Câble CPC 150', 'cpc_200' => 'Câble CPC 200',
    'cpc_250' => 'Câble CPC 250', 'cpc_300' => 'Câble CPC 300',
    'cpc_350' => 'Câble CPC 350', 'crochets' => 'Crochets',
    'pince' => 'Pince', 'susp' => 'Suspente',
    'traverse_13t' => 'Traverse 13T', 'traverse_15t' => 'Traverse 15T'
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
    'ont' => 'ONT', 'pto' => 'PTO', 'jarretiere' => 'Jarretière',
    'piton' => 'Piton', 'cheville' => 'Cheville', 'connecteur' => 'Connecteur',
    'closer' => 'Closer', 'fibre_1fo' => 'Câble Fibre 1FO',
    'cpc_50' => 'Câble CPC 50', 'cpc_100' => 'Câble CPC 100',
    'cpc_150' => 'Câble CPC 150', 'cpc_200' => 'Câble CPC 200',
    'cpc_250' => 'Câble CPC 250', 'cpc_300' => 'Câble CPC 300',
    'cpc_350' => 'Câble CPC 350', 'crochets' => 'Crochets',
    'pince' => 'Pince', 'susp' => 'Suspente',
    'traverse_13t' => 'Traverse 13T', 'traverse_15t' => 'Traverse 15T'
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
/**
 * Liste des clients pour la clôture sur la plage [$moisDebut, $moisFin]
 * ('YYYY-MM' ; si $moisFin absent = un seul mois).
 * Colonnes : N° | Date | Nom client | N° de ligne.
 */
function generateListeMois($moisDebut, $moisFin = null) {
  if (!preg_match('/^\d{4}-\d{2}$/', $moisDebut) || strtotime($moisDebut . '-01') === false) return null;
  if ($moisFin === null || $moisFin === '') $moisFin = $moisDebut;
  if (!preg_match('/^\d{4}-\d{2}$/', $moisFin) || strtotime($moisFin . '-01') === false) return null;
  if ($moisFin < $moisDebut) { $t = $moisDebut; $moisDebut = $moisFin; $moisFin = $t; }
  $stmt = db()->prepare("SELECT date, nom_client, telephone_ligne, nom_technicien
    FROM interventions
    WHERE date >= ? AND date < ?
    ORDER BY date ASC, nom_client ASC");
  $stmt->execute([$moisDebut . '-01', date('Y-m-d', strtotime('first day of next month', strtotime($moisFin . '-01')))]);
  return $stmt->fetchAll();
}

function libellePlageMois($moisDebut, $moisFin = null) {
  $moisFr = ['01'=>'janvier','02'=>'février','03'=>'mars','04'=>'avril','05'=>'mai','06'=>'juin',
             '07'=>'juillet','08'=>'août','09'=>'septembre','10'=>'octobre','11'=>'novembre','12'=>'décembre'];
  $f = function ($m) use ($moisFr) { return ($moisFr[substr($m, 5, 2)] ?? substr($m, 5, 2)) . ' ' . substr($m, 0, 4); };
  if ($moisFin === null || $moisFin === '' || $moisFin === $moisDebut) return $f($moisDebut);
  return $f($moisDebut) . ' à ' . $f($moisFin);
}

function generateMoisPDF($moisDebut, $moisFin = null) {
  $lignes = generateListeMois($moisDebut, $moisFin);
  if ($lignes === null) return null;

  $pdf = new ChaptechPDF();
  $pdf->SetAutoPageBreak(true, 20);
  $pdf->AddPage();
  $pdf->SetFont('Helvetica', 'B', 14);
  $pdf->Cell(0, 10, pdfT("Liste des clients — " . libellePlageMois($moisDebut, $moisFin)), 0, 1, 'C');
  $pdf->Ln(4);

  // En-tête du tableau : N° | Date | Nom | N° de ligne
  $pdf->SetFont('Helvetica', 'B', 10);
  $pdf->SetFillColor(220, 230, 245);
  $pdf->Cell(15, 8, pdfT('N°'), 1, 0, 'C', true);
  $pdf->Cell(30, 8, 'Date', 1, 0, 'C', true);
  $pdf->Cell(85, 8, 'Nom', 1, 0, 'L', true);
  $pdf->Cell(60, 8, pdfT('N° de ligne'), 1, 1, 'C', true);

  $pdf->SetFont('Helvetica', '', 10);
  $fill = false;
  $pdf->SetFillColor(245, 247, 250);
  $n = 0;
  foreach ($lignes as $l) {
    $n++;
    $pdf->Cell(15, 7, $n, 1, 0, 'C', $fill);
    $pdf->Cell(30, 7, date('d/m/Y', strtotime($l['date'])), 1, 0, 'C', $fill);
    $pdf->Cell(85, 7, pdfT($l['nom_client'] ?? ''), 1, 0, 'L', $fill);
    $pdf->Cell(60, 7, pdfT($l['telephone_ligne'] ?? ''), 1, 1, 'C', $fill);
    $fill = !$fill;
  }
  if ($n === 0) {
    $pdf->SetFont('Helvetica', 'I', 10);
    $pdf->Cell(190, 8, pdfT('Aucune intervention sur cette période.'), 1, 1, 'C');
  }
  return $pdf;
}

/** Tableau HTML copiable (collage direct dans Excel / WhatsApp). */
function renderListeMoisHTML($moisDebut, $moisFin = null) {
  $lignes = generateListeMois($moisDebut, $moisFin);
  if ($lignes === null) { http_response_code(400); echo 'Mois invalide'; return; }
  $titre = libellePlageMois($moisDebut, $moisFin);
  header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Liste ', htmlspecialchars($titre), '</title>';
  echo '<style>body{font-family:sans-serif;padding:16px}table{border-collapse:collapse}td,th{border:1px solid #333;padding:4px 10px}th{background:#dde6f5}h1{font-size:18px}</style>';
  echo '<h1>Liste des clients — ', htmlspecialchars($titre), '</h1>';
  echo '<table><thead><tr><th>N°</th><th>Date</th><th>Nom</th><th>N° de ligne</th></tr></thead><tbody>';
  $n = 0;
  foreach ($lignes as $l) {
    $n++;
    echo '<tr><td>', $n, '</td><td>', date('d/m/Y', strtotime($l['date'])), '</td><td>',
         htmlspecialchars($l['nom_client'] ?? ''), '</td><td>',
         htmlspecialchars($l['telephone_ligne'] ?? ''), '</td></tr>';
  }
  if ($n === 0) echo '<tr><td colspan="4"><em>Aucune intervention ce mois-ci.</em></td></tr>';
  echo '</tbody></table></html>';
}

$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? '';
$__t0 = microtime(true);

try {
  requirePdfAuth();
  if ($action === 'liste_mois') {
    // Tableau HTML copiable : collage direct dans Excel/WhatsApp
    renderListeMoisHTML(trim($_GET['mois'] ?? date('Y-m')));
  } elseif ($action === 'pdf_mois') {
    $mois = trim($_GET['mois'] ?? date('Y-m'));
    $pdf = generateMoisPDF($mois);
    if (!$pdf) { http_response_code(400); echo json_encode(['error' => 'Mois invalide']); exit; }
    $filename = 'liste_' . $mois . '.pdf';
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Access-Control-Allow-Origin: *');
    $pdf->Output('D', $filename);
  } elseif ($action === 'pdf_mois_view') {
    $mois = trim($_GET['mois'] ?? date('Y-m'));
    $pdf = generateMoisPDF($mois);
    if (!$pdf) { http_response_code(400); echo json_encode(['error' => 'Mois invalide']); exit; }
    header('Content-Type: application/pdf');
    header('Access-Control-Allow-Origin: *');
    $pdf->Output('I');
  } elseif ($action === 'pdf_stock') {
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
    } elseif ($action === 'pdf_satisfaction') {
      $pdf = generateSatisfactionPDF($d);
      $filename = 'satisfaction_' . ($d['nom_client'] ?? $id) . '.pdf';
      header('Content-Type: application/pdf');
      header('Content-Disposition: attachment; filename="' . $filename . '"');
      header('Access-Control-Allow-Origin: *');
      $pdf->Output('D', $filename);
    } elseif ($action === 'pdf_satisfaction_view') {
      $pdf = generateSatisfactionPDF($d);
      header('Content-Type: application/pdf');
      header('Access-Control-Allow-Origin: *');
      $pdf->Output('I');
    } elseif ($action === 'pdf_sbin') {
      $pdf = generateSbinPDF($d);
      $filename = 'fiche_sbin_' . ($d['nom_client'] ?? $id) . '.pdf';
      header('Content-Type: application/pdf');
      header('Content-Disposition: attachment; filename="' . $filename . '"');
      header('Access-Control-Allow-Origin: *');
      $pdf->Output('D', $filename);
    } elseif ($action === 'pdf_sbin_view') {
      $pdf = generateSbinPDF($d);
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

error_log('[PDF] action=' . $action . ' id=' . $id . ' time=' . round((microtime(true) - $__t0) * 1000) . 'ms');
