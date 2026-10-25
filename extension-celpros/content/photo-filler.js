// Photo Filler Engine pour CelPros (Celtiis) et FAT Automation
// Injecte automatiquement les vraies photos d'intervention existantes (points GPS, photos WhatsApp, étiquette ONT, photomètre, contrat)
// dans les zones d'upload de la plateforme CelPros.
// RÈGLE ABSOLUE : N'injecter QUE de vraies photos existantes dans l'intervention réelle.
// Ne JAMAIS injecter de fausses photos, ni réutiliser aveuglément la même photo par index arbitraire.

(function (root, factory) {
  const getFieldMapping = () => {
    if (typeof root !== "undefined" && root && root.FieldMapping) return root.FieldMapping;
    if (typeof globalThis !== "undefined" && globalThis.FieldMapping) return globalThis.FieldMapping;
    try {
      return require("./field-mapping.js");
    } catch {
      return null;
    }
  };
  const exports = factory(getFieldMapping());
  if (typeof module === "object" && module && module.exports) {
    module.exports = exports;
  }
  if (typeof define === "function" && define.amd) {
    define([], () => exports);
  }
  if (root) {
    root.PhotoFiller = exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (FieldMapping) {
  "use strict";

  function normalizeText(str) {
    if (!str || typeof str !== "string") return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  // Convertit une data URL base64 en objet File standard
  function dataUrlToFile(dataUrl, filename = "photo.jpg") {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    try {
      const arr = dataUrl.split(",");
      if (arr.length < 2) return null;
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    } catch (err) {
      console.warn("[PhotoFiller] Erreur conversion dataUrlToFile:", err);
      return null;
    }
  }

  const FILE_CACHE_MAX = 40;
  const srcFileCache = new Map();

  function getCachedFile(cacheKey) {
    if (!srcFileCache.has(cacheKey)) return null;
    const file = srcFileCache.get(cacheKey);
    srcFileCache.delete(cacheKey);
    srcFileCache.set(cacheKey, file);
    return file;
  }

  function setCachedFile(cacheKey, file) {
    if (!cacheKey || !file) return;
    if (srcFileCache.has(cacheKey)) {
      srcFileCache.delete(cacheKey);
    } else if (srcFileCache.size >= FILE_CACHE_MAX) {
      const oldest = srcFileCache.keys().next().value;
      if (oldest !== undefined) srcFileCache.delete(oldest);
    }
    srcFileCache.set(cacheKey, file);
  }

  // Convertit une URL HTTP ou dataURL en File (avec contournement CSP via Service Worker et cache LRU)
  async function srcToFile(src, filename = "photo.jpg") {
    if (!src || typeof src !== "string") return null;
    const cacheKey = `${filename}::${src.length}::${src.slice(0, 64)}::${src.slice(-64)}`;
    const cached = getCachedFile(cacheKey);
    if (cached) return cached;

    if (src.startsWith("data:")) {
      const f = dataUrlToFile(src, filename);
      if (f) setCachedFile(cacheKey, f);
      return f;
    }

    // 1. Passage par le service worker en priorité pour contourner CORS & CSP sur CelPros
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "FETCH_MEDIA", payload: { url: src } }, (res) => {
            if (chrome.runtime.lastError) return resolve(null);
            resolve(res);
          });
        });
        if (resp && resp.ok && resp.dataUrl) {
          const f = dataUrlToFile(resp.dataUrl, filename);
          if (f) setCachedFile(cacheKey, f);
          return f;
        }
      } catch (swErr) {
        console.warn("[PhotoFiller] Délégation background FETCH_MEDIA échouée:", swErr);
      }
    }

    // 2. Fallback fetch direct (standalone mock ou tests Node.js)
    let url = src;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://fibretrack.mantota.com/api/${url.replace(/^\/+/, "")}`;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const f = new File([blob], filename, { type: blob.type || "image/jpeg" });
      setCachedFile(cacheKey, f);
      return f;
    } catch (err) {
      console.warn("[PhotoFiller] Erreur fetch srcToFile:", err);
      return null;
    }
  }

  // Helper pour extraire une description complète d'une photo de FibreTrack (name, label, type, etc.)
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
  // Les photos additionnelles servent à d'autres fins internes et ne doivent JAMAIS être poussées vers CelPros.
  function isExcludedFromCelpros(p) {
    if (!p) return true;
    if (p.additionnelle === true || p.is_additionnelle === true || p.exclude_celpros === true) return true;
    if (p.slot === "additionnelle" || p.type === "additionnelle" || p.category === "additionnelle") return true;
    const desc = getPhotoDescription(p);
    if (desc.includes("additionnelle")) return true;
    return false;
  }

  function getEligibleWhatsappPhotos(data) {
    let wa = data?.whatsapp_photos;
    if (typeof wa === "string") {
      try {
        wa = JSON.parse(wa);
      } catch {
        wa = [];
      }
    }
    if (!Array.isArray(wa)) wa = [];
    return wa.filter((p) => !isExcludedFromCelpros(p));
  }

  // Règles de reconnaissance des zones d'upload CelPros
  // Chaque règle n'extrait la photo QUE si elle existe réellement dans l'intervention FibreTrack.
  // Isolation stricte : aucune permutation de photo entre catégories.
  const PHOTO_SLOT_RULES = [
    {
      key: "cable_interne",
      label: "Entrée câble interne",
      celprosLabel: "Image du câble interne",
      keywords: [
        "image du cable interne",
        "image entree cable interne",
        "entree cable interne",
        "image cable interne",
        "cable interne",
        "penetration cable interne",
      ],
      attrPatterns: [
        /^field_?(photo_?)?cable_?interne/i,
        /^photo_?cable_?interne/i,
        /^image_?cable_?interne/i,
        /^cable_?interne/i,
        /^entree_?cable_?interne/i,
      ],
      negativeKeywords: ["externe", "fat", "mesure", "scan", "debit", "wifi", "combine", "contrat", "pto"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => getPhotoSource(p) && (p.slot === "cable_interne" || p.type === "cable_interne"));
        if (match) return { src: getPhotoSource(match), name: "cable_interne.jpg", slot: "cable_interne" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(cable[-_ ]*interne|entr[eé]e[-_ ]*c[aâ]ble[-_ ]*interne)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "cable_interne.jpg", slot: "cable_interne" };
        return null;
      },
    },
    {
      key: "cable_externe",
      label: "Entrée câble externe",
      celprosLabel: "Image du câble externe",
      keywords: [
        "image du cable externe",
        "image entree cable externe",
        "entree cable externe",
        "image cable externe",
        "cable externe",
        "facade cable externe",
      ],
      attrPatterns: [
        /^field_?(photo_?)?cable_?externe/i,
        /^photo_?cable_?externe/i,
        /^image_?cable_?externe/i,
        /^cable_?externe/i,
        /^entree_?cable_?externe/i,
      ],
      negativeKeywords: ["interne", "fat", "mesure", "scan", "debit", "wifi", "combine", "contrat", "pto"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => getPhotoSource(p) && (p.slot === "cable_externe" || p.type === "cable_externe"));
        if (match) return { src: getPhotoSource(match), name: "cable_externe.jpg", slot: "cable_externe" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(cable[-_ ]*externe|entr[eé]e[-_ ]*c[aâ]ble[-_ ]*externe)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "cable_externe.jpg", slot: "cable_externe" };
        return null;
      },
    },
    {
      key: "autre_poteau",
      label: "Autre poteau",
      celprosLabel: "Autre poteau",
      keywords: [
        "autre poteau",
        "image autre poteau",
        "photo autre poteau",
        "autre support",
        "materiel poteau",
        "materiel poto",
      ],
      attrPatterns: [
        /^field_?(photo_?)?autre_?poteau/i,
        /^photo_?autre_?poteau/i,
        /^image_?autre_?poteau/i,
        /^autre_?poteau/i,
        /^autre_?support/i,
      ],
      negativeKeywords: ["cable", "interne", "externe", "fat", "pto", "mesure", "debit", "wifi", "combine", "contrat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau"));
        if (direct) return { src: getPhotoSource(direct), name: "autre_poteau.jpg", slot: "autre_poteau" };
        const legacy = wa.find((p) => {
          if (!getPhotoSource(p) || !p.name) return false;
          return /^(autre[-_ ]*poteau|autre[-_ ]*support)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim());
        });
        if (legacy) return { src: getPhotoSource(legacy), name: "autre_poteau.jpg", slot: "autre_poteau" };
        return null;
      },
    },
    {
      key: "fat",
      label: "Boîtier FAT",
      celprosLabel: "Image FAT",
      keywords: [
        "image boitier fat",
        "photo boitier fat",
        "boitier fat",
        "image fat",
        "photo fat",
        "pbo",
      ],
      attrPatterns: [
        /^field_?(photo_?)?fat$/i,
        /^photo_?fat$/i,
        /^image_?fat$/i,
        /^boitier_?fat$/i,
      ],
      negativeKeywords: ["scan", "mesure", "fibre", "puissance", "photometre", "cable", "interne", "externe", "pto", "wifi", "debit"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "fat" || p.type === "fat"));
        if (direct) return { src: getPhotoSource(direct), name: "fat.jpg", slot: "fat" };
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const fatPt = pts.find((p) => p && normalizeText(p.type) === "fat" && getPhotoSource(p.photo));
        if (fatPt) return { src: getPhotoSource(fatPt.photo), name: "fat_raccordement.jpg", slot: "fat" };
        const legacy = wa.find((p) => {
          if (!getPhotoSource(p) || !p.name) return false;
          return /^(fat|boitier[-_ ]*fat)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()) &&
            !/mesure|fibre|scan|cable|puissance/i.test(p.name || "") &&
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
      keywords: [
        "image scan fat",
        "scan fat",
        "code barre fat",
        "code barres fat",
        "etiquette fat",
        "barcode fat",
      ],
      attrPatterns: [
        /^field_?(photo_?)?scan_?fat/i,
        /^photo_?scan_?fat/i,
        /^image_?scan_?fat/i,
        /^scan_?fat/i,
        /^code_?barre_?fat/i,
      ],
      negativeKeywords: ["mesure", "fibre", "puissance", "photometre", "cable", "pto"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "scan_fat" || p.type === "scan_fat"));
        if (direct) return { src: getPhotoSource(direct), name: "scan_fat.jpg", slot: "scan_fat" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(image[-_ ]*scan[-_ ]*fat|scan[-_ ]*fat|code[-_ ]*barres?[-_ ]*fat)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "scan_fat.jpg", slot: "scan_fat" };
        return null;
      },
    },
    {
      key: "fibre_fat",
      label: "Fibre au FAT",
      celprosLabel: "Image fibre au FAT",
      keywords: [
        "image fibre au fat",
        "image fibre fat",
        "fibre au fat",
        "fibre fat",
        "raccordement fibre fat",
      ],
      attrPatterns: [
        /^field_?(photo_?)?fibre_?fat/i,
        /^photo_?fibre_?fat/i,
        /^image_?fibre_?fat/i,
        /^fibre_?fat/i,
        /^fibre_?au_?fat/i,
      ],
      negativeKeywords: ["scan", "mesure", "puissance", "photometre", "cable", "pto"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "fibre_fat" || p.type === "fibre_fat"));
        if (direct) return { src: getPhotoSource(direct), name: "fibre_fat.jpg", slot: "fibre_fat" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(fibre[-_ ]*fat|fibre[-_ ]*au[-_ ]*fat)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "fibre_fat.jpg", slot: "fibre_fat" };
        return null;
      },
    },
    {
      key: "mesure_fat",
      label: "Mesure puissance au FAT",
      celprosLabel: "Image mesure au FAT",
      keywords: [
        "image mesure au fat",
        "image mesure fat",
        "mesure au fat",
        "mesure fat",
        "photometre fat",
        "puissance fat",
        "valeur au fat",
      ],
      attrPatterns: [
        /^field_?(photo_?)?mesure_?fat/i,
        /^photo_?mesure_?fat/i,
        /^image_?mesure_?fat/i,
        /^mesure_?fat/i,
        /^puissance_?fat/i,
      ],
      negativeKeywords: ["pto", "scan", "cable", "wifi", "debit", "combine"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "mesure_fat" || p.type === "mesure_fat"));
        if (direct) return { src: getPhotoSource(direct), name: "mesure_fat.jpg", slot: "mesure_fat" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(mesure[-_ ]*fat|puissance[-_ ]*fat|photometre[-_ ]*fat)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()) && !/pto/i.test(p.name || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "mesure_fat.jpg", slot: "mesure_fat" };
        return null;
      },
    },
    {
      key: "mesure_pto",
      label: "Mesure puissance au PTO",
      celprosLabel: "Image mesure au PTO",
      keywords: [
        "image mesure au pto",
        "image mesure pto",
        "mesure au pto",
        "mesure pto",
        "photometre pto",
        "puissance pto",
        "valeur au pto",
      ],
      attrPatterns: [
        /^field_?(photo_?)?mesure_?pto/i,
        /^photo_?mesure_?pto/i,
        /^image_?mesure_?pto/i,
        /^mesure_?pto/i,
        /^puissance_?pto/i,
      ],
      negativeKeywords: ["fat", "scan", "cable", "wifi", "debit", "combine"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "mesure_pto" || p.type === "mesure_pto"));
        if (direct) return { src: getPhotoSource(direct), name: "mesure_pto.jpg", slot: "mesure_pto" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(mesure[-_ ]*pto|puissance[-_ ]*pto|photometre[-_ ]*pto)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()) && !/fat/i.test(p.name || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "mesure_pto.jpg", slot: "mesure_pto" };
        return null;
      },
    },
    {
      key: "ont_sn",
      label: "Photo numéro de série",
      celprosLabel: "Photo numéro de série",
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
      negativeKeywords: ["fat", "pto", "mesure", "cable", "debit", "wifi", "combine", "contrat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "ont_sn" || p.type === "ont_sn"));
        if (direct) return { src: getPhotoSource(direct), name: "ont_sn.jpg", slot: "ont_sn" };
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const abonne = pts.find((p) => p && (normalizeText(p.type).includes("abonne") || normalizeText(p.type).includes("ont")) && getPhotoSource(p.photo));
        if (abonne) return { src: getPhotoSource(abonne.photo), name: "ont_sn.jpg", slot: "ont_sn" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(ont|box|sn[-_ ]*ont|etiquette[-_ ]*ont|photo[-_ ]*numero[-_ ]*de[-_ ]*serie|numero[-_ ]*de[-_ ]*serie)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "ont_sn.jpg", slot: "ont_sn" };
        return null;
      },
    },
    {
      key: "debit_cable",
      label: "Test débit câble RJ45",
      celprosLabel: "Image test débit câble",
      keywords: [
        "image test debit cable",
        "test debit cable",
        "debit cable",
        "speedtest cable",
        "test debit rj45",
        "debit rj45",
        "test debit ethernet",
      ],
      attrPatterns: [
        /^field_?(photo_?)?debit_?cable/i,
        /^photo_?debit_?cable/i,
        /^image_?debit_?cable/i,
        /^debit_?cable/i,
        /^test_?debit_?cable/i,
      ],
      negativeKeywords: ["wifi", "fat", "pto", "mesure", "combine", "contrat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "debit_cable" || p.type === "debit_cable"));
        if (direct) return { src: getPhotoSource(direct), name: "test_debit_cable.jpg", slot: "debit_cable" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(debit[-_ ]*cable|test[-_ ]*debit[-_ ]*cable|speedtest[-_ ]*cable)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()) && !/wifi/i.test(p.name || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "test_debit_cable.jpg", slot: "debit_cable" };
        return null;
      },
    },
    {
      key: "debit_wifi",
      label: "Test débit Wi-Fi",
      celprosLabel: "Image test débit Wifi",
      keywords: [
        "image test debit wifi",
        "test debit wifi",
        "debit wifi",
        "speedtest wifi",
        "test wifi",
      ],
      attrPatterns: [
        /^field_?(photo_?)?debit_?wifi/i,
        /^photo_?debit_?wifi/i,
        /^image_?debit_?wifi/i,
        /^debit_?wifi/i,
        /^test_?debit_?wifi/i,
      ],
      negativeKeywords: ["cable", "rj45", "ethernet", "fat", "pto", "mesure", "combine", "contrat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "debit_wifi" || p.type === "debit_wifi"));
        if (direct) return { src: getPhotoSource(direct), name: "test_debit_wifi.jpg", slot: "debit_wifi" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(debit[-_ ]*wifi|test[-_ ]*debit[-_ ]*wifi|speedtest[-_ ]*wifi)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()) && !/cable/i.test(p.name || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "test_debit_wifi.jpg", slot: "debit_wifi" };
        return null;
      },
    },
    {
      key: "combine",
      label: "Combiné téléphonique",
      celprosLabel: "Image combiné",
      ignored: true,
      keywords: [
        "image combine",
        "photo combine",
        "combine",
        "telephone fixe",
      ],
      attrPatterns: [
        /^field_?(photo_?)?combine$/i,
        /^photo_?combine$/i,
        /^image_?combine$/i,
        /^combine$/i,
      ],
      negativeKeywords: ["fiche", "fat", "pto", "mesure", "debit", "wifi", "contrat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "combine" || p.type === "combine"));
        if (direct) return { src: getPhotoSource(direct), name: "combine.jpg", slot: "combine" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(combine|photo[-_ ]*combine|telephone)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()) && !/fiche/i.test(p.name || ""));
        if (legacy) return { src: getPhotoSource(legacy), name: "combine.jpg", slot: "combine" };
        return null;
      },
    },
    {
      key: "fiche_combine",
      label: "Fiche combiné",
      celprosLabel: "Image fiche combiné",
      ignored: true,
      keywords: [
        "image fiche combine",
        "photo fiche combine",
        "fiche combine",
        "prise combine",
        "fiche raccordement",
      ],
      attrPatterns: [
        /^field_?(photo_?)?fiche_?combine/i,
        /^photo_?fiche_?combine/i,
        /^image_?fiche_?combine/i,
        /^fiche_?combine/i,
      ],
      negativeKeywords: ["fat", "pto", "mesure", "debit", "wifi", "contrat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "fiche_combine" || p.type === "fiche_combine"));
        if (direct) return { src: getPhotoSource(direct), name: "fiche_combine.jpg", slot: "fiche_combine" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(fiche[-_ ]*combine|prise[-_ ]*combine|fiche[-_ ]*raccordement)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "fiche_combine.jpg", slot: "fiche_combine" };
        return null;
      },
    },
    {
      key: "contrat_client",
      label: "Photo contrat client",
      celprosLabel: "Photo du contrat client",
      keywords: [
        "photo du contrat client",
        "photo contrat client",
        "photo contrat",
        "contrat client",
        "signature du rapport",
        "photo fiche d'intervention signee",
        "contrat",
      ],
      attrPatterns: [
        /^field_?(photo_?)?contrat/i,
        /^photo_?contrat/i,
        /^image_?contrat/i,
        /^contrat_?client/i,
        /^signature_?rapport/i,
      ],
      negativeKeywords: ["fat", "pto", "mesure", "debit", "wifi", "combine", "cable"],
      getPhoto: (data) => {
        if (data?.signature_client && typeof data.signature_client === "string" && data.signature_client.trim().length > 100) {
          return { src: data.signature_client, name: "signature_client.png", slot: "contrat_client" };
        }
        const wa = getEligibleWhatsappPhotos(data);
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "contrat_client" || p.slot === "contrat_client_1" || p.type === "contrat_client"));
        if (direct) return { src: getPhotoSource(direct), name: "contrat_signe.jpg", slot: direct.slot || "contrat_client" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(contrat|signature|contrat[-_ ]*client)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "contrat_signe.jpg", slot: "contrat_client" };
        return null;
      },
    },
    {
      key: "contrat_client_2",
      label: "Photo contrat client (2)",
      celprosLabel: "Photo du 2ème contrat client",
      keywords: [
        "contrat 2",
        "second contrat",
        "contrat client 2",
        "2eme contrat",
        "deuxieme contrat",
      ],
      attrPatterns: [
        /^field_?(photo_?)?contrat_?2/i,
        /^photo_?contrat_?2/i,
        /^contrat_?client_?2/i,
      ],
      negativeKeywords: ["fat", "pto", "mesure", "debit", "wifi", "combine", "cable"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const c2 = wa.find((p) => getPhotoSource(p) && (p.slot === "contrat_client_2" || p.name?.includes("contrat_client_2") || p.label?.includes("(2)")));
        if (c2) return { src: getPhotoSource(c2), name: "contrat_signe_2.jpg", slot: "contrat_client_2" };
        const allContrats = wa.filter((p) => getPhotoSource(p) && (p.slot?.startsWith("contrat_client") || p.type === "contrat_client" || /contrat/i.test(p.name || "")));
        if (allContrats.length >= 2) {
          return { src: getPhotoSource(allContrats[1]), name: "contrat_signe_2.jpg", slot: "contrat_client_2" };
        }
        return null;
      },
    },
  ];

  // Synchronisation avec les métadonnées centralisées de FieldMapping (étape, source, onAbsent, catégorie)
  if (FieldMapping && Array.isArray(FieldMapping.CELPROS_PHOTO_SLOTS)) {
    for (const rule of PHOTO_SLOT_RULES) {
      const spec = FieldMapping.CELPROS_PHOTO_SLOTS.find((s) => s.key === rule.key);
      if (spec) {
        if (!rule.step) rule.step = spec.step;
        if (!rule.category) rule.category = spec.category;
        if (!rule.ftSource) rule.ftSource = spec.ftSource;
        if (!rule.onAbsent) rule.onAbsent = spec.onAbsent;
        if (!rule.celprosLabel) rule.celprosLabel = spec.celprosLabel;
      }
    }
  }

  // Trouve l'élément input[type="file"] associé à un conteneur d'upload
  function findFileInputForContainer(container) {
    if (!container) return null;
    if (container.tagName?.toLowerCase() === "input" && container.type === "file") {
      return container;
    }
    // 1. input à l'intérieur
    const inner = container.querySelector('input[type="file"]');
    if (inner) return inner;

    // 2. input frère ou voisin
    if (container.nextElementSibling?.tagName?.toLowerCase() === "input" && container.nextElementSibling.type === "file") {
      return container.nextElementSibling;
    }
    if (container.previousElementSibling?.tagName?.toLowerCase() === "input" && container.previousElementSibling.type === "file") {
      return container.previousElementSibling;
    }

    // 3. label avec 'for'
    const label = container.closest("label") || container.querySelector("label");
    if (label && label.htmlFor) {
      const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (doc) {
        const el = doc.getElementById(label.htmlFor);
        if (el && el.type === "file") return el;
      }
    }

    return null;
  }

  // Nettoie le texte d'un élément en retirant les badges d'état injectés par ChapTech
  function getCleanElementText(el) {
    if (!el) return "";
    const raw = el.innerText || el.textContent || "";
    if (!raw) return "";
    return raw
      .replace(/✅\s*Photo injectée\s*\([^)]*\)/gi, "")
      .replace(/⚠️\s*Photo absente dans FibreTrack\s*:[^\n\r]*/gi, "")
      .trim();
  }

  // Injecte un fichier dans un input[type="file"] via DataTransfer (idempotent si le même fichier est déjà injecté)
  function injectFileIntoInput(inputEl, file, containerEl = null, photoSrc = "") {
    if (!inputEl || !file) return false;
    try {
      const srcSig = photoSrc ? `${file.name}::${file.size}::${photoSrc.slice(-48)}` : `${file.name}::${file.size}`;
      const alreadySame =
        inputEl.files &&
        inputEl.files.length === 1 &&
        inputEl.files[0] &&
        inputEl.files[0].name === file.name &&
        inputEl.files[0].size === file.size &&
        inputEl.dataset &&
        inputEl.dataset.chaptechInjectedSig === srcSig;

      if (!alreadySame) {
        let dt = null;
        if (typeof DataTransfer !== "undefined") {
          dt = new DataTransfer();
          dt.items.add(file);
          inputEl.files = dt.files;
        } else {
          inputEl.files = [file];
        }

        if (inputEl.dataset) {
          inputEl.dataset.chaptechInjectedSig = srcSig;
        }

        // Événements standards pour frameworks réactifs (Angular, React, Vue)
        if (typeof inputEl.dispatchEvent === "function") {
          inputEl.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
          inputEl.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        }

        // Si le conteneur écoute l'événement drop
        if (containerEl && typeof containerEl.dispatchEvent === "function") {
          try {
            const dropEvt = new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt,
            });
            containerEl.dispatchEvent(dropEvt);
          } catch {}
        }
      }

      if (containerEl) {
        // Retour visuel immédiat pour le superviseur
        markContainerSuccess(containerEl, file.name);
      }
      return true;
    } catch (err) {
      console.warn("[PhotoFiller] Erreur injectFileIntoInput:", err);
      return false;
    }
  }

  // Affiche un badge et une bordure verte sur la zone d'upload
  function markContainerSuccess(container, fileName) {
    if (!container) return;
    if (container.style) {
      container.style.borderColor = "#22c55e";
      container.style.borderWidth = "2px";
      container.style.borderStyle = "solid";
      container.style.backgroundColor = "#f0fdf4";
    }

    // Éviter d'ajouter plusieurs badges
    const existingBadge = container.querySelector ? container.querySelector(".chaptech-photo-injected-badge") : null;
    const targetText = `✅ Photo injectée (${fileName})`;
    if (existingBadge) {
      existingBadge.innerHTML = targetText;
      existingBadge.textContent = targetText;
      return;
    }
    const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (doc) {
      const badge = doc.createElement("div");
      badge.className = "chaptech-photo-injected-badge";
      if (badge.dataset) badge.dataset.chaptechManaged = "true";
      badge.innerHTML = targetText;
      badge.textContent = targetText;
      if (badge.style) {
        badge.style.cssText =
          "background: #16a34a; color: #fff; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-top: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.15);";
      }
      container.appendChild(badge);
    }
  }

  // Affiche un badge et une bordure orange d'avertissement quand la photo est absente dans FibreTrack
  function markContainerMissing(container, label) {
    if (!container) return;
    if (container.style) {
      container.style.borderColor = "#f59e0b";
      container.style.borderWidth = "2px";
      container.style.borderStyle = "dashed";
      container.style.backgroundColor = "#fffbeb";
    }

    if (!container.querySelector || !container.querySelector(".chaptech-photo-missing-badge")) {
      const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (doc) {
        const badge = doc.createElement("div");
        badge.className = "chaptech-photo-missing-badge";
        if (badge.dataset) badge.dataset.chaptechManaged = "true";
        const targetText = `⚠️ Photo absente dans FibreTrack : ${label}`;
        badge.innerHTML = targetText;
        badge.textContent = targetText;
        if (badge.style) {
          badge.style.cssText =
            "background: #d97706; color: #fff; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-top: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.15);";
        }
        container.appendChild(badge);
      }
    }
  }

  // Identifie précisément la catégorie d'un conteneur d'upload (avec isolation stricte)
  function identifyPhotoContainer(container, input = null) {
    if (!container) return null;
    const targetInput = input || findFileInputForContainer(container);

    // Ne jamais identifier un slot dynamique de poteau comme une règle statique (ex: autre_poteau)
    if (
      container.dataset?.chaptechPoleSlot === "true" ||
      targetInput?.dataset?.chaptechPoleSlot === "true"
    ) {
      return null;
    }

    const attributes = [];
    if (targetInput) {
      if (targetInput.id) attributes.push(targetInput.id);
      if (targetInput.name) attributes.push(targetInput.name);
      const fcn = targetInput.getAttribute("formcontrolname") || targetInput.getAttribute("formControlName");
      if (fcn) attributes.push(fcn);
      const ds = targetInput.getAttribute("data-slot") || targetInput.getAttribute("data-category") || targetInput.getAttribute("data-field");
      if (ds) attributes.push(ds);
      const aria = targetInput.getAttribute("aria-label");
      if (aria) attributes.push(aria);
    }

    const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
    const labelTexts = [];

    if (targetInput && targetInput.id && doc) {
      try {
        const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(targetInput.id) : targetInput.id;
        const explicitLabel = doc.querySelector(`label[for="${escapedId}"]`);
        if (explicitLabel) labelTexts.push(getCleanElementText(explicitLabel));
      } catch {}
    }

    const innerLabel = container.querySelector("label, h3, h4, h5, strong, [class*='title'], [class*='label']");
    if (innerLabel) labelTexts.push(getCleanElementText(innerLabel));

    if (container.previousElementSibling) {
      const prev = container.previousElementSibling;
      const tag = prev.tagName?.toLowerCase();
      if (tag === "label" || tag === "span" || tag === "h3" || tag === "h4" || tag === "strong" || tag === "p") {
        labelTexts.push(getCleanElementText(prev));
      }
    }

    labelTexts.push(getCleanElementText(container));

    const parent = container.parentElement;
    if (parent && parent.querySelectorAll && parent.querySelectorAll('input[type="file"]').length <= 1) {
      const pLabel = parent.querySelector("label, h3, h4, strong, [class*='title'], [class*='label']");
      if (pLabel && pLabel !== innerLabel) {
        labelTexts.push(getCleanElementText(pLabel));
      }
    }

    const fullLabelText = labelTexts.join(" ");
    const normLabel = normalizeText(fullLabelText);
    const normAttrs = attributes.map((a) => normalizeText(a));

    let bestRule = null;
    let highestScore = 0;

    for (const rule of PHOTO_SLOT_RULES) {
      if (rule.negativeKeywords && rule.negativeKeywords.length > 0) {
        const isDisqualified = rule.negativeKeywords.some((neg) => {
          const normNeg = normalizeText(neg);
          return normNeg && (normLabel.includes(normNeg) || normAttrs.some((a) => a.includes(normNeg)));
        });
        if (isDisqualified) continue;
      }

      let score = 0;

      for (const attr of attributes) {
        if (rule.attrPatterns) {
          for (const pattern of rule.attrPatterns) {
            if (pattern.test(attr)) {
              score = Math.max(score, 100);
              break;
            }
          }
        }
        const normAttr = normalizeText(attr);
        for (const kw of rule.keywords) {
          const normKw = normalizeText(kw);
          if (normKw && normAttr === normKw) {
            score = Math.max(score, 95);
          } else if (normKw && normAttr.includes(normKw) && normKw.length >= 4) {
            score = Math.max(score, 85);
          }
        }
      }

      if (normLabel) {
        for (const kw of rule.keywords) {
          const normKw = normalizeText(kw);
          if (!normKw) continue;
          if (normLabel === normKw) {
            score = Math.max(score, 95);
          } else if (normLabel.includes(normKw)) {
            const bonus = Math.min(25, normKw.length * 2);
            score = Math.max(score, 70 + bonus);
          }
        }
      }

      if (score > highestScore && score >= 70) {
        highestScore = score;
        bestRule = rule;
      }
    }

    return bestRule;
  }

  // Recherche tous les conteneurs d'upload de photo sur la page courante
  function findAllUploadContainers(root = (typeof document !== "undefined" ? document : null)) {
    if (!root) return [];
    const list = [];
    const seenContainers = new Set();
    const seenInputs = new Set();

    // 1. Tous les input[type="file"]
    const fileInputs = Array.from(root.querySelectorAll('input[type="file"]'));
    for (const input of fileInputs) {
      if (seenInputs.has(input)) continue;
      seenInputs.add(input);
      const parent = input.closest ? input.closest(".upload-box, .dropzone, [class*='upload'], [class*='photo'], [class*='drop']") : null;
      const targetParent = parent || input.parentElement;
      if (targetParent && !seenContainers.has(targetParent)) {
        seenContainers.add(targetParent);
        list.push({ container: targetParent, input });
      }
    }

    // 2. Toutes les zones d'upload avec texte "photo" ou "importer"
    const uploadBoxes = Array.from(root.querySelectorAll(".upload-box, .dropzone, [class*='upload'], [class*='dropzone'], [class*='drop-box']")).filter((el) => {
      if (seenContainers.has(el)) return false;
      const txt = (el.innerText || "").toLowerCase();
      return txt.includes("photo") || txt.includes("importer") || txt.includes("appareil photo");
    });

    for (const box of uploadBoxes) {
      if (!seenContainers.has(box)) {
        seenContainers.add(box);
        const input = findFileInputForContainer(box);
        if (input && seenInputs.has(input)) continue;
        if (input) seenInputs.add(input);
        list.push({ container: box, input });
      }
    }

    return list;
  }

  // Fonction principale : remplit automatiquement les photos de la page uniquement si elles existent dans l'intervention
  async function fillPhotosOnPage(interventionData, root = (typeof document !== "undefined" ? document : null), options = {}) {
    if (!interventionData || !root) {
      return { success: false, injectedCount: 0, missingCount: 0, details: [] };
    }
    const isCancelled = typeof options?.shouldAbort === "function" ? options.shouldAbort : () => false;
    if (isCancelled()) {
      return { success: false, cancelled: true, injectedCount: 0, missingCount: 0, details: [] };
    }

    const data = (FieldMapping && typeof FieldMapping.normalizeInterventionData === "function")
      ? FieldMapping.normalizeInterventionData(interventionData)
      : interventionData;

    const uploadSlots = findAllUploadContainers(root);
    const injectedDetails = [];
    const missingPhotos = [];
    const unmatchedSlots = [];
    const assignedPhotoSources = new Set();
    const processedInputs = new Set();
    const missingInputs = new Set();

    for (const slot of uploadSlots) {
      if (isCancelled()) break;
      const input = slot.input || findFileInputForContainer(slot.container);
      if (input && (processedInputs.has(input) || missingInputs.has(input))) {
        continue;
      }

      const rule = identifyPhotoContainer(slot.container, input);
      if (!rule) {
        unmatchedSlots.push({
          elementId: input?.id || input?.name || "(sans id)",
          text: (slot.container.innerText || "").slice(0, 50),
        });
        continue;
      }

      // Si le slot est explicitement masqué (ex: Combiné téléphonique, Fiche combinée)
      if (rule.ignored || rule.key === "combine" || rule.key === "fiche_combine") {
        if (slot.container && slot.container.style) {
          slot.container.style.display = "none";
        }
        continue;
      }

      const photoInfo = rule.getPhoto(data);
      if (!photoInfo || !photoInfo.src) {
        // La case existe dans CelPros mais aucune photo n'a été prise pour ce slot dans FibreTrack :
        // Marquer strictement comme manquante et NE JAMAIS laisser une autre photo s'y injecter
        missingPhotos.push({
          slot: rule.key,
          label: rule.label,
          celprosLabel: rule.celprosLabel || rule.label,
        });
        if (input) missingInputs.add(input);
        markContainerMissing(slot.container, rule.label);
        continue;
      }

      // Éviter d'injecter la même photo dans plusieurs slots différents par erreur
      if (assignedPhotoSources.has(photoInfo.src)) {
        // Déjà injecté pour ce slot ou son clone responsive : continuer silencieusement
        continue;
      }

      const file = await srcToFile(photoInfo.src, photoInfo.name);
      if (isCancelled()) break;
      if (!file) continue;

      if (input) {
        if (missingInputs.has(input) || processedInputs.has(input)) {
          continue;
        }

        const ok = injectFileIntoInput(input, file, slot.container, photoInfo.src);
        if (ok) {
          processedInputs.add(input);
          assignedPhotoSources.add(photoInfo.src);
          injectedDetails.push({
            slot: rule.key,
            label: rule.label,
            fileName: file.name,
            sizeKb: Math.round(file.size / 1024),
          });

          // Renseigner automatiquement les débits (Montant, Descendant, Ping) associés à la photo
          if (rule.key === "debit_wifi" || rule.key === "debit_cable") {
            handleSpeedtestAutoFill(slot.container, data, root);
          }

          // Renseigner automatiquement les mesures de puissance (FAT, PTO) associées à la photo
          if (rule.key === "mesure_fat" || rule.key === "mesure_pto") {
            handlePowerAutoFill(slot.container, rule.key, data, root);
          }
        }
      }
    }

    // Injection spécifique pour les poteaux si présents dans Step 4 (en protégeant les slots manquants)
    if (!isCancelled()) {
      const polesInjected = await handlePoteauxPhotos(data, root, missingInputs, processedInputs, options);
      injectedDetails.push(...polesInjected);
    }

    return {
      success: true,
      totalSlotsFound: uploadSlots.length,
      injectedCount: injectedDetails.length,
      missingCount: missingPhotos.length,
      missingPhotos,
      unmatchedSlots,
      details: injectedDetails,
    };
  }

  // Injecte une valeur textuelle ou numérique avec déclenchement d'événements réactifs
  function setNativeFieldValue(element, value) {
    if (!element || value === null || value === undefined || value === "") return false;
    let stringValue = String(value).trim();
    if (/^-?\d+,\d+$/.test(stringValue)) {
      stringValue = stringValue.replace(",", ".");
    }
    if (element.value === stringValue) return true;

    try {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(
        typeof HTMLInputElement !== "undefined" ? HTMLInputElement.prototype : prototype,
        "value"
      );
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, stringValue);
      } else {
        element.value = stringValue;
      }
      element.dispatchEvent(new Event("focus", { bubbles: true }));
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      if (element.style) {
        element.style.borderColor = "#22c55e";
        element.style.backgroundColor = "#f0fdf4";
      }
      return true;
    } catch {
      element.value = stringValue;
      return true;
    }
  }

  // Renseigne automatiquement les 3 cases de débit (Montant, Descendant, Ping) associées au test de débit
  function handleSpeedtestAutoFill(container, data, root = (typeof document !== "undefined" ? document : null)) {
    if (!data) return;
    const download = data.debit_descendant || data.debit_download;
    const upload = data.debit_montant || data.debit_upload;
    const ping = data.debit_ping || data.ping;

    if (!download && !upload && !ping) return;

    // Trouver le conteneur englobant (section Tests de débits par Wifi) ou à défaut la page
    const searchRoot = container ? (container.closest("section, div.form-section, div.card, fieldset, form") || root) : root;
    if (!searchRoot) return;

    const fillInputsInRoot = (targetRoot) => {
      const inputs = Array.from(targetRoot.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"])'));
      for (const inp of inputs) {
        const idName = `${inp.id || ""} ${inp.name || ""} ${inp.getAttribute("formcontrolname") || ""} ${inp.placeholder || ""}`.toLowerCase();
        const prevText = (inp.previousElementSibling?.textContent || "").toLowerCase();
        const parentText = (inp.parentElement?.textContent || "").toLowerCase();
        const labelText = (inp.labels && inp.labels[0]?.textContent || "").toLowerCase();
        const combined = `${idName} ${prevText} ${parentText} ${labelText}`;

        // Montant (Upload)
        if (upload && (combined.includes("montant") || combined.includes("upload")) && !combined.includes("descendant")) {
          setNativeFieldValue(inp, upload);
        }
        // Descendant (Download)
        else if (download && (combined.includes("descendant") || combined.includes("download") || combined.includes("reception")) && !combined.includes("montant")) {
          setNativeFieldValue(inp, download);
        }
        // Ping (Latence)
        else if (ping && (combined.includes("ping") || combined.includes("latence"))) {
          setNativeFieldValue(inp, ping);
        }
      }
    };

    fillInputsInRoot(searchRoot);
    if (root && root !== searchRoot) {
      fillInputsInRoot(root);
    }
  }

  // Renseigne automatiquement la case de mesure de puissance optique (Valeur au FAT ou Valeur au PTO)
  function handlePowerAutoFill(container, ruleKey, data, root = (typeof document !== "undefined" ? document : null)) {
    if (!data) return;
    const isFat = ruleKey === "mesure_fat";
    const raw = isFat
      ? (data.puissance_fat_dbm ?? data.puissance_fat ?? data.puissance_optique_fat ?? data.mesure_fat_dbm)
      : (data.puissance_pto_dbm ?? data.puissance_pto ?? data.puissance_optique_pto ?? data.mesure_pto_dbm);
    if (raw === undefined || raw === null || raw === "" || Number(raw) === 0) return;

    let str = String(raw).replace(",", ".").trim();
    const num = parseFloat(str);
    if (isNaN(num) || num === 0) return;
    const stringValue = num > 0 ? `-${str}` : str;

    const targetKey = isFat ? "fat" : "pto";
    const forbiddenKey = isFat ? "pto" : "fat";

    const tryFillInput = (inp) => {
      const idName = `${inp.id || ""} ${inp.name || ""} ${inp.getAttribute("formcontrolname") || ""} ${inp.placeholder || ""}`.toLowerCase();
      const prevText = (inp.previousElementSibling?.textContent || "").toLowerCase();
      const parentText = (inp.parentElement?.textContent || "").toLowerCase();
      const labelText = (inp.labels && inp.labels[0]?.textContent || "").toLowerCase();
      const combined = `${idName} ${prevText} ${parentText} ${labelText}`;

      if (combined.includes(targetKey) && !combined.includes(forbiddenKey)) {
        if (combined.includes("valeur") || combined.includes("puissance") || combined.includes("dbm") || (inp.placeholder && inp.placeholder.includes("-"))) {
          setNativeFieldValue(inp, stringValue);
          return true;
        }
      }
      return false;
    };

    // 1. Chercher dans la même ligne / conteneur parent (row, col, card)
    const searchRoot = container ? (container.closest(".row, .form-row, [class*='row'], section, .card, fieldset") || container.parentElement || root) : root;
    if (searchRoot) {
      const inputs = Array.from(searchRoot.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"])'));
      for (const inp of inputs) {
        if (tryFillInput(inp)) return;
      }
    }

    // 2. Repli sur le document entier si non trouvé dans la ligne
    if (root && root !== searchRoot) {
      const allInputs = Array.from(root.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"])'));
      for (const inp of allInputs) {
        if (tryFillInput(inp)) return;
      }
    }
  }

  // Protection active contre l'ouverture intempestive du sélecteur de fichiers de l'OS
  let fileDialogSuppressed = false;

  function suppressNativeFileDialog(fn) {
    if (typeof HTMLInputElement === "undefined" || !HTMLInputElement.prototype) {
      return fn();
    }
    const originalClick = HTMLInputElement.prototype.click;
    try {
      fileDialogSuppressed = true;
      HTMLInputElement.prototype.click = function () {
        if (this && this.type === "file" && fileDialogSuppressed) {
          console.warn("[PhotoFiller] Tentative d'ouverture de l'explorateur de fichiers bloquée:", this);
          return;
        }
        return originalClick.apply(this, arguments);
      };
      return fn();
    } finally {
      fileDialogSuppressed = false;
      HTMLInputElement.prototype.click = originalClick;
    }
  }

  async function suppressNativeFileDialogAsync(asyncFn) {
    if (typeof HTMLInputElement === "undefined" || !HTMLInputElement.prototype) {
      return await asyncFn();
    }
    const originalClick = HTMLInputElement.prototype.click;
    try {
      fileDialogSuppressed = true;
      HTMLInputElement.prototype.click = function () {
        if (this && this.type === "file" && fileDialogSuppressed) {
          console.warn("[PhotoFiller] Tentative d'ouverture de l'explorateur de fichiers bloquée (async):", this);
          return;
        }
        return originalClick.apply(this, arguments);
      };
      return await asyncFn();
    } finally {
      fileDialogSuppressed = false;
      HTMLInputElement.prototype.click = originalClick;
    }
  }

  // Détecte formellement si un élément est lié à un déclencheur d'upload de fichier
  // afin de NE JAMAIS le cliquer (ce qui ouvrirait le sélecteur de fichiers de l'OS).
  function isFileUploadTrigger(el) {
    if (!el) return false;
    if (el.tagName === "INPUT" && el.type === "file") return true;
    if (el.tagName === "LABEL" && el.htmlFor) {
      const doc = el.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (doc) {
        const target = doc.getElementById(el.htmlFor);
        if (target && target.tagName === "INPUT" && target.type === "file") return true;
      }
    }
    if (typeof el.querySelector === "function" && el.querySelector('input[type="file"]')) return true;
    if (typeof el.closest === "function") {
      const parentUpload = el.closest('input[type="file"], label[for], [class*="upload"], [class*="dropzone"], [class*="custom-file"], [class*="file-picker"]');
      if (parentUpload) {
        if (typeof parentUpload.querySelector === "function" && parentUpload.querySelector('input[type="file"]')) return true;
        if (parentUpload.tagName === "LABEL" && parentUpload.htmlFor) {
          const doc = el.ownerDocument || (typeof document !== "undefined" ? document : null);
          if (doc) {
            const target = doc.getElementById(parentUpload.htmlFor);
            if (target && target.type === "file") return true;
          }
        }
      }
    }
    const txt = (el.innerText || el.textContent || "").toLowerCase();
    const aria = (typeof el.getAttribute === "function" ? el.getAttribute("aria-label") || "" : "").toLowerCase();
    const title = (typeof el.getAttribute === "function" ? el.getAttribute("title") || "" : "").toLowerCase();
    const cls = String(el.className || "").toLowerCase();
    if (
      cls.includes("upload") || cls.includes("dropzone") || cls.includes("file-input") || cls.includes("photo-box") ||
      aria.includes("télécharger") || aria.includes("telecharger") || aria.includes("upload") || aria.includes("photo") || aria.includes("image") ||
      title.includes("télécharger") || title.includes("telecharger") || title.includes("upload") || title.includes("photo") || title.includes("image") ||
      txt.includes("télécharger") || txt.includes("telecharger") || txt.includes("parcourir") || txt.includes("browse") || txt.includes("importer") || txt.includes("prendre")
    ) {
      return true;
    }
    return false;
  }

  // Déclenche un clic hautement compatible avec Angular et les navigateurs modernes
  function robustClick(el) {
    if (!el) return false;
    // GARDE-FOU ABSOLU : Ne JAMAIS cliquer sur un déclencheur d'upload de fichier
    // pour éviter l'ouverture intempestive en boucle du gestionnaire de fichiers de l'OS
    if (isFileUploadTrigger(el)) {
      return false;
    }
    return suppressNativeFileDialog(() => {
      const elementsToClick = new Set([el]);
      if (typeof el.closest === "function") {
        const btn = el.closest("button, a, [role='button'], .btn");
        if (btn && !isFileUploadTrigger(btn)) elementsToClick.add(btn);
      }
      for (const target of elementsToClick) {
        if (isFileUploadTrigger(target)) continue;
        if (target.tagName === "INPUT" && target.type === "file") continue;
        try {
          if (typeof target.focus === "function") target.focus();
          const mouseOpts = { bubbles: true, cancelable: true, view: typeof window !== "undefined" ? window : null };
          if (typeof PointerEvent !== "undefined") {
            try { target.dispatchEvent(new PointerEvent("pointerdown", mouseOpts)); } catch {}
          }
          try { target.dispatchEvent(new MouseEvent("mousedown", mouseOpts)); } catch {}
          if (typeof PointerEvent !== "undefined") {
            try { target.dispatchEvent(new PointerEvent("pointerup", mouseOpts)); } catch {}
          }
          try { target.dispatchEvent(new MouseEvent("mouseup", mouseOpts)); } catch {}
          try { target.dispatchEvent(new MouseEvent("click", mouseOpts)); } catch {}
          if (typeof target.click === "function") {
            target.click();
          }
        } catch {}
      }
      return true;
    });
  }

  // Cherche l'élément titre/libellé de la section Poteaux dans CelPros (Étape 4)
  function findPoteauxTitle(root) {
    if (!root) return null;
    const candidates = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6, strong, b, div, span, p, label, section"));

    // 1. Chercher un élément dont le libellé mentionne explicitement "Poteaux" ou "Appuis"
    for (const el of candidates) {
      if (el.children && el.children.length > 4) continue;
      const txt = (el.innerText || el.textContent || "").trim();
      const clean = txt.replace(/[+\s]/g, "").toLowerCase();
      if (clean === "poteaux" || clean === "poteauxtraverses" || clean === "appuis" || clean === "appuisaeriens" ||
          (/poteaux/i.test(txt) && /max\s*10/i.test(txt))) {
        return el;
      }
    }

    // 2. Recherche textuelle ciblée
    for (const el of candidates) {
      if (el.children && el.children.length > 4) continue;
      const txt = (el.innerText || el.textContent || "").trim();
      if (/\bpoteaux\b/i.test(txt) && !/travers|implant|arm|nombre|nb/i.test(txt) && txt.length < 50) {
        return el;
      }
    }

    // 3. Fallback sur le texte d'aide "appuyez sur + pour ajouter (max 10)"
    for (const el of candidates) {
      const txt = (el.innerText || el.textContent || "").trim();
      if (/appuyez sur \+ pour ajouter/i.test(txt) || /max\s*10/i.test(txt)) {
        return el;
      }
    }

    return null;
  }

  // Cherche le conteneur englobant de la section Poteaux dans CelPros (Étape 4)
  function findPoteauxSection(root) {
    const titleEl = findPoteauxTitle(root);
    if (!titleEl) return null;

    // Remonter vers le conteneur englobant (la carte "Rattachement" ou le groupe englobant)
    if (typeof titleEl.closest === "function") {
      const card = titleEl.closest(".card, section, fieldset, .form-section, form, [class*='step'], main");
      if (card) return card;
    }
    return titleEl.parentElement?.parentElement || titleEl.parentElement || root;
  }

  // Cherche le bouton '+' pour ajouter un nouveau poteau dans CelPros (exclusivement hors zones d'upload)
  function findAddPoleButton(container, root) {
    const titleEl = findPoteauxTitle(container || root);
    let headerRow = null;
    if (titleEl && typeof titleEl.closest === "function") {
      headerRow = titleEl.closest(".d-flex, .row, [class*='row'], [class*='header'], [class*='title']");
      if (!headerRow) headerRow = titleEl.parentElement;
    } else if (titleEl) {
      headerRow = titleEl.parentElement;
    }

    const siblingArea = titleEl?.parentElement?.parentElement || titleEl?.parentElement;
    // RESTRICTION CRITIQUE : NE JAMAIS chercher dans tout le document 'root' pour ne pas capturer les boutons d'upload d'autres sections !
    const areas = [headerRow, siblingArea, container].filter(Boolean);

    for (const area of areas) {
      const candidates = Array.from(area.querySelectorAll("button, a, [role='button'], .btn, i, span, svg, mat-icon"));
      for (const el of candidates) {
        // Ignorer immédiatement tout élément lié à un upload de fichier
        if (isFileUploadTrigger(el)) continue;

        const txt = (el.innerText || el.textContent || "").trim();
        const aria = (typeof el.getAttribute === "function" ? el.getAttribute("aria-label") || "" : "").toLowerCase();
        const title = (typeof el.getAttribute === "function" ? el.getAttribute("title") || "" : "").toLowerCase();
        const cls = String(el.className || "").toLowerCase();
        const tag = el.tagName?.toLowerCase();

        const btn = (typeof el.closest === "function" ? el.closest("button, a, [role='button'], .btn") : null) || el;
        if (isFileUploadTrigger(btn)) continue;

        if (txt === "+" || /^(?:\+\s*|\+[\s\w]*|ajouter|ajouter un poteau|add)$/i.test(txt)) {
          return btn;
        }
        if (aria.includes("ajouter un poteau") || title.includes("ajouter un poteau") ||
            (aria.includes("ajouter") && !aria.includes("photo") && !aria.includes("image") && !aria.includes("file"))) {
          return btn;
        }
        if ((cls.includes("fa-plus") || cls.includes("btn-plus") || cls.includes("plus-icon") || cls.includes("add-btn") || cls.includes("fa-plus-circle")) &&
            !cls.includes("upload") && !cls.includes("file") && !cls.includes("photo")) {
          return btn;
        }
        if (tag === "mat-icon" && txt.toLowerCase() === "add") {
          return btn;
        }
      }
    }
    return null;
  }

  // Récupère et ordonne rigoureusement tous les poteaux à injecter :
  // PHASE A : Poteaux numérotés 1..N (Poteau 1, Poteau 2, ...) dans l'ordre séquentiel strict
  // PHASE B : "Autres poteaux" traités exclusivement après l'ensemble des poteaux numérotés
  function collectAllPoles(interventionData) {
    const poles = [];
    const assignedSources = new Set();
    let pts = interventionData?.points_gps;
    if (typeof pts === "string") {
      try {
        pts = JSON.parse(pts);
      } catch {
        pts = [];
      }
    }
    if (!Array.isArray(pts)) pts = [];

    // Support des poteaux directs (interventionData.poteaux) si présents
    let directPoles = interventionData?.poteaux;
    if (typeof directPoles === "string") {
      try {
        directPoles = JSON.parse(directPoles);
      } catch {
        directPoles = [];
      }
    }
    if (Array.isArray(directPoles)) {
      for (const dp of directPoles) {
        if (!dp) continue;
        const dpSrc = getPhotoSource(dp.photo) || getPhotoSource(dp);
        const alreadyInPts = pts.some((p) => {
          if (!p) return false;
          if (p.id && dp.id) return String(p.id) === String(dp.id);
          const pSrc = getPhotoSource(p.photo) || getPhotoSource(p);
          if (pSrc && dpSrc) return pSrc.trim().toLowerCase() === dpSrc.trim().toLowerCase();
          return Number(p.numero) === Number(dp.numero) && String(p.sous_type || "") === String(dp.sous_type || "");
        });
        if (!alreadyInPts) {
          pts.push({ type: "Poteau", ...dp });
        }
      }
    }

    const wa = getEligibleWhatsappPhotos(interventionData);

    // ========================================================
    // PHASE A : POTEAUX NUMÉROTÉS (1..N) DANS L'ORDRE SÉQUENTIEL
    // ========================================================
    const poleNums = new Set();
    for (const p of pts) {
      if (p && (p.type === "Poteau" || normalizeText(p.type).includes("poteau"))) {
        const n = Number(p.numero);
        if (!isNaN(n) && n > 0) poleNums.add(n);
      }
    }
    for (const p of wa) {
      const slot = String(p?.slot || "").toLowerCase();
      const type = String(p?.type || "").toLowerCase();
      if (slot.includes("autre") || type.includes("autre")) continue;
      const m = slot.match(/^poteau_?(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        if (!isNaN(n) && n > 0) poleNums.add(n);
      } else if (p?.numero && !isNaN(Number(p.numero)) && Number(p.numero) > 0) {
        poleNums.add(Number(p.numero));
      }
    }

    const normalizeSrc = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");

    // Tri strict croissant : Poteau 1, Poteau 2, Poteau 3...
    // Si plusieurs poteaux distincts partagent le même numéro (ex: Traversé 1 et Implanté 1), chacun est préservé.
    const sortedNums = Array.from(poleNums).sort((a, b) => a - b);
    for (const num of sortedNums) {
      const gpsPoints = pts.filter(
        (p) => p && (p.type === "Poteau" || normalizeText(p.type).includes("poteau")) && Number(p.numero) === num
      );
      const waPhotos = wa.filter((p) => {
        const slot = String(p?.slot || "").toLowerCase();
        const type = String(p?.type || "").toLowerCase();
        if (slot.includes("autre") || type.includes("autre")) return false;
        return slot === `poteau_${num}` || slot === `poteau${num}` || Number(p?.numero) === num;
      });

      if (gpsPoints.length > 0) {
        for (let idx = 0; idx < gpsPoints.length; idx++) {
          const gpsPoint = gpsPoints[idx];
          const waPhoto = waPhotos[idx] || (idx === 0 ? waPhotos[0] : null);
          const src = getPhotoSource(gpsPoint?.photo) || getPhotoSource(gpsPoint) || getPhotoSource(waPhoto?.url) || getPhotoSource(waPhoto?.photo);
          if (!src) continue;
          const normSrc = normalizeSrc(src);
          if (assignedSources.has(normSrc)) continue;

          if (gpsPoint?.photo) assignedSources.add(normalizeSrc(getPhotoSource(gpsPoint.photo)));
          if (waPhoto?.url) assignedSources.add(normalizeSrc(getPhotoSource(waPhoto.url)));
          if (waPhoto?.photo) assignedSources.add(normalizeSrc(getPhotoSource(waPhoto.photo)));
          assignedSources.add(normSrc);

          const lat = gpsPoint?.lat ?? gpsPoint?.latitude ?? waPhoto?.lat ?? interventionData?.latitude ?? null;
          const lng = gpsPoint?.lng ?? gpsPoint?.longitude ?? waPhoto?.lng ?? interventionData?.longitude ?? null;
          const precision_m = gpsPoint?.precision_m ?? waPhoto?.precision_m ?? null;

          poles.push({
            src,
            name: `poteau_${num}.jpg`,
            label: `Poteau ${num}`,
            numero: num,
            lat,
            lng,
            precision_m,
            isAutrePoteau: false,
          });
        }
      }

      for (const waPhoto of waPhotos) {
        const src = getPhotoSource(waPhoto?.url) || getPhotoSource(waPhoto?.photo) || getPhotoSource(waPhoto);
        if (!src) continue;
        const normSrc = normalizeSrc(src);
        if (assignedSources.has(normSrc)) continue;
        assignedSources.add(normSrc);

        const fallbackGps = gpsPoints[0];
        const lat = waPhoto?.lat ?? fallbackGps?.lat ?? fallbackGps?.latitude ?? interventionData?.latitude ?? null;
        const lng = waPhoto?.lng ?? fallbackGps?.lng ?? fallbackGps?.longitude ?? interventionData?.longitude ?? null;
        const precision_m = waPhoto?.precision_m ?? fallbackGps?.precision_m ?? null;

        poles.push({
          src,
          name: `poteau_${num}.jpg`,
          label: `Poteau ${num}`,
          numero: num,
          lat,
          lng,
          precision_m,
          isAutrePoteau: false,
        });
      }
    }

    // Points GPS Poteau sans numéro explicite (fallback séquentiel ordonné)
    for (const p of pts) {
      if (p && (p.type === "Poteau" || normalizeText(p.type).includes("poteau"))) {
        const n = Number(p.numero);
        if (isNaN(n) || n <= 0) {
          const src = getPhotoSource(p.photo) || getPhotoSource(p);
          if (src && !assignedSources.has(normalizeSrc(src))) {
            assignedSources.add(normalizeSrc(src));
            const fallbackNum = poles.length + 1;
            poles.push({
              src,
              name: `poteau_${fallbackNum}.jpg`,
              label: `Poteau ${fallbackNum}`,
              numero: fallbackNum,
              lat: p.lat ?? interventionData?.latitude ?? null,
              lng: p.lng ?? interventionData?.longitude ?? null,
              precision_m: p.precision_m ?? null,
              isAutrePoteau: false,
            });
          }
        }
      }
    }

    // Photos Poteau dans wa sans numéro explicite (fallback si non encore assignées)
    for (const p of wa) {
      const slot = String(p?.slot || "").toLowerCase();
      const type = String(p?.type || "").toLowerCase();
      const isNumbered = Boolean(slot.match(/^poteau_?\d+$/) || (p?.numero && !isNaN(Number(p.numero)) && Number(p.numero) > 0));
      if (!isNumbered && (slot === "poteau" || type === "poteau") && !slot.includes("autre") && !type.includes("autre")) {
        const src = getPhotoSource(p);
        if (src && !assignedSources.has(normalizeSrc(src))) {
          assignedSources.add(normalizeSrc(src));
          const fallbackNum = poles.length + 1;
          poles.push({
            src,
            name: `poteau_${fallbackNum}.jpg`,
            label: `Poteau ${fallbackNum}`,
            numero: fallbackNum,
            lat: p.lat ?? interventionData?.latitude ?? null,
            lng: p.lng ?? interventionData?.longitude ?? null,
            precision_m: p.precision_m ?? null,
            isAutrePoteau: false,
          });
        }
      }
    }

    // ========================================================
    // PHASE B : "AUTRES POTEAUX" TRAITÉS APRÈS LES NUMÉROTÉS
    // ========================================================
    const autresPoles = [];
    const seenAutreKeys = new Set();
    for (const p of wa) {
      const src = getPhotoSource(p);
      if (!src) continue;

      const slot = String(p?.slot || "").toLowerCase();
      const type = String(p?.type || "").toLowerCase();
      const desc = getPhotoDescription(p);

      if (slot === "autre_poteau" || slot.startsWith("autre_poteau") || type === "autre_poteau" || desc.includes("autre poteau")) {
        const normSrc = normalizeSrc(src);
        // Si cette URL exacte appartenait déjà à un poteau numéroté de Phase A (sans ID distinct d'autre_poteau), ignorer
        if (assignedSources.has(normSrc) && !p.id) continue;

        const uniqueKey = p.id
          ? `id:${p.id}`
          : `src:${normSrc}::${String(p.name || "").trim().toLowerCase()}::${String(p.label || "").trim().toLowerCase()}::${String(p.horodatage || "")}`;
        if (seenAutreKeys.has(uniqueKey)) continue;
        seenAutreKeys.add(uniqueKey);
        autresPoles.push(p);
      }
    }

    autresPoles.forEach((p, idx) => {
      const src = getPhotoSource(p);
      if (!src) return;
      assignedSources.add(normalizeSrc(src));

      const lat = p.lat ?? interventionData?.latitude ?? null;
      const lng = p.lng ?? interventionData?.longitude ?? null;
      const precision_m = p.precision_m ?? null;
      const autreIdx = idx + 1;

      poles.push({
        src,
        name: `autre_poteau_${autreIdx}.jpg`,
        label: `Autre Poteau ${autreIdx}`,
        numero: null,
        lat,
        lng,
        precision_m,
        isAutrePoteau: true,
      });
    });

    return poles;
  }

  // Récupère tous les slots d'upload dédiés aux poteaux sur CelPros (Étape 4)
  function findExistingPoleSlots(cardOrRoot, poteauxTitle) {
    const container = cardOrRoot || (typeof document !== "undefined" ? document : null);
    if (!container) return [];

    const isForbiddenForPoles = (txt) => {
      return /c[aâ]ble|interne|externe|fat|pto|scan|mesure|d[eé]bit|wifi|contrat|combin[eé]|abonn[eé]|ont|box/i.test(txt);
    };

    const fileInputs = Array.from(container.querySelectorAll('input[type="file"]'));
    const poleSlots = [];

    for (const inp of fileInputs) {
      const idName = `${inp.id || ""} ${inp.name || ""} ${inp.getAttribute("formcontrolname") || ""} ${inp.className || ""}`.toLowerCase();
      if (isForbiddenForPoles(idName)) continue;

      const cont = (typeof inp.closest === "function" ? inp.closest(".upload-box, [class*='upload'], .dropzone, [class*='drop'], div") : null) || inp.parentElement;
      const containerText = getCleanElementText(cont).toLowerCase();
      if (isForbiddenForPoles(containerText)) continue;

      // Protection stricte : ne jamais recycler une case expressément marquée comme photo absente
      if (cont && cont.querySelector && cont.querySelector(".chaptech-photo-missing-badge")) {
        continue;
      }

      // Vérifier si l'input se situe après le titre "Poteaux" dans le document
      let isAfterHeader = false;
      if (poteauxTitle && typeof poteauxTitle.compareDocumentPosition === "function") {
        try {
          const pos = poteauxTitle.compareDocumentPosition(inp);
          isAfterHeader = Boolean(pos & 4); // Node.DOCUMENT_POSITION_FOLLOWING = 4
        } catch {
          isAfterHeader = true;
        }
      } else {
        isAfterHeader = true;
      }

      const isExplicitPole = idName.includes("poteau") || containerText.includes("poteau") || containerText.includes("appui") || idName.includes("pole") || containerText.includes("pole");

      if (isExplicitPole || (isAfterHeader && !isForbiddenForPoles(containerText))) {
        const row = (typeof inp.closest === "function" ? inp.closest(".row, .form-row, [class*='row'], .card-body, .col-12, [class*='item']") : null) || cont?.parentElement || cont;
        poleSlots.push({
          input: inp,
          container: cont,
          row,
        });
      }
    }

    return poleSlots;
  }

  // Injecte automatiquement les coordonnées GPS d'un poteau dans la case de coordonnées CelPros
  function injectPoleCoordinates(slot, pole) {
    if (!slot || !pole) return false;
    if (pole.lat == null || pole.lng == null) return false;

    const latVal = Number(pole.lat).toFixed(6);
    const lngVal = Number(pole.lng).toFixed(6);
    const combinedVal = `${latVal}, ${lngVal}`;

    const container = slot.container || slot.input?.parentElement;
    if (!container) return false;

    // 1. Chercher en priorité dans la boîte / conteneur immédiat de ce poteau
    let inputs = Array.from(
      container.querySelectorAll('input:not([type="file"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])')
    );

    // 2. Si pas trouvé, remonter au parent direct ou à la ligne (slot.row) uniquement s'il n'englobe pas d'autres slots de fichiers
    if (inputs.length === 0) {
      const candidates = [container.parentElement, slot.row].filter(Boolean);
      for (const parent of candidates) {
        const otherFileInputs = parent.querySelectorAll ? parent.querySelectorAll('input[type="file"]') : [];
        if (otherFileInputs.length <= 1) {
          const found = Array.from(
            parent.querySelectorAll('input:not([type="file"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])')
          );
          if (found.length > 0) {
            inputs = found;
            break;
          }
        }
      }
    }

    if (inputs.length === 0) return false;

    // Cas 1 : Exactement 1 champ texte (Cas standard CelPros : champ "Coordonnées GPS" ou "GPS")
    if (inputs.length === 1) {
      setNativeFieldValue(inputs[0], combinedVal);
      return true;
    }

    // Cas 2 : Plusieurs champs (séparation Latitude / Longitude)
    let filledLat = false;
    let filledLng = false;

    for (const inp of inputs) {
      const idName = `${inp.id || ""} ${inp.name || ""} ${inp.getAttribute("formcontrolname") || ""} ${inp.placeholder || ""}`.toLowerCase();
      const prevText = (inp.previousElementSibling?.textContent || "").toLowerCase();
      const parentText = (inp.parentElement?.textContent || "").toLowerCase();
      const labelText = (inp.labels && inp.labels[0]?.textContent || "").toLowerCase();
      const combined = `${idName} ${prevText} ${parentText} ${labelText}`;

      if (!filledLat && (combined.includes("lat") || combined.includes("latitude"))) {
        setNativeFieldValue(inp, latVal);
        filledLat = true;
      } else if (!filledLng && (combined.includes("lng") || combined.includes("lon") || combined.includes("longitude"))) {
        setNativeFieldValue(inp, lngVal);
        filledLng = true;
      }
    }

    if (!filledLat && !filledLng) {
      if (inputs.length === 2) {
        setNativeFieldValue(inputs[0], latVal);
        setNativeFieldValue(inputs[1], lngVal);
        return true;
      } else {
        setNativeFieldValue(inputs[0], combinedVal);
        return true;
      }
    }

    return filledLat || filledLng;
  }

  // Gère l'ajout et l'injection des photos de poteaux géolocalisés et "Autre poteau" (uniquement si elles existent)
  async function handlePoteauxPhotos(interventionData, root = (typeof document !== "undefined" ? document : null), missingInputs = new Set(), processedInputs = new Set(), options = {}) {
    const details = [];
    if (!root || !interventionData) return details;
    const isCancelled = typeof options?.shouldAbort === "function" ? options.shouldAbort : () => false;
    if (isCancelled()) return details;

    const allPoles = collectAllPoles(interventionData);
    if (!allPoles.length) return details;

    // Détection de la section Poteaux (spécifique à l'Étape 4)
    const poteauxTitle = findPoteauxTitle(root);
    if (!poteauxTitle) return details;

    const section = findPoteauxSection(root) || root;
    const maxPoles = Math.min(10, allPoles.length);

    const getPoleSlots = () => findExistingPoleSlots(section, poteauxTitle);

    // Cas 1 : Si un input file unique avec attribut multiple existe déjà dans la section
    const existingSlots = getPoleSlots();
    const multipleSlot = existingSlots.find((s) => s.input && s.input.multiple && !missingInputs.has(s.input) && !processedInputs.has(s.input));
    if (multipleSlot) {
      const poleFiles = [];
      for (let i = 0; i < maxPoles; i++) {
        if (isCancelled()) return details;
        const f = await srcToFile(allPoles[i].src, allPoles[i].name);
        if (isCancelled()) return details;
        if (f) poleFiles.push(f);
      }
      if (poleFiles.length > 0) {
        try {
          const dt = new DataTransfer();
          for (const f of poleFiles) dt.items.add(f);
          multipleSlot.input.files = dt.files;
          multipleSlot.input.dispatchEvent(new Event("input", { bubbles: true }));
          multipleSlot.input.dispatchEvent(new Event("change", { bubbles: true }));
          processedInputs.add(multipleSlot.input);
          for (let i = 0; i < poleFiles.length; i++) {
            details.push({
              slot: `poteau_${i + 1}`,
              label: allPoles[i].label,
              fileName: poleFiles[i].name,
              category: allPoles[i].isAutrePoteau ? "autre_poteau" : "poteau",
              isAutrePoteau: Boolean(allPoles[i].isAutrePoteau),
              sizeKb: Math.round(poleFiles[i].size / 1024),
              gps: allPoles[i].lat != null && allPoles[i].lng != null ? `${Number(allPoles[i].lat).toFixed(6)}, ${Number(allPoles[i].lng).toFixed(6)}` : undefined,
            });
          }
          return details;
        } catch {}
      }
    }

    // Cas 2 : Slots dynamiques unitaires (appuyer sur '+' pour faire apparaître chaque case)
    let addPoleButtonFailed = false;
    for (let i = 0; i < maxPoles; i++) {
      if (isCancelled()) break;
      const pole = allPoles[i];
      if (!pole || !pole.src) continue;

      let slots = getPoleSlots();

      // Si aucun slot disponible à l'index i, chercher le bouton '+' SANS RISQUE D'UPLOAD
      if (slots.length <= i && !addPoleButtonFailed) {
        const addBtn = findAddPoleButton(section, root);
        if (addBtn && !isFileUploadTrigger(addBtn)) {
          const prevCount = slots.length;
          await suppressNativeFileDialogAsync(async () => {
            if (isCancelled()) return;
            robustClick(addBtn);

            // Scrutation active courte (maximum 600ms au lieu de 1500ms)
            const start = Date.now();
            while (Date.now() - start < 600) {
              if (isCancelled()) break;
              await new Promise((resolve) => setTimeout(resolve, 80));
              slots = getPoleSlots();
              if (slots.length > prevCount) {
                break;
              }
            }
          });
          if (isCancelled()) break;

          // Si le clic n'a pas augmenté le nombre de slots, désactiver immédiatement pour tous les poteaux suivants
          if (slots.length <= prevCount) {
            addPoleButtonFailed = true;
          }
        } else {
          addPoleButtonFailed = true;
        }
      }

      // RÈGLE ABSOLUE DE SÉQUENCE :
      // Le poteau à l'indice i doit être injecté UNIQUEMENT dans le slot à l'indice i !
      // Ne JAMAIS se rabattre sur slots.find(...) qui ré-injectait Poteau 1 en boucle sur le premier slot.
      const targetSlot = slots[i];
      if (targetSlot && targetSlot.input) {
        if (missingInputs.has(targetSlot.input) || processedInputs.has(targetSlot.input)) {
          continue;
        }

        const file = await srcToFile(pole.src, pole.name);
        if (isCancelled()) break;
        if (file) {
          const container = targetSlot.container;
          if (container && container.dataset) container.dataset.chaptechPoleSlot = "true";
          if (targetSlot.input && targetSlot.input.dataset) targetSlot.input.dataset.chaptechPoleSlot = "true";

          const ok = injectFileIntoInput(targetSlot.input, file, container, pole.src);
          if (ok) {
            processedInputs.add(targetSlot.input);
            // Renseigner automatiquement les coordonnées GPS
            injectPoleCoordinates(targetSlot, pole);

            details.push({
              slot: `poteau_${i + 1}`,
              label: pole.label,
              fileName: file.name,
              category: pole.isAutrePoteau ? "autre_poteau" : "poteau",
              isAutrePoteau: Boolean(pole.isAutrePoteau),
              sizeKb: Math.round(file.size / 1024),
              gps: pole.lat != null && pole.lng != null ? `${Number(pole.lat).toFixed(6)}, ${Number(pole.lng).toFixed(6)}` : undefined,
            });
          }
        }
      }
    }

    return details;
  }

  return {
    PHOTO_SLOT_RULES,
    isExcludedFromCelpros,
    getEligibleWhatsappPhotos,
    dataUrlToFile,
    srcToFile,
    injectFileIntoInput,
    findAllUploadContainers,
    identifyPhotoContainer,
    markContainerMissing,
    markContainerSuccess,
    fillPhotosOnPage,
    collectAllPoles,
    findPoteauxSection,
    findPoteauxTitle,
    findAddPoleButton,
    findExistingPoleSlots,
    injectPoleCoordinates,
    handlePoteauxPhotos,
    suppressNativeFileDialog,
    suppressNativeFileDialogAsync,
  };
});
