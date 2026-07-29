import { findLibraryActivity, isLibraryScanActivity } from "./plex.js";

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const INACTIVE_CONFIRMATION_POLLS = 2;

function timestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(error) {
  return error?.message || String(error || "Unknown Plex API error");
}

export async function trackPlexLibraryRefresh({
  client,
  library,
  refreshResult,
  baselineActivities = null,
  onProgress = () => {},
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => Date.now()
}) {
  const startedAt = now();
  const baselineScannedAt = timestamp(library.scannedAt);
  const baselineActivityIds = Array.isArray(baselineActivities)
    ? new Set(baselineActivities.map((activity) => activity.uuid).filter(Boolean))
    : null;
  let activityId = refreshResult.activityId || "";
  let seen = false;
  let numericProgressSeen = false;
  let trackingSource = "";
  let inactivePolls = 0;
  let lastActivityLabel = "";

  while (now() - startedAt < timeoutMs) {
    await wait(pollIntervalMs);

    const [activitiesResult, librariesResult] = await Promise.allSettled([
      client.activities(),
      client.libraries()
    ]);
    const activitiesAvailable = activitiesResult.status === "fulfilled";
    const librariesAvailable = librariesResult.status === "fulfilled";

    if (!activitiesAvailable && !librariesAvailable) {
      throw new Error(
        [
          `Could not read Plex activities: ${errorMessage(activitiesResult.reason)}`,
          `Could not read Plex library state: ${errorMessage(librariesResult.reason)}`
        ].join(" | ")
      );
    }

    const activities = activitiesAvailable ? activitiesResult.value : [];
    const libraries = librariesAvailable ? librariesResult.value : [];
    const activity =
      activities.find((candidate) => candidate.uuid === activityId) ||
      findLibraryActivity(activities, library) ||
      (
        baselineActivityIds
          ? activities.find(
            (candidate) =>
              candidate.uuid &&
              !baselineActivityIds.has(candidate.uuid) &&
              isLibraryScanActivity(candidate)
          )
          : null
      );
    const currentLibrary = libraries.find(
      (candidate) => String(candidate.key) === String(library.key)
    );

    if (activity) {
      activityId ||= activity.uuid;
      seen = true;
      inactivePolls = 0;
      trackingSource = "activity";
      numericProgressSeen ||= activity.progress >= 0;
      lastActivityLabel = activity.subtitle || activity.title || lastActivityLabel;

      if (activity.progress >= 100) {
        return {
          activityId,
          seen,
          numericProgressSeen,
          trackingSource
        };
      }

      onProgress({
        progress: activity.progress,
        indeterminate: activity.progress < 0,
        message: lastActivityLabel || `Scanning ${library.title}`
      });
      continue;
    }

    if (currentLibrary?.refreshing) {
      seen = true;
      inactivePolls = 0;
      trackingSource ||= "section";
      onProgress({
        progress: -1,
        indeterminate: true,
        message: `Scanning ${library.title}`
      });
      continue;
    }

    const scannedAtAdvanced =
      currentLibrary &&
      timestamp(currentLibrary.scannedAt) > baselineScannedAt;

    if (scannedAtAdvanced) {
      return {
        activityId,
        seen: true,
        numericProgressSeen,
        trackingSource: trackingSource || "scannedAt"
      };
    }

    if (seen) {
      inactivePolls += 1;
      if (inactivePolls >= INACTIVE_CONFIRMATION_POLLS) {
        return {
          activityId,
          seen,
          numericProgressSeen,
          trackingSource: trackingSource || "section"
        };
      }
    }

    onProgress({
      progress: 0,
      indeterminate: true,
      message: seen
        ? `Finishing ${library.title}`
        : `Waiting for Plex to scan ${library.title}`
    });
  }

  throw new Error(
    `Timed out waiting for Plex to finish scanning ${library.title} after ${Math.round(timeoutMs / 60000)} minutes.`
  );
}
