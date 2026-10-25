import { Client } from 'ssh2';
import fs from 'fs';

const base = '/home/u795734321/domains/fibretrack.mantota.com/public_html/api';
const php = `<?php
$root = '${base}/uploads/photos';
$cut = time() - 3*86400;
$rows = [];
foreach (glob($root.'/*/*.jpg') as $f) {
  if (filemtime($f) < $cut) continue;
  $sz = filesize($f);
  $im = @imagecreatefromjpeg($f);
  if (!$im) { $rows[] = ['BAD', $sz, 0, 0, str_replace($root.'/','',$f)]; continue; }
  $w = imagesx($im); $h = imagesy($im);
  $s = imagescale($im, 16, 16);
  $sum = 0; $max = 0;
  for ($x=0;$x<16;$x++) for ($y=0;$y<16;$y++) { $c = imagecolorat($s,$x,$y); $l = (($c>>16&255)+($c>>8&255)+($c&255))/3; $sum += $l; if ($l>$max) $max=$l; }
  $avg = $sum/256;
  $rows[] = [$avg < 12 ? 'DARK' : 'ok', $sz, round($avg,1), $w.'x'.$h, str_replace($root.'/','',$f)];
}
usort($rows, fn($a,$b)=>strcmp($a[0],$b[0]));
$n=['ok'=>0,'DARK'=>0,'BAD'=>0];
foreach ($rows as $r) { $n[$r[0]]++; if ($r[0]!=='ok') echo implode(' | ', $r)."\\n"; }
echo json_encode($n)."\\n";
`;
fs.writeFileSync('scripts/_dark_scan.php', php);

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    sftp.fastPut('scripts/_dark_scan.php', `${base}/_dark_scan.php`, (e) => {
      if (e) throw e;
      conn.exec(`php ${base}/_dark_scan.php; rm -f ${base}/_dark_scan.php`, (e2, stream) => {
        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));
        stream.on('close', () => conn.end());
      });
    });
  });
}).connect({
  host: '82.29.191.42', port: 65002, username: 'u795734321',
  privateKey: fs.readFileSync('C:/Users/Davyh/.ssh/id_ed25519'),
});
