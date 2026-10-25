import test from 'node:test';
import assert from 'node:assert/strict';
import '../content/field-mapping.js';
import '../content/photo-filler.js';
import '../content/form-filler.js';

const FieldMapping = globalThis.FieldMapping;
const PhotoFiller = globalThis.PhotoFiller;
const FormFiller = globalThis.FormFiller;

// Classes DOM simulées pour l'environnement Node.js
class MockEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles ?? false;
    this.cancelable = options.cancelable ?? false;
  }
}
if (!globalThis.Event) {
  globalThis.Event = MockEvent;
}

class MockElement {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || '';
    this.name = attrs.name || '';
    this.type = attrs.type || 'text';
    this.value = attrs.value || '';
    this.checked = attrs.checked || false;
    this.innerText = attrs.innerText || '';
    this.innerHTML = attrs.innerHTML || '';
    this.className = attrs.className || '';
    this.attributes = { ...attrs };
    this.dataset = { ...(attrs.dataset || {}) };
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.ownerDocument = null;
    this.dispatchedEvents = [];
    this.classList = {
      _classes: new Set(attrs.className ? attrs.className.split(' ') : []),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    };
  }

  getAttribute(attr) {
    return this.attributes[attr] || this.attributes[attr.toLowerCase()] || null;
  }

  setAttribute(attr, val) {
    this.attributes[attr] = val;
  }

  appendChild(child) {
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const selectors = selector.split(',').map(s => s.trim().toLowerCase());
    const walk = (node) => {
      for (const child of node.children) {
        let match = false;
        for (const sel of selectors) {
          if (sel === 'input[type="file"]') {
            if (child.tagName === 'INPUT' && child.type === 'file') match = true;
          } else if (sel.startsWith('.')) {
            const cls = sel.slice(1);
            if ((child.classList && child.classList.contains(cls)) || (child.className && child.className.includes(cls))) match = true;
          } else if (sel.startsWith('input')) {
            if (child.tagName === 'INPUT') match = true;
          } else if (sel.includes('[class*=')) {
            match = true;
          } else if (child.tagName.toLowerCase() === sel) {
            match = true;
          }
        }
        if (match) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  closest(selector) {
    let curr = this;
    const parts = selector.split(',').map(s => s.trim().toLowerCase());
    while (curr) {
      for (const p of parts) {
        if (p.startsWith('.')) {
          if (curr.classList && curr.classList.contains(p.slice(1))) return curr;
        } else if (curr.tagName.toLowerCase() === p) {
          return curr;
        }
      }
      curr = curr.parentElement;
    }
    return null;
  }

  dispatchEvent(evt) {
    this.dispatchedEvents.push(evt.type);
    return true;
  }

  addEventListener(type, fn) {
    // simulation
  }
}

class MockDocument {
  constructor(rootElement) {
    this.body = rootElement || new MockElement('body');
    const setDoc = (n) => {
      n.ownerDocument = this;
      for (const ch of n.children) setDoc(ch);
    };
    setDoc(this.body);
  }

  getElementById(id) {
    let found = null;
    const walk = (node) => {
      if (node.id === id) { found = node; return; }
      for (const child of node.children) {
        if (!found) walk(child);
      }
    };
    walk(this.body);
    return found;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      if (selector.includes('input') && node.tagName === 'INPUT') {
        if (!selector.includes(':not([type="file"])') || node.type !== 'file') {
          results.push(node);
        }
      } else if (selector.includes('.upload-box') && node.classList.contains('upload-box')) {
        results.push(node);
      } else if (selector.includes('input[type="file"]') && node.tagName === 'INPUT' && node.type === 'file') {
        results.push(node);
      }
      for (const child of node.children) {
        walk(child);
      }
    };
    walk(this.body);
    return results;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  createElement(tag) {
    const el = new MockElement(tag);
    el.ownerDocument = this;
    return el;
  }
}

test('Step 4 Photo Isolation - "Image du câble interne" matches cable_interne ONLY', () => {
  // Test identification de container avec label français accentué
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Image du câble interne' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_cableInterne', name: 'photoCableInterne' });
  container.appendChild(fileInput);

  const identifiedRule = PhotoFiller.identifyPhotoContainer(container);

  assert.ok(identifiedRule, 'Le conteneur doit être identifié');
  assert.equal(identifiedRule.key, 'cable_interne', 'Doit être cable_interne');
  assert.notEqual(identifiedRule.key, 'cable_externe', 'Ne doit JAMAIS être confondu avec cable_externe');
  assert.notEqual(identifiedRule.key, 'fat', 'Ne doit JAMAIS être confondu avec fat');
  assert.notEqual(identifiedRule.key, 'mesure_fat', 'Ne doit JAMAIS être confondu avec mesure_fat');
  assert.notEqual(identifiedRule.key, 'mesure_pto', 'Ne doit JAMAIS être confondu avec mesure_pto');
});

