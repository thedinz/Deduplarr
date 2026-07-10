import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const COOKIE_NAME = "deduplarr_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return index === -1
          ? [entry, ""]
          : [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
      })
  );
}

function cookieOptions(request, maxAge = SESSION_TTL_MS) {
  const secure = Boolean(request.secure || request.headers["x-forwarded-proto"] === "https");
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge
  };
}

function defaultPasswordHash() {
  return "";
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

export function createSessionToken(user, secret) {
  const now = Date.now();
  const payload = base64url(
    JSON.stringify({
      username: user.username,
      authMode: user.authMode,
      issuedAt: now,
      expiresAt: now + SESSION_TTL_MS,
      nonce: crypto.randomBytes(10).toString("base64url")
    })
  );
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(token, secret) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqualText(signature, sign(payload, secret))) return null;

  try {
    const session = JSON.parse(fromBase64url(payload));
    if (!session.expiresAt || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function setSessionCookie(response, request, token) {
  response.cookie(COOKIE_NAME, token, cookieOptions(request));
}

export function clearSessionCookie(response, request) {
  response.clearCookie(COOKIE_NAME, cookieOptions(request, 0));
}

export function externalUserFromHeaders(request, config) {
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
  const session = readSessionToken(cookies[COOKIE_NAME], config.sessionSecret);
  return session
    ? { username: session.username, authMode: "builtin", external: false }
    : null;
}
