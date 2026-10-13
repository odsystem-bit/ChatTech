import test from 'node:test';
import assert from 'node:assert/strict';
import '../content/field-mapping.js';

const FieldMapping = globalThis.FieldMapping;

test('FieldMapping - normalizeText removes accents, punctuation, and trims', () => {
  assert.equal(FieldMapping.normalizeText('Nom du client'), 'nomduclient');
  assert.equal(FieldMapping.normalizeText('Téléphone / Mobile :'), 'telephonemobile');
  assert.equal(FieldMapping.normalizeText('Réf. FAT (dBm)'), 'reffatdbm');
  assert.equal(FieldMapping.normalizeText('  État PON  '), 'etatpon');
  assert.equal(FieldMapping.normalizeText(''), '');
  assert.equal(FieldMapping.normalizeText(null), '');
});

test('FieldMapping - FIELD_DEFINITIONS contains all critical intervention keys', () => {
  const keys = Object.keys(FieldMapping.FIELD_DEFINITIONS);

  // Client
  assert.ok(keys.includes('nom_client'));
  assert.ok(keys.includes('adresse_zone'));
  assert.ok(keys.includes('telephone_ligne'));
  assert.ok(keys.includes('mobile'));
  assert.ok(keys.includes('offre_souscrite'));

  // Général
  assert.ok(keys.includes('date'));
  assert.ok(keys.includes('nom_technicien'));
  assert.ok(keys.includes('nom_equipe'));

  // Réseau & FAT
  assert.ok(keys.includes('etat'));
  assert.ok(keys.includes('msan'));
  assert.ok(keys.includes('fat_ref'));
  assert.ok(keys.includes('port'));
  assert.ok(keys.includes('ports_disponibles'));
  assert.ok(keys.includes('port_disponible'));
  assert.ok(keys.includes('puissance_fat_dbm'));

  // Câblage
  assert.ok(keys.includes('type_cable'));
  assert.ok(keys.includes('depart_m'));
  assert.ok(keys.includes('arrivee_m'));
  assert.ok(keys.includes('lineaire_m'));
  assert.ok(keys.includes('nb_poteaux_traverses'));
  assert.ok(keys.includes('nb_poteaux_implantes'));
  assert.ok(keys.includes('nb_poteaux_armes'));

  // Intérieur
  assert.ok(keys.includes('puissance_pto_dbm'));
  assert.ok(keys.includes('pto_qte'));
  assert.ok(keys.includes('repeteur_wifi_qte'));
  assert.ok(keys.includes('emplacement_ont'));
  assert.ok(keys.includes('mac'));
  assert.ok(keys.includes('sn'));

  // Conformité
  assert.ok(keys.includes('travaux_conformes'));
  assert.ok(keys.includes('emplacement_valide'));
  assert.ok(keys.includes('travail_propre'));
  assert.ok(keys.includes('service_teste'));
  assert.ok(keys.includes('service_fonctionne'));
  assert.ok(keys.includes('explications_donnees'));
  assert.ok(keys.includes('qualite'));
  assert.ok(keys.includes('remarque_libre'));

  // GPS
  assert.ok(keys.includes('latitude'));
  assert.ok(keys.includes('longitude'));
  assert.ok(keys.includes('gps_coordinates'));
});