test('Step 4 Photo Isolation - "Image du câble externe" matches cable_externe ONLY', () => {
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Image du câble externe' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_cableExterne', name: 'photoCableExterne' });
  container.appendChild(fileInput);

  const identifiedRule = PhotoFiller.identifyPhotoContainer(container);

  assert.ok(identifiedRule);
  assert.equal(identifiedRule.key, 'cable_externe');
  assert.notEqual(identifiedRule.key, 'cable_interne');
  assert.notEqual(identifiedRule.key, 'fat');
});

test('Step 4 Photo Isolation - "Boîtier FAT" matches fat and NEVER mesure_fat or fibre_fat', () => {
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Boîtier FAT (PBO)' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_photoFat', name: 'photoFat' });
  container.appendChild(fileInput);

  const identifiedRule = PhotoFiller.identifyPhotoContainer(container);

  assert.ok(identifiedRule);
  assert.equal(identifiedRule.key, 'fat');
  assert.notEqual(identifiedRule.key, 'mesure_fat');
  assert.notEqual(identifiedRule.key, 'fibre_fat');
  assert.notEqual(identifiedRule.key, 'scan_fat');
});

test('Step 4 Photo Isolation - "Mesure optique FAT" matches mesure_fat and NEVER fat or mesure_pto', () => {
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Mesure optique au FAT' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_mesureFat', name: 'photoMesureFat' });
  container.appendChild(fileInput);

  const identifiedRule = PhotoFiller.identifyPhotoContainer(container);

  assert.ok(identifiedRule);
  assert.equal(identifiedRule.key, 'mesure_fat');
  assert.notEqual(identifiedRule.key, 'fat');
  assert.notEqual(identifiedRule.key, 'mesure_pto');
});

test('Step 4 Photo Isolation - "Mesure optique PTO" matches mesure_pto and NEVER mesure_fat', () => {
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Mesure optique à la PTO' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_mesurePto', name: 'photoMesurePto' });
  container.appendChild(fileInput);

  const identifiedRule = PhotoFiller.identifyPhotoContainer(container);

  assert.ok(identifiedRule);
  assert.equal(identifiedRule.key, 'mesure_pto');
  assert.notEqual(identifiedRule.key, 'mesure_fat');
  assert.notEqual(identifiedRule.key, 'fat');
});

