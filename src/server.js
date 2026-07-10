import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRuntimeConfig, publicConfig, saveConfig } from "./config.js";
import {
  clearSessionCookie,
  createSessionToken,
  sessionFromRequest,
  setSessionCookie,
  verifyPassword,
  hashPassword
} from "./auth.js";
import { PlexClient } from "./plex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 7878);

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.use("/vendor/lucide", express.static(path.join(rootDir, "node_modules", "lucide", "dist", "umd")));
app.use(express.static(path.join(rootDir, "public")));

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

async function clientFromConfig() {
  return new PlexClient(await getRuntimeConfig());
}

function plexClientFromInput(input, fallbackConfig) {
  return new PlexClient({
    ...fallbackConfig,
    plexUrl: input.plexUrl?.trim() || fallbackConfig.plexUrl,
    plexToken:
      input.plexToken === undefined || input.plexToken === ""
        ? fallbackConfig.plexToken
        : input.plexToken.trim(),
    scanPageSize: input.scanPageSize || fallbackConfig.scanPageSize
  });
}

async function requireAuth(request, response, next) {
  const config = await getRuntimeConfig();
  const user = sessionFromRequest(request, config);
  if (!user) {
    response.status(401).json({
      error:
        config.auth.mode === "external"
          ? "External auth user header missing."
          : "Authentication required.",
      authMode: config.auth.mode
    });
    return;
  }

  request.user = user;
  request.runtimeConfig = config;
  next();
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, name: "Deduplarr" });
});

app.get(
  "/api/session",
  asyncRoute(async (request, response) => {
    const config = await getRuntimeConfig();
    const user = sessionFromRequest(request, config);
    response.json({
      authenticated: Boolean(user),
      user,
      authMode: config.auth.mode,
      externalUserHeaders: config.auth.externalUserHeaders
    });
  })
);

app.post(
  "/api/login",
  asyncRoute(async (request, response) => {
    const config = await getRuntimeConfig();
    if (config.auth.mode !== "builtin") {
      response.status(400).json({ error: "Built-in login is disabled." });
      return;
    }

    const username = String(request.body?.username || "");
    const password = String(request.body?.password || "");
    const validUsername = username === config.auth.username;
    const validPassword = await verifyPassword(password, config.auth.passwordHash);

    if (!validUsername || !validPassword) {
      response.status(401).json({ error: "Invalid username or password." });
      return;
    }

    const token = createSessionToken(
      { username: config.auth.username, authMode: "builtin" },
      config.sessionSecret
    );
    setSessionCookie(response, request, token);
    response.json({ authenticated: true, user: { username, authMode: "builtin" } });
  })
);

app.post("/api/logout", (request, response) => {
  clearSessionCookie(response, request);
  response.json({ authenticated: false });
});

app.use("/api", (request, response, next) => {
  if (["/health", "/session", "/login", "/logout"].includes(request.path)) {
    next();
    return;
  }

  requireAuth(request, response, next).catch(next);
});

app.get(
  "/api/config",
  asyncRoute(async (_request, response) => {
    response.json(publicConfig(await getRuntimeConfig()));
  })
);

app.post(
  "/api/config",
  asyncRoute(async (request, response) => {
    const config = request.runtimeConfig || (await getRuntimeConfig());
    const body = request.body || {};
    const options = {};

    if (body.authPassword) {
      if (body.authPassword !== body.authPasswordConfirm) {
        response.status(400).json({ error: "New password confirmation does not match." });
        return;
      }

      const currentPassword = String(body.currentPassword || "");
      const validCurrentPassword = await verifyPassword(
        currentPassword,
        config.auth.passwordHash
      );
      if (!validCurrentPassword) {
        response.status(401).json({ error: "Current password is incorrect." });
        return;
      }

      options.passwordHash = await hashPassword(body.authPassword);
    }

    const saved = await saveConfig(body, options);
    response.json(publicConfig(saved));
  })
);

app.post(
  "/api/test-plex",
  asyncRoute(async (request, response) => {
    const config = request.runtimeConfig || (await getRuntimeConfig());
    const client = plexClientFromInput(request.body || {}, config);
    const [serverInfo, libraries] = await Promise.all([
      client.serverInfo(),
      client.libraries()
    ]);

    response.json({
      ok: true,
      server: serverInfo,
      libraries: libraries.filter((library) =>
        ["movie", "show", "video"].includes(library.type)
      )
    });
  })
);

app.get(
  "/api/status",
  asyncRoute(async (_request, response) => {
    const client = await clientFromConfig();
    response.json(await client.serverInfo());
  })
);

app.get(
  "/api/libraries",
  asyncRoute(async (_request, response) => {
    const client = await clientFromConfig();
    response.json({ libraries: await client.libraries() });
  })
);

app.post(
  "/api/scan",
  asyncRoute(async (request, response) => {
    const client = await clientFromConfig();
    const libraryKeys = Array.isArray(request.body?.libraryKeys)
      ? request.body.libraryKeys.map(String)
      : [];
    const result = await client.duplicates(libraryKeys);
    response.json({
      ...result,
      scannedAt: new Date().toISOString()
    });
  })
);

app.post(
  "/api/delete",
  asyncRoute(async (request, response) => {
    const config = await getRuntimeConfig();
    if (!config.allowDeletes) {
      response.status(403).json({
        error:
          "Destructive actions are disabled. Set ENABLE_DESTRUCTIVE_ACTIONS=true or enable deletes in Settings."
      });
      return;
    }

    if (request.body?.confirmText !== "DELETE") {
      response.status(400).json({ error: "Confirmation text did not match." });
      return;
    }

    const client = new PlexClient(config);
    response.json(await client.deletePart(String(request.body?.partKey || "")));
  })
);

app.use((request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ error: "Not found" });
    return;
  }

  response.sendFile(path.join(rootDir, "public", "index.html"));
});

app.use((error, _request, response, _next) => {
  const status = Number(error.status || error.statusCode || 500);
  response.status(status >= 400 && status < 600 ? status : 500).json({
    error: error.message || "Unexpected server error"
  });
});

app.listen(port, () => {
  console.log(`Deduplarr listening on http://localhost:${port}`);
});
