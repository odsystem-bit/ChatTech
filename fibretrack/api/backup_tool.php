<?php
require_once __DIR__ . '/_env.php';
$pdo = new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_NAME').';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASS'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);

$tables = ['interventions', 'intervention_media', 'accounts', 'stock', 'stock_movements'];
$backup = [];

foreach ($tables as $t) {
  try {
    $rows = $pdo->query("SELECT * FROM `$t`")->fetchAll();
    $backup[$t] = $rows;
    echo "TABLE $t: " . count($rows) . " rows\n";
  } catch (Exception $e) {
    echo "TABLE $t: error " . $e->getMessage() . "\n";
  }
}

$file = __DIR__ . '/backup_' . date('Ymd_His') . '.json';
file_put_contents($file, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo "SAVED_TO: $file (size: " . filesize($file) . " bytes)\n";
