import test from "node:test";
import assert from "node:assert/strict";
import { parseExifFromDataView, extractExifGpsFromBuffer } from "./geo.js";

function createMockExifJpeg({ latDeg, latMin, latSec, latRef, lngDeg, lngMin, lngSec, lngRef, littleEndian = true }) {
  // Build a minimal valid JPEG with Exif APP1 marker containing GPS Info
  const tiffBuffer = Buffer.alloc(200);
  let p = 0;

  // TIFF Header
  if (littleEndian) {
    tiffBuffer.write("II", p, "ascii"); p += 2;
    tiffBuffer.writeUInt16LE(0x002A, p); p += 2;
    tiffBuffer.writeUInt32LE(0x00000008, p); p += 4; // IFD0 at offset 8
  } else {
    tiffBuffer.write("MM", p, "ascii"); p += 2;
    tiffBuffer.writeUInt16BE(0x002A, p); p += 2;
    tiffBuffer.writeUInt32BE(0x00000008, p); p += 4;
  }

  // IFD0 at offset 8
  const ifd0Start = 8;
  p = ifd0Start;
  const numIfd0Entries = 1;
  if (littleEndian) {
    tiffBuffer.writeUInt16LE(numIfd0Entries, p); p += 2;
    // Tag 0x8825 (GPSInfo)
    tiffBuffer.writeUInt16LE(0x8825, p); p += 2;
    tiffBuffer.writeUInt16LE(4, p); p += 2; // LONG
    tiffBuffer.writeUInt32LE(1, p); p += 4; // count
    const gpsIfdOffset = 26; // right after IFD0 (8 + 2 + 12 + 4)
    tiffBuffer.writeUInt32LE(gpsIfdOffset, p); p += 4;
    tiffBuffer.writeUInt32LE(0, p); p += 4; // Next IFD offset = 0
  } else {
    tiffBuffer.writeUInt16BE(numIfd0Entries, p); p += 2;
    tiffBuffer.writeUInt16BE(0x8825, p); p += 2;
    tiffBuffer.writeUInt16BE(4, p); p += 2;
    tiffBuffer.writeUInt32BE(1, p); p += 4;
    const gpsIfdOffset = 26;
    tiffBuffer.writeUInt32BE(gpsIfdOffset, p); p += 4;
    tiffBuffer.writeUInt32BE(0, p); p += 4;
  }

  // GPS IFD at offset 26
  p = 26;
  const numGpsEntries = 4;
  const dataAreaOffset = 26 + 2 + (numGpsEntries * 12) + 4; // 80
  let dataP = dataAreaOffset;

  if (littleEndian) {
    tiffBuffer.writeUInt16LE(numGpsEntries, p); p += 2;

    // Tag 1: GPSLatitudeRef
    tiffBuffer.writeUInt16LE(0x0001, p); p += 2;
    tiffBuffer.writeUInt16LE(2, p); p += 2; // ASCII
    tiffBuffer.writeUInt32LE(2, p); p += 4; // 2 chars (e.g. "N\0")
    tiffBuffer.write(latRef + "\0", p, "ascii"); p += 4;

    // Tag 2: GPSLatitude (3 RATIONALs -> 24 bytes in data area)
    tiffBuffer.writeUInt16LE(0x0002, p); p += 2;
    tiffBuffer.writeUInt16LE(5, p); p += 2; // RATIONAL
    tiffBuffer.writeUInt32LE(3, p); p += 4;
    tiffBuffer.writeUInt32LE(dataP, p); p += 4;
    // Write lat rationals
    tiffBuffer.writeUInt32LE(latDeg, dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(1, dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(latMin, dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(1, dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(Math.round(latSec * 100), dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(100, dataP); dataP += 4;

    // Tag 3: GPSLongitudeRef
    tiffBuffer.writeUInt16LE(0x0003, p); p += 2;
    tiffBuffer.writeUInt16LE(2, p); p += 2;
    tiffBuffer.writeUInt32LE(2, p); p += 4;
    tiffBuffer.write(lngRef + "\0", p, "ascii"); p += 4;

    // Tag 4: GPSLongitude (3 RATIONALs -> 24 bytes)
    tiffBuffer.writeUInt16LE(0x0004, p); p += 2;
    tiffBuffer.writeUInt16LE(5, p); p += 2;
    tiffBuffer.writeUInt32LE(3, p); p += 4;
    tiffBuffer.writeUInt32LE(dataP, p); p += 4;
    // Write lng rationals
    tiffBuffer.writeUInt32LE(lngDeg, dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(1, dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(lngMin, dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(1, dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(Math.round(lngSec * 100), dataP); dataP += 4;
    tiffBuffer.writeUInt32LE(100, dataP); dataP += 4;
  }

  const app1Payload = Buffer.concat([
    Buffer.from("Exif\0\0", "ascii"),
    tiffBuffer.subarray(0, dataP),
  ]);

  const app1Length = app1Payload.length + 2;
  const app1LengthBuf = Buffer.alloc(2);
  app1LengthBuf.writeUInt16BE(app1Length, 0);

  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]), // SOI
    Buffer.from([0xFF, 0xE1]), // APP1
    app1LengthBuf,
    app1Payload,
    Buffer.from([0xFF, 0xD9]), // EOI
  ]);
}

test("parseExifFromDataView - extracts GPS coordinates from synthetic JPEG", () => {
  // Cotonou coordinates approx: 6° 21' 58.68" N, 2° 25' 44.40" E
  const jpegBuf = createMockExifJpeg({
    latDeg: 6,
    latMin: 21,
    latSec: 58.68,
    latRef: "N",
    lngDeg: 2,
    lngMin: 25,
    lngSec: 44.40,
    lngRef: "E",
    littleEndian: true,
  });

  const view = new DataView(jpegBuf.buffer, jpegBuf.byteOffset, jpegBuf.byteLength);
  const result = parseExifFromDataView(view);

  assert.ok(result);
  assert.equal(result.source, "exif");
  // 6 + 21/60 + 58.68/3600 = 6.3663
  assert.ok(Math.abs(result.lat - 6.3663) < 0.0001);
  // 2 + 25/60 + 44.40/3600 = 2.4290
  assert.ok(Math.abs(result.lng - 2.4290) < 0.0001);
});

test("parseExifFromDataView - handles West and South references", () => {
  const jpegBuf = createMockExifJpeg({
    latDeg: 12,
    latMin: 30,
    latSec: 0,
    latRef: "S",
    lngDeg: 45,
    lngMin: 15,
    lngSec: 0,
    lngRef: "W",
    littleEndian: true,
  });

  const view = new DataView(jpegBuf.buffer, jpegBuf.byteOffset, jpegBuf.byteLength);
  const result = parseExifFromDataView(view);

  assert.ok(result);
  assert.ok(result.lat < 0);
  assert.ok(Math.abs(result.lat - (-12.5)) < 0.0001);
  assert.ok(result.lng < 0);
  assert.ok(Math.abs(result.lng - (-45.25)) < 0.0001);
});

test("extractExifGpsFromBuffer - handles non-jpeg or missing exif safely", () => {
  const nonJpeg = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  assert.equal(extractExifGpsFromBuffer(nonJpeg), null);

  const plainJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]);
  assert.equal(extractExifGpsFromBuffer(plainJpeg), null);
});

test("acquireBestPosition - extracts EXIF directly from buffer without throwing", async () => {
  const { acquireBestPosition } = await import("./geo.js");
  const jpegBuf = createMockExifJpeg({
    latDeg: 6,
    latMin: 30,
    latSec: 0,
    latRef: "N",
    lngDeg: 2,
    lngMin: 30,
    lngSec: 0,
    lngRef: "E",
    littleEndian: true,
  });

  const res = await acquireBestPosition(jpegBuf);
  assert.equal(res.source, "exif");
  assert.equal(res.lat, 6.5);
  assert.equal(res.lng, 2.5);
});

test("acquireBestPosition - falls back to fallbackCoords when EXIF and GPS missing without crashing", async () => {
  const { acquireBestPosition } = await import("./geo.js");
  const res = await acquireBestPosition(null, { lat: 6.37, lng: 2.43, precision_m: 15 });
  assert.equal(res.source, "fallback_coords");
  assert.equal(res.lat, 6.37);
  assert.equal(res.lng, 2.43);
});

test("acquireBestPosition - returns safe fallback object when completely offline/no gps without dropping photo", async () => {
  const { acquireBestPosition } = await import("./geo.js");
  const res = await acquireBestPosition(null, null);
  assert.equal(res.source, "none");
  assert.equal(res.lat, null);
  assert.equal(res.lng, null);
  assert.ok(res.warning);
});

test("reverseGeocode & reverseGeocodeZone - falls back to BigDataCloud on Nominatim HTTP 403 and caches result", async () => {
  const { reverseGeocode, reverseGeocodeZone } = await import("./geo.js");
  const origFetch = globalThis.fetch;
  const calledUrls = [];

  globalThis.fetch = async (url) => {
    calledUrls.push(String(url));
    if (String(url).includes("nominatim.openstreetmap.org")) {
      return { ok: false, status: 403 };
    }
    if (String(url).includes("api.bigdatacloud.net")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            locality: "Fidjrossè",
            city: "Cotonou",
            principalSubdivision: "Littoral",
            countryName: "Bénin",
          };
        },
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    const zone1 = await reverseGeocodeZone(6.3551, 2.3842);
    assert.equal(zone1, "Fidjrossè, Cotonou");
    const callsAfterFirst = calledUrls.length;
    assert.ok(callsAfterFirst >= 1);

    // Second call at same rounded coordinates must be served from cache (0 additional network calls)
    const fullAddr = await reverseGeocode(6.35511, 2.38421);
    assert.ok(fullAddr.includes("Fidjrossè"));
    assert.equal(calledUrls.length, callsAfterFirst);
  } finally {
    globalThis.fetch = origFetch;
  }
});
