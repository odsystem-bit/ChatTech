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

test('FormFiller - formatWhatsAppReport outputs well-formatted text report with GPS and photos', () => {
  const mockIntervention = {
    nom_client: 'SOSSOU Paul',
    adresse_zone: 'Cadjehoun, Cotonou',
    mobile: '0196554433',
    nom_technicien: 'Davy H.',
    fat_ref: 'FAT-CAD-02',
    port: '5',
    puissance_fat_dbm: -17.8,
    puissance_pto_dbm: -19.1,
    lineaire_m: 120,
    mac: '00:11:22:33:44:55',
    sn: 'ZTE12345',
    travaux_conformes: true,
    service_fonctionne: true,
    points_gps: [
      { type: 'Abonné', lat: 6.3562, lng: 2.4128 },
    ],
    whatsapp_photos: [{ id: 'photo-1' }, { id: 'photo-2' }],
  };

  const text = FormFiller.formatWhatsAppReport(mockIntervention);

  assert.ok(text.includes('RAPPORT D\'INTERVENTION FIBRE - CELTIIS'));
  assert.ok(text.includes('SOSSOU Paul'));
  assert.ok(text.includes('FAT-CAD-02'));
  assert.ok(text.includes('-17.8 dBm'));
  assert.ok(text.includes('-19.1 dBm'));
  assert.ok(text.includes('120 m'));
  assert.ok(text.includes('ZTE12345'));
  assert.ok(text.includes('OUI ✅'));
  assert.ok(text.includes('6.356200, 2.412800'));
  assert.ok(text.includes('https://maps.google.com/?q=6.3562,2.4128'));
  assert.ok(text.includes('2 photo(s)'));
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

