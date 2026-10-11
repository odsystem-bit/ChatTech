<?php
require_once __DIR__ . '/../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;

$excelFile = '/home/yanou-stan/FibreTrack_templates/GS BTP 090926.xlsx';

try {
    $spreadsheet = IOFactory::load($excelFile);
    $sheetNames = $spreadsheet->getSheetNames();
    
    echo "Feuilles dans le fichier Excel:\n";
    foreach ($sheetNames as $index => $name) {
        echo ($index + 1) . ". $name\n";
    }
    
    echo "\nDétails de chaque feuille:\n";
    foreach ($sheetNames as $name) {
        $sheet = $spreadsheet->getSheetByName($name);
        $highestRow = $sheet->getHighestRow();
        $highestColumn = $sheet->getHighestColumn();
        echo "\n--- Feuille: $name ---\n";
        echo "Dimensions: $highestRow lignes x $highestColumn colonnes\n";
        
        // Afficher les 5 premières lignes
        echo "Premières lignes:\n";
        for ($row = 1; $row <= min(5, $highestRow); $row++) {
            $rowData = [];
            for ($col = 'A'; $col <= $highestColumn; $col++) {
                $cellValue = $sheet->getCell($col . $row)->getValue();
                $rowData[] = $cellValue;
            }
            echo "Ligne $row: " . implode(' | ', $rowData) . "\n";
        }
    }
    
} catch (Exception $e) {
    echo "Erreur: " . $e->getMessage() . "\n";
}
