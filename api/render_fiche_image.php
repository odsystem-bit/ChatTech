<?php
// Moteur de rendu image pour les fiches d'intervention (GD)
// Remplace le système tFPDF par un rendu pixel-exact sur gabarits JPG

require_once __DIR__ . '/config/calibration.php';

class FicheImageRenderer {
    private $config;
    private $font;
    private $fontSize;
    private $textColor;
    private $checkboxColor;
    private $baselineOffset;
    
    public function __construct() {
        $this->config = require __DIR__ . '/config/calibration.php';
        $this->font = $this->config['font'];
        $this->fontSize = $this->config['font_size'];
        $this->textColor = $this->config['text_color'];
        $this->checkboxColor = $this->config['checkbox_color'];
        $this->baselineOffset = $this->config['baseline_offset'] ?? 0;
    }
    
    /**
     * Convertir une couleur RGB en ressource GD
     */
    private function allocateColor($image, $rgb) {
        return imagecolorallocate($image, $rgb[0], $rgb[1], $rgb[2]);
    }
    
    /**
     * Dessiner du texte à une position donnée
     */
    private function drawText($image, $text, $x, $y, $color = null) {
        if ($color === null) {
            $color = $this->allocateColor($image, $this->textColor);
        }
        // Appliquer l'offset de ligne de base pour aligner le texte avec les cases
        $y += $this->baselineOffset;
        imagettftext($image, $this->fontSize, 0, $x, $y, $color, $this->font, $text);
    }
    
    /**
     * Dessiner un X dans une case à cocher
     */
    private function drawCheckbox($image, $x, $y, $checked) {
        if (!$checked) return;
        
        $color = $this->allocateColor($image, $this->checkboxColor);
        $size = $this->config['checkbox_size'];
        
        // Dessiner un X
        imageline($image, $x, $y, $x + $size, $y + $size, $color);
        imageline($image, $x + $size, $y, $x, $y + $size, $color);
    }
    
    /**
     * Insérer une signature Base64 PNG sur l'image
     */
    private function drawSignature($image, $base64, $x, $y, $width, $height) {
        if (empty($base64)) return;
        
        // Extraire les données Base64 (avec ou sans préfixe data:image)
        if (preg_match('/^data:image\/\w+;base64,/', $base64)) {
            $base64 = substr($base64, strpos($base64, ',') + 1);
        }
        
        $data = base64_decode($base64);
        if ($data === false) return;
        
        $sigImage = imagecreatefromstring($data);
        if ($sigImage === false) return;
        
        // Redimensionner si nécessaire
        $sigWidth = imagesx($sigImage);
        $sigHeight = imagesy($sigImage);
        
        if ($sigWidth > $width || $sigHeight > $height) {
            $ratio = min($width / $sigWidth, $height / $sigHeight);
            $newWidth = (int)($sigWidth * $ratio);
            $newHeight = (int)($sigHeight * $ratio);
            
            $resized = imagecreatetruecolor($newWidth, $newHeight);
            imagealphablending($resized, false);
            imagesavealpha($resized, true);
            imagecopyresampled($resized, $sigImage, 0, 0, 0, 0, $newWidth, $newHeight, $sigWidth, $sigHeight);
            imagedestroy($sigImage);
            $sigImage = $resized;
        }
        
        $blueSignature = imagecreatetruecolor(imagesx($sigImage), imagesy($sigImage));
        imagealphablending($blueSignature, false);
        imagesavealpha($blueSignature, true);
        $transparent = imagecolorallocatealpha($blueSignature, 255, 255, 255, 127);
        $blue = imagecolorallocate($blueSignature, 0, 70, 190);
        imagefill($blueSignature, 0, 0, $transparent);
        for ($py = 0; $py < imagesy($sigImage); $py++) {
            for ($px = 0; $px < imagesx($sigImage); $px++) {
                $rgb = imagecolorat($sigImage, $px, $py);
                $red = ($rgb >> 16) & 0xFF;
                $green = ($rgb >> 8) & 0xFF;
                $blueValue = $rgb & 0xFF;
                $brightness = ($red + $green + $blueValue) / 3;
                if ($brightness < 245) imagesetpixel($blueSignature, $px, $py, $blue);
            }
        }
        imagealphablending($blueSignature, true);
        imagecopy($image, $blueSignature, $x, $y, 0, 0, imagesx($blueSignature), imagesy($blueSignature));
        imagedestroy($blueSignature);
        imagedestroy($sigImage);
    }

