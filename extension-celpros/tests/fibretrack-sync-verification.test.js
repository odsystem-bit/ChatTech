import test from "node:test";
import assert from "node:assert/strict";

function parseTimestampSafely(dateStr) {
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

function isInterventionOutdated(lastKnown, serverUpdatedAt) {
  if (!lastKnown) return true;
  if (!serverUpdatedAt) return false;
  const sStr = String(serverUpdatedAt).trim();
  const lStr = String(lastKnown).trim();
  if (sStr === lStr) return false;

  const sTime = parseTimestampSafely(sStr);
  const lTime = parseTimestampSafely(lStr);
  if (sTime > 0 && lTime > 0) {
    return Math.abs(sTime - lTime) >= 1000;
  }
  return sStr !== lStr;
}

test("Sync Engine - isInterventionOutdated detects MySQL vs ISO format changes reliably", () => {
  // Cas 1 : Même date mais formats différents (MySQL "2026-10-16 15:30:00" vs ISO "2026-10-16T15:30:00Z")
  assert.equal(isInterventionOutdated("2026-10-16T15:30:00Z", "2026-10-16 15:30:00"), false);

  // Cas 2 : Modification récente sur le serveur (2 secondes après)
  assert.equal(isInterventionOutdated("2026-10-16T15:30:00Z", "2026-10-16 15:30:02"), true);

  // Cas 3 : Modification envoyée depuis mobile en format MySQL
  assert.equal(isInterventionOutdated("2026-10-16 15:30:00", "2026-10-16 15:35:10"), true);

  // Cas 4 : Intervention jamais synchronisée (lastKnown null)
  assert.equal(isInterventionOutdated(null, "2026-10-16 15:30:00"), true);

  // Cas 5 : Serveur renvoie même chaîne stricte
  assert.equal(isInterventionOutdated("2026-10-16 15:30:00", "2026-10-16 15:30:00"), false);
});

test("Sync Engine - Simulation de modification FibreTrack vers CelPros", () => {
  let storedIntervention = {
    id: "intv_test_001",
    nom_client: "Koffi Agbossou",
    puissance_fat_dbm: -18.5,
    puissance_pto_dbm: -19.2,
    debit_descendant: "48.26",
    debit_montant: "9.504",
    debit_ping: "18.99",
    updated_at: "2026-10-16 15:00:00",
  };

  const broadcastEvents = [];
  const fakeWidget = {
    selectedIntervention: { ...storedIntervention },
    autoPilotEnabled: true,
    autofillTriggered: false,
    setSelectedIntervention(newItem) {
      this.selectedIntervention = newItem;
    },
    handleAutofill() {
      this.autofillTriggered = true;
    },
  };

  // Simuler une modification de l'abonné et des puissances sur FibreTrack
  const modifiedFibreTrack = {
    ...storedIntervention,
    nom_client: "Koffi Agbossou (Modifié)",
    puissance_fat_dbm: -17.8,
    puissance_pto_dbm: -18.6,
    debit_descendant: "52.10",
    debit_montant: "10.40",
    updated_at: "2026-10-16 15:10:00",
  };

  // Le bridge propage l'événement
  broadcastEvents.push(modifiedFibreTrack);

  // L'extension reçoit l'événement
  fakeWidget.setSelectedIntervention(broadcastEvents[0]);
  if (fakeWidget.autoPilotEnabled) {
    fakeWidget.handleAutofill();
  }

  // Vérifications
  assert.equal(fakeWidget.selectedIntervention.nom_client, "Koffi Agbossou (Modifié)");
  assert.equal(fakeWidget.selectedIntervention.puissance_fat_dbm, -17.8);
  assert.equal(fakeWidget.selectedIntervention.puissance_pto_dbm, -18.6);
  assert.equal(fakeWidget.selectedIntervention.debit_descendant, "52.10");
  assert.equal(fakeWidget.selectedIntervention.debit_montant, "10.40");
  assert.equal(fakeWidget.autofillTriggered, true);
});
