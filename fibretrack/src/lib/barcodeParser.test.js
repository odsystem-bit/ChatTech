import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBarcode, cleanRawBarcode, extractOntDataFromText } from "./barcodeParser.js";

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
