import test from 'node:test';
import assert from 'node:assert/strict';
import '../content/field-mapping.js';
import '../content/photo-filler.js';
import '../content/form-filler.js';

const FormFiller = globalThis.FormFiller;
const PhotoFiller = globalThis.PhotoFiller;

// Mock DOM pour tester les mécanismes d'injection et de dispatch d'événements
class MockEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles ?? false;
    this.cancelable = options.cancelable ?? false;
  }
}
globalThis.Event = MockEvent;

class MockElement {
  constructor(tagName = 'input', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || '';
    this.name = attrs.name || '';
    this.type = attrs.type || 'text';
    this.value = attrs.value || '';
    this.checked = attrs.checked || false;
    this.attributes = { ...attrs };
    this.classList = {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    };
    this.dispatchedEvents = [];
    this.options = attrs.options || [];
    this.selectedIndex = -1;
    this.ownerDocument = null;
  }

  getAttribute(attr) {
    return this.attributes[attr] || this.attributes[attr.toLowerCase()] || null;
  }

  setAttribute(attr, val) {
    this.attributes[attr] = val;
  }

  dispatchEvent(evt) {
    this.dispatchedEvents.push(evt.type);
    return true;
  }

  closest() {
    return null;
  }
}

class MockDocument {
  constructor(elements = []) {
    this.elements = elements;
    elements.forEach(el => el.ownerDocument = this);
  }

  querySelectorAll(selector) {
    // Basic filter supporting input type="radio" and general selector
    if (selector.includes('type="radio"')) {
      const match = selector.match(/name="([^"]+)"/);
      const name = match ? match[1] : '';
      return this.elements.filter(el => el.type === 'radio' && el.name === name);
    }
    return this.elements;
  }

  querySelector() {
    return null;
  }
}

test('FormFiller - setNativeInputValue sets value and dispatches focus, input, change, blur', () => {
  const input = new MockElement('input', { id: 'field_nomClient' });
  FormFiller.setNativeInputValue(input, 'Marc AGBODJAN');

  assert.equal(input.value, 'Marc AGBODJAN');
  assert.deepEqual(input.dispatchedEvents, ['focus', 'input', 'change', 'blur']);
});

test('FormFiller - setNativeCheckboxValue checks element and dispatches events', () => {
  const checkbox = new MockElement('input', { id: 'field_travauxConformes', type: 'checkbox' });
  FormFiller.setNativeCheckboxValue(checkbox, true);

  assert.equal(checkbox.checked, true);
  assert.ok(checkbox.dispatchedEvents.includes('click'));
  assert.ok(checkbox.dispatchedEvents.includes('input'));
  assert.ok(checkbox.dispatchedEvents.includes('change'));
});

test('FormFiller - setNativeSelectValue matches by value or text', () => {
  const select = new MockElement('select', {
    id: 'field_offre',
    options: [
      { value: '', textContent: '-- Choisir --' },
      { value: 'Fibre Pro', textContent: 'Fibre Pro (200 Mbps)' },
      { value: 'Pro Max', textContent: 'Pro Max (500 Mbps)' },
    ],
  });

  const matched = FormFiller.setNativeSelectValue(select, 'Fibre Pro');
  assert.ok(matched);
  assert.equal(select.selectedIndex, 1);
  assert.equal(select.value, 'Fibre Pro');
  assert.ok(select.dispatchedEvents.includes('change'));
});

test('FormFiller - handleRadioGroup selects matching radio button', () => {
  const radioYes = new MockElement('input', {
    name: 'travauxOkGroup',
    type: 'radio',
    value: '1',
    attributes: { 'aria-label': 'Oui' },
  });
  const radioNo = new MockElement('input', {
    name: 'travauxOkGroup',
    type: 'radio',
    value: '0',
    attributes: { 'aria-label': 'Non' },
  });

  const doc = new MockDocument([radioYes, radioNo]);
  radioYes.ownerDocument = doc;
  radioNo.ownerDocument = doc;

  const res = FormFiller.handleRadioGroup(radioYes, true);
  assert.ok(res);
  assert.equal(radioYes.checked, true);
  assert.equal(radioNo.checked, false);
});

