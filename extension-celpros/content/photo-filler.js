// Photo Filler Engine pour CelPros (Celtiis) et FAT Automation
// Injecte automatiquement les vraies photos d'intervention existantes (points GPS, photos WhatsApp, étiquette ONT, photomètre, contrat)
// dans les zones d'upload de la plateforme CelPros.
// RÈGLE ABSOLUE : N'injecter QUE de vraies photos existantes dans l'intervention réelle.
// Ne JAMAIS injecter de fausses photos, ni réutiliser aveuglément la même photo par index arbitraire.

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

  // Convertit une URL HTTP ou dataURL en File
  async function srcToFile(src, filename = "photo.jpg") {
    if (!src || typeof src !== "string") return null;
    if (src.startsWith("data:")) {
      return dataUrlToFile(src, filename);
    }
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
  const PHOTO_SLOT_RULES = [
    {
      key: "ont_sn",
      label: "Photo numéro de série ONT",
      keywords: ["photo numero de serie", "numero de serie", "photo sn", "sn ont", "ont *", "etiquette ont", "box ont", "photo ont"],
      getPhoto: (data) => {
        // 1. Photo du point Abonné dans points_gps
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const abonne = pts.find((p) => p && (normalizeText(p.type).includes("abonne") || normalizeText(p.type).includes("client") || normalizeText(p.type).includes("ont")) && getPhotoSource(p.photo));
        if (abonne) {
          const src = getPhotoSource(abonne.photo);
          if (src) return { src, name: "etiquette_ont.jpg" };
        }

        // 2. Photo spécifiquement étiquetée ONT dans whatsapp_photos
        const wa = getEligibleWhatsappPhotos(data);
        const ontPhoto = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "ont_sn" || p.type === "ont_sn") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("ont") || desc.includes("sn") || desc.includes("serie") || desc.includes("box") || desc.includes("abonne") || desc.includes("client");
        });
        if (ontPhoto) return { src: getPhotoSource(ontPhoto), name: "ont_sn.jpg" };

        return null;
      },
    },
    {
      key: "fat",
      label: "Image FAT",
      keywords: ["image fat", "photo fat", "boitier fat", "fat *"],
      getPhoto: (data) => {
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const fatPt = pts.find((p) => p && normalizeText(p.type).includes("fat") && getPhotoSource(p.photo));
        if (fatPt) {
          const src = getPhotoSource(fatPt.photo);
          if (src) return { src, name: "fat_raccordement.jpg" };
        }

        const wa = getEligibleWhatsappPhotos(data);
        const fatPhoto = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "fat" || p.type === "fat") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("fat") || desc.includes("pbo");
        });
        if (fatPhoto) return { src: getPhotoSource(fatPhoto), name: "fat.jpg" };

        return null;
      },
    },
    {
      key: "scan_fat",
      label: "Image Scan FAT",
      keywords: ["image scan fat", "scan fat", "code barre fat", "etiquette fat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const scanPhoto = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "scan_fat" || p.type === "scan_fat") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("scan") || desc.includes("code barre") || desc.includes("barcode") || desc.includes("etiquette fat");
        });
        if (scanPhoto) return { src: getPhotoSource(scanPhoto), name: "scan_fat.jpg" };
        return null;
      },
    },
    {
      key: "cable_interne",
      label: "Image entrée câble interne",
      keywords: ["entree cable interne", "cable interne", "image entree cable interne", "interne"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "cable_interne" || p.type === "cable_interne") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("interne");
        });
        if (match) return { src: getPhotoSource(match), name: "cable_interne.jpg" };
        return null;
      },
    },
    {
      key: "cable_externe",
      label: "Image entrée câble externe",
      keywords: ["entree cable externe", "cable externe", "image entree cable externe", "externe"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "cable_externe" || p.type === "cable_externe") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("externe");
        });
        if (match) return { src: getPhotoSource(match), name: "cable_externe.jpg" };
        return null;
      },
    },
    {
      key: "fibre_fat",
      label: "Image fibre au FAT",
      keywords: ["image fibre au fat", "fibre au fat", "fibre fat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "fibre_fat" || p.type === "fibre_fat") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("fibre au fat") || desc.includes("fibre_fat");
        });
        if (match) return { src: getPhotoSource(match), name: "fibre_fat.jpg" };
        return null;
      },
    },
    {
      key: "mesure_fat",
      label: "Image mesure au FAT",
      keywords: ["image mesure au fat", "mesure au fat", "mesure fat", "photometre fat"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "mesure_fat" || p.type === "mesure_fat") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("mesure fat") || desc.includes("photometre fat");
        });
        if (match) return { src: getPhotoSource(match), name: "mesure_fat.jpg" };
        return null;
      },
    },
    {
      key: "mesure_pto",
      label: "Image mesure PTO",
      keywords: ["image mesure pto", "mesure pto", "mesure au pto", "photometre pto"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "mesure_pto" || p.type === "mesure_pto") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("mesure pto") || desc.includes("photometre pto");
        });
        if (match) return { src: getPhotoSource(match), name: "mesure_pto.jpg" };
        return null;
      },
    },
    {
      key: "debit_cable",
      label: "Image test débit câble",
      keywords: ["image test debit cable", "test debit cable", "debit cable"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "debit_cable" || p.type === "debit_cable") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("debit cable") || desc.includes("speedtest cable");
        });
        if (match) return { src: getPhotoSource(match), name: "test_debit_cable.jpg" };
        return null;
      },
    },
    {
      key: "debit_wifi",
      label: "Image test débit Wifi",
      keywords: ["image test debit wifi", "test debit wifi", "debit wifi"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "debit_wifi" || p.type === "debit_wifi") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("debit wifi") || desc.includes("speedtest wifi");
        });
        if (match) return { src: getPhotoSource(match), name: "test_debit_wifi.jpg" };
        return null;
      },
    },
    {
      key: "combine",
      label: "Image combiné",
      keywords: ["image combine", "combine", "photo combine"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "combine" || p.type === "combine") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("combine") && !desc.includes("fiche");
        });
        if (match) return { src: getPhotoSource(match), name: "combine.jpg" };
        return null;
      },
    },
    {
      key: "fiche_combine",
      label: "Image fiche combiné",
      keywords: ["image fiche combine", "fiche combine", "fiche raccordement"],
      getPhoto: (data) => {
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "fiche_combine" || p.type === "fiche_combine") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("fiche combine") || desc.includes("fiche raccordement");
        });
        if (match) return { src: getPhotoSource(match), name: "fiche_combine.jpg" };
        return null;
      },
    },
    {
      key: "contrat_client",
      label: "Photo du contrat client",
      keywords: ["photo du contrat client", "photo contrat", "contrat client", "signature du rapport", "contrat"],
      getPhoto: (data) => {
        if (data?.signature_client && typeof data.signature_client === "string" && data.signature_client.trim().length > 100) {
          return { src: data.signature_client, name: "signature_client.png" };
        }
        const wa = getEligibleWhatsappPhotos(data);
        const match = wa.find((p) => {
          if (!getPhotoSource(p)) return false;
          if (p.slot === "contrat_client" || p.type === "contrat_client") return true;
          const desc = getPhotoDescription(p);
          return desc.includes("contrat") || desc.includes("signature");
        });
        if (match) return { src: getPhotoSource(match), name: "contrat_signe.jpg" };
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
      const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (doc) {
        const badge = doc.createElement("div");
        badge.className = "chaptech-photo-injected-badge";
        badge.innerHTML = `✅ Photo injectée (${fileName})`;
        badge.style.cssText =
          "background: #16a34a; color: #fff; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-top: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.15);";
        container.appendChild(badge);
      }
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

  // Gère l'ajout et l'injection des photos de poteaux géolocalisés (uniquement si elles existent)
  async function handlePoteauxPhotos(interventionData, root = (typeof document !== "undefined" ? document : null)) {
    const details = [];
    if (!root) return details;

    const polePhotos = [];
    const pts = Array.isArray(interventionData?.points_gps) ? interventionData.points_gps : [];
    for (const p of pts) {
      if (p && normalizeText(p.type).includes("poteau")) {
        const src = getPhotoSource(p.photo);
        if (src) {
          polePhotos.push({ src, name: `poteau_${p.numero || polePhotos.length + 1}.jpg` });
        }
      }
    }
    const wa = getEligibleWhatsappPhotos(interventionData);
    for (const p of wa) {
      const src = getPhotoSource(p);
      if (!src) continue;
      const desc = getPhotoDescription(p);
      if (desc.includes("poteau")) {
        if (!polePhotos.some((existing) => existing.src === src)) {
          polePhotos.push({ src, name: `${p.name ? normalizeText(p.name) : "poteau"}.jpg` });
        }
      }
    }

    if (!polePhotos.length) return details;

    // Cherche la section Poteaux
    const headers = Array.from(root.querySelectorAll("h3, h4, strong, div, span"));
    const poteauxHeader = headers.find((h) => (h.innerText || "").toLowerCase().trim() === "poteaux");
    if (!poteauxHeader) return details;

    const section = poteauxHeader.closest ? (poteauxHeader.closest("div, section") || poteauxHeader.parentElement) : poteauxHeader.parentElement;
    if (!section) return details;

    // Injecte sur chaque zone de poteau existante
    const poleSlots = Array.from(section.querySelectorAll(".upload-box, [class*='upload'], [class*='photo'], label, div")).filter(
      (el) => (el.innerText || "").toLowerCase().includes("photo") && (el.clientHeight || 0) > 50
    );

    for (let i = 0; i < Math.min(polePhotos.length, poleSlots.length || 1); i++) {
      const pole = polePhotos[i];
      const slotContainer = poleSlots[i] || section;
      const input = findFileInputForContainer(slotContainer);
      if (input && pole.src) {
        const file = await srcToFile(pole.src, pole.name);
        if (file) {
          const ok = injectFileIntoInput(input, file, slotContainer);
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
    fillPhotosOnPage,
  };
});
