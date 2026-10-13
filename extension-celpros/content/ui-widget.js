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
    }

    init() {
      // Éviter l'injection multiple
      if (document.getElementById("chaptech-celpros-widget-root")) {
        return;
      }

      this.createDom();
      this.loadInitialState();
      this.attachEventListeners();
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

            <!-- Bouton Principal d'action -->
            <div class="chaptech-actions-box">
              <button class="chaptech-btn-primary" id="chaptech-btn-autofill" disabled>
                🚀 Remplir le formulaire CelPros
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
            }
          }
        });

        // Charger la liste des interventions depuis l'API
        this.fetchInterventions();
      } else {
        // Mode autonome hors-extension (test direct du fichier HTML)
        this.setApiStatus("connected", "Mode démo locale");
        this.interventions = [
          {
            id: "demo-intervention-001",
            nom_client: "KOUASSI Jean-Baptiste",
            nom_technicien: "Davy H.",
            nom_equipe: "TELECOM BTP Services",
            adresse_zone: "Haie Vive, Cotonou",
            mobile: "0197123456",
            telephone_ligne: "21301234",
            offre_souscrite: "Fibre Pro",
            etat: "PON",
            msan: "MSAN_COTONOU_02",
            fat_ref: "FAT-HV-07",
            port: "4",
            ports_disponibles: "Port 1, Port 2, Port 8",
            port_disponible: 3,
            puissance_fat_dbm: -18.45,
            puissance_pto_dbm: -19.8,
            type_cable: "Drop 1FO",
            depart_m: 1000,
            arrivee_m: 1150,
            lineaire_m: 150,
            nb_poteaux_traverses: 3,
            nb_poteaux_implantes: 1,
            nb_poteaux_armes: 2,
            pto_qte: 1,
            repeteur_wifi_qte: 0,
            emplacement_ont: "Salon",
            mac: "48:57:02:11:22:33",
            sn: "ALCLB998877",
            travaux_conformes: true,
            emplacement_valide: true,
            travail_propre: true,
            service_teste: true,
            service_fonctionne: true,
            explications_donnees: true,
            qualite: "Très satisfait",
            delais: "Satisfait",
            professionnalisme: "Satisfait",
            remarque_libre: "Installation rapide et propre",
            points_gps: [
              { type: "Poteau", numero: 1, lat: 6.3551, lng: 2.411 },
              { type: "Abonné", numero: 1, lat: 6.356, lng: 2.4125 },
            ],
            whatsapp_photos: [{ id: "p1" }, { id: "p2" }],
          },
        ];
        this.renderInterventionOptions();
        this.setSelectedIntervention(this.interventions[0], false);
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
            this.setApiStatus("connected", `${res.data.length} fiches`);
            this.renderInterventionOptions();
          } else {
            this.setApiStatus("error", "Erreur connexion");
            this.showToast(`⚠️ Impossible de joindre l'API ChapTech: ${res?.error || "Inconnu"}`, "error");
          }
        });
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

      this.showToast("Chargement des détails...", "info", 1500);

      // Récupérer les détails complets via background service worker
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "FETCH_INTERVENTION_DETAILS", payload: { id } }, (res) => {
          if (res && res.ok && res.data) {
            this.setSelectedIntervention(res.data, true);
            this.showToast(`Fiche chargée : <strong>${res.data.nom_client}</strong>`, "success");
          } else {
            // En cas d'échec de fetch détaillé, chercher dans la liste locale light
            const light = this.interventions.find((i) => i.id === id);
            if (light) {
              this.setSelectedIntervention(light, true);
            }
          }
        });
      } else {
        const item = this.interventions.find((i) => i.id === id);
        if (item) {
          this.setSelectedIntervention(item, false);
          this.showToast(`Fiche chargée : <strong>${item.nom_client}</strong>`, "success");
        }
      }
    }

    setSelectedIntervention(data, syncToBackground = true) {
      if (!data) {
        this.selectedIntervention = null;
        this.updateSummaryCard();
        return;
      }

      // Éviter le re-traitement en boucle si les données sont déjà actives
      if (this.selectedIntervention && this.selectedIntervention.id === data.id) {
        this.selectedIntervention = data;
        this.updateSummaryCard();
        return;
      }

      this.selectedIntervention = data;
      this.updateSummaryCard();

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
        return;
      }

      const d = this.selectedIntervention;
      card.style.display = "block";
      btnAutofill.disabled = false;

      document.getElementById("card-client-name").textContent = d.nom_client || "Client Inconnu";
      document.getElementById("card-status").textContent = d.statut === "termine" ? "✅ Terminé" : "⏳ En cours";
      document.getElementById("card-phone").textContent = d.mobile || d.telephone_ligne || "N/A";
      document.getElementById("card-zone").textContent = d.adresse_zone || "N/A";
      document.getElementById("card-fat").textContent = d.fat_ref ? `${d.fat_ref} (${d.msan || "MSAN"})` : "N/A";
      document.getElementById("card-port").textContent = d.port ? `Port ${d.port}` : "N/A";
      document.getElementById("card-power").textContent = `${d.puissance_fat_dbm ?? "-"} / ${d.puissance_pto_dbm ?? "-"} dBm`;
      document.getElementById("card-sn").textContent = d.sn || d.ont_sn || "N/A";
    }

    handleAutofill() {
      if (!this.selectedIntervention) {
        this.showToast("Veuillez d'abord sélectionner une intervention", "warning");
        return;
      }

      const report = FormFiller.autofillPage(this.selectedIntervention, document);
      this.lastFillReport = report;

      const resultBanner = document.getElementById("chaptech-fill-result");
      if (resultBanner) {
        resultBanner.style.display = "block";
        if (report.filledCount > 0) {
          resultBanner.className = "chaptech-result-banner success";
          resultBanner.innerHTML = `✅ <strong>${report.filledCount} champ(s)</strong> remplis avec succès sur cette page !`;
          this.showToast(`⚡ <strong>${report.filledCount} champs</strong> remplis sur CelPros !`, "success", 4000);
        } else {
          resultBanner.className = "chaptech-result-banner warning";
          resultBanner.innerHTML = `⚠️ Aucun champ correspondant n'a été trouvé sur la page courante (${report.totalScanned} éléments scannés).`;
          this.showToast("⚠️ Aucun champ CelPros correspondant n'a été trouvé sur cette page", "warning");
        }
      }

      this.renderFieldsBreakdown(report);
    }

    renderFieldsBreakdown(report) {
      const container = document.getElementById("chaptech-fields-breakdown");
      if (!container) return;

      if (!report || !report.filledDetails) {
        container.innerHTML = "<em>Aucune donnée d'inspection disponible.</em>";
        return;
      }

      let html = `<div class="breakdown-summary">Éléments analysés : ${report.totalScanned} | Remplis : ${report.filledCount}</div>`;

      if (report.filledDetails.length > 0) {
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

      // Bouton Remplir
      document.getElementById("chaptech-btn-autofill").addEventListener("click", () => this.handleAutofill());

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
