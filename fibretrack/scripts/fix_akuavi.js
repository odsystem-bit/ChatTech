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
  const phpCode = `<?php
    require_once "${remoteBase}/api/_env.php";
    $pdo = new PDO("mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    
    $id = 'ba9d8b2f-324d-404d-8202-000bae342314';
    $stmt = $pdo->prepare('SELECT * FROM interventions WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
      echo "INTERVENTION NOT FOUND\\n";
      exit;
    }

    $rawGps = json_decode($row['points_gps'] ?? '[]', true) ?? [];
    echo "OLD points_gps count: " . count($rawGps) . "\\n";
    echo "OLD nb_poteaux_traverses: " . $row['nb_poteaux_traverses'] . "\\n";

    // Deduplicate poles by numero (1, 2, 3), keeping Petit Jean and proper coords
    $dedup = [];
    $fat = null;
    $abonne = null;
    $polesByNum = [];

    foreach ($rawGps as $p) {
      $type = strtolower(trim((string)($p['type'] ?? '')));
      if ($type === 'fat') {
        if (!$fat || empty($fat['photo'])) {
          $fat = $p;
        }
      } elseif ($type === 'poteau') {
        $num = (int)($p['numero'] ?? 1);
        if (!isset($polesByNum[$num])) {
          $polesByNum[$num] = $p;
        } else {
          // Merge
          $ex = $polesByNum[$num];
          if (empty($ex['type_poteau']) && !empty($p['type_poteau'])) {
            $ex['type_poteau'] = $p['type_poteau'];
            $ex['proprietaire'] = $p['type_poteau'];
          }
          if (empty($ex['photo']) && !empty($p['photo'])) {
            $ex['photo'] = $p['photo'];
          }
          $polesByNum[$num] = $ex;
        }
      } elseif (in_array($type, ['abonné', 'abonne', 'client', 'ont'], true)) {
        // Préférer le point de Djeffa (lat ~6.38) plutôt que Maria-Gléta (lat ~6.42)
        $lat = (float)($p['lat'] ?? $p['latitude'] ?? 0);
        if (!$abonne || ($lat > 6.37 && $lat < 6.40)) {
          $abonne = $p;
        }
      }
    }

    if ($fat) $dedup[] = $fat;
    ksort($polesByNum);
    foreach ($polesByNum as $pole) {
      $dedup[] = $pole;
    }
    if ($abonne) $dedup[] = $abonne;

    echo "NEW points_gps count: " . count($dedup) . "\\n";
    $newTrav = count($polesByNum);
    echo "NEW nb_poteaux_traverses: " . $newTrav . "\\n";

    $mat = json_decode($row['materiel_pose'] ?? '{}', true) ?? [];
    if (isset($mat['crochets']) && (int)$mat['crochets'] === 6) {
      $mat['crochets'] = 3;
    }

    $updateStmt = $pdo->prepare('UPDATE interventions SET points_gps = :gps, nb_poteaux_traverses = :trav, nb_poteaux_implantes = 0, nb_poteaux_armes = 0, materiel_pose = :mat, modifie_le = NOW() WHERE id = :id');
    $updateStmt->execute([
      ':gps' => json_encode(array_values($dedup)),
      ':trav' => $newTrav,
      ':mat' => json_encode($mat),
      ':id' => $id,
    ]);

    echo "UPDATE SUCCESSFUL!\\n";
  `;

  const b64 = Buffer.from(phpCode).toString('base64');
  conn.exec(`echo "${b64}" | base64 -d | php`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      console.log('OUTPUT:\n' + out);
      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
