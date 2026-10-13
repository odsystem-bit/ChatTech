import { useEffect, useRef, useState, useCallback } from "react";
import Tabs from "../components/Tabs";
import { TextField, CheckField, SelectField, ScannableField, GeocodableField } from "../components/FormField";
import SignaturePad from "../components/SignaturePad";
import {
  getInterventionLight,
  saveIntervention,
  saveInterventionLocally,
  ensureInterventionDefaults,
} from "../models/Intervention";
import PhotoViewerModal from "../components/PhotoViewerModal";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import {
  getCurrentPositionHighAccuracy,
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

const TABS = [
  { id: "rapport", label: "📋 Rapport" },
  { id: "photos", label: "📸 Photos CelPros" },
  { id: "gps", label: "📍 Poteaux & GPS" },
  { id: "mise_en_service", label: "⚙️ Mise en service" },
  { id: "satisfaction", label: "✍️ Satisfaction" },
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
    label: "Scan / Code-barres FAT",
    icon: "🏷️",
    description: "Code-barres ou numéro de série gravé sur le FAT",
    keywords: ["scan fat", "code barre fat", "etiquette fat", "barcode fat"],
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
    label: "Étiquette Box ONT (MAC & SN)",
    icon: "🏷️",
    description: "Étiquette constructeur avec codes-barres MAC et numéro de série",
    keywords: ["photo ont", "etiquette ont", "box ont", "ont sn", "sn ont"],
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
  },
];

const OFFRES = ["Fibre Pro", "Pro Max", "Pro Mega", "Office Max", "Office Mega"];
const NIVEAUX = ["Très satisfait", "Satisfait", "Peu satisfait", "Insatisfait"];
const TYPES_POINT = ["Poteau", "Chambre", "FAT", "Abonné", "Autre"];
const SOUS_TYPES_POTEAU = ["Traversé", "Armé", "Implanté"];
const PORTS_DISPONIBLES = Array.from({ length: 8 }, (_, index) => `Port ${index + 1}`);
const PROPRIETAIRES_SUGGERES = ["SBEE", "Petit Jean"];

