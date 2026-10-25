// Field Mapping Engine pour CelPros (Celtiis) et FAT Automation
// Ce fichier définit les règles de correspondance intelligentes entre
// les données d'intervention FibreTrack et les éléments de formulaire HTML.
// RÈGLE ABSOLUE : Aucune invention de fausses données / valeurs par défaut fictives.

(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = exports;
  }
  if (typeof define === "function" && define.amd) {
    define([], () => exports);
  }
  if (root) {
    root.FieldMapping = exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Normalisation textuelle pour tolérance aux accents, tirets, majuscules, espaces
  function normalizeText(str) {
    if (!str || typeof str !== "string") return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Supprime les diacritiques (accents)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") // Ne garde que caractères alphanumériques
      .trim();
  }

  // Helper pour désérialiser en toute sécurité des tableaux JSON ou natifs
  function safeGetArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  }

  // Helper pour désérialiser en toute sécurité des objets JSON ou natifs
  function safeGetObject(val) {
    if (val && typeof val === "object" && !Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return {};
  }

  // Normalise complètement un objet intervention (désérialisation JSON sécurisée)
  function normalizeInterventionData(data) {
    if (!data || typeof data !== "object") return data;
    return {
      ...data,
      whatsapp_photos: safeGetArray(data.whatsapp_photos),
      points_gps: safeGetArray(data.points_gps),
      poteaux: safeGetArray(data.poteaux),
      materiel_pose: safeGetObject(data.materiel_pose),
    };
  }

  // Helper pour extraire une quantité de matériel posé depuis data.materiel_pose
  function getMaterielQuantity(data, ...keys) {
    const mp = safeGetObject(data?.materiel_pose);
    for (const k of keys) {
      if (mp[k] !== undefined && mp[k] !== null && mp[k] !== "") {
        const n = Number(mp[k]);
        if (!isNaN(n) && n > 0) return String(n);
      }
    }
    const normKeys = keys.map((k) => normalizeText(k));
    for (const [mpKey, mpVal] of Object.entries(mp)) {
      const norm = normalizeText(mpKey);
      if (normKeys.some((nk) => norm === nk || (nk.length >= 4 && (norm.startsWith(nk) || nk.startsWith(norm))))) {
        const n = Number(mpVal);
        if (!isNaN(n) && n > 0) return String(n);
      }
    }
    return "";
  }

  // Helper pour compter les poteaux SBEE réels
  function countSbeePoles(data) {
    const list = safeGetArray(data?.points_gps);
    const sbee = list.filter((p) => {
      if (!p || !normalizeText(p.type).includes("poteau")) return false;
      const desc = normalizeText(`${p.type_poteau || ""} ${p.proprietaire || ""} ${p.sous_type || ""} ${p.nom || ""} ${p.description || ""}`);
      return desc.includes("sbee");
    }).length;
    if (sbee > 0) return String(sbee);
    const mp = safeGetObject(data?.materiel_pose);
    const count = Number(mp.poteau_sbee_non_arme || 0) + Number(mp.poteau_sbee_arme || 0) + Number(mp.poteau_sbee || 0);
    if (count > 0) return String(count);
    return "";
  }

  // Helper pour compter les poteaux Petit Jean réels
  function countPetitJeanPoles(data) {
    const list = safeGetArray(data?.points_gps);
    const pj = list.filter((p) => {
      if (!p || !normalizeText(p.type).includes("poteau")) return false;
      const desc = normalizeText(`${p.type_poteau || ""} ${p.proprietaire || ""} ${p.sous_type || ""} ${p.nom || ""} ${p.description || ""}`);
      return desc.includes("petit") || desc.includes("jean") || desc.includes("pj");
    }).length;
    if (pj > 0) return String(pj);
    const mp = safeGetObject(data?.materiel_pose);
    const count = Number(mp.poteau_petit_jean || mp.poteau_pj || mp.petit_jean || 0);
    if (count > 0) return String(count);
    return "";
  }

  // Extraction du point GPS FAT
  function extractFatGpsPoint(data) {
    const list = safeGetArray(data?.points_gps);
    const fat = list.find((p) => p && normalizeText(p.type).includes("fat"));
    if (fat) {
      const rawLat = fat.lat ?? fat.latitude;
      const rawLng = fat.lng ?? fat.longitude;
      if (rawLat !== undefined && rawLat !== null && rawLng !== undefined && rawLng !== null) {
        const lat = typeof rawLat === "string" ? parseFloat(rawLat.replace(",", ".")) : Number(rawLat);
        const lng = typeof rawLng === "string" ? parseFloat(rawLng.replace(",", ".")) : Number(rawLng);
        if (!isNaN(lat) && !isNaN(lng)) return { ...fat, lat, lng };
      }
    }
    // Fallback 1: data.latitude_fat & longitude_fat
    if (data?.latitude_fat != null && data?.longitude_fat != null && data.latitude_fat !== "" && data.longitude_fat !== "") {
      const lat = typeof data.latitude_fat === "string" ? parseFloat(data.latitude_fat.replace(",", ".")) : Number(data.latitude_fat);
      const lng = typeof data.longitude_fat === "string" ? parseFloat(data.longitude_fat.replace(",", ".")) : Number(data.longitude_fat);
      if (!isNaN(lat) && !isNaN(lng)) return { type: "FAT", lat, lng };
    }
    // Fallback 2: whatsapp_photos[slot=fat]
    const waPhotos = safeGetArray(data?.whatsapp_photos);
    const fatWa = waPhotos.find((p) => p && (p.slot === "fat" || p.type === "fat") && p.lat != null && p.lng != null);
    if (fatWa) {
      const lat = typeof fatWa.lat === "string" ? parseFloat(String(fatWa.lat).replace(",", ".")) : Number(fatWa.lat);
      const lng = typeof fatWa.lng === "string" ? parseFloat(String(fatWa.lng).replace(",", ".")) : Number(fatWa.lng);
      if (!isNaN(lat) && !isNaN(lng)) return { type: "FAT", lat, lng };
    }
    return null;
  }

  // Extraction du point GPS de référence (Abonné en priorité, sinon le dernier point relevé)
  function extractTargetGpsPoint(data) {
    const list = safeGetArray(data?.points_gps);
    const abonne = list.find((p) => {
      if (!p || !p.type) return false;
      const t = normalizeText(p.type);
      return t.includes("abonne") || t.includes("client");
    });
    const point = abonne || (list.length > 0 ? list[list.length - 1] : null);
    if (point) {
      const rawLat = point.lat ?? point.latitude ?? null;
      const rawLng = point.lng ?? point.longitude ?? null;
      if (rawLat !== null && rawLng !== null && rawLat !== undefined && rawLng !== undefined) {
        const lat = typeof rawLat === "string" ? parseFloat(rawLat.replace(",", ".")) : Number(rawLat);
        const lng = typeof rawLng === "string" ? parseFloat(rawLng.replace(",", ".")) : Number(rawLng);
        if (!isNaN(lat) && !isNaN(lng)) return { ...point, lat, lng };
      }
    }
    // Fallback 1: data.latitude & data.longitude
    if (data?.latitude != null && data?.longitude != null && data.latitude !== "" && data.longitude !== "") {
      const lat = typeof data.latitude === "string" ? parseFloat(data.latitude.replace(",", ".")) : Number(data.latitude);
      const lng = typeof data.longitude === "string" ? parseFloat(data.longitude.replace(",", ".")) : Number(data.longitude);
      if (!isNaN(lat) && !isNaN(lng)) return { type: "Abonné", lat, lng };
    }
    // Fallback 2: whatsapp_photos[slot=ont_sn / cable_interne / mesure_pto]
    const waPhotos = safeGetArray(data?.whatsapp_photos);
    const abonneWa = waPhotos.find((p) => p && (p.slot === "ont_sn" || p.slot === "cable_interne" || p.slot === "mesure_pto") && p.lat != null && p.lng != null);
    if (abonneWa) {
      const lat = typeof abonneWa.lat === "string" ? parseFloat(String(abonneWa.lat).replace(",", ".")) : Number(abonneWa.lat);
      const lng = typeof abonneWa.lng === "string" ? parseFloat(String(abonneWa.lng).replace(",", ".")) : Number(abonneWa.lng);
      if (!isNaN(lat) && !isNaN(lng)) return { type: "Abonné", lat, lng };
    }
    return null;
  }

  // ----------------------------------------------------

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
    const wa = safeGetArray(data?.whatsapp_photos);
    return wa.filter((p) => !isExcludedFromCelpros(p));
  }

  // Référentiel centralisé des photographies CelPros / FibreTrack
  // Définit précisément : Source FibreTrack, Clé ChapTech, Cible CelPros,
  // Étape (1-5), Catégorie, Règles d'exclusion et Comportement en cas d'absence.
  // ----------------------------------------------------
  const CELPROS_PHOTO_SLOTS = [
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(cable[-_ ]*interne|entr[eé]e[-_ ]*c[aâ]ble[-_ ]*interne)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(cable[-_ ]*externe|entr[eé]e[-_ ]*c[aâ]ble[-_ ]*externe)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "cable_externe.jpg", slot: "cable_externe" };
        return null;
      },
    },
    {
      key: "autre_poteau",
      label: "Autre poteau",
      celprosLabel: "Autre poteau",
      step: 4,
      category: "Poteaux & Appuis",
      ftSource: "whatsapp_photos[slot=autre_poteau]",
      attrPatterns: [
        /^field_?(photo_?)?autre_?poteau/i,
        /^photo_?autre_?poteau/i,
        /^image_?autre_?poteau/i,
        /^autre_?poteau/i,
        /^autre_?support/i,
      ],
      keywords: [
        "autre poteau",
        "image autre poteau",
        "photo autre poteau",
        "autre support",
        "materiel poteau",
        "materiel poto",
      ],
      labelKeywords: [
        "autre poteau",
        "image autre poteau",
        "photo autre poteau",
        "autre support",
        "materiel poteau",
      ],
      negativeKeywords: ["cable", "interne", "externe", "fat", "pto", "mesure", "debit", "wifi", "combine", "contrat"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau"));
        if (direct) return { src: getPhotoSource(direct), name: "autre_poteau.jpg", slot: "autre_poteau" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(autre[-_ ]*poteau|autre[-_ ]*support)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "autre_poteau.jpg", slot: "autre_poteau" };
        return null;
      },
      getAllPhotos: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        return wa
          .filter((p) => getPhotoSource(p) && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau"))
          .map((p, idx) => ({ src: getPhotoSource(p), name: `autre_poteau_${idx + 1}.jpg`, slot: "autre_poteau" }));
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
        const pts = safeGetArray(data?.points_gps);
        const fatPt = pts.find((p) => p && normalizeText(p.type) === "fat" && getPhotoSource(p.photo));
        if (fatPt) return { src: getPhotoSource(fatPt.photo), name: "fat_raccordement.jpg", slot: "fat" };
        const legacy = wa.find((p) => {
          const src = getPhotoSource(p);
          const title = String(p.name || p.nom || p.label || "");
          if (!src || !title) return false;
          return /^(fat|boitier[-_ ]*fat)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(title.trim()) &&
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(image[-_ ]*scan[-_ ]*fat|scan[-_ ]*fat|code[-_ ]*barres?[-_ ]*fat)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(fibre[-_ ]*fat|fibre[-_ ]*au[-_ ]*fat)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(mesure[-_ ]*fat|puissance[-_ ]*fat|photometre[-_ ]*fat)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/pto/i.test(p.name || p.nom || p.label || ""));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(mesure[-_ ]*pto|puissance[-_ ]*pto|photometre[-_ ]*pto)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/fat/i.test(p.name || p.nom || p.label || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "mesure_pto.jpg", slot: "mesure_pto" };
        return null;
      },
    },
    {
      key: "ont_sn",
      label: "Photo numéro de série",
      celprosLabel: "Photo numéro de série",
      step: 2,
      category: "Équipements Client",
      ftSource: "whatsapp_photos[slot=ont_sn] / points_gps[type=Abonné/ONT]",
      attrPatterns: [
        /^field_?(photo_?)?(ont_?sn|sn_?ont|ont|sn)$/i,
        /^field_?(photo_?)?numero_?de_?serie/i,
        /^field_?(photo_?)?numero_?serie/i,
        /^photo_?numero_?de_?serie/i,
        /^photo_?numero_?serie/i,
        /^photo_?ont/i,
        /^photo_?sn/i,
        /^image_?ont/i,
        /^etiquette_?ont/i,
      ],
      keywords: [
        "photo numero de serie",
        "photo numero serie",
        "photo numero de serie ont",
        "photo numero serie ont",
        "numero de serie ont",
        "photo sn ont",
        "photo sn",
        "sn ont",
        "etiquette ont",
        "etiquette box ont",
        "box ont",
        "photo ont",
        "numero de serie",
      ],
      labelKeywords: [
        "photo numero de serie",
        "photo numero serie",
        "photo numero de serie ont",
        "photo numero serie ont",
        "numero de serie ont",
        "photo sn ont",
        "photo sn",
        "sn ont",
        "etiquette ont",
        "etiquette box ont",
        "box ont",
        "photo ont",
        "numero de serie",
      ],
      negativeKeywords: ["fat", "pto", "mesure", "cable", "debit", "wifi", "combine", "contrat"],
      onAbsent: "leave_empty_and_warn",
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "ont_sn" || p.type === "ont_sn"));
        if (direct) return { src: getPhotoSource(direct), name: "ont_sn.jpg", slot: "ont_sn" };
        const pts = safeGetArray(data?.points_gps);
        const abonne = pts.find((p) => p && (normalizeText(p.type).includes("abonne") || normalizeText(p.type).includes("ont")) && getPhotoSource(p.photo));
        if (abonne) return { src: getPhotoSource(abonne.photo), name: "ont_sn.jpg", slot: "ont_sn" };
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(ont|box|sn[-_ ]*ont|etiquette[-_ ]*ont|photo[-_ ]*numero[-_ ]*de[-_ ]*serie|numero[-_ ]*de[-_ ]*serie)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(debit[-_ ]*cable|test[-_ ]*debit[-_ ]*cable|speedtest[-_ ]*cable)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/wifi/i.test(p.name || p.nom || p.label || ""));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(debit[-_ ]*wifi|test[-_ ]*debit[-_ ]*wifi|speedtest[-_ ]*wifi)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/cable/i.test(p.name || p.nom || p.label || ""));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(combine|photo[-_ ]*combine|telephone)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()) && !/fiche/i.test(p.name || p.nom || p.label || ""));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(fiche[-_ ]*combine|prise[-_ ]*combine|fiche[-_ ]*raccordement)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
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
        const legacy = wa.find((p) => getPhotoSource(p) && (p.name || p.nom || p.label) && /^(contrat|signature|contrat[-_ ]*client)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(String(p.name || p.nom || p.label).trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "contrat_signe.jpg", slot: "contrat_client" };
        return null;
      },
    },
  ];

  // Dictionnaire de correspondances pour tous les champs d'intervention
  const FIELD_DEFINITIONS = {
    // ----------------------------------------------------
    // 1. Informations Client
    // ----------------------------------------------------
    nom_client: {
      key: "nom_client",
      step: 1,
      ftSource: "nom_client / nom_dossier",
      celprosTarget: "Nom du client",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["technicien","equipe","msan","fat","pto"],
      label: "Nom du client",
      category: "Client",
      type: "text",
      attrPatterns: [
        /^field_nomclient$/i,
        /^field_client$/i,
        /^nomclient$/i,
        /^nom_client$/i,
        /^nomcomplet$/i,
        /^clientname$/i,
        /^customername$/i,
        /^abonne$/i,
        /^nomabonne$/i,
        /^client$/i,
      ],
      labelKeywords: [
        "nom du client",
        "nom client",
        "nom et prenom",
        "nom abonne",
        "nom complet",
        "client",
        "abonne",
        "raison sociale",
        "souscripteur",
      ],
      valueExtractor: (data) => (data?.nom_client ? String(data.nom_client).trim() : ""),
    },

    adresse_zone: {
      key: "adresse_zone",
      step: 1,
      ftSource: "adresse_zone",
      celprosTarget: "Adresse / Zone",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["msan","fat","pto"],
      label: "Adresse / Zone",
      category: "Client",
      type: "text",
      attrPatterns: [
        /^field_adresse$/i,
        /^field_zone$/i,
        /^field_adressezone$/i,
        /^adressezone$/i,
        /^adresse$/i,
        /^zone$/i,
        /^quartier$/i,
        /^localisation$/i,
        /^address$/i,
        /^location$/i,
      ],
      labelKeywords: [
        "adresse zone",
        "adresse / zone",
        "adresse",
        "zone",
        "quartier",
        "localisation",
        "adresse complete",
        "lieu",
      ],
      valueExtractor: (data) => (data?.adresse_zone ? String(data.adresse_zone).trim() : ""),
    },

    telephone_ligne: {
      key: "telephone_ligne",
      step: 1,
      ftSource: "telephone_ligne",
      celprosTarget: "Téléphone ligne (fixe)",
      onAbsent: "leave_empty",
      negativeKeywords: ["mobile","gsm","cellulaire","portable","whatsapp"],
      label: "Téléphone ligne",
      category: "Client",
      type: "text",
      attrPatterns: [
        /^field_telephoneligne$/i,
        /^field_numeroligne$/i,
        /^field_ligne$/i,
        /^telephoneligne$/i,
        /^telephone_ligne$/i,
        /^numeroligne$/i,
        /^numligne$/i,
        /^lignefixe$/i,
        /^fixe$/i,
      ],
      labelKeywords: [
        "telephone ligne",
        "numero de ligne",
        "numero ligne",
        "ligne fixe",
        "no ligne",
        "ligne",
      ],
      valueExtractor: (data) => (data?.telephone_ligne ? String(data.telephone_ligne).trim() : ""),
    },

    mobile: {
      key: "mobile",
      step: 1,
      ftSource: "mobile",
      celprosTarget: "Mobile / Contact",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["fixe","ligne"],
      label: "Mobile / Contact",
      category: "Client",
      type: "text",
      attrPatterns: [
        /^field_mobile$/i,
        /^field_contact$/i,
        /^field_telephone$/i,
        /^mobile$/i,
        /^contact$/i,
        /^cellphone$/i,
        /^whatsapp$/i,
        /^telephone$/i,
        /^contactclient$/i,
        /^nummobile$/i,
      ],
      labelKeywords: [
        "mobile",
        "contact mobile",
        "numero mobile",
        "telephone mobile",
        "contact",
        "gsm",
        "cellulaire",
        "whatsapp",
        "telephone",
      ],
      valueExtractor: (data) => {
        if (data?.mobile) return String(data.mobile).trim();
        if (data?.telephone_ligne) return String(data.telephone_ligne).trim();
        return "";
      },
    },

    offre_souscrite: {
      key: "offre_souscrite",
      step: 1,
      ftSource: "offre_souscrite",
      celprosTarget: "Offre souscrite",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Offre souscrite",
      category: "Client",
      type: "select",
      attrPatterns: [
        /^field_offresouscrite$/i,
        /^field_offre$/i,
        /^offresouscrite$/i,
        /^offre_souscrite$/i,
        /^offre$/i,
        /^forfait$/i,
        /^formule$/i,
        /^debit$/i,
        /^package$/i,
      ],
      labelKeywords: [
        "offre souscrite",
        "offre",
        "formule",
        "forfait",
        "debit souscrit",
        "abonnement",
        "type d'offre",
      ],
      valueExtractor: (data) => (data?.offre_souscrite ? String(data.offre_souscrite).trim() : ""),
    },

    // ----------------------------------------------------
    // 2. Réseau & FAT / PBO / MSAN
    // ----------------------------------------------------
    etat: {
      key: "etat",
      step: 4,
      ftSource: "etat",
      celprosTarget: "État PON",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: [],
      label: "État (PON)",
      category: "Réseau",
      type: "select",
      attrPatterns: [
        /^field_etat$/i,
        /^field_etatpon$/i,
        /^etat$/i,
        /^etatpon$/i,
        /^etat_pon$/i,
        /^pon$/i,
        /^statuspon$/i,
        /^technologie$/i,
      ],
      labelKeywords: [
        "etat",
        "etat pon",
        "statut pon",
        "technologie",
        "type reseau",
        "statut reseau",
      ],
      valueExtractor: (data) => (data?.etat ? String(data.etat).trim() : ""),
    },

    msan: {
      key: "msan",
      step: 4,
      ftSource: "msan",
      celprosTarget: "MSAN / OLT",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["fat","pto","client"],
      label: "MSAN / OLT",
      category: "Réseau",
      type: "text",
      attrPatterns: [
        /^field_msan$/i,
        /^msan$/i,
        /^msanref$/i,
        /^olt$/i,
        /^nro$/i,
        /^pop$/i,
        /^equipementmsan$/i,
        /^nomsan$/i,
      ],
      labelKeywords: [
        "msan",
        "ref msan",
        "nom msan",
        "olt",
        "nro",
        "equipement msan",
        "pop",
      ],
      valueExtractor: (data) => (data?.msan ? String(data.msan).trim() : ""),
    },

    fat_ref: {
      key: "fat_ref",
      step: 4,
      ftSource: "fat_ref",
      celprosTarget: "Référence FAT / PBO",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["msan","pto","client"],
      label: "Référence FAT / PBO",
      category: "Réseau",
      type: "text",
      attrPatterns: [
        /^field_fat$/i,
        /^field_fatref$/i,
        /^field_pbo$/i,
        /^fat_ref$/i,
        /^fatref$/i,
        /^fat$/i,
        /^pbo$/i,
        /^pboref$/i,
        /^reffat$/i,
        /^boitierfat$/i,
        /^codefat$/i,
      ],
      labelKeywords: [
        "reference fat",
        "ref fat",
        "fat",
        "pbo",
        "ref pbo",
        "numero fat",
        "boitier fat",
        "code fat",
        "pbo ref",
      ],
      valueExtractor: (data) => (data?.fat_ref ? String(data.fat_ref).trim() : ""),
    },

    port: {
      key: "port",
      step: 4,
      ftSource: "port",
      celprosTarget: "Port raccordé",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["disponible","disponibles","libres"],
      label: "Port raccordé",
      category: "Réseau",
      type: "text",
      attrPatterns: [
        /^field_port$/i,
        /^port$/i,
        /^portfat$/i,
        /^portpbo$/i,
        /^numeroport$/i,
        /^noport$/i,
        /^portclient$/i,
      ],
      labelKeywords: [
        "port",
        "port raccorde",
        "port fat",
        "port pbo",
        "numero de port",
        "numero port",
        "no port",
      ],
      valueExtractor: (data) => {
        if (data?.port !== undefined && data?.port !== null && String(data.port).trim() !== "") {
          return String(data.port).trim();
        }
        return "";
      },
    },

    ports_disponibles: {
      key: "ports_disponibles",
      step: 4,
      ftSource: "ports_disponibles",
      celprosTarget: "Ports disponibles",
      onAbsent: "leave_empty",
      negativeKeywords: ["raccorde"],
      label: "Ports disponibles (liste)",
      category: "Réseau",
      type: "text",
      attrPatterns: [
        /^field_portsdisponibles$/i,
        /^ports_disponibles$/i,
        /^portsdisponibles$/i,
        /^listeportsdispo$/i,
        /^portslibres$/i,
      ],
      labelKeywords: [
        "ports disponibles",
        "liste ports disponibles",
        "ports libres",
        "ports dispo",
        "detail ports",
      ],
      valueExtractor: (data) => (data?.ports_disponibles ? String(data.ports_disponibles).trim() : ""),
    },

    port_disponible: {
      key: "port_disponible",
      step: 4,
      ftSource: "port_disponible",
      celprosTarget: "Port disponible",
      onAbsent: "leave_empty",
      negativeKeywords: ["raccorde"],
      label: "Nombre de ports disponibles",
      category: "Réseau",
      type: "number",
      attrPatterns: [
        /^field_portdisponible$/i,
        /^field_nbportsdisponibles$/i,
        /^port_disponible$/i,
        /^portdisponible$/i,
        /^nbportsdispo$/i,
        /^nbportsdisponibles$/i,
        /^nombreportsdisponibles$/i,
      ],
      labelKeywords: [
        "nombre de ports disponibles",
        "nb ports disponibles",
        "nb ports dispo",
        "ports disponibles quantite",
        "nombre de ports libres",
      ],
      valueExtractor: (data) => {
        if (data?.port_disponible !== undefined && data?.port_disponible !== null && data?.port_disponible !== "") {
          const num = Number(data.port_disponible);
          if (!isNaN(num) && num > 0) return num;
        }
        if (data?.ports_disponibles && typeof data.ports_disponibles === "string") {
          const list = data.ports_disponibles.split(",").filter((p) => p.trim());
          if (list.length > 0) return list.length;
        }
        return "";
      },
    },

    puissance_fat_dbm: {
      key: "puissance_fat_dbm",
      step: 4,
      ftSource: "puissance_fat_dbm",
      celprosTarget: "Puissance FAT (dBm)",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["pto","client","abonne","prise"],
      label: "Puissance FAT (dBm)",
      category: "Réseau",
      type: "number",
      attrPatterns: [
        /^field_?(?:valeur_?(?:au_?)?)?puissance_?fat/i,
        /^field_?valeur_?(?:au_?)?fat/i,
        /^valeur_?(?:au_?)?fat/i,
        /^valeurfat/i,
        /^field_puissancefat/i,
        /^field_puissancefatdbm/i,
        /^puissance_fat_dbm/i,
        /^puissancefatdbm/i,
        /^puissancefat/i,
        /^puissance_fat/i,
        /^pfat/i,
        /^dbmfat/i,
        /^mesure_?fat/i,
        /^puissancepbo/i,
        /^valeur_?pbo/i,
      ],
      labelKeywords: [
        "valeur au fat",
        "valeur au fat dbm",
        "valeur au fat (dbm)",
        "valeur fat",
        "valeur fat dbm",
        "puissance fat",
        "puissance fat dbm",
        "puissance au fat",
        "niveau optique fat",
        "dbm fat",
        "puissance au pbo",
        "mesure optique fat",
        "mesure fat",
        "puissance pbo",
      ],
      valueExtractor: (data) => {
        const raw =
          data?.puissance_fat_dbm ??
          data?.puissance_fat ??
          data?.puissance_optique_fat ??
          data?.mesure_fat_dbm ??
          data?.mesure_fat ??
          data?.fat_dbm;
        if (raw === undefined || raw === null || raw === "") return "";
        const str = String(raw).replace(",", ".").trim();
        const num = parseFloat(str);
        if (isNaN(num) || num === 0) return "";
        return num > 0 ? `-${str}` : str;
      },
    },

    // ----------------------------------------------------
    // 3. Câblage & Poteaux
    // ----------------------------------------------------
    type_cable: {
      key: "type_cable",
      step: 4,
      ftSource: "type_cable",
      celprosTarget: "Type de câble",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Type de câble",
      category: "Câblage",
      type: "text",
      attrPatterns: [
        /^field_typecable$/i,
        /^field_cable$/i,
        /^type_cable$/i,
        /^typecable$/i,
        /^cable$/i,
        /^cabletype$/i,
        /^referencecable$/i,
        /^modelecable$/i,
      ],
      labelKeywords: [
        "type de cable",
        "type cable",
        "cable",
        "modele de cable",
        "type de fibre",
        "cable drop",
      ],
      valueExtractor: (data) => (data?.type_cable ? String(data.type_cable).trim() : ""),
    },

    depart_m: {
      key: "depart_m",
      step: 4,
      ftSource: "depart_m",
      celprosTarget: "Métrage départ (m)",
      onAbsent: "leave_empty",
      negativeKeywords: ["arrivee","total","lineaire"],
      label: "Départ (m)",
      category: "Câblage",
      type: "number",
      attrPatterns: [
        /^field_departm$/i,
        /^field_depart$/i,
        /^depart_m$/i,
        /^departm$/i,
        /^depart$/i,
        /^metragedepart$/i,
        /^indexdepart$/i,
        /^metredepart$/i,
      ],
      labelKeywords: [
        "depart m",
        "depart",
        "metrage depart",
        "index depart",
        "metre depart",
        "debut cable",
      ],
      valueExtractor: (data) => {
        if (data?.depart_m === undefined || data?.depart_m === null || data?.depart_m === "") return "";
        const str = String(data.depart_m).replace(",", ".").trim();
        const num = parseFloat(str);
        if (isNaN(num)) return "";
        if (num === 0) {
          const arr = parseFloat(String(data?.arrivee_m || "0").replace(",", "."));
          if (arr > 0) return "0";
          return "";
        }
        return str;
      },
    },

    arrivee_m: {
      key: "arrivee_m",
      step: 4,
      ftSource: "arrivee_m",
      celprosTarget: "Métrage arrivée (m)",
      onAbsent: "leave_empty",
      negativeKeywords: ["depart","total","lineaire"],
      label: "Arrivée (m)",
      category: "Câblage",
      type: "number",
      attrPatterns: [
        /^field_arriveem$/i,
        /^field_arrivee$/i,
        /^arrivee_m$/i,
        /^arriveem$/i,
        /^arrivee$/i,
        /^metragearrivee$/i,
        /^indexarrivee$/i,
        /^metrearrivee$/i,
      ],
      labelKeywords: [
        "arrivee m",
        "arrivee",
        "metrage arrivee",
        "index arrivee",
        "metre arrivee",
        "fin cable",
      ],
      valueExtractor: (data) => {
        if (data?.arrivee_m === undefined || data?.arrivee_m === null || data?.arrivee_m === "") return "";
        const str = String(data.arrivee_m).replace(",", ".").trim();
        const num = parseFloat(str);
        if (isNaN(num) || num <= 0) return "";
        return str;
      },
    },

    lineaire_m: {
      key: "lineaire_m",
      step: 2,
      ftSource: "lineaire_m",
      celprosTarget: "Linéaire total (m)",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["depart", "arrivee"],
      label: "Linéaire (m)",
      category: "Câblage",
      type: "number",
      attrPatterns: [
        /^lineaire/i,
        /^field_lineaire/i,
        /^metrage/i,
        /^longueur_?cable/i,
        /^longueur_?lineaire/i,
        /^longueurcable/i,
        /^distance/i,
      ],
      labelKeywords: [
        "lineaire fibre optique",
        "lineaire fibre",
        "lineaire fo",
        "lineaire m",
        "lineaire",
        "lineaire total deploye",
        "lineaire total",
        "lineaire deploye",
        "longueur de cable",
        "longueur cable",
        "distance m",
        "metrage total",
        "metrage lineaire",
      ],
      valueExtractor: (data) => {
        if (data?.lineaire_m !== undefined && data?.lineaire_m !== null && data?.lineaire_m !== "") {
          const str = String(data.lineaire_m).replace(",", ".").trim();
          const num = parseFloat(str);
          if (!isNaN(num) && num > 0) return str;
        }
        if (data?.depart_m !== undefined && data?.arrivee_m !== undefined) {
          const dep = parseFloat(String(data.depart_m).replace(",", ".")) || 0;
          const arr = parseFloat(String(data.arrivee_m).replace(",", ".")) || 0;
          const diff = Math.abs(arr - dep);
          if (diff > 0) return String(diff);
        }
        // Repli depuis materiel_pose (ex: cpc_100, cpc_150, cpc, cable_drop, drop)
        const mp = safeGetObject(data?.materiel_pose);
        for (const [k, v] of Object.entries(mp)) {
          const nk = normalizeText(k);
          if (nk.startsWith("cpc") || nk.startsWith("drop") || nk.includes("cable") || nk.includes("lineaire")) {
            const n = parseFloat(String(v).replace(",", "."));
            if (!isNaN(n) && n > 0) return String(n);
          }
        }
        return "";
      },
    },

    nb_poteaux_traverses: {
      key: "nb_poteaux_traverses",
      step: 4,
      ftSource: "nb_poteaux_traverses",
      celprosTarget: "Poteaux traversés",
      onAbsent: "leave_empty",
      negativeKeywords: ["implante","arme"],
      label: "Poteaux traversés",
      category: "Câblage",
      type: "number",
      attrPatterns: [
        /^field_nbpoteauxtraverses$/i,
        /^field_poteauxtraverses$/i,
        /^nb_poteaux_traverses$/i,
        /^nbpoteauxtraverses$/i,
        /^poteauxtraverses$/i,
        /^nbtraverses$/i,
        /^nb_?poteaux$/i,
        /^poteaux_?traverses$/i,
        /^poteaux$/i,
      ],
      labelKeywords: [
        "poteaux traverses",
        "nb poteaux traverses",
        "nombre de poteaux traverses",
        "poteaux traverses count",
        "nombre de poteaux",
        "nb poteaux",
        "poteaux",
      ],
      valueExtractor: (data) => {
        if (data?.nb_poteaux_traverses !== undefined && data?.nb_poteaux_traverses !== null && data?.nb_poteaux_traverses !== "") {
          const n = Number(data.nb_poteaux_traverses);
          if (!isNaN(n) && n > 0) return String(n);
        }
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const count = pts.filter((p) => p && normalizeText(p.type).includes("poteau") && (p.traverse !== undefined ? Boolean(p.traverse) : p.sous_type !== "Implanté")).length;
        if (count > 0) return String(count);
        return "";
      },
    },

    nb_poteaux_implantes: {
      key: "nb_poteaux_implantes",
      step: 4,
      ftSource: "nb_poteaux_implantes",
      celprosTarget: "Poteaux implantés",
      onAbsent: "leave_empty",
      negativeKeywords: ["traverse","arme"],
      label: "Poteaux implantés",
      category: "Câblage",
      type: "number",
      attrPatterns: [
        /^field_nbpoteauximplantes$/i,
        /^field_poteauximplantes$/i,
        /^nb_poteaux_implantes$/i,
        /^nbpoteauximplantes$/i,
        /^poteauximplantes$/i,
        /^nbimplantes$/i,
      ],
      labelKeywords: [
        "poteaux implantes",
        "nb poteaux implantes",
        "nombre de poteaux implantes",
        "nouveaux poteaux",
      ],
      valueExtractor: (data) => {
        if (data?.nb_poteaux_implantes !== undefined && data?.nb_poteaux_implantes !== null && data?.nb_poteaux_implantes !== "") {
          const n = Number(data.nb_poteaux_implantes);
          if (!isNaN(n) && n > 0) return String(n);
        }
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const count = pts.filter((p) => p && p.type === "Poteau" && (p.implante !== undefined ? Boolean(p.implante) : p.sous_type === "Implanté")).length;
        if (count > 0) return String(count);
        return "";
      },
    },

    nb_poteaux_armes: {
      key: "nb_poteaux_armes",
      step: 4,
      ftSource: "nb_poteaux_armes",
      celprosTarget: "Poteaux armés",
      onAbsent: "leave_empty",
      negativeKeywords: ["traverse","implante"],
      label: "Poteaux armés",
      category: "Câblage",
      type: "number",
      attrPatterns: [
        /^field_nbpoteauxarmes$/i,
        /^field_poteauxarmes$/i,
        /^nb_poteaux_armes$/i,
        /^nbpoteauxarmes$/i,
        /^poteauxarmes$/i,
        /^nbarmes$/i,
      ],
      labelKeywords: [
        "poteaux armes",
        "nb poteaux armes",
        "nombre de poteaux armes",
        "armements",
      ],
      valueExtractor: (data) => {
        if (data?.nb_poteaux_armes !== undefined && data?.nb_poteaux_armes !== null && data?.nb_poteaux_armes !== "") {
          const n = Number(data.nb_poteaux_armes);
          if (!isNaN(n) && n > 0) return String(n);
        }
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const count = pts.filter((p) => p && p.type === "Poteau" && (p.arme !== undefined ? Boolean(p.arme) : p.sous_type === "Armé")).length;
        if (count > 0) return String(count);
        return "";
      },
    },

    // ----------------------------------------------------
    // 4. Intérieur & Matériel Client
    // ----------------------------------------------------
    puissance_pto_dbm: {
      key: "puissance_pto_dbm",
      step: 4,
      ftSource: "puissance_pto_dbm",
      celprosTarget: "Puissance PTO (dBm)",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["fat","pbo"],
      label: "Puissance PTO (dBm)",
      category: "Intérieur",
      type: "number",
      attrPatterns: [
        /^field_?(?:valeur_?(?:au_?)?)?puissance_?pto/i,
        /^field_?valeur_?(?:au_?)?pto/i,
        /^valeur_?(?:au_?)?pto/i,
        /^valeurpto/i,
        /^field_puissancepto/i,
        /^field_puissanceptodbm/i,
        /^puissance_pto_dbm/i,
        /^puissanceptodbm/i,
        /^puissancepto/i,
        /^puissance_pto/i,
        /^ppto/i,
        /^dbmpto/i,
        /^mesure_?pto/i,
        /^puissancearrivee/i,
        /^valeur_?prise/i,
      ],
      labelKeywords: [
        "valeur au pto",
        "valeur au pto dbm",
        "valeur au pto (dbm)",
        "valeur pto",
        "valeur pto dbm",
        "puissance pto",
        "puissance pto dbm",
        "puissance au pto",
        "niveau optique pto",
        "dbm pto",
        "puissance chez le client",
        "mesure pto",
        "mesure optique pto",
        "puissance prise",
      ],
      valueExtractor: (data) => {
        const raw =
          data?.puissance_pto_dbm ??
          data?.puissance_pto ??
          data?.puissance_optique_pto ??
          data?.mesure_pto_dbm ??
          data?.mesure_pto ??
          data?.pto_dbm;
        if (raw === undefined || raw === null || raw === "") return "";
        const str = String(raw).replace(",", ".").trim();
        const num = parseFloat(str);
        if (isNaN(num) || num === 0) return "";
        return num > 0 ? `-${str}` : str;
      },
    },

    pto_qte: {
      key: "pto_qte",
      step: 2,
      ftSource: "pto_qte",
      celprosTarget: "Quantité PTO",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Quantité PTO",
      category: "Intérieur",
      type: "number",
      attrPatterns: [
        /^field_ptoqte$/i,
        /^pto_qte$/i,
        /^ptoqte$/i,
        /^qtepto$/i,
        /^quantitepto$/i,
        /^nombrepto$/i,
        /^(?:field_)?(?:nb_?)?pto$/i,
        /^materiel_?pto$/i,
        /^prise_?pto$/i,
        /^prise_?optique$/i,
      ],
      labelKeywords: [
        "qte pto",
        "quantite pto",
        "nombre de pto",
        "nombre pto",
        "pto posees",
        "pto",
        "prise optique",
        "prise pto",
      ],
      valueExtractor: (data) => {
        if (data?.pto_qte !== undefined && data?.pto_qte !== null && data?.pto_qte !== "") {
          const n = Number(data.pto_qte);
          if (!isNaN(n) && n > 0) return String(n);
        }
        const fromMat = getMaterielQuantity(data, "pto", "prise_optique", "prise_pto");
        if (fromMat) return fromMat;
        return "";
      },
    },

    repeteur_wifi_qte: {
      key: "repeteur_wifi_qte",
      step: 2,
      ftSource: "repeteur_wifi_qte",
      celprosTarget: "Quantité répéteur Wi-Fi",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Qté répéteur WiFi",
      category: "Intérieur",
      type: "number",
      attrPatterns: [
        /^field_repeteurwifi$/i,
        /^field_repeteurwifiqte$/i,
        /^repeteur_wifi_qte$/i,
        /^repeteurwifiqte$/i,
        /^repeteurwifi$/i,
        /^qterepeteurwifi$/i,
        /^repeteur$/i,
        /^(?:field_)?(?:nb_?)?repeteur/i,
      ],
      labelKeywords: [
        "qte repeteur wifi",
        "repeteur wifi",
        "quantite repeteur wifi",
        "repeteurs wifi",
        "repeteur",
        "extender",
      ],
      valueExtractor: (data) => {
        if (data?.repeteur_wifi_qte !== undefined && data?.repeteur_wifi_qte !== null && data?.repeteur_wifi_qte !== "") {
          const n = Number(data.repeteur_wifi_qte);
          if (!isNaN(n) && n > 0) return String(n);
        }
        const fromMat = getMaterielQuantity(data, "repeteur_wifi", "repeteur", "extender");
        if (fromMat) return fromMat;
        return "";
      },
    },

    emplacement_ont: {
      key: "emplacement_ont",
      step: 2,
      ftSource: "emplacement_ont",
      celprosTarget: "Emplacement ONT / Box",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Emplacement ONT / Box",
      category: "Intérieur",
      type: "text",
      attrPatterns: [
        /^field_emplacementont$/i,
        /^emplacement_ont$/i,
        /^emplacementont$/i,
        /^lieuont$/i,
        /^emplacementbox$/i,
        /^pieceont$/i,
      ],
      labelKeywords: [
        "emplacement ont",
        "emplacement box",
        "lieu ont",
        "piece ont",
        "emplacement equipement",
        "piece d'installation",
      ],
      valueExtractor: (data) => (data?.emplacement_ont ? String(data.emplacement_ont).trim() : ""),
    },

    mac: {
      key: "mac",
      step: 2,
      ftSource: "mac",
      celprosTarget: "Adresse MAC ONT",
      onAbsent: "leave_empty",
      negativeKeywords: ["sn","serie"],
      label: "Adresse MAC ONT",
      category: "Intérieur",
      type: "text",
      attrPatterns: [
        /^field_mac$/i,
        /^field_adressemac$/i,
        /^field_adresse_mac$/i,
        /^mac$/i,
        /^mac_?ont$/i,
        /^ont_?mac$/i,
        /^adressemac$/i,
        /^adresse_mac$/i,
        /^macaddress$/i,
        /^mac_address$/i,
      ],
      labelKeywords: [
        "mac",
        "adresse mac",
        "mac ont",
        "adresse mac ont",
        "mac box",
      ],
      valueExtractor: (data) => (data?.mac ? String(data.mac).trim() : ""),
    },

    sn: {
      key: "sn",
      step: 2,
      ftSource: "sn / ont_sn",
      celprosTarget: "Numéro de série ONT (SN)",
      onAbsent: "leave_empty_and_warn",
      negativeKeywords: ["mac"],
      label: "Numéro de série SN / ONT",
      category: "Intérieur",
      type: "text",
      attrPatterns: [
        /^field_sn$/i,
        /^field_ontsn$/i,
        /^field_ont_sn$/i,
        /^field_ont$/i,
        /^field_serialnumber$/i,
        /^field_serial_number$/i,
        /^sn$/i,
        /^ont$/i,
        /^ont_sn$/i,
        /^ontsn$/i,
        /^serialnumber$/i,
        /^serial_number$/i,
        /^numeroserie$/i,
        /^numero_serie$/i,
        /^numserie$/i,
        /^num_serie$/i,
        /^serieont$/i,
        /^serie_ont$/i,
        /^snont$/i,
        /^sn_ont$/i,
      ],
      labelKeywords: [
        "ont",
        "sn ont",
        "ont sn",
        "ont / sn",
        "numero de serie",
        "numero serie",
        "no serie",
        "serial number",
        "sn box",
        "sn",
        "s/n",
      ],
      valueExtractor: (data) => {
        // Privilégier le vrai numéro de série (chaîne alphanumérique d'au moins 6 caractères ou non-numérique pure)
        const candidates = [data?.sn, data?.ont_sn].filter(Boolean).map((s) => String(s).trim());
        const validSn = candidates.find((c) => c.length >= 6 || !/^\d+$/.test(c));
        if (validSn) return validSn;
        if (data?.sn && String(data.sn).trim()) return String(data.sn).trim();
        if (data?.ont_sn && String(data.ont_sn).trim()) return String(data.ont_sn).trim();
        return "";
      },
    },

    // ----------------------------------------------------
    // 5. Conformité & Validation
    // ----------------------------------------------------
    client_confirme_emplacement: {
      key: "client_confirme_emplacement",
      step: 5,
      ftSource: "client_confirme_emplacement",
      celprosTarget: "Client confirme emplacement",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Client confirme l'emplacement",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_clientconfirmeemplacement$/i,
        /^client_confirme_emplacement$/i,
        /^clientconfirmeemplacement$/i,
        /^confirmeemplacement$/i,
      ],
      labelKeywords: [
        "client confirme l'emplacement",
        "validation emplacement client",
        "emplacement confirme",
      ],
      valueExtractor: (data) => (data?.client_confirme_emplacement ? true : null),
    },

    remise_equipement_ok: {
      key: "remise_equipement_ok",
      step: 5,
      ftSource: "remise_equipement_ok",
      celprosTarget: "Remise équipements OK",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Remise d'équipement OK",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_remiseequipementok$/i,
        /^remise_equipement_ok$/i,
        /^remiseequipementok$/i,
        /^remiseequipement$/i,
      ],
      labelKeywords: [
        "remise d'equipement ok",
        "remise equipement ok",
        "equipement remis au client",
        "remise materiel ok",
      ],
      valueExtractor: (data) => (data?.remise_equipement_ok ? true : null),
    },

    travaux_conformes: {
      key: "travaux_conformes",
      step: 5,
      ftSource: "travaux_conformes",
      celprosTarget: "Travaux conformes",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Travaux conformes",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_travauxconformes$/i,
        /^travaux_conformes$/i,
        /^travauxconformes$/i,
        /^conformitetravaux$/i,
        /^travauxok$/i,
      ],
      labelKeywords: [
        "travaux conformes",
        "conformite des travaux",
        "installation conforme",
        "travaux conformes aux regles",
      ],
      valueExtractor: (data) => {
        const v = data?.travaux_conformes;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    emplacement_valide: {
      key: "emplacement_valide",
      step: 5,
      ftSource: "emplacement_valide",
      celprosTarget: "Emplacement validé",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Emplacement validé",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_emplacementvalide$/i,
        /^emplacement_valide$/i,
        /^emplacementvalide$/i,
        /^validationemplacement$/i,
      ],
      labelKeywords: [
        "emplacement valide",
        "emplacement valide par le client",
      ],
      valueExtractor: (data) => {
        const v = data?.emplacement_valide;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    travail_propre: {
      key: "travail_propre",
      step: 5,
      ftSource: "travail_propre",
      celprosTarget: "Travail propre",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Travail propre",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_travailpropre$/i,
        /^travail_propre$/i,
        /^travailpropre$/i,
        /^proprete$/i,
        /^chantiernettoye$/i,
      ],
      labelKeywords: [
        "travail propre",
        "chantier nettoye",
        "proprete des lieux",
        "nettoyage effectue",
      ],
      valueExtractor: (data) => {
        const v = data?.travail_propre;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    service_teste: {
      key: "service_teste",
      step: 5,
      ftSource: "service_teste",
      celprosTarget: "Service testé",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Service testé",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_serviceteste$/i,
        /^service_teste$/i,
        /^serviceteste$/i,
        /^testservice$/i,
        /^testdebit$/i,
      ],
      labelKeywords: [
        "service teste",
        "test du service",
        "test navigation",
        "test debit",
      ],
      valueExtractor: (data) => {
        const v = data?.service_teste;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    service_fonctionne: {
      key: "service_fonctionne",
      step: 5,
      ftSource: "service_fonctionne",
      celprosTarget: "Service fonctionne (Internet OK)",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Service fonctionne",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_servicefonctionne$/i,
        /^service_fonctionne$/i,
        /^servicefonctionne$/i,
        /^serviceok$/i,
        /^fonctionnel$/i,
      ],
      labelKeywords: [
        "service fonctionne",
        "service fonctionnel",
        "connexion operationnelle",
        "internet fonctionne",
        "connexion ok",
      ],
      valueExtractor: (data) => {
        const v = data?.service_fonctionne;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    explications_donnees: {
      key: "explications_donnees",
      step: 5,
      ftSource: "explications_donnees",
      celprosTarget: "Explications données",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Explications données",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_explicationsdonnees$/i,
        /^explications_donnees$/i,
        /^explicationsdonnees$/i,
        /^explicationclient$/i,
      ],
      labelKeywords: [
        "explications donnees",
        "explications fournies au client",
        "information client",
      ],
      valueExtractor: (data) => {
        const v = data?.explications_donnees;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    recommanderait: {
      key: "recommanderait",
      step: 5,
      ftSource: "recommanderait",
      celprosTarget: "Recommanderait Celtiis",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Recommanderait",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_recommanderait$/i,
        /^recommanderait$/i,
        /^recommandation$/i,
      ],
      labelKeywords: [
        "recommanderait",
        "recommanderait celtiis",
      ],
      valueExtractor: (data) => {
        const v = data?.recommanderait;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    accepte_recontact: {
      key: "accepte_recontact",
      step: 5,
      ftSource: "accepte_recontact",
      celprosTarget: "Accepte recontact",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Accepte recontact",
      category: "Conformité",
      type: "boolean",
      attrPatterns: [
        /^field_accepterecontact$/i,
        /^accepte_recontact$/i,
        /^accepterecontact$/i,
      ],
      labelKeywords: [
        "accepte recontact",
        "accepte d'etre recontacte",
      ],
      valueExtractor: (data) => {
        const v = data?.accepte_recontact;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    qualite: {
      key: "qualite",
      step: 5,
      ftSource: "qualite",
      celprosTarget: "Qualité globale",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Qualité ressentie",
      category: "Conformité",
      type: "select",
      attrPatterns: [
        /^field_qualite$/i,
        /^qualite$/i,
        /^satisfactionqualite$/i,
      ],
      labelKeywords: [
        "qualite",
        "qualite de l'intervention",
        "satisfaction qualite",
      ],
      valueExtractor: (data) => (data?.qualite ? String(data.qualite).trim() : ""),
    },

    delais: {
      key: "delais",
      step: 5,
      ftSource: "delais",
      celprosTarget: "Respect des délais",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Respect des délais",
      category: "Conformité",
      type: "select",
      attrPatterns: [
        /^field_delais$/i,
        /^delais$/i,
        /^respectdelais$/i,
      ],
      labelKeywords: [
        "delais",
        "respect des delais",
      ],
      valueExtractor: (data) => (data?.delais ? String(data.delais).trim() : ""),
    },

    professionnalisme: {
      key: "professionnalisme",
      step: 5,
      ftSource: "professionnalisme",
      celprosTarget: "Professionnalisme équipe",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Professionnalisme",
      category: "Conformité",
      type: "select",
      attrPatterns: [
        /^field_professionnalisme$/i,
        /^professionnalisme$/i,
        /^satisfactionpro$/i,
      ],
      labelKeywords: [
        "professionnalisme",
        "professionnalisme technicien",
      ],
      valueExtractor: (data) => (data?.professionnalisme ? String(data.professionnalisme).trim() : ""),
    },

    nom_client_declaration: {
      key: "nom_client_declaration",
      step: 5,
      ftSource: "nom_client_declaration",
      celprosTarget: "Nom déclarant client",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Nom déclarant",
      category: "Conformité",
      type: "text",
      attrPatterns: [
        /^field_nomclientdeclaration$/i,
        /^nom_client_declaration$/i,
        /^nomclientdeclaration$/i,
        /^signataire$/i,
      ],
      labelKeywords: [
        "nom du client declaration",
        "nom declarant",
        "nom du signataire",
        "signataire",
      ],
      valueExtractor: (data) => (data?.nom_client_declaration ? String(data.nom_client_declaration).trim() : (data?.nom_client ? String(data.nom_client).trim() : "")),
    },

    remarque_libre: {
      key: "remarque_libre",
      step: 5,
      ftSource: "remarque_libre",
      celprosTarget: "Remarques libres",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Remarques / Observations",
      category: "Conformité",
      type: "text",
      attrPatterns: [
        /^field_remarquelibre$/i,
        /^field_remarques$/i,
        /^field_commentaires$/i,
        /^field_observations$/i,
        /^remarque_libre$/i,
        /^remarquelibre$/i,
        /^remarques$/i,
        /^commentaires$/i,
        /^observations$/i,
      ],
      labelKeywords: [
        "remarque libre",
        "remarques",
        "commentaires",
        "observations",
        "remarque",
        "appreciation",
      ],
      valueExtractor: (data) => (data?.remarque_libre ? String(data.remarque_libre).trim() : (data?.appreciation_satisfaction_libre ? String(data.appreciation_satisfaction_libre).trim() : "")),
    },

    // ----------------------------------------------------
    // 6. Informations Intervention (Général)
    // ----------------------------------------------------
    date: {
      key: "date",
      step: 1,
      ftSource: "date",
      celprosTarget: "Date d'intervention",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Date d'intervention",
      category: "Général",
      type: "text",
      attrPatterns: [
        /^field_date$/i,
        /^field_dateintervention$/i,
        /^date$/i,
        /^date_intervention$/i,
        /^dateintervention$/i,
        /^dateinstallation$/i,
      ],
      labelKeywords: [
        "date d'intervention",
        "date intervention",
        "date de realisation",
        "date d'installation",
        "date",
      ],
      valueExtractor: (data) => (data?.date ? String(data.date).slice(0, 10) : ""),
    },

    nom_technicien: {
      key: "nom_technicien",
      step: 1,
      ftSource: "nom_technicien",
      celprosTarget: "Nom du technicien",
      onAbsent: "leave_empty",
      negativeKeywords: ["client","abonne"],
      label: "Nom du technicien",
      category: "Général",
      type: "text",
      attrPatterns: [
        /^field_technicien$/i,
        /^field_nomtechnicien$/i,
        /^nom_technicien$/i,
        /^nomtechnicien$/i,
        /^technicien$/i,
        /^intervenant$/i,
        /^nomintervenant$/i,
      ],
      labelKeywords: [
        "nom du technicien",
        "nom technicien",
        "technicien",
        "intervenant",
        "agent",
      ],
      valueExtractor: (data) => (data?.nom_technicien ? String(data.nom_technicien).trim() : ""),
    },

    nom_equipe: {
      key: "nom_equipe",
      step: 1,
      ftSource: "nom_equipe",
      celprosTarget: "Nom de l'équipe",
      onAbsent: "leave_empty",
      negativeKeywords: ["client","abonne"],
      label: "Nom de l'équipe",
      category: "Général",
      type: "text",
      attrPatterns: [
        /^field_equipe$/i,
        /^field_nomequipe$/i,
        /^nom_equipe$/i,
        /^nomequipe$/i,
        /^equipe$/i,
        /^prestataire$/i,
        /^entreprise$/i,
      ],
      labelKeywords: [
        "nom de l'equipe",
        "nom equipe",
        "equipe",
        "prestataire",
        "sous-traitant",
      ],
      valueExtractor: (data) => (data?.nom_equipe ? String(data.nom_equipe).trim() : ""),
    },

    // ----------------------------------------------------
    // 7. GPS
    // ----------------------------------------------------
    latitude: {
      key: "latitude",
      step: 2,
      ftSource: "points_gps[type=Abonné].lat",
      celprosTarget: "Latitude GPS",
      onAbsent: "leave_empty",
      negativeKeywords: ["longitude","lng"],
      label: "Latitude GPS",
      category: "GPS",
      type: "number",
      attrPatterns: [
        /^field_latitude$/i,
        /^latitude$/i,
        /^lat$/i,
        /^gpslat$/i,
      ],
      labelKeywords: [
        "latitude",
        "lat",
        "coordonnee latitude",
      ],
      valueExtractor: (data) => {
        const pt = extractTargetGpsPoint(data);
        return pt?.lat !== undefined && pt?.lat !== null ? String(pt.lat) : "";
      },
    },

    longitude: {
      key: "longitude",
      step: 2,
      ftSource: "points_gps[type=Abonné].lng",
      celprosTarget: "Longitude GPS",
      onAbsent: "leave_empty",
      negativeKeywords: ["latitude","lat"],
      label: "Longitude GPS",
      category: "GPS",
      type: "number",
      attrPatterns: [
        /^field_longitude$/i,
        /^field_lng$/i,
        /^field_lon$/i,
        /^longitude$/i,
        /^lng$/i,
        /^lon$/i,
        /^gpslng$/i,
      ],
      labelKeywords: [
        "longitude",
        "lng",
        "lon",
        "coordonnee longitude",
      ],
      valueExtractor: (data) => {
        const pt = extractTargetGpsPoint(data);
        return pt?.lng !== undefined && pt?.lng !== null ? String(pt.lng) : "";
      },
    },

    gps_coordinates: {
      key: "gps_coordinates",
      step: 2,
      ftSource: "points_gps[type=Abonné]",
      celprosTarget: "Coordonnées GPS",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Coordonnées GPS complètes",
      category: "GPS",
      type: "text",
      attrPatterns: [
        /^field_gps$/i,
        /^field_coordonneesgps$/i,
        /^coordonneesgps$/i,
        /^gps$/i,
        /^positiongps$/i,
      ],
      labelKeywords: [
        "coordonnees gps",
        "position gps",
        "gps",
        "localisation gps",
      ],
      valueExtractor: (data) => {
        const pt = extractTargetGpsPoint(data);
        return pt?.lat !== undefined && pt?.lng !== undefined ? `${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}` : "";
      },
    },

    // ----------------------------------------------------
    // 8. CelPros Étape 1 : Interlocuteur & Configurations
    // ----------------------------------------------------
    interlocuteur: {
      key: "interlocuteur",
      step: 1,
      ftSource: "nom_client",
      celprosTarget: "Interlocuteur",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Interlocuteur",
      category: "Client",
      type: "radio",
      attrPatterns: [/^interlocuteur/i, /^demandeur/i],
      labelKeywords: ["le demandeur", "demandeur", "interlocuteur"],
      valueExtractor: (data) => (data?.interlocuteur ? String(data.interlocuteur).trim() : ""),
    },

    configurations_type: {
      key: "configurations_type",
      step: 1,
      ftSource: "offre_souscrite",
      celprosTarget: "Configurations",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Configurations Type",
      category: "Client",
      type: "radio",
      attrPatterns: [/^configuration/i, /^type_config/i],
      labelKeywords: ["configurations", "type configuration", "type config"],
      valueExtractor: (data) => (data?.configurations_type ? String(data.configurations_type).trim() : (data?.type_config ? String(data.type_config).trim() : "")),
    },

    // ----------------------------------------------------
    // 9. CelPros Étape 2 : Accessoires & Matériels
    // ----------------------------------------------------
    gps_fat: {
      key: "gps_fat",
      step: 2,
      ftSource: "points_gps[type=FAT]",
      celprosTarget: "GPS FAT",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "GPS FAT",
      category: "Accessoires",
      type: "text",
      attrPatterns: [/^gps_?fat$/i, /^gpsfat$/i, /^fat_?gps$/i],
      labelKeywords: ["gps fat", "coordonnees fat", "position fat"],
      valueExtractor: (data) => {
        const fat = extractFatGpsPoint(data);
        return fat ? `${fat.lat.toFixed(5)}, ${fat.lng.toFixed(5)}` : "";
      },
    },

    rue: {
      key: "rue",
      step: 2,
      ftSource: "adresse_zone",
      celprosTarget: "Nom de rue",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Rue",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^rue$/i, /^materiel_rue$/i],
      labelKeywords: ["rue"],
      valueExtractor: (data) => getMaterielQuantity(data, "rue", "rues"),
    },

    pince: {
      key: "pince",
      step: 2,
      ftSource: "materiel_pose.pince",
      celprosTarget: "Nombre de pinces",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Pince",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^pince$/i, /^materiel_pince$/i],
      labelKeywords: ["pince"],
      valueExtractor: (data) => getMaterielQuantity(data, "pince", "pinces"),
    },

    crochets: {
      key: "crochets",
      step: 2,
      ftSource: "materiel_pose.crochets",
      celprosTarget: "Nombre de crochets",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Crochets",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^crochet/i, /^crochets$/i],
      labelKeywords: ["crochets", "crochet"],
      valueExtractor: (data) => getMaterielQuantity(data, "crochets", "crochet"),
    },

    suspension: {
      key: "suspension",
      step: 2,
      ftSource: "materiel_pose.suspension",
      celprosTarget: "Nombre de suspensions",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Suspension",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^susp/i, /^suspension/i],
      labelKeywords: ["suspension", "susp", "suspente"],
      valueExtractor: (data) => getMaterielQuantity(data, "susp", "suspension", "suspente", "suspentes"),
    },

    piton: {
      key: "piton",
      step: 2,
      ftSource: "materiel_pose.piton",
      celprosTarget: "Nombre de pitons",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Piton",
      category: "Accessoires",
      type: "number",
      attrPatterns: [
        /^field_piton/i,
        /^piton/i,
        /^nb_?pitons?/i,
        /^materiel_?piton/i,
        /^combien_?de_?pitons?/i,
      ],
      labelKeywords: [
        "piton",
        "pitons",
        "nb pitons",
        "nombre de pitons",
        "piton utilise",
        "pitons utilises",
        "combien de pitons",
        "combien de pitons utilises",
        "nombre de pitons utilises",
      ],
      valueExtractor: (data) => getMaterielQuantity(data, "piton", "pitons"),
    },

    cheville: {
      key: "cheville",
      step: 2,
      ftSource: "materiel_pose.cheville",
      celprosTarget: "Nombre de chevilles",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Cheville",
      category: "Accessoires",
      type: "number",
      attrPatterns: [
        /^field_cheville/i,
        /^cheville/i,
        /^nb_?chevilles?/i,
        /^materiel_?cheville/i,
      ],
      labelKeywords: [
        "cheville",
        "chevilles",
        "cheville nylon",
        "chevilles nylon",
        "nb chevilles",
        "nombre de chevilles",
        "chevilles utilisees",
      ],
      valueExtractor: (data) => getMaterielQuantity(data, "cheville", "chevilles", "cheville_nylon", "chevilles_nylon"),
    },

    jarretiere: {
      key: "jarretiere",
      step: 2,
      ftSource: "materiel_pose.jarretiere",
      celprosTarget: "Nombre de jarretières",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Jarretière optique",
      category: "Accessoires",
      type: "number",
      attrPatterns: [
        /^field_jarretiere/i,
        /^jarretiere/i,
        /^nb_?jarretieres?/i,
        /^materiel_?jarretiere/i,
        /^cordon_?optique/i,
      ],
      labelKeywords: [
        "jarretiere",
        "jarretieres",
        "jarretiere optique",
        "cordon optique",
        "nb jarretieres",
        "nombre de jarretieres",
      ],
      valueExtractor: (data) => getMaterielQuantity(data, "jarretiere", "jarretieres", "cordon_optique"),
    },

    ont_livre: {
      key: "ont_livre",
      step: 2,
      ftSource: "materiel_pose.ont",
      celprosTarget: "ONT livré",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "ONT livré",
      category: "Accessoires",
      type: "number",
      attrPatterns: [
        /^field_ont_?livre/i,
        /^ont_?livre/i,
        /^nb_?ont/i,
        /^materiel_?ont/i,
        /^box_?livree?/i,
        /^modem/i,
      ],
      labelKeywords: [
        "ont livre",
        "box livree",
        "materiel ont",
        "modem",
        "nb ont",
        "nombre ont",
      ],
      valueExtractor: (data) => {
        const fromMat = getMaterielQuantity(data, "ont", "box", "modem");
        if (fromMat) return fromMat;
        if (data?.sn || data?.ont_sn || data?.mac) return "1";
        return "";
      },
    },

    cpc_cable: {
      key: "cpc_cable",
      step: 2,
      ftSource: "materiel_pose.cpc_cable",
      celprosTarget: "CPC Câble",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Câble CPC / Drop",
      category: "Accessoires",
      type: "number",
      attrPatterns: [
        /^field_cpc/i,
        /^cpc/i,
        /^cable_?cpc/i,
        /^cable_?drop/i,
        /^materiel_?cpc/i,
      ],
      labelKeywords: [
        "cable cpc",
        "cpc",
        "cable drop",
        "drop 1fo",
      ],
      valueExtractor: (data) => {
        const fromMat = getMaterielQuantity(
          data,
          "cpc_50", "cpc_100", "cpc_150", "cpc_200", "cpc_250", "cpc_300", "cpc_350", "fibre_1fo", "cpc"
        );
        if (fromMat) return fromMat;
        return "";
      },
    },

    connecteur: {
      key: "connecteur",
      step: 2,
      ftSource: "materiel_pose.connecteur",
      celprosTarget: "Connecteur",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Connecteur",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^connecteur/i, /^closer/i],
      labelKeywords: ["connecteur", "closer"],
      valueExtractor: (data) => getMaterielQuantity(data, "closer", "connecteur", "connecteurs"),
    },

    rp1: {
      key: "rp1",
      step: 2,
      ftSource: "materiel_pose.rp1",
      celprosTarget: "RP1",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "RP1",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^rp1$/i],
      labelKeywords: ["rp1"],
      valueExtractor: (data) => getMaterielQuantity(data, "rp1"),
    },

    poteaux_utilises: {
      key: "poteaux_utilises",
      step: 2,
      ftSource: "materiel_pose.poteaux / points_gps",
      celprosTarget: "Poteaux utilisés",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Poteaux utilisés (total)",
      category: "Accessoires",
      type: "number",
      attrPatterns: [
        /^poteaux_?utilises?/i,
        /^nb_?poteaux_?utilises?/i,
        /^total_?poteaux/i,
        /^combien_?de_?poteaux/i,
        /^poteaux$/i,
        /^field_poteauxutilises?/i,
        /^field_nbpoteauxutilises?/i,
        /^nb_?poteaux$/i,
      ],
      labelKeywords: [
        "combien de poteaux utilises",
        "combien de poteaux",
        "poteaux utilises",
        "nombre de poteaux utilises",
        "nb poteaux utilises",
        "total poteaux",
        "nombre de poteaux",
        "nb poteaux",
        "poteaux",
      ],
      valueExtractor: (data) => {
        // 1. Compter d'abord les poteaux physiques uniques dans points_gps
        const pts = safeGetArray(data?.points_gps);
        const polePts = pts.filter((p) => p && normalizeText(p.type).includes("poteau")).length;
        if (polePts > 0) return String(polePts);

        // 2. Vérifier les poteaux comptabilisés par propriétaire (SBEE + Petit Jean)
        const sbeePoles = Number(countSbeePoles(data)) || 0;
        const pjPoles = Number(countPetitJeanPoles(data)) || 0;
        const sum = sbeePoles + pjPoles;
        if (sum > 0) return String(sum);

        // 3. Fallback sur les compteurs (attention aux cumulées)
        let total = 0;
        if (data?.nb_poteaux_traverses) total += Number(data.nb_poteaux_traverses) || 0;
        if (data?.nb_poteaux_implantes) total += Number(data.nb_poteaux_implantes) || 0;
        if (total > 0) return String(total);
        if (data?.nb_poteaux_armes) return String(Number(data.nb_poteaux_armes) || 0);
        const fromMat = getMaterielQuantity(data, "poteau", "poteaux", "poteau_sbee", "poteau_pj");
        if (fromMat) return fromMat;
        const wa = safeGetArray(data?.whatsapp_photos);
        const waPoles = wa.filter((p) => {
          if (!p) return false;
          const desc = `${p.name || ""} ${p.nom || ""} ${p.type || ""} ${p.caption || ""}`.toLowerCase();
          return desc.includes("poteau");
        }).length;
        if (waPoles > 0) return String(waPoles);
        return "";
      },
    },

    poteaux_sbee_utilises: {
      key: "poteaux_sbee_utilises",
      step: 2,
      ftSource: "materiel_pose.poteau_sbee / points_gps",
      celprosTarget: "Poteaux SBEE utilisés",
      onAbsent: "leave_empty",
      negativeKeywords: ["petit","jean"],
      label: "Nombre de poteaux SBEE utilisés",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^poteaux_?sbee/i, /^sbee/i, /^poteaux_?sbee_?utilises?/i],
      labelKeywords: ["nombre de poteaux sbee utilises", "poteaux sbee utilises", "poteaux sbee", "sbee utilises", "sbee"],
      valueExtractor: (data) => countSbeePoles(data),
    },

    poteaux_petit_jean_utilises: {
      key: "poteaux_petit_jean_utilises",
      step: 2,
      ftSource: "materiel_pose.poteau_petit_jean / points_gps",
      celprosTarget: "Poteaux Petit Jean utilisés",
      onAbsent: "leave_empty",
      negativeKeywords: ["sbee"],
      label: "Nombre de poteaux Petit Jean utilisés",
      category: "Accessoires",
      type: "number",
      attrPatterns: [
        /^poteaux_?petit_?jean/i,
        /^petit_?jean/i,
        /^poteaux_?pj/i,
        /^pj_?utilises?/i,
      ],
      labelKeywords: [
        "nombre de poteaux petit jean utilises",
        "poteaux petit jean utilises",
        "nombre de poteaux petit jean",
        "poteaux petit jean",
        "petit jean utilises",
        "petit jean",
        "poteaux pj",
        "pj",
      ],
      valueExtractor: (data) => countPetitJeanPoles(data),
    },

    traverse_13t: {
      key: "traverse_13t",
      step: 2,
      ftSource: "materiel_pose.traverse_13t",
      celprosTarget: "Traverse 13T",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Traverse 13T",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^traverse_?13t/i, /^13t/i],
      labelKeywords: ["traverse 13t", "13t"],
      valueExtractor: (data) => getMaterielQuantity(data, "traverse_13t", "13t", "traverse13t"),
    },

    traverse_15t: {
      key: "traverse_15t",
      step: 2,
      ftSource: "materiel_pose.traverse_15t",
      celprosTarget: "Traverse 15T",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Traverse 15T",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^traverse_?15t/i, /^15t/i],
      labelKeywords: ["traverse 15t", "15t"],
      valueExtractor: (data) => getMaterielQuantity(data, "traverse_15t", "15t", "traverse15t"),
    },

    semelle: {
      key: "semelle",
      step: 2,
      ftSource: "materiel_pose.semelle",
      celprosTarget: "Semelle",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Semelle",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^semelle/i],
      labelKeywords: ["semelle", "semelle eq"],
      valueExtractor: (data) => getMaterielQuantity(data, "semelle_eq", "semelle", "semelles"),
    },

    boulons: {
      key: "boulons",
      step: 2,
      ftSource: "materiel_pose.boulons",
      celprosTarget: "Boulons",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Boulons",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^boulon/i],
      labelKeywords: ["boulons", "boulon"],
      valueExtractor: (data) => getMaterielQuantity(data, "boulons", "boulon"),
    },

    agrafe: {
      key: "agrafe",
      step: 2,
      ftSource: "materiel_pose.agrafe",
      celprosTarget: "Agrafes",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Agrafe",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^agrafe/i],
      labelKeywords: ["agrafe", "agrafes"],
      valueExtractor: (data) => getMaterielQuantity(data, "agrafe", "agrafes"),
    },

    // ----------------------------------------------------
    // 10. CelPros Étape 3 : Tests de Services & Débits
    // ----------------------------------------------------
    test_appel_sortant: {
      key: "test_appel_sortant",
      step: 3,
      ftSource: "service_teste",
      celprosTarget: "Appel sortant",
      onAbsent: "leave_empty",
      negativeKeywords: ["entrant"],
      label: "Appel sortant - Envoi numéro",
      category: "Tests",
      type: "boolean",
      attrPatterns: [/^appel_?sortant/i, /^sortant/i],
      labelKeywords: ["appel sortant - envoi numero", "appel sortant", "envoi numero"],
      valueExtractor: (data) => (data?.test_appel_sortant ? true : null),
    },

    test_appel_entrant: {
      key: "test_appel_entrant",
      step: 3,
      ftSource: "service_teste",
      celprosTarget: "Appel entrant",
      onAbsent: "leave_empty",
      negativeKeywords: ["sortant"],
      label: "Appel entrant - Affichage numéro",
      category: "Tests",
      type: "boolean",
      attrPatterns: [/^appel_?entrant/i, /^entrant/i],
      labelKeywords: ["appel entrant - affichage numero", "appel entrant", "affichage numero"],
      valueExtractor: (data) => (data?.test_appel_entrant ? true : null),
    },

    debit_montant: {
      key: "debit_montant",
      step: 3,
      ftSource: "debit_montant",
      celprosTarget: "Débit montant",
      onAbsent: "leave_empty",
      negativeKeywords: ["descendant"],
      label: "Débit montant",
      category: "Tests",
      type: "number",
      attrPatterns: [
        /^field_?debit_?montant/i,
        /^field_?montant/i,
        /^debit_?montant/i,
        /^montant/i,
        /^upload/i,
        /^debit_?up/i,
        /^wifi_?montant/i,
        /^debit_?wifi_?montant/i,
      ],
      labelKeywords: [
        "debit montant",
        "montant",
        "montant (mb/s)",
        "montante",
        "debit montant (mb/s)",
        "upload",
        "debit upload",
      ],
      valueExtractor: (data) => {
        const val =
          data?.debit_montant ??
          data?.debit_upload ??
          data?.debit_wifi_montant ??
          data?.materiel_pose?.debit_up ??
          data?.materiel_pose?.debit_montant;
        if (val === undefined || val === null || val === "") return "";
        return String(val).replace(",", ".").trim();
      },
    },

    debit_descendant: {
      key: "debit_descendant",
      step: 3,
      ftSource: "debit_descendant",
      celprosTarget: "Débit descendant",
      onAbsent: "leave_empty",
      negativeKeywords: ["montant"],
      label: "Débit descendant",
      category: "Tests",
      type: "number",
      attrPatterns: [
        /^field_?debit_?descendant/i,
        /^field_?descendant/i,
        /^debit_?descendant/i,
        /^descendant/i,
        /^download/i,
        /^debit_?down/i,
        /^wifi_?descendant/i,
        /^debit_?wifi_?descendant/i,
      ],
      labelKeywords: [
        "debit descendant",
        "descendant",
        "descendant (mb/s)",
        "descendante",
        "debit descendant (mb/s)",
        "download",
        "debit download",
        "reception",
      ],
      valueExtractor: (data) => {
        const val =
          data?.debit_descendant ??
          data?.debit_download ??
          data?.debit_wifi_descendant ??
          data?.materiel_pose?.debit_down ??
          data?.materiel_pose?.debit_descendant;
        if (val === undefined || val === null || val === "") return "";
        return String(val).replace(",", ".").trim();
      },
    },

    debit_ping: {
      key: "debit_ping",
      step: 3,
      ftSource: "debit_ping",
      celprosTarget: "Ping latence",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Ping",
      category: "Tests",
      type: "number",
      attrPatterns: [
        /^field_?ping/i,
        /^field_?latence/i,
        /^ping/i,
        /^latence/i,
        /^wifi_?ping/i,
        /^debit_?wifi_?ping/i,
      ],
      labelKeywords: [
        "ping",
        "ping (ms)",
        "latence",
        "latence (ms)",
        "temps de reponse",
      ],
      valueExtractor: (data) => {
        const val =
          data?.debit_ping ??
          data?.ping ??
          data?.debit_wifi_ping ??
          data?.materiel_pose?.ping;
        if (val === undefined || val === null || val === "") return "";
        return String(val).replace(",", ".").trim();
      },
    },

    // ----------------------------------------------------
    // 11. CelPros Étape 4 : Branchement & Rattachement
    // ----------------------------------------------------
    etiquetage: {
      key: "etiquetage",
      step: 4,
      ftSource: "travaux_conformes",
      celprosTarget: "Étiquetage câble et FAT",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Étiquetage",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^etiquetage/i],
      labelKeywords: ["etiquetage"],
      valueExtractor: (data) => {
        const v = data?.etiquetage ?? data?.travaux_conformes;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    nettoyage: {
      key: "nettoyage",
      step: 4,
      ftSource: "travail_propre",
      celprosTarget: "Nettoyage chantier",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Nettoyage",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^nettoyage/i],
      labelKeywords: ["nettoyage"],
      valueExtractor: (data) => {
        const v = data?.nettoyage ?? data?.travail_propre;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    depose: {
      key: "depose",
      step: 4,
      ftSource: "travaux_conformes",
      celprosTarget: "Dépose anciens matériels",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Dépose",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^depose/i],
      labelKeywords: ["depose"],
      valueExtractor: (data) => {
        const v = data?.depose ?? data?.travaux_conformes;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    colliers_serres: {
      key: "colliers_serres",
      step: 4,
      ftSource: "travaux_conformes",
      celprosTarget: "Colliers bien serrés",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Colliers serrés",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^colliers?_?serres?/i, /^field_colliers?_?serres?/i],
      labelKeywords: ["colliers serres", "collier serre"],
      valueExtractor: (data) => {
        const v = data?.colliers_serres ?? data?.travaux_conformes;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    fat_normalise: {
      key: "fat_normalise",
      step: 4,
      ftSource: "travaux_conformes",
      celprosTarget: "FAT normalisé",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "FAT normalisé",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^fat_?normalise/i],
      labelKeywords: ["fat normalise"],
      valueExtractor: (data) => {
        const v = data?.fat_normalise ?? data?.travaux_conformes;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    tutorat: {
      key: "tutorat",
      step: 4,
      ftSource: "travaux_conformes",
      celprosTarget: "Tutorat client réalisé",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Tutorat",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^tutorat/i],
      labelKeywords: ["tutorat"],
      valueExtractor: (data) => {
        const v = data?.tutorat ?? data?.travaux_conformes;
        if (v === false || v === 0 || v === "0" || v === "false") return false;
        return true;
      },
    },

    plaque: {
      key: "plaque",
      step: 4,
      ftSource: "fat_ref",
      celprosTarget: "Plaque FAT",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Plaque",
      category: "Réseau",
      type: "text",
      attrPatterns: [/^plaque/i],
      labelKeywords: ["plaque"],
      valueExtractor: (data) => (data?.plaque ? String(data.plaque).trim() : ""),
    },

    service_internet: {
      key: "service_internet",
      step: 3,
      ftSource: "service_fonctionne",
      celprosTarget: "Service Internet fonctionnel",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Internet",
      category: "Services",
      type: "boolean",
      attrPatterns: [/^service_?internet/i, /^internet$/i],
      labelKeywords: ["internet"],
      valueExtractor: (data) => (data?.service_internet ? true : (data?.service_fonctionne ? true : null)),
    },

    service_voip: {
      key: "service_voip",
      step: 3,
      ftSource: "service_fonctionne",
      celprosTarget: "Service Téléphonie / VoIP fonctionnel",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "VOIP",
      category: "Services",
      type: "boolean",
      attrPatterns: [/^service_?voip/i, /^voip$/i],
      labelKeywords: ["voip"],
      valueExtractor: (data) => (data?.service_voip ? true : null),
    },

    // ----------------------------------------------------
    // 12. CelPros Étape 5 : Signature du rapport
    // ----------------------------------------------------
    confirme_signature_rapport: {
      key: "confirme_signature_rapport",
      step: 5,
      ftSource: "signature_client",
      celprosTarget: "Confirmation signature rapport",
      onAbsent: "leave_empty",
      negativeKeywords: [],
      label: "Je confirme la signature du rapport",
      category: "Signature",
      type: "boolean",
      attrPatterns: [/^confirme_?signature/i, /^signature_?rapport/i],
      labelKeywords: ["je confirme la signature du rapport", "confirme signature", "signature du rapport"],
      valueExtractor: (data) => (data?.confirme_signature_rapport ? true : (data?.signature_client ? true : null)),
    },
  };

  // Compatibilité et helpers pour itération et accès par tableau / recherche
  for (const def of Object.values(FIELD_DEFINITIONS)) {
    if (!def.extractor && def.valueExtractor) {
      def.extractor = def.valueExtractor;
    }
  }

  Object.defineProperty(FIELD_DEFINITIONS, "find", {
    value: function (predicate) {
      return Object.values(this).find(predicate);
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(FIELD_DEFINITIONS, "filter", {
    value: function (predicate) {
      return Object.values(this).filter(predicate);
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });

  FIELD_DEFINITIONS[Symbol.iterator] = function* () {
    yield* Object.values(this);
  };

  // Inspection des attributs d'un élément HTML
  function getElementAttributeCandidates(element) {
    if (!element) return [];
    const candidates = [];
    if (element.id) candidates.push(element.id);
    if (element.name) candidates.push(element.name);

    // Attributs fréquents dans JHipster / Angular / React / Vue
    const formControlName = element.getAttribute("formcontrolname") || element.getAttribute("formControlName");
    if (formControlName) candidates.push(formControlName);

    const ngModel = element.getAttribute("ng-model") || element.getAttribute("ngModel");
    if (ngModel) candidates.push(ngModel);

    const dataField = element.getAttribute("data-field");
    if (dataField) candidates.push(dataField);

    const dataTestId = element.getAttribute("data-testid") || element.getAttribute("data-test");
    if (dataTestId) candidates.push(dataTestId);

    const placeholder = element.getAttribute("placeholder");
    if (placeholder) candidates.push(placeholder);

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) candidates.push(ariaLabel);

    return candidates;
  }

  // Détection du libellé direct et immédiat associé à l'élément (sans englober les ancêtres)
  function getElementDirectLabel(element) {
    if (!element) return "";
    let texts = [];
    const doc = element.ownerDocument || (typeof document !== "undefined" ? document : null);

    // 0. Propriété standard HTML5 element.labels
    if (element.labels && element.labels.length > 0) {
      for (const l of element.labels) {
        if (l && l.textContent) texts.push(l.textContent);
      }
    }

    // 1. Balise <label for="elementId">
    if (element.id && doc) {
      const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(element.id) : element.id;
      try {
        const explicitLabel = doc.querySelector(`label[for="${escapedId}"]`);
        if (explicitLabel) texts.push(explicitLabel.textContent || "");
      } catch {}
    }

    // 2. Parent <label> enveloppant
    const parentLabel = element.closest ? element.closest("label") : null;
    if (parentLabel) texts.push(parentLabel.textContent || "");

    // 3. Frère précédent direct (previousElementSibling) qui est un label ou titre
    if (element.previousElementSibling) {
      const tag = element.previousElementSibling.tagName?.toLowerCase();
      if (tag === "label" || tag === "mat-label" || tag === "span" || tag === "strong" || tag === "p") {
        texts.push(element.previousElementSibling.textContent || "");
      }
    }

    // 4. Frère précédent du parent direct (ex: <div class="input-group">)
    if (element.parentElement && element.parentElement.previousElementSibling) {
      const pTag = element.parentElement.previousElementSibling.tagName?.toLowerCase();
      if (pTag === "label" || pTag === "mat-label" || pTag === "span" || pTag === "strong") {
        texts.push(element.parentElement.previousElementSibling.textContent || "");
      }
    }

    // 5. Placeholder ou title ou aria-label
    if (element.placeholder) texts.push(element.placeholder);
    if (element.title) texts.push(element.title);
    const ariaLabel = element.getAttribute ? element.getAttribute("aria-label") : null;
    if (ariaLabel) texts.push(ariaLabel);

    return texts.join(" ").trim();
  }

  // Détection du texte de libellé associé à l'élément (compatible HTML5, Bootstrap, JHipster et Angular Material)
  function getElementLabelText(element) {
    if (!element) return "";
    let texts = [];
    const doc = element.ownerDocument || (typeof document !== "undefined" ? document : null);

    // 0. Propriété standard HTML5 element.labels (NodeList de tous les <label> associés)
    if (element.labels && element.labels.length > 0) {
      for (const l of element.labels) {
        if (l && l.textContent) texts.push(l.textContent);
      }
    }

    // 1. Balise <label for="elementId">
    if (element.id && doc) {
      const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(element.id) : element.id;
      try {
        const explicitLabel = doc.querySelector(`label[for="${escapedId}"]`);
        if (explicitLabel) texts.push(explicitLabel.textContent || "");
      } catch {}
    }

    // 1bis. Attributs aria-labelledby / aria-describedby
    if (element.getAttribute && doc) {
      const ariaLabelledBy = element.getAttribute("aria-labelledby") || element.getAttribute("aria-describedby");
      if (ariaLabelledBy) {
        for (const idPart of ariaLabelledBy.trim().split(/\s+/)) {
          try {
            const lEl = doc.getElementById(idPart);
            if (lEl && lEl.textContent) texts.push(lEl.textContent);
          } catch {}
        }
      }
    }

    // 2. Parent <label> enveloppant
    const parentLabel = element.closest ? element.closest("label") : null;
    if (parentLabel) texts.push(parentLabel.textContent || "");

    // 3. Parent fieldset avec legend (pour groupes de radio/checkbox)
    const fieldset = element.closest ? element.closest("fieldset") : null;
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) texts.push(legend.textContent || "");
    }

    // 4. Frère précédent (previousElementSibling) qui est un label, mat-label ou span
    if (element.previousElementSibling) {
      const tag = element.previousElementSibling.tagName?.toLowerCase();
      if (tag === "label" || tag === "mat-label" || tag === "span" || tag === "strong" || tag === "p") {
        texts.push(element.previousElementSibling.textContent || "");
      }
    }

    // 4bis. Frère précédent du parent direct (pour structures encapsulées type div.input-group)
    if (element.parentElement && element.parentElement.previousElementSibling) {
      const pTag = element.parentElement.previousElementSibling.tagName?.toLowerCase();
      if (pTag === "label" || pTag === "mat-label" || pTag === "span" || pTag === "strong" || pTag === "h4" || pTag === "h5") {
        texts.push(element.parentElement.previousElementSibling.textContent || "");
      }
    }

    // 5. Conteneur de champ (ex: mat-form-field, .form-group, .form-field, .mb-3)
    // Note : on n'englobe JAMAIS .row ou .col qui peuvent contenir plusieurs champs distincts
    if (element.closest) {
      const group = element.closest(
        "mat-form-field, [class*='mat-form-field'], [class*='mat-mdc-form-field'], .form-group, .form-field, .mb-3, [class*='field'], [class*='group']"
      );
      if (group) {
        const groupLabel = group.querySelector(
          "mat-label, legend, label, .form-label, [class*='floating-label'], [class*='form-field-label'], [class*='label'], span.title, dt"
        );
        if (groupLabel && groupLabel !== element && groupLabel !== parentLabel) {
          texts.push(groupLabel.textContent || "");
        }
      }
    }

    // 6. Placeholder ou title ou aria-label
    if (element.placeholder) texts.push(element.placeholder);
    if (element.title) texts.push(element.title);
    const ariaLabel = element.getAttribute ? element.getAttribute("aria-label") : null;
    if (ariaLabel) texts.push(ariaLabel);

    return texts.join(" ").trim();
  }

  // Algorithme d'appariement d'un élément DOM vers une clé de définition de champ
  // Supporte également la correspondance dynamique pour tout matériau réel présent dans data.materiel_pose
  function matchElementToField(element, interventionData = null) {
    if (!element) return null;

    const attributes = getElementAttributeCandidates(element);
    const labelText = getElementLabelText(element);
    const directLabel = getElementDirectLabel(element);
    const normalizedLabel = normalizeText(labelText);
    const normDirectLabel = normalizeText(directLabel);
    const normAttrs = attributes.map((a) => normalizeText(a));

    let bestMatch = null;
    let highestScore = 0;

    for (const [, def] of Object.entries(FIELD_DEFINITIONS)) {
      // Disqualification par mots-clés négatifs :
      // On ne disqualifie JAMAIS un champ si son label direct ou son attribut ID/Name
      // correspond expressément et positivement à sa cible (ex: directLabel contient "fat" pour puissance_fat_dbm)
      if (def.negativeKeywords && def.negativeKeywords.length > 0) {
        // Un champ n'est jamais disqualifié s'il correspond positivement par son label direct, ses attributs ou ses mots-clés forts
        const hasDirectPositiveMatch = def.labelKeywords.some((kw) => {
          const nKw = normalizeText(kw);
          if (nKw.length < 3) return false;
          if (normDirectLabel.includes(nKw) || normAttrs.some((a) => a.includes(nKw))) return true;
          // Cas spécifique "linéaire" : si le libellé contient explicitement le mot-clé principal
          if (def.key === "lineaire_m" && (normalizedLabel.includes("lineaire") || normalizedLabel.includes("metrage"))) return true;
          return normalizedLabel.includes(nKw);
        });

        if (!hasDirectPositiveMatch) {
          const isDisqualified = def.negativeKeywords.some((neg) => {
            const normNeg = normalizeText(neg);
            return normNeg && (normalizedLabel.includes(normNeg) || normAttrs.some((a) => a.includes(normNeg)));
          });
          if (isDisqualified) continue;
        }
      }

      let score = 0;

      // Correspondance par motif d'attributs (ID, Name, formControlName)
      for (const attr of attributes) {
        for (const pattern of def.attrPatterns) {
          if (pattern.test(attr)) {
            score = Math.max(score, 100);
            break;
          }
        }
        if (score === 100) break;

        // Sous-correspondance normalisée dans l'attribut
        const normAttr = normalizeText(attr);
        for (const kw of def.labelKeywords) {
          const normKw = normalizeText(kw);
          if (normAttr === normKw) {
            score = Math.max(score, 90);
          } else if (normAttr.includes(normKw) && normKw.length >= 4) {
            score = Math.max(score, 75);
          }
        }
      }

      // Correspondance par mot-clé dans le libellé visible
      if (normalizedLabel) {
        for (const kw of def.labelKeywords) {
          const normKw = normalizeText(kw);
          if (normalizedLabel === normKw) {
            score = Math.max(score, 95);
          } else if (normalizedLabel.includes(normKw)) {
            const bonus = Math.min(20, normKw.length);
            score = Math.max(score, 70 + bonus);
          }
        }
      }

      if (score > highestScore && score >= 70) {
        highestScore = score;
        bestMatch = { definition: def, score, matchedBy: highestScore >= 90 ? "attribute" : "label" };
      }
    }

    // Correspondance dynamique de secours pour tout matériau personnalisé enregistré dans FibreTrack
    const dynMp = safeGetObject(interventionData?.materiel_pose);
    if (!bestMatch && Object.keys(dynMp).length > 0) {
      const RESERVED_MATERIEL_KEYS = new Set([
        "ont", "pto", "fat", "box", "sn", "mac", "lineaire", "poteau", "poteaux",
        "sbee", "petitjean", "pj", "debit", "ping", "gps", "lat", "lng", "client",
        "telephone", "contact", "date", "heure", "statut", "etat"
      ]);
      for (const [rawKey, rawVal] of Object.entries(dynMp)) {
        const numVal = Number(rawVal);
        if (isNaN(numVal) || numVal <= 0) continue;
        const normMat = normalizeText(rawKey);
        if (!normMat || normMat.length < 3 || RESERVED_MATERIEL_KEYS.has(normMat)) continue;

        let matched = false;
        for (const attr of attributes) {
          const normAttr = normalizeText(attr);
          if (normAttr === normMat || normAttr.includes(normMat) || normMat.includes(normAttr)) {
            matched = true;
            break;
          }
        }
        if (!matched && normalizedLabel) {
          if (normalizedLabel === normMat || normalizedLabel.includes(normMat) || normMat.includes(normalizedLabel)) {
            matched = true;
          }
        }

        if (matched) {
          return {
            definition: {
              key: `dynamic_materiel_${normMat}`,
              label: rawKey,
              category: "Accessoires",
              type: "number",
              valueExtractor: () => String(numVal),
            },
            score: 80,
            matchedBy: "dynamic_materiel",
          };
        }
      }
    }

    return bestMatch;
  }

  // Exportation publique
  return {
    FIELD_DEFINITIONS,
    CELPROS_PHOTO_SLOTS,
    normalizeText,
    safeGetArray,
    safeGetObject,
    normalizeInterventionData,
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
  };
});
