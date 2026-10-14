import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBarcode, cleanRawBarcode, extractOntDataFromText, extractFatAndMsanFromText } from "./barcodeParser.js";
import { formatAddressZone } from "./geo.js";

describe("cleanRawBarcode", () => {
  it("cleans MAC prefix while preserving -AE(17) suffix", () => {
    assert.equal(cleanRawBarcode("MAC: 18D6DDF6719E-AE(17)"), "18D6DDF6719E-AE(17)");
    assert.equal(cleanRawBarcode("MAC:18D6DDF6719E-AE(17)"), "18D6DDF6719E-AE(17)");
    assert.equal(cleanRawBarcode("WAN MAC: 18D6DDF6719E-AE(17)"), "18D6DDF6719E-AE(17)");
    assert.equal(cleanRawBarcode("18D6DDF6719E-AE(17)"), "18D6DDF6719E-AE(17)");
  });

  it("cleans SN prefix while preserving Huawei SN", () => {
    assert.equal(cleanRawBarcode("SN: 485754437572231B8"), "485754437572231B8");
    assert.equal(cleanRawBarcode("S/N: 485754437572231B8"), "485754437572231B8");
    assert.equal(cleanRawBarcode("GPON SN: 485754437572231B8"), "485754437572231B8");
    assert.equal(cleanRawBarcode("485754437572231B8"), "485754437572231B8");
  });
});

describe("parseBarcode", () => {
  it("correctly identifies exact user MAC format", () => {
    const res = parseBarcode("18D6DDF6719E-AE(17)");
    assert.equal(res.type, "mac");
    assert.equal(res.value, "18D6DDF6719E-AE(17)");
  });

  it("correctly identifies exact user SN format", () => {
    const res = parseBarcode("485754437572231B8");
    assert.equal(res.type, "sn");
    assert.equal(res.value, "485754437572231B8");
  });

  it("identifies labeled MAC and SN", () => {
    const macRes = parseBarcode("MAC: 18D6DDF6719E-AE(17)");
    assert.equal(macRes.type, "mac");
    assert.equal(macRes.value, "18D6DDF6719E-AE(17)");

    const snRes = parseBarcode("SN: 485754437572231B8");
    assert.equal(snRes.type, "sn");
    assert.equal(snRes.value, "485754437572231B8");
  });

  it("identifies ZTE and other vendor SNs", () => {
    const zteRes = parseBarcode("ZTEGC8923412");
    assert.equal(zteRes.type, "sn");
    assert.equal(zteRes.value, "ZTEGC8923412");

    const zteHexRes = parseBarcode("5A544547C8923412");
    assert.equal(zteHexRes.type, "sn");
    assert.equal(zteHexRes.value, "5A544547C8923412");
  });
});

