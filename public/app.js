const state = {
  config: null,
  session: null,
  libraries: [],
  selectedLibraries: new Set(),
  scan: null,
  activeDelete: null
};

const elements = {
  loginShell: document.querySelector("#loginShell"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginHint: document.querySelector("#loginHint"),
  loginUsernameInput: document.querySelector("#loginUsernameInput"),
  loginPasswordInput: document.querySelector("#loginPasswordInput"),
  loginMessage: document.querySelector("#loginMessage"),
  serverSummary: document.querySelector("#serverSummary"),
  userBadge: document.querySelector("#userBadge"),
  connectionBadge: document.querySelector("#connectionBadge"),
  refreshButton: document.querySelector("#refreshButton"),
  logoutButton: document.querySelector("#logoutButton"),
  libraryStrip: document.querySelector("#libraryStrip"),
  scanButton: document.querySelector("#scanButton"),
  searchInput: document.querySelector("#searchInput"),
  groupCount: document.querySelector("#groupCount"),
  fileCount: document.querySelector("#fileCount"),
  reclaimCount: document.querySelector("#reclaimCount"),
  libraryCount: document.querySelector("#libraryCount"),
  messageArea: document.querySelector("#messageArea"),
  duplicatesList: document.querySelector("#duplicatesList"),
  settingsForm: document.querySelector("#settingsForm"),
  plexUrlInput: document.querySelector("#plexUrlInput"),
  plexTokenInput: document.querySelector("#plexTokenInput"),
  scanPageSizeInput: document.querySelector("#scanPageSizeInput"),
  allowDeletesInput: document.querySelector("#allowDeletesInput"),
  authModeInput: document.querySelector("#authModeInput"),
  authUsernameInput: document.querySelector("#authUsernameInput"),
  externalHeadersInput: document.querySelector("#externalHeadersInput"),
  currentPasswordInput: document.querySelector("#currentPasswordInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  authPasswordConfirmInput: document.querySelector("#authPasswordConfirmInput"),
  testButton: document.querySelector("#testButton"),
  deleteDialog: document.querySelector("#deleteDialog"),
  deleteFileName: document.querySelector("#deleteFileName"),
  deleteFilePath: document.querySelector("#deleteFilePath"),
  deleteConfirmInput: document.querySelector("#deleteConfirmInput"),
  confirmDeleteButton: document.querySelector("#confirmDeleteButton")
};

function icons() {
  if (window.lucide) window.lucide.createIcons();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !["/api/session", "/api/login"].includes(path)) {
      showLogin(data);
    }
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(ms) {
  const minutes = Math.round(Number(ms || 0) / 60000);
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function setMessage(message, type = "") {
  elements.messageArea.innerHTML = message
    ? `<div class="message ${type}">${escapeHtml(message)}</div>`
    : "";
}

function setLoginMessage(message, type = "") {
  elements.loginMessage.innerHTML = message
    ? `<div class="message ${type}">${escapeHtml(message)}</div>`
    : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.querySelector("span").textContent = label;
}

function showLogin(sessionInfo = {}) {
  state.session = null;
  elements.appShell.classList.add("is-hidden");
  elements.loginShell.classList.remove("is-hidden");

  const external = sessionInfo.authMode === "external";
  elements.loginForm.classList.toggle("external-login", external);
  elements.loginHint.textContent = external
    ? "External auth is enabled. Sign in through your reverse proxy."
    : "Default login is admin/admin.";
  icons();
}

function showApp(session) {
  state.session = session;
  elements.loginShell.classList.add("is-hidden");
  elements.appShell.classList.remove("is-hidden");
  elements.userBadge.textContent = session?.user?.username || "admin";
  icons();
}

function renderConfig() {
  if (!state.config) return;
  elements.plexUrlInput.value = state.config.plexUrl || "";
  elements.plexTokenInput.value = "";
  elements.scanPageSizeInput.value = state.config.scanPageSize || 200;
  elements.allowDeletesInput.checked = Boolean(state.config.allowDeletes);
  elements.authModeInput.value = state.config.auth?.mode || "builtin";
  elements.authUsernameInput.value = state.config.auth?.username || "admin";
  elements.externalHeadersInput.value = (state.config.auth?.externalUserHeaders || []).join(", ");
  elements.currentPasswordInput.value = "";
  elements.authPasswordInput.value = "";
  elements.authPasswordConfirmInput.value = "";
}

function setOnline(summary) {
  elements.connectionBadge.textContent = "Online";
  elements.connectionBadge.className = "status-badge online";
  elements.serverSummary.textContent = [
    summary.friendlyName,
    summary.version,
    summary.platform
  ]
    .filter(Boolean)
    .join(" | ");
}

function setOffline(message = "Not connected") {
  elements.connectionBadge.textContent = "Offline";
  elements.connectionBadge.className = "status-badge muted";
  elements.serverSummary.textContent = message;
}

function renderLibraries() {
  if (!state.libraries.length) {
    elements.libraryStrip.innerHTML = `<span class="pill">No libraries</span>`;
    return;
  }

  elements.libraryStrip.innerHTML = state.libraries
    .filter((library) => ["movie", "show", "video"].includes(library.type))
    .map((library) => {
      const checked = state.selectedLibraries.has(String(library.key)) ? "checked" : "";
      return `
        <label class="library-chip">
          <input type="checkbox" value="${escapeHtml(library.key)}" ${checked}>
          <span>${escapeHtml(library.title)}</span>
        </label>
      `;
    })
    .join("");

  elements.libraryStrip.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.selectedLibraries.add(input.value);
      else state.selectedLibraries.delete(input.value);
    });
  });
}

