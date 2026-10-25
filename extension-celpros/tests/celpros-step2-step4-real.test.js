import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import '../content/field-mapping.js';
import '../content/photo-filler.js';
import '../content/form-filler.js';

const FieldMapping = globalThis.FieldMapping;
const PhotoFiller = globalThis.PhotoFiller;
const FormFiller = globalThis.FormFiller;

// Mock DOM minimal et robuste pour les tests
class MockElement {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || '';
    this.name = attrs.name || '';
    this.type = attrs.type || 'text';
    this.value = attrs.value || '';
    this.checked = Boolean(attrs.checked);
    this.innerText = attrs.innerText || '';
    this.textContent = attrs.textContent || attrs.innerText || '';
    this.className = attrs.className || '';
    this.placeholder = attrs.placeholder || '';
    this.attributes = { ...attrs };
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.files = [];
    this.classList = {
      contains: (c) => (this.className || '').split(/\s+/).includes(c),
    };
  }

  getAttribute(attr) {
    return this.attributes[attr] || null;
  }

  setAttribute(attr, val) {
    this.attributes[attr] = val;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  closest(selector) {
    const list = selector.split(',').map((s) => s.trim().toLowerCase());
    let curr = this;
    while (curr) {
      for (const sel of list) {
        if (sel === 'div' && curr.tagName === 'DIV') return curr;
        if (sel === 'button' && curr.tagName === 'BUTTON') return curr;
        if (sel === 'a' && curr.tagName === 'A') return curr;
        if (sel === '.card' && curr.classList.contains('card')) return curr;
        if (sel === 'div.col-12' && curr.tagName === 'DIV' && curr.classList.contains('col-12')) return curr;
        if (sel === '.col-12' && curr.classList.contains('col-12')) return curr;
        if (sel === '.d-flex' && curr.classList.contains('d-flex')) return curr;
        if (sel === '.row' && curr.classList.contains('row')) return curr;
        if (sel === 'section' && curr.tagName === 'SECTION') return curr;
        if (sel === 'form' && curr.tagName === 'FORM') return curr;
        if (sel.startsWith('.') && curr.classList.contains(sel.slice(1))) return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        let match = false;
        if (selector === 'input[type="file"]') {
          if (child.tagName === 'INPUT' && child.type === 'file') match = true;
        } else if (selector.includes('input:not([type="file"])')) {
          if (child.tagName === 'INPUT' && child.type !== 'file') match = true;
        } else if (selector.includes('input') && child.tagName === 'INPUT') {
          match = true;
        } else if (selector.includes('button') && (child.tagName === 'BUTTON' || child.classList.contains('btn') || child.tagName === 'I' || child.tagName === 'SPAN')) {
          match = true;
        } else if (selector.includes('h1') && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'SPAN', 'DIV'].includes(child.tagName)) {
          match = true;
        }
        if (match) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] || null;
  }

  click() {
    this.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
  }

  dispatchEvent(event) {
    if (event.type === 'click' && typeof this._clickHandler === 'function') {
      this._clickHandler(event);
    }
    return true;
  }

  compareDocumentPosition(other) {
    return 4; // DOCUMENT_POSITION_FOLLOWING
  }
}

if (!globalThis.Event) {
  globalThis.Event = class {
    constructor(type, opts = {}) {
      this.type = type;
      this.bubbles = opts.bubbles || false;
    }
  };
}
if (!globalThis.MouseEvent) {
  globalThis.MouseEvent = class {
    constructor(type, opts = {}) {
      this.type = type;
      this.bubbles = opts.bubbles || false;
    }
  };
}

// Mock fetch pour éviter les latences réseau pendant les tests unitaires
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, ...args) => {
  if (typeof url === 'string' && url.includes('fibretrack.mantota.com/api/uploads/')) {
    return {
      ok: true,
      blob: async () => new Blob(['dummy'], { type: 'image/jpeg' }),
    };
  }
  return originalFetch ? originalFetch(url, ...args) : { ok: true, blob: async () => new Blob(['']) };
};

