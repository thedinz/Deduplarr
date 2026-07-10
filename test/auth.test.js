import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  hashPassword,
  readSessionToken,
  verifyPassword
} from "../src/auth.js";

test("verifies the default admin password before a hash is stored", async () => {
  assert.equal(await verifyPassword("admin", ""), true);
  assert.equal(await verifyPassword("wrong", ""), false);
});

test("hashes and verifies a changed password", async () => {
  const hash = await hashPassword("better-password");

  assert.equal(await verifyPassword("better-password", hash), true);
  assert.equal(await verifyPassword("admin", hash), false);
});

test("signs and reads session tokens", () => {
  const token = createSessionToken(
    { username: "admin", authMode: "builtin" },
    "test-secret"
  );
  const session = readSessionToken(token, "test-secret");

  assert.equal(session.username, "admin");
  assert.equal(session.authMode, "builtin");
  assert.equal(readSessionToken(token, "wrong-secret"), null);
});
