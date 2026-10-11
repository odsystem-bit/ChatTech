<?php
// Stock réel de référence par période (saisi à partir de la feuille papier).
// restant_avant_sorties = initial + recu ; le stock final se déduit en
// retranchant le TOTAL des sorties clients de la période.
return [
    [
        'debut' => '2026-09-28',
        'fin'   => '2026-10-10',
        'initial' => [
            'ont' => 10, 'pto' => 10, 'jarretiere' => 10, 'piton' => 9, 'cheville' => 9,
            'connecteur' => 5, 'closer' => 7, 'fibre_1fo' => 1000,
            'cpc_50' => 9, 'cpc_100' => 10, 'cpc_150' => 11, 'cpc_200' => 14,
            'cpc_250' => 6, 'cpc_300' => 6, 'cpc_350' => 5,
            'crochets' => 240, 'pince' => 0, 'susp' => 0,
            'traverse_13t' => 6, 'traverse_15t' => 17,
        ],
        'recu' => [
            'ont' => 20, 'pto' => 20, 'jarretiere' => 20, 'piton' => 20, 'cheville' => 20,
            'connecteur' => 0, 'closer' => 0, 'fibre_1fo' => 0,
            'cpc_50' => 0, 'cpc_100' => 0, 'cpc_150' => 0, 'cpc_200' => 0,
            'cpc_250' => 0, 'cpc_300' => 0, 'cpc_350' => 0,
            'crochets' => 0, 'pince' => 0, 'susp' => 0,
            'traverse_13t' => 0, 'traverse_15t' => 0,
        ],
    ],
];
