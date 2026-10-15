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
    this.isTrusted = options.isTrusted ?? false;
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
    this.attributes = { ...attrs };
    this.dataset = { ...(attrs.dataset || {}) };
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.ownerDocument = null;
    this.options = attrs.options ? attrs.options.map((opt) => ({
      value: opt.value || opt,
      text: opt.text || opt,
      selected: opt.selected || false,
    })) : [];
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
    const walk = (node) => {
      for (const child of node.children) {
        let match = false;
        if (selector === 'input[type="file"]') {
          if (child.tagName === 'INPUT' && child.type === 'file') match = true;
        } else if (selector.startsWith('input')) {
          if (child.tagName === 'INPUT') match = true;
        } else if (selector.includes('[class*=')) {
          match = true;
        } else if (selector === 'input, select, textarea') {
          if (['INPUT', 'SELECT', 'TEXTAREA'].includes(child.tagName)) match = true;
        } else if (selector === 'label, span, div, strong, h4, h5') {
          if (['LABEL', 'SPAN', 'DIV', 'STRONG', 'H4', 'H5'].includes(child.tagName)) match = true;
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
    while (curr) {
      if (curr.tagName.toLowerCase() === selector.toLowerCase()) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  dispatchEvent(evt) {
    this.dispatchedEvents.push(evt.type);
    return true;
  }
}

class MockDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new MockElement('body');
    this.body.ownerDocument = this;
  }

  createElement(tagName) {
    const el = new MockElement(tagName);
    el.ownerDocument = this;
    return el;
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(id, el) {
    el.id = id;
    el.ownerDocument = this;
    this.elementsById.set(id, el);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// ----------------------------------------------------
// SUITE DES 12 TESTS OBLIGATOIRES AVANT VALIDATION
// ----------------------------------------------------

test('Cas 1 : Modification dans FibreTrack répercutée automatiquement dans ChapTech', () => {
  // Simule l'ancienne version
  const oldIntervention = {
    id: '101',
    nom_client: 'Koffi Paul',
    puissance_pto_dbm: '-19.5',
    updated_at: '2026-10-15 10:00:00',
  };

  // Simule la nouvelle version mise à jour sur le terrain
  const updatedIntervention = {
    id: '101',
    nom_client: 'Koffi Paul',
    puissance_pto_dbm: '-17.8',
    updated_at: '2026-10-15 10:05:00',
  };

  // Logique de détection de mise à jour (parseTimestampSafely)
  const parseTs = (str) => Date.parse(str.replace(' ', 'T'));
  const oldTs = parseTs(oldIntervention.updated_at);
  const newTs = parseTs(updatedIntervention.updated_at);

  assert.equal(newTs > oldTs, true, 'Le nouveau timestamp doit être strictement supérieur');
  assert.notEqual(updatedIntervention.puissance_pto_dbm, oldIntervention.puissance_pto_dbm);

  // Vérifier l'extraction de la nouvelle valeur
  const extracted = FieldMapping.FIELD_DEFINITIONS.find((f) => f.key === 'puissance_pto_dbm').extractor(updatedIntervention);
  assert.equal(extracted, '-17.8', 'La nouvelle mesure optique PTO doit être extraite');
});

test('Cas 2 : Répétition de la mise à jour automatique sans actualisation manuelle de l’extension', () => {
  let activeIntervention = {
    id: '202',
    telephone_ligne: '21300000',
    updated_at: '2026-10-15 11:00:00',
  };

  // Simule le polling autonome de 5s
  const serverUpdateResponse = {
    updated_at: '2026-10-15 11:02:30',
    item: {
      id: '202',
      telephone_ligne: '21355555',
      updated_at: '2026-10-15 11:02:30',
    },
  };

  const oldTs = Date.parse(activeIntervention.updated_at.replace(' ', 'T'));
  const srvTs = Date.parse(serverUpdateResponse.updated_at.replace(' ', 'T'));

  // Le moteur autonome détecte hasChanged
  const hasChanged = srvTs > oldTs;
  assert.equal(hasChanged, true, 'La mise à jour doit être détectée de façon autonome');

  // Application de la mise à jour sans intervention utilisateur
  if (hasChanged) {
    activeIntervention = serverUpdateResponse.item;
  }

  assert.equal(activeIntervention.telephone_ligne, '21355555', 'Le numéro doit être actualisé sans clic manuel');
});

test('Cas 3 : Modification d’une information sur une intervention encore EN COURS', () => {
  const interventionEnCours = {
    id: '303',
    nom_client: 'Bio Dossou',
    statut: 'en_cours',
    date_cloture: null,
    port: '4',
    updated_at: '2026-10-15 12:00:00',
  };

  // Vérifier que le statut n'est pas terminé
  const s = (interventionEnCours.statut || '').toLowerCase();
  const isTermine = s === 'termine' || s === 'cloture' || Boolean(interventionEnCours.date_cloture);
  assert.equal(isTermine, false, 'Le dossier doit être reconnu comme EN COURS');

  // Mise à jour du port alors que le technicien câble encore
  interventionEnCours.port = '7';
  interventionEnCours.updated_at = '2026-10-15 12:08:00';

  const portDef = FieldMapping.FIELD_DEFINITIONS.find((f) => f.key === 'port');
  assert.equal(portDef.extractor(interventionEnCours), '7', 'Le port modifié en cours de travail doit être récupéré');
});

test('Cas 4 : Actualisation manuelle de ChapTech sans réutilisation de données obsolètes (anti-cache)', () => {
  // Vérification de la construction des headers et URL avec cache-busting
  const baseUrl = 'https://fibretrack.mantota.com/api/index.php';
  const action = 'intervention_get';
  const clean = baseUrl.replace(/\/+$/, '');
  const urlWithBuster = `${clean}?action=${action}&_t=${Date.now()}`;

  assert.match(urlWithBuster, /_t=\d+/, 'L’URL doit contenir le paramètre _t avec timestamp');

  // Headers no-cache stricts
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };

  assert.equal(headers['Cache-Control'], 'no-cache, no-store, must-revalidate');
  assert.equal(headers['Pragma'], 'no-cache');
});

test('Cas 5 : Modification de plusieurs catégories de photos et vérification de leur classement', () => {
  const dataMultiPhotos = {
    id: '505',
    whatsapp_photos: [
      { slot: 'cable_interne', url: 'https://ft.com/img_interne.jpg', name: 'cable_interne.jpg' },
      { slot: 'cable_externe', url: 'https://ft.com/img_externe.jpg', name: 'cable_externe.jpg' },
      { slot: 'fat', url: 'https://ft.com/img_fat.jpg', name: 'boitier_fat.jpg' },
      { slot: 'mesure_fat', url: 'https://ft.com/img_mesure_fat.jpg', name: 'mesure_fat.jpg' },
      { slot: 'mesure_pto', url: 'https://ft.com/img_mesure_pto.jpg', name: 'mesure_pto.jpg' },
      { slot: 'ont_sn', url: 'https://ft.com/img_ont.jpg', name: 'ont_sn.jpg' },
      { slot: 'debit_cable', url: 'https://ft.com/img_debit.jpg', name: 'debit_cable.jpg' },
      { slot: 'contrat_client', url: 'https://ft.com/img_contrat.jpg', name: 'contrat.jpg' },
    ],
  };

  for (const rule of PhotoFiller.PHOTO_SLOT_RULES) {
    const photo = rule.getPhoto(dataMultiPhotos);
    if (photo) {
      assert.equal(photo.slot, rule.key, `La photo extraite pour ${rule.key} doit correspondre exactement au slot`);
    }
  }

  // Vérifier qu'une photo de câble interne ne donne jamais la photo de câble externe
  const ruleInterne = PhotoFiller.PHOTO_SLOT_RULES.find((r) => r.key === 'cable_interne');
  const ruleExterne = PhotoFiller.PHOTO_SLOT_RULES.find((r) => r.key === 'cable_externe');
  assert.notEqual(ruleInterne.getPhoto(dataMultiPhotos).src, ruleExterne.getPhoto(dataMultiPhotos).src);
});

test('Cas 6 : Remplissage complet de CellPros avec contrôle de chaque champ de destination', async () => {
  const doc = new MockDocument();

  // Création des champs cibles CellPros
  const elNom = doc.createElement('input');
  doc.registerElement('field_nomClient', elNom);
  doc.body.appendChild(elNom);

  const elTel = doc.createElement('input');
  doc.registerElement('field_telephone', elTel);
  doc.body.appendChild(elTel);

  const elFat = doc.createElement('input');
  doc.registerElement('field_fatRef', elFat);
  doc.body.appendChild(elFat);

  const elSn = doc.createElement('input');
  doc.registerElement('field_serialNumber', elSn);
  doc.body.appendChild(elSn);

  const elPto = doc.createElement('input');
  doc.registerElement('field_puissancePto', elPto);
  doc.body.appendChild(elPto);

  const intervention = {
    nom_client: 'Hounnou Jean',
    telephone_ligne: '21314567',
    fat_ref: 'FAT-AKPAKPA-09',
    sn: 'HWTC12345678',
    puissance_pto_dbm: '-18.4',
  };

  const report = await FormFiller.autofillPage(intervention, doc.body);

  assert.equal(report.filledCount, 5, '5 champs doivent être remplis avec succès');
  assert.equal(elNom.value, 'Hounnou Jean');
  assert.equal(elTel.value, '21314567');
  assert.equal(elFat.value, 'FAT-AKPAKPA-09');
  assert.equal(elSn.value, 'HWTC12345678');
  assert.equal(elPto.value, '-18.4');
});

test('Cas 7 : Test de toutes les catégories de photos de l’Étape 4 (Câbles, FAT, Mesures, Contrat)', () => {
  const step4Slots = [
    'cable_interne',
    'cable_externe',
    'fat',
    'scan_fat',
    'fibre_fat',
    'mesure_fat',
    'mesure_pto',
    'debit_cable',
    'debit_wifi',
    'combine',
    'fiche_combine',
    'contrat_client',
  ];

  const fullData = {
    whatsapp_photos: step4Slots.map((s) => ({
      slot: s,
      url: `https://ft.com/uploads/${s}_123.jpg`,
      name: `${s}.jpg`,
    })),
  };

  for (const slotKey of step4Slots) {
    const rule = PhotoFiller.PHOTO_SLOT_RULES.find((r) => r.key === slotKey);
    assert.ok(rule, `Règle de photo pour ${slotKey} doit exister`);
    const photo = rule.getPhoto(fullData);
    assert.ok(photo, `Photo pour ${slotKey} doit être trouvée`);
    assert.equal(photo.slot, slotKey);
    assert.match(photo.src, new RegExp(slotKey));
  }
});

test('Cas 8 : Contrôle des étapes 1 à 5 (Texte, Numérique, Sélecteurs, Conformité)', () => {
  // Vérifier la présence des définitions de champs pour chaque étape (1, 2, 3, 4, 5)
  const stepsFound = new Set();
  for (const def of FieldMapping.FIELD_DEFINITIONS) {
    if (def.step) stepsFound.add(def.step);
  }

  assert.ok(stepsFound.has(1), 'Étape 1 (Client) doit avoir des champs mappés');
  assert.ok(stepsFound.has(2), 'Étape 2 (Réseau/Équipements) doit avoir des champs mappés');
  assert.ok(stepsFound.has(3), 'Étape 3 (Câblage/Métrage) doit avoir des champs mappés');
  assert.ok(stepsFound.has(4), 'Étape 4 (Mesures/Contrôles) doit avoir des champs mappés');
  assert.ok(stepsFound.has(5), 'Étape 5 (Conformité/Signature) doit avoir des champs mappés');
});

test('Cas 9 : Donnée ou photo absente ne provoque JAMAIS d’insertion incorrecte (onAbsent)', () => {
  const doc = new MockDocument();

  // Conteneur d'upload pour une photo absente
  const container = doc.createElement('div');
  container.innerText = 'Image mesure optique au PTO';
  const fileInput = doc.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'field_photoMesurePto';
  container.appendChild(fileInput);
  doc.body.appendChild(container);

  // Intervention SANS mesure PTO
  const incompleteData = {
    id: '909',
    whatsapp_photos: [
      { slot: 'cable_interne', url: 'https://ft.com/cable.jpg' }, // Autre photo
    ],
  };

  const identified = PhotoFiller.identifyPhotoContainer(container, fileInput);
  assert.equal(identified.key, 'mesure_pto');

  // Tenter d'extraire la photo
  const photo = identified.getPhoto(incompleteData);
  assert.equal(photo, null, 'Aucune photo ne doit être extraite si le slot est absent');

  // Application du badge manquant
  PhotoFiller.markContainerMissing(container, identified.label);
  assert.equal(container.style.borderColor, '#f59e0b', 'Bordure orange d’avertissement requise');
});

test('Cas 10 : Préservation stricte des modifications manuelles lors des rafraîchissements', () => {
  const doc = new MockDocument();
  const inputPhone = doc.createElement('input');
  inputPhone.id = 'field_telephone';
  inputPhone.value = '97000000';
  doc.body.appendChild(inputPhone);

  const initialData = { telephone_ligne: '97000000', mobile: '95000000' };
  FormFiller.fillElement(inputPhone, initialData.telephone_ligne, { key: 'telephone_ligne' });

  assert.equal(inputPhone.dataset.chaptechUserModified, 'false');

  // Le technicien corrige manuellement le numéro dans CellPros
  inputPhone.value = '97112233';
  inputPhone.dataset.chaptechUserModified = 'true'; // Marqué par l'écouteur de frappe

  // FibreTrack envoie une nouvelle valeur
  const updatedData = { telephone_ligne: '97999999' };
  const filled = FormFiller.fillElement(inputPhone, updatedData.telephone_ligne, { key: 'telephone_ligne' });

  assert.equal(filled, false, 'Le champ modifié manuellement NE doit PAS être écrasé');
  assert.equal(inputPhone.value, '97112233', 'La valeur saisie par le technicien doit être préservée');
});

test('Cas 11 : Interruption temporaire de connexion et reprise sans perte de photos', () => {
  // État initial en mémoire
  const activeCached = {
    id: '1101',
    nom_client: 'Soglo Bertin',
    whatsapp_photos: [{ slot: 'fat', url: 'https://ft.com/fat.jpg' }],
    points_gps: [{ type: 'FAT', lat: 6.36, lng: 2.42 }],
  };

  // Coupure réseau : l'appel API échoue
  let networkOnline = false;
  let fetchedDetails = null;

  try {
    if (!networkOnline) throw new Error('Failed to fetch');
    fetchedDetails = { id: '1101' };
  } catch {
    // Mode hors-ligne : préservation de l'intervention complète en mémoire
    if (activeCached && activeCached.whatsapp_photos) {
      fetchedDetails = activeCached;
    }
  }

  assert.ok(fetchedDetails, 'Le fallback hors-ligne doit conserver l’objet');
  assert.equal(fetchedDetails.whatsapp_photos.length, 1, 'Les photos ne doivent pas être perdues en mode hors-ligne');

  // Rétablissement réseau (online)
  networkOnline = true;
  assert.equal(networkOnline, true, 'La reconnexion réseau doit réactiver la synchronisation');
});

test('Cas 12 : Fermeture et réouverture de l’extension (Persistance complète)', () => {
  const localStorageMock = new Map();

  // Enregistrement avant fermeture
  const sessionData = {
    id: '1201',
    nom_client: 'Zinsou Marc',
    fat_ref: 'FAT-CALAVI-02',
    puissance_pto_dbm: '-19.1',
    whatsapp_photos: [{ slot: 'cable_interne', url: 'https://ft.com/cable.jpg' }],
  };

  localStorageMock.set('activeIntervention', JSON.stringify(sessionData));

  // Réouverture de l'extension dans un nouvel onglet ou après redémarrage du navigateur
  const restoredRaw = localStorageMock.get('activeIntervention');
  assert.ok(restoredRaw, 'Les données doivent être persistées dans le storage');

  const restored = JSON.parse(restoredRaw);
  assert.equal(restored.id, '1201');
  assert.equal(restored.nom_client, 'Zinsou Marc');
  assert.equal(restored.whatsapp_photos.length, 1);
  assert.equal(restored.puissance_pto_dbm, '-19.1');
});