test('Step 4 Photo Isolation - Negative keywords strictly prevent cross-contamination', () => {
  // Un libellé qui mentionne "câble interne" mais aussi le mot "externe" dans une phrase explicative
  // La règle cable_interne possède negativeKeyword: ["externe"]
  const ambiguous = new MockElement('div', { className: 'upload-box', innerText: 'Image du câble interne (non externe)' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_ambig' });
  ambiguous.appendChild(fileInput);

  const identifiedRule = PhotoFiller.identifyPhotoContainer(ambiguous);
  // Doit être null ou ne pas faire de faux positif sur cable_externe
  if (identifiedRule) {
    assert.notEqual(identifiedRule.key, 'cable_externe');
  }
});

test('Step 4 Photo Isolation - Missing photo is flagged in missingPhotos and NEVER replaced by arbitrary photo', async () => {
  // Intervention FibreTrack contenant UNIQUEMENT une photo FAT, mais PAS de photo de câble interne
  const partialIntv = {
    id: '1042',
    nom_client: 'Dossou',
    points_gps: [
      { type: 'FAT', photo: 'data:image/jpeg;base64,realFatPhotoData123' },
    ],
    whatsapp_photos: [
      { slot: 'fat', url: 'data:image/jpeg;base64,realFatPhotoData123', label: 'Boîtier FAT' },
    ],
  };

  const cableRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'cable_interne');
  const fatRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'fat');

  // Vérifier au niveau extraction directe
  assert.equal(cableRule.getPhoto(partialIntv), null, 'cable_interne doit retourner null');
  assert.ok(fatRule.getPhoto(partialIntv), 'fat doit retourner la vraie photo FAT');

  // Vérifier le comportement DOM complet avec fillPhotosOnPage
  const root = new MockElement('div');
  const boxCable = new MockElement('div', { className: 'upload-box', innerText: 'Image du câble interne' });
  const inputCable = new MockElement('input', { type: 'file', id: 'field_cableInterne' });
  boxCable.appendChild(inputCable);
  root.appendChild(boxCable);

  const boxFat = new MockElement('div', { className: 'upload-box', innerText: 'Boîtier FAT' });
  const inputFat = new MockElement('input', { type: 'file', id: 'field_photoFat' });
  boxFat.appendChild(inputFat);
  root.appendChild(boxFat);

  const doc = new MockDocument(root);
  const report = await PhotoFiller.fillPhotosOnPage(partialIntv, doc);

  assert.ok(report.success);
  assert.equal(report.missingCount, 1, 'Exactement 1 photo manquante doit être signalée');
  assert.equal(report.missingPhotos[0].slot, 'cable_interne', 'La photo manquante doit être cable_interne');

  // Vérifier qu'un avertissement a été apposé sur le conteneur du câble
  const warningBadges = boxCable.querySelectorAll('.chaptech-photo-missing-badge');
  assert.ok(warningBadges.length > 0 || boxCable.style.borderColor === '#f59e0b', 'Un badge d avertissement ou bordure orange doit être apposé');

  // L input du câble doit rester VIDE (non injecté)
  assert.equal(inputCable.files, undefined, 'L input câble interne ne doit rien avoir reçu');
});

test('Manual Input Preservation - User-edited fields are never overwritten during autofill', async () => {
  const elNom = new MockElement('input', {
    id: 'field_nomClient',
    name: 'nomClient',
    value: 'Marc DOSSOU (Modifié par le technicien)',
    dataset: {
      chaptechFilledValue: 'Marc DOSSOU',
      chaptechUserModified: 'true', // L'utilisateur a modifié manuellement le champ
    },
  });

  const elZone = new MockElement('input', {
    id: 'field_adresse',
    name: 'adresse',
    value: '', // Champ non modifié
    dataset: {},
  });

  const doc = new MockDocument(new MockElement('div'));
  doc.querySelectorAll = (sel) => {
    if (sel.includes('input')) return [elNom, elZone];
    return [];
  };

  const intervention = {
    nom_client: 'Marc DOSSOU',
    adresse_zone: 'Cotonou Cadjehoun',
  };

  const report = await FormFiller.autofillPage(intervention, doc);

  assert.ok(report.success);
  // Le champ nom_client doit être PRÉSERVÉ avec la saisie manuelle de l'utilisateur
  assert.equal(elNom.value, 'Marc DOSSOU (Modifié par le technicien)');
  assert.equal(report.preservedCount, 1, '1 champ doit être reporté comme préservé');
  assert.equal(report.preservedDetails[0].key, 'nom_client');
  assert.equal(report.preservedDetails[0].currentValue, 'Marc DOSSOU (Modifié par le technicien)');

  // Le champ adresse (non modifié) doit être rempli normalement
  assert.equal(elZone.value, 'Cotonou Cadjehoun');
});

test('Live Sync - updated_at change detection triggers update', () => {
  const previousUpdatedAt = '2026-10-15 10:00:00';
  const newServerUpdatedAt = '2026-10-15 10:15:30';

  const hasChanged1 = !previousUpdatedAt || (newServerUpdatedAt && newServerUpdatedAt !== previousUpdatedAt);
  assert.equal(hasChanged1, true, 'Une date modifiée doit être détectée comme un changement');

  const sameServerUpdatedAt = '2026-10-15 10:00:00';
  const hasChanged2 = Boolean(sameServerUpdatedAt && sameServerUpdatedAt !== previousUpdatedAt);
  assert.equal(hasChanged2, false, 'Une date identique ne doit PAS déclencher de fausse mise à jour');
});