describe("extractOntDataFromText (OCR extraction)", () => {
  it("extracts exact MAC and SN from multi-line label text", () => {
    const labelText = `
      HUAWEI EchoLife EG8145V5
      GPON Terminal
      MAC: 18D6DDF6719E-AE(17)
      SN: 485754437572231B8
      POWER: 12V 1.5A
    `;
    const res = extractOntDataFromText(labelText);
    assert.equal(res.mac, "18D6DDF6719E-AE(17)");
    assert.equal(res.sn, "485754437572231B8");
  });

  it("extracts MAC and SN even with noisy OCR spaces or missing colons", () => {
    const labelText = `
      MAC 18D6DDF6719E-AE(17)
      S/N 485754437572231B8
    `;
    const res = extractOntDataFromText(labelText);
    assert.equal(res.mac, "18D6DDF6719E-AE(17)");
    assert.equal(res.sn, "485754437572231B8");
  });

  it("extracts raw values without labels when pattern matches", () => {
    const rawText = `
      18D6DDF6719E-AE(17)
      485754437572231B8
    `;
    const res = extractOntDataFromText(rawText);
    assert.equal(res.mac, "18D6DDF6719E-AE(17)");
    assert.equal(res.sn, "485754437572231B8");
  });

  it("extracts colon-separated MAC and vendor SN", () => {
    const text = `
      MAC: 54:83:3A:4B:2C:1D
      GPON SN: HWTC7572231B8
    `;
    const res = extractOntDataFromText(text);
    assert.equal(res.mac, "54:83:3A:4B:2C:1D");
    assert.equal(res.sn, "HWTC7572231B8");
  });

  it("handles side-by-side MAC and SN on single line", () => {
    const text = "MAC: 18D6DDF6719E-AE(17) SN: 485754437572231B8";
    const res = extractOntDataFromText(text);
    assert.equal(res.mac, "18D6DDF6719E-AE(17)");
    assert.equal(res.sn, "485754437572231B8");
  });

  it("handles lowercase inputs safely", () => {
    const res = parseBarcode("18d6ddf6719e-ae(17)");
    assert.equal(res.type, "mac");
    assert.equal(res.value, "18d6ddf6719e-ae(17)");

    const resSn = parseBarcode("485754437572231b8");
    assert.equal(resSn.type, "sn");
    assert.equal(resSn.value, "485754437572231b8");
  });

  it("handles noisy spaces around hyphens and parentheses in OCR", () => {
    const text1 = "MAC: 18D6DDF6719E - AE(17)\nSN: 485754437572231B8";
    const res1 = extractOntDataFromText(text1);
    assert.equal(res1.mac, "18D6DDF6719E-AE(17)");

    const text2 = "MAC: 18D6DDF6719E-AE (17)\nSN: 485754437572231B8";
    const res2 = extractOntDataFromText(text2);
    assert.equal(res2.mac, "18D6DDF6719E-AE(17)");
  });

  it("handles spaces inside SN from OCR segmentation", () => {
    const text = "MAC: 18D6DDF6719E-AE(17)\nSN: 4857 5443 7572 231B 8";
    const res = extractOntDataFromText(text);
    assert.equal(res.sn, "485754437572231B8");
  });

  it("handles parenthetical vendor SN on label", () => {
    const text = "SN: 485754437572231B8 (HWTC7572231B)\nMAC: 18D6DDF6719E-AE(17)";
    const res = extractOntDataFromText(text);
    assert.equal(res.mac, "18D6DDF6719E-AE(17)");
    assert.equal(res.sn, "485754437572231B8");
  });

  it("handles trailing punctuation artifacts without corrupting codes", () => {
    const text = "MAC: 18D6DDF6719E-AE(17).\nSN: 485754437572231B8,";
    const res = extractOntDataFromText(text);
    assert.equal(res.mac, "18D6DDF6719E-AE(17)");
    assert.equal(res.sn, "485754437572231B8");

    const pMac = parseBarcode("18D6DDF6719E-AE(17).");
    assert.equal(pMac.type, "mac");
    assert.equal(pMac.value, "18D6DDF6719E-AE(17)");

    const pSn = parseBarcode("485754437572231B8.");
    assert.equal(pSn.type, "sn");
    assert.equal(pSn.value, "485754437572231B8");
  });

  it("extracts embedded codes without labels and preserves closing parenthesis", () => {
    const text = "ONT BOX 18D6DDF6719E-AE(17) 485754437572231B8";
    const res = extractOntDataFromText(text);
    assert.equal(res.mac, "18D6DDF6719E-AE(17)");
    assert.equal(res.sn, "485754437572231B8");
  });

  it("handles null, empty, and undefined gracefully", () => {
    assert.deepEqual(extractOntDataFromText(null), { mac: null, sn: null });
    assert.deepEqual(extractOntDataFromText(""), { mac: null, sn: null });
    assert.deepEqual(parseBarcode(null), { type: "unknown", value: "", raw: "" });
  });
});