test('FormFiller - autofillPage matches and fills complete simulated CelPros form', async () => {
  const elNom = new MockElement('input', { id: 'field_nomClient', name: 'nomClient' });
  const elMobile = new MockElement('input', { id: 'field_mobile', name: 'mobile' });
  const elAdresse = new MockElement('input', { id: 'field_adresse', name: 'adresse' });
  const elFat = new MockElement('input', { id: 'field_fat', name: 'fat' });
  const elPort = new MockElement('input', { id: 'field_port', name: 'port' });
  const elPuissanceFat = new MockElement('input', { id: 'field_puissanceFat', name: 'puissanceFat', type: 'number' });
  const elPuissancePto = new MockElement('input', { id: 'field_puissancePto', name: 'puissancePto', type: 'number' });
  const elMac = new MockElement('input', { id: 'field_mac', name: 'mac' });
  const elSn = new MockElement('input', { id: 'field_sn', name: 'sn' });
  const elConforme = new MockElement('input', { id: 'field_travauxConformes', type: 'checkbox' });

  const doc = new MockDocument([
    elNom,
    elMobile,
    elAdresse,
    elFat,
    elPort,
    elPuissanceFat,
    elPuissancePto,
    elMac,
    elSn,
    elConforme,
  ]);

  const mockIntervention = {
    nom_client: 'HOUENOU Rodrigue',
    mobile: '0197887766',
    adresse_zone: 'Fidjrossè, Cotonou',
    fat_ref: 'FAT-FID-14',
    port: '2',
    puissance_fat_dbm: -18.20,
    puissance_pto_dbm: -19.45,
    mac: '28:6C:07:99:88:77',
    sn: 'HWTC12345678',
    travaux_conformes: true,
  };

  const report = await FormFiller.autofillPage(mockIntervention, doc);

  assert.ok(report.success);
  assert.equal(report.filledCount, 10);
  assert.equal(elNom.value, 'HOUENOU Rodrigue');
  assert.equal(elMobile.value, '0197887766');
  assert.equal(elAdresse.value, 'Fidjrossè, Cotonou');
  assert.equal(elFat.value, 'FAT-FID-14');
  assert.equal(elPort.value, '2');
  assert.equal(elPuissanceFat.value, '-18.2');
  assert.equal(elPuissancePto.value, '-19.45');
  assert.equal(elMac.value, '28:6C:07:99:88:77');
  assert.equal(elSn.value, 'HWTC12345678');
  assert.equal(elConforme.checked, true);
});

