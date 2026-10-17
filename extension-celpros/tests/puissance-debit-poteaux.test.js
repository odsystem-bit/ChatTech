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

  dispatchEvent(evt) {
    if (this._clickHandler && evt && evt.type === "click") {
      this._clickHandler(evt);
    }
    return true;
  }

  click() {
    if (this._clickHandler) this._clickHandler({ type: "click" });
    this.dispatchEvent({ type: "click" });
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
          if (p.startsWith("input")) {
            if (child.tagName.toLowerCase() !== "input") return false;
            if (p.includes(':not([type="file"])') && child.type === "file") return false;
            if (p.includes(':not([type="hidden"])') && child.type === "hidden") return false;
            if (p.includes('[type="file"]') && !p.includes(':not([type="file"])') && child.type !== "file") return false;
            return true;
          }
          if (p.includes('[type="file"]')) {
            return child.tagName.toLowerCase() === "input" && child.type === "file";
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

test("Section Poteaux - Remplissage dynamique avec bouton + et injection multi-poteaux", async () => {
  const root = new MockElement("div", { className: "form-step-4" });
  const cardRattachement = new MockElement("div", { className: "card" });
  
  // Section Poteaux telle que structurée sur CelPros (titre, bouton +, sous-titre)
  const poteauxBlock = new MockElement("div", { className: "col-12" });
  const headerRow = new MockElement("div", { className: "d-flex justify-content-between" });
  const title = new MockElement("span", { innerText: "Poteaux" });
  const addBtn = new MockElement("button", { innerText: "+", className: "btn btn-sm" });
  headerRow.appendChild(title);
  headerRow.appendChild(addBtn);

  const subtitle = new MockElement("div", { innerText: "Aucune photo — appuyez sur + pour ajouter (max 10)" });
  const slotsContainer = new MockElement("div", { className: "poteaux-slots-list" });

  poteauxBlock.appendChild(headerRow);
  poteauxBlock.appendChild(subtitle);
  poteauxBlock.appendChild(slotsContainer);
  cardRattachement.appendChild(poteauxBlock);
  root.appendChild(cardRattachement);

  // Simuler le comportement d'Angular lors du clic sur le bouton '+' : ajoute un slot d'upload
  let slotIndex = 0;
  addBtn._clickHandler = () => {
    slotIndex++;
    const slotWrap = new MockElement("div", { className: "upload-box" });
    const fileInput = new MockElement("input", {
      type: "file",
      id: `field_poteau_${slotIndex}`,
      name: `poteau_${slotIndex}`,
    });
    slotWrap.appendChild(fileInput);
    slotsContainer.appendChild(slotWrap);
  };

  const data = {
    points_gps: [
      { type: "Poteau", numero: 1, photo: "data:image/jpeg;base64,AAAA" },
      { type: "Poteau", numero: 2, photo: "data:image/jpeg;base64,BBBB" },
    ],
    whatsapp_photos: [
      { slot: "autre_poteau", name: "autre_poteau_1.jpg", url: "data:image/jpeg;base64,CCCC" },
    ],
  };

  const res = await PhotoFiller.fillPhotosOnPage(data, root);
  assert.ok(res.success);
  assert.equal(res.details.length, 3, "Les 3 poteaux (2 GPS + 1 Autre poteau) doivent être injectés");
  assert.equal(res.details[0].slot, "poteau_1");
  assert.equal(res.details[1].slot, "poteau_2");
  assert.equal(res.details[2].slot, "poteau_3");
});

test("Puissance FAT & PTO - Renseignement automatique des cases lors de l'injection des photos", async () => {
  const root = new MockElement("div", { className: "form-step-4" });
  
  // Ligne FAT
  const rowFat = new MockElement("div", { className: "row" });
  const colFatVal = new MockElement("div", { className: "col-6" });
  const labelFatVal = new MockElement("label", { innerText: "Valeur au FAT (dbm) *" });
  const inputFatVal = new MockElement("input", { type: "number", placeholder: "Ex: -18", id: "valeur_fat" });
  colFatVal.appendChild(labelFatVal);
  colFatVal.appendChild(inputFatVal);

  const colFatPhoto = new MockElement("div", { className: "col-6 upload-box" });
  const labelFatPhoto = new MockElement("label", { innerText: "Image mesure au FAT *" });
  const inputFatPhoto = new MockElement("input", { type: "file", id: "photo_mesure_fat" });
  colFatPhoto.appendChild(labelFatPhoto);
  colFatPhoto.appendChild(inputFatPhoto);

  rowFat.appendChild(colFatVal);
  rowFat.appendChild(colFatPhoto);

  // Ligne PTO
  const rowPto = new MockElement("div", { className: "row" });
  const colPtoVal = new MockElement("div", { className: "col-6" });
  const labelPtoVal = new MockElement("label", { innerText: "Valeur au PTO (dbm) *" });
  const inputPtoVal = new MockElement("input", { type: "number", placeholder: "Ex: -22", id: "valeur_pto" });
  colPtoVal.appendChild(labelPtoVal);
  colPtoVal.appendChild(inputPtoVal);

  const colPtoPhoto = new MockElement("div", { className: "col-6 upload-box" });
  const labelPtoPhoto = new MockElement("label", { innerText: "Image mesure PTO *" });
  const inputPtoPhoto = new MockElement("input", { type: "file", id: "photo_mesure_pto" });
  colPtoPhoto.appendChild(labelPtoPhoto);
  colPtoPhoto.appendChild(inputPtoPhoto);

  rowPto.appendChild(colPtoVal);
  rowPto.appendChild(colPtoPhoto);

  root.appendChild(rowFat);
  root.appendChild(rowPto);

  const data = {
    puissance_fat_dbm: -18.5,
    puissance_pto_dbm: -19.2,
    whatsapp_photos: [
      { slot: "mesure_fat", name: "mesure_fat.jpg", url: "data:image/jpeg;base64,ZHVtbXkx" },
      { slot: "mesure_pto", name: "mesure_pto.jpg", url: "data:image/jpeg;base64,ZHVtbXky" },
    ],
  };

  const res = await PhotoFiller.fillPhotosOnPage(data, root);
  assert.ok(res.success);
  assert.equal(inputFatVal.value, "-18.5", "La valeur FAT doit être automatiquement renseignée dans la case");
  assert.equal(inputPtoVal.value, "-19.2", "La valeur PTO doit être automatiquement renseignée dans la case");
});

test("Test débit Wi-Fi - Renseignement automatique des 3 cases (Montant, Descendant, Ping)", async () => {
  const root = new MockElement("div", { className: "form-step-3" });
  const cardWifi = new MockElement("div", { className: "card" });
  const cardTitle = new MockElement("h4", { innerText: "Tests de débits par Wifi" });
  cardWifi.appendChild(cardTitle);

  const rowInputs = new MockElement("div", { className: "row" });
  const inputUp = new MockElement("input", { placeholder: "Montant", id: "wifi_upload" });
  const inputDown = new MockElement("input", { placeholder: "Descendant", id: "wifi_download" });
  const inputPing = new MockElement("input", { placeholder: "Ping", id: "wifi_ping" });
  rowInputs.appendChild(inputUp);
  rowInputs.appendChild(inputDown);
  rowInputs.appendChild(inputPing);
  cardWifi.appendChild(rowInputs);

  const uploadBox = new MockElement("div", { className: "upload-box" });
  const labelBox = new MockElement("label", { innerText: "Image test débit Wifi" });
  const fileInput = new MockElement("input", { type: "file", id: "photo_debit_wifi" });
  uploadBox.appendChild(labelBox);
  uploadBox.appendChild(fileInput);
  cardWifi.appendChild(uploadBox);

  root.appendChild(cardWifi);

  const data = {
    debit_descendant: "48.26",
    debit_montant: "9.504",
    debit_ping: "18.99",
    whatsapp_photos: [
      { slot: "debit_wifi", name: "debit_wifi.jpg", url: "data:image/jpeg;base64,ZHVtbXk=" },
    ],
  };

  const res = await PhotoFiller.fillPhotosOnPage(data, root);
  assert.ok(res.success);
  assert.equal(inputDown.value, "48.26", "Débit descendant doit être renseigné");
  assert.equal(inputUp.value, "9.504", "Débit montant doit être renseigné");
  assert.equal(inputPing.value, "18.99", "Ping doit être renseigné");
});

test("Section Poteaux - Injection ordonnée stricte (Poteau 1, Poteau 2...) et coordonnées GPS respectives", async () => {
  const root = new MockElement("div", { className: "form-step-4" });
  const cardRattachement = new MockElement("div", { className: "card" });
  
  const poteauxBlock = new MockElement("div", { className: "col-12" });
  const headerRow = new MockElement("div", { className: "d-flex justify-content-between" });
  const title = new MockElement("span", { innerText: "Poteaux" });
  const addBtn = new MockElement("button", { innerText: "+", className: "btn btn-sm" });
  headerRow.appendChild(title);
  headerRow.appendChild(addBtn);

  const slotsContainer = new MockElement("div", { className: "poteaux-slots-list" });
  poteauxBlock.appendChild(headerRow);
  poteauxBlock.appendChild(slotsContainer);
  cardRattachement.appendChild(poteauxBlock);
  root.appendChild(cardRattachement);

  const createdCoordInputs = [];
  let slotIndex = 0;
  addBtn._clickHandler = () => {
    slotIndex++;
    const slotWrap = new MockElement("div", { className: "upload-box" });
    const fileInput = new MockElement("input", {
      type: "file",
      id: `field_poteau_${slotIndex}`,
      name: `poteau_${slotIndex}`,
    });
    const coordInput = new MockElement("input", {
      type: "text",
      id: `field_poteau_gps_${slotIndex}`,
      placeholder: "Coordonnées GPS",
    });
    createdCoordInputs.push(coordInput);
    slotWrap.appendChild(fileInput);
    slotWrap.appendChild(coordInput);
    slotsContainer.appendChild(slotWrap);
  };

  // Données avec Poteaux non ordonnés au départ dans points_gps + Autre poteau
  const data = {
    latitude: 6.380000,
    longitude: 2.610000,
    points_gps: [
      { type: "Poteau", numero: 2, lat: 6.386111, lng: 2.614222, photo: "data:image/jpeg;base64,ZHVtbXky" },
      { type: "Poteau", numero: 1, lat: 6.385448, lng: 2.612959, photo: "data:image/jpeg;base64,ZHVtbXkx" },
    ],
    whatsapp_photos: [
      { slot: "autre_poteau", name: "autre_poteau_1.jpg", lat: 6.387333, lng: 2.615444, url: "data:image/jpeg;base64,ZHVtbXkz" },
    ],
  };

  const res = await PhotoFiller.fillPhotosOnPage(data, root);
  assert.ok(res.success);
  assert.equal(res.details.length, 3, "Les 3 poteaux doivent être injectés");

  // Vérification de l'ordre strict : Poteau 1 d'abord, puis Poteau 2, puis Autre Poteau
  assert.equal(res.details[0].label, "Poteau 1");
  assert.equal(res.details[0].fileName, "poteau_1.jpg");
  assert.equal(createdCoordInputs[0].value, "6.385448, 2.612959", "Coordonnées GPS de Poteau 1 exactes");

  assert.equal(res.details[1].label, "Poteau 2");
  assert.equal(res.details[1].fileName, "poteau_2.jpg");
  assert.equal(createdCoordInputs[1].value, "6.386111, 2.614222", "Coordonnées GPS de Poteau 2 exactes");

  assert.equal(res.details[2].label, "Autre Poteau 1");
  assert.equal(res.details[2].fileName, "autre_poteau_1.jpg");
  assert.equal(createdCoordInputs[2].value, "6.387333, 2.615444", "Coordonnées GPS de Autre Poteau 1 exactes");
});

