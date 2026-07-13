(function () {
  "use strict";

  const services = window.COFFEE_SERVICES || {};

  const ROLE_MATRIX = Object.freeze({
    guest: Object.freeze({
      label: "Tamu",
      permissions: Object.freeze(["library:read", "public_brews:read", "suggestion:create"])
    }),
    brewer: Object.freeze({
      label: "Brewer",
      permissions: Object.freeze([
        "library:read", "public_brews:read", "stock:read", "stock:create",
        "brew:create", "brew:update_own", "qa:create", "suggestion:create"
      ])
    }),
    qa: Object.freeze({
      label: "QA",
      permissions: Object.freeze([
        "library:read", "public_brews:read", "stock:read", "stock:create",
        "brew:create", "brew:update_own", "qa:create", "moderation:review",
        "suggestion:create"
      ])
    }),
    admin: Object.freeze({
      label: "Admin",
      permissions: Object.freeze([
        "library:read", "public_brews:read", "stock:read", "stock:create",
        "stock:manage", "brew:create", "brew:update_own", "brew:manage",
        "qa:create", "moderation:review", "members:manage", "workspace:manage",
        "audit:read", "suggestions:manage"
      ])
    })
  });

  const PERMISSIONS = Object.freeze([
    Object.freeze({ key: "stock:create", label: "Menambah stok" }),
    Object.freeze({ key: "stock:manage", label: "Mengubah seluruh stok" }),
    Object.freeze({ key: "brew:create", label: "Mencatat seduhan" }),
    Object.freeze({ key: "moderation:review", label: "Meninjau hasil & QA" }),
    Object.freeze({ key: "members:manage", label: "Mengelola anggota" }),
    Object.freeze({ key: "audit:read", label: "Melihat riwayat aktivitas" })
  ]);

  function normalizeRole(role) {
    const value = String(role || "guest").trim().toLowerCase();
    return ROLE_MATRIX[value] ? value : "guest";
  }

  function roleLabel(role) {
    return ROLE_MATRIX[normalizeRole(role)].label;
  }

  function can(role, permission) {
    return ROLE_MATRIX[normalizeRole(role)].permissions.includes(String(permission || ""));
  }

  function permissionRows() {
    return PERMISSIONS.map(permission => ({
      ...permission,
      guest: can("guest", permission.key),
      brewer: can("brewer", permission.key),
      qa: can("qa", permission.key),
      admin: can("admin", permission.key)
    }));
  }

  function sessionSummary({ user, role, workspace, cloudReady, lastSync } = {}) {
    const expiresAt = user?.aud === "authenticated" && user?.last_sign_in_at
      ? new Date(user.last_sign_in_at)
      : null;
    return Object.freeze({
      signedIn: Boolean(user),
      email: user?.email || "-",
      userId: user?.id || "",
      role: normalizeRole(role),
      roleLabel: roleLabel(role),
      workspace: workspace?.name || "-",
      workspaceId: workspace?.id || "",
      cloudReady: Boolean(cloudReady),
      lastSignIn: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
      lastSync: lastSync instanceof Date && !Number.isNaN(lastSync.getTime()) ? lastSync : null,
      userAgent: navigator.userAgent || "Unknown browser"
    });
  }

  function posture({ role, workspace, members = [], auditAvailable = false, cloudReady = false } = {}) {
    const normalizedRole = normalizeRole(role);
    const activeAdmins = members.filter(row => row.role === "admin" && row.status === "active").length;
    const pendingMembers = members.filter(row => row.status === "pending").length;
    const disabledMembers = members.filter(row => row.status === "disabled").length;
    const checks = [
      Object.freeze({ key: "session", label: "Sesi Supabase", ok: Boolean(cloudReady), detail: cloudReady ? "Terhubung" : "Belum terhubung" }),
      Object.freeze({ key: "workspace", label: "Workspace aktif", ok: Boolean(workspace?.id), detail: workspace?.name || "Belum dipilih" }),
      Object.freeze({ key: "role", label: "Peran aktif", ok: normalizedRole !== "guest", detail: roleLabel(normalizedRole) }),
      Object.freeze({ key: "admin", label: "Admin aktif", ok: activeAdmins > 0 || normalizedRole === "admin", detail: `${Math.max(activeAdmins, normalizedRole === "admin" ? 1 : 0)} admin aktif` }),
      Object.freeze({ key: "audit", label: "Riwayat aktivitas", ok: Boolean(auditAvailable), detail: auditAvailable ? "Tersedia" : "Migration v42 belum aktif" })
    ];
    const passed = checks.filter(item => item.ok).length;
    return Object.freeze({
      score: Math.round((passed / checks.length) * 100),
      checks,
      activeAdmins,
      pendingMembers,
      disabledMembers
    });
  }

  function sanitizeMetadata(value, depth = 0) {
    if (depth > 3) return "[depth-limit]";
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value.slice(0, 500);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeMetadata(item, depth + 1));
    if (typeof value === "object") {
      const blocked = /password|token|secret|authorization|apikey|api_key|session/i;
      return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [
        String(key).slice(0, 80),
        blocked.test(key) ? "[redacted]" : sanitizeMetadata(item, depth + 1)
      ]));
    }
    return String(value).slice(0, 500);
  }

  window.COFFEE_SERVICES = Object.freeze({
    ...services,
    security: Object.freeze({
      roles: ROLE_MATRIX,
      permissions: PERMISSIONS,
      normalizeRole,
      roleLabel,
      can,
      permissionRows,
      sessionSummary,
      posture,
      sanitizeMetadata
    })
  });
})();
