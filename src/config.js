import crypto from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const CONFIG_DIR = process.env.CONFIG_DIR || path.resolve(process.cwd(), "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const DEFAULT_EXTERNAL_HEADERS = [
  "x-forwarded-user",
  "x-auth-request-user",
  "x-authentik-username",
  "remote-user"
];
const DEFAULT_KEEP_PREFERENCES = {
  containers: [],
  videoCodecs: [],
  audioCodecs: []
};
const DEFAULT_SUBTITLE_PREFERENCES = {
  languages: [],
  formats: [],
  flags: [],
  deleteNonPreferredLanguages: false
};
const DEFAULT_SCAN_SCHEDULE = {
  frequency: "off",
  time: "03:00",
  dayOfWeek: 1,
  dayOfMonth: 1,
  lastRunAt: ""
};
const DEFAULT_SCAN_SCHEDULES = {
  media: DEFAULT_SCAN_SCHEDULE,
  subtitles: DEFAULT_SCAN_SCHEDULE
};

const processSessionSecret = crypto.randomBytes(32).toString("hex");

function cleanExternalHeaders(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || DEFAULT_EXTERNAL_HEADERS.join(",")).split(",");

  const headers = source
    .map((header) => String(header).trim().toLowerCase())
    .filter(Boolean);

  return headers.length ? [...new Set(headers)] : DEFAULT_EXTERNAL_HEADERS;
}

function authMode(value) {
  return value === "external" ? "external" : "builtin";
}

function selectionMode(value) {
  return value === "auto" ? "auto" : "manual";
}

function scanFrequency(value) {
  return ["daily", "weekly", "monthly"].includes(value) ? value : "off";
}

function scanTime(value, fallback = DEFAULT_SCAN_SCHEDULE.time) {
  const raw = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
}

function scanDayOfWeek(value, fallback = DEFAULT_SCAN_SCHEDULE.dayOfWeek) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) return fallback;
  return parsed;
}

function scanDayOfMonth(value, fallback = DEFAULT_SCAN_SCHEDULE.dayOfMonth) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return fallback;
  return parsed;
}

function scanLastRunAt(value = "") {
  const raw = String(value || "").trim();
  return Number.isNaN(Date.parse(raw)) ? "" : raw;
}

function cleanPreferenceList(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [
    ...new Set(
      source
        .map((item) => String(item).trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean)
    )
  ];
}

function keepPreferences(value = {}) {
  return {
    containers: cleanPreferenceList(value.containers),
    videoCodecs: cleanPreferenceList(value.videoCodecs),
    audioCodecs: cleanPreferenceList(value.audioCodecs)
  };
}

function subtitlePreferences(value = {}) {
  return {
    languages: cleanPreferenceList(value.languages),
    formats: cleanPreferenceList(value.formats),
    flags: cleanPreferenceList(value.flags),
    deleteNonPreferredLanguages: Boolean(value.deleteNonPreferredLanguages)
  };
}

function scanSchedule(value = {}, fallback = DEFAULT_SCAN_SCHEDULE) {
  return {
    frequency: scanFrequency(value.frequency),
    time: scanTime(value.time, fallback.time),
    dayOfWeek: scanDayOfWeek(value.dayOfWeek, fallback.dayOfWeek),
    dayOfMonth: scanDayOfMonth(value.dayOfMonth, fallback.dayOfMonth),
    lastRunAt: scanLastRunAt(value.lastRunAt || fallback.lastRunAt)
  };
}

function scanSchedules(value = {}, fallback = DEFAULT_SCAN_SCHEDULES) {
  return {
    media: scanSchedule(value.media || {}, fallback.media || DEFAULT_SCAN_SCHEDULE),
    subtitles: scanSchedule(value.subtitles || {}, fallback.subtitles || DEFAULT_SCAN_SCHEDULE)
  };
}

export function defaultAuthConfig(storedAuth = {}) {
  return {
    mode: authMode(storedAuth.mode),
    username: String(storedAuth.username || "admin"),
    passwordHash: storedAuth.passwordHash || "",
    externalUserHeaders: cleanExternalHeaders(storedAuth.externalUserHeaders)
  };
}