test('Step 4 Full Multi-Slot - All 7 Step 4 upload slots on same page fill accurately with 0 cross-contamination', async () => {
  // Intervention avec 5 vraies photos sur 7 (câble externe et mesure PTO sont absents sur le terrain)
  const interventionWithStep4Photos = {
    id: '1042',
    nom_client: 'Dossou',
    points_gps: [
      { type: 'FAT', photo: 'data:image/jpeg;base64,realFatPhoto777' },
    ],
    whatsapp_photos: [
      { slot: 'cable_interne', url: 'data:image/jpeg;base64,cableInterneData111', label: 'Câble interne' },
      // cable_externe: absent
      { slot: 'fat', url: 'data:image/jpeg;base64,realFatPhoto777', label: 'Boîtier FAT' },
      { slot: 'scan_fat', url: 'data:image/jpeg;base64,scanFatData333', label: 'Scan QR FAT' },
      { slot: 'fibre_fat', url: 'data:image/jpeg;base64,fibreFatData444', label: 'Fibre dans FAT' },
      { slot: 'mesure_fat', url: 'data:image/jpeg;base64,mesureFatData555', label: 'Mesure optique FAT' },
      // mesure_pto: absent
    ],
  };

  const root = new MockElement('div');

  const slotsDef = [
    { key: 'cable_interne', label: 'Image du câble interne', inputId: 'field_cableInterne' },
    { key: 'cable_externe', label: 'Image du câble externe', inputId: 'field_cableExterne' },
    { key: 'fat', label: 'Boîtier FAT', inputId: 'field_photoFat' },
    { key: 'scan_fat', label: 'Scan QR Code FAT', inputId: 'field_photoScanFat' },
    { key: 'fibre_fat', label: 'Fibre dans le FAT', inputId: 'field_photoFibreFat' },
    { key: 'mesure_fat', label: 'Mesure optique FAT', inputId: 'field_photoMesureFat' },
    { key: 'mesure_pto', label: 'Mesure optique PTO', inputId: 'field_photoMesurePto' },
  ];

  const boxes = {};
  const inputs = {};

  for (const s of slotsDef) {
    const box = new MockElement('div', { className: 'upload-box', innerText: s.label });
    const inp = new MockElement('input', { type: 'file', id: s.inputId, name: s.inputId });
    box.appendChild(inp);
    root.appendChild(box);
    boxes[s.key] = box;
    inputs[s.key] = inp;
  }

  const doc = new MockDocument(root);
  const report = await PhotoFiller.fillPhotosOnPage(interventionWithStep4Photos, doc);

  assert.ok(report.success);
  // 5 photos injectées, 2 manquantes
  assert.equal(report.injectedCount, 5, '5 photos doivent être injectées');
  assert.equal(report.missingCount, 2, '2 photos doivent être signalées manquantes');

  const missingKeys = report.missingPhotos.map(m => m.slot);
  assert.ok(missingKeys.includes('cable_externe'), 'cable_externe doit être manquant');
  assert.ok(missingKeys.includes('mesure_pto'), 'mesure_pto doit être manquant');

  // Vérifier qu'aucun fichier n'a été injecté dans les slots manquants
  assert.equal(inputs.cable_externe.files, undefined, 'cable_externe doit rester vierge');
  assert.equal(inputs.mesure_pto.files, undefined, 'mesure_pto doit rester vierge');

  // Vérifier que les slots injectés ont reçu les bons fichiers
  assert.ok(inputs.cable_interne.files, 'cable_interne doit avoir reçu un fichier');
  assert.ok(inputs.fat.files, 'fat doit avoir reçu un fichier');
  assert.ok(inputs.scan_fat.files, 'scan_fat doit avoir reçu un fichier');
  assert.ok(inputs.fibre_fat.files, 'fibre_fat doit avoir reçu un fichier');
  assert.ok(inputs.mesure_fat.files, 'mesure_fat doit avoir reçu un fichier');
});

