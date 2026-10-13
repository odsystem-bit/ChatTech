// Widget Flottant ChapTech CelPros
// Interface injectée dans la page CelPros / FAT Automation

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define(["./field-mapping", "./form-filler"], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CelprosWidget = factory(root.FieldMapping, root.FormFiller);
  }
})(typeof self !== "undefined" ? self : this, function (FieldMapping, FormFiller) {
  "use strict";

  class CelprosWidget {
    constructor() {
      this.container = null;
      this.isCollapsed = false;
      this.interventions = [];
      this.selectedIntervention = null;
      this.apiStatus = "unknown"; // "connected", "error", "loading"
      this.filterText = "";
      this.lastFillReport = null;
      this.autoPilotEnabled = true;
      this.currentStepInfo = null;
      this.lastStepFilled = null;
      this.isAutofilling = false;
      this.observer = null;
      this.autoFillTimeout = null;
    }

    init() {
      // Éviter l'injection multiple
      if (document.getElementById("chaptech-celpros-widget-root")) {
        return;
      }

      this.createDom();
      this.loadInitialState();
      this.attachEventListeners();
      this.setupAutoPilotObserver();
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
            <div class="chaptech-section">
              <div class="section-label-row">
                <label for="chaptech-intervention-select">Sélectionner une intervention :</label>
                <button class="btn-text-action" id="chaptech-btn-refresh" title="Recharger depuis ChapTech">🔄 Actualiser</button>
              </div>

              <div class="search-input-wrap">
                <input 
                  type="text" 
                  id="chaptech-search-input" 
                  class="chaptech-input" 
                  placeholder="Rechercher (Nom client, FAT, Tél...)" 
                />
              </div>

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
            <div class="chaptech-tools-row">
              <button class="chaptech-btn-sub" id="chaptech-btn-copy-wa" title="Copier rapport texte pour WhatsApp">
                📋 Copier WhatsApp
              </button>
              <button class="chaptech-btn-sub" id="chaptech-btn-copy-json" title="Copier les données JSON brutes">
                📦 Copier JSON
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

    async loadInitialState() {
      // Vérifier si le panneau était replié dans la session
      const savedCollapsed = localStorage.getItem("chaptech_widget_collapsed") === "true";
      this.setCollapsed(savedCollapsed);

      // Charger la configuration et l'intervention active
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "GET_CONFIG" }, (res) => {
          if (res && res.ok && res.data) {
            if (res.data.activeIntervention) {
              this.setSelectedIntervention(res.data.activeIntervention, false);
              // Rafraîchir systématiquement les détails réels complets pour charger points_gps, materiel_pose, photos
              if (res.data.activeIntervention.id) {
                this.onInterventionChange(res.data.activeIntervention.id);
              }
            }
          }
        });

        // Charger la liste des interventions depuis l'API
        this.fetchInterventions();
      } else {
        // Mode autonome hors-extension (test direct du fichier HTML / démo)
        // Charger directement les données réelles depuis l'API FibreTrack (CORS activé)
        this.fetchInterventions();
      }
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

    async fetchInterventions() {
      this.setApiStatus("loading", "Synchronisation...");
      const select = document.getElementById("chaptech-intervention-select");
      if (select) select.disabled = true;

      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "FETCH_INTERVENTIONS" }, (res) => {
          if (select) select.disabled = false;
          if (res && res.ok && Array.isArray(res.data)) {
            this.interventions = res.data;
            this.setApiStatus("connected", `${res.data.length} fiches réelles`);
            this.renderInterventionOptions();
            this.tryAutoMatchInterventionFromPage();
          } else {
            this.setApiStatus("error", "Erreur connexion");
            this.showToast(`⚠️ Impossible de joindre l'API FibreTrack: ${res?.error || "Inconnu"}`, "error");
          }
        });
      } else {
        // Mode autonome / hors-extension (direct fetch via API FibreTrack avec CORS)
        try {
          const res = await fetch("https://fibretrack.mantota.com/api/index.php?action=interventions_list_light", {
            headers: { "X-User-Code": "9999" },
          });
          const data = await res.json();
          if (select) select.disabled = false;
          if (Array.isArray(data)) {
            this.interventions = data;
            this.setApiStatus("connected", `${data.length} fiches réelles`);
            this.renderInterventionOptions();
            if (!this.selectedIntervention && this.interventions.length > 0) {
              this.onInterventionChange(this.interventions[0].id);
            }
          } else {
            throw new Error(data.error || "Réponse invalide");
          }
        } catch (err) {
          if (select) select.disabled = false;
          this.setApiStatus("error", "Erreur connexion");
          this.showToast(`⚠️ Impossible de joindre l'API FibreTrack: ${err.message}`, "error");
        }
      }
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
      if (!select) return;

      const filter = (this.filterText || "").toLowerCase().trim();
      select.innerHTML = '<option value="">-- Choisir une intervention --</option>';

      const filtered = this.interventions.filter((item) => {
        if (!filter) return true;
        const text = `${item.nom_client || ""} ${item.msan || ""} ${item.fat_ref || ""} ${item.telephone_ligne || ""} ${item.mobile || ""}`.toLowerCase();
        return text.includes(filter);
      });

      for (const item of filtered) {
        const opt = document.createElement("option");
        opt.value = item.id;
        const date = item.date ? item.date.slice(0, 10) : "";
        const client = item.nom_client || "Sans nom";
        const fat = item.fat_ref ? `[${item.fat_ref}]` : "";
        opt.textContent = `${client} ${fat} (${date})`;
        if (this.selectedIntervention && this.selectedIntervention.id === item.id) {
          opt.selected = true;
        }
        select.appendChild(opt);
      }
    }

    async onInterventionChange(id) {
      if (!id) {
        this.selectedIntervention = null;
        this.updateSummaryCard();
        return;
      }

      this.showToast("Chargement des détails réels...", "info", 1500);

      // Récupérer les détails complets via background service worker
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "FETCH_INTERVENTION_DETAILS", payload: { id } }, (res) => {
          if (res && res.ok && res.data) {
            this.setSelectedIntervention(res.data, true);
            this.showToast(`Fiche réelle chargée : <strong>${res.data.nom_client}</strong>`, "success");
          } else {
            // En cas d'échec de fetch détaillé, chercher dans la liste locale light
            const light = this.interventions.find((i) => i.id === id);
            if (light) {
              this.setSelectedIntervention(light, true);
            }
          }
        });
      } else {
        // Mode autonome / hors-extension (direct fetch via API FibreTrack avec CORS)
        try {
          const res = await fetch("https://fibretrack.mantota.com/api/index.php?action=intervention_get", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-User-Code": "9999",
            },
            body: JSON.stringify({ id: String(id) }),
          });
          const item = await res.json();
          if (item && item.id) {
            this.setSelectedIntervention(item, false);
            this.showToast(`Fiche réelle chargée : <strong>${item.nom_client}</strong>`, "success");
          } else {
            throw new Error(item.error || "Fiche introuvable");
          }
        } catch (err) {
          const light = this.interventions.find((i) => i.id === id);
          if (light) {
            this.setSelectedIntervention(light, false);
          }
          this.showToast(`⚠️ Erreur chargement détails réels: ${err.message}`, "error");
        }
      }
    }

    setSelectedIntervention(data, syncToBackground = true) {
      if (!data) {
        this.selectedIntervention = null;
        this.updateSummaryCard();
        return;
      }

      this.selectedIntervention = data;
      this.updateSummaryCard();

      // Synchroniser visuellement la sélection dans le <select>
      const select = document.getElementById("chaptech-intervention-select");
      if (select && data.id && select.value !== data.id) {
        select.value = data.id;
      }

      // Sauvegarder dans background pour persistance entre onglets uniquement si explicitement demandé
      if (syncToBackground && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "SET_ACTIVE_INTERVENTION", payload: data }).catch(() => {});
      }
    }

    updateSummaryCard() {
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

      document.getElementById("card-client-name").textContent = d.nom_client || "Client Inconnu";
      document.getElementById("card-status").textContent = d.statut === "termine" ? "✅ Terminé" : "⏳ En cours";
      document.getElementById("card-phone").textContent = d.mobile || d.telephone_ligne || "-";
      document.getElementById("card-zone").textContent = d.adresse_zone || "-";
      document.getElementById("card-fat").textContent = d.fat_ref ? `${d.fat_ref} (${d.msan || "MSAN"})` : "-";
      document.getElementById("card-port").textContent = d.port ? `Port ${d.port}` : "-";
      const fatPow = d.puissance_fat_dbm && Number(d.puissance_fat_dbm) !== 0 ? `${d.puissance_fat_dbm} dBm` : "-";
      const ptoPow = d.puissance_pto_dbm && Number(d.puissance_pto_dbm) !== 0 ? `${d.puissance_pto_dbm} dBm` : "-";
      document.getElementById("card-power").textContent = `${fatPow} / ${ptoPow}`;
      document.getElementById("card-sn").textContent = d.sn || d.ont_sn || "-";

      this.updateStepDisplay();

      // En mode Super-Pilote, déclencher automatiquement le remplissage de l'étape courante
      if (this.autoPilotEnabled && !this.isAutofilling) {
        if (this.autoFillTimeout) clearTimeout(this.autoFillTimeout);
        this.autoFillTimeout = setTimeout(() => {
          this.handleAutofill(true);
        }, 300);
      }
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

    setupAutoPilotObserver() {
      if (this.observer || typeof MutationObserver === "undefined") return;

      // Surveillance des transitions dynamiques dans le DOM de CelPros (SPA)
      this.observer = new MutationObserver((mutations) => {
        if (!this.autoPilotEnabled || !this.selectedIntervention || this.isAutofilling) return;

        let hasRelevantChange = false;
        for (const m of mutations) {
          if (m.type === "childList" && m.addedNodes.length > 0) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1) {
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
            const stepNum = FormFiller && FormFiller.detectCurrentStep ? FormFiller.detectCurrentStep(document) : 1;
            this.updateStepDisplay(stepNum);
            if (this.lastStepFilled !== stepNum) {
              this.handleAutofill(true);
            }
          }, 350);
        }
      });

      this.observer.observe(document.body, { childList: true, subtree: true });

      // Écouter les clics sur les boutons de navigation (Suivant / Précédent / Numéros d'étapes)
      document.addEventListener(
        "click",
        (e) => {
          const btn = e.target.closest("button, a, .step, [class*='step'], [class*='next'], [class*='wizard']");
          if (btn && this.autoPilotEnabled && this.selectedIntervention) {
            setTimeout(() => {
              const stepNum = FormFiller && FormFiller.detectCurrentStep ? FormFiller.detectCurrentStep(document) : 1;
              this.updateStepDisplay(stepNum);
              if (this.lastStepFilled !== stepNum) {
                this.handleAutofill(true);
              }
            }, 450);
          }
        },
        true
      );
    }

    async handleAutofill(isAuto = false) {
      if (!this.selectedIntervention) {
        if (!isAuto) this.showToast("Veuillez d'abord sélectionner une intervention", "warning");
        return;
      }

      if (this.isAutofilling) return;
      this.isAutofilling = true;

      const btnAutofill = document.getElementById("chaptech-btn-autofill");
      if (btnAutofill) {
        btnAutofill.disabled = true;
        btnAutofill.innerHTML = "⏳ Injection en cours…";
      }

      try {
        const report = await FormFiller.autofillPage(this.selectedIntervention, document);
        this.lastFillReport = report;

        const currentStepNum = report.currentStep || 1;
        this.lastStepFilled = currentStepNum;
        this.updateStepDisplay(currentStepNum);

        const fieldsCount = report.filledCount || 0;
        const photosCount = report.photosInjected || 0;
        const totalActions = fieldsCount + photosCount;

        const resultBanner = document.getElementById("chaptech-fill-result");
        if (resultBanner) {
          resultBanner.style.display = "block";
          if (totalActions > 0) {
            resultBanner.className = "chaptech-result-banner success";

            let photosBadgesHtml = "";
            if (report.photoDetails && report.photoDetails.length > 0) {
              photosBadgesHtml = `
                <div class="result-photos-grid">
                  ${report.photoDetails.map((p) => `<span class="photo-chip" title="${p.fileName}">📸 ${p.label}</span>`).join("")}
                </div>
              `;
            }

            resultBanner.innerHTML = `
              <div class="result-head">✅ <strong>Étape ${currentStepNum}</strong> complétée ${isAuto ? '<span class="auto-pill">⚡ Super-Pilote</span>' : ""}</div>
              <div class="result-stats">
                <span class="stat-tag fields">📝 <strong>${fieldsCount}</strong> champ(s)</span>
                <span class="stat-tag photos">📸 <strong>${photosCount}</strong> photo(s)</span>
              </div>
              ${photosBadgesHtml}
              <div class="result-hint">👉 Vérifiez puis cliquez sur <strong>Suivant</strong> dans CelPros.</div>
            `;
            this.showToast(
              `⚡ <strong>${fieldsCount} champs</strong> et <strong>${photosCount} photos</strong> injectés pour l'Étape ${currentStepNum} !`,
              "success",
              4000
            );
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
        if (btnAutofill) {
          btnAutofill.disabled = false;
          btnAutofill.innerHTML = "🚀 Remplir cette étape (Champs &amp; Photos)";
        }
      }
    }

    renderFieldsBreakdown(report) {
      const container = document.getElementById("chaptech-fields-breakdown");
      if (!container) return;

      if (!report || (!report.filledDetails && !report.photoDetails)) {
        container.innerHTML = "<em>Aucune donnée d'inspection disponible.</em>";
        return;
      }

      let html = `<div class="breakdown-summary">Éléments analysés : ${report.totalScanned || 0} | Champs : ${report.filledCount || 0} | Photos : ${report.photosInjected || 0}</div>`;

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
      const text = FormFiller.formatWhatsAppReport(this.selectedIntervention);
      const ok = await this.safeCopyToClipboard(text);
      if (ok) {
        this.showToast("📋 Rapport texte copié dans le presse-papiers !", "success");
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

      // Recherche filtrée
      document.getElementById("chaptech-search-input").addEventListener("input", (e) => {
        this.filterText = e.target.value;
        this.renderInterventionOptions();
      });

      // Rafraîchir
      document.getElementById("chaptech-btn-refresh").addEventListener("click", () => this.fetchInterventions());

      // Changement d'intervention
      document.getElementById("chaptech-intervention-select").addEventListener("change", (e) => {
        this.onInterventionChange(e.target.value);
      });

      // Toggle Super-Pilote
      const autoPilotToggle = document.getElementById("chaptech-toggle-autopilot");
      if (autoPilotToggle) {
        autoPilotToggle.addEventListener("change", (e) => {
          this.autoPilotEnabled = e.target.checked;
          this.showToast(
            this.autoPilotEnabled
              ? "⚡ Mode Super-Pilote activé : pré-remplissage automatique activé !"
              : "Mode Super-Pilote suspendu : remplissage manuel",
            "info",
            2500
          );
          if (this.autoPilotEnabled && this.selectedIntervention) {
            this.handleAutofill(true);
          }
        });
      }

      // Bouton Remplir
      document.getElementById("chaptech-btn-autofill").addEventListener("click", () => this.handleAutofill(false));

      // Bouton Copier WhatsApp
      document.getElementById("chaptech-btn-copy-wa").addEventListener("click", () => this.copyWhatsApp());

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
