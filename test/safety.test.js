import assert from "node:assert/strict";
import test from "node:test";
import { parseCookies, readSessionToken, createSessionToken } from "../src/auth.js";
import { assertTokenForPlexUrl } from "../src/config.js";
import { languagesMatch, isUnknownLanguage } from "../src/language.js";
import { compileTrustedProxies, cleanTrustedProxies } from "../src/network.js";
import { groupReclaimableBytes, PlexClient } from "../src/plex.js";
import { scoreMedia } from "../src/scoring.js";

function mockPlex(t, routes) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const method = options.method || "GET";
    requests.push({ method, pathname: parsed.pathname, search: parsed.search });
    const handler = routes[`${method} ${parsed.pathname}`];
    if (handler === undefined) return new Response(`Unexpected ${method} ${parsed.pathname}`, { status: 404 });
    const body = typeof handler === "function" ? handler(parsed) : handler;
    return new Response(body === "" ? "" : JSON.stringify(body), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return requests;
}

function client() {
  return new PlexClient({ plexUrl: "http://plex.example:32400", plexToken: "secret" });
}

function itemWithMedia(...mediaIds) {
  return {
    MediaContainer: {
      Metadata: [{ ratingKey: "123", Media: mediaIds.map((id) => ({ id, Part: [{ id: `p${id}` }] })) }]
    }
  };
}

test("deleteMedia deletes a non-kept version after confirming it with Plex", async (t) => {
  const requests = mockPlex(t, {
    "GET /library/metadata/123": itemWithMedia("456", "789"),
    "DELETE /library/metadata/123/media/456": ""
  });

  const result = await client().deleteMedia("123", "456", { keepMediaId: "789" });

  assert.deepEqual(result, { deleted: true, target: "/library/metadata/123/media/456" });
  assert.deepEqual(
    requests.map((request) => `${request.method} ${request.pathname}`),
    ["GET /library/metadata/123", "DELETE /library/metadata/123/media/456"]
  );
});

test("deleteMedia refuses to delete the only remaining version", async (t) => {
  const requests = mockPlex(t, { "GET /library/metadata/123": itemWithMedia("456") });

  await assert.rejects(client().deleteMedia("123", "456"), (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /only remaining media version/);
    return true;
  });
  assert.ok(requests.every((request) => request.method === "GET"));
});

test("deleteMedia refuses to delete the kept version", async (t) => {
  mockPlex(t, { "GET /library/metadata/123": itemWithMedia("456", "789") });
  await assert.rejects(
    client().deleteMedia("123", "456", { keepMediaId: "456" }),
    /selected to keep/
  );
});

test("deleteMedia refuses when the kept version has disappeared", async (t) => {
  mockPlex(t, { "GET /library/metadata/123": itemWithMedia("456", "999") });
  await assert.rejects(
    client().deleteMedia("123", "456", { keepMediaId: "789" }),
    /no longer exists/
  );
});

test("deleteMedia reports an already removed version as absent", async (t) => {
  mockPlex(t, { "GET /library/metadata/123": itemWithMedia("789", "999") });
  const result = await client().deleteMedia("123", "456", { keepMediaId: "789" });
  assert.equal(result.alreadyAbsent, true);
  assert.equal(result.deleted, false);
});

function duplicateScanRoutes(item) {
  return {
    "GET /library/sections": {
      MediaContainer: { Directory: [{ key: "1", title: "Movies", type: "movie" }] }
    },
    "GET /library/sections/1/all": {
      MediaContainer: { size: 1, totalSize: 1, Metadata: [{ ratingKey: "10" }] }
    },
    "GET /library/metadata/10": { MediaContainer: { Metadata: [item] } }
  };
}

test("a single media version split into parts is not a duplicate group", async (t) => {
  mockPlex(
    t,
    duplicateScanRoutes({
      ratingKey: "10",
      title: "Stacked Movie",
      type: "movie",
      Media: [{ id: "20", Part: [{ id: "30", file: "/m/cd1.avi" }, { id: "31", file: "/m/cd2.avi" }] }]
    })
  );

  const result = await client().duplicates();
  assert.equal(result.groups.length, 0);
});

test("reclaimable bytes exclude the other parts of the kept version", () => {
  const group = {
    bestFileId: "a1",
    files: [
      { id: "a1", mediaId: "A", size: 100 },
      { id: "a2", mediaId: "A", size: 100 },
      { id: "b1", mediaId: "B", size: 300 }
    ]
  };
  assert.equal(groupReclaimableBytes(group), 300);
});

test("section paging continues when Plex omits totalSize", async (t) => {
  let calls = 0;
  mockPlex(t, {
    "GET /library/sections/1/all": (url) => {
      calls += 1;
      const start = Number(url.searchParams.get("X-Plex-Container-Start"));
      const size = start === 0 ? 25 : 3;
      return {
        MediaContainer: {
          size,
          Metadata: Array.from({ length: size }, (_, index) => ({ ratingKey: String(start + index) }))
        }
      };
    }
  });

  const plex = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret",
    scanPageSize: 25
  });
  const items = await plex.listSectionItems({ key: "1", type: "movie" }, false);
  assert.equal(items.length, 28);
  assert.equal(calls, 2);
});

