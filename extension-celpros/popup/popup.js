// Popup Controller pour ChapTech CelPros (Manifest V3)
// Architecture moderne 100% asynchrone Promise-based, sans callbacks dépréciés
// Élimine définitivement l'erreur "Could not establish connection. Receiving end does not exist."

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
  let statusTabFilter = "all";
  let searchFilterText = "";
  let activeInterventionData = null;

  function parseTimestampSafely(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return 0;
    const clean = dateStr.trim().replace(/\.+$/, "").replace(" ", "T");
    const ts = Date.parse(clean);
    return isNaN(ts) ? 0 : ts;
  }

  function isItemTermine(item) {
    if (!item) return false;
    const s = String(item.statut || "").trim().toLowerCase();
    const norm = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return norm === "termine" || norm === "terminee" || norm === "cloture" || norm === "cloturee" || norm === "clos" || norm === "closed" || norm === "done" || Boolean(item.date_cloture);
  }

  function showMessage(text, type = "success") {
    if (!msgBanner) return;
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

  function formatApiActionUrl(baseUrl, action) {
    let clean = (baseUrl || "https://fibretrack.mantota.com/api/index.php").trim().replace(/\/+$/, "");
    if (!clean.includes(".php") && !clean.includes("?")) {
      clean = `${clean}/index.php`;
    }
    const sep = clean.includes("?") ? "&" : "?";
    return `${clean}${sep}action=${encodeURIComponent(action)}&_t=${Date.now()}`;
  }

  function renderActiveIntervention(d) {
    if (!d) return;
    activeInterventionData = d;
    if (activeClientName) activeClientName.textContent = d.nom_client || "Client sans nom";
    if (activeStatusBadge) {
      const isDone = isItemTermine(d);
      activeStatusBadge.textContent = isDone ? "✅ Terminé" : "⏳ En cours";
      activeStatusBadge.className = `badge-mini ${isDone ? "badge-done" : "badge-progress"}`;
    }
    if (activeDetails) {
      activeDetails.textContent = `${d.fat_ref ? "FAT " + d.fat_ref : ""} • ${d.mobile || d.telephone_ligne || ""} • Port ${d.port || "-"}`;
    }

    if (popupInterventionSelect && d.id && popupInterventionSelect.value !== d.id) {
      popupInterventionSelect.value = d.id;
    }
  }

  // 1. Initialisation directe depuis le stockage local (0ms d'attente, 100% fiable)
  try {
    const stored = await chrome.storage.local.get([
      "apiUrl",
      "apiCode",
      "activeIntervention",
      "cachedInterventions",
    ]);

    if (cfgApiUrl) cfgApiUrl.value = stored.apiUrl || "https://fibretrack.mantota.com/api/index.php";
    if (cfgApiCode) cfgApiCode.value = stored.apiCode || "9999";

    if (stored.activeIntervention) {
      renderActiveIntervention(stored.activeIntervention);
    }

    if (Array.isArray(stored.cachedInterventions) && stored.cachedInterventions.length > 0) {
      interventionsList = stored.cachedInterventions;
      // Si aucun en cours, basculer sur Tous
      const totalEnCours = interventionsList.filter((i) => (i.statut || "").toLowerCase() !== "termine").length;
      if (totalEnCours === 0) {
        statusTabFilter = "all";
        document.querySelectorAll(".popup-pill").forEach((pill) => {
          pill.classList.toggle("is-active", pill.getAttribute("data-status") === "all");
        });
      }
      renderPopupOptions();
    }
  } catch (storErr) {
    console.warn("[CelPros Popup] Erreur lecture initiale storage:", storErr);
  }

  // 2. Détecter l'onglet actif sans callback de message
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (activeTab && activeTab.url) {
      const url = activeTab.url.toLowerCase();
      const isCelPros = url.includes("celpros.celtiis.bj");
      const isFatAuto = url.includes("fatautomation.celtiis.bj");
      const isDemo = url.includes("celpros-mock.html") || url.includes("fatautomation-mock.html") || url.includes("localhost");

      if (isCelPros || isFatAuto || isDemo) {
        const siteName = isCelPros ? "CelPros Celtiis" : isFatAuto ? "FAT Automation" : "Démo Locale";
        pageStatusText.innerHTML = `✅ Connecté à <strong>${siteName}</strong>`;
        btnTriggerAutofill.disabled = false;
      } else {
        try {
          const host = new URL(activeTab.url).hostname;
          pageStatusText.innerHTML = `ℹ️ Onglet externe : <code>${host || "Autre"}</code>`;
        } catch {
          pageStatusText.innerHTML = `ℹ️ Onglet externe`;
        }
        btnTriggerAutofill.disabled = true;
      }
    }
  } catch (tabErr) {
    console.warn("[CelPros Popup] Erreur détection onglet:", tabErr);
  }

  // Lancer le test de connexion et rafraîchir la liste
  testConnection();
  loadInterventions();

  // 3. Charger la liste des interventions depuis l'API ou le cache local
  async function loadInterventions(forceFresh = false) {
    if (popupInterventionSelect) popupInterventionSelect.disabled = true;

    let list = null;

    // Délégation prioritaire au service worker si disponible
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "FETCH_INTERVENTIONS", payload: { forceFresh } }, (res) => {
            if (chrome.runtime.lastError) return resolve(null);
            resolve(res);
          });
        });
        if (resp && resp.ok && Array.isArray(resp.data)) {
          list = resp.data;
        }
      } catch {}
    }

    // Fallback fetch direct avec en-têtes no-cache
    if (!list) {
      const apiUrl = cfgApiUrl ? cfgApiUrl.value.trim() : "https://fibretrack.mantota.com/api/index.php";
      const apiCode = cfgApiCode ? cfgApiCode.value.trim() : "9999";
      const url = formatApiActionUrl(apiUrl, "interventions_list_light");

      try {
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            ...(apiCode ? { "X-User-Code": apiCode } : {}),
          },
        });

        if (res.ok) {
          list = await res.json();
        }
      } catch (netErr) {
        console.warn("[CelPros Popup] Échec fetch direct des interventions, utilisation du cache:", netErr);
      }
    }

    if (!Array.isArray(list) || list.length === 0) {
      const stored = await chrome.storage.local.get(["cachedInterventions"]);
      if (Array.isArray(stored.cachedInterventions) && stored.cachedInterventions.length > 0) {
        list = stored.cachedInterventions;
      }
    }

    if (Array.isArray(list)) {
      list.sort((a, b) => {
        const aIsDone = isItemTermine(a);
        const bIsDone = isItemTermine(b);
        if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;
        const da = parseTimestampSafely(a.modifie_le || a.updated_at || a.date);
        const db = parseTimestampSafely(b.modifie_le || b.updated_at || b.date);
        return db - da;
      });

      interventionsList = list;
      await chrome.storage.local.set({ cachedInterventions: list });

      const totalEnCours = interventionsList.filter((i) => !isItemTermine(i)).length;
      if (totalEnCours === 0 && interventionsList.length > 0) {
        statusTabFilter = "all";
        document.querySelectorAll(".popup-pill").forEach((pill) => {
          pill.classList.toggle("is-active", pill.getAttribute("data-status") === "all");
        });
      }

      renderPopupOptions();

      // Si aucune intervention active n'est définie ou si l'actuelle n'est pas dans la liste fraîche,
      // sélectionner automatiquement le dossier #1 (le plus récent : ex. Dossou) !
      const currentValid = activeInterventionData && interventionsList.some((i) => String(i.id) === String(activeInterventionData.id));
      if (!currentValid && interventionsList.length > 0) {
        selectInterventionById(interventionsList[0].id);
      }
    } else {
      showMessage("⚠️ Impossible de charger les fiches FibreTrack", "error");
    }

    if (popupInterventionSelect) popupInterventionSelect.disabled = false;
  }

  function renderPopupOptions() {
    if (!popupInterventionSelect) return;

    const totalEnCours = interventionsList.filter((i) => !isItemTermine(i)).length;
    const totalTerminees = interventionsList.filter((i) => isItemTermine(i)).length;
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
        matching = interventionsList.filter((i) => !isItemTermine(i));
      } else if (statusTabFilter === "termine" || statusTabFilter === "terminees") {
        matching = interventionsList.filter((i) => isItemTermine(i));
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

    const enCoursGroup = matching.filter((i) => !isItemTermine(i));
    const termineesGroup = matching.filter((i) => isItemTermine(i));

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
      const isDone = isItemTermine(item);
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

  async function selectInterventionById(id, forceFresh = false) {
    if (!id) return;
    showMessage("Chargement des détails...", "success");

    let item = null;

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: "FETCH_INTERVENTION_DETAILS", payload: { id: String(id), forceFresh } },
            (res) => {
              if (chrome.runtime.lastError) return resolve(null);
              resolve(res);
            }
          );
        });
        if (resp && resp.ok && resp.data) {
          item = resp.data;
        }
      } catch {}
    }

    if (!item) {
      const apiUrl = cfgApiUrl ? cfgApiUrl.value.trim() : "https://fibretrack.mantota.com/api/index.php";
      const apiCode = cfgApiCode ? cfgApiCode.value.trim() : "9999";
      const url = formatApiActionUrl(apiUrl, "intervention_get");

      try {
        const res = await fetch(url, {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            ...(apiCode ? { "X-User-Code": apiCode } : {}),
          },
          body: JSON.stringify({ id: String(id) }),
        });

        if (res.ok) {
          item = await res.json();
        }
      } catch (e) {
        console.warn("[CelPros Popup] Erreur fetch détails:", e);
      }
    }

    if (!item || !item.id) {
      item = interventionsList.find((i) => String(i.id) === String(id));
    }

    if (item) {
      renderActiveIntervention(item);
      if (popupSearchInput) popupSearchInput.value = (item.nom_client || "").trim();
      showMessage(`⚡ Dossier actif : <strong>${escapeHtml(item.nom_client)}</strong>`);

      // Sauvegarde dans storage (synchronise instantanément tous les onglets via storage.onChanged)
      await chrome.storage.local.set({ activeIntervention: item });

      // Notification directe optionnelle vers les onglets avec try/catch (Promise, jamais d'erreur)
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: "ACTIVE_INTERVENTION_UPDATED",
              payload: item,
            }).catch(() => {});
          }
        }
      } catch {}
    }
  }

  // Événements pour le sélecteur d'intervention du popup
  if (popupBtnRefresh) {
    popupBtnRefresh.addEventListener("click", async () => {
      showMessage("Actualisation forcée...");
      await loadInterventions(true);
      if (activeInterventionData && activeInterventionData.id) {
        await selectInterventionById(activeInterventionData.id, true);
      }
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

  // 4. Tester la connexion API directement par fetch
  async function testConnection() {
    if (!connBadge) return;
    connBadge.className = "badge badge-unknown";
    connBadge.textContent = "Test...";

    const apiUrl = cfgApiUrl ? cfgApiUrl.value.trim() : "https://fibretrack.mantota.com/api/index.php";
    const apiCode = cfgApiCode ? cfgApiCode.value.trim() : "9999";
    const url = formatApiActionUrl(apiUrl, "interventions_list_light");

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(apiCode ? { "X-User-Code": apiCode } : {}),
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          connBadge.className = "badge badge-connected";
          connBadge.textContent = `Connecté (${data.length} fiches)`;
          return;
        }
      }
      connBadge.className = "badge badge-error";
      connBadge.textContent = "Hors-ligne";
    } catch {
      connBadge.className = "badge badge-error";
      connBadge.textContent = "Hors-ligne";
    }
  }

  // 5. Injection dynamique propre des scripts dans le document principal
  async function injectContentScripts(tabId) {
    if (typeof chrome === "undefined" || !chrome.scripting) return false;
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["content/content.css"],
      }).catch(() => {});

      await chrome.scripting.executeScript({
        target: { tabId },
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

  // 6. Déclencher le remplissage depuis le popup (Promise-based, aucun lastError non intercepté)
  if (btnTriggerAutofill) {
    btnTriggerAutofill.addEventListener("click", async () => {
      btnTriggerAutofill.disabled = true;
      btnTriggerAutofill.textContent = "⏳ Remplissage en cours…";

      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          showMessage("Aucun onglet actif détecté", "error");
          return;
        }

        const tabId = activeTab.id;
        let fillSuccess = false;

        // Étape 1 : Envoi direct via Promise (attrapé proprement si absent)
        try {
          const res = await chrome.tabs.sendMessage(tabId, { action: "TRIGGER_AUTOFILL" });
          if (res && res.ok) {
            fillSuccess = true;
            showMessage("⚡ Formulaire rempli avec succès !");
          } else if (res && res.error) {
            showMessage(res.error, "error");
            fillSuccess = true;
          }
        } catch {
          // Content script pas encore injecté sur cet onglet
          console.log("[CelPros Popup] Content script absent, tentative d'injection dynamique...");
        }

        // Étape 2 : Si absent, injection à chaud dans la page
        if (!fillSuccess) {
          const injected = await injectContentScripts(tabId);
          if (injected) {
            await new Promise((r) => setTimeout(r, 250));
            try {
              const retryRes = await chrome.tabs.sendMessage(tabId, { action: "TRIGGER_AUTOFILL" });
              if (retryRes && retryRes.ok) {
                fillSuccess = true;
                showMessage("⚡ Formulaire rempli avec succès !");
              } else if (retryRes && retryRes.error) {
                showMessage(retryRes.error, "error");
                fillSuccess = true;
              }
            } catch (retryErr) {
              console.warn("[CelPros Popup] Échec après injection:", retryErr);
            }
          }
        }

        if (!fillSuccess) {
          showMessage("⚠️ Veuillez actualiser la page CelPros (F5) pour activer l'assistant !", "error");
        }
      } catch (globalErr) {
        console.error("[CelPros Popup] Erreur autofill:", globalErr);
        showMessage(`Erreur: ${globalErr.message}`, "error");
      } finally {
        btnTriggerAutofill.disabled = false;
        btnTriggerAutofill.textContent = "🚀 Remplir la page active";
      }
    });
  }

  // 7. Bouton Tester connexion manuellement
  if (btnTestConn) {
    btnTestConn.addEventListener("click", () => {
      testConnection();
      showMessage("Test de connexion en cours...");
    });
  }

  // 8. Sauvegarder la configuration directement dans chrome.storage.local
  if (btnSaveCfg) {
    btnSaveCfg.addEventListener("click", async () => {
      const payload = {
        apiUrl: cfgApiUrl ? cfgApiUrl.value.trim() : "",
        apiCode: cfgApiCode ? cfgApiCode.value.trim() : "",
      };

      try {
        await chrome.storage.local.set(payload);
        showMessage("Configuration enregistrée avec succès !");
        testConnection();
        loadInterventions();
      } catch (err) {
        showMessage(`Erreur: ${err.message}`, "error");
      }
    });
  }

  // 9. Démo de test locale
  if (btnOpenDemo) {
    btnOpenDemo.addEventListener("click", () => {
      const demoUrl = chrome.runtime.getURL("demo/celpros-mock.html");
      chrome.tabs.create({ url: demoUrl });
    });
  }
});
