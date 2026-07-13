const SUBTITLE_GROUP_RENDER_BATCH = 75;
const DELETE_CONCURRENCY = 4;
const DELETE_FAILURE_SAMPLE_LIMIT = 8;
const DELETE_PROGRESS_UPDATE_MS = 120;

const state = {
  config: null,
  session: null,
  libraries: [],
  selectedLibraries: new Set(),
  scan: null,
  subtitleScan: null,
  groupSelections: new Map(),
  subtitleGroupSelections: new Map(),
  selectionMode: "manual",
  scanJob: null,
  scanStartedAt: null,
  scanPollTimer: null,
  scanElapsedTimer: null,
  subtitleScanJob: null,
  subtitleScanStartedAt: null,
  subtitleScanPollTimer: null,
  subtitleScanElapsedTimer: null,
  subtitleRenderLimit: SUBTITLE_GROUP_RENDER_BATCH,
  activeDelete: null,
  deleteInProgress: false,
  preferenceOptions: {
    containers: [],
    videoCodecs: [],
    audioCodecs: [],
    subtitleLanguages: [],
    subtitleFormats: [],
    subtitleFlags: []
  },
  preferenceSelections: {
    containers: new Set(),
    videoCodecs: new Set(),
    audioCodecs: new Set(),
    subtitleLanguages: new Set(),
    subtitleFormats: new Set(),
    subtitleFlags: new Set()
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
  },
  {
    key: "subtitleLanguages",
    input: "preferredSubtitleLanguagesInput",
    format: (value) => value.replace(/\b\w/g, (character) => character.toUpperCase())
  },
  {
    key: "subtitleFormats",
    input: "preferredSubtitleFormatsInput",
    format: (value) => `.${value}`
  },
  {
    key: "subtitleFlags",
    input: "preferredSubtitleFlagsInput",
    format: (value) =>
      ({
        selected: "Selected in Plex",
        default: "Default",
        forced: "Forced",
        sdh: "SDH/CC",
        standard: "Standard",
        "auto-sync": "Auto-sync"
      })[value] || value.replace(/\b\w/g, (character) => character.toUpperCase())
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
  subtitleLibraryStrip: document.querySelector("#subtitleLibraryStrip"),
  scanButton: document.querySelector("#scanButton"),
  subtitleScanButton: document.querySelector("#subtitleScanButton"),
  reviewModeSelect: document.querySelector("#reviewModeSelect"),
  autoSelectButton: document.querySelector("#autoSelectButton"),
  subtitleAutoSelectButton: document.querySelector("#subtitleAutoSelectButton"),
  deleteRejectedButton: document.querySelector("#deleteRejectedButton"),
  deleteRejectedSubtitlesButton: document.querySelector("#deleteRejectedSubtitlesButton"),
  scanProgressPanel: document.querySelector("#scanProgressPanel"),
  scanProgressText: document.querySelector("#scanProgressText"),
  scanProgressMeta: document.querySelector("#scanProgressMeta"),
  scanProgressFill: document.querySelector("#scanProgressFill"),
  subtitleScanProgressPanel: document.querySelector("#subtitleScanProgressPanel"),
  subtitleScanProgressText: document.querySelector("#subtitleScanProgressText"),
  subtitleScanProgressMeta: document.querySelector("#subtitleScanProgressMeta"),
  subtitleScanProgressFill: document.querySelector("#subtitleScanProgressFill"),
  searchInput: document.querySelector("#searchInput"),
  subtitleSearchInput: document.querySelector("#subtitleSearchInput"),
  groupCount: document.querySelector("#groupCount"),
  fileCount: document.querySelector("#fileCount"),
  reclaimCount: document.querySelector("#reclaimCount"),
  libraryCount: document.querySelector("#libraryCount"),
  subtitleGroupCount: document.querySelector("#subtitleGroupCount"),
  subtitleFileCount: document.querySelector("#subtitleFileCount"),
  subtitleRejectedCount: document.querySelector("#subtitleRejectedCount"),
  subtitleLibraryCount: document.querySelector("#subtitleLibraryCount"),
  messageArea: document.querySelector("#messageArea"),
  subtitleMessageArea: document.querySelector("#subtitleMessageArea"),
  settingsMessageArea: document.querySelector("#settingsMessageArea"),
  duplicatesList: document.querySelector("#duplicatesList"),
  subtitlesList: document.querySelector("#subtitlesList"),
  settingsForm: document.querySelector("#settingsForm"),
  plexUrlInput: document.querySelector("#plexUrlInput"),
  plexTokenInput: document.querySelector("#plexTokenInput"),
  scanPageSizeInput: document.querySelector("#scanPageSizeInput"),
  allowDeletesInput: document.querySelector("#allowDeletesInput"),
  selectionModeInput: document.querySelector("#selectionModeInput"),
  preferredContainersInput: document.querySelector("#preferredContainersInput"),
  preferredVideoCodecsInput: document.querySelector("#preferredVideoCodecsInput"),
  preferredAudioCodecsInput: document.querySelector("#preferredAudioCodecsInput"),
  preferredSubtitleLanguagesInput: document.querySelector("#preferredSubtitleLanguagesInput"),
  preferredSubtitleFormatsInput: document.querySelector("#preferredSubtitleFormatsInput"),
  preferredSubtitleFlagsInput: document.querySelector("#preferredSubtitleFlagsInput"),
  deleteNonPreferredSubtitleLanguagesInput: document.querySelector("#deleteNonPreferredSubtitleLanguagesInput"),
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
  deleteDialogTitle: document.querySelector("#deleteDialogTitle"),
  deleteFileName: document.querySelector("#deleteFileName"),
  deleteFilePath: document.querySelector("#deleteFilePath"),
  deleteConfirmLabel: document.querySelector("#deleteConfirmLabel"),
  deleteConfirmInput: document.querySelector("#deleteConfirmInput"),
  deleteProgressPanel: document.querySelector("#deleteProgressPanel"),
  deleteProgressText: document.querySelector("#deleteProgressText"),
  deleteProgressMeta: document.querySelector("#deleteProgressMeta"),
  deleteProgressFill: document.querySelector("#deleteProgressFill"),
  deleteLogPanel: document.querySelector("#deleteLogPanel"),
  deleteLogCount: document.querySelector("#deleteLogCount"),
  deleteLogEntries: document.querySelector("#deleteLogEntries"),
  confirmDeleteButton: document.querySelector("#confirmDeleteButton"),
  deleteCancelButtons: document.querySelectorAll("#deleteDialog button[value='cancel']")
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
    const error = new Error(data.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.details = data.details || {};
    throw error;
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

function setSubtitleMessage(message, type = "") {
  elements.subtitleMessageArea.innerHTML = message
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

function subtitleFlagOptions(subtitle) {
  const flags = [];
  if (subtitle.selected) flags.push("selected");
  if (subtitle.default) flags.push("default");
  if (subtitle.forced) flags.push("forced");
  if (subtitle.hearingImpaired) flags.push("sdh");
  else flags.push("standard");
  if (subtitle.canAutoSync) flags.push("auto-sync");
  return flags;
}

function preferenceValuesFromSubtitleScan(scan) {
  const options = {
    subtitleLanguages: [],
    subtitleFormats: [],
    subtitleFlags: []
  };

  for (const group of scan?.groups || []) {
    for (const subtitle of group.subtitles || []) {
      options.subtitleLanguages.push(subtitle.language, subtitle.languageCode);
      options.subtitleFormats.push(subtitle.extension, subtitle.codec);
      options.subtitleFlags.push(...subtitleFlagOptions(subtitle));
    }
  }

  return {
    subtitleLanguages: uniqueSorted(options.subtitleLanguages),
    subtitleFormats: uniqueSorted(options.subtitleFormats),
    subtitleFlags: uniqueSorted(options.subtitleFlags)
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

function formatInteger(value) {
  return Number(value || 0).toLocaleString();
}

function renderScanProgress(job, startedAt = state.scanStartedAt) {
  const progress = Math.max(0, Math.min(100, Number(job?.progress || 0)));
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  elements.scanProgressPanel.classList.remove("is-hidden");
  elements.scanProgressText.textContent = job?.message || "Scanning";
  elements.scanProgressMeta.textContent = `${Math.round(progress)}% | ${formatElapsed(elapsed)}`;
  elements.scanProgressFill.style.width = `${progress}%`;
}

function renderSubtitleScanProgress(job, startedAt = state.subtitleScanStartedAt) {
  const progress = Math.max(0, Math.min(100, Number(job?.progress || 0)));
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  elements.subtitleScanProgressPanel.classList.remove("is-hidden");
  elements.subtitleScanProgressText.textContent = job?.message || "Scanning";
  elements.subtitleScanProgressMeta.textContent = `${Math.round(progress)}% | ${formatElapsed(elapsed)}`;
  elements.subtitleScanProgressFill.style.width = `${progress}%`;
}

function renderDeleteProgress({ completed = 0, total = 0, failures = 0, message = "Deleting" }) {
  const progress = total ? Math.max(0, Math.min(100, (completed / total) * 100)) : 0;
  const failureText = failures ? ` | ${formatInteger(failures)} failed` : "";
  elements.deleteProgressPanel.classList.remove("is-hidden");
  elements.deleteProgressText.textContent = message;
  elements.deleteProgressMeta.textContent = `${formatInteger(completed)} / ${formatInteger(total)}${failureText}`;
  elements.deleteProgressFill.style.width = `${progress}%`;
}

function resetDeleteProgress() {
  elements.deleteProgressPanel.classList.add("is-hidden");
  elements.deleteProgressText.textContent = "Queued";
  elements.deleteProgressMeta.textContent = "0 / 0";
  elements.deleteProgressFill.style.width = "0%";
}

function resetDeleteLog() {
  elements.deleteLogPanel.classList.add("is-hidden");
  elements.deleteLogCount.textContent = "0 failed";
  elements.deleteLogEntries.innerHTML = "";
}

function renderDeleteLog(failureCount = 0, samples = []) {
  if (!failureCount) {
    resetDeleteLog();
    return;
  }

  elements.deleteLogPanel.classList.remove("is-hidden");
  elements.deleteLogCount.textContent = `${formatInteger(failureCount)} failed`;
  const omitted = Math.max(failureCount - samples.length, 0);
  elements.deleteLogEntries.innerHTML =
    samples
      .map(
        (sample) => `
          <div class="delete-log-entry">
            <strong>${escapeHtml(sample.name)}</strong>
            <span>${escapeHtml(sample.message)}</span>
            ${sample.target ? `<code>${escapeHtml(sample.target)}</code>` : ""}
          </div>
        `
      )
      .join("") +
    (omitted
      ? `<div class="delete-log-more">${formatInteger(omitted)} more failures not shown</div>`
      : "");
}

function setDeleteDialogBusy(busy) {
  state.deleteInProgress = busy;
  elements.confirmDeleteButton.disabled = busy;
  elements.deleteConfirmInput.disabled = busy;
  elements.deleteRejectedButton.disabled = busy;
  elements.deleteRejectedSubtitlesButton.disabled = busy;
  elements.deleteCancelButtons.forEach((button) => {
    button.disabled = busy;
  });
}

function prepareDeleteDialog() {
  state.deleteInProgress = false;
  elements.confirmDeleteButton.disabled = false;
  elements.deleteConfirmInput.disabled = false;
  elements.deleteCancelButtons.forEach((button) => {
    button.disabled = false;
  });
  resetDeleteProgress();
  resetDeleteLog();
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

function clearSubtitleScanTimers() {
  if (state.subtitleScanPollTimer) {
    clearTimeout(state.subtitleScanPollTimer);
    state.subtitleScanPollTimer = null;
  }
  if (state.subtitleScanElapsedTimer) {
    clearInterval(state.subtitleScanElapsedTimer);
    state.subtitleScanElapsedTimer = null;
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
  setPreferenceSelection("subtitleLanguages", state.config.subtitlePreferences?.languages || []);
  setPreferenceSelection("subtitleFormats", state.config.subtitlePreferences?.formats || []);
  setPreferenceSelection("subtitleFlags", state.config.subtitlePreferences?.flags || []);
  elements.deleteNonPreferredSubtitleLanguagesInput.checked = Boolean(
    state.config.subtitlePreferences?.deleteNonPreferredLanguages
  );
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
    },
    subtitlePreferences: {
      languages: splitList(elements.preferredSubtitleLanguagesInput.value),
      formats: splitList(elements.preferredSubtitleFormatsInput.value),
      flags: splitList(elements.preferredSubtitleFlagsInput.value),
      deleteNonPreferredLanguages: elements.deleteNonPreferredSubtitleLanguagesInput.checked
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

function renderLibraryStrip(strip) {
  if (!strip) return;
  if (!state.libraries.length) {
    strip.innerHTML = `<span class="pill">No libraries</span>`;
    return;
  }

  strip.innerHTML = state.libraries
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

  strip.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.selectedLibraries.add(input.value);
      else state.selectedLibraries.delete(input.value);
      renderLibraries();
    });
  });
}

function renderLibraries() {
  renderLibraryStrip(elements.libraryStrip);
  renderLibraryStrip(elements.subtitleLibraryStrip);
}

function renderStats(stats = {}) {
  elements.groupCount.textContent = stats.groups || 0;
  elements.fileCount.textContent = stats.files || 0;
  elements.reclaimCount.textContent = formatBytes(stats.reclaimableBytes || 0);
  elements.libraryCount.textContent = stats.libraries || state.libraries.length || 0;
}

function renderSubtitleStats(stats = {}) {
  elements.subtitleGroupCount.textContent = stats.groups || 0;
  elements.subtitleFileCount.textContent = stats.sidecars || 0;
  elements.subtitleRejectedCount.textContent = rejectedSubtitleTargets().length;
  elements.subtitleLibraryCount.textContent = stats.libraries || state.libraries.length || 0;
}

function initializeGroupSelections() {
  state.groupSelections = new Map();
  if (state.selectionMode !== "auto") return;

  for (const group of state.scan?.groups || []) {
    const suggested = group.suggestedFileId || group.bestFileId;
    if (suggested) state.groupSelections.set(group.id, suggested);
  }
}

function initializeSubtitleSelections() {
  state.subtitleGroupSelections = new Map();
}

function autoSelectSuggested() {
  for (const group of state.scan?.groups || []) {
    const suggested = group.suggestedFileId || group.bestFileId;
    if (suggested) state.groupSelections.set(group.id, suggested);
  }
  renderGroups();
}

function autoSelectSuggestedSubtitles() {
  let selected = 0;
  let deleteAll = 0;
  for (const group of state.subtitleScan?.groups || []) {
    if (group.deleteAll) {
      state.subtitleGroupSelections.delete(group.id);
      deleteAll += 1;
      continue;
    }
    const suggested = group.suggestedSubtitleId;
    if (suggested) {
      state.subtitleGroupSelections.set(group.id, suggested);
      selected += 1;
    }
  }
  renderSubtitleGroups();
  setSubtitleMessage(
    selected || deleteAll
      ? `Selected suggested keepers for ${selected} groups; ${deleteAll} groups marked delete all.`
      : "No subtitle suggestions to select.",
    selected || deleteAll ? "success" : ""
  );
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

function mediaTargetKey(file) {
  if (!file?.ratingKey || !file?.mediaId) return "";
  return `${file.ratingKey}:${file.mediaId}`;
}

function rejectedMediaTargets() {
  if (state.selectionMode !== "auto") return [];

  const targets = new Map();
  for (const group of state.scan?.groups || []) {
    const keeperId = state.groupSelections.get(group.id);
    const keeper = group.files.find((file) => file.id === keeperId);
    const keeperTarget = mediaTargetKey(keeper);
    if (!keeper || !keeperTarget) continue;

    for (const file of group.files) {
      const target = mediaTargetKey(file);
      if (!target || target === keeperTarget || file.id === keeperId) continue;

      const existing = targets.get(target);
      if (existing) existing.size += Number(file.size || 0);
      else targets.set(target, { ...file, size: Number(file.size || 0) });
    }
  }

  return [...targets.values()];
}

function subtitleTargetKey(subtitle) {
  if (!subtitle?.streamId) return "";
  return `${subtitle.streamId}:${subtitle.extension || "srt"}`;
}

function rejectedSubtitleTargets() {
  const targets = new Map();
  for (const group of state.subtitleScan?.groups || []) {
    const keeperId = state.subtitleGroupSelections.get(group.id);
    if (!keeperId && !group.deleteAll) continue;

    for (const subtitle of group.subtitles || []) {
      if (!group.deleteAll && subtitle.id === keeperId) continue;
      const target = subtitleTargetKey(subtitle);
      if (target) targets.set(target, subtitle);
    }
  }

  return [...targets.values()];
}

function updateBulkDeleteButton() {
  const targets = rejectedMediaTargets();
  const isAuto = state.selectionMode === "auto";
  elements.deleteRejectedButton.classList.toggle("is-hidden", !isAuto);
  elements.deleteRejectedButton.disabled = !state.config?.allowDeletes || !targets.length;
  elements.deleteRejectedButton.querySelector("span").textContent = targets.length
    ? `Delete ${targets.length} Rejected`
    : "Delete Rejected";
  elements.deleteRejectedButton.title = !state.config?.allowDeletes
    ? "Deletes disabled in Settings"
    : targets.length
      ? `Delete ${targets.length} media versions not selected to keep`
      : "No rejected media versions to delete";
}

function updateBulkSubtitleDeleteButton() {
  const targets = rejectedSubtitleTargets();
  elements.deleteRejectedSubtitlesButton.disabled = !state.config?.allowDeletes || !targets.length;
  elements.deleteRejectedSubtitlesButton.querySelector("span").textContent = targets.length
    ? `Delete ${targets.length} Rejected`
    : "Delete Rejected";
  elements.deleteRejectedSubtitlesButton.title = !state.config?.allowDeletes
    ? "Deletes disabled in Settings"
    : targets.length
      ? `Delete ${targets.length} subtitle sidecars not selected to keep`
      : "No rejected subtitle sidecars to delete";
  renderSubtitleStats(state.subtitleScan?.stats || {});
}

function renderGroups() {
  updateBulkDeleteButton();
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

function subtitleFlagsLabel(subtitle) {
  return [
    subtitle.forced ? "Forced" : "",
    subtitle.hearingImpaired ? "SDH/CC" : "",
    subtitle.default ? "Default" : "",
    subtitle.selected ? "Selected" : "",
    subtitle.canAutoSync ? "Auto-sync" : ""
  ]
    .filter(Boolean)
    .join(" | ");
}

function subtitleFormatLabel(subtitle) {
  return [
    subtitle.extension ? subtitle.extension.toUpperCase() : "",
    subtitle.source,
    subtitle.streamId ? `ID ${subtitle.streamId}` : ""
  ]
    .filter(Boolean)
    .join(" | ");
}

function subtitleKeepButton(group, subtitle, isSelectedKeep) {
  const title = isSelectedKeep ? "Selected keeper" : "Select keeper";
  return `
    <button class="icon-button keep-subtitle-button ${isSelectedKeep ? "selected" : ""}" data-group-id="${escapeHtml(group.id)}" data-subtitle-id="${escapeHtml(subtitle.id)}" title="${title}">
      <i data-lucide="${isSelectedKeep ? "check-circle-2" : "circle"}"></i>
    </button>
  `;
}

function subtitleDeleteButton(subtitle, selectedSubtitleId) {
  const isSelectedKeep = subtitle.id === selectedSubtitleId;
  const deleteAll = Boolean(subtitle.deleteAll);
  const disabled = !state.config?.allowDeletes || (!selectedSubtitleId && !deleteAll) || isSelectedKeep ? "disabled" : "";
  const title = !state.config?.allowDeletes
    ? "Deletes disabled"
    : !selectedSubtitleId && !deleteAll
      ? "Choose keeper first"
      : isSelectedKeep
        ? "Selected keeper"
        : "Delete";
  return `
    <button class="icon-button delete-subtitle-button" data-subtitle-id="${escapeHtml(subtitle.id)}" ${disabled} title="${title}">
      <i data-lucide="trash-2"></i>
    </button>
  `;
}

function renderSubtitleGroups() {
  updateBulkSubtitleDeleteButton();
  const query = elements.subtitleSearchInput.value.trim().toLowerCase();
  const groups = (state.subtitleScan?.groups || []).filter((group) => {
    if (!query) return true;
    return [
      group.title,
      group.subtitle,
      group.libraryTitle,
      group.partFile,
      group.language,
      ...(group.subtitles || []).flatMap((subtitle) => [
        subtitle.displayTitle,
        subtitle.streamTitle,
        subtitle.sidecarPath,
        subtitle.streamKey,
        subtitle.extension,
        subtitle.source
      ])
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  if (!groups.length) {
    elements.subtitlesList.innerHTML = `<div class="message">No subtitle cleanup groups found.</div>`;
    icons();
    return;
  }

  const visibleGroups = groups.slice(0, state.subtitleRenderLimit);
  const hiddenCount = Math.max(groups.length - visibleGroups.length, 0);

  elements.subtitlesList.innerHTML = visibleGroups
    .map((group) => {
      const selectedSubtitleId = state.subtitleGroupSelections.get(group.id) || "";
      const rows = (group.subtitles || [])
        .map((subtitle) => {
          const isSuggested = subtitle.id === group.suggestedSubtitleId;
          const isSelectedKeep = subtitle.id === selectedSubtitleId;
          const subtitleAction = { ...subtitle, deleteAll: group.deleteAll };
          const path = subtitle.sidecarPath || subtitle.streamKey || group.partFile;
          return `
            <div class="file-row subtitle-row ${isSelectedKeep ? "selected-keep" : ""} ${isSuggested ? "suggested-file" : ""} ${group.deleteAll ? "delete-all-row" : ""}">
              <div class="score ${isSuggested ? "suggested" : ""}">${subtitle.score?.value || 0}</div>
              <div class="file-main">
                <div class="file-name">
                  <span>${escapeHtml(subtitle.displayTitle || subtitle.streamTitle || subtitle.language || "Subtitle")}</span>
                  ${isSuggested ? '<span class="suggested-badge">Suggested</span>' : ""}
                  ${isSelectedKeep ? '<span class="keep-badge">Keep</span>' : ""}
                  ${group.deleteAll ? '<span class="delete-badge">Delete All</span>' : ""}
                </div>
                <div class="file-path">${escapeHtml(path)}</div>
              </div>
              <div class="file-detail">
                <strong>${escapeHtml(subtitle.language || "Unknown")}</strong>
                <span>${escapeHtml(subtitleFlagsLabel(subtitle) || "Standard")}</span>
              </div>
              <div class="file-detail">
                <strong>${escapeHtml(subtitleFormatLabel(subtitle))}</strong>
                <span>${escapeHtml((subtitle.score?.reasons || []).join(" | "))}</span>
              </div>
              <div class="row-actions">
                ${group.deleteAll ? "" : subtitleKeepButton(group, subtitle, isSelectedKeep)}
                ${subtitleDeleteButton(subtitleAction, selectedSubtitleId)}
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
              <p>${escapeHtml([group.libraryTitle, group.subtitle, group.partFileName].filter(Boolean).join(" | "))}</p>
            </div>
            <div class="group-meta">
              <span class="pill">${escapeHtml(group.reason)}</span>
              <span class="pill">${group.subtitles.length} sidecars</span>
              <span class="pill">${group.deleteAll ? "Delete all" : selectedSubtitleId ? "Keeper selected" : "Choose keeper"}</span>
            </div>
          </header>
          ${rows}
        </article>
      `;
    })
    .join("") +
    (hiddenCount
      ? `
        <div class="list-more-panel">
          <span>Showing ${visibleGroups.length} of ${groups.length} subtitle groups</span>
          <button id="loadMoreSubtitlesButton" class="secondary-button" type="button">
            <i data-lucide="list-plus"></i>
            <span>Show More</span>
          </button>
        </div>
      `
      : "");

  elements.subtitlesList.querySelectorAll(".keep-subtitle-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.subtitleGroupSelections.set(button.dataset.groupId, button.dataset.subtitleId);
      renderSubtitleGroups();
    });
  });
  elements.subtitlesList.querySelectorAll(".delete-subtitle-button").forEach((button) => {
    button.addEventListener("click", () => openSubtitleDelete(button.dataset.subtitleId));
  });
  elements.subtitlesList.querySelector("#loadMoreSubtitlesButton")?.addEventListener("click", () => {
    state.subtitleRenderLimit += SUBTITLE_GROUP_RENDER_BATCH;
    renderSubtitleGroups();
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

function findSubtitle(subtitleId) {
  for (const group of state.subtitleScan?.groups || []) {
    const subtitle = group.subtitles.find((candidate) => candidate.id === subtitleId);
    if (subtitle) return subtitle;
  }
  return null;
}

function openDelete(fileId) {
  const file = findFile(fileId);
  if (!file) return;
  state.activeDelete = { kind: "media", mode: "single", targets: [file] };
  prepareDeleteDialog();
  elements.deleteDialogTitle.textContent = "Delete File";
  elements.deleteFileName.textContent = file.fileName || file.file;
  elements.deleteFilePath.textContent = file.file;
  elements.deleteConfirmLabel.textContent = "Type DELETE to confirm";
  elements.deleteConfirmInput.placeholder = "DELETE";
  elements.deleteConfirmInput.value = "";
  elements.deleteConfirmInput.setCustomValidity("");
  elements.deleteDialog.showModal();
  elements.deleteConfirmInput.focus();
}

function openBulkDelete() {
  const targets = rejectedMediaTargets();
  if (!targets.length || !state.config?.allowDeletes) return;

  state.activeDelete = { kind: "media", mode: "bulk", targets };
  prepareDeleteDialog();
  elements.deleteDialogTitle.textContent = "Delete Rejected Versions";
  elements.deleteFileName.textContent = `${targets.length} media versions will be permanently deleted`;
  elements.deleteFilePath.textContent = `${formatBytes(
    targets.reduce((sum, file) => sum + Number(file.size || 0), 0)
  )} across all scanned duplicate groups`;
  elements.deleteConfirmLabel.textContent = "Type DELETE ALL to confirm";
  elements.deleteConfirmInput.placeholder = "DELETE ALL";
  elements.deleteConfirmInput.value = "";
  elements.deleteConfirmInput.setCustomValidity("");
  elements.deleteDialog.showModal();
  elements.deleteConfirmInput.focus();
}

function openSubtitleDelete(subtitleId) {
  const subtitle = findSubtitle(subtitleId);
  if (!subtitle) return;
  state.activeDelete = { kind: "subtitle", mode: "single", targets: [subtitle] };
  prepareDeleteDialog();
  elements.deleteDialogTitle.textContent = "Delete Subtitle";
  elements.deleteFileName.textContent = subtitle.displayTitle || subtitle.streamTitle || "Subtitle sidecar";
  elements.deleteFilePath.textContent = subtitle.sidecarPath || subtitle.streamKey || subtitle.partFile;
  elements.deleteConfirmLabel.textContent = "Type DELETE to confirm";
  elements.deleteConfirmInput.placeholder = "DELETE";
  elements.deleteConfirmInput.value = "";
  elements.deleteConfirmInput.setCustomValidity("");
  elements.deleteDialog.showModal();
  elements.deleteConfirmInput.focus();
}

function openBulkSubtitleDelete() {
  const targets = rejectedSubtitleTargets();
  if (!targets.length || !state.config?.allowDeletes) return;

  state.activeDelete = { kind: "subtitle", mode: "bulk", targets };
  prepareDeleteDialog();
  elements.deleteDialogTitle.textContent = "Delete Rejected Subtitles";
  elements.deleteFileName.textContent = `${targets.length} subtitle sidecars will be permanently deleted`;
  elements.deleteFilePath.textContent = `${new Set(targets.map((subtitle) => subtitle.partFile)).size} media files across scanned subtitle cleanup groups`;
  elements.deleteConfirmLabel.textContent = "Type DELETE ALL to confirm";
  elements.deleteConfirmInput.placeholder = "DELETE ALL";
  elements.deleteConfirmInput.value = "";
  elements.deleteConfirmInput.setCustomValidity("");
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
    state.preferenceOptions = {
      ...state.preferenceOptions,
      ...preferenceValuesFromScan(state.scan)
    };
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

async function subtitleScan() {
  clearSubtitleScanTimers();
  setBusy(elements.subtitleScanButton, true, "Scanning");
  setSubtitleMessage("");
  state.subtitleScanStartedAt = Date.now();
  state.subtitleScanJob = { status: "queued", progress: 0, message: "Starting scan" };
  renderSubtitleScanProgress(state.subtitleScanJob);
  state.subtitleScanElapsedTimer = setInterval(() => {
    if (state.subtitleScanJob) renderSubtitleScanProgress(state.subtitleScanJob);
  }, 1000);

  try {
    state.subtitleScanJob = await api("/api/subtitle-scan", {
      method: "POST",
      body: JSON.stringify({
        libraryKeys: [...state.selectedLibraries]
      })
    });
    renderSubtitleScanProgress(state.subtitleScanJob);

    while (["queued", "running"].includes(state.subtitleScanJob.status)) {
      await new Promise((resolve) => {
        state.subtitleScanPollTimer = setTimeout(resolve, 700);
      });
      state.subtitleScanJob = await api(`/api/subtitle-scan/${state.subtitleScanJob.id}`);
      renderSubtitleScanProgress(state.subtitleScanJob);
    }

    if (state.subtitleScanJob.status === "failed") {
      throw new Error(state.subtitleScanJob.error || "Subtitle scan failed.");
    }

    state.subtitleScan = state.subtitleScanJob.result;
    state.subtitleRenderLimit = SUBTITLE_GROUP_RENDER_BATCH;
    state.preferenceOptions = {
      ...state.preferenceOptions,
      ...preferenceValuesFromSubtitleScan(state.subtitleScan)
    };
    renderPreferenceControls();
    initializeSubtitleSelections();
    renderSubtitleStats(state.subtitleScan.stats);
    renderSubtitleGroups();
    if (state.subtitleScan.errors?.length) {
      setSubtitleMessage(
        state.subtitleScan.errors.map((error) => `${error.library}: ${error.message}`).join(" | "),
        "error"
      );
    }
  } catch (error) {
    state.subtitleScanJob = {
      ...(state.subtitleScanJob || {}),
      status: "failed",
      progress: 100,
      message: "Subtitle scan failed",
      error: error.message
    };
    renderSubtitleScanProgress(state.subtitleScanJob);
    setSubtitleMessage(error.message, "error");
  } finally {
    clearSubtitleScanTimers();
    if (state.subtitleScanJob) renderSubtitleScanProgress(state.subtitleScanJob);
    setBusy(elements.subtitleScanButton, false, "Scan");
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

function deleteTarget(target, kind) {
  if (kind === "subtitle") {
    return api("/api/subtitle-delete", {
      method: "POST",
      body: JSON.stringify({
        streamId: target.streamId,
        streamKey: target.streamKey,
        extension: target.extension,
        title: target.displayTitle || target.streamTitle || target.title,
        sidecarPath: target.sidecarPath,
        confirmText: "DELETE"
      })
    });
  }

  return api("/api/delete", {
    method: "POST",
    body: JSON.stringify({
      ratingKey: target.ratingKey,
      mediaId: target.mediaId,
      confirmText: "DELETE"
    })
  });
}

function deleteTargetLabel(kind) {
  return kind === "subtitle" ? "subtitle sidecars" : "media versions";
}

function deleteTargetName(target, kind) {
  if (kind === "subtitle") {
    return target.displayTitle || target.streamTitle || target.language || "Subtitle sidecar";
  }
  return target.fileName || target.file || "Media version";
}

function deleteTargetPath(target, kind) {
  if (kind === "subtitle") {
    return target.sidecarPath || target.streamKey || target.partFile || "";
  }
  return target.file || "";
}

function deleteFailureMessage(error) {
  const details = error.details || {};
  const status = details.plexStatus || error.status || "";
  const body = details.plexBody || "";
  const target = details.target || "";
  const parts = [
    status ? `HTTP ${status}` : "",
    details.plexStatusText,
    body,
    !body ? error.message : "",
    target ? `target ${target}` : ""
  ].filter(Boolean);
  return parts.join(" | ") || error.message || "Delete failed";
}

function deleteFailureSample(target, kind, error) {
  return {
    name: deleteTargetName(target, kind),
    target: deleteTargetPath(target, kind),
    message: deleteFailureMessage(error)
  };
}

function waitForPaint() {
  return new Promise((resolve) => {
    if (window.requestAnimationFrame) window.requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

async function deleteTargetsWithProgress(targets, kind, bulk) {
  const failures = [];
  const failureSamples = [];
  const deletedTargets = [];
  const total = targets.length;
  let cursor = 0;
  let completed = 0;
  let lastProgressUpdate = 0;

  const paint = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressUpdate < DELETE_PROGRESS_UPDATE_MS && completed < total) return;
    lastProgressUpdate = now;
    renderDeleteProgress({
      completed,
      total,
      failures: failures.length,
      message: `Deleting ${deleteTargetLabel(kind)}`
    });
    renderDeleteLog(failures.length, failureSamples);
  };

  paint(true);
  await waitForPaint();

  async function worker() {
    while (cursor < total) {
      const target = targets[cursor];
      cursor += 1;

      try {
        await deleteTarget(target, kind);
        deletedTargets.push(target);
      } catch (error) {
        failures.push({ target, error });
        if (failureSamples.length < DELETE_FAILURE_SAMPLE_LIMIT) {
          failureSamples.push(deleteFailureSample(target, kind, error));
        }
        if (!bulk) throw error;
      } finally {
        completed += 1;
        paint();
      }
    }
  }

  const workerCount = bulk ? Math.min(DELETE_CONCURRENCY, total) : 1;
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  renderDeleteProgress({
    completed,
    total,
    failures: failures.length,
    message: failures.length ? "Delete finished with failures" : "Delete complete"
  });
  renderDeleteLog(failures.length, failureSamples);

  return { deleted: deletedTargets.length, deletedTargets, failures };
}

function subtitleStatsFromGroups(groups, previousStats = {}) {
  return {
    ...previousStats,
    groups: groups.length,
    sidecars: groups.reduce((sum, group) => sum + (group.subtitles?.length || 0), 0)
  };
}

function removeDeletedSubtitleTargets(deletedTargets) {
  if (!state.subtitleScan || !deletedTargets.length) return;

  const deletedKeys = new Set(deletedTargets.map((target) => subtitleTargetKey(target)).filter(Boolean));
  const groups = [];

  for (const group of state.subtitleScan.groups || []) {
    const subtitles = (group.subtitles || []).filter(
      (subtitle) => !deletedKeys.has(subtitleTargetKey(subtitle))
    );

    if (!subtitles.length || (!group.deleteAll && subtitles.length < 2)) {
      state.subtitleGroupSelections.delete(group.id);
      continue;
    }

    const selectedSubtitleId = state.subtitleGroupSelections.get(group.id);
    if (selectedSubtitleId && !subtitles.some((subtitle) => subtitle.id === selectedSubtitleId)) {
      state.subtitleGroupSelections.delete(group.id);
    }

    const suggestedStillExists = subtitles.some(
      (subtitle) => subtitle.id === group.suggestedSubtitleId
    );
    groups.push({
      ...group,
      subtitles,
      suggestedSubtitleId: suggestedStillExists
        ? group.suggestedSubtitleId
        : group.deleteAll
          ? ""
          : subtitles[0]?.id || ""
    });
  }

  state.subtitleScan = {
    ...state.subtitleScan,
    groups,
    stats: subtitleStatsFromGroups(groups, state.subtitleScan.stats)
  };
}

async function deleteActiveFile(event) {
  event.preventDefault();
  if (!state.activeDelete) return;

  const bulk = state.activeDelete.mode === "bulk";
  const kind = state.activeDelete.kind || "media";
  const targets = state.activeDelete.targets || [];
  const expectedConfirmation = bulk ? "DELETE ALL" : "DELETE";
  if (elements.deleteConfirmInput.value !== expectedConfirmation) {
    elements.deleteConfirmInput.setCustomValidity(`Type ${expectedConfirmation} to confirm.`);
    elements.deleteConfirmInput.reportValidity();
    return;
  }
  if (!targets.length) return;
  elements.deleteConfirmInput.setCustomValidity("");

  setDeleteDialogBusy(true);
  let keepFailureDialogOpen = false;
  try {
    const { deleted, deletedTargets, failures } = await deleteTargetsWithProgress(targets, kind, bulk);
    keepFailureDialogOpen = bulk && failures.length > 0;
    if (!keepFailureDialogOpen) elements.deleteDialog.close();

    if (kind === "subtitle") {
      removeDeletedSubtitleTargets(deletedTargets);
      renderSubtitleGroups();
    } else {
      await scan();
    }

    if (bulk && failures.length) {
      const message = `Deleted ${deleted} ${kind === "subtitle" ? "subtitle sidecars" : "media versions"}; ${failures.length} failed. First error: ${failures[0].error.message}`;
      if (kind === "subtitle") setSubtitleMessage(message, "error");
      else setMessage(message, "error");
    } else if (bulk) {
      const message = `Deleted ${deleted} rejected ${kind === "subtitle" ? "subtitle sidecars" : "media versions"}.`;
      if (kind === "subtitle") setSubtitleMessage(message, "success");
      else setMessage(message, "success");
    }
  } catch (error) {
    if (kind === "subtitle") setSubtitleMessage(error.message, "error");
    else setMessage(error.message, "error");
  } finally {
    setDeleteDialogBusy(false);
    if (keepFailureDialogOpen && elements.deleteDialog.open) {
      elements.confirmDeleteButton.disabled = true;
      elements.deleteConfirmInput.disabled = true;
      elements.deleteCancelButtons.forEach((button) => {
        button.disabled = false;
      });
    }
    if (!elements.deleteDialog.open) state.activeDelete = null;
    updateBulkDeleteButton();
    updateBulkSubtitleDeleteButton();
  }
}

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.view}View`).classList.add("active-view");
      elements.pageTitle.textContent = {
        duplicates: "Media Duplicates",
        subtitles: "Subtitle Cleanup",
        settings: "Settings"
      }[button.dataset.view] || "Deduplarr";
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
  elements.subtitleScanButton.addEventListener("click", subtitleScan);
  elements.reviewModeSelect.addEventListener("change", () => setReviewMode(elements.reviewModeSelect.value));
  elements.autoSelectButton.addEventListener("click", autoSelectSuggested);
  elements.subtitleAutoSelectButton.addEventListener("click", autoSelectSuggestedSubtitles);
  elements.deleteRejectedButton.addEventListener("click", openBulkDelete);
  elements.deleteRejectedSubtitlesButton.addEventListener("click", openBulkSubtitleDelete);
  elements.searchInput.addEventListener("input", renderGroups);
  elements.subtitleSearchInput.addEventListener("input", () => {
    state.subtitleRenderLimit = SUBTITLE_GROUP_RENDER_BATCH;
    renderSubtitleGroups();
  });
  elements.selectionModeInput.addEventListener("change", () => setReviewMode(elements.selectionModeInput.value));
  elements.settingsForm.addEventListener("submit", saveSettings);
  elements.testButton.addEventListener("click", testPlexConnection);
  elements.confirmDeleteButton.addEventListener("click", deleteActiveFile);
  elements.deleteDialog.addEventListener("cancel", (event) => {
    if (state.deleteInProgress) event.preventDefault();
  });
  elements.deleteDialog.addEventListener("close", () => {
    if (state.deleteInProgress) return;
    state.activeDelete = null;
    resetDeleteProgress();
  });
}

async function boot() {
  icons();
  setupNavigation();
  setupPreferenceControls();
  setupEvents();
  renderStats();
  renderSubtitleStats();
  updateBulkSubtitleDeleteButton();
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
