import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  solveOptimalTour,
  buildNavigationUrl,
  buildNativeGeoUri,
  searchAddressNominatim,
  parseCoordinateInput,
  formatDistance,
  formatEstimatedDuration,
} from "../lib/routeOptimizer.js";
import { getCurrentPositionHighAccuracy, reverseGeocodeZone } from "../lib/geo.js";
import {
  IconMap,
  IconMapPin,
  IconNavigation,
  IconCrosshair,
  IconRoute,
  IconArrowLeft,
  IconSearch,
  IconPhone,
  IconSmartphone,
  IconZap,
  IconAlertTriangle,
  IconCheck,
  IconRefresh,
  IconUnlock,
  IconBox,
  IconServer,
} from "./Icons.jsx";

/**
 * Composant de cartographie interactive et d'optimisation intelligente de tournée.
 * Permet aux techniciens de :
 * 1. Visualiser instantanément l'ensemble de leurs clients du jour sur une mini-carte interactive intégrée.
 * 2. Savoir immédiatement par quel client commencer (le plus proche de leur position).
 * 3. Repérer les clients situés dans le même secteur géographique pour les regrouper.
 * 4. Rechercher une rue / quartier ou coller des coordonnées pour localiser un client à la volée.
 * 5. Cliquer / déplacer l'épingle sur la carte pour ajuster manuellement la position exacte.
 * 6. Appliquer l'ordre optimisé à la feuille de route en 1 clic.
 * 7. Lancer le guidage GPS (Google Maps / Waze) directement vers le client choisi.
 */