test('FieldMapping - valueExtractors correctly extract data from intervention object', () => {
  const mockIntervention = {
    nom_client: 'KOUASSI Jean-Baptiste',
    nom_technicien: 'Davy H.',
    nom_equipe: 'TELECOM BTP Services',
    date: '2026-10-13T10:00:00Z',
    adresse_zone: 'Haie Vive, Cotonou',
    mobile: '0197123456',
    etat: 'PON',
    msan: 'MSAN_COTONOU_02',
    fat_ref: 'FAT-HV-07',
    port: '4',
    ports_disponibles: 'Port 1, Port 2, Port 8',
    puissance_fat_dbm: '-18,45', // Format virgule terrain
    puissance_pto_dbm: '-19,80', // Format virgule terrain
    depart_m: '1000,5',
    arrivee_m: '1150,5',
    lineaire_m: '150',
    mac: '48:57:02:11:22:33',
    sn: 'ALCLB998877',
    travaux_conformes: true,
    service_fonctionne: true,
    points_gps: [
      { type: 'Abonné', numero: 1, lat: 6.3560, lng: 2.4125 }, // Abonné EN PREMIER pour piéger le bug de dernier élément
      { type: 'Poteau', numero: 1, lat: 6.3551, lng: 2.4110 },
    ],
  };

  const defs = FieldMapping.FIELD_DEFINITIONS;
  assert.equal(defs.nom_client.valueExtractor(mockIntervention), 'KOUASSI Jean-Baptiste');
  assert.equal(defs.nom_technicien.valueExtractor(mockIntervention), 'Davy H.');
  assert.equal(defs.nom_equipe.valueExtractor(mockIntervention), 'TELECOM BTP Services');
  assert.equal(defs.date.valueExtractor(mockIntervention), '2026-10-13');
  assert.equal(defs.adresse_zone.valueExtractor(mockIntervention), 'Haie Vive, Cotonou');
  assert.equal(defs.mobile.valueExtractor(mockIntervention), '0197123456');
  assert.equal(defs.msan.valueExtractor(mockIntervention), 'MSAN_COTONOU_02');
  assert.equal(defs.fat_ref.valueExtractor(mockIntervention), 'FAT-HV-07');
  assert.equal(defs.port.valueExtractor(mockIntervention), '4');
  assert.equal(defs.puissance_fat_dbm.valueExtractor(mockIntervention), '-18.45');
  assert.equal(defs.puissance_pto_dbm.valueExtractor(mockIntervention), '-19.80');
  assert.equal(defs.depart_m.valueExtractor(mockIntervention), '1000.5');
  assert.equal(defs.arrivee_m.valueExtractor(mockIntervention), '1150.5');
  assert.equal(defs.lineaire_m.valueExtractor(mockIntervention), '150');
  assert.equal(defs.mac.valueExtractor(mockIntervention), '48:57:02:11:22:33');
  assert.equal(defs.sn.valueExtractor(mockIntervention), 'ALCLB998877');
  assert.equal(defs.travaux_conformes.valueExtractor(mockIntervention), true);
  assert.equal(defs.service_fonctionne.valueExtractor(mockIntervention), true);
  // Vérifie que Abonné a bien été extrait et non Poteau malgré l'accent
  assert.equal(defs.latitude.valueExtractor(mockIntervention), '6.356');
  assert.equal(defs.longitude.valueExtractor(mockIntervention), '2.4125');
  assert.equal(defs.gps_coordinates.valueExtractor(mockIntervention), '6.356000, 2.412500');
});

test('FieldMapping - extractTargetGpsPoint correctly handles accented Abonné and fallback', () => {
  // Cas critique : Abonné avec accent aigu placé avant les poteaux
  const withAccentedAbonne = {
    points_gps: [
      { type: 'Abonné', lat: 6.36, lng: 2.42 },
      { type: 'Poteau', lat: 6.99, lng: 2.99 },
    ],
  };
  const extractedAbonne = FieldMapping.extractTargetGpsPoint(withAccentedAbonne);
  assert.ok(extractedAbonne);
  assert.equal(extractedAbonne.lat, 6.36);
  assert.equal(extractedAbonne.lng, 2.42);

  // Cas sans abonné : prend le dernier point
  const onlyPoteaux = {
    points_gps: [
      { type: 'Poteau 1', lat: 6.10, lng: 2.10 },
      { type: 'Poteau 2', lat: 6.20, lng: 2.20 },
    ],
  };
  const extractedLast = FieldMapping.extractTargetGpsPoint(onlyPoteaux);
  assert.ok(extractedLast);
  assert.equal(extractedLast.lat, 6.20);
  assert.equal(extractedLast.lng, 2.20);
});

