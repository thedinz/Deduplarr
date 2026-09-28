import crypto from "node:crypto";
import { promisify } from "node:util";
import { isTrustedProxyAddress } from "./config.js";

const scrypt = promisify(crypto.scrypt);
const COOKIE_NAME = "deduplarr_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const revokedSessions = new Map();
const loginFailures = new Map();

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    // Other apps on the same host can set cookies with stray "%" sequences.
    return value;
  }
}

export function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return index === -1
          ? [entry, ""]
          : [entry.slice(0, index), decodeCookieValue(entry.slice(index + 1))];
      })
  );
}

function cookieOptions(request, maxAge = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(request.secure),
    path: "/",
    maxAge
  };
}

function defaultPasswordHash() {
  return "";
}

function pruneExpired(map, now = Date.now()) {
  for (const [key, expiresAt] of map.entries()) {
    if (expiresAt <= now) map.delete(key);
  }
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password, passwordHash) {
  if (!passwordHash || passwordHash === defaultPasswordHash()) {
    return password === "admin";
  }

  const [algorithm, salt, stored] = String(passwordHash).split(":");
  if (algorithm !== "scrypt" || !salt || !stored) return false;

  const derived = await scrypt(password, salt, 64);
  return timingSafeEqualText(Buffer.from(derived).toString("base64url"), stored);
}

export function createSessionToken(user, secret, sessionVersion = 0) {
  const now = Date.now();
  const payload = base64url(
    JSON.stringify({
      username: user.username,
      authMode: user.authMode,
      sessionVersion,
      issuedAt: now,
      expiresAt: now + SESSION_TTL_MS,
      nonce: crypto.randomBytes(10).toString("base64url")
    })
  );
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(token, secret, sessionVersion = 0) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqualText(signature, sign(payload, secret))) return null;

  try {
    const session = JSON.parse(fromBase64url(payload));
    if (!session.expiresAt || session.expiresAt < Date.now()) return null;
    if ((session.sessionVersion ?? 0) !== sessionVersion) return null;
    if (session.nonce && revokedSessions.has(session.nonce)) return null;
    return session;
  } catch {
    return null;
  }
}

export function revokeSessionFromRequest(request, config) {
  const cookies = parseCookies(request.headers.cookie);
  const session = readSessionToken(
    cookies[COOKIE_NAME],
    config.sessionSecret,
    config.auth.sessionVersion
  );
  if (!session?.nonce) return;
  pruneExpired(revokedSessions);
  revokedSessions.set(session.nonce, session.expiresAt);
}

export function setSessionCookie(response, request, token) {
  response.cookie(COOKIE_NAME, token, cookieOptions(request));
}

export function clearSessionCookie(response, request) {
  response.clearCookie(COOKIE_NAME, cookieOptions(request, 0));
}

export function loginThrottleKey(request) {
  return String(request.ip || request.socket?.remoteAddress || "unknown");
}

export function loginRetryAfterSeconds(key, now = Date.now()) {
  pruneExpired(loginFailures, now);
  const entry = loginFailures.get(key);
  if (!entry || entry.count < LOGIN_MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
}

export function recordLoginFailure(key, now = Date.now()) {
  const entry = loginFailures.get(key);
  if (!entry || entry.resetAt <= now) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearLoginFailures(key) {
  loginFailures.delete(key);
}

export function externalUserFromHeaders(request, config) {
  // Only honor identity headers that arrive from a trusted reverse proxy;
  // anyone reaching the port directly could otherwise claim any user.
  if (!isTrustedProxyAddress(request.socket?.remoteAddress)) return "";

  for (const header of config.auth.externalUserHeaders) {
    const value = request.headers[header];
    if (Array.isArray(value) && value[0]) return String(value[0]);
    if (value) return String(value);
  }

  return "";
}

export function sessionFromRequest(request, config) {
  if (config.auth.mode === "external") {
    const username = externalUserFromHeaders(request, config);
    return username
      ? { username, authMode: "external", external: true }
      : null;
  }

  const cookies = parseCookies(request.headers.cookie);
  const session = readSessionToken(
    cookies[COOKIE_NAME],
    config.sessionSecret,
    config.auth.sessionVersion
  );
  return session
    ? { username: session.username, authMode: "builtin", external: false }
    : null;
}
