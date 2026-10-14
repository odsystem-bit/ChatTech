import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  setCurrentAccount,
  getCurrentAccount,
  clearCurrentAccount,
  getApiCode,
  getApiAuthHeaders,
  STORAGE_KEY,
  CODE_STORAGE_KEY,
} from "./Account.js";

// Setup mock localStorage and sessionStorage for testing environment
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

globalThis.localStorage = new MockStorage();
globalThis.sessionStorage = new MockStorage();

test("Account - setCurrentAccount and getCurrentAccount persist login in localStorage", () => {
  localStorage.clear();
  sessionStorage.clear();

  const user = {
    id: "tech-123",
    nom: "Jean Dupont",
    role: "technicien",
    code: "1234",
  };

  setCurrentAccount(user);

  // Verify stored in localStorage
  assert.equal(localStorage.getItem(CODE_STORAGE_KEY), "1234");
  const storedAccount = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(storedAccount.id, "tech-123");
  assert.equal(storedAccount.nom, "Jean Dupont");

  // Verify getCurrentAccount retrieves it
  const retrieved = getCurrentAccount();
  assert.ok(retrieved);
  assert.equal(retrieved.id, "tech-123");
  assert.equal(retrieved.nom, "Jean Dupont");
  assert.equal(retrieved.code, "1234");
});

test("Account - Persistent login survives browser/session closure (sessionStorage wiped)", () => {
  localStorage.clear();
  sessionStorage.clear();

  const tech = {
    id: "tech-456",
    nom: "Paul Martin",
    code: "5678",
  };
  setCurrentAccount(tech);

  // Simulate tab/browser closing: sessionStorage is completely wiped!
  sessionStorage.clear();

  // Login MUST still be active via localStorage
  assert.equal(getApiCode(), "5678");
  const headers = getApiAuthHeaders();
  assert.deepEqual(headers, { "X-User-Code": "5678" });

  const activeUser = getCurrentAccount();
  assert.ok(activeUser, "User should remain logged in even after sessionStorage is wiped");
  assert.equal(activeUser.nom, "Paul Martin");
  assert.equal(activeUser.code, "5678");
});

test("Account - clearCurrentAccount removes all credentials and logs out", () => {
  localStorage.clear();
  sessionStorage.clear();

  setCurrentAccount({ id: "tech-999", nom: "Admin", code: "9999" });
  assert.ok(getCurrentAccount());

  clearCurrentAccount();

  assert.equal(getCurrentAccount(), null);
  assert.equal(getApiCode(), "");
  assert.deepEqual(getApiAuthHeaders(), {});
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  assert.equal(localStorage.getItem(CODE_STORAGE_KEY), null);
  assert.equal(sessionStorage.getItem(CODE_STORAGE_KEY), null);
});

test("Account - getCurrentAccount handles corrupted or missing storage gracefully", () => {
  localStorage.clear();
  sessionStorage.clear();

  // Nothing in storage
  assert.equal(getCurrentAccount(), null);

  // Only code but no account details
  localStorage.setItem(CODE_STORAGE_KEY, "1234");
  assert.equal(getCurrentAccount(), null);

  // Corrupted JSON in account details
  localStorage.setItem(STORAGE_KEY, "{not valid json");
  assert.equal(getCurrentAccount(), null);
});