test('FormFiller - formatGlobalReport outputs WhatsApp format with bold asterisks and exact structure', () => {
  const mockIntervention = {
    nom_client: 'SOSSOU Paul',
    adresse_zone: 'Cadjehoun, Cotonou',
    mobile: '0196554433',
    telephone_ligne: '0121293029',
    nom_technicien: 'Rodolpho',
    fat_ref: 'SEM-PL02 FAT191',
    msan: 'SEM-PL02',
    port: '2',
    ports_disponibles: 'Port 3, Port 4, Port 5',
    puissance_fat_dbm: -19.93,
    puissance_pto_dbm: -19.47,
    lineaire_m: 200,
    mac: '9025F247EC49-59(17)',
    sn: '4857544329E4FBB8',
    date: '2026-10-15',
    points_gps: [
      { type: 'Abonné', lat: 6.3794279, lng: 2.5992384 },
      { type: 'FAT', lat: 6.37951, lng: 2.59950 },
    ],
    poteaux: [
      { numero: 1, type_poteau: 'sbee', latitude: 6.3796868, longitude: 2.5996342, traversed: true },
      { numero: 2, type_poteau: 'sbee', latitude: 6.3793048, longitude: 2.599595, traversed: true },
      { numero: 3, type_poteau: 'petit_jean', latitude: 6.3787602, longitude: 2.5998584, traversed: true },
      { numero: 4, type_poteau: 'petit_jean', latitude: 6.3785583, longitude: 2.599395, traversed: true },
      { numero: 1, type_poteau: 'sbee', latitude: 6.3820145, longitude: 2.5994916, arme: true },
    ],
    materiel_pose: {
      crochets: 10,
      piton: 1,
      cheville: 1,
      traverse_15t: 1,
    },
  };

  const text = FormFiller.formatGlobalReport(mockIntervention, { realises: 0, recus: 0 });

  assert.ok(text.includes("*Chef d'Équipe : Rodolpho*"));
  assert.ok(text.includes('*00 Réalisés / 00 Reçus*'));
  assert.ok(text.includes('*RACCORDEMENT*'));
  assert.ok(text.includes('*Client: SOSSOU Paul*'));
  assert.ok(text.includes('*Etat:PON*'));
  assert.ok(text.includes('*Msan: SEM-PL02  FAT191*'));
  assert.ok(text.includes('*Linéaire:200.0m*'));
  assert.ok(text.includes('*Puissance FAT: -19.93 dBm*'));
  assert.ok(text.includes('*Puissance PTO: -19.47 dBm*'));
  assert.ok(text.includes('*CPC 200: 01*'));
  assert.ok(text.includes('*CPC 50: 00*'));
  assert.ok(text.includes('*Crochets:10*'));
  assert.ok(text.includes('*GPS poteaux SBEE*'));
  assert.ok(text.includes('*GPS PT1: 6.3796868,2.5996342*'));
  assert.ok(text.includes('*GPS poteaux Petit Jean*'));
  assert.ok(text.includes('*GPS abonné: 6.3794279,2.5992384*'));
  assert.ok(text.includes('*GPS FAT: 6.37951,2.5995*'));
});

test('FormFiller - formatConformiteReport outputs plain text conforming to official audit structure', () => {
  const mockIntervention = {
    nom_client: 'ODOUNLAMI CHORIC DAVID',
    mobile: '0197337800',
    telephone_ligne: '0121293766',
    nom_technicien: 'RODOLPHO',
    fat_ref: 'FAT140',
    msan: 'SEM-PL02',
    lineaire_m: 350,
    date: '2026-10-15',
    points_gps: [
      { type: 'Abonné', lat: 6.3862167, lng: 2.6116733 },
      { type: 'FAT', lat: 6.3854482, lng: 2.6129592 },
    ],
    poteaux: [
      { numero: 1, type_poteau: 'sbee', latitude: 6.38580, longitude: 2.61296, traversed: true },
      { numero: 2, type_poteau: 'sbee', latitude: 6.38603, longitude: 2.61289, traversed: true },
      { numero: 1, type_poteau: 'petit_jean', latitude: 6.38612, longitude: 2.61201, traversed: true },
      { numero: 1, type_poteau: 'sbee', latitude: 6.38580, longitude: 2.61296, arme: true },
      { numero: 2, type_poteau: 'sbee', latitude: 6.38603, longitude: 2.61289, arme: true },
    ],
  };

  const text = FormFiller.formatConformiteReport(mockIntervention);

  assert.ok(text.includes('Équipe : RODOLPHO'));
  assert.ok(text.includes('15/10/2026'));
  assert.ok(text.includes('RACCORDEMENT — CONFORMITÉ'));
  assert.ok(text.includes('Client : ODOUNLAMI CHORIC DAVID'));
  assert.ok(text.includes('Ligne : 0121293766'));
  assert.ok(text.includes('MSAN : SEM-PL02  FAT140'));
  assert.ok(text.includes('Linéaire : 350 m'));
  assert.ok(text.includes('GPS FAT : 6.3854482, 2.6129592'));
  assert.ok(text.includes('GPS abonné : 6.3862167, 2.6116733'));
  assert.ok(text.includes('Poteaux traversés : 03'));
  assert.ok(text.includes('Poteaux SBEE : 02'));
  assert.ok(text.includes('Poteau Petit Jean : 01'));
  assert.ok(text.includes('GPS poteaux SBEE :'));
  assert.ok(text.includes('- PT1 : 6.3858, 2.61296'));
  assert.ok(text.includes('GPS poteau Petit Jean : 6.38612, 2.61201'));
  assert.ok(!text.includes('*')); // Aucun astérisque dans le rapport de conformité
});