    private function scaleConfig($value, $scaleX, $scaleY, $key = '') {
        if (!is_array($value)) {
            if (in_array($key, ['x', 'width'], true)) return (int)round($value * $scaleX);
            if (in_array($key, ['y', 'height'], true)) return (int)round($value * $scaleY);
            return $value;
        }
        $scaled = [];
        foreach ($value as $childKey => $childValue) {
            $scaled[$childKey] = $this->scaleConfig($childValue, $scaleX, $scaleY, $childKey);
        }
        return $scaled;
    }
    
    /**
     * Rendre la page SBIN (Page 1)
     */
    public function renderSbin($data) {
        $config = $this->config['sbin'];
        $image = imagecreatefromjpeg($config['image']);
        if ($image === false) {
            throw new Exception("Impossible de charger le gabarit SBIN");
        }

        $scaleX = imagesx($image) / 1654;
        $scaleY = imagesy($image) / 2339;
        $config = $this->scaleConfig($config, $scaleX, $scaleY);
        $oldFontSize = $this->fontSize;
        $oldCheckboxSize = $this->config['checkbox_size'];
        $oldBaselineOffset = $this->baselineOffset;
        $this->fontSize = (int)round($oldFontSize * $scaleX);
        $this->config['checkbox_size'] = (int)round($oldCheckboxSize * $scaleX);
        $this->baselineOffset = (int)round($oldBaselineOffset * $scaleY);
        
        $color = $this->allocateColor($image, $this->textColor);
        
        // En-tête
        $this->drawText($image, $data['date'] ?? '', $config['header']['date']['x'], $config['header']['date']['y'], $color);
        
        // Client
        $this->drawText($image, $data['nom_client'] ?? '', $config['client']['nom_client']['x'], $config['client']['nom_client']['y'], $color);
        $this->drawText($image, $data['telephone_ligne'] ?? '', $config['client']['telephone_ligne']['x'], $config['client']['telephone_ligne']['y'], $color);
        $this->drawText($image, $data['mobile'] ?? '', $config['client']['mobile']['x'], $config['client']['mobile']['y'], $color);
        
        // État (checkboxes)
        $etat = $data['etat'] ?? '';
        $this->drawCheckbox($image, $config['etat']['ftth']['x'], $config['etat']['ftth']['y'], $etat === 'PON' || $etat === 'FTTH');
        $this->drawCheckbox($image, $config['etat']['cuivre']['x'], $config['etat']['cuivre']['y'], $etat === 'Cuivre');
        
        $this->drawText($image, $data['ont_sn'] ?? ($data['sn'] ?? ''), $config['installation']['ont_sn']['x'], $config['installation']['ont_sn']['y'], $color);
        $this->drawText($image, $data['pto_qte'] ?? '', $config['installation']['pto_qte']['x'], $config['installation']['pto_qte']['y'], $color);
        $this->drawText($image, $data['repeteur_wifi_qte'] ?? '', $config['installation']['repeteur_qte']['x'], $config['installation']['repeteur_qte']['y'], $color);
        $this->drawText($image, $data['emplacement_ont'] ?? '', $config['installation']['emplacement_ont']['x'], $config['installation']['emplacement_ont']['y'], $color);
        $this->drawSignature($image, $data['signature_client'] ?? '',
            $config['signatures']['client']['x'], $config['signatures']['client']['y'],
            $config['signatures']['client']['width'], $config['signatures']['client']['height']);
        $this->drawSignature($image, $data['signature_technicien'] ?? '',
            $config['signatures']['technicien']['x'], $config['signatures']['technicien']['y'],
            $config['signatures']['technicien']['width'], $config['signatures']['technicien']['height']);
        
        // Offres (checkboxes Oui/Non)
        $remiseOk = !empty($data['remise_equipement_ok']);
        $this->drawCheckbox($image, $config['offres']['checkboxes']['promax_oui']['x'], $config['offres']['checkboxes']['promax_oui']['y'], $remiseOk);
        $this->drawCheckbox($image, $config['offres']['checkboxes']['promax_non']['x'], $config['offres']['checkboxes']['promax_non']['y'], !$remiseOk);
        $this->drawCheckbox($image, $config['offres']['checkboxes']['promega_oui']['x'], $config['offres']['checkboxes']['promega_oui']['y'], $remiseOk);
        $this->drawCheckbox($image, $config['offres']['checkboxes']['promega_non']['x'], $config['offres']['checkboxes']['promega_non']['y'], !$remiseOk);
        $this->drawCheckbox($image, $config['offres']['checkboxes']['offmax_oui']['x'], $config['offres']['checkboxes']['offmax_oui']['y'], $remiseOk);
        $this->drawCheckbox($image, $config['offres']['checkboxes']['offmax_non']['x'], $config['offres']['checkboxes']['offmax_non']['y'], !$remiseOk);
        $this->drawCheckbox($image, $config['offres']['checkboxes']['offmega_oui']['x'], $config['offres']['checkboxes']['offmega_oui']['y'], $remiseOk);
        $this->drawCheckbox($image, $config['offres']['checkboxes']['offmega_non']['x'], $config['offres']['checkboxes']['offmega_non']['y'], !$remiseOk);
        
        // Constats
        $this->drawText($image, $data['emplacement_ont'] ?? '', $config['constats']['emplacement_ont']['x'], $config['constats']['emplacement_ont']['y'], $color);
        $this->drawCheckbox($image, $config['constats']['client_confirme_oui']['x'], $config['constats']['client_confirme_oui']['y'], !empty($data['client_confirme_emplacement']));
        $this->drawCheckbox($image, $config['constats']['client_confirme_non']['x'], $config['constats']['client_confirme_non']['y'], empty($data['client_confirme_emplacement']));
        $this->drawText($image, $data['pto_qte'] ?? '', $config['constats']['pto_qte']['x'], $config['constats']['pto_qte']['y'], $color);
        $this->drawText($image, $data['repeteur_wifi_qte'] ?? '', $config['constats']['repeteur_qte']['x'], $config['constats']['repeteur_qte']['y'], $color);
        
        $this->fontSize = $oldFontSize;
        $this->config['checkbox_size'] = $oldCheckboxSize;
        $this->baselineOffset = $oldBaselineOffset;
        return $image;
    }
    
