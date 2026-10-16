import test from "node:test";
import assert from "node:assert/strict";
import "../content/field-mapping.js";
import "../content/photo-filler.js";

const FieldMapping = globalThis.FieldMapping;
const PhotoFiller = globalThis.PhotoFiller;

// Mock DOM simple
class MockElement {
  constructor(tagName = "div", attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || "";
    this.name = attrs.name || "";
    this.type = attrs.type || (tagName.toLowerCase() === "input" ? "text" : "");
    this.value = attrs.value || "";
    this.placeholder = attrs.placeholder || "";
    this.className = attrs.className || "";
    this.attributes = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.previousElementSibling = null;
    this.nextElementSibling = null;
    this.files = attrs.files || [];
    this.style = {};
    this.innerText = attrs.innerText || "";
    this.textContent = attrs.innerText || "";
    this.events = {};
  }

  getAttribute(k) {
    return this.attributes[k] || this.attributes[k.toLowerCase()] || null;
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
  }

  appendChild(child) {
    if (!child) return;
    child.parentElement = this;
    if (this.children.length > 0) {
      const prev = this.children[this.children.length - 1];
      prev.nextElementSibling = child;
      child.previousElementSibling = prev;
    }
    this.children.push(child);
  }

  closest(selector) {
    let curr = this;
    const selLower = selector.toLowerCase();
    while (curr) {
      const tagMatch = selLower.split(",").some((part) => {
        const p = part.trim();
        if (p.startsWith(".")) {
          return (curr.className || "").toLowerCase().includes(p.slice(1));
        }
        return curr.tagName.toLowerCase() === p;
      });
      if (tagMatch) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const selParts = selector.split(",").map((s) => s.trim().toLowerCase());

    function traverse(node) {
      for (const child of node.children) {
        const match = selParts.some((p) => {
          if (p.startsWith(".")) {
            return (child.className || "").toLowerCase().includes(p.slice(1));
          }
          if (p.includes('[type="file"]')) {
            return child.tagName.toLowerCase() === "input" && child.type === "file";
          }
          if (p.startsWith("input")) {
            return child.tagName.toLowerCase() === "input";
          }
          if (p.startsWith("button")) {
            return child.tagName.toLowerCase() === "button";
          }
          return child.tagName.toLowerCase() === p;
        });
        if (match) results.push(child);
        traverse(child);
      }
    }

    traverse(this);
    return results;
  }

  dispatchEvent(evt) {
    if (!this.events[evt.type]) this.events[evt.type] = [];
    this.events[evt.type].push(evt);
  }

  click() {
    this.dispatchEvent({ type: "click" });
    if (this._clickHandler) this._clickHandler();
  }
}

test("Puissance FAT et PTO - Appariement fiable côte à côte sans disqualification", () => {
  const container = new MockElement("div", { className: "row" });

  const colFat = new MockElement("div", { className: "col-md-6 form-group" });
  const labelFat = new MockElement("label", { innerText: "Valeur au FAT (dbm)" });
  const inputFat = new MockElement("input", {
    type: "number",
    id: "field_valeurFat",
    placeholder: "Ex: -18",
  });
  colFat.appendChild(labelFat);
  colFat.appendChild(inputFat);

  const colPto = new MockElement("div", { className: "col-md-6 form-group" });
  const labelPto = new MockElement("label", { innerText: "Valeur au PTO (dbm)" });
  const inputPto = new MockElement("input", {
    type: "number",
    id: "field_valeurPto",
    placeholder: "Ex: -22",
  });
  colPto.appendChild(labelPto);
  colPto.appendChild(inputPto);

  container.appendChild(colFat);
  container.appendChild(colPto);

  const data = {
    puissance_fat_dbm: -18.5,
    puissance_pto_dbm: -19.2,
  };

  const matchFat = FieldMapping.matchElementToField(inputFat, data);
  assert.ok(matchFat, "Le champ FAT doit matcher");
  assert.equal(matchFat.definition.key, "puissance_fat_dbm");
  assert.equal(matchFat.definition.valueExtractor(data), "-18.5");

  const matchPto = FieldMapping.matchElementToField(inputPto, data);
  assert.ok(matchPto, "Le champ PTO doit matcher et ne pas être disqualifié");
  assert.equal(matchPto.definition.key, "puissance_pto_dbm");
  assert.equal(matchPto.definition.valueExtractor(data), "-19.2");
});

test("Débits Étape 3 - Appariement et extraction fidèle Montant, Descendant, Ping", () => {
  const data = {
    debit_descendant: "48.26",
    debit_montant: "9.504",
    debit_ping: "18.99",
  };

  const inputDown = new MockElement("input", {
    type: "number",
    placeholder: "Ex: 50",
  });
  const labelDown = new MockElement("label", { innerText: "Descendant (Mb/s)" });
  const groupDown = new MockElement("div", { className: "form-group" });
  groupDown.appendChild(labelDown);
  groupDown.appendChild(inputDown);

  const matchDown = FieldMapping.matchElementToField(inputDown, data);
  assert.ok(matchDown, "Descendant doit être reconnu");
  assert.equal(matchDown.definition.key, "debit_descendant");
  assert.equal(matchDown.definition.valueExtractor(data), "48.26");

  const inputUp = new MockElement("input", {
    type: "number",
    placeholder: "Ex: 10",
  });
  const labelUp = new MockElement("label", { innerText: "Montant (Mb/s)" });
  const groupUp = new MockElement("div", { className: "form-group" });
  groupUp.appendChild(labelUp);
  groupUp.appendChild(inputUp);

  const matchUp = FieldMapping.matchElementToField(inputUp, data);
  assert.ok(matchUp, "Montant doit être reconnu");
  assert.equal(matchUp.definition.key, "debit_montant");
  assert.equal(matchUp.definition.valueExtractor(data), "9.504");

  const inputPing = new MockElement("input", {
    type: "number",
    placeholder: "Ex: 20",
  });
  const labelPing = new MockElement("label", { innerText: "Ping (ms)" });
  const groupPing = new MockElement("div", { className: "form-group" });
  groupPing.appendChild(labelPing);
  groupPing.appendChild(inputPing);

  const matchPing = FieldMapping.matchElementToField(inputPing, data);
  assert.ok(matchPing, "Ping doit être reconnu");
  assert.equal(matchPing.definition.key, "debit_ping");
  assert.equal(matchPing.definition.valueExtractor(data), "18.99");
});

test("Section Poteaux - Agrégation des Poteaux GPS et du dossier Autre poteau", () => {
  const data = {
    points_gps: [
      { type: "Poteau", numero: 1, photo: "data:image/jpeg;base64,AAA" },
      { type: "Poteau", numero: 2, photo: "data:image/jpeg;base64,BBB" },
    ],
    whatsapp_photos: [
      { slot: "autre_poteau", name: "autre_poteau_1.jpg", url: "data:image/jpeg;base64,CCC" },
      { slot: "autre_poteau_2", name: "autre_poteau_2.jpg", url: "data:image/jpeg;base64,DDD" },
      { slot: "fat", name: "fat.jpg", url: "data:image/jpeg;base64,FAT" },
    ],
  };

  const eligible = PhotoFiller.getEligibleWhatsappPhotos(data);
  assert.equal(eligible.length, 3);
});
