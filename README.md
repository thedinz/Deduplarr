# Deduplarr

Deduplarr is a Docker-first Plex duplicate cleanup companion with an interface shaped for the *arr ecosystem. It connects to Plex with a server URL and token, finds duplicate movie and episode versions, shows file paths and stream details, scores each version, and lets you make the keep/delete decision at a glance.

## Plex Access Model

The first version is intentionally API-only. Plex already knows each library item, media version, media part, file path, video stream, audio stream, subtitle stream, and duplicate grouping, so Deduplarr does not need direct filesystem mounts for scanning or scoring.

Deletion is different: Deduplarr asks Plex to delete the selected media part. That requires Plex itself to have media deletion enabled and write access to the media path. If Plex cannot delete the file, a later filesystem-delete fallback can be added, but that would require a path mapping layer between Plex paths and Deduplarr container paths.

## Run

```bash
docker run -d \
  --name deduplarr \
  -p 7878:7878 \
  -v deduplarr-config:/config \
  ghcr.io/thedinz/deduplarr:dev
```

Open `http://localhost:7878`, then add your Plex URL and token in Settings.

## Docker Compose

```bash
docker compose up -d
```

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `7878` | HTTP port inside the container |
| `CONFIG_DIR` | `/config` in Docker | Stores local app config |
| `PLEX_URL` | empty | Plex server URL, for example `http://192.168.1.10:32400` |
| `PLEX_TOKEN` | empty | Plex token |
| `SCAN_PAGE_SIZE` | `200` | Plex pagination size |
| `ENABLE_DESTRUCTIVE_ACTIONS` | `false` | Enables delete buttons |

## Development

```bash
pnpm install
pnpm dev
```

The local app listens on `http://localhost:7878`.

## Release Images

The repository workflow publishes Docker images to:

- `ghcr.io/thedinz/deduplarr:dev` from the `dev` branch
- `ghcr.io/thedinz/deduplarr:latest` from the `main` branch
- `ghcr.io/thedinz/deduplarr:vX.Y.Z` from version tags

GitHub Releases are created from `v*` tags.
