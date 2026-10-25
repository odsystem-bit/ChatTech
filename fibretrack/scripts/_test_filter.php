<?php
$files = [
  '/home/u795734321/domains/fibretrack.mantota.com/public_html/api/uploads/photos/6d95e3b1-9739-4c3a-94b6-b69299db291e/autre_poteau_5d2117951fda5a9bb4cf674bc5277137.jpg',
  '/home/u795734321/domains/fibretrack.mantota.com/public_html/api/uploads/photos/6d95e3b1-9739-4c3a-94b6-b69299db291e/autre_poteau_d65b22c705.jpg',
  '/home/u795734321/domains/fibretrack.mantota.com/public_html/api/uploads/photos/6d95e3b1-9739-4c3a-94b6-b69299db291e/autre_poteau_987c5b09ae.jpg',
  '/home/u795734321/domains/fibretrack.mantota.com/public_html/api/uploads/photos/7eba4f53-f323-4926-9913-4bae8ccd9f31/additionnelle_2b8a6096-56c9-44ad-a768-4089cc5084a7_0fa04f0610e9c093a676c5d6b6606ea5.jpg'
];
foreach ($files as $f) {
  if (!is_file($f)) { echo basename($f).' NOT FOUND\n'; continue; }
  $sz = filesize($f);
  $im = @imagecreatefromjpeg($f);
  if (!$im) { echo basename($f).' BAD JPEG\n'; continue; }
  $s = imagescale($im, 16, 16);
  $lumSum = 0;
  for ($x = 0; $x < 16; $x++) {
    for ($y = 0; $y < 12; $y++) {
      $c = imagecolorat($s, $x, $y);
      $lumSum += (($c >> 16 & 255) + ($c >> 8 & 255) + ($c & 255)) / 3;
    }
  }
  $avgLum = $lumSum / (16 * 12);
  echo basename($f).' => sz: '.$sz.', avgLum(top75): '.round($avgLum, 2).' -> '.($avgLum < 1.0 ? 'BLACK (CORRUPTED)' : 'VALID OK')."\n";
}
