import { useEffect, useRef, useState, useCallback } from "react";
import Tabs from "../components/Tabs";
import { TextField, CheckField, SelectField, ScannableField, GeocodableField } from "../components/FormField";
import {
  getIntervention,
  getInterventionLight,
  checkInterventionUpdatedAt,
  saveIntervention,
  saveInterventionLocally,
  ensureInterventionDefaults,
  toNormalizedTimestamp,
} from "../models/Intervention";
import PhotoViewerModal from "../components/PhotoViewerModal";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import {
  getCurrentPositionHighAccuracy,
  acquireBestPosition,
  findNearbyPoint,
  readFileAsDataUrl,
  embedGpsOnPhoto,
  reverseGeocode,
  reverseGeocodeZone,
  PRECISION_WARNING_THRESHOLD_M,
} from "../lib/geo";
import {
  recognizeFatAndMsanFromImage,
} from "../lib/ocrScanner";
import {
  getDesignations,
  resolveOrCreateDesignation,
  findExistingDesignation,
} from "../lib/stock";
import {
  computeAvailablePorts,
  ALL_FAT_PORTS,
} from "../lib/ports";
import { parseClientInfo } from "../lib/clientParser";
import { isInterventionTerminee } from "../lib/interventionFilters";
import { downloadPhotoFile } from "../lib/photoDownload";
import { findPhotoForSlot } from "../lib/slotPhotos";
import {
  IconFlag,
  IconHome,
  IconFileText,
  IconRefresh,
  IconCheckCircle,
  IconPole,
} from "../components/Icons";
import FichesOfficiellesModule from "../components/FichesOfficiellesModule";

const TABS = [
  { id: "rapport", label: "📋 Rapport" },
  { id: "photos", label: "📸 Photos CelPros" },
  { id: "gps", label: "📍 Poteaux & GPS" },
  { id: "satisfaction", label: "📄 Fiches & Signatures" },
  { id: "mise_en_service", label: "⚙️ Mise en service", hidden: true },
];

export const CELPROS_PHOTO_SLOTS = [
  {
    key: "fat",
    label: "Boîtier FAT",
    icon: "📦",
    description: "Boîtier FAT / PBO extérieur (lecture auto Référence FAT & MSAN)",
    hasOcr: true,
    keywords: ["image fat", "photo fat", "boitier fat", "fat"],
  },
  {
    key: "scan_fat",
    label: "image scan fat",
    icon: "🏷️",
    description: "Code-barres ou numéro de série gravé sur le FAT",
    keywords: ["image scan fat", "scan fat", "code barre fat", "etiquette fat", "barcode fat"],
    noBanner: true,
  },
  {
    key: "cable_interne",
    label: "Entrée câble interne",
    icon: "🏠",
    description: "Pénétration du câble fibre à l'intérieur du bâtiment",
    keywords: ["entree cable interne", "cable interne", "interne"],
  },
  {
    key: "cable_externe",
    label: "Entrée câble externe",
    icon: "🌳",
    description: "Point de pénétration extérieur en façade du bâtiment",
    keywords: ["entree cable externe", "cable externe", "externe"],
  },
  {
    key: "autre_poteau",
    label: "Autre poteau",
    icon: "🪵",
    description: "Autre support ou matériel classé dans la catégorie poteau sur CelPros (sans déduction stock ni comptage de vrai poteau)",
    keywords: ["autre poteau", "autre poto", "autre support", "materiel poteau", "poteau autre"],
    optional: true,
    noBanner: true,
  },
  {
    key: "fibre_fat",
    label: "Fibre au FAT",
    icon: "🧵",
    description: "Raccordement de la fibre optique sur le port du FAT",
    keywords: ["fibre au fat", "fibre fat"],
  },
  {
    key: "mesure_fat",
    label: "Mesure puissance au FAT",
    icon: "📊",
    description: "Écran du photomètre optique mesurant au FAT (dBm)",
    keywords: ["mesure fat", "photometre fat", "puissance fat"],
  },
  {
    key: "mesure_pto",
    label: "Mesure puissance au PTO",
    icon: "📊",
    description: "Écran du photomètre optique mesurant au PTO (dBm)",
    keywords: ["mesure pto", "photometre pto", "puissance pto"],
  },
  {
    key: "debit_cable",
    label: "Test débit câble RJ45",
    icon: "⚡",
    description: "Capture du test de débit réalisé par câble Ethernet",
    keywords: ["debit cable", "test debit cable", "speedtest cable"],
  },
  {
    key: "debit_wifi",
    label: "Test débit Wi-Fi",
    icon: "📶",
    description: "Capture du test de débit réalisé en Wi-Fi",
    keywords: ["debit wifi", "test debit wifi", "speedtest wifi"],
  },
  {
    key: "ont_sn",
    label: "Photo numéro de série",
    icon: "🏷️",
    description: "Photo numéro de série",
    keywords: ["photo numero de serie", "photo numero serie", "numero de serie", "photo ont", "etiquette ont", "box ont", "ont sn", "sn ont"],
  },
  {
    key: "combine",
    label: "Combiné téléphonique",
    icon: "📞",
    description: "Photo du combiné ou téléphone fixe raccordé",
    keywords: ["combine", "photo combine", "telephone"],
  },
  {
    key: "fiche_combine",
    label: "Fiche combiné",
    icon: "🔌",
    description: "Prise ou fiche de raccordement du combiné",
    keywords: ["fiche combine", "fiche raccordement"],
  },
  {
    key: "contrat_client",
    label: "Photo contrat client",
    icon: "📝",
    description: "Contrat ou fiche d'intervention signée par le client",
    keywords: ["photo contrat", "contrat client", "signature"],
    noBanner: true,
  },
];

const OFFRES = ["Fibre Pro", "Pro Max", "Pro Mega", "Office Max", "Office Mega"];
const _NIVEAUX = ["Très satisfait", "Satisfait", "Peu satisfait", "Insatisfait"];
const TYPES_POINT = ["Poteau", "Chambre", "FAT", "Abonné", "Autre"];
const SOUS_TYPES_POTEAU = ["Traversé", "Armé", "Implanté"];
const _PORTS_DISPONIBLES = Array.from({ length: 8 }, (_, index) => `Port ${index + 1}`);
const PROPRIETAIRES_SUGGERES = ["SBEE", "Petit Jean"];

const MATERIEL_STANDARD = [
  { key: "rue", label: "Rue", hidden: true },
  { key: "pince", label: "Pince" },
  { key: "crochets", label: "Crochets" },
  { key: "susp", label: "Suspente (Susp)" },
  { key: "piton", label: "Piton" },
  { key: "closer", label: "Closer" },
  { key: "rp1", label: "RP1", hidden: true },
  { key: "traverse_13t", label: "Traverse 13T" },
  { key: "traverse_15t", label: "Traverse 15T" },
  { key: "semelle_eq", label: "Semelle Eq" },
  { key: "poteau_sbee_non_arme", label: "Poteau SBEE non armé" },
  { key: "poteau_sbee_arme", label: "Poteau SBEE armé" },
];

