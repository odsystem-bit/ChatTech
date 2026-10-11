<?php
$gabaritDir = __DIR__ . '/../../public/templates/gabarits';
if (!is_dir($gabaritDir)) $gabaritDir = __DIR__ . '/../../templates/gabarits';
// Configuration des coordonnées pixel pour le rendu image des fiches d'intervention
// Gabarits: fiche_sbin_word.jpg (1654x2339), fiche_satisfaction_word.jpg (1654x2339)
// Police: Caveat-Regular.ttf (manuscrite bleue)

return [
    // Configuration générale
    'font' => __DIR__ . '/../fonts/Caveat-Regular.ttf',
    'font_size' => 20,
    'text_color' => [0, 0, 255], // Bleu manuscrit RGB
    'checkbox_color' => [0, 0, 255], // Bleu pour les X
    'checkbox_size' => 12,
    'baseline_offset' => 18, // Offset pour la ligne de base du texte
    
    // === FICHE SBIN (Page 1) ===
    'sbin' => [
        'image' => $gabaritDir . '/fiche_sbin_word.jpg',
        
        // En-tête (lignes 139-280) - ajustées pour centrer dans les cases
        'header' => [
            'date' => ['x' => 430, 'y' => 405],
        ],
        
        // Client (lignes 328-530) - ajustées
        'client' => [
            'nom_client' => ['x' => 1210, 'y' => 405],
            'telephone_ligne' => ['x' => 1210, 'y' => 455],
            'mobile' => ['x' => 1210, 'y' => 500],
        ],
        
        // État (checkboxes FTTH/CUIVRE) - positions des cases
        'etat' => [
            'ftth' => ['x' => 290, 'y' => 450],
            'cuivre' => ['x' => 405, 'y' => 450],
        ],

        'installation' => [
            'ont_sn' => ['x' => 620, 'y' => 610],
            'pto_qte' => ['x' => 620, 'y' => 650],
            'repeteur_qte' => ['x' => 620, 'y' => 690],
            'emplacement_ont' => ['x' => 1090, 'y' => 760],
        ],

        'signatures' => [
            'client' => ['x' => 180, 'y' => 2040, 'width' => 620, 'height' => 150],
            'technicien' => ['x' => 1020, 'y' => 2040, 'width' => 500, 'height' => 150],
        ],
        
        // MSAN/FAT/Port - ajustées
        'msan' => ['x' => 430, 'y' => 565],
        'fat_ref' => ['x' => 430, 'y' => 610],
        'port' => ['x' => 430, 'y' => 655],
        'port_disponible' => ['x' => 430, 'y' => 700],
        
        // Type câble (checkboxes)
        'type_cable' => [
            'ftth' => ['x' => 131, 'y' => 760],
            'cuivre' => ['x' => 195, 'y' => 760],
        ],
        
        // Distances - ajustées
        'depart_m' => ['x' => 430, 'y' => 805],
        'arrivee_m' => ['x' => 430, 'y' => 850],
        'lineaire_m' => ['x' => 430, 'y' => 895],
        
        // Équipements - ajustées
        'mac' => ['x' => 430, 'y' => 940],
        'sn' => ['x' => 430, 'y' => 985],
        'ont_sn' => ['x' => 430, 'y' => 1030],
        
        // Poteaux - ajustées
        'nb_poteaux_traverses' => ['x' => 430, 'y' => 1075],
        'nb_poteaux_implantes' => ['x' => 430, 'y' => 1120],
        
        // Tableau Offres (lignes 1028-1164) - ajustées
        'offres' => [
            'rows' => [
                'promax' => 1028,
                'promega' => 1055,
                'offmax' => 1083,
                'offmega' => 1111,
            ],
            'cols' => [
                'offre' => 139,
                'resultat_oui' => 1324,
                'resultat_non' => 1371,
            ],
            'checkboxes' => [
                'promax_oui' => ['x' => 1324, 'y' => 1027],
                'promax_non' => ['x' => 1371, 'y' => 1027],
                'promega_oui' => ['x' => 1324, 'y' => 1054],
                'promega_non' => ['x' => 1371, 'y' => 1054],
                'offmax_oui' => ['x' => 1324, 'y' => 1082],
                'offmax_non' => ['x' => 1371, 'y' => 1082],
                'offmega_oui' => ['x' => 1324, 'y' => 1110],
                'offmega_non' => ['x' => 1371, 'y' => 1110],
            ],
        ],
        
        // Tableau Constats (lignes 1218-1703) - ajustées
        'constats' => [
            'rows' => [
                'emplacement_ont' => 1218,
                'client_confirme' => 1265,
                'pto_qte' => 1294,
                'repeteur_qte' => 1438,
            ],
            'cols' => [
                'label' => 585,
                'valeur' => 891,
                'oui' => 911,
                'non' => 1066,
            ],
            'emplacement_ont' => ['x' => 891, 'y' => 1227],
            'client_confirme_oui' => ['x' => 911, 'y' => 1274],
            'client_confirme_non' => ['x' => 1066, 'y' => 1274],
            'pto_qte' => ['x' => 891, 'y' => 1303],
            'repeteur_qte' => ['x' => 891, 'y' => 1447],
        ],
        
        // Bas de page 1 - ajusté
        'offre_souscrite' => ['x' => 430, 'y' => 1735],
    ],
    
    // === FICHE SATISFACTION (Page 2) ===
    'satisfaction' => [
        'image' => $gabaritDir . '/fiche_satisfaction_client.jpg',
        
        // En-tête - ajustées
        'header' => [
            'date' => ['x' => 1040, 'y' => 860],
            'nom_technicien' => ['x' => 1040, 'y' => 0],
            'nom_client' => ['x' => 1040, 'y' => 650],
            'telephone' => ['x' => 1040, 'y' => 705],
            'adresse' => ['x' => 1040, 'y' => 758],
        ],
        
        // Remarque libre (ligne 1752) - ajustée
        'remarque_libre' => [
            'x' => 250,
            'y' => 3010,
            'width' => 1350,
            'height' => 120,
        ],
        
        // Tableau Satisfaction (lignes 1900-2200) - ajustées
        'satisfaction' => [
            'rows' => [
                'travaux_conformes' => 1900,
                'emplacement_valide' => 1938,
                'travail_propre' => 1976,
                'service_teste' => 2014,
                'service_fonctionne' => 2052,
            ],
            'cols' => [
                'label' => 250,
                'oui' => 839,
                'non' => 1100,
            ],
            'checkboxes' => [
                'travaux_conformes_oui' => ['x' => 1980, 'y' => 1084],
                'travaux_conformes_non' => ['x' => 2075, 'y' => 1084],
                'emplacement_valide_oui' => ['x' => 1980, 'y' => 1141],
                'emplacement_valide_non' => ['x' => 2075, 'y' => 1141],
                'travail_propre_oui' => ['x' => 1980, 'y' => 1198],
                'travail_propre_non' => ['x' => 2075, 'y' => 1198],
                'service_teste_oui' => ['x' => 1980, 'y' => 1255],
                'service_teste_non' => ['x' => 2075, 'y' => 1255],
                'service_fonctionne_oui' => ['x' => 1980, 'y' => 1312],
                'service_fonctionne_non' => ['x' => 2075, 'y' => 1312],
            ],
        ],
        
        // Qualité/Délais/Professionnalisme (lignes 2061-2132) - ajustées
        'qualite' => [
            'rows' => [
                'qualite' => 2061,
                'delais' => 2101,
                'professionnalisme' => 2132,
            ],
            'cols' => [
                'label' => 250,
                'valeur' => 839,
            ],
            'qualite' => ['x' => 891, 'y' => 1651],
            'delais' => ['x' => 891, 'y' => 1710],
            'professionnalisme' => ['x' => 891, 'y' => 1762],
        ],
        
        // Explications données (checkbox) - ajusté
        'explications_donnees' => [
            'oui' => ['x' => 1980, 'y' => 1369],
            'non' => ['x' => 2075, 'y' => 1369],
        ],
        
        // Recommanderait (checkbox) - ajusté
        'recommanderait' => [
            'oui' => ['x' => 1980, 'y' => 1424],
            'non' => ['x' => 2075, 'y' => 1424],
        ],
        
        // Accepte recontact (checkbox) - ajusté
        'accepte_recontact' => [
            'oui' => ['x' => 1980, 'y' => 1460],
            'non' => ['x' => 2075, 'y' => 1460],
        ],
        
        // Signatures (ligne 2244) - ajustées
        'signatures' => [
            'client' => ['x' => 250, 'y' => 3150, 'width' => 900, 'height' => 140],
            'technicien' => ['x' => 1280, 'y' => 3150, 'width' => 900, 'height' => 140],
        ],
        
        // Nom client déclaration - ajusté
        'nom_client_declaration' => ['x' => 500, 'y' => 2940],
    ],
];