const mockRealIntervention = {
  id: 'test-real-id',
  ont_sn: '4857544329E2E5B8',
  mac: '9025F247C8D3-E3(17)',
  lineaire_m: 150,
  latitude_fat: 6.37915,
  longitude_fat: 2.60443,
  materiel_pose: JSON.stringify({
    crochets: 4,
    piton: 1,
    ont: 1,
  }),
  points_gps: JSON.stringify([
    { type: 'FAT', lat: 6.37915, lng: 2.60443 },
    { type: 'Poteau', numero: 1, type_poteau: 'Petit Jean', lat: 6.379530, lng: 2.604204, photo: 'https://fibretrack.mantota.com/api/uploads/photos/p1.jpg' },
    { type: 'Poteau', numero: 2, type_poteau: 'Petit Jean', lat: 6.379530, lng: 2.604197, photo: 'https://fibretrack.mantota.com/api/uploads/photos/p2.jpg' },
    { type: 'Abonné', lat: 6.3796, lng: 2.6043 },
  ]),
  whatsapp_photos: JSON.stringify([
    { slot: 'fat', type: 'fat', url: 'https://fibretrack.mantota.com/api/uploads/photos/fat.jpg' },
    { slot: 'scan_fat', type: 'scan_fat', url: 'https://fibretrack.mantota.com/api/uploads/photos/scan_fat.jpg' },
    { slot: 'cable_interne', type: 'cable_interne', url: 'https://fibretrack.mantota.com/api/uploads/photos/cable_int.jpg' },
    { slot: 'cable_externe', type: 'cable_externe', url: 'https://fibretrack.mantota.com/api/uploads/photos/cable_ext.jpg' },
    { slot: 'fibre_fat', type: 'fibre_fat', url: 'https://fibretrack.mantota.com/api/uploads/photos/fibre_fat.jpg' },
    { slot: 'mesure_fat', type: 'mesure_fat', url: 'https://fibretrack.mantota.com/api/uploads/photos/mesure_fat.jpg' },
    { slot: 'mesure_pto', type: 'mesure_pto', url: 'https://fibretrack.mantota.com/api/uploads/photos/mesure_pto.jpg' },
    { slot: 'poteau_1', type: 'poteau', numero: 1, url: 'https://fibretrack.mantota.com/api/uploads/photos/p1.jpg', lat: 6.379530, lng: 2.604204 },
    { slot: 'poteau_2', type: 'poteau', numero: 2, url: 'https://fibretrack.mantota.com/api/uploads/photos/p2.jpg', lat: 6.379530, lng: 2.604197 },
    { slot: 'autre_poteau_1', type: 'autre_poteau', url: 'https://fibretrack.mantota.com/api/uploads/photos/ap1.jpg', lat: 6.428008, lng: 2.293967 },
    { slot: 'autre_poteau_2', type: 'autre_poteau', url: 'https://fibretrack.mantota.com/api/uploads/photos/ap2.jpg', lat: 6.379468, lng: 2.604227 },
    { slot: 'autre_poteau_3', type: 'autre_poteau', url: 'https://fibretrack.mantota.com/api/uploads/photos/ap3.jpg', lat: 6.379531, lng: 2.604204 },
    { slot: 'autre_poteau_4', type: 'autre_poteau', url: 'https://fibretrack.mantota.com/api/uploads/photos/ap4.jpg', lat: 6.379527, lng: 2.604200 },
    { slot: 'autre_poteau_5', type: 'autre_poteau', url: 'https://fibretrack.mantota.com/api/uploads/photos/ap5.jpg', lat: 6.428008, lng: 2.293967 },
    { slot: 'autre_poteau_6', type: 'autre_poteau', url: 'https://fibretrack.mantota.com/api/uploads/photos/ap6.jpg', lat: 6.379531, lng: 2.604205 },
  ]),
};

