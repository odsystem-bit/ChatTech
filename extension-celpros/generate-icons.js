// Pure Node.js PNG icon generator for Extension CelPros
// Generates 16x16, 32x32, 48x48, 128x128 PNG icons using zlib
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, 'icons');

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(size) {
  const width = size;
  const height = size;
  // RGBA raw rows with filter byte 0
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const radius = width * 0.46;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded badge background (Teal to Blue gradient: #0d9488 -> #0284c7)
      if (dist <= radius) {
        const ratio = (x + y) / (width * 2);
        const r = Math.round(13 + ratio * (2 - 13));
        const g = Math.round(148 + ratio * (132 - 148));
        const b = Math.round(136 + ratio * (199 - 136));

        // Draw lightning bolt / fiber pulse in white/yellow
        // Normalized coordinates in [-1, 1]
        const nx = dx / radius;
        const ny = dy / radius;

        // Lightning bolt polygon approximation
        const inBolt = (
          (ny >= -0.65 && ny <= 0.05 && nx >= -0.25 - ny * 0.2 && nx <= 0.35 - ny * 0.2) ||
          (ny >= -0.1 && ny <= 0.65 && nx >= -0.35 - ny * 0.2 && nx <= 0.25 - ny * 0.2)
        );

        if (inBolt) {
          rawData[pxOffset] = 250;     // R
          rawData[pxOffset + 1] = 204; // G
          rawData[pxOffset + 2] = 21;  // B (Amber-400)
          rawData[pxOffset + 3] = 255; // A
        } else {
          // Antialiased edge
          let alpha = 255;
          if (dist > radius - 1) {
            alpha = Math.round(255 * (radius - dist));
          }
          rawData[pxOffset] = r;
          rawData[pxOffset + 1] = g;
          rawData[pxOffset + 2] = b;
          rawData[pxOffset + 3] = Math.max(0, Math.min(255, alpha));
        }
      } else {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

[16, 32, 48, 128].forEach(size => {
  const png = createPng(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
});
