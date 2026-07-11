# Deduplarr

Deduplarr is a Docker Compose-first Plex duplicate cleanup companion with an interface shaped for the *arr ecosystem. It connects to Plex with a server URL and token, finds duplicate movie and episode versions, shows file paths and stream details, scores each version, and lets you make the keep/delete decision at a glance.

## Plex Access Model

The first version is intentionally API-only. Plex already knows each library item, media version, media part, file path, video stream, audio stream, subtitle stream, and duplicate grouping, so Deduplarr does not need direct filesystem mounts for scanning or scoring.

Deletion is different: Deduplarr asks Plex to delete the selected media version. Auto mode can delete every rejected version across the scan in one guarded action. That requires Plex itself to have media deletion enabled and write access to the media path. If Plex cannot delete the file, a later filesystem-delete fallback can be added, but that would require a path mapping layer between Plex paths and Deduplarr container paths.

## Docker Compose

Plex connection details are entered in the app Settings page, not in Compose environment variables.

```yaml
services:
  deduplarr:
    image: ghcr.io/thedinz/deduplarr:dev
    container_name: deduplarr
    ports:
      - "7889:7889"
    environment:
      PORT: "7889"
      CONFIG_DIR: /config
    volumes:
      - ./config:/config
    restart: unless-stopped
```

```bash
docker compose up -d
```

Open `http://localhost:7889`, sign in with `admin/admin`, then add your Plex URL and token in Settings.

## Persistent Settings

Settings are written atomically to `/config/config.json`. The Compose file mounts `./config` on the host to `/config` in the container, so pulling a new image or recreating the container does not reset Plex credentials, preferences, authentication, or delete settings.

On Unraid, map its appdata directory to the same container path:

```yaml
volumes:
  - /mnt/user/appdata/deduplarr:/config
```

## Authentication

Deduplarr starts with built-in auth enabled and the default login `admin/admin`. Change the username and password from Settings after first sign-in.

Settings also supports switching to external reverse-proxy auth. In that mode Deduplarr trusts a configured user header from your proxy. Default accepted headers are:

- `x-forwarded-user`
- `x-auth-request-user`
- `x-authentik-username`
- `remote-user`

Run Deduplarr behind HTTPS at your reverse proxy. The app sets `trust proxy` so forwarded protocol headers work correctly for cookies.

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `7889` | HTTP port inside the container |
| `CONFIG_DIR` | `/config` in Docker | Container directory containing persistent `config.json` |
| `SESSION_SECRET` | generated | Optional stable session signing secret |

## Development

```bash
pnpm install
pnpm dev
```

The local app listens on `http://localhost:7889`.

## Release Images

The repository workflow publishes Docker images to:

- `ghcr.io/thedinz/deduplarr:dev` from the `dev` branch
- `ghcr.io/thedinz/deduplarr:latest` from the `main` branch
- `ghcr.io/thedinz/deduplarr:vX.Y.Z` from version tags

GitHub Releases are created from `v*` tags.