export async function readStoredConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeStoredConfig(next) {
  await mkdir(CONFIG_DIR, { recursive: true });
  const temporaryFile = `${CONFIG_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFile, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(temporaryFile, CONFIG_FILE);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}

export async function getRuntimeConfig() {
  const stored = await readStoredConfig();
  const auth = defaultAuthConfig(stored.auth);

  return {
    plexUrl: stored.plexUrl || "",
    plexToken: stored.plexToken || "",
    allowDeletes: Boolean(stored.allowDeletes),
    scanPageSize: Number(stored.scanPageSize || 200),
    selectionMode: selectionMode(stored.selectionMode),
    keepPreferences: keepPreferences(stored.keepPreferences || DEFAULT_KEEP_PREFERENCES),
    subtitlePreferences: subtitlePreferences(
      stored.subtitlePreferences || DEFAULT_SUBTITLE_PREFERENCES
    ),
    scanSchedules: scanSchedules(stored.scanSchedules || DEFAULT_SCAN_SCHEDULES),
    auth,
    sessionSecret:
      process.env.SESSION_SECRET || stored.sessionSecret || processSessionSecret
  };
}

export async function saveConfig(input, options = {}) {
  const current = await readStoredConfig();
  const currentAuth = defaultAuthConfig(current.auth);
  const nextAuth = {
    ...currentAuth,
    mode: input.authMode === undefined ? currentAuth.mode : authMode(input.authMode),
    username: input.authUsername?.trim() || currentAuth.username,
    externalUserHeaders:
      input.externalUserHeaders === undefined
        ? currentAuth.externalUserHeaders
        : cleanExternalHeaders(input.externalUserHeaders)
  };

  if (options.passwordHash) {
    nextAuth.passwordHash = options.passwordHash;
  }

  const next = {
    ...current,
    plexUrl: input.plexUrl?.trim() || current.plexUrl || "",
    plexToken:
      input.plexToken === undefined
        ? current.plexToken || ""
        : input.plexToken.trim(),
    allowDeletes:
      input.allowDeletes === undefined
        ? Boolean(current.allowDeletes)
        : Boolean(input.allowDeletes),
    scanPageSize: Number(input.scanPageSize || current.scanPageSize || 200),
    selectionMode:
      input.selectionMode === undefined
        ? selectionMode(current.selectionMode)
        : selectionMode(input.selectionMode),
    keepPreferences:
      input.keepPreferences === undefined
        ? keepPreferences(current.keepPreferences || DEFAULT_KEEP_PREFERENCES)
        : keepPreferences(input.keepPreferences),
    subtitlePreferences:
      input.subtitlePreferences === undefined
        ? subtitlePreferences(current.subtitlePreferences || DEFAULT_SUBTITLE_PREFERENCES)
        : subtitlePreferences(input.subtitlePreferences),
    scanSchedules:
      input.scanSchedules === undefined
        ? scanSchedules(current.scanSchedules || DEFAULT_SCAN_SCHEDULES)
        : scanSchedules(
            input.scanSchedules,
            scanSchedules(current.scanSchedules || DEFAULT_SCAN_SCHEDULES)
          ),
    auth: nextAuth,
    sessionSecret:
      current.sessionSecret || process.env.SESSION_SECRET || processSessionSecret
  };

  await writeStoredConfig(next);
  return next;
}

export async function markScheduledScanRun(kind, startedAt = new Date().toISOString()) {
  const current = await readStoredConfig();
  const schedules = scanSchedules(current.scanSchedules || DEFAULT_SCAN_SCHEDULES);
  if (!["media", "subtitles"].includes(kind)) return scanSchedules(schedules);

  schedules[kind] = {
    ...schedules[kind],
    lastRunAt: startedAt
  };

  await writeStoredConfig({
    ...current,
    scanSchedules: schedules
  });
  return schedules;
}

export function publicConfig(config) {
  return {
    plexUrl: config.plexUrl,
    hasToken: Boolean(config.plexToken),
    allowDeletes: Boolean(config.allowDeletes),
    scanPageSize: config.scanPageSize,
    selectionMode: config.selectionMode,
    keepPreferences: config.keepPreferences,
    subtitlePreferences: config.subtitlePreferences,
    scanSchedules: config.scanSchedules,
    auth: {
      mode: config.auth.mode,
      username: config.auth.username,
      externalUserHeaders: config.auth.externalUserHeaders
    }
  };
}
