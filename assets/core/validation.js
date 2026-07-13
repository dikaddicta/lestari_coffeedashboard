(function () {
  "use strict";

  const core = window.COFFEE_CORE = window.COFFEE_CORE || {};

  function sanitizeText(value, maxLength = 500) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, Math.max(0, Number(maxLength) || 0));
  }

  function required(value, label = "Kolom") {
    return sanitizeText(value, 500) ? null : `${label} wajib diisi.`;
  }

  function number(value, { label = "Nilai", min = -Infinity, max = Infinity, required: isRequired = true } = {}) {
    if ((value === "" || value === null || value === undefined) && !isRequired) return null;
    if (value === "" || value === null || value === undefined) return `${label} wajib diisi.`;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return `${label} harus berupa angka.`;
    if (parsed < min) return `${label} minimal ${min}.`;
    if (parsed > max) return `${label} maksimal ${max}.`;
    return null;
  }

  function email(value, label = "Email") {
    const safe = sanitizeText(value, 254);
    if (!safe) return `${label} wajib diisi.`;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe) ? null : `${label} tidak valid.`;
  }

  function collect(checks = []) {
    const errors = checks.flatMap(item => {
      if (!item) return [];
      if (Array.isArray(item)) return item.filter(Boolean);
      return [item];
    });
    return Object.freeze({
      ok: errors.length === 0,
      errors,
      first: errors[0] || ""
    });
  }

  core.validation = Object.freeze({ sanitizeText, required, number, email, collect });
})();
