import fs from 'node:fs';
import ssh2 from 'ssh2';
const { Client } = ssh2;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`php -r '
    require_once "/home/u795734321/domains/fibretrack.mantota.com/public_html/api/_env.php";
    $pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"));
    
    // 1. Group by statut
    $stmt = $pdo->query("SELECT statut, COUNT(*) as cnt, SUM(materiel_deduit) as sum_deduit FROM interventions GROUP BY statut");
    echo "=== STATUTS ===\n";
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

    // 2. Interventions with motif_non_traite
    $stmt2 = $pdo->query("SELECT id, nom_client, statut, motif_non_traite, materiel_deduit, date, updated_at FROM interventions WHERE motif_non_traite IS NOT NULL AND motif_non_traite != \"\"");
    echo "=== MOTIF NON TRAITE ===\n";
    print_r($stmt2->fetchAll(PDO::FETCH_ASSOC));

    // 3. Check if any non-termine has materiel_deduit = 1
    $stmt3 = $pdo->query("SELECT id, nom_client, statut, motif_non_traite, materiel_deduit FROM interventions WHERE statut != \"termine\" AND materiel_deduit = 1");
    echo "=== NON-TERMINE AVEC MATERIEL_DEDUIT = 1 ===\n";
    print_r($stmt3->fetchAll(PDO::FETCH_ASSOC));

    // 4. Check stock table
    $stmt4 = $pdo->query("SELECT * FROM stock ORDER BY quantite ASC");
    echo "=== ETAT DU STOCK ===\n";
    print_r($stmt4->fetchAll(PDO::FETCH_ASSOC));
  '`, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('ERR:', d.toString()));
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
}).connect({
  host: '82.29.191.42',
  port: 65002,
  username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
