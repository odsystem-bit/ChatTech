import fs from 'fs';
import path from 'path';

const filePath = path.resolve('extension-celpros/content/field-mapping.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Helper functions to add before CELPROS_PHOTO_SLOTS
const helpersCode = `
  // Helper pour extraire une description complète d'une photo de FibreTrack
  function getPhotoDescription(p) {
    if (!p || typeof p !== "object") return "";
    return [
      p.slot,
      p.name,
      p.nom,
      p.title,
      p.titre,
      p.type,
      p.sous_type,
      p.label,
      p.caption,
      p.description,
      p.lieu,
      p.proprietaire,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  // Helper pour récupérer l'URL ou dataURL d'une photo
  function getPhotoSource(p) {
    if (!p) return null;
    if (typeof p === "string" && (p.startsWith("data:") || p.startsWith("http") || p.startsWith("uploads/"))) {
      return p;
    }
    if (typeof p === "object") {
      const src = p.url || p.photo || p.src || p.dataUrl || p.file_path || p.path;
      if (typeof src === "string" && src.length > 10) return src;
    }
    return null;
  }

  // Vérifie si une photo doit être rigoureusement exclue de l'injection CelPros
  function isExcludedFromCelpros(p) {
    if (!p) return true;
    if (p.additionnelle === true || p.is_additionnelle === true || p.exclude_celpros === true) return true;
    if (p.slot === "additionnelle" || p.type === "additionnelle" || p.category === "additionnelle") return true;
    const desc = getPhotoDescription(p);
    if (desc.includes("additionnelle")) return true;
    return false;
  }

  function getEligibleWhatsappPhotos(data) {
    const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
    return wa.filter((p) => !isExcludedFromCelpros(p));
  }
`;

if (!code.includes('function getEligibleWhatsappPhotos')) {
  code = code.replace(
    '  // Référentiel centralisé des photographies CelPros / FibreTrack',
    helpersCode + '\n  // Référentiel centralisé des photographies CelPros / FibreTrack'
  );
}

// 2. Updated CELPROS_PHOTO_SLOTS with keywords alias and getPhoto
const updatedPhotoSlots = `  const CELPROS_PHOTO_SLOTS = [
    {
      key: "cable_interne",
      label: "Entrée câble interne",
      celprosLabel: "Image du câble interne",
      step: 4,
      category: "Câblage & Entrée",
      ftSource: "whatsapp_photos[slot=cable_interne]",
      attrPatterns: [
        /^field_?(photo_?)?cable_?interne/i,
        /^photo_?cable_?interne/i,
        /^image_?cable_?interne/i,
        /^cable_?interne/i,
        /^entree_?cable_?interne/i,
      ],
      keywords: [
        "image du cable interne",
        "image entree cable interne",
        "entree cable interne",
        "image cable interne",
        "cable interne",
        "penetration cable interne",
      ],
      labelKeywords: [
        "image du cable interne",
        "image entree cable interne",
        "entree cable interne",
        "image cable interne",
        "cable interne",
        "penetration cable interne",
      ],
      negativeKeywords: ["externe", "fat", "mesure", "scan", "debit", "wifi", "combine", "contrat", "pto"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => getPhotoSource(p) && (p.slot === "cable_interne" || p.type === "cable_interne"));
        if (match) return { src: getPhotoSource(match), name: "cable_interne.jpg", slot: "cable_interne" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(cable[-_ ]*interne|entr[eé]e[-_ ]*c[aâ]ble[-_ ]*interne)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "cable_interne.jpg", slot: "cable_interne" };
        return null;
      },
    },
    {
      key: "cable_externe",
      label: "Entrée câble externe",
      celprosLabel: "Image du câble externe",
      step: 4,
      category: "Câblage & Entrée",
      ftSource: "whatsapp_photos[slot=cable_externe]",
      attrPatterns: [
        /^field_?(photo_?)?cable_?externe/i,
        /^photo_?cable_?externe/i,
        /^image_?cable_?externe/i,
        /^cable_?externe/i,
        /^entree_?cable_?externe/i,
      ],
      keywords: [
        "image du cable externe",
        "image entree cable externe",
        "entree cable externe",
        "image cable externe",
        "cable externe",
        "facade cable externe",
      ],
      labelKeywords: [
        "image du cable externe",
        "image entree cable externe",
        "entree cable externe",
        "image cable externe",
        "cable externe",
        "facade cable externe",
      ],
      negativeKeywords: ["interne", "fat", "mesure", "scan", "debit", "wifi", "combine", "contrat", "pto"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => getPhotoSource(p) && (p.slot === "cable_externe" || p.type === "cable_externe"));
        if (match) return { src: getPhotoSource(match), name: "cable_externe.jpg", slot: "cable_externe" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(cable[-_ ]*externe|entr[eé]e[-_ ]*c[aâ]ble[-_ ]*externe)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "cable_externe.jpg", slot: "cable_externe" };
        return null;
      },
    },
    {
      key: "fat",
      label: "Boîtier FAT",
      celprosLabel: "Image FAT",
      step: 4,
      category: "Réseau FAT / PBO",
      ftSource: "whatsapp_photos[slot=fat] / points_gps[type=FAT]",
      attrPatterns: [
        /^field_?(photo_?)?fat$/i,
        /^photo_?fat$/i,
        /^image_?fat$/i,
        /^boitier_?fat$/i,
      ],
      keywords: [
        "image boitier fat",
        "photo boitier fat",
        "boitier fat",
        "image fat",
        "photo fat",
        "pbo",
      ],
      labelKeywords: [
        "image fat",
        "photo fat",
        "boitier fat",
        "image boitier fat",
        "photo boitier fat",
        "pbo",
      ],
      negativeKeywords: ["scan", "mesure", "fibre", "puissance", "photometre", "cable", "interne", "externe", "pto", "wifi", "debit"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "fat" || p.type === "fat"));
        if (direct) return { src: getPhotoSource(direct), name: "fat.jpg", slot: "fat" };
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const fatPt = pts.find((p) => p && normalizeText(p.type) === "fat" && getPhotoSource(p.photo));
        if (fatPt) return { src: getPhotoSource(fatPt.photo), name: "fat_raccordement.jpg", slot: "fat" };
        const legacy = wa.find((p) => {
          const src = getPhotoSource(p);
          const title = String(p.name || p.nom || p.label || "");
          if (!src || !title) return false;
          return /^(fat|boitier[-_ ]*fat)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(title.trim()) &&
            !/mesure|fibre|scan|cable|puissance/i.test(title) &&
            !/mesure|fibre|scan|cable|puissance/i.test(p.slot || "");
        });
        if (legacy) return { src: getPhotoSource(legacy), name: "fat.jpg", slot: "fat" };
        return null;
      },
    },
    {
      key: "scan_fat",
      label: "image scan fat",
      celprosLabel: "Image scan FAT",
      step: 4,
      category: "Réseau FAT / PBO",
      ftSource: "whatsapp_photos[slot=scan_fat]",
      attrPatterns: [
        /^field_?(photo_?)?scan_?fat/i,
        /^photo_?scan_?fat/i,
        /^image_?scan_?fat/i,
        /^scan_?fat/i,
        /^code_?barre_?fat/i,
      ],
      keywords: [
        "image scan fat",
        "scan fat",
        "code barre fat",
        "code barres fat",
        "etiquette fat",
        "barcode fat",
      ],
      labelKeywords: [
        "image scan fat",
        "scan fat",
        "code barre fat",
        "code barres fat",
        "etiquette fat",
        "barcode fat",
      ],
      negativeKeywords: ["mesure", "fibre", "puissance", "photometre", "cable", "pto"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "scan_fat" || p.type === "scan_fat"));
        if (direct) return { src: getPhotoSource(direct), name: "scan_fat.jpg", slot: "scan_fat" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(image[-_ ]*scan[-_ ]*fat|scan[-_ ]*fat|code[-_ ]*barres?[-_ ]*fat)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "scan_fat.jpg", slot: "scan_fat" };
        return null;
      },
    },
    {
      key: "fibre_fat",
      label: "Fibre au FAT",
      celprosLabel: "Image fibre au FAT",
      step: 4,
      category: "Réseau FAT / PBO",
      ftSource: "whatsapp_photos[slot=fibre_fat]",
      attrPatterns: [
        /^field_?(photo_?)?fibre_?fat/i,
        /^photo_?fibre_?fat/i,
        /^image_?fibre_?fat/i,
        /^fibre_?fat/i,
        /^fibre_?au_?fat/i,
      ],
      keywords: [
        "image fibre au fat",
        "image fibre fat",
        "fibre au fat",
        "fibre fat",
        "raccordement fibre fat",
      ],
      labelKeywords: [
        "image fibre au fat",
        "image fibre fat",
        "fibre au fat",
        "fibre fat",
        "raccordement fibre fat",
      ],
      negativeKeywords: ["scan", "mesure", "puissance", "photometre", "cable", "pto"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "fibre_fat" || p.type === "fibre_fat"));
        if (direct) return { src: getPhotoSource(direct), name: "fibre_fat.jpg", slot: "fibre_fat" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(fibre[-_ ]*fat|fibre[-_ ]*au[-_ ]*fat)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "fibre_fat.jpg", slot: "fibre_fat" };
        return null;
      },
    },
    {
      key: "mesure_fat",
      label: "Mesure puissance au FAT",
      celprosLabel: "Image mesure au FAT",
      step: 4,
      category: "Mesures Optiques",
      ftSource: "whatsapp_photos[slot=mesure_fat]",
      attrPatterns: [
        /^field_?(photo_?)?mesure_?fat/i,
        /^photo_?mesure_?fat/i,
        /^image_?mesure_?fat/i,
        /^mesure_?fat/i,
        /^puissance_?fat/i,
      ],
      keywords: [
        "image mesure au fat",
        "image mesure fat",
        "mesure au fat",
        "mesure fat",
        "photometre fat",
        "puissance fat",
        "valeur au fat",
      ],
      labelKeywords: [
        "image mesure au fat",
        "image mesure fat",
        "mesure au fat",
        "mesure fat",
        "photometre fat",
        "puissance fat",
        "valeur au fat",
      ],
      negativeKeywords: ["pto", "scan", "cable", "wifi", "debit", "combine"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "mesure_fat" || p.type === "mesure_fat"));
        if (direct) return { src: getPhotoSource(direct), name: "mesure_fat.jpg", slot: "mesure_fat" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(mesure[-_ ]*fat|puissance[-_ ]*fat|photometre[-_ ]*fat)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/pto/i.test(p.name || p.nom || p.label || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "mesure_fat.jpg", slot: "mesure_fat" };
        return null;
      },
    },
    {
      key: "mesure_pto",
      label: "Mesure puissance au PTO",
      celprosLabel: "Image mesure au PTO",
      step: 4,
      category: "Mesures Optiques",
      ftSource: "whatsapp_photos[slot=mesure_pto]",
      attrPatterns: [
        /^field_?(photo_?)?mesure_?pto/i,
        /^photo_?mesure_?pto/i,
        /^image_?mesure_?pto/i,
        /^mesure_?pto/i,
        /^puissance_?pto/i,
      ],
      keywords: [
        "image mesure au pto",
        "image mesure pto",
        "mesure au pto",
        "mesure pto",
        "photometre pto",
        "puissance pto",
        "valeur au pto",
      ],
      labelKeywords: [
        "image mesure au pto",
        "image mesure pto",
        "mesure au pto",
        "mesure pto",
        "photometre pto",
        "puissance pto",
        "valeur au pto",
      ],
      negativeKeywords: ["fat", "scan", "cable", "wifi", "debit", "combine"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "mesure_pto" || p.type === "mesure_pto"));
        if (direct) return { src: getPhotoSource(direct), name: "mesure_pto.jpg", slot: "mesure_pto" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(mesure[-_ ]*pto|puissance[-_ ]*pto|photometre[-_ ]*pto)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/fat/i.test(p.name || p.nom || p.label || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "mesure_pto.jpg", slot: "mesure_pto" };
        return null;
      },
    },
    {
      key: "ont_sn",
      label: "Étiquette Box ONT (MAC & SN)",
      celprosLabel: "Photo numéro de série ONT",
      step: 2,
      category: "Équipements Client",
      ftSource: "whatsapp_photos[slot=ont_sn] / points_gps[type=Abonné/ONT]",
      attrPatterns: [
        /^field_?(photo_?)?(ont_?sn|sn_?ont|ont|sn)$/i,
        /^photo_?ont/i,
        /^photo_?sn/i,
        /^image_?ont/i,
        /^etiquette_?ont/i,
      ],
      keywords: [
        "photo numero de serie",
        "photo numero serie",
        "numero de serie ont",
        "photo sn ont",
        "photo sn",
        "sn ont",
        "etiquette ont",
        "etiquette box ont",
        "box ont",
        "photo ont",
      ],
      labelKeywords: [
        "photo numero de serie",
        "photo numero serie",
        "numero de serie ont",
        "photo sn ont",
        "photo sn",
        "sn ont",
        "etiquette ont",
        "etiquette box ont",
        "box ont",
        "photo ont",
      ],
      negativeKeywords: ["fat", "pto", "mesure", "cable", "debit", "wifi", "combine", "contrat"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "ont_sn" || p.type === "ont_sn"));
        if (direct) return { src: getPhotoSource(direct), name: "ont_sn.jpg", slot: "ont_sn" };
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const abonne = pts.find((p) => p && (normalizeText(p.type).includes("abonne") || normalizeText(p.type).includes("ont")) && getPhotoSource(p.photo));
        if (abonne) return { src: getPhotoSource(abonne.photo), name: "etiquette_ont.jpg", slot: "ont_sn" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(ont|box|sn[-_ ]*ont|etiquette[-_ ]*ont)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "ont_sn.jpg", slot: "ont_sn" };
        return null;
      },
    },
    {
      key: "debit_cable",
      label: "Test débit câble RJ45",
      celprosLabel: "Image test débit câble",
      step: 3,
      category: "Tests de Services",
      ftSource: "whatsapp_photos[slot=debit_cable]",
      attrPatterns: [
        /^field_?(photo_?)?debit_?cable/i,
        /^photo_?debit_?cable/i,
        /^image_?debit_?cable/i,
        /^debit_?cable/i,
        /^test_?debit_?cable/i,
      ],
      keywords: [
        "image test debit cable",
        "test debit cable",
        "debit cable",
        "speedtest cable",
        "test debit rj45",
        "debit rj45",
        "test debit ethernet",
      ],
      labelKeywords: [
        "image test debit cable",
        "test debit cable",
        "debit cable",
        "speedtest cable",
        "test debit rj45",
        "debit rj45",
        "test debit ethernet",
      ],
      negativeKeywords: ["wifi", "fat", "pto", "mesure", "combine", "contrat"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "debit_cable" || p.type === "debit_cable"));
        if (direct) return { src: getPhotoSource(direct), name: "test_debit_cable.jpg", slot: "debit_cable" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(debit[-_ ]*cable|test[-_ ]*debit[-_ ]*cable|speedtest[-_ ]*cable)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/wifi/i.test(p.name || p.nom || p.label || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "test_debit_cable.jpg", slot: "debit_cable" };
        return null;
      },
    },
    {
      key: "debit_wifi",
      label: "Test débit Wi-Fi",
      celprosLabel: "Image test débit Wifi",
      step: 3,
      category: "Tests de Services",
      ftSource: "whatsapp_photos[slot=debit_wifi]",
      attrPatterns: [
        /^field_?(photo_?)?debit_?wifi/i,
        /^photo_?debit_?wifi/i,
        /^image_?debit_?wifi/i,
        /^debit_?wifi/i,
        /^test_?debit_?wifi/i,
      ],
      keywords: [
        "image test debit wifi",
        "test debit wifi",
        "debit wifi",
        "speedtest wifi",
        "test wifi",
      ],
      labelKeywords: [
        "image test debit wifi",
        "test debit wifi",
        "debit wifi",
        "speedtest wifi",
        "test wifi",
      ],
      negativeKeywords: ["cable", "rj45", "ethernet", "fat", "pto", "mesure", "combine", "contrat"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "debit_wifi" || p.type === "debit_wifi"));
        if (direct) return { src: getPhotoSource(direct), name: "test_debit_wifi.jpg", slot: "debit_wifi" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(debit[-_ ]*wifi|test[-_ ]*debit[-_ ]*wifi|speedtest[-_ ]*wifi)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/cable/i.test(p.name || p.nom || p.label || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "test_debit_wifi.jpg", slot: "debit_wifi" };
        return null;
      },
    },
    {
      key: "combine",
      label: "Combiné téléphonique",
      celprosLabel: "Image combiné",
      step: 3,
      category: "Tests de Services",
      ftSource: "whatsapp_photos[slot=combine]",
      attrPatterns: [
        /^field_?(photo_?)?combine$/i,
        /^photo_?combine$/i,
        /^image_?combine$/i,
        /^combine$/i,
      ],
      keywords: [
        "image combine",
        "photo combine",
        "combine",
        "telephone fixe",
      ],
      labelKeywords: [
        "image combine",
        "photo combine",
        "combine",
        "telephone fixe",
      ],
      negativeKeywords: ["fiche", "fat", "pto", "mesure", "debit", "wifi", "contrat"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "combine" || p.type === "combine"));
        if (direct) return { src: getPhotoSource(direct), name: "combine.jpg", slot: "combine" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(combine|photo[-_ ]*combine|telephone)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/fiche/i.test(p.name || p.nom || p.label || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "combine.jpg", slot: "combine" };
        return null;
      },
    },
    {
      key: "fiche_combine",
      label: "Fiche combiné",
      celprosLabel: "Image fiche combiné",
      step: 3,
      category: "Tests de Services",
      ftSource: "whatsapp_photos[slot=fiche_combine]",
      attrPatterns: [
        /^field_?(photo_?)?fiche_?combine/i,
        /^photo_?fiche_?combine/i,
        /^image_?fiche_?combine/i,
        /^fiche_?combine/i,
      ],
      keywords: [
        "image fiche combine",
        "photo fiche combine",
        "fiche combine",
        "prise combine",
        "fiche raccordement",
      ],
      labelKeywords: [
        "image fiche combine",
        "photo fiche combine",
        "fiche combine",
        "prise combine",
        "fiche raccordement",
      ],
      negativeKeywords: ["fat", "pto", "mesure", "debit", "wifi", "contrat"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "fiche_combine" || p.type === "fiche_combine"));
        if (direct) return { src: getPhotoSource(direct), name: "fiche_combine.jpg", slot: "fiche_combine" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(fiche[-_ ]*combine|prise[-_ ]*combine|fiche[-_ ]*raccordement)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "fiche_combine.jpg", slot: "fiche_combine" };
        return null;
      },
    },
    {
      key: "contrat_client",
      label: "Photo contrat client",
      celprosLabel: "Photo du contrat client",
      step: 5,
      category: "Clôture & Signature",
      ftSource: "signature_client / whatsapp_photos[slot=contrat_client]",
      attrPatterns: [
        /^field_?(photo_?)?contrat/i,
        /^photo_?contrat/i,
        /^image_?contrat/i,
        /^contrat_?client/i,
        /^signature_?rapport/i,
      ],
      keywords: [
        "photo du contrat client",
        "photo contrat client",
        "photo contrat",
        "contrat client",
        "signature du rapport",
        "photo fiche d'intervention signee",
        "contrat",
      ],
      labelKeywords: [
        "photo du contrat client",
        "photo contrat client",
        "photo contrat",
        "contrat client",
        "signature du rapport",
        "photo fiche d'intervention signee",
        "contrat",
      ],
      negativeKeywords: ["fat", "pto", "mesure", "debit", "wifi", "combine", "cable"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        if (data?.signature_client && typeof data.signature_client === "string" && data.signature_client.trim().length > 100) {
          return { src: data.signature_client, name: "signature_client.png", slot: "contrat_client" };
        }
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "contrat_client" || p.type === "contrat_client"));
        if (direct) return { src: getPhotoSource(direct), name: "contrat_signe.jpg", slot: "contrat_client" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(contrat|signature|contrat[-_ ]*client)(\\s*\\d+)?(\\.jpe?g|\\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "contrat_signe.jpg", slot: "contrat_client" };
        return null;
      },
    },
  ];`;

const startIdx = code.indexOf('  const CELPROS_PHOTO_SLOTS = [');
const endIdx = code.indexOf('  // Dictionnaire de correspondances pour tous les champs d\'intervention');
if (startIdx !== -1 && endIdx !== -1) {
  code = code.slice(0, startIdx) + updatedPhotoSlots + '\n\n' + code.slice(endIdx);
}

// 3. Update FIELD_DEFINITIONS with step, ftSource, celprosTarget, onAbsent, negativeKeywords
const FIELD_META = {
  nom_client: { step: 1, ftSource: "nom_client / nom_dossier", celprosTarget: "Nom du client", onAbsent: "leave_empty_and_warn", negativeKeywords: ["technicien", "equipe", "msan", "fat", "pto"] },
  adresse_zone: { step: 1, ftSource: "adresse_zone", celprosTarget: "Adresse / Zone", onAbsent: "leave_empty_and_warn", negativeKeywords: ["msan", "fat", "pto"] },
  telephone_ligne: { step: 1, ftSource: "telephone_ligne", celprosTarget: "Téléphone ligne (fixe)", onAbsent: "leave_empty", negativeKeywords: ["mobile", "gsm", "cellulaire", "portable", "whatsapp"] },
  mobile: { step: 1, ftSource: "mobile", celprosTarget: "Mobile / Contact", onAbsent: "leave_empty_and_warn", negativeKeywords: ["fixe", "ligne"] },
  offre_souscrite: { step: 1, ftSource: "offre_souscrite", celprosTarget: "Offre souscrite", onAbsent: "leave_empty", negativeKeywords: [] },
  interlocuteur: { step: 1, ftSource: "nom_client", celprosTarget: "Interlocuteur", onAbsent: "leave_empty", negativeKeywords: [] },
  configurations_type: { step: 1, ftSource: "offre_souscrite", celprosTarget: "Configurations", onAbsent: "leave_empty", negativeKeywords: [] },
  date: { step: 1, ftSource: "date", celprosTarget: "Date d'intervention", onAbsent: "leave_empty", negativeKeywords: [] },
  nom_technicien: { step: 1, ftSource: "nom_technicien", celprosTarget: "Nom du technicien", onAbsent: "leave_empty", negativeKeywords: ["client", "abonne"] },
  nom_equipe: { step: 1, ftSource: "nom_equipe", celprosTarget: "Nom de l'équipe", onAbsent: "leave_empty", negativeKeywords: ["client", "abonne"] },
  etat: { step: 4, ftSource: "etat", celprosTarget: "État PON", onAbsent: "leave_empty_and_warn", negativeKeywords: [] },
  msan: { step: 4, ftSource: "msan", celprosTarget: "MSAN / OLT", onAbsent: "leave_empty_and_warn", negativeKeywords: ["fat", "pto", "client"] },
  fat_ref: { step: 4, ftSource: "fat_ref", celprosTarget: "Référence FAT / PBO", onAbsent: "leave_empty_and_warn", negativeKeywords: ["msan", "pto", "client"] },
  port: { step: 4, ftSource: "port", celprosTarget: "Port raccordé", onAbsent: "leave_empty_and_warn", negativeKeywords: ["disponible", "disponibles", "libres"] },
  ports_disponibles: { step: 4, ftSource: "ports_disponibles", celprosTarget: "Ports disponibles", onAbsent: "leave_empty", negativeKeywords: ["raccorde"] },
  port_disponible: { step: 4, ftSource: "port_disponible", celprosTarget: "Port disponible", onAbsent: "leave_empty", negativeKeywords: ["raccorde"] },
  puissance_fat_dbm: { step: 4, ftSource: "puissance_fat_dbm", celprosTarget: "Puissance FAT (dBm)", onAbsent: "leave_empty_and_warn", negativeKeywords: ["pto", "client", "abonne", "prise"] },
  plaque: { step: 4, ftSource: "fat_ref", celprosTarget: "Plaque FAT", onAbsent: "leave_empty", negativeKeywords: [] },
  type_cable: { step: 4, ftSource: "type_cable", celprosTarget: "Type de câble", onAbsent: "leave_empty", negativeKeywords: [] },
  depart_m: { step: 4, ftSource: "depart_m", celprosTarget: "Métrage départ (m)", onAbsent: "leave_empty", negativeKeywords: ["arrivee", "total", "lineaire"] },
  arrivee_m: { step: 4, ftSource: "arrivee_m", celprosTarget: "Métrage arrivée (m)", onAbsent: "leave_empty", negativeKeywords: ["depart", "total", "lineaire"] },
  lineaire_m: { step: 4, ftSource: "lineaire_m", celprosTarget: "Linéaire total (m)", onAbsent: "leave_empty_and_warn", negativeKeywords: ["depart", "arrivee"] },
  nb_poteaux_traverses: { step: 4, ftSource: "nb_poteaux_traverses", celprosTarget: "Poteaux traversés", onAbsent: "leave_empty", negativeKeywords: ["implante", "arme"] },
  nb_poteaux_implantes: { step: 4, ftSource: "nb_poteaux_implantes", celprosTarget: "Poteaux implantés", onAbsent: "leave_empty", negativeKeywords: ["traverse", "arme"] },
  nb_poteaux_armes: { step: 4, ftSource: "nb_poteaux_armes", celprosTarget: "Poteaux armés", onAbsent: "leave_empty", negativeKeywords: ["traverse", "implante"] },
  puissance_pto_dbm: { step: 4, ftSource: "puissance_pto_dbm", celprosTarget: "Puissance PTO (dBm)", onAbsent: "leave_empty_and_warn", negativeKeywords: ["fat", "pbo"] },
  pto_qte: { step: 2, ftSource: "pto_qte", celprosTarget: "Quantité PTO", onAbsent: "leave_empty", negativeKeywords: [] },
  repeteur_wifi_qte: { step: 2, ftSource: "repeteur_wifi_qte", celprosTarget: "Quantité répéteur Wi-Fi", onAbsent: "leave_empty", negativeKeywords: [] },
  emplacement_ont: { step: 2, ftSource: "emplacement_ont", celprosTarget: "Emplacement ONT / Box", onAbsent: "leave_empty", negativeKeywords: [] },
  mac: { step: 2, ftSource: "mac", celprosTarget: "Adresse MAC ONT", onAbsent: "leave_empty", negativeKeywords: ["sn", "serie"] },
  sn: { step: 2, ftSource: "sn / ont_sn", celprosTarget: "Numéro de série ONT (SN)", onAbsent: "leave_empty_and_warn", negativeKeywords: ["mac"] },
  latitude: { step: 2, ftSource: "points_gps[type=Abonné].lat", celprosTarget: "Latitude GPS", onAbsent: "leave_empty", negativeKeywords: ["longitude", "lng"] },
  longitude: { step: 2, ftSource: "points_gps[type=Abonné].lng", celprosTarget: "Longitude GPS", onAbsent: "leave_empty", negativeKeywords: ["latitude", "lat"] },
  gps_coordinates: { step: 2, ftSource: "points_gps[type=Abonné]", celprosTarget: "Coordonnées GPS", onAbsent: "leave_empty", negativeKeywords: [] },
  poteaux_utilises: { step: 2, ftSource: "materiel_pose.poteaux / points_gps", celprosTarget: "Poteaux utilisés", onAbsent: "leave_empty", negativeKeywords: [] },
  poteaux_sbee_utilises: { step: 2, ftSource: "materiel_pose.poteau_sbee / points_gps", celprosTarget: "Poteaux SBEE utilisés", onAbsent: "leave_empty", negativeKeywords: ["petit", "jean"] },
  poteaux_petit_jean_utilises: { step: 2, ftSource: "materiel_pose.poteau_petit_jean / points_gps", celprosTarget: "Poteaux Petit Jean utilisés", onAbsent: "leave_empty", negativeKeywords: ["sbee"] },
  pince: { step: 2, ftSource: "materiel_pose.pince", celprosTarget: "Nombre de pinces", onAbsent: "leave_empty", negativeKeywords: [] },
  crochets: { step: 2, ftSource: "materiel_pose.crochets", celprosTarget: "Nombre de crochets", onAbsent: "leave_empty", negativeKeywords: [] },
  suspension: { step: 2, ftSource: "materiel_pose.suspension", celprosTarget: "Nombre de suspensions", onAbsent: "leave_empty", negativeKeywords: [] },
  piton: { step: 2, ftSource: "materiel_pose.piton", celprosTarget: "Nombre de pitons", onAbsent: "leave_empty", negativeKeywords: [] },
  cheville: { step: 2, ftSource: "materiel_pose.cheville", celprosTarget: "Nombre de chevilles", onAbsent: "leave_empty", negativeKeywords: [] },
  jarretiere: { step: 2, ftSource: "materiel_pose.jarretiere", celprosTarget: "Nombre de jarretières", onAbsent: "leave_empty", negativeKeywords: [] },
  ont_livre: { step: 2, ftSource: "materiel_pose.ont", celprosTarget: "ONT livré", onAbsent: "leave_empty", negativeKeywords: [] },
  cpc_cable: { step: 2, ftSource: "materiel_pose.cpc_cable", celprosTarget: "CPC Câble", onAbsent: "leave_empty", negativeKeywords: [] },
  connecteur: { step: 2, ftSource: "materiel_pose.connecteur", celprosTarget: "Connecteur", onAbsent: "leave_empty", negativeKeywords: [] },
  rp1: { step: 2, ftSource: "materiel_pose.rp1", celprosTarget: "RP1", onAbsent: "leave_empty", negativeKeywords: [] },
  traverse_13t: { step: 2, ftSource: "materiel_pose.traverse_13t", celprosTarget: "Traverse 13T", onAbsent: "leave_empty", negativeKeywords: [] },
  traverse_15t: { step: 2, ftSource: "materiel_pose.traverse_15t", celprosTarget: "Traverse 15T", onAbsent: "leave_empty", negativeKeywords: [] },
  semelle: { step: 2, ftSource: "materiel_pose.semelle", celprosTarget: "Semelle", onAbsent: "leave_empty", negativeKeywords: [] },
  boulons: { step: 2, ftSource: "materiel_pose.boulons", celprosTarget: "Boulons", onAbsent: "leave_empty", negativeKeywords: [] },
  agrafe: { step: 2, ftSource: "materiel_pose.agrafe", celprosTarget: "Agrafes", onAbsent: "leave_empty", negativeKeywords: [] },
  gps_fat: { step: 2, ftSource: "points_gps[type=FAT]", celprosTarget: "GPS FAT", onAbsent: "leave_empty", negativeKeywords: [] },
  rue: { step: 2, ftSource: "adresse_zone", celprosTarget: "Nom de rue", onAbsent: "leave_empty", negativeKeywords: [] },
  test_appel_sortant: { step: 3, ftSource: "service_teste", celprosTarget: "Appel sortant", onAbsent: "leave_empty", negativeKeywords: ["entrant"] },
  test_appel_entrant: { step: 3, ftSource: "service_teste", celprosTarget: "Appel entrant", onAbsent: "leave_empty", negativeKeywords: ["sortant"] },
  debit_montant: { step: 3, ftSource: "materiel_pose.debit_up", celprosTarget: "Débit montant", onAbsent: "leave_empty", negativeKeywords: ["descendant"] },
  debit_descendant: { step: 3, ftSource: "materiel_pose.debit_down", celprosTarget: "Débit descendant", onAbsent: "leave_empty", negativeKeywords: ["montant"] },
  debit_ping: { step: 3, ftSource: "materiel_pose.ping", celprosTarget: "Ping latence", onAbsent: "leave_empty", negativeKeywords: [] },
  service_internet: { step: 3, ftSource: "service_fonctionne", celprosTarget: "Service Internet fonctionnel", onAbsent: "leave_empty", negativeKeywords: [] },
  service_voip: { step: 3, ftSource: "service_fonctionne", celprosTarget: "Service Téléphonie / VoIP fonctionnel", onAbsent: "leave_empty", negativeKeywords: [] },
  etiquetage: { step: 4, ftSource: "travaux_conformes", celprosTarget: "Étiquetage câble et FAT", onAbsent: "leave_empty", negativeKeywords: [] },
  nettoyage: { step: 4, ftSource: "travail_propre", celprosTarget: "Nettoyage chantier", onAbsent: "leave_empty", negativeKeywords: [] },
  depose: { step: 4, ftSource: "travaux_conformes", celprosTarget: "Dépose anciens matériels", onAbsent: "leave_empty", negativeKeywords: [] },
  colliers_serres: { step: 4, ftSource: "travaux_conformes", celprosTarget: "Colliers bien serrés", onAbsent: "leave_empty", negativeKeywords: [] },
  fat_normalise: { step: 4, ftSource: "travaux_conformes", celprosTarget: "FAT normalisé", onAbsent: "leave_empty", negativeKeywords: [] },
  tutorat: { step: 4, ftSource: "travaux_conformes", celprosTarget: "Tutorat client réalisé", onAbsent: "leave_empty", negativeKeywords: [] },
  client_confirme_emplacement: { step: 5, ftSource: "client_confirme_emplacement", celprosTarget: "Client confirme emplacement", onAbsent: "leave_empty", negativeKeywords: [] },
  remise_equipement_ok: { step: 5, ftSource: "remise_equipement_ok", celprosTarget: "Remise équipements OK", onAbsent: "leave_empty", negativeKeywords: [] },
  travaux_conformes: { step: 5, ftSource: "travaux_conformes", celprosTarget: "Travaux conformes", onAbsent: "leave_empty", negativeKeywords: [] },
  emplacement_valide: { step: 5, ftSource: "emplacement_valide", celprosTarget: "Emplacement validé", onAbsent: "leave_empty", negativeKeywords: [] },
  travail_propre: { step: 5, ftSource: "travail_propre", celprosTarget: "Travail propre", onAbsent: "leave_empty", negativeKeywords: [] },
  service_teste: { step: 5, ftSource: "service_teste", celprosTarget: "Service testé", onAbsent: "leave_empty", negativeKeywords: [] },
  service_fonctionne: { step: 5, ftSource: "service_fonctionne", celprosTarget: "Service fonctionne (Internet OK)", onAbsent: "leave_empty", negativeKeywords: [] },
  explications_donnees: { step: 5, ftSource: "explications_donnees", celprosTarget: "Explications données", onAbsent: "leave_empty", negativeKeywords: [] },
  recommanderait: { step: 5, ftSource: "recommanderait", celprosTarget: "Recommanderait Celtiis", onAbsent: "leave_empty", negativeKeywords: [] },
  accepte_recontact: { step: 5, ftSource: "accepte_recontact", celprosTarget: "Accepte recontact", onAbsent: "leave_empty", negativeKeywords: [] },
  qualite: { step: 5, ftSource: "qualite", celprosTarget: "Qualité globale", onAbsent: "leave_empty", negativeKeywords: [] },
  delais: { step: 5, ftSource: "delais", celprosTarget: "Respect des délais", onAbsent: "leave_empty", negativeKeywords: [] },
  professionnalisme: { step: 5, ftSource: "professionnalisme", celprosTarget: "Professionnalisme équipe", onAbsent: "leave_empty", negativeKeywords: [] },
  nom_client_declaration: { step: 5, ftSource: "nom_client_declaration", celprosTarget: "Nom déclarant client", onAbsent: "leave_empty", negativeKeywords: [] },
  remarque_libre: { step: 5, ftSource: "remarque_libre", celprosTarget: "Remarques libres", onAbsent: "leave_empty", negativeKeywords: [] },
  confirme_signature_rapport: { step: 5, ftSource: "signature_client", celprosTarget: "Confirmation signature rapport", onAbsent: "leave_empty", negativeKeywords: [] },
};

for (const [key, meta] of Object.entries(FIELD_META)) {
  const pattern = new RegExp('(\\b' + key + '\\s*:\\s*\\{[^}]*?\\bkey\\s*:\\s*["\']' + key + '["\'][^}]*?\\n)', 'm');
  const match = code.match(pattern);
  if (match) {
    const existing = match[1];
    if (!existing.includes('step:')) {
      const addition = '      step: ' + meta.step + ',\n' +
        '      ftSource: "' + meta.ftSource + '",\n' +
        '      celprosTarget: "' + meta.celprosTarget + '",\n' +
        '      onAbsent: "' + meta.onAbsent + '",\n' +
        '      negativeKeywords: ' + JSON.stringify(meta.negativeKeywords) + ',\n';
      code = code.replace(existing, existing + addition);
    }
  }
}

// Update matchElementToField to check negativeKeywords
const oldMatchLoop = '    for (const [, def] of Object.entries(FIELD_DEFINITIONS)) {\n      let score = 0;';
const newMatchLoop = `    for (const [, def] of Object.entries(FIELD_DEFINITIONS)) {
      // Disqualification par mots-clés négatifs
      if (def.negativeKeywords && def.negativeKeywords.length > 0) {
        const isDisqualified = def.negativeKeywords.some((neg) => {
          const normNeg = normalizeText(neg);
          return normNeg && (normalizedLabel.includes(normNeg) || normAttrs.some((a) => a.includes(normNeg)));
        });
        if (isDisqualified) continue;
      }

      let score = 0;`;

if (code.includes(oldMatchLoop)) {
  code = code.replace(oldMatchLoop, newMatchLoop);
}

// Update exports at bottom
const oldExp = `  return {
    FIELD_DEFINITIONS,
    CELPROS_PHOTO_SLOTS,
    normalizeText,
    getElementAttributeCandidates,
    getElementLabelText,
    matchElementToField,
    extractTargetGpsPoint,
    extractFatGpsPoint,
    getMaterielQuantity,
    countSbeePoles,
    countPetitJeanPoles,
  };`;

const newExp = `  return {
    FIELD_DEFINITIONS,
    CELPROS_PHOTO_SLOTS,
    normalizeText,
    getElementAttributeCandidates,
    getElementLabelText,
    matchElementToField,
    extractTargetGpsPoint,
    extractFatGpsPoint,
    getMaterielQuantity,
    countSbeePoles,
    countPetitJeanPoles,
    getPhotoSource,
    getPhotoDescription,
    isExcludedFromCelpros,
    getEligibleWhatsappPhotos,
  };`;

if (code.includes(oldExp)) {
  code = code.replace(oldExp, newExp);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('field-mapping.js successfully enriched!');