test('FieldMapping - matchElementToField matches JHipster style input attributes', () => {
  // Mock element with JHipster formControlName="nomClient"
  const elClient = {
    id: 'field_nomClient',
    name: 'nomClient',
    getAttribute: (attr) => (attr === 'formcontrolname' ? 'nomClient' : null),
  };
  const matchClient = FieldMapping.matchElementToField(elClient);
  assert.ok(matchClient);
  assert.equal(matchClient.definition.key, 'nom_client');

  // Mock element with id="field_puissanceFat"
  const elFat = {
    id: 'field_puissanceFat',
    name: 'puissanceFat',
    getAttribute: () => null,
  };
  const matchFat = FieldMapping.matchElementToField(elFat);
  assert.ok(matchFat);
  assert.equal(matchFat.definition.key, 'puissance_fat_dbm');

  // Mock element for FAT reference
  const elFatRef = {
    id: 'fat_ref',
    name: 'fat',
    getAttribute: () => null,
  };
  const matchFatRef = FieldMapping.matchElementToField(elFatRef);
  assert.ok(matchFatRef);
  assert.equal(matchFatRef.definition.key, 'fat_ref');
});

test('FieldMapping - getElementLabelText identifies fieldset legend for radio groups', () => {
  const radio = {
    tagName: 'INPUT',
    type: 'radio',
    name: 'travauxConformesGroup',
    getAttribute: () => null,
    closest: (selector) => {
      if (selector === 'fieldset') {
        return {
          querySelector: (sel) => (sel === 'legend' ? { textContent: 'Travaux conformes aux règles de l\'art' } : null),
        };
      }
      return null;
    },
  };

  const label = FieldMapping.getElementLabelText(radio);
  assert.ok(label.includes('Travaux conformes'));
  const match = FieldMapping.matchElementToField(radio);
  assert.ok(match);
  assert.equal(match.definition.key, 'travaux_conformes');
});

