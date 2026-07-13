# Deduplarr

Deduplarr is a Docker Compose-first Plex duplicate cleanup companion with an interface shaped for the *arr ecosystem. It connects to Plex with a server URL and token, finds duplicate movie and episode versions, audits duplicate subtitle sidecars, shows file paths and stream details, scores each version, and lets you make the keep/delete decision at a glance.

## Features

- Media duplicate review for movie, show, and video libraries using Plex metadata.
- Subtitle sidecar audit for duplicate external subtitles, including language, format, flags, stream title, sidecar path, and Plex stream identifiers.
- Keep preferences for media containers, video codecs, audio codecs, subtitle languages, subtitle formats, and subtitle flags.
- Optional subtitle cleanup mode for non-preferred languages.
- Guarded bulk deletion with explicit confirmation, progress, cancel support, retry handling, and sampled failure details.
- Scheduled media and subtitle scans with off, daily, weekly, and monthly options plus time-of-day controls.
- Built-in login with optional reverse-proxy header authentication.

## Plex Access Model

Deduplarr is intentionally API-only for scanning and scoring. Plex already knows each library item, media version, media part, file path, video stream, audio stream, subtitle stream, and duplicate grouping, so Deduplarr does not need direct filesystem mounts for those workflows.

Deletion is different: Deduplarr asks Plex to delete the selected media version or external subtitle stream. Auto mode can delete every rejected version or rejected subtitle sidecar across the scan in one guarded action. That requires Plex itself to have media deletion enabled and write access to the media path. Embedded and burned-in subtitles are not delete targets. If Plex cannot delete the file, a later filesystem-delete fallback can be added, but that would require a path mapping layer between Plex paths and Deduplarr container paths.

## Scans And Cleanup

The Media Files page finds duplicate media versions and helps choose which version to keep. Manual mode lets you decide group by group. Auto mode applies the configured keep preferences, selects suggested keepers, and enables a guarded bulk delete for rejected versions.

The Subtitle Files page audits external subtitle sidecars only. Embedded and burned-in subtitles are ignored because Plex cannot remove them as standalone files. Deduplarr groups sidecars by media item, part, language, forced status, and SDH/CC status, then suggests a keeper based on subtitle preferences and Plex stream details. If enabled, non-preferred subtitle languages can be marked for full cleanup even when no preferred-language subtitle exists for that item.

Bulk deletes require typing `DELETE ALL`. While deletion is running, the dialog shows progress, lets you cancel remaining work, retries transient transport failures, and keeps sampled failure details visible when Plex or the browser cannot complete a request.

## Scheduled Scans

Settings includes separate schedules for Media Files and Subtitle Files. Each schedule can be off, daily, weekly, or monthly, with a server-time time-of-day value. Weekly schedules include a weekday selector, and monthly schedules include a day-of-month selector.

Scheduled scans reuse the same API-only scan pipeline as manual scans. Deduplarr records the last scheduled run in `/config/config.json` so a scan does not repeat every minute after its scheduled time has passed. Monthly days beyond the current month length are clamped to the last day of that month.

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

Settings are written atomically to `/config/config.json`. The Compose file mounts `./config` on the host to `/config` in the container, so pulling a new image or recreating the container does not reset Plex credentials, preferences, scan schedules, authentication, or delete settings.

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
