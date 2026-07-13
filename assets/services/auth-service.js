(function () {
  "use strict";

  const services = window.COFFEE_SERVICES = window.COFFEE_SERVICES || {};

  function ensureClient(client) {
    if (!client?.auth) throw new Error("Layanan autentikasi belum siap.");
  }

  async function signIn(client, { email, password }) {
    ensureClient(client);
    return client.auth.signInWithPassword({ email: String(email || "").trim(), password: String(password || "") });
  }

  async function signUp(client, { email, password, redirectTo, metadata = {} }) {
    ensureClient(client);
    return client.auth.signUp({
      email: String(email || "").trim(),
      password: String(password || ""),
      options: { emailRedirectTo: redirectTo, data: metadata }
    });
  }

  async function signOut(client) {
    ensureClient(client);
    return client.auth.signOut({ scope: "local" });
  }

  async function getSession(client) {
    ensureClient(client);
    return client.auth.getSession();
  }

  function onAuthStateChange(client, handler) {
    ensureClient(client);
    return client.auth.onAuthStateChange(handler);
  }

  services.auth = Object.freeze({ signIn, signUp, signOut, getSession, onAuthStateChange });
})();
