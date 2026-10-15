import fs from 'node:fs';
import { Client } from 'ssh2';
import '../../extension-celpros/content/field-mapping.js';
import '../../extension-celpros/content/photo-filler.js';
import '../../extension-celpros/content/form-filler.js';

const FieldMapping = globalThis.FieldMapping;
const PhotoFiller = globalThis.PhotoFiller;
const FormFiller = globalThis.FormFiller;

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
    $stmt = $pdo->prepare("SELECT * FROM interventions WHERE id = ?");
    $stmt->execute(["6c7e0124-1ad8-4146-b29f-ca2c5f81cb07"]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $row["materiel_pose"] = json_decode($row["materiel_pose"] ?? "{}", true);
    $row["points_gps"] = json_decode($row["points_gps"] ?? "[]", true);
    $row["whatsapp_photos"] = json_decode($row["whatsapp_photos"] ?? "[]", true);
    echo json_encode($row);
  '`, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      const data = JSON.parse(out);
      console.log('--- TEST DONNEES REELLES 6c7e0124 ---');
      console.log('Client:', data.nom_client);
      console.log('Materiel pose:', data.materiel_pose);
      console.log('Total whatsapp_photos:', data.whatsapp_photos.length);
      console.log('Total points_gps:', data.points_gps.length);
      data.whatsapp_photos.forEach((p, idx) => {
        console.log(`WA [${idx}] slot=${p.slot} type=${p.type} name=${p.name} url=${p.url}`);
      });
      data.points_gps.forEach((p, idx) => {
        console.log(`GPS [${idx}] type=${p.type} num=${p.numero} photo=${p.photo}`);
      });

      // Test 1: cable_interne getPhoto
      const cableRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'cable_interne');
      const cableResult = cableRule.getPhoto(data);
      console.log('\n--- Test : getPhoto(cable_interne) ---');
      console.log('cableResult:', cableResult);

      // Test 1b: fat getPhoto
      const fatRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'fat');
      const fatResult = fatRule.getPhoto(data);
      console.log('\n--- Test : getPhoto(fat) ---');
      console.log('fatResult:', fatResult);

      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
