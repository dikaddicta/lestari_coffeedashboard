(function () {
  "use strict";

  const DATA = window.COFFEE_DATA || {};
  const STORAGE_KEY = "coffeeDashboardWebV1";
  const APPROVAL_THRESHOLD = 6.5;
  let stockSaving = false;
  let brewDraftSaving = false;
  let qaSaving = false;
  let manualBrewSaving = false;
  let manualEditingBrewId = null;
  let manualEditingOriginalLog = null;
  let manualEditingOriginalQA = null;
  let editingStockId = null;
  let brewStockOptionsSignature = "";
  const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {};
  let supabaseClient = null;
  let cloudReady = false;
  let cloudLastSync = null;
  let currentSession = null;
  let currentUser = null;
  let userProfile = null;
  let joinedWorkspaces = [];
  let userMemberships = [];
  let publicWorkspaces = [];
  let currentWorkspace = null;
  let currentRole = "guest";
  let moderationRows = [];
  let pendingMemberRows = [];
  let workspaceMemberRows = [];
  let suggestionRows = [];
  let dashboardUserCount = null;
  let dashboardUserCountSource = "local";
  const LAST_WORKSPACE_KEY = "coffeeDashboardActiveWorkspace";
  const DEFAULT_PUBLIC_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
  const CLOUD_WRITE_TIMEOUT_MS = 30000;
  const CLOUD_READ_TIMEOUT_MS = 60000;
  const SESSION_REFRESH_BUFFER_MS = 5 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => Number.isFinite(Number(n)) ? Number(n).toFixed(d).replace(/\.0$/, "") : "-";
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
  const round = (n, d = 0) => Number(Number(n || 0).toFixed(d));
  const norm = (v) => String(v || "").trim().toLowerCase();
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const uniq = (arr) => [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ""))];
  const isSwitch = (dripperName) => /switch/i.test(dripperName || "");
  const html = (s) => String(s ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;","\"":"&quot;"}[ch]));
  const statusLabel = (status) => ({ pending: "Menunggu review", approved: "Disetujui", rejected: "Ditolak" }[String(status || "").toLowerCase()] || status || "-");
  const memberStatusLabel = (status) => ({ pending: "Menunggu approval", active: "Aktif", rejected: "Ditolak", disabled: "Suspend" }[String(status || "").toLowerCase()] || status || "-");
  const emptyRow = (colspan, title, detail = "", icon = "✦") => `<tr class="empty-state-row"><td colspan="${colspan}"><div class="empty-state"><span class="empty-icon">${html(icon)}</span><strong>${html(title)}</strong>${detail ? `<small>${html(detail)}</small>` : ""}</div></td></tr>`;



  window.addEventListener("unhandledrejection", event => {
    console.error("Unhandled promise rejection", event.reason);
    showMessage(`Terjadi error proses: ${event.reason?.message || event.reason || "unknown error"}`, "error");
  });

  window.addEventListener("error", event => {
    console.error("Unhandled error", event.error || event.message);
    showMessage(`Terjadi error aplikasi: ${event.message || "unknown error"}`, "error");
  });

  const state = loadState();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        userStock: Array.isArray(saved.userStock) ? saved.userStock : [],
        userBrewLogs: Array.isArray(saved.userBrewLogs) ? saved.userBrewLogs : [],
        userQA: Array.isArray(saved.userQA) ? saved.userQA : [],
        suggestions: Array.isArray(saved.suggestions) ? saved.suggestions : [],
        cloudStock: [],
        cloudBrewLogs: [],
        cloudQA: []
      };
    } catch (err) {
      return { userStock: [], userBrewLogs: [], userQA: [], suggestions: [], cloudStock: [], cloudBrewLogs: [], cloudQA: [] };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }


  function getSupabaseProjectUrl() {
    const raw = String(SUPABASE_CONFIG.url || "").trim();
    if (!raw) return "";
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_err) {
      throw new Error("Supabase URL tidak valid. Gunakan Project URL dari Supabase, contoh: https://xxxxx.supabase.co");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Supabase URL harus diawali https://");
    }
    if (parsed.pathname && parsed.pathname !== "/") {
      throw new Error("Supabase URL harus Project URL utama, tanpa tambahan path seperti /rest/v1 atau /auth/v1.");
    }
    return parsed.origin;
  }

  function getSupabaseAnonKey() {
    return String(SUPABASE_CONFIG.anonKey || "").trim();
  }

  function isSupabaseConfigured() {
    return Boolean(SUPABASE_CONFIG.enabled !== false && String(SUPABASE_CONFIG.url || "").trim() && getSupabaseAnonKey());
  }

  function updateDbStatus(kind, title, detail = "") {
    const el = $("dbStatus");
    if (!el) return;
    const cls = kind === "online" ? "online" : kind === "syncing" ? "syncing" : "offline";
    el.innerHTML = `<span class="status-dot ${cls}"></span><div><strong>${html(title)}</strong><small>${html(detail)}</small></div>`;
  }

  function createClientId() {
    const key = "coffeeDashboardClientId";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  function hasSession() {
    return Boolean(currentUser && currentUser.id);
  }

  function canModerate() {
    return currentRole === "qa" || currentRole === "admin";
  }

  function canAdmin() {
    return currentRole === "admin";
  }

  function activeWorkspaceId() {
    return currentWorkspace?.id || null;
  }

  function publicStatusForInsert() {
    return canModerate() ? "approved" : "pending";
  }

  function isApprovedRecipeLog(log) {
    return norm(log?.ApprovedForRecipe) === "yes" && Number(log?.QA_Final || 0) >= APPROVAL_THRESHOLD;
  }

  function moderationStatusForBrew(log) {
    if (!isApprovedRecipeLog(log)) return "pending";
    if (!currentUser) return "approved";
    return canModerate() ? "approved" : "pending";
  }

  function moderationStatusForQA(qa) {
    const pass = Number(qa?.Final_QA || 0) >= APPROVAL_THRESHOLD && /qa pass/i.test(String(qa?.Status || ""));
    if (!pass) return "pending";
    if (!currentUser) return "approved";
    return canModerate() ? "approved" : "pending";
  }

  function currentBrewerName() {
    return userProfile?.display_name || currentUser?.user_metadata?.display_name || currentUser?.email?.split("@")[0] || "Brewer";
  }

  function requestedMembershipFromMetadata() {
    const meta = currentUser?.user_metadata || {};
    const role = norm(meta.requested_role);
    const workspaceId = String(meta.requested_workspace_id || "").trim();
    if (!["brewer", "qa"].includes(role) || !workspaceId) return null;
    return { role, workspaceId };
  }

  function displayRoleContext() {
    const active = currentRole && currentRole !== "guest" && currentRole !== "viewer";
    if (active) return { role: currentRole, workspace: currentWorkspace?.name || "-", status: "active" };
    const pending = (userMemberships || []).find(ws => ws.membershipStatus === "pending");
    if (pending) return { role: pending.role, workspace: pending.name || "-", status: "pending" };
    const disabled = (userMemberships || []).find(ws => ws.membershipStatus === "disabled");
    if (disabled) return { role: disabled.role, workspace: disabled.name || "-", status: "disabled" };
    const rejected = (userMemberships || []).find(ws => ws.membershipStatus === "rejected");
    if (rejected) return { role: rejected.role, workspace: rejected.name || "-", status: "rejected" };
    const requested = requestedMembershipFromMetadata();
    if (requested) {
      const workspace = (publicWorkspaces || []).find(ws => ws.id === requested.workspaceId);
      return { role: requested.role, workspace: workspace?.name || "Menunggu data workspace", status: "pending" };
    }
    return { role: currentRole || "guest", workspace: currentWorkspace?.name || "-", status: currentUser ? "none" : "guest" };
  }

  let toastTimer = null;

  function showMessage(message, type = "info") {
    const toast = $("appToast");
    if (!toast) {
      console.log(message);
      return;
    }
    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), type === "error" ? 7000 : 4500);
  }

  function normalizeSlug(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  async function ensureProfile() {
    if (!supabaseClient || !currentUser) return null;
    const displayName = $("authDisplayName")?.value || currentUser.user_metadata?.display_name || currentUser.email?.split("@")[0] || "Pengguna Kopi";
    const payload = { id: currentUser.id, email: currentUser.email, display_name: displayName };
    const { data, error } = await supabaseClient.from("profiles").upsert(payload, { onConflict: "id" }).select().single();
    if (error) { console.warn("profile upsert failed", error); return null; }
    userProfile = data;
    return data;
  }

  function flattenWorkspaceMembership(row) {
    const ws = row.workspaces || row.workspace || {};
    return {
      id: row.workspace_id || ws.id,
      name: ws.name || "Workspace",
      slug: ws.slug || "workspace",
      visibility: ws.visibility || "public",
      role: row.role || "brewer",
      membershipStatus: row.status || "active"
    };
  }

  async function loadWorkspaces() {
    joinedWorkspaces = [];
    userMemberships = [];
    publicWorkspaces = [];
    currentWorkspace = null;
    currentRole = "guest";
    if (!supabaseClient) return;

    const workspaceRes = await supabaseClient
      .from("workspaces")
      .select("id,name,slug,visibility,description,status")
      .eq("status", "active")
      .order("name");
    if (!workspaceRes.error) publicWorkspaces = workspaceRes.data || [];

    if (currentUser) {
      const memberRes = await supabaseClient
        .from("workspace_members")
        .select("workspace_id, role, status, workspaces(id,name,slug,visibility,description)")
        .eq("user_id", currentUser.id);
      if (!memberRes.error) {
        userMemberships = (memberRes.data || []).map(flattenWorkspaceMembership).filter(ws => ws.id);
        joinedWorkspaces = userMemberships.filter(ws => ws.membershipStatus === "active");
      }
    }

    const last = localStorage.getItem(LAST_WORKSPACE_KEY);
    const preferredWorkspace = joinedWorkspaces.find(ws => ws.slug !== "public-brew-community") || joinedWorkspaces[0] || null;
    currentWorkspace = joinedWorkspaces.find(ws => ws.id === last) || preferredWorkspace;
    const joined = joinedWorkspaces.find(ws => ws.id === currentWorkspace?.id);
    currentRole = joined?.role || (currentWorkspace ? "viewer" : "guest");
    renderWorkspaceUI();
  }

  function renderWorkspaceUI() {
    const allKnown = uniq([...(joinedWorkspaces || [])].map(ws => ws.id))
      .map(id => joinedWorkspaces.find(ws => ws.id === id))
      .filter(Boolean);

    [$(`activeWorkspaceSelect`), $(`adminWorkspaceSelect`)].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = allKnown.length
        ? allKnown.map(ws => `<option value="${html(ws.id)}">${html(ws.name)} · ${html(ws.role)} · ${html(ws.slug || "company")}</option>`).join("")
        : `<option value="">Belum ada workspace aktif</option>`;
      if (currentWorkspace?.id) sel.value = currentWorkspace.id;
    });

    const signupSel = $("signupWorkspace");
    if (signupSel) {
      const rows = (publicWorkspaces || []).filter(ws => ws.slug !== "public-brew-community");
      signupSel.innerHTML = rows.length
        ? `<option value="">Pilih workspace / company</option>` + rows.map(ws => `<option value="${html(ws.id)}">${html(ws.name)} · ${html(ws.slug || "company")}</option>`).join("")
        : `<option value="">Belum ada workspace terdaftar</option>`;
    }

    const hint = $("workspaceHint");
    if (hint) {
      const pending = (userMemberships || []).filter(ws => ws.membershipStatus === "pending");
      hint.textContent = currentWorkspace
        ? `${currentWorkspace.name} · peran aktif: ${currentRole}`
        : pending.length
          ? `Menunggu approval: ${pending.map(ws => `${ws.name} (${ws.role})`).join(", ")}`
          : "Belum ada workspace aktif.";
    }
    renderAuthUI();
    renderAccessUI();
    renderSignupRoleUI();
  }

  async function setActiveWorkspace(id) {
    if (!id) return;
    const ws = [...joinedWorkspaces, ...publicWorkspaces].find(w => w.id === id);
    if (!ws) return;
    currentWorkspace = ws;
    const joined = joinedWorkspaces.find(j => j.id === id);
    currentRole = joined?.role || "viewer";
    localStorage.setItem(LAST_WORKSPACE_KEY, id);
    renderWorkspaceUI();
    await syncFromCloud(true).catch(console.warn);
    if (canModerate()) await loadModerationRows().catch(console.warn);
    if (canAdmin()) {
      await loadMemberRequests().catch(console.warn);
      await loadWorkspaceMembers().catch(console.warn);
      await loadSuggestionRows().catch(console.warn);
    }
  }

  function setElementHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", hidden);
    el.hidden = Boolean(hidden);
    el.style.display = hidden ? "none" : "";
  }

  function renderAuthUI() {
    const userLabel = $("authUserLabel");
    const roleLabel = $("authRoleLabel");
    const accountBox = $("accountBox");
    const authJumpLink = $("authJumpLink");
    const loggedOutArea = $("authLoggedOutArea");
    const loggedInArea = $("authLoggedInArea");
    const title = $("authPanelTitle");
    const isLoggedIn = Boolean(currentUser);

    const roleCtx = displayRoleContext();
    const roleStatusClass = roleCtx.status === "active" ? "approved" : roleCtx.status === "rejected" ? "rejected" : roleCtx.status === "pending" ? "pending" : roleCtx.status === "disabled" ? "disabled" : "";
    const roleStatusText = roleCtx.status === "pending" ? "Menunggu approval" : roleCtx.status === "rejected" ? "Ditolak" : roleCtx.status === "disabled" ? "Akses disuspend" : roleCtx.status === "active" ? "Aktif" : "Belum ada workspace";

    if (title) title.textContent = isLoggedIn ? "Akun Pengguna" : "Login Pengguna";
    if (userLabel) userLabel.textContent = isLoggedIn ? (userProfile?.display_name || currentUser.email) : "Mode Tamu";
    if (roleLabel) roleLabel.textContent = isLoggedIn
      ? `${currentUser.email} · ${roleCtx.workspace || "-"} · ${roleCtx.role}`
      : "Masuk untuk menyimpan dan membagikan data.";

    if (accountBox) {
      accountBox.innerHTML = isLoggedIn
        ? `<strong>${html(userProfile?.display_name || currentUser.email)}</strong><br>Email: ${html(currentUser.email)}<br>Workspace: ${html(roleCtx.workspace || "-")}<br>Peran: <span class="status-pill ${html(roleStatusClass)}">${html(roleCtx.role)}</span><br>Status: ${html(roleStatusText)}`
        : `Belum masuk. Tamu tetap bisa membaca data publik yang sudah disetujui, tetapi pengiriman data ke database online memerlukan akun.`;
    }

    if ($("suggestionName") && isLoggedIn && !$('suggestionName').value) $("suggestionName").value = userProfile?.display_name || currentUser.email?.split("@")[0] || "";
    if ($("suggestionEmail") && isLoggedIn && !$('suggestionEmail').value) $("suggestionEmail").value = currentUser.email || "";

    setElementHidden(loggedOutArea, isLoggedIn);
    setElementHidden(loggedInArea, !isLoggedIn);
    setElementHidden(authJumpLink, isLoggedIn);
  }

  async function ensureRequestedMembership() {
    if (!supabaseClient || !currentUser) return;
    const request = requestedMembershipFromMetadata();
    if (!request) return;
    const { data: existing, error: readError } = await supabaseClient
      .from("workspace_members")
      .select("workspace_id,user_id,role,status")
      .eq("workspace_id", request.workspaceId)
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (readError) return;
    if (existing) return;
    await requestWorkspaceAccess(request.workspaceId, request.role, currentUser.id);
  }

  async function initAuth() {
    if (!supabaseClient) return;
    const { data: sessionData } = await supabaseClient.auth.getSession();
    currentSession = sessionData?.session || null;
    currentUser = currentSession?.user || null;
    if (currentUser) {
      await ensureProfile();
      await ensureRequestedMembership().catch(console.warn);
    }
    await loadWorkspaces();
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      currentSession = session || null;
      currentUser = currentSession?.user || null;
      if (currentUser) {
        await ensureProfile();
        await ensureRequestedMembership().catch(console.warn);
      } else {
        userProfile = null;
        joinedWorkspaces = [];
        userMemberships = [];
        currentWorkspace = null;
        currentRole = "guest";
      }
      await loadWorkspaces();
      await syncFromCloud(true).catch(console.warn);
    });
    renderAuthUI();
  }

  async function handleLogin() {
    if (!supabaseClient) return showMessage("Supabase belum aktif.");
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (!email || !password) return showMessage("Isi email dan kata sandi untuk masuk.", "error");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(`Gagal masuk: ${error.message}`, "error");
    currentSession = data?.session || currentSession;
    currentUser = data?.user || currentSession?.user || currentUser;
    await ensureProfile().catch(console.warn);
    await ensureRequestedMembership().catch(console.warn);
    await loadWorkspaces().catch(console.warn);
    await syncFromCloud(true).catch(console.warn);
    renderAll();
    showMessage("Berhasil masuk.", "success");
  }

  async function handleSignup() {
    if (!supabaseClient) return showMessage("Supabase belum aktif.");
    const email = ($("signupEmail")?.value || $("authEmail")?.value || "").trim();
    const password = $("signupPassword")?.value || $("authPassword")?.value || "";
    const displayName = $("authDisplayName")?.value.trim() || email.split("@")[0];
    const requestedRole = $("signupRole")?.value || "admin";
    const requestedWorkspaceId = $("signupWorkspace")?.value || "";
    if (!email || !password) return showMessage("Isi email dan kata sandi untuk daftar akun baru.", "error");
    if (["brewer", "qa"].includes(requestedRole) && !requestedWorkspaceId) {
      return showMessage("Pilih workspace/company untuk mendaftar sebagai Brewer atau QA.", "error");
    }
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          display_name: displayName,
          requested_role: requestedRole,
          requested_workspace_id: requestedWorkspaceId || null
        }
      }
    });
    if (error) {
      const message = /Invalid path specified/i.test(error.message)
        ? "Pendaftaran gagal: Supabase URL di assets/supabase-config.js kemungkinan salah. Pakai Project URL utama, contoh https://xxxxx.supabase.co, bukan URL dashboard, /rest/v1, atau /auth/v1."
        : `Pendaftaran gagal: ${error.message}`;
      return showMessage(message, "error");
    }

    if (data?.session?.user && ["brewer", "qa"].includes(requestedRole) && requestedWorkspaceId) {
      await requestWorkspaceAccess(requestedWorkspaceId, requestedRole, data.session.user.id).catch(console.warn);
    }

    const roleMessage = requestedRole === "admin"
      ? "Pendaftaran berhasil. Konfirmasi pendaftaran melalui email. Setelah email terverifikasi dan masuk, buat workspace/company sebagai Admin Workspace."
      : "Pendaftaran berhasil. Konfirmasi pendaftaran melalui email. Setelah email terverifikasi, request akses workspace akan menunggu approval Admin Workspace.";
    showMessage(`${roleMessage} Cek inbox atau folder spam/promosi.`, "success");
  }

  async function requestWorkspaceAccess(workspaceId, role, userId = currentUser?.id) {
    if (!supabaseClient || !userId || !workspaceId || !["brewer", "qa"].includes(role)) return;
    if (currentUser && cloudReady) await prepareCloudWrite("Request akses workspace");
    const { error } = await withTimeout(
      supabaseClient.from("workspace_members").insert({
        workspace_id: workspaceId,
        user_id: userId,
        role,
        status: "pending"
      }),
      CLOUD_WRITE_TIMEOUT_MS,
      "Request akses workspace"
    );
    if (error && error.code !== "23505" && !/duplicate|already exists/i.test(error.message || "")) throw error;
  }

  function clearLocalAuthState() {
    currentSession = null;
    currentUser = null;
    userProfile = null;
    joinedWorkspaces = [];
    userMemberships = [];
    currentWorkspace = null;
    currentRole = "guest";
    state.cloudStock = [];
    state.cloudBrewLogs = [];
    state.cloudQA = [];
    localStorage.removeItem(LAST_WORKSPACE_KEY);

    Object.keys(localStorage).forEach(key => {
      if (/^sb-.*-auth-token$/.test(key) || key.includes("supabase.auth.token")) {
        localStorage.removeItem(key);
      }
    });
    Object.keys(sessionStorage || {}).forEach(key => {
      if (/^sb-.*-auth-token$/.test(key) || key.includes("supabase.auth.token")) {
        sessionStorage.removeItem(key);
      }
    });
  }

  function withTimeout(request, arg2 = CLOUD_READ_TIMEOUT_MS, arg3 = "request") {
    const ms = typeof arg2 === "number" ? arg2 : CLOUD_READ_TIMEOUT_MS;
    const label = typeof arg2 === "string" ? arg2 : arg3;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let task = request;
    if (task && typeof task.abortSignal === "function" && controller) {
      task = task.abortSignal(controller.signal);
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { controller?.abort?.(); } catch (_err) {}
        reject(new Error(`${label} belum memberi respons dari Supabase. Coba lagi beberapa saat atau refresh halaman.`));
      }, ms);
    });
    return Promise.race([Promise.resolve(task), timeout]).finally(() => clearTimeout(timer));
  }

  async function refreshCurrentSession(label = "Validasi sesi Supabase") {
    if (!supabaseClient) return null;
    const { data: sessionData, error: sessionError } = await withTimeout(supabaseClient.auth.getSession(), 15000, label);
    if (sessionError) throw sessionError;
    let session = sessionData?.session || null;
    if (!session) {
      currentSession = null;
      currentUser = null;
      return null;
    }

    const expiresAtMs = Number(session.expires_at || 0) * 1000;
    if (expiresAtMs && expiresAtMs - Date.now() < SESSION_REFRESH_BUFFER_MS) {
      const { data: refreshed, error: refreshError } = await withTimeout(supabaseClient.auth.refreshSession(), 15000, "Refresh sesi Supabase");
      if (refreshError) {
        throw new Error(`Sesi login perlu diperbarui. Masuk ulang lalu coba simpan lagi. Detail: ${refreshError.message}`);
      }
      session = refreshed?.session || session;
    }

    const previousUserId = currentUser?.id || null;
    currentSession = session;
    currentUser = session?.user || null;
    if (currentUser && previousUserId && currentUser.id !== previousUserId) {
      userProfile = null;
      await ensureProfile().catch(console.warn);
      await loadWorkspaces().catch(console.warn);
    }
    return session;
  }

  async function prepareCloudWrite(label = "Simpan data") {
    if (!cloudReady || !supabaseClient) throw new Error("Supabase belum siap.");
    if (!currentUser) return;
    const session = await refreshCurrentSession(label);
    if (!session) throw new Error("Sesi login sudah habis. Silakan masuk ulang lalu coba simpan lagi.");
  }

  function createButtonWatchdog({ key, button, originalText, label, ms = CLOUD_WRITE_TIMEOUT_MS + 5000 }) {
    return setTimeout(() => {
      if (key === "brew") brewDraftSaving = false;
      if (key === "qa") qaSaving = false;
      if (key === "stock") stockSaving = false;
      if (key === "manual-brew") manualBrewSaving = false;
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      if (key === "manual-brew") renderManualBrewPreview();
      showMessage(`${label} belum selesai karena Supabase belum memberi respons. Tombol sudah diaktifkan kembali; coba ulangi atau refresh halaman.`, "error");
    }, ms);
  }

  async function handleLogout() {
    const btn = $("logoutBtn");
    const originalText = btn?.textContent || "Keluar";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Keluar...";
    }

    try {
      if (supabaseClient) {
        const { error } = await withTimeout(supabaseClient.auth.signOut({ scope: "local" }), 2500, "logout");
        if (error) console.warn("logout warning", error);
      }
    } catch (err) {
      console.warn("logout fallback", err);
    } finally {
      clearLocalAuthState();
      renderWorkspaceUI();
      renderAll();
      showMessage("Berhasil keluar.", "success");
      setTimeout(() => window.location.reload(), 150);
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  async function createWorkspace(e) {
    e.preventDefault();
    if (!supabaseClient || !currentUser) return showMessage("Masuk terlebih dahulu untuk membuat workspace.", "error");

    const button = $("createWorkspaceBtn");
    const originalText = button?.textContent || "Buat Workspace";
    if (button) {
      button.disabled = true;
      button.textContent = "Membuat workspace...";
    }

    try {
      const name = $("workspaceName").value.trim();
      const slug = normalizeSlug($("workspaceSlug").value || name);
      if (!name || !slug) {
        showMessage("Nama workspace dan company wajib diisi.", "error");
        return;
      }

      const payload = {
        name,
        slug,
        visibility: "private",
        description: $("workspaceDescription").value,
        created_by: currentUser.id
      };

      showMessage("Sedang membuat workspace...", "info");
      await prepareCloudWrite("Buat workspace");
      const { data, error } = await withTimeout(
        supabaseClient.from("workspaces").insert(payload).select().single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Buat workspace"
      );
      if (error) {
        const duplicate = /duplicate key|already exists|unique/i.test(error.message || "");
        showMessage(duplicate ? "Company sudah dipakai. Coba company lain." : `Gagal membuat workspace: ${error.message}`, "error");
        return;
      }

      await loadWorkspaces();
      await setActiveWorkspace(data.id);
      e.target.reset();
      showMessage("Workspace berhasil dibuat dan sudah menjadi workspace aktif. Kamu otomatis menjadi admin di workspace ini.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal membuat workspace: ${err.message || err}`, "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  async function joinWorkspace() {
    if (!supabaseClient || !currentUser) return showMessage("Masuk terlebih dahulu untuk bergabung ke workspace.");
    const workspaceId = $("joinWorkspaceSelect").value;
    if (!workspaceId) return showMessage("Pilih workspace yang ingin diikuti.");
    await prepareCloudWrite("Join workspace");
    const { error } = await withTimeout(
      supabaseClient.from("workspace_members").insert({ workspace_id: workspaceId, user_id: currentUser.id, role: "brewer", status: "active" }),
      CLOUD_WRITE_TIMEOUT_MS,
      "Join workspace"
    );
    if (error) return showMessage(`Gagal bergabung ke workspace: ${error.message}`);
    await loadWorkspaces();
    await setActiveWorkspace(workspaceId);
    showMessage("Berhasil join sebagai brewer.");
  }

  function toSnakeStock(bean) {
    return {
      bean_code: bean.BeanID || null,
      coffee_name: bean.CoffeeName || "Kopi Tanpa Nama",
      origin: bean.Origin || null,
      producer: bean.Producer || null,
      variety: bean.Variety || null,
      variety2_optional: bean.Variety2_optional || null,
      process: bean.Process || null,
      roast_profile: bean.RoastProfile || null,
      flavor_family: bean.FlavorFamily || null,
      flavor_family2_optional: bean.FlavorFamily2_optional || null,
      flavor_family3_optional: bean.FlavorFamily3_optional || null,
      notes: bean.Notes || null,
      sweetness: Number(bean.Sweetness || 0),
      acidity: Number(bean.Acidity || 0),
      body: Number(bean.Body || 0),
      stock_g: Number(bean.Stock_g || 0),
      best_brew: bean.BestBrew || "Both",
      price: Number(bean.Price || 0),
      roast_date: bean.RoastDate || null,
      active: bean.Active || "Yes",
      visibility: "private",
      status: "private",
      moderation_status: "approved",
      workspace_id: activeWorkspaceId(),
      created_by: currentUser?.id || null,
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null,
      source_client_id: createClientId()
    };
  }

  function fromSnakeStock(row) {
    return {
      CloudID: row.id,
      BeanID: row.bean_code || `CLOUD-${String(row.id || "").slice(0, 8)}`,
      CoffeeName: row.coffee_name,
      Origin: row.origin,
      Producer: row.producer,
      Variety: row.variety,
      Variety2_optional: row.variety2_optional,
      Process: row.process,
      RoastProfile: row.roast_profile,
      FlavorFamily: row.flavor_family,
      FlavorFamily2_optional: row.flavor_family2_optional,
      FlavorFamily3_optional: row.flavor_family3_optional,
      Notes: row.notes,
      Sweetness: row.sweetness,
      Acidity: row.acidity,
      Body: row.body,
      Stock_g: row.stock_g,
      BestBrew: row.best_brew,
      Price: row.price,
      RoastDate: row.roast_date,
      Active: row.active || "Yes",
      WorkspaceID: row.workspace_id,
      CreatedBy: row.created_by,
      ModerationStatus: row.moderation_status || row.status || "approved",
      Visibility: row.visibility || "public",
      WorkspaceName: row.workspaces?.name || row.workspace_name || "",
      CreatedAt: row.created_at || "",
      UpdatedAt: row.updated_at || "",
      Source: "Supabase"
    };
  }

  function toSnakeBrew(log) {
    return {
      brew_code: log.BrewID,
      brew_date: log.Date || todayISO(),
      brewer_name: log.BrewerName || currentBrewerName(),
      bean_name: log.BeanName || null,
      origin: log.Origin || null,
      stock_bean_id: log.StockBeanID || null,
      stock_bean_code: log.StockBeanCode || null,
      stock_usage_g: log.StockUsage_g === "" ? null : Number(log.StockUsage_g || 0),
      variety: log.Variety || null,
      process: log.Process || null,
      roast_profile: log.RoastProfile || null,
      dripper: log.Dripper || null,
      method: log.Method || null,
      grinder: log.Grinder || null,
      grind_setting: log.GrindSetting || null,
      temp_c: Number(log.Temp_C || 0),
      ratio: Number(log.Ratio || 0),
      dose_g: Number(log.Dose_g || 0),
      total_water_ml: Number(log.TotalWater_ml || 0),
      hot_water_ml: Number(log.HotWater_ml || 0),
      ice_g: Number(log.Ice_g || 0),
      brew_time_sec: Number(log.BrewTime_sec || 0),
      bloom_ml: Number(log.Bloom_ml || 0),
      pour_count: Number(log.PourCount || 0),
      pour_plan: log.PourPlan || null,
      water: log.Water || null,
      tds_ppm: Number(log.TDS_ppm || 0),
      agitation: log.Agitation || null,
      filter_type: log.Filter || null,
      parent_brew_code: log.ParentBrewID || null,
      primary_variable_changed: log.PrimaryVariableChanged || null,
      hypothesis: log.Hypothesis || null,
      result_notes: log.ResultNotes || null,
      qa_code: log.QA_ID || null,
      qa_final: log.QA_Final === "" ? null : Number(log.QA_Final || 0),
      qa_status: log.QA_Status || null,
      manual_approval: log.ManualApproval || "No",
      approved_for_recipe: log.ApprovedForRecipe || "No",
      recipe_key: log.RecipeKey || null,
      current_match_score: log.CurrentMatchScore === "" ? null : Number(log.CurrentMatchScore || 0),
      water_formula_note: log.Water_Formula_Note || null,
      switch_valve_mode: log.SwitchValveMode || null,
      valve_plan: log.ValvePlan || null,
      visibility: "public",
      status: log.ModerationStatus || moderationStatusForBrew(log),
      moderation_status: log.ModerationStatus || moderationStatusForBrew(log),
      workspace_id: log.WorkspaceID || activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      created_by: log.CreatedBy || currentUser?.id || null,
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null,
      source_client_id: createClientId()
    };
  }


  function toSnakeBrewQAUpdate(log) {
    return {
      primary_variable_changed: log.PrimaryVariableChanged || null,
      hypothesis: log.Hypothesis || null,
      result_notes: log.ResultNotes || null,
      qa_code: log.QA_ID || null,
      qa_final: log.QA_Final === "" ? null : Number(log.QA_Final || 0),
      qa_status: log.QA_Status || null,
      manual_approval: log.ManualApproval || "No",
      approved_for_recipe: log.ApprovedForRecipe || "No",
      status: log.ModerationStatus || moderationStatusForBrew(log),
      moderation_status: log.ModerationStatus || moderationStatusForBrew(log),
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null
    };
  }

  function fromSnakeBrew(row) {
    return {
      CloudID: row.id,
      BrewID: row.brew_code || `BL-${String(row.id || "").slice(0, 8)}`,
      Date: row.brew_date,
      BrewerName: row.brewer_name || "Brewer",
      BeanName: row.bean_name,
      Origin: row.origin,
      StockBeanID: row.stock_bean_id,
      StockBeanCode: row.stock_bean_code,
      StockUsage_g: row.stock_usage_g,
      Variety: row.variety,
      Process: row.process,
      RoastProfile: row.roast_profile,
      Dripper: row.dripper,
      Method: row.method,
      Grinder: row.grinder,
      GrindSetting: row.grind_setting,
      Temp_C: row.temp_c,
      Ratio: row.ratio,
      Dose_g: row.dose_g,
      TotalWater_ml: row.total_water_ml,
      HotWater_ml: row.hot_water_ml,
      Ice_g: row.ice_g,
      BrewTime_sec: row.brew_time_sec,
      Bloom_ml: row.bloom_ml,
      PourCount: row.pour_count,
      PourPlan: row.pour_plan,
      Water: row.water,
      TDS_ppm: row.tds_ppm,
      Agitation: row.agitation,
      Filter: row.filter_type,
      ParentBrewID: row.parent_brew_code,
      PrimaryVariableChanged: row.primary_variable_changed,
      Hypothesis: row.hypothesis,
      ResultNotes: row.result_notes,
      QA_ID: row.qa_code,
      QA_Final: row.qa_final,
      QA_Status: row.qa_status,
      ManualApproval: row.manual_approval,
      ApprovedForRecipe: row.approved_for_recipe,
      RecipeKey: row.recipe_key,
      CurrentMatchScore: row.current_match_score,
      Water_Formula_Note: row.water_formula_note,
      SwitchValveMode: row.switch_valve_mode,
      ValvePlan: row.valve_plan,
      WorkspaceID: row.workspace_id,
      CreatedBy: row.created_by,
      ModerationStatus: row.moderation_status || row.status || "approved",
      Visibility: row.visibility || "public",
      WorkspaceName: row.workspaces?.name || row.workspace_name || "",
      SourceClientID: row.source_client_id,
      Source: "Supabase"
    };
  }

  function toSnakeQA(qa) {
    return {
      qa_code: qa.QA_ID,
      brew_code: qa.BrewID,
      qa_date: qa.Date || todayISO(),
      evaluator: qa.Evaluator || null,
      aroma: Number(qa.Aroma || 0),
      flavor: Number(qa.Flavor || 0),
      aftertaste: Number(qa.Aftertaste || 0),
      acidity_quality: Number(qa.AcidityQuality || 0),
      sweetness: Number(qa.Sweetness || 0),
      body: Number(qa.Body || 0),
      balance: Number(qa.Balance || 0),
      clarity: Number(qa.Clarity || 0),
      finish: Number(qa.Finish || 0),
      defect_penalty: Number(qa.DefectPenalty || 0),
      consistency: Number(qa.Consistency || 0),
      final_qa: Number(qa.Final_QA || 0),
      status: qa.Status || null,
      approver: qa.Approver || null,
      qa_notes: qa.QA_Notes || null,
      primary_variable_changed: qa.PrimaryVariableChanged || null,
      hypothesis: qa.Hypothesis || null,
      result_notes: qa.ResultNotes || qa.QA_Notes || null,
      visibility: "public",
      moderation_status: qa.ModerationStatus || moderationStatusForQA(qa),
      workspace_id: qa.WorkspaceID || activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      created_by: qa.CreatedBy || currentUser?.id || null,
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null,
      source_client_id: createClientId()
    };
  }

  function fromSnakeQA(row) {
    return {
      CloudID: row.id,
      QA_ID: row.qa_code,
      BrewID: row.brew_code,
      Date: row.qa_date,
      Evaluator: row.evaluator,
      Aroma: row.aroma,
      Flavor: row.flavor,
      Aftertaste: row.aftertaste,
      AcidityQuality: row.acidity_quality,
      Sweetness: row.sweetness,
      Body: row.body,
      Balance: row.balance,
      Clarity: row.clarity,
      Finish: row.finish,
      DefectPenalty: row.defect_penalty,
      Consistency: row.consistency,
      Final_QA: row.final_qa,
      Status: row.status,
      Approver: row.approver,
      QA_Notes: row.qa_notes,
      PrimaryVariableChanged: row.primary_variable_changed,
      Hypothesis: row.hypothesis,
      ResultNotes: row.result_notes,
      WorkspaceID: row.workspace_id,
      CreatedBy: row.created_by,
      ModerationStatus: row.moderation_status || "approved",
      SourceClientID: row.source_client_id,
      Source: "Supabase"
    };
  }

  async function initCloud() {
    if (!isSupabaseConfigured()) {
      cloudReady = false;
      updateDbStatus("offline", "Local fallback mode", "Supabase belum dikonfigurasi. Data hanya tersimpan di browser ini.");
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      cloudReady = false;
      updateDbStatus("offline", "Supabase library tidak terbaca", "Cek koneksi internet atau CDN supabase-js.");
      return;
    }

    let clientCreated = false;
    try {
      updateDbStatus("syncing", "Menghubungkan ke Supabase...", "Membaca sesi pengguna, workspace, dan data publik yang sudah disetujui.");
      const projectUrl = getSupabaseProjectUrl();
      const anonKey = getSupabaseAnonKey();
      supabaseClient = window.supabase.createClient(projectUrl, anonKey);
      clientCreated = true;
      cloudReady = true;
      await initAuth();
      await syncFromCloud(false);
      updateDbStatus("online", "Supabase online", `Data publik yang sudah disetujui tersinkron. Sinkron terakhir: ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      cloudReady = false;
      if (!clientCreated) supabaseClient = null;
      const detail = err.message || "Cek config, schema, atau RLS policy.";
      const title = clientCreated ? "Supabase tersambung, sinkron awal gagal" : "Supabase gagal tersambung";
      updateDbStatus("offline", title, detail);
    }
  }

  function uniqueByCloudId(rows) {
    const seen = new Set();
    return (rows || []).filter(row => {
      const key = row.CloudID || row.BrewID || row.QA_ID || JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function enrichBrewLogsWithQADetails(logs, qaRows) {
    const qaByBrew = new Map();
    (qaRows || []).forEach(qa => {
      if (!qa?.BrewID) return;
      const existing = qaByBrew.get(qa.BrewID);
      if (!existing || String(qa.Date || "") >= String(existing.Date || "")) qaByBrew.set(qa.BrewID, qa);
    });
    return (logs || []).map(log => {
      const qa = qaByBrew.get(log.BrewID);
      if (!qa) return log;
      return {
        ...log,
        QA_ID: log.QA_ID || qa.QA_ID,
        QA_Final: log.QA_Final ?? qa.Final_QA,
        QA_Status: log.QA_Status || qa.Status,
        PrimaryVariableChanged: log.PrimaryVariableChanged || qa.PrimaryVariableChanged || "",
        Hypothesis: log.Hypothesis || qa.Hypothesis || "",
        ResultNotes: log.ResultNotes || qa.ResultNotes || qa.QA_Notes || ""
      };
    });
  }

  function backgroundBrewLogQAUpdate(cloudId, payload, localLog) {
    if (!cloudId || !payload || !supabaseClient) return;
    updateCloudNoReturn("brew_logs", cloudId, payload, "Sinkronisasi detail Brew Log")
      .then(() => {
        if (localLog?.CloudID) {
          state.cloudBrewLogs = uniqueByCloudId([localLog, ...(state.cloudBrewLogs || []).filter(item => item.CloudID !== localLog.CloudID)]);
        }
      })
      .catch(err => {
        console.warn("Sinkronisasi detail Brew Log tertunda", err);
        showMessage("QA sudah tersimpan. Detail Brew Log akan tetap tampil dari data QA; sinkronisasi detail Brew Log ke Supabase bisa dicoba ulang dengan refresh/simpan ulang jika diperlukan.", "info");
      });
  }

  async function syncFromCloud(shouldRender = true) {
    if (!supabaseClient) throw new Error("Supabase belum aktif.");
    updateDbStatus("syncing", "Menyinkronkan data dari Supabase...", "Mengambil data privat workspace dan hasil seduhan publik terbaru.");

    const empty = { data: [], error: null };
    const workspaceId = activeWorkspaceId();

    const stockPromise = currentUser && workspaceId
      ? supabaseClient.from("stock_beans").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve(empty);

    const publicBrewPromise = supabaseClient.from("brew_logs").select("*").eq("visibility", "public").eq("moderation_status", "approved").order("brew_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);

    const workspaceBrewPromise = currentUser && workspaceId
      ? supabaseClient.from("brew_logs").select("*").eq("workspace_id", workspaceId).order("brew_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve(empty);

    const workspaceQaPromise = currentUser && workspaceId
      ? supabaseClient.from("qa_scores").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve(empty);

    const [stockRes, publicBrewRes, workspaceBrewRes, workspaceQaRes] = await withTimeout(Promise.all([stockPromise, publicBrewPromise, workspaceBrewPromise, workspaceQaPromise]), "Sinkronisasi Supabase");
    if (stockRes.error) throw stockRes.error;
    if (publicBrewRes.error) throw publicBrewRes.error;
    if (workspaceBrewRes.error) throw workspaceBrewRes.error;
    if (workspaceQaRes.error) throw workspaceQaRes.error;

    state.cloudStock = (stockRes.data || []).map(fromSnakeStock);
    state.cloudQA = (workspaceQaRes.data || []).map(fromSnakeQA);
    state.cloudBrewLogs = enrichBrewLogsWithQADetails(
      uniqueByCloudId([...(publicBrewRes.data || []).map(fromSnakeBrew), ...(workspaceBrewRes.data || []).map(fromSnakeBrew)]),
      state.cloudQA
    );
    await loadDashboardUserCount().catch(console.warn);
    cloudLastSync = new Date();
    cloudReady = true;
    updateDbStatus("online", "Supabase online", `Data workspace dan hasil seduhan publik tersinkron. Sinkron terakhir: ${cloudLastSync.toLocaleTimeString()}`);
    if (shouldRender) renderAll();
  }

  async function insertCloud(table, payload, mapper) {
    await prepareCloudWrite(`Simpan ${table}`);
    const { data, error } = await withTimeout(supabaseClient.from(table).insert(payload).select().single(), CLOUD_WRITE_TIMEOUT_MS, `Simpan ${table}`);
    if (error) throw error;
    return mapper(data);
  }

  async function updateCloud(table, id, payload, mapper) {
    await prepareCloudWrite(`Update ${table}`);
    const { data, error } = await withTimeout(supabaseClient.from(table).update(payload).eq("id", id).select().single(), CLOUD_WRITE_TIMEOUT_MS, `Update ${table}`);
    if (error) throw error;
    return mapper(data);
  }

  async function updateCloudNoReturn(table, id, payload, label = "Update data") {
    await prepareCloudWrite(label);
    const { error } = await withTimeout(supabaseClient.from(table).update(payload).eq("id", id), CLOUD_WRITE_TIMEOUT_MS, label);
    if (error) throw error;
    return true;
  }

  function isActiveWorkspaceMember() {
    const workspaceId = activeWorkspaceId();
    return Boolean(currentUser && workspaceId && joinedWorkspaces.some(ws => ws.id === workspaceId));
  }

  function canUseWorkspaceModules() {
    return Boolean(cloudReady && supabaseClient && isActiveWorkspaceMember());
  }

  function canSubmitOnline() {
    return canUseWorkspaceModules();
  }

  function privateModuleMessage(moduleName = "fitur ini") {
    if (!cloudReady || !supabaseClient) return "Database belum tersambung. Hubungkan Supabase terlebih dahulu.";
    if (!currentUser) return `Silakan masuk untuk menggunakan ${moduleName}.`;
    if (!activeWorkspaceId()) return `Buat atau pilih workspace terlebih dahulu untuk menggunakan ${moduleName}.`;
    if (!isActiveWorkspaceMember()) return `Kamu belum menjadi anggota workspace aktif. Gabung atau pilih workspace lain untuk menggunakan ${moduleName}.`;
    return "";
  }

  function onlineSubmitHint() {
    return privateModuleMessage("fitur ini");
  }

  function workspaceStock() {
    if (!canUseWorkspaceModules()) return [];
    const workspaceId = activeWorkspaceId();
    return (state.cloudStock || []).filter(bean => bean.WorkspaceID === workspaceId || !bean.WorkspaceID);
  }

  function workspaceBrewLogs() {
    if (!canUseWorkspaceModules()) return [];
    const workspaceId = activeWorkspaceId();
    return (state.cloudBrewLogs || []).filter(log => log.WorkspaceID === workspaceId);
  }

  function workspaceQA() {
    if (!canUseWorkspaceModules()) return [];
    const workspaceId = activeWorkspaceId();
    return (state.cloudQA || []).filter(qa => qa.WorkspaceID === workspaceId);
  }

  function allStock() {
    return workspaceStock();
  }

  function stockOptionLabel(bean) {
    const name = bean.CoffeeName || bean.BeanID || "Kopi tanpa nama";
    const meta = [bean.Producer, bean.Origin, bean.Stock_g !== undefined ? `${bean.Stock_g}g` : ""].filter(Boolean).join(" · ");
    return meta ? `${name} · ${meta}` : name;
  }

  function selectedBrewStockBean() {
    const value = $("brewStockSelect")?.value || "non_stock";
    if (!value || value === "non_stock") return null;
    return allStock().find(bean => String(bean.CloudID || bean.BeanID) === String(value)) || null;
  }

  function setSelectIfAvailable(id, value) {
    const select = $(id);
    if (!select || !value) return;
    const hasOption = Array.from(select.options || []).some(opt => opt.value === value);
    if (hasOption) select.value = value;
  }

  function syncBrewStockUI({ apply = true } = {}) {
    const hasWorkspace = canUseWorkspaceModules();
    const stockWrap = $("brewStockWrap");
    const nameWrap = $("brewBeanNameWrap");
    const stockSelect = $("brewStockSelect");
    const stockBean = selectedBrewStockBean();
    const usingStock = Boolean(stockBean);

    setElementHidden(stockWrap, !hasWorkspace);
    setElementHidden(nameWrap, !hasWorkspace || usingStock);

    ["brewVariety", "brewProcess", "brewRoast"].forEach(id => {
      const el = $(id);
      if (el) el.disabled = hasWorkspace && usingStock;
    });

    if (!hasWorkspace) {
      if (stockSelect) stockSelect.value = "non_stock";
      return null;
    }

    if (stockBean && apply) {
      setSelectIfAvailable("brewVariety", stockBean.Variety);
      setSelectIfAvailable("brewProcess", stockBean.Process);
      setSelectIfAvailable("brewRoast", stockBean.RoastProfile);
    }

    const hint = $("brewStockHint");
    if (hint) {
      hint.textContent = stockBean
        ? `Menggunakan stok: ${stockBean.CoffeeName || "Kopi"}. Brew log akan mengurangi stok sebesar dosis seduh.`
        : "Non Stock: isi nama kopi dan pilih varietas, pasca panen, serta roast profile secara manual.";
    }
    return stockBean;
  }

  function renderBrewStockOptions(force = false) {
    const select = $("brewStockSelect");
    if (!select) return;
    const hasWorkspace = canUseWorkspaceModules();
    const previous = select.value || "non_stock";
    const beans = hasWorkspace
      ? allStock().filter(bean => String(bean.Active || "Yes").toLowerCase() !== "no")
      : [];
    const signature = `${hasWorkspace}|${beans.map(bean => [bean.CloudID || bean.BeanID, bean.CoffeeName, bean.Stock_g, bean.Active].join(":"))}`;
    if (!force && signature === brewStockOptionsSignature) {
      syncBrewStockUI({ apply: false });
      return;
    }
    brewStockOptionsSignature = signature;
    const options = [`<option value="non_stock">Non Stock / Manual</option>`]
      .concat(beans.map(bean => `<option value="${html(bean.CloudID || bean.BeanID)}">${html(stockOptionLabel(bean))}</option>`));
    select.innerHTML = options.join("");
    const values = new Set(["non_stock", ...beans.map(bean => String(bean.CloudID || bean.BeanID))]);
    select.value = values.has(previous) ? previous : "non_stock";
    syncBrewStockUI({ apply: false });
  }

  function brewDateValue(log) {
    const rawDate = log?.Date || log?.BrewDate || "";
    const parsed = rawDate ? Date.parse(`${rawDate}T00:00:00`) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function brewCreatedValue(log) {
    const parsed = Date.parse(log?.CreatedAt || log?.created_at || log?.UpdatedAt || log?.updated_at || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function brewSerialValue(log) {
    const match = String(log?.BrewID || "").match(/(\d+)(?!.*\d)/);
    return match ? Number(match[1]) : 0;
  }

  function sortBrewNewest(rows) {
    return (rows || []).slice().sort((a, b) => {
      const dateDiff = brewDateValue(b) - brewDateValue(a);
      if (dateDiff) return dateDiff;
      const createdDiff = brewCreatedValue(b) - brewCreatedValue(a);
      if (createdDiff) return createdDiff;
      return brewSerialValue(b) - brewSerialValue(a);
    });
  }

  function allBrewLogs() {
    return workspaceBrewLogs();
  }

  function allQA() {
    return workspaceQA();
  }

  function getBy(list, key, value) {
    return (list || []).find(item => norm(item[key]) === norm(value)) || {};
  }

  function makeOptions(select, values, opts = {}) {
    if (!select) return;
    const { blank = false, blankLabel = "—", selected = null } = opts;
    const finalValues = uniq(values).sort((a, b) => String(a).localeCompare(String(b)));
    select.innerHTML = `${blank ? `<option value="">${html(blankLabel)}</option>` : ""}${finalValues.map(v => `<option value="${html(v)}">${html(v)}</option>`).join("")}`;
    if (selected !== null && finalValues.includes(selected)) select.value = selected;
  }

  function hydrateSelects() {
    const varieties = (DATA.varieties || []).map(v => v.Variety);
    const processes = (DATA.processes || []).map(p => p.Process);
    const roasts = (DATA.roasts || []).map(r => r.RoastProfile);
    const drippers = (DATA.drippers || []).map(d => d.DripperName);
    const grinders = [...(DATA.grinders || []).map(g => g.Grinder), "Custom"];
    const waters = (DATA.waters || []).map(w => w.Water);
    const flavors = uniq([
      "All", "Fruity", "Floral", "Citrus", "Stone Fruit", "Tropical", "Berry", "Tea", "Chocolate", "Caramel", "Nutty", "Spicy", "Fermented", "Herbal", "Sweet"
    ]);

    makeOptions($("brewVariety"), varieties, { selected: varieties.includes("Catimor 129") ? "Catimor 129" : varieties[0] });
    makeOptions($("brewProcess"), processes, { selected: processes.includes("Carbonic Maceration - Original") ? "Carbonic Maceration - Original" : processes[0] });
    makeOptions($("brewRoast"), roasts, { selected: roasts.includes("Medium") ? "Medium" : roasts[0] });
    makeOptions($("brewDripper"), drippers, { selected: drippers.includes("Hario Switch 02 Glass") ? "Hario Switch 02 Glass" : drippers[0] });
    makeOptions($("brewGrinder"), grinders, { selected: grinders.includes("Hario EVCG-8B") ? "Hario EVCG-8B" : grinders[0] });
    makeOptions($("brewWater"), waters, { selected: waters.includes("Cleo 1:1 Le Minerale") ? "Cleo 1:1 Le Minerale" : waters[0] });

    makeOptions($("manualVariety"), varieties, { selected: varieties.includes("Catimor 129") ? "Catimor 129" : varieties[0] });
    makeOptions($("manualProcess"), processes, { selected: processes.includes("Natural") ? "Natural" : processes[0] });
    makeOptions($("manualRoast"), roasts, { selected: roasts.includes("Medium") ? "Medium" : roasts[0] });
    makeOptions($("manualDripper"), drippers, { selected: drippers.includes("Hario V60 02 Plastic") ? "Hario V60 02 Plastic" : drippers[0] });
    makeOptions($("manualGrinder"), grinders, { selected: grinders.includes("Custom") ? "Custom" : grinders[0] });
    makeOptions($("manualWater"), waters, { selected: waters.includes("Cleo 1:1 Le Minerale") ? "Cleo 1:1 Le Minerale" : waters[0] });

    ["filterVariety1", "filterVariety2", "stockVariety1", "stockVariety2"].forEach(id => makeOptions($(id), varieties, { blank: id.includes("2") || id.startsWith("filter"), blankLabel: id.includes("2") ? "Opsional" : "Semua" }));
    ["stockProcess"].forEach(id => makeOptions($(id), processes));
    ["stockRoast"].forEach(id => makeOptions($(id), roasts));
    ["filterFlavor1", "filterFlavor2", "filterFlavor3", "stockFlavor1", "stockFlavor2", "stockFlavor3"].forEach(id => makeOptions($(id), flavors, { blank: id.includes("2") || id.includes("3"), blankLabel: "Opsional" }));

    if ($("filterFlavor1")) $("filterFlavor1").value = "Floral";
    if ($("filterFlavor2")) $("filterFlavor2").value = "";
    if ($("filterFlavor3")) $("filterFlavor3").value = "";
    if ($("stockFlavor1")) $("stockFlavor1").value = "Fruity";
  }

  function knownDashboardContributorCount() {
    const accountIds = new Set();
    const guestKeys = new Set();
    const addAccount = (value) => {
      const key = String(value || "").trim();
      if (key) accountIds.add(`u:${key}`);
    };
    const addGuest = (value, prefix = "guest") => {
      const key = norm(value);
      if (key) guestKeys.add(`${prefix}:${key}`);
    };

    [state.cloudBrewLogs, state.cloudQA, state.cloudStock, state.userBrewLogs, state.userQA, state.userStock].forEach(rows => {
      (rows || []).forEach(row => {
        if (row.CreatedBy) {
          addAccount(row.CreatedBy);
          return;
        }
        addGuest(row.SourceClientID, "client");
        addGuest(row.Evaluator, "name");
        addGuest(row.BrewerName, "name");
      });
    });
    (userMemberships || []).forEach(ws => addAccount(ws.user_id));
    (workspaceMemberRows || []).forEach(row => addAccount(row.user_id));
    (pendingMemberRows || []).forEach(row => addAccount(row.user_id));
    if (currentUser?.id) addAccount(currentUser.id);

    return {
      accounts: accountIds.size,
      guests: guestKeys.size,
      total: accountIds.size + guestKeys.size
    };
  }

  function localDashboardUserCount() {
    return knownDashboardContributorCount().total;
  }

  function dashboardUserMetric() {
    const local = localDashboardUserCount();
    const remote = Number.isFinite(Number(dashboardUserCount)) ? Number(dashboardUserCount) : null;
    if (remote !== null) {
      return {
        value: Math.max(remote, local),
        hint: remote >= local
          ? "Dihitung dari RPC Supabase: akun profiles, workspace member, pemilik brew/QA/stok, dan kontributor guest."
          : "Dihitung dari data Supabase yang terbaca di dashboard; nilai lokal lebih tinggi dari RPC sehingga dipakai sebagai fallback aman."
      };
    }
    if (isSupabaseConfigured() && !cloudReady && local === 0) {
      return {
        value: "…",
        hint: "Sedang membaca jumlah pengguna dari Supabase. Jika tetap 0, jalankan migration get_dashboard_user_count terbaru."
      };
    }
    return {
      value: local,
      hint: "Fallback lokal: dihitung dari pemilik data brew log, QA, stok, workspace member yang bisa dibaca, dan user login saat ini."
    };
  }

  async function loadDashboardUserCount() {
    const local = localDashboardUserCount();
    if (!supabaseClient) {
      dashboardUserCount = local;
      dashboardUserCountSource = "local";
      return;
    }
    const { data, error } = await supabaseClient.rpc("get_dashboard_user_count");
    if (!error && Number.isFinite(Number(data))) {
      dashboardUserCount = Math.max(Number(data), local);
      dashboardUserCountSource = Number(data) >= local ? "supabase_rpc" : "local_fallback";
    } else {
      dashboardUserCount = local;
      dashboardUserCountSource = "local_fallback";
      console.warn("get_dashboard_user_count fallback", error);
    }
  }

  function renderMetrics() {
    const users = dashboardUserMetric();
    const metrics = [
      { value: DATA.varieties?.length || 0, label: "Varietas", hint: "Jumlah varietas/kultivar di pustaka data lokal dashboard." },
      { value: DATA.drippers?.length || 0, label: "Dripper", hint: "Jumlah dripper di pustaka data lokal dashboard." },
      { value: DATA.processes?.length || 0, label: "Proses", hint: "Jumlah metode pasca panen di pustaka data lokal dashboard." },
      { value: DATA.roasts?.length || 0, label: "Roast Profile", hint: "Jumlah profil roasting di pustaka data lokal dashboard." },
      { value: DATA.waters?.length || 0, label: "Water", hint: "Jumlah profil air/mineral di pustaka data lokal dashboard." },
      { value: users.value, label: "Pengguna Tercatat", hint: users.hint }
    ];
    $("libraryMetrics").innerHTML = metrics.map(item => `<div class="metric" title="${html(item.hint)}"><strong>${html(item.value)}</strong><span>${html(item.label)}</span></div>`).join("");
  }

  function resolveSwitchMode() {
    const dripper = $("brewDripper").value;
    const selected = $("switchValveMode").value;
    if (!isSwitch(dripper)) return "-";
    if (selected === "Auto") return $("brewMode").value === "Japanese Iced" ? "Hybrid" : "Hybrid";
    return selected;
  }

  function numberField(row, field, fallback = 0) {
    const value = Number(row?.[field]);
    return Number.isFinite(value) ? value : fallback;
  }

  function roastWeight(roast = {}) {
    const text = `${roast.RoastProfile || ""} ${roast.Level || ""}`.toLowerCase();
    if (/very light|cinnamon|nordic/.test(text)) return -2;
    if (/light/.test(text)) return -1;
    if (/medium light|medium-light/.test(text)) return -0.5;
    if (/medium dark|medium-dark/.test(text)) return 1;
    if (/dark|italian|french/.test(text)) return 2;
    if (/medium/.test(text)) return 0;
    return 0;
  }

  function waterMineralBand(tds) {
    if (tds < 35) return "soft";
    if (tds > 220) return "hard";
    if (tds >= 70 && tds <= 160) return "balanced";
    return "moderate";
  }

  function brewIntent({ acidity, sweetness, body, fruity, floral, risk, roastTone, mode }) {
    const cues = [];
    if (floral >= 4 || acidity >= 4) cues.push("clarity");
    if (sweetness >= 4) cues.push("sweetness");
    if (body >= 4 || roastTone > 0.8) cues.push("body");
    if (fruity >= 4 || risk >= 4) cues.push("fruit");
    const primary = cues[0] || (mode === "Japanese Iced" ? "refreshing clarity" : "balanced sweetness");
    const labelMap = {
      clarity: "Clarity-forward",
      sweetness: "Sweetness-first",
      body: "Body & comfort",
      fruit: "Fruit expression",
      "refreshing clarity": "Refreshing clarity",
      "balanced sweetness": "Balanced sweetness"
    };
    return { primary, label: labelMap[primary] || "Balanced sweetness", cues };
  }

  function extractBrewSignals({ variety, process, roast, dripper, water, mode }) {
    const acidity = clamp(numberField(variety, "Acidity_Base", 3) + numberField(process, "AcidityMod", 0) + numberField(roast, "AcidityMod", 0), 1, 5);
    const sweetness = clamp(numberField(variety, "Sweetness_Base", 3) + numberField(process, "SweetnessMod", 0), 1, 5);
    const body = clamp(numberField(variety, "Body_Base", 3) + numberField(process, "BodyMod", 0) + numberField(roast, "BodyMod", 0), 1, 5);
    const fruity = clamp(numberField(variety, "Fruity_Base", 3) + numberField(process, "FruityMod", 0), 1, 5);
    const floral = clamp(numberField(variety, "Floral_Base", 2) + numberField(process, "FloralMod", 0), 1, 5);
    const risk = clamp(numberField(process, "FermentRisk_1low_5high", 2), 1, 5);
    const flow = clamp(numberField(dripper, "FlowSpeed_1slow_5fast", 3), 1, 5);
    const heat = clamp(numberField(dripper, "HeatRetention_1low_5high", 3), 1, 5);
    const tds = numberField(water, "TDS_ppm", 150);
    const roastTone = roastWeight(roast);
    const intent = brewIntent({ acidity, sweetness, body, fruity, floral, risk, roastTone, mode });
    return { acidity, sweetness, body, fruity, floral, risk, flow, heat, tds, roastTone, intent, mineralBand: waterMineralBand(tds) };
  }

  function confidenceScore({ variety, process, roast, dripper, water, grinderName, isCustom }) {
    let score = 86;
    if (!variety?.Variety) score -= 12;
    if (!process?.Process) score -= 12;
    if (!roast?.RoastProfile) score -= 10;
    if (!dripper?.DripperName) score -= 8;
    if (!water?.Water) score -= 6;
    if (isCustom) score -= 5;
    if (/custom/i.test(grinderName || "")) score -= 4;
    return clamp(score, 54, 96);
  }

  function dialInTips(brew) {
    const tips = [];
    const modeIce = brew.mode === "Japanese Iced";
    if (brew.risk >= 4) tips.push("Fermentasi tinggi: kurangi agitasi, hindari swirl agresif, mulai dari grind sedikit lebih kasar bila aroma ferment terlalu dominan.");
    if (brew.acidity >= 4 && brew.body <= 3) tips.push("Target clarity: jika cup terlalu tajam, naikkan rasio +0.3 atau perpanjang kontak 10–15 detik sebelum mengubah suhu.");
    if (brew.body >= 4) tips.push("Body tinggi: jaga flow tetap bersih. Jika finish terasa berat, kasar 1–2 step atau turunkan suhu 1°C.");
    if (brew.mineralBand === "soft") tips.push("Air sangat soft: gunakan mineral/blend atau naikkan suhu 1°C agar sweetness tidak terasa tipis.");
    if (brew.mineralBand === "hard") tips.push("Air mineral tinggi: turunkan suhu 1°C dan hindari ekstraksi terlalu panjang agar aftertaste tidak chalky.");
    if (modeIce) tips.push("Japanese iced: swirl server setelah drawdown supaya meltwater dan konsentrasi kopi homogen.");
    if (!tips.length) tips.push("Mulai dari resep ini sebagai control. Setelah tasting, ubah satu variabel saja: grind → suhu → rasio.");
    return tips.slice(0, 3);
  }

  function extractionMood(brew) {
    if (brew.risk >= 4) return "Low agitation / aromatic control";
    if (brew.intent?.primary === "clarity") return "Clean clarity / high definition";
    if (brew.intent?.primary === "body") return "Round body / soft finish";
    if (brew.intent?.primary === "sweetness") return "Sweet balance / syrupy cup";
    return "Balanced extraction";
  }

  function computeBrew() {
    const variety = getBy(DATA.varieties, "Variety", $("brewVariety").value);
    const process = getBy(DATA.processes, "Process", $("brewProcess").value);
    const roast = getBy(DATA.roasts, "RoastProfile", $("brewRoast").value);
    const dripper = getBy(DATA.drippers, "DripperName", $("brewDripper").value);
    const water = getBy(DATA.waters, "Water", $("brewWater").value);
    const dose = clamp($("brewDose").value, 1, 100);
    const mode = $("brewMode").value;
    const switchMode = resolveSwitchMode();
    const signals = extractBrewSignals({ variety, process, roast, dripper, water, mode });
    const { acidity, sweetness, body, fruity, floral, risk, flow, heat, tds, roastTone, intent, mineralBand } = signals;

    const isImmersion = switchMode === "Full Immersion" || $("pourPattern").value === "Immersion Full";
    const switchHybrid = switchMode === "Hybrid" || switchMode === "Auto";

    const tempBase = mode === "Japanese Iced" ? 93.5 : isImmersion ? 90.5 : switchHybrid ? 92 : 93;
    const fermentTempGuard = risk >= 4 ? -1.2 : risk === 3 ? -0.4 : 0;
    const heatGuard = heat >= 4 ? -0.5 : heat <= 2 ? 0.4 : 0;
    const mineralTempGuard = mineralBand === "soft" ? 0.8 : mineralBand === "hard" ? -0.8 : 0;
    const aromaticLift = (floral >= 4 || acidity >= 4) ? 0.5 : 0;
    const temp = round(clamp(
      tempBase + numberField(process, "TempMod_C", 0) + numberField(roast, "TempMod_C", 0) + numberField(water, "TempMod_C", 0) + fermentTempGuard + heatGuard + mineralTempGuard + aromaticLift,
      mode === "Japanese Iced" ? 88 : 86,
      roastTone >= 1.5 ? 94 : 98
    ));

    const ratioBase = mode === "Japanese Iced" ? 15 : isImmersion ? 15.4 : switchHybrid ? 15.8 : 16;
    const sensoryRatio = (acidity >= 4 && body <= 3 ? 0.25 : 0) + (sweetness >= 4 ? 0.15 : 0) + (body >= 4 ? -0.35 : 0) + (risk >= 4 ? -0.25 : 0) + (roastTone <= -1 ? 0.2 : 0);
    const ratio = round(clamp(ratioBase + numberField(process, "RatioMod_ml_per_g", 0) + numberField(roast, "RatioMod_ml_per_g", 0) + sensoryRatio, 14, 18), 1);
    const totalWater = Math.round(dose * ratio);
    const hotWaterRatio = mode === "Japanese Iced" ? (risk >= 4 ? 0.58 : 0.6) : 1;
    const hotWater = mode === "Japanese Iced" ? Math.round(totalWater * hotWaterRatio) : totalWater;
    const ice = mode === "Japanese Iced" ? totalWater - hotWater : 0;

    const grindBase = mode === "Japanese Iced" ? 748 : isImmersion ? 850 : switchHybrid ? 720 : 690;
    const processGrind = numberField(process, "GrindMod_coarser", 0) * 32;
    const roastGrind = numberField(roast, "GrindMod_coarser", 0) * 42;
    const flowComp = (3 - flow) * 24;
    const heatComp = (heat - 3) * 8;
    const mineralComp = mineralBand === "soft" ? -18 : mineralBand === "hard" ? 22 : 0;
    const doseComp = (dose - 15) * 4;
    const fermentComp = risk >= 4 ? 36 : risk <= 1 ? -8 : 0;
    const clarityComp = (floral >= 4 || acidity >= 4) && risk < 4 ? -10 : 0;
    const grindTarget = round(clamp(
      grindBase + processGrind + roastGrind + flowComp + heatComp + mineralComp + doseComp + fermentComp + clarityComp,
      450,
      1020
    ));
    const grinderSetting = getGrinderSetting($("brewGrinder").value, grindTarget, mode, isImmersion);

    const timeBase = mode === "Japanese Iced" ? 150 : isImmersion ? 220 : switchHybrid ? 190 : 178;
    const flowTime = (3 - flow) * 18;
    const bodyTime = body >= 4 ? -8 : acidity >= 4 ? 8 : 0;
    const fermentTime = risk >= 4 ? -10 : risk <= 1 ? 8 : 0;
    const doseTime = (dose - 15) * 3;
    const brewTime = round(clamp(
      timeBase + numberField(process, "BrewTimeMod_sec", 0) + numberField(roast, "BrewTimeMod_sec", 0) + flowTime + bodyTime + fermentTime + doseTime,
      mode === "Japanese Iced" ? 120 : 135,
      isImmersion ? 360 : 330
    ));

    const pourCount = resolvePourCount($("pourPattern").value, isImmersion, risk, body, acidity, floral);
    const bloomMultiplier = risk >= 4 ? 2.1 : acidity >= 4 || roastTone <= -1 ? 2.8 : body >= 4 ? 2.3 : 2.5;
    const bloom = isImmersion ? 0 : Math.min(Math.round(hotWater * 0.34), Math.round(dose * bloomMultiplier));
    const steps = buildSteps({ dose, mode, switchMode, isImmersion, hotWater, ice, bloom, pourCount, brewTime, process, roast, dripper, risk, body, acidity, floral, intent });
    const pourSum = steps.reduce((sum, st) => sum + (Number(st.water) || 0), 0);
    const confidence = confidenceScore({ variety, process, roast, dripper, water, grinderName: $("brewGrinder").value, isCustom: isCustomGrinderSelected() });

    const brew = { variety, process, roast, dripper, water, dose, mode, switchMode, acidity, sweetness, body, fruity, floral, risk, flow, heat, tds, mineralBand, roastTone, intent, temp, ratio, totalWater, hotWater, ice, grindTarget, grinderSetting, brewTime, pourCount, bloom, steps, pourSum, confidence };
    brew.extractionMood = extractionMood(brew);
    brew.dialInTips = dialInTips(brew);
    return brew;
  }

  function isCustomGrinderSelected() {
    return norm($("brewGrinder")?.value) === "custom";
  }

  function getSelectedGrinderName() {
    if (isCustomGrinderSelected()) return $("customGrinderName")?.value.trim() || "Custom Grinder";
    return $("brewGrinder")?.value || "";
  }

  function formatOneZpressoSetting(totalClicks, clicksPerRotation = 30, clicksPerNumber = 3) {
    const clicks = Math.max(0, Math.round(totalClicks));
    const rotations = Math.floor(clicks / clicksPerRotation);
    const remain = clicks % clicksPerRotation;
    const dialNumber = Math.floor(remain / clicksPerNumber);
    const subClicks = remain % clicksPerNumber;
    return `${rotations}.${dialNumber}.${subClicks}`;
  }

  function formatCentirotationSetting(totalCentirotations, centirotationsPerRotation = 100) {
    const value = Number(totalCentirotations) / centirotationsPerRotation;
    return `${value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} rotations`;
  }

  function formatGrinderDisplay(grinder, value) {
    const precision = Number.isFinite(Number(grinder.Precision)) ? Number(grinder.Precision) : 0;
    const rounded = round(value, precision);
    if (grinder.DisplayFormat === "onezpresso30") {
      return `${formatOneZpressoSetting(rounded, Number(grinder.ClicksPerRotation || 30), Number(grinder.ClicksPerNumber || 3))} rotations`;
    }
    if (grinder.DisplayFormat === "rotation100") {
      return formatCentirotationSetting(rounded, Number(grinder.ClicksPerRotation || 100));
    }
    const template = grinder.DisplayFormat || "{value}";
    return template.replace("{value}", fmt(rounded, precision));
  }

  function getGrinderSetting(grinderName, micron, mode, isImmersion) {
    if (norm(grinderName) === "custom") {
      return $("customGrinderSetting")?.value.trim() || "klik/dial";
    }
    const grinder = getBy(DATA.grinders, "Grinder", grinderName);
    if (!grinder.Grinder) return `${micron} µm target`;
    const methodKey = isImmersion ? "Immersion" : mode === "Japanese Iced" ? "Japanese" : "V60";
    const min = Number(grinder[`${methodKey}_Min`] ?? grinder.V60_Min);
    const max = Number(grinder[`${methodKey}_Max`] ?? grinder.V60_Max);
    const micronMin = Number(grinder.MicronMin || 400);
    const micronMax = Number(grinder.MicronMax || 930);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return `${micron} µm target`;
    const ratio = clamp((Number(micron) - micronMin) / Math.max(1, micronMax - micronMin), 0, 1);
    const setting = min + ratio * (max - min);
    return formatGrinderDisplay(grinder, setting);
  }

  function resolvePourCount(pattern, isImmersion, risk, body, acidity = 3, floral = 2) {
    if (isImmersion) return 1;
    if (/2x/.test(pattern)) return 2;
    if (/3x/.test(pattern)) return 3;
    if (/4x/.test(pattern)) return 4;
    if (risk >= 4) return 2;
    if (body >= 4) return 4;
    if (acidity >= 4 || floral >= 4) return 3;
    return 3;
  }

  function splitWater(total, parts) {
    if (parts <= 1) return [Math.round(total)];
    const base = Math.floor(total / parts);
    const arr = Array(parts).fill(base);
    arr[parts - 1] += Math.round(total) - base * parts;
    return arr;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function buildSteps(ctx) {
    const { mode, switchMode, isImmersion, hotWater, ice, bloom, pourCount, brewTime, process, roast, dripper, risk = 2, body = 3, acidity = 3, floral = 2, intent } = ctx;
    const switchActive = isSwitch(dripper.DripperName);
    const basePouring = dripper.BasePouring || "center-to-spiral pulse; jaga bed rata";
    const roastTone = roastWeight(roast);
    const flavorCue = intent?.label || "Balanced extraction";

    if (isImmersion) {
      const valveStart = switchActive ? "CLOSED" : "N/A";
      const steepEnd = fmtTime(Math.max(120, brewTime - 25));
      return [
        { stage: "Full Pour", water: hotWater, time: "0:00 - 0:30", valve: valveStart, instruction: `${mode === "Japanese Iced" ? "Tuang hot water ke bed kopi di atas ice server." : "Tuang semua air panas."} Saturate semua grounds, lalu stir 1x lembut.` },
        { stage: "Steep", water: 0, time: `0:30 - ${steepEnd}`, valve: valveStart, instruction: risk >= 4 ? "Steep tenang; minim agitasi agar karakter ferment tetap bersih." : "Steep stabil; swirl ringan jika crust terlalu tebal." },
        { stage: "Release", water: 0, time: `${steepEnd} - ${fmtTime(brewTime)}`, valve: switchActive ? "OPEN" : "N/A", instruction: "Open valve dan biarkan drawdown selesai tanpa menekan bed kopi." },
        ...(ice ? [{ stage: "Ice", water: ice, time: "Server", valve: "N/A", instruction: "Ice berada di server; swirl 8–10 detik setelah drawdown agar homogen." }] : [])
      ];
    }

    const mainWater = Math.max(0, hotWater - bloom);
    const pours = splitWater(mainWater, pourCount);
    const steps = [];
    const fullOpen = switchMode === "Full Open" || !switchActive;
    const hybrid = switchMode === "Hybrid" || switchMode === "Auto";
    const bloomEnd = risk >= 4 ? 30 : roastTone <= -1 || acidity >= 4 ? 42 : 35;
    const pourWindow = Math.max(24, Math.min(42, Math.round((brewTime - bloomEnd - 30) / Math.max(1, pourCount))));
    const releaseAt = Math.min(Math.max(55, bloomEnd + pourWindow), Math.max(65, brewTime - 70));

    steps.push({
      stage: "Bloom",
      water: bloom,
      time: `0:00 - ${fmtTime(bloomEnd)}`,
      valve: switchActive ? (fullOpen ? "OPEN" : "CLOSED") : "N/A",
      instruction: `Bloom ${Math.round(bloom)}g (${flavorCue}). ${risk >= 4 ? "Swirl sangat ringan; hindari blooming terlalu agresif." : "Swirl ringan sampai semua grounds basah."} ${process.BrewingCue || ""}`.trim()
    });

    pours.forEach((water, idx) => {
      const n = idx + 1;
      const start = bloomEnd + idx * pourWindow;
      const end = Math.min(start + pourWindow, brewTime - 20);
      let valve = "N/A";
      let instruction = basePouring;

      if (switchActive) {
        if (fullOpen) {
          valve = "OPEN";
          instruction = `${basePouring}; treat seperti cone V60 dengan flow terbuka.`;
        } else if (hybrid) {
          valve = n === 1 ? `CLOSED → OPEN ${fmtTime(releaseAt)}` : "OPEN";
          instruction = n === 1
            ? `Valve closed untuk fase ekstraksi awal, open sekitar ${fmtTime(releaseAt)} agar sweetness naik tanpa over-immersion.`
            : risk >= 4
              ? "Valve open; pour rendah, minim agitasi, jaga aroma ferment tetap clean."
              : "Valve open; pulse stabil, jaga bed rata dan flow konsisten.";
        } else {
          valve = "CLOSED";
          instruction = "Valve closed; gunakan pour lembut, lalu release sesuai target waktu akhir.";
        }
      } else if (risk >= 4) {
        instruction = "Low agitation pulse; tuang dekat bed, hindari wall-only pouring dan swirl akhir.";
      } else if (body >= 4 && n === pours.length) {
        instruction = "Finishing pulse lebih lembut; stop agitasi bila bed sudah rata agar finish tidak berat.";
      } else if (floral >= 4 || acidity >= 4) {
        instruction = `${basePouring}; pertahankan flow bersih untuk clarity.`;
      }

      steps.push({ stage: `Pour ${n}`, water, time: `${fmtTime(start)} - ${fmtTime(end)}`, valve, instruction });
    });

    if (switchActive && switchMode === "Full Immersion") {
      steps.push({ stage: "Release", water: 0, time: fmtTime(brewTime), valve: "OPEN", instruction: "Open valve dan biarkan drawdown selesai." });
    }
    if (ice) steps.push({ stage: "Ice", water: ice, time: "Server", valve: "N/A", instruction: "Ice berada di server; swirl setelah brew selesai agar homogen." });
    return steps;
  }

  function waterNote(brew) {
    if (brew.mineralBand === "soft") return "Water intelligence: TDS sangat rendah. Gunakan sebagai base remineralisasi/blending, atau naikkan suhu ±1°C jika cup terasa tipis dan acidity terlalu tajam.";
    if (brew.mineralBand === "hard") return "Water intelligence: mineral tinggi. Body bisa naik, tetapi clarity dan aftertaste berisiko mute/chalky. Pertimbangkan blend dengan air rendah mineral.";
    if (brew.mineralBand === "balanced") return "Water intelligence: rentang mineral ideal untuk filter. Prioritaskan dial-in lewat grind dan agitation sebelum mengubah rasio.";
    return "Water intelligence: mineral masih usable. Validasi dengan drawdown dan QA taste, lalu ubah satu variabel saja per iterasi.";
  }

  function renderBrewInsight(brew) {
    const panel = $("brewInsightPanel");
    if (!panel) return;
    const tips = (brew.dialInTips || []).map(tip => `<li>${html(tip)}</li>`).join("");
    const qaSignal = brew.confidence >= 88 ? "High confidence" : brew.confidence >= 74 ? "Ready to test" : "Needs validation";
    panel.innerHTML = `
      <div class="insight-header">
        <span class="insight-kicker">Brew Intelligence</span>
        <strong>${html(brew.extractionMood)}</strong>
        <em>${html(qaSignal)} · ${html(brew.confidence)}%</em>
      </div>
      <div class="insight-grid">
        <article><span>Focus</span><strong>${html(brew.intent?.label || "Balanced")}</strong><small>Acuan profil seduh utama.</small></article>
        <article><span>Agitation</span><strong>${html(brew.risk >= 4 ? "Low" : brew.body >= 4 ? "Medium-soft" : "Medium")}</strong><small>Disesuaikan dengan proses dan body.</small></article>
        <article><span>Water Band</span><strong>${html(brew.mineralBand)}</strong><small>TDS ${html(brew.tds)} ppm.</small></article>
      </div>
      <ul class="dial-tips">${tips}</ul>`;
  }

  function renderBrew() {
    renderBrewStockOptions();
    syncBrewStockUI({ apply: true });
    const brew = computeBrew();
    const cards = [
      ["Suhu", `${brew.temp} °C`, "Target suhu air seduh", "thermo"],
      ["Rasio", `1:${fmt(brew.ratio, 1)}`, "Dosis : total air", "ratio"],
      ["Total Air", `${brew.totalWater} ml`, "Dosis × rasio", "water"],
      ["Air Panas", `${brew.hotWater} ml`, brew.mode === "Japanese Iced" ? "Konsentrasi untuk iced brew" : "Sama dengan total", "kettle"],
      ["Es", brew.ice ? `${brew.ice} g` : "-", "Khusus Japanese iced", "ice"],
      ["Target Gilingan", `${brew.grindTarget} µm`, "Target relatif dari flow & solubility", "grind"],
      ["Setting Grinder", brew.grinderSetting, "Kalibrasi by drawdown/taste", "grinder"],
      ["Brew Time", fmtTime(brew.brewTime), "Target selesai", "timer"],
      ["Profil Rasa", `A ${brew.acidity}/5 · S ${brew.sweetness}/5 · B ${brew.body}/5`, "Prediksi dari varietas, proses, roast", "profile"],
    ];
    $("brewOutputs").innerHTML = cards.map(([label, value, desc, icon]) => `<div class="output-card" data-output="${html(icon)}"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(desc)}</small></div>`).join("");
    $("waterNote").textContent = waterNote(brew);
    renderBrewInsight(brew);
    renderSteps(brew);
    renderRecipeOptions(brew);
    toggleSwitchVisibility();
    toggleCustomGrinderFields();
    return brew;
  }

  function renderSteps(brew) {
    const tbody = $("brewStepsTable").querySelector("tbody");
    tbody.innerHTML = brew.steps.map(st => `<tr><td><strong>${html(st.stage)}</strong></td><td>${html(st.water ? `${st.water}` : "-")}</td><td>${html(st.time)}</td><td><span class="badge">${html(st.valve)}</span></td><td>${html(st.instruction)}</td></tr>`).join("");
    const hotSum = brew.steps.filter(st => st.stage !== "Ice").reduce((sum, st) => sum + (Number(st.water) || 0), 0);
    $("pourCheck").textContent = `Pour check: hot water steps = ${hotSum} ml, target hot water = ${brew.hotWater} ml. Total brew water = ${brew.totalWater} ml${brew.ice ? ` (hot ${brew.hotWater} + ice ${brew.ice})` : ""}.`;
  }

  function formatRecipeStepPlan(steps = []) {
    return (steps || []).map(st => `${st.stage}: ${st.water || 0}ml @ ${st.time} · ${st.valve} · ${st.instruction || ""}`).join(" | ");
  }

  function formatValvePlan(steps = []) {
    return (steps || []).map(st => `${st.stage}: ${st.valve}`).join(" | ");
  }

  function formatPublicRecipeSteps(log) {
    if (log.PourPlan && !/N\/A/i.test(log.PourPlan)) return log.PourPlan;
    const pieces = [];
    if (Number(log.Bloom_ml)) pieces.push(`Bloom: ${log.Bloom_ml}ml`);
    const pourCount = Number(log.PourCount || 0);
    const hot = Number(log.HotWater_ml || log.TotalWater_ml || 0);
    const bloom = Number(log.Bloom_ml || 0);
    if (pourCount > 0 && hot > 0) {
      const pours = splitWater(Math.max(0, hot - bloom), pourCount);
      pours.forEach((water, idx) => pieces.push(`Pour ${idx + 1}: ${water}ml`));
    }
    if (Number(log.Ice_g)) pieces.push(`Ice: ${log.Ice_g}g`);
    return pieces.length ? pieces.join(" | ") : (log.ValvePlan || "Detail tahapan belum tersedia");
  }

  function recipeKey(variety, process, roast) {
    return `${variety || ""}|${process || ""}|${roast || ""}`;
  }

  function renderRecipeOptions(brew) {
    const key = recipeKey($("brewVariety").value, $("brewProcess").value, $("brewRoast").value);
    const approved = allBrewLogs()
      .filter(log => norm(log.RecipeKey) === norm(key) && Number(log.QA_Final) >= APPROVAL_THRESHOLD && norm(log.ManualApproval) === "yes" && norm(log.ApprovedForRecipe) === "yes")
      .sort((a, b) => Number(b.QA_Final || 0) - Number(a.QA_Final || 0))
      .slice(0, 3);

    const baseGrinder = [getSelectedGrinderName(), brew.grinderSetting].filter(Boolean).join(" · ");
    const baseCard = `<article class="recipe-card base"><span class="badge">Opsi 1 · Precision Engine</span><h3>${html(brew.intent?.label || "Rekomendasi Dasar")}</h3><p><strong>${html($("brewDripper").value)}</strong> · ${html(brew.mode)} · ${html(brew.switchMode)}</p><p>${html(baseGrinder)} · ${brew.temp}°C · 1:${fmt(brew.ratio, 1)}</p><p>Dosis ${fmt(brew.dose, 1)}g · Total ${brew.totalWater}ml · ${brew.pourCount} tuangan utama · Confidence ${brew.confidence}%</p><p>${html(brew.extractionMood)}. Dasar: varietas × proses × roast × dripper × air × grinder.</p></article>`;
    const approvedCards = approved.map((log, idx) => {
      const grinderText = [log.Grinder, log.GrindSetting].filter(Boolean).join(" · ") || "-";
      return `<article class="recipe-card"><span class="badge">Opsi ${idx + 2} · QA ${fmt(log.QA_Final, 2)}</span><h3>${html(log.BrewID)}</h3><p><strong>${html(log.Dripper)}</strong> · ${html(log.Method)} · ${html(log.SwitchValveMode || "N/A")}</p><p>${html(grinderText)} · ${html(log.Temp_C)}°C · 1:${html(log.Ratio)}</p><p>Dosis ${html(log.Dose_g)}g · Total ${html(log.TotalWater_ml)}ml · Air panas ${html(log.HotWater_ml)}ml${Number(log.Ice_g) ? ` · Es ${html(log.Ice_g)}g` : ""}</p><p>${html(log.PrimaryVariableChanged || "Resep terverifikasi dari brew log")}</p></article>`;
    });
    $("recipeOptions").innerHTML = baseCard + (approvedCards.join("") || `<article class="recipe-card"><span class="badge">Belum ada opsi terverifikasi</span><h3>Belum ada opsi dari Brew Log</h3><p>Resep dengan QA ≥ 6.5 dan persetujuan manual akan muncul di sini jika key varietas × proses × profil sangrai cocok.</p></article>`);
  }

  function toggleSwitchVisibility() {
    const active = isSwitch($("brewDripper").value);
    $("switchModeWrap").style.display = active ? "grid" : "none";
  }

  function toggleCustomGrinderFields() {
    const custom = isCustomGrinderSelected();
    setElementHidden($("customGrinderNameWrap"), !custom);
    setElementHidden($("customGrinderSettingWrap"), !custom);
  }

  function selectedFlavors() {
    return [$("filterFlavor1").value, $("filterFlavor2").value, $("filterFlavor3").value].filter(v => v && v !== "All");
  }

  function beanFlavorList(bean) {
    return [bean.FlavorFamily, bean.FlavorFamily2_optional, bean.FlavorFamily3_optional].filter(Boolean);
  }

  function beanVarietyList(bean) {
    return [bean.Variety, bean.Variety2_optional].filter(Boolean);
  }

  function rankBeans() {
    const sweet = Number($("targetSweet").value) || 3;
    const acid = Number($("targetAcid").value) || 3;
    const body = Number($("targetBody").value) || 3;
    const flavors = selectedFlavors();
    const brew = $("filterBrew").value;
    const minStock = Number($("minStock").value) || 0;
    const v1 = $("filterVariety1").value;
    const v2 = $("filterVariety2").value;
    const varietyFilters = [v1, v2].filter(Boolean);

    return allStock()
      .filter(bean => norm(bean.Active || "Yes") !== "no")
      .filter(bean => Number(bean.Stock_g || 0) >= minStock)
      .filter(bean => !varietyFilters.length || varietyFilters.some(v => beanVarietyList(bean).some(bv => norm(bv) === norm(v))))
      .map(bean => {
        const beanFlavors = beanFlavorList(bean);
        const flavorMatches = flavors.length ? flavors.filter(f => beanFlavors.some(bf => norm(bf) === norm(f))).length : 1;
        const flavorScore = flavors.length ? (flavorMatches ? 25 + (flavorMatches - 1) * 5 : 0) : 25;
        const brewScore = (brew === "Both" || norm(bean.BestBrew) === "both" || norm(bean.BestBrew) === norm(brew)) ? 20 : 0;
        const varietyScore = varietyFilters.length ? 10 : 0;
        const score = (5 - Math.abs((Number(bean.Sweetness) || 3) - sweet)) * 20 +
          (5 - Math.abs((Number(bean.Acidity) || 3) - acid)) * 20 +
          (5 - Math.abs((Number(bean.Body) || 3) - body)) * 15 + flavorScore + brewScore + varietyScore;
        return { bean, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
  }

  function suggestedBrew(bean) {
    const brew = $("filterBrew").value;
    if (brew === "Japanese Iced") return "Japanese Iced";
    if (brew === "Hot V60") return "Hot V60";
    if (/dark/i.test(bean.RoastProfile || "")) return "Hario Switch - Hybrid";
    if (/infused|carbonic|anaerobic|maceration/i.test(bean.Process || "")) return "Hot V60 - controlled";
    return "Hot V60";
  }

  function suggestedDripper(bean, brew) {
    if (brew === "Japanese Iced") return "Hario V60 02 Plastic / Hario Switch Full Open";
    if (/infused|carbonic|anaerobic|maceration/i.test(bean.Process || "")) return "Kalita Wave 185 / Orea V4 / Switch Hybrid";
    if (/light|nordic/i.test(bean.RoastProfile || "")) return "Origami M / V60 Ceramic";
    if (/dark/i.test(bean.RoastProfile || "")) return "Hario Switch Hybrid";
    return "Hario V60 02";
  }

  function renderBeansTable() {
    const tbody = $("beansTable").querySelector("tbody");
    if (!canUseWorkspaceModules()) {
      tbody.innerHTML = emptyRow(10, "Masuk untuk membuka rekomendasi biji kopi", "Pilih workspace agar dashboard bisa membaca stok privatmu.", "◆");
      renderStockTable();
      return [];
    }
    const ranked = rankBeans();
    if (!ranked.length) {
      tbody.innerHTML = emptyRow(10, "Belum ada biji kopi yang cocok", "Ubah filter atau tambahkan stok baru di menu Stok Kopi.", "◈");
      renderStockTable();
      return [];
    }
    tbody.innerHTML = ranked.map((row, idx) => {
      const bean = row.bean;
      const brew = suggestedBrew(bean);
      const dripper = suggestedDripper(bean, brew);
      return `<tr><td><strong>${idx + 1}</strong></td><td>${html(bean.CoffeeName)}</td><td>${html(beanVarietyList(bean).join(" / "))}</td><td>${html(bean.Process)}</td><td>${html(bean.RoastProfile)}</td><td>${html(beanFlavorList(bean).join(" / "))}</td><td><span class="score-pill">${fmt(row.score, 1)}</span></td><td>${html(brew)}</td><td>${html(dripper)}</td><td>${brew === "Japanese Iced" ? "Rasio 1:15; air panas 60% + es 40%; pilih Switch Full Open/Hybrid jika memakai Switch." : "Rasio mengikuti sistem; bloom 2.5× dosis; lihat detail di tab Rekomendasi Seduh."}</td></tr>`;
    }).join("");
    renderStockTable();
    return ranked;
  }

  function setModuleLocked(sectionId, noticeId, locked, message) {
    const section = $(sectionId);
    const notice = $(noticeId);
    if (notice) {
      notice.classList.toggle("hidden", !locked);
      notice.innerHTML = locked ? `${html(message)}<small>Data di menu ini bersifat privat per akun dan workspace. Hasil seduhan publik tersedia di menu Hasil Seduhan Publik.</small>` : "";
    }
    if (!section) return;
    const forms = section.querySelectorAll("form");
    forms.forEach(form => form.classList.toggle("module-disabled", locked));
  }

  function renderStockTable() {
    renderBrewStockOptions();
    const tbody = $("stockTable")?.querySelector("tbody");
    if (!tbody) return;
    const locked = !canUseWorkspaceModules();
    setModuleLocked("tab-stock", "stockAccessNotice", locked, privateModuleMessage("Stok Kopi"));
    if (locked) {
      tbody.innerHTML = emptyRow(12, "Stok privat belum terbuka", "Masuk dan pilih workspace untuk melihat atau mengelola stok kopi.", "◐");
      return;
    }
    const rows = allStock();
    if (!rows.length) {
      tbody.innerHTML = emptyRow(12, "Stok kopi masih kosong", "Tambahkan bean pertama untuk mulai membangun pustaka seduh personal.", "☕");
      return;
    }
    tbody.innerHTML = rows.map(bean => {
      const key = html(bean.CloudID || bean.BeanID || "");
      const actions = canAdmin()
        ? `<div class="moderation-actions"><button class="secondary" data-stock-action="edit" data-stock-id="${key}">Edit</button><button class="danger" data-stock-action="delete" data-stock-id="${key}">Hapus</button></div>`
        : `<small class="member-self-note">Admin saja</small>`;
      return `<tr><td><strong>${html(bean.CoffeeName)}</strong><br><small>${html(bean.Producer || "")}</small></td><td>${html(bean.Origin || "")}</td><td>${html(bean.Variety || "")}</td><td>${html(bean.Variety2_optional || "")}</td><td>${html(bean.Process || "")}</td><td>${html(bean.RoastProfile || "")}</td><td>${html(beanFlavorList(bean).join(" / "))}</td><td>${html(bean.Sweetness)}/${html(bean.Acidity)}/${html(bean.Body)}</td><td>${html(bean.Stock_g)}g</td><td>${html(bean.BestBrew || "Both")}</td><td>${html(bean.Active || "Yes")}</td><td>${actions}</td></tr>`;
    }).join("");
  }

  function setStockFormMode(mode = "create") {
    const submitBtn = $("stockSubmitBtn");
    const cancelBtn = $("stockCancelEditBtn");
    const title = document.querySelector("#tab-stock .section-title h2");
    const editing = mode === "edit";
    if (submitBtn) submitBtn.textContent = editing ? "Simpan Perubahan Stok" : "Simpan Stok Pribadi";
    if (cancelBtn) cancelBtn.classList.toggle("hidden", !editing);
    if (title) title.textContent = editing ? "Edit Biji Kopi" : "Tambah / Update Biji Kopi";
  }

  function resetStockForm() {
    editingStockId = null;
    $("stockForm")?.reset();
    hydrateSelects();
    setStockFormMode("create");
  }

  function editStockBean(id) {
    if (!canAdmin()) return showMessage("Edit stok hanya tersedia untuk Admin Workspace.", "error");
    const bean = allStock().find(item => String(item.CloudID || item.BeanID) === String(id));
    if (!bean) return showMessage("Data stok tidak ditemukan. Muat ulang data terlebih dahulu.", "error");
    editingStockId = bean.CloudID || bean.BeanID;
    if ($("stockName")) $("stockName").value = bean.CoffeeName || "";
    if ($("stockOrigin")) $("stockOrigin").value = bean.Origin || "";
    if ($("stockProducer")) $("stockProducer").value = bean.Producer || "";
    setSelectIfAvailable("stockVariety1", bean.Variety);
    setSelectIfAvailable("stockVariety2", bean.Variety2_optional);
    setSelectIfAvailable("stockProcess", bean.Process);
    setSelectIfAvailable("stockRoast", bean.RoastProfile);
    setSelectIfAvailable("stockFlavor1", bean.FlavorFamily);
    setSelectIfAvailable("stockFlavor2", bean.FlavorFamily2_optional);
    setSelectIfAvailable("stockFlavor3", bean.FlavorFamily3_optional);
    if ($("stockSweet")) $("stockSweet").value = bean.Sweetness || 4;
    if ($("stockAcid")) $("stockAcid").value = bean.Acidity || 4;
    if ($("stockBody")) $("stockBody").value = bean.Body || 3;
    if ($("stockQty")) $("stockQty").value = bean.Stock_g || 0;
    setSelectIfAvailable("stockBestBrew", bean.BestBrew || "Both");
    if ($("stockPrice")) $("stockPrice").value = bean.Price || 0;
    if ($("stockRoastDate")) $("stockRoastDate").value = bean.RoastDate || "";
    setSelectIfAvailable("stockActive", bean.Active || "Yes");
    if ($("stockNotes")) $("stockNotes").value = bean.Notes || "";
    setStockFormMode("edit");
    document.querySelector("#stockForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteStockBean(id) {
    if (!supabaseClient || !canAdmin() || !currentWorkspace) return showMessage("Hapus stok hanya tersedia untuk Admin Workspace.", "error");
    const bean = allStock().find(item => String(item.CloudID || item.BeanID) === String(id));
    if (!bean?.CloudID) return showMessage("Stok ini belum tersimpan di Supabase atau tidak punya CloudID.", "error");
    if (!confirm(`Hapus stok ${bean.CoffeeName || bean.BeanID} dari workspace?`)) return;
    try {
      await prepareCloudWrite("Hapus stok kopi");
      const { data, error } = await withTimeout(
        supabaseClient
          .from("stock_beans")
          .delete()
          .eq("id", bean.CloudID)
          .eq("workspace_id", currentWorkspace.id)
          .select("id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Hapus stok kopi"
      );
      if (error || !data) throw error || new Error("Data stok tidak terhapus. Cek policy RLS.");
      state.cloudStock = (state.cloudStock || []).filter(item => item.CloudID !== bean.CloudID);
      renderStockTable();
      renderBeansTable();
      renderMetrics();
      showMessage("Stok kopi berhasil dihapus.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal menghapus stok: ${err.message || err}`, "error");
    }
  }

  function applyTopBeanToBrew() {
    const ranked = rankBeans();
    if (!ranked.length) return alert("Tidak ada bean yang cocok dengan filter saat ini.");
    const bean = ranked[0].bean;
    renderBrewStockOptions();
    if ($("brewStockSelect") && bean.CloudID && canUseWorkspaceModules()) {
      $("brewStockSelect").value = bean.CloudID;
      syncBrewStockUI({ apply: true });
    } else {
      $("brewVariety").value = bean.Variety || $("brewVariety").value;
      $("brewProcess").value = bean.Process || $("brewProcess").value;
      $("brewRoast").value = bean.RoastProfile || $("brewRoast").value;
    }
    renderBrew();
    showTab("brew");
  }

  function nextId(prefix, list, field) {
    const nums = list.map(x => String(x[field] || "").replace(/\D/g, "")).map(Number).filter(Boolean);
    return `${prefix}${String((Math.max(0, ...nums) + 1)).padStart(3, "0")}`;
  }

  function currentBrewLogBase(extra = {}) {
    syncBrewStockUI({ apply: true });
    const brew = computeBrew();
    const stockBean = selectedBrewStockBean();
    const manualBeanName = $("brewBeanName")?.value.trim() || "";
    const id = extra.BrewID || nextId("BL", allBrewLogs(), "BrewID");
    const qaId = extra.QA_ID || "";
    const defaultVerifyText = "Belum diverifikasi";
    return {
      BrewID: id,
      Date: todayISO(),
      BrewerName: extra.BrewerName || currentBrewerName(),
      BeanName: extra.BeanName || stockBean?.CoffeeName || manualBeanName || $("qaBeanName")?.value || $("brewVariety").value,
      Origin: extra.Origin || stockBean?.Origin || "",
      StockBeanID: extra.StockBeanID || stockBean?.CloudID || "",
      StockBeanCode: extra.StockBeanCode || stockBean?.BeanID || "",
      StockUsage_g: extra.StockUsage_g ?? (stockBean ? brew.dose : ""),
      Variety: $("brewVariety").value,
      Process: $("brewProcess").value,
      RoastProfile: $("brewRoast").value,
      Dripper: $("brewDripper").value,
      Method: $("brewMode").value,
      Grinder: getSelectedGrinderName(),
      GrindSetting: brew.grinderSetting,
      Temp_C: brew.temp,
      Ratio: brew.ratio,
      Dose_g: brew.dose,
      TotalWater_ml: brew.totalWater,
      HotWater_ml: brew.hotWater,
      Ice_g: brew.ice,
      BrewTime_sec: brew.brewTime,
      Bloom_ml: brew.steps.find(s => s.stage === "Bloom")?.water || 0,
      PourCount: brew.steps.filter(s => /^Pour/.test(s.stage)).length,
      PourPlan: formatRecipeStepPlan(brew.steps),
      Water: $("brewWater").value,
      TDS_ppm: getBy(DATA.waters, "Water", $("brewWater").value).TDS_ppm || "",
      Agitation: "Controlled",
      Filter: "Paper",
      ParentBrewID: extra.ParentBrewID || "",
      PrimaryVariableChanged: extra.PrimaryVariableChanged || defaultVerifyText,
      Hypothesis: extra.Hypothesis || "",
      ResultNotes: extra.ResultNotes || "",
      QA_ID: qaId,
      QA_Final: extra.QA_Final ?? "",
      QA_Status: extra.QA_Status || defaultVerifyText,
      ManualApproval: extra.ManualApproval || "No",
      ApprovedForRecipe: extra.ApprovedForRecipe || defaultVerifyText,
      RecipeKey: recipeKey($("brewVariety").value, $("brewProcess").value, $("brewRoast").value),
      CurrentMatchScore: "",
      Water_Formula_Note: "TotalWater_ml = Rasio × Dosis_g. Japanese: air panas = 60%, es = 40%.",
      SwitchValveMode: brew.switchMode,
      ValvePlan: formatValvePlan(brew.steps),
      CreatedAt: extra.CreatedAt || new Date().toISOString(),
      UpdatedAt: extra.UpdatedAt || new Date().toISOString()
    };
  }

  async function consumeStockForBrew(stockBean, amount) {
    if (!stockBean?.CloudID || !amount) return null;
    await prepareCloudWrite("Update stok kopi");
    const { data, error } = await withTimeout(supabaseClient.rpc("consume_stock_for_brew", {
      p_stock_id: stockBean.CloudID,
      p_amount: Number(amount || 0)
    }), CLOUD_WRITE_TIMEOUT_MS, "Update stok kopi");
    if (error) throw error;
    const updated = fromSnakeStock(data);
    state.cloudStock = uniqueByCloudId([updated, ...(state.cloudStock || []).filter(bean => bean.CloudID !== updated.CloudID)]);
    return updated;
  }

  async function saveCurrentBrewDraft(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (brewDraftSaving) return;

    const btn = event?.target?.closest?.("#saveCurrentBrew,[data-action='save-brew-draft']") || $("saveCurrentBrew");
    const originalText = btn?.textContent || "Simpan draft ke Brew Log";

    if (!cloudReady || !supabaseClient) {
      showMessage("Supabase belum tersambung. Cek konfigurasi database, lalu refresh halaman.", "error");
      return;
    }

    if (!canUseWorkspaceModules()) {
      showMessage("Masuk dan pilih workspace untuk menyimpan draft ke Brew Log.", "error");
      return;
    }

    let watchdog;
    try {
      brewDraftSaving = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Menyimpan draft...";
      }
      watchdog = createButtonWatchdog({ key: "brew", button: btn, originalText, label: "Simpan draft Brew Log" });
      showMessage("Sedang menyimpan draft ke Brew Log...", "info");

      const stockBean = selectedBrewStockBean();
      const log = currentBrewLogBase();
      const payload = toSnakeBrew(log);
      const saved = await insertCloud("brew_logs", payload, fromSnakeBrew);

      state.cloudBrewLogs.unshift(saved);
      let stockMessage = "";
      if (stockBean) {
        try {
          const updatedStock = await consumeStockForBrew(stockBean, log.Dose_g);
          stockMessage = updatedStock ? ` Stok ${updatedStock.CoffeeName || "kopi"} tersisa ${updatedStock.Stock_g}g.` : "";
        } catch (stockErr) {
          console.error("Stock deduction failed", stockErr);
          stockMessage = ` Draft tersimpan, tetapi stok belum berkurang: ${stockErr.message || stockErr}`;
        }
      }
      renderStockTable();
      renderBeansTable();
      renderBrewLogTable();
      renderQABrewOptions();
      renderRecipeOptions(computeBrew());
      renderPublicBrewTable();
      syncFromCloud(false).then(() => {
        renderStockTable();
        renderBrewLogTable();
        renderQABrewOptions();
        renderPublicBrewTable();
      }).catch(console.warn);

      showMessage(`Draft ${saved.BrewID} berhasil tersimpan. Buka Brew Log & QA lalu pilih BrewID tersebut untuk verifikasi.${stockMessage}`, stockMessage.includes("belum berkurang") ? "error" : "success");
    } catch (err) {
      console.error("saveCurrentBrewDraft error", err);
      const detail = err?.message || err?.details || err?.hint || String(err);
      showMessage(`Gagal menyimpan draft ke Supabase: ${detail}`, "error");
      alert(`Gagal menyimpan draft ke Supabase. Detail: ${detail}`);
    } finally {
      if (watchdog) clearTimeout(watchdog);
      brewDraftSaving = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  function computeQAFromForm() {
    const ids = ["qaAroma", "qaFlavor", "qaAftertaste", "qaAcidityQuality", "qaSweetness", "qaBody", "qaBalance", "qaClarity", "qaFinish", "qaConsistency"];
    const avg = ids.reduce((sum, id) => sum + (Number($(id).value) || 0), 0) / ids.length;
    const final = clamp(avg - (Number($("qaDefect").value) || 0), 0, 10);
    return round(final, 2);
  }

  function renderQAPreview() {
    const final = computeQAFromForm();
    const approvalRequested = currentUser ? $("qaApproval").value === "Yes" : true;
    const pass = final >= APPROVAL_THRESHOLD && (approvalRequested || !currentUser);
    $("qaFinalPreview").textContent = fmt(final, 2);
    $("qaStatusPreview").textContent = pass ? "QA PASS" : "RETEST";
    $("qaStatusPreview").className = pass ? "qa-pass" : "qa-retest";
  }

  async function saveQA(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (qaSaving) return;

    const btn = e?.target?.closest?.("#qaSubmitBtn") || $("qaSubmitBtn");
    const originalText = btn?.textContent || "Simpan Brew Log + QA";

    if (!cloudReady || !supabaseClient) {
      showMessage("Database belum tersambung. Hubungkan Supabase terlebih dahulu.", "error");
      return;
    }

    const isGuest = !currentUser;
    if (currentUser && !canUseWorkspaceModules()) {
      showMessage(privateModuleMessage("Brew Log & QA"), "error");
      showTab("admin");
      return;
    }

    let draft = null;
    if (currentUser) {
      draft = selectedDraftLog();
      if (!draft) {
        showMessage("Pilih BrewID Asal dari draft Data Seduhan terlebih dahulu. Kalau belum ada, simpan draft dari menu Rekomendasi Seduh.", "error");
        return;
      }
    }

    const final = computeQAFromForm();
    const approvalRequested = currentUser ? $("qaApproval").value === "Yes" : true;
    const approved = final >= APPROVAL_THRESHOLD && (isGuest || (approvalRequested && canModerate()));
    const qaId = nextId("QA", allQA(), "QA_ID");

    const hasVariable = currentUser ? Boolean($("qaHasVariable")?.checked) : false;
    const variableText = currentUser
      ? (hasVariable ? ($("qaVariable").value.trim() || "Ada perubahan variabel") : "Tidak ada perubahan variabel")
      : "Input publik tanpa draft";

    const qaLogFields = {
      QA_ID: qaId,
      PrimaryVariableChanged: variableText,
      Hypothesis: $("qaHypothesis").value,
      ResultNotes: $("qaNotes").value,
      QA_Final: final,
      QA_Status: final >= APPROVAL_THRESHOLD ? "QA PASS" : "RETEST",
      ManualApproval: approvalRequested ? "Yes" : "No",
      ApprovedForRecipe: approved ? "Yes" : "No"
    };

    const log = draft
      ? {
          ...draft,
          ...qaLogFields,
          BrewID: draft.BrewID,
          Date: draft.Date || todayISO(),
          BrewerName: draft.BrewerName || currentBrewerName(),
          BeanName: draft.BeanName || $("qaBeanName").value || "",
          Origin: draft.Origin || "",
          StockBeanID: draft.StockBeanID || "",
          StockBeanCode: draft.StockBeanCode || "",
          StockUsage_g: draft.StockUsage_g ?? "",
          ParentBrewID: draft.ParentBrewID || "",
          RecipeKey: draft.RecipeKey || recipeKey(draft.Variety, draft.Process, draft.RoastProfile),
          WorkspaceID: draft.WorkspaceID || activeWorkspaceId(),
          CloudID: draft.CloudID,
          Source: draft.Source || "Supabase"
        }
      : currentBrewLogBase({
          BrewID: nextId("BL", allBrewLogs(), "BrewID"),
          BeanName: $("qaBeanName").value || $("brewVariety").value,
          ParentBrewID: "",
          ...qaLogFields
        });

    const qa = {
      QA_ID: qaId,
      BrewID: log.BrewID,
      Date: todayISO(),
      Evaluator: $("qaEvaluator").value || currentBrewerName(),
      Aroma: Number($("qaAroma").value),
      Flavor: Number($("qaFlavor").value),
      Aftertaste: Number($("qaAftertaste").value),
      AcidityQuality: Number($("qaAcidityQuality").value),
      Sweetness: Number($("qaSweetness").value),
      Body: Number($("qaBody").value),
      Balance: Number($("qaBalance").value),
      Clarity: Number($("qaClarity").value),
      Finish: Number($("qaFinish").value),
      DefectPenalty: Number($("qaDefect").value),
      Consistency: Number($("qaConsistency").value),
      Final_QA: final,
      Status: final >= APPROVAL_THRESHOLD ? "QA PASS" : "RETEST",
      Approver: approved ? ($("qaEvaluator").value || currentBrewerName()) : "",
      QA_Notes: $("qaNotes").value,
      PrimaryVariableChanged: qaLogFields.PrimaryVariableChanged,
      Hypothesis: qaLogFields.Hypothesis,
      ResultNotes: qaLogFields.ResultNotes,
      WorkspaceID: log.WorkspaceID || activeWorkspaceId(),
      CreatedBy: currentUser?.id || null
    };

    let watchdog;
    try {
      qaSaving = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Menyimpan QA...";
      }
      watchdog = createButtonWatchdog({ key: "qa", button: btn, originalText, label: "Simpan Brew Log + QA" });
      showMessage("Sedang menyimpan Brew Log & QA...", "info");

      let savedLog;
      if (draft?.CloudID) {
        savedLog = { ...draft, ...log, CloudID: draft.CloudID, WorkspaceID: draft.WorkspaceID || activeWorkspaceId(), Source: "Supabase" };
        state.cloudBrewLogs = uniqueByCloudId([savedLog, ...(state.cloudBrewLogs || []).filter(item => item.CloudID !== savedLog.CloudID)]);
        const savedQA = await insertCloud("qa_scores", toSnakeQA(qa), fromSnakeQA);
        state.cloudQA = uniqueByCloudId([savedQA, ...(state.cloudQA || [])]);
        backgroundBrewLogQAUpdate(draft.CloudID, toSnakeBrewQAUpdate(log), savedLog);
      } else {
        savedLog = await insertCloud("brew_logs", toSnakeBrew(log), fromSnakeBrew);
        state.cloudBrewLogs.unshift(savedLog);
        const savedQA = await insertCloud("qa_scores", toSnakeQA(qa), fromSnakeQA);
        state.cloudQA = uniqueByCloudId([savedQA, ...(state.cloudQA || [])]);
      }

      renderBrewLogTable();
      renderQABrewOptions();
      renderBrew();
      renderPublicBrewTable();

      if (isGuest) {
        showMessage(final >= APPROVAL_THRESHOLD ? "Hasil seduhan publik tersimpan dan tampil di feed publik." : "Hasil seduhan tersimpan, tetapi belum masuk feed publik karena nilai belum mencapai 6.5.", final >= APPROVAL_THRESHOLD ? "success" : "info");
      } else if (approved) {
        showMessage("QA PASS. Brew log terverifikasi dan tampil di Hasil Seduhan Publik.", "success");
      } else {
        showMessage("Brew Log & QA tersimpan. Data belum tampil publik sebelum disetujui QA/admin atau mencapai status approved.", "info");
      }
    } catch (err) {
      console.error(err);
      const detail = err?.message || err?.details || err?.hint || String(err);
      showMessage(`Gagal menyimpan Brew Log & QA ke Supabase: ${detail}`, "error");
      alert(`Gagal menyimpan Brew Log & QA. Detail: ${detail}`);
    } finally {
      if (watchdog) clearTimeout(watchdog);
      qaSaving = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }


  function manualScoreIds() {
    return ["manualAroma", "manualFlavor", "manualAftertaste", "manualAcidityQuality", "manualSweetness", "manualBody", "manualBalance", "manualClarity", "manualFinish", "manualConsistency"];
  }

  function computeManualQAFromForm() {
    const ids = manualScoreIds();
    const avg = ids.reduce((sum, id) => sum + (Number($(id)?.value) || 0), 0) / ids.length;
    const final = clamp(avg - (Number($("manualDefect")?.value) || 0), 0, 10);
    return round(final, 2);
  }

  function syncManualTotalWater(force = false) {
    const total = $("manualTotalWater");
    if (!total) return;
    if (!force && total.dataset.userEdited === "true") return;
    const dose = Number($("manualDose")?.value || 0);
    const ratio = Number($("manualRatio")?.value || 0);
    if (dose && ratio) total.value = String(Math.round(dose * ratio));
  }

  function renderManualBrewPreview() {
    syncManualTotalWater(false);
    renderManualConditionalFields();
    const final = computeManualQAFromForm();
    const pass = final >= APPROVAL_THRESHOLD;
    const finalEl = $("manualFinalPreview");
    const statusEl = $("manualStatusPreview");
    const btn = $("manualSubmitBtn");
    const hint = $("manualGateHint");
    if (finalEl) finalEl.textContent = fmt(final, 2);
    if (statusEl) {
      statusEl.textContent = pass ? "QA PASS" : "RETEST";
      statusEl.className = pass ? "qa-pass" : "qa-retest";
    }
    if (btn) {
      btn.disabled = !pass || manualBrewSaving;
      btn.title = pass ? "Final QA memenuhi batas 6.5" : "Final QA harus minimal 6.5 untuk menyimpan hasil seduhan publik";
    }
    if (hint) {
      hint.textContent = pass
        ? "Tombol simpan aktif karena Final QA memenuhi batas publik 6.5."
        : "Final QA belum mencapai 6.5. Tombol simpan dikunci agar hasil belum masuk feed publik.";
      hint.classList.toggle("locked", !pass);
    }
  }

  function selectedManualGrinderName() {
    const grinder = $("manualGrinder")?.value || "";
    if (norm(grinder) === "custom") return $("manualGrindSetting")?.value ? "Custom" : "Custom";
    return grinder;
  }

  function isManualSwitchDripper() {
    return /switch/i.test($("manualDripper")?.value || "");
  }

  function manualValveMode() {
    if (!isManualSwitchDripper()) return "N/A";
    return $("manualSwitchValveMode")?.value || "Full Open";
  }

  function setManualGroupVisible(selector, visible) {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.toggle("hidden", !visible);
      el.querySelectorAll?.("input, select, textarea").forEach(field => {
        field.disabled = !visible;
      });
    });
  }

  function renderManualConditionalFields() {
    const isSwitchManual = isManualSwitchDripper();
    const valveMode = manualValveMode();
    const isJapanese = /japanese/i.test($("manualMode")?.value || "");
    const modeWrap = $("manualSwitchValveModeWrap");
    if (modeWrap) modeWrap.classList.toggle("hidden", !isSwitchManual);
    if (modeWrap) modeWrap.querySelectorAll("input, select, textarea").forEach(field => { field.disabled = !isSwitchManual; });
    if (!isSwitchManual && $("manualSwitchValveMode")) $("manualSwitchValveMode").value = "N/A";
    if (isSwitchManual && $("manualSwitchValveMode")?.value === "N/A") $("manualSwitchValveMode").value = "Full Open";

    const iceWrap = $("manualIceWrap");
    if (iceWrap) iceWrap.classList.toggle("hidden", !isJapanese);
    if (iceWrap) iceWrap.querySelectorAll("input, select, textarea").forEach(field => { field.disabled = !isJapanese; });

    const fullImmersion = isSwitchManual && /full immersion/i.test(valveMode);
    const hybrid = isSwitchManual && /hybrid/i.test(valveMode);
    const hint = $("manualPourModeHint");
    if (hint) {
      if (fullImmersion) hint.textContent = "Full Immersion: isi Pour 1 saja dan waktu kapan valve dibuka.";
      else if (hybrid) hint.textContent = "Hybrid Switch: isi Pour 1–4, valve open/closed, dan keterangan tiap pour.";
      else if (isSwitchManual) hint.textContent = "Full Open: isi Pour 1–4 seperti dripper biasa, valve tetap open.";
      else hint.textContent = "Isi volume Pour 1 sampai Pour 4 sesuai resep manual.";
    }

    document.querySelectorAll("[data-manual-pour-card]").forEach(card => {
      const n = Number(card.dataset.manualPourCard || 0);
      const visible = fullImmersion ? n === 1 : n >= 1 && n <= 4;
      card.classList.toggle("hidden", !visible);
      card.querySelectorAll("input, select, textarea").forEach(field => { field.disabled = !visible; });
    });

    setManualGroupVisible(".manual-pour-valve", hybrid);
    setManualGroupVisible(".manual-pour-note", hybrid);
    setManualGroupVisible("#manualValveOpenTimeWrap", fullImmersion);
  }

  function manualPourDetails() {
    const valveMode = manualValveMode();
    const fullImmersion = /full immersion/i.test(valveMode);
    const hybrid = /hybrid/i.test(valveMode);
    const maxPour = fullImmersion ? 1 : 4;
    const rows = [];
    for (let i = 1; i <= maxPour; i += 1) {
      const amount = Number($(`manualPour${i}`)?.value || 0);
      const valve = $(`manualPour${i}Valve`)?.value || "Open";
      const note = $(`manualPour${i}Note`)?.value.trim() || "";
      if (!amount && !note) continue;
      let text = `Pour ${i}: ${amount ? `${amount}ml` : "volume tidak diisi"}`;
      if (hybrid) text += ` · valve ${valve.toLowerCase()}`;
      if (note) text += ` · ${note}`;
      rows.push(text);
    }
    return rows;
  }

  function manualPourCountValue() {
    const fullImmersion = /full immersion/i.test(manualValveMode());
    if (fullImmersion) return 1;
    const filled = manualPourDetails().length;
    return filled || 4;
  }

  function manualValvePlanText() {
    if (!isManualSwitchDripper()) return "N/A";
    const valveMode = manualValveMode();
    if (/full immersion/i.test(valveMode)) {
      const openAt = $("manualValveOpenTime")?.value.trim() || "waktu open valve belum diisi";
      return `Full Immersion · valve dibuka: ${openAt}`;
    }
    if (/hybrid/i.test(valveMode)) {
      const rows = [];
      for (let i = 1; i <= 4; i += 1) {
        const valve = $(`manualPour${i}Valve`)?.value || "Open";
        const note = $(`manualPour${i}Note`)?.value.trim() || "";
        rows.push(`Pour ${i}: ${valve}${note ? ` (${note})` : ""}`);
      }
      return `Hybrid · ${rows.join(" | ")}`;
    }
    return "Full Open · valve open sepanjang pour";
  }

  function manualPourPlanText() {
    const structured = manualPourDetails();
    const text = $("manualPourPlan")?.value.trim() || "";
    const bloom = Number($("manualBloom")?.value || 0);
    const total = Number($("manualTotalWater")?.value || 0);
    const time = Number($("manualBrewTime")?.value || 0);
    const ice = Number($("manualIce")?.value || 0);
    const pieces = [];
    if (bloom) pieces.push(`Bloom ${bloom}ml`);
    if (structured.length) pieces.push(...structured);
    else pieces.push(`${manualPourCountValue()}x pour sampai ${total}ml`);
    if (/japanese/i.test($("manualMode")?.value || "") && ice) pieces.push(`Es batu ${ice}g`);
    if (time) pieces.push(`target selesai ${fmtTime(time)}`);
    if (text) pieces.push(`Catatan: ${text}`);
    return pieces.join(" | ");
  }

  function manualBrewPayloadBase(extra = {}) {
    const method = $("manualMode")?.value || "Hot V60";
    const totalWater = Number($("manualTotalWater")?.value || 0);
    const isIced = /japanese/i.test(method);
    const manualIce = Number($("manualIce")?.value || 0);
    const ice = isIced ? manualIce : 0;
    const hotWater = isIced ? Math.max(0, totalWater - ice) : totalWater;
    const waterName = $("manualWater")?.value || "";
    const qaId = extra.QA_ID || nextId("QA", allQA(), "QA_ID");
    const brewerName = $("manualEvaluator")?.value.trim() || currentBrewerName();
    const final = extra.QA_Final ?? computeManualQAFromForm();
    return {
      BrewID: extra.BrewID || nextId("BL", allBrewLogs(), "BrewID"),
      Date: todayISO(),
      BrewerName: brewerName,
      BeanName: $("manualBeanName")?.value.trim() || "Manual Brew",
      Origin: $("manualOrigin")?.value.trim() || "",
      StockBeanID: "",
      StockBeanCode: "",
      StockUsage_g: "",
      Variety: $("manualVariety")?.value || "",
      Process: $("manualProcess")?.value || "",
      RoastProfile: $("manualRoast")?.value || "",
      Dripper: $("manualDripper")?.value || "",
      Method: method,
      Grinder: selectedManualGrinderName(),
      GrindSetting: $("manualGrindSetting")?.value.trim() || "Manual",
      Temp_C: Number($("manualTemp")?.value || 0),
      Ratio: Number($("manualRatio")?.value || 0),
      Dose_g: Number($("manualDose")?.value || 0),
      TotalWater_ml: totalWater,
      HotWater_ml: hotWater,
      Ice_g: ice,
      BrewTime_sec: Number($("manualBrewTime")?.value || 0),
      Bloom_ml: Number($("manualBloom")?.value || 0),
      PourCount: manualPourCountValue(),
      PourPlan: manualPourPlanText(),
      Water: waterName,
      TDS_ppm: getBy(DATA.waters, "Water", waterName).TDS_ppm || "",
      Agitation: "Manual / brewer-defined",
      Filter: "Paper",
      ParentBrewID: "",
      PrimaryVariableChanged: $("manualVariable")?.value.trim() || "Input seduhan manual",
      Hypothesis: $("manualHypothesis")?.value.trim() || "",
      ResultNotes: $("manualNotes")?.value.trim() || "",
      QA_ID: qaId,
      QA_Final: final,
      QA_Status: "QA PASS",
      ManualApproval: "Yes",
      ApprovedForRecipe: "Yes",
      RecipeKey: recipeKey($("manualVariety")?.value, $("manualProcess")?.value, $("manualRoast")?.value),
      CurrentMatchScore: "",
      Water_Formula_Note: "Input manual dari menu Input Seduhan.",
      SwitchValveMode: manualValveMode(),
      ValvePlan: manualValvePlanText(),
      WorkspaceID: activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      CreatedBy: currentUser?.id || null,
      ModerationStatus: "approved",
      Visibility: "public",
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };
  }

  function manualQARecord(log) {
    return {
      QA_ID: log.QA_ID,
      BrewID: log.BrewID,
      Date: todayISO(),
      Evaluator: $("manualEvaluator")?.value.trim() || currentBrewerName(),
      Aroma: Number($("manualAroma")?.value),
      Flavor: Number($("manualFlavor")?.value),
      Aftertaste: Number($("manualAftertaste")?.value),
      AcidityQuality: Number($("manualAcidityQuality")?.value),
      Sweetness: Number($("manualSweetness")?.value),
      Body: Number($("manualBody")?.value),
      Balance: Number($("manualBalance")?.value),
      Clarity: Number($("manualClarity")?.value),
      Finish: Number($("manualFinish")?.value),
      DefectPenalty: Number($("manualDefect")?.value),
      Consistency: Number($("manualConsistency")?.value),
      Final_QA: Number(log.QA_Final || 0),
      Status: "QA PASS",
      Approver: $("manualEvaluator")?.value.trim() || currentBrewerName(),
      QA_Notes: $("manualNotes")?.value.trim() || "",
      PrimaryVariableChanged: log.PrimaryVariableChanged,
      Hypothesis: log.Hypothesis,
      ResultNotes: log.ResultNotes,
      WorkspaceID: log.WorkspaceID,
      CreatedBy: currentUser?.id || null,
      ModerationStatus: "approved"
    };
  }


  function isPublicBrewOwner(log) {
    if (!log) return false;
    if (currentUser?.id && log.CreatedBy && String(log.CreatedBy) === String(currentUser.id)) return true;
    return false;
  }

  function findQAForBrew(log) {
    if (!log) return null;
    return (state.cloudQA || []).find(qa =>
      (log.QA_ID && qa.QA_ID === log.QA_ID) ||
      (log.BrewID && qa.BrewID === log.BrewID)
    ) || null;
  }

  function setManualFieldValue(id, value) {
    const el = $(id);
    if (!el) return;
    const safe = value === null || value === undefined ? "" : String(value);
    if (el.tagName === "SELECT") {
      const options = Array.from(el.options || []);
      const match = options.find(opt => norm(opt.value) === norm(safe) || norm(opt.textContent) === norm(safe));
      if (match) el.value = match.value;
      else if (safe && options.length) {
        const option = document.createElement("option");
        option.value = safe;
        option.textContent = safe;
        el.appendChild(option);
        el.value = safe;
      }
      return;
    }
    el.value = safe;
  }

  function resetManualPourFields() {
    for (let i = 1; i <= 4; i += 1) {
      setManualFieldValue(`manualPour${i}`, "");
      setManualFieldValue(`manualPour${i}Valve`, "Open");
      setManualFieldValue(`manualPour${i}Note`, "");
    }
    setManualFieldValue("manualValveOpenTime", "");
  }

  function parseManualPourPlanFromLog(log) {
    resetManualPourFields();
    const pourPlan = String(log?.PourPlan || "");
    const valvePlan = String(log?.ValvePlan || "");
    const combined = `${pourPlan} | ${valvePlan}`;
    let structuredFound = false;
    for (let i = 1; i <= 4; i += 1) {
      const amountMatch = combined.match(new RegExp(`Pour\\s*${i}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*ml`, "i"));
      const valveMatch = combined.match(new RegExp(`Pour\\s*${i}[^|]*(?:valve\\s+|:\\s*)(Open|Closed)`, "i"));
      if (amountMatch) {
        setManualFieldValue(`manualPour${i}`, amountMatch[1]);
        structuredFound = true;
      }
      if (valveMatch) setManualFieldValue(`manualPour${i}Valve`, valveMatch[1].replace(/^./, ch => ch.toUpperCase()));
      const segmentMatch = combined.match(new RegExp(`Pour\\s*${i}\\s*:[^|]+`, "i"));
      if (segmentMatch) {
        const note = segmentMatch[0]
          .replace(new RegExp(`Pour\\s*${i}\\s*:\\s*`, "i"), "")
          .replace(/\\d+(?:\\.\\d+)?\\s*ml/i, "")
          .replace(/valve\\s+(open|closed)/i, "")
          .replace(/^\\s*[·:-]+\\s*/g, "")
          .trim();
        if (note && !/^(open|closed)$/i.test(note)) setManualFieldValue(`manualPour${i}Note`, note);
      }
    }
    const valveOpenMatch = valvePlan.match(/valve\s+dibuka\s*:\s*([^|]+)/i);
    if (valveOpenMatch) setManualFieldValue("manualValveOpenTime", valveOpenMatch[1].trim());

    const catatanMatch = pourPlan.match(/Catatan:\s*([^|]+)$/i);
    if (catatanMatch) setManualFieldValue("manualPourPlan", catatanMatch[1].trim());
    else if (!structuredFound && pourPlan) setManualFieldValue("manualPourPlan", pourPlan);
    else setManualFieldValue("manualPourPlan", "");
  }

  function setManualEditMode(active, log = null, qa = null) {
    manualEditingOriginalLog = active ? log : null;
    manualEditingOriginalQA = active ? qa : null;
    manualEditingBrewId = active ? log?.CloudID || null : null;
    const banner = $("manualEditBanner");
    const title = $("manualEditTitle");
    const submit = $("manualSubmitBtn");
    const cancel = $("manualCancelEditBtn");
    if (banner) banner.classList.toggle("hidden", !active);
    if (title) title.textContent = active ? `Sedang mengedit: ${log?.BeanName || "Hasil Seduhan"}` : "Mode edit hasil seduhan";
    if (submit) submit.textContent = active ? "Simpan Perubahan Hasil Seduhan" : "Simpan Hasil Seduhan Publik";
    if (cancel) cancel.classList.toggle("hidden", !active);
  }

  function openPublicBrewEdit(key) {
    const log = findPublicBrewLog(key);
    if (!log) return showMessage("Data seduhan tidak ditemukan. Muat ulang lalu coba lagi.", "error");
    if (!isPublicBrewOwner(log)) return showMessage("Edit hanya tersedia untuk akun yang menginput hasil seduhan ini.", "error");
    const qa = findQAForBrew(log);
    setManualEditMode(true, log, qa);

    setManualFieldValue("manualBeanName", log.BeanName || "");
    setManualFieldValue("manualOrigin", log.Origin || "");
    setManualFieldValue("manualEvaluator", log.BrewerName || qa?.Evaluator || currentBrewerName());
    setManualFieldValue("manualVariety", log.Variety || "");
    setManualFieldValue("manualProcess", log.Process || "");
    setManualFieldValue("manualRoast", log.RoastProfile || "");
    setManualFieldValue("manualDripper", log.Dripper || "");
    setManualFieldValue("manualMode", log.Method || "Hot V60");
    setManualFieldValue("manualSwitchValveMode", log.SwitchValveMode || (/switch/i.test(log.Dripper || "") ? "Full Open" : "N/A"));
    setManualFieldValue("manualIce", Number(log.Ice_g || 0));
    setManualFieldValue("manualGrinder", log.Grinder || "");
    setManualFieldValue("manualGrindSetting", log.GrindSetting || "");
    setManualFieldValue("manualWater", log.Water || "");
    setManualFieldValue("manualDose", log.Dose_g || "");
    setManualFieldValue("manualRatio", log.Ratio || "");
    setManualFieldValue("manualTotalWater", log.TotalWater_ml || "");
    setManualFieldValue("manualTemp", log.Temp_C || "");
    setManualFieldValue("manualBrewTime", log.BrewTime_sec || "");
    setManualFieldValue("manualBloom", log.Bloom_ml || "");
    parseManualPourPlanFromLog(log);

    setManualFieldValue("manualVariable", log.PrimaryVariableChanged || qa?.PrimaryVariableChanged || "");
    setManualFieldValue("manualHypothesis", log.Hypothesis || qa?.Hypothesis || "");
    setManualFieldValue("manualNotes", log.ResultNotes || qa?.ResultNotes || qa?.QA_Notes || "");
    const fallback = Number(log.QA_Final || qa?.Final_QA || 8.5);
    setManualFieldValue("manualAroma", qa?.Aroma ?? fallback);
    setManualFieldValue("manualFlavor", qa?.Flavor ?? fallback);
    setManualFieldValue("manualAftertaste", qa?.Aftertaste ?? fallback);
    setManualFieldValue("manualAcidityQuality", qa?.AcidityQuality ?? fallback);
    setManualFieldValue("manualSweetness", qa?.Sweetness ?? fallback);
    setManualFieldValue("manualBody", qa?.Body ?? fallback);
    setManualFieldValue("manualBalance", qa?.Balance ?? fallback);
    setManualFieldValue("manualClarity", qa?.Clarity ?? fallback);
    setManualFieldValue("manualFinish", qa?.Finish ?? fallback);
    setManualFieldValue("manualConsistency", qa?.Consistency ?? fallback);
    setManualFieldValue("manualDefect", qa?.DefectPenalty ?? 0);

    closePublicBrewDetail();
    renderManualBrewPreview();
    showTab("input-seduhan");
    setTimeout(() => $("manualBeanName")?.focus(), 120);
    showMessage("Mode edit aktif. Ubah field seperti Input Seduhan, lalu simpan perubahan.", "info");
  }

  function cancelManualBrewEdit() {
    setManualEditMode(false);
    renderManualBrewPreview();
    showMessage("Mode edit dibatalkan. Form kembali untuk input seduhan baru.", "info");
  }

  async function saveManualBrew(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (manualBrewSaving) return;
    renderManualBrewPreview();
    const final = computeManualQAFromForm();
    if (final < APPROVAL_THRESHOLD) {
      showMessage("Final QA belum mencapai 6.5. Hasil seduhan belum bisa disimpan ke publik.", "error");
      return;
    }
    if (!cloudReady || !supabaseClient) {
      showMessage("Database belum tersambung. Hubungkan Supabase terlebih dahulu.", "error");
      return;
    }
    if (currentUser && !canUseWorkspaceModules()) {
      showMessage("Akun login perlu workspace aktif untuk menyimpan Input Seduhan. Guest tetap bisa mengirim tanpa login.", "error");
      showTab("admin");
      return;
    }
    if (!$("manualBeanName")?.value.trim()) {
      showMessage("Nama kopi wajib diisi.", "error");
      $("manualBeanName")?.focus();
      return;
    }

    const btn = $("manualSubmitBtn");
    const originalText = btn?.textContent || "Simpan Hasil Seduhan Publik";
    let watchdog;
    try {
      manualBrewSaving = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Menyimpan seduhan...";
      }
      watchdog = createButtonWatchdog({ key: "manual-brew", button: btn, originalText, label: "Simpan Input Seduhan" });
      showMessage("Sedang menyimpan hasil seduhan publik...", "info");

      const editing = Boolean(manualEditingBrewId && manualEditingOriginalLog);
      let log = manualBrewPayloadBase({
        BrewID: editing ? manualEditingOriginalLog.BrewID : undefined,
        QA_ID: editing ? (manualEditingOriginalLog.QA_ID || manualEditingOriginalQA?.QA_ID) : undefined,
        QA_Final: final
      });
      if (editing) {
        log = {
          ...log,
          CloudID: manualEditingOriginalLog.CloudID,
          Date: manualEditingOriginalLog.Date || log.Date,
          CreatedBy: manualEditingOriginalLog.CreatedBy || currentUser?.id || null,
          WorkspaceID: manualEditingOriginalLog.WorkspaceID || activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
          CreatedAt: manualEditingOriginalLog.CreatedAt,
          UpdatedAt: new Date().toISOString()
        };
      }
      const qa = manualQARecord(log);
      let savedLog;
      let savedQA;
      if (editing) {
        if (!isPublicBrewOwner(manualEditingOriginalLog)) throw new Error("Edit hanya tersedia untuk akun yang menginput hasil seduhan ini.");
        savedLog = await updateCloud("brew_logs", manualEditingBrewId, toSnakeBrew(log), fromSnakeBrew);
        state.cloudBrewLogs = uniqueByCloudId([savedLog, ...(state.cloudBrewLogs || []).filter(item => item.CloudID !== savedLog.CloudID)]);
        if (manualEditingOriginalQA?.CloudID) {
          savedQA = await updateCloud("qa_scores", manualEditingOriginalQA.CloudID, toSnakeQA({ ...qa, QA_ID: manualEditingOriginalQA.QA_ID || qa.QA_ID }), fromSnakeQA);
        } else {
          savedQA = await insertCloud("qa_scores", toSnakeQA(qa), fromSnakeQA);
        }
        state.cloudQA = uniqueByCloudId([savedQA, ...(state.cloudQA || []).filter(item => item.CloudID !== savedQA.CloudID)]);
        setManualEditMode(false);
      } else {
        savedLog = await insertCloud("brew_logs", toSnakeBrew(log), fromSnakeBrew);
        state.cloudBrewLogs.unshift(savedLog);
        savedQA = await insertCloud("qa_scores", toSnakeQA(qa), fromSnakeQA);
        state.cloudQA = uniqueByCloudId([savedQA, ...(state.cloudQA || [])]);
      }

      renderBrewLogTable();
      renderQABrewOptions();
      renderPublicBrewTable();
      renderRecipeOptions(computeBrew());
      showMessage(editing ? "Perubahan hasil seduhan berhasil disimpan." : "Hasil seduhan berhasil disimpan dan masuk ke Hasil Seduhan Publik.", "success");
      showTab("public-brews");
    } catch (err) {
      console.error("saveManualBrew error", err);
      const detail = err?.message || err?.details || err?.hint || String(err);
      showMessage(`Gagal menyimpan Input Seduhan: ${detail}`, "error");
      alert(`Gagal menyimpan Input Seduhan. Detail: ${detail}`);
    } finally {
      if (watchdog) clearTimeout(watchdog);
      manualBrewSaving = false;
      if (btn) {
        btn.textContent = manualEditingBrewId ? originalText : "Simpan Hasil Seduhan Publik";
      }
      renderManualBrewPreview();
    }
  }

  function renderBrewLogTable() {
    const table = $("brewLogTable");
    const tbody = table?.querySelector("tbody");
    const thead = table?.querySelector("thead");
    if (!tbody || !thead) return;
    const locked = !canUseWorkspaceModules();
    setElementHidden($("brewLogHistoryPanel"), locked);
    if (locked) return;

    const adminView = canAdmin();
    const baseHeaders = ["BrewID", "Tanggal", "Biji Kopi", "Key", "Metode", "Dripper", "Grinder", "Gilingan", "Suhu", "Ratio", "QA", "Disetujui", "Variabel", "Hipotesis", "Catatan Hasil"];
    thead.innerHTML = `<tr>${baseHeaders.map(label => `<th>${html(label)}</th>`).join("")}${adminView ? "<th>Aksi</th>" : ""}</tr>`;

    const rows = sortBrewNewest(allBrewLogs());
    const colSpan = baseHeaders.length + (adminView ? 1 : 0);
    if (!rows.length) {
      tbody.innerHTML = emptyRow(colSpan, "Brew log masih kosong", "Buat draft dari menu Rekomendasi Seduh, lalu simpan dan evaluasi hasilnya.", "✍");
      return;
    }

    tbody.innerHTML = rows.map(log => {
      const qaText = log.QA_Final ? `<span class="score-pill">${html(log.QA_Final)}</span>` : "belum diverifikasi";
      const approvedText = log.QA_Final ? html(log.ApprovedForRecipe || "No") : "belum diverifikasi";
      const variableText = log.QA_Final ? html(log.PrimaryVariableChanged || "Tidak ada perubahan variabel") : "belum diverifikasi";
      const hypothesisText = log.Hypothesis ? html(log.Hypothesis) : "-";
      const resultText = log.ResultNotes ? html(log.ResultNotes) : "-";
      const editKey = html(log.CloudID || log.BrewID || "");
      return `<tr>
        <td><strong>${html(log.BrewID)}</strong></td>
        <td>${html(log.Date)}</td>
        <td>${html(log.BeanName)}</td>
        <td>${html(log.RecipeKey)}</td>
        <td>${html(log.Method)}</td>
        <td>${html(log.Dripper)}</td>
        <td>${html(log.Grinder || "-")}</td>
        <td>${html(log.GrindSetting || "-")}</td>
        <td>${html(log.Temp_C)}°C</td>
        <td>1:${html(log.Ratio)}</td>
        <td>${qaText}</td>
        <td>${approvedText}</td>
        <td class="notes-cell">${variableText}</td>
        <td class="notes-cell">${hypothesisText}</td>
        <td class="notes-cell">${resultText}</td>
        ${adminView ? `<td><div class="moderation-actions"><button class="secondary small-action" type="button" data-brew-edit="${editKey}">Edit</button><button class="danger small-action" type="button" data-brew-delete="${editKey}">Hapus</button></div></td>` : ""}
      </tr>`;
    }).join("");
  }

  function findBrewLogForEdit(key) {
    return allBrewLogs().find(log => String(log.CloudID || "") === String(key) || String(log.BrewID || "") === String(key));
  }

  function openBrewLogEdit(key) {
    if (!canAdmin()) return showMessage("Edit Brew Log hanya untuk Admin Workspace.", "error");
    const log = findBrewLogForEdit(key);
    if (!log) return showMessage("Brew Log tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    if (!log.CloudID) return showMessage("Brew Log ini belum memiliki ID Supabase, sehingga belum bisa diedit dari panel admin.", "error");

    $("editBrewCloudId").value = log.CloudID || "";
    if ($("editBrewHeaderId")) $("editBrewHeaderId").textContent = log.BrewID || "-";
    $("editBrewId").value = log.BrewID || "";
    $("editBrewDate").value = log.Date || todayISO();
    $("editBrewBeanName").value = log.BeanName || "";
    $("editBrewOrigin").value = log.Origin || "";
    $("editBrewVariety").value = log.Variety || "";
    $("editBrewProcess").value = log.Process || "";
    $("editBrewRoast").value = log.RoastProfile || "";
    $("editBrewMethod").value = log.Method || "";
    $("editBrewDripper").value = log.Dripper || "";
    $("editBrewGrinder").value = log.Grinder || "";
    $("editBrewGrind").value = log.GrindSetting || "";
    $("editBrewTemp").value = log.Temp_C || "";
    $("editBrewRatio").value = log.Ratio || "";
    $("editBrewQA").value = log.QA_Final || "";
    $("editBrewApproved").value = log.ApprovedForRecipe || "No";
    $("editBrewVariable").value = log.PrimaryVariableChanged || "";
    $("editBrewHypothesis").value = log.Hypothesis || "";
    $("editBrewResultNotes").value = log.ResultNotes || "";

    setElementHidden($("brewLogEditPanel"), false);
    $("brewLogEditPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeBrewLogEdit() {
    $("brewLogEditForm")?.reset();
    setElementHidden($("brewLogEditPanel"), true);
  }

  async function saveBrewLogEdit(e) {
    e.preventDefault();
    if (!canAdmin()) return showMessage("Edit Brew Log hanya untuk Admin Workspace.", "error");
    if (!cloudReady || !supabaseClient) return showMessage("Supabase belum tersambung.", "error");

    const cloudId = $("editBrewCloudId")?.value;
    const current = findBrewLogForEdit(cloudId);
    if (!cloudId || !current) return showMessage("Data Brew Log yang diedit tidak ditemukan.", "error");

    const qaValue = $("editBrewQA").value;
    const approvedValue = $("editBrewApproved").value;
    const updated = {
      ...current,
      Date: $("editBrewDate").value || current.Date || todayISO(),
      BeanName: $("editBrewBeanName").value.trim() || current.BeanName,
      Origin: $("editBrewOrigin").value.trim(),
      Variety: $("editBrewVariety").value.trim() || current.Variety,
      Process: $("editBrewProcess").value.trim() || current.Process,
      RoastProfile: $("editBrewRoast").value.trim() || current.RoastProfile,
      Method: $("editBrewMethod").value.trim() || current.Method,
      Dripper: $("editBrewDripper").value.trim() || current.Dripper,
      Grinder: $("editBrewGrinder").value.trim() || current.Grinder,
      GrindSetting: $("editBrewGrind").value.trim() || current.GrindSetting,
      Temp_C: $("editBrewTemp").value === "" ? current.Temp_C : Number($("editBrewTemp").value),
      Ratio: $("editBrewRatio").value === "" ? current.Ratio : Number($("editBrewRatio").value),
      QA_Final: qaValue === "" ? "" : Number(qaValue),
      QA_Status: qaValue === "" ? current.QA_Status : (Number(qaValue) >= APPROVAL_THRESHOLD ? "QA PASS" : "RETEST"),
      ApprovedForRecipe: approvedValue,
      ManualApproval: approvedValue === "Yes" ? "Yes" : (current.ManualApproval || "No"),
      PrimaryVariableChanged: $("editBrewVariable").value.trim(),
      Hypothesis: $("editBrewHypothesis").value.trim(),
      ResultNotes: $("editBrewResultNotes").value.trim(),
      RecipeKey: recipeKey($("editBrewVariety").value.trim() || current.Variety, $("editBrewProcess").value.trim() || current.Process, $("editBrewRoast").value.trim() || current.RoastProfile)
    };

    try {
      const saved = await updateCloud("brew_logs", cloudId, toSnakeBrew(updated), fromSnakeBrew);
      state.cloudBrewLogs = state.cloudBrewLogs.map(item => item.CloudID === saved.CloudID ? saved : item);
      closeBrewLogEdit();
      await syncFromCloud(false).catch(console.warn);
      renderBrewLogTable();
      renderQABrewOptions();
      renderRecipeOptions(computeBrew());
      renderPublicBrewTable();
      if (canModerate()) loadModerationRows().catch(console.warn);
      showMessage("Brew Log berhasil diperbarui oleh Admin.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal edit Brew Log: ${err.message || err}`, "error");
    }
  }

  async function deleteBrewLog(key) {
    if (!canAdmin()) return showMessage("Hapus Brew Log hanya untuk Admin Workspace.", "error");
    if (!cloudReady || !supabaseClient) return showMessage("Supabase belum tersambung.", "error");

    const log = findBrewLogForEdit(key);
    if (!log) return showMessage("Brew Log tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    if (!log.CloudID) return showMessage("Brew Log ini belum memiliki ID Supabase, sehingga belum bisa dihapus.", "error");

    const stockText = log.StockBeanID && Number(log.StockUsage_g || 0) > 0
      ? ` Stok kopi akan dikembalikan sebesar ${fmt(log.StockUsage_g)}g.`
      : "";
    if (!confirm(`Hapus Brew Log ${log.BrewID || "ini"}?${stockText}`)) return;

    try {
      showMessage("Menghapus Brew Log dan memulihkan stok jika ada...", "info");
      let result = null;
      await prepareCloudWrite("Hapus Brew Log");
      const rpc = supabaseClient.rpc("delete_brew_log_and_restore_stock", { p_brew_id: log.CloudID });
      const { data, error } = await withTimeout(rpc, CLOUD_WRITE_TIMEOUT_MS, "Hapus Brew Log");
      if (error) throw error;
      result = data || {};

      state.cloudBrewLogs = (state.cloudBrewLogs || []).filter(item => item.CloudID !== log.CloudID);
      state.cloudQA = (state.cloudQA || []).filter(item => item.BrewID !== log.BrewID);

      if (log.StockBeanID && Number(result.stock_g ?? NaN) >= 0) {
        state.cloudStock = (state.cloudStock || []).map(bean => String(bean.CloudID) === String(log.StockBeanID)
          ? { ...bean, Stock_g: Number(result.stock_g) }
          : bean);
      }

      await syncFromCloud(false).catch(console.warn);
      renderStockTable();
      renderBeansTable();
      renderBrewLogTable();
      renderQABrewOptions();
      renderRecipeOptions(computeBrew());
      renderPublicBrewTable();
      if (canModerate()) loadModerationRows().catch(console.warn);

      const restored = result?.stock_restored ? ` Stok dikembalikan ${fmt(result.stock_usage_g)}g.` : "";
      showMessage(`Brew Log berhasil dihapus.${restored}`, "success");
    } catch (err) {
      console.error("delete brew log failed", err);
      const detail = err?.message || err?.details || err?.hint || String(err);
      showMessage(`Gagal menghapus Brew Log: ${detail}`, "error");
      alert(`Gagal menghapus Brew Log. Detail: ${detail}`);
    }
  }

  async function saveStock(e) {
    e?.preventDefault?.();
    const form = $("stockForm");
    const submitBtn = $("stockSubmitBtn");
    const originalText = submitBtn?.textContent || (editingStockId ? "Simpan Perubahan Stok" : "Simpan Stok Pribadi");

    if (stockSaving) return;
    if (form?.reportValidity && !form.reportValidity()) return;

    if (!canUseWorkspaceModules()) {
      showMessage(privateModuleMessage("Stok Kopi"), "error");
      showTab("admin");
      return;
    }

    const bean = {
      BeanID: nextId("B", allStock(), "BeanID"),
      CoffeeName: $("stockName").value.trim(),
      Origin: $("stockOrigin").value.trim(),
      Producer: $("stockProducer").value.trim(),
      Variety: $("stockVariety1").value,
      Variety2_optional: $("stockVariety2").value,
      Process: $("stockProcess").value,
      RoastProfile: $("stockRoast").value,
      FlavorFamily: $("stockFlavor1").value,
      FlavorFamily2_optional: $("stockFlavor2").value,
      FlavorFamily3_optional: $("stockFlavor3").value,
      Notes: $("stockNotes").value.trim(),
      Sweetness: Number($("stockSweet").value),
      Acidity: Number($("stockAcid").value),
      Body: Number($("stockBody").value),
      Stock_g: Number($("stockQty").value),
      BestBrew: $("stockBestBrew").value,
      Price: Number($("stockPrice").value),
      RoastDate: $("stockRoastDate").value,
      Active: $("stockActive").value
    };

    stockSaving = true;
    let watchdog;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Menyimpan...";
    }
    watchdog = createButtonWatchdog({ key: "stock", button: submitBtn, originalText, label: "Simpan stok kopi" });
    showMessage("Menyimpan stok kopi ke workspace...", "info");

    try {
      let saved;
      if (editingStockId) {
        if (!canAdmin()) throw new Error("Edit stok hanya tersedia untuk Admin Workspace.");
        const current = allStock().find(item => String(item.CloudID || item.BeanID) === String(editingStockId));
        if (!current?.CloudID) throw new Error("Data stok yang diedit tidak ditemukan di Supabase.");
        const payload = toSnakeStock({ ...bean, BeanID: current.BeanID });
        delete payload.created_by;
        delete payload.source_client_id;
        await prepareCloudWrite("Update stok kopi");
        const { data, error } = await withTimeout(
          supabaseClient
            .from("stock_beans")
            .update(payload)
            .eq("id", current.CloudID)
            .eq("workspace_id", currentWorkspace.id)
            .select("*")
            .single(),
          CLOUD_WRITE_TIMEOUT_MS,
          "Update stok kopi"
        );
        if (error || !data) throw error || new Error("Data stok tidak berhasil diperbarui.");
        saved = fromSnakeStock(data);
        state.cloudStock = uniqueByCloudId([saved, ...(state.cloudStock || []).filter(item => item.CloudID !== saved.CloudID)]);
      } else {
        saved = await insertCloud("stock_beans", toSnakeStock(bean), fromSnakeStock);
        state.cloudStock = uniqueByCloudId([saved, ...(state.cloudStock || [])]);
      }
      renderStockTable();
      renderBeansTable();
      renderMetrics();

      const savedId = saved.CloudID;
      const previousStock = state.cloudStock || [];
      const syncError = await syncFromCloud(false).then(() => null).catch(err => err);
      if (syncError) console.warn("Stock refresh failed after save", syncError);
      if (savedId && !(state.cloudStock || []).some(item => item.CloudID === savedId)) {
        state.cloudStock = uniqueByCloudId([saved, ...previousStock, ...(state.cloudStock || [])]);
      }

      renderStockTable();
      renderBeansTable();
      renderMetrics();
      const wasEditing = Boolean(editingStockId);
      resetStockForm();
      showMessage(wasEditing ? "Perubahan stok kopi berhasil disimpan." : "Stok kopi berhasil masuk ke tabel workspace.", "success");
    } catch (err) {
      console.error("Stock save failed", err);
      showMessage(`Gagal menyimpan stok ke Supabase: ${err.message || err}`, "error");
      alert(`Gagal menyimpan stok ke Supabase. Data belum tersimpan. Detail: ${err.message || err}`);
    } finally {
      if (watchdog) clearTimeout(watchdog);
      stockSaving = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingStockId ? "Simpan Perubahan Stok" : "Simpan Stok Pribadi";
      }
    }
  }

  function moderationTitle(row, dataset) {
    if (dataset === "stock_beans") return row.coffee_name || "Untitled bean";
    if (dataset === "brew_logs") return row.bean_name || row.brew_code || "Untitled brew";
    if (dataset === "qa_scores") return `${row.qa_code || "QA"} · ${row.brew_code || "brew"}`;
    return row.id;
  }

  function moderationSubtitle(row, dataset) {
    if (dataset === "stock_beans") return [row.variety, row.variety2_optional, row.process, row.roast_profile].filter(Boolean).join(" · ");
    if (dataset === "brew_logs") return [row.variety, row.process, row.roast_profile, row.method, row.dripper].filter(Boolean).join(" · ");
    if (dataset === "qa_scores") return [`Nilai QA Akhir ${row.final_qa ?? "-"}`, row.evaluator].filter(Boolean).join(" · ");
    return "";
  }

  async function loadModerationRows() {
    const table = $("moderationDataset")?.value || "brew_logs";
    const status = $("moderationStatus")?.value || "pending";
    if (!supabaseClient || !currentUser || !currentWorkspace) {
      moderationRows = [];
      renderModerationTable();
      return;
    }
    if (!canModerate()) {
      moderationRows = [];
      renderModerationTable("Peran aktif tidak punya akses moderasi. Gunakan peran QA atau Admin.");
      return;
    }
    let q = supabaseClient.from(table).select("*").eq("workspace_id", currentWorkspace.id).order("created_at", { ascending: false }).limit(300);
    if (status !== "all") q = q.eq("moderation_status", status);
    const { data, error } = await q;
    if (error) {
      renderModerationTable(`Gagal membaca data moderation: ${error.message}`);
      return;
    }
    moderationRows = data || [];
    renderModerationTable();
  }

  function renderModerationTable(message = "") {
    const table = $("moderationTable");
    if (!table) return;
    const dataset = $("moderationDataset")?.value || "brew_logs";
    table.querySelector("thead").innerHTML = `<tr><th>Status</th><th>Data</th><th>Pembuat</th><th>Dibuat</th><th>QA</th><th>Catatan</th><th>Aksi</th></tr>`;
    const tbody = table.querySelector("tbody");
    if (message) {
      tbody.innerHTML = emptyRow(7, "Informasi moderasi", message, "ⓘ");
      return;
    }
    if (!moderationRows.length) {
      tbody.innerHTML = emptyRow(7, "Tidak ada data untuk filter ini", "Coba ubah status, dataset, atau refresh data workspace.", "◇");
      return;
    }
    tbody.innerHTML = moderationRows.map(row => {
      const status = row.moderation_status || row.status || "pending";
      return `<tr>
        <td><span class="status-pill ${html(status)}">${html(statusLabel(status))}</span></td>
        <td><strong>${html(moderationTitle(row, dataset))}</strong><br><small>${html(moderationSubtitle(row, dataset))}</small></td>
        <td><small>${html(row.created_by || row.source_client_id || "-")}</small></td>
        <td>${html((row.created_at || "").slice(0, 10))}</td>
        <td>${html(row.qa_final ?? row.final_qa ?? "-")}</td>
        <td>${html(row.moderation_notes || row.result_notes || row.qa_notes || row.notes || "-")}</td>
        <td><div class="moderation-actions">
          <button class="secondary" data-mod-action="approve" data-id="${html(row.id)}">Setujui</button>
          <button class="danger" data-mod-action="reject" data-id="${html(row.id)}">Tolak</button>
          ${canModerate() ? `<button class="danger" data-mod-action="delete" data-id="${html(row.id)}">Hapus</button>` : ""}
        </div></td>
      </tr>`;
    }).join("");
  }

  async function deleteModerationRow(id) {
    const table = $("moderationDataset")?.value || "brew_logs";
    if (!supabaseClient || !canModerate()) return showMessage("Hapus data hanya untuk QA/Admin workspace.", "error");
    const row = moderationRows.find(r => r.id === id);
    if (!row) return showMessage("Row tidak ditemukan di tabel moderasi saat ini.", "error");
    if (!confirm("Hapus data ini permanen dari Supabase?")) return;

    try {
      await prepareCloudWrite("Hapus data moderasi");
      if (table === "brew_logs" && row.brew_code) {
        await withTimeout(
          supabaseClient.from("qa_scores").delete().eq("workspace_id", currentWorkspace.id).eq("brew_code", row.brew_code),
          CLOUD_WRITE_TIMEOUT_MS,
          "Hapus QA terkait"
        );
      }
      const { data, error } = await withTimeout(
        supabaseClient
          .from(table)
          .delete()
          .eq("id", id)
          .eq("workspace_id", currentWorkspace.id)
          .select("id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Hapus data moderasi"
      );
      if (error || !data) throw error || new Error("Data tidak terhapus. Kemungkinan policy RLS belum mengizinkan delete untuk QA/Admin workspace.");
      state.cloudBrewLogs = state.cloudBrewLogs.filter(item => item.CloudID !== id);
      state.cloudQA = state.cloudQA.filter(item => item.CloudID !== id);
      state.cloudStock = state.cloudStock.filter(item => item.CloudID !== id);
      await syncFromCloud(true).catch(console.warn);
      await loadModerationRows();
      showMessage("Data berhasil dihapus permanen dari Supabase.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal menghapus data: ${err.message || err}`, "error");
    }
  }

  async function moderateRow(id, action) {
    const table = $("moderationDataset")?.value || "brew_logs";
    if (!supabaseClient || !canModerate()) return showMessage("Butuh role QA/Admin.", "error");
    if (action === "delete") return deleteModerationRow(id);
    if (action === "edit") return showMessage("Edit JSON dinonaktifkan dari UI agar data produksi lebih aman.", "info");

    const row = moderationRows.find(r => r.id === id);
    const notes = action === "reject" ? prompt("Alasan reject / catatan perbaikan:", "Data perlu dicek ulang.") : "Disetujui oleh moderator";
    const payload = {
      moderation_status: action === "approve" ? "approved" : "rejected",
      moderation_notes: notes || null,
      moderated_by: currentUser.id,
      moderated_at: new Date().toISOString()
    };
    if (table === "brew_logs") {
      payload.status = action === "approve" ? "published" : "rejected";
      if (action === "approve" && Number(row?.qa_final || 0) >= APPROVAL_THRESHOLD) {
        payload.manual_approval = "Yes";
        payload.approved_for_recipe = "Yes";
        payload.qa_status = "QA PASS";
      }
      if (action === "reject") {
        payload.manual_approval = "No";
        payload.approved_for_recipe = "No";
      }
    }
    if (table === "qa_scores") {
      payload.status = action === "approve" ? (Number(row?.final_qa || 0) >= APPROVAL_THRESHOLD ? "QA PASS" : "APPROVED") : "REJECTED";
    }

    try {
      await prepareCloudWrite("Update moderasi");
      const { data, error } = await withTimeout(
        supabaseClient
          .from(table)
          .update(payload)
          .eq("id", id)
          .eq("workspace_id", currentWorkspace.id)
          .select("id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Update moderasi"
      );
      if (error || !data) throw error || new Error("Tidak ada row yang berubah. Cek RLS policy dan role workspace.");
      await syncFromCloud(true).catch(console.warn);
      await loadModerationRows();
      showMessage(action === "approve" ? "Data disetujui. Jika QA memenuhi threshold, data akan tampil publik." : "Data ditolak.", action === "approve" ? "success" : "info");
    } catch (err) {
      console.error(err);
      showMessage(`Moderation gagal: ${err.message || err}`, "error");
    }
  }

  async function editModerationJson(id) {
    const table = $("moderationDataset")?.value || "brew_logs";
    if (!supabaseClient || !canModerate()) return showMessage("Butuh role QA/Admin.");
    const row = moderationRows.find(r => r.id === id);
    if (!row) return;
    const edited = prompt("Edit JSON row. Hati-hati: gunakan JSON valid.", JSON.stringify(row, null, 2));
    if (!edited) return;
    let payload;
    try { payload = JSON.parse(edited); } catch (err) { return showMessage("JSON tidak valid."); }
    ["id", "created_at", "updated_at"].forEach(k => delete payload[k]);
    payload.moderated_by = currentUser.id;
    payload.moderated_at = new Date().toISOString();
    await prepareCloudWrite("Edit data moderasi");
    const { error } = await withTimeout(supabaseClient.from(table).update(payload).eq("id", id), CLOUD_WRITE_TIMEOUT_MS, "Edit data moderasi");
    if (error) return showMessage(`Edit gagal: ${error.message}`);
    await syncFromCloud(true).catch(console.warn);
    await loadModerationRows();
    showMessage("Data berhasil diedit.");
  }

  async function loadMemberRequests() {
    if (!supabaseClient || !currentUser || !currentWorkspace || !canAdmin()) {
      pendingMemberRows = [];
      renderMemberRequests();
      return;
    }
    const { data, error } = await supabaseClient
      .from("workspace_members")
      .select("workspace_id,user_id,role,status,created_at")
      .eq("workspace_id", currentWorkspace.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) {
      pendingMemberRows = [];
      renderMemberRequests(`Gagal membaca request akses: ${error.message}`);
      return;
    }
    const userIds = (data || []).map(row => row.user_id).filter(Boolean);
    let profiles = [];
    if (userIds.length) {
      const profileRes = await supabaseClient.from("profiles").select("id,email,display_name").in("id", userIds);
      if (!profileRes.error) profiles = profileRes.data || [];
    }
    pendingMemberRows = (data || []).map(row => ({ ...row, profile: profiles.find(p => p.id === row.user_id) || {} }));
    renderMemberRequests();
  }

  function renderMemberRequests(message = "") {
    const table = $("memberRequestTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!canAdmin()) {
      tbody.innerHTML = emptyRow(5, "Panel khusus Admin Workspace", "Masuk dengan role admin untuk melihat request akses.", "🔒");
      return;
    }
    if (message) {
      tbody.innerHTML = emptyRow(5, "Informasi request akses", message, "ⓘ");
      return;
    }
    if (!pendingMemberRows.length) {
      tbody.innerHTML = emptyRow(5, "Tidak ada request pending", "Semua permintaan akses workspace sudah diproses.", "✓");
      return;
    }
    tbody.innerHTML = pendingMemberRows.map(row => {
      const display = row.profile?.display_name || row.profile?.email || row.user_id;
      return `<tr>
        <td><strong>${html(display)}</strong><br><small>${html(row.profile?.email || row.user_id)}</small></td>
        <td>${html(row.role)}</td>
        <td><span class="status-pill pending">Menunggu approval</span></td>
        <td>${html((row.created_at || "").slice(0, 10))}</td>
        <td><div class="moderation-actions"><button class="secondary" data-member-action="approve" data-user-id="${html(row.user_id)}">Setujui</button><button class="danger" data-member-action="reject" data-user-id="${html(row.user_id)}">Tolak</button></div></td>
      </tr>`;
    }).join("");
  }

  async function updateMemberRequest(userId, action) {
    if (!supabaseClient || !canAdmin() || !currentWorkspace) return showMessage("Butuh role Admin Workspace.", "error");
    const status = action === "approve" ? "active" : "rejected";
    await prepareCloudWrite("Update request akses");
    const { data, error } = await withTimeout(
      supabaseClient
        .from("workspace_members")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .select("workspace_id,user_id,status")
        .single(),
      CLOUD_WRITE_TIMEOUT_MS,
      "Update request akses"
    );
    if (error || !data) return showMessage(`Gagal memproses request: ${(error && error.message) || "row tidak ditemukan"}`, "error");
    await loadMemberRequests();
    await loadWorkspaceMembers();
    showMessage(action === "approve" ? "Request akses disetujui. User sekarang bisa mengakses workspace." : "Request akses ditolak.", action === "approve" ? "success" : "info");
  }

  async function loadWorkspaceMembers(message = "") {
    if (!supabaseClient || !currentUser || !currentWorkspace || !canAdmin()) {
      workspaceMemberRows = [];
      renderWorkspaceMembers();
      return;
    }
    const { data, error } = await supabaseClient
      .from("workspace_members")
      .select("workspace_id,user_id,role,status,created_at,updated_at")
      .eq("workspace_id", currentWorkspace.id)
      .in("status", ["active", "disabled"])
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      workspaceMemberRows = [];
      renderWorkspaceMembers(message || `Gagal membaca pengguna workspace: ${error.message}`);
      return;
    }
    const userIds = (data || []).map(row => row.user_id).filter(Boolean);
    let profiles = [];
    if (userIds.length) {
      const profileRes = await supabaseClient.from("profiles").select("id,email,display_name").in("id", userIds);
      if (!profileRes.error) profiles = profileRes.data || [];
    }
    workspaceMemberRows = (data || []).map(row => ({ ...row, profile: profiles.find(p => p.id === row.user_id) || {} }));
    renderWorkspaceMembers();
  }

  function renderWorkspaceMembers(message = "") {
    const table = $("workspaceUserTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!canAdmin()) {
      tbody.innerHTML = emptyRow(6, "Panel khusus Admin Workspace", "Masuk dengan role admin untuk mengelola pengguna workspace.", "🔒");
      return;
    }
    if (message) {
      tbody.innerHTML = emptyRow(6, "Informasi pengguna workspace", message, "ⓘ");
      return;
    }
    if (!workspaceMemberRows.length) {
      tbody.innerHTML = emptyRow(6, "Belum ada pengguna aktif", "Setujui request akses atau undang tim untuk mulai berkolaborasi.", "👥");
      return;
    }
    const activeAdminCount = workspaceMemberRows.filter(row => row.role === "admin" && row.status === "active").length;
    tbody.innerHTML = workspaceMemberRows.map(row => {
      const display = row.profile?.display_name || row.profile?.email || row.user_id;
      const email = row.profile?.email || row.user_id;
      const statusClass = row.status === "active" ? "approved" : row.status === "disabled" ? "disabled" : row.status === "rejected" ? "rejected" : "pending";
      const isSelf = row.user_id === currentUser?.id;
      const protectLastAdmin = row.role === "admin" && activeAdminCount <= 1;
      const disableDanger = isSelf || protectLastAdmin;
      let actions = `<span class="member-self-note">${isSelf ? "Akun admin aktif" : protectLastAdmin ? "Admin terakhir tidak bisa diubah" : "-"}</span>`;
      if (!disableDanger) {
        const firstAction = row.status === "disabled"
          ? `<button class="secondary" data-workspace-user-action="activate" data-user-id="${html(row.user_id)}">Aktifkan</button>`
          : `<button class="ghost" data-workspace-user-action="suspend" data-user-id="${html(row.user_id)}">Suspend</button>`;
        actions = `${firstAction}<button class="danger" data-workspace-user-action="delete" data-user-id="${html(row.user_id)}">Hapus</button>`;
      }
      return `<tr>
        <td><strong>${html(display)}</strong><br><small>${html(email)}</small></td>
        <td>${html(row.role)}</td>
        <td><span class="status-pill ${html(statusClass)}">${html(memberStatusLabel(row.status))}</span></td>
        <td>${html((row.created_at || "").slice(0, 10))}</td>
        <td>${html((row.updated_at || "").slice(0, 10))}</td>
        <td><div class="moderation-actions">${actions}</div></td>
      </tr>`;
    }).join("");
  }

  async function updateWorkspaceMember(userId, action) {
    if (!supabaseClient || !canAdmin() || !currentWorkspace) return showMessage("Butuh role Admin Workspace.", "error");
    const row = workspaceMemberRows.find(member => member.user_id === userId);
    if (!row) return showMessage("Data pengguna tidak ditemukan. Muat ulang tabel pengguna.", "error");
    if (userId === currentUser?.id) return showMessage("Admin tidak bisa mengubah akses akunnya sendiri dari panel ini.", "error");
    const activeAdminCount = workspaceMemberRows.filter(member => member.role === "admin" && member.status === "active").length;
    if (row.role === "admin" && activeAdminCount <= 1) return showMessage("Admin terakhir tidak bisa disuspend atau dihapus.", "error");

    if (action === "delete") {
      const label = row.profile?.display_name || row.profile?.email || row.user_id;
      if (!confirm(`Hapus akses ${label} dari workspace ${currentWorkspace.name}? Akun Supabase user tidak dihapus.`)) return;
      await prepareCloudWrite("Hapus akses user");
      const { data, error } = await withTimeout(
        supabaseClient
          .from("workspace_members")
          .delete()
          .eq("workspace_id", currentWorkspace.id)
          .eq("user_id", userId)
          .select("workspace_id,user_id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Hapus akses user"
      );
      if (error || !data) return showMessage(`Gagal menghapus akses: ${(error && error.message) || "row tidak ditemukan"}`, "error");
      await loadWorkspaceMembers();
      showMessage("Akses user ke workspace berhasil dihapus.", "success");
      return;
    }

    const status = action === "activate" ? "active" : "disabled";
    const verb = status === "active" ? "mengaktifkan kembali" : "menangguhkan akses";
    showMessage(`Sedang ${verb} user...`, "info");
    await prepareCloudWrite("Update akses user");
    const { data, error } = await withTimeout(
      supabaseClient
        .from("workspace_members")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", userId)
        .select("workspace_id,user_id,status")
        .single(),
      CLOUD_WRITE_TIMEOUT_MS,
      "Update akses user"
    );
    if (error || !data) return showMessage(`Gagal memperbarui akses: ${(error && error.message) || "row tidak ditemukan"}`, "error");
    await loadWorkspaceMembers();
    showMessage(status === "active" ? "Akses user diaktifkan kembali." : "Akses user disuspend sementara.", status === "active" ? "success" : "info");
  }

  async function submitSuggestion(e) {
    e.preventDefault();
    const suggestion = {
      id: `SG-${Date.now()}`,
      created_at: new Date().toISOString(),
      name: $("suggestionName")?.value.trim() || currentBrewerName(),
      email: $("suggestionEmail")?.value.trim() || currentUser?.email || "",
      category: $("suggestionCategory")?.value || "Lainnya",
      priority: $("suggestionPriority")?.value || "Normal",
      message: $("suggestionMessage")?.value.trim() || "",
      workspace_id: activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      created_by: currentUser?.id || null
    };
    if (!suggestion.message) return showMessage("Isi saran/masukan terlebih dahulu.", "error");
    try {
      if (supabaseClient) {
        if (currentUser) await prepareCloudWrite("Kirim saran");
        const { error } = await withTimeout(supabaseClient.from("suggestions").insert({
          name: suggestion.name,
          email: suggestion.email || null,
          category: suggestion.category,
          priority: suggestion.priority,
          message: suggestion.message,
          workspace_id: suggestion.workspace_id,
          created_by: suggestion.created_by,
          status: "open"
        }), CLOUD_WRITE_TIMEOUT_MS, "Kirim saran");
        if (error) throw error;
        e.target.reset();
        if (currentUser) {
          $("suggestionName").value = userProfile?.display_name || currentUser.email?.split("@")[0] || "";
          $("suggestionEmail").value = currentUser.email || "";
        }
        if (canAdmin()) loadSuggestionRows().catch(console.warn);
        return showMessage("Terima kasih. Saran berhasil dikirim.", "success");
      }
      throw new Error("Supabase belum aktif");
    } catch (err) {
      state.suggestions.unshift(suggestion);
      persist();
      e.target.reset();
      showMessage("Terima kasih. Saran tersimpan lokal karena tabel Supabase belum tersedia/aktif.", "info");
    }
  }

  async function loadSuggestionRows(message = "") {
    if (!supabaseClient || !currentUser || !canAdmin()) {
      suggestionRows = [];
      renderSuggestionInbox();
      return;
    }

    const workspaceId = activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID;
    let query = supabaseClient
      .from("suggestions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (workspaceId) query = query.or(`workspace_id.eq.${workspaceId},workspace_id.eq.${DEFAULT_PUBLIC_WORKSPACE_ID}`);

    const { data, error } = await withTimeout(query, CLOUD_READ_TIMEOUT_MS, "Muat masukan");
    if (error) {
      suggestionRows = [];
      renderSuggestionInbox(message || `Gagal membaca masukan: ${error.message}`);
      return;
    }
    suggestionRows = data || [];
    renderSuggestionInbox(message);
  }

  function renderSuggestionInbox(message = "") {
    const table = $("suggestionInboxTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    if (!canAdmin()) {
      tbody.innerHTML = emptyRow(6, "Panel khusus Admin Workspace", "Masuk sebagai admin untuk melihat masukan dari Kotak Saran.", "i");
      return;
    }
    if (message) {
      tbody.innerHTML = emptyRow(6, "Informasi masukan", message, "i");
      return;
    }

    const localRows = (state.suggestions || []).map(row => ({ ...row, source: "local" }));
    const rows = [...(suggestionRows || []).map(row => ({ ...row, source: "supabase" })), ...localRows];
    if (!rows.length) {
      tbody.innerHTML = emptyRow(6, "Belum ada masukan", "Data dari Kotak Saran akan muncul di sini dan di tabel Supabase suggestions.", "i");
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const isCloud = row.source === "supabase";
      const status = row.status || (isCloud ? "open" : "local");
      const sender = [row.name, row.email].filter(Boolean).join(" / ") || "-";
      const actions = isCloud
        ? `<div class="moderation-actions"><button class="secondary" data-suggestion-action="reviewed" data-id="${html(row.id)}">Review</button><button class="danger" data-suggestion-action="closed" data-id="${html(row.id)}">Tutup</button></div>`
        : `<small class="member-self-note">Tersimpan lokal browser ini</small>`;
      return `<tr>
        <td><span class="status-pill ${html(status)}">${html(status)}</span></td>
        <td>${html(row.category || "-")}<br><small>${html(row.priority || "Normal")}</small></td>
        <td><strong>${html(row.message || "-")}</strong></td>
        <td><small>${html(sender)}</small></td>
        <td>${html((row.created_at || "").slice(0, 10))}</td>
        <td>${actions}</td>
      </tr>`;
    }).join("");
  }

  async function updateSuggestionStatus(id, status) {
    if (!supabaseClient || !canAdmin()) return showMessage("Butuh role Admin Workspace untuk mengubah status masukan.", "error");
    try {
      await prepareCloudWrite("Update status masukan");
      const { data, error } = await withTimeout(
        supabaseClient
          .from("suggestions")
          .update({ status })
          .eq("id", id)
          .select("id")
          .single(),
        CLOUD_WRITE_TIMEOUT_MS,
        "Update status masukan"
      );
      if (error || !data) throw error || new Error("Masukan tidak ditemukan atau tidak bisa diubah.");
      await loadSuggestionRows();
      showMessage(status === "closed" ? "Masukan ditutup." : "Masukan ditandai sudah direview.", "success");
    } catch (err) {
      console.error("update suggestion failed", err);
      showMessage(`Gagal mengubah status masukan: ${err.message || err}`, "error");
    }
  }

  function publicBrewRows() {
    const search = norm($("publicBrewSearch")?.value || "");
    const method = $("publicBrewMethod")?.value || "all";
    const minQA = Number($("publicBrewMinQA")?.value || 0);
    const filteredRows = (state.cloudBrewLogs || [])
      .filter(log => log.Source === "Supabase")
      .filter(log => norm(log.ModerationStatus) === "approved")
      .filter(log => norm(log.Visibility || "public") === "public")
      .filter(log => isApprovedRecipeLog(log))
      .filter(log => method === "all" || norm(log.Method) === norm(method))
      .filter(log => !minQA || Number(log.QA_Final || 0) >= minQA)
      .filter(log => {
        if (!search) return true;
        return [log.BeanName, log.BrewerName, log.Variety, log.Process, log.RoastProfile, log.Method, log.Dripper, log.ResultNotes, log.PrimaryVariableChanged]
          .some(v => norm(v).includes(search));
      });
    return sortBrewNewest(filteredRows);
  }

  function publicBrewKey(log) {
    return String(log.CloudID || log.BrewID || "");
  }

  function findPublicBrewLog(key) {
    return publicBrewRows().find(log => publicBrewKey(log) === String(key))
      || (state.cloudBrewLogs || []).find(log => publicBrewKey(log) === String(key));
  }

  function detailLine(label, value) {
    const text = value === 0 ? "0" : (value || "-");
    return `<div class="detail-line"><span>${html(label)}</span><strong>${html(text)}</strong></div>`;
  }

  function publicBrewDetailHtml(log) {
    const profile = [log.Variety, log.Process, log.RoastProfile].filter(Boolean).join(" · ") || "-";
    const grinderRecipe = [log.Grinder, log.GrindSetting].filter(Boolean).join(" · ") || "-";
    const stepSummary = formatPublicRecipeSteps(log);
    const waterInfo = [
      log.TotalWater_ml ? `Total ${log.TotalWater_ml} ml` : "",
      log.HotWater_ml ? `Air panas ${log.HotWater_ml} ml` : "",
      Number(log.Ice_g) ? `Es ${log.Ice_g} g` : ""
    ].filter(Boolean).join(" · ") || "-";
    return `
      <div class="modal-header-block">
        <span class="edit-kicker">Detail Seduhan Publik</span>
        <h3 id="publicBrewModalTitle">${html(log.BeanName || "Tanpa nama")}</h3>
        <p>${html(log.BrewerName || "Brewer")} · ${html(log.Method || "-")} · QA ${html(log.QA_Final || "-")}</p>
        ${isPublicBrewOwner(log) ? `<button class="secondary small-action public-brew-edit-modal" type="button" data-public-brew-edit="${html(publicBrewKey(log))}">Edit Hasil Seduhan</button>` : ""}
      </div>
      <div class="public-detail-grid">
        <section>
          <h4>Identitas Kopi</h4>
          ${detailLine("Tanggal", log.Date)}
          ${detailLine("Kopi", log.BeanName || "Tanpa nama")}
          ${detailLine("Asal", log.Origin)}
          ${detailLine("Profil", profile)}
          ${detailLine("Brewer", log.BrewerName || "Brewer")}
        </section>
        <section>
          <h4>Parameter Seduh</h4>
          ${detailLine("Metode", log.Method)}
          ${detailLine("Dripper", log.Dripper)}
          ${detailLine("Grinder", log.Grinder)}
          ${detailLine("Gilingan", log.GrindSetting)}
          ${detailLine("Suhu", log.Temp_C ? `${log.Temp_C}°C` : "-")}
          ${detailLine("Rasio", log.Ratio ? `1:${log.Ratio}` : "-")}
          ${detailLine("Dose", log.Dose_g ? `${log.Dose_g} g` : "-")}
          ${detailLine("Air", waterInfo)}
          ${detailLine("Brew Time", log.BrewTime_sec ? fmtTime(log.BrewTime_sec) : "-")}
        </section>
        <section class="detail-section-wide">
          <h4>Recipe / Tahapan Seduh</h4>
          <p class="detail-text">${html(stepSummary || "Detail tahapan belum tersedia")}</p>
        </section>
        <section class="detail-section-wide">
          <h4>Evaluasi</h4>
          ${detailLine("QA", log.QA_Final || "-")}
          ${detailLine("Variabel", log.PrimaryVariableChanged || "Tidak ada perubahan variabel")}
          ${detailLine("Hipotesis", log.Hypothesis || "-")}
          <p class="detail-text"><strong>Catatan Hasil</strong><br>${html(log.ResultNotes || "-")}</p>
        </section>
      </div>`;
  }

  function openPublicBrewDetail(key) {
    const modal = $("publicBrewModal");
    const body = $("publicBrewModalBody");
    if (!modal || !body) return;
    const log = findPublicBrewLog(key);
    if (!log) return showMessage("Detail seduhan tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    body.innerHTML = publicBrewDetailHtml(log);
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    $("publicBrewModalClose")?.focus();
  }

  function closePublicBrewDetail() {
    $("publicBrewModal")?.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  function renderPublicBrewTable() {
    const table = $("publicBrewTable");
    if (!table) return;
    const rows = publicBrewRows();
    const tbody = table.querySelector("tbody");
    if (!rows.length) {
      tbody.innerHTML = emptyRow(5, "Belum ada hasil seduhan publik", "Brew log akan tampil di sini setelah QA ≥ 6.5 dan disetujui.", "◎");
      return;
    }
    tbody.innerHTML = rows.map(log => {
      const key = html(publicBrewKey(log));
      return `<tr>
        <td><strong>${html(log.BeanName || "Tanpa nama")}</strong></td>
        <td>${html(log.BrewerName || "Brewer")}</td>
        <td>${html(log.Method || "-")}</td>
        <td><span class="score-pill">${html(log.QA_Final || "-")}</span></td>
        <td><div class="public-brew-actions"><button class="secondary small-action" type="button" data-public-brew-detail="${key}">Detail</button>${isPublicBrewOwner(log) ? `<button class="ghost small-action" type="button" data-public-brew-edit="${key}">Edit</button>` : ""}</div></td>
      </tr>`;
    }).join("");
  }

  function roastColorFromAgtron(value) {
    const text = String(value || "");
    const nums = text.match(/\d+/g)?.map(Number) || [];
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 65;
    const lightness = clamp(18 + avg * 0.45, 22, 62);
    return `hsl(28 44% ${lightness}%)`;
  }

  function roastVisual(row) {
    const color = roastColorFromAgtron(row.AgtronApprox);
    return `<div class="roast-visual" aria-label="${html(row.RoastProfile || "Roast")}">${Array.from({ length: 6 }).map(() => `<span style="background:${color}"></span>`).join("")}</div>`;
  }

  function renderLibrary() {
    const dataset = $("libraryDataset").value;
    const search = norm($("librarySearch").value);
    const rows = (DATA[dataset] || []).filter(row => !search || Object.values(row).some(v => norm(v).includes(search)));
    const columnsByDataset = {
      varieties: ["Variety", "Species", "Genetic_Market_Group", "Typical_Regions", "Acidity_Base", "Sweetness_Base", "Body_Base", "Notes"],
      drippers: ["DripperName", "Brand", "Material", "BrewFamily", "Geometry", "FlowSpeed_1slow_5fast", "HeatRetention_1low_5high", "RecommendedFor"],
      processes: ["Process", "Category", "Stage", "FermentRisk_1low_5high", "TempMod_C", "GrindMod_coarser", "RatioMod_ml_per_g", "BrewingCue"],
      roasts: ["RoastVisual", "RoastProfile", "Level", "AgtronApprox", "EndTempC", "DTR", "Solubility", "BestUse", "Notes"],
      waters: ["Water", "Type", "TDS_ppm", "pH", "MineralProfile", "BrewImpact", "RecommendedUse"],
      grinders: ["Grinder", "Type", "Unit", "V60_Min", "V60_Max", "Japanese_Min", "Japanese_Max", "Immersion_Min", "Immersion_Max", "Notes"]
    };
    const labelMap = {
      Variety: "Nama Varietas", Species: "Spesies", Genetic_Market_Group: "Kelompok Genetik", Typical_Regions: "Wilayah Umum", Acidity_Base: "Acidity", Sweetness_Base: "Sweetness", Body_Base: "Body", Notes: "Catatan",
      DripperName: "Nama Dripper", Brand: "Brand", Material: "Material", BrewFamily: "Keluarga Seduh", Geometry: "Geometri", FlowSpeed_1slow_5fast: "Kecepatan Flow", HeatRetention_1low_5high: "Retensi Panas", RecommendedFor: "Direkomendasikan Untuk",
      Process: "Pasca Panen", Category: "Kategori", Stage: "Tahap Proses", FermentRisk_1low_5high: "Risiko Fermentasi", TempMod_C: "Koreksi Suhu", GrindMod_coarser: "Koreksi Gilingan", RatioMod_ml_per_g: "Koreksi Rasio", BrewingCue: "Arahan Seduh",
      RoastVisual: "Warna Biji", RoastProfile: "Roast Profile", Level: "Level", AgtronApprox: "Agtron", EndTempC: "Suhu Akhir", DTR: "Development Ratio", Solubility: "Solubility", BestUse: "Penggunaan Terbaik",
      Water: "Nama Air", Type: "Jenis", TDS_ppm: "TDS", pH: "pH", MineralProfile: "Profil Mineral", BrewImpact: "Dampak Rasa", RecommendedUse: "Saran Pakai",
      Grinder: "Nama Grinder", Unit: "Satuan Setting", V60_Min: "V60 Min", V60_Max: "V60 Max", Japanese_Min: "Japanese Min", Japanese_Max: "Japanese Max", Immersion_Min: "Immersion Min", Immersion_Max: "Immersion Max"
    };
    const cols = columnsByDataset[dataset] || Object.keys(rows[0] || {}).slice(0, 8);
    const table = $("libraryTable");
    table.querySelector("thead").innerHTML = `<tr>${cols.map(c => `<th>${html(labelMap[c] || c)}</th>`).join("")}</tr>`;
    table.querySelector("tbody").innerHTML = rows.length
      ? rows.slice(0, 200).map(row => `<tr>${cols.map(c => `<td>${c === "RoastVisual" ? roastVisual(row) : html(row[c])}</td>`).join("")}</tr>`).join("")
      : emptyRow(cols.length || 1, "Data tidak ditemukan", "Coba kata kunci lain atau pilih dataset berbeda.", "⌕");
  }


  function exportJson() {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coffee-dashboard-export-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state.userStock = Array.isArray(data.userStock) ? data.userStock : state.userStock;
        state.userBrewLogs = Array.isArray(data.userBrewLogs) ? data.userBrewLogs : state.userBrewLogs;
        state.userQA = Array.isArray(data.userQA) ? data.userQA : state.userQA;
        persist();
        renderAll();
        alert("Import berhasil ke penyimpanan lokal. Untuk memasukkan data ke database publik, unggah ulang data penting lewat aplikasi atau import langsung melalui Supabase.");
      } catch (err) {
        alert("File JSON tidak valid.");
      }
    };
    reader.readAsText(file);
  }

  function syncMobileTabSelect(name) {
    const select = $("mobileTabSelect");
    if (select && select.value !== name) select.value = name;
  }

  function showTab(name) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${name}`));
    syncMobileTabSelect(name);
    if (window.matchMedia?.("(max-width: 760px)").matches) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }


  function renderSignupRoleUI() {
    const role = $("signupRole")?.value || "admin";
    const needWorkspace = ["brewer", "qa"].includes(role);
    setElementHidden($("signupWorkspaceWrap"), !needWorkspace);
    setElementHidden($("signupApprovalHint"), !needWorkspace);
  }

  function renderWorkspacePanelAccess() {
    const workspacePanel = $("workspacePanel");
    const createArea = $("workspaceCreateArea");
    const memberArea = $("workspaceMemberArea");
    if (!workspacePanel) return;
    const loggedIn = Boolean(currentUser);
    const requestedRole = norm(currentUser?.user_metadata?.requested_role || "admin");
    const hasPendingMembership = (userMemberships || []).some(ws => ws.membershipStatus === "pending");
    const canCreateWorkspace = loggedIn && (currentRole === "admin" || (!currentWorkspace && !hasPendingMembership && requestedRole === "admin"));
    const showForUser = loggedIn && (currentRole === "admin" || canCreateWorkspace);
    setElementHidden(workspacePanel, !showForUser);
    setElementHidden(createArea, !canCreateWorkspace);
    setElementHidden(memberArea, true);
  }

  function renderAccessUI() {
    const privateReady = canUseWorkspaceModules();
    setElementHidden($("saveCurrentBrew"), !privateReady);
    setElementHidden($("applyBeanToBrew"), !privateReady);
    setElementHidden(document.querySelector('[data-tab="beans"]'), !privateReady);
    const mobileBeansOption = document.querySelector('#mobileTabSelect option[value="beans"]');
    if (mobileBeansOption) {
      mobileBeansOption.hidden = !privateReady;
      mobileBeansOption.disabled = !privateReady;
    }
    setElementHidden($("brewLogHistoryPanel"), !privateReady);
    setElementHidden($("qaParentWrap"), !currentUser);
    setElementHidden($("qaVariableWrap"), !currentUser);
    renderWorkspacePanelAccess();
    setElementHidden($("memberApprovalPanel"), !canAdmin());
    setElementHidden($("workspaceUserPanel"), !canAdmin());
    setElementHidden($("suggestionInboxPanel"), !canAdmin());
    setElementHidden($("adminPanel"), !canModerate());

    if (!privateReady && document.querySelector(".tab-btn.active")?.dataset.tab === "beans") {
      showTab("brew");
    }
    if (currentUser && currentRole !== "admin" && document.querySelector(".tab-btn.active")?.dataset.tab === "admin" && $("workspacePanel")?.hidden) {
      return;
    }
  }

  function draftBrewLogsForQA() {
    return allBrewLogs()
      .filter(log => !log.QA_Final)
      .filter(log => !log.QA_ID)
      .sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
  }

  function renderQABrewOptions() {
    const select = $("qaParent");
    if (!select) return;
    if (!currentUser) {
      select.innerHTML = "";
      select.disabled = true;
      return;
    }
    const drafts = draftBrewLogsForQA();
    select.innerHTML = drafts.length
      ? `<option value="">Pilih BrewID dari Data Seduhan</option>` + drafts.map(log => `<option value="${html(log.BrewID)}">${html(log.BrewID)} · ${html(log.BeanName || log.Variety || "Tanpa nama")} · ${html(log.Method || "-")}</option>`).join("")
      : `<option value="">Belum ada draft dari Data Seduhan</option>`;
    select.disabled = !drafts.length;
  }

  function selectedDraftLog() {
    const brewId = $("qaParent")?.value || "";
    return allBrewLogs().find(log => log.BrewID === brewId) || null;
  }

  function applySelectedDraftToQA() {
    const draft = selectedDraftLog();
    if (!draft) return;
    if ($("qaBeanName")) $("qaBeanName").value = draft.BeanName || draft.Variety || "";
  }

  function bindEvents() {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
    $("mobileTabSelect")?.addEventListener("change", e => showTab(e.target.value));
    document.addEventListener("click", e => {
      const saveBtn = e.target.closest?.("#saveCurrentBrew,[data-action='save-brew-draft']");
      if (saveBtn) {
        saveCurrentBrewDraft(e);
        return;
      }
      const applyBtn = e.target.closest?.("#applyBeanToBrew");
      if (applyBtn) {
        e.preventDefault();
        applyTopBeanToBrew();
        return;
      }
      const qaBtn = e.target.closest?.("#qaSubmitBtn");
      if (qaBtn) {
        saveQA(e);
        return;
      }
      const manualBtn = e.target.closest?.("#manualSubmitBtn");
      if (manualBtn) {
        saveManualBrew(e);
      }
    });
    const brewFieldIds = ["brewVariety", "brewProcess", "brewRoast", "brewDripper", "brewMode", "switchValveMode", "brewGrinder", "brewWater", "brewDose", "pourPattern"];
    brewFieldIds.forEach(id => $(id)?.addEventListener("change", renderBrew));
    $("brewDose")?.addEventListener("input", renderBrew);
    document.addEventListener("change", e => {
      if (brewFieldIds.includes(e.target?.id)) renderBrew();
      if (e.target?.id === "brewStockSelect") { syncBrewStockUI({ apply: true }); renderBrew(); }
      if (e.target?.id === "qaParent") applySelectedDraftToQA();
    });
    $("brewStockSelect")?.addEventListener("change", () => { syncBrewStockUI({ apply: true }); renderBrew(); });
    $("brewBeanName")?.addEventListener("input", () => syncBrewStockUI({ apply: false }));
    ["customGrinderName", "customGrinderSetting"].forEach(id => $(id)?.addEventListener("input", renderBrew));
    $("signupRole")?.addEventListener("change", renderSignupRoleUI);
    $("suggestionForm")?.addEventListener("submit", submitSuggestion);
    document.querySelectorAll("[data-jump-tab]").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.jumpTab)));
    document.querySelectorAll(".guide-role-btn").forEach(btn => btn.addEventListener("click", () => {
      const role = btn.dataset.guideRole;
      document.querySelectorAll(".guide-role-btn").forEach(item => item.classList.toggle("active", item === btn));
      document.querySelectorAll(".guide-role-panel").forEach(panel => panel.classList.toggle("hidden", panel.dataset.guidePanel !== role));
    }));
    ["targetSweet", "targetAcid", "targetBody", "filterFlavor1", "filterFlavor2", "filterFlavor3", "filterVariety1", "filterVariety2", "filterBrew", "minStock"].forEach(id => $(id).addEventListener("change", renderBeansTable));
    ["targetSweet", "targetAcid", "targetBody", "minStock"].forEach(id => $(id).addEventListener("input", renderBeansTable));
    $("saveCurrentBrew")?.addEventListener("click", saveCurrentBrewDraft);
    $("applyBeanToBrew")?.addEventListener("click", applyTopBeanToBrew);
    $("stockForm")?.addEventListener("submit", saveStock);
    $("stockSubmitBtn")?.addEventListener("click", saveStock);
    $("stockCancelEditBtn")?.addEventListener("click", resetStockForm);
    $("stockTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-stock-action]");
      if (!btn) return;
      if (btn.dataset.stockAction === "edit") return editStockBean(btn.dataset.stockId);
      if (btn.dataset.stockAction === "delete") return deleteStockBean(btn.dataset.stockId);
    });
    $("qaForm")?.addEventListener("submit", saveQA);
    $("qaSubmitBtn")?.addEventListener("click", saveQA);
    $("manualBrewForm")?.addEventListener("submit", saveManualBrew);
    $("manualSubmitBtn")?.addEventListener("click", saveManualBrew);
    ["manualDose", "manualRatio"].forEach(id => $(id)?.addEventListener("input", () => { if ($("manualTotalWater")) $("manualTotalWater").dataset.userEdited = "false"; renderManualBrewPreview(); }));
    $("manualTotalWater")?.addEventListener("input", e => { e.target.dataset.userEdited = "true"; renderManualBrewPreview(); });
    ["manualMode", "manualDripper", "manualSwitchValveMode", "manualIce", "manualBrewTime", "manualBloom", "manualPourPlan", "manualValveOpenTime"].forEach(id => {
      $(id)?.addEventListener("input", renderManualBrewPreview);
      $(id)?.addEventListener("change", renderManualBrewPreview);
    });
    document.querySelectorAll(".manual-pour-input, .manual-pour-valve-select, .manual-pour-note-input, .manual-qa-score, #manualDefect").forEach(el => el.addEventListener("input", renderManualBrewPreview));
    document.querySelectorAll(".manual-pour-input, .manual-pour-valve-select, .manual-pour-note-input, .manual-qa-score, #manualDefect").forEach(el => el.addEventListener("change", renderManualBrewPreview));
    $("brewLogTable")?.addEventListener("click", e => {
      const editBtn = e.target.closest("button[data-brew-edit]");
      if (editBtn) return openBrewLogEdit(editBtn.dataset.brewEdit);
      const deleteBtn = e.target.closest("button[data-brew-delete]");
      if (deleteBtn) return deleteBrewLog(deleteBtn.dataset.brewDelete);
    });
    $("brewLogEditForm")?.addEventListener("submit", saveBrewLogEdit);
    $("cancelBrewEdit")?.addEventListener("click", closeBrewLogEdit);
    document.querySelectorAll(".qa-score, #qaDefect, #qaApproval").forEach(el => el.addEventListener("input", renderQAPreview));
    document.querySelectorAll(".qa-score, #qaDefect, #qaApproval").forEach(el => el.addEventListener("change", renderQAPreview));
    $("qaParent")?.addEventListener("change", applySelectedDraftToQA);
    $("qaHasVariable")?.addEventListener("change", e => {
      const input = $("qaVariable");
      if (input) {
        input.disabled = !e.target.checked;
        if (!e.target.checked) input.value = "";
      }
    });
    $("libraryDataset").addEventListener("change", renderLibrary);
    $("librarySearch").addEventListener("input", renderLibrary);
    $("publicBrewSearch")?.addEventListener("input", renderPublicBrewTable);
    $("publicBrewMethod")?.addEventListener("change", renderPublicBrewTable);
    $("publicBrewMinQA")?.addEventListener("change", renderPublicBrewTable);
    $("publicBrewTable")?.addEventListener("click", e => {
      const editBtn = e.target.closest("button[data-public-brew-edit]");
      if (editBtn) return openPublicBrewEdit(editBtn.dataset.publicBrewEdit);
      const btn = e.target.closest("button[data-public-brew-detail]");
      if (!btn) return;
      openPublicBrewDetail(btn.dataset.publicBrewDetail);
    });
    $("publicBrewModalBody")?.addEventListener("click", e => {
      const editBtn = e.target.closest("button[data-public-brew-edit]");
      if (editBtn) openPublicBrewEdit(editBtn.dataset.publicBrewEdit);
    });
    $("manualCancelEditBtn")?.addEventListener("click", cancelManualBrewEdit);
    $("publicBrewModalClose")?.addEventListener("click", closePublicBrewDetail);
    $("publicBrewModal")?.addEventListener("click", e => {
      if (e.target.id === "publicBrewModal") closePublicBrewDetail();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !$("publicBrewModal")?.classList.contains("hidden")) closePublicBrewDetail();
    });
    $("refreshPublicBrews")?.addEventListener("click", async () => { await syncFromCloud(true).catch(err => alert(`Gagal memuat hasil seduhan publik: ${err.message || err}`)); });
    $("loginBtn")?.addEventListener("click", handleLogin);
    $("signupBtn")?.addEventListener("click", handleSignup);
    $("authJumpLink")?.addEventListener("click", () => {
      showTab("admin");
      setTimeout(() => {
        $("authEmail")?.focus();
        document.querySelector("#tab-admin")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    });
    $("logoutBtn")?.addEventListener("click", handleLogout);
    $("workspaceForm")?.addEventListener("submit", createWorkspace);
    $("joinWorkspaceBtn")?.addEventListener("click", joinWorkspace);
    $("activeWorkspaceSelect")?.addEventListener("change", e => setActiveWorkspace(e.target.value));
    $("adminWorkspaceSelect")?.addEventListener("change", e => setActiveWorkspace(e.target.value));
    $("moderationDataset")?.addEventListener("change", loadModerationRows);
    $("moderationStatus")?.addEventListener("change", loadModerationRows);
    $("refreshModeration")?.addEventListener("click", loadModerationRows);
    $("refreshMemberRequests")?.addEventListener("click", loadMemberRequests);
    $("refreshWorkspaceUsers")?.addEventListener("click", loadWorkspaceMembers);
    $("refreshSuggestions")?.addEventListener("click", loadSuggestionRows);
    $("moderationTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-mod-action]");
      if (!btn) return;
      moderateRow(btn.dataset.id, btn.dataset.modAction);
    });
    $("suggestionInboxTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-suggestion-action]");
      if (!btn) return;
      updateSuggestionStatus(btn.dataset.id, btn.dataset.suggestionAction);
    });
    $("memberRequestTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-member-action]");
      if (!btn) return;
      updateMemberRequest(btn.dataset.userId, btn.dataset.memberAction);
    });
    $("workspaceUserTable")?.addEventListener("click", async e => {
      const btn = e.target.closest("button[data-workspace-user-action]");
      if (!btn) return;
      const oldLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Memproses...";
      try {
        await updateWorkspaceMember(btn.dataset.userId, btn.dataset.workspaceUserAction);
      } catch (err) {
        console.error(err);
        showMessage(`Gagal memproses aksi pengguna: ${err.message || err}`, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = oldLabel;
      }
    });
    $("syncCloud")?.addEventListener("click", async () => {
      try {
        await syncFromCloud(true);
        alert("Sinkronisasi Supabase selesai.");
      } catch (err) {
        alert(`Sinkronisasi gagal: ${err.message || err}`);
      }
    });
    $("exportJson")?.addEventListener("click", exportJson);
    $("importJson")?.addEventListener("change", e => e.target.files[0] && importJson(e.target.files[0]));
    $("resetLocal")?.addEventListener("click", () => {
      if (confirm("Reset semua data lokal? Data bawaan dari dashboard Excel tetap ada.")) {
        localStorage.removeItem(STORAGE_KEY);
        state.userStock = [];
        state.userBrewLogs = [];
        state.userQA = [];
        persist();
        renderAll();
      }
    });
  }

  function renderAll() {
    renderMetrics();
    renderAccessUI();
    renderBrew();
    renderBeansTable();
    renderStockTable();
    renderQAPreview();
    renderManualBrewPreview();
    renderBrewLogTable();
    renderQABrewOptions();
    renderPublicBrewTable();
    renderLibrary();
    renderWorkspaceUI();
    if (canModerate()) loadModerationRows().catch(console.warn);
    else renderModerationTable?.();
    if (canAdmin()) {
      loadMemberRequests().catch(console.warn);
      loadWorkspaceMembers().catch(console.warn);
      loadSuggestionRows().catch(console.warn);
    } else {
      renderMemberRequests?.();
      renderWorkspaceMembers?.();
      renderSuggestionInbox?.();
    }
  }


  function initPremiumUIInteractions() {
    if (document.body?.dataset.premiumUiReady === "true") return;
    if (document.body) document.body.dataset.premiumUiReady = "true";

    const hero = document.querySelector(".hero");
    if (hero) {
      hero.addEventListener("pointermove", event => {
        const rect = hero.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
        const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
        hero.style.setProperty("--hero-mx", `${x.toFixed(1)}%`);
        hero.style.setProperty("--hero-my", `${y.toFixed(1)}%`);
        document.body.style.setProperty("--cursor-x", `${x.toFixed(1)}%`);
        document.body.style.setProperty("--cursor-y", `${Math.min(26, y).toFixed(1)}%`);
      });
    }

    const tableWraps = [...document.querySelectorAll(".table-wrap")];
    const updateTableScrollState = wrap => {
      const canScrollX = wrap.scrollWidth > wrap.clientWidth + 8;
      const isScrolled = wrap.scrollLeft > 8;
      wrap.classList.toggle("can-scroll-x", canScrollX);
      wrap.classList.toggle("is-scrolled", isScrolled);
    };

    tableWraps.forEach(wrap => {
      updateTableScrollState(wrap);
      wrap.addEventListener("scroll", () => updateTableScrollState(wrap), { passive: true });
    });

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(entries => entries.forEach(entry => updateTableScrollState(entry.target)));
      tableWraps.forEach(wrap => ro.observe(wrap));
    } else {
      window.addEventListener("resize", () => tableWraps.forEach(updateTableScrollState), { passive: true });
    }

    const revealTargets = [...document.querySelectorAll(".panel, .output-card, .recipe-card, .table-wrap, .hero-card, .auth-card")];
    revealTargets.forEach((el, index) => {
      el.classList.add("reveal-up");
      el.style.transitionDelay = `${Math.min(index * 22, 180)}ms`;
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
      revealTargets.forEach(el => observer.observe(el));
    } else {
      revealTargets.forEach(el => el.classList.add("is-visible"));
    }
  }


  window.COFFEE_APP_DEBUG = {
    getState: () => ({
      cloudReady,
      currentUser: currentUser?.email || null,
      currentWorkspace: currentWorkspace?.name || null,
      currentRole,
      stockCount: state.cloudStock?.length || 0,
      brewCount: state.cloudBrewLogs?.length || 0,
      qaCount: state.cloudQA?.length || 0
    }),
    saveDraft: saveCurrentBrewDraft,
    saveManualBrew,
    sync: () => syncFromCloud(true)
  };

  document.addEventListener("DOMContentLoaded", async () => {
    hydrateSelects();
    bindEvents();
    renderAll();
    initPremiumUIInteractions();
    await initCloud();
    renderAll();
  });
})();
