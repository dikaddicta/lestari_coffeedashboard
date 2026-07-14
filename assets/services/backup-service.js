(function () {
  "use strict";

  const services = window.COFFEE_SERVICES || {};
  const FORMAT = "coffee-brew-os-backup";
  const SCHEMA_VERSION = 1;

  function normalizeState(state = {}) {
    return {
      userStock: Array.isArray(state.userStock) ? state.userStock : [],
      userBrewLogs: Array.isArray(state.userBrewLogs) ? state.userBrewLogs : [],
      userQA: Array.isArray(state.userQA) ? state.userQA : [],
      suggestions: Array.isArray(state.suggestions) ? state.suggestions : []
    };
  }

  async function digest(text) {
    if (!crypto?.subtle) return "unavailable";
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function create(state, context = {}) {
    const data = normalizeState(state);
    const payload = {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      appVersion: window.COFFEE_APP_CONFIG?.version || "unknown",
      exportedAt: new Date().toISOString(),
      workspace: context.workspace || null,
      counts: {
        stock: data.userStock.length,
        brewLogs: data.userBrewLogs.length,
        qaScores: data.userQA.length,
        suggestions: data.suggestions.length
      },
      data
    };
    payload.checksum = await digest(JSON.stringify(payload.data));
    return payload;
  }

  async function parse(raw) {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") throw new Error("Struktur file backup tidak valid.");

    const legacy = !parsed.format && (Array.isArray(parsed.userStock) || Array.isArray(parsed.userBrewLogs));
    const data = normalizeState(legacy ? parsed : parsed.data);
    if (!legacy && parsed.format !== FORMAT) throw new Error("File bukan backup Coffee Brew OS.");
    if (!legacy && Number(parsed.schemaVersion) > SCHEMA_VERSION) throw new Error("Versi backup lebih baru dari aplikasi ini.");

    const expected = legacy ? "legacy" : String(parsed.checksum || "");
    const actual = await digest(JSON.stringify(data));
    if (!legacy && expected && expected !== "unavailable" && actual !== "unavailable" && expected !== actual) {
      throw new Error("Checksum backup tidak cocok. File mungkin berubah atau rusak.");
    }

    return {
      valid: true,
      legacy,
      data,
      metadata: {
        exportedAt: parsed.exportedAt || null,
        appVersion: parsed.appVersion || "legacy",
        workspace: parsed.workspace || null,
        checksum: actual,
        counts: {
          stock: data.userStock.length,
          brewLogs: data.userBrewLogs.length,
          qaScores: data.userQA.length,
          suggestions: data.suggestions.length
        }
      }
    };
  }

  function apply(target, data) {
    const normalized = normalizeState(data);
    Object.assign(target, normalized);
    return normalized;
  }

  window.COFFEE_SERVICES = Object.freeze({
    ...services,
    backup: Object.freeze({ FORMAT, SCHEMA_VERSION, apply, create, parse })
  });
})();