describe("extractFatAndMsanFromText (FAT OCR extraction)", () => {
  it("extracts labeled FAT and MSAN correctly", () => {
    const text = `
      MSAN: OGA-04
      FAT: FAT-123
    `;
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "OGA-04");
    assert.equal(res.fat_ref, "FAT-123");
  });

  it("extracts MSAN on top and FAT below without colons", () => {
    const text = `
      OGA-CADJEHOUN-02
      FAT 04
    `;
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "OGA-CADJEHOUN-02");
    assert.equal(res.fat_ref, "FAT 04");
  });

  it("extracts MSAN and FAT codes with slashes and dots", () => {
    const text = `
      MSAN : OGA_10/01
      REF FAT : FAT-02/A.
    `;
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "OGA_10/01");
    assert.equal(res.fat_ref, "FAT-02/A");
  });

  it("extracts standalone OGA and FAT codes", () => {
    const text = "Photo PBO OGA01 et FAT-08 sur poteau";
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "OGA01");
    assert.equal(res.fat_ref, "FAT-08");
  });

  it("handles MSAN on top and raw number on line below", () => {
    const text = `
      OGA-12
      04
    `;
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "OGA-12");
    assert.equal(res.fat_ref, "FAT-04");
  });

  it("corrects OCR confusion 0GA to OGA", () => {
    const text = `
      0GA-05
      FAT-01
    `;
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "OGA-05");
    assert.equal(res.fat_ref, "FAT-01");
  });

  it("extracts ORGA MSAN on top and FAT below (cahier des charges Benin)", () => {
    const text = `
      ORGA-PL51
      FAT 164
    `;
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "ORGA-PL51");
    assert.equal(res.fat_ref, "FAT 164");
  });

  it("extracts ORGA with space and raw number on line below", () => {
    const text = `
      ORGA 12
      164
    `;
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "ORGA 12");
    assert.equal(res.fat_ref, "FAT-164");
  });

  it("corrects OCR confusion 0RGA to ORGA", () => {
    const text = `
      0RGA-PL51
      FAT 164
    `;
    const res = extractFatAndMsanFromText(text);
    assert.equal(res.msan, "ORGA-PL51");
    assert.equal(res.fat_ref, "FAT 164");
  });

  it("filters out GPS banner metadata and extracts true ORGA and FAT", () => {
    const textWithGpsBanner = `
      Boîtier FAT - DOSSOU ABELLANGE
      Lieu: Cadjehoun, Cotonou
      Lat: 6.365412 Lng: 2.412587
      Précision: ±2.5 m - 14/10/2026 15:30:00
      ORGA-PL51
      FAT 164
    `;
    const res = extractFatAndMsanFromText(textWithGpsBanner);
    assert.equal(res.msan, "ORGA-PL51");
    assert.equal(res.fat_ref, "FAT 164");
  });

  it("handles null, empty, or undefined input safely", () => {
    assert.deepEqual(extractFatAndMsanFromText(null), { fat_ref: null, msan: null });
    assert.deepEqual(extractFatAndMsanFromText(""), { fat_ref: null, msan: null });
    assert.deepEqual(extractFatAndMsanFromText(undefined), { fat_ref: null, msan: null });
  });
});

describe("formatAddressZone (Reverse Geocoding Zone)", () => {
  it("formats suburb and city correctly", () => {
    const json = {
      address: {
        suburb: "Haie Vive",
        city: "Cotonou",
        country: "Bénin",
      },
    };
    assert.equal(formatAddressZone(json), "Haie Vive, Cotonou");
  });

  it("formats neighbourhood and town correctly", () => {
    const json = {
      address: {
        neighbourhood: "Fidjrossè",
        city: "Cotonou",
      },
    };
    assert.equal(formatAddressZone(json), "Fidjrossè, Cotonou");
  });

  it("handles quarter with municipality or district", () => {
    const json = {
      address: {
        quarter: "Agla",
        municipality: "Cotonou",
      },
    };
    assert.equal(formatAddressZone(json), "Agla, Cotonou");
  });

  it("does not repeat if suburb and city have the same name", () => {
    const json = {
      address: {
        suburb: "Cotonou",
        city: "Cotonou",
      },
    };
    assert.equal(formatAddressZone(json), "Cotonou");
  });

  it("falls back to first parts of display_name if address details missing", () => {
    const json = {
      display_name: "Zone Résidentielle, Cotonou, Littoral, Bénin",
    };
    assert.equal(formatAddressZone(json), "Zone Résidentielle, Cotonou");
  });

  it("handles null and empty objects gracefully", () => {
    assert.equal(formatAddressZone(null), "");
    assert.equal(formatAddressZone({}), "");
    assert.equal(formatAddressZone(undefined), "");
  });
});


