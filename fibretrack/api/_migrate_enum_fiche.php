<?php
/**
 * Migration prod one-shot : ajoute 'fiche' à l'ENUM intervention_media.type.
 * Le PHP accepte 'fiche' depuis le début mais l'ENUM non → INSERT refusé
 * en mode strict → scans de fiche perdus. À supprimer après exécution.
 */
require __DIR__ . '/_env.php';

$pdo = new PDO(
    sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        getenv('DB_HOST'),
        getenv('DB_NAME'),
        getenv('DB_CHARSET') ?: 'utf8mb4'
    ),
    getenv('DB_USER'),
    getenv('DB_PASS'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$pdo->exec("ALTER TABLE intervention_media MODIFY type ENUM('photo','video','fiche') NOT NULL");

$col = $pdo->query("SHOW COLUMNS FROM intervention_media LIKE 'type'")->fetch(PDO::FETCH_ASSOC);
echo "intervention_media.type => {$col['Type']}\nOK\n";
