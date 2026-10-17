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
    const seenContainers = new Set();
    const seenInputs = new Set();

    // 1. Tous les input[type="file"]
    const fileInputs = Array.from(root.querySelectorAll('input[type="file"]'));
    for (const input of fileInputs) {
      if (seenInputs.has(input)) continue;
      seenInputs.add(input);
      const parent = input.closest ? input.closest(".upload-box, .dropzone, [class*='upload'], [class*='photo'], [class*='drop'], div") : input.parentElement;
      const targetParent = parent || input.parentElement;
      if (targetParent && !seenContainers.has(targetParent)) {
        seenContainers.add(targetParent);
        list.push({ container: targetParent, input });
      }
    }

    // 2. Toutes les zones en pointillés avec texte "photo" ou "importer"
    const dashedBoxes = Array.from(root.querySelectorAll("div, label, section")).filter((el) => {
      if (seenContainers.has(el)) return false;
      const txt = (el.innerText || "").toLowerCase();
      const hasPhotoKeyword = txt.includes("photo") || txt.includes("importer") || txt.includes("appareil photo");
      const isCard = (el.clientWidth || 0) > 120 && (el.clientHeight || 0) > 60;
      return hasPhotoKeyword && isCard;
    });

    for (const box of dashedBoxes) {
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
  async function fillPhotosOnPage(interventionData, root = (typeof document !== "undefined" ? document : null)) {
    if (!interventionData || !root) {
      return { success: false, injectedCount: 0, missingCount: 0, details: [] };
    }

    const uploadSlots = findAllUploadContainers(root);
    const injectedDetails = [];
    const missingPhotos = [];
    const unmatchedSlots = [];
    const assignedPhotoSources = new Set();
    const processedInputs = new Set();
    const missingInputs = new Set();

    for (const slot of uploadSlots) {
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

      const photoInfo = rule.getPhoto(interventionData);
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
        console.warn(`[PhotoFiller] Photo déjà injectée pour un autre slot, ignorée pour ${rule.key}`);
        continue;
      }

      const file = await srcToFile(photoInfo.src, photoInfo.name);
      if (!file) continue;

      if (input) {
        if (missingInputs.has(input) || processedInputs.has(input)) {
          continue;
        }

        const ok = injectFileIntoInput(input, file, slot.container);
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
            handleSpeedtestAutoFill(slot.container, interventionData, root);
          }

          // Renseigner automatiquement les mesures de puissance (FAT, PTO) associées à la photo
          if (rule.key === "mesure_fat" || rule.key === "mesure_pto") {
            handlePowerAutoFill(slot.container, rule.key, interventionData, root);
          }
        }
      }
    }

    // Injection spécifique pour les poteaux si présents dans Step 4 (en protégeant les slots manquants)
    const polesInjected = await handlePoteauxPhotos(interventionData, root, missingInputs, processedInputs);
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

  // Déclenche un clic hautement compatible avec Angular et les navigateurs modernes
  function robustClick(el) {
    if (!el) return false;
    const target = (typeof el.closest === "function" ? el.closest("button, a, [role='button'], .btn") : null) || el;
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
      return true;
    } catch {
      try {
        if (typeof target.click === "function") target.click();
        return true;
      } catch {}
    }
    return false;
  }

  // Cherche l'élément titre/libellé de la section Poteaux dans CelPros (Étape 4)
  function findPoteauxTitle(root) {
    if (!root) return null;
    const candidates = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6, strong, b, div, span, p, label, section"));

    // 1. Chercher un élément dont le libellé mentionne explicitement "Poteaux" ou "Appuis"
    for (const el of candidates) {
      if (el.children && el.children.length > 3) continue;
      const txt = (el.innerText || el.textContent || "").trim();
      if (/^(?:poteaux|poteaux travers[eé]s|appuis|appuis a[eé]riens)$/i.test(txt) ||
          (/poteaux/i.test(txt) && /max\s*10/i.test(txt))) {
        return el;
      }
    }

    // 2. Recherche textuelle ciblée
    for (const el of candidates) {
      if (el.children && el.children.length > 3) continue;
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
      const card = titleEl.closest(".card, section, fieldset, .form-section, form, div.col-12");
      if (card) return card;
    }
    return titleEl.parentElement?.parentElement || titleEl.parentElement || root;
  }

  // Cherche le bouton '+' pour ajouter un nouveau poteau dans CelPros
  function findAddPoleButton(container, root) {
    const titleEl = findPoteauxTitle(container || root);
    const headerRow = titleEl ? (titleEl.closest ? (titleEl.closest(".d-flex, .row, [class*='row'], div") || titleEl.parentElement) : titleEl.parentElement) : null;
    const areas = [headerRow, container, root].filter(Boolean);

    for (const area of areas) {
      const candidates = Array.from(area.querySelectorAll("button, a, [role='button'], .btn, i, span, svg"));
      for (const el of candidates) {
        const txt = (el.innerText || el.textContent || "").trim();
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        const title = (el.getAttribute("title") || "").toLowerCase();
        const cls = (el.className || (typeof el.className === "string" ? el.className : "")).toLowerCase();

        if (txt === "+" || /^(?:\+\s*|\+[\s\w]*|ajouter|ajouter un poteau|add)$/i.test(txt)) {
          return (typeof el.closest === "function" ? el.closest("button, a, [role='button'], .btn") : null) || el;
        }
        if (aria.includes("ajouter") || aria.includes("add") || aria.includes("plus") ||
            title.includes("ajouter") || title.includes("add") || title.includes("plus")) {
          return (typeof el.closest === "function" ? el.closest("button, a, [role='button'], .btn") : null) || el;
        }
        if (cls.includes("fa-plus") || cls.includes("btn-plus") || cls.includes("plus-icon") || cls.includes("add-btn") || cls.includes("fa-plus-circle")) {
          return (typeof el.closest === "function" ? el.closest("button, a, [role='button'], .btn") : null) || el;
        }
      }
    }
    return null;
  }

  // Récupère et ordonne rigoureusement tous les poteaux à injecter :
  // 1) "Photos de poteaux géolocalisés (CelPros)" triées par numéro (Poteau 1, Poteau 2, ...)
  // 2) "Autres poteaux" situés dans "Boîte à Photos CelPros"
  function collectAllPoles(interventionData) {
    const poles = [];
    const assignedSources = new Set();
    const pts = Array.isArray(interventionData?.points_gps) ? interventionData.points_gps : [];
    const wa = getEligibleWhatsappPhotos(interventionData);

    // 1. Photos de poteaux géolocalisés (CelPros)
    // Extraire tous les numéros présents (1, 2, 3...)
    const poleNums = new Set();
    for (const p of pts) {
      if (p && (p.type === "Poteau" || normalizeText(p.type).includes("poteau"))) {
        const n = Number(p.numero);
        if (!isNaN(n) && n > 0) poleNums.add(n);
      }
    }
    for (const p of wa) {
      const slot = String(p?.slot || "").toLowerCase();
      const m = slot.match(/^poteau_?(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        if (!isNaN(n) && n > 0) poleNums.add(n);
      }
    }

    // Tri strict croissant : Poteau 1, Poteau 2, Poteau 3...
    const sortedNums = Array.from(poleNums).sort((a, b) => a - b);
    for (const num of sortedNums) {
      const gpsPoint = pts.find(
        (p) => p && (p.type === "Poteau" || normalizeText(p.type).includes("poteau")) && Number(p.numero) === num
      );
      const waPhoto = wa.find((p) => {
        const slot = String(p?.slot || "").toLowerCase();
        return slot === `poteau_${num}` || slot === `poteau${num}`;
      });

      const src = getPhotoSource(gpsPoint?.photo) || getPhotoSource(waPhoto?.url) || getPhotoSource(waPhoto?.photo) || getPhotoSource(gpsPoint);
      if (!src || assignedSources.has(src)) continue;

      const lat = gpsPoint?.lat ?? waPhoto?.lat ?? interventionData?.latitude ?? null;
      const lng = gpsPoint?.lng ?? waPhoto?.lng ?? interventionData?.longitude ?? null;
      const precision_m = gpsPoint?.precision_m ?? waPhoto?.precision_m ?? null;

      assignedSources.add(src);
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

    // Points GPS Poteau sans numéro explicite (fallback)
    for (const p of pts) {
      if (p && (p.type === "Poteau" || normalizeText(p.type).includes("poteau"))) {
        const n = Number(p.numero);
        if (isNaN(n) || n <= 0) {
          const src = getPhotoSource(p.photo) || getPhotoSource(p);
          if (src && !assignedSources.has(src)) {
            assignedSources.add(src);
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

    // 2. "Autres poteaux" situés dans "Boîte à Photos CelPros"
    const autresPoles = [];
    for (const p of wa) {
      const src = getPhotoSource(p);
      if (!src || assignedSources.has(src)) continue;

      const slot = String(p?.slot || "").toLowerCase();
      const type = String(p?.type || "").toLowerCase();
      const desc = getPhotoDescription(p);

      if (slot === "autre_poteau" || slot.startsWith("autre_poteau") || type === "autre_poteau" || desc.includes("autre poteau")) {
        autresPoles.push(p);
      }
    }

    autresPoles.forEach((p, idx) => {
      const src = getPhotoSource(p);
      if (!src || assignedSources.has(src)) return;
      assignedSources.add(src);

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
  function findExistingPoleSlots(card, poteauxTitle) {
    if (!card) return [];

    const isForbiddenForPoles = (txt) => {
      return /c[aâ]ble|interne|externe|fat|pto|scan|mesure|d[eé]bit|wifi|contrat|combin[eé]|abonn[eé]|ont|box/i.test(txt);
    };

    const fileInputs = Array.from(card.querySelectorAll('input[type="file"]'));
    const poleSlots = [];

    for (const inp of fileInputs) {
      const idName = `${inp.id || ""} ${inp.name || ""} ${inp.getAttribute("formcontrolname") || ""} ${inp.className || ""}`.toLowerCase();
      if (isForbiddenForPoles(idName)) continue;

      const container = (typeof inp.closest === "function" ? inp.closest(".upload-box, [class*='upload'], .dropzone, div") : null) || inp.parentElement;
      const containerText = (container?.innerText || container?.textContent || "").toLowerCase();
      if (isForbiddenForPoles(containerText)) continue;

      // Protection stricte : ne jamais recycler une case expressément marquée comme photo absente
      if (container && container.querySelector && container.querySelector(".chaptech-photo-missing-badge")) {
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
        const row = (typeof inp.closest === "function" ? inp.closest(".row, .form-row, [class*='row'], .card-body, .col-12, [class*='item']") : null) || container?.parentElement || container;
        poleSlots.push({
          input: inp,
          container,
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

    // 2. Si pas trouvé, remonter au parent direct (ligne du poteau) uniquement s'il n'englobe pas d'autres slots de fichiers
    if (inputs.length === 0 && container.parentElement) {
      const parent = container.parentElement;
      const otherFileInputs = parent.querySelectorAll ? parent.querySelectorAll('input[type="file"]') : [];
      if (otherFileInputs.length <= 1) {
        inputs = Array.from(
          parent.querySelectorAll('input:not([type="file"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])')
        );
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
  async function handlePoteauxPhotos(interventionData, root = (typeof document !== "undefined" ? document : null), missingInputs = new Set(), processedInputs = new Set()) {
    const details = [];
    if (!root || !interventionData) return details;

    const allPoles = collectAllPoles(interventionData);
    if (!allPoles.length) return details;

    // Détection de la section Poteaux
    const poteauxTitle = findPoteauxTitle(root);
    if (!poteauxTitle) return details;

    const section = findPoteauxSection(root) || root;
    const addBtn = findAddPoleButton(section, root);
    const maxPoles = Math.min(10, allPoles.length);

    const getPoleSlots = () => findExistingPoleSlots(section, poteauxTitle);

    // Cas 1 : Si un input file unique avec attribut multiple existe déjà dans la section
    const existingSlots = getPoleSlots();
    const multipleSlot = existingSlots.find((s) => s.input && s.input.multiple && !missingInputs.has(s.input) && !processedInputs.has(s.input));
    if (multipleSlot) {
      const poleFiles = [];
      for (let i = 0; i < maxPoles; i++) {
        const f = await srcToFile(allPoles[i].src, allPoles[i].name);
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
              slot: allPoles[i].isAutrePoteau ? `autre_poteau_${i + 1}` : `poteau_${allPoles[i].numero || i + 1}`,
              label: allPoles[i].label,
              fileName: poleFiles[i].name,
              sizeKb: Math.round(poleFiles[i].size / 1024),
              gps: allPoles[i].lat != null && allPoles[i].lng != null ? `${Number(allPoles[i].lat).toFixed(6)}, ${Number(allPoles[i].lng).toFixed(6)}` : undefined,
            });
          }
          return details;
        } catch {}
      }
    }

    // Cas 2 : Slots dynamiques unitaires (appuyer sur '+' pour faire apparaître chaque case)
    for (let i = 0; i < maxPoles; i++) {
      const pole = allPoles[i];
      if (!pole || !pole.src) continue;

      let slots = getPoleSlots();

      // Si aucun slot disponible à l'index i, cliquer sur '+' et attendre réactivement jusqu'à 2000ms
      if (slots.length <= i && addBtn) {
        const prevCount = slots.length;
        robustClick(addBtn);

        // Scrutation active toutes les 80ms
        const start = Date.now();
        while (Date.now() - start < 2000) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          slots = getPoleSlots();
          if (slots.length > prevCount) {
            break;
          }
        }

        // Retry au bout de 500ms si Angular n'a pas encore réagi
        if (slots.length <= prevCount) {
          robustClick(addBtn);
          await new Promise((resolve) => setTimeout(resolve, 200));
          slots = getPoleSlots();
        }
      }

      // Sélectionner le slot correspondant : jamais un input manquant ni déjà injecté
      const targetSlot = slots[i] || slots.find((s) => s.input && !missingInputs.has(s.input) && !processedInputs.has(s.input) && (!s.input.files || s.input.files.length === 0));
      if (targetSlot && targetSlot.input) {
        if (missingInputs.has(targetSlot.input) || processedInputs.has(targetSlot.input)) {
          continue;
        }

        const file = await srcToFile(pole.src, pole.name);
        if (file) {
          const container = targetSlot.container;
          const ok = injectFileIntoInput(targetSlot.input, file, container);
          if (ok) {
            processedInputs.add(targetSlot.input);
            // Renseigner automatiquement les coordonnées GPS
            injectPoleCoordinates(targetSlot, pole);

            details.push({
              slot: `poteau_${i + 1}`,
              label: pole.label,
              fileName: file.name,
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
  };
});
