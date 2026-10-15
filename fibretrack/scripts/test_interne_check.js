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
    $stmt = $pdo->prepare("SELECT whatsapp_photos, points_gps FROM interventions WHERE id = ?");
    $stmt->execute(["6c7e0124-1ad8-4146-b29f-ca2c5f81cb07"]);
    echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
  '`, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => {
      const data = JSON.parse(out);
      const wa = JSON.parse(data.whatsapp_photos || '[]');
      function getPhotoDescription(p) {
        if (!p || typeof p !== 'object') return '';
        return [p.slot, p.name, p.nom, p.title, p.titre, p.type, p.sous_type, p.label, p.caption, p.description, p.lieu, p.proprietaire].filter(Boolean).join(' ').toLowerCase();
      }
      console.log('CHECKING ALL WA PHOTOS FOR INTERNE:');
      wa.forEach((p, idx) => {
        const desc = getPhotoDescription(p);
        console.log(`[${idx}] slot=${p.slot} type=${p.type} name=${p.name} file=${(p.url||'').split('/').pop()} -> desc='${desc}' includes_interne=${desc.includes('interne')}`);
      });
      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
