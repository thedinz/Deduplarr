import assert from "node:assert/strict";
import test from "node:test";
import { PlexClient } from "../src/plex.js";

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
  assert.equal(result.stats.subtitleStreams, 4);
  assert.equal(result.stats.sidecars, 2);
  assert.equal(result.stats.duplicateSidecars, 1);
  assert.equal(result.stats.ignoredNonSidecar, 2);
});
