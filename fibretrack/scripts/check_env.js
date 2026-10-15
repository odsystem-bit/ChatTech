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
  conn.exec(`php -r 'require_once "${remoteBase}/api/_env.php"; echo "USER=".getenv("DB_USER")." PASS_LEN=".strlen(getenv("DB_PASS"))." NAME=".getenv("DB_NAME");'`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => {
      console.log('Result:', out);
      conn.end();
    });
  });
});
conn.connect({ host, port, username, privateKey });
