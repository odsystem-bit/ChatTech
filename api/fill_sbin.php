<?php
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/_env.php';

use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\Element\Text;
use PhpOffice\PhpWord\Element\TextRun;
use PhpOffice\PhpWord\Element\Table;
use PhpOffice\PhpWord\Shared\Converter;

/**
 * Port PHP de fill_sbin.py — remplit le template Word Fiche_SBIN avec PHPWord.
 * Conversion PDF via Dompdf (pure PHP, aucun binaire externe requis).
 */

function clear_elements($element) {
    $ref = new \ReflectionClass($element);
    if ($ref->hasProperty('elements')) {
        $prop = $ref->getProperty('elements');
        $prop->setAccessible(true);
        $prop->setValue($element, []);
    }
}

function get_tables_from_phpword($phpWord) {
    $tables = [];
    foreach ($phpWord->getSections() as $section) {
        foreach ($section->getElements() as $el) {
            if ($el instanceof Table) {
                $tables[] = $el;
            }
        }
    }
    return $tables;
}

/**
 * Résout une signature en chemin de fichier utilisable par PHPWord.
 * Accepte soit un chemin de fichier existant, soit une data URL base64
 * (format stocké en BDD : "data:image/png;base64,....").
 * Retourne null si aucune image valide n'est trouvée.
 */
function resolve_signature_path($value) {
    if (!$value) {
        return null;
    }
    if (is_string($value) && strpos($value, 'data:image') === 0) {
        $parts = explode(',', $value, 2);
        $base64 = $parts[1] ?? '';
        $imgData = base64_decode($base64);
        if (!$imgData) {
            return null;
        }
        $ext = 'png';
        if (preg_match('#^data:image/(\w+)#', $value, $m)) {
            $ext = $m[1] === 'jpeg' ? 'jpg' : $m[1];
        }
        $tmpFile = tempnam(sys_get_temp_dir(), 'sig') . '.' . $ext;
        file_put_contents($tmpFile, $imgData);
        return $tmpFile;
    }
    if (is_string($value) && file_exists($value)) {
        return $value;
    }
    return null;
}

function set_cell_text($cell, $text, $hand = true, $align = null) {
    $elements = $cell->getElements();
    if (empty($elements)) {
        $p = $cell->addTextRun();
    } else {
        $p = $elements[0];
        if ($p instanceof TextRun) {
            clear_elements($p);
        } else {
            $p = $cell->addTextRun();
        }
    }

    if ($align !== null) {
        $pStyle = $p->getParagraphStyle();
        $pStyle->setAlignment($align);
    }

    $lines = explode("\n", $text);
    foreach ($lines as $i => $line) {
        if ($i > 0) {
            $p->addTextBreak();
        }
        if ($hand) {
            $p->addText($line, [
                'name' => 'Caveat',
                'size' => 15,
                'color' => '1B2A6B',
                'bold' => false,
            ]);
        } else {
            $p->addText($line, [
                'name' => 'Arial',
                'size' => 9,
            ]);
        }
    }
}