function renderStats(stats = {}) {
  elements.groupCount.textContent = stats.groups || 0;
  elements.fileCount.textContent = stats.files || 0;
  elements.reclaimCount.textContent = formatBytes(stats.reclaimableBytes || 0);
  elements.libraryCount.textContent = stats.libraries || state.libraries.length || 0;
}

function fileVideoLabel(file) {
  const resolution = file.height ? `${file.width || "?"}x${file.height}` : file.videoResolution || "Unknown";
  return [resolution, file.videoCodec?.toUpperCase(), file.videoProfile]
    .filter(Boolean)
    .join(" | ");
}

function fileAudioLabel(file) {
  const codec = file.audioCodec ? file.audioCodec.toUpperCase() : "Unknown";
  const channels = file.audioChannels ? `${file.audioChannels} ch` : "";
  const streams = file.audioStreams?.length > 1 ? `${file.audioStreams.length} streams` : "";
  return [codec, channels, streams].filter(Boolean).join(" | ");
}

function deleteButton(file, isBest) {
  const disabled = !state.config?.allowDeletes || isBest ? "disabled" : "";
  const title = isBest
    ? "Best-scored file"
    : state.config?.allowDeletes
      ? "Delete"
      : "Deletes disabled";
  return `
    <button class="icon-button delete-file-button" data-file-id="${escapeHtml(file.id)}" ${disabled} title="${title}">
      <i data-lucide="trash-2"></i>
    </button>
  `;
}

