import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRuntimeConfig,
  markScheduledScanRun,
  publicConfig,
  saveConfig
} from "./config.js";
import {
  clearSessionCookie,
  createSessionToken,
  sessionFromRequest,
  setSessionCookie,
  verifyPassword,
  hashPassword
} from "./auth.js";
import { PlexClient } from "./plex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 7889);
const scanJobs = new Map();
const SCHEDULER_INTERVAL_MS = 60 * 1000;
let schedulerChecking = false;

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.use("/vendor/lucide", express.static(path.join(rootDir, "node_modules", "lucide", "dist", "umd")));
app.use(express.static(path.join(rootDir, "public")));

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function serializeScanJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    source: job.source,
    status: job.status,
    progress: job.progress,
    message: job.message,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    result: job.result,
    error: job.error
  };
}

function updateScanJob(id, patch) {
  const job = scanJobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  return job;
}

function cleanupScanJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of scanJobs.entries()) {
    const finished = Date.parse(job.finishedAt || job.updatedAt || job.startedAt);
    if (finished < cutoff) scanJobs.delete(id);
  }
}

function createScanJob(kind, source = "manual") {
  return {
    id: crypto.randomUUID(),
    kind,
    source,
    status: "queued",
    progress: 0,
    message: source === "scheduled" ? "Scheduled" : "Queued",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null
  };
}

function startScanJob(kind, config, libraryKeys = [], source = "manual") {
  cleanupScanJobs();
  const job = createScanJob(kind, source);
  scanJobs.set(job.id, job);
  if (kind === "subtitles") runSubtitleScanJob(job.id, config, libraryKeys);
  else runScanJob(job.id, config, libraryKeys);
  return job;
}

function hasActiveScanJob(kind) {
  for (const job of scanJobs.values()) {
    if (job.kind === kind && ["queued", "running"].includes(job.status)) {
      return true;
    }
  }
  return false;
}

