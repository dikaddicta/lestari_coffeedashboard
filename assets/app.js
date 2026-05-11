(function () {
  "use strict";

  const DATA = window.COFFEE_DATA || {};
  const STORAGE_KEY = "coffeeDashboardWebV1";
  const APPROVAL_THRESHOLD = 8.6;
  const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {};
  let supabaseClient = null;
  let cloudReady = false;
  let cloudLastSync = null;
  let currentSession = null;
  let currentUser = null;
  let userProfile = null;
  let joinedWorkspaces = [];
  let publicWorkspaces = [];
  let currentWorkspace = null;
  let currentRole = "guest";
  let moderationRows = [];
  const LAST_WORKSPACE_KEY = "coffeeDashboardActiveWorkspace";

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

  const state = loadState();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        userStock: Array.isArray(saved.userStock) ? saved.userStock : [],
        userBrewLogs: Array.isArray(saved.userBrewLogs) ? saved.userBrewLogs : [],
        userQA: Array.isArray(saved.userQA) ? saved.userQA : [],
        cloudStock: [],
        cloudBrewLogs: [],
        cloudQA: []
      };
    } catch (err) {
      return { userStock: [], userBrewLogs: [], userQA: [], cloudStock: [], cloudBrewLogs: [], cloudQA: [] };
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
    return canModerate() && isApprovedRecipeLog(log) ? "approved" : "pending";
  }

  function moderationStatusForQA(qa) {
    const pass = Number(qa?.Final_QA || 0) >= APPROVAL_THRESHOLD && /qa pass/i.test(String(qa?.Status || ""));
    return canModerate() && pass ? "approved" : "pending";
  }

  function currentBrewerName() {
    return userProfile?.display_name || currentUser?.user_metadata?.display_name || currentUser?.email?.split("@")[0] || "Brewer";
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
    publicWorkspaces = [];
    currentWorkspace = null;
    currentRole = "guest";
    if (!supabaseClient) return;

    const publicRes = await supabaseClient.from("workspaces").select("id,name,slug,visibility,description").eq("visibility", "public").eq("status", "active").order("name");
    if (!publicRes.error) publicWorkspaces = publicRes.data || [];

    if (currentUser) {
      const memberRes = await supabaseClient
        .from("workspace_members")
        .select("workspace_id, role, status, workspaces(id,name,slug,visibility,description)")
        .eq("user_id", currentUser.id)
        .eq("status", "active");
      if (!memberRes.error) joinedWorkspaces = (memberRes.data || []).map(flattenWorkspaceMembership).filter(ws => ws.id);
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

    [$("activeWorkspaceSelect"), $("adminWorkspaceSelect")].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = allKnown.length
        ? allKnown.map(ws => `<option value="${html(ws.id)}">${html(ws.name)}${joinedWorkspaces.find(j => j.id === ws.id) ? ` · ${html(joinedWorkspaces.find(j => j.id === ws.id).role)}` : " · hanya lihat"}</option>`).join("")
        : `<option value="">Belum ada workspace</option>`;
      if (currentWorkspace?.id) sel.value = currentWorkspace.id;
    });

    const joinSel = $("joinWorkspaceSelect");
    if (joinSel) {
      const joinable = (publicWorkspaces || []).filter(ws => !joinedWorkspaces.some(j => j.id === ws.id));
      joinSel.innerHTML = joinable.length ? joinable.map(ws => `<option value="${html(ws.id)}">${html(ws.name)}</option>`).join("") : `<option value="">Tidak ada public workspace baru</option>`;
    }

    const hint = $("workspaceHint");
    if (hint) {
      hint.textContent = currentWorkspace
        ? `${currentWorkspace.name} · peran aktif: ${currentRole}`
        : "Belum ada workspace aktif.";
    }
    renderAuthUI();
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
  }

  function renderAuthUI() {
    const userLabel = $("authUserLabel");
    const roleLabel = $("authRoleLabel");
    const accountBox = $("accountBox");
    const authJumpLink = $("authJumpLink");
    const loggedOutArea = $("authLoggedOutArea");
    const loggedInArea = $("authLoggedInArea");
    const isLoggedIn = Boolean(currentUser);

    if (userLabel) userLabel.textContent = isLoggedIn ? (userProfile?.display_name || currentUser.email) : "Mode Tamu";
    if (roleLabel) roleLabel.textContent = isLoggedIn
      ? `${currentUser.email} · ${currentWorkspace?.name || "Belum ada workspace"} · ${currentRole}`
      : "Masuk untuk menyimpan dan membagikan data.";

    if (accountBox) {
      accountBox.innerHTML = isLoggedIn
        ? `<strong>${html(userProfile?.display_name || currentUser.email)}</strong><br>Email: ${html(currentUser.email)}<br>Workspace: ${html(currentWorkspace?.name || "-")}<br>Peran: <span class="status-pill approved">${html(currentRole)}</span>`
        : `Belum masuk. Tamu tetap bisa membaca data publik yang sudah disetujui, tetapi pengiriman data ke database online memerlukan akun.`;
    }

    loggedOutArea?.classList.toggle("hidden", isLoggedIn);
    loggedInArea?.classList.toggle("hidden", !isLoggedIn);
    authJumpLink?.classList.toggle("hidden", isLoggedIn);
  }

  async function initAuth() {
    if (!supabaseClient) return;
    const { data: sessionData } = await supabaseClient.auth.getSession();
    currentSession = sessionData?.session || null;
    currentUser = currentSession?.user || null;
    if (currentUser) await ensureProfile();
    await loadWorkspaces();
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      currentSession = session || null;
      currentUser = currentSession?.user || null;
      if (currentUser) await ensureProfile();
      else { userProfile = null; joinedWorkspaces = []; currentWorkspace = null; currentRole = "guest"; }
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
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(`Gagal masuk: ${error.message}`, "error");
    showMessage("Berhasil masuk.", "success");
  }

  async function handleSignup() {
    if (!supabaseClient) return showMessage("Supabase belum aktif.");
    const email = ($("signupEmail")?.value || $("authEmail")?.value || "").trim();
    const password = $("signupPassword")?.value || $("authPassword")?.value || "";
    const displayName = $("authDisplayName")?.value.trim() || email.split("@")[0];
    if (!email || !password) return showMessage("Isi email dan kata sandi untuk daftar akun baru.", "error");
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { display_name: displayName }
      }
    });
    if (error) {
      const message = /Invalid path specified/i.test(error.message)
        ? "Pendaftaran gagal: Supabase URL di assets/supabase-config.js kemungkinan salah. Pakai Project URL utama, contoh https://xxxxx.supabase.co, bukan URL dashboard, /rest/v1, atau /auth/v1."
        : `Pendaftaran gagal: ${error.message}`;
      return showMessage(message, "error");
    }
    showMessage("Pendaftaran berhasil. Jika konfirmasi email aktif, cek inbox untuk verifikasi.", "success");
  }

  async function handleLogout() {
    if (!supabaseClient) return showMessage("Supabase belum aktif.", "error");

    const btn = $("logoutBtn");
    const originalText = btn?.textContent || "Keluar";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Keluar...";
    }

    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        showMessage(`Gagal keluar: ${error.message}`, "error");
        return;
      }

      currentSession = null;
      currentUser = null;
      userProfile = null;
      joinedWorkspaces = [];
      currentWorkspace = null;
      currentRole = "guest";
      state.cloudStock = [];
      state.cloudBrewLogs = [];
      state.cloudQA = [];
      localStorage.removeItem(LAST_WORKSPACE_KEY);

      renderWorkspaceUI();
      renderAll();
      showMessage("Berhasil keluar.", "success");
    } catch (err) {
      console.error(err);
      showMessage(`Gagal keluar: ${err.message || err}`, "error");
    } finally {
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
        showMessage("Nama workspace dan slug wajib diisi.", "error");
        return;
      }

      const payload = {
        name,
        slug,
        visibility: $("workspaceVisibility").value,
        description: $("workspaceDescription").value,
        created_by: currentUser.id
      };

      showMessage("Sedang membuat workspace...", "info");
      const { data, error } = await supabaseClient.from("workspaces").insert(payload).select().single();
      if (error) {
        const duplicate = /duplicate key|already exists|unique/i.test(error.message || "");
        showMessage(duplicate ? "Slug workspace sudah dipakai. Coba slug lain." : `Gagal membuat workspace: ${error.message}`, "error");
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
      workspace_id: activeWorkspaceId(),
      created_by: currentUser?.id || null,
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
      workspace_id: activeWorkspaceId(),
      created_by: currentUser?.id || null,
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
    try {
      updateDbStatus("syncing", "Menghubungkan ke Supabase...", "Membaca sesi pengguna, workspace, dan data publik yang sudah disetujui.");
      const projectUrl = getSupabaseProjectUrl();
      const anonKey = getSupabaseAnonKey();
      supabaseClient = window.supabase.createClient(projectUrl, anonKey);
      cloudReady = true;
      await initAuth();
      await syncFromCloud(false);
      updateDbStatus("online", "Supabase online", `Data publik yang sudah disetujui tersinkron. Sinkron terakhir: ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      cloudReady = false;
      supabaseClient = null;
      updateDbStatus("offline", "Supabase gagal tersambung", err.message || "Cek config, schema, atau RLS policy.");
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

    const [stockRes, publicBrewRes, workspaceBrewRes, workspaceQaRes] = await Promise.all([stockPromise, publicBrewPromise, workspaceBrewPromise, workspaceQaPromise]);
    if (stockRes.error) throw stockRes.error;
    if (publicBrewRes.error) throw publicBrewRes.error;
    if (workspaceBrewRes.error) throw workspaceBrewRes.error;
    if (workspaceQaRes.error) throw workspaceQaRes.error;

    state.cloudStock = (stockRes.data || []).map(fromSnakeStock);
    state.cloudBrewLogs = uniqueByCloudId([...(publicBrewRes.data || []).map(fromSnakeBrew), ...(workspaceBrewRes.data || []).map(fromSnakeBrew)]);
    state.cloudQA = (workspaceQaRes.data || []).map(fromSnakeQA);
    cloudLastSync = new Date();
    cloudReady = true;
    updateDbStatus("online", "Supabase online", `Data workspace dan hasil seduhan publik tersinkron. Sinkron terakhir: ${cloudLastSync.toLocaleTimeString()}`);
    if (shouldRender) renderAll();
  }

  async function insertCloud(table, payload, mapper) {
    if (!cloudReady || !supabaseClient) throw new Error("Supabase belum siap.");
    const { data, error } = await supabaseClient.from(table).insert(payload).select().single();
    if (error) throw error;
    return mapper(data);
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
    const grinders = (DATA.grinders || []).map(g => g.Grinder);
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

  function renderMetrics() {
    const metrics = [
      [DATA.varieties?.length || 0, "Varietas"],
      [DATA.drippers?.length || 0, "Dripper"],
      [DATA.processes?.length || 0, "Proses"],
      [DATA.roasts?.length || 0, "Roast"],
      [DATA.waters?.length || 0, "Water"],
      [canUseWorkspaceModules() ? allStock().length : 0, "Stock Workspace"]
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

  function getGrinderSetting(grinderName, micron, mode, isImmersion) {
    if (/EVCG/i.test(grinderName)) {
      const click = round(clamp(1 + ((micron - 320) / ((900 - 320) / 43)), 1, 44));
      return `${click}/44 clicks`;
    }
    if (/Timemore|C3/i.test(grinderName)) {
      const click = round(clamp(11 + ((micron - 500) / 400) * 7, 11, 24));
      return `${click} clicks`;
    }
    return `${micron} µm target`;
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
    return brew;
  }

  function renderSteps(brew) {
    const tbody = $("brewStepsTable").querySelector("tbody");
    tbody.innerHTML = brew.steps.map(st => `<tr><td><strong>${html(st.stage)}</strong></td><td>${html(st.water ? `${st.water}` : "-")}</td><td>${html(st.time)}</td><td><span class="badge">${html(st.valve)}</span></td><td>${html(st.instruction)}</td></tr>`).join("");
    const hotSum = brew.steps.filter(st => st.stage !== "Ice").reduce((sum, st) => sum + (Number(st.water) || 0), 0);
    $("pourCheck").textContent = `Pour check: hot water steps = ${hotSum} ml, target hot water = ${brew.hotWater} ml. Total brew water = ${brew.totalWater} ml${brew.ice ? ` (hot ${brew.hotWater} + ice ${brew.ice})` : ""}.`;
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
    $("recipeOptions").innerHTML = baseCard + (approvedCards.join("") || `<article class="recipe-card"><span class="badge">Belum ada opsi terverifikasi</span><h3>Belum ada opsi dari Brew Log</h3><p>Resep dengan QA ≥ 8.6 dan persetujuan manual akan muncul di sini jika key varietas × proses × profil sangrai cocok.</p></article>`);
  }

  function toggleSwitchVisibility() {
    const active = isSwitch($("brewDripper").value);
    $("switchModeWrap").style.display = active ? "grid" : "none";
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
    const tbody = $("stockTable")?.querySelector("tbody");
    if (!tbody) return;
    const locked = !canUseWorkspaceModules();
    setModuleLocked("tab-stock", "stockAccessNotice", locked, privateModuleMessage("Stok Kopi"));
    if (locked) {
      tbody.innerHTML = `<tr><td colspan="11">Masuk dan pilih workspace untuk melihat atau mengelola stok kopi.</td></tr>`;
      return;
    }
    const rows = allStock();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11">Belum ada stok kopi di workspace ini.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(bean => `<tr><td><strong>${html(bean.CoffeeName)}</strong><br><small>${html(bean.Producer || "")}</small></td><td>${html(bean.Origin || "")}</td><td>${html(bean.Variety || "")}</td><td>${html(bean.Variety2_optional || "")}</td><td>${html(bean.Process || "")}</td><td>${html(bean.RoastProfile || "")}</td><td>${html(beanFlavorList(bean).join(" / "))}</td><td>${html(bean.Sweetness)}/${html(bean.Acidity)}/${html(bean.Body)}</td><td>${html(bean.Stock_g)}g</td><td>${html(bean.BestBrew || "Both")}</td><td>${html(bean.Active || "Yes")}</td></tr>`).join("");
  }

  function applyTopBeanToBrew() {
    const ranked = rankBeans();
    if (!ranked.length) return alert("Tidak ada bean yang cocok dengan filter saat ini.");
    const bean = ranked[0].bean;
    $("brewVariety").value = bean.Variety || $("brewVariety").value;
    $("brewProcess").value = bean.Process || $("brewProcess").value;
    $("brewRoast").value = bean.RoastProfile || $("brewRoast").value;
    renderBrew();
    showTab("brew");
  }

  function nextId(prefix, list, field) {
    const nums = list.map(x => String(x[field] || "").replace(/\D/g, "")).map(Number).filter(Boolean);
    return `${prefix}${String((Math.max(0, ...nums) + 1)).padStart(3, "0")}`;
  }

  function currentBrewLogBase(extra = {}) {
    const brew = computeBrew();
    const id = extra.BrewID || nextId("BL", allBrewLogs(), "BrewID");
    const qaId = extra.QA_ID || nextId("QA", allQA(), "QA_ID");
    return {
      BrewID: id,
      Date: todayISO(),
      BeanName: extra.BeanName || $("qaBeanName")?.value || $("brewVariety").value,
      Origin: extra.Origin || "",
      Variety: $("brewVariety").value,
      Process: $("brewProcess").value,
      RoastProfile: $("brewRoast").value,
      Dripper: $("brewDripper").value,
      Method: $("brewMode").value,
      Grinder: $("brewGrinder").value,
      GrindSetting: brew.grinderSetting,
      Temp_C: brew.temp,
      Ratio: brew.ratio,
      Dose_g: brew.dose,
      TotalWater_ml: brew.totalWater,
      HotWater_ml: brew.hotWater,
      Ice_g: brew.ice,
      BrewTime_sec: brew.brewTime,
      Bloom_ml: brew.bloom,
      PourCount: brew.pourCount,
      PourPlan: brew.steps.map(st => `${st.stage} ${st.water || "-"}g ${st.valve}`).join(" | "),
      Water: $("brewWater").value,
      TDS_ppm: brew.tds,
      Agitation: "record in notes",
      Filter: brew.dripper.Filter || "",
      ParentBrewID: extra.ParentBrewID || "",
      PrimaryVariableChanged: extra.PrimaryVariableChanged || "Dasar",
      Hypothesis: extra.Hypothesis || "Rekomendasi dasar dari sistem.",
      ResultNotes: extra.ResultNotes || "Draft disimpan dari rekomendasi web.",
      QA_ID: qaId,
      QA_Final: extra.QA_Final ?? "",
      QA_Status: extra.QA_Status || "Pending QA",
      ManualApproval: extra.ManualApproval || "No",
      ApprovedForRecipe: extra.ApprovedForRecipe || "No",
      RecipeKey: recipeKey($("brewVariety").value, $("brewProcess").value, $("brewRoast").value),
      CurrentMatchScore: "",
      Water_Formula_Note: "TotalWater_ml = Rasio × Dosis_g. Japanese: air panas = 60%, es = 40%.",
      SwitchValveMode: brew.switchMode,
      ValvePlan: brew.steps.map(st => `${st.stage}: ${st.valve}`).join(" | ")
    };
  }

  function saveCurrentBrewDraft() {
    if (!canUseWorkspaceModules()) {
      showMessage(privateModuleMessage("Brew Log"));
      showTab("admin");
      return;
    }
    const log = currentBrewLogBase();
    insertCloud("brew_logs", toSnakeBrew(log), fromSnakeBrew)
      .then(saved => {
        state.cloudBrewLogs.unshift(saved);
        renderBrewLogTable();
        renderRecipeOptions(computeBrew());
        renderPublicBrewTable();
        alert("Draft brew tersimpan di workspace. Draft belum tampil publik sampai ada QA ≥ 8.6 dan disetujui QA/admin.");
      })
      .catch(err => {
        console.error(err);
        alert(`Gagal menyimpan brew log ke Supabase. Data belum tersimpan. Detail: ${err.message || err}`);
      });
  }

  function computeQAFromForm() {
    const ids = ["qaAroma", "qaFlavor", "qaAftertaste", "qaAcidityQuality", "qaSweetness", "qaBody", "qaBalance", "qaClarity", "qaFinish", "qaConsistency"];
    const avg = ids.reduce((sum, id) => sum + (Number($(id).value) || 0), 0) / ids.length;
    const final = clamp(avg - (Number($("qaDefect").value) || 0), 0, 10);
    return round(final, 2);
  }

  function renderQAPreview() {
    const final = computeQAFromForm();
    const approvalRequested = $("qaApproval").value === "Yes";
    const pass = final >= APPROVAL_THRESHOLD && approvalRequested && canModerate();
    $("qaFinalPreview").textContent = fmt(final, 2);
    $("qaStatusPreview").textContent = pass ? "QA PASS" : (approvalRequested && !canModerate() ? "MENUNGGU REVIEW QA" : "RETEST");
    $("qaStatusPreview").className = pass ? "qa-pass" : "qa-retest";
  }

  async function saveQA(e) {
    e.preventDefault();
    if (!canUseWorkspaceModules()) {
      showMessage(privateModuleMessage("Brew Log & QA"));
      showTab("admin");
      return;
    }
    const final = computeQAFromForm();
    const approvalRequested = $("qaApproval").value === "Yes";
    const approved = final >= APPROVAL_THRESHOLD && approvalRequested && canModerate();
    const brewId = nextId("BL", allBrewLogs(), "BrewID");
    const qaId = nextId("QA", allQA(), "QA_ID");
    const log = currentBrewLogBase({
      BrewID: brewId,
      QA_ID: qaId,
      BeanName: $("qaBeanName").value || $("brewVariety").value,
      ParentBrewID: $("qaParent").value,
      PrimaryVariableChanged: $("qaVariable").value || "Not specified",
      Hypothesis: $("qaHypothesis").value,
      ResultNotes: $("qaNotes").value,
      QA_Final: final,
      QA_Status: approved ? "QA PASS" : "RETEST",
      ManualApproval: $("qaApproval").value,
      ApprovedForRecipe: approved ? "Yes" : "No"
    });
    const qa = {
      QA_ID: qaId,
      BrewID: brewId,
      Date: todayISO(),
      Evaluator: $("qaEvaluator").value,
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
      Status: approved ? "QA PASS" : "RETEST",
      Approver: approved ? $("qaEvaluator").value : "",
      QA_Notes: $("qaNotes").value
    };
    try {
      const savedLog = await insertCloud("brew_logs", toSnakeBrew(log), fromSnakeBrew);
      const savedQA = await insertCloud("qa_scores", toSnakeQA(qa), fromSnakeQA);
      state.cloudBrewLogs.unshift(savedLog);
      state.cloudQA.unshift(savedQA);
      renderBrewLogTable();
      renderBrew();
      renderPublicBrewTable();
      alert(approved ? "QA PASS. Resep langsung disetujui dan tampil di halaman publik." : (approvalRequested && !canModerate() ? "Brew log + QA tersimpan dan menunggu review QA/admin sebelum tampil publik." : "Brew log + QA tersimpan di workspace. Data belum tampil publik sebelum disetujui."));
      return;
    } catch (err) {
      console.error(err);
      alert(`Gagal menyimpan Brew Log & QA ke Supabase. Data belum tersimpan. Detail: ${err.message || err}`);
    }
  }

  function renderBrewLogTable() {
    const tbody = $("brewLogTable")?.querySelector("tbody");
    if (!tbody) return;
    const locked = !canUseWorkspaceModules();
    setModuleLocked("tab-qa", "qaAccessNotice", locked, privateModuleMessage("Brew Log & QA"));
    if (locked) {
      tbody.innerHTML = `<tr><td colspan="12">Masuk dan pilih workspace untuk mengisi atau melihat Brew Log & QA.</td></tr>`;
      return;
    }
    const rows = allBrewLogs().slice().reverse();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="12">Belum ada brew log di workspace ini.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(log => `<tr><td><strong>${html(log.BrewID)}</strong></td><td>${html(log.Date)}</td><td>${html(log.BeanName)}</td><td>${html(log.RecipeKey)}</td><td>${html(log.Method)}</td><td>${html(log.Dripper)}</td><td>${html(log.GrindSetting)}</td><td>${html(log.Temp_C)}°C</td><td>1:${html(log.Ratio)}</td><td><span class="score-pill">${html(log.QA_Final || "-")}</span></td><td>${html(log.ApprovedForRecipe || "No")}</td><td>${html(log.PrimaryVariableChanged || "")}</td></tr>`).join("");
  }

  async function saveStock(e) {
    e.preventDefault();
    if (!canUseWorkspaceModules()) {
      showMessage(privateModuleMessage("Stok Kopi"));
      showTab("admin");
      return;
    }
    const bean = {
      BeanID: nextId("B", allStock(), "BeanID"),
      CoffeeName: $("stockName").value,
      Origin: $("stockOrigin").value,
      Producer: $("stockProducer").value,
      Variety: $("stockVariety1").value,
      Variety2_optional: $("stockVariety2").value,
      Process: $("stockProcess").value,
      RoastProfile: $("stockRoast").value,
      FlavorFamily: $("stockFlavor1").value,
      FlavorFamily2_optional: $("stockFlavor2").value,
      FlavorFamily3_optional: $("stockFlavor3").value,
      Notes: $("stockNotes").value,
      Sweetness: Number($("stockSweet").value),
      Acidity: Number($("stockAcid").value),
      Body: Number($("stockBody").value),
      Stock_g: Number($("stockQty").value),
      BestBrew: $("stockBestBrew").value,
      Price: Number($("stockPrice").value),
      RoastDate: $("stockRoastDate").value,
      Active: $("stockActive").value
    };
    try {
      const saved = await insertCloud("stock_beans", toSnakeStock(bean), fromSnakeStock);
      state.cloudStock.unshift(saved);
      renderBeansTable();
      renderMetrics();
      e.target.reset();
      hydrateSelects();
      alert("Stok kopi tersimpan privat di workspace aktif.");
      return;
    } catch (err) {
      console.error(err);
      alert(`Gagal menyimpan stok ke Supabase. Data belum tersimpan. Detail: ${err.message || err}`);
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
          <button class="ghost" data-mod-action="edit" data-id="${html(row.id)}">Edit JSON</button>
          ${canAdmin() ? `<button class="danger" data-mod-action="delete" data-id="${html(row.id)}">Hapus</button>` : ""}
        </div></td>
      </tr>`;
    }).join("");
  }

  async function moderateRow(id, action) {
    const table = $("moderationDataset")?.value || "brew_logs";
    if (!supabaseClient || !canModerate()) return showMessage("Butuh role QA/Admin.");
    if (action === "delete") {
      if (!canAdmin()) return showMessage("Hapus data hanya untuk admin workspace.");
      if (!confirm("Hapus data ini permanen dari Supabase?")) return;
      const { error } = await supabaseClient.from(table).delete().eq("id", id);
      if (error) return showMessage(`Gagal menghapus data: ${error.message}`);
      await syncFromCloud(true).catch(console.warn);
      await loadModerationRows();
      return showMessage("Data dihapus.");
    }
    if (action === "edit") return editModerationJson(id);

    const notes = action === "reject" ? prompt("Alasan reject / catatan perbaikan:", "Data perlu dicek ulang.") : "Disetujui oleh moderator";
    const payload = {
      moderation_status: action === "approve" ? "approved" : "rejected",
      moderation_notes: notes || null,
      moderated_by: currentUser.id,
      moderated_at: new Date().toISOString()
    };
    if (table !== "qa_scores") payload.status = action === "approve" ? "published" : "rejected";
    const { error } = await supabaseClient.from(table).update(payload).eq("id", id);
    if (error) return showMessage(`Moderation gagal: ${error.message}`);
    await syncFromCloud(true).catch(console.warn);
    await loadModerationRows();
    showMessage(action === "approve" ? "Data disetujui dan akan tampil publik." : "Data ditolak.");
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
      tbody.innerHTML = `<tr><td colspan="8">Belum ada hasil seduhan publik yang sesuai filter. Brew log akan tampil di sini setelah QA ≥ 8.6 dan disetujui.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(log => {
      const profile = [log.Variety, log.Process, log.RoastProfile].filter(Boolean).join(" · ");
      const recipe = [`${log.GrindSetting || "-"}`, `${log.Temp_C || "-"}°C`, `1:${log.Ratio || "-"}`, `${log.TotalWater_ml || "-"} ml`].join(" · ");
      const notes = [log.PrimaryVariableChanged, log.ResultNotes].filter(Boolean).join(" — ");
      return `<tr>
        <td>${html(log.Date || "-")}</td>
        <td><strong>${html(log.BeanName || "Tanpa nama")}</strong><br><small>${html(log.Origin || "")}</small></td>
        <td>${html(log.BrewerName || "Brewer")}</td>
        <td>${html(profile)}</td>
        <td>${html(log.Method || "-")}<br><small>${html(log.Dripper || "")}</small></td>
        <td>${html(recipe)}<br><small>${html(log.ValvePlan || log.PourPlan || "")}</small></td>
        <td><span class="score-pill">${html(log.QA_Final || "-")}</span></td>
        <td>${html(notes || "-")}</td>
      </tr>`;
    }).join("");
  }

  function renderLibrary() {
    const dataset = $("libraryDataset").value;
    const search = norm($("librarySearch").value);
    const rows = (DATA[dataset] || []).filter(row => !search || Object.values(row).some(v => norm(v).includes(search)));
    const cols = Object.keys(rows[0] || {}).slice(0, 8);
    const labelMap = {
      VarietyName: "Nama Varietas", Species: "Spesies", Group: "Kelompok", Origin: "Asal", Parentage: "Induk/Persilangan",
      Acidity: "Acidity", Sweetness: "Sweetness", Body: "Body", ProcessName: "Nama Proses", Category: "Kategori",
      FermentRisk: "Risiko Fermentasi", BrewingCue: "Catatan Seduh", DripperName: "Nama Dripper", Material: "Material",
      FlowSpeed: "Kecepatan Flow", HeatRetention: "Retensi Panas", RoastName: "Profil Sangrai", WaterName: "Nama Air",
      TDS: "TDS", Hardness: "Hardness", Alkalinity: "Alkalinitas"
    };
    const table = $("libraryTable");
    table.querySelector("thead").innerHTML = `<tr>${cols.map(c => `<th>${html(labelMap[c] || c)}</th>`).join("")}</tr>`;
    table.querySelector("tbody").innerHTML = rows.slice(0, 200).map(row => `<tr>${cols.map(c => `<td>${html(row[c])}</td>`).join("")}</tr>`).join("");
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

  function bindEvents() {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
    ["brewVariety", "brewProcess", "brewRoast", "brewDripper", "brewMode", "switchValveMode", "brewGrinder", "brewWater", "brewDose", "pourPattern"].forEach(id => $(id).addEventListener("change", renderBrew));
    ["targetSweet", "targetAcid", "targetBody", "filterFlavor1", "filterFlavor2", "filterFlavor3", "filterVariety1", "filterVariety2", "filterBrew", "minStock"].forEach(id => $(id).addEventListener("change", renderBeansTable));
    ["targetSweet", "targetAcid", "targetBody", "minStock"].forEach(id => $(id).addEventListener("input", renderBeansTable));
    $("saveCurrentBrew").addEventListener("click", saveCurrentBrewDraft);
    $("applyBeanToBrew").addEventListener("click", applyTopBeanToBrew);
    $("stockForm").addEventListener("submit", saveStock);
    $("qaForm").addEventListener("submit", saveQA);
    document.querySelectorAll(".qa-score, #qaDefect, #qaApproval").forEach(el => el.addEventListener("input", renderQAPreview));
    document.querySelectorAll(".qa-score, #qaDefect, #qaApproval").forEach(el => el.addEventListener("change", renderQAPreview));
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
    $("moderationTable")?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-mod-action]");
      if (!btn) return;
      moderateRow(btn.dataset.id, btn.dataset.modAction);
    });
    $("syncCloud")?.addEventListener("click", async () => {
      try {
        await syncFromCloud(true);
        alert("Sinkronisasi Supabase selesai.");
      } catch (err) {
        alert(`Sinkronisasi gagal: ${err.message || err}`);
      }
    });
    $("exportJson").addEventListener("click", exportJson);
    $("importJson").addEventListener("change", e => e.target.files[0] && importJson(e.target.files[0]));
    $("resetLocal").addEventListener("click", () => {
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
    renderBrew();
    renderBeansTable();
    renderStockTable();
    renderQAPreview();
    renderBrewLogTable();
    renderPublicBrewTable();
    renderLibrary();
    renderWorkspaceUI();
    if (canModerate()) loadModerationRows().catch(console.warn);
    else renderModerationTable?.();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    hydrateSelects();
    bindEvents();
    renderAll();
    await initCloud();
    renderAll();
  });
})();
