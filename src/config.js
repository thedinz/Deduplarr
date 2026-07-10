import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CONFIG_DIR = process.env.CONFIG_DIR || path.resolve(process.cwd(), "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function envBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
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

  return {
    plexUrl: process.env.PLEX_URL || stored.plexUrl || "",
    plexToken: process.env.PLEX_TOKEN || stored.plexToken || "",
    allowDeletes: envBoolean(
      process.env.ENABLE_DESTRUCTIVE_ACTIONS,
      Boolean(stored.allowDeletes)
    ),
    scanPageSize: Number(process.env.SCAN_PAGE_SIZE || stored.scanPageSize || 200)
  };
}

export async function saveConfig(input) {
  const current = await readStoredConfig();
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
    scanPageSize: Number(input.scanPageSize || current.scanPageSize || 200)
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
    scanPageSize: config.scanPageSize
  };
}