function fill_sbin_template($data) {
    $templatePath = __DIR__ . '/../templates/Fiche_SBIN_template_vierge.docx';
    if (!file_exists($templatePath)) {
        throw new Exception("Template SBIN introuvable: $templatePath");
    }

    $phpWord = IOFactory::load($templatePath);
    $tables = get_tables_from_phpword($phpWord);

    // Table 0 — Informations générales
    $t0 = $tables[0];
    set_cell_text($t0->getRows()[0]->getCells()[1], $data['date_intervention'] ?? '');
    set_cell_text($t0->getRows()[0]->getCells()[3], $data['client'] ?? '');

    // Row 1: cellule 0 fusionnée (Service FTTH/CUIVRE), cellule 2 = valeur Ligne
    $ftth = in_array($data['etat'] ?? '', ['PON', 'FTTH']) ? '☑' : '☐';
    $cuivre = ($data['etat'] ?? '') === 'Cuivre' ? '☑' : '☐';
    set_cell_text($t0->getRows()[1]->getCells()[0], "Service : FTTH  $ftth   CUIVRE  $cuivre", false);
    set_cell_text($t0->getRows()[1]->getCells()[2], $data['ligne'] ?? '');

    set_cell_text($t0->getRows()[2]->getCells()[1], $data['date_declaration'] ?? '');
    set_cell_text($t0->getRows()[2]->getCells()[3], $data['mobile'] ?? '');
    set_cell_text($t0->getRows()[3]->getCells()[1], $data['date_mise_service'] ?? '');
    set_cell_text($t0->getRows()[3]->getCells()[3], $data['mail'] ?? '');

    // Table 3 — Équipements
    $t3 = $tables[3];
    set_cell_text($t3->getRows()[0]->getCells()[1], $data['ont_sn'] ?? '');
    set_cell_text($t3->getRows()[1]->getCells()[1], (string)($data['pto_qte'] ?? ''));
    set_cell_text($t3->getRows()[2]->getCells()[1], (string)($data['repeteur_wifi_qte'] ?? ''));
    set_cell_text($t3->getRows()[3]->getCells()[1], $data['emplacement_ont'] ?? '');
    // Colonne OBSERVATION de la ligne "Emplacement de l'ONT" : contrôle data/voix
    set_cell_text($t3->getRows()[3]->getCells()[2], "DATA : OK\nVOIX : OK", false);

    // Table 5 — Offres
    $t5 = $tables[5];
    $offres = ['Fibre Pro', 'Fibre Pro Max', 'Fibre Pro Mega', 'Fibre Office Max', 'Fibre Office Mega'];
    $selected = $data['offre_souscrite'] ?? '';
    $remise_ok = $data['remise_equipement_ok'] ?? false;
    foreach ($offres as $i => $off) {
        $row = $t5->getRows()[$i + 1];
        $mark = $selected === $off ? '☑' : '☐';
        $padding = str_repeat(' ', max(0, 36 - strlen($off)));
        set_cell_text($row->getCells()[0], $off . $padding . $mark, false);
        if ($i > 0 && $selected === $off) {
            $oui = $remise_ok ? '☑' : '☐';
            $non = !$remise_ok ? '☑' : '☐';
            set_cell_text($row->getCells()[2], "$oui Oui       $non Non", false);
        }
    }

    // Table 7 — Matériel / Qualité
    $t7 = $tables[7];
    set_cell_text($t7->getRows()[0]->getCells()[1], $data['materiel_recupere'] ?? '');
    set_cell_text($t7->getRows()[2]->getCells()[1], (string)($data['rdv_manques'] ?? ''));
    set_cell_text($t7->getRows()[3]->getCells()[1], (string)($data['qualite_note'] ?? ''));

    // Appréciation générale (paragraphe du corps)
    foreach ($phpWord->getSections() as $section) {
        foreach ($section->getElements() as $el) {
            if ($el instanceof TextRun) {
                $fullText = '';
                foreach ($el->getElements() as $run) {
                    if ($run instanceof Text) {
                        $fullText .= $run->getText();
                    }
                }
                if (strpos($fullText, 'Appréciation générale') === 0) {
                    clear_elements($el);
                    $el->addText("Appréciation générale du client " . ($data['appreciation_generale'] ?? '') . " /10");
                }
            }
        }
    }

    // Table 6 — Hauteur fixe lignes vides
    $t6 = $tables[6];
    $rows6 = $t6->getRows();
    for ($r = 1; $r < count($rows6); $r++) {
        $row = $rows6[$r];
        $rowStyle = $row->getStyle();
        $rowStyle->setExactHeight(true);
        $ref = new \ReflectionClass($row);
        $prop = $ref->getProperty('height');
        $prop->setAccessible(true);
        $prop->setValue($row, Converter::pointToTwip(22));
    }

    // Table 8 — Hauteur fixe
    $t8 = $tables[8];
    $rows8 = $t8->getRows();
    for ($r = 1; $r < count($rows8); $r++) {
        $row = $rows8[$r];
        $rowStyle = $row->getStyle();
        $rowStyle->setExactHeight(true);
        $ref = new \ReflectionClass($row);
        $prop = $ref->getProperty('height');
        $prop->setAccessible(true);
        $prop->setValue($row, Converter::pointToTwip(14));
    }

    // Table 9 — Signatures (noms + images)
    $t9 = $tables[9];
    $newRow = $t9->addRow();
    // PHPWord addRow() ne crée pas de cellules automatiquement
    $newRow->addCell();
    $newRow->addCell();
    set_cell_text($newRow->getCells()[0], $data['nom_client_declaration'] ?? '', true, 'left');
    set_cell_text($newRow->getCells()[1], $data['nom_technicien'] ?? '', true, 'right');

    // Images signatures (chemin de fichier OU data URL base64 stockée en BDD)
    $sigClient = resolve_signature_path($data['signature_client_path'] ?? ($data['signature_client'] ?? null));
    $sigTech = resolve_signature_path($data['signature_technicien_path'] ?? ($data['signature_technicien'] ?? null));

    if ($sigClient) {
        $cell = $newRow->getCells()[0];
        $p = $cell->addTextRun(['alignment' => 'left']);
        $p->addImage($sigClient, [
            'width' => Converter::pointToPixel(90),
            'height' => Converter::pointToPixel(45),
        ]);
    }
    if ($sigTech) {
        $cell = $newRow->getCells()[1];
        $p = $cell->addTextRun(['alignment' => 'right']);
        $p->addImage($sigTech, [
            'width' => Converter::pointToPixel(90),
            'height' => Converter::pointToPixel(45),
        ]);
    }

    return $phpWord;
}

