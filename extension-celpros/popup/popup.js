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

  function showMessage(text, type = "success") {
    msgBanner.textContent = text;
    msgBanner.className = `msg-banner ${type}`;
    msgBanner.style.display = "block";
    setTimeout(() => {
      msgBanner.style.display = "none";
    }, 3500);
  }

  // 1. Charger la configuration
  chrome.runtime.sendMessage({ action: "GET_CONFIG" }, (res) => {
    if (res && res.ok && res.data) {
      const cfg = res.data;
      cfgApiUrl.value = cfg.apiUrl || "https://fibretrack.mantota.com/api/index.php";
      cfgApiCode.value = cfg.apiCode || "9999";

      if (cfg.activeIntervention) {
        renderActiveIntervention(cfg.activeIntervention);
      }
    }
    testConnection();
  });

  function renderActiveIntervention(d) {
    if (!d) return;
    activeClientName.textContent = d.nom_client || "Client sans nom";
    activeStatusBadge.textContent = d.statut === "termine" ? "✅ Terminé" : "⏳ En cours";
    activeDetails.textContent = `${d.fat_ref ? "FAT " + d.fat_ref : ""} • ${d.mobile || d.telephone_ligne || ""} • Port ${d.port || "-"}`;
  }

  // 2. Tester la connexion API
  function testConnection() {
    connBadge.className = "badge badge-unknown";
    connBadge.textContent = "Test...";

    const customPayload = {
      apiUrl: cfgApiUrl.value.trim(),
      apiCode: cfgApiCode.value.trim(),
    };

    chrome.runtime.sendMessage({ action: "TEST_CONNECTION", payload: customPayload }, (res) => {
      if (res && res.ok) {
        connBadge.className = "badge badge-connected";
        connBadge.textContent = `Connecté (${res.count} fiches)`;
      } else {
        connBadge.className = "badge badge-error";
        connBadge.textContent = "Hors-ligne";
      }
    });
  }

  // 3. Détecter l'onglet actif
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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

  // 4. Événement : Déclencher le pré-remplissage
  btnTriggerAutofill.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "TRIGGER_AUTOFILL" }, (res) => {
          if (res && res.ok) {
            showMessage("⚡ Formulaire rempli avec succès !");
          } else {
            showMessage(res?.error || "Erreur de remplissage", "error");
          }
        });
      }
    });
  });

  // 5. Événement : Tester manuellement la connexion
  btnTestConn.addEventListener("click", () => {
    testConnection();
    showMessage("Test de connexion en cours...");
  });

  // 6. Événement : Sauvegarder la configuration
  btnSaveCfg.addEventListener("click", () => {
    const payload = {
      apiUrl: cfgApiUrl.value.trim(),
      apiCode: cfgApiCode.value.trim(),
    };

    chrome.runtime.sendMessage({ action: "SAVE_CONFIG", payload }, (res) => {
      if (res && res.ok) {
        showMessage("Configuration enregistrée avec succès !");
        testConnection();
      } else {
        showMessage("Erreur lors de la sauvegarde", "error");
      }
    });
  });

  // 7. Événement : Ouvrir la démo de test
  btnOpenDemo.addEventListener("click", () => {
    const demoUrl = chrome.runtime.getURL("demo/celpros-mock.html");
    chrome.tabs.create({ url: demoUrl });
  });
});
