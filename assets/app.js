(function () {
  "use strict";

  const DATA = window.COFFEE_DATA || {};
  const STORAGE_KEY = "coffeeDashboardWebV1";
  const APPROVAL_THRESHOLD = 6.5;
  let stockSaving = false;
  let brewDraftSaving = false;
  let qaSaving = false;
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
  let dashboardUserCount = 0;
  const LAST_WORKSPACE_KEY = "coffeeDashboardActiveWorkspace";
  const DEFAULT_PUBLIC_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

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

  function withTimeout(promise, label = "request", ms = 60000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} belum memberi respons dari Supabase. Coba lagi beberapa saat atau refresh halaman.`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

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
    const { error } = await supabaseClient.from("workspace_members").insert({
      workspace_id: workspaceId,
      user_id: userId,
      role,
      status: "pending"
    });
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

  function withTimeout(request, arg2 = 60000, arg3 = "request") {
    const ms = typeof arg2 === "number" ? arg2 : 60000;
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

  function createButtonWatchdog({ key, button, originalText, label, ms = 70000 }) {
    return setTimeout(() => {
      if (key === "brew") brewDraftSaving = false;
      if (key === "qa") qaSaving = false;
      if (key === "stock") stockSaving = false;
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
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
      const { data, error } = await supabaseClient.from("workspaces").insert(payload).select().single();
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
    const { error } = await supabaseClient.from("workspace_members").insert({ workspace_id: workspaceId, user_id: currentUser.id, role: "brewer", status: "active" });
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
      status: moderationStatusForBrew(log),
      moderation_status: moderationStatusForBrew(log),
      workspace_id: log.WorkspaceID || activeWorkspaceId() || DEFAULT_PUBLIC_WORKSPACE_ID,
      created_by: log.CreatedBy || currentUser?.id || null,
      moderated_by: canModerate() ? currentUser?.id : null,
      moderated_at: canModerate() ? new Date().toISOString() : null,
      source_client_id: createClientId()
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
      visibility: "public",
      moderation_status: moderationStatusForQA(qa),
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
      WorkspaceID: row.workspace_id,
      CreatedBy: row.created_by,
      ModerationStatus: row.moderation_status || "approved",
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

  async function syncFromCloud(shouldRender = true) {
    if (!supabaseClient) throw new Error("Supabase belum aktif.");
    updateDbStatus("syncing", "Menyinkronkan data dari Supabase...", "Mengambil data privat workspace dan hasil seduhan publik terbaru.");

    const empty = { data: [], error: null };
    const workspaceId = activeWorkspaceId();

    const stockPromise = currentUser && workspaceId
      ? supabaseClient.from("stock_beans").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve(empty);

    const publicBrewPromise = supabaseClient.from("brew_logs").select("*").eq("visibility", "public").eq("moderation_status", "approved").order("created_at", { ascending: false }).limit(1000);

    const workspaceBrewPromise = currentUser && workspaceId
      ? supabaseClient.from("brew_logs").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000)
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
    state.cloudBrewLogs = uniqueByCloudId([...(publicBrewRes.data || []).map(fromSnakeBrew), ...(workspaceBrewRes.data || []).map(fromSnakeBrew)]);
    state.cloudQA = (workspaceQaRes.data || []).map(fromSnakeQA);
    await loadDashboardUserCount().catch(console.warn);
    cloudLastSync = new Date();
    cloudReady = true;
    updateDbStatus("online", "Supabase online", `Data workspace dan hasil seduhan publik tersinkron. Sinkron terakhir: ${cloudLastSync.toLocaleTimeString()}`);
    if (shouldRender) renderAll();
  }

  async function insertCloud(table, payload, mapper) {
    if (!cloudReady || !supabaseClient) throw new Error("Supabase belum siap.");
    const { data, error } = await withTimeout(supabaseClient.from(table).insert(payload).select().single(), `Simpan ${table}`);
    if (error) throw error;
    return mapper(data);
  }

  async function updateCloud(table, id, payload, mapper) {
    if (!cloudReady || !supabaseClient) throw new Error("Supabase belum siap.");
    const { data, error } = await withTimeout(supabaseClient.from(table).update(payload).eq("id", id).select().single(), `Update ${table}`);
    if (error) throw error;
    return mapper(data);
  }

  async function updateCloudNoReturn(table, id, payload, label = "Update data") {
    if (!cloudReady || !supabaseClient) throw new Error("Supabase belum siap.");
    const { error } = await withTimeout(supabaseClient.from(table).update(payload).eq("id", id), 60000, label);
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

    ["filterVariety1", "filterVariety2", "stockVariety1", "stockVariety2"].forEach(id => makeOptions($(id), varieties, { blank: id.includes("2") || id.startsWith("filter"), blankLabel: id.includes("2") ? "Opsional" : "Semua" }));
    ["stockProcess"].forEach(id => makeOptions($(id), processes));
    ["stockRoast"].forEach(id => makeOptions($(id), roasts));
    ["filterFlavor1", "filterFlavor2", "filterFlavor3", "stockFlavor1", "stockFlavor2", "stockFlavor3"].forEach(id => makeOptions($(id), flavors, { blank: id.includes("2") || id.includes("3"), blankLabel: "Opsional" }));

    if ($("filterFlavor1")) $("filterFlavor1").value = "Floral";
    if ($("filterFlavor2")) $("filterFlavor2").value = "";
    if ($("filterFlavor3")) $("filterFlavor3").value = "";
    if ($("stockFlavor1")) $("stockFlavor1").value = "Fruity";
  }

  function localDashboardUserCount() {
    const ids = new Set();
    [state.cloudBrewLogs, state.cloudQA, state.cloudStock, state.userBrewLogs, state.userQA, state.userStock].forEach(rows => {
      (rows || []).forEach(row => {
        if (row.CreatedBy) ids.add(`u:${row.CreatedBy}`);
        if (row.Evaluator && !row.CreatedBy) ids.add(`g:${norm(row.Evaluator)}`);
        if (row.BrewerName && !row.CreatedBy) ids.add(`g:${norm(row.BrewerName)}`);
      });
    });
    (userMemberships || []).forEach(ws => { if (ws.user_id) ids.add(`u:${ws.user_id}`); });
    return Math.max(dashboardUserCount || 0, ids.size || (currentUser ? 1 : 0));
  }

  async function loadDashboardUserCount() {
    if (!supabaseClient) {
      dashboardUserCount = localDashboardUserCount();
      return;
    }
    const { data, error } = await supabaseClient.rpc("get_dashboard_user_count");
    if (!error && Number.isFinite(Number(data))) dashboardUserCount = Number(data);
    else dashboardUserCount = localDashboardUserCount();
  }

  function renderMetrics() {
    const metrics = [
      [DATA.varieties?.length || 0, "Varietas"],
      [DATA.drippers?.length || 0, "Dripper"],
      [DATA.processes?.length || 0, "Proses"],
      [DATA.roasts?.length || 0, "Roast Profile"],
      [DATA.waters?.length || 0, "Water"],
      [localDashboardUserCount(), "Pengguna"]
    ];
    $("libraryMetrics").innerHTML = metrics.map(([n, label]) => `<div class="metric"><strong>${html(n)}</strong><span>${html(label)}</span></div>`).join("");
  }

  function resolveSwitchMode() {
    const dripper = $("brewDripper").value;
    const selected = $("switchValveMode").value;
    if (!isSwitch(dripper)) return "-";
    if (selected === "Auto") return $("brewMode").value === "Japanese Iced" ? "Hybrid" : "Hybrid";
    return selected;
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

    const acidity = clamp((Number(variety.Acidity_Base) || 3) + (Number(process.AcidityMod) || 0) + (Number(roast.AcidityMod) || 0), 1, 5);
    const sweetness = clamp((Number(variety.Sweetness_Base) || 3) + (Number(process.SweetnessMod) || 0), 1, 5);
    const body = clamp((Number(variety.Body_Base) || 3) + (Number(process.BodyMod) || 0) + (Number(roast.BodyMod) || 0), 1, 5);
    const risk = Number(process.FermentRisk_1low_5high) || 2;
    const flow = Number(dripper.FlowSpeed_1slow_5fast) || 3;
    const tds = Number(water.TDS_ppm) || 150;

    const isImmersion = switchMode === "Full Immersion" || $("pourPattern").value === "Immersion Full";
    const tempBase = mode === "Japanese Iced" ? 94 : isImmersion ? 91 : switchMode === "Hybrid" ? 92 : 93;
    const temp = round(clamp(tempBase + (Number(process.TempMod_C) || 0) + (Number(roast.TempMod_C) || 0) + (Number(water.TempMod_C) || 0), 86, 98));

    const ratioBase = mode === "Japanese Iced" ? 15 : isImmersion ? 15.5 : switchMode === "Hybrid" ? 16 : 16;
    const ratio = round(clamp(ratioBase + (Number(process.RatioMod_ml_per_g) || 0) + (Number(roast.RatioMod_ml_per_g) || 0), 14, 18), 1);
    const totalWater = Math.round(dose * ratio);
    const hotWater = mode === "Japanese Iced" ? Math.round(totalWater * 0.6) : totalWater;
    const ice = mode === "Japanese Iced" ? totalWater - hotWater : 0;

    const grindBase = mode === "Japanese Iced" ? 760 : isImmersion ? 850 : switchMode === "Hybrid" ? 720 : 690;
    const grindTarget = round(clamp(
      grindBase + (Number(process.GrindMod_coarser) || 0) * 30 + (Number(roast.GrindMod_coarser) || 0) * 40 + (3 - flow) * 20 + (tds < 30 ? -20 : tds > 250 ? 20 : 0),
      450, 1000
    ));
    const grinderSetting = getGrinderSetting($("brewGrinder").value, grindTarget, mode, isImmersion);
    const brewTime = round(clamp((mode === "Japanese Iced" ? 150 : isImmersion ? 220 : switchMode === "Hybrid" ? 190 : 180) + (Number(process.BrewTimeMod_sec) || 0) + (Number(roast.BrewTimeMod_sec) || 0) + (3 - acidity) * 15, 120, 330));

    const pourCount = resolvePourCount($("pourPattern").value, isImmersion, risk, body);
    const bloom = isImmersion ? 0 : Math.round(dose * 2.5);
    const steps = buildSteps({ dose, mode, switchMode, isImmersion, hotWater, ice, bloom, pourCount, brewTime, process, dripper });
    const pourSum = steps.reduce((sum, st) => sum + (Number(st.water) || 0), 0);

    return { variety, process, roast, dripper, water, dose, mode, switchMode, acidity, sweetness, body, risk, flow, tds, temp, ratio, totalWater, hotWater, ice, grindTarget, grinderSetting, brewTime, pourCount, bloom, steps, pourSum };
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

  function resolvePourCount(pattern, isImmersion, risk, body) {
    if (isImmersion) return 1;
    if (/2x/.test(pattern)) return 2;
    if (/3x/.test(pattern)) return 3;
    if (/4x/.test(pattern)) return 4;
    if (risk >= 4) return 3;
    if (body >= 4) return 4;
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
    const { mode, switchMode, isImmersion, hotWater, ice, bloom, pourCount, brewTime, process, dripper } = ctx;
    if (isImmersion) {
      const valveStart = isSwitch(dripper.DripperName) ? "CLOSED" : "N/A";
      return [
        { stage: "Full Pour", water: hotWater, time: "0:00 - 0:30", valve: valveStart, instruction: `${mode === "Japanese Iced" ? "Tuang hot water ke bed kopi di atas ice server." : "Tuang semua air panas."} Saturate semua grounds.` },
        { stage: "Steep", water: 0, time: `0:30 - ${fmtTime(brewTime)}`, valve: valveStart, instruction: "Steep; stir 1x ringan pada awal, jangan over-agitate." },
        { stage: "Release", water: 0, time: fmtTime(brewTime), valve: isSwitch(dripper.DripperName) ? "OPEN" : "N/A", instruction: "Open valve dan biarkan drawdown selesai." },
        ...(ice ? [{ stage: "Ice", water: ice, time: "Server", valve: "N/A", instruction: "Ice berada di server; swirl setelah drawdown selesai." }] : [])
      ];
    }

    const mainWater = Math.max(0, hotWater - bloom);
    const pours = splitWater(mainWater, pourCount);
    const steps = [];
    const switchActive = isSwitch(dripper.DripperName);
    const fullOpen = switchMode === "Full Open" || !switchActive;
    const hybrid = switchMode === "Hybrid" || switchMode === "Auto";

    steps.push({
      stage: "Bloom",
      water: bloom,
      time: "0:00 - 0:35",
      valve: switchActive ? (fullOpen ? "OPEN" : "CLOSED") : "N/A",
      instruction: `Bloom: tuang ${bloom}g, swirl ringan. ${process.BrewingCue || ""}`.trim()
    });
    pours.forEach((water, idx) => {
      const n = idx + 1;
      const start = 35 + idx * 30;
      const end = start + 30;
      let valve = "N/A";
      let instruction = "Center-to-spiral pulse; jaga bed rata.";
      if (switchActive) {
        if (fullOpen) {
          valve = "OPEN";
          instruction = "Valve OPEN dari awal; treat seperti cone V60.";
        } else if (hybrid) {
          valve = n === 1 ? "CLOSED → OPEN ±1:00" : "OPEN";
          instruction = n === 1 ? "Valve CLOSED saat Pour 1; OPEN setelah fase ini / ±1:00." : "Valve OPEN; pulse rendah agitasi, jaga flow stabil.";
        }
      } else if (n === 1) {
        instruction = "Center-to-spiral pulse; hindari wall-only pouring.";
      } else if (n === pours.length) {
        instruction = "Finishing pulse; swirl ringan jika bed tidak rata.";
      } else {
        instruction = "Pulse rendah agitasi; jaga flow stabil dan bed rata.";
      }
      steps.push({ stage: `Pour ${n}`, water, time: `${fmtTime(start)} - ${fmtTime(end)}`, valve, instruction });
    });
    if (ice) steps.push({ stage: "Ice", water: ice, time: "Server", valve: "N/A", instruction: "Ice berada di server; swirl setelah brew selesai agar homogen." });
    return steps;
  }

  function waterNote(brew) {
    if (brew.tds < 30) return "TDS rendah: cup bisa terasa tipis/acidic. Pertimbangkan blend mineral atau naikkan suhu ±1°C.";
    if (brew.tds > 250) return "TDS tinggi: body naik, acidity bisa mute/chalky. Pertimbangkan blend dengan air rendah mineral.";
    return "TDS mendekati target filter; lanjutkan dial-in berdasarkan drawdown dan QA taste.";
  }

  function renderBrew() {
    renderBrewStockOptions();
    syncBrewStockUI({ apply: true });
    const brew = computeBrew();
    const cards = [
      ["Suhu", `${brew.temp} °C`, "Target suhu air seduh"],
      ["Rasio", `1:${fmt(brew.ratio, 1)}`, "Dosis : total air"],
      ["Total Air", `${brew.totalWater} ml`, "Dosis × rasio"],
      ["Air Panas", `${brew.hotWater} ml`, brew.mode === "Japanese Iced" ? "60% dari total" : "Sama dengan total"],
      ["Es", brew.ice ? `${brew.ice} g` : "-", "Khusus Japanese iced"],
      ["Target Gilingan", `${brew.grindTarget} µm`, "Target relatif"],
      ["Setting Grinder", brew.grinderSetting, "Kalibrasi by drawdown/taste"],
      ["Brew Time", fmtTime(brew.brewTime), "Target selesai"],
      ["Profil Rasa", `Acidity ${brew.acidity}/5 | Sweetness ${brew.sweetness}/5 | Body ${brew.body}/5`, "Prediksi dari data"],
    ];
    $("brewOutputs").innerHTML = cards.map(([label, value, desc]) => `<div class="output-card"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(desc)}</small></div>`).join("");
    $("waterNote").textContent = waterNote(brew);
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

    const baseCard = `<article class="recipe-card base"><span class="badge">Opsi 1 · Rekomendasi Dasar</span><h3>Rekomendasi Dasar</h3><p><strong>${html($("brewDripper").value)}</strong> · ${html(brew.mode)} · ${html(brew.switchMode)}</p><p>${html(brew.grinderSetting)} · ${brew.temp}°C · 1:${fmt(brew.ratio, 1)}</p><p>Dosis ${fmt(brew.dose, 1)}g · Total ${brew.totalWater}ml · ${brew.pourCount} tuangan utama</p><p>Dasar: varietas × proses × profil sangrai × dripper × air.</p></article>`;
    const approvedCards = approved.map((log, idx) => `<article class="recipe-card"><span class="badge">Opsi ${idx + 2} · QA ${fmt(log.QA_Final, 2)}</span><h3>${html(log.BrewID)}</h3><p><strong>${html(log.Dripper)}</strong> · ${html(log.Method)} · ${html(log.SwitchValveMode || "N/A")}</p><p>${html(log.GrindSetting)} · ${html(log.Temp_C)}°C · 1:${html(log.Ratio)}</p><p>Dosis ${html(log.Dose_g)}g · Total ${html(log.TotalWater_ml)}ml · Air panas ${html(log.HotWater_ml)}ml${Number(log.Ice_g) ? ` · Es ${html(log.Ice_g)}g` : ""}</p><p>${html(log.PrimaryVariableChanged || "Resep terverifikasi dari brew log")}</p></article>`);
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
      tbody.innerHTML = `<tr><td colspan="10">Masuk dan pilih workspace untuk melihat rekomendasi biji kopi dari stok pribadimu.</td></tr>`;
      renderStockTable();
      return [];
    }
    const ranked = rankBeans();
    if (!ranked.length) {
      tbody.innerHTML = `<tr><td colspan="10">Belum ada stok kopi yang cocok dengan filter. Tambahkan stok di menu Stok Kopi.</td></tr>`;
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
      tbody.innerHTML = `<tr><td colspan="12">Masuk dan pilih workspace untuk melihat atau mengelola stok kopi.</td></tr>`;
      return;
    }
    const rows = allStock();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="12">Belum ada stok kopi di workspace ini.</td></tr>`;
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
      const { data, error } = await supabaseClient
        .from("stock_beans")
        .delete()
        .eq("id", bean.CloudID)
        .eq("workspace_id", currentWorkspace.id)
        .select("id")
        .single();
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
      ValvePlan: formatValvePlan(brew.steps)
    };
  }

  async function consumeStockForBrew(stockBean, amount) {
    if (!stockBean?.CloudID || !amount) return null;
    const { data, error } = await withTimeout(supabaseClient.rpc("consume_stock_for_brew", {
      p_stock_id: stockBean.CloudID,
      p_amount: Number(amount || 0)
    }), "Update stok kopi");
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
      await syncFromCloud(false).catch(console.warn);

      renderStockTable();
      renderBeansTable();
      renderBrewLogTable();
      renderQABrewOptions();
      renderRecipeOptions(computeBrew());
      renderPublicBrewTable();

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
      QA_Notes: $("qaNotes").value
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
        await updateCloudNoReturn("brew_logs", draft.CloudID, toSnakeBrew(log), "Update Brew Log");
        savedLog = { ...draft, ...log, CloudID: draft.CloudID, WorkspaceID: draft.WorkspaceID || activeWorkspaceId(), Source: "Supabase" };
        state.cloudBrewLogs = uniqueByCloudId([savedLog, ...(state.cloudBrewLogs || []).filter(item => item.CloudID !== savedLog.CloudID)]);
      } else {
        savedLog = await insertCloud("brew_logs", toSnakeBrew(log), fromSnakeBrew);
        state.cloudBrewLogs.unshift(savedLog);
      }

      const savedQA = await insertCloud("qa_scores", toSnakeQA(qa), fromSnakeQA);
      state.cloudQA.unshift(savedQA);

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

  function renderBrewLogTable() {
    const table = $("brewLogTable");
    const tbody = table?.querySelector("tbody");
    const thead = table?.querySelector("thead");
    if (!tbody || !thead) return;
    const locked = !canUseWorkspaceModules();
    setElementHidden($("brewLogHistoryPanel"), locked);
    if (locked) return;

    const adminView = canAdmin();
    const baseHeaders = ["BrewID", "Tanggal", "Biji Kopi", "Key", "Metode", "Dripper", "Gilingan", "Suhu", "Ratio", "QA", "Disetujui", "Variabel", "Hipotesis", "Catatan Hasil"];
    thead.innerHTML = `<tr>${baseHeaders.map(label => `<th>${html(label)}</th>`).join("")}${adminView ? "<th>Aksi</th>" : ""}</tr>`;

    const rows = allBrewLogs().slice().reverse();
    const colSpan = baseHeaders.length + (adminView ? 1 : 0);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}">Belum ada brew log di workspace ini. Buat draft dari menu Rekomendasi Seduh terlebih dahulu.</td></tr>`;
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
        <td>${html(log.GrindSetting)}</td>
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
    $("editBrewId").value = log.BrewID || "";
    $("editBrewDate").value = log.Date || todayISO();
    $("editBrewBeanName").value = log.BeanName || "";
    $("editBrewOrigin").value = log.Origin || "";
    $("editBrewVariety").value = log.Variety || "";
    $("editBrewProcess").value = log.Process || "";
    $("editBrewRoast").value = log.RoastProfile || "";
    $("editBrewMethod").value = log.Method || "";
    $("editBrewDripper").value = log.Dripper || "";
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
      const rpc = supabaseClient.rpc("delete_brew_log_and_restore_stock", { p_brew_id: log.CloudID });
      const { data, error } = await withTimeout(rpc, 18000, "Hapus Brew Log");
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
        const { data, error } = await supabaseClient
          .from("stock_beans")
          .update(payload)
          .eq("id", current.CloudID)
          .eq("workspace_id", currentWorkspace.id)
          .select("*")
          .single();
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
      tbody.innerHTML = `<tr><td colspan="7">${html(message)}</td></tr>`;
      return;
    }
    if (!moderationRows.length) {
      tbody.innerHTML = `<tr><td colspan="7">Tidak ada data untuk filter ini.</td></tr>`;
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
      if (table === "brew_logs" && row.brew_code) {
        await supabaseClient.from("qa_scores").delete().eq("workspace_id", currentWorkspace.id).eq("brew_code", row.brew_code);
      }
      const { data, error } = await supabaseClient
        .from(table)
        .delete()
        .eq("id", id)
        .eq("workspace_id", currentWorkspace.id)
        .select("id")
        .single();
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
      const { data, error } = await supabaseClient
        .from(table)
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", currentWorkspace.id)
        .select("id")
        .single();
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
    const { error } = await supabaseClient.from(table).update(payload).eq("id", id);
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
      tbody.innerHTML = `<tr><td colspan="5">Panel ini hanya untuk Admin Workspace.</td></tr>`;
      return;
    }
    if (message) {
      tbody.innerHTML = `<tr><td colspan="5">${html(message)}</td></tr>`;
      return;
    }
    if (!pendingMemberRows.length) {
      tbody.innerHTML = `<tr><td colspan="5">Tidak ada request akses pending.</td></tr>`;
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
    const { data, error } = await supabaseClient
      .from("workspace_members")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("workspace_id", currentWorkspace.id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("workspace_id,user_id,status")
      .single();
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
      tbody.innerHTML = `<tr><td colspan="6">Panel ini hanya untuk Admin Workspace.</td></tr>`;
      return;
    }
    if (message) {
      tbody.innerHTML = `<tr><td colspan="6">${html(message)}</td></tr>`;
      return;
    }
    if (!workspaceMemberRows.length) {
      tbody.innerHTML = `<tr><td colspan="6">Belum ada pengguna aktif di workspace ini.</td></tr>`;
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
      const { data, error } = await supabaseClient
        .from("workspace_members")
        .delete()
        .eq("workspace_id", currentWorkspace.id)
        .eq("user_id", userId)
        .select("workspace_id,user_id")
        .single();
      if (error || !data) return showMessage(`Gagal menghapus akses: ${(error && error.message) || "row tidak ditemukan"}`, "error");
      await loadWorkspaceMembers();
      showMessage("Akses user ke workspace berhasil dihapus.", "success");
      return;
    }

    const status = action === "activate" ? "active" : "disabled";
    const verb = status === "active" ? "mengaktifkan kembali" : "menangguhkan akses";
    showMessage(`Sedang ${verb} user...`, "info");
    const { data, error } = await supabaseClient
      .from("workspace_members")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("workspace_id", currentWorkspace.id)
      .eq("user_id", userId)
      .select("workspace_id,user_id,status")
      .single();
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
      workspace_id: activeWorkspaceId(),
      created_by: currentUser?.id || null
    };
    if (!suggestion.message) return showMessage("Isi saran/masukan terlebih dahulu.", "error");
    try {
      if (supabaseClient) {
        const { error } = await supabaseClient.from("suggestions").insert({
          name: suggestion.name,
          email: suggestion.email || null,
          category: suggestion.category,
          priority: suggestion.priority,
          message: suggestion.message,
          workspace_id: suggestion.workspace_id,
          created_by: suggestion.created_by,
          status: "open"
        });
        if (error) throw error;
        e.target.reset();
        if (currentUser) {
          $("suggestionName").value = userProfile?.display_name || currentUser.email?.split("@")[0] || "";
          $("suggestionEmail").value = currentUser.email || "";
        }
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

  function publicBrewRows() {
    const search = norm($("publicBrewSearch")?.value || "");
    const method = $("publicBrewMethod")?.value || "all";
    const minQA = Number($("publicBrewMinQA")?.value || 0);
    return (state.cloudBrewLogs || [])
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
      })
      .sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
  }

  function renderPublicBrewTable() {
    const table = $("publicBrewTable");
    if (!table) return;
    const rows = publicBrewRows();
    const tbody = table.querySelector("tbody");
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8">Belum ada hasil seduhan publik yang sesuai filter. Brew log akan tampil di sini setelah QA ≥ 6.5 dan disetujui.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(log => {
      const profile = [log.Variety, log.Process, log.RoastProfile].filter(Boolean).join(" · ");
      const recipe = [`${log.GrindSetting || "-"}`, `${log.Temp_C || "-"}°C`, `1:${log.Ratio || "-"}`, `${log.TotalWater_ml || "-"} ml`].join(" · ");
      const stepSummary = formatPublicRecipeSteps(log);
      const notes = [
        log.PrimaryVariableChanged ? `Variabel: ${log.PrimaryVariableChanged}` : "",
        log.Hypothesis ? `Hipotesis: ${log.Hypothesis}` : "",
        log.ResultNotes ? `Hasil: ${log.ResultNotes}` : ""
      ].filter(Boolean).join(" — ");
      return `<tr>
        <td>${html(log.Date || "-")}</td>
        <td><strong>${html(log.BeanName || "Tanpa nama")}</strong><br><small>${html(log.Origin || "")}</small></td>
        <td>${html(log.BrewerName || "Brewer")}</td>
        <td>${html(profile)}</td>
        <td>${html(log.Method || "-")}<br><small>${html(log.Dripper || "")}</small></td>
        <td>${html(recipe)}<br><small>${html(stepSummary)}</small></td>
        <td><span class="score-pill">${html(log.QA_Final || "-")}</span></td>
        <td>${html(notes || "-")}</td>
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
    table.querySelector("tbody").innerHTML = rows.slice(0, 200).map(row => `<tr>${cols.map(c => `<td>${c === "RoastVisual" ? roastVisual(row) : html(row[c])}</td>`).join("")}</tr>`).join("");
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

  function showTab(name) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${name}`));
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
    setElementHidden($("brewLogHistoryPanel"), !privateReady);
    setElementHidden($("qaParentWrap"), !currentUser);
    setElementHidden($("qaVariableWrap"), !currentUser);
    renderWorkspacePanelAccess();
    setElementHidden($("memberApprovalPanel"), !canAdmin());
    setElementHidden($("workspaceUserPanel"), !canAdmin());
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
    $("moderationTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-mod-action]");
      if (!btn) return;
      moderateRow(btn.dataset.id, btn.dataset.modAction);
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
    } else {
      renderMemberRequests?.();
      renderWorkspaceMembers?.();
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
    sync: () => syncFromCloud(true)
  };

  document.addEventListener("DOMContentLoaded", async () => {
    hydrateSelects();
    bindEvents();
    renderAll();
    await initCloud();
    renderAll();
  });
})();