function scheduleTimeParts(time) {
  const [hour, minute] = String(time || "03:00")
    .split(":")
    .map((value) => Number(value));
  return {
    hour: Number.isInteger(hour) ? hour : 3,
    minute: Number.isInteger(minute) ? minute : 0
  };
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function sameLocalDate(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function scheduledOccurrence(schedule, now = new Date()) {
  if (!schedule || schedule.frequency === "off") return null;

  const { hour, minute } = scheduleTimeParts(schedule.time);
  const occurrence = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0
  );

  if (schedule.frequency === "weekly" && now.getDay() !== Number(schedule.dayOfWeek)) {
    return null;
  }

  if (schedule.frequency === "monthly") {
    const day = Math.min(
      Math.max(Number(schedule.dayOfMonth) || 1, 1),
      daysInMonth(now.getFullYear(), now.getMonth())
    );
    if (now.getDate() !== day) return null;
  }

  return occurrence;
}

function scheduleIsDue(schedule, now = new Date()) {
  const occurrence = scheduledOccurrence(schedule, now);
  if (!occurrence || now < occurrence) return false;

  const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  return !lastRun || Number.isNaN(lastRun.getTime()) || !sameLocalDate(lastRun, occurrence);
}

async function checkScheduledScans() {
  if (schedulerChecking) return;
  schedulerChecking = true;

  try {
    const config = await getRuntimeConfig();
    const now = new Date();
    const scheduledScans = [
      { kind: "media", label: "media", schedule: config.scanSchedules?.media },
      { kind: "subtitles", label: "subtitle", schedule: config.scanSchedules?.subtitles }
    ];

    for (const { kind, label, schedule } of scheduledScans) {
      if (!scheduleIsDue(schedule, now)) continue;

      const startedAt = now.toISOString();
      await markScheduledScanRun(kind, startedAt);

      if (hasActiveScanJob(kind)) {
        console.log(
          `[${startedAt}] Scheduled ${label} scan skipped because a ${label} scan is already running.`
        );
        continue;
      }

      const job = startScanJob(kind, config, [], "scheduled");
      console.log(`[${startedAt}] Scheduled ${label} scan started: ${job.id}`);
    }
  } catch (error) {
    console.warn(
      `[${new Date().toISOString()}] Scheduled scan check failed`,
      error.message || error
    );
  } finally {
    schedulerChecking = false;
  }
}

function deleteErrorDetails(error, extra = {}) {
  return {
    ...extra,
    target: error.target || extra.target || "",
    plexStatus: error.status || "",
    plexStatusText: error.responseStatusText || "",
    plexBody: error.responseBody || ""
  };
}

function logDeleteFailure(kind, details, error) {
  console.warn(
    `[${new Date().toISOString()}] ${kind} delete failed`,
    JSON.stringify({
      ...details,
      error: error.message || "Delete failed"
    })
  );
}

async function runScanJob(id, config, libraryKeys) {
  try {
    const client = new PlexClient(config);
    updateScanJob(id, {
      status: "running",
      progress: 2,
      message: "Connecting to Plex"
    });
    const result = await client.duplicates(libraryKeys, {
      onProgress: (progress) => updateScanJob(id, progress)
    });
    updateScanJob(id, {
      status: "completed",
      progress: 100,
      message: "Scan complete",
      finishedAt: new Date().toISOString(),
      result: {
        ...result,
        scannedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    updateScanJob(id, {
      status: "failed",
      progress: 100,
      message: "Scan failed",
      finishedAt: new Date().toISOString(),
      error: error.message || "Scan failed"
    });
  }
}

async function runSubtitleScanJob(id, config, libraryKeys) {
  try {
    const client = new PlexClient(config);
    updateScanJob(id, {
      status: "running",
      progress: 2,
      message: "Connecting to Plex"
    });
    const result = await client.subtitleDuplicates(libraryKeys, {
      onProgress: (progress) => updateScanJob(id, progress)
    });
    updateScanJob(id, {
      status: "completed",
      progress: 100,
      message: "Subtitle scan complete",
      finishedAt: new Date().toISOString(),
      result: {
        ...result,
        scannedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    updateScanJob(id, {
      status: "failed",
      progress: 100,
      message: "Subtitle scan failed",
      finishedAt: new Date().toISOString(),
      error: error.message || "Subtitle scan failed"
    });
  }
}

async function clientFromConfig() {
  return new PlexClient(await getRuntimeConfig());
}

function plexClientFromInput(input, fallbackConfig) {
  return new PlexClient({
    ...fallbackConfig,
    plexUrl: input.plexUrl?.trim() || fallbackConfig.plexUrl,
    plexToken:
      input.plexToken === undefined || input.plexToken === ""
        ? fallbackConfig.plexToken
        : input.plexToken.trim(),
    scanPageSize: input.scanPageSize || fallbackConfig.scanPageSize
  });
}

async function requireAuth(request, response, next) {
  const config = await getRuntimeConfig();
  const user = sessionFromRequest(request, config);
  if (!user) {
    response.status(401).json({
      error:
        config.auth.mode === "external"
          ? "External auth user header missing."
          : "Authentication required.",
      authMode: config.auth.mode
    });
    return;
  }

  request.user = user;
  request.runtimeConfig = config;
  next();
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, name: "Deduplarr" });
});

app.get(
  "/api/session",
  asyncRoute(async (request, response) => {
    const config = await getRuntimeConfig();
    const user = sessionFromRequest(request, config);
    response.json({
      authenticated: Boolean(user),
      user,
      authMode: config.auth.mode,
      externalUserHeaders: config.auth.externalUserHeaders
    });
  })
);

app.post(
  "/api/login",
  asyncRoute(async (request, response) => {
    const config = await getRuntimeConfig();
    if (config.auth.mode !== "builtin") {
      response.status(400).json({ error: "Built-in login is disabled." });
      return;
    }

    const username = String(request.body?.username || "");
    const password = String(request.body?.password || "");
    const validUsername = username === config.auth.username;
    const validPassword = await verifyPassword(password, config.auth.passwordHash);

    if (!validUsername || !validPassword) {
      response.status(401).json({ error: "Invalid username or password." });
      return;
    }

    const token = createSessionToken(
      { username: config.auth.username, authMode: "builtin" },
      config.sessionSecret
    );
    setSessionCookie(response, request, token);
    response.json({ authenticated: true, user: { username, authMode: "builtin" } });
  })
);

app.post("/api/logout", (request, response) => {
  clearSessionCookie(response, request);
  response.json({ authenticated: false });
});

app.use("/api", (request, response, next) => {
  if (["/health", "/session", "/login", "/logout"].includes(request.path)) {
    next();
    return;
  }

  requireAuth(request, response, next).catch(next);
});

app.get(
  "/api/config",
  asyncRoute(async (_request, response) => {
    response.json(publicConfig(await getRuntimeConfig()));
  })
);

app.post(
  "/api/config",
  asyncRoute(async (request, response) => {
    const config = request.runtimeConfig || (await getRuntimeConfig());
    const body = request.body || {};
    const options = {};

    if (body.authPassword) {
      if (body.authPassword !== body.authPasswordConfirm) {
        response.status(400).json({ error: "New password confirmation does not match." });
        return;
      }

      const currentPassword = String(body.currentPassword || "");
      const validCurrentPassword = await verifyPassword(
        currentPassword,
        config.auth.passwordHash
      );
      if (!validCurrentPassword) {
        response.status(401).json({ error: "Current password is incorrect." });
        return;
      }

      options.passwordHash = await hashPassword(body.authPassword);
    }

    const saved = await saveConfig(body, options);
    response.json(publicConfig(saved));
  })
);

app.post(
  "/api/test-plex",
  asyncRoute(async (request, response) => {
    const config = request.runtimeConfig || (await getRuntimeConfig());
    const client = plexClientFromInput(request.body || {}, config);
    const [serverInfo, libraries] = await Promise.all([
      client.serverInfo(),
      client.libraries()
    ]);

    response.json({
      ok: true,
      server: serverInfo,
      libraries: libraries.filter((library) =>
        ["movie", "show", "video"].includes(library.type)
      )
    });
  })
);

app.get(
  "/api/status",
  asyncRoute(async (_request, response) => {
    const client = await clientFromConfig();
    response.json(await client.serverInfo());
  })
);

app.get(
  "/api/libraries",
  asyncRoute(async (_request, response) => {
    const client = await clientFromConfig();
    response.json({ libraries: await client.libraries() });
  })
);

app.post(
  "/api/scan",
  asyncRoute(async (request, response) => {
    const config = request.runtimeConfig || (await getRuntimeConfig());
    const libraryKeys = Array.isArray(request.body?.libraryKeys)
      ? request.body.libraryKeys.map(String)
      : [];
    const job = startScanJob("media", config, libraryKeys, "manual");
    response.status(202).json(serializeScanJob(job));
  })
);

app.post(
  "/api/subtitle-scan",
  asyncRoute(async (request, response) => {
    const config = request.runtimeConfig || (await getRuntimeConfig());
    const libraryKeys = Array.isArray(request.body?.libraryKeys)
      ? request.body.libraryKeys.map(String)
      : [];
    const job = startScanJob("subtitles", config, libraryKeys, "manual");
    response.status(202).json(serializeScanJob(job));
  })
);

app.get(
  "/api/scan/:scanId",
  asyncRoute(async (request, response) => {
    const job = scanJobs.get(request.params.scanId);
    if (!job) {
      response.status(404).json({ error: "Scan job not found." });
      return;
    }

    response.json(serializeScanJob(job));
  })
);

app.get(
  "/api/subtitle-scan/:scanId",
  asyncRoute(async (request, response) => {
    const job = scanJobs.get(request.params.scanId);
    if (!job) {
      response.status(404).json({ error: "Subtitle scan job not found." });
      return;
    }

    response.json(serializeScanJob(job));
  })
);

app.post(
  "/api/delete",
  asyncRoute(async (request, response) => {
    const config = await getRuntimeConfig();
    if (!config.allowDeletes) {
      response.status(403).json({
        error:
          "Destructive actions are disabled. Set ENABLE_DESTRUCTIVE_ACTIONS=true or enable deletes in Settings."
      });
      return;
    }

    if (request.body?.confirmText !== "DELETE") {
      response.status(400).json({ error: "Confirmation text did not match." });
      return;
    }

    const client = new PlexClient(config);
    try {
      response.json(
        await client.deleteMedia(
          String(request.body?.ratingKey || ""),
          String(request.body?.mediaId || "")
        )
      );
    } catch (error) {
      const details = deleteErrorDetails(error, {
        ratingKey: String(request.body?.ratingKey || ""),
        mediaId: String(request.body?.mediaId || "")
      });
      logDeleteFailure("media", details, error);
      response.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({
        error: error.message || "Media delete failed.",
        details
      });
    }
  })
);

app.post(
  "/api/subtitle-delete",
  asyncRoute(async (request, response) => {
    const config = await getRuntimeConfig();
    if (!config.allowDeletes) {
      response.status(403).json({
        error:
          "Destructive actions are disabled. Set ENABLE_DESTRUCTIVE_ACTIONS=true or enable deletes in Settings."
      });
      return;
    }

    if (request.body?.confirmText !== "DELETE") {
      response.status(400).json({ error: "Confirmation text did not match." });
      return;
    }

    const client = new PlexClient(config);
    try {
      response.json(
        await client.deleteSubtitleStream(
          String(request.body?.streamId || ""),
          String(request.body?.extension || ""),
          String(request.body?.streamKey || "")
        )
      );
    } catch (error) {
      const details = deleteErrorDetails(error, {
        streamId: String(request.body?.streamId || ""),
        streamKey: String(request.body?.streamKey || ""),
        extension: String(request.body?.extension || ""),
        title: String(request.body?.title || ""),
        sidecarPath: String(request.body?.sidecarPath || "")
      });
      logDeleteFailure("subtitle", details, error);
      response.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({
        error: error.message || "Subtitle delete failed.",
        details
      });
    }
  })
);

app.use((request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ error: "Not found" });
    return;
  }

  response.sendFile(path.join(rootDir, "public", "index.html"));
});

app.use((error, _request, response, _next) => {
  const status = Number(error.status || error.statusCode || 500);
  response.status(status >= 400 && status < 600 ? status : 500).json({
    error: error.message || "Unexpected server error"
  });
});

app.listen(port, () => {
  console.log(`Deduplarr listening on http://localhost:${port}`);
  setTimeout(checkScheduledScans, 10 * 1000);
  setInterval(checkScheduledScans, SCHEDULER_INTERVAL_MS);
});