const MATERIEL_STANDARD = [
  { key: "rue", label: "Rue" },
  { key: "pince", label: "Pince" },
  { key: "crochets", label: "Crochets" },
  { key: "susp", label: "Suspente (Susp)" },
  { key: "piton", label: "Piton" },
  { key: "closer", label: "Closer" },
  { key: "rp1", label: "RP1" },
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

  // Géolocalisation automatique de la zone (Quartier, Ville)
  const [detectingZone, setDetectingZone] = useState(false);
  const [zoneStatus, setZoneStatus] = useState("");
  const [zoneStatusType, setZoneStatusType] = useState("info");

  // Détection OCR automatique sur photo FAT (fat_ref & msan)
  const [ocrNotification, setOcrNotification] = useState(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  // Gestion des boîtes de photos structurées CelPros
  const slotCameraInputRef = useRef(null);
  const slotGalleryInputRef = useRef(null);
  const currentSlotKeyRef = useRef(null);
  const [slotCapturing, setSlotCapturing] = useState(false);
  const [slotActionFeedback, setSlotActionFeedback] = useState("");

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

    // Optimisation majeure : n'envoyer les photos lourdes que si elles ont été expressément modifiées
    const isWaPhotosDirty = dirtySnapshot.has("whatsapp_photos");
    const isGpsDirty = dirtySnapshot.has("points_gps");

    const payload = {
      ...data,
      whatsapp_photos: isWaPhotosDirty ? whatsappPhotos : [],
      points_gps: isGpsDirty ? data.points_gps : [],
      changed_fields: [...dirtySnapshot, "modifie_par", "modifie_le"],
      deleted_points: [...deletedGpsPointIdsRef.current],
      deleted_whatsapp_photos: [...deletedWhatsappPhotoIdsRef.current],
    };

    try {
      saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(() => saveIntervention(payload));
      const saved = await saveQueueRef.current;
      for (const field of dirtySnapshot) {
        if (dirtyRevisionsRef.current.get(field) === revisions.get(field)) dirtyFieldsRef.current.delete(field);
      }
      for (const id of payload.deleted_whatsapp_photos) deletedWhatsappPhotoIdsRef.current.delete(id);
      for (const id of payload.deleted_points) deletedGpsPointIdsRef.current.delete(id);
      if (saved?.updated_at) setData((prev) => ({ ...prev, updated_at: saved.updated_at }));
      setSaveStatus("✓ Enregistré");
    } catch {
      // En cas de réseau instable, les données restent garanties dans le cache local
      setSaveStatus("✓ Sauvegardé (local)");
    }
  }, [data, whatsappPhotos]);

  useEffect(() => {
    if (finishingRef.current || dirtyFieldsRef.current.size === 0) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    // Debounce ultra-court de 400ms pour synchroniser en tâche de fond sans ralentir la frappe
    syncTimerRef.current = setTimeout(flushServerSync, 400);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [data, whatsappPhotos, flushServerSync]);

  useEffect(() => {
    let active = true;
    const refreshRemoteFields = async () => {
      try {
        const remote = await getInterventionLight(data.id);
        if (!active || !remote) return;
        setData((previous) => {
          const next = { ...previous };
          for (const [field, value] of Object.entries(remote)) {
            if (field === "materiel_pose") {
              const material = { ...previous.materiel_pose };
              for (const [designation, quantity] of Object.entries(value || {})) {
                if (!dirtyFieldsRef.current.has(`materiel_pose.${designation}`)) material[designation] = quantity;
              }
              next.materiel_pose = material;
            } else if (!["points_gps", "whatsapp_photos", "signature_client", "signature_technicien"].includes(field)
              && !dirtyFieldsRef.current.has(field)) {
              next[field] = value;
            }
          }
          return Object.keys(next).every((key) => next[key] === previous[key]) ? previous : next;
        });
      } catch (error) {
        console.warn("Intervention refresh failed:", error.message);
      }
    };
    const timer = setInterval(refreshRemoteFields, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [data.id]);

  function update(field, value) {
    if (field === "points_gps") {
      const remaining = new Set(value.map((point) => point.horodatage));
      for (const point of data.points_gps) {
        if (!remaining.has(point.horodatage)) deletedGpsPointIdsRef.current.add(point.horodatage);
      }
    }
    markDirty(
      field,
      ...(field === "depart_m" || field === "arrivee_m" ? ["lineaire_m"] : []),
      ...(field === "points_gps" ? ["nb_poteaux_traverses", "nb_poteaux_implantes", "nb_poteaux_armes"] : [])
    );
    setData((prev) => {
      const next = {
        ...prev,
        [field]: value,
        modifie_par: currentUser,
        modifie_le: new Date().toISOString(),
      };
      if (field === "depart_m" || field === "arrivee_m") {
        const depart = field === "depart_m" ? Number(value) : Number(prev.depart_m);
        const arrivee = field === "arrivee_m" ? Number(value) : Number(prev.arrivee_m);
        next.lineaire_m = Math.max(0, arrivee - depart);
      }
      if (field === "points_gps") {
        next.nb_poteaux_traverses = value.filter(
          (p) => p.type === "Poteau" && p.sous_type === "Traversé"
        ).length;
        next.nb_poteaux_implantes = value.filter(
          (p) => p.type === "Poteau" && p.sous_type === "Implanté"
        ).length;
        next.nb_poteaux_armes = value.filter(
          (p) => p.type === "Poteau" && p.sous_type === "Armé"
        ).length;
      }
      // Sauvegarde locale instantanée à 0ms dans le navigateur/smartphone
      saveInterventionLocally(next);
      return next;
    });
    setSaveStatus("✓ Enregistré");
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
    const point = {
      type: resolvedType,
      ...(resolvedType === "Poteau" ? { sous_type: sousType, proprietaire: proprietaire.trim() } : {}),
      ...pendingCapture,
      ajoute_par: currentUser,
    };
    update("points_gps", [...data.points_gps, point]);

    // Also add the photo to the terrain gallery (hors rapport)
    if (pendingCapture.photo) {
      const isFat = resolvedType === "FAT";
      const isAbonne = resolvedType === "Abonné";
      const isPoteau = resolvedType === "Poteau";
      const slot = isFat ? "fat" : isAbonne ? "ont_sn" : isPoteau ? "poteau" : undefined;
      const galleryPhoto = {
        id: crypto.randomUUID(),
        ...(slot
          ? {
              slot,
              type: slot,
              label: isFat ? "Boîtier FAT" : isAbonne ? "Étiquette Box ONT (MAC & SN)" : `Poteau ${sousType} ${point.numero}`,
              name: `${slot}.jpg`,
              description: `${isFat ? "Boîtier FAT" : isAbonne ? "Étiquette Box ONT (MAC & SN)" : `Poteau ${sousType}`} - ${data.nom_client || "Intervention"}`,
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
      setWhatsappPhotos((prev) => [...prev, galleryPhoto]);
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
    } catch (err) {
      setZoneStatus(`Erreur GPS : ${err.message || "Indisponible"}`);
      setZoneStatusType("error");
    } finally {
      setDetectingZone(false);
    }
  }

  // ===== OCR automatique sur photo du boîtier FAT =====

  const runFatOcrOnPhoto = useCallback(async (photoDataUrl) => {
    if (!photoDataUrl) return;
    setOcrProcessing(true);
    try {
      const ocrResult = await recognizeFatAndMsanFromImage(photoDataUrl);
      let foundAny = false;
      if (ocrResult.fat_ref) {
        update("fat_ref", ocrResult.fat_ref);
        foundAny = true;
      }
      if (ocrResult.msan) {
        update("msan", ocrResult.msan);
        foundAny = true;
      }
      let msg = "";
      if (ocrResult.fat_ref && ocrResult.msan) {
        msg = `✅ OCR FAT : FAT = "${ocrResult.fat_ref}" et MSAN = "${ocrResult.msan}" détectés et enregistrés automatiquement !`;
      } else if (ocrResult.fat_ref) {
        msg = `✅ OCR FAT : Référence FAT = "${ocrResult.fat_ref}" détectée et enregistrée automatiquement !`;
      } else if (ocrResult.msan) {
        msg = `✅ OCR FAT : MSAN = "${ocrResult.msan}" détecté et enregistré automatiquement !`;
      } else {
        msg = "ℹ️ Photo FAT enregistrée. Renseignez Référence FAT et MSAN manuellement si non lisibles sur la boîte.";
      }
      setOcrNotification({ text: msg, success: foundAny });
      setTimeout(() => setOcrNotification(null), 9000);
    } catch (err) {
      console.warn("OCR FAT error:", err);
    } finally {
      setOcrProcessing(false);
    }
  }, []);

  // ===== Gestion des Boîtes de Photos CelPros =====

  function getPhotoForSlot(slotKey) {
    // 1. Recherche par slot ou type direct dans whatsapp_photos
    const direct = whatsappPhotos.find((p) => p && (p.slot === slotKey || p.type === slotKey));
    if (direct) return direct;

    // 2. Recherche dans les points GPS pour FAT ou Abonné (ONT)
    if (slotKey === "fat") {
      const fatPt = (data.points_gps || []).find((p) => p && String(p.type).toUpperCase() === "FAT" && p.photo);
      if (fatPt) {
        return {
          id: `gps_fat_${fatPt.numero || 1}`,
          url: fatPt.photo,
          lat: fatPt.lat,
          lng: fatPt.lng,
          precision_m: fatPt.precision_m,
          horodatage: fatPt.horodatage,
          lieu: fatPt.lieu,
          from_gps: true,
        };
      }
    }
    if (slotKey === "ont_sn") {
      const abonnePt = (data.points_gps || []).find((p) => p && (String(p.type).toUpperCase() === "ABONNÉ" || String(p.type).toUpperCase() === "ONT") && p.photo);
      if (abonnePt) {
        return {
          id: `gps_abonne_${abonnePt.numero || 1}`,
          url: abonnePt.photo,
          lat: abonnePt.lat,
          lng: abonnePt.lng,
          precision_m: abonnePt.precision_m,
          horodatage: abonnePt.horodatage,
          lieu: abonnePt.lieu,
          from_gps: true,
        };
      }
    }

    // 3. Repli par mots-clés dans les métadonnées de la photo
    const slotDef = CELPROS_PHOTO_SLOTS.find((s) => s.key === slotKey);
    if (slotDef) {
      const match = whatsappPhotos.find((p) => {
        const desc = `${p.name || ""} ${p.label || ""} ${p.description || ""} ${p.type || ""}`.toLowerCase();
        return slotDef.keywords.some((kw) => desc.includes(kw));
      });
      if (match) return match;
    }
    return null;
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
        added: new Date().toISOString(),
      };

      setWhatsappPhotos((prev) => {
        const filtered = prev.filter((p) => p && p.slot !== slotKey && p.type !== slotKey);
        const next = [...filtered, newPhoto];
        saveInterventionLocally({ ...data, whatsapp_photos: next });
        return next;
      });
      markDirty("whatsapp_photos");
      setSaveStatus("✓ Photo enregistrée");
      setSlotActionFeedback(`✓ Photo "${slotLabel}" enregistrée.`);

      // Si c'est la photo du boîtier FAT, extraction automatique OCR de Référence FAT et MSAN !
      if (slotKey === "fat") {
        runFatOcrOnPhoto(embeddedPhoto);
      }
    } catch (err) {
      setSlotActionFeedback(`Erreur : ${err.message}`);
    } finally {
      setSlotCapturing(false);
    }
  }

  function removeSlotPhoto(slotKey) {
    const existing = getPhotoForSlot(slotKey);
    if (!existing) return;
    if (confirm(`Supprimer la photo de la case "${slotKey}" ?`)) {
      markDirty("whatsapp_photos");
      if (existing.id) deletedWhatsappPhotoIdsRef.current.add(existing.id);
      setWhatsappPhotos((prev) => {
        const next = prev.filter((p) => p.id !== existing.id && p.slot !== slotKey && p.type !== slotKey);
        saveInterventionLocally({ ...data, whatsapp_photos: next });
        return next;
      });
      setSaveStatus("✓ Modifié");
    }
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
    setWhatsappStatus("Capture photo geolocalisee…");
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

      setWhatsappStatus("Geolocalisation…");
      const lieu = await reverseGeocode(lat, lng);

      const embeddedPhoto = await embedGpsOnPhoto(photoDataUrl, {
        type: `Photo terrain - ${data.nom_client || "intervention"}`,
        lieu,
        lat,
        lng,
        precision_m,
        horodatage,
      });

      const newPhoto = {
        id: crypto.randomUUID(),
        url: embeddedPhoto,
        lat,
        lng,
        precision_m,
        horodatage,
        lieu,
        added: new Date().toISOString(),
      };
      setWhatsappPhotos((prev) => {
        const next = [...prev, newPhoto];
        saveInterventionLocally({ ...data, whatsapp_photos: next });
        return next;
      });
      markDirty("whatsapp_photos");
      setSaveStatus("✓ Photo enregistrée");
      setWhatsappStatus("Photo géolocalisée ajoutée.");
    } catch (err) {
      setWhatsappStatus(`Erreur : ${err.message}`);
    } finally {
      setWaCapturing(false);
    }
  }

  function removeWhatsappPhoto(id) {
    markDirty("whatsapp_photos");
    deletedWhatsappPhotoIdsRef.current.add(id);
    setWhatsappPhotos((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveInterventionLocally({ ...data, whatsapp_photos: next });
      return next;
    });
    setSaveStatus("✓ Modifié");
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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

    setWhatsappStatus("Préparation du partage…");

    try {
      // WebView: use AndroidBridge for native WhatsApp sharing
      if (window.AndroidBridge && window.AndroidBridge.isWebView && window.AndroidBridge.isWebView()) {
        const base64Photos = [];
        for (const photo of selected) {
          // Extract base64 from data URL
          const base64 = photo.url.includes(",") ? photo.url.split(",")[1] : photo.url;
          base64Photos.push(base64);
        }
        const text = `Photos intervention - ${data.nom_client || "Nouveau client"}`;
        window.AndroidBridge.sharePhotos(JSON.stringify(base64Photos), text);
        setWhatsappStatus("Ouverture de WhatsApp…");
        return;
      }

      // Browser: use Web Share API
      const files = [];
      for (const photo of selected) {
        const blob = await fetch(photo.url).then((r) => r.blob());
        files.push(new File([blob], `photo_${photo.id.slice(0, 8)}.jpg`, { type: "image/jpeg" }));
      }

      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({
          files,
          title: "Photos CHAPTECH",
          text: `Photos intervention - ${data.nom_client || "Nouveau client"}`,
        });
        setWhatsappStatus("Photos partagées !");
      } else {
        const text = `Photos intervention - ${data.nom_client || "Nouveau client"} (${selected.length} photo(s) à joindre manuellement)`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
        setWhatsappStatus("WhatsApp ouvert. Joignez les photos manuellement depuis votre galerie.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setWhatsappStatus(`Erreur : ${err.message}`);
      } else {
        setWhatsappStatus("");
      }
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
      saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(() => saveIntervention(finalData));
      const saved = await saveQueueRef.current;
      setData({ ...finalData, updated_at: saved?.updated_at || finalData.updated_at });
      onFinish(finalData);
    } catch (err) {
      console.error("finish error:", err);
      setFinishing(false);
      finishingRef.current = false;
      alert("Erreur lors de la finalisation: " + (err.message || "inconnue"));
    }
  }

  return (
    <div className="intervention-form">
      <header className="form-header">
        <h2>Intervention - {data.nom_client || "Nouveau client"}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <button type="button" className="btn-secondary" onClick={onClose}>
            Retour
          </button>
        </div>
      </header>

      {data.statut === "termine" && (
        <div className="status-banner">
          ✅ Intervention terminée
          {data.modifie_par &&
            ` - dernière modification par ${data.modifie_par} le ${new Date(data.modifie_le).toLocaleString()}`}
          . Vous pouvez continuer à la modifier ; les autres techniciens verront vos changements.
        </div>
      )}

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="tab-content">
        {activeTab === "rapport" && (
          <section className="form-section-stack">
            {ocrNotification && (
              <div className={`ocr-banner ${ocrNotification.success ? "success" : "info"}`}>
                <span>{ocrNotification.text}</span>
                <button type="button" onClick={() => setOcrNotification(null)}>✕</button>
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
                  label="Nom du client"
                  placeholder="Ex: Entreprise Mantota ou Nom de l'abonné"
                  value={data.nom_client}
                  onChange={(v) => update("nom_client", v)}
                />

                <GeocodableField
                  label="Adresse / Zone"
                  placeholder="Ex: Haie Vive, Cotonou ou Fidjrossè"
                  value={data.adresse_zone}
                  onChange={(v) => update("adresse_zone", v)}
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
                  />
                  <TextField
                    label="Mobile"
                    type="tel"
                    placeholder="Ex: 97 00 00 00"
                    value={data.mobile}
                    onChange={(v) => update("mobile", v)}
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
                  />
                  <TextField
                    label="MSAN"
                    placeholder="Ex: OGA-12"
                    value={data.msan}
                    onChange={(v) => update("msan", v)}
                  />
                  <TextField
                    label="Référence FAT"
                    placeholder="Ex: FAT-04"
                    value={data.fat_ref}
                    onChange={(v) => update("fat_ref", v)}
                  />
                </div>

                <div className="form-row-2">
                  <TextField
                    label="Port raccordé"
                    placeholder="Ex: Port 2"
                    value={data.port}
                    onChange={(v) => update("port", v)}
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
                    <span className="badge-count">{selectedPorts.length} sélectionné(s)</span>
                  </div>
                  <div className="ports-toggle-grid">
                    {PORTS_DISPONIBLES.map((port) => (
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
                  {!data.ports_disponibles && Number(data.port_disponible) > 0 && (
                    <small className="field-hint">Ancienne fiche : {data.port_disponible} port(s) enregistré(s).</small>
                  )}
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
                  {MATERIEL_STANDARD.map(({ key, label }) => (
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
                    {CELPROS_PHOTO_SLOTS.filter((s) => !!getPhotoForSlot(s.key)?.url).length} sur {CELPROS_PHOTO_SLOTS.length} photos obligatoires prêtes pour l'envoi CelPros
                  </p>
                </div>
                <div className="photos-progress-percent">
                  {Math.round((CELPROS_PHOTO_SLOTS.filter((s) => !!getPhotoForSlot(s.key)?.url).length / CELPROS_PHOTO_SLOTS.length) * 100)}%
                </div>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${(CELPROS_PHOTO_SLOTS.filter((s) => !!getPhotoForSlot(s.key)?.url).length / CELPROS_PHOTO_SLOTS.length) * 100}%`
                  }}
                />
              </div>
              {slotActionFeedback && (
                <p className="slot-feedback-hint">{slotActionFeedback}</p>
              )}
            </div>

            <div className="celpros-photos-grid">
              {CELPROS_PHOTO_SLOTS.map((slot) => {
                const photo = getPhotoForSlot(slot.key);
                const isTaken = !!photo?.url;

                return (
                  <div key={slot.key} className={`photo-slot-card ${isTaken ? "taken" : "pending"}`}>
                    <div className="photo-slot-header">
                      <span className="photo-slot-icon">{slot.icon}</span>
                      <div className="photo-slot-titles">
                        <h4>{slot.label}</h4>
                        <p>{slot.description}</p>
                      </div>
                      <span className={`photo-slot-badge ${isTaken ? "badge-success" : "badge-pending"}`}>
                        {isTaken ? "✓ Prête" : "En attente"}
                      </span>
                    </div>

                    {isTaken ? (
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

                  <button
                    type="button"
                    className="btn-primary btn-large"
                    onClick={sendPhotosViaWhatsapp}
                    disabled={selectedPhotoIds.size === 0}
                    style={{ marginTop: 12 }}
                  >
                    Envoyer sur WhatsApp ({selectedPhotoIds.size})
                  </button>
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
                        update("points_gps", data.points_gps.filter((_, i) => i !== idx));
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

                  <button
                    type="button"
                    className="btn-primary btn-large"
                    onClick={sendPhotosViaWhatsapp}
                    disabled={selectedPhotoIds.size === 0}
                    style={{ marginTop: 12 }}
                  >
                    Envoyer sur WhatsApp ({selectedPhotoIds.size})
                  </button>
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
          <section>
            <CheckField label="Travaux conformes" checked={data.travaux_conformes} onChange={(v) => update("travaux_conformes", v)} />
            <CheckField label="Emplacement validé" checked={data.emplacement_valide} onChange={(v) => update("emplacement_valide", v)} />
            <CheckField label="Travail propre" checked={data.travail_propre} onChange={(v) => update("travail_propre", v)} />
            <CheckField label="Service testé" checked={data.service_teste} onChange={(v) => update("service_teste", v)} />
            <CheckField label="Service fonctionne" checked={data.service_fonctionne} onChange={(v) => update("service_fonctionne", v)} />
            <CheckField label="Explications données" checked={data.explications_donnees} onChange={(v) => update("explications_donnees", v)} />
            <CheckField label="Recommanderait" checked={data.recommanderait} onChange={(v) => update("recommanderait", v)} />
            <CheckField label="Accepte recontact" checked={data.accepte_recontact} onChange={(v) => update("accepte_recontact", v)} />

            <SelectField label="Qualité" value={data.qualite} options={NIVEAUX} onChange={(v) => update("qualite", v)} />
            <SelectField label="Délais" value={data.delais} options={NIVEAUX} onChange={(v) => update("delais", v)} />
            <SelectField label="Professionnalisme" value={data.professionnalisme} options={NIVEAUX} onChange={(v) => update("professionnalisme", v)} />

            <TextField label="Nom du client (déclaration)" value={data.nom_client_declaration} onChange={(v) => update("nom_client_declaration", v)} />
            <TextField label="Remarque libre" value={data.remarque_libre} onChange={(v) => update("remarque_libre", v)} />

            <SignaturePad
              label="Signature du client"
              value={data.signature_client}
              onChange={(dataUrl) => update("signature_client", dataUrl)}
            />
            <SignaturePad
              label="Signature du technicien"
              value={data.signature_technicien}
              onChange={(dataUrl) => update("signature_technicien", dataUrl)}
            />
          </section>
        )}
      </div>

      <footer className="form-footer">
        <button type="button" className="btn-primary btn-large" onClick={finish} disabled={finishing}>
          {finishing ? "Finalisation en cours…" : "Terminer l'intervention"}
        </button>
      </footer>

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
