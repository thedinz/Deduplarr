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
