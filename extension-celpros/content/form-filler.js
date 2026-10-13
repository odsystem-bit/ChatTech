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

  const exports = factory(getMapping());
  if (typeof module === "object" && module && module.exports) {
    module.exports = exports;
  }
  if (typeof define === "function" && define.amd) {
    define([], () => exports);
  }
  if (root) {
    root.FormFiller = exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (FieldMapping) {
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

  // Remplissage d'un élément unitaire à partir d'une valeur
  function fillElement(element, value, _definition) {
    if (!element || value === undefined || value === null) return false;

    const tagName = element.tagName.toLowerCase();
    const inputType = (element.getAttribute("type") || "text").toLowerCase();

    if (tagName === "select") {
      const ok = setNativeSelectValue(element, value);
      if (ok) applyHighlight(element);
      return ok;
    }

    if (tagName === "textarea") {
      setNativeInputValue(element, value);
      applyHighlight(element);
      return true;
    }

    if (inputType === "checkbox") {
      const boolVal = typeof value === "boolean" ? value : Boolean(value && value !== "0" && value !== "false");
      setNativeCheckboxValue(element, boolVal);
      applyHighlight(element);
      return true;
    }

    if (inputType === "radio") {
      const ok = handleRadioGroup(element, value);
      if (ok) applyHighlight(element);
      return ok;
    }

    // Input texte, number, tel, etc.
    setNativeInputValue(element, value);
    applyHighlight(element);
    return true;
  }

  // Fonction principale : balayage et pré-remplissage complet de la page
  function autofillPage(interventionData, root = (typeof document !== "undefined" ? document : null)) {
    if (!root || !interventionData) {
      return { success: false, filledCount: 0, error: "Racine DOM ou données d'intervention manquantes" };
    }

    // Recherche de tous les champs de saisie pertinents
    const selector = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"])',
      "select",
      "textarea",
    ].join(", ");

    const elements = Array.from(root.querySelectorAll(selector));
    const processedRadioGroups = new Set();
    const filledDetails = [];
    const unmatchedElements = [];

    for (const el of elements) {
      // Éviter de re-traiter plusieurs fois le même groupe de boutons radio
      if (el.type === "radio" && el.name) {
        if (processedRadioGroups.has(el.name)) continue;
        processedRadioGroups.add(el.name);
      }

      // Appariement intelligent du champ
      const match = FieldMapping.matchElementToField(el);

      if (match && match.definition) {
        const { definition } = match;
        const val = definition.valueExtractor(interventionData);

        // Ne pas écraser si la valeur est vide et qu'il y a déjà une saisie existante pertinente
        if (val !== undefined && val !== null && val !== "") {
          const filled = fillElement(el, val, definition);
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

    return {
      success: true,
      totalScanned: elements.length,
      filledCount: filledDetails.length,
      filledDetails,
      unmatchedElements,
    };
  }

  // Formatage du rapport pour WhatsApp / Presse-papier
  function formatWhatsAppReport(data) {
    if (!data) return "";
    const dateFormatted = data.date ? new Date(data.date).toLocaleDateString("fr-FR") : new Date().toLocaleDateString("fr-FR");
    const fm = FieldMapping || (typeof globalThis !== "undefined" && globalThis.FieldMapping);
    const gpsPoint = fm && fm.extractTargetGpsPoint ? fm.extractTargetGpsPoint(data) : null;
    const gpsLine = gpsPoint
      ? `• Coordonnées GPS : ${gpsPoint.lat.toFixed(6)}, ${gpsPoint.lng.toFixed(6)} (https://maps.google.com/?q=${gpsPoint.lat},${gpsPoint.lng})`
      : "";
    const photosCount = Array.isArray(data.whatsapp_photos) ? data.whatsapp_photos.length : 0;

    return [
      `*RAPPORT D'INTERVENTION FIBRE - CELTIIS*`,
      `📅 Date : ${dateFormatted}`,
      `👤 Technicien : ${data.nom_technicien || "Non spécifié"}`,
      `🏢 Équipe : ${data.nom_equipe || "TELECOM BTP Services"}`,
      `---------------------------------`,
      `*CLIENT*`,
      `• Nom : ${data.nom_client || "N/A"}`,
      `• Adresse : ${data.adresse_zone || "N/A"}`,
      `• Mobile : ${data.mobile || "N/A"}`,
      `• Offre : ${data.offre_souscrite || "Fibre Pro"}`,
      `---------------------------------`,
      `*RÉSEAU & FAT*`,
      `• État PON : ${data.etat || "PON"}`,
      `• MSAN : ${data.msan || "N/A"}`,
      `• Réf FAT / PBO : ${data.fat_ref || "N/A"}`,
      `• Port raccordé : ${data.port || "N/A"}`,
      `• Ports disponibles : ${data.ports_disponibles || data.port_disponible || "N/A"}`,
      `• Puissance FAT : ${data.puissance_fat_dbm ?? "N/A"} dBm`,
      `---------------------------------`,
      `*CÂBLAGE & POTEAUX*`,
      `• Type câble : ${data.type_cable || "Drop 1FO"}`,
      `• Métrage départ : ${data.depart_m ?? 0} m | Arrivée : ${data.arrivee_m ?? 0} m`,
      `• Linéaire utilisé : ${data.lineaire_m ?? 0} m`,
      `• Poteaux : ${data.nb_poteaux_traverses ?? 0} traversés | ${data.nb_poteaux_implantes ?? 0} implantés | ${data.nb_poteaux_armes ?? 0} armés`,
      `---------------------------------`,
      `*MESURES & ÉQUIPEMENTS*`,
      `• Puissance PTO : ${data.puissance_pto_dbm ?? "N/A"} dBm`,
      `• Qté PTO : ${data.pto_qte ?? 1} | Répéteur WiFi : ${data.repeteur_wifi_qte ?? 0}`,
      `• SN ONT : ${data.sn || data.ont_sn || "N/A"}`,
      `• MAC ONT : ${data.mac || "N/A"}`,
      `• Emplacement ONT : ${data.emplacement_ont || "Salon"}`,
      `---------------------------------`,
      `*LOCALISATION & PHOTOS*`,
      ...(gpsLine ? [gpsLine] : []),
      `• Photos terrain : ${photosCount} photo(s) enregistrée(s)`,
      `---------------------------------`,
      `*CONFORMITÉ*`,
      `• Travaux conformes : ${data.travaux_conformes ? "OUI ✅" : "NON ⚠️"}`,
      `• Service testé & fonctionnel : ${data.service_fonctionne ? "OUI ✅" : "NON ⚠️"}`,
      `• Qualité globale : ${data.qualite || "Satisfait"}`,
    ].join("\n");
  }

  return {
    setNativeInputValue,
    setNativeCheckboxValue,
    setNativeSelectValue,
    handleRadioGroup,
    fillElement,
    autofillPage,
    formatWhatsAppReport,
  };
});