export default function InterventionFormScreen({ intervention, onClose, onFinish, currentUser }) {
  const [data, setData] = useState(() => ensureInterventionDefaults(intervention));
  const dirtyFieldsRef = useRef(new Set());
  const dirtyRevisionsRef = useRef(new Map());
  const deletedGpsPointIdsRef = useRef(new Set());
  const deletedWhatsappPhotoIdsRef = useRef(new Set());
  const saveQueueRef = useRef(Promise.resolve());
  const changeRevisionRef = useRef(0);
  const [activeTab, setActiveTab] = useState("rapport");
  const [gpsStatus, setGpsStatus] = useState("");
  const [pointType, setPointType] = useState("Poteau");
  const [customType, setCustomType] = useState("");
  const [sousType, setSousType] = useState("Traversé");
  const [proprietaire, setProprietaire] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [pendingCapture, setPendingCapture] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [newMaterielName, setNewMaterielName] = useState("");
  const [newMaterielQte, setNewMaterielQte] = useState(1);
  const [materielFeedback, setMaterielFeedback] = useState("");
  const [whatsappPhotos, setWhatsappPhotos] = useState(() =>
    Array.isArray(intervention?.whatsapp_photos) ? intervention.whatsapp_photos : []
  );
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(new Set());
  const [whatsappStatus, setWhatsappStatus] = useState("");
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const waCameraInputRef = useRef(null);
  const waGalleryInputRef = useRef(null);
  const [waCapturing, setWaCapturing] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState("both");
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishSuccessData, setFinishSuccessData] = useState(null);

  // Géolocalisation automatique de la zone (Quartier, Ville)
  const [detectingZone, setDetectingZone] = useState(false);
  const [zoneStatus, setZoneStatus] = useState("");
  const [zoneStatusType, setZoneStatusType] = useState("info");

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Synchronisation sécurisée si les photos ou points arrivent depuis un rechargement ou autre agent
  useEffect(() => {
    if (!intervention) return;
    if (Array.isArray(intervention.whatsapp_photos)) {
      setWhatsappPhotos((prev) => {
        const deletedIds = deletedWhatsappPhotoIdsRef.current;
        const incoming = intervention.whatsapp_photos.filter((p) => {
          if (!p) return false;
          if (p.id && deletedIds.has(p.id)) return false;
          if (p.slot && (deletedIds.has(p.slot) || deletedIds.has(`slot_${p.slot}`))) return false;
          if (p.type && (deletedIds.has(p.type) || deletedIds.has(`slot_${p.type}`))) return false;
          return true;
        });
        if (!prev || prev.length === 0) return incoming;
        const incomingIds = new Set(incoming.map((p) => p?.id).filter(Boolean));
        const incomingSlots = new Set(incoming.map((p) => p?.slot).filter(Boolean));
        const localUnsynced = prev.filter((p) => {
          if (!p) return false;
          if (p.id && deletedIds.has(p.id)) return false;
          if (p.slot && (deletedIds.has(p.slot) || deletedIds.has(`slot_${p.slot}`))) return false;
          if (p.type && (deletedIds.has(p.type) || deletedIds.has(`slot_${p.type}`))) return false;
          if (p.id && incomingIds.has(p.id)) return false;
          if (p.slot && incomingSlots.has(p.slot)) return false;
          return true;
        });
        return [...incoming, ...localUnsynced];
      });
    }
    if (Array.isArray(intervention.points_gps)) {
      setData((prev) => {
        const deletedIds = deletedGpsPointIdsRef.current;
        const incoming = intervention.points_gps.filter((p) => {
          const key = p?.id || p?.horodatage;
          return !key || !deletedIds.has(key);
        });
        if (!prev.points_gps || prev.points_gps.length === 0) {
          return { ...prev, points_gps: incoming };
        }
        const incomingKeys = new Set(incoming.map((p) => p?.id || p?.horodatage).filter(Boolean));
        const localUnsynced = (prev.points_gps || []).filter((p) => {
          const key = p?.id || p?.horodatage;
          return key && !incomingKeys.has(key) && !deletedIds.has(key);
        });
        return { ...prev, points_gps: [...incoming, ...localUnsynced] };
      });
    }
  }, [intervention]);

  // Saisie rapide des informations client
  const [quickClientOpen, setQuickClientOpen] = useState(true);
  const [quickClientText, setQuickClientText] = useState("");
  const [quickClientStatus, setQuickClientStatus] = useState("");
  const [quickClientWarnings, setQuickClientWarnings] = useState([]);
  const [quickClientConflictModal, setQuickClientConflictModal] = useState(null);

  // Détection OCR automatique sur photo FAT (fat_ref & msan)
  const [ocrNotification, setOcrNotification] = useState(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  // Gestion des boîtes de photos structurées CelPros
  const slotCameraInputRef = useRef(null);
  const slotGalleryInputRef = useRef(null);
  const currentSlotKeyRef = useRef(null);
  const [slotCapturing, setSlotCapturing] = useState(false);
  const [slotActionFeedback, setSlotActionFeedback] = useState("");

  // Gestion dynamique des photos de poteaux géolocalisés (Photos CelPros)
  const poleCameraInputRef = useRef(null);
  const poleGalleryInputRef = useRef(null);
  const targetPoleNumeroRef = useRef(1);
  const [poleCapturingNumero, setPoleCapturingNumero] = useState(null);

  const selectedPorts = (data.ports_disponibles || "")
    .split(",")
    .map((port) => port.trim())
    .filter(Boolean);

  function markDirty(...fields) {
    for (const field of fields) {
      dirtyFieldsRef.current.add(field);
      dirtyRevisionsRef.current.set(field, ++changeRevisionRef.current);
    }
  }

  function handlePortChange(v) {
    const computed = computeAvailablePorts(v);
    markDirty("port", "ports_disponibles", "port_disponible");
    setData((prev) => ({
      ...prev,
      port: v,
      ports_disponibles: computed.ports_disponibles,
      port_disponible: computed.port_disponible,
      modifie_par: currentUser,
      modifie_le: new Date().toISOString(),
    }));
  }

  function togglePortDisponible(port) {
    const next = selectedPorts.includes(port)
      ? selectedPorts.filter((item) => item !== port)
      : [...selectedPorts, port];
    update("ports_disponibles", next.join(", "));
    update("port_disponible", next.length);
  }

  // Auto-save: sauvegarde locale instantanée (0ms) + synchronisation serveur légère et non-bloquante
  const syncTimerRef = useRef(null);

  const flushServerSync = useCallback(async () => {
    if (finishingRef.current || dirtyFieldsRef.current.size === 0) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    const dirtySnapshot = new Set(dirtyFieldsRef.current);
    const revisions = new Map(dirtyRevisionsRef.current);
    const currentData = dataRef.current;
    if (!currentData) return;

    // Optimisation majeure : n'envoyer les photos lourdes que si elles ont été expressément modifiées
    const isWaPhotosDirty = dirtySnapshot.has("whatsapp_photos");
    const isGpsDirty = dirtySnapshot.has("points_gps");

    const payload = {
      ...currentData,
      whatsapp_photos: isWaPhotosDirty || !currentData.updated_at ? (currentData.whatsapp_photos ?? whatsappPhotos) : [],
      points_gps: isGpsDirty || !currentData.updated_at ? currentData.points_gps : [],
      changed_fields: [...dirtySnapshot, "modifie_par", "modifie_le"],
      deleted_points: [...deletedGpsPointIdsRef.current],
      deleted_whatsapp_photos: [...deletedWhatsappPhotoIdsRef.current],
    };

    try {
      saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(() => saveIntervention(payload));
      const saved = await saveQueueRef.current;
      if (saved?._synced) {
        for (const field of dirtySnapshot) {
          if (dirtyRevisionsRef.current.get(field) === revisions.get(field)) dirtyFieldsRef.current.delete(field);
        }
        for (const id of payload.deleted_whatsapp_photos) deletedWhatsappPhotoIdsRef.current.delete(id);
        for (const id of payload.deleted_points) deletedGpsPointIdsRef.current.delete(id);
        if (saved?.updated_at) {
          setData((prev) => ({ ...prev, updated_at: saved.updated_at, modifie_le: saved.updated_at }));
        }
        setSaveStatus("✓ Enregistré");
      } else {
        setSaveStatus("✓ Sauvegardé (en attente réseau)");
      }
    } catch {
      // En cas de réseau instable, les données restent garanties dans le cache local
      setSaveStatus("✓ Sauvegardé (local)");
    }
  }, [whatsappPhotos]);

  useEffect(() => {
    if (finishingRef.current || dirtyFieldsRef.current.size === 0) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    // Debounce ultra-court de 400ms pour synchroniser en tâche de fond sans ralentir la frappe
    syncTimerRef.current = setTimeout(flushServerSync, 400);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [data, whatsappPhotos, flushServerSync]);

  const handleClose = useCallback(async () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    const latest = dataRef.current;
    if (latest) {
      saveInterventionLocally(latest);
      try {
        await flushServerSync();
      } catch {}
    }
    onClose();
  }, [flushServerSync, onClose]);

  useEffect(() => {
    function handleBeforeUnload() {
      if (dataRef.current) {
        saveInterventionLocally(dataRef.current);
        flushServerSync().catch(() => {});
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushServerSync]);

  useEffect(() => {
    let active = true;
    const refreshRemoteFields = async () => {
      if (!data.id || finishingRef.current) return;
      try {
        // Vérification ultra-rapide (50 octets) : est-ce que le serveur a une date plus récente ?
        const remoteUpdated = await checkInterventionUpdatedAt(data.id);
        if (!active || !remoteUpdated) return;
        const remoteTime = toNormalizedTimestamp(remoteUpdated);
        const localTime = toNormalizedTimestamp(data.updated_at || data.modifie_le);
        if (localTime >= remoteTime) return; // Déjà à jour

        const remote = await getInterventionLight(data.id);
        if (!active || !remote) return;
        setData((previous) => {
          const next = {
            ...previous,
            updated_at: remote.updated_at || remoteUpdated,
            modifie_le: remote.updated_at || remoteUpdated,
          };
          for (const [field, value] of Object.entries(remote)) {
            if (field === "materiel_pose") {
              const material = { ...previous.materiel_pose };
              for (const [designation, quantity] of Object.entries(value || {})) {
                if (!dirtyFieldsRef.current.has(`materiel_pose.${designation}`)) material[designation] = quantity;
              }
              next.materiel_pose = material;
            } else if (!["points_gps", "whatsapp_photos", "signature_client", "signature_technicien"].includes(field)) {
              // Protéger les champs dirty ou en cours de saisie
              const isDirty = dirtyFieldsRef.current.has(field) ||
                ((field === "nom_client" || field === "nom_dossier" || field === "nom_client_declaration") &&
                 (dirtyFieldsRef.current.has("nom_client") || dirtyFieldsRef.current.has("nom_dossier") || dirtyFieldsRef.current.has("nom_client_declaration")));

              if (!isDirty) {
                const prevVal = previous[field];
                const prevIsFilled = typeof prevVal === "string" ? prevVal.trim() !== "" : (prevVal !== null && prevVal !== undefined);
                const remoteIsEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");

                // Règle d'or : ne jamais écraser une valeur locale existante par du vide ou null distant
                if (prevIsFilled && remoteIsEmpty) {
                  // Garder la valeur locale
                } else {
                  next[field] = value;
                }
              }
            }
          }
          dataRef.current = next;
          saveInterventionLocally(next);
          return next;
        });
      } catch (error) {
        // Silencieux pour ne pas perturber l'utilisateur sur réseau mobile
      }
    };
    const timer = setInterval(refreshRemoteFields, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [data.id, data.updated_at, data.modifie_le]);

  const [manualRefreshing, setManualRefreshing] = useState(false);

  const handleManualRefreshIntervention = useCallback(async () => {
    if (manualRefreshing || !data.id) return;
    setManualRefreshing(true);
    setSaveStatus("Actualisation…");
    try {
      const fresh = await getIntervention(data.id);
      if (fresh) {
        const fullIntervention = { ...fresh, _fully_loaded: true };
        saveInterventionLocally(fullIntervention);
        setData((prev) => {
          const merged = { ...fullIntervention };
          for (const dirtyField of dirtyFieldsRef.current) {
            if (dirtyField.startsWith("materiel_pose.")) {
              const desig = dirtyField.replace("materiel_pose.", "");
              merged.materiel_pose = {
                ...(merged.materiel_pose || {}),
                [desig]: prev.materiel_pose?.[desig],
              };
            } else if (dirtyField in prev) {
              merged[dirtyField] = prev[dirtyField];
            }
          }
          for (const key of ["nom_client", "nom_dossier", "telephone_ligne", "mobile", "msan", "fat_ref", "port"]) {
            if (prev[key] && !merged[key]) {
              merged[key] = prev[key];
            }
          }
          dataRef.current = merged;
          return merged;
        });

        if (Array.isArray(fullIntervention.whatsapp_photos)) {
          setWhatsappPhotos((prev) => {
            const deletedIds = deletedWhatsappPhotoIdsRef.current;
            const incoming = fullIntervention.whatsapp_photos.filter((p) => {
              if (!p) return false;
              if (p.id && deletedIds.has(p.id)) return false;
              if (p.slot && (deletedIds.has(p.slot) || deletedIds.has(`slot_${p.slot}`))) return false;
              if (p.type && (deletedIds.has(p.type) || deletedIds.has(`slot_${p.type}`))) return false;
              return true;
            });
            const incomingIds = new Set(incoming.map((p) => p?.id).filter(Boolean));
            const incomingSlots = new Set(incoming.map((p) => p?.slot).filter(Boolean));
            const localUnsynced = prev.filter((p) => {
              if (!p) return false;
              if (p.id && deletedIds.has(p.id)) return false;
              if (p.slot && (deletedIds.has(p.slot) || deletedIds.has(`slot_${p.slot}`))) return false;
              if (p.type && (deletedIds.has(p.type) || deletedIds.has(`slot_${p.type}`))) return false;
              if (p.id && incomingIds.has(p.id)) return false;
              if (p.slot && incomingSlots.has(p.slot)) return false;
              return true;
            });
            return [...incoming, ...localUnsynced];
          });
        }
        setSaveStatus("✓ Données actualisées");
      }
    } catch (err) {
      console.warn("Manual refresh failed:", err);
      setSaveStatus("Erreur réseau");
    } finally {
      setManualRefreshing(false);
      setTimeout(() => setSaveStatus((s) => (s && s.includes("Actualisation") ? "" : s)), 2500);
    }
  }, [data.id, manualRefreshing]);

  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState === "visible" && data.id && !finishingRef.current && dirtyFieldsRef.current.size === 0) {
        try {
          const remoteUpdated = await checkInterventionUpdatedAt(data.id);
          const remoteTime = toNormalizedTimestamp(remoteUpdated);
          const localTime = toNormalizedTimestamp(data.updated_at || data.modifie_le);
          if (remoteTime > localTime) {
            handleManualRefreshIntervention();
          }
        } catch {}
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [data.id, data.updated_at, data.modifie_le, handleManualRefreshIntervention]);


  function update(field, value) {
    if (field === "points_gps") {
      const remainingHoros = new Set((value || []).map((point) => point.horodatage).filter(Boolean));
      const remainingIds = new Set((value || []).map((point) => point.id).filter(Boolean));
      for (const point of (data.points_gps || [])) {
        const hasHoro = point.horodatage && remainingHoros.has(point.horodatage);
        const hasId = point.id && remainingIds.has(point.id);
        if (!hasHoro && !hasId) {
          if (point.horodatage) deletedGpsPointIdsRef.current.add(point.horodatage);
          if (point.id) deletedGpsPointIdsRef.current.add(point.id);
        }
      }
    }
    if (field === "nom_client") {
      markDirty("nom_client", "nom_dossier", "nom_client_declaration");
    } else if (field === "nom_dossier") {
      markDirty("nom_dossier", "nom_client", "nom_client_declaration");
    } else {
      markDirty(
        field,
        ...(field === "depart_m" || field === "arrivee_m" ? ["lineaire_m"] : []),
        ...(field === "points_gps" ? ["nb_poteaux_traverses", "nb_poteaux_implantes", "nb_poteaux_armes"] : [])
      );
    }
    setData((prev) => {
      const next = {
        ...prev,
        [field]: value,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
      };
      if (field === "nom_client") {
        next.nom_dossier = value;
        if (!prev.nom_client_declaration || prev.nom_client_declaration === prev.nom_client) {
          next.nom_client_declaration = value;
        }
      } else if (field === "nom_dossier") {
        next.nom_client = value;
        if (!prev.nom_client_declaration || prev.nom_client_declaration === prev.nom_client) {
          next.nom_client_declaration = value;
        }
      }
      if (field === "depart_m" || field === "arrivee_m") {
        const depart = field === "depart_m" ? Number(value) : Number(prev.depart_m);
        const arrivee = field === "arrivee_m" ? Number(value) : Number(prev.arrivee_m);
        next.lineaire_m = Math.max(0, arrivee - depart);
      }
      if (field === "points_gps") {
        const poleList = (value || []).filter((p) => p && p.type === "Poteau");
        next.nb_poteaux_traverses = poleList.filter((p) => p.traverse !== undefined ? Boolean(p.traverse) : (p.sous_type !== "Implanté")).length;
        next.nb_poteaux_implantes = poleList.filter((p) => p.implante !== undefined ? Boolean(p.implante) : (p.sous_type === "Implanté")).length;
        next.nb_poteaux_armes = poleList.filter((p) => p.arme !== undefined ? Boolean(p.arme) : (p.sous_type === "Armé")).length;
      }
      dataRef.current = next;
      // Sauvegarde locale instantanée à 0ms dans le navigateur/smartphone
      saveInterventionLocally(next);
      return next;
    });
    setSaveStatus("Enregistrement…");
  }

  const resolvedType = pointType === "Autre" ? customType.trim() : pointType;

  function nextNumeroForType(type, forSousType) {
    const pts = Array.isArray(data.points_gps) ? data.points_gps : [];
    const count = pts.filter(
      (p) => p && p.type === type && (type !== "Poteau" || p.sous_type === forSousType)
    ).length;
    return count + 1;
  }

  function openCamera() {
    if (!resolvedType) {
      setGpsStatus("Indiquez un type de point avant de prendre la photo.");
      return;
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
      cameraInputRef.current.click();
    }
  }

  function openGallery() {
    if (!resolvedType) {
      setGpsStatus("Indiquez un type de point avant de choisir une photo.");
      return;
    }
    if (galleryInputRef.current) {
      galleryInputRef.current.value = "";
      galleryInputRef.current.click();
    }
  }

  async function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCapturing(true);
    setGpsStatus("Lecture de la photo et de la position GPS…");
    try {
      const [photoDataUrl, pos] = await Promise.all([
        readFileAsDataUrl(file),
        getCurrentPositionHighAccuracy(),
      ]);

      if (e.target) e.target.value = "";

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const precision_m = pos.coords.accuracy;
      const horodatage = new Date().toISOString();
      const isPoteau = resolvedType === "Poteau";
      const numero = nextNumeroForType(resolvedType, isPoteau ? sousType : undefined);

      setGpsStatus("Recherche de l'adresse (lieu)…");
      const lieu = await reverseGeocode(lat, lng);

      const embeddedLabel = isPoteau
        ? `Poteau ${sousType} ${numero}${proprietaire ? ` (${proprietaire})` : ""}`
        : `${resolvedType} ${numero}`;

      const embeddedPhoto = await embedGpsOnPhoto(photoDataUrl, {
        type: embeddedLabel,
        lieu,
        lat,
        lng,
        precision_m,
        horodatage,
      });

      setPendingCapture({ photo: embeddedPhoto, lat, lng, precision_m, horodatage, lieu, numero });

      if (precision_m > PRECISION_WARNING_THRESHOLD_M) {
        setGpsStatus(
          `Précision faible : ±${precision_m.toFixed(1)} m (seuil ${PRECISION_WARNING_THRESHOLD_M} m). Rapprochez-vous d'un espace dégagé et reprenez la photo, ou validez si acceptable.`
        );
      } else {
        setGpsStatus(`Précision ±${precision_m.toFixed(1)} m. Vérifiez et validez.`);
      }
    } catch (err) {
      setGpsStatus(`Erreur : ${err.message}`);
    } finally {
      setCapturing(false);
    }
  }

  function retakePhoto() {
    setPendingCapture(null);
    setGpsStatus("");
  }

  function validateCapture() {
    if (!pendingCapture) return;

    const nearby = findNearbyPoint(
      { lat: pendingCapture.lat, lng: pendingCapture.lng },
      data.points_gps,
      20
    );

    if (nearby) {
      setConflict(nearby);
      return;
    }

    commitPoint();
  }

  function commitPoint() {
    const isPoteau = resolvedType === "Poteau";
    const point = {
      id: crypto.randomUUID(),
      type: resolvedType,
      ...(isPoteau ? {
        sous_type: sousType,
        proprietaire: proprietaire.trim(),
        type_poteau: proprietaire.trim(),
        traverse: sousType !== "Implanté",
        implante: sousType === "Implanté",
        arme: sousType === "Armé",
      } : {}),
      ...pendingCapture,
      ajoute_par: currentUser,
    };
    update("points_gps", [...data.points_gps, point]);

    // Also add the photo to the terrain gallery (hors rapport)
    if (pendingCapture.photo) {
      const isFat = resolvedType === "FAT";
      const isAbonne = resolvedType === "Abonné";
      const slot = isFat ? "fat" : isAbonne ? "ont_sn" : isPoteau ? `poteau_${point.numero}` : undefined;
      const galleryPhoto = {
        id: crypto.randomUUID(),
        ...(slot
          ? {
              slot,
              type: isPoteau ? "poteau" : slot,
              label: isFat ? "Boîtier FAT" : isAbonne ? "Photo numéro de série" : `Poteau ${sousType} ${point.numero}`,
              name: `${slot}.jpg`,
              description: `${isFat ? "Boîtier FAT" : isAbonne ? "Photo numéro de série" : `Poteau ${sousType}`} - ${data.nom_client || "Intervention"}`,
            }
          : {}),
        url: pendingCapture.photo,
        lat: pendingCapture.lat,
        lng: pendingCapture.lng,
        precision_m: pendingCapture.precision_m,
        horodatage: pendingCapture.horodatage,
        lieu: pendingCapture.lieu,
        from_gps: true,
        added: new Date().toISOString(),
      };
      setWhatsappPhotos((prev) => {
        const filtered = slot ? prev.filter((p) => p.slot !== slot) : prev;
        return [...filtered, galleryPhoto];
      });
      markDirty("whatsapp_photos");

      if (isFat) {
        runFatOcrOnPhoto(pendingCapture.photo);
      }
    }

    setPendingCapture(null);
    setConflict(null);
    setCustomType("");
    setProprietaire("");
    setGpsStatus(`Point "${resolvedType} ${point.numero}" ajouté.`);
  }

  function reuseExistingPoint() {
    setGpsStatus(
      `Point existant réutilisé (${conflict.type} ${conflict.numero}, ajouté par ${conflict.ajoute_par} le ${new Date(conflict.horodatage).toLocaleString()}). Aucun doublon créé.`
    );
    setPendingCapture(null);
    setConflict(null);
  }

  function confirmNewPointAnyway() {
    commitPoint();
  }

  function updateMateriel(designation, qte) {
    markDirty(`materiel_pose.${designation}`);
    setData((prev) => {
      const next = {
        ...prev,
        materiel_pose: { ...prev.materiel_pose, [designation]: Number(qte) },
      };
      saveInterventionLocally(next);
      return next;
    });
    setSaveStatus("✓ Enregistré");
  }

  function handleAddMateriel(e) {
    e.preventDefault();
    const qte = Number(newMaterielQte);
    if (!newMaterielName.trim() || !qte) return;

    const existing = findExistingDesignation(newMaterielName);
    const designation = resolveOrCreateDesignation(newMaterielName);
    markDirty(`materiel_pose.${designation}`);

    setData((prev) => ({
      ...prev,
      materiel_pose: {
        ...prev.materiel_pose,
        [designation]: (prev.materiel_pose[designation] ?? 0) + qte,
      },
      modifie_par: currentUser,
      modifie_le: new Date().toISOString(),
    }));

    setMaterielFeedback(
      existing
        ? `Ajouté à "${existing}" (désignation existante reconnue).`
        : `Nouveau matériau "${designation}" créé.`
    );
    setNewMaterielName("");
    setNewMaterielQte(1);
  }

  function removeMateriel(designation) {
    markDirty(`materiel_pose.${designation}`);
    setData((prev) => {
      const next = { ...prev.materiel_pose };
      delete next[designation];
      return { ...prev, materiel_pose: next };
    });
  }

  // ===== Détection automatique de Zone (Reverse Geocoding) =====

  async function handleDetectZone() {
    setDetectingZone(true);
    setZoneStatus("Géolocalisation GPS en cours…");
    setZoneStatusType("info");
    try {
      const pos = await getCurrentPositionHighAccuracy();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setZoneStatus("Recherche du quartier / zone…");
      const zone = await reverseGeocodeZone(lat, lng);
      if (zone) {
        update("adresse_zone", zone);
        setZoneStatus(`✓ ${zone}`);
        setZoneStatusType("success");
      } else {
        const fallback = `Zone GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        update("adresse_zone", fallback);
        setZoneStatus(`✓ ${fallback}`);
        setZoneStatusType("success");
      }
      setData((prev) => {
        const next = { ...prev, latitude: prev.latitude || lat, longitude: prev.longitude || lng };
        dataRef.current = next;
        saveInterventionLocally(next);
        return next;
      });
    } catch (err) {
      setZoneStatus(`Erreur GPS : ${err.message || "Indisponible"}`);
      setZoneStatusType("error");
    } finally {
      setDetectingZone(false);
    }
  }

  // ===== OCR automatique sur photo du boîtier FAT (avec vérification de conformité) =====

  const runFatOcrOnPhoto = useCallback(async (photoDataUrl) => {
    if (!photoDataUrl) return;
    setOcrProcessing(true);
    try {
      const ocrResult = await recognizeFatAndMsanFromImage(photoDataUrl);
      const currentFat = dataRef.current?.fat_ref || "";
      const currentMsan = dataRef.current?.msan || "";

      const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

      const hasOcrFat = Boolean(ocrResult.fat_ref);
      const hasOcrMsan = Boolean(ocrResult.msan);

      if (!hasOcrFat && !hasOcrMsan) {
        setOcrNotification({
          text: "ℹ️ Photo FAT enregistrée. Référence FAT et MSAN non lisibles automatiquement sur la boîte, vous pouvez les renseigner manuellement.",
          success: false,
        });
        setTimeout(() => setOcrNotification(null), 9000);
        return;
      }

      const updates = {};
      const statusParts = [];
      let isConforme = true;
      let hadExisting = false;

      // 1. Vérification / affectation Référence FAT
      if (hasOcrFat) {
        const ocrFat = ocrResult.fat_ref;
        if (currentFat) {
          hadExisting = true;
          if (norm(currentFat) === norm(ocrFat)) {
            statusParts.push(`FAT conforme (${ocrFat})`);
          } else {
            isConforme = false;
            updates.fat_ref = ocrFat;
            statusParts.push(`FAT non conforme corrigé ("${currentFat}" ➔ "${ocrFat}")`);
          }
        } else {
          updates.fat_ref = ocrFat;
          statusParts.push(`FAT détecté ("${ocrFat}")`);
        }
      }

      // 2. Vérification / affectation MSAN
      if (hasOcrMsan) {
        const ocrMsan = ocrResult.msan;
        if (currentMsan) {
          hadExisting = true;
          if (norm(currentMsan) === norm(ocrMsan)) {
            statusParts.push(`MSAN conforme (${ocrMsan})`);
          } else {
            isConforme = false;
            updates.msan = ocrMsan;
            statusParts.push(`MSAN non conforme corrigé ("${currentMsan}" ➔ "${ocrMsan}")`);
          }
        } else {
          updates.msan = ocrMsan;
          statusParts.push(`MSAN détecté ("${ocrMsan}")`);
        }
      }

      // Appliquer les mises à jour / corrections
      for (const [k, v] of Object.entries(updates)) {
        update(k, v);
      }

      let notifMsg = "";
      if (hadExisting && isConforme) {
        notifMsg = `✅ Conforme : La photo du boîtier FAT valide parfaitement les informations (${statusParts.join(", ")}). Validé automatiquement !`;
      } else if (hadExisting && !isConforme) {
        notifMsg = `⚠️ Contrôle photo FAT : Correction effectuée d'après la photo du boîtier (${statusParts.join(", ")}).`;
      } else {
        notifMsg = `✅ Boîtier FAT analysé : ${statusParts.join(", ")}. Validé automatiquement !`;
      }

      setOcrNotification({ text: notifMsg, success: isConforme || !hadExisting });
      setTimeout(() => setOcrNotification(null), 10000);
    } catch (err) {
      console.warn("OCR FAT error:", err);
    } finally {
      setOcrProcessing(false);
    }
  }, [update]);

  // ===== Gestion des Boîtes de Photos CelPros =====

  function getPhotoForSlot(slotKey) {
    // Logique STRICTE partagée (lib/slotPhotos.js) : aucun repli flou, étanchéité absolue de chaque catégorie
    return findPhotoForSlot(whatsappPhotos, data.points_gps, slotKey);
  }

  function openSlotCamera(slotKey) {
    currentSlotKeyRef.current = slotKey;
    if (slotCameraInputRef.current) {
      slotCameraInputRef.current.value = "";
      slotCameraInputRef.current.click();
    }
  }

  function openSlotGallery(slotKey) {
    currentSlotKeyRef.current = slotKey;
    if (slotGalleryInputRef.current) {
      slotGalleryInputRef.current.value = "";
      slotGalleryInputRef.current.click();
    }
  }

  async function handleSlotPhotoSelected(e) {
    const file = e.target.files?.[0];
    const slotKey = currentSlotKeyRef.current;
    if (!file || !slotKey) return;

    const slotDef = CELPROS_PHOTO_SLOTS.find((s) => s.key === slotKey);
    const slotLabel = slotDef?.label || slotKey;
    const noBanner = Boolean(slotDef?.noBanner) || ["scan_fat", "autre_poteau", "contrat_client"].includes(slotKey);

    setSlotCapturing(true);
    setSlotActionFeedback(`Capture et géolocalisation pour "${slotLabel}"…`);
    try {
      const [photoDataUrl, pos] = await Promise.all([
        readFileAsDataUrl(file),
        getCurrentPositionHighAccuracy(),
      ]);

      if (e.target) e.target.value = "";

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const precision_m = pos.coords.accuracy;
      const horodatage = new Date().toISOString();

      setSlotActionFeedback(`Géocodage de l'adresse…`);
      const lieu = await reverseGeocode(lat, lng);

      const embeddedPhoto = await embedGpsOnPhoto(photoDataUrl, {
        type: `${slotLabel} - ${data.nom_client || "Intervention"}`,
        lieu,
        lat,
        lng,
        precision_m,
        horodatage,
        noBanner,
      });

      const newPhoto = {
        id: crypto.randomUUID(),
        slot: slotKey,
        type: slotKey,
        label: slotLabel,
        name: `${slotKey}.jpg`,
        description: `${slotLabel} - ${data.nom_client || "Intervention"}`,
        url: embeddedPhoto,
        lat,
        lng,
        precision_m,
        horodatage,
        lieu,
        no_banner: noBanner,
        added: new Date().toISOString(),
        additionnelle: false,
        is_additionnelle: false,
        exclude_celpros: false,
      };

      // Retirer les anciens marqueurs de suppression pour ce slot
      deletedWhatsappPhotoIdsRef.current.delete(slotKey);
      deletedWhatsappPhotoIdsRef.current.delete(`slot_${slotKey}`);

      let nextPhotos;
      if (slotKey === "autre_poteau") {
        const existingAutre = (whatsappPhotos || []).filter(
          (p) => p && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau")
        );
        newPhoto.name = `autre_poteau_${existingAutre.length + 1}.jpg`;
        newPhoto.label = `Autre poteau (${existingAutre.length + 1})`;
        newPhoto.description = `Autre poteau ${existingAutre.length + 1} - ${data.nom_client || "Intervention"}`;
        nextPhotos = [...(whatsappPhotos || []), newPhoto];
      } else {
        const filtered = (whatsappPhotos || []).filter((p) => p && p.slot !== slotKey && p.type !== slotKey);
        nextPhotos = [...filtered, newPhoto];
      }

      // Si c'est FAT ou ONT/Abonné, mettre également à jour et géolocaliser le point GPS
      let foundFat = false;
      let foundAbonne = false;
      const nextPoints = (data.points_gps || []).map((pt) => {
        if (!pt) return pt;
        if (slotKey === "fat" && String(pt.type).trim().toUpperCase() === "FAT") {
          foundFat = true;
          return {
            ...pt,
            lat,
            lng,
            precision_m,
            lieu,
            photo: embeddedPhoto,
            photo_deleted: false,
            horodatage,
          };
        }
        if ((slotKey === "ont_sn" || slotKey === "cable_interne") && ["ABONNÉ", "ABONNE", "CLIENT", "ONT"].includes(String(pt.type).trim().toUpperCase())) {
          foundAbonne = true;
          return {
            ...pt,
            lat,
            lng,
            precision_m,
            lieu,
            photo: embeddedPhoto,
            photo_deleted: false,
            horodatage,
          };
        }
        return pt;
      });

      if (slotKey === "fat" && !foundFat) {
        nextPoints.push({
          id: crypto.randomUUID(),
          type: "FAT",
          lat,
          lng,
          precision_m,
          lieu,
          photo: embeddedPhoto,
          photo_deleted: false,
          horodatage,
          ajoute_par: currentUser || "Technicien",
        });
      }

      if ((slotKey === "ont_sn" || slotKey === "cable_interne") && !foundAbonne) {
        nextPoints.push({
          id: crypto.randomUUID(),
          type: "Abonné",
          lat,
          lng,
          precision_m,
          lieu,
          photo: embeddedPhoto,
          photo_deleted: false,
          horodatage,
          ajoute_par: currentUser || "Technicien",
        });
      }

      const nextData = {
        ...data,
        whatsapp_photos: nextPhotos,
        points_gps: nextPoints,
        ...(slotKey === "fat" ? { latitude_fat: lat, longitude_fat: lng } : {}),
        ...(slotKey === "ont_sn" || slotKey === "cable_interne" ? { latitude: lat, longitude: lng } : {}),
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        _deleted_photo_ids: Array.from(deletedWhatsappPhotoIdsRef.current),
        _deleted_point_ids: Array.from(deletedGpsPointIdsRef.current),
        _fully_loaded: true,
      };

      setWhatsappPhotos(nextPhotos);
      setData(nextData);
      dataRef.current = nextData;
      saveInterventionLocally(nextData);
      markDirty("whatsapp_photos", "points_gps");
      setSaveStatus("✓ Photo enregistrée");
      setSlotActionFeedback(`✓ Photo "${slotLabel}" enregistrée et sauvegardée sur votre téléphone.`);
      flushServerSync().catch(() => {});

      // Sauvegarde / téléchargement automatique immédiat sur le téléphone de l'agent
      downloadPhotoFile(newPhoto, data.nom_client).catch((dlErr) => {
        console.warn("Auto-sauvegarde sur le téléphone:", dlErr);
        setSlotActionFeedback(`⚠️ Photo enregistrée dans l'app, mais non sauvegardée sur le téléphone : ${dlErr.message}`);
      });

      // Si c'est la photo du boîtier FAT, extraction automatique OCR de Référence FAT et MSAN !
      if (slotKey === "fat") {
        runFatOcrOnPhoto(photoDataUrl);
      }
    } catch (err) {
      setSlotActionFeedback(`Erreur : ${err.message}`);
    } finally {
      setSlotCapturing(false);
    }
  }

  async function removeSlotPhoto(slotKey) {
    const existing = getPhotoForSlot(slotKey);
    if (!existing) return;
    const slotDef = CELPROS_PHOTO_SLOTS.find((s) => s.key === slotKey);
    const slotLabel = slotDef?.label || slotKey;
    if (confirm(`Supprimer définitivement la photo de la catégorie "${slotLabel}" ?`)) {
      markDirty("whatsapp_photos", "points_gps");
      if (existing.id) deletedWhatsappPhotoIdsRef.current.add(existing.id);
      deletedWhatsappPhotoIdsRef.current.add(slotKey);
      deletedWhatsappPhotoIdsRef.current.add(`slot_${slotKey}`);
      if (existing.type) deletedWhatsappPhotoIdsRef.current.add(existing.type);

      const isPole = slotKey.startsWith("poteau_");
      const poleNum = isPole ? Number(slotKey.replace("poteau_", "")) : null;

      // Nettoyer points_gps (pour FAT, Abonné/ONT, ou Poteau)
      const nextPoints = (data.points_gps || []).map((pt) => {
        if (!pt) return pt;
        if (slotKey === "fat" && String(pt.type).trim().toUpperCase() === "FAT") {
          return { ...pt, photo: "", photo_deleted: true };
        }
        if (slotKey === "ont_sn" && (String(pt.type).trim().toUpperCase() === "ABONNÉ" || String(pt.type).trim().toUpperCase() === "ONT")) {
          return { ...pt, photo: "", photo_deleted: true };
        }
        if (isPole && String(pt.type).trim().toUpperCase() === "POTEAU" && Number(pt.numero) === poleNum) {
          return { ...pt, photo: "", photo_deleted: true };
        }
        if (existing.id && pt.id === existing.id) {
          return { ...pt, photo: "", photo_deleted: true };
        }
        return pt;
      });

      // Nettoyer whatsapp_photos
      const nextPhotos = (whatsappPhotos || []).filter((p) => {
        if (!p) return false;
        if (existing.id && p.id === existing.id) return false;
        if (p.slot === slotKey || p.type === slotKey) {
          if (p.id) deletedWhatsappPhotoIdsRef.current.add(p.id);
          return false;
        }
        if (slotKey === "autre_poteau" && (p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau")) {
          if (p.id) deletedWhatsappPhotoIdsRef.current.add(p.id);
          return false;
        }
        return true;
      });

      const nextData = {
        ...data,
        whatsapp_photos: nextPhotos,
        points_gps: nextPoints,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        _deleted_photo_ids: Array.from(deletedWhatsappPhotoIdsRef.current),
        _deleted_point_ids: Array.from(deletedGpsPointIdsRef.current),
        _fully_loaded: true,
      };

      setWhatsappPhotos(nextPhotos);
      setData(nextData);
      dataRef.current = nextData;
      saveInterventionLocally(nextData);

      setSaveStatus("✓ Photo supprimée");
      setSlotActionFeedback(`Photo "${slotLabel}" supprimée définitivement.`);
      setTimeout(() => setSlotActionFeedback(""), 3000);

      try {
        await flushServerSync();
      } catch (err) {
        console.warn("Erreur synchronisation suppression photo:", err);
      }
    }
  }

  async function removeAutrePoteauPhoto(photoId) {
    if (!photoId) return;
    const target = (whatsappPhotos || []).find((p) => p && p.id === photoId);
    if (!target) return;
    if (confirm("Supprimer définitivement cette photo d'Autre poteau ?")) {
      markDirty("whatsapp_photos");
      deletedWhatsappPhotoIdsRef.current.add(photoId);

      const nextPhotos = (whatsappPhotos || []).filter((p) => p && p.id !== photoId);
      const nextData = {
        ...data,
        whatsapp_photos: nextPhotos,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        _deleted_photo_ids: Array.from(deletedWhatsappPhotoIdsRef.current),
        _fully_loaded: true,
      };

      setWhatsappPhotos(nextPhotos);
      setData(nextData);
      dataRef.current = nextData;
      saveInterventionLocally(nextData);

      setSaveStatus("✓ Photo supprimée");
      setSlotActionFeedback("Photo d'Autre poteau supprimée définitivement.");
      setTimeout(() => setSlotActionFeedback(""), 3000);

      try {
        await flushServerSync();
      } catch (err) {
        console.warn("Erreur suppression photo autre poteau:", err);
      }
    }
  }

  // ===== Saisie rapide des informations client =====
  function handleApplyQuickClientText(textToParse) {
    const raw = typeof textToParse === "string" ? textToParse : quickClientText;
    const parsed = parseClientInfo(raw);
    if (!parsed.success || parsed.extractedCount === 0) {
      setQuickClientStatus("⚠️ Aucune information reconnue dans le texte collé.");
      setQuickClientWarnings(parsed.warnings);
      return;
    }

    const { nom_client, telephone_ligne, mobile, msan, fat_ref } = parsed.data;

    // Détecter les conflits avec les valeurs existantes déjà saisies
    const conflicts = [];
    const isPlaceholder = (val) => !val || /^nouveau(?:lle)?\s+(?:dossier|intervention)/i.test(String(val).trim());
    if (nom_client && data.nom_client && !isPlaceholder(data.nom_client) && data.nom_client.trim().toLowerCase() !== nom_client.trim().toLowerCase()) {
      conflicts.push({ field: "nom_client", label: "Nom du client", currentVal: data.nom_client, newVal: nom_client });
    }
    if (telephone_ligne && data.telephone_ligne && data.telephone_ligne.trim() !== telephone_ligne.trim()) {
      conflicts.push({ field: "telephone_ligne", label: "Numéro de ligne", currentVal: data.telephone_ligne, newVal: telephone_ligne });
    }
    if (mobile && data.mobile && data.mobile.trim() !== mobile.trim()) {
      conflicts.push({ field: "mobile", label: "Numéro de téléphone", currentVal: data.mobile, newVal: mobile });
    }
    if (msan && data.msan && data.msan.trim().toLowerCase() !== msan.trim().toLowerCase()) {
      conflicts.push({ field: "msan", label: "MSAN", currentVal: data.msan, newVal: msan });
    }
    if (fat_ref && data.fat_ref && data.fat_ref.trim().toLowerCase() !== fat_ref.trim().toLowerCase()) {
      conflicts.push({ field: "fat_ref", label: "Référence FAT", currentVal: data.fat_ref, newVal: fat_ref });
    }

    if (conflicts.length > 0) {
      setQuickClientConflictModal({
        pendingData: parsed.data,
        conflicts,
        warnings: parsed.warnings,
      });
      return;
    }

    applyParsedClientData(parsed.data, parsed.warnings);
  }

  function applyParsedClientData(extracted, warnings = []) {
    const fieldsToMark = [];
    const appliedFields = [];

    if (extracted.nom_client) {
      fieldsToMark.push("nom_client", "nom_dossier", "nom_client_declaration");
      appliedFields.push(`Nom : "${extracted.nom_client}"`);
    }
    if (extracted.telephone_ligne) {
      fieldsToMark.push("telephone_ligne");
      appliedFields.push(`Ligne : "${extracted.telephone_ligne}"`);
    }
    if (extracted.mobile) {
      fieldsToMark.push("mobile");
      appliedFields.push(`Tél : "${extracted.mobile}"`);
    }
    if (extracted.msan) {
      fieldsToMark.push("msan");
      appliedFields.push(`MSAN : "${extracted.msan}"`);
    }
    if (extracted.fat_ref) {
      fieldsToMark.push("fat_ref");
      appliedFields.push(`FAT : "${extracted.fat_ref}"`);
    }

    // Synchronisation immédiate des champs modifiés pour la file d'attente serveur
    if (fieldsToMark.length > 0) {
      markDirty(...fieldsToMark);
    }

    setData((prev) => {
      const next = { ...prev, modifie_par: currentUser, modifie_le: new Date().toISOString() };
      if (extracted.nom_client) {
        next.nom_client = extracted.nom_client;
        next.nom_dossier = extracted.nom_client;
        if (!prev.nom_client_declaration || prev.nom_client_declaration === prev.nom_client) {
          next.nom_client_declaration = extracted.nom_client;
        }
      }
      if (extracted.telephone_ligne) {
        next.telephone_ligne = extracted.telephone_ligne;
      }
      if (extracted.mobile) {
        next.mobile = extracted.mobile;
      }
      if (extracted.msan) {
        next.msan = extracted.msan;
      }
      if (extracted.fat_ref) {
        next.fat_ref = extracted.fat_ref;
      }
      dataRef.current = next;
      saveInterventionLocally(next);
      return next;
    });

    setQuickClientConflictModal(null);
    setQuickClientWarnings(warnings);
    setQuickClientStatus(`✅ Informations réparties avec succès (${appliedFields.join(", ")})`);
    setTimeout(() => setQuickClientStatus(""), 7000);

    // Déclencher immédiatement l'enregistrement serveur pour propagation temps réel à toute l'équipe
    if (fieldsToMark.length > 0) {
      setSaveStatus("Enregistrement…");
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      setTimeout(() => {
        flushServerSync().catch(() => {});
      }, 50);
    }
  }

  // ===== Photos de Poteaux Géolocalisés (section dynamique Photos CelPros) =====
  function openPoleCamera(numero) {
    targetPoleNumeroRef.current = Number(numero);
    if (poleCameraInputRef.current) {
      poleCameraInputRef.current.value = "";
      poleCameraInputRef.current.click();
    }
  }

  function openPoleGallery(numero) {
    targetPoleNumeroRef.current = Number(numero);
    if (poleGalleryInputRef.current) {
      poleGalleryInputRef.current.value = "";
      poleGalleryInputRef.current.click();
    }
  }

  function handleAddPole() {
    const currentLatestData = dataRef.current || data;
    const existingNums = [
      ...(currentLatestData.points_gps || [])
        .filter((p) => p && p.type === "Poteau" && Number(p.numero) > 0)
        .map((p) => Number(p.numero)),
      ...(whatsappPhotos || [])
        .map((p) => {
          const m = p?.slot?.match(/^poteau_(\d+)$/);
          return m ? Number(m[1]) : 0;
        })
        .filter((n) => n > 0),
    ];
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

    const newPole = {
      id: crypto.randomUUID(),
      type: "Poteau",
      numero: nextNum,
      traverse: true,
      implante: false,
      arme: false,
      type_poteau: "",
      proprietaire: "",
      sous_type: "Traversé",
      photo: "",
      lat: null,
      lng: null,
      precision_m: null,
      horodatage: new Date().toISOString(),
      lieu: "",
      ajoute_par: currentUser || "Technicien",
    };

    const nextPoints = [
      ...(currentLatestData.points_gps || []).filter(
        (p) => !(p && p.type === "Poteau" && Number(p.numero) === nextNum)
      ),
      newPole,
    ];
    const poleList = nextPoints.filter((p) => p && p.type === "Poteau");
    const nbTraverses = poleList.filter((p) => p.traverse !== undefined ? Boolean(p.traverse) : (p.sous_type !== "Implanté")).length;
    const nbImplantes = poleList.filter((p) => p.implante !== undefined ? Boolean(p.implante) : (p.sous_type === "Implanté")).length;
    const nbArmes = poleList.filter((p) => p.arme !== undefined ? Boolean(p.arme) : (p.sous_type === "Armé")).length;

    markDirty("points_gps", "nb_poteaux_traverses", "nb_poteaux_implantes", "nb_poteaux_armes");
    setData((prev) => {
      const next = {
        ...prev,
        points_gps: nextPoints,
        nb_poteaux_traverses: nbTraverses,
        nb_poteaux_implantes: nbImplantes,
        nb_poteaux_armes: nbArmes,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        _fully_loaded: true,
      };
      saveInterventionLocally(next);
      return next;
    });

    setSaveStatus("✓ Poteau ajouté");
    setSlotActionFeedback(`➕ Poteau ${nextNum} ajouté`);
    setTimeout(() => setSlotActionFeedback(""), 4000);
    setTimeout(() => {
      const el = document.getElementById(`pole-slot-card-${nextNum}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
  }

  function handlePoleOptionChange(poleNum, optionKey, optionValue) {
    const currentLatestData = dataRef.current || data;
    const list = [...(currentLatestData.points_gps || [])];
    const poleIdx = list.findIndex(
      (p) => p && p.type === "Poteau" && Number(p.numero) === Number(poleNum)
    );

    let currentPole;
    if (poleIdx >= 0) {
      currentPole = list[poleIdx];
    } else {
      const wa = (whatsappPhotos || []).find((p) => p && p.slot === `poteau_${poleNum}`);
      currentPole = {
        id: wa?.id || crypto.randomUUID(),
        type: "Poteau",
        numero: Number(poleNum),
        traverse: true,
        implante: false,
        arme: false,
        type_poteau: "",
        proprietaire: "",
        sous_type: "Traversé",
        photo: wa?.url || "",
        lat: wa?.lat ?? null,
        lng: wa?.lng ?? null,
        precision_m: wa?.precision_m ?? null,
        lieu: wa?.lieu || "",
        horodatage: wa?.horodatage || new Date().toISOString(),
        ajoute_par: currentUser || "Technicien",
      };
    }

    const updatedPole = { ...currentPole, [optionKey]: optionValue };

    if (optionKey === "type_poteau") {
      updatedPole.proprietaire = optionValue;
    }

    if (updatedPole.implante) updatedPole.sous_type = "Implanté";
    else if (updatedPole.arme) updatedPole.sous_type = "Armé";
    else if (updatedPole.traverse) updatedPole.sous_type = "Traversé";
    else updatedPole.sous_type = "Poteau";

    if (poleIdx >= 0) {
      list[poleIdx] = updatedPole;
    } else {
      list.push(updatedPole);
    }

    const poleList = list.filter((p) => p && p.type === "Poteau");
    const nbTraverses = poleList.filter((p) => p.traverse !== undefined ? Boolean(p.traverse) : (p.sous_type !== "Implanté")).length;
    const nbImplantes = poleList.filter((p) => p.implante !== undefined ? Boolean(p.implante) : (p.sous_type === "Implanté")).length;
    const nbArmes = poleList.filter((p) => p.arme !== undefined ? Boolean(p.arme) : (p.sous_type === "Armé")).length;

    markDirty("points_gps", "nb_poteaux_traverses", "nb_poteaux_implantes", "nb_poteaux_armes");
    setData((prev) => {
      const next = {
        ...prev,
        points_gps: list,
        nb_poteaux_traverses: nbTraverses,
        nb_poteaux_implantes: nbImplantes,
        nb_poteaux_armes: nbArmes,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        _fully_loaded: true,
      };
      saveInterventionLocally(next);
      return next;
    });
  }

  async function handlePolePhotoSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const poleNum = Number(targetPoleNumeroRef.current || 1);
    setPoleCapturingNumero(poleNum);
    setSlotActionFeedback(`📡 Analyse photo & acquisition GPS pour le Poteau ${poleNum}…`);

    try {
      const currentLatestData = dataRef.current || data;
      const fallbackBaseCoords = {
        lat: currentLatestData.latitude || (Array.isArray(currentLatestData.points_gps) ? currentLatestData.points_gps.find(p => p?.lat != null)?.lat : null),
        lng: currentLatestData.longitude || (Array.isArray(currentLatestData.points_gps) ? currentLatestData.points_gps.find(p => p?.lng != null)?.lng : null),
        precision_m: 15,
      };

      // Lecture photo & résolution GPS ultra-résiliente (EXIF native d'abord, puis Geolocation API sans blocage)
      const [photoDataUrl, posResult] = await Promise.all([
        readFileAsDataUrl(file),
        acquireBestPosition(file, fallbackBaseCoords),
      ]);

      if (e.target) e.target.value = "";

      const lat = posResult?.lat ?? null;
      const lng = posResult?.lng ?? null;
      const precision_m = posResult?.precision_m ?? null;
      const horodatage = new Date().toISOString();

      let lieu = "";
      if (lat != null && lng != null) {
        try {
          lieu = await reverseGeocode(lat, lng);
        } catch {}
      }

      const currentList = Array.isArray(currentLatestData.points_gps) ? [...currentLatestData.points_gps] : [];
      const poleIdx = currentList.findIndex(
        (p) => p && p.type === "Poteau" && Number(p.numero) === Number(poleNum)
      );
      const existingPole = poleIdx >= 0 ? currentList[poleIdx] : null;

      const poleTypeStr = existingPole?.type_poteau || existingPole?.proprietaire || "";
      const charBadges = [];
      if (poleTypeStr) charBadges.push(poleTypeStr);
      if (existingPole ? (existingPole.traverse !== false) : true) charBadges.push("Traversé");
      if (existingPole?.implante) charBadges.push("Implanté");
      if (existingPole?.arme) charBadges.push("Armé");
      const charTitle = charBadges.join(" • ") || "Poteau";
      const embeddedLabel = `Poteau ${poleNum} (${charTitle})`;

      let embeddedPhoto = photoDataUrl;
      try {
        embeddedPhoto = await embedGpsOnPhoto(photoDataUrl, {
          type: embeddedLabel,
          lieu,
          lat,
          lng,
          precision_m: precision_m || 10,
          horodatage,
          warning: posResult?.warning,
        });
      } catch (embErr) {
        console.warn("embedGpsOnPhoto warning:", embErr);
      }

      const updatedPoint = {
        ...(existingPole || {}),
        id: existingPole?.id || crypto.randomUUID(),
        type: "Poteau",
        numero: Number(poleNum),
        traverse: existingPole ? (existingPole.traverse !== undefined ? Boolean(existingPole.traverse) : existingPole.sous_type !== "Implanté") : true,
        implante: existingPole ? Boolean(existingPole.implante) : false,
        arme: existingPole ? Boolean(existingPole.arme) : false,
        type_poteau: existingPole?.type_poteau || existingPole?.proprietaire || "",
        proprietaire: existingPole?.type_poteau || existingPole?.proprietaire || "",
        sous_type: existingPole?.implante ? "Implanté" : existingPole?.arme ? "Armé" : "Traversé",
        photo: embeddedPhoto,
        lat,
        lng,
        precision_m,
        horodatage: existingPole?.horodatage || horodatage,
        lieu,
        ajoute_par: currentUser || "Technicien",
      };

      if (poleIdx >= 0) {
        currentList[poleIdx] = updatedPoint;
      } else {
        currentList.push(updatedPoint);
      }

      const poleList = currentList.filter((p) => p && p.type === "Poteau");
      const nbTraverses = poleList.filter((p) => p.traverse !== undefined ? Boolean(p.traverse) : (p.sous_type !== "Implanté")).length;
      const nbImplantes = poleList.filter((p) => p.implante !== undefined ? Boolean(p.implante) : (p.sous_type === "Implanté")).length;
      const nbArmes = poleList.filter((p) => p.arme !== undefined ? Boolean(p.arme) : (p.sous_type === "Armé")).length;

      const galleryPhoto = {
        id: crypto.randomUUID(),
        slot: `poteau_${poleNum}`,
        type: "poteau",
        label: embeddedLabel,
        name: `poteau_${poleNum}.jpg`,
        description: `${embeddedLabel} - ${currentLatestData.nom_client || "Intervention"}`,
        url: embeddedPhoto,
        lat,
        lng,
        precision_m,
        horodatage,
        lieu,
        from_gps: true,
        added: new Date().toISOString(),
      };

      let finalPhotos = [];
      setWhatsappPhotos((prev) => {
        const oldPhotos = prev.filter((p) => p && p.slot === `poteau_${poleNum}`);
        oldPhotos.forEach((p) => {
          if (p.id) deletedWhatsappPhotoIdsRef.current.add(p.id);
        });
        const filtered = prev.filter((p) => p.slot !== `poteau_${poleNum}`);
        finalPhotos = [...filtered, galleryPhoto];
        return finalPhotos;
      });

      setData((prev) => {
        const next = {
          ...prev,
          points_gps: currentList,
          whatsapp_photos: finalPhotos.length > 0 ? finalPhotos : (prev.whatsapp_photos || []),
          nb_poteaux_traverses: nbTraverses,
          nb_poteaux_implantes: nbImplantes,
          nb_poteaux_armes: nbArmes,
          modifie_par: currentUser,
          modifie_le: new Date().toISOString(),
          _fully_loaded: true,
        };
        saveInterventionLocally(next);
        return next;
      });

      markDirty("points_gps", "whatsapp_photos", "nb_poteaux_traverses", "nb_poteaux_implantes", "nb_poteaux_armes");
      setSaveStatus("✓ Poteau enregistré");
      const sourceLabel = posResult?.source === "exif" ? "EXIF photo (très haute précision)" : (lat != null ? `±${(precision_m || 10).toFixed(1)} m` : "sans GPS");
      setSlotActionFeedback(`✅ Photo enregistrée et sauvegardée sur votre téléphone pour le Poteau ${poleNum} (${sourceLabel})`);

      // Sauvegarde / téléchargement automatique immédiat sur le téléphone de l'agent
      downloadPhotoFile(galleryPhoto, currentLatestData.nom_client).catch((dlErr) => {
        console.warn("Auto-sauvegarde sur le téléphone:", dlErr);
        setSlotActionFeedback(`⚠️ Poteau ${poleNum} enregistré dans l'app, mais non sauvegardé sur le téléphone : ${dlErr.message}`);
      });

      setTimeout(() => setSlotActionFeedback(""), 5000);
    } catch (err) {
      console.error("handlePolePhotoSelected error:", err);
      alert(`Erreur lors de la capture du Poteau ${poleNum} : ${err.message}`);
    } finally {
      setPoleCapturingNumero(null);
    }
  }

  function removePole(numero) {
    const currentLatestData = dataRef.current || data;
    const targetPoles = (currentLatestData.points_gps || []).filter(
      (p) => p && p.type === "Poteau" && Number(p.numero) === Number(numero)
    );
    const targetWaPhotos = (whatsappPhotos || []).filter(
      (p) => p && (p.slot === `poteau_${numero}` || targetPoles.some((tp) => tp.id === p.id))
    );
    const hasPhotoOrGps = targetPoles.some((p) => p.photo || p.lat != null) || targetWaPhotos.some((p) => p.url);

    if (hasPhotoOrGps) {
      if (!confirm(`Supprimer réellement le Poteau ${numero} ainsi que sa photo et ses coordonnées GPS ?`)) {
        return;
      }
    }

    // Enregistrer l'horodatage et l'id pour la répercussion de suppression sur le serveur MySQL et localStorage
    for (const p of targetPoles) {
      if (p.horodatage) deletedGpsPointIdsRef.current.add(p.horodatage);
      if (p.id) deletedGpsPointIdsRef.current.add(p.id);
    }
    for (const p of targetWaPhotos) {
      if (p.id) deletedWhatsappPhotoIdsRef.current.add(p.id);
      if (p.slot) deletedWhatsappPhotoIdsRef.current.add(p.slot);
    }
    deletedWhatsappPhotoIdsRef.current.add(`poteau_${numero}`);

    const updatedPoints = (currentLatestData.points_gps || []).filter(
      (p) => !(p && p.type === "Poteau" && Number(p.numero) === Number(numero))
    );

    const remainingPoles = updatedPoints.filter((p) => p && p.type === "Poteau");
    const nbTraverses = remainingPoles.filter((p) => p.traverse !== undefined ? Boolean(p.traverse) : (p.sous_type !== "Implanté")).length;
    const nbImplantes = remainingPoles.filter((p) => p.implante !== undefined ? Boolean(p.implante) : (p.sous_type === "Implanté")).length;
    const nbArmes = remainingPoles.filter((p) => p.arme !== undefined ? Boolean(p.arme) : (p.sous_type === "Armé")).length;

    const targetPoleIds = new Set(targetPoles.map((p) => p.id).filter(Boolean));
    const nextPhotos = (whatsappPhotos || []).filter(
      (p) => p.slot !== `poteau_${numero}` && !targetPoleIds.has(p.id)
    );
    setWhatsappPhotos(nextPhotos);

    markDirty("points_gps", "whatsapp_photos", "nb_poteaux_traverses", "nb_poteaux_implantes", "nb_poteaux_armes");

    setData((prev) => {
      const next = {
        ...prev,
        points_gps: updatedPoints,
        whatsapp_photos: nextPhotos,
        nb_poteaux_traverses: nbTraverses,
        nb_poteaux_implantes: nbImplantes,
        nb_poteaux_armes: nbArmes,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        _deleted_photo_ids: Array.from(deletedWhatsappPhotoIdsRef.current),
        _deleted_point_ids: Array.from(deletedGpsPointIdsRef.current),
        _fully_loaded: true,
      };
      saveInterventionLocally(next);
      dataRef.current = next;
      flushServerSync().catch(() => {});
      return next;
    });

    setSaveStatus("✓ Poteau supprimé");
    setSlotActionFeedback(`🗑️ Poteau ${numero} supprimé`);
    setTimeout(() => setSlotActionFeedback(""), 4000);
  }

  // ===== WhatsApp Photos (geolocalisees, hors rapport) =====

  function openWaCamera() {
    if (waCameraInputRef.current) {
      waCameraInputRef.current.value = "";
      waCameraInputRef.current.click();
    }
  }

  function openWaGallery() {
    if (waGalleryInputRef.current) {
      waGalleryInputRef.current.value = "";
      waGalleryInputRef.current.click();
    }
  }

  async function handleWaPhotoSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setWaCapturing(true);
    setWhatsappStatus("Capture de la photo additionnelle…");
    try {
      const photoDataUrl = await readFileAsDataUrl(file);
      if (e.target) e.target.value = "";

      let pos = null;
      try {
        pos = await getCurrentPositionHighAccuracy();
      } catch (geoErr) {
        console.warn("GPS non disponible ou timeout:", geoErr);
      }

      const lat = pos?.coords?.latitude ?? null;
      const lng = pos?.coords?.longitude ?? null;
      const precision_m = pos?.coords?.accuracy ?? null;
      const horodatage = new Date().toISOString();

      let lieu = "";
      if (lat != null && lng != null) {
        setWhatsappStatus("Géolocalisation…");
        try {
          lieu = await reverseGeocode(lat, lng);
        } catch {}
      }

      let embeddedPhoto = photoDataUrl;
      if (lat != null && lng != null) {
        try {
          embeddedPhoto = await embedGpsOnPhoto(photoDataUrl, {
            type: `Photo additionnelle - ${data.nom_client || "Intervention"}`,
            lieu,
            lat,
            lng,
            precision_m,
            horodatage,
          });
        } catch (embedErr) {
          console.warn("Erreur incrustation GPS:", embedErr);
        }
      }

      const newPhoto = {
        id: crypto.randomUUID(),
        url: embeddedPhoto,
        lat,
        lng,
        precision_m,
        horodatage,
        lieu,
        added: new Date().toISOString(),
        label: "Photo additionnelle",
        type: "additionnelle",
        slot: "additionnelle",
        additionnelle: true,
        is_additionnelle: true,
        exclude_celpros: true,
      };
      deletedWhatsappPhotoIdsRef.current.delete(newPhoto.id);
      const nextPhotos = [...(whatsappPhotos || []), newPhoto];
      const nextData = {
        ...data,
        whatsapp_photos: nextPhotos,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        _deleted_photo_ids: Array.from(deletedWhatsappPhotoIdsRef.current),
        _deleted_point_ids: Array.from(deletedGpsPointIdsRef.current),
        _fully_loaded: true,
      };

      setWhatsappPhotos(nextPhotos);
      setData(nextData);
      dataRef.current = nextData;
      saveInterventionLocally(nextData);
      markDirty("whatsapp_photos");
      setSaveStatus("✓ Photo enregistrée");
      setWhatsappStatus("Photo additionnelle enregistrée.");
      flushServerSync().catch(() => {});
    } catch (err) {
      console.error("handleWaPhotoSelected error:", err);
      setWhatsappStatus(`Erreur : ${err.message}`);
    } finally {
      setWaCapturing(false);
    }
  }

  async function removeWhatsappPhoto(id) {
    markDirty("whatsapp_photos");
    deletedWhatsappPhotoIdsRef.current.add(id);

    const nextPhotos = (whatsappPhotos || []).filter((p) => p && p.id !== id);
    const nextData = {
      ...data,
      whatsapp_photos: nextPhotos,
      modifie_par: currentUser,
      modifie_le: new Date().toISOString(),
      _deleted_photo_ids: Array.from(deletedWhatsappPhotoIdsRef.current),
      _deleted_point_ids: Array.from(deletedGpsPointIdsRef.current),
      _fully_loaded: true,
    };

    setWhatsappPhotos(nextPhotos);
    setData(nextData);
    dataRef.current = nextData;
    saveInterventionLocally(nextData);

    setSaveStatus("✓ Photo supprimée");
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      await flushServerSync();
    } catch (err) {
      console.warn("Erreur synchronisation suppression photo wa:", err);
    }
  }

  function togglePhotoSelection(id) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPhotos() {
    if (selectedPhotoIds.size === whatsappPhotos.length) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(whatsappPhotos.map((p) => p.id)));
    }
  }

  async function sendPhotosViaWhatsapp() {
    const selected = whatsappPhotos.filter((p) => selectedPhotoIds.has(p.id));
    if (selected.length === 0) {
      setWhatsappStatus("Sélectionnez au moins une photo.");
      return;
    }

    setWhatsappStatus("Préparation du partage WhatsApp…");

    try {
      // 1. Android WebView avec pont natif
      if (window.AndroidBridge && window.AndroidBridge.isWebView && window.AndroidBridge.isWebView()) {
        const base64Photos = [];
        for (const photo of selected) {
          const rawUrl = photo.url || photo.photo || "";
          const base64 = rawUrl.includes(",") ? rawUrl.split(",")[1] : rawUrl;
          if (base64) base64Photos.push(base64);
        }
        const text = `Photos intervention CHAPTECH - ${data.nom_client || "Nouveau client"}`;
        window.AndroidBridge.sharePhotos(JSON.stringify(base64Photos), text);
        setWhatsappStatus("Ouverture de WhatsApp…");
        return;
      }

      // 2. Conversion sécurisée en Blob et File objects pour Web Share API
      const files = [];
      for (let i = 0; i < selected.length; i++) {
        const photo = selected[i];
        try {
          const photoUrl = photo.url || photo.photo || "";
          let blob = null;
          if (photoUrl.startsWith("data:")) {
            const parts = photoUrl.split(",");
            const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
            const b64 = parts[1];
            const byteString = atob(b64);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let j = 0; j < byteString.length; j++) {
              ia[j] = byteString.charCodeAt(j);
            }
            blob = new Blob([ab], { type: mime });
          } else if (photoUrl.startsWith("http")) {
            const res = await fetch(photoUrl, { mode: "cors" });
            if (res.ok) {
              blob = await res.blob();
            }
          }
          if (blob) {
            const safeId = String(photo.id || `ph_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8);
            const slotName = photo.slot || photo.type || "photo";
            files.push(new File([blob], `${slotName}_${safeId}.jpg`, { type: "image/jpeg" }));
          }
        } catch (fErr) {
          console.warn("Échec conversion photo en fichier:", fErr);
        }
      }

      // 3. Essai Web Share API (Partage direct des fichiers vers WhatsApp sur mobile)
      if (files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({
            files,
            title: "Photos CHAPTECH",
            text: `Photos intervention CHAPTECH - ${data.nom_client || "Nouveau client"}`,
          });
          setWhatsappStatus("✓ Photos partagées avec succès !");
          return;
        } catch (shareErr) {
          if (shareErr.name === "AbortError") {
            setWhatsappStatus("");
            return;
          }
          console.warn("Web Share API a échoué, repli vers les liens WhatsApp:", shareErr);
        }
      }

      // 4. Repli WhatsApp : Message complet et détaillé avec les informations et liens directs cliquables vers chaque photo
      const clientName = data.nom_client || "Nouveau client";
      const techName = data.nom_technicien || currentUser || "";
      const zone = data.adresse_zone || "";
      const dateStr = data.date ? new Date(data.date).toLocaleDateString("fr-FR") : new Date().toLocaleDateString("fr-FR");

      let msg = `📸 *PHOTOS INTERVENTION CHAPTECH*\n`;
      msg += `👤 *Client* : ${clientName}\n`;
      if (zone) msg += `📍 *Zone* : ${zone}\n`;
      if (techName) msg += `👷 *Technicien* : ${techName}\n`;
      msg += `📅 *Date* : ${dateStr}\n\n`;
      msg += `*${selected.length} Photo(s) sélectionnée(s) :*\n`;

      selected.forEach((ph, idx) => {
        const slotDef = CELPROS_PHOTO_SLOTS.find((s) => s.key === ph.slot);
        const label = slotDef?.label || ph.label || ph.name || ph.slot || `Photo ${idx + 1}`;
        const url = ph.url && ph.url.startsWith("http") ? ph.url : "";
        msg += `${idx + 1}. *${label}*`;
        if (url) {
          msg += ` :\n${url}\n`;
        } else {
          msg += ` (enregistrée)\n`;
        }
      });

      const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
      setWhatsappStatus("WhatsApp ouvert avec le récapitulatif complet et les liens directs des photos.");
    } catch (err) {
      if (err.name !== "AbortError") {
        setWhatsappStatus(`Erreur : ${err.message}`);
      } else {
        setWhatsappStatus("");
      }
    }
  }

  async function downloadSelectedPhotos() {
    const selected = whatsappPhotos.filter((p) => selectedPhotoIds.has(p.id));
    if (selected.length === 0) return;
    setWhatsappStatus("Téléchargement des photos sélectionnées…");
    try {
      for (const ph of selected) {
        await downloadPhotoFile(ph);
        await new Promise((r) => setTimeout(r, 200));
      }
      setWhatsappStatus(`✓ ${selected.length} photo(s) téléchargée(s) sur votre appareil.`);
    } catch (e) {
      setWhatsappStatus(`Erreur de téléchargement : ${e.message}`);
    }
  }

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    try {
      const dirtySnapshot = new Set([...dirtyFieldsRef.current, "statut"]);
      markDirty("statut");
      const finalData = {
        ...data,
        statut: "termine",
        whatsapp_photos: whatsappPhotos,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        changed_fields: [...dirtySnapshot, "modifie_par", "modifie_le"],
        deleted_points: [...deletedGpsPointIdsRef.current],
        deleted_whatsapp_photos: [...deletedWhatsappPhotoIdsRef.current],
      };
      // 1. Sauvegarde locale instantanée garantie à 100% (hors-ligne ou réseau lent)
      saveInterventionLocally(finalData);
      setData(finalData);

      // 2. Synchronisation serveur
      try {
        saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(() => saveIntervention(finalData));
        const saved = await saveQueueRef.current;
        const completeData = saved?.updated_at ? { ...finalData, updated_at: saved.updated_at } : finalData;
        if (saved?.updated_at) {
          setData((prev) => ({ ...prev, updated_at: saved.updated_at }));
        }
      } catch (netErr) {
        console.warn("finish server sync warning (saved locally):", netErr);
      }

      // Afficher immédiatement l'écran de confirmation de succès dans la modale
      setFinishSuccessData(completeData);
    } catch (err) {
      console.error("finish error:", err);
      alert("Erreur lors de la finalisation: " + (err.message || "inconnue"));
    } finally {
      setFinishing(false);
      finishingRef.current = false;
    }
  }


  return (
    <div className="intervention-form">
      <header className="form-header">
        <h2>Intervention - {data.nom_dossier || data.nom_client || "Nouveau dossier"}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn-header-refresh"
            onClick={handleManualRefreshIntervention}
            disabled={manualRefreshing}
            title="Actualiser les photos et informations depuis le serveur"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <IconRefresh size={14} className={manualRefreshing ? "spin-icon" : ""} />
            <span className="btn-refresh-text">{manualRefreshing ? "…" : "Actualiser"}</span>
          </button>
          {saveStatus && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 8px",
                borderRadius: 6,
                background: saveStatus.startsWith("Erreur")
                  ? "#fee2e2"
                  : saveStatus.includes("✓")
                  ? "#dcfce7"
                  : "#f1f5f9",
                color: saveStatus.startsWith("Erreur")
                  ? "#b91c1c"
                  : saveStatus.includes("✓")
                  ? "#15803d"
                  : "var(--text-muted)",
                transition: "all 0.2s ease"
              }}
            >
              {saveStatus}
            </span>
          )}
          <button type="button" className="btn-secondary" onClick={handleClose}>
            Retour
          </button>
        </div>
      </header>

      {isInterventionTerminee(data) && (
        <div className="status-banner" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: 8, margin: "12px 0", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <IconCheckCircle size={18} color="#15803d" />
          <span>
            <strong>Intervention clôturée et validée</strong>
            {data.modifie_par &&
              ` — dernière modification par ${data.modifie_par} le ${new Date(data.modifie_le).toLocaleString()}`}
            . Les modifications que vous apportez sont enregistrées en temps réel.
          </span>
        </div>
      )}

      <Tabs tabs={TABS.filter((t) => !t.hidden)} activeTab={activeTab} onChange={setActiveTab} />

      {/* Hidden file inputs permanently mounted in DOM across all tabs */}
      <input
        ref={slotCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleSlotPhotoSelected}
      />
      <input
        ref={slotGalleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleSlotPhotoSelected}
      />
      <input
        ref={poleCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handlePolePhotoSelected}
      />
      <input
        ref={poleGalleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handlePolePhotoSelected}
      />
      <input
        ref={waCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleWaPhotoSelected}
      />
      <input
        ref={waGalleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleWaPhotoSelected}
      />

      <div className="tab-content">
        {activeTab === "rapport" && (
          <section className="form-section-stack">
            {ocrNotification && (
              <div className={`ocr-banner ${ocrNotification.success ? "success" : "info"}`}>
                <span>{ocrNotification.text}</span>
                <button type="button" onClick={() => setOcrNotification(null)}>✕</button>
              </div>
            )}

            {/* ⚡ Saisie rapide des informations client */}
            <div className="form-card client-quick-card">
              <div
                className="form-card-header"
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onClick={() => setQuickClientOpen((v) => !v)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="form-card-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>⚡</div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Saisie rapide des informations client</h3>
                    <p className="form-card-sub" style={{ margin: "2px 0 0" }}>
                      Collez le texte reçu (Nom, Ligne, Téléphone...) pour remplir automatiquement les champs
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600 }}>
                  {quickClientOpen ? "Masquer ▲" : "Ouvrir ▼"}
                </span>
              </div>

              {quickClientOpen && (
                <div className="form-card-body" style={{ paddingTop: 10 }}>
                  {quickClientStatus && (
                    <div className={`quick-client-banner ${quickClientStatus.startsWith("✅") ? "success" : "info"}`} style={{ marginBottom: 12 }}>
                      <span>{quickClientStatus}</span>
                      <button type="button" onClick={() => setQuickClientStatus("")}>✕</button>
                    </div>
                  )}

                  {quickClientWarnings.length > 0 && (
                    <div className="quick-client-warnings" style={{ marginBottom: 12 }}>
                      {quickClientWarnings.map((w, idx) => (
                        <div key={idx} className="warning-line">⚠️ {w}</div>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="quick-client-textarea"
                    rows={3}
                    placeholder="Collez ici le texte complet. Exemple :&#10;NOM(DOSSOU ABELLANGE CARTER ARMELLE ) , numéro de ligne(0121290332) , numéro téléphone (0147980366) MSAN(OGA-PL51) , réference FAT(FAT164)"
                    value={quickClientText}
                    onChange={(e) => setQuickClientText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1.5px solid var(--border)",
                      fontFamily: "inherit",
                      fontSize: 13,
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />

                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: "8px 18px", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}
                      onClick={() => handleApplyQuickClientText(quickClientText)}
                      disabled={!quickClientText.trim()}
                    >
                      🪄 Analyser et répartir
                    </button>
                    {quickClientText && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: "8px 14px", fontSize: 13 }}
                        onClick={() => {
                          setQuickClientText("");
                          setQuickClientWarnings([]);
                          setQuickClientStatus("");
                        }}
                      >
                        Effacer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal de confirmation de remplacement des données client */}
            {quickClientConflictModal && (
              <div className="modal-overlay" style={{ zIndex: 10000 }}>
                <div className="modal-card" style={{ maxWidth: 480, padding: 20 }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 16, color: "var(--text)" }}>
                    ⚠️ Confirmer le remplacement des informations
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
                    Certains champs contiennent déjà des informations dans le formulaire. Souhaitez-vous les remplacer par les données extraites ?
                  </p>

                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, marginBottom: 16, border: "1px solid var(--border)" }}>
                    {quickClientConflictModal.conflicts.map((c, i) => (
                      <div key={i} style={{ fontSize: 13, marginBottom: i < quickClientConflictModal.conflicts.length - 1 ? 8 : 0 }}>
                        <strong>{c.label} :</strong>{" "}
                        <span style={{ textDecoration: "line-through", color: "#94a3b8" }}>{c.currentVal}</span>{" "}
                        ➔ <span style={{ color: "var(--primary)", fontWeight: 700 }}>{c.newVal}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setQuickClientConflictModal(null)}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => applyParsedClientData(quickClientConflictModal.pendingData, quickClientConflictModal.warnings)}
                    >
                      Confirmer le remplacement
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Carte 1 : Client & Localisation */}
            <div className="form-card">
              <div className="form-card-header">
                <div className="form-card-icon user-icon">👤</div>
                <div>
                  <h3>Client & Localisation</h3>
                  <p className="form-card-sub">Identité de l'abonné et détection GPS automatique de la zone</p>
                </div>
              </div>
              <div className="form-card-body">
                <TextField
                  label="Nom du dossier / Client"
                  placeholder="Ex: Entreprise Mantota ou Nom de l'abonné"
                  value={data.nom_client || data.nom_dossier || ""}
                  onChange={(v) => update("nom_client", v)}
                  onBlur={flushServerSync}
                />

                <GeocodableField
                  label="Adresse / Zone"
                  placeholder="Ex: Haie Vive, Cotonou ou Fidjrossè"
                  value={data.adresse_zone}
                  onChange={(v) => update("adresse_zone", v)}
                  onBlur={flushServerSync}
                  onDetectGps={handleDetectZone}
                  detecting={detectingZone}
                  statusMessage={zoneStatus}
                  statusType={zoneStatusType}
                />

                <div className="form-row-2">
                  <TextField
                    label="Téléphone ligne"
                    type="tel"
                    placeholder="Ex: 21 30 00 00"
                    value={data.telephone_ligne}
                    onChange={(v) => update("telephone_ligne", v)}
                    onBlur={flushServerSync}
                  />
                  <TextField
                    label="Mobile"
                    type="tel"
                    placeholder="Ex: 97 00 00 00"
                    value={data.mobile}
                    onChange={(v) => update("mobile", v)}
                    onBlur={flushServerSync}
                  />
                </div>
              </div>
            </div>

            {/* Carte 2 : Raccordement & Paramètres Optiques */}
            <div className="form-card">
              <div className="form-card-header">
                <div className="form-card-icon fiber-icon">⚡</div>
                <div>
                  <h3>Raccordement & Optique</h3>
                  <p className="form-card-sub">Liaison fibre, ports et mesures de puissance optique</p>
                </div>
              </div>
              <div className="form-card-body">
                <div className="form-row-3">
                  <SelectField
                    label="État"
                    value={data.etat}
                    options={["PON", "Cuivre", "Autre"]}
                    onChange={(v) => update("etat", v)}
                    onBlur={flushServerSync}
                  />
                  <TextField
                    label="MSAN"
                    placeholder="Ex: OGA-12"
                    value={data.msan}
                    onChange={(v) => update("msan", v)}
                    onBlur={flushServerSync}
                  />
                  <TextField
                    label="Référence FAT"
                    placeholder="Ex: FAT-04"
                    value={data.fat_ref}
                    onChange={(v) => update("fat_ref", v)}
                    onBlur={flushServerSync}
                  />
                </div>

                <div className="form-row-2">
                  <TextField
                    label="Port accordé"
                    placeholder="Ex: 3 ou Port 3"
                    value={data.port}
                    onChange={handlePortChange}
                    onBlur={flushServerSync}
                  />
                  <TextField
                    label="Type de câble"
                    placeholder="Ex: Câble 2FO DROP"
                    value={data.type_cable}
                    onChange={(v) => update("type_cable", v)}
                  />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <span>Ports disponibles (1 à 8)</span>
                    <span className="badge-count">
                      {selectedPorts.length} sélectionné(s) {data.port ? `(auto après port ${data.port})` : ""}
                    </span>
                  </div>
                  <div className="ports-toggle-grid">
                    {ALL_FAT_PORTS.map((port) => (
                      <button
                        key={port}
                        type="button"
                        className={`port-pill ${selectedPorts.includes(port) ? "active" : ""}`}
                        onClick={() => togglePortDisponible(port)}
                      >
                        {port}
                      </button>
                    ))}
                  </div>
                  <small className="field-hint">
                    ⚡ Sélection dynamique : dès que le port accordé est renseigné (ex: Port 3), les ports suivants (4, 5, 6, 7, 8) sont cochés automatiquement.
                  </small>
                </div>

                <div className="form-row-3">
                  <TextField
                    label="Départ (m)"
                    type="number"
                    value={data.depart_m}
                    onChange={(v) => update("depart_m", v)}
                  />
                  <TextField
                    label="Arrivée (m)"
                    type="number"
                    value={data.arrivee_m}
                    onChange={(v) => update("arrivee_m", v)}
                  />
                  <TextField
                    label="Linéaire calculé (m)"
                    type="number"
                    value={data.lineaire_m}
                    onChange={() => {}}
                  />
                </div>

                <div className="form-row-2">
                  <TextField
                    label="Puissance FAT (dBm)"
                    type="number"
                    placeholder="Ex: -18.5"
                    value={data.puissance_fat_dbm}
                    onChange={(v) => update("puissance_fat_dbm", v)}
                  />
                  <TextField
                    label="Puissance PTO (dBm)"
                    type="number"
                    placeholder="Ex: -19.2"
                    value={data.puissance_pto_dbm}
                    onChange={(v) => update("puissance_pto_dbm", v)}
                  />
                </div>
              </div>
            </div>

            {/* Carte 3 : Équipements Box / ONT */}
            <div className="form-card">
              <div className="form-card-header">
                <div className="form-card-icon ont-icon">🏷️</div>
                <div>
                  <h3>Équipements Box / ONT</h3>
                  <p className="form-card-sub">Identification et numérisation des codes MAC et SN</p>
                </div>
              </div>
              <div className="form-card-body">
                <ScannableField
                  label="Adresse MAC (Box / ONT)"
                  value={data.mac}
                  placeholder="Ex: 18D6DDF6719E-AE(17)"
                  scanLabel="Scanner MAC"
                  onChange={(v) => update("mac", v)}
                  onScanClick={() => {
                    setScannerTarget("mac");
                    setScannerOpen(true);
                  }}
                />

                <ScannableField
                  label="SN (Numéro de série ONT)"
                  value={data.sn}
                  placeholder="Ex: 485754437572231B8"
                  scanLabel="Scanner SN"
                  onChange={(v) => {
                    update("sn", v);
                    if (!data.ont_sn) update("ont_sn", v);
                  }}
                  onScanClick={() => {
                    setScannerTarget("sn");
                    setScannerOpen(true);
                  }}
                />

                <button
                  type="button"
                  className="btn-dual-scan"
                  onClick={() => {
                    setScannerTarget("both");
                    setScannerOpen(true);
                  }}
                >
                  📷 Scanner les deux codes (MAC + SN) en un seul scan
                </button>
              </div>
            </div>

            {/* Carte 4 : Poteaux & Matériel Posé */}
            <div className="form-card">
              <div className="form-card-header">
                <div className="form-card-icon tool-icon">🛠️</div>
                <div>
                  <h3>Poteaux & Matériel Posé</h3>
                  <p className="form-card-sub">Calcul automatique des poteaux et comptage du matériel terrain</p>
                </div>
              </div>
              <div className="form-card-body">
                <div className="poteaux-summary-badges">
                  <div className="poteau-badge-item">
                    <span className="poteau-badge-num">{String(data.nb_poteaux_traverses).padStart(2, "0")}</span>
                    <span className="poteau-badge-label">Traversés</span>
                  </div>
                  <div className="poteau-badge-item">
                    <span className="poteau-badge-num">{String(data.nb_poteaux_implantes).padStart(2, "0")}</span>
                    <span className="poteau-badge-label">Implantés</span>
                  </div>
                  <div className="poteau-badge-item">
                    <span className="poteau-badge-num">{String(data.nb_poteaux_armes ?? 0).padStart(2, "0")}</span>
                    <span className="poteau-badge-label">Armés</span>
                  </div>
                </div>

                <h4 style={{ margin: "16px 0 10px", fontSize: 14 }}>Matériel standard</h4>
                <div className="materiel-grid">
                  {MATERIEL_STANDARD.filter((m) => !m.hidden).map(({ key, label }) => (
                    <div key={key} className="materiel-card-stepper">
                      <span className="materiel-label">{label}</span>
                      <div className="stepper-controls">
                        <button
                          type="button"
                          className="btn-step"
                          onClick={() => updateMateriel(key, Math.max(0, (Number(data.materiel_pose[key]) || 0) - 1))}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={data.materiel_pose[key] ?? 0}
                          onChange={(e) => updateMateriel(key, Math.max(0, Number(e.target.value) || 0))}
                        />
                        <button
                          type="button"
                          className="btn-step"
                          onClick={() => updateMateriel(key, (Number(data.materiel_pose[key]) || 0) + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <h4 style={{ margin: "18px 0 8px", fontSize: 14 }}>Autre matériel (facultatif)</h4>
                <form className="stock-form-modern" onSubmit={handleAddMateriel}>
                  <input
                    type="text"
                    list="designations-list-form"
                    placeholder="Ex: Piton, ONT, Jarretière..."
                    value={newMaterielName}
                    onChange={(e) => setNewMaterielName(e.target.value)}
                  />
                  <datalist id="designations-list-form">
                    {getDesignations().map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                  <input
                    type="number"
                    min="1"
                    style={{ width: 80 }}
                    value={newMaterielQte}
                    onChange={(e) => setNewMaterielQte(e.target.value)}
                  />
                  <button type="submit" className="btn-primary" style={{ padding: "8px 14px", minHeight: 44 }}>
                    + Ajouter
                  </button>
                </form>
                {materielFeedback && <p className="gps-status" style={{ marginTop: 8 }}>{materielFeedback}</p>}

                {Object.entries(data.materiel_pose)
                  .filter(([d]) => !MATERIEL_STANDARD.some((m) => m.key === d))
                  .map(([d, qte]) => (
                    <div key={d} className="materiel-extra-item">
                      <span>{d} : <strong>{qte}</strong></span>
                      <button type="button" className="btn-secondary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => removeMateriel(d)}>
                        Retirer
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "photos" && (
          <section className="photos-tab-section">

            {ocrNotification && (
              <div className={`ocr-banner ${ocrNotification.success ? "success" : "info"}`}>
                <span>{ocrNotification.text}</span>
                <button type="button" onClick={() => setOcrNotification(null)}>✕</button>
              </div>
            )}

            {ocrProcessing && (
              <div className="ocr-banner info pulse">
                <span>🔍 Reconnaissance OCR en cours sur la photo du FAT…</span>
              </div>
            )}

            <div className="photos-progress-card">
              <div className="photos-progress-header">
                <div>
                  <h3>Boîte à Photos CelPros</h3>
                  <p className="photos-progress-sub">
                    {CELPROS_PHOTO_SLOTS.filter((s) => !s.optional && !!getPhotoForSlot(s.key)?.url).length} sur {CELPROS_PHOTO_SLOTS.filter((s) => !s.optional).length} photos obligatoires prêtes pour CelPros
                    {(() => {
                      const count = (whatsappPhotos || []).filter(
                        (p) => p && !p.additionnelle && !p.is_additionnelle && !p.exclude_celpros && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau")
                      ).length;
                      return count > 0 ? ` (+ ${count} Autre poteau)` : "";
                    })()}
                  </p>
                </div>
                <div className="photos-progress-percent">
                  {Math.round((CELPROS_PHOTO_SLOTS.filter((s) => !s.optional && !!getPhotoForSlot(s.key)?.url).length / Math.max(1, CELPROS_PHOTO_SLOTS.filter((s) => !s.optional).length)) * 100)}%
                </div>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${(CELPROS_PHOTO_SLOTS.filter((s) => !s.optional && !!getPhotoForSlot(s.key)?.url).length / Math.max(1, CELPROS_PHOTO_SLOTS.filter((s) => !s.optional).length)) * 100}%`
                  }}
                />
              </div>
              {slotActionFeedback && (
                <p className="slot-feedback-hint">{slotActionFeedback}</p>
              )}
            </div>

            <div className="celpros-photos-grid">
              {CELPROS_PHOTO_SLOTS.map((slot) => {
                const isAutrePoteau = slot.key === "autre_poteau";
                const autrePhotos = isAutrePoteau
                  ? (whatsappPhotos || []).filter(
                      (p) => p && !p.additionnelle && !p.is_additionnelle && !p.exclude_celpros && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau")
                    )
                  : [];
                const photo = isAutrePoteau ? (autrePhotos[0] || null) : getPhotoForSlot(slot.key);
                const isTaken = isAutrePoteau ? autrePhotos.length > 0 : !!photo?.url;

                return (
                  <div key={slot.key} className={`photo-slot-card ${isTaken ? "taken" : "pending"} ${isAutrePoteau ? "autre-poteau-card" : ""}`}>
                    <div className="photo-slot-header">
                      <span className="photo-slot-icon">{slot.icon}</span>
                      <div className="photo-slot-titles">
                        <h4>{slot.label}</h4>
                        <p>{slot.description}</p>
                        {isAutrePoteau && (
                          <div style={{ marginTop: 3, fontSize: 11, color: "#0284c7", fontWeight: 600 }}>
                            ℹ️ Multi-photos autorisé • Ajouté sur CelPros au niveau poteau • Bande masquée pour lisibilité
                          </div>
                        )}
                      </div>
                      <span
                        className={`photo-slot-badge ${isTaken ? "badge-success" : (slot.optional ? "badge-optional" : "badge-pending")}`}
                        style={slot.optional && !isTaken ? { background: "#f1f5f9", color: "#64748b" } : {}}
                      >
                        {isAutrePoteau
                          ? (isTaken ? `✓ ${autrePhotos.length} photo${autrePhotos.length > 1 ? "s" : ""}` : "Optionnel")
                          : (isTaken ? "✓ Prête" : (slot.optional ? "Optionnel" : "En attente"))}
                      </span>
                    </div>

                    {isTaken ? (
                      isAutrePoteau ? (
                        <div className="photo-slot-preview-box autre-poteau-multi-box">
                          <div
                            className="autre-poteau-gallery-grid"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))",
                              gap: 8,
                              padding: "6px 0",
                              width: "100%",
                            }}
                          >
                            {autrePhotos.map((ap, apIdx) => (
                              <div
                                key={ap.id || apIdx}
                                className="autre-poteau-thumb-wrap"
                                style={{
                                  position: "relative",
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  border: "1px solid #cbd5e1",
                                  background: "#fff",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                                }}
                              >
                                <img
                                  src={ap.url}
                                  alt={`Autre poteau ${apIdx + 1}`}
                                  style={{
                                    width: "100%",
                                    height: 80,
                                    objectFit: "cover",
                                    display: "block",
                                    cursor: "pointer",
                                  }}
                                  onClick={() => {
                                    setViewingPhoto({
                                      url: ap.url,
                                      title: `Autre poteau #${apIdx + 1}`,
                                      subtitle: ap.lieu || (ap.lat ? `${ap.lat.toFixed(5)}, ${ap.lng.toFixed(5)}` : ""),
                                      info: [
                                        { label: "Catégorie", val: `Autre poteau #${apIdx + 1}` },
                                        ...(ap.lat ? [{ label: "GPS (enregistré sans bande)", val: `${ap.lat.toFixed(5)}, ${ap.lng.toFixed(5)}` }] : []),
                                        ...(ap.precision_m ? [{ label: "Précision", val: `±${ap.precision_m.toFixed(1)} m` }] : []),
                                        ...(ap.horodatage ? [{ label: "Prise le", val: new Date(ap.horodatage).toLocaleString() }] : []),
                                        ...(ap.lieu ? [{ label: "Lieu", val: ap.lieu }] : []),
                                      ],
                                    });
                                  }}
                                />
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "3px 6px",
                                    background: "#f8fafc",
                                    borderTop: "1px solid #f1f5f9",
                                    fontSize: 11,
                                  }}
                                >
                                  <span style={{ fontWeight: 700, color: "#475569" }}>
                                    #{apIdx + 1} {ap.lat != null ? "📍" : ""}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeAutrePoteauPhoto(ap.id)}
                                    style={{
                                      border: "none",
                                      background: "none",
                                      color: "#ef4444",
                                      fontWeight: "bold",
                                      cursor: "pointer",
                                      fontSize: 13,
                                      padding: "0 2px",
                                      lineHeight: 1,
                                    }}
                                    title="Supprimer cette photo"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="photo-slot-actions" style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="btn-slot-subtle"
                              disabled={slotCapturing}
                              onClick={() => openSlotCamera("autre_poteau")}
                            >
                              📷 + Prendre photo
                            </button>
                            <button
                              type="button"
                              className="btn-slot-subtle"
                              disabled={slotCapturing}
                              onClick={() => openSlotGallery("autre_poteau")}
                            >
                              🖼️ + Importer
                            </button>
                            <button
                              type="button"
                              className="btn-slot-subtle danger"
                              onClick={() => removeSlotPhoto("autre_poteau")}
                              title="Supprimer toutes les photos d'Autre poteau"
                            >
                              ✕ Tout retirer ({autrePhotos.length})
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="photo-slot-preview-box">
                          <div
                            className="photo-slot-img-wrap"
                            onClick={() => {
                              setViewingPhoto({
                                url: photo.url,
                                title: slot.label,
                                subtitle: photo.lieu || (photo.lat ? `${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}` : ""),
                                info: [
                                  { label: "Catégorie CelPros", val: slot.label },
                                  ...(photo.lat ? [{ label: "Coordonnées GPS", val: `${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}` }] : []),
                                  ...(photo.precision_m ? [{ label: "Précision GPS", val: `±${photo.precision_m.toFixed(1)} m` }] : []),
                                  ...(photo.horodatage ? [{ label: "Prise le", val: new Date(photo.horodatage).toLocaleString() }] : []),
                                  ...(photo.lieu ? [{ label: "Adresse / Lieu", val: photo.lieu }] : []),
                                  ...(slot.key === "fat" && data.fat_ref ? [{ label: "Référence FAT", val: data.fat_ref }] : []),
                                  ...(slot.key === "fat" && data.msan ? [{ label: "MSAN", val: data.msan }] : []),
                                ],
                              });
                            }}
                          >
                            <img src={photo.url} alt={slot.label} />
                            <span className="zoom-hint-chip">🔍 Agrandir</span>
                          </div>

                          {slot.hasOcr && (data.fat_ref || data.msan) && (
                            <div className="fat-ocr-detected-chip">
                              <span>⚡ FAT : <strong>{data.fat_ref || "N/A"}</strong> | MSAN : <strong>{data.msan || "N/A"}</strong></span>
                            </div>
                          )}

                          {(slot.noBanner || photo.no_banner) && photo.lat != null && (
                            <div
                              style={{
                                marginTop: 6,
                                marginBottom: 4,
                                padding: "5px 8px",
                                background: "#f0fdf4",
                                border: "1px solid #bbf7d0",
                                borderRadius: 6,
                                fontSize: 11,
                                color: "#166534",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span style={{ fontSize: 13 }}>📍</span>
                              <span>
                                <strong>GPS enregistré :</strong> {Number(photo.lat).toFixed(5)}, {Number(photo.lng).toFixed(5)}
                                {photo.precision_m ? ` (±${Number(photo.precision_m).toFixed(1)}m)` : ""}
                                <span style={{ color: "#15803d", marginLeft: 4 }}>• Bande masquée pour lisibilité</span>
                              </span>
                            </div>
                          )}

                          <div className="photo-slot-actions">
                            {slot.hasOcr && (
                              <button
                                type="button"
                                className="btn-slot-subtle"
                                disabled={ocrProcessing}
                                onClick={() => runFatOcrOnPhoto(photo.url)}
                                title="Relancer l'extraction OCR"
                              >
                                🔍 {ocrProcessing ? "Lecture…" : "Re-scanner OCR"}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-slot-subtle"
                              disabled={slotCapturing}
                              onClick={() => openSlotCamera(slot.key)}
                            >
                              🔄 Reprendre
                            </button>
                            <button
                              type="button"
                              className="btn-slot-subtle danger"
                              onClick={() => removeSlotPhoto(slot.key)}
                            >
                              ✕ Retirer
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="photo-slot-upload-box">
                        <button
                          type="button"
                          className="btn-slot-upload btn-camera"
                          disabled={slotCapturing}
                          onClick={() => openSlotCamera(slot.key)}
                        >
                          📷 Prendre photo
                        </button>
                        <button
                          type="button"
                          className="btn-slot-upload btn-gallery"
                          disabled={slotCapturing}
                          onClick={() => openSlotGallery(slot.key)}
                        >
                          🖼️ Importer
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Section Dynamique Photos de Poteaux Géolocalisés CelPros */}
            <div className="celpros-poles-section">
              <div className="photos-progress-card pole-section-header-card">
                <div className="photos-progress-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#e0f2fe", padding: 8, borderRadius: 10 }}>
                    <IconPole size={26} color="#0284c7" />
                  </span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Photos de poteaux géolocalisés (CelPros)</h3>
                    <p className="photos-progress-sub" style={{ margin: "3px 0 0" }}>
                      Chaque poteau dispose de sa propre géolocalisation haute précision, photo et caractéristiques
                    </p>
                  </div>
                </div>
              </div>

              <div className="celpros-photos-grid celpros-poles-grid">
                {(() => {
                  const poleMap = new Map();
                  (data.points_gps || []).forEach((pt) => {
                    if (pt && pt.type === "Poteau" && Number(pt.numero) > 0) {
                      poleMap.set(Number(pt.numero), { ...pt });
                    }
                  });
                  (whatsappPhotos || []).forEach((wa) => {
                    const m = wa?.slot?.match(/^poteau_(\d+)$/);
                    if (m) {
                      const num = Number(m[1]);
                      if (!poleMap.has(num)) {
                        poleMap.set(num, {
                          id: wa.id || crypto.randomUUID(),
                          type: "Poteau",
                          numero: num,
                          traverse: true,
                          implante: false,
                          arme: false,
                          type_poteau: "",
                          proprietaire: "",
                          sous_type: "Traversé",
                          photo: wa.url || "",
                          lat: wa.lat ?? null,
                          lng: wa.lng ?? null,
                          precision_m: wa.precision_m ?? null,
                          lieu: wa.lieu || "",
                          horodatage: wa.horodatage || new Date().toISOString(),
                        });
                      }
                    }
                  });

                  const poleList = Array.from(poleMap.values()).sort(
                    (a, b) => Number(a.numero) - Number(b.numero)
                  );

                  if (poleList.length === 0) {
                    return (
                      <div
                        className="empty-poles-box"
                        style={{
                          gridColumn: "1 / -1",
                          padding: "24px 16px",
                          textAlign: "center",
                          background: "#f8fafc",
                          borderRadius: 12,
                          border: "1px dashed #cbd5e1",
                          color: "#64748b",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                          <IconPole size={34} color="#94a3b8" />
                        </div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#334155" }}>
                          Aucun poteau enregistré
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                          Cliquez sur le bouton ci-dessous pour ajouter un poteau géolocalisé.
                        </p>
                      </div>
                    );
                  }

                  return poleList.map((pt) => {
                    const poleNum = Number(pt.numero);
                    const wa = (whatsappPhotos || []).find((p) => p && p.slot === `poteau_${poleNum}`);
                    const photoUrl = wa?.url || pt?.photo;
                    const isTaken = !!photoUrl;
                    const isCapturingThis = poleCapturingNumero === poleNum;
                    const lat = wa?.lat ?? pt?.lat;
                    const lng = wa?.lng ?? pt?.lng;
                    const prec = wa?.precision_m ?? pt?.precision_m;
                    const lieu = wa?.lieu ?? pt?.lieu;
                    const horo = wa?.horodatage ?? pt?.horodatage;

                    const isTraverse = pt.traverse !== undefined ? Boolean(pt.traverse) : (pt.sous_type !== "Implanté");
                    const isImplante = Boolean(pt.implante);
                    const isArme = Boolean(pt.arme);
                    const typePoteau = pt.type_poteau || pt.proprietaire || "";

                    const charBadges = [];
                    if (typePoteau) charBadges.push(typePoteau);
                    if (isTraverse) charBadges.push("Traversé");
                    if (isImplante) charBadges.push("Implanté");
                    if (isArme) charBadges.push("Armé");
                    const charTitle = charBadges.join(" • ") || "Poteau";

                    return (
                      <div key={poleNum} id={`pole-slot-card-${poleNum}`} className={`photo-slot-card pole-slot-card ${isTaken ? "taken" : "pending"}`}>
                        <div className="photo-slot-header">
                          <span className="photo-slot-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            <IconPole size={20} color="#0284c7" />
                          </span>
                          <div className="pole-slot-titles" style={{ flex: 1 }}>
                            <h4 style={{ margin: "0 0 4px", fontSize: 14 }}>Photos de poteau {poleNum}</h4>
                            <div className="pole-options-box">
                              <div className="pole-option-row">
                                <span className="pole-option-label">Type :</span>
                                <div className="pole-pills-group">
                                  <button
                                    type="button"
                                    className={`pill-btn ${typePoteau === "Petit Jean" ? "active" : ""}`}
                                    onClick={() =>
                                      handlePoleOptionChange(
                                        poleNum,
                                        "type_poteau",
                                        typePoteau === "Petit Jean" ? "" : "Petit Jean"
                                      )
                                    }
                                  >
                                    Petit Jean
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill-btn ${typePoteau === "SBEE" ? "active" : ""}`}
                                    onClick={() =>
                                      handlePoleOptionChange(
                                        poleNum,
                                        "type_poteau",
                                        typePoteau === "SBEE" ? "" : "SBEE"
                                      )
                                    }
                                  >
                                    SBEE
                                  </button>
                                </div>
                              </div>
                              <div className="pole-option-row">
                                <span className="pole-option-label">Options :</span>
                                <div className="pole-pills-group">
                                  <button
                                    type="button"
                                    className={`pill-btn ${isTraverse ? "active" : ""}`}
                                    onClick={() => handlePoleOptionChange(poleNum, "traverse", !isTraverse)}
                                  >
                                    {isTraverse ? "✓ Traversée" : "Traversée"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill-btn ${isImplante ? "active" : ""}`}
                                    onClick={() => handlePoleOptionChange(poleNum, "implante", !isImplante)}
                                  >
                                    {isImplante ? "✓ Implanté" : "Implanté"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill-btn ${isArme ? "active" : ""}`}
                                    onClick={() => handlePoleOptionChange(poleNum, "arme", !isArme)}
                                  >
                                    {isArme ? "✓ Armé" : "Armé"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <span className={`photo-slot-badge ${isTaken ? "badge-success" : "badge-pending"}`}>
                            {isTaken ? "✓ Géolocalisé" : "En attente"}
                          </span>
                        </div>

                        {isTaken ? (
                          <div className="photo-slot-preview-box">
                            <div
                              className="photo-slot-img-wrap"
                              onClick={() => {
                                setViewingPhoto({
                                  url: photoUrl,
                                  title: `Photos de poteau ${poleNum} (${charTitle})`,
                                  subtitle: lieu || (lat ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : ""),
                                  info: [
                                    { label: "Numéro", val: `#${poleNum}` },
                                    { label: "Caractéristiques", val: charTitle },
                                    ...(lat != null ? [{ label: "Coordonnées GPS", val: `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` }] : []),
                                    ...(prec != null ? [{ label: "Précision GPS", val: `±${Number(prec).toFixed(1)} m` }] : []),
                                    ...(horo ? [{ label: "Prise le", val: new Date(horo).toLocaleString() }] : []),
                                    ...(lieu ? [{ label: "Adresse / Lieu", val: lieu }] : []),
                                  ],
                                });
                              }}
                            >
                              <img src={photoUrl} alt={`Poteau ${poleNum}`} />
                              <span className="zoom-hint-chip">🔍 Agrandir</span>
                            </div>

                            {lat != null && (
                              <div className="pole-gps-details">
                                <span className="gps-chip-coord">📍 {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</span>
                                {prec != null && <span className="gps-chip-acc">±{Number(prec).toFixed(1)}m</span>}
                                {lieu && <span className="gps-chip-lieu">{lieu}</span>}
                              </div>
                            )}

                            <div className="photo-slot-actions">
                              <button
                                type="button"
                                className="btn-slot-subtle"
                                disabled={isCapturingThis}
                                onClick={() => openPoleCamera(poleNum)}
                              >
                                {isCapturingThis ? "📡 GPS..." : "🔄 Reprendre"}
                              </button>
                              <button
                                type="button"
                                className="btn-slot-subtle danger"
                                onClick={() => removePole(poleNum)}
                              >
                                ✕ Annuler ce poteau
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="photo-slot-upload-box">
                            {isCapturingThis ? (
                              <div className="pole-capturing-loader">
                                <span className="pulse">📡 Acquisition GPS haute précision…</span>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn-slot-upload btn-camera"
                                  onClick={() => openPoleCamera(poleNum)}
                                >
                                  📷 Prendre photo
                                </button>
                                <button
                                  type="button"
                                  className="btn-slot-upload btn-gallery"
                                  onClick={() => openPoleGallery(poleNum)}
                                >
                                  🖼️ Importer
                                </button>
                                <button
                                  type="button"
                                  className="btn-slot-subtle danger"
                                  style={{ marginTop: 6 }}
                                  onClick={() => removePole(poleNum)}
                                >
                                  ✕ Annuler ce poteau
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Bouton "+ Ajouter un poteau" positionné au bas de la section de poteaux */}
              <div className="pole-add-bottom-container" style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn-primary btn-add-pole-bottom"
                  onClick={handleAddPole}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 22px",
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  ➕ Ajouter un poteau
                </button>
              </div>
            </div>

            <div className="other-photos-card">
              <div className="form-card-header">
                <div className="form-card-icon wa-icon">💬</div>
                <div>
                  <h3>Autres photos terrain & WhatsApp</h3>
                  <p className="form-card-sub">Photos additionnelles (partageables en un clic sur WhatsApp)</p>
                </div>
              </div>

              <div className="gps-buttons" style={{ margin: "14px 0" }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={waCapturing}
                  onClick={openWaCamera}
                >
                  {waCapturing ? "Capture..." : "📷 Prendre photo additionnelle"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={waCapturing}
                  onClick={openWaGallery}
                >
                  🖼️ Importer de la galerie
                </button>
              </div>

              {whatsappPhotos.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 13, padding: "8px 12px" }}
                      onClick={selectAllPhotos}
                    >
                      {selectedPhotoIds.size === whatsappPhotos.length ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {selectedPhotoIds.size} sélectionnée(s) / {whatsappPhotos.length} total
                    </span>
                  </div>

                  <div className="whatsapp-photos-grid">
                    {whatsappPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="whatsapp-photo-item"
                        onClick={() => togglePhotoSelection(photo.id)}
                        style={{
                          cursor: "pointer",
                          border: selectedPhotoIds.has(photo.id) ? "2px solid var(--primary)" : "2px solid transparent"
                        }}
                      >
                        <img src={photo.url} alt="Photo terrain" />
                        {photo.label && (
                          <span className="photo-tag-pill">{photo.label}</span>
                        )}
                        {selectedPhotoIds.has(photo.id) && (
                          <div className="selected-check">✓</div>
                        )}
                        <button
                          type="button"
                          className="zoom-photo-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingPhoto({
                              url: photo.url,
                              title: photo.label || "Photo terrain",
                              subtitle: photo.lieu || (photo.lat ? `${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}` : ""),
                              info: [
                                ...(photo.label ? [{ label: "Catégorie", val: photo.label }] : []),
                                ...(photo.lat ? [{ label: "Coordonnées", val: `${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}` }] : []),
                                ...(photo.precision_m ? [{ label: "Précision", val: `±${photo.precision_m.toFixed(1)} m` }] : []),
                                ...(photo.horodatage ? [{ label: "Date & Heure", val: new Date(photo.horodatage).toLocaleString() }] : []),
                                ...(photo.lieu ? [{ label: "Lieu", val: photo.lieu }] : []),
                              ],
                            });
                          }}
                          title="Agrandir"
                        >
                          🔍
                        </button>
                        <button
                          type="button"
                          className="remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWhatsappPhoto(photo.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-primary btn-large"
                      onClick={sendPhotosViaWhatsapp}
                      disabled={selectedPhotoIds.size === 0}
                      style={{ flex: 1, minWidth: 200 }}
                    >
                      Envoyer sur WhatsApp ({selectedPhotoIds.size})
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-large"
                      onClick={downloadSelectedPhotos}
                      disabled={selectedPhotoIds.size === 0}
                      style={{ padding: "10px 16px" }}
                      title="Télécharger les photos sélectionnées sur l'appareil"
                    >
                      ⬇ Télécharger ({selectedPhotoIds.size})
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {activeTab === "gps" && (
          <section>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={handlePhotoSelected}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handlePhotoSelected}
            />

            {!pendingCapture && !conflict && (
              <>
                <SelectField
                  label="Type de point"
                  value={pointType}
                  options={TYPES_POINT}
                  onChange={setPointType}
                />
                {pointType === "Autre" && (
                  <TextField
                    label="Précisez le type"
                    value={customType}
                    onChange={setCustomType}
                  />
                )}

                {pointType === "Poteau" && (
                  <>
                    <SelectField
                      label="Type de poteau"
                      value={sousType}
                      options={SOUS_TYPES_POTEAU}
                      onChange={setSousType}
                    />
                    {sousType === "Traversé" && (
                      <label className="form-field">
                        <span>Poteau rencontré (SBEE ou Petit Jean)</span>
                        <input
                          type="text"
                          list="proprietaires-list"
                          value={proprietaire}
                          onChange={(e) => setProprietaire(e.target.value)}
                        />
                        <datalist id="proprietaires-list">
                          {PROPRIETAIRES_SUGGERES.map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </label>
                    )}
                  </>
                )}

                {resolvedType && (
                  <p className="gps-status">
                    Prochain numéro :{" "}
                    <strong>
                      {resolvedType === "Poteau"
                        ? `Poteau ${sousType} ${nextNumeroForType("Poteau", sousType)}`
                        : `${resolvedType} ${nextNumeroForType(resolvedType)}`}
                    </strong>
                  </p>
                )}

                <div className="gps-buttons">
                  <button
                    type="button"
                    className="btn-primary btn-large"
                    disabled={capturing}
                    onClick={openCamera}
                  >
                    {capturing ? "Lecture en cours…" : "📷 Prendre une photo"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-large"
                    disabled={capturing}
                    onClick={openGallery}
                  >
                    🖼️ Galerie
                  </button>
                </div>

                {gpsStatus && <p className="gps-status">{gpsStatus}</p>}
              </>
            )}

            {pendingCapture && !conflict && (
              <div className="gps-preview">
                <img src={pendingCapture.photo} alt="Aperçu point GPS" className="gps-preview-img" />
                <p className="gps-status">{gpsStatus}</p>
                <div className="gps-buttons">
                  <button type="button" className="btn-secondary" onClick={retakePhoto}>
                    Reprendre
                  </button>
                  <button type="button" className="btn-primary" onClick={validateCapture}>
                    Valider ce point
                  </button>
                </div>
              </div>
            )}

            {conflict && (
              <div className="gps-conflict">
                <p>
                  ⚠️ Un point existe déjà à moins de 20 m, ajouté par{" "}
                  <strong>{conflict.ajoute_par}</strong> le{" "}
                  {new Date(conflict.horodatage).toLocaleString()}.
                </p>
                <div className="gps-buttons">
                  <button type="button" className="btn-secondary" onClick={reuseExistingPoint}>
                    Réutiliser ce point
                  </button>
                  <button type="button" className="btn-primary" onClick={confirmNewPointAnyway}>
                    Confirmer un nouveau poteau
                  </button>
                </div>
              </div>
            )}

            <h3>Points enregistrés ({(data.points_gps || []).length})</h3>
            <ul className="gps-list">
              {(data.points_gps || []).map((point, idx) => (
                <li key={idx}>
                  {point.photo ? (
                    <button
                      type="button"
                      className="gps-thumb-btn"
                      onClick={() => {
                        setViewingPhoto({
                          url: point.photo,
                          title: `${point.type} ${point.sous_type ? `(${point.sous_type})` : ""} ${point.numero}`,
                          subtitle: point.lieu || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
                          info: [
                            { label: "Coordonnées", val: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` },
                            { label: "Précision", val: `±${point.precision_m.toFixed(1)} m` },
                            { label: "Date & Heure", val: new Date(point.horodatage).toLocaleString() },
                            { label: "Ajouté par", val: point.ajoute_par || "Technicien" },
                            ...(point.proprietaire ? [{ label: "Propriétaire", val: point.proprietaire }] : []),
                            ...(point.lieu ? [{ label: "Lieu", val: point.lieu }] : []),
                          ],
                        });
                      }}
                      aria-label="Agrandir la photo"
                    >
                      <img
                        src={point.photo}
                        alt={point.type}
                        className="gps-thumb"
                      />
                      <span className="gps-thumb-zoom-badge">🔍</span>
                    </button>
                  ) : null}
                  <div
                    role={point.photo ? "button" : undefined}
                    tabIndex={point.photo ? 0 : undefined}
                    style={{ flex: 1, cursor: point.photo ? "pointer" : "default", touchAction: "manipulation" }}
                    onClick={() => {
                      if (!point.photo) return;
                      setViewingPhoto({
                        url: point.photo,
                        title: `${point.type} ${point.sous_type ? `(${point.sous_type})` : ""} ${point.numero}`,
                        subtitle: point.lieu || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
                        info: [
                          { label: "Coordonnées", val: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` },
                          { label: "Précision", val: `±${point.precision_m.toFixed(1)} m` },
                          { label: "Date & Heure", val: new Date(point.horodatage).toLocaleString() },
                          { label: "Ajouté par", val: point.ajoute_par || "Technicien" },
                          ...(point.proprietaire ? [{ label: "Propriétaire", val: point.proprietaire }] : []),
                          ...(point.lieu ? [{ label: "Lieu", val: point.lieu }] : []),
                        ],
                      });
                    }}
                  >
                    <strong>
                      {point.type} {point.sous_type ? `(${point.sous_type})` : ""} {point.numero}
                      {point.proprietaire ? ` - ${point.proprietaire}` : ""}
                    </strong>
                    {" "}- {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                    {point.lieu && (
                      <>
                        <br />
                        📍 {point.lieu}
                      </>
                    )}
                    <br />
                    ±{point.precision_m.toFixed(1)} m - {new Date(point.horodatage).toLocaleString()} - {point.ajoute_par}
                    <br />
                    <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600 }}>🔍 Toucher pour agrandir</span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "4px 8px", fontSize: 12, color: "var(--danger)", flexShrink: 0 }}
                    onClick={() => {
                      if (confirm(`Supprimer le point "${point.type} ${point.numero}" ?`)) {
                        if (point.id) deletedGpsPointIdsRef.current.add(point.id);
                        if (point.horodatage) deletedGpsPointIdsRef.current.add(point.horodatage);
                        markDirty("points_gps");
                        const nextPoints = data.points_gps.filter((_, i) => i !== idx);
                        const nextData = {
                          ...data,
                          points_gps: nextPoints,
                          modifie_par: currentUser,
                          modifie_le: new Date().toISOString(),
                          _deleted_point_ids: Array.from(deletedGpsPointIdsRef.current),
                          _fully_loaded: true,
                        };
                        setData(nextData);
                        dataRef.current = nextData;
                        saveInterventionLocally(nextData);
                        flushServerSync().catch(() => {});
                      }
                    }}
                  >
                    ✕ Supprimer
                  </button>
                </li>
              ))}
            </ul>

            {/* ===== WhatsApp Photos Section (geolocalisees, hors rapport) ===== */}
            <div className="whatsapp-photos-section">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Photos terrain (hors rapport)
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                Photos geolocalisees, non incluses dans le rapport. Selectionnez-en pour les envoyer via WhatsApp.
              </p>

              <div className="gps-buttons" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn-primary btn-large"
                  disabled={waCapturing}
                  onClick={openWaCamera}
                >
                  {waCapturing ? "Capture..." : "📷 Prendre une photo"}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-large"
                  disabled={waCapturing}
                  onClick={openWaGallery}
                >
                  🖼️ Galerie
                </button>
              </div>

              {whatsappPhotos.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 13, padding: "8px 12px" }}
                      onClick={selectAllPhotos}
                    >
                      {selectedPhotoIds.size === whatsappPhotos.length ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {selectedPhotoIds.size} sélectionnée(s) / {whatsappPhotos.length} total
                    </span>
                  </div>

                  <div className="whatsapp-photos-grid">
                    {whatsappPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="whatsapp-photo-item"
                        onClick={() => togglePhotoSelection(photo.id)}
                        style={{ cursor: "pointer", border: selectedPhotoIds.has(photo.id) ? "2px solid var(--primary)" : "2px solid transparent" }}
                      >
                        <img src={photo.url} alt="Photo terrain" />
                        {selectedPhotoIds.has(photo.id) && (
                          <div className="selected-check">✓</div>
                        )}
                        <button
                          type="button"
                          className="zoom-photo-btn"
                          style={{
                            position: "absolute",
                            bottom: 4,
                            right: 4,
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            background: "rgba(0, 0, 0, 0.65)",
                            color: "#fff",
                            border: "none",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            zIndex: 3,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingPhoto({
                              url: photo.url,
                              title: "Photo terrain",
                              subtitle: photo.lieu || (photo.lat ? `${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}` : ""),
                              info: [
                                ...(photo.lat ? [{ label: "Coordonnées", val: `${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}` }] : []),
                                ...(photo.precision_m ? [{ label: "Précision", val: `±${photo.precision_m.toFixed(1)} m` }] : []),
                                ...(photo.horodatage ? [{ label: "Date & Heure", val: new Date(photo.horodatage).toLocaleString() }] : []),
                                ...(photo.lieu ? [{ label: "Lieu", val: photo.lieu }] : []),
                              ],
                            });
                          }}
                          title="Agrandir"
                        >
                          🔍
                        </button>
                        <button
                          type="button"
                          className="remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWhatsappPhoto(photo.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-primary btn-large"
                      onClick={sendPhotosViaWhatsapp}
                      disabled={selectedPhotoIds.size === 0}
                      style={{ flex: 1, minWidth: 200 }}
                    >
                      Envoyer sur WhatsApp ({selectedPhotoIds.size})
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-large"
                      onClick={downloadSelectedPhotos}
                      disabled={selectedPhotoIds.size === 0}
                      style={{ padding: "10px 16px" }}
                      title="Télécharger les photos sélectionnées sur l'appareil"
                    >
                      ⬇ Télécharger ({selectedPhotoIds.size})
                    </button>
                  </div>
                </>
              )}

              {whatsappStatus && (
                <p className="gps-status" style={{ marginTop: 12 }}>{whatsappStatus}</p>
              )}
            </div>
          </section>
        )}

        {activeTab === "mise_en_service" && (
          <section>
            <ScannableField
              label="ONT / SN"
              value={data.ont_sn}
              placeholder="Ex: 485754437572231B8"
              scanLabel="Scanner SN"
              onChange={(v) => {
                update("ont_sn", v);
                if (!data.sn) update("sn", v);
              }}
              onScanClick={() => {
                setScannerTarget("sn");
                setScannerOpen(true);
              }}
            />
            <TextField label="Qté PTO" type="number" value={data.pto_qte} onChange={(v) => update("pto_qte", v)} />
            <TextField label="Qté répéteur WiFi" type="number" value={data.repeteur_wifi_qte} onChange={(v) => update("repeteur_wifi_qte", v)} />
            <TextField label="Emplacement ONT" value={data.emplacement_ont} onChange={(v) => update("emplacement_ont", v)} />
            <CheckField label="Client confirme l'emplacement" checked={data.client_confirme_emplacement} onChange={(v) => update("client_confirme_emplacement", v)} />
            <SelectField label="Offre souscrite" value={data.offre_souscrite} options={OFFRES} onChange={(v) => update("offre_souscrite", v)} />
            <CheckField label="Remise d'équipement OK" checked={data.remise_equipement_ok} onChange={(v) => update("remise_equipement_ok", v)} />
            <TextField label="Appréciation satisfaction (libre)" value={data.appreciation_satisfaction_libre} onChange={(v) => update("appreciation_satisfaction_libre", v)} />
          </section>
        )}

        {activeTab === "satisfaction" && (
          <section className="form-satisfaction-section" style={{ padding: "4px 0" }}>
            <FichesOfficiellesModule
              intervention={data}
              onChange={(updated) => {
                setData((prev) => ({
                  ...prev,
                  ...updated,
                  modifie_par: currentUser,
                  modifie_le: new Date().toISOString(),
                }));
                markDirty(
                  "nom_client",
                  "telephone_ligne",
                  "mobile",
                  "mail",
                  "service_type",
                  "ont_sn",
                  "sn",
                  "pto_qte",
                  "repeteur_wifi_qte",
                  "emplacement_ont",
                  "offre_souscrite",
                  "remise_equipement_ok",
                  "constat_diagnostic",
                  "travaux_executes",
                  "observations_intervention",
                  "materiel_recupere",
                  "rdv_manques",
                  "note_qualite_equipe",
                  "autre_element",
                  "note_appreciation_client",
                  "appreciation_satisfaction_libre",
                  "travaux_conformes",
                  "emplacement_valide",
                  "travail_propre",
                  "service_teste",
                  "service_fonctionne",
                  "explications_donnees",
                  "recommanderait",
                  "accepte_recontact",
                  "qualite",
                  "delais",
                  "professionnalisme",
                  "type_intervention_satisfaction",
                  "remarque_aucune",
                  "remarque_libre",
                  "signature_client",
                  "signature_technicien",
                  "nom_client_declaration"
                );
              }}
              onSave={() => flushServerSync()}
            />
          </section>
        )}
      </div>

      <footer className="form-footer">
        {isInterventionTerminee(data) ? (
          <div className="form-finish-card is-done-card" style={{ background: "#f0fdf4", borderColor: "#86efac", padding: 18, borderRadius: 12, border: "1px solid #86efac" }}>
            <div className="form-finish-header" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <span className="form-finish-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#dcfce7", padding: 8, borderRadius: 10 }}>
                <IconCheckCircle size={24} color="#15803d" />
              </span>
              <div>
                <h4 className="form-finish-title" style={{ margin: "0 0 4px", color: "#166534", fontSize: 16, fontWeight: 700 }}>
                  Intervention clôturée et validée (Terminée)
                </h4>
                <p className="form-finish-desc" style={{ margin: 0, color: "#15803d", fontSize: 13 }}>
                  Ce dossier a été validé. Vos modifications sont enregistrées automatiquement.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-primary"
                style={{ background: "#16a34a", borderColor: "#16a34a", padding: "10px 18px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}
                onClick={() => onFinish(data)}
              >
                <IconFileText size={16} /> Voir le rapport & les fiches →
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "10px 16px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
                onClick={() => onClose("terminees")}
              >
                <IconHome size={16} /> Revenir à l'accueil
              </button>
            </div>
          </div>
        ) : (
          <div className="form-finish-card">
            <div className="form-finish-header">
              <span className="form-finish-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#dcfce7", padding: 8, borderRadius: 10 }}>
                <IconFlag size={22} color="#15803d" />
              </span>
              <div>
                <h4 className="form-finish-title">Clôture de l'intervention</h4>
                <p className="form-finish-desc">
                  Assurez-vous que les informations, photos et poteaux sont bien complets avant de clôturer.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-finish-intervention"
              onClick={() => setFinishModalOpen(true)}
              disabled={finishing}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <IconFlag size={16} color="#fff" />
              {finishing ? "Finalisation en cours…" : "Terminer l'intervention"}
            </button>
          </div>
        )}
      </footer>

      {finishModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setFinishModalOpen(false)}
        >
          <div
            className="modal-card"
            style={{
              background: "#fff",
              borderRadius: 16,
              maxWidth: 480,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
              textAlign: "left",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {finishSuccessData ? (
              <div>
                <div style={{ textAlign: "center", padding: "12px 0 16px" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                    <IconCheckCircle size={48} color="#16a34a" />
                  </div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 20, color: "#166534", fontWeight: 800 }}>
                    Intervention clôturée avec succès !
                  </h3>
                  <p style={{ margin: 0, fontSize: 13.5, color: "#475569" }}>
                    Le dossier de raccordement est désormais <strong>Terminé</strong>. Le matériel a été déduit du stock d'équipe.
                  </p>
                </div>

                <div
                  style={{
                    background: "#f0fdf4",
                    borderRadius: 12,
                    padding: "14px 16px",
                    border: "1px solid #bbf7d0",
                    fontSize: 13.5,
                    lineHeight: 1.7,
                    color: "#166534",
                    marginBottom: 20,
                  }}
                >
                  <div>Client : <strong>{finishSuccessData.nom_client || "Client"}</strong></div>
                  <div>Statut : <strong style={{ color: "#15803d" }}>TERMINÉE</strong></div>
                  <div>Port FAT : <strong>{finishSuccessData.port || "N/A"}</strong></div>
                  <div>Photos enregistrées : <strong>{(finishSuccessData.whatsapp_photos || []).length}</strong></div>
                  <div>Poteaux enregistrés : <strong>{(finishSuccessData.points_gps || []).filter((p) => p && p.type === "Poteau").length}</strong></div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "stretch" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1, padding: "12px 14px", fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={() => {
                      setFinishModalOpen(false);
                      setFinishSuccessData(null);
                      onClose("terminees");
                    }}
                  >
                    <IconHome size={16} /> Accueil
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flex: 1.3, padding: "12px 14px", fontSize: 14, fontWeight: 700, background: "#16a34a", borderColor: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={() => {
                      setFinishModalOpen(false);
                      const payload = finishSuccessData;
                      setFinishSuccessData(null);
                      onFinish(payload);
                    }}
                  >
                    <IconFileText size={16} /> Voir le rapport →
                  </button>
                </div>
              </div>
            ) : finishing ? (
              <div style={{ textAlign: "center", padding: "28px 0" }}>
                <div className="spin-icon" style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <IconRefresh size={44} color="#2563eb" />
                </div>
                <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "#1e293b", fontWeight: 700 }}>
                  Clôture en cours…
                </h3>
                <p style={{ margin: 0, fontSize: 13.5, color: "#64748b", lineHeight: 1.5 }}>
                  Enregistrement final, synchronisation sécurisée et mise à jour du stock d'équipe…
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#f0fdf4", padding: 8, borderRadius: 10 }}>
                    <IconFlag size={24} color="#15803d" />
                  </span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, color: "#1e293b" }}>
                      Confirmer la clôture d'intervention
                    </h3>
                    <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>
                      Vérification avant enregistrement final
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    borderRadius: 12,
                    padding: "12px 16px",
                    border: "1px solid #e2e8f0",
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: "#334155",
                    marginBottom: 18,
                  }}
                >
                  <div>Client : <strong>{data.nom_client || "Non renseigné"}</strong></div>
                  <div>Ligne : <strong>{data.telephone_ligne || "Non renseignée"}</strong></div>
                  <div>Mobile : <strong>{data.mobile || "Non renseigné"}</strong></div>
                  <div>FAT : <strong>{data.fat_ref || "N/A"}</strong> (Port {data.port || "N/A"})</div>
                  <div>Poteaux : <strong>{(data.points_gps || []).filter((p) => p && p.type === "Poteau").length}</strong></div>
                  <div>Photos : <strong>{(whatsappPhotos || []).length}</strong></div>
                </div>

                <p style={{ fontSize: 13, color: "#475569", margin: "0 0 20px", lineHeight: 1.5 }}>
                  Cette action marquera l'intervention comme <strong>Terminée</strong>, synchronisera les données sur le serveur et déduira le matériel utilisé du stock.
                </p>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "10px 16px", fontSize: 14 }}
                    onClick={() => setFinishModalOpen(false)}
                  >
                    ✕ Revenir au relevé
                  </button>
                  <button
                    type="button"
                    className="btn-finish-intervention"
                    style={{ padding: "10px 20px", fontSize: 14 }}
                    onClick={finish}
                  >
                    ✓ Confirmer et clôturer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <PhotoViewerModal photo={viewingPhoto} onClose={() => setViewingPhoto(null)} />

      <BarcodeScannerModal
        isOpen={scannerOpen}
        targetField={scannerTarget}
        currentMac={data.mac}
        currentSn={data.sn || data.ont_sn}
        onScan={({ mac, sn }) => {
          if (mac) {
            update("mac", mac);
          }
          if (sn) {
            update("sn", sn);
            update("ont_sn", sn);
          }
        }}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
}
