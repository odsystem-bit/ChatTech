import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

function execCommand(command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });
  });
}

conn.on('ready', async () => {
  try {
    const phpIni = await execCommand(`php -r "echo json_encode(['post_max_size' => ini_get('post_max_size'), 'upload_max_filesize' => ini_get('upload_max_filesize'), 'memory_limit' => ini_get('memory_limit'), 'max_execution_time' => ini_get('max_execution_time')]);"`);
    console.log('=== LIMITES PHP HOSTINGER ===\n' + phpIni.stdout);
    return;

    const uploadLs = await execCommand(`ls -la /home/u795734321/domains/fibretrack.mantota.com/public_html/api/uploads/interventions`);
    console.log('=== DOSSIER UPLOADS INTERVENTIONS ===');
    console.log(uploadLs.stdout);

    const maxPacketCmd = `mysql -u u795734321_fibretrack -p'@Stan52168223' u795734321_fibre -e "
      SHOW VARIABLES LIKE 'max_allowed_packet';
    "`;
    const packetRes = await execCommand(maxPacketCmd);
    console.log('=== MAX ALLOWED PACKET MYSQL ===');
    console.log(packetRes.stdout);

  } catch (err) {
    console.error(err);
  } finally {
    conn.end();
  }
});

conn.connect({ host, port, username, privateKey });
