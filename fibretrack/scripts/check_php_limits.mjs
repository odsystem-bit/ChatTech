import { Client } from 'ssh2';
import fs from 'fs';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`php -r "echo 'upload_max_filesize: '.ini_get('upload_max_filesize').PHP_EOL; echo 'post_max_size: '.ini_get('post_max_size').PHP_EOL; echo 'max_execution_time: '.ini_get('max_execution_time').PHP_EOL; echo 'memory_limit: '.ini_get('memory_limit').PHP_EOL;"`, (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '82.29.191.42', port: 65002, username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519')
});