test("subtitle scans report items whose details could not be loaded", async (t) => {
  mockPlex(t, {
    "GET /library/sections": {
      MediaContainer: { Directory: [{ key: "1", title: "Movies", type: "movie" }] }
    },
    "GET /library/sections/1/all": {
      MediaContainer: { size: 1, totalSize: 1, Metadata: [{ ratingKey: "10", title: "Broken" }] }
    }
  });

  const result = await client().subtitleDuplicates();
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /1 of 1 items could not be inspected/);
});

test("language preferences match codes and names without substring collisions", () => {
  assert.equal(languagesMatch("en", ["eng", "English"]), true);
  assert.equal(languagesMatch("English", ["eng"]), true);
  assert.equal(languagesMatch("eng", ["en-US"]), true);
  assert.equal(languagesMatch("es", ["chi", "Chinese"]), false);
  assert.equal(languagesMatch("es", ["por", "Portuguese"]), false);
  assert.equal(languagesMatch("en", ["fre", "French"]), false);
  assert.equal(isUnknownLanguage(["unknown", "Unknown"]), true);
  assert.equal(isUnknownLanguage(["eng"]), false);
});

test("non-preferred language cleanup never deletes untagged subtitles", async (t) => {
  const stream = (id, extra) => ({
    streamType: 3,
    id,
    key: `/library/streams/${id}`,
    codec: "srt",
    ...extra
  });
  mockPlex(t, {
    "GET /library/sections": {
      MediaContainer: { Directory: [{ key: "1", title: "Movies", type: "movie" }] }
    },
    "GET /library/sections/1/all": {
      MediaContainer: { size: 1, totalSize: 1, Metadata: [{ ratingKey: "10" }] }
    },
    "GET /library/metadata/10": {
      MediaContainer: {
        Metadata: [
          {
            ratingKey: "10",
            title: "Movie",
            type: "movie",
            Media: [
              {
                id: "20",
                Part: [
                  {
                    id: "30",
                    file: "/m/movie.mkv",
                    Stream: [
                      stream(1, {}),
                      stream(2, { language: "Chinese", languageCode: "chi" })
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  });

  const plex = new PlexClient({
    plexUrl: "http://plex.example:32400",
    plexToken: "secret",
    subtitlePreferences: { languages: ["es"], deleteNonPreferredLanguages: true }
  });
  const result = await plex.subtitleDuplicates();
  const deleteAllLanguages = result.groups.filter((group) => group.deleteAll).map((group) => group.languageCode);
  assert.deepEqual(deleteAllLanguages, ["chi"]);
});

test("letterboxed 1080p scores as 1080p, not 720p", () => {
  const scope = scoreMedia({ width: 1920, height: 800, videoCodec: "h264" });
  const hd = scoreMedia({ width: 1280, height: 720, videoCodec: "h264" });
  const full = scoreMedia({ width: 1920, height: 1080, videoCodec: "h264" });
  assert.ok(scope.value > hd.value);
  assert.equal(scope.value, full.value);
});

test("Plex's dca codec is scored as DTS and DTS-HD MA as lossless", () => {
  const aac = scoreMedia({ height: 1080, audioCodec: "aac" });
  const dts = scoreMedia({ height: 1080, audioCodec: "dca" });
  const dtsMa = scoreMedia({ height: 1080, audioCodec: "dca", audioProfile: "ma" });
  const truehd = scoreMedia({ height: 1080, audioCodec: "truehd" });
  assert.ok(dts.value > aac.value);
  assert.equal(dtsMa.value, truehd.value);
  assert.deepEqual(
    scoreMedia({ audioCodec: "dca" }, { audioCodecs: ["dts"] }).preferenceReasons,
    ["Preferred DTS"]
  );
});

test("header auth is trusted only from configured proxy networks", () => {
  const trusted = compileTrustedProxies(cleanTrustedProxies("10.0.0.0/8, ::1, bogus"));
  assert.equal(trusted("10.1.2.3"), true);
  assert.equal(trusted("::ffff:10.1.2.3"), true);
  assert.equal(trusted("::1"), true);
  assert.equal(trusted("203.0.113.9"), false);
  assert.deepEqual(cleanTrustedProxies("10.0.0.0/8, ::1, bogus, 1.2.3.4/40"), ["10.0.0.0/8", "::1"]);
});

test("a malformed cookie from another app does not break parsing", () => {
  assert.doesNotThrow(() => parseCookies("other=%E0%A4%A; deduplarr_session=abc"));
  assert.equal(parseCookies("other=%E0%A4%A; deduplarr_session=abc").deduplarr_session, "abc");
});

test("session tokens are rejected after the session version changes", () => {
  const token = createSessionToken({ username: "admin", authMode: "builtin" }, "secret", 3);
  assert.equal(readSessionToken(token, "secret", 3).username, "admin");
  assert.equal(readSessionToken(token, "secret", 4), null);
});

test("the stored Plex token is not reused for a different Plex URL", () => {
  const stored = { plexUrl: "http://192.168.1.10:32400", plexToken: "secret" };
  assert.doesNotThrow(() => assertTokenForPlexUrl({ plexUrl: "http://192.168.1.10:32400/" }, stored));
  assert.doesNotThrow(() =>
    assertTokenForPlexUrl({ plexUrl: "http://evil.example", plexToken: "new-token" }, stored)
  );
  assert.throws(
    () => assertTokenForPlexUrl({ plexUrl: "http://evil.example" }, stored),
    /Re-enter the Plex token/
  );
  assert.throws(
    () => assertTokenForPlexUrl({ plexUrl: "http://evil.example", plexToken: "" }, stored),
    /Re-enter the Plex token/
  );
});