test('FormFiller - setNativeInputValue sanitizes comma decimals for number inputs', () => {
  const numberInput = new MockElement('input', { id: 'field_puissanceFat', type: 'number' });
  FormFiller.setNativeInputValue(numberInput, '-18,75');
  assert.equal(numberInput.value, '-18.75');

  const regularInput = new MockElement('input', { id: 'field_adresse', type: 'text' });
  FormFiller.setNativeInputValue(regularInput, 'Cotonou, Bénin');
  assert.equal(regularInput.value, 'Cotonou, Bénin'); // N'altère pas les virgules de texte
});

test('FormFiller - setNativeSelectValue handles null, undefined, empty safely', () => {
  const select = new MockElement('select', {
    id: 'field_etat',
    options: [{ value: 'PON', textContent: 'PON' }],
  });
  assert.equal(FormFiller.setNativeSelectValue(select, null), false);
  assert.equal(FormFiller.setNativeSelectValue(select, undefined), false);
  assert.equal(FormFiller.setNativeSelectValue(select, ''), false);
});

test('PhotoFiller - Does NOT invent photos or reuse generic indices when photos do not exist', () => {
  const emptyIntv = {
    points_gps: [],
    whatsapp_photos: [],
  };

  for (const rule of PhotoFiller.PHOTO_SLOT_RULES) {
    const photo = rule.getPhoto(emptyIntv);
    assert.equal(photo, null, `Slot ${rule.key} should NOT return any photo for empty intervention`);
  }
});

test('PhotoFiller - Returns photo only for corresponding matching slot', () => {
  const realFatIntv = {
    points_gps: [
      { type: 'FAT', photo: 'data:image/jpeg;base64,12345' },
    ],
    whatsapp_photos: [],
    signature_client: 'data:image/png;base64,signaturedata123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345',
  };

  const fatRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'fat');
  const ontRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'ont_sn');
  const contratRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'contrat_client');
  const cableRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'cable_interne');

  assert.ok(fatRule.getPhoto(realFatIntv));
  assert.equal(fatRule.getPhoto(realFatIntv).name, 'fat_raccordement.jpg');
  assert.equal(ontRule.getPhoto(realFatIntv), null); // Pas d'abonné -> aucun fallback fictif
  assert.equal(cableRule.getPhoto(realFatIntv), null); // Pas de photo de câble -> aucun fallback
  assert.ok(contratRule.getPhoto(realFatIntv)); // Vraie signature client
});

test('PhotoFiller - Correctly matches photos by explicit slot tag', () => {
  const structuredIntv = {
    points_gps: [],
    whatsapp_photos: [
      { slot: 'cable_interne', url: 'data:image/jpeg;base64,cable123' },
      { slot: 'mesure_fat', url: 'data:image/jpeg;base64,mesurefat123' },
      { slot: 'scan_fat', url: 'data:image/jpeg;base64,scanfat123' },
    ],
  };

  const cableRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'cable_interne');
  const mesureFatRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'mesure_fat');
  const scanFatRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'scan_fat');
  const debitRule = PhotoFiller.PHOTO_SLOT_RULES.find(r => r.key === 'debit_cable');

  assert.equal(cableRule.getPhoto(structuredIntv)?.src, 'data:image/jpeg;base64,cable123');
  assert.equal(mesureFatRule.getPhoto(structuredIntv)?.src, 'data:image/jpeg;base64,mesurefat123');
  assert.equal(scanFatRule.getPhoto(structuredIntv)?.src, 'data:image/jpeg;base64,scanfat123');
  assert.equal(debitRule.getPhoto(structuredIntv), null);
});

