const state = {
  config: null,
  session: null,
  libraries: [],
  selectedLibraries: new Set(),
  scan: null,
  groupSelections: new Map(),
  selectionMode: "manual",
  scanJob: null,
  scanStartedAt: null,
  scanPollTimer: null,
  scanElapsedTimer: null,
  activeDelete: null,
  preferenceOptions: {
    containers: [],
    videoCodecs: [],
    audioCodecs: []
  },
  preferenceSelections: {
    containers: new Set(),
    videoCodecs: new Set(),
    audioCodecs: new Set()
  }
};

const preferenceFields = [
  {
    key: "containers",
    input: "preferredContainersInput",
    format: (value) => `.${value}`
  },
  {
    key: "videoCodecs",
    input: "preferredVideoCodecsInput",
    format: (value) => value.toUpperCase()
  },
  {
    key: "audioCodecs",
    input: "preferredAudioCodecsInput",
    format: (value) => value.toUpperCase()
  }
];

const elements = {
  loginShell: document.querySelector("#loginShell"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginHint: document.querySelector("#loginHint"),
  loginUsernameInput: document.querySelector("#loginUsernameInput"),
  loginPasswordInput: document.querySelector("#loginPasswordInput"),
  loginMessage: document.querySelector("#loginMessage"),
  pageTitle: document.querySelector("#pageTitle"),
  serverSummary: document.querySelector("#serverSummary"),
  userBadge: document.querySelector("#userBadge"),
  connectionBadge: document.querySelector("#connectionBadge"),
  refreshButton: document.querySelector("#refreshButton"),
  logoutButton: document.querySelector("#logoutButton"),
  libraryStrip: document.querySelector("#libraryStrip"),
  scanButton: document.querySelector("#scanButton"),
  reviewModeSelect: document.querySelector("#reviewModeSelect"),
  autoSelectButton: document.querySelector("#autoSelectButton"),
  scanProgressPanel: document.querySelector("#scanProgressPanel"),
  scanProgressText: document.querySelector("#scanProgressText"),
  scanProgressMeta: document.querySelector("#scanProgressMeta"),
  scanProgressFill: document.querySelector("#scanProgressFill"),
  searchInput: document.querySelector("#searchInput"),
  groupCount: document.querySelector("#groupCount"),
  fileCount: document.querySelector("#fileCount"),
  reclaimCount: document.querySelector("#reclaimCount"),
  libraryCount: document.querySelector("#libraryCount"),
  messageArea: document.querySelector("#messageArea"),
  settingsMessageArea: document.querySelector("#settingsMessageArea"),
  duplicatesList: document.querySelector("#duplicatesList"),
  settingsForm: document.querySelector("#settingsForm"),
  plexUrlInput: document.querySelector("#plexUrlInput"),
  plexTokenInput: document.querySelector("#plexTokenInput"),
  scanPageSizeInput: document.querySelector("#scanPageSizeInput"),
  allowDeletesInput: document.querySelector("#allowDeletesInput"),
  selectionModeInput: document.querySelector("#selectionModeInput"),
  preferredContainersInput: document.querySelector("#preferredContainersInput"),
  preferredVideoCodecsInput: document.querySelector("#preferredVideoCodecsInput"),
  preferredAudioCodecsInput: document.querySelector("#preferredAudioCodecsInput"),
  selectionStatus: document.querySelector("#selectionStatus"),
  authModeInput: document.querySelector("#authModeInput"),
  authUsernameInput: document.querySelector("#authUsernameInput"),
  externalHeadersInput: document.querySelector("#externalHeadersInput"),
  currentPasswordInput: document.querySelector("#currentPasswordInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  authPasswordConfirmInput: document.querySelector("#authPasswordConfirmInput"),
  tokenStatus: document.querySelector("#tokenStatus"),
  authStatus: document.querySelector("#authStatus"),
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

function setSettingsMessage(message, type = "success") {
  elements.settingsMessageArea.innerHTML = message
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

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [
    ...new Set(
      values
        .map((value) => String(value || "").trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean)
    )
  ]
    .sort((a, b) => a.localeCompare(b));
}

function preferenceFieldConfig(key) {
  return preferenceFields.find((field) => field.key === key);
}

function preferenceControl(key) {
  return document.querySelector(`.multi-select[data-preference="${key}"]`);
}

function setPreferenceSelection(key, values) {
  state.preferenceSelections[key] = new Set(uniqueSorted(values));
}

function preferenceLabel(key, value) {
  const field = preferenceFieldConfig(key);
  return field?.format ? field.format(value) : value;
}

function preferenceValuesFromScan(scan) {
  const options = {
    containers: [],
    videoCodecs: [],
    audioCodecs: []
  };

  for (const group of scan?.groups || []) {
    for (const file of group.files || []) {
      options.containers.push(file.container, file.extension);
      options.videoCodecs.push(file.videoCodec, file.video?.codec);
      options.audioCodecs.push(
        file.audioCodec,
        ...(file.audioStreams || []).map((stream) => stream.codec)
      );
    }
  }

  return {
    containers: uniqueSorted(options.containers),
    videoCodecs: uniqueSorted(options.videoCodecs),
    audioCodecs: uniqueSorted(options.audioCodecs)
  };
}

function renderPreferenceControl(key) {
  const control = preferenceControl(key);
  const field = preferenceFieldConfig(key);
  if (!control || !field) return;

  const selected = state.preferenceSelections[key] || new Set();
  const options = uniqueSorted([...(state.preferenceOptions[key] || []), ...selected]);
  const trigger = control.querySelector(".multi-select-trigger");
  const summary = control.querySelector(".multi-select-summary");
  const menu = control.querySelector(".multi-select-menu");
  const input = elements[field.input];
  const selectedValues = [...selected];

  input.value = selectedValues.join(", ");
  summary.textContent = selectedValues.length
    ? selectedValues.map((value) => preferenceLabel(key, value)).join(", ")
    : options.length
      ? "Any"
      : "No scan values";
  trigger.disabled = !options.length;
  trigger.setAttribute("aria-expanded", control.classList.contains("open") ? "true" : "false");

  menu.innerHTML = options.length
    ? options
        .map((option) => {
          const checked = selected.has(option) ? "checked" : "";
          return `
            <label class="multi-select-option" role="option" aria-selected="${checked ? "true" : "false"}">
              <input type="checkbox" value="${escapeHtml(option)}" ${checked}>
              <span>${escapeHtml(preferenceLabel(key, option))}</span>
            </label>
          `;
        })
        .join("")
    : `<div class="multi-select-empty">No scan values</div>`;
}

function renderPreferenceControls() {
  preferenceFields.forEach((field) => renderPreferenceControl(field.key));
  icons();
}

function closePreferenceControls(exceptControl = null) {
  document.querySelectorAll(".multi-select.open").forEach((control) => {
    if (control === exceptControl) return;
    control.classList.remove("open");
    control.querySelector(".multi-select-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.querySelector("span").textContent = label;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderScanProgress(job, startedAt = state.scanStartedAt) {
  const progress = Math.max(0, Math.min(100, Number(job?.progress || 0)));
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  elements.scanProgressPanel.classList.remove("is-hidden");
  elements.scanProgressText.textContent = job?.message || "Scanning";
  elements.scanProgressMeta.textContent = `${Math.round(progress)}% | ${formatElapsed(elapsed)}`;
  elements.scanProgressFill.style.width = `${progress}%`;
}

function clearScanTimers() {
  if (state.scanPollTimer) {
    clearTimeout(state.scanPollTimer);
    state.scanPollTimer = null;
  }
  if (state.scanElapsedTimer) {
    clearInterval(state.scanElapsedTimer);
    state.scanElapsedTimer = null;
  }
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
  elements.plexTokenInput.placeholder = state.config.hasToken
    ? "Saved token hidden - paste to replace"
    : "Paste token to add or replace";
  elements.scanPageSizeInput.value = state.config.scanPageSize || 200;
  elements.allowDeletesInput.checked = Boolean(state.config.allowDeletes);
  state.selectionMode = state.config.selectionMode || "manual";
  elements.reviewModeSelect.value = state.selectionMode;
  elements.selectionModeInput.value = state.selectionMode;
  setPreferenceSelection("containers", state.config.keepPreferences?.containers || []);
  setPreferenceSelection("videoCodecs", state.config.keepPreferences?.videoCodecs || []);
  setPreferenceSelection("audioCodecs", state.config.keepPreferences?.audioCodecs || []);
  renderPreferenceControls();
  elements.selectionStatus.textContent = state.selectionMode === "auto" ? "Auto" : "Manual";
  elements.authModeInput.value = state.config.auth?.mode || "builtin";
  elements.authUsernameInput.value = state.config.auth?.username || "admin";
  elements.externalHeadersInput.value = (state.config.auth?.externalUserHeaders || []).join(", ");
  elements.tokenStatus.textContent = state.config.hasToken ? "Token saved" : "No token saved";
  elements.authStatus.textContent =
    state.config.auth?.mode === "external" ? "External" : "Built-in";
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

function plexFormPayload(includeAuth = false) {
  const payload = {
    plexUrl: elements.plexUrlInput.value,
    allowDeletes: elements.allowDeletesInput.checked,
    scanPageSize: Number(elements.scanPageSizeInput.value || 200),
    selectionMode: elements.selectionModeInput.value,
    keepPreferences: {
      containers: splitList(elements.preferredContainersInput.value),
      videoCodecs: splitList(elements.preferredVideoCodecsInput.value),
      audioCodecs: splitList(elements.preferredAudioCodecsInput.value)
    }
  };

  if (elements.plexTokenInput.value) {
    payload.plexToken = elements.plexTokenInput.value;
  }

  if (includeAuth) {
    payload.authMode = elements.authModeInput.value;
    payload.authUsername = elements.authUsernameInput.value;
    payload.externalUserHeaders = elements.externalHeadersInput.value;
    if (elements.authPasswordInput.value) {
      payload.currentPassword = elements.currentPasswordInput.value;
      payload.authPassword = elements.authPasswordInput.value;
      payload.authPasswordConfirm = elements.authPasswordConfirmInput.value;
    }
  }

  return payload;
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

function initializeGroupSelections() {
  state.groupSelections = new Map();
  if (state.selectionMode !== "auto") return;

  for (const group of state.scan?.groups || []) {
    const suggested = group.suggestedFileId || group.bestFileId;
    if (suggested) state.groupSelections.set(group.id, suggested);
  }
}

function autoSelectSuggested() {
  for (const group of state.scan?.groups || []) {
    const suggested = group.suggestedFileId || group.bestFileId;
    if (suggested) state.groupSelections.set(group.id, suggested);
  }
  renderGroups();
}

function setReviewMode(mode) {
  state.selectionMode = mode === "auto" ? "auto" : "manual";
  elements.reviewModeSelect.value = state.selectionMode;
  elements.selectionModeInput.value = state.selectionMode;
  elements.selectionStatus.textContent = state.selectionMode === "auto" ? "Auto" : "Manual";
  if (state.selectionMode === "auto") autoSelectSuggested();
  else {
    state.groupSelections.clear();
    renderGroups();
  }
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

function keepButton(group, file, isSelectedKeep) {
  const title = isSelectedKeep ? "Selected keeper" : "Select keeper";
  return `
    <button class="icon-button keep-file-button ${isSelectedKeep ? "selected" : ""}" data-group-id="${escapeHtml(group.id)}" data-file-id="${escapeHtml(file.id)}" title="${title}">
      <i data-lucide="${isSelectedKeep ? "check-circle-2" : "circle"}"></i>
    </button>
  `;
}

function deleteButton(file, selectedFileId) {
  const isSelectedKeep = file.id === selectedFileId;
  const disabled = !state.config?.allowDeletes || !selectedFileId || isSelectedKeep ? "disabled" : "";
  const title = !state.config?.allowDeletes
    ? "Deletes disabled"
    : !selectedFileId
      ? "Choose keeper first"
      : isSelectedKeep
        ? "Selected keeper"
        : "Delete";
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
      const suggestedFileId = group.suggestedFileId || group.bestFileId;
      const selectedFileId = state.groupSelections.get(group.id) || "";
      const rows = group.files
        .map((file) => {
          const isSuggested = file.id === suggestedFileId;
          const isSelectedKeep = file.id === selectedFileId;
          return `
            <div class="file-row ${isSelectedKeep ? "selected-keep" : ""} ${isSuggested ? "suggested-file" : ""}">
              <div class="score ${isSuggested ? "suggested" : ""}">${file.score.value}</div>
              <div class="file-main">
                <div class="file-name">
                  <span>${escapeHtml(file.fileName || file.file)}</span>
                  ${isSuggested ? '<span class="suggested-badge">Suggested</span>' : ""}
                  ${isSelectedKeep ? '<span class="keep-badge">Keep</span>' : ""}
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
              <div class="row-actions">
                ${keepButton(group, file, isSelectedKeep)}
                ${deleteButton(file, selectedFileId)}
              </div>
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
              <span class="pill">${selectedFileId ? "Keeper selected" : "Choose keeper"}</span>
            </div>
          </header>
          ${rows}
        </article>
      `;
    })
    .join("");

  elements.duplicatesList.querySelectorAll(".keep-file-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.groupSelections.set(button.dataset.groupId, button.dataset.fileId);
      renderGroups();
    });
  });
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
  clearScanTimers();
  setBusy(elements.scanButton, true, "Scanning");
  setMessage("");
  state.scanStartedAt = Date.now();
  state.scanJob = { status: "queued", progress: 0, message: "Starting scan" };
  renderScanProgress(state.scanJob);
  state.scanElapsedTimer = setInterval(() => {
    if (state.scanJob) renderScanProgress(state.scanJob);
  }, 1000);

  try {
    state.scanJob = await api("/api/scan", {
      method: "POST",
      body: JSON.stringify({
        libraryKeys: [...state.selectedLibraries]
      })
    });
    renderScanProgress(state.scanJob);

    while (["queued", "running"].includes(state.scanJob.status)) {
      await new Promise((resolve) => {
        state.scanPollTimer = setTimeout(resolve, 700);
      });
      state.scanJob = await api(`/api/scan/${state.scanJob.id}`);
      renderScanProgress(state.scanJob);
    }

    if (state.scanJob.status === "failed") {
      throw new Error(state.scanJob.error || "Scan failed.");
    }

    state.scan = state.scanJob.result;
    state.preferenceOptions = preferenceValuesFromScan(state.scan);
    renderPreferenceControls();
    initializeGroupSelections();
    renderStats(state.scan.stats);
    renderGroups();
    if (state.scan.errors?.length) {
      setMessage(state.scan.errors.map((error) => `${error.library}: ${error.message}`).join(" | "), "error");
    }
  } catch (error) {
    state.scanJob = {
      ...(state.scanJob || {}),
      status: "failed",
      progress: 100,
      message: "Scan failed",
      error: error.message
    };
    renderScanProgress(state.scanJob);
    setMessage(error.message, "error");
  } finally {
    clearScanTimers();
    if (state.scanJob) renderScanProgress(state.scanJob);
    setBusy(elements.scanButton, false, "Scan");
  }
}

async function saveSettings(event) {
  event.preventDefault();
  setSettingsMessage("");
  if (elements.authPasswordInput.value !== elements.authPasswordConfirmInput.value) {
    setSettingsMessage("New password confirmation does not match.", "error");
    return;
  }

  const payload = plexFormPayload(true);
  const previousSelectionMode = state.selectionMode;

  try {
    setBusy(elements.settingsForm.querySelector("button[type='submit']"), true, "Saving");
    state.config = await api("/api/config", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderConfig();
    if (state.scan && previousSelectionMode !== state.selectionMode) {
      initializeGroupSelections();
      renderGroups();
    }
    setSettingsMessage(
      state.config.hasToken
        ? "Settings saved. Plex token is stored and hidden."
        : "Settings saved. Add a Plex token before scanning."
    );
  } catch (error) {
    setSettingsMessage(error.message, "error");
  } finally {
    setBusy(elements.settingsForm.querySelector("button[type='submit']"), false, "Save");
  }
}

async function testPlexConnection() {
  setSettingsMessage("");
  setBusy(elements.testButton, true, "Testing");
  try {
    const result = await api("/api/test-plex", {
      method: "POST",
      body: JSON.stringify(plexFormPayload(false))
    });
    setOnline(result.server);
    setSettingsMessage(
      `Connected to ${result.server.friendlyName}. Found ${result.libraries.length} supported libraries.`
    );
  } catch (error) {
    setOffline(error.message);
    setSettingsMessage(error.message, "error");
  } finally {
    setBusy(elements.testButton, false, "Test");
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
      elements.pageTitle.textContent =
        button.dataset.view === "settings" ? "Settings" : "Duplicates";
    });
  });
}

function setupPreferenceControls() {
  document.querySelectorAll(".multi-select").forEach((control) => {
    const trigger = control.querySelector(".multi-select-trigger");
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !control.classList.contains("open");
      closePreferenceControls(willOpen ? control : null);
      control.classList.toggle("open", willOpen);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    control.addEventListener("change", (event) => {
      if (!event.target.matches("input[type='checkbox']")) return;
      const key = control.dataset.preference;
      setPreferenceSelection(
        key,
        [...control.querySelectorAll("input[type='checkbox']:checked")].map(
          (input) => input.value
        )
      );
      renderPreferenceControl(key);
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".multi-select")) closePreferenceControls();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePreferenceControls();
  });
}

function setupEvents() {
  elements.loginForm.addEventListener("submit", login);
  elements.logoutButton.addEventListener("click", logout);
  elements.refreshButton.addEventListener("click", refreshConnection);
  elements.scanButton.addEventListener("click", scan);
  elements.reviewModeSelect.addEventListener("change", () => setReviewMode(elements.reviewModeSelect.value));
  elements.autoSelectButton.addEventListener("click", autoSelectSuggested);
  elements.searchInput.addEventListener("input", renderGroups);
  elements.selectionModeInput.addEventListener("change", () => setReviewMode(elements.selectionModeInput.value));
  elements.settingsForm.addEventListener("submit", saveSettings);
  elements.testButton.addEventListener("click", testPlexConnection);
  elements.confirmDeleteButton.addEventListener("click", deleteActiveFile);
}

async function boot() {
  icons();
  setupNavigation();
  setupPreferenceControls();
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
