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

  // Helper pour extraire une quantité de matériel posé depuis data.materiel_pose
  function getMaterielQuantity(data, ...keys) {
    const mp = data?.materiel_pose;
    if (!mp || typeof mp !== "object") return "";
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
    const list = Array.isArray(data?.points_gps) ? data.points_gps : [];
    const sbee = list.filter((p) => p && normalizeText(p.type).includes("poteau") && normalizeText(p.proprietaire).includes("sbee")).length;
    if (sbee > 0) return String(sbee);
    const mp = data?.materiel_pose || {};
    const count = Number(mp.poteau_sbee_non_arme || 0) + Number(mp.poteau_sbee_arme || 0) + Number(mp.poteau_sbee || 0);
    if (count > 0) return String(count);
    return "";
  }

  // Helper pour compter les poteaux Petit Jean réels
  function countPetitJeanPoles(data) {
    const list = Array.isArray(data?.points_gps) ? data.points_gps : [];
    const pj = list.filter((p) => p && normalizeText(p.type).includes("poteau") && (normalizeText(p.proprietaire).includes("petit") || normalizeText(p.proprietaire).includes("jean"))).length;
    if (pj > 0) return String(pj);
    const mp = data?.materiel_pose || {};
    const count = Number(mp.poteau_petit_jean || mp.poteau_pj || mp.petit_jean || 0);
    if (count > 0) return String(count);
    return "";
  }

  // Extraction du point GPS FAT
  function extractFatGpsPoint(data) {
    const list = Array.isArray(data?.points_gps) ? data.points_gps : [];
    const fat = list.find((p) => p && normalizeText(p.type).includes("fat"));
    if (!fat) return null;
    const rawLat = fat.lat ?? fat.latitude;
    const rawLng = fat.lng ?? fat.longitude;
    if (rawLat === undefined || rawLat === null || rawLng === undefined || rawLng === null) return null;
    const lat = typeof rawLat === "string" ? parseFloat(rawLat.replace(",", ".")) : Number(rawLat);
    const lng = typeof rawLng === "string" ? parseFloat(rawLng.replace(",", ".")) : Number(rawLng);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { ...fat, lat, lng };
  }

  // Extraction du point GPS de référence (Abonné en priorité, sinon le dernier point relevé)
  function extractTargetGpsPoint(data) {
    const list = Array.isArray(data?.points_gps) ? data.points_gps : [];
    if (!list.length) return null;
    const abonne = list.find((p) => {
      if (!p || !p.type) return false;
      const t = normalizeText(p.type);
      return t.includes("abonne") || t.includes("client");
    });
    const point = abonne || list[list.length - 1] || null;
    if (!point) return null;
    const rawLat = point.lat ?? point.latitude ?? null;
    const rawLng = point.lng ?? point.longitude ?? null;
    if (rawLat === null || rawLng === null || rawLat === undefined || rawLng === undefined) return null;
    const lat = typeof rawLat === "string" ? parseFloat(rawLat.replace(",", ".")) : Number(rawLat);
    const lng = typeof rawLng === "string" ? parseFloat(rawLng.replace(",", ".")) : Number(rawLng);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { ...point, lat, lng };
  }

  // Dictionnaire de correspondances pour tous les champs d'intervention
  const FIELD_DEFINITIONS = {
    // ----------------------------------------------------
    // 1. Informations Client
    // ----------------------------------------------------
    nom_client: {
      key: "nom_client",
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
      label: "Puissance FAT (dBm)",
      category: "Réseau",
      type: "number",
      attrPatterns: [
        /^field_puissancefat$/i,
        /^field_puissancefatdbm$/i,
        /^puissance_fat_dbm$/i,
        /^puissancefatdbm$/i,
        /^puissancefat$/i,
        /^puissance_fat$/i,
        /^pfat$/i,
        /^dbmfat$/i,
        /^mesurefat$/i,
        /^puissancepbo$/i,
      ],
      labelKeywords: [
        "valeur au fat",
        "valeur au fat dbm",
        "valeur au fat (dbm)",
        "puissance fat",
        "puissance fat dbm",
        "niveau optique fat",
        "dbm fat",
        "puissance au pbo",
        "mesure optique fat",
        "puissance pbo",
      ],
      valueExtractor: (data) => {
        const val = data?.puissance_fat_dbm;
        if (val === undefined || val === null || val === "") return "";
        const str = String(val).replace(",", ".").trim();
        const num = parseFloat(str);
        if (isNaN(num) || num === 0) return "";
        return str;
      },
    },

    // ----------------------------------------------------
    // 3. Câblage & Poteaux
    // ----------------------------------------------------
    type_cable: {
      key: "type_cable",
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
      label: "Linéaire (m)",
      category: "Câblage",
      type: "number",
      attrPatterns: [
        /^field_lineairem$/i,
        /^field_lineaire$/i,
        /^lineaire_m$/i,
        /^lineairem$/i,
        /^lineaire$/i,
        /^longueurlineaire$/i,
        /^longueurcable$/i,
        /^distance$/i,
      ],
      labelKeywords: [
        "lineaire fibre optique",
        "lineaire fibre",
        "lineaire m",
        "lineaire",
        "longueur de cable",
        "longueur cable",
        "distance m",
        "metrage total",
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
        return "";
      },
    },

    nb_poteaux_traverses: {
      key: "nb_poteaux_traverses",
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
      ],
      labelKeywords: [
        "poteaux traverses",
        "nb poteaux traverses",
        "nombre de poteaux traverses",
        "poteaux traverses count",
      ],
      valueExtractor: (data) => {
        if (data?.nb_poteaux_traverses !== undefined && data?.nb_poteaux_traverses !== null && data?.nb_poteaux_traverses !== "") {
          const n = Number(data.nb_poteaux_traverses);
          if (!isNaN(n) && n > 0) return String(n);
        }
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const count = pts.filter((p) => p && p.type === "Poteau" && p.sous_type === "Traversé").length;
        if (count > 0) return String(count);
        return "";
      },
    },

    nb_poteaux_implantes: {
      key: "nb_poteaux_implantes",
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
        const count = pts.filter((p) => p && p.type === "Poteau" && p.sous_type === "Implanté").length;
        if (count > 0) return String(count);
        return "";
      },
    },

    nb_poteaux_armes: {
      key: "nb_poteaux_armes",
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
        const count = pts.filter((p) => p && p.type === "Poteau" && p.sous_type === "Armé").length;
        if (count > 0) return String(count);
        return "";
      },
    },

    // ----------------------------------------------------
    // 4. Intérieur & Matériel Client
    // ----------------------------------------------------
    puissance_pto_dbm: {
      key: "puissance_pto_dbm",
      label: "Puissance PTO (dBm)",
      category: "Intérieur",
      type: "number",
      attrPatterns: [
        /^field_puissancepto$/i,
        /^field_puissanceptodbm$/i,
        /^puissance_pto_dbm$/i,
        /^puissanceptodbm$/i,
        /^puissancepto$/i,
        /^puissance_pto$/i,
        /^ppto$/i,
        /^dbmpto$/i,
        /^mesurepto$/i,
        /^puissancearrivee$/i,
      ],
      labelKeywords: [
        "valeur au pto",
        "valeur au pto dbm",
        "valeur au pto (dbm)",
        "puissance pto",
        "puissance pto dbm",
        "niveau optique pto",
        "dbm pto",
        "puissance chez le client",
        "mesure pto",
        "puissance prise",
      ],
      valueExtractor: (data) => {
        const val = data?.puissance_pto_dbm;
        if (val === undefined || val === null || val === "") return "";
        const str = String(val).replace(",", ".").trim();
        const num = parseFloat(str);
        if (isNaN(num) || num === 0) return "";
        return str;
      },
    },

    pto_qte: {
      key: "pto_qte",
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
      label: "Numéro de série SN / ONT",
      category: "Intérieur",
      type: "text",
      attrPatterns: [
        /^field_sn$/i,
        /^field_ontsn$/i,
        /^field_ont_sn$/i,
        /^field_serialnumber$/i,
        /^field_serial_number$/i,
        /^sn$/i,
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
      valueExtractor: (data) => (data?.travaux_conformes ? true : null),
    },

    emplacement_valide: {
      key: "emplacement_valide",
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
      valueExtractor: (data) => (data?.emplacement_valide ? true : null),
    },

    travail_propre: {
      key: "travail_propre",
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
      valueExtractor: (data) => (data?.travail_propre ? true : null),
    },

    service_teste: {
      key: "service_teste",
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
      valueExtractor: (data) => (data?.service_teste ? true : null),
    },

    service_fonctionne: {
      key: "service_fonctionne",
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
      valueExtractor: (data) => (data?.service_fonctionne ? true : null),
    },

    explications_donnees: {
      key: "explications_donnees",
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
      valueExtractor: (data) => (data?.explications_donnees ? true : null),
    },

    recommanderait: {
      key: "recommanderait",
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
      valueExtractor: (data) => (data?.recommanderait ? true : null),
    },

    accepte_recontact: {
      key: "accepte_recontact",
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
      valueExtractor: (data) => (data?.accepte_recontact ? true : null),
    },

    qualite: {
      key: "qualite",
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
      label: "Interlocuteur",
      category: "Client",
      type: "radio",
      attrPatterns: [/^interlocuteur/i, /^demandeur/i],
      labelKeywords: ["le demandeur", "demandeur", "interlocuteur"],
      valueExtractor: (data) => (data?.interlocuteur ? String(data.interlocuteur).trim() : ""),
    },

    configurations_type: {
      key: "configurations_type",
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
      label: "Rue",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^rue$/i, /^materiel_rue$/i],
      labelKeywords: ["rue"],
      valueExtractor: (data) => getMaterielQuantity(data, "rue", "rues"),
    },

    pince: {
      key: "pince",
      label: "Pince",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^pince$/i, /^materiel_pince$/i],
      labelKeywords: ["pince"],
      valueExtractor: (data) => getMaterielQuantity(data, "pince", "pinces"),
    },

    crochets: {
      key: "crochets",
      label: "Crochets",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^crochet/i, /^crochets$/i],
      labelKeywords: ["crochets", "crochet"],
      valueExtractor: (data) => getMaterielQuantity(data, "crochets", "crochet"),
    },

    suspension: {
      key: "suspension",
      label: "Suspension",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^susp/i, /^suspension/i],
      labelKeywords: ["suspension", "susp", "suspente"],
      valueExtractor: (data) => getMaterielQuantity(data, "susp", "suspension", "suspente", "suspentes"),
    },

    piton: {
      key: "piton",
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
      label: "Connecteur",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^connecteur/i, /^closer/i],
      labelKeywords: ["connecteur", "closer"],
      valueExtractor: (data) => getMaterielQuantity(data, "closer", "connecteur", "connecteurs"),
    },

    rp1: {
      key: "rp1",
      label: "RP1",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^rp1$/i],
      labelKeywords: ["rp1"],
      valueExtractor: (data) => getMaterielQuantity(data, "rp1"),
    },

    poteaux_utilises: {
      key: "poteaux_utilises",
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
      ],
      labelKeywords: [
        "combien de poteaux utilises",
        "combien de poteaux",
        "poteaux utilises",
        "nombre de poteaux utilises",
        "nb poteaux utilises",
        "total poteaux",
        "poteaux",
      ],
      valueExtractor: (data) => {
        let total = 0;
        if (data?.nb_poteaux_traverses) total += Number(data.nb_poteaux_traverses) || 0;
        if (data?.nb_poteaux_implantes) total += Number(data.nb_poteaux_implantes) || 0;
        if (data?.nb_poteaux_armes) total += Number(data.nb_poteaux_armes) || 0;
        if (total > 0) return String(total);
        const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
        const polePts = pts.filter((p) => p && normalizeText(p.type).includes("poteau")).length;
        if (polePts > 0) return String(polePts);
        const sbeePoles = Number(countSbeePoles(data)) || 0;
        const pjPoles = Number(countPetitJeanPoles(data)) || 0;
        const sum = sbeePoles + pjPoles;
        if (sum > 0) return String(sum);
        const fromMat = getMaterielQuantity(data, "poteau", "poteaux", "poteau_sbee", "poteau_pj");
        if (fromMat) return fromMat;
        const wa = Array.isArray(data?.whatsapp_photos) ? data.whatsapp_photos : [];
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
      label: "Nombre de poteaux SBEE utilisés",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^poteaux_?sbee/i, /^sbee/i],
      labelKeywords: ["nombre de poteaux sbee utilises", "poteaux sbee utilises", "poteaux sbee", "sbee utilises"],
      valueExtractor: (data) => countSbeePoles(data),
    },

    poteaux_petit_jean_utilises: {
      key: "poteaux_petit_jean_utilises",
      label: "Nombre de poteaux Petit Jean utilisés",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^poteaux_?petit_?jean/i, /^petit_?jean/i],
      labelKeywords: ["nombre de poteaux petit jean utilises", "poteaux petit jean", "petit jean utilises", "petit jean"],
      valueExtractor: (data) => countPetitJeanPoles(data),
    },

    traverse_13t: {
      key: "traverse_13t",
      label: "Traverse 13T",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^traverse_?13t/i, /^13t/i],
      labelKeywords: ["traverse 13t", "13t"],
      valueExtractor: (data) => getMaterielQuantity(data, "traverse_13t", "13t", "traverse13t"),
    },

    traverse_15t: {
      key: "traverse_15t",
      label: "Traverse 15T",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^traverse_?15t/i, /^15t/i],
      labelKeywords: ["traverse 15t", "15t"],
      valueExtractor: (data) => getMaterielQuantity(data, "traverse_15t", "15t", "traverse15t"),
    },

    semelle: {
      key: "semelle",
      label: "Semelle",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^semelle/i],
      labelKeywords: ["semelle", "semelle eq"],
      valueExtractor: (data) => getMaterielQuantity(data, "semelle_eq", "semelle", "semelles"),
    },

    boulons: {
      key: "boulons",
      label: "Boulons",
      category: "Accessoires",
      type: "number",
      attrPatterns: [/^boulon/i],
      labelKeywords: ["boulons", "boulon"],
      valueExtractor: (data) => getMaterielQuantity(data, "boulons", "boulon"),
    },

    agrafe: {
      key: "agrafe",
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
      label: "Appel sortant - Envoi numéro",
      category: "Tests",
      type: "boolean",
      attrPatterns: [/^appel_?sortant/i, /^sortant/i],
      labelKeywords: ["appel sortant - envoi numero", "appel sortant", "envoi numero"],
      valueExtractor: (data) => (data?.test_appel_sortant ? true : null),
    },

    test_appel_entrant: {
      key: "test_appel_entrant",
      label: "Appel entrant - Affichage numéro",
      category: "Tests",
      type: "boolean",
      attrPatterns: [/^appel_?entrant/i, /^entrant/i],
      labelKeywords: ["appel entrant - affichage numero", "appel entrant", "affichage numero"],
      valueExtractor: (data) => (data?.test_appel_entrant ? true : null),
    },

    debit_montant: {
      key: "debit_montant",
      label: "Débit montant",
      category: "Tests",
      type: "number",
      attrPatterns: [/^montant/i, /^debit_?montant/i],
      labelKeywords: ["montant", "debit montant", "upload"],
      valueExtractor: (data) => (data?.debit_montant || data?.debit_upload ? String(data.debit_montant || data.debit_upload).trim() : ""),
    },

    debit_descendant: {
      key: "debit_descendant",
      label: "Débit descendant",
      category: "Tests",
      type: "number",
      attrPatterns: [/^descendant/i, /^debit_?descendant/i],
      labelKeywords: ["descendant", "debit descendant", "download"],
      valueExtractor: (data) => (data?.debit_descendant || data?.debit_download ? String(data.debit_descendant || data.debit_download).trim() : ""),
    },

    debit_ping: {
      key: "debit_ping",
      label: "Ping",
      category: "Tests",
      type: "number",
      attrPatterns: [/^ping/i],
      labelKeywords: ["ping", "latence"],
      valueExtractor: (data) => (data?.debit_ping || data?.ping ? String(data.debit_ping || data.ping).trim() : ""),
    },

    // ----------------------------------------------------
    // 11. CelPros Étape 4 : Branchement & Rattachement
    // ----------------------------------------------------
    etiquetage: {
      key: "etiquetage",
      label: "Étiquetage",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^etiquetage/i],
      labelKeywords: ["etiquetage"],
      valueExtractor: (data) => (data?.etiquetage ? true : null),
    },

    nettoyage: {
      key: "nettoyage",
      label: "Nettoyage",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^nettoyage/i],
      labelKeywords: ["nettoyage"],
      valueExtractor: (data) => (data?.nettoyage ? true : (data?.travail_propre ? true : null)),
    },

    depose: {
      key: "depose",
      label: "Dépose",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^depose/i],
      labelKeywords: ["depose"],
      valueExtractor: (data) => (data?.depose ? true : null),
    },

    colliers_serres: {
      key: "colliers_serres",
      label: "Colliers serrés",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^colliers?_?serres?/i, /^field_colliers?_?serres?/i],
      labelKeywords: ["colliers serres", "collier serre"],
      valueExtractor: (data) => (data?.colliers_serres ? true : null),
    },

    fat_normalise: {
      key: "fat_normalise",
      label: "FAT normalisé",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^fat_?normalise/i],
      labelKeywords: ["fat normalise"],
      valueExtractor: (data) => (data?.fat_normalise ? true : null),
    },

    tutorat: {
      key: "tutorat",
      label: "Tutorat",
      category: "Branchement",
      type: "boolean",
      attrPatterns: [/^tutorat/i],
      labelKeywords: ["tutorat"],
      valueExtractor: (data) => (data?.tutorat ? true : null),
    },

    plaque: {
      key: "plaque",
      label: "Plaque",
      category: "Réseau",
      type: "text",
      attrPatterns: [/^plaque/i],
      labelKeywords: ["plaque"],
      valueExtractor: (data) => (data?.plaque ? String(data.plaque).trim() : ""),
    },

    service_internet: {
      key: "service_internet",
      label: "Internet",
      category: "Services",
      type: "boolean",
      attrPatterns: [/^service_?internet/i, /^internet$/i],
      labelKeywords: ["internet"],
      valueExtractor: (data) => (data?.service_internet ? true : (data?.service_fonctionne ? true : null)),
    },

    service_voip: {
      key: "service_voip",
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
      label: "Je confirme la signature du rapport",
      category: "Signature",
      type: "boolean",
      attrPatterns: [/^confirme_?signature/i, /^signature_?rapport/i],
      labelKeywords: ["je confirme la signature du rapport", "confirme signature", "signature du rapport"],
      valueExtractor: (data) => (data?.confirme_signature_rapport ? true : (data?.signature_client ? true : null)),
    },
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

  // Détection du texte de libellé associé à l'élément
  function getElementLabelText(element) {
    if (!element) return "";
    let texts = [];
    const doc = element.ownerDocument || (typeof document !== "undefined" ? document : null);

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

    // 3. Parent fieldset avec legend (pour groupes de radio/checkbox)
    const fieldset = element.closest ? element.closest("fieldset") : null;
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) texts.push(legend.textContent || "");
    }

    // 4. Frère précédent (previousElementSibling) qui est un label ou un span
    if (element.previousElementSibling) {
      const tag = element.previousElementSibling.tagName?.toLowerCase();
      if (tag === "label" || tag === "span" || tag === "strong" || tag === "p") {
        texts.push(element.previousElementSibling.textContent || "");
      }
    }

    // 5. Conteneur de champ (ex: .form-group, .field, .mb-3, .form-field)
    if (element.closest) {
      const group = element.closest(".form-group, .form-field, .mb-3, .col, [class*='field'], [class*='group']");
      if (group) {
        const groupLabel = group.querySelector("legend, label, .form-label, span.title, dt");
        if (groupLabel && groupLabel !== element && groupLabel !== parentLabel) {
          texts.push(groupLabel.textContent || "");
        }
      }
    }

    // 6. Placeholder ou title
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
    const normalizedLabel = normalizeText(labelText);

    let bestMatch = null;
    let highestScore = 0;

    for (const [, def] of Object.entries(FIELD_DEFINITIONS)) {
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
    if (!bestMatch && interventionData?.materiel_pose && typeof interventionData.materiel_pose === "object") {
      for (const [rawKey, rawVal] of Object.entries(interventionData.materiel_pose)) {
        const numVal = Number(rawVal);
        if (isNaN(numVal) || numVal <= 0) continue;
        const normMat = normalizeText(rawKey);
        if (!normMat || normMat.length < 3) continue;

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
    normalizeText,
    getElementAttributeCandidates,
    getElementLabelText,
    matchElementToField,
    extractTargetGpsPoint,
    extractFatGpsPoint,
    getMaterielQuantity,
    countSbeePoles,
    countPetitJeanPoles,
  };
});
