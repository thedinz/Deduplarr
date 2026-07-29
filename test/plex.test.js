import assert from "node:assert/strict";
import test from "node:test";
import { findLibraryActivity, PlexClient } from "../src/plex.js";

test("refreshLibrary starts a Plex section scan and returns its activity ID", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response("", {
      status: 200,
      headers: { "X-Plex-Activity": "activity-123" }
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const result = await client.refreshLibrary({ key: "7", title: "Movies" });

  assert.equal(request.options.method, "POST");
  assert.equal(
    request.url,
    "http://plex.example:32400/library/sections/7/refresh?X-Plex-Token=secret"
  );
  assert.deepEqual(result, {
    libraryKey: "7",
    libraryTitle: "Movies",
    activityId: "activity-123"
  });
});

test("refreshLibrary succeeds when Plex omits the activity header", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 200 });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const result = await client.refreshLibrary({ key: "7", title: "Movies" });

  assert.deepEqual(result, {
    libraryKey: "7",
    libraryTitle: "Movies",
    activityId: ""
  });
});

test("activities exposes Plex scan progress and indeterminate states", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        MediaContainer: {
          Activity: [
            {
              uuid: "activity-123",
              type: "library.update.section",
              cancellable: true,
              title: "Scanning",
              subtitle: "Movies",
              progress: 42,
              Context: { librarySectionID: 7 }
            },
            {
              uuid: "activity-456",
              type: "library.update.section",
              progress: -1
            }
          ]
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const activities = await client.activities();

  assert.equal(activities[0].progress, 42);
  assert.equal(activities[0].cancellable, true);
  assert.deepEqual(activities[0].context, { librarySectionID: 7 });
  assert.equal(activities[0].librarySectionId, "7");
  assert.equal(activities[1].progress, -1);
});

test("findLibraryActivity matches a scan by library context without a response header", () => {
  const activity = findLibraryActivity(
    [
      {
        uuid: "unrelated",
        type: "media.generate.credits",
        subtitle: "Movies",
        context: { librarySectionID: "7" }
      },
      {
        uuid: "scan-activity",
        type: "library.update.section",
        title: "Scanning",
        subtitle: "Movies",
        progress: 27,
        context: { librarySectionID: "7" }
      }
    ],
    { key: "7", title: "Movies" }
  );

  assert.equal(activity.uuid, "scan-activity");
  assert.equal(activity.progress, 27);
});

test("libraries exposes Plex's refreshing scan state", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        MediaContainer: {
          Directory: [
            {
              key: "7",
              title: "Movies",
              type: "movie",
              refreshing: true,
              uuid: "library-uuid"
            }
          ]
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const libraries = await client.libraries();

  assert.equal(libraries[0].refreshing, true);
  assert.equal(libraries[0].uuid, "library-uuid");
});

test("deleteMedia uses Plex's media-version deletion endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response("", { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const result = await client.deleteMedia("123", "456");

  assert.equal(request.options.method, "DELETE");
  assert.equal(
    request.url,
    "http://plex.example:32400/library/metadata/123/media/456?X-Plex-Token=secret"
  );
  assert.equal(request.options.headers["X-Plex-Token"], "secret");
  assert.deepEqual(result, {
    deleted: true,
    target: "/library/metadata/123/media/456"
  });
});

test("deleteMedia rejects incomplete identifiers without calling Plex", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    assert.fail("fetch should not be called");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });

  await assert.rejects(
    client.deleteMedia("123", ""),
    /metadata key and media ID are required/
  );
});

test("deleteSubtitleStream uses Plex's stream deletion endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response("", { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const result = await client.deleteSubtitleStream("789", "subrip", "/library/streams/789");

  assert.equal(request.options.method, "DELETE");
  assert.equal(
    request.url,
    "http://plex.example:32400/library/streams/789?X-Plex-Token=secret"
  );
  assert.deepEqual(result, {
    deleted: true,
    target: "/library/streams/789"
  });
});

test("deleteSubtitleStream falls back to stream ID when the stream key is unavailable", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response("", { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const result = await client.deleteSubtitleStream("789", "subrip");

  assert.equal(request.options.method, "DELETE");
  assert.equal(
    request.url,
    "http://plex.example:32400/library/streams/789.srt?X-Plex-Token=secret"
  );
  assert.deepEqual(result, {
    deleted: true,
    target: "/library/streams/789.srt"
  });
});

test("deleteSubtitleStream retries Plex stream endpoint variants after a 404", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response("", { status: requests.length === 1 ? 404 : 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const result = await client.deleteSubtitleStream(
    "789",
    "subrip",
    "/library/streams/789"
  );

  assert.deepEqual(
    requests.map((request) => new URL(request.url).pathname),
    ["/library/streams/789", "/library/streams/789.srt"]
  );
  assert.deepEqual(result, {
    deleted: true,
    target: "/library/streams/789.srt"
  });
});

test("deleteSubtitleStream treats a 404 on every valid target as already absent", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response("Not Found", { status: 404, statusText: "Not Found" });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const result = await client.deleteSubtitleStream(
    "789",
    "srt",
    "/library/streams/789.srt"
  );

  assert.deepEqual(
    requests.map((url) => new URL(url).pathname),
    ["/library/streams/789.srt", "/library/streams/789"]
  );
  assert.deepEqual(result, {
    deleted: false,
    alreadyAbsent: true,
    target: "/library/streams/789",
    attemptedTargets: ["/library/streams/789.srt", "/library/streams/789"]
  });
});

test("deleteSubtitleStream does not hide non-404 Plex errors", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response("Forbidden", { status: 403, statusText: "Forbidden" });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });

  await assert.rejects(
    client.deleteSubtitleStream("789", "srt", "/library/streams/789.srt"),
    /Plex API 403 Forbidden/
  );
  assert.equal(requestCount, 1);
});