export default function TourneeMapView({
  dossiers = [],
  selectedDate = "",
  onClose,
  onSaveIntervention,
  onOpenIntervention,
}) {
  // Position GPS du technicien (live ou secours)
  const [technicianPos, setTechnicianPos] = useState(null);
  const [locatingTech, setLocatingTech] = useState(false);
  const [techError, setTechError] = useState("");

  // Dossier sélectionné pour modification / placement d'épingle
  const [selectedDossierId, setSelectedDossierId] = useState(null);
  const [isPinModeActive, setIsPinModeActive] = useState(false);
  const [tempCoords, setTempCoords] = useState(null);
  const [tempZoneName, setTempZoneName] = useState("");

  // Recherche d'adresse / rue / quartier
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Message de confirmation (toast)
  const [toastMessage, setToastMessage] = useState("");

  // Références Leaflet
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const techMarkerRef = useRef(null);

  // 1. Acquisition de la position du technicien
  const acquireTechPosition = useCallback(async () => {
    setLocatingTech(true);
    setTechError("");
    try {
      const pos = await getCurrentPositionHighAccuracy();
      if (pos?.coords) {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10,
        };
        setTechnicianPos(coords);
      }
    } catch (err) {
      console.warn("TourneeMapView: Impossible de récupérer la position GPS live :", err.message);
      // Fallback par défaut sur Cotonou / Littoral pour centrer la carte
      setTechnicianPos((prev) => prev || { lat: 6.3703, lng: 2.3912, accuracy: 50, isDefault: true });
      setTechError("Signal GPS smartphone indisponible : position approximative utilisée.");
    } finally {
      setLocatingTech(false);
    }
  }, []);

  useEffect(() => {
    acquireTechPosition();
  }, [acquireTechPosition]);

  // 2. Résolution de l'optimisation de tournée
  const tourOptimization = useMemo(() => {
    return solveOptimalTour(technicianPos, dossiers);
  }, [technicianPos, dossiers]);

  const {
    recommendedFirst,
    orderedDossiers,
    unlocatedDossiers,
    formattedTotalDistance,
    formattedTotalDuration,
    legs,
    clusters,
  } = tourOptimization;

  // Dossier actuellement sélectionné
  const activeDossier = useMemo(() => {
    if (!selectedDossierId) return orderedDossiers[0] || unlocatedDossiers[0] || null;
    return (
      dossiers.find((d) => String(d.id) === String(selectedDossierId)) ||
      orderedDossiers[0] ||
      null
    );
  }, [selectedDossierId, dossiers, orderedDossiers, unlocatedDossiers]);

  // Toast temporaire
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 3500);
  }, []);

  // 3. Initialisation de la carte Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // Déjà initialisée

    // Coordonnées de démarrage (Bénin / Cotonou par défaut)
    const initialLat = technicianPos?.lat || 6.3703;
    const initialLng = technicianPos?.lng || 2.3912;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 14,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Fond de carte OpenStreetMap avec tuiles haute résolution
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    // Couche pour les marqueurs
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    // Clic sur la carte pour déposer / ajuster une épingle client
    map.on("click", async (e) => {
      const { lat, lng } = e.latlng;
      setTempCoords({ lat, lng });
      setIsPinModeActive(true);
      // Géocodage inversé de la zone cliquée
      const zone = await reverseGeocodeZone(lat, lng);
      setTempZoneName(zone || "Position pointée sur la carte");
    });

    mapInstanceRef.current = map;

    return () => {
      try {
        map.remove();
      } catch {}
      mapInstanceRef.current = null;
    };
  }, []);

  // 4. Recadrage / Mise à jour des marqueurs et du tracé
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    if (routePolylineRef.current) {
      try {
        map.removeLayer(routePolylineRef.current);
      } catch {}
      routePolylineRef.current = null;
    }

    const bounds = [];

    // A. Marqueur Technicien (Moi)
    if (technicianPos) {
      bounds.push([technicianPos.lat, technicianPos.lng]);

      const techIconHtml = `
        <div class="leaflet-marker-tech">
          <div class="pulse-ring"></div>
          <div class="tech-center-dot">
            <span style="font-size: 13px; line-height: 1;">👷</span>
          </div>
          <span class="tech-label">Moi</span>
        </div>
      `;

      const techIcon = L.divIcon({
        className: "custom-div-icon tech-div-icon",
        html: techIconHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const tMarker = L.marker([technicianPos.lat, technicianPos.lng], { icon: techIcon })
        .bindPopup(
          `<div style="font-family: inherit; font-size: 13px; padding: 4px;">
            <strong>📍 Ma position actuelle</strong><br/>
            <span style="color: #64748b;">Précision : ±${Math.round(technicianPos.accuracy || 10)}m</span>
          </div>`
        )
        .addTo(layer);

      techMarkerRef.current = tMarker;
    }

    // B. Marqueurs Clients Ordonnés
    const routeCoords = [];
    if (technicianPos) {
      routeCoords.push([technicianPos.lat, technicianPos.lng]);
    }

    orderedDossiers.forEach((dossier, idx) => {
      const lat = dossier.lat;
      const lng = dossier.lng;
      bounds.push([lat, lng]);
      routeCoords.push([lat, lng]);

      const isFirst = idx === 0;
      const isSelected = activeDossier && String(activeDossier.id) === String(dossier.id);
      const stepNumber = idx + 1;

      const markerHtml = `
        <div class="leaflet-marker-client ${isFirst ? "marker-first" : ""} ${isSelected ? "marker-active" : ""}">
          <div class="marker-pin-badge">
            <span class="step-num">${stepNumber}</span>
          </div>
          <div class="marker-caption">${escapeHtml(dossier.nom_client || `Client #${stepNumber}`)}</div>
        </div>
      `;

      const clientIcon = L.divIcon({
        className: "custom-div-icon client-div-icon",
        html: markerHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 42],
        popupAnchor: [0, -40],
      });

      const navUrl = buildNavigationUrl(lat, lng, dossier.nom_client);
      const phone = dossier.mobile || dossier.telephone_ligne || "";

      const popupHtml = `
        <div class="map-popup-card">
          <div class="popup-badge">Arrêt #${stepNumber} ${isFirst ? "• Recommandé pour démarrer" : ""}</div>
          <h4 class="popup-title">${escapeHtml(dossier.nom_client || "Client")}</h4>
          <div class="popup-zone">${escapeHtml(dossier.adresse_zone || "Zone non spécifiée")}</div>
          ${dossier.fat_ref ? `<div class="popup-detail">FAT : <strong>${escapeHtml(dossier.fat_ref)}</strong></div>` : ""}
          <div class="popup-actions">
            ${phone ? `<a href="tel:${escapeHtml(phone)}" class="popup-btn btn-call">📞 Appeler</a>` : ""}
            <a href="${navUrl}" target="_blank" rel="noopener noreferrer" class="popup-btn btn-nav">🧭 Naviguer (Maps)</a>
          </div>
        </div>
      `;

      const marker = L.marker([lat, lng], { icon: clientIcon })
        .bindPopup(popupHtml)
        .addTo(layer);

      marker.on("click", () => {
        setSelectedDossierId(dossier.id);
      });
    });

    // C. Marqueur temporaire si l'utilisateur clique sur la carte pour positionner un client
    if (tempCoords) {
      bounds.push([tempCoords.lat, tempCoords.lng]);

      const tempIconHtml = `
        <div class="leaflet-marker-client marker-temp">
          <div class="marker-pin-badge">
            <span>📍</span>
          </div>
          <div class="marker-caption">Nouvelle position</div>
        </div>
      `;

      const tempIcon = L.divIcon({
        className: "custom-div-icon temp-div-icon",
        html: tempIconHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 42],
      });

      L.marker([tempCoords.lat, tempCoords.lng], { icon: tempIcon })
        .bindPopup(`<strong>Nouvelle position pointée</strong><br/>${tempZoneName}`)
        .openPopup()
        .addTo(layer);
    }

    // D. Tracé du parcours optimal (Polyline stylisée)
    if (routeCoords.length >= 2) {
      const polyline = L.polyline(routeCoords, {
        color: "#2563eb",
        weight: 4,
        opacity: 0.85,
        dashArray: "8, 8",
        lineCap: "round",
      }).addTo(map);

      routePolylineRef.current = polyline;
    }

    // Recadrage automatique de la vue pour tout afficher
    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } catch {}
    }
  }, [technicianPos, orderedDossiers, activeDossier, tempCoords, tempZoneName]);

  // Action : Centrer la carte sur la position actuelle
  const handleCenterOnMe = () => {
    if (!mapInstanceRef.current || !technicianPos) {
      acquireTechPosition();
      return;
    }
    mapInstanceRef.current.setView([technicianPos.lat, technicianPos.lng], 16, { animate: true });
  };

  // Action : Recadrer la carte sur tous les arrêts
  const handleFitAll = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const points = [];
    if (technicianPos) points.push([technicianPos.lat, technicianPos.lng]);
    orderedDossiers.forEach((d) => points.push([d.lat, d.lng]));
    if (tempCoords) points.push([tempCoords.lat, tempCoords.lng]);
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    }
  };

  // Action : Recherche d'adresse via Nominatim
  const handleSearchSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!searchQuery.trim()) return;

    // Vérifier si c'est directement des coordonnées GPS collées
    const directCoords = parseCoordinateInput(searchQuery);
    if (directCoords) {
      setTempCoords(directCoords);
      setIsPinModeActive(true);
      const zone = await reverseGeocodeZone(directCoords.lat, directCoords.lng);
      setTempZoneName(zone || "Coordonnées manuelles");
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([directCoords.lat, directCoords.lng], 16, { animate: true });
      }
      return;
    }

    setSearching(true);
    try {
      const results = await searchAddressNominatim(searchQuery, "bj");
      setSearchResults(results);
      if (results.length === 0) {
        showToast("Aucun résultat trouvé au Bénin pour cette recherche.");
      }
    } catch (err) {
      showToast("Erreur lors de la recherche : " + err.message);
    } finally {
      setSearching(false);
    }
  };

  // Action : Sélection d'un résultat de recherche
  const handleSelectSearchResult = (result) => {
    const coords = { lat: result.lat, lng: result.lng };
    setTempCoords(coords);
    setTempZoneName(result.zone || result.display_name.split(",")[0]);
    setIsPinModeActive(true);
    setSearchResults([]);
    setSearchQuery("");
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([coords.lat, coords.lng], 16, { animate: true });
    }
  };

  // Action : Sauvegarder la position (tempCoords) sur le dossier sélectionné
  const handleSavePositionToDossier = () => {
    if (!activeDossier || !tempCoords) return;

    // Mise à jour de points_gps avec un point Abonné
    const prevPoints = Array.isArray(activeDossier.points_gps) ? [...activeDossier.points_gps] : [];
    const abonneIdx = prevPoints.findIndex(
      (p) => p && /abonné|abonne|client|ont/i.test(p.type || p.label || "")
    );

    const newAbonnePoint = {
      id: abonneIdx >= 0 ? prevPoints[abonneIdx].id : `pt_abonne_${Date.now()}`,
      type: "Abonné",
      label: "Position Client / ONT",
      lat: tempCoords.lat,
      lng: tempCoords.lng,
      precision_m: 5,
      date_capture: new Date().toISOString(),
    };

    if (abonneIdx >= 0) {
      prevPoints[abonneIdx] = newAbonnePoint;
    } else {
      prevPoints.unshift(newAbonnePoint);
    }

    const updatedDossier = {
      ...activeDossier,
      latitude: tempCoords.lat,
      longitude: tempCoords.lng,
      adresse_zone: tempZoneName || activeDossier.adresse_zone,
      points_gps: prevPoints,
      modifie_le: new Date().toISOString(),
      changed_fields: ["latitude", "longitude", "adresse_zone", "points_gps", "modifie_le"],
    };

    if (onSaveIntervention) {
      onSaveIntervention(updatedDossier);
    }

    setTempCoords(null);
    setIsPinModeActive(false);
    showToast(`Position enregistrée pour ${activeDossier.nom_client || "le client"} !`);
  };

  // Action : Appliquer l'ordre optimisé à la feuille de route
  const handleApplyOptimizedOrder = async () => {
    if (orderedDossiers.length === 0) return;

    orderedDossiers.forEach((dossier, idx) => {
      const newOrder = idx + 1;
      const updated = {
        ...dossier,
        tournee_ordre: newOrder,
        modifie_le: new Date().toISOString(),
        changed_fields: ["tournee_ordre", "modifie_le"],
      };
      if (onSaveIntervention) {
        onSaveIntervention(updated);
      }
    });

    showToast("⚡ Ordre optimisé appliqué avec succès à la tournée !");
  };

  return (
    <div className="tournee-map-screen">
      {/* ===== EN-TÊTE DE NAVIGATION ===== */}
      <div className="map-view-header">
        <div className="header-left">
          <button
            type="button"
            className="btn-back-pill"
            onClick={onClose}
            title="Revenir à la feuille de route"
          >
            <IconArrowLeft size={16} />
            <span>Feuille de route</span>
          </button>
          <div>
            <h2 className="map-screen-title">
              <IconMap size={20} color="var(--primary, #2563eb)" style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Cartographie & Optimiseur de Tournée
            </h2>
            <div className="map-screen-sub">
              {orderedDossiers.length} dossier{orderedDossiers.length > 1 ? "s" : ""} localisé{orderedDossiers.length > 1 ? "s" : ""} • Trajet estimé :{" "}
              <strong>{formattedTotalDistance}</strong> (~{formattedTotalDuration})
            </div>
          </div>
        </div>

        <div className="header-right">
          <button
            type="button"
            className="btn-tech-pos"
            onClick={acquireTechPosition}
            disabled={locatingTech}
            title="Actualiser ma position GPS"
          >
            <IconRefresh size={14} className={locatingTech ? "spin-icon" : ""} />
            <span>{locatingTech ? "Localisation…" : "Ma position"}</span>
          </button>
          {orderedDossiers.length > 1 && (
            <button
              type="button"
              className="btn-apply-order-cta"
              onClick={handleApplyOptimizedOrder}
              title="Réorganiser la feuille de route selon l'ordre optimal"
            >
              <IconRoute size={16} />
              <span>Appliquer l&apos;ordre optimisé</span>
            </button>
          )}
        </div>
      </div>

      {/* ===== BANDEAU D'ALERTE / TOAST ===== */}
      {toastMessage && (
        <div className="map-toast-banner">
          <IconCheck size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {techError && (
        <div className="map-warning-bar">
          <IconAlertTriangle size={15} />
          <span>{techError}</span>
        </div>
      )}

      {/* ===== BANDEAU RECOMMANDATION DÉPART & REGROUPEMENT SECTEURS ===== */}
      <div className="tournee-recommendation-card">
        {recommendedFirst ? (
          <div className="recommendation-content">
            <div className="rec-badge">
              <IconZap size={16} color="#eab308" />
              <span>Recommandation de départ</span>
            </div>
            <div className="rec-text">
              Commencez par <strong>{recommendedFirst.nom_client || "le client le plus proche"}</strong> (à{" "}
              <strong>{legs[0]?.formattedDistance || "proximité"}</strong> de votre position actuelle).
            </div>
            <div className="rec-cta">
              <a
                href={buildNavigationUrl(recommendedFirst.lat, recommendedFirst.lng, recommendedFirst.nom_client)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-start-nav"
              >
                <IconNavigation size={14} />
                <span>Naviguer vers le 1er client</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="recommendation-content">
            <div className="rec-text">
              Aucun dossier n&apos;a encore été localisé. Utilisez la barre de recherche ou cliquez sur la carte pour positionner les clients.
            </div>
          </div>
        )}

        {/* Alerte si des clients sont dans le même secteur */}
        {clusters.length > 0 && (
          <div className="clusters-bar">
            {clusters.map((c) => (
              <span key={c.clusterId} className="cluster-pill">
                📍 <strong>Même zone ({c.zone}) :</strong> {c.description}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ===== ZONE DE LA MINI-CARTE INTERACTIVE ===== */}
      <div className="map-visual-container">
        <div ref={mapContainerRef} className="leaflet-map-canvas" />

        {/* Boutons flottants de contrôle rapide */}
        <div className="map-floating-controls">
          <button
            type="button"
            className="floating-btn"
            onClick={handleCenterOnMe}
            title="Centrer sur ma position"
          >
            <IconCrosshair size={18} />
          </button>
          <button
            type="button"
            className="floating-btn"
            onClick={handleFitAll}
            title="Voir tous les arrêts"
          >
            <IconMap size={18} />
          </button>
          <button
            type="button"
            className={`floating-btn ${searchOpen ? "active" : ""}`}
            onClick={() => setSearchOpen(!searchOpen)}
            title="Rechercher une rue ou quartier"
          >
            <IconSearch size={18} />
          </button>
        </div>

        {/* Volet de recherche d'adresse / rue / quartier */}
        {searchOpen && (
          <div className="map-search-panel">
            <form onSubmit={handleSearchSubmit} className="search-form-row">
              <input
                type="text"
                className="map-search-input"
                placeholder="Ex: Agla, Fidjrossè Calvaire, ou collez coordonnées GPS (6.37, 2.39)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button type="submit" className="map-search-submit" disabled={searching}>
                {searching ? "…" : "Chercher"}
              </button>
              <button
                type="button"
                className="map-search-close"
                onClick={() => setSearchOpen(false)}
              >
                ✕
              </button>
            </form>

            {/* Résultats Nominatim */}
            {searchResults.length > 0 && (
              <div className="map-search-results">
                {searchResults.map((r, i) => (
                  <div
                    key={i}
                    className="search-result-item"
                    onClick={() => handleSelectSearchResult(r)}
                  >
                    <IconMapPin size={14} color="var(--primary)" />
                    <div>
                      <div className="res-title">{r.zone || r.display_name.split(",")[0]}</div>
                      <div className="res-sub">{r.display_name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Barre d'action quand une nouvelle position est pointée sur la carte */}
        {tempCoords && activeDossier && (
          <div className="map-pin-adjust-bar">
            <div className="pin-info">
              <IconMapPin size={18} color="#2563eb" />
              <div>
                <strong>Positionner : {activeDossier.nom_client || "Client"}</strong>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {tempZoneName} ({tempCoords.lat.toFixed(5)}, {tempCoords.lng.toFixed(5)})
                </div>
              </div>
            </div>
            <div className="pin-actions">
              <button
                type="button"
                className="btn-cancel-pin"
                onClick={() => setTempCoords(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-confirm-pin"
                onClick={handleSavePositionToDossier}
              >
                Enregistrer sur ce dossier
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== SÉLECTEUR DE DOSSIER ET GESTION RAPIDE DU POSITIONNEMENT ===== */}
      <div className="map-dossiers-section">
        <div className="section-header-row">
          <h3 className="section-title">
            <IconRoute size={18} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Feuille de route séquentielle optimisée ({orderedDossiers.length})
          </h3>
          <div className="dossier-selector-wrap">
            <label htmlFor="select-dossier-focus" style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 6 }}>
              Ajuster la position de :
            </label>
            <select
              id="select-dossier-focus"
              className="dossier-select-input"
              value={activeDossier?.id || ""}
              onChange={(e) => {
                const found = dossiers.find((d) => String(d.id) === String(e.target.value));
                if (found) {
                  setSelectedDossierId(found.id);
                  if (found.lat && found.lng && mapInstanceRef.current) {
                    mapInstanceRef.current.setView([found.lat, found.lng], 16, { animate: true });
                  }
                }
              }}
            >
              {dossiers.map((d, i) => (
                <option key={d.id} value={d.id}>
                  #{d.tournee_ordre || i + 1} - {d.nom_client || "Sans nom"} {d.lat ? "✓" : "⚠️ non localisé"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Liste des étapes de l'itinéraire ordonné */}
        <div className="itinerary-steps-grid">
          {legs.map((leg) => {
            const dossier = leg.toDossier;
            const isSelected = activeDossier && String(activeDossier.id) === String(dossier.id);
            const navUrl = buildNavigationUrl(dossier.lat, dossier.lng, dossier.nom_client);
            const phone = dossier.mobile || dossier.telephone_ligne || "";

            return (
              <div
                key={dossier.id}
                className={`itinerary-step-card ${leg.isFirst ? "step-card-first" : ""} ${isSelected ? "step-card-selected" : ""}`}
                onClick={() => {
                  setSelectedDossierId(dossier.id);
                  if (mapInstanceRef.current && dossier.lat && dossier.lng) {
                    mapInstanceRef.current.setView([dossier.lat, dossier.lng], 16, { animate: true });
                  }
                }}
              >
                <div className="step-card-top">
                  <div className="step-num-pill">
                    <span>Arrêt #{leg.stepNumber}</span>
                    {leg.isFirst && <span className="start-chip">🚀 Démarrer ici</span>}
                  </div>
                  <div className="step-distance-badge">
                    <span>{leg.formattedDistance}</span>
                    <span className="step-time">({leg.formattedDuration})</span>
                  </div>
                </div>

                <div className="step-client-info">
                  <h4 className="client-name">{dossier.nom_client || "Client sans nom"}</h4>
                  <div className="client-zone">
                    <IconMapPin size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                    {dossier.adresse_zone || "Zone non spécifiée"}
                  </div>

                  <div className="step-meta-chips">
                    {dossier.fat_ref && (
                      <span className="meta-chip">
                        <IconBox size={11} style={{ marginRight: 3 }} />
                        {dossier.fat_ref}
                      </span>
                    )}
                    {dossier.msan && (
                      <span className="meta-chip">
                        <IconServer size={11} style={{ marginRight: 3 }} />
                        {dossier.msan}
                      </span>
                    )}
                  </div>
                </div>

                <div className="step-card-actions" onClick={(e) => e.stopPropagation()}>
                  {phone && (
                    <a href={`tel:${phone}`} className="step-action-btn btn-call" title="Appeler le client">
                      <IconPhone size={14} />
                      <span>Appeler</span>
                    </a>
                  )}
                  <a
                    href={navUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="step-action-btn btn-nav"
                    title="Ouvrir le guidage GPS dans Google Maps"
                  >
                    <IconNavigation size={14} />
                    <span>Naviguer</span>
                  </a>
                  {onOpenIntervention && (
                    <button
                      type="button"
                      className="step-action-btn btn-start"
                      onClick={() => onOpenIntervention(dossier)}
                      title="Ouvrir l'intervention"
                    >
                      <IconUnlock size={14} />
                      <span>Ouvrir</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dossiers non encore localisés */}
        {unlocatedDossiers.length > 0 && (
          <div className="unlocated-dossiers-box">
            <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#b45309", display: "flex", alignItems: "center", gap: 6 }}>
              <IconAlertTriangle size={16} />
              Dossiers en attente de coordonnées GPS ({unlocatedDossiers.length})
            </h4>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>
              Ces clients n&apos;ont pas encore de position GPS enregistrée. Sélectionnez un dossier et tapez la rue ou cliquez sur la carte pour l&apos;ajouter au trajet :
            </p>
            <div className="unlocated-list">
              {unlocatedDossiers.map((d) => (
                <div key={d.id} className="unlocated-item">
                  <span className="unlocated-name">{d.nom_client || "Dossier"}</span>
                  <span className="unlocated-phone">{d.mobile || d.telephone_ligne || "--"}</span>
                  <button
                    type="button"
                    className="btn-locate-client"
                    onClick={() => {
                      setSelectedDossierId(d.id);
                      setSearchOpen(true);
                      setSearchQuery(d.adresse_zone || d.nom_client || "");
                    }}
                  >
                    <IconMapPin size={13} />
                    <span>Localiser sur la carte</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== STYLES DU COMPOSANT CARTOGRAPHIQUE ===== */}
      <style>{`
        .tournee-map-screen {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin: 0 auto;
          max-width: 1040px;
          padding-bottom: 40px;
        }

        .map-view-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--bg-card, #ffffff);
          border: 1.5px solid var(--border, #e2e8f0);
          border-radius: 14px;
          padding: 12px 16px;
          gap: 12px;
          flex-wrap: wrap;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .btn-back-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--bg, #f1f5f9);
          border: 1px solid var(--border, #cbd5e1);
          color: var(--text, #1e293b);
          font-weight: 600;
          font-size: 13px;
          padding: 7px 12px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-back-pill:hover {
          background: #e2e8f0;
        }

        .map-screen-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: var(--text, #0f172a);
        }

        .map-screen-sub {
          font-size: 12px;
          color: var(--text-muted, #64748b);
          margin-top: 2px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .btn-tech-pos {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          background: var(--bg, #f8fafc);
          border: 1.5px solid var(--border, #cbd5e1);
          color: var(--text, #334155);
          cursor: pointer;
        }

        .btn-apply-order-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          background: #16a34a;
          color: #ffffff;
          border: none;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(22, 163, 74, 0.25);
          transition: background 0.2s;
        }
        .btn-apply-order-cta:hover {
          background: #15803d;
        }

        .map-toast-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #dcfce7;
          border: 1px solid #86efac;
          color: #166534;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          animation: fadeIn 0.2s ease-in;
        }

        .map-warning-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fef3c7;
          border: 1px solid #fde68a;
          color: #92400e;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
        }

        /* Recommandation de départ */
        .tournee-recommendation-card {
          background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
          border: 1.5px solid #bfdbfe;
          border-radius: 14px;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .recommendation-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .rec-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #fef08a;
          color: #854d0e;
          font-weight: 700;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 6px;
        }

        .rec-text {
          font-size: 14px;
          color: #1e3a8a;
          flex: 1;
        }

        .btn-start-nav {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #2563eb;
          color: #ffffff;
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
        }

        .clusters-bar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          padding-top: 6px;
          border-top: 1px dashed #cbd5e1;
        }

        .cluster-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #334155;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 20px;
        }

        /* Zone de la carte */
        .map-visual-container {
          position: relative;
          width: 100%;
          height: 380px;
          border-radius: 14px;
          overflow: hidden;
          border: 1.5px solid var(--border, #cbd5e1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .leaflet-map-canvas {
          width: 100%;
          height: 100%;
          background: #e2e8f0;
        }

        .map-floating-controls {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .floating-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #ffffff;
          border: 1.5px solid #cbd5e1;
          color: #1e293b;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
          transition: all 0.2s;
        }
        .floating-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .floating-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }

        /* Volet recherche */
        .map-search-panel {
          position: absolute;
          top: 12px;
          left: 12px;
          right: 60px;
          z-index: 1001;
          background: #ffffff;
          border-radius: 10px;
          padding: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          border: 1.5px solid #94a3b8;
        }

        .search-form-row {
          display: flex;
          gap: 6px;
        }

        .map-search-input {
          flex: 1;
          padding: 8px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
        }

        .map-search-submit {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 0 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .map-search-close {
          background: transparent;
          border: none;
          font-size: 14px;
          padding: 0 6px;
          color: #64748b;
          cursor: pointer;
        }

        .map-search-results {
          margin-top: 8px;
          max-height: 180px;
          overflow-y: auto;
          border-top: 1px solid #f1f5f9;
        }

        .search-result-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 8px 6px;
          border-bottom: 1px solid #f8fafc;
          cursor: pointer;
        }
        .search-result-item:hover {
          background: #f1f5f9;
        }

        .res-title {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }
        .res-sub {
          font-size: 11px;
          color: #64748b;
        }

        /* Barre d'ajustement du pin */
        .map-pin-adjust-bar {
          position: absolute;
          bottom: 12px;
          left: 12px;
          right: 12px;
          z-index: 1000;
          background: #ffffff;
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
          border: 2px solid #2563eb;
        }

        .pin-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pin-actions {
          display: flex;
          gap: 8px;
        }

        .btn-cancel-pin {
          padding: 6px 12px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }

        .btn-confirm-pin {
          padding: 6px 14px;
          border: none;
          background: #16a34a;
          color: #ffffff;
          font-weight: 700;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }

        /* Marqueurs Leaflet */
        .custom-div-icon {
          background: transparent;
          border: none;
        }

        .leaflet-marker-tech {
          position: relative;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pulse-ring {
          position: absolute;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(37, 99, 235, 0.35);
          animation: pulsePing 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }

        .tech-center-dot {
          position: relative;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #2563eb;
          border: 2px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        }

        .tech-label {
          position: absolute;
          bottom: -16px;
          left: 50%;
          transform: translateX(-50%);
          background: #1e293b;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 4px;
          white-space: nowrap;
        }

        @keyframes pulsePing {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        .leaflet-marker-client {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .marker-pin-badge {
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 0;
          background: #2563eb;
          transform: rotate(-45deg);
          border: 2px solid #ffffff;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .marker-pin-badge span {
          transform: rotate(45deg);
          color: #ffffff;
          font-weight: 800;
          font-size: 12px;
        }

        .marker-first .marker-pin-badge {
          background: #eab308;
          border-color: #fef08a;
        }

        .marker-first .marker-pin-badge span {
          color: #713f12;
        }

        .marker-active .marker-pin-badge {
          background: #dc2626;
          transform: rotate(-45deg) scale(1.15);
        }

        .marker-caption {
          position: absolute;
          top: 34px;
          background: rgba(15, 23, 42, 0.85);
          color: #ffffff;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          pointer-events: none;
        }

        .marker-temp .marker-pin-badge {
          background: #9333ea;
        }

        /* Popup Leaflet */
        .map-popup-card {
          font-family: inherit;
          min-width: 180px;
          padding: 4px;
        }

        .popup-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: #2563eb;
          margin-bottom: 2px;
        }

        .popup-title {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }

        .popup-zone {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 6px;
        }

        .popup-detail {
          font-size: 11px;
          color: #334155;
          margin-bottom: 8px;
        }

        .popup-actions {
          display: flex;
          gap: 6px;
        }

        .popup-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 5px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          text-decoration: none;
        }
        .btn-call {
          background: #f1f5f9;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }
        .btn-nav {
          background: #2563eb;
          color: #ffffff;
        }

        /* Section étapes */
        .map-dossiers-section {
          background: var(--bg-card, #ffffff);
          border: 1.5px solid var(--border, #e2e8f0);
          border-radius: 14px;
          padding: 14px 16px;
        }

        .section-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 14px;
        }

        .section-title {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: var(--text, #0f172a);
        }

        .dossier-selector-wrap {
          display: flex;
          align-items: center;
        }

        .dossier-select-input {
          padding: 5px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          background: #ffffff;
        }

        .itinerary-steps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
        }

        .itinerary-step-card {
          background: var(--bg, #f8fafc);
          border: 1.5px solid var(--border, #cbd5e1);
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .itinerary-step-card:hover {
          border-color: #94a3b8;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
        .step-card-first {
          border-color: #facc15;
          background: #fefce8;
        }
        .step-card-selected {
          border-color: #2563eb;
          background: #eff6ff;
        }

        .step-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .step-num-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #2563eb;
        }

        .start-chip {
          background: #eab308;
          color: #713f12;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .step-distance-badge {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
        }
        .step-time {
          font-weight: 500;
          color: #64748b;
          margin-left: 4px;
        }

        .client-name {
          margin: 0 0 2px;
          font-size: 14px;
          font-weight: 700;
          color: var(--text, #0f172a);
        }

        .client-zone {
          font-size: 12px;
          color: var(--text-muted, #64748b);
        }

        .step-meta-chips {
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }

        .meta-chip {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          color: #334155;
          display: inline-flex;
          align-items: center;
        }

        .step-card-actions {
          display: flex;
          gap: 6px;
          margin-top: 6px;
        }

        .step-action-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
        }
        .step-action-btn.btn-call {
          background: #ffffff;
          border: 1.5px solid #cbd5e1;
          color: #334155;
        }
        .step-action-btn.btn-nav {
          background: #2563eb;
          border: none;
          color: #ffffff;
        }
        .step-action-btn.btn-start {
          background: #10b981;
          border: none;
          color: #ffffff;
        }

        /* Non localisés */
        .unlocated-dossiers-box {
          margin-top: 14px;
          background: #fffbeb;
          border: 1.5px dashed #fcd34d;
          border-radius: 10px;
          padding: 12px 14px;
        }

        .unlocated-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .unlocated-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 10px;
          background: #ffffff;
          border-radius: 6px;
          border: 1px solid #fef3c7;
        }

        .unlocated-name {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
        }

        .unlocated-phone {
          font-size: 12px;
          color: #64748b;
        }

        .btn-locate-client {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #f59e0b;
          color: #ffffff;
          border: none;
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        @media (max-width: 640px) {
          .map-visual-container {
            height: 300px;
          }
          .itinerary-steps-grid {
            grid-template-columns: 1fr;
          }
          .map-view-header {
            flex-direction: column;
            align-items: stretch;
          }
          .header-right {
            justify-content: space-between;
          }
        }
      `}</style>
    </div>
  );
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
