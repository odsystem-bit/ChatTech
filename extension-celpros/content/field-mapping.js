// Field Mapping Engine pour CelPros (Celtiis) et FAT Automation
// Ce fichier définit les règles de correspondance intelligentes entre
// les données d'intervention ChapTech / FibreTrack et les éléments de formulaire HTML.

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
      valueExtractor: (data) => data.nom_client || "",
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
      valueExtractor: (data) => data.adresse_zone || "",
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
      valueExtractor: (data) => data.telephone_ligne || "",
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
      valueExtractor: (data) => data.mobile || data.telephone_ligne || "",
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
      valueExtractor: (data) => data.offre_souscrite || "Fibre Pro",
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
      valueExtractor: (data) => data.etat || "PON",
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
      valueExtractor: (data) => data.msan || "",
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
      valueExtractor: (data) => data.fat_ref || "",
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
      valueExtractor: (data) => data.port || "",
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
      valueExtractor: (data) => data.ports_disponibles || "",
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
        if (data.port_disponible !== undefined && data.port_disponible !== null && data.port_disponible !== "") {
          return Number(data.port_disponible);
        }
        if (data.ports_disponibles) {
          const list = data.ports_disponibles.split(",").filter((p) => p.trim());
          return list.length;
        }
        return 0;
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
        "puissance fat",
        "puissance fat dbm",
        "niveau optique fat",
        "dbm fat",
        "puissance au pbo",
        "mesure optique fat",
        "puissance pbo",
      ],
      valueExtractor: (data) => {
        const val = data.puissance_fat_dbm;
        return val !== undefined && val !== null ? String(val).replace(",", ".") : "";
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
      valueExtractor: (data) => data.type_cable || "Drop 1FO",
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
      valueExtractor: (data) => (data.depart_m !== undefined && data.depart_m !== null ? String(data.depart_m).replace(",", ".") : "0"),
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
      valueExtractor: (data) => (data.arrivee_m !== undefined && data.arrivee_m !== null ? String(data.arrivee_m).replace(",", ".") : "0"),
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
        "lineaire m",
        "lineaire",
        "longueur de cable",
        "longueur cable",
        "distance m",
        "metrage total",
      ],
      valueExtractor: (data) => {
        if (data.lineaire_m !== undefined && data.lineaire_m !== null && data.lineaire_m !== "") {
          return String(data.lineaire_m).replace(",", ".");
        }
        if (data.depart_m !== undefined && data.arrivee_m !== undefined) {
          const dep = parseFloat(String(data.depart_m).replace(",", ".")) || 0;
          const arr = parseFloat(String(data.arrivee_m).replace(",", ".")) || 0;
          const diff = Math.abs(arr - dep);
          return String(diff);
        }
        return "0";
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
      valueExtractor: (data) => String(data.nb_poteaux_traverses ?? 0),
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
      valueExtractor: (data) => String(data.nb_poteaux_implantes ?? 0),
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
      valueExtractor: (data) => String(data.nb_poteaux_armes ?? 0),
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
        "puissance pto",
        "puissance pto dbm",
        "niveau optique pto",
        "dbm pto",
        "puissance chez le client",
        "mesure pto",
        "puissance prise",
      ],
      valueExtractor: (data) => {
        const val = data.puissance_pto_dbm;
        return val !== undefined && val !== null ? String(val).replace(",", ".") : "";
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
      ],
      labelKeywords: [
        "qte pto",
        "quantite pto",
        "nombre de pto",
        "nombre pto",
        "pto posees",
      ],
      valueExtractor: (data) => String(data.pto_qte ?? 1),
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
      ],
      labelKeywords: [
        "qte repeteur wifi",
        "repeteur wifi",
        "quantite repeteur wifi",
        "repeteurs wifi",
        "repeteur",
        "extender",
      ],
      valueExtractor: (data) => String(data.repeteur_wifi_qte ?? 0),
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
      valueExtractor: (data) => data.emplacement_ont || "Salon",
    },

    mac: {
      key: "mac",
      label: "Adresse MAC ONT",
      category: "Intérieur",
      type: "text",
      attrPatterns: [
        /^field_mac$/i,
        /^field_adressemac$/i,
        /^mac$/i,
        /^macont$/i,
        /^adressemac$/i,
        /^adresse_mac$/i,
        /^macaddress$/i,
        /^ontmac$/i,
      ],
      labelKeywords: [
        "mac",
        "adresse mac",
        "mac ont",
        "adresse mac ont",
        "mac box",
      ],
      valueExtractor: (data) => data.mac || "",
    },

    sn: {
      key: "sn",
      label: "Numéro de série SN / ONT",
      category: "Intérieur",
      type: "text",
      attrPatterns: [
        /^field_sn$/i,
        /^field_ontsn$/i,
        /^field_serialnumber$/i,
        /^sn$/i,
        /^ont_sn$/i,
        /^ontsn$/i,
        /^serialnumber$/i,
        /^numeroserie$/i,
        /^serieont$/i,
        /^numserie$/i,
        /^snont$/i,
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
      valueExtractor: (data) => data.sn || data.ont_sn || "",
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
      valueExtractor: (data) => Boolean(data.client_confirme_emplacement),
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
      valueExtractor: (data) => Boolean(data.remise_equipement_ok),
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
      valueExtractor: (data) => Boolean(data.travaux_conformes),
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
      valueExtractor: (data) => Boolean(data.emplacement_valide),
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
      valueExtractor: (data) => Boolean(data.travail_propre),
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
      valueExtractor: (data) => Boolean(data.service_teste),
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
      valueExtractor: (data) => Boolean(data.service_fonctionne),
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
      valueExtractor: (data) => Boolean(data.explications_donnees),
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
      valueExtractor: (data) => Boolean(data.recommanderait),
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
      valueExtractor: (data) => Boolean(data.accepte_recontact),
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
      valueExtractor: (data) => data.qualite || "Satisfait",
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
      valueExtractor: (data) => data.delais || "Satisfait",
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
      valueExtractor: (data) => data.professionnalisme || "Satisfait",
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
      valueExtractor: (data) => data.nom_client_declaration || data.nom_client || "",
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
      valueExtractor: (data) => data.remarque_libre || data.appreciation_satisfaction_libre || "",
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
      valueExtractor: (data) => (data.date ? String(data.date).slice(0, 10) : new Date().toISOString().slice(0, 10)),
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
      valueExtractor: (data) => data.nom_technicien || "",
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
      valueExtractor: (data) => data.nom_equipe || "TELECOM BTP Services",
    },

    // ----------------------------------------------------
    // 6. GPS
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
  };

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
  function matchElementToField(element) {
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
            // Favorise les mots-clés plus spécifiques
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
  };
});
