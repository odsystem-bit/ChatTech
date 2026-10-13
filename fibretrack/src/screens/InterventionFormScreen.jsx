import { useEffect, useRef, useState, useCallback } from "react";
import Tabs from "../components/Tabs";
import { TextField, CheckField, SelectField } from "../components/FormField";
import SignaturePad from "../components/SignaturePad";
import { getInterventionLight, saveIntervention, saveInterventionLocally } from "../models/Intervention";
import {
  getCurrentPositionHighAccuracy,
  findNearbyPoint,
  readFileAsDataUrl,
  embedGpsOnPhoto,
  reverseGeocode,
  PRECISION_WARNING_THRESHOLD_M,
} from "../lib/geo";
import {
  getDesignations,
  resolveOrCreateDesignation,
  findExistingDesignation,
} from "../lib/stock";

const TABS = [
  { id: "rapport", label: "Rapport rapide" },
  { id: "gps", label: "GPS" },
  { id: "mise_en_service", label: "Mise en service" },
  { id: "satisfaction", label: "Satisfaction" },
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
  const [data, setData] = useState(intervention);
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
  const [whatsappPhotos, setWhatsappPhotos] = useState(intervention.whatsapp_photos || []);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(new Set());
  const [whatsappStatus, setWhatsappStatus] = useState("");
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const waCameraInputRef = useRef(null);
  const waGalleryInputRef = useRef(null);
  const [waCapturing, setWaCapturing] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
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
    const count = data.points_gps.filter(
      (p) => p.type === type && (type !== "Poteau" || p.sous_type === forSousType)
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
      const galleryPhoto = {
        id: crypto.randomUUID(),
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
          <section>
            <TextField label="Nom du client" value={data.nom_client} onChange={(v) => update("nom_client", v)} />
            <TextField label="Adresse / Zone" value={data.adresse_zone} onChange={(v) => update("adresse_zone", v)} />
            <TextField label="Téléphone ligne" value={data.telephone_ligne} onChange={(v) => update("telephone_ligne", v)} />
            <TextField label="Mobile" value={data.mobile} onChange={(v) => update("mobile", v)} />

            <SelectField label="État" value={data.etat} options={["PON", "Cuivre", "Autre"]} onChange={(v) => update("etat", v)} />
            <TextField label="MSAN" value={data.msan} onChange={(v) => update("msan", v)} />
            <TextField label="Référence FAT" value={data.fat_ref} onChange={(v) => update("fat_ref", v)} />
            <TextField label="Port" value={data.port} onChange={(v) => update("port", v)} />
            <div className="form-field">
              <span>Ports disponibles (1 à 8)</span>
              {PORTS_DISPONIBLES.map((port) => (
                <CheckField
                  key={port}
                  label={port}
                  checked={selectedPorts.includes(port)}
                  onChange={() => togglePortDisponible(port)}
                />
              ))}
              {!data.ports_disponibles && Number(data.port_disponible) > 0 && (
                <small>Ancienne fiche : {data.port_disponible} port(s) enregistré(s), ports précis non définis.</small>
              )}
            </div>

            <TextField label="Type de câble" value={data.type_cable} onChange={(v) => update("type_cable", v)} />
            <TextField label="Départ (m)" type="number" value={data.depart_m} onChange={(v) => update("depart_m", v)} />
            <TextField label="Arrivée (m)" type="number" value={data.arrivee_m} onChange={(v) => update("arrivee_m", v)} />
            <TextField label="Linéaire (m, calculé)" type="number" value={data.lineaire_m} onChange={() => {}} />

            <TextField label="Puissance FAT (dBm)" type="number" value={data.puissance_fat_dbm} onChange={(v) => update("puissance_fat_dbm", v)} />
            <TextField label="Puissance PTO (dBm)" type="number" value={data.puissance_pto_dbm} onChange={(v) => update("puissance_pto_dbm", v)} />
            <TextField label="MAC" value={data.mac} onChange={(v) => update("mac", v)} />
            <TextField label="SN (ONT)" value={data.sn} onChange={(v) => update("sn", v)} />

            <p className="gps-status">
              Poteaux traversés : <strong>{String(data.nb_poteaux_traverses).padStart(2, "0")}</strong>
              {"  -  "}
              Poteaux implantés : <strong>{String(data.nb_poteaux_implantes).padStart(2, "0")}</strong>
              {"  -  "}
              Poteaux armés : <strong>{String(data.nb_poteaux_armes ?? 0).padStart(2, "0")}</strong>
              <br />
              <small>Calculé automatiquement à partir des points GPS relevés.</small>
            </p>

            <h3>Matériel posé (champs du rapport WhatsApp)</h3>
            <div className="materiel-grid">
              {MATERIEL_STANDARD.map(({ key, label }) => (
                <label key={key} className="materiel-item">
                  <span>{label}</span>
                  <input
                    type="number"
                    min="0"
                    value={data.materiel_pose[key] ?? 0}
                    onChange={(e) => updateMateriel(key, e.target.value)}
                  />
                </label>
              ))}
            </div>

            <h3>Autre matériel (facultatif)</h3>
            <form className="stock-form" onSubmit={handleAddMateriel}>
              <label className="form-field">
                <span>Matériau (existant ou nouveau)</span>
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
              </label>
              <label className="form-field">
                <span>Quantité</span>
                <input
                  type="number"
                  min="1"
                  value={newMaterielQte}
                  onChange={(e) => setNewMaterielQte(e.target.value)}
                />
              </label>
              <button type="submit" className="btn-primary">
                + Ajouter
              </button>
            </form>
            {materielFeedback && <p className="gps-status">{materielFeedback}</p>}

            <div className="materiel-grid">
              {Object.entries(data.materiel_pose)
                .filter(([d]) => !MATERIEL_STANDARD.some((m) => m.key === d))
                .map(([d, qte]) => (
                  <label key={d} className="materiel-item">
                    <span>{d}</span>
                    <input
                      type="number"
                      min="0"
                      value={qte}
                      onChange={(e) => updateMateriel(d, e.target.value)}
                    />
                    <button type="button" className="btn-secondary" onClick={() => removeMateriel(d)}>
                      Retirer
                    </button>
                  </label>
                ))}
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

            <h3>Points enregistrés ({data.points_gps.length})</h3>
            <ul className="gps-list">
              {data.points_gps.map((point, idx) => (
                <li key={idx}>
                  <img src={point.photo} alt={point.type} className="gps-thumb" />
                  <div>
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
            <TextField label="ONT / SN" value={data.ont_sn} onChange={(v) => update("ont_sn", v)} />
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
    </div>
  );
}