    /**
     * Rendre la page Satisfaction (Page 2)
     */
    public function renderSatisfaction($data) {
        $config = $this->config['satisfaction'];
        $image = imagecreatefromjpeg($config['image']);
        if ($image === false) {
            throw new Exception("Impossible de charger le gabarit Satisfaction");
        }
        
        $color = $this->allocateColor($image, $this->textColor);
        
        // En-tête
        $this->drawText($image, $data['date'] ?? '', $config['header']['date']['x'], $config['header']['date']['y'], $color);
        $this->drawText($image, $data['nom_client'] ?? '', $config['header']['nom_client']['x'], $config['header']['nom_client']['y'], $color);
        $this->drawText($image, $data['telephone_ligne'] ?? '', $config['header']['telephone']['x'], $config['header']['telephone']['y'], $color);
        $this->drawText($image, $data['adresse_zone'] ?? '', $config['header']['adresse']['x'], $config['header']['adresse']['y'], $color);
        
        // Remarque libre
        $remarque = $data['remarque_libre'] ?? '';
        if (!empty($remarque)) {
            // Découper le texte en lignes
            $maxWidth = $config['remarque_libre']['width'];
            $lines = $this->wrapText($remarque, $maxWidth);
            $y = $config['remarque_libre']['y'];
            foreach ($lines as $line) {
                $this->drawText($image, $line, $config['remarque_libre']['x'], $y, $color);
                $y += $this->fontSize + 5;
            }
        }
        
        // Tableau Satisfaction
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['travaux_conformes_oui']['x'], $config['satisfaction']['checkboxes']['travaux_conformes_oui']['y'], !empty($data['travaux_conformes']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['travaux_conformes_non']['x'], $config['satisfaction']['checkboxes']['travaux_conformes_non']['y'], empty($data['travaux_conformes']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['emplacement_valide_oui']['x'], $config['satisfaction']['checkboxes']['emplacement_valide_oui']['y'], !empty($data['emplacement_valide']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['emplacement_valide_non']['x'], $config['satisfaction']['checkboxes']['emplacement_valide_non']['y'], empty($data['emplacement_valide']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['travail_propre_oui']['x'], $config['satisfaction']['checkboxes']['travail_propre_oui']['y'], !empty($data['travail_propre']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['travail_propre_non']['x'], $config['satisfaction']['checkboxes']['travail_propre_non']['y'], empty($data['travail_propre']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['service_teste_oui']['x'], $config['satisfaction']['checkboxes']['service_teste_oui']['y'], !empty($data['service_teste']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['service_teste_non']['x'], $config['satisfaction']['checkboxes']['service_teste_non']['y'], empty($data['service_teste']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['service_fonctionne_oui']['x'], $config['satisfaction']['checkboxes']['service_fonctionne_oui']['y'], !empty($data['service_fonctionne']));
        $this->drawCheckbox($image, $config['satisfaction']['checkboxes']['service_fonctionne_non']['x'], $config['satisfaction']['checkboxes']['service_fonctionne_non']['y'], empty($data['service_fonctionne']));
        
        // Qualité/Délais/Professionnalisme
        $this->drawText($image, $data['qualite'] ?? '', $config['qualite']['qualite']['x'], $config['qualite']['qualite']['y'], $color);
        $this->drawText($image, $data['delais'] ?? '', $config['qualite']['delais']['x'], $config['qualite']['delais']['y'], $color);
        $this->drawText($image, $data['professionnalisme'] ?? '', $config['qualite']['professionnalisme']['x'], $config['qualite']['professionnalisme']['y'], $color);
        
        // Explications données
        $this->drawCheckbox($image, $config['explications_donnees']['oui']['x'], $config['explications_donnees']['oui']['y'], !empty($data['explications_donnees']));
        $this->drawCheckbox($image, $config['explications_donnees']['non']['x'], $config['explications_donnees']['non']['y'], empty($data['explications_donnees']));
        
        // Recommanderait
        $this->drawCheckbox($image, $config['recommanderait']['oui']['x'], $config['recommanderait']['oui']['y'], !empty($data['recommanderait']));
        $this->drawCheckbox($image, $config['recommanderait']['non']['x'], $config['recommanderait']['non']['y'], empty($data['recommanderait']));
        
        // Accepte recontact
        $this->drawCheckbox($image, $config['accepte_recontact']['oui']['x'], $config['accepte_recontact']['oui']['y'], !empty($data['accepte_recontact']));
        $this->drawCheckbox($image, $config['accepte_recontact']['non']['x'], $config['accepte_recontact']['non']['y'], empty($data['accepte_recontact']));
        
        // Signatures
        $this->drawSignature($image, $data['signature_client'] ?? '', 
            $config['signatures']['client']['x'], $config['signatures']['client']['y'],
            $config['signatures']['client']['width'], $config['signatures']['client']['height']);
        $this->drawSignature($image, $data['signature_technicien'] ?? '', 
            $config['signatures']['technicien']['x'], $config['signatures']['technicien']['y'],
            $config['signatures']['technicien']['width'], $config['signatures']['technicien']['height']);
        
        // Nom client déclaration
        $this->drawText($image, $data['nom_client_declaration'] ?? '', $config['nom_client_declaration']['x'], $config['nom_client_declaration']['y'], $color);
        
        return $image;
    }
    
    /**
     * Découper un texte en lignes pour tenir dans une largeur donnée
     */
    private function wrapText($text, $maxWidth) {
        $lines = [];
        $words = explode(' ', $text);
        $currentLine = '';
        
        foreach ($words as $word) {
            $testLine = $currentLine ? $currentLine . ' ' . $word : $word;
            $bbox = imagettfbbox($this->fontSize, 0, $this->font, $testLine);
            $width = $bbox[2] - $bbox[0];
            
            if ($width <= $maxWidth) {
                $currentLine = $testLine;
            } else {
                if ($currentLine) {
                    $lines[] = $currentLine;
                }
                $currentLine = $word;
            }
        }
        
        if ($currentLine) {
            $lines[] = $currentLine;
        }
        
        return $lines;
    }
    
    /**
     * Convertir une image GD en PNG
     */
    public function toPng($image) {
        ob_start();
        imagepng($image);
        return ob_get_clean();
    }
    
    /**
     * Convertir une image GD en JPEG
     */
    public function toJpeg($image, $quality = 90) {
        ob_start();
        imagejpeg($image, null, $quality);
        return ob_get_clean();
    }
    
    /**
     * Nettoyer une ressource image GD
     */
    public function destroy($image) {
        if ($image !== false) {
            imagedestroy($image);
        }
    }
}
