(function () {
  "use strict";

  const services = window.COFFEE_SERVICES || {};
  const storage = services.storage || window.COFFEE_STORAGE;
  const security = services.security;
  const LOCAL_KEY = "coffee_dashboard_audit_fallback_v42";
  const LOCAL_LIMIT = 120;

  function normalize(row = {}) {
    return Object.freeze({
      id: row.id || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      workspace_id: row.workspace_id || row.workspaceId || null,
      actor_id: row.actor_id || row.actorId || null,
      actor_email: row.actor_email || row.actorEmail || "",
      action: row.action || "system.info",
      category: row.category || "system",
      entity_type: row.entity_type || row.entityType || null,
      entity_id: row.entity_id || row.entityId || null,
      outcome: row.outcome || "success",
      severity: row.severity || "info",
      message: row.message || "",
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      user_agent: row.user_agent || row.userAgent || "",
      created_at: row.created_at || row.createdAt || new Date().toISOString(),
      source: row.source || "cloud"
    });
  }

  function readLocal() {
    try {
      const rows = storage?.readJSON ? storage.readJSON(LOCAL_KEY, []) : JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(rows) ? rows.map(row => normalize({ ...row, source: "local" })) : [];
    } catch (_error) {
      return [];
    }
  }

  function writeLocal(row) {
    const rows = [normalize({ ...row, source: "local" }), ...readLocal()].slice(0, LOCAL_LIMIT);
    try {
      if (storage?.writeJSON) storage.writeJSON(LOCAL_KEY, rows);
      else localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
    } catch (_error) {}
    return rows[0];
  }

  async function record({ client, workspaceId, action, category = "system", entityType = null, entityId = null, outcome = "success", severity = "info", message = "", metadata = {}, userAgent = navigator.userAgent } = {}) {
    const safeMetadata = security?.sanitizeMetadata ? security.sanitizeMetadata(metadata) : metadata;
    const payload = {
      p_workspace_id: workspaceId || null,
      p_action: String(action || "system.info").slice(0, 80),
      p_category: String(category || "system").slice(0, 40),
      p_entity_type: entityType ? String(entityType).slice(0, 80) : null,
      p_entity_id: entityId ? String(entityId).slice(0, 160) : null,
      p_outcome: String(outcome || "success").slice(0, 20),
      p_severity: String(severity || "info").slice(0, 20),
      p_message: String(message || "").slice(0, 1000),
      p_metadata: safeMetadata || {},
      p_user_agent: String(userAgent || "").slice(0, 500)
    };

    if (client?.rpc) {
      try {
        const { data, error } = await client.rpc("write_audit_event", payload);
        if (!error) return normalize({ id: data, workspace_id: workspaceId, action, category, entity_type: entityType, entity_id: entityId, outcome, severity, message, metadata: safeMetadata, user_agent: userAgent, source: "cloud" });
      } catch (_error) {}
    }
    return writeLocal({ workspace_id: workspaceId, action, category, entity_type: entityType, entity_id: entityId, outcome, severity, message, metadata: safeMetadata, user_agent: userAgent });
  }

  async function list({ client, workspaceId, limit = 200 } = {}) {
    const localRows = readLocal().filter(row => !workspaceId || !row.workspace_id || row.workspace_id === workspaceId);
    if (!client?.from || !workspaceId) return { rows: localRows.slice(0, limit), cloudAvailable: false, error: null };
    try {
      const { data, error } = await client
        .from("audit_events")
        .select("id,workspace_id,actor_id,actor_email,action,category,entity_type,entity_id,outcome,severity,message,metadata,user_agent,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return { rows: localRows.slice(0, limit), cloudAvailable: false, error };
      const cloudRows = (data || []).map(row => normalize({ ...row, source: "cloud" }));
      const seen = new Set();
      const rows = [...cloudRows, ...localRows].filter(row => {
        const key = row.id || `${row.action}|${row.created_at}|${row.actor_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, limit);
      return { rows, cloudAvailable: true, error: null };
    } catch (error) {
      return { rows: localRows.slice(0, limit), cloudAvailable: false, error };
    }
  }

  window.COFFEE_SERVICES = Object.freeze({ ...services, audit: Object.freeze({ normalize, readLocal, record, list }) });
})();
