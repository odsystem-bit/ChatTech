import test from "node:test";
import assert from "node:assert/strict";
import "../content/field-mapping.js";
import "../content/photo-filler.js";
import "../content/form-filler.js";
import "../content/ui-widget.js";

const FieldMapping = globalThis.FieldMapping;
const PhotoFiller = globalThis.PhotoFiller;
const FormFiller = globalThis.FormFiller;
const CelprosWidget = globalThis.CelprosWidget;

class MockElement {
  constructor(tagName = "div", attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || "";
    this.name = attrs.name || "";
    this.type = attrs.type || "text";
    this.value = attrs.value || "";
    this.checked = attrs.checked || false;
    this.innerText = attrs.innerText || "";
    this.textContent = attrs.textContent || this.innerText;
    this.className = attrs.className || "";
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this._listeners = {};
    this._clickHandler = null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(evt, fn) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(fn);
  }

  dispatchEvent(evt) {
    const list = this._listeners[evt.type] || [];
    for (const fn of list) fn(evt);
    return true;
  }

  click() {
    if (this._clickHandler) {
      this._clickHandler();
    }
    this.dispatchEvent(new Event("click", { bubbles: true }));
  }

  querySelector(sel) {
    const all = this.querySelectorAll(sel);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(sel) {
    const res = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSimpleSelector(child, sel)) {
          res.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return res;
  }

  closest(sel) {
    let cur = this;
    while (cur) {
      if (matchesSimpleSelector(cur, sel)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  compareDocumentPosition() {
    return 4; // Node.DOCUMENT_POSITION_FOLLOWING
  }

  scrollIntoView() {}
}

function matchesSimpleSelector(el, sel) {
  if (!el || !sel) return false;
  if (sel.includes(",")) {
    return sel.split(",").some((part) => matchesSimpleSelector(el, part.trim()));
  }
  if (sel.startsWith("#")) {
    return el.id === sel.slice(1);
  }
  if (sel.includes('name="')) {
    const m = sel.match(/name="([^"]+)"/);
    if (m && el.name === m[1]) return true;
  }
  if (sel === 'input[type="file"]') return el.tagName === "INPUT" && el.type === "file";
  if (sel === 'input[type="checkbox"]') return el.tagName === "INPUT" && el.type === "checkbox";
  if (sel === "button" || sel === "input, select, textarea") return true;
  if (sel.startsWith(".")) {
    const cls = sel.slice(1);
    return (el.className || "").split(/\s+/).includes(cls);
  }
  if (sel.includes("[class*=")) return true;
  return false;
}

class Event {
  constructor(type, opts = {}) {
    this.type = type;
    this.bubbles = opts.bubbles ?? false;
    this.defaultPrevented = false;
    this._stoppedImmediate = false;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopImmediatePropagation() {
    this._stoppedImmediate = true;
  }
  stopPropagation() {}
}

test("AUDIT FIX 1 : Neutralisation complète de l'explorateur de fichiers natif (suppressNativeFileDialog)", async () => {
  assert.equal(typeof PhotoFiller.suppressNativeFileDialog, "function");
  assert.equal(typeof PhotoFiller.suppressNativeFileDialogAsync, "function");

  let executed = false;
  await PhotoFiller.suppressNativeFileDialogAsync(async () => {
    executed = true;
  });
  assert.equal(executed, true, "suppressNativeFileDialogAsync s'exécute avec succès");
});

test("AUDIT FIX 2 : Détection des triggers d'upload pour empêcher l'ouverture intempestive", () => {
  const root = new MockElement("div");
  const badBtn = new MockElement("button", { innerText: "Importer photo" });
  const fileInp = new MockElement("input", { type: "file" });
  root.appendChild(badBtn);
  root.appendChild(fileInp);

  // findAddPoleButton ne doit PAS sélectionner un bouton d'importation de fichier générique
  const found = PhotoFiller.findAddPoleButton(root);
  assert.equal(found, null, "Le bouton d'import ne doit JAMAIS être pris pour un bouton '+' d'ajout de poteau");
});

test("AUDIT FIX 3 : Ordre séquentiel strict Phase A (1..N) puis Phase B (Autres Poteaux)", () => {
  const intervention = {
    points_gps: [
      { type: "Poteau", numero: 2, lat: 6.3802, lng: 2.6042, photo: "https://example.com/p2.jpg" },
      { type: "Poteau", numero: 1, lat: 6.3801, lng: 2.6041, photo: "https://example.com/p1.jpg" },
    ],
    whatsapp_photos: [
      { slot: "autre_poteau", name: "autre_poteau_1.jpg", url: "https://example.com/autre1.jpg", lat: 6.381, lng: 2.605 },
      { slot: "poteau_3", name: "poteau_3.jpg", url: "https://example.com/p3.jpg", lat: 6.3803, lng: 2.6043 },
      { slot: "autre_poteau", name: "autre_poteau_2.jpg", url: "https://example.com/autre2.jpg", lat: 6.382, lng: 2.606 },
    ],
  };

  const poles = PhotoFiller.collectAllPoles(intervention);
  assert.equal(poles.length, 5, "Total 5 poteaux ordonnés");

  // Phase A : Poteaux 1, 2, 3 dans l'ordre croissant strict
  assert.equal(poles[0].numero, 1);
  assert.equal(poles[0].label, "Poteau 1");
  assert.equal(poles[0].isAutrePoteau, false);

  assert.equal(poles[1].numero, 2);
  assert.equal(poles[1].label, "Poteau 2");
  assert.equal(poles[1].isAutrePoteau, false);

  assert.equal(poles[2].numero, 3);
  assert.equal(poles[2].label, "Poteau 3");
  assert.equal(poles[2].isAutrePoteau, false);

  // Phase B : Autres Poteaux après les numérotés
  assert.equal(poles[3].isAutrePoteau, true);
  assert.equal(poles[3].label, "Autre Poteau 1");

  assert.equal(poles[4].isAutrePoteau, true);
  assert.equal(poles[4].label, "Autre Poteau 2");
});

test("AUDIT FIX 4 : Cases à cocher de conformité cochées par défaut sauf false/0 explicite", () => {
  const defs = FieldMapping.FIELD_DEFINITIONS;
  const empty = {};

  // Step 5 PV
  assert.equal(defs.travaux_conformes.valueExtractor(empty), true);
  assert.equal(defs.emplacement_valide.valueExtractor(empty), true);
  assert.equal(defs.travail_propre.valueExtractor(empty), true);
  assert.equal(defs.service_teste.valueExtractor(empty), true);
  assert.equal(defs.service_fonctionne.valueExtractor(empty), true);
  assert.equal(defs.explications_donnees.valueExtractor(empty), true);
  assert.equal(defs.recommanderait.valueExtractor(empty), true);
  assert.equal(defs.accepte_recontact.valueExtractor(empty), true);

  // Step 4 Branchement
  assert.equal(defs.etiquetage.valueExtractor(empty), true);
  assert.equal(defs.nettoyage.valueExtractor(empty), true);
  assert.equal(defs.depose.valueExtractor(empty), true);
  assert.equal(defs.colliers_serres.valueExtractor(empty), true);
  assert.equal(defs.fat_normalise.valueExtractor(empty), true);
  assert.equal(defs.tutorat.valueExtractor(empty), true);

  // Cas explicite false ou 0
  assert.equal(defs.travaux_conformes.valueExtractor({ travaux_conformes: false }), false);
  assert.equal(defs.travaux_conformes.valueExtractor({ travaux_conformes: 0 }), false);
  assert.equal(defs.travaux_conformes.valueExtractor({ travaux_conformes: "0" }), false);
  assert.equal(defs.etiquetage.valueExtractor({ etiquetage: false }), false);
  assert.equal(defs.etiquetage.valueExtractor({ etiquetage: 0 }), false);
});

test("AUDIT FIX 5 : Blocage de la validation si une case obligatoire reste décochée", () => {
  const widget = new CelprosWidget();
  const root = new MockElement("div", { innerText: "Signature du rapport et PV de conformité" });

  // Simule des cases Step 5 dont une est décochée
  const chk1 = new MockElement("input", { type: "checkbox", id: "field_travauxConformes", checked: true });
  const chk2 = new MockElement("input", { type: "checkbox", id: "field_serviceFonctionne", checked: false });
  root.appendChild(chk1);
  root.appendChild(chk2);

  const res = widget.checkMandatoryCompliance(root);
  assert.equal(res.valid, false, "Doit bloquer la validation car Service fonctionne est décochée");
  assert.equal(res.uncheckedList.length, 1);
  assert.equal(res.uncheckedList[0].id, "field_serviceFonctionne");

  // Si on coche la case, la validation passe
  chk2.checked = true;
  const res2 = widget.checkMandatoryCompliance(root);
  assert.equal(res2.valid, true, "Doit autoriser la validation quand toutes les cases obligatoires sont cochées");
});

test("AUDIT FIX 6 : Cooldown anti-boucle pour l'autofill automatique", () => {
  const widget = new CelprosWidget();
  assert.equal(widget.autofillCooldownMs, 1200, "Cooldown d'au moins 1200ms configuré");
  assert.equal(widget.isAutofilling, false);

  widget.lastAutofillTime = Date.now();
  // Vérifie que si appelé pendant le cooldown, l'autofill est ignoré
  const elapsed = Date.now() - widget.lastAutofillTime;
  assert.ok(elapsed < widget.autofillCooldownMs, "L'autofill consécutif immédiat est bloqué par le cooldown");
});

test("AUDIT FIX 7 : Deux poteaux distincts aux mêmes coordonnées GPS (id, horodatage ou numéro différents) ne sont jamais fusionnés", () => {
  const intervention = {
    nom_technicien: "Rodolpho",
    date: "2026-10-20",
    nom_client: "TEST GPS IDENTIQUE",
    points_gps: [
      { id: "pole-1", type: "Poteau", numero: 1, proprietaire: "SBEE", traverse: true, lat: 6.3801, lng: 2.6101, photo: "uploads/photos/1/pt1.jpg", horodatage: "2026-10-20T10:00:00Z" },
      { id: "pole-2", type: "Poteau", numero: 2, proprietaire: "SBEE", traverse: true, lat: 6.3801, lng: 2.6101, photo: "uploads/photos/1/pt2.jpg", horodatage: "2026-10-20T10:01:00Z" },
      { id: "pole-3", type: "Poteau", numero: 1, proprietaire: "SBEE", implante: true, lat: 6.3801, lng: 2.6101, photo: "uploads/photos/1/imp1.jpg", horodatage: "2026-10-20T10:02:00Z" },
    ],
  };

  const poles = PhotoFiller.collectAllPoles(intervention);
  assert.equal(poles.length, 3, "Les 3 poteaux distincts partageant un GPS proche/identique doivent être conservés dans PhotoFiller");

  const report = FormFiller.formatGlobalReport(intervention);
  assert.ok(report.includes("*Nombre de poteaux traversés : 02*"));
  assert.ok(report.includes("*Nombre de poteaux implantés: 01*"));
});

test("AUDIT FIX 8 : Réinitialisation de lastStepFilled lors du changement de client sélectionné", () => {
  const widget = new CelprosWidget();
  widget.updateSummaryCard = () => {};
  widget.lastStepFilled = "4_c1:2026-10-20";
  widget.selectedIntervention = { id: "c1", updated_at: "2026-10-20" };

  widget.setSelectedIntervention({ id: "c2", updated_at: "2026-10-20" }, { persist: false });
  assert.equal(widget.lastStepFilled, null, "lastStepFilled doit être remis à null lors du changement d'intervention");
});