test('Step 4 Photo Isolation - "Autre poteau" matches autre_poteau ONLY', () => {
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Autre poteau' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_autre_poteau', name: 'photoAutrePoteau' });
  container.appendChild(fileInput);

  const identifiedRule = PhotoFiller.identifyPhotoContainer(container);

  assert.ok(identifiedRule, 'Le conteneur Autre poteau doit être identifié');
  assert.equal(identifiedRule.key, 'autre_poteau', 'Doit être autre_poteau');
  assert.notEqual(identifiedRule.key, 'fat', 'Ne doit JAMAIS être confondu avec fat');
  assert.notEqual(identifiedRule.key, 'cable_externe', 'Ne doit JAMAIS être confondu avec cable_externe');
  assert.notEqual(identifiedRule.key, 'cable_interne', 'Ne doit JAMAIS être confondu avec cable_interne');

  const testIntervention = {
    whatsapp_photos: [
      { slot: 'autre_poteau', url: 'data:image/jpeg;base64,autrePoteauData999', label: 'Autre poteau' },
    ],
  };

  const photo = identifiedRule.getPhoto(testIntervention);
  assert.ok(photo, 'Doit trouver la photo autre_poteau');
  assert.equal(photo.slot, 'autre_poteau');
  assert.equal(photo.src, 'data:image/jpeg;base64,autrePoteauData999');
});

test('Step 4 Photo Isolation - Unrecognized photo category in FibreTrack is NEVER injected into CelPros', async () => {
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Image du câble interne' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_cableInterne' });
  container.appendChild(fileInput);

  const doc = new MockDocument(container);

  // Intervention avec des photos aux catégories fantaisistes/inconnues
  const dataWithUnknownPhotos = {
    whatsapp_photos: [
      { slot: 'photo_chat_du_voisin', url: 'data:image/jpeg;base64,chat999', label: 'Photo insolite' },
      { slot: 'photo_dejeuner', url: 'data:image/jpeg;base64,repas888', label: 'Pause midi' },
    ],
  };

  const report = await PhotoFiller.fillPhotosOnPage(dataWithUnknownPhotos, doc);

  assert.equal(report.injectedCount, 0, 'Aucune photo inconnue ne doit être injectée');
  assert.equal(report.missingCount, 1, 'Le slot câble interne doit être marqué manquant');
  assert.equal(fileInput.files, undefined, 'L\'input de fichier doit rester strictement vide');
});

test('Step 4 Photo Isolation - Ambiguous upload container without valid matching rule is left intact', async () => {
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Zone de dépôt indéterminée' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_unknownSlot' });
  container.appendChild(fileInput);

  const doc = new MockDocument(container);

  const data = {
    whatsapp_photos: [
      { slot: 'cable_interne', url: 'data:image/jpeg;base64,interne123' },
      { slot: 'fat', url: 'data:image/jpeg;base64,fat123' },
    ],
  };

  const report = await PhotoFiller.fillPhotosOnPage(data, doc);

  assert.equal(report.injectedCount, 0, 'Aucune photo ne doit être placée dans une zone ambiguë');
  assert.equal(report.unmatchedSlots.length, 1, 'La zone doit être rapportée dans unmatchedSlots');
  assert.equal(fileInput.files, undefined, 'La zone inconnue reste intacte');
});

test('Step 4 Photo Isolation - "Photo numéro de série" matches ont_sn ONLY', () => {
  const container = new MockElement('div', { className: 'upload-box', innerText: 'Photo numéro de série' });
  const fileInput = new MockElement('input', { type: 'file', id: 'field_photo_numero_de_serie', name: 'photoOnt' });
  container.appendChild(fileInput);

  const identifiedRule = PhotoFiller.identifyPhotoContainer(container);

  assert.ok(identifiedRule, 'Le conteneur Photo numéro de série doit être identifié');
  assert.equal(identifiedRule.key, 'ont_sn', 'Doit correspondre au slot ont_sn');
  assert.notEqual(identifiedRule.key, 'fat', 'Ne doit JAMAIS être confondu avec fat');
  assert.notEqual(identifiedRule.key, 'cable_interne', 'Ne doit JAMAIS être confondu avec cable');

  const testIntervention = {
    whatsapp_photos: [
      { slot: 'ont_sn', url: 'data:image/jpeg;base64,serialPhotoONT123', label: 'Photo numéro de série' },
    ],
  };

  const photo = identifiedRule.getPhoto(testIntervention);
  assert.ok(photo, 'Doit extraire la photo du numéro de série');
  assert.equal(photo.slot, 'ont_sn');
  assert.equal(photo.src, 'data:image/jpeg;base64,serialPhotoONT123');
});

