import test from "node:test";
import assert from "node:assert/strict";
import { extractSpeedtestFromText, extractPowerMeterFromText } from "./ocrScanner.js";

test("extractSpeedtestFromText - extrait fidèlement les données nPerf réelles fournies", () => {
  const nperfText = `
11:18 =.@
= for a
VUOL, VAUIE, UIE UU SALENILE.
n°»
5 lu
7 50
w/ x
. < 7
Partager 5
54 —————>— 80
Relancer A
; = “90
[34
AN, 100
= ÿ
E Comparer _.«" , 16Gb
0 10Gb
= [BJ] Ganhi - 10 Gb/s - SBIN
(® © 48.53wv/s
I Moyenne 48.26 Mb/s
BR ® 10.490w/s
Moyenne 9.504 Mb/s
| | @ 7.500
Moyenne 18.99 ms
Opérateur: IPv4: Système :
Celtis 137.255.116.214 Chrome 1550 ~~
Test débit Wi-Fi - Tchankpan Arnaud
`;

  const result = extractSpeedtestFromText(nperfText);
  assert.equal(result.download, "48.26", "Débit descendant (download) doit être 48.26");
  assert.equal(result.upload, "9.504", "Débit montant (upload) doit être 9.504");
  assert.equal(result.ping, "18.99", "Ping doit être 18.99");
});

test("extractSpeedtestFromText - extrait par mots-clés contextuels de fallback", () => {
  const genericText = `
Speedtest Ookla
Download
82.50 Mbps
Upload
15.20 Mbps
Ping 12.4 ms
`;

  const result = extractSpeedtestFromText(genericText);
  assert.equal(result.download, "82.50");
  assert.equal(result.upload, "15.20");
  assert.equal(result.ping, "12.4");
});

test("extractSpeedtestFromText - extrait lorsque les chiffres sont situés AVANT les libellés", () => {
  const reverseText = `
Speedtest Celtiis
48.26 Mb/s
RÉCEPTION
10.49 Mb/s
ENVOI
20.71 ms
PING
`;

  const result = extractSpeedtestFromText(reverseText);
  assert.equal(result.download, "48.26", "Download placé avant Réception doit être extrait");
  assert.equal(result.upload, "10.49", "Upload placé avant Envoi doit être extrait");
  assert.equal(result.ping, "20.71", "Ping placé avant label doit être extrait");
});

test("extractPowerMeterFromText - extrait les valeurs typiques d'un photomètre optique", () => {
  assert.equal(extractPowerMeterFromText("1310 nm\n-18.52 dBm\nREF: 0 dB"), "-18.52");
  assert.equal(extractPowerMeterFromText("1490 nm -19.93 dBm"), "-19.93");
  assert.equal(extractPowerMeterFromText("Mesure: -22.4 dBm"), "-22.40");
  assert.equal(extractPowerMeterFromText("Optic 18.5 dBm"), "-18.50");
  // Cas écran réel avec longueur d'onde et REF 0.00 avant la mesure
  assert.equal(extractPowerMeterFromText("OPM\n1310 nm\nREF 0.00 dBm\n-19.93 dBm"), "-19.93");
  assert.equal(extractPowerMeterFromText("OPM 1490nm\nREF 0.00dBm\n-19.28 dBm"), "-19.28");
  assert.equal(extractPowerMeterFromText("-18:52 dBm"), "-18.52");
  assert.equal(extractPowerMeterFromText("1852 dBm"), "-18.52");
  assert.equal(extractPowerMeterFromText("- 19 . 93 dBm"), "-19.93");
});
