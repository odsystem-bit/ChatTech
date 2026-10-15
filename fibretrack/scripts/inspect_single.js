import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

conn.on('ready', () => {
  conn.exec(`php -r '
    require_once "${remoteBase}/api/_env.php";
    $pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"));
    $id = $argv[1] ?? "6c7e0124-1ad8-4146-b29f-ca2c5f81cb07";
    $stmt = $pdo->prepare("SELECT id, nom_client, nom_dossier, telephone_ligne, mobile, mac, sn, ont_sn, materiel_pose, points_gps, whatsapp_photos, nb_poteaux_traverses, nb_poteaux_implantes, nb_poteaux_armes, modifie_le FROM interventions WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) {
      $mat = json_decode($row["materiel_pose"] ?? "[]", true);
      $pts = json_decode($row["points_gps"] ?? "[]", true);
      $wa = json_decode($row["whatsapp_photos"] ?? "[]", true);
      $wa_slots = array_map(function($p) { return ["id" => $p["id"] ?? "", "slot" => $p["slot"] ?? "", "type" => $p["type"] ?? "", "name" => $p["name"] ?? "", "has_url" => !empty($p["url"])]; }, is_array($wa) ? $wa : []);
      $pts_summary = array_map(function($p) { return ["type" => $p["type"] ?? "", "numero" => $p["numero"] ?? "", "has_photo" => !empty($p["photo"]), "proprietaire" => $p["proprietaire"] ?? "", "type_poteau" => $p["type_poteau"] ?? ""]; }, is_array($pts) ? $pts : []);
      echo json_encode([
        "id" => $row["id"],
        "nom_client" => $row["nom_client"],
        "mac" => $row["mac"],
        "sn" => $row["sn"],
        "ont_sn" => $row["ont_sn"],
        "materiel_pose" => $mat,
        "points_gps" => $pts_summary,
        "whatsapp_photos" => $wa_slots,
        "modifie_le" => $row["modifie_le"]
      ], JSON_PRETTY_PRINT);
    } else {
      echo "NOT FOUND";
    }
  \' -- "${process.argv[2] || '6c7e0124-1ad8-4146-b29f-ca2c5f81cb07'}"`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      console.log('INTERVENTION DETAILS:');
      console.log(out);
      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