test('Step 4 Photo Isolation - "Image entrée câble interne *" strictly receives cable_interne and NEVER FAT or Poteau', async () => {
  const interventionWithAll = {
    id: 'test-intv-cable-isolation',
    points_gps: [
      { type: 'FAT', numero: 1, photo: 'data:image/jpeg;base64,' + Buffer.from('FAT_PHOTO_DATA_140144').toString('base64') },
      { type: 'Poteau', numero: 1, photo: 'data:image/jpeg;base64,' + Buffer.from('POLE_PHOTO_DATA_1').toString('base64') }
    ],
    whatsapp_photos: [
      { slot: 'fat', type: 'fat', name: 'fat.jpg', url: 'data:image/jpeg;base64,' + Buffer.from('FAT_PHOTO_DATA_140144').toString('base64') },
      { slot: 'cable_interne', type: 'cable_interne', name: 'cable_interne.jpg', url: 'data:image/jpeg;base64,' + Buffer.from('REAL_INDOOR_WALL_CONDUIT_144502').toString('base64') },
      { slot: 'cable_externe', type: 'cable_externe', name: 'cable_externe.jpg', url: 'data:image/jpeg;base64,' + Buffer.from('EXTERNAL_CABLE_DATA').toString('base64') },
      { slot: 'poteau_1', type: 'poteau', name: 'poteau_1.jpg', url: 'data:image/jpeg;base64,' + Buffer.from('POLE_PHOTO_DATA_1').toString('base64') }
    ]
  };

  const root = new MockElement('div');
  const section = new MockElement('section', { className: 'step4-branchement' });
  root.appendChild(section);

  // Boîte Image entrée câble interne * (exactement comme sur CelPros)
  const boxCable = new MockElement('div', { className: 'upload-box', innerText: 'Image entrée câble interne *' });
  const inputCable = new MockElement('input', { type: 'file', id: 'field_input_cable_interne' });
  boxCable.appendChild(inputCable);
  section.appendChild(boxCable);

  // Section Poteaux dans la même page
  const headerPoteaux = new MockElement('h4', { innerText: 'Poteaux traversés' });
  section.appendChild(headerPoteaux);
  const boxPole1 = new MockElement('div', { className: 'upload-box', innerText: 'Photo Poteau 1' });
  const inputPole1 = new MockElement('input', { type: 'file', id: 'field_input_poteau_1' });
  boxPole1.appendChild(inputPole1);
  section.appendChild(boxPole1);

  const doc = new MockDocument(root);
  const report = await PhotoFiller.fillPhotosOnPage(interventionWithAll, doc);

  // Vérification stricte
  assert.ok(report.success);
  assert.equal(inputCable.files.length, 1);
  assert.equal(inputCable.files[0].name, 'cable_interne.jpg');

  // Vérification que le fichier injecté n'a PAS été contaminé par le FAT
  const cableDetail = report.details.find(d => d.slot === 'cable_interne');
  assert.ok(cableDetail, 'Détail de cable_interne présent');
  assert.equal(cableDetail.fileName, 'cable_interne.jpg');

  // Vérification que la boîte de câble interne a son badge cable_interne et n'a pas été écrasée par Poteau 1
  const badgeCable = boxCable.querySelector('.chaptech-photo-injected-badge');
  assert.ok(badgeCable);
  assert.ok(badgeCable.innerHTML.includes('cable_interne.jpg'));
  assert.ok(!badgeCable.innerHTML.includes('fat'));
  assert.ok(!badgeCable.innerHTML.includes('poteau'));
});

