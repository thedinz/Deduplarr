import assert from "node:assert/strict";
import test from "node:test";
import { trackPlexLibraryRefresh } from "../src/plex-scan.js";

test("does not mark a queued library complete after five inactive polls", async () => {
  let clock = 0;
  let poll = 0;
  const updates = [];
  const client = {
    async activities() {
      return [];
    },
    async libraries() {
      poll += 1;
      return [
        {
          key: "7",
          title: "Movies",
          refreshing: poll === 7,
          scannedAt: 100
        }
      ];
    }
  };

  const result = await trackPlexLibraryRefresh({
    client,
    library: { key: "7", title: "Movies", scannedAt: 100 },
    refreshResult: { activityId: "" },
    baselineActivities: [],
    pollIntervalMs: 1000,
    timeoutMs: 30000,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
    now: () => clock,
    onProgress: (progress) => updates.push(progress)
  });

  assert.equal(poll, 9);
  assert.match(updates[4].message, /Waiting for Plex/);
  assert.equal(result.seen, true);
  assert.equal(result.trackingSource, "section");
});

test("uses an advanced scannedAt timestamp for a scan that finishes between polls", async () => {
  let clock = 0;
  const client = {
    async activities() {
      return [];
    },
    async libraries() {
      return [
        {
          key: "7",
          title: "Movies",
          refreshing: false,
          scannedAt: 101
        }
      ];
    }
  };

  const result = await trackPlexLibraryRefresh({
    client,
    library: { key: "7", title: "Movies", scannedAt: 100 },
    refreshResult: { activityId: "" },
    baselineActivities: [],
    pollIntervalMs: 1000,
    timeoutMs: 5000,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
    now: () => clock
  });

  assert.equal(result.seen, true);
  assert.equal(result.trackingSource, "scannedAt");
});

test("attaches to a new library activity and preserves numeric progress support", async () => {
  let clock = 0;
  let poll = 0;
  const updates = [];
  const client = {
    async activities() {
      poll += 1;
      return [
        {
          uuid: "new-scan",
          type: "library.update.section",
          title: "Scanning",
          subtitle: "Movies",
          progress: poll === 1 ? 30 : 100,
          context: {}
        }
      ];
    },
    async libraries() {
      return [{ key: "7", title: "Movies", refreshing: true, scannedAt: 100 }];
    }
  };

  const result = await trackPlexLibraryRefresh({
    client,
    library: { key: "7", title: "Movies", scannedAt: 100 },
    refreshResult: { activityId: "" },
    baselineActivities: [{ uuid: "existing-activity" }],
    pollIntervalMs: 1000,
    timeoutMs: 5000,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
    now: () => clock,
    onProgress: (progress) => updates.push(progress)
  });

  assert.equal(updates[0].progress, 30);
  assert.equal(result.activityId, "new-scan");
  assert.equal(result.numericProgressSeen, true);
  assert.equal(result.trackingSource, "activity");
});