test('Validation Complète Étape 2 (BOM & Poteaux) avec données réelles stringifiées', async () => {
  const rawData = mockRealIntervention;

  // Construction de l'Étape 2 CelPros exacte (d'après screenshot media_1791887139535.png)
  const root = new MockElement('form', { id: 'celpros-step2-form' });

  function createField(label, placeholder = '', type = 'number', id = '') {
    const group = new MockElement('div', { className: 'form-group col-6' });
    const lbl = new MockElement('label', { innerText: label });
    const inp = new MockElement('input', {
      type,
      id: id || label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      name: id || label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      placeholder,
    });
    group.appendChild(lbl);
    group.appendChild(inp);
    root.appendChild(group);
    return inp;
  }

  const inpOnt = createField('ONT *', 'Numéro de série ONT', 'text', 'ont_sn');
  const inpMac = createField('Adresse MAC*', 'Adresse MAC', 'text', 'mac');
  const inpGpsFat = createField('GPS FAT', 'Coordonnées GPS FAT', 'text', 'gps_fat');
  const inpPince = createField('Pince', '0', 'number', 'pince');
  const inpCrochets = createField('Crochets', '0', 'number', 'crochets');
  const inpSuspension = createField('Suspension', '0', 'number', 'suspension');
  const inpPiton = createField('Piton', '0', 'number', 'piton');
  const inpConnecteur = createField('Connecteur', '0', 'number', 'connecteur');
  const inpRp1 = createField('RP1', '0', 'number', 'rp1');
  const inpSbee = createField('Nombre de poteaux SBEE utilisés', '0', 'number', 'poteaux_sbee_utilises');
  const inpPj = createField('Nombre de poteaux Petit Jean utilisés', '0', 'number', 'poteaux_petit_jean_utilises');
  const inpTraverse13 = createField('Traverse 13T', '0', 'number', 'traverse_13t');
  const inpTraverse15 = createField('Traverse 15T', '0', 'number', 'traverse_15t');
  const inpSemelle = createField('Semelle', '0', 'number', 'semelle');
  const inpBoulons = createField('Boulons', '0', 'number', 'boulons');
  const inpAgrafe = createField('Agrafe', '0', 'number', 'agrafe');
  const inpLineaire = createField('Linéaire Fibre Optique', '150', 'number', 'lineaire_fibre_optique');

  // Exécution de l'autofill avec rawData (qui contient JSON strings)
  const report = await FormFiller.autofillPage(rawData, root);
  assert.ok(report.success, 'Le remplissage doit réussir');

  // Vérifications exactes des valeurs attendues
  assert.equal(inpCrochets.value, '4', 'Nombre de crochets doit être 4');
  assert.equal(inpPiton.value, '1', 'Nombre de pitons doit être 1');
  assert.equal(inpPj.value, '2', 'Nombre de poteaux Petit Jean doit être 2');
  assert.equal(inpLineaire.value, '150', 'Linéaire Fibre Optique doit être 150');
  assert.equal(inpGpsFat.value, '6.37915, 2.60443', 'GPS FAT doit être extrait fidèlement');
  assert.equal(inpMac.value, '9025F247C8D3-E3(17)', 'Adresse MAC doit correspondre');
  // Test de robustesse absolue : input avec id="ont" et label="ONT *"
  const inpOntPure = createField('ONT *', 'Saisir numéro de série', 'text', 'ont');
  const reportPure = await FormFiller.autofillPage(rawData, root);
  assert.equal(inpOntPure.value, '4857544329E2E5B8', 'L\'input ONT nommé purement "ont" doit recevoir le SN et JAMAIS "1"');
});