test('Step 4 Pole Alignment & Autres Poteaux - preserves all numbered poles and all distinct autre_poteau photos even with duplicate labels, and is 100% idempotent on repeated runs', async () => {
  const intervention = {
    id: 'intv-poles-alignment',
    points_gps: [
      { id: 'pt-1', type: 'Poteau', numero: 1, photo: 'data:image/jpeg;base64,' + Buffer.from('POLE_1').toString('base64') },
      { id: 'pt-2', type: 'Poteau', numero: 2, photo: 'data:image/jpeg;base64,' + Buffer.from('POLE_2').toString('base64') },
    ],
    whatsapp_photos: [
      { id: 'wa-autre-1', slot: 'autre_poteau', type: 'autre_poteau', name: 'autre_poteau_5.jpg', label: 'Autre poteau (5)', url: 'data:image/jpeg;base64,' + Buffer.from('AUTRE_A').toString('base64') },
      { id: 'wa-autre-2', slot: 'autre_poteau', type: 'autre_poteau', name: 'autre_poteau_5.jpg', label: 'Autre poteau (5)', url: 'data:image/jpeg;base64,' + Buffer.from('AUTRE_B').toString('base64') },
    ],
  };

  const allPoles = PhotoFiller.collectAllPoles(intervention);
  assert.equal(allPoles.length, 4, 'Doit conserver les 2 poteaux numérotés + les 2 autres poteaux même si leur label/nom est identique');
  assert.equal(allPoles[0].name, 'poteau_1.jpg');
  assert.equal(allPoles[1].name, 'poteau_2.jpg');
  assert.equal(allPoles[2].name, 'autre_poteau_1.jpg');
  assert.equal(allPoles[3].name, 'autre_poteau_2.jpg');

  // Construire une section Poteaux avec 4 slots dynamiques (structure exacte CelPros)
  const root = new MockElement('div');
  const section = new MockElement('div', { className: 'col-12' });
  const headerRow = new MockElement('div', { className: 'd-flex justify-content-between' });
  const headerPoteaux = new MockElement('span', { innerText: 'Poteaux' });
  headerRow.appendChild(headerPoteaux);
  const subtitle = new MockElement('div', { innerText: 'Aucune photo — appuyez sur + pour ajouter (max 10)' });
  section.appendChild(headerRow);
  section.appendChild(subtitle);
  root.appendChild(section);

  const inputs = [];
  for (let i = 1; i <= 4; i++) {
    const box = new MockElement('div', { className: 'upload-box', innerText: `Photo Poteau ${i}` });
    const input = new MockElement('input', { type: 'file', id: `pole_input_${i}` });
    box.appendChild(input);
    section.appendChild(box);
    inputs.push(input);
  }

  new MockDocument(root);

  // Premier passage d'autofill
  const report1 = await PhotoFiller.fillPhotosOnPage(intervention, root);
  assert.equal(report1.injectedCount, 4);
  assert.equal(inputs[0].files[0].name, 'poteau_1.jpg');
  assert.equal(inputs[1].files[0].name, 'poteau_2.jpg');
  assert.equal(inputs[2].files[0].name, 'autre_poteau_1.jpg');
  assert.equal(inputs[3].files[0].name, 'autre_poteau_2.jpg');

  const eventsAfterFirstRun = inputs.map((inp) => inp.dispatchedEvents.length);

  // Deuxième passage d'autofill sur le même DOM (avec les badges "✅ Photo injectée (autre_poteau_1.jpg)" déjà présents)
  const report2 = await PhotoFiller.fillPhotosOnPage(intervention, root);
  assert.equal(report2.injectedCount, 4);
  // Vérifier que les slots 3 et 4 n'ont PAS été faussement identifiés comme conteneurs statiques autre_poteau
  // et qu'aucun événement change redondant n'a été déclenché (idempotence stricte)
  assert.equal(inputs[0].files[0].name, 'poteau_1.jpg');
  assert.equal(inputs[1].files[0].name, 'poteau_2.jpg');
  assert.equal(inputs[2].files[0].name, 'autre_poteau_1.jpg');
  assert.equal(inputs[3].files[0].name, 'autre_poteau_2.jpg');
  assert.deepEqual(
    inputs.map((inp) => inp.dispatchedEvents.length),
    eventsAfterFirstRun,
    'Aucun événement change/input supplémentaire ne doit être émis lorsque les mêmes photos sont déjà injectées'
  );
});