function renderGroups() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const groups = (state.scan?.groups || []).filter((group) => {
    if (!query) return true;
    return [group.title, group.subtitle, group.libraryTitle, ...group.files.map((file) => file.file)]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  if (!groups.length) {
    elements.duplicatesList.innerHTML = `<div class="message">No duplicate groups found.</div>`;
    icons();
    return;
  }

  elements.duplicatesList.innerHTML = groups
    .map((group) => {
      const rows = group.files
        .map((file) => {
          const isBest = file.id === group.bestFileId;
          return `
            <div class="file-row">
              <div class="score ${isBest ? "best" : ""}">${file.score.value}</div>
              <div class="file-main">
                <div class="file-name">
                  <span>${escapeHtml(file.fileName || file.file)}</span>
                  ${isBest ? '<span class="keep-badge">Keep</span>' : ""}
                </div>
                <div class="file-path">${escapeHtml(file.file)}</div>
              </div>
              <div class="file-detail">
                <strong>${escapeHtml(fileVideoLabel(file))}</strong>
                <span>${escapeHtml(file.score.reasons.join(" | "))}</span>
              </div>
              <div class="file-detail">
                <strong>${escapeHtml(fileAudioLabel(file))}</strong>
                <span>${escapeHtml(`${file.container || file.extension || "file"} | ${formatDuration(file.duration)}`)}</span>
              </div>
              <div class="file-size">${formatBytes(file.size)}</div>
              ${deleteButton(file, isBest)}
            </div>
          `;
        })
        .join("");

      return `
        <article class="duplicate-group">
          <header class="group-header">
            <div class="group-title">
              <h2>${escapeHtml(group.title)}</h2>
              <p>${escapeHtml([group.libraryTitle, group.subtitle].filter(Boolean).join(" | "))}</p>
            </div>
            <div class="group-meta">
              <span class="pill">${escapeHtml(group.reason)}</span>
              <span class="pill">${group.files.length} files</span>
            </div>
          </header>
          ${rows}
        </article>
      `;
    })
    .join("");

  elements.duplicatesList.querySelectorAll(".delete-file-button").forEach((button) => {
    button.addEventListener("click", () => openDelete(button.dataset.fileId));
  });
  icons();
}

function findFile(fileId) {
  for (const group of state.scan?.groups || []) {
    const file = group.files.find((candidate) => candidate.id === fileId);
    if (file) return file;
  }
  return null;
}

function openDelete(fileId) {
  const file = findFile(fileId);
  if (!file) return;
  state.activeDelete = file;
  elements.deleteFileName.textContent = file.fileName || file.file;
  elements.deleteFilePath.textContent = file.file;
  elements.deleteConfirmInput.value = "";
  elements.deleteDialog.showModal();
  elements.deleteConfirmInput.focus();
}

async function loadConfig() {
  state.config = await api("/api/config");
  renderConfig();
}

async function loadStatus() {
  try {
    const status = await api("/api/status");
    setOnline(status);
    return true;
  } catch (error) {
    setOffline(error.message);
    return false;
  }
}

async function loadLibraries() {
  const { libraries } = await api("/api/libraries");
  state.libraries = libraries;
  state.selectedLibraries = new Set(
    libraries
      .filter((library) => ["movie", "show", "video"].includes(library.type))
      .map((library) => String(library.key))
  );
  renderLibraries();
}

async function refreshConnection() {
  await loadConfig();
  const online = await loadStatus();
  if (online) {
    await loadLibraries();
  } else {
    state.libraries = [];
    renderLibraries();
  }
}

async function scan() {
  setBusy(elements.scanButton, true, "Scanning");
  setMessage("");
  try {
    state.scan = await api("/api/scan", {
      method: "POST",
      body: JSON.stringify({
        libraryKeys: [...state.selectedLibraries]
      })
    });
    renderStats(state.scan.stats);
    renderGroups();
    if (state.scan.errors?.length) {
      setMessage(state.scan.errors.map((error) => `${error.library}: ${error.message}`).join(" | "), "error");
    }
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setBusy(elements.scanButton, false, "Scan");
  }
}

async function saveSettings(event) {
  event.preventDefault();
  if (elements.authPasswordInput.value !== elements.authPasswordConfirmInput.value) {
    setMessage("New password confirmation does not match.", "error");
    return;
  }

  const payload = {
    plexUrl: elements.plexUrlInput.value,
    allowDeletes: elements.allowDeletesInput.checked,
    scanPageSize: Number(elements.scanPageSizeInput.value || 200),
    authMode: elements.authModeInput.value,
    authUsername: elements.authUsernameInput.value,
    externalUserHeaders: elements.externalHeadersInput.value
  };
  if (elements.plexTokenInput.value) {
    payload.plexToken = elements.plexTokenInput.value;
  }
  if (elements.authPasswordInput.value) {
    payload.currentPassword = elements.currentPasswordInput.value;
    payload.authPassword = elements.authPasswordInput.value;
    payload.authPasswordConfirm = elements.authPasswordConfirmInput.value;
  }

  try {
    state.config = await api("/api/config", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderConfig();
    await refreshConnection();
    setMessage("Settings saved.");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function login(event) {
  event.preventDefault();
  setBusy(elements.loginForm.querySelector("button"), true, "Signing in");
  setLoginMessage("");
  try {
    const session = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: elements.loginUsernameInput.value,
        password: elements.loginPasswordInput.value
      })
    });
    showApp(session);
    await refreshConnection();
  } catch (error) {
    setLoginMessage(error.message, "error");
  } finally {
    setBusy(elements.loginForm.querySelector("button"), false, "Sign In");
  }
}

async function logout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  showLogin({ authMode: state.config?.auth?.mode || "builtin" });
}

async function deleteActiveFile(event) {
  event.preventDefault();
  if (!state.activeDelete) return;

  elements.confirmDeleteButton.disabled = true;
  try {
    await api("/api/delete", {
      method: "POST",
      body: JSON.stringify({
        partKey: state.activeDelete.partKey,
        confirmText: elements.deleteConfirmInput.value
      })
    });
    elements.deleteDialog.close();
    await scan();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    elements.confirmDeleteButton.disabled = false;
  }
}

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.view}View`).classList.add("active-view");
    });
  });
}

function setupEvents() {
  elements.loginForm.addEventListener("submit", login);
  elements.logoutButton.addEventListener("click", logout);
  elements.refreshButton.addEventListener("click", refreshConnection);
  elements.scanButton.addEventListener("click", scan);
  elements.searchInput.addEventListener("input", renderGroups);
  elements.settingsForm.addEventListener("submit", saveSettings);
  elements.testButton.addEventListener("click", refreshConnection);
  elements.confirmDeleteButton.addEventListener("click", deleteActiveFile);
}

async function boot() {
  icons();
  setupNavigation();
  setupEvents();
  renderStats();
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      showApp(session);
      await refreshConnection();
    } else {
      showLogin(session);
    }
  } catch (error) {
    showLogin({ authMode: "builtin" });
    setLoginMessage(error.message, "error");
  }
}

boot();
