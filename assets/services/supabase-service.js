(function () {
  "use strict";

  function getProjectUrl(config = {}) {
    const raw = String(config.url || "").trim();
    if (!raw) return "";

    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_error) {
      throw new Error("Supabase URL tidak valid. Gunakan Project URL utama, misalnya https://xxxxx.supabase.co.");
    }

    if (parsed.protocol !== "https:") {
      throw new Error("Supabase URL harus menggunakan https://.");
    }

    if (parsed.pathname && parsed.pathname !== "/") {
      throw new Error("Supabase URL harus berupa Project URL utama tanpa path tambahan seperti /rest/v1 atau /auth/v1.");
    }

    return parsed.origin;
  }

  function getAnonKey(config = {}) {
    return String(config.anonKey || "").trim();
  }

  function isConfigured(config = {}) {
    return Boolean(config.enabled !== false && String(config.url || "").trim() && getAnonKey(config));
  }

  function createClient({ config = {}, library = window.supabase, storageAdapter, clientHeader = "v42-security-audit" } = {}) {
    if (!isConfigured(config)) {
      throw new Error("Supabase belum dikonfigurasi.");
    }
    if (!library?.createClient) {
      throw new Error("Library Supabase tidak tersedia. Periksa koneksi CDN atau bundling aplikasi.");
    }

    return library.createClient(getProjectUrl(config), getAnonKey(config), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(storageAdapter ? { storage: storageAdapter } : {})
      },
      global: {
        headers: { "x-coffee-dashboard-client": clientHeader }
      }
    });
  }

  window.COFFEE_SERVICES = Object.freeze({
    ...(window.COFFEE_SERVICES || {}),
    supabase: Object.freeze({
      getProjectUrl,
      getAnonKey,
      isConfigured,
      createClient
    })
  });
})();
