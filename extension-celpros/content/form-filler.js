// Form Filler Engine pour CelPros (Celtiis) et FAT Automation
// Remplissage réactif, résilient et compatible avec les SPA (Angular, React, Vue, JHipster)

(function (root, factory) {
  const getMapping = () => {
    if (typeof root !== "undefined" && root && root.FieldMapping) return root.FieldMapping;
    if (typeof globalThis !== "undefined" && globalThis.FieldMapping) return globalThis.FieldMapping;
    try {
      return require("./field-mapping.js");
    } catch {
      return null;
    }
  };

  const getPhotoFiller = () => {
    if (typeof root !== "undefined" && root && root.PhotoFiller) return root.PhotoFiller;
    if (typeof globalThis !== "undefined" && globalThis.PhotoFiller) return globalThis.PhotoFiller;
    try {
      return require("./photo-filler.js");
    } catch {
      return null;
    }
  };

  const exports = factory(getMapping(), getPhotoFiller());
  if (typeof module === "object" && module && module.exports) {
    module.exports = exports;
  }
  if (typeof define === "function" && define.amd) {
    define([], () => exports);
  }
  if (root) {
    root.FormFiller = exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (FieldMapping, PhotoFiller) {
  "use strict";

  // Injection d'une valeur dans un champ texte / nombre / textarea avec contournement des prototypes React/Angular
  function setNativeInputValue(element, value) {
    if (!element) return;
    let stringValue = value !== null && value !== undefined ? String(value) : "";
    const type = (element.getAttribute("type") || "").toLowerCase();
    if (type === "number") {
      stringValue = stringValue.replace(",", ".");
    }

    const prototype = Object.getPrototypeOf(element);
    let descriptor = null;

    if (element instanceof (typeof HTMLTextAreaElement !== "undefined" ? HTMLTextAreaElement : Object)) {
      descriptor = Object.getOwnPropertyDescriptor(
        typeof HTMLTextAreaElement !== "undefined" ? HTMLTextAreaElement.prototype : prototype,
        "value"
      );
    } else {
      descriptor = Object.getOwnPropertyDescriptor(
        typeof HTMLInputElement !== "undefined" ? HTMLInputElement.prototype : prototype,
        "value"
      );
    }

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, stringValue);
    } else {
      element.value = stringValue;
    }

    // Déclenchement des événements dans l'ordre attendu par les frameworks réactifs
    element.dispatchEvent(new Event("focus", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // Définition d'une case à cocher (checkbox)
  function setNativeCheckboxValue(element, shouldCheck) {
    if (!element) return;
    const isChecked = Boolean(shouldCheck);

    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(
      typeof HTMLInputElement !== "undefined" ? HTMLInputElement.prototype : prototype,
      "checked"
    );

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, isChecked);
    } else {
      element.checked = isChecked;
    }

    element.dispatchEvent(new Event("focus", { bubbles: true }));
    element.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // Sélection d'une option dans une liste déroulante <select>
  function setNativeSelectValue(selectElement, targetValue) {
    if (!selectElement || !selectElement.options) return false;
    if (targetValue === null || targetValue === undefined || targetValue === "") return false;
    const fm = FieldMapping || (typeof globalThis !== "undefined" && globalThis.FieldMapping);
    const targetNorm = fm ? fm.normalizeText(String(targetValue)) : String(targetValue).toLowerCase().trim();
    if (!targetNorm) return false;

    let matchedIndex = -1;

    // 1. Recherche par valeur exacte
    for (let i = 0; i < selectElement.options.length; i++) {
      const opt = selectElement.options[i];
      const optValNorm = fm ? fm.normalizeText(opt.value) : (opt.value || "").toLowerCase().trim();
      if (opt.value && optValNorm === targetNorm) {
        matchedIndex = i;
        break;
      }
    }

    // 2. Recherche par libellé d'option exact
    if (matchedIndex === -1) {
      for (let i = 0; i < selectElement.options.length; i++) {
        const opt = selectElement.options[i];
        const optTextNorm = fm ? fm.normalizeText(opt.textContent) : (opt.textContent || "").toLowerCase().trim();
        if (optTextNorm === targetNorm) {
          matchedIndex = i;
          break;
        }
      }
    }

    // 3. Recherche floue / inclusion
    if (matchedIndex === -1) {
      for (let i = 0; i < selectElement.options.length; i++) {
        const opt = selectElement.options[i];
        const textNorm = fm ? fm.normalizeText(opt.textContent) : (opt.textContent || "").toLowerCase().trim();
        const valNorm = fm ? fm.normalizeText(opt.value) : (opt.value || "").toLowerCase().trim();
        if ((textNorm && textNorm.includes(targetNorm)) || (targetNorm && targetNorm.includes(textNorm))) {
          matchedIndex = i;
          break;
        }
        if ((valNorm && valNorm.includes(targetNorm)) || (targetNorm && targetNorm.includes(valNorm))) {
          matchedIndex = i;
          break;
        }
      }
    }

    if (matchedIndex >= 0) {
      selectElement.selectedIndex = matchedIndex;
      selectElement.value = selectElement.options[matchedIndex].value;

      selectElement.dispatchEvent(new Event("focus", { bubbles: true }));
      selectElement.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      selectElement.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      selectElement.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }

    return false;
  }

  // Gestion des groupes de boutons radio (ex: Oui/Non, ou choix d'offre)
  function handleRadioGroup(radioElement, targetValue) {
    if (!radioElement || !radioElement.name) return false;
    const name = radioElement.name;
    const doc = radioElement.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (!doc) return false;

    const escapedName = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name) : name;
    const radios = doc.querySelectorAll(`input[type="radio"][name="${escapedName}"]`);
    if (!radios.length) return false;

    const isTargetBool = typeof targetValue === "boolean";
    const targetNorm = isTargetBool ? (targetValue ? "oui" : "non") : FieldMapping.normalizeText(String(targetValue));

    for (const radio of radios) {
      const label = FieldMapping.getElementLabelText(radio);
      const labelNorm = FieldMapping.normalizeText(label);
      const valNorm = FieldMapping.normalizeText(radio.value);

      let isMatch = false;

      if (isTargetBool) {
        if (targetValue) {
          // Chercher radio correspondant à Oui / True / 1
          isMatch = labelNorm === "oui" || labelNorm === "yes" || valNorm === "1" || valNorm === "true" || valNorm === "oui";
        } else {
          // Chercher radio correspondant à Non / False / 0
          isMatch = labelNorm === "non" || labelNorm === "no" || valNorm === "0" || valNorm === "false" || valNorm === "non";
        }
      } else {
        isMatch = labelNorm === targetNorm || valNorm === targetNorm || (labelNorm && labelNorm.includes(targetNorm));
      }

      if (isMatch) {
        setNativeCheckboxValue(radio, true);
        return true;
      }
    }

    return false;
  }

  // Application de la surbrillance visuelle verte sur le champ rempli
  function applyHighlight(element) {
    if (!element || !element.classList) return;
    if (element.classList.add) element.classList.add("celpros-filled-highlight");
    const timer = setTimeout(() => {
      if (element.classList && element.classList.remove) {
        element.classList.remove("celpros-filled-highlight");
      }
    }, 4000);
    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }
  }

  // Écoute des modifications utilisateur pour protéger les modifications manuelles légitimes
  function trackElementChanges(element) {
    if (!element || element._chaptechTracked) return;
    element._chaptechTracked = true;
    const markModified = () => {
      const filledVal = element.dataset ? element.dataset.chaptechFilledValue : undefined;
      const currentVal = element.type === "checkbox" ? String(element.checked) : String(element.value);
      if (element.dataset) {
        if (filledVal !== undefined && currentVal !== filledVal) {
          element.dataset.chaptechUserModified = "true";
        }
      }
    };
    if (element.addEventListener) {
      element.addEventListener("input", markModified);
      element.addEventListener("change", markModified);
    }
  }

  // Vérifie si un élément a été manuellement modifié par l'utilisateur
  function isElementUserModified(element) {
    if (!element || !element.dataset) return false;
    return element.dataset.chaptechUserModified === "true";
  }

  // Remplissage d'un élément unitaire à partir d'une valeur (avec protection des saisies manuelles)
  function fillElement(element, value, _definition, options = {}) {
    if (!element || value === undefined || value === null) return false;

    // Protection des modifications manuelles de l'utilisateur
    if (!options.forceOverwrite && isElementUserModified(element)) {
      return false;
    }

    const tagName = element.tagName ? element.tagName.toLowerCase() : "";
    const inputType = (element.getAttribute && element.getAttribute("type") ? element.getAttribute("type") : "text").toLowerCase();

    let filled = false;

    if (tagName === "select") {
      filled = setNativeSelectValue(element, value);
    } else if (tagName === "textarea") {
      setNativeInputValue(element, value);
      filled = true;
    } else if (inputType === "checkbox") {
      const boolVal = typeof value === "boolean" ? value : Boolean(value && value !== "0" && value !== "false");
      setNativeCheckboxValue(element, boolVal);
      filled = true;
    } else if (inputType === "radio") {
      filled = handleRadioGroup(element, value);
    } else {
      setNativeInputValue(element, value);
      filled = true;
    }

    if (filled) {
      applyHighlight(element);
      if (element.dataset) {
        element.dataset.chaptechFilledValue = inputType === "checkbox" ? String(element.checked) : String(element.value);
        element.dataset.chaptechFilledKey = _definition?.key || "";
        element.dataset.chaptechFilledAt = String(Date.now());
        element.dataset.chaptechUserModified = "false";
      }
      trackElementChanges(element);
    }

    return filled;
  }

  // Détection de l'étape courante dans le wizard CelPros (1 à 5)
  function detectCurrentStep(root = (typeof document !== "undefined" ? document : null)) {
    if (!root) return 1;

    // 1. Recherche des puces numérotées du stepper (ex: cercles 1, 2, 3, 4, 5)
    const stepIndicators = Array.from(root.querySelectorAll(".step, .stepper, [class*='step'], [class*='wizard'] li, [class*='wizard'] div"));
    for (const el of stepIndicators) {
      const cls = (el.className || "").toLowerCase();
      const isSelected = cls.includes("active") || cls.includes("current") || cls.includes("selected");
      if (isSelected) {
        const txt = el.innerText?.trim();
        const num = parseInt(txt);
        if (num >= 1 && num <= 5) return num;
      }
    }

    // 2. Détection par le contenu textuel des rubriques de chaque étape
    const docText = (root.body || root).innerText || "";
    if (docText.includes("Signature du rapport") || docText.includes("Contrat client")) return 5;
    if (docText.includes("Rattachement") || docText.includes("Branchement") || docText.includes("Valeur au FAT")) return 4;
    if (docText.includes("Tests de débits") || docText.includes("Tests de services")) return 3;
    if (docText.includes("Matériels livrés") || docText.includes("Accessoires") || docText.includes("GPS FAT")) return 2;
    if (docText.includes("Interlocuteur") || docText.includes("Configurations")) return 1;

    return 1;
  }

  // Fonction principale : balayage, pré-remplissage complet de la page et injection des photos
  async function autofillPage(interventionData, root = (typeof document !== "undefined" ? document : null), options = {}) {
    if (!root || !interventionData) {
      return { success: false, filledCount: 0, photosInjected: 0, error: "Racine DOM ou données d'intervention manquantes" };
    }

    const currentStep = detectCurrentStep(root);

    // 1. Remplissage des champs textuels, numériques, selects, radios, checkboxes
    const selector = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"])',
      "select",
      "textarea",
    ].join(", ");

    const elements = Array.from(root.querySelectorAll(selector));
    const processedRadioGroups = new Set();
    const filledDetails = [];
    const preservedDetails = [];
    const unmatchedElements = [];

    for (const el of elements) {
      // Éviter de re-traiter plusieurs fois le même groupe de boutons radio
      if (el.type === "radio" && el.name) {
        if (processedRadioGroups.has(el.name)) continue;
        processedRadioGroups.add(el.name);
      }

      // Appariement intelligent du champ (avec support des matériels dynamiques réels)
      const match = FieldMapping.matchElementToField(el, interventionData);

      if (match && match.definition) {
        const { definition } = match;
        const val = definition.valueExtractor(interventionData);

        // Si le champ a été modifié manuellement par l'utilisateur, ne pas l'écraser
        if (isElementUserModified(el) && !options.forceOverwrite) {
          preservedDetails.push({
            key: definition.key,
            label: definition.label,
            category: definition.category,
            currentValue: el.type === "checkbox" ? el.checked : el.value,
            ftValue: val,
            elementId: el.id || el.name || "(sans id)",
          });
          continue;
        }

        // RÈGLE ABSOLUE : Si la valeur n'est pas renseignée (vide, null, undefined, false),
        // NE PAS remplir le champ sur CelPros (le laisser intact/vide).
        if (val !== undefined && val !== null && val !== "" && val !== false) {
          const filled = fillElement(el, val, definition, options);
          if (filled) {
            filledDetails.push({
              key: definition.key,
              label: definition.label,
              category: definition.category,
              value: val,
              elementId: el.id || el.name || "(sans id)",
            });
          }
        }
      } else {
        unmatchedElements.push({
          id: el.id || "",
          name: el.name || "",
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          label: FieldMapping.getElementLabelText(el).slice(0, 50),
        });
      }
    }

    // 2. Injection automatique des photos correspondantes
    let photoReport = { totalSlotsFound: 0, injectedCount: 0, missingCount: 0, details: [] };
    const pf = PhotoFiller || (typeof globalThis !== "undefined" && globalThis.PhotoFiller) || (typeof window !== "undefined" && window.PhotoFiller);
    if (pf && typeof pf.fillPhotosOnPage === "function") {
      try {
        photoReport = await pf.fillPhotosOnPage(interventionData, root);
      } catch (err) {
        console.warn("[FormFiller] Erreur lors de l'injection des photos:", err);
      }
    }

    return {
      success: true,
      currentStep,
      totalScanned: elements.length,
      filledCount: filledDetails.length,
      filledDetails,
      preservedCount: preservedDetails.length,
      preservedDetails,
      photosInjected: photoReport.injectedCount || 0,
      photoDetails: photoReport.details || [],
      missingPhotosCount: photoReport.missingCount || 0,
      missingPhotos: photoReport.missingPhotos || [],
      totalPhotoSlotsFound: photoReport.totalSlotsFound || 0,
      unmatchedElements,
    };
  }

  function fmt2(n) {
    const num = Number(n ?? 0);
    if (isNaN(num)) return "00";
    return num < 10 ? `0${num}` : String(num);
  }

  function toIsoDate(dateVal) {
    if (!dateVal) return new Date().toISOString().slice(0, 10);
    const dObj = new Date(dateVal);
    if (isNaN(dObj.getTime())) return String(dateVal).slice(0, 10);
    return dObj.toISOString().slice(0, 10);
  }

  function toFrDate(dateVal) {
    if (!dateVal) {
      const now = new Date();
      return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    }
    const dObj = new Date(dateVal);
    if (isNaN(dObj.getTime())) return String(dateVal);
    return `${String(dObj.getDate()).padStart(2, "0")}/${String(dObj.getMonth() + 1).padStart(2, "0")}/${dObj.getFullYear()}`;
  }

  function formatMsanFat(msan, fatRef) {
    const m = (msan || "").trim();
    const f = (fatRef || "").trim();
    if (!m && !f) return "";
    if (!m) return f.toUpperCase().includes("FAT") ? f : `FAT${f}`;
    if (!f) return m;

    // Si fatRef contient déjà le msan (ex: "SEM-PL02  FAT191" ou "SEM-PL02 FAT191")
    if (f.toLowerCase().includes(m.toLowerCase())) {
      return f.replace(new RegExp(`(${m})\\s*(FAT)`, "i"), "$1  $2");
    }
    // Si msan contient déjà fatRef
    if (m.toLowerCase().includes(f.toLowerCase())) {
      return m;
    }
    const fLabel = f.toUpperCase().startsWith("FAT") ? f : `FAT${f}`;
    return `${m}  ${fLabel}`;
  }

  function fmtMeter(v, fallback = 0) {
    const num = Number(v !== undefined && v !== null && v !== "" ? v : fallback);
    return isNaN(num) ? `${v}m` : `${num.toFixed(1)}m`;
  }

  function fmtPower(v, defaultVal = "") {
    if (v === undefined || v === null || v === "") return defaultVal ? `${defaultVal} dBm` : "";
    let num = Number(v);
    if (isNaN(num)) return `${v} dBm`;
    if (num > 0) num = -num;
    return `${num.toFixed(2)} dBm`;
  }

  function cleanStr(s) {
    return s == null ? "" : String(s).trim();
  }

  function arePolesDuplicates(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;

    const numA = Number(a.numero);
    const numB = Number(b.numero);
    if (numA > 0 && numB > 0) {
      if (numA !== numB) return false;
    }

    const latA = a.lat ?? a.latitude;
    const lngA = a.lng ?? a.longitude;
    const latB = b.lat ?? b.latitude;
    const lngB = b.lng ?? b.longitude;

    if (latA != null && lngA != null && latB != null && lngB != null) {
      if (Math.abs(latA - latB) < 0.00005 && Math.abs(lngA - lngB) < 0.00005) {
        return true;
      }
    }

    const isImpA = Boolean(a.implante || a.implanted) || ["implanté", "implante"].includes(String(a.sous_type || "").toLowerCase().trim());
    const isImpB = Boolean(b.implante || b.implanted) || ["implanté", "implante"].includes(String(b.sous_type || "").toLowerCase().trim());
    const isArmA = (Boolean(a.arme || a.armed) || ["armé", "arme"].includes(String(a.sous_type || "").toLowerCase().trim())) && !a.traverse && a.sous_type !== "Traversé";
    const isArmB = (Boolean(b.arme || b.armed) || ["armé", "arme"].includes(String(b.sous_type || "").toLowerCase().trim())) && !b.traverse && b.sous_type !== "Traversé";
    const catA = isImpA ? "implante" : isArmA ? "arme" : "traverse";
    const catB = isImpB ? "implante" : isArmB ? "arme" : "traverse";

    if (catA !== catB) return false;
    if (!numA || !numB || numA !== numB) return false;

    const txtA = `${a.proprietaire || ""} ${a.type_poteau || ""} ${a.nom || ""}`.toLowerCase();
    const txtB = `${b.proprietaire || ""} ${b.type_poteau || ""} ${b.nom || ""}`.toLowerCase();
    const aIsSbee = txtA.includes("sbee");
    const bIsSbee = txtB.includes("sbee");
    const aIsPj = txtA.includes("petit") || txtA.includes("jean") || txtA.includes("pj");
    const bIsPj = txtB.includes("petit") || txtB.includes("jean") || txtB.includes("pj");

    if ((aIsSbee && bIsPj) || (aIsPj && bIsSbee)) {
      return false;
    }

    return true;
  }

  function getDeduplicatedPoles(data) {
    const d = data || {};
    const pts = Array.isArray(d.points_gps) ? d.points_gps : [];
    const directPoles = Array.isArray(d.poteaux) ? d.poteaux : [];
    const gpsPoles = pts.filter((p) => p && String(p.type || "").toLowerCase() === "poteau");
    const rawPoles = directPoles.length > 0 ? directPoles : gpsPoles;

    const deduplicated = [];
    rawPoles.forEach((p, idx) => {
      if (!p) return;
      const num = Number(p.numero || idx + 1);
      const candidate = { ...p, numero: num };
      const existingIdx = deduplicated.findIndex((ex) => arePolesDuplicates(ex, candidate));
      if (existingIdx === -1) {
        deduplicated.push(candidate);
      } else {
        const existing = deduplicated[existingIdx];
        deduplicated[existingIdx] = {
          ...existing,
          ...candidate,
          traverse: existing.traverse !== undefined ? Boolean(existing.traverse) : (candidate.traverse !== undefined ? Boolean(candidate.traverse) : undefined),
          traversed: Boolean(existing.traversed || candidate.traversed),
          implante: Boolean(existing.implante || candidate.implante),
          implanted: Boolean(existing.implanted || candidate.implanted),
          arme: Boolean(existing.arme || candidate.arme),
          armed: Boolean(existing.armed || candidate.armed),
          type_poteau: existing.type_poteau || candidate.type_poteau || existing.proprietaire || candidate.proprietaire || "",
          proprietaire: existing.proprietaire || candidate.proprietaire || existing.type_poteau || candidate.type_poteau || "",
          photo: existing.photo || candidate.photo || "",
          lat: existing.lat ?? candidate.lat,
          lng: existing.lng ?? candidate.lng,
          numero: existing.numero || candidate.numero || num,
        };
      }
    });

    return deduplicated.sort((a, b) => Number(a.numero) - Number(b.numero));
  }

  // 1. Rapport Global WhatsApp (Structure exacte demandée par l'équipe)
  function formatGlobalReport(data, compteurJour = {}) {
    if (!data) return "";
    const d = data;
    const mp = d.materiel_pose && typeof d.materiel_pose === "object" ? d.materiel_pose : {};
    const val = (key) => fmt2(mp[key]);

    const dateIso = toIsoDate(d.date);
    const msanFat = formatMsanFat(d.msan, d.fat_ref);

    const pts = Array.isArray(d.points_gps) ? d.points_gps : [];
    const poles = getDeduplicatedPoles(d);

    const isArme = (p) => Boolean(p.arme || p.armed) || ["armé", "arme"].includes(String(p.sous_type || "").toLowerCase().trim());
    const isImplante = (p) => Boolean(p.implante || p.implanted) || ["implanté", "implante"].includes(String(p.sous_type || "").toLowerCase().trim());
    const isTraverse = (p) => {
      if (!p) return false;
      if (p.traverse === false || p.traversed === false) return false;
      if (Boolean(p.traverse || p.traversed)) return true;
      if (isImplante(p)) return false;
      return ["traversé", "traverse", ""].includes(String(p.sous_type || "").toLowerCase().trim());
    };

    const isSbee = (p) => `${p.proprietaire || ""} ${p.type_poteau || ""} ${p.nom || ""}`.toLowerCase().includes("sbee");
    const isPetitJean = (p) => {
      const txt = `${p.proprietaire || ""} ${p.type_poteau || ""} ${p.nom || ""}`.toLowerCase();
      return txt.includes("petit") || txt.includes("jean") || txt.includes("pj");
    };

    const getCoordStr = (p) => {
      if (!p) return "";
      const lat = p.lat ?? p.latitude;
      const lng = p.lng ?? p.longitude;
      if (lat == null || lng == null) return "";
      return `${lat},${lng}`;
    };

    const poteauxTraverses = poles.filter(isTraverse);
    const poteauxImplantes = poles.filter(isImplante);
    const poteauxArmes = poles.filter(isArme);

    const abonnePt = pts.find((p) => p && ["abonné", "abonne", "client"].includes(String(p.type || "").toLowerCase()));
    const fatPt = pts.find((p) => p && String(p.type || "").toLowerCase() === "fat");

    const latAbonne = abonnePt ? getCoordStr(abonnePt) : (d.latitude && d.longitude ? `${d.latitude},${d.longitude}` : "");
    const latFat = fatPt ? getCoordStr(fatPt) : (d.latitude_fat && d.longitude_fat ? `${d.latitude_fat},${d.longitude_fat}` : "");

    const uniqueTraverses = poteauxTraverses.length || (poles.length - poteauxImplantes.length);
    const rawTraverses = Number(d.nb_poteaux_traverses ?? 0);
    const nbTraverses = uniqueTraverses > 0 ? (rawTraverses > uniqueTraverses ? uniqueTraverses : (rawTraverses || uniqueTraverses)) : rawTraverses;

    const uniqueArmes = poteauxArmes.length;
    const rawArmes = Number(d.nb_poteaux_armes ?? 0);
    const nbArmes = uniqueArmes > 0 ? (rawArmes > uniqueArmes ? uniqueArmes : (rawArmes || uniqueArmes)) : rawArmes;

    const uniqueImplantes = poteauxImplantes.length;
    const rawImplantes = Number(d.nb_poteaux_implantes ?? 0);
    const nbImplantes = uniqueImplantes > 0 ? (rawImplantes > uniqueImplantes ? uniqueImplantes : (rawImplantes || uniqueImplantes)) : rawImplantes;

    const chefEquipe = cleanStr(d.nom_technicien || d.nom_equipe) || "Chef d'équipe";

    const cpcSizes = [50, 100, 150, 200, 250, 300, 350];
    const lin = Number(d.lineaire_m || 0);
    const getCpcVal = (size) => {
      const explicit = mp[`cpc_${size}`] ?? mp[`cpc${size}`];
      if (explicit !== undefined && explicit !== null && explicit !== "") return fmt2(explicit);
      const hasAnyCpc = cpcSizes.some((s) => mp[`cpc_${s}`] || mp[`cpc${s}`]);
      if (!hasAnyCpc && lin > 0 && lin === size) return "01";
      return "00";
    };

    const ontQte = mp.ont ?? d.ont_qte ?? (d.sn || d.ont_livre ? 1 : 1);
    const ptoQte = mp.pto ?? d.pto_qte ?? 1;
    const jarretiereQte = mp.jarretiere ?? (d.jarretiere ? 1 : 1);

    const cleanNomClient = cleanStr(d.nom_client);
    const cleanLigne = cleanStr(d.telephone_ligne || d.numero_ligne || d.telephone_fixe);
    const cleanMobile = cleanStr(d.mobile || d.telephone);
    const cleanMac = cleanStr(d.mac);
    const cleanSn = cleanStr(d.sn || d.ont_sn);
    const cleanPort = cleanStr(d.port);
    const cleanPortsDispo = cleanStr(d.ports_disponibles || (d.port_disponible ? `Port ${d.port_disponible}` : ""));
    const cleanTypeCable = cleanStr(d.type_cable) || "CPC";
    const cleanEtat = cleanStr(d.etat) || "PON";

    const lignes = [
      `*Chef d'Équipe : ${chefEquipe}*`,
      ``,
      `*${fmt2(compteurJour?.realises)} Réalisés / ${fmt2(compteurJour?.recus)} Reçus*`,
      ``,
      `*RACCORDEMENT*`,
      ``,
      `*${dateIso}*`,
      ``,
      `*Client: ${cleanNomClient}*`,
      ``,
      `*Etat:${cleanEtat}*`,
      ``,
      `*Msan: ${cleanStr(msanFat)}*`,
      ``,
      `*Port:${cleanPort}*`,
      `*Ports disponibles: ${cleanPortsDispo}*`,
      `*Type de câble : ${cleanTypeCable}*`,
      `*Départ :${fmtMeter(d.depart_m, 0)}*`,
      `*Arrivée :${fmtMeter(d.arrivee_m, lin || 0)}*`,
      `*Linéaire:${fmtMeter(d.lineaire_m, lin || 0)}*`,
      `*Puissance FAT: ${fmtPower(d.puissance_fat_dbm)}*`,
      `*Puissance PTO: ${fmtPower(d.puissance_pto_dbm)}*`,
      `*MAC: ${cleanMac}*`,
      `*SN : ${cleanSn}*`,
      `*Nombre de poteaux armés : ${fmt2(nbArmes)}*`,
      `*Nombre de poteaux traversés : ${fmt2(nbTraverses)}*`,
      `*Nombre de poteaux implantés: ${fmt2(nbImplantes)}*`,
      `*ONT: ${fmt2(ontQte)}*`,
      `*PTO: ${fmt2(ptoQte)}*`,
      `*Jarretière: ${fmt2(jarretiereQte)}*`,
      `*Pince:${val("pince")}*`,
      `*Crochets:${val("crochets")}*`,
      `*Susp: ${val("susp")}*`,
      `*Piton: ${val("piton")}*`,
      `*Cheville: ${val("cheville")}*`,
      `*Connecteur: ${val("connecteur")}*`,
      `*Closer: ${val("closer")}*`,
      `*Câble Fibre 1FO: ${val("cable_1fo") !== "00" ? val("cable_1fo") : val("cable_fibre_1fo")}*`,
      `*Ligne: ${cleanLigne}*`,
      `*Mobile:${cleanMobile}*`,
      `*Traverse 13T: ${val("traverse_13t")}*`,
      `*Traverse 15T: ${val("traverse_15t")}*`,
      `*CPC 50: ${getCpcVal(50)}*`,
      `*CPC 100: ${getCpcVal(100)}*`,
      `*CPC 150: ${getCpcVal(150)}*`,
      `*CPC 200: ${getCpcVal(200)}*`,
      `*CPC 250: ${getCpcVal(250)}*`,
      `*CPC 300: ${getCpcVal(300)}*`,
      `*CPC 350: ${getCpcVal(350)}*`,
      ``,
      `*GPS Poteaux traversés*`,
    ];

    const sbeeTraverses = poteauxTraverses.filter(isSbee);
    const pjTraverses = poteauxTraverses.filter(isPetitJean);
    const otherTraverses = poteauxTraverses.filter((p) => !isSbee(p) && !isPetitJean(p));

    lignes.push(`*GPS poteaux SBEE*`);
    if (sbeeTraverses.length > 0) {
      sbeeTraverses.forEach((p, idx) => {
        const num = p.numero || idx + 1;
        lignes.push(`*GPS PT${num}: ${getCoordStr(p)}*`);
      });
    } else if (poteauxTraverses.length > 0 && pjTraverses.length === 0) {
      poteauxTraverses.forEach((p, idx) => {
        const num = p.numero || idx + 1;
        lignes.push(`*GPS PT${num}: ${getCoordStr(p)}*`);
      });
    }
    lignes.push(``);

    if (pjTraverses.length > 0) {
      lignes.push(`*GPS poteaux Petit Jean*`);
      pjTraverses.forEach((p, idx) => {
        const num = p.numero || sbeeTraverses.length + idx + 1;
        lignes.push(`*GPS PT${num}: ${getCoordStr(p)}*`);
      });
      lignes.push(``);
    }

    if (otherTraverses.length > 0) {
      lignes.push(`*GPS autres poteaux*`);
      otherTraverses.forEach((p, idx) => {
        const num = p.numero || idx + 1;
        lignes.push(`*GPS PT${num}: ${getCoordStr(p)}*`);
      });
      lignes.push(``);
    }

    lignes.push(`*Poteaux armés : ${fmt2(nbArmes)}*`);
    if (poteauxArmes.length > 0) {
      poteauxArmes.forEach((p, idx) => {
        const num = p.numero || idx + 1;
        lignes.push(`*GPS PT${num}: ${getCoordStr(p)}*`);
      });
    }
    lignes.push(``);

    lignes.push(`*Poteaux implanté : ${fmt2(nbImplantes)}*`);
    if (poteauxImplantes.length > 0) {
      lignes.push(`*GPS poteaux implantés*`);
      poteauxImplantes.forEach((p, idx) => {
        const num = p.numero || idx + 1;
        lignes.push(`*GPS PT${num}: ${getCoordStr(p)}*`);
      });
    }
    lignes.push(``);

    lignes.push(`*GPS abonné: ${latAbonne}*`);
    lignes.push(``);
    lignes.push(`*GPS FAT: ${latFat}*`);

    return lignes.join("\n");
  }

  // 2. Rapport de Conformité (Structure officielle audit)
  function formatConformiteReport(data) {
    if (!data) return "";
    const d = data;
    const dateFr = toFrDate(d.date);
    const msanFat = formatMsanFat(d.msan, d.fat_ref);

    const pts = Array.isArray(d.points_gps) ? d.points_gps : [];
    const poles = getDeduplicatedPoles(d);

    const isArme = (p) => Boolean(p.arme || p.armed) || ["armé", "arme"].includes(String(p.sous_type || "").toLowerCase().trim());
    const isImplante = (p) => Boolean(p.implante || p.implanted) || ["implanté", "implante"].includes(String(p.sous_type || "").toLowerCase().trim());
    const isTraverse = (p) => {
      if (!p) return false;
      if (p.traverse === false || p.traversed === false) return false;
      if (Boolean(p.traverse || p.traversed)) return true;
      if (isImplante(p)) return false;
      return ["traversé", "traverse", ""].includes(String(p.sous_type || "").toLowerCase().trim());
    };

    const isSbee = (p) => `${p.proprietaire || ""} ${p.type_poteau || ""} ${p.nom || ""}`.toLowerCase().includes("sbee");
    const isPetitJean = (p) => {
      const txt = `${p.proprietaire || ""} ${p.type_poteau || ""} ${p.nom || ""}`.toLowerCase();
      return txt.includes("petit") || txt.includes("jean") || txt.includes("pj");
    };

    const poteauxTraverses = poles.filter(isTraverse);
    const poteauxImplantes = poles.filter(isImplante);
    const poteauxArmes = poles.filter(isArme);

    const sbeePoles = poteauxTraverses.filter(isSbee);
    const pjPoles = poteauxTraverses.filter(isPetitJean);

    const countSbee = sbeePoles.length || (poteauxTraverses.length > 0 && pjPoles.length === 0 ? poteauxTraverses.length : 0);
    const countPj = pjPoles.length;

    const abonnePt = pts.find((p) => p && ["abonné", "abonne", "client"].includes(String(p.type || "").toLowerCase()));
    const fatPt = pts.find((p) => p && String(p.type || "").toLowerCase() === "fat");

    const latAbonne = abonnePt ? `${abonnePt.lat}, ${abonnePt.lng}` : (d.latitude && d.longitude ? `${d.latitude}, ${d.longitude}` : "");
    const latFat = fatPt ? `${fatPt.lat}, ${fatPt.lng}` : (d.latitude_fat && d.longitude_fat ? `${d.latitude_fat}, ${d.longitude_fat}` : "");

    const nbArmes = Math.min(Number(d.nb_poteaux_armes ?? poteauxArmes.length), poteauxArmes.length);
    const nbTraverses = Math.min(Number(d.nb_poteaux_traverses ?? (poteauxTraverses.length || (poles.length - poteauxImplantes.length))), poteauxTraverses.length || (poles.length - poteauxImplantes.length));
    const nbImplantes = Math.min(Number(d.nb_poteaux_implantes ?? poteauxImplantes.length), poteauxImplantes.length);

    const equipeName = cleanStr(d.nom_technicien || d.nom_equipe) || "Équipe";
    const lin = d.lineaire_m || 0;
    const cleanNomClient = cleanStr(d.nom_client);
    const cleanLigne = cleanStr(d.telephone_ligne || d.numero_ligne || d.telephone_fixe);

    const lignes = [
      `Équipe : ${equipeName}`,
      ``,
      `${dateFr}`,
      ``,
      `RACCORDEMENT — CONFORMITÉ`,
      ``,
      `Client : ${cleanNomClient}`,
      ``,
      `Ligne : ${cleanLigne}`,
      ``,
      `MSAN : ${cleanStr(msanFat)}`,
      ``,
      `Linéaire : ${lin} m`,
      ``,
      `GPS FAT : ${latFat}`,
      ``,
      `GPS abonné : ${latAbonne}`,
      ``,
      `Poteaux traversés : ${fmt2(nbTraverses)}`,
      ``,
      `Poteaux SBEE : ${fmt2(countSbee)}`,
      ``,
      `${countPj > 1 ? "Poteaux" : "Poteau"} Petit Jean : ${fmt2(countPj)}`,
      ``,
      `Poteaux implantés : ${fmt2(nbImplantes)}`,
      ``,
      `Poteaux armés : ${fmt2(nbArmes)}`,
    ];

    const displaySbee = sbeePoles.length > 0 ? sbeePoles : (poles.length > 0 && pjPoles.length === 0 ? poles : []);
    if (displaySbee.length > 0) {
      lignes.push(``);
      lignes.push(`GPS poteaux SBEE :`);
      lignes.push(``);
      displaySbee.forEach((p, idx) => {
        const num = p.numero || idx + 1;
        const lat = p.lat ?? p.latitude;
        const lng = p.lng ?? p.longitude;
        lignes.push(`- PT${num} : ${lat}, ${lng}`);
      });
    }

    if (poteauxArmes.length > 0) {
      lignes.push(``);
      lignes.push(`GPS poteaux armés :`);
      lignes.push(``);
      poteauxArmes.forEach((p, idx) => {
        const num = p.numero || idx + 1;
        const lat = p.lat ?? p.latitude;
        const lng = p.lng ?? p.longitude;
        lignes.push(`- Poteau (Armé) ${num} : ${lat}, ${lng}`);
      });
    }

    if (pjPoles.length === 1) {
      const lat = pjPoles[0].lat ?? pjPoles[0].latitude;
      const lng = pjPoles[0].lng ?? pjPoles[0].longitude;
      lignes.push(``);
      lignes.push(`GPS poteau Petit Jean : ${lat}, ${lng}`);
    } else if (pjPoles.length > 1) {
      lignes.push(``);
      lignes.push(`GPS poteaux Petit Jean :`);
      lignes.push(``);
      pjPoles.forEach((p, idx) => {
        const num = p.numero || idx + 1;
        const lat = p.lat ?? p.latitude;
        const lng = p.lng ?? p.longitude;
        lignes.push(`- PT${num} : ${lat}, ${lng}`);
      });
    }

    return lignes.join("\n");
  }

  return {
    setNativeInputValue,
    setNativeCheckboxValue,
    setNativeSelectValue,
    handleRadioGroup,
    fillElement,
    detectCurrentStep,
    autofillPage,
    formatWhatsAppReport: formatGlobalReport,
    formatGlobalReport,
    formatConformiteReport,
  };
});