function generate_sbin_pdf($data) {
    $phpWord = fill_sbin_template($data);

    $tmpDir = sys_get_temp_dir();
    $uniq = uniqid();
    $docxPath = $tmpDir . '/fiche_sbin_remplie_' . $uniq . '.docx';
    $pdfPath = $tmpDir . '/fiche_sbin_remplie_' . $uniq . '.pdf';

    // Sauvegarder le docx rempli (référence / archive)
    $writer = IOFactory::createWriter($phpWord, 'Word2007');
    $writer->save($docxPath);
    @unlink($docxPath);

    // Génère le HTML via PHPWord puis injecte @font-face pour Caveat
    // (PHPWord ne permet pas d'enregistrer une police custom auprès de Dompdf,
    // on contourne donc son writer PDF pour ajouter le CSS nous-mêmes).
    $htmlWriter = IOFactory::createWriter($phpWord, 'HTML');
    $html = $htmlWriter->getContent();

    $caveatPath = __DIR__ . '/fonts/Caveat-Regular.ttf';
    if (file_exists($caveatPath)) {
        $caveatBase64 = base64_encode(file_get_contents($caveatPath));
        $fontFace = '<style>@font-face { font-family: "Caveat"; src: url(data:font/ttf;base64,' . $caveatBase64 . ') format("truetype"); font-weight: normal; font-style: normal; }</style>';
        // Injecter juste avant </head> si présent, sinon avant le premier tag
        if (stripos($html, '</head>') !== false) {
            $html = preg_replace('/<\/head>/i', $fontFace . '</head>', $html, 1);
        } else {
            $html = $fontFace . $html;
        }
    }

    $options = new \Dompdf\Options();
    $options->set('isRemoteEnabled', true);
    $options->set('isHtml5ParserEnabled', true);
    $options->set('fontDir', __DIR__ . '/vendor/dompdf/dompdf/lib/fonts/');
    $options->set('fontCache', __DIR__ . '/vendor/dompdf/dompdf/lib/fonts/');

    $dompdf = new \Dompdf\Dompdf($options);
    $dompdf->loadHtml(str_replace(PHP_EOL, '', $html));
    $dompdf->setPaper('a4', 'portrait');
    $dompdf->render();

    file_put_contents($pdfPath, $dompdf->output());

    return $pdfPath;
}

// Test / route API
if (php_sapi_name() === 'cli' || isset($_GET['test'])) {
    $data = [
        'date_intervention' => date('d/m/Y'),
        'client' => 'AGBOKOUNOU MAHUTIN Amélie',
        'etat' => 'PON',
        'ligne' => '0121282049',
        'date_declaration' => date('d/m/Y'),
        'mobile' => '0166849657',
        'date_mise_service' => date('d/m/Y'),
        'mail' => 'client@example.com',
        'ont_sn' => 'FC18038BFC87-97(17)',
        'pto_qte' => 1,
        'repeteur_wifi_qte' => 0,
        'emplacement_ont' => "Salon, pres de la porte d'entree",
        'offre_souscrite' => 'Fibre Pro Max',
        'remise_equipement_ok' => true,
        'materiel_recupere' => '',
        'rdv_manques' => '',
        'qualite_note' => '',
        'appreciation_generale' => '',
        'nom_client_declaration' => 'AGBOKOUNOU MAHUTIN Amelie',
        'nom_technicien' => 'STANISLAS',
        'signature_client_path' => null,
        'signature_technicien_path' => null,
    ];

    try {
        $pdfPath = generate_sbin_pdf($data);
        if (php_sapi_name() === 'cli') {
            echo "PDF généré: $pdfPath\n";
            echo "Taille: " . filesize($pdfPath) . " octets\n";
        } else {
            header('Content-Type: application/pdf');
            header('Content-Disposition: inline; filename="Fiche_SBIN.pdf"');
            readfile($pdfPath);
            @unlink($pdfPath);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo "Erreur: " . $e->getMessage() . "\n";
        if (php_sapi_name() === 'cli') {
            echo $e->getTraceAsString() . "\n";
        }
    }
}