test('FormFiller - autofillPage leaves unrecorded fields empty and does not invent data', async () => {
  const elNom = new MockElement('input', { id: 'field_nomClient', name: 'nomClient', value: '' });
  const elOffre = new MockElement('select', { id: 'field_offre', name: 'offre', options: [{ value: '', textContent: '--' }, { value: 'Fibre Pro', textContent: 'Fibre Pro' }] });
  const elPiton = new MockElement('input', { id: 'field_piton', name: 'piton', type: 'number', value: '' });
  const elPince = new MockElement('input', { id: 'field_pince', name: 'pince', type: 'number', value: '' });
  const elPuissance = new MockElement('input', { id: 'field_puissanceFat', name: 'puissanceFat', type: 'number', value: '' });

  const doc = new MockDocument([elNom, elOffre, elPiton, elPince, elPuissance]);

  // Intervention avec UNIQUEMENT le nom et 5 pitons dans materiel_pose
  const partialIntervention = {
    nom_client: 'AKPOVI Serge',
    materiel_pose: { piton: 5 },
    // puissance_fat_dbm: 0 (non mesuré)
    // offre_souscrite: '' (non renseigné)
  };

  const report = await FormFiller.autofillPage(partialIntervention, doc);

  assert.ok(report.success);
  assert.equal(report.filledCount, 2); // Uniquement nom et piton
  assert.equal(elNom.value, 'AKPOVI Serge');
  assert.equal(elPiton.value, '5'); // 5 pitons réels
  assert.equal(elPince.value, ''); // Pince non renseignée -> reste vide
  assert.equal(elPuissance.value, ''); // Puissance 0/non renseignée -> reste vide
  assert.equal(elOffre.value, ''); // Pas d'offre souscrite -> reste vide
});

test('PhotoFiller - Additional photos (photos additionnelles) are strictly excluded from CelPros upload', () => {
  const intvWithAdditionnelle = {
    points_gps: [],
    whatsapp_photos: [
      {
        id: 'photo-add-1',
        label: 'Photo additionnelle',
        type: 'additionnelle',
        slot: 'additionnelle',
        additionnelle: true,
        is_additionnelle: true,
        exclude_celpros: true,
        url: 'data:image/jpeg;base64,additionnellePhoto123',
        description: 'Photo additionnelle prise sur le terrain',
      },
      {
        id: 'photo-add-2',
        label: 'Photo additionnelle (façade poteau)',
        type: 'additionnelle',
        slot: 'additionnelle',
        additionnelle: true,
        is_additionnelle: true,
        exclude_celpros: true,
        url: 'data:image/jpeg;base64,additionnellePhoto456',
        description: 'Photo additionnelle avec mot fat ou poteau',
      },
    ],
  };

  // Aucune règle CelPros ne doit extraire une photo additionnelle
  for (const rule of PhotoFiller.PHOTO_SLOT_RULES) {
    const photo = rule.getPhoto(intvWithAdditionnelle);
    assert.equal(photo, null, `Slot ${rule.key} ne doit JAMAIS recevoir de photo additionnelle`);
  }

  // isExcludedFromCelpros doit renvoyer true pour ces photos
  assert.equal(PhotoFiller.isExcludedFromCelpros(intvWithAdditionnelle.whatsapp_photos[0]), true);
  assert.equal(PhotoFiller.isExcludedFromCelpros(intvWithAdditionnelle.whatsapp_photos[1]), true);

  // Et false pour une vraie photo CelPros
  assert.equal(PhotoFiller.isExcludedFromCelpros({ slot: 'fat', url: 'data:image/jpeg;base64,fat1' }), false);
});

