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

  // Convertit une URL HTTP ou dataURL en File (avec contournement CSP via Service Worker)
  async function srcToFile(src, filename = "photo.jpg") {
    if (!src || typeof src !== "string") return null;
    if (src.startsWith("data:")) {
      return dataUrlToFile(src, filename);
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
          return dataUrlToFile(resp.dataUrl, filename);
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
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type || "image/jpeg" });
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
    const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
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
        const direct = wa.find((p) => getPhotoSource(p) && (p.slot === "contrat_client" || p.type === "contrat_client"));
        if (direct) return { src: getPhotoSource(direct), name: "contrat_signe.jpg", slot: "contrat_client" };
        const legacy = wa.find((p) => getPhotoSource(p) && p.name && /^(contrat|signature|contrat[-_ ]*client)(\s*\d+)?(\.jpe?g|\.png)?$/i.test(p.name.trim()));
        if (legacy) return { src: getPhotoSource(legacy), name: "contrat_signe.jpg", slot: "contrat_client" };
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

  // Injecte un fichier dans un input[type="file"] via DataTransfer
  function injectFileIntoInput(inputEl, file, containerEl = null) {
    if (!inputEl || !file) return false;
    try {
      let dt = null;
      if (typeof DataTransfer !== "undefined") {
        dt = new DataTransfer();
        dt.items.add(file);
        inputEl.files = dt.files;
      } else {
        inputEl.files = [file];
      }

      // Événements standards pour frameworks réactifs (Angular, React, Vue)
      inputEl.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      inputEl.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));

      // Si le conteneur écoute l'événement drop
      if (containerEl) {
        try {
          const dropEvt = new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          });
          containerEl.dispatchEvent(dropEvt);
        } catch {}

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
    if (existingBadge) {
      existingBadge.innerHTML = `✅ Photo injectée (${fileName})`;
      return;
    }
    const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (doc) {
      const badge = doc.createElement("div");
      badge.className = "chaptech-photo-injected-badge";
      badge.innerHTML = `✅ Photo injectée (${fileName})`;
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
        badge.innerHTML = `⚠️ Photo absente dans FibreTrack : ${label}`;
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
        if (explicitLabel) labelTexts.push(explicitLabel.textContent || "");
      } catch {}
    }

    const innerLabel = container.querySelector("label, h3, h4, h5, strong, [class*='title'], [class*='label']");
    if (innerLabel) labelTexts.push(innerLabel.textContent || "");

    if (container.previousElementSibling) {
      const prev = container.previousElementSibling;
      const tag = prev.tagName?.toLowerCase();
      if (tag === "label" || tag === "span" || tag === "h3" || tag === "h4" || tag === "strong" || tag === "p") {
        labelTexts.push(prev.textContent || "");
      }
    }

    labelTexts.push(container.innerText || container.textContent || "");

    const parent = container.parentElement;
    if (parent && parent.querySelectorAll && parent.querySelectorAll('input[type="file"]').length <= 1) {
      const pLabel = parent.querySelector("label, h3, h4, strong, [class*='title'], [class*='label']");
      if (pLabel && pLabel !== innerLabel) {
        labelTexts.push(pLabel.textContent || "");
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
    const seen = new Set();

    // 1. Tous les input[type="file"]
    const fileInputs = Array.from(root.querySelectorAll('input[type="file"]'));
    for (const input of fileInputs) {
      const parent = input.closest ? input.closest(".upload-box, .dropzone, [class*='upload'], [class*='photo'], [class*='drop'], div") : input.parentElement;
      const targetParent = parent || input.parentElement;
      if (targetParent && !seen.has(targetParent)) {
        seen.add(targetParent);
        list.push({ container: targetParent, input });
      }
    }

    // 2. Toutes les zones en pointillés avec texte "photo" ou "importer"
    const dashedBoxes = Array.from(root.querySelectorAll("div, label, section")).filter((el) => {
      if (seen.has(el)) return false;
      const txt = (el.innerText || "").toLowerCase();
      const hasPhotoKeyword = txt.includes("photo") || txt.includes("importer") || txt.includes("appareil photo");
      const isCard = (el.clientWidth || 0) > 120 && (el.clientHeight || 0) > 60;
      return hasPhotoKeyword && isCard;
    });

    for (const box of dashedBoxes) {
      if (!seen.has(box)) {
        seen.add(box);
        const input = findFileInputForContainer(box);
        list.push({ container: box, input });
      }
    }

    return list;
  }

  // Fonction principale : remplit automatiquement les photos de la page uniquement si elles existent dans l'intervention
  async function fillPhotosOnPage(interventionData, root = (typeof document !== "undefined" ? document : null)) {
    if (!interventionData || !root) {
      return { success: false, injectedCount: 0, missingCount: 0, details: [] };
    }

    const uploadSlots = findAllUploadContainers(root);
    const injectedDetails = [];
    const missingPhotos = [];
    const unmatchedSlots = [];
    const assignedPhotoSources = new Set();

    for (const slot of uploadSlots) {
      const input = slot.input || findFileInputForContainer(slot.container);
      const rule = identifyPhotoContainer(slot.container, input);
      if (!rule) {
        unmatchedSlots.push({
          elementId: input?.id || input?.name || "(sans id)",
          text: (slot.container.innerText || "").slice(0, 50),
        });
        continue;
      }

      const photoInfo = rule.getPhoto(interventionData);
      if (!photoInfo || !photoInfo.src) {
        // La case existe dans CelPros mais aucune photo n'a été prise pour ce slot dans FibreTrack
        missingPhotos.push({
          slot: rule.key,
          label: rule.label,
          celprosLabel: rule.celprosLabel || rule.label,
        });
        markContainerMissing(slot.container, rule.label);
        continue;
      }

      // Éviter d'injecter la même photo dans plusieurs slots différents par erreur
      if (assignedPhotoSources.has(photoInfo.src)) {
        console.warn(`[PhotoFiller] Photo déjà injectée pour un autre slot, ignorée pour ${rule.key}`);
        continue;
      }

      const file = await srcToFile(photoInfo.src, photoInfo.name);
      if (!file) continue;

      if (input) {
        const ok = injectFileIntoInput(input, file, slot.container);
        if (ok) {
          assignedPhotoSources.add(photoInfo.src);
          injectedDetails.push({
            slot: rule.key,
            label: rule.label,
            fileName: file.name,
            sizeKb: Math.round(file.size / 1024),
          });

          // Renseigner automatiquement les débits (Montant, Descendant, Ping) associés à la photo
          if (rule.key === "debit_wifi" || rule.key === "debit_cable") {
            handleSpeedtestAutoFill(slot.container, interventionData, root);
          }
        }
      }
    }

    // Injection spécifique pour les poteaux si présents dans Step 4
    const polesInjected = await handlePoteauxPhotos(interventionData, root);
    injectedDetails.push(...polesInjected);

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
    let stringValue = String(value).replace(",", ".").trim();
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

    const inputs = Array.from(searchRoot.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"])'));

    for (const inp of inputs) {
      const idName = `${inp.id || ""} ${inp.name || ""} ${inp.getAttribute("formcontrolname") || ""} ${inp.placeholder || ""}`.toLowerCase();
      const prevText = (inp.previousElementSibling?.textContent || "").toLowerCase();
      const parentText = (inp.parentElement?.textContent || "").toLowerCase();
      const combined = `${idName} ${prevText} ${parentText}`;

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
  }

  // Cherche le bouton '+' pour ajouter un nouveau poteau dans CelPros
  function findAddPoleButton(section) {
    if (!section) return null;
    const candidates = Array.from(section.querySelectorAll("button, a, [role='button'], .btn, i, span"));
    for (const el of candidates) {
      const txt = (el.innerText || el.textContent || "").trim();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const cls = (el.className || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();

      if (txt === "+" || txt.includes("ajouter") || aria.includes("ajouter") || title.includes("ajouter") || aria.includes("add") || title.includes("add")) {
        return el.closest("button, a, [role='button']") || el;
      }
      if (cls.includes("add") || cls.includes("plus") || cls.includes("fa-plus")) {
        return el.closest("button, a, [role='button']") || el;
      }
    }
    return null;
  }

  // Gère l'ajout et l'injection des photos de poteaux géolocalisés et "Autre poteau" (uniquement si elles existent)
  async function handlePoteauxPhotos(interventionData, root = (typeof document !== "undefined" ? document : null)) {
    const details = [];
    if (!root) return details;

    const polePhotos = [];
    // 1. Poteaux issus du relevé GPS
    const pts = Array.isArray(interventionData?.points_gps) ? interventionData.points_gps : [];
    for (const p of pts) {
      if (p && normalizeText(p.type).includes("poteau")) {
        const src = getPhotoSource(p.photo);
        if (src && !polePhotos.some((existing) => existing.src === src)) {
          polePhotos.push({ src, name: `poteau_${p.numero || polePhotos.length + 1}.jpg` });
        }
      }
    }

    // 2. Photos du dossier "Autre poteau" de FibreTrack
    const wa = getEligibleWhatsappPhotos(interventionData);
    for (const p of wa) {
      const src = getPhotoSource(p);
      if (!src) continue;
      const desc = getPhotoDescription(p);
      const slot = String(p.slot || "").toLowerCase();
      const type = String(p.type || "").toLowerCase();
      if (slot === "autre_poteau" || slot.startsWith("autre_poteau") || type === "autre_poteau" || desc.includes("autre poteau") || desc.includes("poteau")) {
        if (!polePhotos.some((existing) => existing.src === src)) {
          polePhotos.push({ src, name: `${p.name ? normalizeText(p.name) : (slot.startsWith("autre_poteau") ? slot : "poteau")}.jpg` });
        }
      }
    }

    if (!polePhotos.length) return details;

    // Cherche la section Poteaux
    const headers = Array.from(root.querySelectorAll("h3, h4, strong, div, span"));
    const poteauxHeader = headers.find((h) => {
      const txt = (h.innerText || h.textContent || "").toLowerCase().trim();
      return txt === "poteaux" || txt === "poteaux traverses" || txt === "appuis";
    });
    if (!poteauxHeader) return details;

    const section = poteauxHeader.closest ? (poteauxHeader.closest("div, section") || poteauxHeader.parentElement) : poteauxHeader.parentElement;
    if (!section) return details;

    const isForbiddenForPoles = (txt) => {
      return /c[aâ]ble|interne|externe|fat|pto|scan|mesure|d[eé]bit|wifi|contrat|combin[eé]|abonn[eé]|ont|box/i.test(txt);
    };

    const maxPoles = Math.min(10, polePhotos.length);

    for (let i = 0; i < maxPoles; i++) {
      const pole = polePhotos[i];
      if (!pole || !pole.src) continue;

      // 1. Chercher un input disponible et non rempli dans la section
      let allInputs = Array.from(section.querySelectorAll('input[type="file"]')).filter((inp) => {
        const idName = `${inp.id || ""} ${inp.name || ""} ${inp.getAttribute("formcontrolname") || ""}`.toLowerCase();
        return !isForbiddenForPoles(idName);
      });

      let emptyInput = allInputs.find((inp) => !inp.files || inp.files.length === 0);

      // 2. Si aucun input libre n'est présent dans CelPros, cliquer sur le bouton '+' pour ajouter un nouveau slot
      if (!emptyInput) {
        const addBtn = findAddPoleButton(section);
        if (addBtn) {
          try {
            addBtn.click();
            // Délai pour laisser Angular FormArray instancier le nouveau slot
            await new Promise((resolve) => setTimeout(resolve, 200));
          } catch {}

          allInputs = Array.from(section.querySelectorAll('input[type="file"]')).filter((inp) => {
            const idName = `${inp.id || ""} ${inp.name || ""} ${inp.getAttribute("formcontrolname") || ""}`.toLowerCase();
            return !isForbiddenForPoles(idName);
          });
          emptyInput = allInputs.find((inp) => !inp.files || inp.files.length === 0);
        }
      }

      const targetInput = emptyInput || allInputs[i];
      if (targetInput && (!targetInput.files || targetInput.files.length === 0)) {
        const file = await srcToFile(pole.src, pole.name);
        if (file) {
          const container = targetInput.closest ? (targetInput.closest(".upload-box, [class*='upload'], div") || targetInput.parentElement) : targetInput.parentElement;
          const ok = injectFileIntoInput(targetInput, file, container);
          if (ok) {
            details.push({
              slot: `poteau_${i + 1}`,
              label: `Poteau ${i + 1}`,
              fileName: file.name,
              sizeKb: Math.round(file.size / 1024),
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
  };
});
