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
  recognizeSpeedtestFromImage,
  recognizePowerMeterFromImage,
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
import { calculateMaterials } from "../lib/materialsCalculation.js";
import { downloadPhotoFile, downloadAllPhotosAsZip } from "../lib/photoDownload";
import { findPhotoForSlot } from "../lib/slotPhotos";
import {
  formatFileSize,
  formatDuration,
  compressVideo,
  generateVideoThumbnail,
} from "../lib/videoCompression";
import {
  uploadInterventionMedia,
  deleteInterventionMedia,
} from "../lib/media";
import VideoPlayerModal from "../components/VideoPlayerModal";
import {
  IconFlag,
  IconHome,
  IconFileText,
  IconRefresh,
  IconCheckCircle,
  IconPole,
  IconZap,
  IconCable,
  IconServer,
  IconHardware,
} from "../components/Icons";
import FichesOfficiellesModule from "../components/FichesOfficiellesModule";

const TABS = [
  { id: "rapport", label: "📋 Rapport" },
  { id: "photos", label: "📸 Photos CelPros" },
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
    hasOcr: true,
  },
  {
    key: "mesure_pto",
    label: "Mesure puissance au PTO",
    icon: "📊",
    description: "Écran du photomètre optique mesurant au PTO (dBm)",
    keywords: ["mesure pto", "photometre pto", "puissance pto"],
    hasOcr: true,
  },
  {
    key: "debit_cable",
    label: "Test débit câble RJ45",
    icon: "⚡",
    description: "Capture du test de débit réalisé par câble Ethernet",
    keywords: ["debit cable", "test debit cable", "speedtest cable"],
    hasOcr: true,
    noBanner: true,
  },
  {
    key: "debit_wifi",
    label: "Test débit Wi-Fi",
    icon: "📶",
    description: "Capture du test de débit réalisé en Wi-Fi",
    keywords: ["debit wifi", "test debit wifi", "speedtest wifi"],
    hasOcr: true,
    noBanner: true,
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
    description: "Photo du combiné ou téléphone fixe raccordé (masqué)",
    keywords: ["combine", "photo combine", "telephone"],
    hidden: true,
  },
  {
    key: "fiche_combine",
    label: "Fiche combiné",
    icon: "🔌",
    description: "Prise ou fiche de raccordement du combiné (masqué)",
    keywords: ["fiche combine", "fiche raccordement"],
    hidden: true,
  },
  {
    key: "contrat_client",
    label: "Photo contrat client",
    icon: "📝",
    description: "Contrats clients signés (jusqu'à 2 contrats autorisés)",
    keywords: ["photo contrat", "contrat client", "signature"],
    noBanner: true,
    isMulti: true,
    maxPhotos: 2,
  },
];

const OFFRES = ["Fibre Pro", "Pro Max", "Pro Mega", "Office Max", "Office Mega"];
const _NIVEAUX = ["Très satisfait", "Satisfait", "Peu satisfait", "Insatisfait"];
const TYPES_POINT = ["Poteau", "Chambre", "FAT", "Abonné", "Autre"];
const SOUS_TYPES_POTEAU = ["Traversé", "Poteau FAT", "Armé", "Implanté"];
const _PORTS_DISPONIBLES = Array.from({ length: 8 }, (_, index) => `Port ${index + 1}`);
const PROPRIETAIRES_SUGGERES = ["SBEE", "Petit Jean"];

const MATERIEL_STANDARD = [
  { key: "rue", label: "Rue", hidden: true },
  { key: "pince", label: "Pince" },
  { key: "crochets", label: "Crochets" },
  { key: "susp", label: "Suspente (Susp)" },
  { key: "piton", label: "Piton" },
  { key: "cheville", label: "Cheville" },
  { key: "pto", label: "PTO" },
  { key: "ont", label: "ONT" },
  { key: "closer", label: "Closer" },
  { key: "rp1", label: "RP1", hidden: true },
  { key: "traverse_13t", label: "Traverse 13T" },
  { key: "traverse_15t", label: "Traverse 15T" },
  { key: "semelle_eq", label: "Semelle Eq" },
  { key: "poteau_sbee_non_arme", label: "Poteau SBEE non armé" },
  { key: "poteau_sbee_arme", label: "Poteau SBEE armé" },
];

