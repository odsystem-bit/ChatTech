import fs from 'node:fs';
import { Client } from 'ssh2';

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

const rawPhp = `
echo "=== PHP CONFIG FOR UPLOADS ===\\n";
echo "upload_max_filesize: " . ini_get("upload_max_filesize") . "\\n";
echo "post_max_size: " . ini_get("post_max_size") . "\\n";
echo "memory_limit: " . ini_get("memory_limit") . "\\n";
echo "max_execution_time: " . ini_get("max_execution_time") . "\\n";
echo "max_input_time: " . ini_get("max_input_time") . "\\n";

echo "\\n=== CHECK ea3 VIDEO FILE ON DISK ===\\n";
$target = "${remoteBase}/api/uploads/interventions/ea3ed5e5-9db6-4935-99a7-e2a6f53e7911/86b70b91de86bab2a6bf110202bad441.mp4";
if (file_exists($target)) {
    echo "FILE EXISTS! size = " . filesize($target) . " bytes\\n";
    echo "permissions: " . substr(sprintf('%o', fileperms($target)), -4) . "\\n";
} else {
    echo "FILE DOES NOT EXIST AT $target\\n";
}

$intvDir = "${remoteBase}/api/uploads/interventions/ea3ed5e5-9db6-4935-99a7-e2a6f53e7911";
if (is_dir($intvDir)) {
    echo "\\nContents of $intvDir:\\n";
    print_r(scandir($intvDir));
} else {
    echo "\\nDirectory $intvDir DOES NOT EXIST\\n";
}

$allIntv = "${remoteBase}/api/uploads/interventions";
if (is_dir($allIntv)) {
    echo "\\nSubdirectories in $allIntv:\\n";
    print_r(scandir($allIntv));
}
`;

const b64 = Buffer.from(rawPhp).toString('base64');

conn.on('ready', () => {
  conn.exec(`php -r 'eval(base64_decode("${b64}"));'`, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});

conn.connect({ host, port, username, privateKey });
