import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("settings survive a fresh config read", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "deduplarr-config-"));
  const previousConfigDir = process.env.CONFIG_DIR;
  process.env.CONFIG_DIR = directory;
  t.after(async () => {
    if (previousConfigDir === undefined) delete process.env.CONFIG_DIR;
    else process.env.CONFIG_DIR = previousConfigDir;
    await rm(directory, { recursive: true, force: true });
  });

  const configModule = await import(`../src/config.js?test=${Date.now()}`);
  await configModule.saveConfig({
    plexUrl: "http://plex.example:32400",
    plexToken: "token",
    allowDeletes: true,
    scanPageSize: 400,
    selectionMode: "auto",
    keepPreferences: {
      containers: ["mp4"],
      videoCodecs: ["hevc"],
      audioCodecs: ["eac3"]
    },
    subtitlePreferences: {
      languages: ["English"],
      formats: ["srt"],
      flags: ["default"],
      deleteNonPreferredLanguages: true
    },
    scanSchedules: {
      media: {
        frequency: "weekly",
        time: "04:30",
        dayOfWeek: 2,
        dayOfMonth: 12
      },
      subtitles: {
        frequency: "monthly",
        time: "02:15",
        dayOfWeek: 5,
        dayOfMonth: 31
      }
    },
    authMode: "external",
    authUsername: "operator",
    externalUserHeaders: ["x-forwarded-user"]
  });

  const stored = JSON.parse(await readFile(path.join(directory, "config.json"), "utf8"));
  const loaded = await configModule.getRuntimeConfig();

  assert.equal(stored.plexToken, "token");
  assert.equal(loaded.plexUrl, "http://plex.example:32400");
  assert.equal(loaded.allowDeletes, true);
  assert.equal(loaded.scanPageSize, 400);
  assert.equal(loaded.selectionMode, "auto");
  assert.deepEqual(loaded.keepPreferences, {
    containers: ["mp4"],
    videoCodecs: ["hevc"],
    audioCodecs: ["eac3"]
  });
  assert.deepEqual(loaded.subtitlePreferences, {
    languages: ["english"],
    formats: ["srt"],
    flags: ["default"],
    deleteNonPreferredLanguages: true
  });
  assert.deepEqual(loaded.scanSchedules, {
    media: {
      frequency: "weekly",
      time: "04:30",
      dayOfWeek: 2,
      dayOfMonth: 12,
      lastRunAt: ""
    },
    subtitles: {
      frequency: "monthly",
      time: "02:15",
      dayOfWeek: 5,
      dayOfMonth: 31,
      lastRunAt: ""
    }
  });
  assert.equal(loaded.auth.mode, "external");
  assert.equal(loaded.auth.username, "operator");

  await configModule.markScheduledScanRun("media", "2026-07-13T08:00:00.000Z");
  const marked = await configModule.getRuntimeConfig();

  assert.equal(marked.scanSchedules.media.lastRunAt, "2026-07-13T08:00:00.000Z");
  assert.equal(marked.scanSchedules.subtitles.lastRunAt, "");
});
