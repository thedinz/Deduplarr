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
  flags: []
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
    flags: cleanPreferenceList(value.flags)
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
    auth: nextAuth,
    sessionSecret:
      current.sessionSecret || process.env.SESSION_SECRET || processSessionSecret
  };

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
  return next;
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
    auth: {
      mode: config.auth.mode,
      username: config.auth.username,
      externalUserHeaders: config.auth.externalUserHeaders
    }
  };
}
