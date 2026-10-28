import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const phpMigration = `<?php
require_once "${remoteBase}/api/_env.php";

$dsn = "mysql:host=" . (getenv("DB_HOST") ?: "localhost") . ";dbname=" . (getenv("DB_NAME") ?: "u795734321_fibre") . ";charset=utf8mb4";
$pdo = new PDO($dsn, getenv("DB_USER") ?: "u795734321_fibretrack", getenv("DB_PASS") ?: "", [
  PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

function hasColumn(PDO $pdo, string $table, string $col): bool {
  $stmt = $pdo->query("SHOW COLUMNS FROM \`$table\` LIKE " . $pdo->quote($col));
  return (bool)$stmt->fetch();
}

function hasIndex(PDO $pdo, string $table, string $idx): bool {
  $stmt = $pdo->query("SHOW INDEX FROM \`$table\` WHERE Key_name = " . $pdo->quote($idx));
  return (bool)$stmt->fetch();
}

echo "=== 1. Création de la table teams ===\\n";
$pdo->exec("CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(64) PRIMARY KEY,
  nom_equipe VARCHAR(255) NOT NULL,
  chef_nom VARCHAR(255) NOT NULL,
  telephone VARCHAR(50) DEFAULT '',
  entreprise_id VARCHAR(64) NULL,
  chaptech_equipe_id VARCHAR(64) NULL,
  revision INT DEFAULT 1,
  actif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$stmtTeam = $pdo->prepare("INSERT INTO teams (id, nom_equipe, chef_nom, telephone, entreprise_id, chaptech_equipe_id, revision, actif)
  VALUES ('team_telecom_btp_001', 'TELECOM BTP Services', 'Rodolpho', '+229', 'ent_telecom_btp_001', 'chaptech_eq_001', 1, 1)
  ON DUPLICATE KEY UPDATE nom_equipe = VALUES(nom_equipe), chef_nom = VALUES(chef_nom), actif = 1");
$stmtTeam->execute();
echo "✓ Équipe team_telecom_btp_001 présente.\\n";

echo "=== 2. Harmonisation des collations en utf8mb4_unicode_ci ===\\n";
foreach (['teams', 'accounts', 'interventions', 'stock', 'stock_movements', 'intervention_media', 'deleted_interventions'] as $tbl) {
  $pdo->exec("ALTER TABLE \`$tbl\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  echo "  ✓ Table $tbl -> utf8mb4_unicode_ci\\n";
}

echo "=== 3. Mise à jour de la table accounts ===\\n";
if (!hasColumn($pdo, 'accounts', 'team_id')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001' AFTER id");
}
if (!hasColumn($pdo, 'accounts', 'identifiant')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN identifiant VARCHAR(100) NULL UNIQUE AFTER nom");
}
if (!hasColumn($pdo, 'accounts', 'telephone')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN telephone VARCHAR(50) NULL AFTER identifiant");
}
$pdo->exec("ALTER TABLE accounts MODIFY COLUMN code VARCHAR(10) NULL");
if (!hasColumn($pdo, 'accounts', 'password_hash')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN password_hash VARCHAR(255) NULL AFTER code");
}
if (!hasColumn($pdo, 'accounts', 'api_token')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN api_token VARCHAR(128) NULL AFTER password_hash");
}
if (!hasColumn($pdo, 'accounts', 'role')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN role ENUM('super_admin', 'chef_equipe', 'technicien') NOT NULL DEFAULT 'technicien' AFTER api_token");
}
if (!hasColumn($pdo, 'accounts', 'actif')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN actif TINYINT(1) NOT NULL DEFAULT 1 AFTER role");
}
if (!hasColumn($pdo, 'accounts', 'entreprise_id')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN entreprise_id VARCHAR(64) NULL, ADD COLUMN chaptech_equipe_id VARCHAR(64) NULL, ADD COLUMN chaptech_compte_id VARCHAR(64) NULL, ADD COLUMN revision INT DEFAULT 1");
}
if (!hasColumn($pdo, 'accounts', 'updated_at')) {
  $pdo->exec("ALTER TABLE accounts ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
}
if (hasIndex($pdo, 'accounts', 'code')) {
  try { $pdo->exec("ALTER TABLE accounts DROP INDEX code"); } catch (Exception $e) {}
}
if (!hasIndex($pdo, 'accounts', 'idx_accounts_team')) {
  $pdo->exec("ALTER TABLE accounts ADD INDEX idx_accounts_team (team_id)");
}
if (!hasIndex($pdo, 'accounts', 'idx_accounts_code')) {
  $pdo->exec("ALTER TABLE accounts ADD INDEX idx_accounts_code (code)");
}
if (!hasIndex($pdo, 'accounts', 'idx_accounts_token')) {
  $pdo->exec("ALTER TABLE accounts ADD INDEX idx_accounts_token (api_token)");
}

$pdo->exec("UPDATE accounts SET team_id = 'team_telecom_btp_001' WHERE team_id IS NULL OR team_id = ''");

// Configuration des membres historiques de l'équipe 1
$team1Members = [
  ['code' => '4040', 'nom' => 'Rodolpho', 'identifiant' => 'rodolfo', 'role' => 'chef_equipe', 'pass' => '4040'],
  ['code' => '8080', 'nom' => 'Harold', 'identifiant' => 'harold', 'role' => 'technicien', 'pass' => '8080'],
  ['code' => '5050', 'nom' => 'Roldy', 'identifiant' => 'roldy', 'role' => 'technicien', 'pass' => '5050'],
  ['code' => '6060', 'nom' => 'STEEVE GONTRAN', 'identifiant' => 'steve', 'role' => 'technicien', 'pass' => '6060'],
  ['code' => '1010', 'nom' => 'NOUEMOU STANISLAS', 'identifiant' => 'stanislas', 'role' => 'technicien', 'pass' => '1010'],
  ['code' => '9999', 'nom' => 'ADMIN TELECOM BTP', 'identifiant' => 'admin', 'role' => 'chef_equipe', 'pass' => '9999'],
];

foreach ($team1Members as $m) {
  $stmt = $pdo->prepare("SELECT id, api_token, password_hash FROM accounts WHERE code = ? AND team_id = 'team_telecom_btp_001' LIMIT 1");
  $stmt->execute([$m['code']]);
  $existing = $stmt->fetch();
  $token = (!empty($existing['api_token'])) ? $existing['api_token'] : bin2hex(random_bytes(32));
  $hash = (!empty($existing['password_hash'])) ? $existing['password_hash'] : password_hash($m['pass'], PASSWORD_DEFAULT);
  if ($existing) {
    $up = $pdo->prepare("UPDATE accounts SET team_id = 'team_telecom_btp_001', identifiant = ?, role = ?, password_hash = ?, api_token = ?, actif = 1, entreprise_id = 'ent_telecom_btp_001', chaptech_equipe_id = 'chaptech_eq_001' WHERE id = ?");
    $up->execute([$m['identifiant'], $m['role'], $hash, $token, $existing['id']]);
  } else {
    $id = ($m['code'] === '9999') ? 'admin_team_001' : bin2hex(random_bytes(16));
    $ins = $pdo->prepare("INSERT INTO accounts (id, team_id, nom, identifiant, code, password_hash, api_token, role, actif, entreprise_id, chaptech_equipe_id) VALUES (?, 'team_telecom_btp_001', ?, ?, ?, ?, ?, ?, 1, 'ent_telecom_btp_001', 'chaptech_eq_001')");
    $ins->execute([$id, $m['nom'], $m['identifiant'], $m['code'], $hash, $token, $m['role']]);
  }
}

// Compte super_admin général Fibtrack
$stmtSa = $pdo->prepare("SELECT id, api_token FROM accounts WHERE identifiant = 'superadmin' LIMIT 1");
$stmtSa->execute();
$sa = $stmtSa->fetch();
$saToken = (!empty($sa['api_token'])) ? $sa['api_token'] : bin2hex(random_bytes(32));
$saHash = password_hash('SuperFibtrack2026!', PASSWORD_DEFAULT);
if ($sa) {
  $pdo->prepare("UPDATE accounts SET role = 'super_admin', actif = 1, api_token = ? WHERE id = ?")->execute([$saToken, $sa['id']]);
} else {
  $pdo->prepare("INSERT INTO accounts (id, team_id, nom, identifiant, code, password_hash, api_token, role, actif) VALUES ('super_admin_fibtrack', 'team_telecom_btp_001', 'Administrateur Général Fibtrack', 'superadmin', '0000', ?, ?, 'super_admin', 1)")->execute([$saHash, $saToken]);
}
echo "✓ Comptes équipe 1 et super_admin configurés.\\n";

echo "=== 4. Mise à jour de la table interventions ===\\n";
if (!hasColumn($pdo, 'interventions', 'team_id')) {
  $pdo->exec("ALTER TABLE interventions ADD COLUMN team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001' AFTER id");
}
if (!hasColumn($pdo, 'interventions', 'entreprise_id')) {
  $pdo->exec("ALTER TABLE interventions ADD COLUMN entreprise_id VARCHAR(64) NULL, ADD COLUMN chaptech_equipe_id VARCHAR(64) NULL, ADD COLUMN chaptech_compte_id VARCHAR(64) NULL, ADD COLUMN chaptech_intervention_id VARCHAR(64) NULL, ADD COLUMN revision INT DEFAULT 1");
}
if (!hasIndex($pdo, 'interventions', 'idx_interventions_team')) {
  $pdo->exec("ALTER TABLE interventions ADD INDEX idx_interventions_team (team_id)");
}
if (!hasIndex($pdo, 'interventions', 'idx_interventions_team_date')) {
  $pdo->exec("ALTER TABLE interventions ADD INDEX idx_interventions_team_date (team_id, date)");
}
$pdo->exec("UPDATE interventions SET team_id = 'team_telecom_btp_001' WHERE team_id IS NULL OR team_id = ''");

echo "=== 5. Mise à jour de la table stock (PRIMARY KEY (team_id, designation)) ===\\n";
if (!hasColumn($pdo, 'stock', 'team_id')) {
  $pdo->exec("ALTER TABLE stock ADD COLUMN team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001' FIRST");
}
if (!hasColumn($pdo, 'stock', 'updated_at')) {
  $pdo->exec("ALTER TABLE stock ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
}
$pdo->exec("UPDATE stock SET team_id = 'team_telecom_btp_001' WHERE team_id IS NULL OR team_id = ''");

// Vérifier la clé primaire de stock
$pkStmt = $pdo->query("SHOW KEYS FROM stock WHERE Key_name = 'PRIMARY'");
$pkCols = array_column($pkStmt->fetchAll(), 'Column_name');
if ($pkCols !== ['team_id', 'designation']) {
  $pdo->exec("ALTER TABLE stock DROP PRIMARY KEY, ADD PRIMARY KEY (team_id, designation)");
  echo "  ✓ Clé primaire composite (team_id, designation) appliquée sur stock.\\n";
}

// Nettoyer les 4 mouvements de test accidentels du 27/10 à 23:15 et garantir les 20 articles canevas exacts de l'équipe 1
$pdo->exec("DELETE FROM stock_movements WHERE id IN (2010, 2011, 2012, 2013) AND motif LIKE '%express%'");
$team1Stock = [
  'ont' => 41, 'pto' => 41, 'jarretiere' => 40, 'piton' => 40, 'cheville' => 40,
  'connecteur' => 5, 'closer' => 6, 'fibre_1fo' => 1000,
  'cpc_50' => 7, 'cpc_100' => 18, 'cpc_150' => 13, 'cpc_200' => 10, 'cpc_250' => 6, 'cpc_300' => 5, 'cpc_350' => 3,
  'crochets' => 311, 'pince' => 0, 'susp' => 0, 'traverse_13t' => 1, 'traverse_15t' => 10
];
$upStock = $pdo->prepare("INSERT INTO stock (team_id, designation, quantite) VALUES ('team_telecom_btp_001', ?, ?) ON DUPLICATE KEY UPDATE quantite = VALUES(quantite)");
foreach ($team1Stock as $desig => $qte) {
  $upStock->execute([$desig, $qte]);
}
echo "✓ Stock de team_telecom_btp_001 vérifié et aligné sur les 20 articles canevas GS BTP.\\n";

echo "=== 6. Mise à jour de stock_movements, intervention_media, deleted_interventions ===\\n";
if (!hasColumn($pdo, 'stock_movements', 'team_id')) {
  $pdo->exec("ALTER TABLE stock_movements ADD COLUMN team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001' AFTER id");
}
if (!hasIndex($pdo, 'stock_movements', 'idx_sm_team')) {
  $pdo->exec("ALTER TABLE stock_movements ADD INDEX idx_sm_team (team_id)");
}
$pdo->exec("UPDATE stock_movements SET team_id = 'team_telecom_btp_001' WHERE team_id IS NULL OR team_id = ''");

if (!hasColumn($pdo, 'intervention_media', 'team_id')) {
  $pdo->exec("ALTER TABLE intervention_media ADD COLUMN team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001' AFTER id");
}
if (!hasIndex($pdo, 'intervention_media', 'idx_media_team')) {
  $pdo->exec("ALTER TABLE intervention_media ADD INDEX idx_media_team (team_id)");
}
$pdo->exec("UPDATE intervention_media SET team_id = 'team_telecom_btp_001' WHERE team_id IS NULL OR team_id = ''");

if (!hasColumn($pdo, 'deleted_interventions', 'team_id')) {
  $pdo->exec("ALTER TABLE deleted_interventions ADD COLUMN team_id VARCHAR(64) NOT NULL DEFAULT 'team_telecom_btp_001' AFTER id");
}
if (!hasIndex($pdo, 'deleted_interventions', 'idx_del_team')) {
  $pdo->exec("ALTER TABLE deleted_interventions ADD INDEX idx_del_team (team_id)");
}
$pdo->exec("UPDATE deleted_interventions SET team_id = 'team_telecom_btp_001' WHERE team_id IS NULL OR team_id = ''");

echo "\\n=== VÉRIFICATION FINALE ===\\n";
echo "Équipes :\\n";
print_r($pdo->query("SELECT id, nom_equipe, chef_nom FROM teams")->fetchAll());
echo "Comptes :\\n";
print_r($pdo->query("SELECT id, team_id, nom, identifiant, code, role, actif FROM accounts ORDER BY role, nom")->fetchAll());
echo "Interventions team_telecom_btp_001 : " . $pdo->query("SELECT COUNT(*) FROM interventions WHERE team_id = 'team_telecom_btp_001'")->fetchColumn() . "\\n";
echo "Stock team_telecom_btp_001 :\\n";
$st = $pdo->query("SELECT designation, quantite FROM stock WHERE team_id = 'team_telecom_btp_001' ORDER BY designation")->fetchAll(PDO::FETCH_KEY_PAIR);
echo json_encode($st) . "\\n";
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const remoteScript = `/tmp/migrate_saas_${Date.now()}.php`;
    sftp.writeFile(remoteScript, phpMigration, (err) => {
      if (err) throw err;
      conn.exec(`php ${remoteScript}; rm -f ${remoteScript}`, (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d));
        stream.stderr.on('data', d => process.stderr.write(d));
        stream.on('close', () => conn.end());
      });
    });
  });
}).connect({
  host,
  port,
  username,
  privateKey: fs.readFileSync(privateKeyPath)
});
