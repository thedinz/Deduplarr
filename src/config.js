import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CONFIG_DIR = process.env.CONFIG_DIR || path.resolve(process.cwd(), "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const DEFAULT_EXTERNAL_HEADERS = [
  "x-forwarded-user",
  "x-auth-request-user",
  "x-authentik-username",
  "remote-user"
];

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
    auth: nextAuth,
    sessionSecret:
      current.sessionSecret || process.env.SESSION_SECRET || processSessionSecret
  };

  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function publicConfig(config) {
  return {
    plexUrl: config.plexUrl,
    hasToken: Boolean(config.plexToken),
    allowDeletes: Boolean(config.allowDeletes),
    scanPageSize: config.scanPageSize,
    auth: {
      mode: config.auth.mode,
      username: config.auth.username,
      externalUserHeaders: config.auth.externalUserHeaders
    }
  };
}