export default function InterventionFormScreen({ intervention, onClose, onFinish, currentUser, onOpenReport }) {
  const [data, setData] = useState(() => ensureInterventionDefaults(intervention));
  const dirtyFieldsRef = useRef(new Set());
  const dirtyRevisionsRef = useRef(new Map());
  const deletedGpsPointIdsRef = useRef(new Set());
  const deletedWhatsappPhotoIdsRef = useRef(new Set());
  const deletedVideoIdsRef = useRef(new Set());
  const saveQueueRef = useRef(Promise.resolve());
  const changeRevisionRef = useRef(0);
  const [activeTab, setActiveTab] = useState("rapport");
  useEffect(() => {
    if (activeTab === "gps") {
      setActiveTab("photos");
    }
  }, [activeTab]);
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

  // Gestion du module Vidéo Terrain
  const [videosTerrain, setVideosTerrain] = useState(() =>
    Array.isArray(intervention?.videos_terrain) ? intervention.videos_terrain : []
  );
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [videoProgress, setVideoProgress] = useState({ pct: 0, msg: "" });
  const [videoStatus, setVideoStatus] = useState("");
  const [activeViewingVideo, setActiveViewingVideo] = useState(null);
  const videoCameraInputRef = useRef(null);
  const videoGalleryInputRef = useRef(null);
  const videoTargetReplaceRef = useRef(null);
  const [retakeTargetVideo, setRetakeTargetVideo] = useState(null);
  const activeVideoUploadsRef = useRef(new Set());

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

  const whatsappPhotosRef = useRef(whatsappPhotos);
  useEffect(() => {
    whatsappPhotosRef.current = whatsappPhotos;
  }, [whatsappPhotos]);

  const videosTerrainRef = useRef(videosTerrain);
  useEffect(() => {
    videosTerrainRef.current = videosTerrain;
  }, [videosTerrain]);

  const lastKnownSignatureRef = useRef(
    intervention?.updated_at
      ? `${intervention.updated_at}_${(intervention.whatsapp_photos || []).length}_${(intervention.videos_terrain || []).length}`
      : ""
  );

  const mergeIncomingPhotos = useCallback((prevPhotos, remotePhotos) => {
    const deletedIds = deletedWhatsappPhotoIdsRef.current;
    const isMultiFn = (p) =>
      !p?.slot ||
      p.additionnelle ||
      p.is_additionnelle ||
      p.slot === "additionnelle" ||
      String(p.slot).startsWith("additionnelle_") ||
      p.slot === "autre_poteau" ||
      String(p.slot).startsWith("autre_poteau") ||
      p.slot === "contrat_client" ||
      String(p.slot).startsWith("contrat_client") ||
      String(p.slot).startsWith("media_");

    const incoming = (Array.isArray(remotePhotos) ? remotePhotos : []).filter((p) => {
      if (!p) return false;
      if (p.id && deletedIds.has(p.id)) return false;
      if (!isMultiFn(p)) {
        if (p.slot && (deletedIds.has(p.slot) || deletedIds.has(`slot_${p.slot}`))) return false;
        if (p.type && p.type !== "poteau" && (deletedIds.has(p.type) || deletedIds.has(`slot_${p.type}`))) return false;
      }
      return true;
    });
    if (!prevPhotos || prevPhotos.length === 0) return incoming;
    const incomingIds = new Set(incoming.map((p) => p?.id).filter(Boolean));
    const incomingSingleSlots = new Set(
      incoming.filter((p) => p && !isMultiFn(p)).map((p) => p?.slot).filter(Boolean)
    );
    const localUnsynced = prevPhotos.filter((p) => {
      if (!p) return false;
      if (p.id && deletedIds.has(p.id)) return false;
      const isMulti = isMultiFn(p);
      if (!isMulti) {
        if (p.slot && (deletedIds.has(p.slot) || deletedIds.has(`slot_${p.slot}`))) return false;
        if (p.type && p.type !== "poteau" && (deletedIds.has(p.type) || deletedIds.has(`slot_${p.type}`))) return false;
      }
      if (p.id && incomingIds.has(p.id)) return false;
      if (!isMulti && p.slot && incomingSingleSlots.has(p.slot)) return false;
      // Conserver les photos locales en attente d'envoi (base64) ou si whatsapp_photos est dirty
      return String(p.url || "").startsWith("data:image") || dirtyFieldsRef.current.has("whatsapp_photos");
    });
    return [...incoming, ...localUnsynced];
  }, []);

  const mergeIncomingVideos = useCallback((prevVideos, remoteVideos) => {
    const deletedIds = deletedVideoIdsRef.current;
    const incoming = (Array.isArray(remoteVideos) ? remoteVideos : []).filter(
      (v) => v && v.id && !deletedIds.has(String(v.id)) && (!v.url || !String(v.url).startsWith("blob:"))
    );
    if (!prevVideos || prevVideos.length === 0) return incoming;
    const incomingIds = new Set(incoming.map((v) => String(v?.id)).filter(Boolean));
    const incomingUrls = new Set(incoming.map((v) => String(v?.url || "")).filter(Boolean));
    const localInFlight = prevVideos.filter((v) => {
      if (!v || !v.id || deletedIds.has(String(v.id))) return false;
      if (incomingIds.has(String(v.id))) return false;
      if (v.url && incomingUrls.has(String(v.url))) return false;
      return v.status === "uploading" || v.status === "processing" || String(v.url || "").startsWith("blob:");
    });
    return [...incoming, ...localInFlight];
  }, []);

  // Synchronisation sécurisée si les photos, points, vidéos ou champs arrivent depuis un rechargement ou un coéquipier
  useEffect(() => {
    if (!intervention) return;
    let mergedWa = null;
    let mergedVids = null;

    if (Array.isArray(intervention.whatsapp_photos)) {
      mergedWa = mergeIncomingPhotos(whatsappPhotosRef.current, intervention.whatsapp_photos);
      setWhatsappPhotos(mergedWa);
      whatsappPhotosRef.current = mergedWa;
    }
    if (Array.isArray(intervention.videos_terrain)) {
      mergedVids = mergeIncomingVideos(videosTerrainRef.current, intervention.videos_terrain);
      setVideosTerrain(mergedVids);
      videosTerrainRef.current = mergedVids;
    }

    setData((prev) => {
      const next = { ...prev };
      for (const [field, value] of Object.entries(intervention)) {
        if (["points_gps", "whatsapp_photos", "videos_terrain", "_fully_loaded"].includes(field)) continue;
        if (field === "materiel_pose" && value && typeof value === "object") {
          const mp = { ...(prev.materiel_pose || {}) };
          for (const [desig, qty] of Object.entries(value)) {
            if (!dirtyFieldsRef.current.has(`materiel_pose.${desig}`)) mp[desig] = qty;
          }
          next.materiel_pose = mp;
          continue;
        }
        if (!dirtyFieldsRef.current.has(field)) {
          const prevVal = prev[field];
          const prevIsFilled = typeof prevVal === "string" ? prevVal.trim() !== "" : (prevVal !== null && prevVal !== undefined && prevVal !== 0);
          const remoteIsEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
          if (!(prevIsFilled && remoteIsEmpty)) {
            next[field] = value;
          }
        }
      }
      if (Array.isArray(intervention.points_gps)) {
        const deletedIds = deletedGpsPointIdsRef.current;
        const incoming = intervention.points_gps.filter((p) => {
          const key = p?.id || p?.horodatage;
          return !key || !deletedIds.has(key);
        });
        if (!prev.points_gps || prev.points_gps.length === 0) {
          next.points_gps = incoming;
        } else {
          const incomingKeys = new Set(incoming.map((p) => p?.id || p?.horodatage).filter(Boolean));
          const incomingPoleNums = new Set(
            incoming.filter((p) => p && p.type === "Poteau" && Number(p.numero) > 0).map((p) => Number(p.numero))
          );
          const localUnsynced = (prev.points_gps || []).filter((p) => {
            const key = p?.id || p?.horodatage;
            if (!key || incomingKeys.has(key) || deletedIds.has(key)) return false;
            if (p.type === "Poteau" && Number(p.numero) > 0 && incomingPoleNums.has(Number(p.numero))) return false;
            return String(p.photo || "").startsWith("data:image") || dirtyFieldsRef.current.has("points_gps");
          });
          next.points_gps = [...incoming, ...localUnsynced];
        }
      }
      if (mergedWa !== null) next.whatsapp_photos = mergedWa;
      if (mergedVids !== null) next.videos_terrain = mergedVids;
      next._fully_loaded = true;
      dataRef.current = next;
      return next;
    });
  }, [intervention, mergeIncomingPhotos, mergeIncomingVideos]);

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
  const [poleConfigModal, setPoleConfigModal] = useState(null);

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
    setData((prev) => {
      const next = {
        ...prev,
        port: v,
        ports_disponibles: computed.ports_disponibles,
        port_disponible: computed.port_disponible,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
      };
      dataRef.current = next;
      saveInterventionLocally(next);
      return next;
    });
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

    const isWaPhotosDirty = dirtySnapshot.has("whatsapp_photos");
    const isGpsDirty = dirtySnapshot.has("points_gps");
    const isVideosDirty = dirtySnapshot.has("videos_terrain");

    const currentWaList = Array.isArray(whatsappPhotosRef.current) && whatsappPhotosRef.current.length > 0
      ? whatsappPhotosRef.current
      : (Array.isArray(currentData.whatsapp_photos) ? currentData.whatsapp_photos : []);
    const currentVideosList = (Array.isArray(videosTerrainRef.current) ? videosTerrainRef.current : (currentData.videos_terrain || []))
      .filter((v) => v && (!v.url || !String(v.url).startsWith("blob:")));

    const payload = {
      ...currentData,
      whatsapp_photos: isWaPhotosDirty || !currentData.updated_at ? currentWaList : [],
      points_gps: isGpsDirty || !currentData.updated_at ? (currentData.points_gps || []) : [],
      videos_terrain: isVideosDirty || !currentData.updated_at ? currentVideosList : [],
      changed_fields: [...dirtySnapshot, "modifie_par", "modifie_le"],
      deleted_points: [...deletedGpsPointIdsRef.current],
      deleted_whatsapp_photos: [...deletedWhatsappPhotoIdsRef.current],
      deleted_videos: [...deletedVideoIdsRef.current],
      _deleted_video_ids: [...deletedVideoIdsRef.current],
      _fully_loaded: true,
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
        for (const id of (payload.deleted_videos || [])) deletedVideoIdsRef.current.delete(id);

        // Remplacer immédiatement les lourdes chaînes base64 en mémoire par les URLs https:// renvoyées par le serveur
        // et intégrer les photos/poteaux/vidéos ajoutés en parallèle par le reste de l'équipe !
        let nextWa = null;
        if (Array.isArray(saved.whatsapp_photos) && (isWaPhotosDirty || saved.whatsapp_photos.length > 0)) {
          nextWa = mergeIncomingPhotos(whatsappPhotosRef.current, saved.whatsapp_photos);
          setWhatsappPhotos(nextWa);
          whatsappPhotosRef.current = nextWa;
        }
        let nextVids = null;
        if (Array.isArray(saved.videos_terrain) && (isVideosDirty || saved.videos_terrain.length > 0)) {
          nextVids = mergeIncomingVideos(videosTerrainRef.current, saved.videos_terrain);
          setVideosTerrain(nextVids);
          videosTerrainRef.current = nextVids;
        }

        if (saved?.updated_at) {
          lastKnownSignatureRef.current = saved.updated_at;
        }

        setData((prev) => {
          const next = {
            ...prev,
            ...(saved?.updated_at ? { updated_at: saved.updated_at, modifie_le: saved.updated_at } : {}),
            ...(nextWa !== null ? { whatsapp_photos: nextWa } : {}),
            ...(nextVids !== null ? { videos_terrain: nextVids } : {}),
          };
          if (Array.isArray(saved.points_gps) && (isGpsDirty || saved.points_gps.length > 0) && !dirtyFieldsRef.current.has("points_gps")) {
            next.points_gps = saved.points_gps;
          }
          dataRef.current = next;
          saveInterventionLocally(next);
          return next;
        });
        setSaveStatus("✓ Enregistré");
      } else {
        setSaveStatus("✓ Sauvegardé (en attente réseau)");
      }
    } catch {
      // En cas de réseau instable, les données restent garanties dans le cache local
      setSaveStatus("✓ Sauvegardé (local)");
    }
  }, [mergeIncomingPhotos, mergeIncomingVideos]);

  useEffect(() => {
    if (finishingRef.current || dirtyFieldsRef.current.size === 0) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    // Debounce ultra-court de 400ms pour synchroniser en tâche de fond sans ralentir la frappe
    syncTimerRef.current = setTimeout(flushServerSync, 400);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [data, whatsappPhotos, flushServerSync]);

  const handleClose = useCallback(async () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    if (activeVideoUploadsRef.current.size > 0) {
      setSaveStatus("⏳ Finalisation de l'envoi vidéo…");
      try {
        await Promise.allSettled([...activeVideoUploadsRef.current]);
      } catch {}
    }
    const latest = dataRef.current;
    if (latest) {
      saveInterventionLocally({
        ...latest,
        whatsapp_photos: whatsappPhotosRef.current,
        videos_terrain: videosTerrainRef.current,
        _fully_loaded: true,
      });
      try {
        await flushServerSync();
      } catch {}
    }
    onClose();
  }, [flushServerSync, onClose]);

  useEffect(() => {
    function handleBeforeUnload() {
      if (dataRef.current) {
        saveInterventionLocally({
          ...dataRef.current,
          whatsapp_photos: whatsappPhotosRef.current,
          videos_terrain: videosTerrainRef.current,
          _fully_loaded: true,
        });
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
        // Vérification ultra-rapide (50 octets) par signature (date + empreinte des médias) :
        // Détecte instantanément si un coéquipier a ajouté une photo, vidéo ou information
        const check = await checkInterventionUpdatedAt(data.id);
        if (!active || !check) return;
        const currentSig = check.signature || check.updated_at || "";
        const remoteUpdated = check.updated_at || "";

        // Si la signature du serveur est identique à celle qu'on a déjà traitée, rien à faire
        if (lastKnownSignatureRef.current && currentSig && currentSig === lastKnownSignatureRef.current) {
          return;
        }

        // Récupérer la fiche complète dès qu'une photo ou vidéo est ajoutée/mise à jour par un coéquipier
        const remote = await getIntervention(data.id);
        if (!active || !remote) return;
        lastKnownSignatureRef.current = currentSig || remote.updated_at || "";

        let mergedWa = null;
        if (Array.isArray(remote.whatsapp_photos)) {
          mergedWa = mergeIncomingPhotos(whatsappPhotosRef.current, remote.whatsapp_photos);
          setWhatsappPhotos(mergedWa);
          whatsappPhotosRef.current = mergedWa;
        }

        let mergedVids = null;
        if (Array.isArray(remote.videos_terrain)) {
          mergedVids = mergeIncomingVideos(videosTerrainRef.current, remote.videos_terrain);
          setVideosTerrain(mergedVids);
          videosTerrainRef.current = mergedVids;
        }

        setData((previous) => {
          const next = {
            ...previous,
            updated_at: remote.updated_at || remoteUpdated,
            modifie_le: remote.updated_at || remoteUpdated,
            ...(mergedWa !== null ? { whatsapp_photos: mergedWa } : {}),
            ...(mergedVids !== null ? { videos_terrain: mergedVids } : {}),
            _fully_loaded: true,
          };
          for (const [field, value] of Object.entries(remote)) {
            if (field === "materiel_pose") {
              const material = { ...previous.materiel_pose };
              for (const [designation, quantity] of Object.entries(value || {})) {
                if (!dirtyFieldsRef.current.has(`materiel_pose.${designation}`)) material[designation] = quantity;
              }
              next.materiel_pose = material;
            } else if (field === "points_gps" && Array.isArray(value)) {
              const deletedIds = deletedGpsPointIdsRef.current;
              const incomingPts = value.filter((p) => {
                const key = p?.id || p?.horodatage;
                return !key || !deletedIds.has(key);
              });
              const incomingKeys = new Set(incomingPts.map((p) => p?.id || p?.horodatage).filter(Boolean));
              const incomingPoleNums = new Set(
                incomingPts.filter((p) => p && p.type === "Poteau" && Number(p.numero) > 0).map((p) => Number(p.numero))
              );
              const localUnsyncedPts = (previous.points_gps || []).filter((p) => {
                const key = p?.id || p?.horodatage;
                if (!key || incomingKeys.has(key) || deletedIds.has(key)) return false;
                if (p.type === "Poteau" && Number(p.numero) > 0 && incomingPoleNums.has(Number(p.numero))) return false;
                return String(p.photo || "").startsWith("data:image") || dirtyFieldsRef.current.has("points_gps");
              });
              next.points_gps = [...incomingPts, ...localUnsyncedPts];
            } else if (!["whatsapp_photos", "videos_terrain", "points_gps", "_fully_loaded"].includes(field)) {
              // Protéger les champs dirty ou en cours de saisie
              const isDirty = dirtyFieldsRef.current.has(field) ||
                ((field === "nom_client" || field === "nom_dossier" || field === "nom_client_declaration") &&
                 (dirtyFieldsRef.current.has("nom_client") || dirtyFieldsRef.current.has("nom_dossier") || dirtyFieldsRef.current.has("nom_client_declaration")));

              if (!isDirty) {
                const prevVal = previous[field];
                const prevIsFilled = typeof prevVal === "string" ? prevVal.trim() !== "" : (prevVal !== null && prevVal !== undefined);
                const remoteIsEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");

                // Règle d'or : ne jamais écraser une valeur locale existante par du vide ou null distant
                if (!(prevIsFilled && remoteIsEmpty)) {
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
  }, [data.id, mergeIncomingPhotos, mergeIncomingVideos]);

  const [manualRefreshing, setManualRefreshing] = useState(false);

  const handleManualRefreshIntervention = useCallback(async () => {
    if (manualRefreshing || !data.id) return;
    setManualRefreshing(true);
    setSaveStatus("Actualisation…");
    try {
      const fresh = await getIntervention(data.id);
      if (fresh) {
        if (fresh.updated_at) {
          lastKnownSignatureRef.current = fresh.updated_at;
        }
        const fullIntervention = { ...fresh, _fully_loaded: true };
        const mergedWa = Array.isArray(fullIntervention.whatsapp_photos)
          ? mergeIncomingPhotos(whatsappPhotosRef.current, fullIntervention.whatsapp_photos)
          : whatsappPhotosRef.current;
        const mergedVids = Array.isArray(fullIntervention.videos_terrain)
          ? mergeIncomingVideos(videosTerrainRef.current, fullIntervention.videos_terrain)
          : videosTerrainRef.current;

        setWhatsappPhotos(mergedWa);
        whatsappPhotosRef.current = mergedWa;
        setVideosTerrain(mergedVids);
        videosTerrainRef.current = mergedVids;

        setData((prev) => {
          const merged = {
            ...fullIntervention,
            whatsapp_photos: mergedWa,
            videos_terrain: mergedVids,
            _fully_loaded: true,
          };
          for (const dirtyField of dirtyFieldsRef.current) {
            if (dirtyField.startsWith("materiel_pose.")) {
              const desig = dirtyField.replace("materiel_pose.", "");
              merged.materiel_pose = {
                ...(merged.materiel_pose || {}),
                [desig]: prev.materiel_pose?.[desig],
              };
            } else if (dirtyField in prev && !["whatsapp_photos", "videos_terrain"].includes(dirtyField)) {
              merged[dirtyField] = prev[dirtyField];
            }
          }
          for (const key of ["nom_client", "nom_dossier", "telephone_ligne", "mobile", "msan", "fat_ref", "port"]) {
            if (prev[key] && !merged[key]) {
              merged[key] = prev[key];
            }
          }
          dataRef.current = merged;
          saveInterventionLocally(merged);
          return merged;
        });
        setSaveStatus("✓ Données actualisées");
      }
    } catch (err) {
      console.warn("Manual refresh failed:", err);
      setSaveStatus("Erreur réseau");
    } finally {
      setManualRefreshing(false);
      setTimeout(() => setSaveStatus((s) => (s && s.includes("Actualisation") ? "" : s)), 2500);
    }
  }, [data.id, manualRefreshing, mergeIncomingPhotos, mergeIncomingVideos]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && data.id && !finishingRef.current) {
        handleManualRefreshIntervention();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [data.id, handleManualRefreshIntervention]);


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
        next.nb_poteaux_armes = poleList.filter((p) => (p.arme !== undefined ? Boolean(p.arme) : (p.sous_type === "Armé")) && /sbee/i.test(p.type_poteau || p.proprietaire || "")).length;
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
    const isFatPole = isPoteau && (sousType === "Poteau FAT" || sousType.toLowerCase().includes("fat"));
    const point = {
      id: crypto.randomUUID(),
      type: resolvedType,
      ...(isPoteau ? {
        sous_type: sousType,
        proprietaire: proprietaire.trim(),
        type_poteau: proprietaire.trim(),
        traverse: sousType !== "Implanté" && !isFatPole,
        implante: sousType === "Implanté",
        arme: sousType === "Armé",
        is_poteau_fat: isFatPole,
      } : {}),
      ...pendingCapture,
      ajoute_par: currentUser,
    };
    const nextPoints = [...data.points_gps, point];
    update("points_gps", nextPoints);

    if (!data._crochets_manual) {
      const calc = calculateMaterials({ ...data, points_gps: nextPoints });
      const nextMp = {
        ...(data.materiel_pose || {}),
        crochets: calc.crochets,
      };
      update("materiel_pose", nextMp);
    }

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
        const nextList = [...filtered, galleryPhoto];
        whatsappPhotosRef.current = nextList;
        setData((prevData) => {
          const nextData = { ...prevData, whatsapp_photos: nextList, _fully_loaded: true };
          dataRef.current = nextData;
          saveInterventionLocally(nextData);
          return nextData;
        });
        return nextList;
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
    const numQte = Math.max(0, Number(qte) || 0);
    markDirty(`materiel_pose.${designation}`);
    setData((prev) => {
      const nextMp = { ...prev.materiel_pose, [designation]: numQte };
      const next = {
        ...prev,
        materiel_pose: nextMp,
      };

      if (designation === "crochets") {
        next._crochets_manual = true;
        dirtyFieldsRef.current.add("_crochets_manual");
      }

      if (designation === "piton" && !prev._crochets_manual) {
        const calc = calculateMaterials(next);
        nextMp.crochets = calc.crochets;
        markDirty("materiel_pose.crochets");
      }

      if (designation === "ont" || designation === "otp") {
        nextMp.ont = numQte;
        delete nextMp.otp;
        next.ont_qte = numQte;
        markDirty("materiel_pose.ont", "ont_qte");
      }

      if (designation === "pto") {
        next.pto_qte = numQte;
        markDirty("pto_qte");
      }

      dataRef.current = next;
      saveInterventionLocally(next);
      return next;
    });
    setSaveStatus("✓ Enregistré");
  }

  function resetCrochetsToAuto() {
    setData((prev) => {
      const calc = calculateMaterials(prev);
      const nextMp = { ...prev.materiel_pose, crochets: calc.crochets };
      const next = {
        ...prev,
        _crochets_manual: false,
        materiel_pose: nextMp,
      };
      markDirty("materiel_pose.crochets", "_crochets_manual");
      dataRef.current = next;
      saveInterventionLocally(next);
      return next;
    });
    setSaveStatus("✓ Calcul automatique des crochets rétabli");
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

  // ===== OCR automatique sur photo de test de débit (Wi-Fi / Câble) =====

  const runSpeedtestOcrOnPhoto = useCallback(async (photoDataUrl) => {
    if (!photoDataUrl) return;
    setOcrProcessing(true);
    try {
      const ocrResult = await recognizeSpeedtestFromImage(photoDataUrl);
      const { download, upload, ping } = ocrResult;

      if (!download && !upload && !ping) {
        setOcrNotification({
          text: "ℹ️ Photo de test de débit enregistrée. Valeurs non détectées automatiquement, vous pouvez les renseigner manuellement.",
          success: false,
        });
        setTimeout(() => setOcrNotification(null), 8000);
        return;
      }

      const updates = {};
      const parts = [];
      if (download) {
        updates.debit_descendant = download;
        parts.push(`Descendant : ${download} Mb/s`);
      }
      if (upload) {
        updates.debit_montant = upload;
        parts.push(`Montant : ${upload} Mb/s`);
      }
      if (ping) {
        updates.debit_ping = ping;
        parts.push(`Ping : ${ping} ms`);
      }

      for (const [k, v] of Object.entries(updates)) {
        update(k, v);
      }
      flushServerSync().catch(() => {});

      setOcrNotification({
        text: `📶 Débit extrait avec succès (${parts.join(", ")}). Renseigné automatiquement !`,
        success: true,
      });
      setTimeout(() => setOcrNotification(null), 10000);
    } catch (err) {
      console.warn("OCR Speedtest error:", err);
    } finally {
      setOcrProcessing(false);
    }
  }, [update]);

  // ===== OCR automatique sur photo de photomètre optique (FAT / PTO) =====

  const runPowerMeterOcrOnPhoto = useCallback(async (photoDataUrl, slotKey) => {
    if (!photoDataUrl) return;
    setOcrProcessing(true);
    try {
      const ocrResult = await recognizePowerMeterFromImage(photoDataUrl);
      if (ocrResult?.power) {
        const fieldKey = slotKey === "mesure_pto" ? "puissance_pto_dbm" : "puissance_fat_dbm";
        const label = slotKey === "mesure_pto" ? "Puissance PTO" : "Puissance FAT";
        update(fieldKey, ocrResult.power);
        flushServerSync().catch(() => {});
        setOcrNotification({
          text: `📊 ${label} détectée sur le photomètre : ${ocrResult.power} dBm. Renseignée automatiquement !`,
          success: true,
        });
        setTimeout(() => setOcrNotification(null), 9000);
      }
    } catch (err) {
      console.warn("OCR Photomètre error:", err);
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
      const currentLatestData = dataRef.current || data;
      const fallbackBaseCoords = {
        lat: currentLatestData.latitude || (Array.isArray(currentLatestData.points_gps) ? currentLatestData.points_gps.find((p) => p?.lat != null)?.lat : null),
        lng: currentLatestData.longitude || (Array.isArray(currentLatestData.points_gps) ? currentLatestData.points_gps.find((p) => p?.lng != null)?.lng : null),
        precision_m: 15,
      };

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
        setSlotActionFeedback(`Géocodage de l'adresse…`);
        try {
          lieu = await reverseGeocode(lat, lng);
        } catch {}
      }

      const embeddedPhoto = await embedGpsOnPhoto(photoDataUrl, {
        type: `${slotLabel} - ${data.nom_client || "Intervention"}`,
        lieu,
        lat,
        lng,
        precision_m: precision_m || 10,
        horodatage,
        noBanner,
        warning: posResult?.warning,
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
        const maxAutreNum = existingAutre.reduce((max, p, idx) => {
          const m = String(p?.name || p?.label || p?.slot || "").match(/(\d+)/);
          const n = m ? Number(m[1]) : idx + 1;
          return n > max ? n : max;
        }, existingAutre.length);
        const nextAutreNum = maxAutreNum + 1;
        newPhoto.slot = `autre_poteau_${nextAutreNum}`;
        newPhoto.type = "autre_poteau";
        newPhoto.name = `autre_poteau_${nextAutreNum}.jpg`;
        newPhoto.label = `Autre poteau (${nextAutreNum})`;
        newPhoto.description = `Autre poteau ${nextAutreNum} - ${data.nom_client || "Intervention"}`;
        deletedWhatsappPhotoIdsRef.current.delete(newPhoto.slot);
        nextPhotos = [...(whatsappPhotos || []), newPhoto];
      } else if (slotKey === "contrat_client") {
        const existingContrats = (whatsappPhotos || []).filter(
          (p) => p && !p.additionnelle && !p.is_additionnelle && (p.slot === "contrat_client" || p.slot?.startsWith("contrat_client") || p.type === "contrat_client")
        );
        const contratNum = existingContrats.length < 2 ? existingContrats.length + 1 : 2;
        newPhoto.slot = `contrat_client_${contratNum}`;
        newPhoto.label = `Photo contrat client (${contratNum})`;
        newPhoto.name = `contrat_client_${contratNum}.jpg`;
        newPhoto.description = `Photo contrat client ${contratNum} - ${data.nom_client || "Intervention"}`;
        if (existingContrats.length < 2) {
          nextPhotos = [...(whatsappPhotos || []), newPhoto];
        } else {
          const targetToReplace = existingContrats[1];
          if (targetToReplace?.id) deletedWhatsappPhotoIdsRef.current.add(targetToReplace.id);
          nextPhotos = (whatsappPhotos || []).map((p) => (p.id === targetToReplace.id ? newPhoto : p));
        }
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

      // Extractions automatiques OCR selon le type de photo
      if (slotKey === "fat") {
        runFatOcrOnPhoto(photoDataUrl);
      } else if (slotKey === "debit_wifi" || slotKey === "debit_cable") {
        runSpeedtestOcrOnPhoto(photoDataUrl);
      } else if (slotKey === "mesure_fat" || slotKey === "mesure_pto") {
        runPowerMeterOcrOnPhoto(photoDataUrl, slotKey);
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
        if (slotKey === "contrat_client" && (p.slot?.startsWith("contrat_client") || p.type === "contrat_client")) {
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
      if (target.slot && target.slot !== "autre_poteau") {
        deletedWhatsappPhotoIdsRef.current.add(target.slot);
      }

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

  async function removeContratPhoto(photoId) {
    if (!photoId) return;
    const target = (whatsappPhotos || []).find((p) => p && p.id === photoId);
    if (!target) return;
    if (confirm("Supprimer définitivement cette photo de contrat client ?")) {
      markDirty("whatsapp_photos");
      deletedWhatsappPhotoIdsRef.current.add(photoId);
      if (target.slot && target.slot !== "contrat_client") {
        deletedWhatsappPhotoIdsRef.current.add(target.slot);
      }

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
      setSlotActionFeedback("Photo de contrat supprimée définitivement.");
      setTimeout(() => setSlotActionFeedback(""), 3000);

      try {
        await flushServerSync();
      } catch (err) {
        console.warn("Erreur suppression photo contrat:", err);
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
  function openPoleCamera(numero, skipCheck = false) {
    const poleNum = Number(numero);
    if (!skipCheck) {
      const currentLatestData = dataRef.current || data;
      const pole = (currentLatestData.points_gps || []).find(
        (p) => p && p.type === "Poteau" && Number(p.numero) === poleNum
      );
      const isConfigured = pole && (pole.type_poteau || pole.proprietaire) && (
        /petit[\s_-]*jean|pj/i.test(pole.type_poteau || pole.proprietaire) ||
        /sbee/i.test(pole.type_poteau || pole.proprietaire)
      );
      if (!isConfigured) {
        setPoleConfigModal({ poleNum, actionAfter: "camera" });
        return;
      }
    }
    targetPoleNumeroRef.current = poleNum;
    if (poleCameraInputRef.current) {
      poleCameraInputRef.current.value = "";
      poleCameraInputRef.current.click();
    }
  }

  function openPoleGallery(numero, skipCheck = false) {
    const poleNum = Number(numero);
    if (!skipCheck) {
      const currentLatestData = dataRef.current || data;
      const pole = (currentLatestData.points_gps || []).find(
        (p) => p && p.type === "Poteau" && Number(p.numero) === poleNum
      );
      const isConfigured = pole && (pole.type_poteau || pole.proprietaire) && (
        /petit[\s_-]*jean|pj/i.test(pole.type_poteau || pole.proprietaire) ||
        /sbee/i.test(pole.type_poteau || pole.proprietaire)
      );
      if (!isConfigured) {
        setPoleConfigModal({ poleNum, actionAfter: "gallery" });
        return;
      }
    }
    targetPoleNumeroRef.current = poleNum;
    if (poleGalleryInputRef.current) {
      poleGalleryInputRef.current.value = "";
      poleGalleryInputRef.current.click();
    }
  }

  function handleConfirmPoleConfig(poleNum, selectedType, options, actionAfter = null) {
    const num = Number(poleNum);
    const normType = /petit[\s_-]*jean|pj/i.test(selectedType) ? "Petit Jean" : (/sbee/i.test(selectedType) ? "SBEE" : selectedType);
    const isSbee = normType === "SBEE";

    let isFat = false;
    let isImplante = false;
    let isArme = false;
    let isTraverse = true;

    if (typeof options === "string") {
      isFat = options === "fat";
      isImplante = options === "implante";
      isArme = isSbee && options === "arme";
      isTraverse = options === "traverse" || (!isFat && !isImplante && !isArme);
    } else if (options && typeof options === "object") {
      isFat = Boolean(options.fat);
      isImplante = Boolean(options.implante);
      isArme = isSbee && Boolean(options.arme);
      isTraverse = options.traverse !== undefined ? Boolean(options.traverse) : (!isFat && !isImplante && !isArme);
    }

    if (!isTraverse && !isImplante && !isArme && !isFat) {
      isTraverse = true;
    }

    const labels = [];
    if (isFat) labels.push("FAT");
    if (isTraverse) labels.push("Traversé");
    if (isImplante) labels.push("Implanté");
    if (isArme) labels.push("Armé");
    const sousType = labels.join(" + ") || "Traversé";

    const currentLatestData = dataRef.current || data;
    const list = [...(currentLatestData.points_gps || [])];
    const poleIdx = list.findIndex(
      (p) => p && p.type === "Poteau" && Number(p.numero) === num
    );

    let updatedPole;
    if (poleIdx >= 0) {
      updatedPole = {
        ...list[poleIdx],
        type_poteau: normType,
        proprietaire: normType,
        is_poteau_fat: isFat,
        implante: isImplante,
        arme: isArme,
        traverse: isTraverse,
        sous_type: sousType,
      };
      list[poleIdx] = updatedPole;
    } else {
      const wa = (whatsappPhotos || []).find((p) => p && p.slot === `poteau_${num}`);
      updatedPole = {
        id: wa?.id || crypto.randomUUID(),
        type: "Poteau",
        numero: num,
        type_poteau: normType,
        proprietaire: normType,
        is_poteau_fat: isFat,
        implante: isImplante,
        arme: isArme,
        traverse: isTraverse,
        sous_type: sousType,
        photo: wa?.url || "",
        lat: wa?.lat ?? null,
        lng: wa?.lng ?? null,
        precision_m: wa?.precision_m ?? null,
        lieu: wa?.lieu || "",
        horodatage: wa?.horodatage || new Date().toISOString(),
        ajoute_par: currentUser || "Technicien",
      };
      list.push(updatedPole);
    }

    const poleList = list.filter((p) => p && p.type === "Poteau");
    const nbTraverses = poleList.filter((p) => Boolean(p.traverse)).length;
    const nbImplantes = poleList.filter((p) => Boolean(p.implante)).length;
    const nbArmes = poleList.filter((p) => Boolean(p.arme) && /sbee/i.test(p.type_poteau || p.proprietaire || "")).length;

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
      if (!prev._crochets_manual) {
        const calc = calculateMaterials(next);
        next.materiel_pose = {
          ...(prev.materiel_pose || {}),
          crochets: calc.crochets,
        };
        markDirty("materiel_pose.crochets");
      }
      dataRef.current = next;
      saveInterventionLocally(next);
      return next;
    });

    flushServerSync().catch(() => {});

    setPoleConfigModal(null);
    setSaveStatus("✓ Configuration poteau enregistrée");

    if (actionAfter === "camera") {
      setTimeout(() => openPoleCamera(num, true), 120);
    } else if (actionAfter === "gallery") {
      setTimeout(() => openPoleGallery(num, true), 120);
    }
  }

  function handlePoleTypeChange(poleNum, newType) {
    const num = Number(poleNum);
    const normType = /petit[\s_-]*jean|pj/i.test(newType) ? "Petit Jean" : (/sbee/i.test(newType) ? "SBEE" : newType);
    const isSbee = normType === "SBEE";

    const currentLatestData = dataRef.current || data;
    const list = [...(currentLatestData.points_gps || [])];
    const poleIdx = list.findIndex(
      (p) => p && p.type === "Poteau" && Number(p.numero) === num
    );
    if (poleIdx < 0) return;

    const currentPole = list[poleIdx];
    const isArme = isSbee ? Boolean(currentPole.arme) : false; // Only SBEE can be armé!
    const isTraverse = currentPole.traverse !== undefined ? Boolean(currentPole.traverse) : true;
    const isImplante = Boolean(currentPole.implante);
    const isFat = Boolean(currentPole.is_poteau_fat);

    const labels = [];
    if (isFat) labels.push("FAT");
    if (isTraverse) labels.push("Traversé");
    if (isImplante) labels.push("Implanté");
    if (isArme) labels.push("Armé");
    const sousType = labels.join(" + ") || "Traversé";

    list[poleIdx] = {
      ...currentPole,
      type_poteau: normType,
      proprietaire: normType,
      arme: isArme,
      sous_type: sousType,
    };

    const poleList = list.filter((p) => p && p.type === "Poteau");
    const nbTraverses = poleList.filter((p) => Boolean(p.traverse)).length;
    const nbImplantes = poleList.filter((p) => Boolean(p.implante)).length;
    const nbArmes = poleList.filter((p) => Boolean(p.arme) && /sbee/i.test(p.type_poteau || p.proprietaire || "")).length;

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
      if (!prev._crochets_manual) {
        const calc = calculateMaterials(next);
        next.materiel_pose = {
          ...(prev.materiel_pose || {}),
          crochets: calc.crochets,
        };
        markDirty("materiel_pose.crochets");
      }
      dataRef.current = next;
      saveInterventionLocally(next);
      return next;
    });
    flushServerSync().catch(() => {});
  }

  function handlePoleSingleOptionChange(poleNum, optionKey) {
    const num = Number(poleNum);
    const currentLatestData = dataRef.current || data;
    const list = [...(currentLatestData.points_gps || [])];
    const poleIdx = list.findIndex(
      (p) => p && p.type === "Poteau" && Number(p.numero) === num
    );
    if (poleIdx < 0) return;

    const currentPole = list[poleIdx];
    const isSbee = /sbee/i.test(currentPole.type_poteau || currentPole.proprietaire || "");

    let isFat = Boolean(currentPole.is_poteau_fat);
    let isImplante = Boolean(currentPole.implante);
    let isArme = isSbee && Boolean(currentPole.arme);
    let isTraverse = currentPole.traverse !== undefined ? Boolean(currentPole.traverse) : true;

    if (optionKey === "traverse") {
      isTraverse = !isTraverse;
    } else if (optionKey === "implante") {
      isImplante = !isImplante;
    } else if (optionKey === "arme") {
      if (!isSbee) return; // Strict constraint: only SBEE can be armed
      isArme = !isArme;
    } else if (optionKey === "fat") {
      isFat = !isFat;
    }

    if (!isTraverse && !isImplante && !isArme && !isFat) {
      isTraverse = true;
    }

    const labels = [];
    if (isFat) labels.push("FAT");
    if (isTraverse) labels.push("Traversé");
    if (isImplante) labels.push("Implanté");
    if (isArme) labels.push("Armé");
    const sousType = labels.join(" + ") || "Traversé";

    list[poleIdx] = {
      ...currentPole,
      is_poteau_fat: isFat,
      implante: isImplante,
      arme: isArme,
      traverse: isTraverse,
      sous_type: sousType,
    };

    const poleList = list.filter((p) => p && p.type === "Poteau");
    const nbTraverses = poleList.filter((p) => Boolean(p.traverse)).length;
    const nbImplantes = poleList.filter((p) => Boolean(p.implante)).length;
    const nbArmes = poleList.filter((p) => Boolean(p.arme) && /sbee/i.test(p.type_poteau || p.proprietaire || "")).length;

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
      if (!prev._crochets_manual) {
        const calc = calculateMaterials(next);
        next.materiel_pose = {
          ...(prev.materiel_pose || {}),
          crochets: calc.crochets,
        };
        markDirty("materiel_pose.crochets");
      }
      dataRef.current = next;
      saveInterventionLocally(next);
      return next;
    });
    flushServerSync().catch(() => {});
  }
  const handlePoleOptionToggle = handlePoleSingleOptionChange;

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

    setSlotActionFeedback(`➕ Configuration Poteau ${nextNum} : Choisissez le Type puis l'Option`);
    setTimeout(() => setSlotActionFeedback(""), 4000);

    // Ouvre immédiatement la modale obligatoire séquentielle (Type -> Option -> Photo)
    // SANS créer de poteau vide dans points_gps tant que le type, l'option et la photo ne sont pas validés
    setPoleConfigModal({ poleNum: nextNum, isNew: true });
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
      let normVal = optionValue;
      if (/petit[\s_-]*jean|pj/i.test(optionValue)) normVal = "Petit Jean";
      else if (/sbee/i.test(optionValue)) normVal = "SBEE";
      updatedPole.type_poteau = normVal;
      updatedPole.proprietaire = normVal;
    }

    if (optionKey === "is_poteau_fat") {
      updatedPole.is_poteau_fat = Boolean(optionValue);
      if (updatedPole.is_poteau_fat) {
        updatedPole.sous_type = "Poteau FAT";
        updatedPole.traverse = false;
      } else {
        updatedPole.sous_type = updatedPole.implante ? "Implanté" : updatedPole.arme ? "Armé" : "Traversé";
        updatedPole.traverse = updatedPole.sous_type !== "Implanté";
      }
    } else {
      if (updatedPole.implante) updatedPole.sous_type = "Implanté";
      else if (updatedPole.arme) updatedPole.sous_type = "Armé";
      else if (updatedPole.traverse) updatedPole.sous_type = "Traversé";
      else if (updatedPole.is_poteau_fat) updatedPole.sous_type = "Poteau FAT";
      else updatedPole.sous_type = "Poteau";
    }

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
      if (!prev._crochets_manual) {
        const calc = calculateMaterials(next);
        next.materiel_pose = {
          ...(prev.materiel_pose || {}),
          crochets: calc.crochets,
        };
        markDirty("materiel_pose.crochets");
      }
      dataRef.current = next;
      saveInterventionLocally(next);
      return next;
    });

    flushServerSync().catch(() => {});
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

      const isSbee = /sbee/i.test(existingPole?.type_poteau || existingPole?.proprietaire || "");
      const isTraverse = existingPole ? (existingPole.traverse !== undefined ? Boolean(existingPole.traverse) : (existingPole.sous_type !== "Implanté")) : true;
      const isImplante = existingPole ? Boolean(existingPole.implante || (!existingPole.traverse && existingPole.sous_type === "Implanté")) : false;
      const isArme = isSbee && (existingPole ? Boolean(existingPole.arme || (!existingPole.traverse && existingPole.sous_type === "Armé")) : false);
      const isFat = Boolean(existingPole?.is_poteau_fat || String(existingPole?.sous_type || "").toLowerCase().includes("fat"));

      const labels = [];
      if (isFat) labels.push("FAT");
      if (isTraverse) labels.push("Traversé");
      if (isImplante) labels.push("Implanté");
      if (isArme) labels.push("Armé");
      const sousType = existingPole?.sous_type || labels.join(" + ") || "Traversé";

      const updatedPoint = {
        ...(existingPole || {}),
        id: existingPole?.id || crypto.randomUUID(),
        type: "Poteau",
        numero: Number(poleNum),
        traverse: isTraverse,
        implante: isImplante,
        arme: isArme,
        is_poteau_fat: isFat,
        type_poteau: existingPole?.type_poteau || existingPole?.proprietaire || "",
        proprietaire: existingPole?.type_poteau || existingPole?.proprietaire || "",
        sous_type: sousType,
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
      const nbTraverses = poleList.filter((p) => Boolean(p.traverse)).length;
      const nbImplantes = poleList.filter((p) => Boolean(p.implante)).length;
      const nbArmes = poleList.filter((p) => Boolean(p.arme) && /sbee/i.test(p.type_poteau || p.proprietaire || "")).length;

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
      flushServerSync().catch(() => {});
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
    const nbTraverses = remainingPoles.filter((p) => Boolean(p.traverse)).length;
    const nbImplantes = remainingPoles.filter((p) => Boolean(p.implante)).length;
    const nbArmes = remainingPoles.filter((p) => Boolean(p.arme) && /sbee/i.test(p.type_poteau || p.proprietaire || "")).length;

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
      if (!prev._crochets_manual) {
        const calc = calculateMaterials(next);
        next.materiel_pose = {
          ...(prev.materiel_pose || {}),
          crochets: calc.crochets,
        };
        markDirty("materiel_pose.crochets");
      }
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
    setWhatsappStatus("Géolocalisation et enregistrement de la photo additionnelle…");
    try {
      const photoDataUrl = await readFileAsDataUrl(file);
      if (e.target) e.target.value = "";

      const posResult = await acquireBestPosition(file);
      const lat = posResult?.lat ?? null;
      const lng = posResult?.lng ?? null;
      const precision_m = posResult?.precision_m ?? null;
      const horodatage = new Date().toISOString();

      let lieu = "";
      if (lat != null && lng != null) {
        setWhatsappStatus("Recherche de l'adresse…");
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
            precision_m: precision_m || 10,
            horodatage,
            warning: posResult?.warning,
          });
        } catch (embedErr) {
          console.warn("Erreur incrustation GPS:", embedErr);
        }
      }

      const photoId = crypto.randomUUID();
      const newPhoto = {
        id: photoId,
        url: embeddedPhoto,
        lat,
        lng,
        precision_m,
        horodatage,
        lieu,
        added: new Date().toISOString(),
        label: "Photo additionnelle",
        type: "additionnelle",
        slot: `additionnelle_${photoId}`,
        additionnelle: true,
        is_additionnelle: true,
        exclude_celpros: true,
      };

      deletedWhatsappPhotoIdsRef.current.delete(photoId);
      deletedWhatsappPhotoIdsRef.current.delete("additionnelle");
      deletedWhatsappPhotoIdsRef.current.delete("slot_additionnelle");

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

  // ===== Handlers du module Vidéo Terrain =====
  const handlePromptRetakeVideo = (video) => {
    if (!video) return;
    setRetakeTargetVideo(video);
  };

  const handleVideoFileChange = async (e, source = "camera") => {
    const rawFiles = Array.from(e.target.files || []);
    e.target.value = "";
    if (rawFiles.length === 0) return;

    const isImported = source === "gallery";
    const replaceTarget = videoTargetReplaceRef.current;
    videoTargetReplaceRef.current = null;

    // Détermination immédiate des coordonnées initiales disponibles (0ms)
    const currentLatestData = dataRef.current || data;
    const fallbackBaseCoords = {
      lat: currentLatestData.latitude || (Array.isArray(currentLatestData.points_gps) ? currentLatestData.points_gps.find((p) => p?.lat != null)?.lat : null) || currentLatestData.latitude_fat || null,
      lng: currentLatestData.longitude || (Array.isArray(currentLatestData.points_gps) ? currentLatestData.points_gps.find((p) => p?.lng != null)?.lng : null) || currentLatestData.longitude_fat || null,
      precision_m: 15,
    };

    const initialLat = fallbackBaseCoords.lat;
    const initialLng = fallbackBaseCoords.lng;
    const initialPrecision = fallbackBaseCoords.precision_m;
    let lieu = [currentLatestData.adresse_zone, currentLatestData.quartier, currentLatestData.ville].filter(Boolean).join(", ");
    const clientName = currentLatestData.nom_client || currentLatestData.nom_dossier || "Client";
    const horodatage = new Date().toISOString();

    const uploadTask = (async () => {
      // --- CAS A : REPRISE / REMPLACEMENT D'UNE VIDÉO EXISTANTE ---
      if (replaceTarget) {
        const file = rawFiles[0];
        const localUrl = URL.createObjectURL(file);
        const replaceIndex = (videosTerrainRef.current || []).findIndex((v) => v.id === replaceTarget.id);

        const updatedTargetVideo = {
          ...replaceTarget,
          url: localUrl,
          thumbnail_url: "",
          duration: 0,
          size: file.size,
          original_size: file.size,
          ratio: "100%",
          captured_at: horodatage,
          cree_le: horodatage,
          ajoute_par: currentUser || currentLatestData.nom_technicien || "",
          status: "uploading",
          is_imported: isImported,
          source,
        };

        let nextVideos = [...(videosTerrainRef.current || [])];
        if (replaceIndex >= 0) {
          nextVideos[replaceIndex] = updatedTargetVideo;
        } else {
          nextVideos = [...nextVideos, updatedTargetVideo];
        }

        setVideosTerrain(nextVideos);
        videosTerrainRef.current = nextVideos;
        setVideoStatus(`⏳ Envoi de la vidéo reprise au serveur…`);
        setVideoProcessing(true);
        setVideoProgress({ pct: 15, msg: `Préparation et envoi de la vidéo…` });

        try {
          let posResult = null;
          if (!isImported) {
            try {
              posResult = await acquireBestPosition(file, fallbackBaseCoords);
            } catch (gpsErr) {
              console.warn("Échec acquireBestPosition vidéo reprise:", gpsErr);
            }
          }

          const activeLat = posResult?.lat ?? replaceTarget.lat ?? initialLat;
          const activeLng = posResult?.lng ?? replaceTarget.lng ?? initialLng;
          const activePrecision = posResult?.precision_m ?? replaceTarget.precision_m ?? initialPrecision;

          if (!lieu && activeLat != null && activeLng != null) {
            try {
              const zoneInfo = await reverseGeocodeZone(activeLat, activeLng);
              if (zoneInfo?.label) lieu = zoneInfo.label;
            } catch {}
          }

          const bannerInfo = {
            client: updatedTargetVideo.nom_client,
            type: updatedTargetVideo.label,
            lieu: lieu || updatedTargetVideo.lieu,
            lat: activeLat,
            lng: activeLng,
            precision_m: activePrecision || 10,
            horodatage,
            technicien: updatedTargetVideo.ajoute_par,
          };

          let fileToUpload = file;
          let thumbUrl = "";
          let dur = 0;
          let compSize = file.size;
          let isStamped = false;

          // Extraction ultra-rapide (< 0.4s) de la miniature et de la durée
          try {
            const thumbResult = await generateVideoThumbnail(file, 0.3, isImported ? null : bannerInfo);
            thumbUrl = thumbResult?.thumbnailDataUrl || "";
            dur = thumbResult?.duration || 0;
          } catch {}

          // Compression lente uniquement si la vidéo dépasse 25 Mo (évite 30s de lecture temps-réel bloquante avant l'upload)
          if (file.size > 25 * 1024 * 1024) {
            try {
              const compResult = await compressVideo(file, {
                bannerInfo: isImported ? null : bannerInfo,
                onProgress: (pct, msg) => {
                  setVideoProgress({ pct: Math.min(80, 15 + Math.round(pct * 0.65)), msg });
                },
              });

              if (compResult && compResult.blob && compResult.blob.size > 25 * 1024) {
                const ext = compResult.extension || (file.name ? file.name.split(".").pop() : "mp4");
                const baseName = (file.name || `video_${Date.now()}`).replace(/\.[^/.]+$/, "");
                fileToUpload = new File([compResult.blob], `${baseName}.${ext}`, {
                  type: compResult.blob.type || "video/mp4",
                });
                thumbUrl = compResult.thumbnailDataUrl || thumbUrl;
                dur = compResult.duration || dur;
                compSize = compResult.compressedSize || fileToUpload.size;
                isStamped = Boolean(compResult.stamped);
              }
            } catch (compErr) {
              console.warn("Échec compression vidéo reprise:", compErr);
            }
          }

          setVideoProgress({ pct: 85, msg: `Téléversement vers le serveur…` });

          // Suppression de l'ancienne vidéo du serveur si elle y existait
          if (replaceTarget.id && !replaceTarget.id.startsWith("vid_")) {
            try {
              await deleteInterventionMedia(replaceTarget.id);
            } catch (delErr) {
              console.warn("Suppression ancien média lors de reprise:", delErr);
            }
          }

          // Upload serveur immédiat
          const uploaded = await uploadInterventionMedia({
            interventionId: data.id,
            type: "video",
            file: fileToUpload,
            latitude: activeLat,
            longitude: activeLng,
            precisionM: activePrecision,
            capturedAt: horodatage,
            thumbnailBase64: thumbUrl,
            duration: dur,
            label: updatedTargetVideo.label,
            isImported,
            source,
          });

          const finalVideo = {
            ...updatedTargetVideo,
            id: uploaded?.id || replaceTarget.id,
            url: uploaded?.url || localUrl,
            thumbnail_url: uploaded?.thumbnail_url || thumbUrl || "",
            size: compSize,
            duration: dur,
            lat: activeLat,
            lng: activeLng,
            precision_m: activePrecision,
            lieu: lieu || updatedTargetVideo.lieu,
            status: uploaded?.url ? "synced" : "error",
            has_banner: !isImported && isStamped,
            stamped: isStamped,
          };

          setVideosTerrain((prev) => {
            const next = prev.map((v) => (v.id === replaceTarget.id || v.id === updatedTargetVideo.id ? finalVideo : v));
            videosTerrainRef.current = next;
            update("videos_terrain", next);
            saveInterventionLocally({ ...dataRef.current, videos_terrain: next, _fully_loaded: true });
            return next;
          });

          if (activeViewingVideo?.id === replaceTarget.id) {
            setActiveViewingVideo(finalVideo);
          }

          flushServerSync().catch(() => {});
          setVideoStatus("✅ Vidéo synchronisée avec toute l'équipe !");
          setTimeout(() => setVideoStatus(""), 5000);
        } catch (err) {
          console.warn("Erreur pipeline reprise vidéo:", err);
          setVideoStatus(`⚠️ Échec d'envoi vidéo (${err?.message || "réseau"}).`);
        } finally {
          setVideoProcessing(false);
          setVideoProgress({ pct: 0, msg: "" });
        }
        return;
      }

      // --- CAS B : AJOUT NORMAL DE NOUVELLE(S) VIDÉO(S) ---
      const baseCount = (videosTerrainRef.current || []).length;
      const newItemsWithFiles = rawFiles.map((file, idx) => {
        const videoNum = baseCount + idx + 1;
        const localId = "vid_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        const localUrl = URL.createObjectURL(file);
        return {
          file,
          video: {
            id: localId,
            url: localUrl,
            thumbnail_url: "",
            label: `Vidéo Terrain #${videoNum} - ${clientName}`,
            nom_client: clientName,
            lieu: lieu || "",
            duration: 0,
            size: file.size,
            original_size: file.size,
            ratio: "100%",
            lat: initialLat,
            lng: initialLng,
            precision_m: initialPrecision,
            cree_le: horodatage,
            captured_at: horodatage,
            ajoute_par: currentUser || currentLatestData.nom_technicien || "",
            status: "uploading",
            is_imported: isImported,
            source: source,
          },
        };
      });

      const immediateNewVideos = newItemsWithFiles.map((item) => item.video);
      const updatedVideos = [...(videosTerrainRef.current || []), ...immediateNewVideos];
      setVideosTerrain(updatedVideos);
      videosTerrainRef.current = updatedVideos;
      // Ne pas appeler update("videos_terrain") tant que l'URL est un blob: local, pour éviter d'envoyer un blob: au serveur
      setVideoStatus(`⏳ Envoi de ${rawFiles.length} vidéo(s) au serveur pour toute l'équipe…`);
      setVideoProcessing(true);
      setVideoProgress({ pct: 20, msg: `Préparation et envoi au serveur…` });

      try {
        let posResult = null;
        if (!isImported) {
          try {
            posResult = await acquireBestPosition(rawFiles[0], fallbackBaseCoords);
          } catch (gpsErr) {
            console.warn("Échec acquireBestPosition vidéo:", gpsErr);
          }
        }

        const activeLat = posResult?.lat ?? initialLat;
        const activeLng = posResult?.lng ?? initialLng;
        const activePrecision = posResult?.precision_m ?? initialPrecision;

        if (!lieu && activeLat != null && activeLng != null) {
          try {
            const zoneInfo = await reverseGeocodeZone(activeLat, activeLng);
            if (zoneInfo?.label) {
              lieu = zoneInfo.label;
            }
          } catch {}
        }

        if (activeLat != null && activeLng != null) {
          if (!currentLatestData.latitude) update("latitude", activeLat);
          if (!currentLatestData.longitude) update("longitude", activeLng);
        }

        let syncedCount = 0;
        for (let i = 0; i < newItemsWithFiles.length; i++) {
          const { file, video } = newItemsWithFiles[i];
          video.lat = activeLat;
          video.lng = activeLng;
          video.precision_m = activePrecision;
          if (lieu) video.lieu = lieu;

          const bannerInfo = {
            client: video.nom_client,
            type: video.label,
            lieu: video.lieu,
            lat: video.lat,
            lng: video.lng,
            precision_m: video.precision_m || 10,
            horodatage: video.captured_at,
            technicien: video.ajoute_par,
          };

          let fileToUpload = file;
          let thumbUrl = "";
          let dur = 0;
          let compSize = file.size;
          let isStamped = false;

          // 1. Extraction immédiate (< 0.4s) de la miniature et durée
          try {
            const thumbResult = await generateVideoThumbnail(file, 0.3, isImported ? null : bannerInfo);
            thumbUrl = thumbResult?.thumbnailDataUrl || "";
            dur = thumbResult?.duration || 0;
          } catch {}

          // 2. Compression uniquement si la vidéo dépasse 25 Mo (évite l'attente de lecture 1x de 20-30s avant upload !)
          if (file.size > 25 * 1024 * 1024) {
            try {
              const compResult = await compressVideo(file, {
                bannerInfo: isImported ? null : bannerInfo,
                onProgress: (pct, msg) => {
                  setVideoProgress({
                    pct: Math.min(80, 20 + Math.round(pct * 0.6)),
                    msg,
                  });
                },
              });

              if (compResult && compResult.blob && compResult.blob.size > 25 * 1024) {
                const ext = compResult.extension || (file.name ? file.name.split(".").pop() : "mp4");
                const baseName = (file.name || `video_${Date.now()}`).replace(/\.[^/.]+$/, "");
                fileToUpload = new File([compResult.blob], `${baseName}.${ext}`, {
                  type: compResult.blob.type || "video/mp4",
                });
                thumbUrl = compResult.thumbnailDataUrl || thumbUrl;
                dur = compResult.duration || dur;
                compSize = compResult.compressedSize || fileToUpload.size;
                isStamped = Boolean(compResult.stamped);
              }
            } catch (compErr) {
              console.warn("Échec compression vidéo:", compErr);
            }
          }

          setVideoProgress({
            pct: 80 + Math.round(((i + 0.5) / newItemsWithFiles.length) * 18),
            msg: `Envoi serveur vidéo #${i + 1} (${formatFileSize(fileToUpload.size)})…`,
          });

          try {
            const uploaded = await uploadInterventionMedia({
              interventionId: data.id,
              type: "video",
              file: fileToUpload,
              latitude: video.lat,
              longitude: video.lng,
              precisionM: video.precision_m,
              capturedAt: video.captured_at,
              thumbnailBase64: thumbUrl,
              duration: dur,
              label: video.label,
              isImported,
              source,
            });

            if (uploaded && uploaded.url) {
              syncedCount++;
              setVideosTerrain((prev) => {
                const next = prev.map((v) =>
                  v.id === video.id
                    ? {
                        ...v,
                        id: uploaded.id || v.id,
                        url: uploaded.url,
                        thumbnail_url: uploaded.thumbnail_url || thumbUrl || v.thumbnail_url,
                        duration: dur || v.duration,
                        lat: activeLat,
                        lng: activeLng,
                        precision_m: activePrecision,
                        lieu: lieu || v.lieu,
                        status: "synced",
                        size: compSize,
                        has_banner: !isImported && isStamped,
                        stamped: isStamped,
                      }
                    : v
                );
                videosTerrainRef.current = next;
                update("videos_terrain", next);
                saveInterventionLocally({ ...dataRef.current, videos_terrain: next, _fully_loaded: true });
                return next;
              });
            }
          } catch (uploadErr) {
            console.warn("Upload distant vidéo échoué:", uploadErr);
            setVideosTerrain((prev) => {
              const next = prev.map((v) =>
                v.id === video.id ? { ...v, status: "error", thumbnail_url: thumbUrl || v.thumbnail_url, duration: dur || v.duration } : v
              );
              videosTerrainRef.current = next;
              return next;
            });
          }
        }

        flushServerSync().catch(() => {});
        if (syncedCount === rawFiles.length) {
          setVideoStatus(`✅ ${syncedCount} vidéo(s) terrain synchronisée(s) avec toute l'équipe !`);
        } else {
          setVideoStatus(`⚠️ ${syncedCount}/${rawFiles.length} vidéo(s) synchronisée(s). Vérifiez le réseau pour les vidéos en attente.`);
        }
        setTimeout(() => setVideoStatus(""), 7000);
      } catch (err) {
        console.warn("Erreur pipeline vidéo arrière-plan:", err);
      } finally {
        setVideoProcessing(false);
        setVideoProgress({ pct: 0, msg: "" });
      }
    })();

    activeVideoUploadsRef.current.add(uploadTask);
    uploadTask.finally(() => activeVideoUploadsRef.current.delete(uploadTask));
  };

  const handleDeleteVideo = async (videoToDelete) => {
    if (!videoToDelete) return;
    const vidIdStr = String(videoToDelete.id || "");
    if (vidIdStr) {
      deletedVideoIdsRef.current.add(vidIdStr);
    }
    markDirty("videos_terrain");
    const nextVideos = (videosTerrainRef.current || []).filter((v) => String(v.id) !== vidIdStr);
    setVideosTerrain(nextVideos);
    videosTerrainRef.current = nextVideos;
    update("videos_terrain", nextVideos);

    const localPayload = {
      ...dataRef.current,
      videos_terrain: nextVideos,
      _deleted_video_ids: Array.from(deletedVideoIdsRef.current),
      deleted_videos: Array.from(deletedVideoIdsRef.current),
      _fully_loaded: true
    };
    saveInterventionLocally(localPayload);

    if (activeViewingVideo && String(activeViewingVideo.id) === vidIdStr) {
      setActiveViewingVideo(null);
    }

    try {
      if (vidIdStr && !vidIdStr.startsWith("vid_")) {
        await deleteInterventionMedia(vidIdStr);
      }
    } catch (err) {
      console.warn("Échec suppression distante média:", err);
    }

    flushServerSync().catch(() => {});
    setVideoStatus("✓ Vidéo supprimée avec succès.");
    setTimeout(() => setVideoStatus(""), 4000);
  };

  const openVideoCamera = () => {
    if (videoCameraInputRef.current) {
      videoCameraInputRef.current.value = "";
      videoCameraInputRef.current.click();
    }
  };

  const openVideoGallery = () => {
    if (videoGalleryInputRef.current) {
      videoGalleryInputRef.current.value = "";
      videoGalleryInputRef.current.click();
    }
  };

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
    setWhatsappStatus("Préparation du dossier de photos…");
    try {
      const res = await downloadAllPhotosAsZip(selected, data.nom_client, {
        interventionId: data.id,
        videos: videosTerrain || [],
        onProgress: (_curr, _tot, msg) => setWhatsappStatus(msg),
      });
      setWhatsappStatus(`✓ Dossier '${res.folderName}' (${res.count} photos) téléchargé dans vos Téléchargements !`);
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
      if (activeVideoUploadsRef.current.size > 0) {
        setSaveStatus("⏳ Envoi des vidéos en cours avant clôture…");
        try {
          await Promise.allSettled([...activeVideoUploadsRef.current]);
        } catch {}
      }
      const dirtySnapshot = new Set([...dirtyFieldsRef.current, "statut", "whatsapp_photos", "points_gps", "videos_terrain"]);
      markDirty("statut");
      const cleanVideos = (videosTerrainRef.current || []).filter((v) => v && (!v.url || !String(v.url).startsWith("blob:")));
      const finalData = {
        ...dataRef.current,
        statut: "termine",
        whatsapp_photos: whatsappPhotosRef.current,
        videos_terrain: cleanVideos,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
        changed_fields: [...dirtySnapshot, "modifie_par", "modifie_le"],
        deleted_points: [...deletedGpsPointIdsRef.current],
        deleted_whatsapp_photos: [...deletedWhatsappPhotoIdsRef.current],
        deleted_videos: [...deletedVideoIdsRef.current],
        _deleted_video_ids: [...deletedVideoIdsRef.current],
        _fully_loaded: true,
      };
      // 1. Sauvegarde locale instantanée garantie à 100% (hors-ligne ou réseau lent)
      saveInterventionLocally(finalData);
      setData(finalData);
      dataRef.current = finalData;

      let completeData = finalData;
      // 2. Synchronisation serveur
      try {
        saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(() => saveIntervention(finalData));
        const saved = await saveQueueRef.current;
        if (saved) {
          completeData = {
            ...finalData,
            ...(saved.updated_at ? { updated_at: saved.updated_at, modifie_le: saved.updated_at } : {}),
            ...(Array.isArray(saved.whatsapp_photos) ? { whatsapp_photos: saved.whatsapp_photos } : {}),
            ...(Array.isArray(saved.points_gps) ? { points_gps: saved.points_gps } : {}),
            ...(Array.isArray(saved.videos_terrain) ? { videos_terrain: saved.videos_terrain } : {}),
          };
          setData(completeData);
          dataRef.current = completeData;
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
          {typeof onOpenReport === "function" && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onOpenReport(dataRef.current || data)}
              title="Consulter et générer les rapports d'intervention"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "#f0fdf4",
                borderColor: "#86efac",
                color: "#166534",
                fontWeight: 700,
              }}
            >
              <IconFileText size={14} />
              <span>Rapports</span>
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={handleClose}>
            Retour
          </button>
        </div>
      </header>

      {data.tournee_du_jour && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#eff6ff",
          border: "1.5px solid #bfdbfe",
          borderRadius: 10,
          padding: "8px 14px",
          margin: "8px 0 12px",
          flexWrap: "wrap",
          gap: 8,
          fontSize: 13
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16 }}>🚗</span>
            <span style={{ fontWeight: 700, color: "#1e40af" }}>
              Tournée #{data.tournee_ordre || 1} • {data.tournee_du_jour}
            </span>
            {data.tournee_verrouille ? (
              <span style={{ background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                🔒 En attente
              </span>
            ) : (
              <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                ⚡ En cours
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600 }}
            onClick={() => handleClose("tournee")}
          >
            🚗 Revenir à la tournée
          </button>
        </div>
      )}

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

      <Tabs
        tabs={TABS.filter((t) => !t.hidden).map((t) => {
          if (t.id === "photos") {
            const vCount = (videosTerrain || []).length;
            return {
              ...t,
              label: vCount > 0 ? `📸 Photos & Vidéos (${vCount})` : "📸 Photos & Vidéos",
            };
          }
          return t;
        })}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

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
      <input
        ref={videoCameraInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => handleVideoFileChange(e, "camera")}
      />
      <input
        ref={videoGalleryInputRef}
        type="file"
        accept="video/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleVideoFileChange(e, "gallery")}
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
                    update("ont_sn", v);
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

            {/* Carte Tests de Débit (Wi-Fi) */}
            <div className="form-card">
              <div className="form-card-header">
                <div className="form-card-icon speed-icon">📶</div>
                <div>
                  <h3>Tests de débit (Wi-Fi)</h3>
                  <p className="form-card-sub">Extrait automatiquement de la capture de test débit ou saisie manuelle</p>
                </div>
              </div>
              <div className="form-card-body">
                <div className="form-row-3">
                  <TextField
                    label="Débit descendant (Mb/s)"
                    placeholder="Ex: 48.26"
                    value={data.debit_descendant || ""}
                    onChange={(v) => update("debit_descendant", v)}
                    onBlur={flushServerSync}
                  />
                  <TextField
                    label="Débit montant (Mb/s)"
                    placeholder="Ex: 9.504"
                    value={data.debit_montant || ""}
                    onChange={(v) => update("debit_montant", v)}
                    onBlur={flushServerSync}
                  />
                  <TextField
                    label="Ping / Latence (ms)"
                    placeholder="Ex: 18.99"
                    value={data.debit_ping || ""}
                    onChange={(v) => update("debit_ping", v)}
                    onBlur={flushServerSync}
                  />
                </div>
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

                {(() => {
                  const poleMap = new Map();
                  (data.points_gps || []).forEach((pt) => {
                    if (pt && (pt.type === "Poteau" || String(pt.type || "").toLowerCase().includes("poteau")) && Number(pt.numero) > 0) {
                      poleMap.set(Number(pt.numero), { ...pt });
                    }
                  });
                  (whatsappPhotos || []).forEach((wa) => {
                    const m = wa?.slot?.match(/^poteau_(\d+)$/);
                    if (m) {
                      const num = Number(m[1]);
                      const existing = poleMap.get(num) || { id: wa.id, numero: num, type: "Poteau" };
                      if (!existing.photo && wa.url) existing.photo = wa.url;
                      poleMap.set(num, existing);
                    }
                  });
                  const poleList = Array.from(poleMap.values()).sort((a, b) => Number(a.numero) - Number(b.numero));
                  if (poleList.length === 0) return null;

                  return (
                    <div style={{ marginTop: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#334155" }}>
                          🪵 Photos des poteaux enregistrés ({poleList.length})
                        </span>
                        <button
                          type="button"
                          className="btn-slot-subtle"
                          style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: "#f0f9ff", border: "1px solid #bae6fd", color: "#0284c7", borderRadius: 6, cursor: "pointer" }}
                          onClick={() => setActiveTab("photos")}
                        >
                          📸 Gérer dans l'onglet Photos →
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(95px, 1fr))", gap: 8 }}>
                        {poleList.map((pole) => {
                          const wa = (whatsappPhotos || []).find((p) => p && p.slot === `poteau_${pole.numero}`);
                          const photoUrl = wa?.url || pole.photo;
                          return (
                            <div
                              key={pole.numero}
                              style={{
                                borderRadius: 8,
                                overflow: "hidden",
                                border: photoUrl ? "1.5px solid #0284c7" : "1px dashed #cbd5e1",
                                background: "#fff",
                                textAlign: "center",
                                cursor: photoUrl ? "pointer" : "default",
                              }}
                              onClick={() => {
                                if (photoUrl) {
                                  setViewingPhoto({
                                    url: photoUrl,
                                    title: `Poteau ${pole.numero}`,
                                    subtitle: pole.lieu || (pole.lat ? `${Number(pole.lat).toFixed(5)}, ${Number(pole.lng).toFixed(5)}` : ""),
                                  });
                                } else {
                                  setActiveTab("photos");
                                }
                              }}
                            >
                              {photoUrl ? (
                                <img
                                  src={photoUrl}
                                  alt={`Poteau ${pole.numero}`}
                                  style={{ width: "100%", height: 75, objectFit: "cover", display: "block" }}
                                />
                              ) : (
                                <div style={{ height: 75, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", color: "#94a3b8", fontSize: 11 }}>
                                  Sans photo
                                </div>
                              )}
                              <div style={{ padding: "3px 4px", fontSize: 11, fontWeight: 700, color: "#0369a1", background: "#f0f9ff" }}>
                                Poteau #{pole.numero} {pole.lat != null || wa?.lat != null ? "📍" : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <h4 style={{ margin: "16px 0 10px", fontSize: 14 }}>Matériel standard</h4>
                {(() => {
                  const materialsCalc = calculateMaterials(data);
                  return (
                    <>
                      <div className="materiel-grid">
                        {MATERIEL_STANDARD.filter((m) => !m.hidden).map(({ key, label }) => {
                          const isCrochets = key === "crochets";
                          const isManualCrochets = isCrochets && Boolean(data._crochets_manual);
                          const val = data.materiel_pose[key] ?? (isCrochets ? materialsCalc.crochets : 0);

                          return (
                            <div
                              key={key}
                              className="materiel-card-stepper"
                              style={isCrochets ? { border: isManualCrochets ? "1.5px solid #f59e0b" : "1.5px solid #0284c7" } : {}}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 4 }}>
                                <span className="materiel-label">{label}</span>
                                {isCrochets && (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: isManualCrochets ? "#fef3c7" : "#e0f2fe", color: isManualCrochets ? "#b45309" : "#0369a1" }}>
                                    {isManualCrochets ? "Manuel" : "Auto"}
                                  </span>
                                )}
                              </div>
                              <div className="stepper-controls">
                                <button
                                  type="button"
                                  className="btn-step"
                                  onClick={() => updateMateriel(key, Math.max(0, (Number(val) || 0) - 1))}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={val}
                                  onChange={(e) => updateMateriel(key, Math.max(0, Number(e.target.value) || 0))}
                                />
                                <button
                                  type="button"
                                  className="btn-step"
                                  onClick={() => updateMateriel(key, (Number(val) || 0) + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {data._crochets_manual ? (
                        <div style={{ margin: "8px 0 14px", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <span>⚠️ Nombre de crochets modifié manuellement (<strong>{data.materiel_pose?.crochets}</strong>). Calcul suggéré : <strong>{materialsCalc.crochets}</strong> ({materialsCalc.formula}).</span>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                            onClick={resetCrochetsToAuto}
                          >
                            🔄 Rétablir calcul auto
                          </button>
                        </div>
                      ) : (
                        <p style={{ margin: "6px 0 14px", fontSize: 11, color: "var(--text-muted)" }}>
                          💡 Calcul automatique : <strong>{materialsCalc.formula}</strong> (Poteau lin. = 2 crochets, Poteau FAT = 1 crochet, Piton = 1 crochet • PTO : 1, ONT : 1 par défaut). Modifiable manuellement à tout moment.
                        </p>
                      )}
                    </>
                  );
                })()}

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
                    {(() => {
                      const visibleSlots = CELPROS_PHOTO_SLOTS.filter((s) => !s.hidden && !s.optional);
                      const readyCount = visibleSlots.filter((s) => {
                        if (s.key === "contrat_client") {
                          return (whatsappPhotos || []).some(
                            (p) => p && !p.additionnelle && !p.is_additionnelle && !p.exclude_celpros && (p.slot === "contrat_client" || p.slot?.startsWith("contrat_client") || p.type === "contrat_client")
                          );
                        }
                        return !!getPhotoForSlot(s.key)?.url;
                      }).length;
                      return `${readyCount} sur ${visibleSlots.length} photos obligatoires prêtes pour CelPros`;
                    })()}
                    {(() => {
                      const count = (whatsappPhotos || []).filter(
                        (p) => p && !p.additionnelle && !p.is_additionnelle && !p.exclude_celpros && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau")
                      ).length;
                      return count > 0 ? ` (+ ${count} Autre poteau)` : "";
                    })()}
                  </p>
                </div>
                <div className="photos-progress-percent">
                  {(() => {
                    const visibleSlots = CELPROS_PHOTO_SLOTS.filter((s) => !s.hidden && !s.optional);
                    const readyCount = visibleSlots.filter((s) => {
                      if (s.key === "contrat_client") {
                        return (whatsappPhotos || []).some(
                          (p) => p && !p.additionnelle && !p.is_additionnelle && !p.exclude_celpros && (p.slot === "contrat_client" || p.slot?.startsWith("contrat_client") || p.type === "contrat_client")
                        );
                      }
                      return !!getPhotoForSlot(s.key)?.url;
                    }).length;
                    return `${Math.round((readyCount / Math.max(1, visibleSlots.length)) * 100)}%`;
                  })()}
                </div>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: (() => {
                      const visibleSlots = CELPROS_PHOTO_SLOTS.filter((s) => !s.hidden && !s.optional);
                      const readyCount = visibleSlots.filter((s) => {
                        if (s.key === "contrat_client") {
                          return (whatsappPhotos || []).some(
                            (p) => p && !p.additionnelle && !p.is_additionnelle && !p.exclude_celpros && (p.slot === "contrat_client" || p.slot?.startsWith("contrat_client") || p.type === "contrat_client")
                          );
                        }
                        return !!getPhotoForSlot(s.key)?.url;
                      }).length;
                      return `${(readyCount / Math.max(1, visibleSlots.length)) * 100}%`;
                    })()
                  }}
                />
              </div>
              {slotActionFeedback && (
                <p className="slot-feedback-hint">{slotActionFeedback}</p>
              )}
            </div>

            <div className="celpros-photos-grid">
              {CELPROS_PHOTO_SLOTS.filter((s) => !s.hidden).map((slot) => {
                const isAutrePoteau = slot.key === "autre_poteau";
                const isContratClient = slot.key === "contrat_client";
                const isMultiSlot = isAutrePoteau || isContratClient;

                const autrePhotos = isAutrePoteau
                  ? (whatsappPhotos || []).filter(
                      (p) => p && !p.additionnelle && !p.is_additionnelle && !p.exclude_celpros && (p.slot === "autre_poteau" || p.slot?.startsWith("autre_poteau") || p.type === "autre_poteau")
                    )
                  : [];
                const contratPhotos = isContratClient
                  ? (whatsappPhotos || []).filter(
                      (p) => p && !p.additionnelle && !p.is_additionnelle && !p.exclude_celpros && (p.slot === "contrat_client" || p.slot?.startsWith("contrat_client") || p.type === "contrat_client")
                    )
                  : [];
                const multiPhotos = isAutrePoteau ? autrePhotos : contratPhotos;

                const photo = isMultiSlot ? (multiPhotos[0] || null) : getPhotoForSlot(slot.key);
                const isTaken = isMultiSlot ? multiPhotos.length > 0 : !!photo?.url;

                return (
                  <div key={slot.key} className={`photo-slot-card ${isTaken ? "taken" : "pending"} ${isAutrePoteau ? "autre-poteau-card" : ""} ${isContratClient ? "contrat-client-card" : ""}`}>
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
                        {isContratClient && (
                          <div style={{ marginTop: 3, fontSize: 11, color: "#0284c7", fontWeight: 600 }}>
                            ℹ️ 2 contrats clients autorisés (signés) • Transférés sur CelPros • Bande masquée pour lisibilité
                          </div>
                        )}
                      </div>
                      <span
                        className={`photo-slot-badge ${isTaken ? "badge-success" : (slot.optional ? "badge-optional" : "badge-pending")}`}
                        style={slot.optional && !isTaken ? { background: "#f1f5f9", color: "#64748b" } : {}}
                      >
                        {isAutrePoteau
                          ? (isTaken ? `✓ ${autrePhotos.length} photo${autrePhotos.length > 1 ? "s" : ""}` : "Optionnel")
                          : isContratClient
                          ? (isTaken ? `✓ ${contratPhotos.length}/2 contrat${contratPhotos.length > 1 ? "s" : ""}` : "Obligatoire")
                          : (isTaken ? "✓ Prête" : (slot.optional ? "Optionnel" : "En attente"))}
                      </span>
                    </div>

                    {isTaken ? (
                      isMultiSlot ? (
                        <div className={`photo-slot-preview-box ${isAutrePoteau ? "autre-poteau-multi-box" : "contrat-multi-box"}`}>
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
                            {multiPhotos.map((ap, apIdx) => (
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
                                  alt={isContratClient ? `Contrat ${apIdx + 1}` : `Autre poteau ${apIdx + 1}`}
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
                                      title: isContratClient ? `Photo contrat client #${apIdx + 1}` : `Autre poteau #${apIdx + 1}`,
                                      subtitle: ap.lieu || (ap.lat ? `${ap.lat.toFixed(5)}, ${ap.lng.toFixed(5)}` : ""),
                                      info: [
                                        { label: "Catégorie", val: isContratClient ? `Contrat client #${apIdx + 1}` : `Autre poteau #${apIdx + 1}` },
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
                                    {isContratClient ? `Contrat #${apIdx + 1}` : `#${apIdx + 1}`} {ap.lat != null ? "📍" : ""}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => (isContratClient ? removeContratPhoto(ap.id) : removeAutrePoteauPhoto(ap.id))}
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
                            {(!isContratClient || multiPhotos.length < 2) && (
                              <>
                                <button
                                  type="button"
                                  className="btn-slot-subtle"
                                  disabled={slotCapturing}
                                  onClick={() => openSlotCamera(slot.key)}
                                >
                                  📷 {isContratClient ? `+ Prendre contrat (${multiPhotos.length + 1}/2)` : "📷 + Prendre photo"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-slot-subtle"
                                  disabled={slotCapturing}
                                  onClick={() => openSlotGallery(slot.key)}
                                >
                                  🖼️ {isContratClient ? `+ Importer contrat (${multiPhotos.length + 1}/2)` : "🖼️ + Importer"}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn-slot-subtle danger"
                              onClick={() => removeSlotPhoto(slot.key)}
                              title={isContratClient ? "Supprimer toutes les photos de contrat" : "Supprimer toutes les photos d'Autre poteau"}
                            >
                              ✕ Tout retirer ({multiPhotos.length})
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

                          {slot.key === "fat" && (data.fat_ref || data.msan) && (
                            <div className="fat-ocr-detected-chip">
                              <span>⚡ FAT : <strong>{data.fat_ref || "N/A"}</strong> | MSAN : <strong>{data.msan || "N/A"}</strong></span>
                            </div>
                          )}

                          {slot.key === "mesure_fat" && data.puissance_fat_dbm && Number(data.puissance_fat_dbm) !== 0 && (
                            <div className="fat-ocr-detected-chip">
                              <span>⚡ Puissance optique FAT : <strong>{data.puissance_fat_dbm} dBm</strong></span>
                            </div>
                          )}

                          {slot.key === "mesure_pto" && data.puissance_pto_dbm && Number(data.puissance_pto_dbm) !== 0 && (
                            <div className="fat-ocr-detected-chip">
                              <span>⚡ Puissance optique PTO : <strong>{data.puissance_pto_dbm} dBm</strong></span>
                            </div>
                          )}

                          {(slot.key === "debit_wifi" || slot.key === "debit_cable") && (data.debit_descendant || data.debit_montant) && (
                            <div className="fat-ocr-detected-chip">
                              <span>📶 Débit détecté : <strong>↓ {data.debit_descendant || "-"} Mb/s</strong> | <strong>↑ {data.debit_montant || "-"} Mb/s</strong></span>
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
                                onClick={() => {
                                  if (slot.key === "fat") runFatOcrOnPhoto(photo.url);
                                  else if (slot.key === "debit_wifi" || slot.key === "debit_cable") runSpeedtestOcrOnPhoto(photo.url);
                                  else if (slot.key === "mesure_fat" || slot.key === "mesure_pto") runPowerMeterOcrOnPhoto(photo.url, slot.key);
                                }}
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
                          📷 Prendre photo {isContratClient ? "(Contrat 1)" : ""}
                        </button>
                        <button
                          type="button"
                          className="btn-slot-upload btn-gallery"
                          disabled={slotCapturing}
                          onClick={() => openSlotGallery(slot.key)}
                        >
                          🖼️ Importer {isContratClient ? "(Contrat 1)" : ""}
                        </button>
                      </div>
                    )}

                    {/* Saisie rapide / Valeurs OCR directement intégrées dans la case photo */}
                    {(slot.key === "debit_wifi" || slot.key === "debit_cable") && (
                      <div className="slot-quick-fields-box" style={{ marginTop: 8, padding: 8, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span>📶 Valeurs du test de débit {slot.key === "debit_wifi" ? "(Wi-Fi)" : "(Câble)"}</span>
                          {(data.debit_descendant || data.debit_montant || data.debit_ping) ? (
                            <span style={{ color: "#16a34a", fontSize: 10, fontWeight: 700 }}>✓ Prêt pour CelPros Étape 3</span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 10 }}>À renseigner ou via capture</span>
                          )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                          <div>
                            <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 2 }}>Descendant (Mb/s)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex: 48.26"
                              value={data.debit_descendant || ""}
                              onChange={(e) => update("debit_descendant", e.target.value)}
                              onBlur={flushServerSync}
                              style={{ width: "100%", padding: "6px 8px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 2 }}>Montant (Mb/s)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex: 9.504"
                              value={data.debit_montant || ""}
                              onChange={(e) => update("debit_montant", e.target.value)}
                              onBlur={flushServerSync}
                              style={{ width: "100%", padding: "6px 8px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 2 }}>Ping (ms)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex: 18.99"
                              value={data.debit_ping || ""}
                              onChange={(e) => update("debit_ping", e.target.value)}
                              onBlur={flushServerSync}
                              style={{ width: "100%", padding: "6px 8px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {slot.key === "mesure_fat" && (
                      <div className="slot-quick-fields-box" style={{ marginTop: 8, padding: 8, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                          <span>📊 Puissance optique au FAT (dBm)</span>
                          {data.puissance_fat_dbm && Number(data.puissance_fat_dbm) !== 0 ? (
                            <span style={{ color: "#16a34a", fontSize: 10, fontWeight: 700 }}>✓ Prêt pour CelPros ({data.puissance_fat_dbm} dBm)</span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 10 }}>À renseigner ou via photomètre</span>
                          )}
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex: -18.5"
                          value={data.puissance_fat_dbm || ""}
                          onChange={(e) => update("puissance_fat_dbm", e.target.value)}
                          onBlur={flushServerSync}
                          style={{ width: "100%", padding: "6px 8px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                        />
                      </div>
                    )}

                    {slot.key === "mesure_pto" && (
                      <div className="slot-quick-fields-box" style={{ marginTop: 8, padding: 8, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                          <span>📊 Puissance optique au PTO (dBm)</span>
                          {data.puissance_pto_dbm && Number(data.puissance_pto_dbm) !== 0 ? (
                            <span style={{ color: "#16a34a", fontSize: 10, fontWeight: 700 }}>✓ Prêt pour CelPros ({data.puissance_pto_dbm} dBm)</span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 10 }}>À renseigner ou via photomètre</span>
                          )}
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex: -19.2"
                          value={data.puissance_pto_dbm || ""}
                          onChange={(e) => update("puissance_pto_dbm", e.target.value)}
                          onBlur={flushServerSync}
                          style={{ width: "100%", padding: "6px 8px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                        />
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
                    if (pt && (pt.type === "Poteau" || String(pt.type || "").toLowerCase().includes("poteau")) && Number(pt.numero) > 0) {
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
                      } else {
                        const existing = poleMap.get(num);
                        if (!existing.photo && wa.url) {
                          existing.photo = wa.url;
                        }
                        if (existing.lat == null && wa.lat != null) {
                          existing.lat = wa.lat;
                          existing.lng = wa.lng;
                          existing.precision_m = wa.precision_m;
                          existing.lieu = wa.lieu;
                        }
                        poleMap.set(num, existing);
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

                    const typePoteau = pt.type_poteau || pt.proprietaire || "";
                    const isPj = /petit[\s_-]*jean|pj/i.test(typePoteau);
                    const isSbee = /sbee/i.test(typePoteau);
                    const isFatPole = Boolean(pt.is_poteau_fat || String(pt.sous_type || "").toLowerCase().includes("fat"));
                    const isTraverse = pt.traverse !== undefined ? Boolean(pt.traverse) : (!isFatPole && pt.sous_type !== "Implanté");
                    const isImplante = Boolean(pt.implante || (!pt.traverse && pt.sous_type === "Implanté"));
                    const isArme = isSbee && Boolean(pt.arme || (!pt.traverse && pt.sous_type === "Armé"));

                    const charBadges = [];
                    if (isPj) charBadges.push("Petit Jean");
                    else if (isSbee) charBadges.push("SBEE");
                    else if (typePoteau) charBadges.push(typePoteau);
                    if (isFatPole) charBadges.push("Poteau FAT");
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
                                    className={`pill-btn ${isPj ? "active" : ""}`}
                                    onClick={() => handlePoleTypeChange(poleNum, "Petit Jean")}
                                  >
                                    {isPj ? "✓ Petit Jean" : "Petit Jean"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill-btn ${isSbee ? "active" : ""}`}
                                    onClick={() => handlePoleTypeChange(poleNum, "SBEE")}
                                  >
                                    {isSbee ? "✓ SBEE" : "SBEE"}
                                  </button>
                                </div>
                              </div>
                              <div className="pole-option-row">
                                <span className="pole-option-label">Options :</span>
                                <div className="pole-pills-group" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  <button
                                    type="button"
                                    className={`pill-btn ${isTraverse ? "active" : ""}`}
                                    onClick={() => handlePoleSingleOptionChange(poleNum, "traverse")}
                                  >
                                    {isTraverse ? "✓ Traversé" : "Traversé"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill-btn ${isImplante ? "active" : ""}`}
                                    onClick={() => handlePoleSingleOptionChange(poleNum, "implante")}
                                  >
                                    {isImplante ? "✓ Implanté" : "Implanté"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill-btn ${isArme ? "active" : ""}`}
                                    disabled={!isSbee}
                                    title={!isSbee ? "Seuls les poteaux SBEE peuvent être armés" : "Armé"}
                                    style={!isSbee ? { opacity: 0.45, cursor: "not-allowed" } : {}}
                                    onClick={() => isSbee && handlePoleSingleOptionChange(poleNum, "arme")}
                                  >
                                    {isArme ? "✓ Armé" : "Armé"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill-btn ${isFatPole ? "active" : ""}`}
                                    style={isFatPole ? { background: "#0284c7", color: "#fff", borderColor: "#0284c7" } : {}}
                                    onClick={() => handlePoleSingleOptionChange(poleNum, "fat")}
                                  >
                                    {isFatPole ? "✓ Poteau FAT" : "Poteau FAT"}
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
                                {!isPj && !isSbee && (
                                  <div
                                    className="pole-unconfigured-notice"
                                    onClick={() => setPoleConfigModal({ poleNum, actionAfter: "camera" })}
                                    style={{
                                      padding: "8px 10px",
                                      background: "#fffbeb",
                                      border: "1px dashed #f59e0b",
                                      borderRadius: 8,
                                      marginBottom: 10,
                                      textAlign: "center",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <span style={{ color: "#b45309", fontSize: 12, fontWeight: 700 }}>⚠️ Type de poteau non configuré</span>
                                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#92400e" }}>
                                      Cliquez ici pour choisir <strong>Petit Jean</strong> ou <strong>SBEE</strong> avant la photo.
                                    </p>
                                  </div>
                                )}
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

            {/* 📹 Module Vidéo Terrain */}
            <div className="form-card video-terrain-card-section" style={{ marginTop: 20 }}>
              <div className="form-card-header">
                <div className="form-card-icon" style={{ background: "#fef3c7", color: "#d97706" }}>📹</div>
                <div>
                  <h3>Vidéo Terrain</h3>
                  <p className="form-card-sub">
                    Enregistrement et stockage de vidéos compressées (chantier, poteaux, passages délicats, etc.)
                  </p>
                </div>
                <span
                  className={`photo-slot-badge ${videosTerrain.length > 0 ? "badge-success" : "badge-optional"}`}
                  style={{ marginLeft: "auto" }}
                >
                  {videosTerrain.length > 0 ? `✓ ${videosTerrain.length} vidéo${videosTerrain.length > 1 ? "s" : ""}` : "0 vidéo"}
                </span>
              </div>

              <div className="gps-buttons" style={{ margin: "14px 0" }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={videoProcessing}
                  onClick={openVideoCamera}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  📹 Filmer une vidéo
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={videoProcessing}
                  onClick={openVideoGallery}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  🎬 Importer de la galerie
                </button>
              </div>

              {videoProcessing && (
                <div
                  className="video-uploading-box"
                  style={{
                    background: "#f8fafc",
                    padding: 14,
                    borderRadius: 10,
                    margin: "14px 0",
                    border: "1px dashed #cbd5e1",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--primary)",
                      marginBottom: 6,
                    }}
                  >
                    <span>{videoProgress.msg || "Traitement de la vidéo en cours…"}</span>
                    <span>{videoProgress.pct}%</span>
                  </div>
                  <div className="progress-bar-track" style={{ height: 8 }}>
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${videoProgress.pct}%`, transition: "width 0.3s ease" }}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>
                    ⚡ Compression vidéo intelligente : réduction drastique de la taille pour préserver le stockage et garantir un chargement ultra-rapide.
                  </p>
                </div>
              )}

              {videoStatus && (
                <p className="slot-feedback-hint" style={{ marginBottom: 12, fontWeight: 500 }}>
                  {videoStatus}
                </p>
              )}

              {videosTerrain.length > 0 ? (
                <div
                  className="videos-terrain-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 12,
                    marginTop: 14,
                  }}
                >
                  {videosTerrain.map((video, idx) => (
                    <div
                      key={video.id || idx}
                      className="video-terrain-card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#0f172a",
                        border: "1px solid var(--border, #334155)",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      {/* Zone miniature cliquable pour lancer la lecture */}
                      <div
                        onClick={() => setActiveViewingVideo(video)}
                        style={{
                          position: "relative",
                          aspectRatio: "16 / 10",
                          background: "#020617",
                          cursor: "pointer",
                          overflow: "hidden",
                        }}
                        title="Cliquer pour lire la vidéo"
                      >
                        {video.thumbnail_url ? (
                          <img
                            src={video.thumbnail_url}
                            alt={video.label || "Vidéo terrain"}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "#1e293b",
                              color: "#94a3b8",
                              gap: 4,
                            }}
                          >
                            <span style={{ fontSize: 28 }}>🎬</span>
                            <span style={{ fontSize: 11, color: "#64748b" }}>Vidéo terrain</span>
                          </div>
                        )}

                        {/* Bouton de lecture centré */}
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            width: 38,
                            height: 38,
                            borderRadius: "50%",
                            background: "rgba(0, 0, 0, 0.65)",
                            backdropFilter: "blur(4px)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 16,
                            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                          }}
                        >
                          ▶
                        </div>

                        {/* Badge durée */}
                        {video.duration > 0 && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: 6,
                              left: 6,
                              background: "rgba(0,0,0,0.78)",
                              color: "#fff",
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: 4,
                              backdropFilter: "blur(2px)",
                            }}
                          >
                            ⏱️ {formatDuration(video.duration)}
                          </span>
                        )}

                        {/* Badge taille compressée */}
                        {video.size > 0 && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: 6,
                              right: 6,
                              background: "rgba(16, 185, 129, 0.88)",
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 5px",
                              borderRadius: 4,
                            }}
                          >
                            {formatFileSize(video.size)}
                          </span>
                        )}

                        {/* Badge GPS ou Import */}
                        <span
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            background: video.is_imported ? "rgba(71, 85, 105, 0.85)" : "rgba(15, 23, 42, 0.85)",
                            color: video.is_imported ? "#cbd5e1" : "#facc15",
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: video.is_imported ? "1px solid rgba(148, 163, 184, 0.3)" : "1px solid rgba(250, 204, 21, 0.4)",
                          }}
                          title={video.is_imported ? "Vidéo importée (sans bandeau)" : "Vidéo capturée caméra avec bandeau GPS"}
                        >
                          {video.is_imported ? "📁 Import" : "📍 GPS"}
                        </span>

                        {video.status === "synced" && (
                          <span
                            style={{
                              position: "absolute",
                              top: 6,
                              left: 6,
                              background: "rgba(16, 185, 129, 0.88)",
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 5px",
                              borderRadius: 4,
                            }}
                          >
                            ✓ Synchro
                          </span>
                        )}
                      </div>

                      {/* En-tête titre et boutons tactiles au bas de la carte */}
                      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, background: "#0f172a" }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#f8fafc",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={video.label || `Vidéo #${idx + 1}`}
                        >
                          {video.label || `Vidéo #${idx + 1}`}
                        </div>

                        {/* Boutons d'action : Lire, Reprendre, Supprimer */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setActiveViewingVideo(video)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                              padding: "6px 4px",
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 6,
                              background: "#0284c7",
                              color: "#ffffff",
                              border: "none",
                              cursor: "pointer",
                            }}
                            title="Lire la vidéo"
                          >
                            ▶ Lire
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePromptRetakeVideo(video);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                              padding: "6px 4px",
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 6,
                              background: "#1e293b",
                              color: "#38bdf8",
                              border: "1px solid #334155",
                              cursor: "pointer",
                            }}
                            title="Reprendre ou remplacer cette vidéo"
                          >
                            🔄 Reprendre
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Supprimer ${video.label || "cette vidéo"} ?`)) {
                                handleDeleteVideo(video);
                              }
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "6px 8px",
                              fontSize: 12,
                              fontWeight: 600,
                              borderRadius: 6,
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "#f87171",
                              border: "1px solid rgba(239, 68, 68, 0.25)",
                              cursor: "pointer",
                            }}
                            title="Supprimer cette vidéo"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "8px 0 0" }}>
                  Aucune vidéo terrain enregistrée pour cette intervention. Vous pouvez en filmer ou en importer plusieurs sans risque de surcharger l'application grâce à la compression automatique.
                </p>
              )}
            </div>

            <div className="other-photos-card">
              {(() => {
                const photosAdditionnelles = (whatsappPhotos || []).filter(
                  (p) => p && (p.additionnelle || p.is_additionnelle || p.slot === "additionnelle" || String(p.slot).startsWith("additionnelle_") || p.type === "additionnelle")
                );
                return (
                  <>
                    <div className="form-card-header">
                      <div className="form-card-icon wa-icon">💬</div>
                      <div>
                        <h3>Autres photos terrain & WhatsApp</h3>
                        <p className="form-card-sub">Photos additionnelles (stockées sur le serveur & partageables sur WhatsApp)</p>
                      </div>
                      <span className={`photo-slot-badge ${photosAdditionnelles.length > 0 ? "badge-success" : "badge-optional"}`} style={{ marginLeft: "auto" }}>
                        {photosAdditionnelles.length > 0 ? `✓ ${photosAdditionnelles.length} additionnelle${photosAdditionnelles.length > 1 ? "s" : ""}` : "0 additionnelle"}
                      </span>
                    </div>

                    <div className="gps-buttons" style={{ margin: "14px 0" }}>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={waCapturing}
                        onClick={openWaCamera}
                      >
                        {waCapturing ? "Géolocalisation & Enregistrement…" : "📷 Prendre photo additionnelle"}
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

                    {whatsappStatus && (
                      <p className="slot-feedback-hint" style={{ marginBottom: 12 }}>{whatsappStatus}</p>
                    )}

                    {/* Galerie dédiée des photos additionnelles */}
                    {photosAdditionnelles.length > 0 && (
                      <div style={{ marginBottom: 18, background: "#f8fafc", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", display: "flex", alignItems: "center", gap: 6 }}>
                            <span>📸 Photos additionnelles enregistrées ({photosAdditionnelles.length})</span>
                          </div>
                          <span style={{ fontSize: 11, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                            ✓ Stockées sur le serveur
                          </span>
                        </div>

                        <div className="whatsapp-photos-grid">
                          {photosAdditionnelles.map((photo, pIdx) => (
                            <div
                              key={photo.id}
                              className="whatsapp-photo-item"
                              onClick={() => {
                                setViewingPhoto({
                                  url: photo.url,
                                  title: `Photo additionnelle #${pIdx + 1}`,
                                  subtitle: photo.lieu || (photo.lat ? `${Number(photo.lat).toFixed(5)}, ${Number(photo.lng).toFixed(5)}` : ""),
                                  info: [
                                    { label: "Catégorie", val: `Photo additionnelle #${pIdx + 1}` },
                                    ...(photo.lat ? [{ label: "Coordonnées GPS", val: `${Number(photo.lat).toFixed(5)}, ${Number(photo.lng).toFixed(5)}` }] : []),
                                    ...(photo.precision_m ? [{ label: "Précision", val: `±${Number(photo.precision_m).toFixed(1)} m` }] : []),
                                    ...(photo.horodatage ? [{ label: "Prise le", val: new Date(photo.horodatage).toLocaleString() }] : []),
                                    ...(photo.lieu ? [{ label: "Lieu", val: photo.lieu }] : []),
                                  ],
                                });
                              }}
                              style={{
                                cursor: "pointer",
                                border: selectedPhotoIds.has(photo.id) ? "2px solid var(--primary)" : "2px solid #cbd5e1"
                              }}
                              title="Cliquer pour agrandir la photo"
                            >
                              <img src={photo.url} alt={`Photo additionnelle ${pIdx + 1}`} />
                              <span className="photo-tag-pill" style={{ background: "rgba(15, 23, 42, 0.85)" }}>
                                Additionnelle #{pIdx + 1}
                              </span>
                              <span className="zoom-hint-chip">🔍 Agrandir</span>
                              <div
                                className={`selected-check ${selectedPhotoIds.has(photo.id) ? "is-active" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePhotoSelection(photo.id);
                                }}
                                title={selectedPhotoIds.has(photo.id) ? "Désélectionner pour WhatsApp" : "Sélectionner pour WhatsApp"}
                              >
                                {selectedPhotoIds.has(photo.id) ? "✓" : "○"}
                              </div>
                              <button
                                type="button"
                                className="remove-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeWhatsappPhoto(photo.id);
                                }}
                                title="Supprimer cette photo"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

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
                        onClick={() => {
                          setViewingPhoto({
                            url: photo.url,
                            title: photo.label || "Photo terrain",
                            subtitle: photo.lieu || (photo.lat ? `${Number(photo.lat).toFixed(5)}, ${Number(photo.lng).toFixed(5)}` : ""),
                            info: [
                              ...(photo.label ? [{ label: "Catégorie", val: photo.label }] : []),
                              ...(photo.lat ? [{ label: "Coordonnées", val: `${Number(photo.lat).toFixed(5)}, ${Number(photo.lng).toFixed(5)}` }] : []),
                              ...(photo.precision_m ? [{ label: "Précision", val: `±${Number(photo.precision_m).toFixed(1)} m` }] : []),
                              ...(photo.horodatage ? [{ label: "Date & Heure", val: new Date(photo.horodatage).toLocaleString() }] : []),
                              ...(photo.lieu ? [{ label: "Lieu", val: photo.lieu }] : []),
                            ],
                          });
                        }}
                        style={{
                          cursor: "pointer",
                          border: selectedPhotoIds.has(photo.id) ? "2px solid var(--primary)" : "2px solid transparent"
                        }}
                        title="Cliquer pour agrandir la photo"
                      >
                        <img src={photo.url} alt="Photo terrain" />
                        {photo.label && (
                          <span className="photo-tag-pill">{photo.label}</span>
                        )}
                        <span className="zoom-hint-chip">🔍 Agrandir</span>
                        <div
                          className={`selected-check ${selectedPhotoIds.has(photo.id) ? "is-active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePhotoSelection(photo.id);
                          }}
                          title={selectedPhotoIds.has(photo.id) ? "Désélectionner pour WhatsApp" : "Sélectionner pour WhatsApp"}
                        >
                          {selectedPhotoIds.has(photo.id) ? "✓" : "○"}
                        </div>
                        <button
                          type="button"
                          className="remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWhatsappPhoto(photo.id);
                          }}
                          title="Supprimer cette photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-secondary btn-large"
                      onClick={downloadSelectedPhotos}
                      disabled={selectedPhotoIds.size === 0}
                      style={{ padding: "10px 16px" }}
                      title="Télécharger les photos sélectionnées dans un dossier au nom du client dans Téléchargements"
                    >
                      📁 Télécharger les photos ({selectedPhotoIds.size})
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
                        if (!data._crochets_manual) {
                          const calc = calculateMaterials(nextData);
                          nextData.materiel_pose = {
                            ...(data.materiel_pose || {}),
                            crochets: calc.crochets,
                          };
                          markDirty("materiel_pose.crochets");
                        }
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
                        onClick={() => {
                          setViewingPhoto({
                            url: photo.url,
                            title: photo.label || "Photo terrain",
                            subtitle: photo.lieu || (photo.lat ? `${Number(photo.lat).toFixed(5)}, ${Number(photo.lng).toFixed(5)}` : ""),
                            info: [
                              ...(photo.label ? [{ label: "Catégorie", val: photo.label }] : []),
                              ...(photo.lat ? [{ label: "Coordonnées", val: `${Number(photo.lat).toFixed(5)}, ${Number(photo.lng).toFixed(5)}` }] : []),
                              ...(photo.precision_m ? [{ label: "Précision", val: `±${Number(photo.precision_m).toFixed(1)} m` }] : []),
                              ...(photo.horodatage ? [{ label: "Date & Heure", val: new Date(photo.horodatage).toLocaleString() }] : []),
                              ...(photo.lieu ? [{ label: "Lieu", val: photo.lieu }] : []),
                            ],
                          });
                        }}
                        style={{ cursor: "pointer", border: selectedPhotoIds.has(photo.id) ? "2px solid var(--primary)" : "2px solid transparent" }}
                        title="Cliquer pour agrandir la photo"
                      >
                        <img src={photo.url} alt="Photo terrain" />
                        {photo.label && (
                          <span className="photo-tag-pill">{photo.label}</span>
                        )}
                        <span className="zoom-hint-chip">🔍 Agrandir</span>
                        <div
                          className={`selected-check ${selectedPhotoIds.has(photo.id) ? "is-active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePhotoSelection(photo.id);
                          }}
                          title={selectedPhotoIds.has(photo.id) ? "Désélectionner pour WhatsApp" : "Sélectionner pour WhatsApp"}
                        >
                          {selectedPhotoIds.has(photo.id) ? "✓" : "○"}
                        </div>
                        <button
                          type="button"
                          className="remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWhatsappPhoto(photo.id);
                          }}
                          title="Supprimer cette photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-secondary btn-large"
                      onClick={downloadSelectedPhotos}
                      disabled={selectedPhotoIds.size === 0}
                      style={{ padding: "10px 16px" }}
                      title="Télécharger les photos sélectionnées dans un dossier au nom du client dans Téléchargements"
                    >
                      📁 Télécharger les photos ({selectedPhotoIds.size})
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
              value={data.ont_sn || data.sn}
              placeholder="Ex: 485754437572231B8"
              scanLabel="Scanner SN"
              onChange={(v) => {
                update("ont_sn", v);
                update("sn", v);
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

                <div style={{ display: "flex", gap: 10, justifyContent: "stretch", flexWrap: "wrap" }}>
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
                  {finishSuccessData.tournee_du_jour && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        flex: 1.1,
                        padding: "12px 14px",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1e40af",
                        background: "#eff6ff",
                        borderColor: "#bfdbfe",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6
                      }}
                      onClick={() => {
                        setFinishModalOpen(false);
                        setFinishSuccessData(null);
                        onClose("tournee");
                      }}
                    >
                      🚗 Tournée ({finishSuccessData.tournee_ordre ? `#${finishSuccessData.tournee_ordre + 1} suivant` : "du jour"})
                    </button>
                  )}
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

      {activeViewingVideo && (
        <VideoPlayerModal
          video={activeViewingVideo}
          clientName={data.nom_client || data.nom_dossier}
          onClose={() => setActiveViewingVideo(null)}
          onDelete={handleDeleteVideo}
          onRetake={handlePromptRetakeVideo}
        />
      )}

      {retakeTargetVideo && (
        <div
          className="modal-overlay"
          onClick={() => setRetakeTargetVideo(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
            padding: 16,
          }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f172a",
              color: "#f8fafc",
              borderRadius: 16,
              maxWidth: 420,
              width: "100%",
              padding: 20,
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              border: "1px solid #334155",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>🔄</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>
                  Reprendre la vidéo
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94a3b8" }}>
                  {retakeTargetVideo.label || "Vidéo terrain"}
                </p>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 16 }}>
              Comment souhaitez-vous reprendre ou remplacer cette vidéo ? L'ancienne sera automatiquement remplacée et le nouveau fichier sera compressé en haute définition.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const target = retakeTargetVideo;
                  setRetakeTargetVideo(null);
                  videoTargetReplaceRef.current = target;
                  if (videoCameraInputRef.current) {
                    videoCameraInputRef.current.value = "";
                    videoCameraInputRef.current.click();
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "12px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 10,
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                📹 Filmer à la caméra (avec bandeau GPS)
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const target = retakeTargetVideo;
                  setRetakeTargetVideo(null);
                  videoTargetReplaceRef.current = target;
                  if (videoGalleryInputRef.current) {
                    videoGalleryInputRef.current.value = "";
                    videoGalleryInputRef.current.click();
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "12px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 10,
                  background: "#1e293b",
                  color: "#38bdf8",
                  border: "1px solid #334155",
                  cursor: "pointer",
                }}
              >
                📁 Importer depuis la galerie (sans bandeau)
              </button>

              <button
                type="button"
                onClick={() => {
                  videoTargetReplaceRef.current = null;
                  setRetakeTargetVideo(null);
                }}
                style={{
                  marginTop: 6,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  background: "transparent",
                  color: "#94a3b8",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {poleConfigModal && (() => {
        const poleNum = poleConfigModal.poleNum;
        const currentPole = (data.points_gps || []).find(
          (p) => p && p.type === "Poteau" && Number(p.numero) === Number(poleNum)
        );
        const rawType = currentPole?.type_poteau || currentPole?.proprietaire || "";
        const initialType = /sbee/i.test(rawType) ? "SBEE" : (/petit[\s_-]*jean|pj/i.test(rawType) ? "Petit Jean" : "");
        const initialOptions = {
          traverse: currentPole ? (currentPole.traverse !== undefined ? Boolean(currentPole.traverse) : currentPole.sous_type !== "Implanté") : true,
          implante: Boolean(currentPole?.implante || (!currentPole?.traverse && currentPole?.sous_type === "Implanté")),
          arme: Boolean(currentPole?.arme || (!currentPole?.traverse && currentPole?.sous_type === "Armé")) && initialType === "SBEE",
          fat: Boolean(currentPole?.is_poteau_fat || String(currentPole?.sous_type || "").toLowerCase().includes("fat")),
        };

        return (
          <PoleConfigModalInner
            poleNum={poleNum}
            currentPole={currentPole}
            initialType={initialType}
            initialOptions={initialOptions}
            isNew={poleConfigModal.isNew}
            actionAfter={poleConfigModal.actionAfter}
            onConfirm={(type, opts, action) => handleConfirmPoleConfig(poleNum, type, opts, action)}
            onClose={() => setPoleConfigModal(null)}
          />
        );
      })()}

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

function PoleConfigModalInner({
  poleNum,
  currentPole,
  initialType,
  initialOptions,
  isNew,
  actionAfter,
  onConfirm,
  onClose,
}) {
  const [selectedType, setSelectedType] = useState(initialType || "");
  const [isTraverse, setIsTraverse] = useState(initialOptions?.traverse ?? true);
  const [isImplante, setIsImplante] = useState(Boolean(initialOptions?.implante));
  const [isArme, setIsArme] = useState(Boolean(initialOptions?.arme) && initialType === "SBEE");
  const [isFat, setIsFat] = useState(Boolean(initialOptions?.fat));

  function handleSelectType(type) {
    setSelectedType(type);
    if (type !== "SBEE") {
      setIsArme(false);
    }
  }

  const isSbee = selectedType === "SBEE";
  const hasAnyOption = isTraverse || isImplante || isArme || isFat;

  // Étape courante : 1 (Type), 2 (Options), 3 (Photo)
  const currentStep = !selectedType ? 1 : !hasAnyOption ? 2 : 3;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          color: "#0f172a",
          borderRadius: 16,
          maxWidth: 480,
          width: "100%",
          padding: "24px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>📍</span>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              {isNew ? `Ajout Poteau ${poleNum}` : `Configuration Poteau ${poleNum}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: "#64748b",
              lineHeight: 1,
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Stepper progress indicator */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: "#0284c7",
              transition: "background 0.2s",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: currentStep >= 2 ? "#0284c7" : "#e2e8f0",
              transition: "background 0.2s",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: currentStep >= 3 ? "#0284c7" : "#e2e8f0",
              transition: "background 0.2s",
            }}
          />
        </div>

        {/* 1. Choix du Type (Obligatoire) - Première question */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
              1. Type de poteau <span style={{ color: "#dc2626" }}>*</span>
            </label>
            {selectedType && (
              <span style={{ fontSize: 12, color: "#0284c7", fontWeight: 700 }}>
                ✓ {selectedType}
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              type="button"
              onClick={() => handleSelectType("Petit Jean")}
              style={{
                padding: "14px 12px",
                borderRadius: 10,
                border: selectedType === "Petit Jean" ? "2px solid #0284c7" : "1px solid #cbd5e1",
                background: selectedType === "Petit Jean" ? "#f0f9ff" : "#f8fafc",
                color: selectedType === "Petit Jean" ? "#0369a1" : "#334155",
                fontWeight: selectedType === "Petit Jean" ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <IconPole size={24} color={selectedType === "Petit Jean" ? "#0284c7" : "#64748b"} />
              <span>{selectedType === "Petit Jean" ? "✓ Petit Jean" : "Petit Jean"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectType("SBEE")}
              style={{
                padding: "14px 12px",
                borderRadius: 10,
                border: selectedType === "SBEE" ? "2px solid #0284c7" : "1px solid #cbd5e1",
                background: selectedType === "SBEE" ? "#f0f9ff" : "#f8fafc",
                color: selectedType === "SBEE" ? "#0369a1" : "#334155",
                fontWeight: selectedType === "SBEE" ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <IconZap size={24} color={selectedType === "SBEE" ? "#0284c7" : "#64748b"} />
              <span>{selectedType === "SBEE" ? "✓ SBEE" : "SBEE"}</span>
            </button>
          </div>
        </div>

        {/* 2. Caractéristiques du poteau (Plusieurs choix possibles) */}
        {selectedType ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                2. Caractéristiques du poteau <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <span style={{ fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
                Plusieurs choix possibles
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                type="button"
                onClick={() => setIsTraverse((prev) => !prev)}
                style={{
                  padding: "12px 10px",
                  borderRadius: 8,
                  border: isTraverse ? "2px solid #0284c7" : "1px solid #e2e8f0",
                  background: isTraverse ? "#e0f2fe" : "#ffffff",
                  color: isTraverse ? "#0369a1" : "#334155",
                  fontWeight: isTraverse ? 700 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <IconCable size={16} color={isTraverse ? "#0284c7" : "#64748b"} />
                <span>{isTraverse ? "✓ Traversé" : "Traversé"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImplante((prev) => !prev)}
                style={{
                  padding: "12px 10px",
                  borderRadius: 8,
                  border: isImplante ? "2px solid #0284c7" : "1px solid #e2e8f0",
                  background: isImplante ? "#e0f2fe" : "#ffffff",
                  color: isImplante ? "#0369a1" : "#334155",
                  fontWeight: isImplante ? 700 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <IconPole size={16} color={isImplante ? "#0284c7" : "#64748b"} />
                <span>{isImplante ? "✓ Implanté" : "Implanté"}</span>
              </button>

              <button
                type="button"
                disabled={!isSbee}
                onClick={() => isSbee && setIsArme((prev) => !prev)}
                title={!isSbee ? "Seuls les poteaux SBEE peuvent être armés" : "Armé"}
                style={{
                  padding: "12px 10px",
                  borderRadius: 8,
                  border: isArme ? "2px solid #0284c7" : "1px solid #e2e8f0",
                  background: !isSbee ? "#f1f5f9" : isArme ? "#e0f2fe" : "#ffffff",
                  color: !isSbee ? "#94a3b8" : isArme ? "#0369a1" : "#334155",
                  fontWeight: isArme ? 700 : 500,
                  fontSize: 13,
                  cursor: !isSbee ? "not-allowed" : "pointer",
                  opacity: !isSbee ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <IconHardware size={16} color={isArme ? "#0284c7" : "#64748b"} />
                <span>{isArme ? "✓ Armé (SBEE)" : isSbee ? "Armé (SBEE)" : "Armé (SBEE seul)"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFat((prev) => !prev)}
                style={{
                  padding: "12px 10px",
                  borderRadius: 8,
                  border: isFat ? "2px solid #0284c7" : "1px solid #e2e8f0",
                  background: isFat ? "#e0f2fe" : "#ffffff",
                  color: isFat ? "#0369a1" : "#334155",
                  fontWeight: isFat ? 700 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <IconServer size={16} color={isFat ? "#0284c7" : "#64748b"} />
                <span>{isFat ? "✓ Poteau FAT" : "Poteau FAT"}</span>
              </button>
            </div>
            {!isSbee && (
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
                ℹ Seuls les poteaux SBEE peuvent être armés.
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: "10px 14px",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: 8,
              marginBottom: 16,
              color: "#64748b",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            👉 Sélectionnez <strong>Petit Jean</strong> ou <strong>SBEE</strong> pour afficher les caractéristiques.
          </div>
        )}

        {/* 3. Prise ou import photo (Affiché UNIQUEMENT si Type ET au moins une Caractéristique sont choisis) */}
        {selectedType && hasAnyOption ? (
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 6, color: "#1e293b" }}>
              3. Photo du poteau <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
              La prise ou l&apos;import de la photo est <strong>obligatoire</strong> pour valider ce poteau.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() =>
                  onConfirm(
                    selectedType,
                    { traverse: isTraverse, implante: isImplante, arme: isArme && isSbee, fat: isFat },
                    "camera"
                  )
                }
                style={{
                  padding: "14px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "#0284c7",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 4px 6px -1px rgba(2, 132, 199, 0.3)",
                }}
              >
                <span style={{ fontSize: 18 }}>📷</span>
                <span>Prendre photo</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onConfirm(
                    selectedType,
                    { traverse: isTraverse, implante: isImplante, arme: isArme && isSbee, fat: isFat },
                    "gallery"
                  )
                }
                style={{
                  padding: "14px 12px",
                  borderRadius: 10,
                  border: "1.5px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#1e293b",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>🖼️</span>
                <span>Importer photo</span>
              </button>
            </div>
          </div>
        ) : selectedType ? (
          <div
            style={{
              padding: "10px 14px",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: 8,
              marginBottom: 8,
              color: "#64748b",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            👉 Choisissez au moins une <strong>Caractéristique</strong> ci-dessus pour activer la capture photo.
          </div>
        ) : null}
      </div>
    </div>
  );
}
