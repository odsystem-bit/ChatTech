// Widget Flottant ChapTech CelPros
// Interface injectée dans la page CelPros / FAT Automation

(function (root, factory) {
  const g = typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this);
  if (typeof define === "function" && define.amd) {
    define(["./field-mapping", "./form-filler"], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory(g.FieldMapping, g.FormFiller);
  } else {
    g.CelprosWidget = factory(g.FieldMapping, g.FormFiller);
  }
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this), function (FieldMapping, FormFiller) {
  "use strict";

  class CelprosWidget {
    constructor() {
      this.container = null;
      this.isCollapsed = false;
      this.interventions = [];
      this.selectedIntervention = null;
      this.selectedFingerprint = "";
      this.apiStatus = "unknown"; // "connected", "error", "loading"
      this.filterText = "";
      this.statusTabFilter = "all"; // "all" (par défaut), "termine", "en_cours"
      this.lastFillReport = null;
      let savedAutoPilot = null;
      try {
        savedAutoPilot = typeof localStorage !== "undefined" ? localStorage.getItem("chaptech_autopilot_enabled") : null;
      } catch {}
      this.autoPilotEnabled = savedAutoPilot !== null ? savedAutoPilot !== "false" : true;
      this.currentStepInfo = null;
      this.lastStepFilled = null;
      this.isAutofilling = false;
      this.autofillAbortId = 0;
      this.lastAutofillTime = 0;
      this.lastServerFetchTime = 0;
      this.autofillCooldownMs = 1200;
      this.observer = null;
      this.autoFillTimeout = null;
      this.pollingInterval = null;
    }

    canAutoFill() {
      return Boolean(this.autoPilotEnabled && this.selectedIntervention && !this.isAutofilling);
    }

    setAutoPilotState(enabled, persist = true) {
      const next = Boolean(enabled);
      this.autoPilotEnabled = next;
      if (!next) {
        if (this.autoFillTimeout) {
          clearTimeout(this.autoFillTimeout);
          this.autoFillTimeout = null;
        }
        this.autofillAbortId++;
      }
      const toggle = typeof document !== "undefined" ? document.getElementById("chaptech-toggle-autopilot") : null;
      if (toggle && toggle.checked !== next) {
        toggle.checked = next;
      }
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("chaptech_autopilot_enabled", String(next));
        }
      } catch {}
      if (persist && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        Promise.resolve(
          chrome.storage.local.set({ autoPilotEnabled: next, chaptech_autopilot_enabled: next })
        ).catch(() => {});
      }
    }

    computeInterventionFingerprint(item) {
      if (!item || typeof item !== "object" || !item.id) return "";
      const wa = Array.isArray(item.whatsapp_photos)
        ? item.whatsapp_photos.map((p) => `${p?.id || ""}:${p?.slot || ""}:${(p?.url || "").slice(-24)}`).join("|")
        : String(item.whatsapp_photos || "");
      const gps = Array.isArray(item.points_gps)
        ? item.points_gps.map((p) => `${p?.id || ""}:${p?.type || ""}:${p?.numero || ""}:${p?.lat || ""}:${p?.lng || ""}:${(p?.photo || "").slice(-24)}`).join("|")
        : String(item.points_gps || "");
      const mat = item.materiel_pose && typeof item.materiel_pose === "object"
        ? JSON.stringify(item.materiel_pose)
        : String(item.materiel_pose || "");
      return [
        String(item.id),
        String(item.updated_at || item.modifie_le || ""),
        String(item.statut || ""),
        String(item.nom_client || item.nom_dossier || ""),
        String(item.fat_ref || ""),
        String(item.port || ""),
        String(item.ont_sn || item.sn || ""),
        String(item.depart_m ?? ""),
        String(item.arrivee_m ?? ""),
        String(item.puissance_fat_dbm ?? ""),
        String(item.puissance_pto_dbm ?? ""),
        wa,
        gps,
        mat,
      ].join("::");
    }

    init() {
      // Éviter l'injection multiple
      if (document.getElementById("chaptech-celpros-widget-root")) {
        return;
      }

      this.createDom();
      this.setAutoPilotState(this.autoPilotEnabled, false);
      this.attachGlobalInputTracking();
      this.loadInitialState();
      this.attachEventListeners();
      this.setupAutoPilotObserver();
      this.setupAutoSyncPolling();
      this.updateStepDisplay();
    }

    createDom() {
      const root = document.createElement("div");
      root.id = "chaptech-celpros-widget-root";
      root.className = "chaptech-widget-container";

      root.innerHTML = `
        <!-- Badge Réduit / Bouton Flottant -->
        <div class="chaptech-widget-pill" id="chaptech-pill" title="Ouvrir l'assistant ChapTech CelPros">
          <div class="pill-icon">⚡</div>
          <div class="pill-text">ChapTech CelPros</div>
          <div class="pill-status-dot status-unknown" id="chaptech-pill-status"></div>
        </div>

        <!-- Panneau Flottant Déplié -->
        <div class="chaptech-widget-panel" id="chaptech-panel">
          <!-- Entête -->
          <div class="chaptech-panel-header">
            <div class="header-brand">
              <div class="header-logo">⚡</div>
              <div class="header-title-box">
                <span class="header-title">ChapTech CelPros</span>
                <span class="header-subtitle">Automatisation Fibre Celtiis</span>
              </div>
            </div>
            <div class="header-actions">
              <div class="status-indicator" id="chaptech-status-badge" title="Statut API ChapTech">
                <span class="dot status-unknown"></span>
                <span class="status-label">Vérification...</span>
              </div>
              <button class="header-btn" id="chaptech-btn-minimize" title="Réduire le panneau">−</button>
            </div>
          </div>

          <!-- Corps du widget -->
          <div class="chaptech-panel-body">
            <!-- Barre de recherche et de sélection -->
            <div class="chaptech-section chaptech-selector-section">
              <div class="section-label-row">
                <label for="chaptech-intervention-select">Sélectionner une intervention :</label>
                <button class="btn-text-action" id="chaptech-btn-refresh" title="Recharger depuis ChapTech">🔄 Actualiser</button>
              </div>

              <!-- Filtres d'état rapides : En cours (Défaut) / Tous / Terminées -->
              <div class="chaptech-filter-pills-row" id="chaptech-filter-pills-row">
                <button type="button" class="chaptech-filter-pill is-active" data-status="all" id="filter-pill-all">
                  Tous (<span id="count-all">0</span>)
                </button>
                <button type="button" class="chaptech-filter-pill" data-status="termine" id="filter-pill-terminees">
                  ✅ Terminées (<span id="count-terminees">0</span>)
                </button>
                <button type="button" class="chaptech-filter-pill" data-status="en_cours" id="filter-pill-en-cours">
                  ⚡ En cours (<span id="count-en-cours">0</span>)
                </button>
              </div>

              <!-- Barre de recherche avec autocomplétion instantanée et bouton effacer -->
              <div class="search-input-wrap">
                <input 
                  type="text" 
                  id="chaptech-search-input" 
                  class="chaptech-input" 
                  placeholder="Tapez le nom du dossier, client, FAT, tél…" 
                  autocomplete="off"
                />
                <button type="button" class="chaptech-input-clear-btn" id="chaptech-search-clear" style="display: none;" title="Effacer la recherche">✕</button>
                <div class="chaptech-search-suggestions" id="chaptech-search-suggestions" style="display: none;"></div>
              </div>

              <!-- Liste déroulante groupée (En cours / Terminées) -->
              <div class="select-wrap">
                <select id="chaptech-intervention-select" class="chaptech-select">
                  <option value="">-- Choisir une intervention --</option>
                </select>
              </div>
            </div>

            <!-- Fiche récapitulative de l'intervention choisie -->
            <div class="chaptech-card" id="chaptech-summary-card" style="display: none;">
              <div class="card-header-line">
                <strong id="card-client-name">Nom Client</strong>
                <span class="card-status-badge" id="card-status">En cours</span>
              </div>
              <div class="card-grid">
                <div class="card-cell">
                  <span class="cell-label">Téléphone / Mobile :</span>
                  <span class="cell-val" id="card-phone">-</span>
                </div>
                <div class="card-cell">
                  <span class="cell-label">Zone / Adresse :</span>
                  <span class="cell-val" id="card-zone">-</span>
                </div>
                <div class="card-cell">
                  <span class="cell-label">FAT / PBO :</span>
                  <span class="cell-val" id="card-fat">-</span>
                </div>
                <div class="card-cell">
                  <span class="cell-label">Port raccordé :</span>
                  <span class="cell-val" id="card-port">-</span>
                </div>
                <div class="card-cell">
                  <span class="cell-label">Puiss. FAT / PTO :</span>
                  <span class="cell-val" id="card-power">-</span>
                </div>
                <div class="card-cell">
                  <span class="cell-label">SN ONT :</span>
                  <span class="cell-val" id="card-sn">-</span>
                </div>
              </div>
            </div>

            <!-- Indicateur d'étape CelPros & Mode Super-Pilote -->
            <div class="chaptech-step-box" id="chaptech-step-box">
              <div class="step-box-header">
                <span class="step-badge" id="chaptech-step-badge">Étape active : Détection…</span>
                <label class="autopilot-toggle" title="Remplir automatiquement champs et photos à chaque étape">
                  <input type="checkbox" id="chaptech-toggle-autopilot" checked />
                  <span class="autopilot-label">⚡ Super-Pilote</span>
                </label>
              </div>
              <div class="step-box-sub" id="chaptech-step-sub">Automatisation intégrale Champs &amp; Photos</div>
            </div>

            <!-- Bouton Principal d'action -->
            <div class="chaptech-actions-box">
              <button class="chaptech-btn-primary" id="chaptech-btn-autofill" disabled>
                🚀 Remplir cette étape (Champs &amp; Photos)
              </button>
            </div>

            <!-- Résultat du remplissage -->
            <div class="chaptech-result-banner" id="chaptech-fill-result" style="display: none;"></div>

            <!-- Outils rapides (Boutons secondaires) -->
            <div class="chaptech-tools-row" style="display: flex; flex-wrap: wrap; gap: 4px;">
              <button class="chaptech-btn-sub" id="chaptech-btn-copy-wa" title="Copier le Rapport Global officiel pour WhatsApp (*...*)">
                📋 Rapport Global
              </button>
              <button class="chaptech-btn-sub" id="chaptech-btn-copy-conformite" title="Copier le Rapport de Conformité épuré">
                ✅ Conformité
              </button>
              <button class="chaptech-btn-sub" id="chaptech-btn-copy-json" title="Copier les données JSON brutes">
                📦 JSON
              </button>
              <button class="chaptech-btn-sub" id="chaptech-btn-import-toggle" title="Importer du JSON">
                📥 Importer
              </button>
            </div>

            <!-- Tiroir d'importation manuelle JSON (hors-ligne) -->
            <div class="chaptech-drawer" id="chaptech-import-drawer" style="display: none;">
              <textarea 
                id="chaptech-import-textarea" 
                class="chaptech-textarea" 
                rows="4" 
                placeholder="Collez ici le JSON complet d'une intervention pour la charger hors-ligne..."
              ></textarea>
              <div class="drawer-actions">
                <button class="chaptech-btn-sub" id="chaptech-btn-import-confirm">Charger ce JSON</button>
                <button class="chaptech-btn-link" id="chaptech-btn-import-cancel">Annuler</button>
              </div>
            </div>

            <!-- Rapport d'inspection des champs détectés -->
            <div class="chaptech-details-accordion">
              <button class="accordion-toggle" id="chaptech-toggle-details">
                <span>🔍 Champs détectés sur cette page</span>
                <span class="arrow">▼</span>
              </button>
              <div class="accordion-content" id="chaptech-details-content" style="display: none;">
                <div id="chaptech-fields-breakdown" class="fields-breakdown">
                  <em>Cliquez sur "Remplir le formulaire" pour voir le rapport de détection.</em>
                </div>
              </div>
            </div>
          </div>

          <!-- Pied du widget -->
          <div class="chaptech-panel-footer">
            <small>FibreTrack &amp; ChapTech • Celtiis Bénin</small>
            <span class="footer-safety">Vérifiez avant de valider</span>
          </div>
        </div>

        <!-- Système de Toast de notification -->
        <div class="chaptech-toast-container" id="chaptech-toasts"></div>
      `;

      document.body.appendChild(root);
      this.container = root;
    }

    showToast(message, type = "info", duration = 3500) {
      const container = document.getElementById("chaptech-toasts");
      if (!container) return;

      const toast = document.createElement("div");
      toast.className = `chaptech-toast toast-${type}`;
      toast.innerHTML = message;
      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.add("toast-fadeout");
        setTimeout(() => toast.remove(), 400);
      }, duration);
    }

    parseTimestampSafely(dateStr) {
      if (!dateStr || typeof dateStr !== "string") return 0;
      let clean = dateStr.trim();
      if (!clean) return 0;
      clean = clean.replace(" ", "T");
      const hasTz = clean.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(clean);
      const normalized = hasTz ? clean : `${clean}Z`;
      const ts = Date.parse(normalized);
      if (!isNaN(ts)) return ts;
      const fallback = Date.parse(clean);
      return isNaN(fallback) ? 0 : fallback;
    }

    isInterventionOutdated(lastKnown, serverUpdatedAt) {
      if (!lastKnown) return true;
      if (!serverUpdatedAt) return false;
      const sStr = String(serverUpdatedAt).trim();
      const lStr = String(lastKnown).trim();
      if (sStr === lStr) return false;

      const sTime = this.parseTimestampSafely(sStr);
      const lTime = this.parseTimestampSafely(lStr);
      if (sTime > 0 && lTime > 0) {
        return Math.abs(sTime - lTime) >= 1000;
      }
      return sStr !== lStr;
    }

    isItemTermine(item) {
      if (!item) return false;
      const s = String(item.statut || "").trim().toLowerCase();
      const norm = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return norm === "termine" || norm === "terminee" || norm === "cloture" || norm === "cloturee" || norm === "clos" || norm === "closed" || norm === "done" || Boolean(item.date_cloture);
    }

    isInterventionFormPresent(doc = (typeof document !== "undefined" ? document : null)) {
      if (!doc || !doc.body) return false;
      // Page de connexion CelPros : NE JAMAIS interférer ni bloquer
      if (doc.querySelector('input[type="password"]')) {
        return false;
      }
      // Formulaire d'intervention présent si indicateur d'étape ou champs spécifiques
      const hasStepper = Boolean(doc.querySelector(".step, .stepper, [class*='step'], [class*='wizard'], [class*='form-wizard']"));
      const hasFields = Boolean(doc.querySelector('#field_travauxConformes, #field_ontSn, [name="ontSn"], [formcontrolname="ontSn"], [name="clientNom"], [formcontrolname="clientNom"], [class*="upload-box"]'));
      return hasStepper || hasFields;
    }

    attachGlobalInputTracking() {
      // Capture des saisies réelles de l'utilisateur pour protéger toute modification manuelle
      const markModified = (e) => {
        const target = e.target;
        if (!target) return;
        // Ignorer complètement les saisies à l'intérieur du widget ChapTech lui-même
        if (target.closest && target.closest("#chaptech-celpros-widget-root")) return;

        const tag = (target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "select" || tag === "textarea") {
          if (!target.dataset) return;
          // Si l'action provient d'une frappe réelle de l'utilisateur (e.isTrusted === true)
          // ou si la valeur actuelle diffère de celle précédemment injectée par ChapTech
          const filledVal = target.dataset.chaptechFilledValue;
          const currentVal = target.type === "checkbox" ? String(target.checked) : String(target.value);
          if (e.isTrusted === true) {
            target.dataset.chaptechUserModified = "true";
          } else if (filledVal !== undefined && currentVal !== filledVal) {
            target.dataset.chaptechUserModified = "true";
          }
        }
      };
      if (typeof document !== "undefined" && document.addEventListener) {
        document.addEventListener("input", markModified, true);
        document.addEventListener("change", markModified, true);
      }

      // Écoute de la reconnexion et de la déconnexion réseau
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("online", () => {
          this.handleNetworkReconnection();
        });
        window.addEventListener("offline", () => {
          this.setApiStatus("error", "Hors-ligne");
          this.showToast("⚠️ Connexion réseau interrompue. Mode hors-ligne activé.", "warning", 3000);
        });
      }
    }

    async handleNetworkReconnection() {
      this.setApiStatus("loading", "Reconnexion réseau...");
      this.showToast("🌐 Réseau rétabli. Synchronisation avec FibreTrack...", "info", 2500);
      try {
        await this.fetchInterventions(true);
        if (this.selectedIntervention && this.selectedIntervention.id) {
          await this.onInterventionChange(this.selectedIntervention.id, true);
        }
        this.setApiStatus("connected", "Connecté");
      } catch (err) {
        console.warn("[CelPros Widget] Erreur resync après reconnexion:", err);
      }
    }

    setupAutoSyncPolling() {
      if (this.pollingInterval) clearInterval(this.pollingInterval);

      const triggerImmediateCheck = async () => {
        if (!this.selectedIntervention || !this.selectedIntervention.id) return;
        if (this.isAutofilling) return;
        if (!this.isInterventionFormPresent(document)) return;
        try {
          const update = await this.checkForInterventionUpdates(
            this.selectedIntervention.id,
            this.selectedIntervention.updated_at || this.selectedIntervention.modifie_le
          );
          if (update && update.hasChanged && update.item) {
            this.showToast(
              `⚡ Données actualisées en direct depuis FibreTrack (${update.item.nom_client || "Dossier"}) !`,
              "info",
              3000
            );
            this.setSelectedIntervention(update.item, false);
          }
        } catch {}
      };

      if (typeof document !== "undefined" && !this._visibilityBound) {
        this._visibilityBound = true;
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") triggerImmediateCheck();
        });
      }

      // Polling léger de 15s (uniquement si un formulaire d'intervention est actif et la page visible)
      this.pollingInterval = setInterval(async () => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        if (!this.isInterventionFormPresent(document)) return;
        await triggerImmediateCheck();
      }, 15000);
    }

    async checkForInterventionUpdates(id, lastKnownUpdatedAt = null) {
      if (!id) return { hasChanged: false };
      // 1. Passage prioritaire par le service worker pour contourner CSP
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          const resp = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { action: "CHECK_FOR_UPDATES", payload: { id: String(id), lastUpdatedAt: lastKnownUpdatedAt } },
              (res) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                resolve(res);
              }
            );
          });
          if (resp && resp.ok) return resp.data;
        } catch (e) {
          if (!this._lastCheckWarning || Date.now() - this._lastCheckWarning > 60000) {
            this._lastCheckWarning = Date.now();
            console.warn("[CelPros Widget] Échec CHECK_FOR_UPDATES via background:", e.message || e);
          }
        }
      }

      // 2. Fallback fetch direct (pour tests ou démo standalone)
      try {
        const data = await this.fetchApi("intervention_updated_at", "POST", { id: String(id) }, true);
        const serverUpdatedAt = data?.updated_at || "";
        const hasChanged = this.isInterventionOutdated(lastKnownUpdatedAt, serverUpdatedAt);
        let freshItem = null;
        if (hasChanged) {
          freshItem = await this.fetchApi("intervention_get", "POST", { id: String(id) }, true);
        }
        return { hasChanged, updated_at: serverUpdatedAt, item: freshItem };
      } catch (err) {
        return { hasChanged: false, error: err.message };
      }
    }

    async fetchApi(action, method = "GET", body = null, forceFresh = false) {
      // 1. Délégation au background service worker pour contourner CORS & CSP sur celpros.celtiis.bj
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          if (action === "interventions_list_light") {
            const resp = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(
                { action: "FETCH_INTERVENTIONS", payload: { forceFresh } },
                (res) => {
                  if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                  resolve(res);
                }
              );
            });
            if (resp && resp.ok && resp.data) {
              this.setApiStatus("connected", "Connecté");
              return resp.data;
            }
            if (resp && resp.error) throw new Error(resp.error);
          } else if (action === "intervention_get") {
            const id = body?.id;
            const resp = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(
                { action: "FETCH_INTERVENTION_DETAILS", payload: { id, forceFresh } },
                (res) => {
                  if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                  resolve(res);
                }
              );
            });
            if (resp && resp.ok && resp.data) {
              this.setApiStatus("connected", "Connecté");
              return resp.data;
            }
            if (resp && resp.error) throw new Error(resp.error);
          } else if (action === "intervention_updated_at") {
            const id = body?.id;
            const resp = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(
                { action: "CHECK_FOR_UPDATES", payload: { id, lastUpdatedAt: body?.lastUpdatedAt } },
                (res) => {
                  if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                  resolve(res);
                }
              );
            });
            if (resp && resp.ok && resp.data) {
              return resp.data;
            }
            if (resp && resp.error) throw new Error(resp.error);
          }
        } catch (swErr) {
          if (!this._lastSwWarning || Date.now() - this._lastSwWarning > 60000) {
            this._lastSwWarning = Date.now();
            console.warn("[CelPros Widget] Passage background indisponible, tentative directe:", swErr.message);
          }
        }
      }

      // 2. Fetch direct avec cache-busting strict (_t=timestamp et no-store)
      let apiUrl = "https://fibretrack.mantota.com/api/index.php";
      let apiCode = "9999";
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try {
          const stored = await chrome.storage.local.get(["apiUrl", "apiCode"]);
          if (stored.apiUrl) apiUrl = stored.apiUrl;
          if (stored.apiCode) apiCode = stored.apiCode;
        } catch {}
      }
      let clean = (apiUrl || "https://fibretrack.mantota.com/api/index.php").trim().replace(/\/+$/, "");
      if (!clean.includes(".php") && !clean.includes("?")) {
        clean = `${clean}/index.php`;
      }
      const sep = clean.includes("?") ? "&" : "?";
      const codeParam = apiCode ? `&user_code=${encodeURIComponent(String(apiCode).trim())}` : "";
      const url = `${clean}${sep}action=${encodeURIComponent(action)}${codeParam}&_t=${Date.now()}`;
      const options = {
        method,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          ...(apiCode ? { "X-User-Code": apiCode } : {}),
        },
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const res = await fetch(url, options);
      if (!res.ok) {
        this.setApiStatus("error", "Erreur réseau");
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      this.setApiStatus("connected", "Connecté");
      return json;
    }

    async loadInitialState() {
      const savedCollapsed = localStorage.getItem("chaptech_widget_collapsed") === "true";
      this.setCollapsed(savedCollapsed);

      // 1. Chargement instantané depuis le stockage local (0ms, non-bloquant)
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try {
          const stored = await chrome.storage.local.get([
            "activeIntervention",
            "cachedInterventions",
            "autoPilotEnabled",
            "chaptech_autopilot_enabled",
          ]);
          if (stored.chaptech_autopilot_enabled !== undefined) {
            this.setAutoPilotState(Boolean(stored.chaptech_autopilot_enabled), false);
          } else if (stored.autoPilotEnabled !== undefined) {
            this.setAutoPilotState(Boolean(stored.autoPilotEnabled), false);
          }
          if (Array.isArray(stored.cachedInterventions) && stored.cachedInterventions.length > 0) {
            this.interventions = stored.cachedInterventions;
            this.renderInterventionOptions();
            this.setApiStatus("connected", "Connecté");
          }
          if (stored.activeIntervention && stored.activeIntervention.id) {
            this.setSelectedIntervention(stored.activeIntervention, false);
          } else if (this.interventions.length > 0) {
            this.setSelectedIntervention(this.interventions[0], false);
          }
        } catch {}
      }

      // 2. Rafraîchissement en arrière-plan sans bloquer le démarrage de la page CelPros
      setTimeout(() => {
        this.fetchInterventions().catch(() => {});
      }, 1200);
    }

    setCollapsed(collapsed) {
      this.isCollapsed = Boolean(collapsed);
      const pill = document.getElementById("chaptech-pill");
      const panel = document.getElementById("chaptech-panel");
      if (!pill || !panel) return;

      if (this.isCollapsed) {
        pill.style.display = "flex";
        panel.style.display = "none";
      } else {
        pill.style.display = "none";
        panel.style.display = "flex";
      }
      localStorage.setItem("chaptech_widget_collapsed", String(this.isCollapsed));
    }

    setApiStatus(status, labelText) {
      this.apiStatus = status;
      const badge = document.getElementById("chaptech-status-badge");
      const pillStatus = document.getElementById("chaptech-pill-status");
      if (!badge) return;

      const dot = badge.querySelector(".dot");
      const label = badge.querySelector(".status-label");

      dot.className = `dot status-${status}`;
      label.textContent = labelText || (status === "connected" ? "Connecté" : "Hors-ligne");

      if (pillStatus) {
        pillStatus.className = `pill-status-dot status-${status}`;
      }
    }

    async fetchInterventions(forceFresh = false) {
      this.setApiStatus("loading", "Synchronisation...");
      const select = document.getElementById("chaptech-intervention-select");
      if (select) select.disabled = true;

      let list = null;
      try {
        list = await this.fetchApi("interventions_list_light", "GET", null, forceFresh);
      } catch (err) {
        console.warn("[CelPros Widget] Erreur fetch direct:", err);
      }

      if (!Array.isArray(list) || list.length === 0) {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          try {
            const stored = await chrome.storage.local.get(["cachedInterventions"]);
            if (Array.isArray(stored.cachedInterventions)) {
              list = stored.cachedInterventions;
            }
          } catch {}
        }
      }

      if (Array.isArray(list) && list.length > 0) {
        // Tri chronologique strict (du plus récent au plus ancien)
        list.sort((a, b) => {
          const aIsDone = this.isItemTermine(a);
          const bIsDone = this.isItemTermine(b);
          if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;
          const da = this.parseTimestampSafely(a.modifie_le || a.updated_at || a.date);
          const db = this.parseTimestampSafely(b.modifie_le || b.updated_at || b.date);
          return db - da;
        });

        this.interventions = list;
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ cachedInterventions: list }).catch(() => {});
        }

        const totalEnCours = this.interventions.filter((i) => !this.isItemTermine(i)).length;
        if (totalEnCours === 0 && this.interventions.length > 0) {
          this.statusTabFilter = "all";
          document.querySelectorAll(".chaptech-filter-pill").forEach((pill) => {
            pill.classList.toggle("is-active", pill.getAttribute("data-status") === "all");
          });
        }

        this.setApiStatus("connected", `${list.length} fiches réelles`);
        this.renderInterventionOptions();
      } else {
        this.setApiStatus("error", "Hors-ligne");
      }

      if (select) select.disabled = false;
    }

    tryAutoMatchInterventionFromPage() {
      if (this.selectedIntervention || !this.interventions || !this.interventions.length) return;
      const text = (document.body?.innerText || "").toLowerCase();
      for (const item of this.interventions) {
        if (item.telephone_ligne && item.telephone_ligne.trim().length >= 6 && text.includes(item.telephone_ligne.trim().toLowerCase())) {
          this.onInterventionChange(item.id);
          return;
        }
        if (item.mobile && item.mobile.trim().length >= 8 && text.includes(item.mobile.trim().toLowerCase())) {
          this.onInterventionChange(item.id);
          return;
        }
        if (item.fat_ref && item.fat_ref.trim().length >= 4 && text.includes(item.fat_ref.trim().toLowerCase())) {
          this.onInterventionChange(item.id);
          return;
        }
      }
    }

    renderInterventionOptions() {
      const select = document.getElementById("chaptech-intervention-select");
      const suggestionsBox = document.getElementById("chaptech-search-suggestions");
      const clearBtn = document.getElementById("chaptech-search-clear");
      const countEnCours = document.getElementById("count-en-cours");
      const countAll = document.getElementById("count-all");
      const countTerminees = document.getElementById("count-terminees");

      // Calcul des compteurs globaux
      const totalEnCours = this.interventions.filter((i) => !this.isItemTermine(i)).length;
      const totalTerminees = this.interventions.filter((i) => this.isItemTermine(i)).length;
      const totalAll = this.interventions.length;

      if (countEnCours) countEnCours.textContent = String(totalEnCours);
      if (countAll) countAll.textContent = String(totalAll);
      if (countTerminees) countTerminees.textContent = String(totalTerminees);

      const filter = (this.filterText || "").toLowerCase().trim();
      if (clearBtn) {
        clearBtn.style.display = filter ? "flex" : "none";
      }

      // 1. Filtrage pour la recherche
      let matchingInterventions = this.interventions;
      if (filter) {
        matchingInterventions = this.interventions.filter((item) => {
          const text = `${item.nom_client || ""} ${item.msan || ""} ${item.fat_ref || ""} ${item.telephone_ligne || ""} ${item.mobile || ""} ${item.id || ""} ${item.adresse_zone || ""}`.toLowerCase();
          return text.includes(filter);
        });
      } else {
        // Sans recherche textuelle, appliquer l'onglet actif ('en_cours', 'termine', 'terminees', 'all')
        if (this.statusTabFilter === "en_cours") {
          matchingInterventions = this.interventions.filter((i) => !this.isItemTermine(i));
        } else if (this.statusTabFilter === "termine" || this.statusTabFilter === "terminees") {
          matchingInterventions = this.interventions.filter((i) => this.isItemTermine(i));
        }
      }

      // 2. Mettre à jour la boîte d'autocomplétion (suggestions) si l'utilisateur est en train de taper
      if (suggestionsBox) {
        if (filter.length > 0) {
          this.renderSuggestions(matchingInterventions, filter);
        } else {
          suggestionsBox.style.display = "none";
          suggestionsBox.innerHTML = "";
        }
      }

      // 3. Mettre à jour le select natif
      if (!select) return;
      select.innerHTML = '<option value="">-- Choisir une intervention --</option>';

      const enCoursGroup = matchingInterventions.filter((i) => !this.isItemTermine(i));
      const termineesGroup = matchingInterventions.filter((i) => this.isItemTermine(i));

      if (enCoursGroup.length > 0) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = `⚡ Dossiers En cours (${enCoursGroup.length})`;
        for (const item of enCoursGroup) {
          const opt = document.createElement("option");
          opt.value = item.id;
          const date = item.date ? item.date.slice(0, 10) : "";
          const client = (item.nom_client || "Sans nom").trim();
          const fat = item.fat_ref ? ` [${item.fat_ref.trim()}]` : "";
          opt.textContent = `${client}${fat} (${date})`;
          if (this.selectedIntervention && this.selectedIntervention.id === item.id) {
            opt.selected = true;
          }
          optgroup.appendChild(opt);
        }
        select.appendChild(optgroup);
      }

      if (termineesGroup.length > 0) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = `✅ Dossiers Terminés (${termineesGroup.length})`;
        for (const item of termineesGroup) {
          const opt = document.createElement("option");
          opt.value = item.id;
          const date = item.date ? item.date.slice(0, 10) : "";
          const client = (item.nom_client || "Sans nom").trim();
          const fat = item.fat_ref ? ` [${item.fat_ref.trim()}]` : "";
          opt.textContent = `${client}${fat} (${date})`;
          if (this.selectedIntervention && this.selectedIntervention.id === item.id) {
            opt.selected = true;
          }
          optgroup.appendChild(opt);
        }
        select.appendChild(optgroup);
      }
    }

    renderSuggestions(items, query) {
      const box = document.getElementById("chaptech-search-suggestions");
      if (!box) return;

      if (!items || items.length === 0) {
        box.innerHTML = `<div class="suggestion-empty">Aucun dossier trouvé pour « <strong>${this.escapeHtml(query)}</strong> »</div>`;
        box.style.display = "block";
        return;
      }

      let html = "";
      const limit = Math.min(items.length, 10);
      for (let i = 0; i < limit; i++) {
        const item = items[i];
        const isDone = this.isItemTermine(item);
        const client = (item.nom_client || "Sans nom").trim();
        const fat = item.fat_ref ? item.fat_ref.trim() : "";
        const phone = item.mobile || item.telephone_ligne || "";
        const date = item.date ? item.date.slice(0, 10) : "";
        const isSelected = this.selectedIntervention && this.selectedIntervention.id === item.id;

        html += `
          <div class="suggestion-item ${isSelected ? "is-selected" : ""}" data-id="${item.id}">
            <div class="suggestion-head">
              <span class="suggestion-client">${this.highlightMatch(client, query)}</span>
              <span class="suggestion-badge ${isDone ? "badge-done" : "badge-progress"}">
                ${isDone ? "✅ Terminée" : "⚡ En cours"}
              </span>
            </div>
            <div class="suggestion-sub">
              ${fat ? `<span class="suggestion-fat">FAT: ${this.highlightMatch(fat, query)}</span>` : ""}
              ${phone ? `<span class="suggestion-phone">Tél: ${this.highlightMatch(phone, query)}</span>` : ""}
              ${date ? `<span class="suggestion-date">${date}</span>` : ""}
            </div>
          </div>
        `;
      }

      if (items.length > limit) {
        html += `<div class="suggestion-footer">+ ${items.length - limit} autre(s) dossier(s)...</div>`;
      }

      box.innerHTML = html;
      box.style.display = "block";

      // Clic sur une suggestion
      const itemEls = box.querySelectorAll(".suggestion-item");
      itemEls.forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.getAttribute("data-id");
          const target = this.interventions.find((i) => i.id === id);
          if (target) {
            const input = document.getElementById("chaptech-search-input");
            if (input) input.value = (target.nom_client || "").trim();
            this.filterText = (target.nom_client || "").trim();
          }
          box.style.display = "none";
          this.onInterventionChange(id);
        });
      });
    }

    highlightMatch(text, query) {
      if (!query || !text) return this.escapeHtml(text || "");
      const safe = this.escapeHtml(text);
      const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${q})`, "gi");
      return safe.replace(regex, "<mark class='match-hl'>$1</mark>");
    }

    escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    async onInterventionChange(id, forceFresh = false) {
      if (!id) {
        this.selectedIntervention = null;
        this.updateSummaryCard();
        return;
      }

      this.showToast("Chargement des détails réels...", "info", 1200);

      let fullItem = null;
      try {
        fullItem = await this.fetchApi("intervention_get", "POST", { id: String(id) }, forceFresh);
      } catch (err) {
        console.warn("[CelPros Widget] Erreur fetch détails direct:", err);
      }

      if (!fullItem || !fullItem.id) {
        // En mode hors-ligne, vérifier d'abord si on possède déjà l'intervention complète avec photos
        if (this.selectedIntervention && String(this.selectedIntervention.id) === String(id) && ((this.selectedIntervention.whatsapp_photos && this.selectedIntervention.whatsapp_photos.length > 0) || (this.selectedIntervention.points_gps && this.selectedIntervention.points_gps.length > 0))) {
          fullItem = this.selectedIntervention;
        } else if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          try {
            const stored = await chrome.storage.local.get(["activeIntervention"]);
            if (stored.activeIntervention && String(stored.activeIntervention.id) === String(id)) {
              fullItem = stored.activeIntervention;
            }
          } catch {}
        }
        if (!fullItem || !fullItem.id) {
          fullItem = this.interventions.find((i) => String(i.id) === String(id));
        }
      }

      if (fullItem) {
        this.setSelectedIntervention(fullItem, true);
        const photosCount = (fullItem.whatsapp_photos || []).length;
        const gpsCount = (fullItem.points_gps || []).length;
        this.showToast(
          `⚡ Dossier chargé : <strong>${this.escapeHtml(fullItem.nom_client)}</strong> (${photosCount} photos, ${gpsCount} GPS)`,
          "success",
          3500
        );
      } else {
        this.showToast("⚠️ Impossible de charger ce dossier", "error");
      }
    }

    setSelectedIntervention(data, syncToBackground = true) {
      if (!data) {
        this.selectedIntervention = null;
        this.selectedFingerprint = "";
        this.updateSummaryCard();
        return false;
      }

      const incoming = { ...data };

      // Normalisation défensive des tableaux JSON stringifiés
      if (typeof incoming.whatsapp_photos === "string") {
        try { incoming.whatsapp_photos = JSON.parse(incoming.whatsapp_photos); } catch { incoming.whatsapp_photos = []; }
      }
      if (typeof incoming.points_gps === "string") {
        try { incoming.points_gps = JSON.parse(incoming.points_gps); } catch { incoming.points_gps = []; }
      }
      if (typeof incoming.materiel_pose === "string") {
        try { incoming.materiel_pose = JSON.parse(incoming.materiel_pose); } catch {}
      }

      // Protection contre l'écrasement d'une fiche complète (avec photos) par une fiche légère (interventions_list_light / interventions_list)
      if (
        this.selectedIntervention &&
        String(this.selectedIntervention.id) === String(incoming.id) &&
        incoming._fully_loaded !== true
      ) {
        const exWa = Array.isArray(this.selectedIntervention.whatsapp_photos) ? this.selectedIntervention.whatsapp_photos : [];
        const incWa = Array.isArray(incoming.whatsapp_photos) ? incoming.whatsapp_photos : [];
        const exHasWaUrls = exWa.some((p) => p && (p.url || p.photo || p.src));
        const incHasWaUrls = incWa.some((p) => p && (p.url || p.photo || p.src));
        if (exHasWaUrls && !incHasWaUrls) {
          incoming.whatsapp_photos = exWa;
        }
        const exGps = Array.isArray(this.selectedIntervention.points_gps) ? this.selectedIntervention.points_gps : [];
        const incGps = Array.isArray(incoming.points_gps) ? incoming.points_gps : [];
        const exHasGpsPhotos = exGps.some((p) => p && p.photo);
        const incHasGpsPhotos = incGps.some((p) => p && p.photo);
        if (exHasGpsPhotos && !incHasGpsPhotos) {
          if (incGps.length === 0) {
            incoming.points_gps = exGps;
          } else {
            incoming.points_gps = incGps.map((pt, idx) => {
              if (pt && !pt.photo) {
                const match = exGps.find(
                  (ep) =>
                    ep &&
                    ((ep.id && pt.id && ep.id === pt.id) ||
                      (ep.type === pt.type && Number(ep.numero || 0) === Number(pt.numero || 0)))
                ) || exGps[idx];
                if (match && match.photo) {
                  return { ...pt, photo: match.photo };
                }
              }
              return pt;
            });
          }
        }
      }

      const prevId = this.selectedIntervention ? String(this.selectedIntervention.id || "") : "";
      const nextId = incoming.id ? String(incoming.id) : "";
      const newFp = this.computeInterventionFingerprint(incoming);
      const didChange = !this.selectedFingerprint || newFp !== this.selectedFingerprint;
      if (prevId !== nextId || didChange) {
        this.lastStepFilled = null;
      }

      this.selectedIntervention = incoming;
      this.selectedFingerprint = newFp;
      this.updateSummaryCard();

      if (typeof document !== "undefined") {
        // Synchroniser visuellement la sélection dans le <select>
        const select = document.getElementById("chaptech-intervention-select");
        if (select && incoming.id) {
          select.value = incoming.id;
        }

        // Synchroniser l'input de recherche
        const searchInput = document.getElementById("chaptech-search-input");
        if (searchInput && incoming.nom_client) {
          searchInput.value = (incoming.nom_client || "").trim();
        }
      }

      // Ne sauvegarder dans chrome.storage.local QUE si demandé explicitement (syncToBackground=true) ET si modifié
      if (syncToBackground && didChange && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        Promise.resolve(chrome.storage.local.set({ activeIntervention: incoming })).catch(() => {});
      }

      return didChange;
    }

    updateSummaryCard() {
      if (typeof document === "undefined") return;
      const card = document.getElementById("chaptech-summary-card");
      const btnAutofill = document.getElementById("chaptech-btn-autofill");
      if (!card || !btnAutofill) return;

      if (!this.selectedIntervention) {
        card.style.display = "none";
        btnAutofill.disabled = true;
        this.updateStepDisplay(null);
        return;
      }

      const d = this.selectedIntervention;
      card.style.display = "block";
      btnAutofill.disabled = false;

      const isDone = this.isItemTermine(d);
      document.getElementById("card-client-name").textContent = d.nom_client || "Client Inconnu";
      document.getElementById("card-status").textContent = isDone ? "✅ Terminé" : "⏳ En cours";
      document.getElementById("card-phone").textContent = d.mobile || d.telephone_ligne || "-";
      document.getElementById("card-zone").textContent = d.adresse_zone || "-";
      document.getElementById("card-fat").textContent = d.fat_ref ? `${d.fat_ref} (${d.msan || "MSAN"})` : "-";
      document.getElementById("card-port").textContent = d.port ? `Port ${d.port}` : "-";
      const fatPow = d.puissance_fat_dbm && Number(d.puissance_fat_dbm) !== 0 ? `${d.puissance_fat_dbm} dBm` : "-";
      const ptoPow = d.puissance_pto_dbm && Number(d.puissance_pto_dbm) !== 0 ? `${d.puissance_pto_dbm} dBm` : "-";
      document.getElementById("card-power").textContent = `${fatPow} / ${ptoPow}`;
      document.getElementById("card-sn").textContent = d.sn || d.ont_sn || "-";

      this.updateStepDisplay();
    }

    getStepMeta(num) {
      const steps = {
        1: { num: 1, title: "Étape 1 : Interlocuteur", desc: "Demandeur, Nom & Tél client, Configurations" },
        2: { num: 2, title: "Étape 2 : Matériels & Accessoires", desc: "ONT, MAC, SN, Photo ONT, Câbles, Poteaux" },
        3: { num: 3, title: "Étape 3 : Tests de services", desc: "Appels, Tests débits Câble & Wifi + photos" },
        4: { num: 4, title: "Étape 4 : Branchement & Mesures", desc: "FAT, Port, Plaque, Mesures optiques & photos" },
        5: { num: 5, title: "Étape 5 : Signature & Clôture", desc: "Photo contrat client, Confirmation signature" },
      };
      return steps[num] || { num: num || 1, title: `Étape ${num || 1}`, desc: "Formulaire d'intervention" };
    }

    updateStepDisplay(stepNum = null) {
      const num = stepNum || (FormFiller && FormFiller.detectCurrentStep ? FormFiller.detectCurrentStep(document) : 1);
      const meta = this.getStepMeta(num);
      this.currentStepInfo = meta;

      const badge = document.getElementById("chaptech-step-badge");
      const sub = document.getElementById("chaptech-step-sub");
      if (badge) badge.textContent = meta.title;
      if (sub) sub.textContent = meta.desc;
    }

    // Contrôle strict de conformité avant soumission ou passage à l'étape suivante
    checkMandatoryCompliance(root = (typeof document !== "undefined" ? document : null)) {
      if (!root) return { valid: true };
      const stepNum = FormFiller && FormFiller.detectCurrentStep ? FormFiller.detectCurrentStep(root) : 1;
      // Contrôle impératif pour l'Étape 5 : PV de conformité
      if (stepNum === 5) {
        const mandatorySelectors = [
          '#field_travauxConformes, input[name="travauxConformes"], input[formcontrolname="travauxConformes"]',
          '#field_emplacementValide, input[name="emplacementValide"], input[formcontrolname="emplacementValide"]',
          '#field_travailPropre, input[name="travailPropre"], input[formcontrolname="travailPropre"]',
          '#field_serviceTeste, input[name="serviceTeste"], input[formcontrolname="serviceTeste"]',
          '#field_serviceFonctionne, input[name="serviceFonctionne"], input[formcontrolname="serviceFonctionne"]',
          '#field_explicationsDonnees, input[name="explicationsDonnees"], input[formcontrolname="explicationsDonnees"]',
        ];
        const unchecked = [];
        for (const sel of mandatorySelectors) {
          const el = root.querySelector(sel);
          if (el && el.type === "checkbox" && !el.checked) {
            unchecked.push(el);
          }
        }
        if (unchecked.length > 0) {
          return {
            valid: false,
            message: `${unchecked.length} case(s) obligatoire(s) du PV de conformité (Étape 5) doivent être cochées !`,
            firstUnchecked: unchecked[0],
            uncheckedList: unchecked,
          };
        }
      }
      return { valid: true };
    }

    setupAutoPilotObserver() {
      if (this.observer || typeof MutationObserver === "undefined") return;

      // Surveillance des transitions dynamiques dans le DOM de CelPros (SPA)
      this.observer = new MutationObserver((mutations) => {
        if (!this.canAutoFill()) return;
        // GARDE-FOU 1 : Ne jamais observer ni déclencher d'autofill sur la page de connexion ou hors formulaire
        if (!this.isInterventionFormPresent(document)) return;
        // GARDE-FOU ANTI-BOUCLE : Ne jamais relancer d'autofill pendant la fenêtre de cooldown
        if (Date.now() - (this.lastAutofillTime || 0) < this.autofillCooldownMs) return;

        let hasRelevantChange = false;
        for (const m of mutations) {
          if (m.type === "childList" && m.addedNodes.length > 0) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1) {
                // Ignorer complètement les nœuds générés par notre propre widget ou nos badges d'injection
                if (
                  n.id === "chaptech-celpros-widget-root" ||
                  n.closest?.("#chaptech-celpros-widget-root") ||
                  n.classList?.contains("chaptech-photo-injected-badge") ||
                  n.classList?.contains("chaptech-photo-missing-badge") ||
                  n.classList?.contains("chaptech-pole-injected") ||
                  n.dataset?.chaptechManaged === "true"
                ) {
                  continue;
                }
                const tag = n.tagName.toLowerCase();
                if (
                  tag === "form" ||
                  tag === "input" ||
                  tag === "select" ||
                  n.className?.includes?.("step") ||
                  n.className?.includes?.("wizard") ||
                  n.className?.includes?.("upload") ||
                  n.querySelector?.("input, select, textarea, [class*='upload']")
                ) {
                  hasRelevantChange = true;
                  break;
                }
              }
            }
          }
          if (hasRelevantChange) break;
        }

        if (hasRelevantChange) {
          if (this.autoFillTimeout) clearTimeout(this.autoFillTimeout);
          this.autoFillTimeout = setTimeout(() => {
            this.autoFillTimeout = null;
            if (!this.canAutoFill()) return;
            if (Date.now() - (this.lastAutofillTime || 0) < this.autofillCooldownMs) return;
            if (!this.isInterventionFormPresent(document)) return;
            const stepNum = FormFiller && FormFiller.detectCurrentStep ? FormFiller.detectCurrentStep(document) : 1;
            this.updateStepDisplay(stepNum);
            if (this.lastStepFilled !== stepNum) {
              this.handleAutofill(true);
            }
          }, 600);
        }
      });

      this.observer.observe(document.body, { childList: true, subtree: true });

      // Écouter les clics sur les boutons de navigation (Suivant / Précédent / Numéros d'étapes / Valider)
      document.addEventListener(
        "click",
        (e) => {
          // Si le clic provient de notre propre widget, ne rien bloquer
          if (e.target.closest && e.target.closest("#chaptech-celpros-widget-root")) {
            return;
          }

          // Si on est sur la page de connexion ou hors formulaire, NE JAMAIS INTERCEPTER AUCUN CLIC !
          if (!this.isInterventionFormPresent(document)) {
            return;
          }

          // Contrôle impératif des cases obligatoires lors du passage à l'étape suivante ou de la soumission
          const nextBtn = e.target.closest("button, a, [type='submit'], .btn-primary, [class*='next'], [class*='valider'], [class*='submit'], [class*='wizard']");
          if (nextBtn) {
            const btnText = (nextBtn.innerText || nextBtn.textContent || "").toLowerCase().trim();
            const isGoingForward = /suivant|valider|terminer|soumettre|enregistrer|confirmer|next|submit/i.test(btnText) ||
                                   nextBtn.className?.includes?.("next") || nextBtn.type === "submit";
            if (isGoingForward) {
              const validation = this.checkMandatoryCompliance(document);
              if (!validation.valid) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
                this.showToast(`⚠️ Validation bloquée : ${validation.message}`, "error", 6000);
                if (validation.firstUnchecked && typeof validation.firstUnchecked.scrollIntoView === "function") {
                  validation.firstUnchecked.scrollIntoView({ behavior: "smooth", block: "center" });
                  validation.firstUnchecked.focus?.();
                  if (validation.firstUnchecked.classList) {
                    validation.firstUnchecked.classList.add("celpros-missing-highlight");
                    setTimeout(() => validation.firstUnchecked.classList?.remove("celpros-missing-highlight"), 4000);
                  }
                }
                return;
              }
            }
          }

          const btn = e.target.closest("button, a, .step, [class*='step'], [class*='next'], [class*='wizard']");
          if (btn && this.canAutoFill()) {
            if (Date.now() - (this.lastAutofillTime || 0) < this.autofillCooldownMs) return;
            if (this.autoFillTimeout) clearTimeout(this.autoFillTimeout);
            this.autoFillTimeout = setTimeout(() => {
              this.autoFillTimeout = null;
              if (!this.canAutoFill()) return;
              const stepNum = FormFiller && FormFiller.detectCurrentStep ? FormFiller.detectCurrentStep(document) : 1;
              this.updateStepDisplay(stepNum);
              if (this.lastStepFilled !== stepNum) {
                this.handleAutofill(true);
              }
            }, 600);
          }
        },
        true
      );
    }

    async handleAutofill(isAuto = false) {
      if (isAuto && !this.autoPilotEnabled) {
        return;
      }
      if (!this.selectedIntervention) {
        if (!isAuto) this.showToast("Veuillez d'abord sélectionner une intervention", "warning");
        return;
      }
      if (this.isAutofilling) return;
      if (isAuto && Date.now() - (this.lastAutofillTime || 0) < this.autofillCooldownMs) {
        return;
      }

      this.isAutofilling = true;
      const currentRunId = ++this.autofillAbortId;

      const btnAutofill = document.getElementById("chaptech-btn-autofill");
      if (btnAutofill) {
        btnAutofill.disabled = true;
        btnAutofill.innerHTML = "⏳ Injection en cours…";
      }

      try {
        // Recharger les données fraîches si manuel ou si pas rafraîchi depuis >4s ou si photos absentes
        const hasPhotosLoaded =
          Array.isArray(this.selectedIntervention.whatsapp_photos) &&
          this.selectedIntervention.whatsapp_photos.some((p) => p && p.url);
        const shouldFetchFresh = !isAuto || !hasPhotosLoaded || Date.now() - (this.lastServerFetchTime || 0) > 4000;

        if (shouldFetchFresh && this.selectedIntervention.id) {
          try {
            const freshItem = await this.fetchApi("intervention_get", "POST", { id: String(this.selectedIntervention.id) }, true);
            this.lastServerFetchTime = Date.now();
            if (freshItem && freshItem.id) {
              const norm = (typeof FieldMapping !== "undefined" && typeof FieldMapping.normalizeInterventionData === "function")
                ? FieldMapping.normalizeInterventionData(freshItem)
                : freshItem;
              this.setSelectedIntervention(norm, false);
            }
          } catch (e) {
            console.warn("[CelPros Widget] Recharge avant remplissage impossible:", e);
          }
        }

        // Vérifier que Super-Pilote n'a pas été coupé pendant la requête réseau
        const shouldAbort = () => (isAuto && !this.autoPilotEnabled) || this.autofillAbortId !== currentRunId;
        if (shouldAbort()) {
          return;
        }

        const report = await FormFiller.autofillPage(this.selectedIntervention, document, { shouldAbort });
        if (shouldAbort()) {
          return;
        }
        this.lastFillReport = report;

        const currentStepNum = report.currentStep || 1;
        this.lastStepFilled = currentStepNum;
        this.updateStepDisplay(currentStepNum);

        const fieldsCount = report.filledCount || 0;
        const preservedCount = report.preservedCount || 0;
        const photosCount = report.photosInjected || 0;
        const missingPhotosCount = report.missingPhotosCount || 0;
        const totalActions = fieldsCount + photosCount;

        const resultBanner = document.getElementById("chaptech-fill-result");
        if (resultBanner) {
          resultBanner.style.display = "block";
          if (totalActions > 0 || preservedCount > 0) {
            resultBanner.className = "chaptech-result-banner success";

            let photosBadgesHtml = "";
            if (report.photoDetails && report.photoDetails.length > 0) {
              photosBadgesHtml += `
                <div class="result-photos-grid">
                  ${report.photoDetails.map((p) => `<span class="photo-chip" title="${p.fileName}">📸 ${p.label}</span>`).join("")}
                </div>
              `;
            }
            if (report.missingPhotos && report.missingPhotos.length > 0) {
              photosBadgesHtml += `
                <div class="result-photos-grid" style="margin-top: 4px;">
                  ${report.missingPhotos.map((m) => `<span class="photo-chip warning" style="background:#fef3c7;color:#92400e;border:1px solid #f59e0b;" title="Photo non présente dans FibreTrack">⚠️ Manquante : ${m.label}</span>`).join("")}
                </div>
              `;
            }

            resultBanner.innerHTML = `
              <div class="result-head">✅ <strong>Étape ${currentStepNum}</strong> complétée ${isAuto ? '<span class="auto-pill">⚡ Super-Pilote</span>' : ""}</div>
              <div class="result-stats">
                <span class="stat-tag fields">📝 <strong>${fieldsCount}</strong> champ(s)</span>
                ${preservedCount > 0 ? `<span class="stat-tag" style="background:#e0f2fe;color:#0369a1;">🛡️ <strong>${preservedCount}</strong> manuel(s) préservé(s)</span>` : ""}
                <span class="stat-tag photos">📸 <strong>${photosCount}</strong> photo(s)</span>
                ${missingPhotosCount > 0 ? `<span class="stat-tag" style="background:#fef3c7;color:#92400e;">⚠️ <strong>${missingPhotosCount}</strong> photo(s) absente(s)</span>` : ""}
              </div>
              ${photosBadgesHtml}
              <div class="result-hint">👉 Vérifiez puis cliquez sur <strong>Suivant</strong> dans CelPros.</div>
            `;
            let toastMsg = `⚡ <strong>${fieldsCount} champs</strong> et <strong>${photosCount} photos</strong> injectés pour l'Étape ${currentStepNum} !`;
            if (preservedCount > 0) {
              toastMsg += ` (🛡️ ${preservedCount} saisie(s) manuelle(s) protégée(s))`;
            }
            this.showToast(toastMsg, "success", 4000);
          } else {
            resultBanner.className = "chaptech-result-banner warning";
            resultBanner.innerHTML = `⚠️ Aucun champ ou zone photo correspondante détectée sur cette page (${report.totalScanned} éléments analysés).`;
            if (!isAuto) {
              this.showToast("⚠️ Aucun champ CelPros correspondant sur cette page", "warning");
            }
          }
        }

        this.renderFieldsBreakdown(report);
      } catch (err) {
        console.error("[CelprosWidget] Erreur autofill:", err);
        this.showToast(`❌ Erreur: ${err.message}`, "error");
      } finally {
        this.isAutofilling = false;
        this.lastAutofillTime = Date.now();
        if (btnAutofill) {
          btnAutofill.disabled = false;
          btnAutofill.innerHTML = "🚀 Remplir cette étape (Champs &amp; Photos)";
        }
      }
    }

    renderFieldsBreakdown(report) {
      const container = document.getElementById("chaptech-fields-breakdown");
      if (!container) return;

      if (!report || (!report.filledDetails && !report.photoDetails && !report.preservedDetails)) {
        container.innerHTML = "<em>Aucune donnée d'inspection disponible.</em>";
        return;
      }

      let html = `<div class="breakdown-summary">Éléments analysés : ${report.totalScanned || 0} | Champs : ${report.filledCount || 0} | Préservés : ${report.preservedCount || 0} | Photos : ${report.photosInjected || 0}</div>`;

      // Liste des saisies manuelles protégées
      if (report.preservedDetails && report.preservedDetails.length > 0) {
        html += `<div class="breakdown-subtitle" style="color:#0369a1;">🛡️ Saisies manuelles protégées (${report.preservedDetails.length}) :</div>`;
        html += `<ul class="breakdown-list">`;
        for (const pr of report.preservedDetails) {
          html += `
            <li class="breakdown-item preserved" style="border-left: 3px solid #0284c7; background: #f0f9ff;">
              <span class="badge-cat" style="background:#0284c7; color:#fff;">Manuel</span>
              <strong>${pr.label}</strong> :
              <span class="breakdown-val">${String(pr.currentValue).slice(0, 30)}</span>
              <small class="breakdown-id">(saisie utilisateur préservée)</small>
            </li>
          `;
        }
        html += `</ul>`;
      }

      // Liste des photos injectées
      if (report.photoDetails && report.photoDetails.length > 0) {
        html += `<div class="breakdown-subtitle">📸 Photos injectées (${report.photoDetails.length}) :</div>`;
        html += `<ul class="breakdown-list">`;
        for (const p of report.photoDetails) {
          html += `
            <li class="breakdown-item photo-injected">
              <span class="badge-cat photo">Photo</span>
              <strong>${p.label}</strong> :
              <span class="breakdown-val">${p.fileName} (${p.sizeKb} Ko)</span>
            </li>
          `;
        }
        html += `</ul>`;
      }

      // Liste des photos manquantes dans FibreTrack
      if (report.missingPhotos && report.missingPhotos.length > 0) {
        html += `<div class="breakdown-subtitle" style="color:#b45309;">⚠️ Photos absentes dans FibreTrack (${report.missingPhotos.length}) :</div>`;
        html += `<ul class="breakdown-list">`;
        for (const m of report.missingPhotos) {
          html += `
            <li class="breakdown-item missing-photo" style="border-left: 3px solid #f59e0b; background: #fffbeb;">
              <span class="badge-cat" style="background:#f59e0b; color:#fff;">Absente</span>
              <strong>${m.label}</strong> :
              <span class="breakdown-val">Champ laissé vide (avertissement affiché)</span>
            </li>
          `;
        }
        html += `</ul>`;
      }

      // Liste des champs texte/select/cases
      if (report.filledDetails && report.filledDetails.length > 0) {
        html += `<div class="breakdown-subtitle">📝 Champs remplis (${report.filledDetails.length}) :</div>`;
        html += `<ul class="breakdown-list">`;
        for (const item of report.filledDetails) {
          html += `
            <li class="breakdown-item filled">
              <span class="badge-cat">${item.category}</span>
              <strong>${item.label}</strong> : 
              <span class="breakdown-val">${String(item.value).slice(0, 30)}</span>
              <small class="breakdown-id">(${item.elementId})</small>
            </li>
          `;
        }
        html += `</ul>`;
      }

      if (report.unmatchedElements && report.unmatchedElements.length > 0) {
        html += `<details class="breakdown-unmatched"><summary>Champs non assignés (${report.unmatchedElements.length})</summary><ul>`;
        for (const u of report.unmatchedElements.slice(0, 15)) {
          html += `<li><code>${u.tag}#${u.id || u.name}</code> : "${u.label}"</li>`;
        }
        html += `</ul></details>`;
      }

      container.innerHTML = html;
    }

    async safeCopyToClipboard(text) {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {}
      }
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "-9999px";
        ta.setAttribute("readonly", "");
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, 99999);
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }

    async copyWhatsApp() {
      if (!this.selectedIntervention) {
        this.showToast("Sélectionnez une intervention d'abord", "warning");
        return;
      }
      const formatter = FormFiller.formatGlobalReport || FormFiller.formatWhatsAppReport;
      const text = formatter(this.selectedIntervention);
      const ok = await this.safeCopyToClipboard(text);
      if (ok) {
        this.showToast("📋 Rapport Global (WhatsApp) copié !", "success");
      } else {
        this.showToast("⚠️ Erreur lors de la copie dans le presse-papiers", "error");
      }
    }

    async copyConformiteReport() {
      if (!this.selectedIntervention) {
        this.showToast("Sélectionnez une intervention d'abord", "warning");
        return;
      }
      const text = FormFiller.formatConformiteReport ? FormFiller.formatConformiteReport(this.selectedIntervention) : "";
      const ok = await this.safeCopyToClipboard(text);
      if (ok) {
        this.showToast("✅ Rapport de Conformité copié !", "success");
      } else {
        this.showToast("⚠️ Erreur lors de la copie dans le presse-papiers", "error");
      }
    }

    async copyJson() {
      if (!this.selectedIntervention) {
        this.showToast("Sélectionnez une intervention d'abord", "warning");
        return;
      }
      const json = JSON.stringify(this.selectedIntervention, null, 2);
      const ok = await this.safeCopyToClipboard(json);
      if (ok) {
        this.showToast("📦 Données JSON copiées !", "success");
      } else {
        this.showToast("⚠️ Erreur lors de la copie dans le presse-papiers", "error");
      }
    }

    importJson(rawText) {
      try {
        const parsed = JSON.parse(rawText.trim());
        if (!parsed || typeof parsed !== "object") throw new Error("JSON invalide");
        this.setSelectedIntervention(parsed);
        this.showToast(`✅ Intervention chargée manuellement : <strong>${parsed.nom_client || "Sans nom"}</strong>`, "success");
        const drawer = document.getElementById("chaptech-import-drawer");
        if (drawer) drawer.style.display = "none";
      } catch (err) {
        this.showToast(`❌ Format JSON invalide: ${err.message}`, "error");
      }
    }

    attachEventListeners() {
      // Toggle repliage
      document.getElementById("chaptech-pill").addEventListener("click", () => this.setCollapsed(false));
      document.getElementById("chaptech-btn-minimize").addEventListener("click", () => this.setCollapsed(true));

      // Filtres rapides En cours / Tous / Terminées
      const filterPills = document.querySelectorAll(".chaptech-filter-pill");
      filterPills.forEach((pill) => {
        pill.addEventListener("click", () => {
          filterPills.forEach((p) => p.classList.remove("is-active"));
          pill.classList.add("is-active");
          this.statusTabFilter = pill.getAttribute("data-status") || "all";
          this.renderInterventionOptions();
        });
      });

      // Recherche filtrée avec suggestions interactives
      const searchInput = document.getElementById("chaptech-search-input");
      const suggestionsBox = document.getElementById("chaptech-search-suggestions");
      const clearSearchBtn = document.getElementById("chaptech-search-clear");

      searchInput.addEventListener("input", (e) => {
        this.filterText = e.target.value;
        this.renderInterventionOptions();
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const firstItem = suggestionsBox?.querySelector(".suggestion-item");
          if (firstItem) {
            const id = firstItem.getAttribute("data-id");
            const target = this.interventions.find((i) => i.id === id);
            if (target) {
              searchInput.value = (target.nom_client || "").trim();
              this.filterText = (target.nom_client || "").trim();
            }
            if (suggestionsBox) suggestionsBox.style.display = "none";
            this.onInterventionChange(id);
          }
        } else if (e.key === "Escape") {
          if (suggestionsBox) suggestionsBox.style.display = "none";
        }
      });

      searchInput.addEventListener("focus", () => {
        if (this.filterText.trim().length > 0) {
          this.renderInterventionOptions();
        }
      });

      if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
          searchInput.value = "";
          this.filterText = "";
          if (suggestionsBox) suggestionsBox.style.display = "none";
          clearSearchBtn.style.display = "none";
          this.renderInterventionOptions();
        });
      }

      // Fermer les suggestions si clic en dehors
      document.addEventListener("click", (e) => {
        const wrap = document.querySelector(".search-input-wrap");
        if (wrap && !wrap.contains(e.target)) {
          if (suggestionsBox) suggestionsBox.style.display = "none";
        }
      });

      // Rafraîchir avec contournement de cache et rechargement de l'intervention active
      document.getElementById("chaptech-btn-refresh").addEventListener("click", async () => {
        this.showToast("🔄 Actualisation forcée depuis FibreTrack...", "info", 1500);
        await this.fetchInterventions(true);
        if (this.selectedIntervention && this.selectedIntervention.id) {
          await this.onInterventionChange(this.selectedIntervention.id, true);
          if (this.canAutoFill()) {
            this.handleAutofill(true);
          }
        }
      });

      // Changement d'intervention via select natif
      document.getElementById("chaptech-intervention-select").addEventListener("change", (e) => {
        const val = e.target.value;
        if (val) {
          const target = this.interventions.find((i) => i.id === val);
          if (target && searchInput) {
            searchInput.value = (target.nom_client || "").trim();
            this.filterText = (target.nom_client || "").trim();
          }
        }
        this.onInterventionChange(val);
      });

      // Toggle Super-Pilote
      const autoPilotToggle = document.getElementById("chaptech-toggle-autopilot");
      if (autoPilotToggle) {
        autoPilotToggle.checked = Boolean(this.autoPilotEnabled);
        autoPilotToggle.addEventListener("change", (e) => {
          this.setAutoPilotState(e.target.checked, true);
          this.showToast(
            this.autoPilotEnabled
              ? "⚡ Mode Super-Pilote activé : pré-remplissage automatique activé !"
              : "Mode Super-Pilote suspendu : remplissage manuel uniquement",
            "info",
            2500
          );
          if (this.canAutoFill()) {
            this.handleAutofill(true);
          }
        });
      }

      // Bouton Remplir
      document.getElementById("chaptech-btn-autofill").addEventListener("click", () => this.handleAutofill(false));

      // Bouton Copier WhatsApp / Global
      document.getElementById("chaptech-btn-copy-wa").addEventListener("click", () => this.copyWhatsApp());

      // Bouton Copier Conformité
      const btnConformite = document.getElementById("chaptech-btn-copy-conformite");
      if (btnConformite) {
        btnConformite.addEventListener("click", () => this.copyConformiteReport());
      }

      // Bouton Copier JSON
      document.getElementById("chaptech-btn-copy-json").addEventListener("click", () => this.copyJson());

      // Tiroir import
      const importDrawer = document.getElementById("chaptech-import-drawer");
      document.getElementById("chaptech-btn-import-toggle").addEventListener("click", () => {
        importDrawer.style.display = importDrawer.style.display === "none" ? "block" : "none";
      });

      document.getElementById("chaptech-btn-import-cancel").addEventListener("click", () => {
        importDrawer.style.display = "none";
      });

      document.getElementById("chaptech-btn-import-confirm").addEventListener("click", () => {
        const text = document.getElementById("chaptech-import-textarea").value;
        this.importJson(text);
      });

      // Accordéon détails
      const toggleDetails = document.getElementById("chaptech-toggle-details");
      const detailsContent = document.getElementById("chaptech-details-content");
      toggleDetails.addEventListener("click", () => {
        const isHidden = detailsContent.style.display === "none";
        detailsContent.style.display = isHidden ? "block" : "none";
        toggleDetails.querySelector(".arrow").textContent = isHidden ? "▲" : "▼";
      });
    }
  }

  return CelprosWidget;
});