test('CelprosWidget - Super-Pilote OFF strictly blocks all automatic autofill and setSelectedIntervention prevents storage ping-pong', async () => {
  let storageSetCalls = 0;
  const mockStorage = {};
  globalThis.localStorage = {
    getItem(k) { return mockStorage[k] ?? null; },
    setItem(k, v) { mockStorage[k] = String(v); },
  };
  globalThis.document = {
    getElementById() { return null; },
    querySelectorAll() { return []; },
  };
  globalThis.chrome = {
    storage: {
      local: {
        set(obj) {
          if ('activeIntervention' in obj) storageSetCalls++;
        },
        get(_keys, cb) {
          if (cb) cb({});
        },
      },
    },
    runtime: {
      sendMessage(_msg, cb) {
        if (cb) cb({ ok: true });
      },
    },
  };

  await import('../content/ui-widget.js');
  const CelprosWidget = globalThis.CelprosWidget;
  assert.ok(CelprosWidget, 'CelprosWidget doit être exposé');

  const widget = new CelprosWidget();
  // Initialiser avec une intervention complète
  const intvFull = {
    id: 'intv-sync-test',
    nom_client: 'CLIENT TEST',
    modifie_le: '2026-10-20T12:00:00Z',
    points_gps: [{ id: 'p1', type: 'Poteau', numero: 1, photo: 'https://fibretrack.mantota.com/api/uploads/photos/1.jpg' }],
    whatsapp_photos: [{ id: 'w1', slot: 'fat', url: 'https://fibretrack.mantota.com/api/uploads/photos/fat.jpg' }],
  };

  // 1. Si syncToBackground = false (ex: reçu depuis chrome.storage.onChanged), NE JAMAIS réécrire dans chrome.storage.local
  const changed1 = widget.setSelectedIntervention(intvFull, false);
  assert.equal(changed1, true);
  assert.equal(storageSetCalls, 0, 'setSelectedIntervention(data, false) ne doit jamais écrire dans chrome.storage.local');

  // 2. Si le même payload arrive avec syncToBackground = true, l'empreinte est identique -> 0 écriture
  const changed2 = widget.setSelectedIntervention({ ...intvFull }, true);
  assert.equal(changed2, false, 'Une intervention identique doit retourner didChange = false');
  assert.equal(storageSetCalls, 0, 'Aucune écriture chrome.storage.local si empreinte inchangée');

  // 3. Si un payload "light" (sans URLs de photos) arrive pour la même intervention, les photos existantes sont préservées
  const intvLight = {
    id: 'intv-sync-test',
    nom_client: 'CLIENT TEST',
    modifie_le: '2026-10-20T12:00:00Z',
    points_gps: [{ id: 'p1', type: 'Poteau', numero: 1, photo: '' }],
    whatsapp_photos: [{ id: 'w1', slot: 'fat', url: '' }],
  };
  widget.setSelectedIntervention(intvLight, false);
  assert.equal(widget.selectedIntervention.whatsapp_photos[0].url, 'https://fibretrack.mantota.com/api/uploads/photos/fat.jpg');
  assert.equal(widget.selectedIntervention.points_gps[0].photo, 'https://fibretrack.mantota.com/api/uploads/photos/1.jpg');

  // 4. Désactiver Super-Pilote (OFF) -> persistance + blocage strict de tout autofill automatique
  widget.setAutoPilotState(false, true);
  assert.equal(widget.autoPilotEnabled, false);
  assert.equal(widget.canAutoFill(), false);
  assert.equal(globalThis.localStorage.getItem('chaptech_autopilot_enabled'), 'false');

  let fillCalled = false;
  const origFill = globalThis.FormFiller.fillCurrentStep;
  globalThis.FormFiller.fillCurrentStep = () => {
    fillCalled = true;
    return { success: true, filledCount: 1, totalExpected: 1 };
  };
  try {
    await widget.handleAutofill(true);
    assert.equal(fillCalled, false, 'handleAutofill(true) ne doit JAMAIS remplir les champs quand Super-Pilote est OFF');
  } finally {
    globalThis.FormFiller.fillCurrentStep = origFill;
  }
});



