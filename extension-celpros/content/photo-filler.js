// Photo Filler Engine pour CelPros (Celtiis) et FAT Automation
// Injecte automatiquement les photos d'intervention (points GPS, photos WhatsApp, étiquette ONT, photomètre, contrat)
// dans les zones d'upload de la plateforme CelPros.

(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = exports;
  }
  if (typeof define === "function" && define.amd) {
    define([], () => exports);
  }
  if (root) {
    root.PhotoFiller = exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Convertit une data URL base64 en objet File standard
  function dataUrlToFile(dataUrl, filename = "photo.jpg") {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    try {
      const arr = dataUrl.split(",");
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

  // Convertit une URL HTTP ou dataURL en File
  async function srcToFile(src, filename = "photo.jpg") {
    if (!src) return null;
    if (src.startsWith("data:")) {
      return dataUrlToFile(src, filename);
    }
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type || "image/jpeg" });
    } catch (err) {
      console.warn("[PhotoFiller] Erreur fetch srcToFile:", err);
      return null;
    }
  }

  // Règles de reconnaissance des zones d'upload CelPros
  const PHOTO_SLOT_RULES = [
    {
      key: "ont_sn",
      label: "Photo numéro de série ONT",
      keywords: ["photo numero de serie", "numero de serie", "photo sn", "sn ont", "ont *", "etiquette ont", "box ont"],
      getPhoto: (data) => {
        // 1. Photo du point Abonné dans points_gps
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const abonne = pts.find((p) => p && p.type === "Abonné" && p.photo);
        if (abonne?.photo) return { src: abonne.photo, name: "etiquette_ont.jpg" };

        // 2. Première photo de whatsapp_photos
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        const ontPhoto = wa.find((p) => p && (p.url || p.photo));
        if (ontPhoto) return { src: ontPhoto.url || ontPhoto.photo, name: "ont_sn.jpg" };

        return null;
      },
    },
    {
      key: "fat",
      label: "Image FAT",
      keywords: ["image fat", "photo fat", "boitier fat", "fat *"],
      getPhoto: (data) => {
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const fatPt = pts.find((p) => p && p.type === "FAT" && p.photo);
        if (fatPt?.photo) return { src: fatPt.photo, name: "fat_raccordement.jpg" };

        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa[0]) return { src: wa[0].url || wa[0].photo, name: "fat.jpg" };
        return null;
      },
    },
    {
      key: "scan_fat",
      label: "Image Scan FAT",
      keywords: ["image scan fat", "scan fat", "code barre fat", "etiquette fat"],
      getPhoto: (data) => {
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const fatPt = pts.find((p) => p && p.type === "FAT" && p.photo);
        if (fatPt?.photo) return { src: fatPt.photo, name: "scan_fat.jpg" };

        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa[1]) return { src: wa[1].url || wa[1].photo, name: "scan_fat.jpg" };
        return null;
      },
    },
    {
      key: "cable_interne",
      label: "Image entrée câble interne",
      keywords: ["entree cable interne", "cable interne", "image entree cable interne", "interne"],
      getPhoto: (data) => {
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 2) return { src: wa[2].url || wa[2].photo, name: "cable_interne.jpg" };
        if (wa.length > 0) return { src: wa[wa.length - 1].url || wa[wa.length - 1].photo, name: "cable_interne.jpg" };
        return null;
      },
    },
    {
      key: "cable_externe",
      label: "Image entrée câble externe",
      keywords: ["entree cable externe", "cable externe", "image entree cable externe", "externe"],
      getPhoto: (data) => {
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 3) return { src: wa[3].url || wa[3].photo, name: "cable_externe.jpg" };
        if (wa.length > 1) return { src: wa[1].url || wa[1].photo, name: "cable_externe.jpg" };
        return null;
      },
    },
    {
      key: "fibre_fat",
      label: "Image fibre au FAT",
      keywords: ["image fibre au fat", "fibre au fat", "fibre fat"],
      getPhoto: (data) => {
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const fatPt = pts.find((p) => p && p.type === "FAT" && p.photo);
        if (fatPt?.photo) return { src: fatPt.photo, name: "fibre_fat.jpg" };
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa[0]) return { src: wa[0].url || wa[0].photo, name: "fibre_fat.jpg" };
        return null;
      },
    },
    {
      key: "mesure_fat",
      label: "Image mesure au FAT",
      keywords: ["image mesure au fat", "mesure au fat", "mesure fat", "photometre fat"],
      getPhoto: (data) => {
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 4) return { src: wa[4].url || wa[4].photo, name: "mesure_fat.jpg" };
        if (wa.length > 0) return { src: wa[0].url || wa[0].photo, name: "mesure_fat.jpg" };
        return null;
      },
    },
    {
      key: "mesure_pto",
      label: "Image mesure PTO",
      keywords: ["image mesure pto", "mesure pto", "mesure au pto", "photometre pto"],
      getPhoto: (data) => {
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 5) return { src: wa[5].url || wa[5].photo, name: "mesure_pto.jpg" };
        if (wa.length > 1) return { src: wa[wa.length - 1].url || wa[wa.length - 1].photo, name: "mesure_pto.jpg" };
        return null;
      },
    },
    {
      key: "debit_cable",
      label: "Image test débit câble",
      keywords: ["image test debit cable", "test debit cable", "debit cable"],
      getPhoto: (data) => {
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 6) return { src: wa[6].url || wa[6].photo, name: "test_debit_cable.jpg" };
        return null;
      },
    },
    {
      key: "debit_wifi",
      label: "Image test débit Wifi",
      keywords: ["image test debit wifi", "test debit wifi", "debit wifi"],
      getPhoto: (data) => {
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 7) return { src: wa[7].url || wa[7].photo, name: "test_debit_wifi.jpg" };
        return null;
      },
    },
    {
      key: "combine",
      label: "Image combiné",
      keywords: ["image combine", "combine", "photo combine"],
      getPhoto: (data) => {
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 1) return { src: wa[1].url || wa[1].photo, name: "combine.jpg" };
        return null;
      },
    },
    {
      key: "fiche_combine",
      label: "Image fiche combiné",
      keywords: ["image fiche combine", "fiche combine", "fiche raccordement"],
      getPhoto: (data) => {
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 2) return { src: wa[2].url || wa[2].photo, name: "fiche_combine.jpg" };
        return null;
      },
    },
    {
      key: "contrat_client",
      label: "Photo du contrat client",
      keywords: ["photo du contrat client", "photo contrat", "contrat client", "signature du rapport", "contrat"],
      getPhoto: (data) => {
        if (data?.signature_client) return { src: data.signature_client, name: "signature_client.png" };
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
        if (wa.length > 0) return { src: wa[wa.length - 1].url || wa[wa.length - 1].photo, name: "contrat_signe.jpg" };
        return null;
      },
    },
  ];

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
      const el = document.getElementById(label.htmlFor);
      if (el && el.type === "file") return el;
    }

    return null;
  }

  // Injecte un fichier dans un input[type="file"] via DataTransfer
  function injectFileIntoInput(inputEl, file, containerEl = null) {
    if (!inputEl || !file) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputEl.files = dt.files;

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
    container.style.borderColor = "#22c55e";
    container.style.borderWidth = "2px";
    container.style.borderStyle = "solid";
    container.style.backgroundColor = "#f0fdf4";

    // Éviter d'ajouter plusieurs badges
    if (!container.querySelector(".chaptech-photo-injected-badge")) {
      const badge = document.createElement("div");
      badge.className = "chaptech-photo-injected-badge";
      badge.innerHTML = `✅ Photo injectée (${fileName})`;
      badge.style.cssText =
        "background: #16a34a; color: #fff; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-top: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.15);";
      container.appendChild(badge);
    }
  }

  // Identifie la catégorie d'un conteneur d'upload
  function identifyPhotoContainer(container) {
    if (!container) return null;
    const text = (container.innerText || container.textContent || "").toLowerCase();
    const prevText = (container.previousElementSibling?.innerText || "").toLowerCase();
    const parentText = (container.parentElement?.innerText || "").toLowerCase();
    const fullText = `${prevText} ${text} ${parentText}`.replace(/\s+/g, " ");

    for (const rule of PHOTO_SLOT_RULES) {
      for (const kw of rule.keywords) {
        if (fullText.includes(kw.toLowerCase())) {
          return rule;
        }
      }
    }
    return null;
  }

  // Recherche tous les conteneurs d'upload de photo sur la page courante
  function findAllUploadContainers(root = document) {
    const list = [];
    const seen = new Set();

    // 1. Tous les input[type="file"]
    const fileInputs = Array.from(root.querySelectorAll('input[type="file"]'));
    for (const input of fileInputs) {
      const parent = input.closest(".upload-box, .dropzone, [class*='upload'], [class*='photo'], [class*='drop'], div") || input.parentElement;
      if (parent && !seen.has(parent)) {
        seen.add(parent);
        list.push({ container: parent, input });
      }
    }

    // 2. Toutes les zones en pointillés avec texte "photo" ou "importer"
    const dashedBoxes = Array.from(root.querySelectorAll("div, label, section")).filter((el) => {
      if (seen.has(el)) return false;
      const txt = (el.innerText || "").toLowerCase();
      const hasPhotoKeyword = txt.includes("photo") || txt.includes("importer") || txt.includes("appareil photo");
      const isCard = el.clientWidth > 120 && el.clientHeight > 60;
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

  // Fonction principale : remplit automatiquement toutes les photos de la page
  async function fillPhotosOnPage(interventionData, root = document) {
    if (!interventionData || !root) {
      return { success: false, injectedCount: 0, details: [] };
    }

    const uploadSlots = findAllUploadContainers(root);
    const injectedDetails = [];

    for (const slot of uploadSlots) {
      const rule = identifyPhotoContainer(slot.container);
      if (!rule) continue;

      const photoInfo = rule.getPhoto(interventionData);
      if (!photoInfo || !photoInfo.src) continue;

      const file = await srcToFile(photoInfo.src, photoInfo.name);
      if (!file) continue;

      const input = slot.input || findFileInputForContainer(slot.container);
      if (input) {
        const ok = injectFileIntoInput(input, file, slot.container);
        if (ok) {
          injectedDetails.push({
            slot: rule.key,
            label: rule.label,
            fileName: file.name,
            sizeKb: Math.round(file.size / 1024),
          });
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
      details: injectedDetails,
    };
  }

  // Gère l'ajout et l'injection des photos de poteaux géolocalisés
  async function handlePoteauxPhotos(interventionData, root = document) {
    const details = [];
    const pts = Array.isArray(interventionData?.points_gps) ? interventionData.points_gps : [];
    const poles = pts.filter((p) => p && p.type === "Poteau" && p.photo);
    if (!poles.length) return details;

    // Cherche la section Poteaux
    const headers = Array.from(root.querySelectorAll("h3, h4, strong, div, span"));
    const poteauxHeader = headers.find((h) => (h.innerText || "").toLowerCase().trim() === "poteaux");
    if (!poteauxHeader) return details;

    const section = poteauxHeader.closest("div, section") || poteauxHeader.parentElement;
    if (!section) return details;

    // Injecte sur chaque zone de poteau existante
    const poleSlots = Array.from(section.querySelectorAll(".upload-box, [class*='upload'], [class*='photo'], label, div")).filter(
      (el) => (el.innerText || "").toLowerCase().includes("photo") && el.clientHeight > 50
    );

    for (let i = 0; i < Math.min(poles.length, poleSlots.length || 1); i++) {
      const pole = poles[i];
      const slotContainer = poleSlots[i] || section;
      const input = findFileInputForContainer(slotContainer);
      if (input && pole.photo) {
        const file = dataUrlToFile(pole.photo, `poteau_${pole.numero || i + 1}.jpg`);
        if (file) {
          const ok = injectFileIntoInput(input, file, slotContainer);
          if (ok) {
            details.push({
              slot: `poteau_${i + 1}`,
              label: `Poteau ${pole.sous_type || ""} ${pole.numero || i + 1}`,
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
    dataUrlToFile,
    srcToFile,
    injectFileIntoInput,
    findAllUploadContainers,
    identifyPhotoContainer,
    fillPhotosOnPage,
  };
});