test('FieldMapping - Empty intervention extracts NO fake/invented values', () => {
  const emptyIntervention = {};
  const defs = FieldMapping.FIELD_DEFINITIONS;

  // No fake plan/offer/technology/place
  assert.equal(defs.offre_souscrite.valueExtractor(emptyIntervention), '');
  assert.equal(defs.etat.valueExtractor(emptyIntervention), '');
  assert.equal(defs.type_cable.valueExtractor(emptyIntervention), '');
  assert.equal(defs.emplacement_ont.valueExtractor(emptyIntervention), '');
  assert.equal(defs.nom_equipe.valueExtractor(emptyIntervention), '');
  assert.equal(defs.date.valueExtractor(emptyIntervention), '');
  assert.equal(defs.plaque.valueExtractor(emptyIntervention), '');
  assert.equal(defs.interlocuteur.valueExtractor(emptyIntervention), '');
  assert.equal(defs.configurations_type.valueExtractor(emptyIntervention), '');

  // No fake measurements / zeros
  assert.equal(defs.puissance_fat_dbm.valueExtractor(emptyIntervention), '');
  assert.equal(defs.puissance_pto_dbm.valueExtractor(emptyIntervention), '');
  assert.equal(defs.puissance_fat_dbm.valueExtractor({ puissance_fat_dbm: 0 }), '');
  assert.equal(defs.puissance_pto_dbm.valueExtractor({ puissance_pto_dbm: '0.00' }), '');
  assert.equal(defs.depart_m.valueExtractor(emptyIntervention), '');
  assert.equal(defs.arrivee_m.valueExtractor(emptyIntervention), '');
  assert.equal(defs.lineaire_m.valueExtractor(emptyIntervention), '');
  assert.equal(defs.lineaire_m.valueExtractor({ lineaire_m: 0 }), '');
  assert.equal(defs.pto_qte.valueExtractor(emptyIntervention), '');
  assert.equal(defs.pto_qte.valueExtractor({ pto_qte: 0 }), '');
  assert.equal(defs.repeteur_wifi_qte.valueExtractor(emptyIntervention), '');
  assert.equal(defs.port_disponible.valueExtractor(emptyIntervention), '');

  // No fake pole counts
  assert.equal(defs.nb_poteaux_traverses.valueExtractor(emptyIntervention), '');
  assert.equal(defs.nb_poteaux_implantes.valueExtractor(emptyIntervention), '');
  assert.equal(defs.nb_poteaux_armes.valueExtractor(emptyIntervention), '');
  assert.equal(defs.poteaux_sbee_utilises.valueExtractor(emptyIntervention), '');
  assert.equal(defs.poteaux_petit_jean_utilises.valueExtractor(emptyIntervention), '');
  assert.equal(defs.poteaux_utilises.valueExtractor(emptyIntervention), '');

  // No fake speedtest / tests
  assert.equal(defs.debit_montant.valueExtractor(emptyIntervention), '');
  assert.equal(defs.debit_descendant.valueExtractor(emptyIntervention), '');
  assert.equal(defs.debit_ping.valueExtractor(emptyIntervention), '');
  assert.equal(defs.test_appel_sortant.valueExtractor(emptyIntervention), null);
  assert.equal(defs.test_appel_entrant.valueExtractor(emptyIntervention), null);

  // No fake conformities
  assert.equal(defs.travaux_conformes.valueExtractor(emptyIntervention), null);
  assert.equal(defs.service_teste.valueExtractor(emptyIntervention), null);
  assert.equal(defs.service_fonctionne.valueExtractor(emptyIntervention), null);
  assert.equal(defs.etiquetage.valueExtractor(emptyIntervention), null);
  assert.equal(defs.nettoyage.valueExtractor(emptyIntervention), null);
  assert.equal(defs.depose.valueExtractor(emptyIntervention), null);
  assert.equal(defs.colliers_serres.valueExtractor(emptyIntervention), null);
  assert.equal(defs.fat_normalise.valueExtractor(emptyIntervention), null);
  assert.equal(defs.tutorat.valueExtractor(emptyIntervention), null);
  assert.equal(defs.confirme_signature_rapport.valueExtractor(emptyIntervention), null);
  assert.equal(defs.qualite.valueExtractor(emptyIntervention), '');
  assert.equal(defs.delais.valueExtractor(emptyIntervention), '');
  assert.equal(defs.professionnalisme.valueExtractor(emptyIntervention), '');
});

test('FieldMapping - Dynamic materiel_pose and piton extraction works with real quantities', () => {
  const defs = FieldMapping.FIELD_DEFINITIONS;

  // Real 5 pitons in materiel_pose
  const intvWithPitons = {
    materiel_pose: { piton: 5, pince: 3, closer: 1 },
    nb_poteaux_traverses: 3,
    nb_poteaux_implantes: 2,
  };

  assert.equal(defs.piton.valueExtractor(intvWithPitons), '5');
  assert.equal(defs.pince.valueExtractor(intvWithPitons), '3');
  assert.equal(defs.connecteur.valueExtractor(intvWithPitons), '1');
  assert.equal(defs.crochets.valueExtractor(intvWithPitons), ''); // Non utilisé -> chaîne vide
  assert.equal(defs.poteaux_utilises.valueExtractor(intvWithPitons), '5'); // 3 + 2 poteaux

  // Dynamic matching for custom material
  const intvWithCustom = {
    materiel_pose: {
      collier_serrage: 8,
    },
  };

  const elCustom = {
    id: 'field_collierSerrage',
    name: 'collier_serrage',
    getAttribute: () => null,
  };

  const matched = FieldMapping.matchElementToField(elCustom, intvWithCustom);
  assert.ok(matched);
  assert.equal(matched.definition.valueExtractor(intvWithCustom), '8');
});