test('Validation Complète Étape 4 (Photos dynamiques des Poteaux et Coordonnées GPS) avec données réelles', async () => {
  const rawData = mockRealIntervention;

  // Construction de l'Étape 4 CelPros exacte (d'après screenshot media_1791887139529.png)
  const root = new MockElement('div', { id: 'celpros-step4-root' });

  // 1. Branchement (checkboxes)
  const cardBranchement = new MockElement('div', { className: 'card card-branchement' });
  const chkNames = ['Etiquetage', 'Nettoyage', 'Dépose', 'Colliers serrés', 'FAT normalisé', 'Tutorat'];
  for (const name of chkNames) {
    const lbl = new MockElement('label', { innerText: name });
    const chk = new MockElement('input', { type: 'checkbox', name: name.toLowerCase().replace(/[^a-z0-9]/g, '_') });
    cardBranchement.appendChild(lbl);
    cardBranchement.appendChild(chk);
  }
  root.appendChild(cardBranchement);

  // 2. Rattachement (photos et section Poteaux)
  const cardRattachement = new MockElement('div', { className: 'card card-rattachement' });
  root.appendChild(cardRattachement);

  // Slots de photos standards
  function createPhotoSlot(card, label) {
    const box = new MockElement('div', { className: 'upload-box col-12' });
    const lbl = new MockElement('label', { innerText: label });
    const inp = new MockElement('input', {
      type: 'file',
      id: `photo_${label.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    });
    box.appendChild(lbl);
    box.appendChild(inp);
    card.appendChild(box);
    return inp;
  }

  createPhotoSlot(cardRattachement, 'Image FAT *');
  createPhotoSlot(cardRattachement, 'Image Scan FAT *');
  createPhotoSlot(cardRattachement, 'Image entrée câble interne *');
  createPhotoSlot(cardRattachement, 'Image entrée câble externe *');
  createPhotoSlot(cardRattachement, 'Image fibre au FAT *');

  // Mesures puissance FAT et PTO
  const rowFat = new MockElement('div', { className: 'row' });
  const valFatInp = new MockElement('input', { type: 'text', placeholder: 'Valeur au FAT (dbm) *' });
  const boxFat = new MockElement('div', { className: 'upload-box' });
  const inpMesureFat = new MockElement('input', { type: 'file', id: 'img_mesure_fat' });
  boxFat.appendChild(new MockElement('label', { innerText: 'Image mesure au FAT *' }));
  boxFat.appendChild(inpMesureFat);
  rowFat.appendChild(valFatInp);
  rowFat.appendChild(boxFat);
  cardRattachement.appendChild(rowFat);

  const rowPto = new MockElement('div', { className: 'row' });
  const valPtoInp = new MockElement('input', { type: 'text', placeholder: 'Valeur au PTO (dbm) *' });
  const boxPto = new MockElement('div', { className: 'upload-box' });
  const inpMesurePto = new MockElement('input', { type: 'file', id: 'img_mesure_pto' });
  boxPto.appendChild(new MockElement('label', { innerText: 'Image mesure PTO *' }));
  boxPto.appendChild(inpMesurePto);
  rowPto.appendChild(valPtoInp);
  rowPto.appendChild(boxPto);
  cardRattachement.appendChild(rowPto);

  // Section dynamique Poteaux
  const headerPoteaux = new MockElement('div', { className: 'col-12 header-row d-flex justify-content-between align-items-center' });
  const titlePoteaux = new MockElement('h5', { innerText: 'POTEAUX' });
  const addBtn = new MockElement('button', { className: 'btn btn-sm btn-plus', innerText: '+' });
  headerPoteaux.appendChild(titlePoteaux);
  headerPoteaux.appendChild(addBtn);
  cardRattachement.appendChild(headerPoteaux);

  const subtitle = new MockElement('small', { innerText: 'Aucune photo — appuyez sur + pour ajouter (max 10)' });
  cardRattachement.appendChild(subtitle);

  const createdPoleSlots = [];
  let poleCounter = 0;
  addBtn._clickHandler = () => {
    poleCounter++;
    const row = new MockElement('div', { className: 'col-12 pole-row' });
    const box = new MockElement('div', { className: 'upload-box' });
    const fileInp = new MockElement('input', {
      type: 'file',
      id: `pole_file_${poleCounter}`,
      name: `pole_file_${poleCounter}`,
    });
    const coordInp = new MockElement('input', {
      type: 'text',
      id: `pole_coords_${poleCounter}`,
      placeholder: 'Coordonnées GPS',
    });
    box.appendChild(fileInp);
    row.appendChild(box);
    row.appendChild(coordInp);
    cardRattachement.appendChild(row);
    createdPoleSlots.push({ fileInp, coordInp });
  };

  // Exécution de l'injection
  const fillRes = await PhotoFiller.fillPhotosOnPage(rawData, root);
  assert.ok(fillRes.success, 'fillPhotosOnPage doit réussir sur Step 4');

  // Vérifier que tous les poteaux ont été créés et injectés (2 GPS + 6 Autres poteaux = 8 poteaux)
  assert.equal(createdPoleSlots.length, 8, '8 slots de poteaux doivent être créés via le bouton +');

  // Vérification de l'ordre strict et des coordonnées GPS
  assert.equal(createdPoleSlots[0].coordInp.value, '6.379530, 2.604204', 'GPS Poteau 1');
  assert.equal(createdPoleSlots[1].coordInp.value, '6.379530, 2.604197', 'GPS Poteau 2');
  assert.equal(createdPoleSlots[2].coordInp.value, '6.428008, 2.293967', 'GPS Autre Poteau 1');
  assert.equal(createdPoleSlots[3].coordInp.value, '6.379468, 2.604227', 'GPS Autre Poteau 2');
  assert.equal(createdPoleSlots[4].coordInp.value, '6.379531, 2.604204', 'GPS Autre Poteau 3');
  assert.equal(createdPoleSlots[5].coordInp.value, '6.379527, 2.604200', 'GPS Autre Poteau 4');
  assert.equal(createdPoleSlots[6].coordInp.value, '6.428008, 2.293967', 'GPS Autre Poteau 5');
  assert.equal(createdPoleSlots[7].coordInp.value, '6.379531, 2.604205', 'GPS Autre Poteau 6');
});
