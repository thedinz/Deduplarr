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
import { findLibraryActivity, PlexClient } from "./plex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 7889);
const scanJobs = new Map();
const SCHEDULER_INTERVAL_MS = 60 * 1000;
const PLEX_ACTIVITY_POLL_MS = 1000;
const PLEX_ACTIVITY_START_GRACE_POLLS = 5;
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
    indeterminate: Boolean(job.indeterminate),
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
    indeterminate: false,
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
  else if (kind === "plex") runPlexRefreshJob(job.id, config, libraryKeys);
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

function plexRefreshResult(libraries, errors = []) {
  return {
    libraries: libraries.map((library) => ({
      libraryKey: library.libraryKey,
      libraryTitle: library.libraryTitle,
      activityId: library.activityId,
      progressAvailable: Boolean(library.numericProgressSeen),
      statusTracked: Boolean(library.seen),
      trackingSource: library.trackingSource || "unavailable"
    })),
    errors
  };
}

async function runPlexRefreshJob(id, config, libraryKeys) {
  const refreshed = [];
  const errors = [];

  try {
    const client = new PlexClient(config);
    updateScanJob(id, {
      status: "running",
      progress: 0,
      message: "Loading Plex libraries"
    });

    const libraries = await client.libraries();
    const selected = libraries.filter((library) => {
      const supported = ["movie", "show", "video"].includes(library.type);
      const requested =
        libraryKeys.length === 0 || libraryKeys.includes(String(library.key));
      return supported && requested;
    });

    if (!selected.length) {
      throw new Error("Select at least one Plex library to scan.");
    }

    for (const [index, library] of selected.entries()) {
      updateScanJob(id, {
        progress: Math.round((index / selected.length) * 5),
        message: `Starting Plex scan for ${library.title}`
      });

      try {
        refreshed.push({
          ...(await client.refreshLibrary(library)),
          seen: false,
          missingPolls: 0,
          progress: 0,
          numericProgressSeen: false,
          trackingSource: ""
        });
      } catch (error) {
        errors.push({
          libraryKey: String(library.key),
          libraryTitle: library.title,
          message: error.message || "Could not start Plex scan"
        });
      }
    }

    if (!refreshed.length) {
      throw new Error(errors.map((error) => error.message).join(" | ") || "Plex scan failed.");
    }

    updateScanJob(id, {
      progress: 5,
      indeterminate: true,
      message: `Plex is scanning ${refreshed.length} ${refreshed.length === 1 ? "library" : "libraries"}`
    });

    while (refreshed.some((library) => library.progress < 100)) {
      await new Promise((resolve) => setTimeout(resolve, PLEX_ACTIVITY_POLL_MS));

      let activities = [];
      let currentLibraries = [];
      let activitiesAvailable = true;
      let librariesAvailable = true;
      let activitiesError = null;
      let librariesError = null;

      try {
        activities = await client.activities();
      } catch (error) {
        activitiesAvailable = false;
        activitiesError = error;
      }

      try {
        currentLibraries = await client.libraries();
      } catch (error) {
        librariesAvailable = false;
        librariesError = error;
      }

      if (!activitiesAvailable && !librariesAvailable) {
        updateScanJob(id, {
          status: "completed",
          progress: 100,
          indeterminate: false,
          message: "Plex scan triggered; activity progress is unavailable",
          finishedAt: new Date().toISOString(),
          result: plexRefreshResult(refreshed, [
            ...errors,
            {
              message: [
                `Could not read Plex activities: ${activitiesError?.message}`,
                `Could not read Plex library state: ${librariesError?.message}`
              ].join(" | ")
            }
          ])
        });
        return;
      }

      const activitiesById = new Map(
        activities
          .filter((activity) => activity.uuid)
          .map((activity) => [activity.uuid, activity])
      );
      const librariesByKey = new Map(
        currentLibraries.map((library) => [String(library.key), library])
      );
      let activeActivity = null;
      let activeLibrary = null;

      for (const library of refreshed) {
        if (library.progress >= 100) continue;
        const activity =
          activitiesById.get(library.activityId) ||
          findLibraryActivity(activities, {
            key: library.libraryKey,
            title: library.libraryTitle
          });
        const currentLibrary = librariesByKey.get(library.libraryKey);

        if (activity) {
          library.activityId ||= activity.uuid;
          library.seen = true;
          library.missingPolls = 0;
          library.progress = activity.progress;
          library.numericProgressSeen ||= activity.progress >= 0;
          library.trackingSource = "activity";
          activeActivity ||= activity;
        } else if (currentLibrary?.refreshing) {
          library.seen = true;
          library.missingPolls = 0;
          library.progress = -1;
          library.trackingSource = "section";
          activeLibrary ||= currentLibrary;
        } else {
          library.missingPolls += 1;
          if (
            library.seen ||
            library.missingPolls >= PLEX_ACTIVITY_START_GRACE_POLLS
          ) {
            library.progress = 100;
          }
        }
      }

      const progressValues = refreshed.map((library) => {
        return library.progress < 0 ? 0 : library.progress;
      });
      const progress = Math.round(
        progressValues.reduce((sum, value) => sum + value, 0) / refreshed.length
      );
      const indeterminate = refreshed.some(
        (library) =>
          library.progress < 0 ||
          (
            library.progress < 100 &&
            !library.seen &&
            library.missingPolls < PLEX_ACTIVITY_START_GRACE_POLLS
          )
      );
      const remaining = refreshed.filter((library) => library.progress < 100).length;
      const activityLabel =
        activeActivity?.subtitle ||
        activeActivity?.title ||
        (activeLibrary ? `Scanning ${activeLibrary.title}` : "Plex library scan");

      updateScanJob(id, {
        progress,
        indeterminate,
        message: remaining
          ? `${activityLabel} (${remaining} ${remaining === 1 ? "library" : "libraries"} remaining)`
          : "Plex library scan complete"
      });
    }

    updateScanJob(id, {
      status: "completed",
      progress: 100,
      indeterminate: false,
      message: errors.length
        ? `Plex scan complete with ${errors.length} ${errors.length === 1 ? "error" : "errors"}`
        : "Plex library scan complete",
      finishedAt: new Date().toISOString(),
      result: plexRefreshResult(refreshed, errors)
    });
  } catch (error) {
    updateScanJob(id, {
      status: "failed",
      progress: 100,
      indeterminate: false,
      message: "Plex library scan failed",
      finishedAt: new Date().toISOString(),
      error: error.message || "Plex library scan failed"
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

app.post(
  "/api/plex-scan",
  asyncRoute(async (request, response) => {
    const config = request.runtimeConfig || (await getRuntimeConfig());
    const libraryKeys = Array.isArray(request.body?.libraryKeys)
      ? request.body.libraryKeys.map(String)
      : [];
    const job = startScanJob("plex", config, libraryKeys, "manual");
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
  "/api/plex-scan/:scanId",
  asyncRoute(async (request, response) => {
    const job = scanJobs.get(request.params.scanId);
    if (!job || job.kind !== "plex") {
      response.status(404).json({ error: "Plex scan job not found." });
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
