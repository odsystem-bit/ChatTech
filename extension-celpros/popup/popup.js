// Popup Controller pour ChapTech CelPros

document.addEventListener("DOMContentLoaded", async () => {
  const connBadge = document.getElementById("conn-badge");
  const pageStatusText = document.getElementById("page-status-text");
  const btnTriggerAutofill = document.getElementById("btn-trigger-autofill");
  const activeClientName = document.getElementById("active-client-name");
  const activeDetails = document.getElementById("active-details");
  const activeStatusBadge = document.getElementById("active-status-badge");
  const cfgApiUrl = document.getElementById("cfg-api-url");
  const cfgApiCode = document.getElementById("cfg-api-code");
  const btnSaveCfg = document.getElementById("btn-save-cfg");
  const btnTestConn = document.getElementById("btn-test-conn");
  const btnOpenDemo = document.getElementById("btn-open-demo");
  const msgBanner = document.getElementById("msg-banner");

  // Sélecteur d'intervention dans le popup
  const popupBtnRefresh = document.getElementById("popup-btn-refresh");
  const popupSearchInput = document.getElementById("popup-search-input");
  const popupSearchClear = document.getElementById("popup-search-clear");
  const popupSearchSuggestions = document.getElementById("popup-search-suggestions");
  const popupInterventionSelect = document.getElementById("popup-intervention-select");
  const popupCountEnCours = document.getElementById("popup-count-en-cours");
  const popupCountAll = document.getElementById("popup-count-all");
  const popupCountTerminees = document.getElementById("popup-count-terminees");

  let interventionsList = [];
  let statusTabFilter = "en_cours";
  let searchFilterText = "";
  let activeInterventionData = null;

  function showMessage(text, type = "success") {
    msgBanner.innerHTML = text;
    msgBanner.className = `msg-banner ${type}`;
    msgBanner.style.display = "block";
    setTimeout(() => {
      msgBanner.style.display = "none";
    }, 3500);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text || "");
    const safe = escapeHtml(text);
    const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${q})`, "gi");
    return safe.replace(regex, "<mark class='match-hl'>$1</mark>");
  }

  function renderActiveIntervention(d) {
    if (!d) return;
    activeInterventionData = d;
    activeClientName.textContent = d.nom_client || "Client sans nom";
    activeStatusBadge.textContent = d.statut === "termine" ? "✅ Terminé" : "⏳ En cours";
    activeStatusBadge.className = `badge-mini ${d.statut === "termine" ? "badge-done" : "badge-progress"}`;
    activeDetails.textContent = `${d.fat_ref ? "FAT " + d.fat_ref : ""} • ${d.mobile || d.telephone_ligne || ""} • Port ${d.port || "-"}`;

    if (popupInterventionSelect && d.id && popupInterventionSelect.value !== d.id) {
      popupInterventionSelect.value = d.id;
    }
  }

  // 1. Charger la configuration et l'intervention active
  chrome.runtime.sendMessage({ action: "GET_CONFIG" }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn("[CelPros Popup] GET_CONFIG error:", chrome.runtime.lastError.message);
    }
    if (res && res.ok && res.data) {
      const cfg = res.data;
      cfgApiUrl.value = cfg.apiUrl || "https://fibretrack.mantota.com/api/index.php";
      cfgApiCode.value = cfg.apiCode || "9999";

      if (cfg.activeIntervention) {
        renderActiveIntervention(cfg.activeIntervention);
      }
    }
    testConnection();
    loadInterventions();
  });

  // 2. Charger la liste des interventions depuis le background
  function loadInterventions() {
    if (popupInterventionSelect) popupInterventionSelect.disabled = true;
    chrome.runtime.sendMessage({ action: "FETCH_INTERVENTIONS" }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("[CelPros Popup] FETCH_INTERVENTIONS error:", chrome.runtime.lastError.message);
        if (popupInterventionSelect) popupInterventionSelect.disabled = false;
        showMessage(`⚠️ Erreur: ${chrome.runtime.lastError.message}`, "error");
        return;
      }
      if (popupInterventionSelect) popupInterventionSelect.disabled = false;
      if (res && res.ok && Array.isArray(res.data)) {
        interventionsList = res.data;

        // Si aucun dossier n'est en cours mais qu'il y a des dossiers (ex: 62 terminés),
        // basculer automatiquement sur "Tous" pour que la liste ne soit jamais vide !
        const totalEnCours = interventionsList.filter((i) => (i.statut || "").toLowerCase() !== "termine").length;
        if (totalEnCours === 0 && interventionsList.length > 0) {
          statusTabFilter = "all";
          document.querySelectorAll(".popup-pill").forEach((pill) => {
            pill.classList.toggle("is-active", pill.getAttribute("data-status") === "all");
          });
        }

        renderPopupOptions();
      } else {
        showMessage(`⚠️ Erreur chargement des fiches: ${res?.error || "Inconnu"}`, "error");
      }
    });
  }

  function renderPopupOptions() {
    if (!popupInterventionSelect) return;

    const totalEnCours = interventionsList.filter((i) => (i.statut || "").toLowerCase() !== "termine").length;
    const totalTerminees = interventionsList.filter((i) => (i.statut || "").toLowerCase() === "termine").length;
    const totalAll = interventionsList.length;

    if (popupCountEnCours) popupCountEnCours.textContent = String(totalEnCours);
    if (popupCountAll) popupCountAll.textContent = String(totalAll);
    if (popupCountTerminees) popupCountTerminees.textContent = String(totalTerminees);

    const filter = (searchFilterText || "").toLowerCase().trim();
    if (popupSearchClear) {
      popupSearchClear.style.display = filter ? "flex" : "none";
    }

    let matching = interventionsList;
    if (filter) {
      matching = interventionsList.filter((item) => {
        const text = `${item.nom_client || ""} ${item.msan || ""} ${item.fat_ref || ""} ${item.telephone_ligne || ""} ${item.mobile || ""} ${item.id || ""}`.toLowerCase();
        return text.includes(filter);
      });
    } else {
      if (statusTabFilter === "en_cours") {
        matching = interventionsList.filter((i) => (i.statut || "").toLowerCase() !== "termine");
      } else if (statusTabFilter === "termine") {
        matching = interventionsList.filter((i) => (i.statut || "").toLowerCase() === "termine");
      }
    }

    // Suggestions dropdown
    if (popupSearchSuggestions) {
      if (filter.length > 0) {
        renderPopupSuggestions(matching, filter);
      } else {
        popupSearchSuggestions.style.display = "none";
        popupSearchSuggestions.innerHTML = "";
      }
    }

    // Select natif groupé
    popupInterventionSelect.innerHTML = '<option value="">-- Choisir une intervention --</option>';

    const enCoursGroup = matching.filter((i) => (i.statut || "").toLowerCase() !== "termine");
    const termineesGroup = matching.filter((i) => (i.statut || "").toLowerCase() === "termine");

    if (enCoursGroup.length > 0) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = `⚡ En cours (${enCoursGroup.length})`;
      for (const item of enCoursGroup) {
        const opt = document.createElement("option");
        opt.value = item.id;
        const date = item.date ? item.date.slice(0, 10) : "";
        const client = (item.nom_client || "Sans nom").trim();
        const fat = item.fat_ref ? ` [${item.fat_ref.trim()}]` : "";
        opt.textContent = `${client}${fat} (${date})`;
        if (activeInterventionData && activeInterventionData.id === item.id) {
          opt.selected = true;
        }
        optgroup.appendChild(opt);
      }
      popupInterventionSelect.appendChild(optgroup);
    }

    if (termineesGroup.length > 0) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = `✅ Terminées (${termineesGroup.length})`;
      for (const item of termineesGroup) {
        const opt = document.createElement("option");
        opt.value = item.id;
        const date = item.date ? item.date.slice(0, 10) : "";
        const client = (item.nom_client || "Sans nom").trim();
        const fat = item.fat_ref ? ` [${item.fat_ref.trim()}]` : "";
        opt.textContent = `${client}${fat} (${date})`;
        if (activeInterventionData && activeInterventionData.id === item.id) {
          opt.selected = true;
        }
        optgroup.appendChild(opt);
      }
      popupInterventionSelect.appendChild(optgroup);
    }
  }

  function renderPopupSuggestions(items, query) {
    if (!popupSearchSuggestions) return;
    if (!items || items.length === 0) {
      popupSearchSuggestions.innerHTML = `<div class="suggestion-empty">Aucun dossier trouvé pour « <strong>${escapeHtml(query)}</strong> »</div>`;
      popupSearchSuggestions.style.display = "block";
      return;
    }

    let html = "";
    const limit = Math.min(items.length, 8);
    for (let i = 0; i < limit; i++) {
      const item = items[i];
      const isDone = (item.statut || "").toLowerCase() === "termine";
      const client = (item.nom_client || "Sans nom").trim();
      const fat = item.fat_ref ? item.fat_ref.trim() : "";
      const phone = item.mobile || item.telephone_ligne || "";
      const isSelected = activeInterventionData && activeInterventionData.id === item.id;

      html += `
        <div class="popup-suggestion-item ${isSelected ? "is-selected" : ""}" data-id="${item.id}">
          <div class="suggestion-head">
            <span class="suggestion-client">${highlightMatch(client, query)}</span>
            <span class="badge-mini ${isDone ? "badge-done" : "badge-progress"}">${isDone ? "Terminée" : "En cours"}</span>
          </div>
          <div class="suggestion-sub">
            ${fat ? `<span>FAT: ${highlightMatch(fat, query)}</span>` : ""}
            ${phone ? `<span>Tél: ${highlightMatch(phone, query)}</span>` : ""}
          </div>
        </div>
      `;
    }

    popupSearchSuggestions.innerHTML = html;
    popupSearchSuggestions.style.display = "block";

    popupSearchSuggestions.querySelectorAll(".popup-suggestion-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-id");
        selectInterventionById(id);
        popupSearchSuggestions.style.display = "none";
      });
    });
  }

  function selectInterventionById(id) {
    if (!id) return;
    showMessage("Chargement des détails...", "success");

    chrome.runtime.sendMessage({ action: "FETCH_INTERVENTION_DETAILS", payload: { id } }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("[CelPros Popup] FETCH_INTERVENTION_DETAILS error:", chrome.runtime.lastError.message);
      }
      if (res && res.ok && res.data) {
        renderActiveIntervention(res.data);
        if (popupSearchInput) popupSearchInput.value = (res.data.nom_client || "").trim();
        showMessage(`⚡ Dossier actif : <strong>${escapeHtml(res.data.nom_client)}</strong>`);

        // Propager aux onglets ouverts en toute sécurité
        chrome.runtime.sendMessage({ action: "SET_ACTIVE_INTERVENTION", payload: res.data }, () => {
          if (chrome.runtime.lastError) {
            /* ignoré silencieusement */
          }
        });
      } else {
        const match = interventionsList.find((i) => i.id === id);
        if (match) {
          renderActiveIntervention(match);
          if (popupSearchInput) popupSearchInput.value = (match.nom_client || "").trim();
          chrome.runtime.sendMessage({ action: "SET_ACTIVE_INTERVENTION", payload: match }, () => {
            if (chrome.runtime.lastError) {
              /* ignoré silencieusement */
            }
          });
        }
      }
    });
  }

  // Événements pour le sélecteur d'intervention du popup
  if (popupBtnRefresh) {
    popupBtnRefresh.addEventListener("click", () => {
      loadInterventions();
      showMessage("Actualisation de la liste...");
    });
  }

  document.querySelectorAll(".popup-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".popup-pill").forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      statusTabFilter = pill.getAttribute("data-status") || "all";
      renderPopupOptions();
    });
  });

  if (popupSearchInput) {
    popupSearchInput.addEventListener("input", (e) => {
      searchFilterText = e.target.value;
      renderPopupOptions();
    });

    popupSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = popupSearchSuggestions?.querySelector(".popup-suggestion-item");
        if (first) {
          const id = first.getAttribute("data-id");
          selectInterventionById(id);
          popupSearchSuggestions.style.display = "none";
        }
      } else if (e.key === "Escape") {
        if (popupSearchSuggestions) popupSearchSuggestions.style.display = "none";
      }
    });

    popupSearchInput.addEventListener("focus", () => {
      if (searchFilterText.trim().length > 0) {
        renderPopupOptions();
      }
    });
  }

  if (popupSearchClear) {
    popupSearchClear.addEventListener("click", () => {
      if (popupSearchInput) popupSearchInput.value = "";
      searchFilterText = "";
      if (popupSearchSuggestions) popupSearchSuggestions.style.display = "none";
      popupSearchClear.style.display = "none";
      renderPopupOptions();
    });
  }

  document.addEventListener("click", (e) => {
    const wrap = document.querySelector("#popup-selector-card .search-input-wrap");
    if (wrap && !wrap.contains(e.target)) {
      if (popupSearchSuggestions) popupSearchSuggestions.style.display = "none";
    }
  });

  if (popupInterventionSelect) {
    popupInterventionSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val) {
        const item = interventionsList.find((i) => i.id === val);
        if (item && popupSearchInput) {
          popupSearchInput.value = (item.nom_client || "").trim();
          searchFilterText = (item.nom_client || "").trim();
        }
        selectInterventionById(val);
      }
    });
  }

  // 3. Tester la connexion API
  function testConnection() {
    connBadge.className = "badge badge-unknown";
    connBadge.textContent = "Test...";

    const customPayload = {
      apiUrl: cfgApiUrl.value.trim(),
      apiCode: cfgApiCode.value.trim(),
    };

    chrome.runtime.sendMessage({ action: "TEST_CONNECTION", payload: customPayload }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("[CelPros Popup] TEST_CONNECTION error:", chrome.runtime.lastError.message);
        connBadge.className = "badge badge-error";
        connBadge.textContent = "Hors-ligne";
        return;
      }
      if (res && res.ok) {
        connBadge.className = "badge badge-connected";
        connBadge.textContent = `Connecté (${res.count} fiches)`;
      } else {
        connBadge.className = "badge badge-error";
        connBadge.textContent = "Hors-ligne";
      }
    });
  }

  // 4. Détecter l'onglet actif
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.warn("[CelPros Popup] tabs.query error:", chrome.runtime.lastError.message);
      return;
    }
    const activeTab = tabs[0];
    if (!activeTab || !activeTab.url) return;

    const url = activeTab.url.toLowerCase();
    const isCelPros = url.includes("celpros.celtiis.bj");
    const isFatAuto = url.includes("fatautomation.celtiis.bj");
    const isDemo = url.includes("celpros-mock.html") || url.includes("fatautomation-mock.html") || url.includes("localhost");

    if (isCelPros || isFatAuto || isDemo) {
      const siteName = isCelPros ? "CelPros Celtiis" : isFatAuto ? "FAT Automation" : "Démo Locale";
      pageStatusText.innerHTML = `✅ Connecté à <strong>${siteName}</strong>`;
      btnTriggerAutofill.disabled = false;
    } else {
      pageStatusText.innerHTML = `ℹ️ Onglet externe : <code>${new URL(activeTab.url).hostname}</code>`;
      btnTriggerAutofill.disabled = true;
    }
  });

  // Injection dynamique des scripts si l'onglet était déjà ouvert avant le chargement de l'extension
  async function injectContentScripts(tabId) {
    if (typeof chrome === "undefined" || !chrome.scripting) return false;
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["content/content.css"],
      }).catch(() => {});
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [
          "content/field-mapping.js",
          "content/photo-filler.js",
          "content/form-filler.js",
          "content/ui-widget.js",
          "content/content.js",
        ],
      });
      return true;
    } catch (e) {
      console.warn("[CelPros Popup] Injection dynamique impossible:", e);
      return false;
    }
  }

  // 5. Déclencher le remplissage depuis le popup
  btnTriggerAutofill.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        showMessage(`Erreur onglet : ${chrome.runtime.lastError.message}`, "error");
        return;
      }
      const tabId = tabs[0]?.id;
      if (!tabId) {
        showMessage("Aucun onglet actif trouvé", "error");
        return;
      }

      btnTriggerAutofill.disabled = true;
      btnTriggerAutofill.textContent = "⏳ Remplissage en cours…";

      const trySend = (allowInject = true) => {
        chrome.tabs.sendMessage(tabId, { action: "TRIGGER_AUTOFILL" }, async (res) => {
          if (chrome.runtime.lastError) {
            const errStr = chrome.runtime.lastError.message || "";
            console.warn("[CelPros Popup] TRIGGER_AUTOFILL error:", errStr);

            if (allowInject && (errStr.includes("Receiving end does not exist") || errStr.includes("Could not establish connection"))) {
              const injected = await injectContentScripts(tabId);
              if (injected) {
                setTimeout(() => trySend(false), 350);
                return;
              }
            }

            btnTriggerAutofill.disabled = false;
            btnTriggerAutofill.textContent = "🚀 Remplir la page active";
            showMessage("⚠️ Veuillez actualiser la page CelPros (F5) pour activer l'assistant !", "error");
            return;
          }

          btnTriggerAutofill.disabled = false;
          btnTriggerAutofill.textContent = "🚀 Remplir la page active";

          if (res && res.ok) {
            showMessage("⚡ Formulaire rempli avec succès !");
          } else {
            showMessage(res?.error || "Erreur de remplissage", "error");
          }
        });
      };

      trySend(true);
    });
  });

  // 6. Tester manuellement la connexion
  btnTestConn.addEventListener("click", () => {
    testConnection();
    showMessage("Test de connexion en cours...");
  });

  // 7. Sauvegarder la configuration
  btnSaveCfg.addEventListener("click", () => {
    const payload = {
      apiUrl: cfgApiUrl.value.trim(),
      apiCode: cfgApiCode.value.trim(),
    };

    chrome.runtime.sendMessage({ action: "SAVE_CONFIG", payload }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("[CelPros Popup] SAVE_CONFIG error:", chrome.runtime.lastError.message);
        showMessage(`Erreur: ${chrome.runtime.lastError.message}`, "error");
        return;
      }
      if (res && res.ok) {
        showMessage("Configuration enregistrée avec succès !");
        testConnection();
        loadInterventions();
      } else {
        showMessage("Erreur lors de la sauvegarde", "error");
      }
    });
  });

  // 8. Démo de test
  btnOpenDemo.addEventListener("click", () => {
    const demoUrl = chrome.runtime.getURL("demo/celpros-mock.html");
    chrome.tabs.create({ url: demoUrl });
  });
});