test("subtitleDuplicates groups sidecar subtitles and ignores embedded streams", async (t) => {
  const originalFetch = globalThis.fetch;
  const responses = {
    "/library/sections": {
      MediaContainer: {
        Directory: [{ key: "1", title: "Movies", type: "movie" }]
      }
    },
    "/library/sections/1/all": {
      MediaContainer: {
        size: 1,
        totalSize: 1,
        Metadata: [{ ratingKey: "10", title: "Example Movie", type: "movie" }]
      }
    },
    "/library/metadata/10": {
      MediaContainer: {
        Metadata: [
          {
            ratingKey: "10",
            key: "/library/metadata/10",
            title: "Example Movie",
            type: "movie",
            year: 2026,
            Media: [
              {
                id: "20",
                Part: [
                  {
                    id: "30",
                    file: "/media/Example Movie (2026)/Example Movie.mkv",
                    Stream: [
                      {
                        streamType: 3,
                        id: 101,
                        key: "/library/streams/101",
                        codec: "srt",
                        language: "English",
                        languageCode: "eng",
                        displayTitle: "English (SRT External)",
                        selected: true
                      },
                      {
                        streamType: 3,
                        id: 102,
                        key: "/library/streams/102",
                        codec: "ass",
                        language: "English",
                        languageCode: "eng",
                        displayTitle: "English (ASS External)"
                      },
                      {
                        streamType: 3,
                        id: 103,
                        codec: "pgs",
                        language: "English",
                        languageCode: "eng",
                        displayTitle: "English (PGS Embedded)",
                        index: 2
                      },
                      {
                        streamType: 3,
                        id: 104,
                        key: "/library/streams/104",
                        codec: "srt",
                        language: "English",
                        languageCode: "eng",
                        displayTitle: "English Downloaded"
                      },
                      {
                        streamType: 3,
                        id: 105,
                        key: "/library/streams/105",
                        codec: "srt",
                        language: "Spanish",
                        languageCode: "spa",
                        displayTitle: "Spanish (SRT External)"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  };

  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    const body = responses[pathname];
    if (!body) {
      return new Response(`Unexpected path ${pathname}`, { status: 404 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const client = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret"
  });
  const result = await client.subtitleDuplicates(["1"]);

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].subtitles.length, 2);
  assert.equal(result.groups[0].suggestedSubtitleId, "10:20:30:101");
  assert.deepEqual(
    result.groups[0].subtitles.map((subtitle) => subtitle.streamId),
    ["101", "102"]
  );
  assert.equal(result.groups[0].subtitles.some((subtitle) => "raw" in subtitle), false);
  assert.equal(result.stats.subtitleStreams, 5);
  assert.equal(result.stats.sidecars, 3);
  assert.equal(result.stats.duplicateSidecars, 1);
  assert.equal(result.stats.ignoredNonSidecar, 2);

  const preferredClient = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret",
    subtitlePreferences: {
      formats: ["ass"]
    }
  });
  const preferred = await preferredClient.subtitleDuplicates(["1"]);

  assert.equal(preferred.groups[0].suggestedSubtitleId, "10:20:30:102");
  assert.deepEqual(preferred.groups[0].subtitles[0].score.preferenceReasons, [
    "Preferred ASS"
  ]);

  const languageCleanupClient = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret",
    subtitlePreferences: {
      languages: ["English"],
      deleteNonPreferredLanguages: true
    }
  });
  const languageCleanup = await languageCleanupClient.subtitleDuplicates(["1"]);
  const spanishGroup = languageCleanup.groups.find(
    (group) => group.languageCode === "spa"
  );

  assert.equal(languageCleanup.groups.length, 2);
  assert.equal(spanishGroup.deleteAll, true);
  assert.equal(spanishGroup.suggestedSubtitleId, "");
  assert.deepEqual(
    spanishGroup.subtitles.map((subtitle) => subtitle.streamId),
    ["105"]
  );
  assert.equal(languageCleanup.stats.cleanupSidecars, 2);
});
