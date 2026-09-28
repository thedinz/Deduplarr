<p align="center">
  <img src="public/logo.svg" alt="Deduplarr logo" width="96">
</p>

<h1 align="center">Deduplarr</h1>

<p align="center">Find and clean up duplicate movies, episodes, and subtitle files in Plex.</p>

## What is Deduplarr?

Over time a Plex library collects extra copies: a 720p file that was never removed after a 4K upgrade, two encodes of the same episode, or three English `.srt` files next to one movie. Plex shows these as multiple versions, but it gives you no quick way to compare them or decide which to keep.

Deduplarr is a small web app, styled like the *arr apps (Sonarr, Radarr), that connects to your Plex server and:

1. **Finds duplicates.** It lists every movie or episode that has more than one media version, and every media file with duplicate subtitle files.
2. **Scores each copy.** It compares resolution, codecs, bitrate, HDR, audio format and channels, container, and file size. It also applies your own preferences, such as "prefer MKV" or "prefer HEVC".
3. **Suggests a keeper.** You can accept the suggestions, pick keepers yourself, or let auto mode choose for the whole library.
4. **Deletes the rest through Plex.** Plex removes the rejected files, so Deduplarr never needs access to your media folders.

Everything goes through the Plex API. Deduplarr needs only your Plex URL and token, not your media paths.

## Features

- **Duplicate review** for movie and TV libraries, with file paths, video and audio details, and a quality score for each version.
- **Subtitle cleanup** for external subtitle files (sidecars), grouped by language, forced, and SDH/CC. Embedded subtitles are never touched.
- **Keep preferences** for containers, video codecs, audio codecs, subtitle languages, subtitle formats, and subtitle flags.
- **Optional removal of non-preferred subtitle languages.** Subtitles with no language tag are never removed this way.
- **Manual or auto mode.** Choose keepers group by group, or accept every suggestion and bulk-delete what's left.
- **Plex library scans** from the top bar, with progress, so Plex is up to date before you look for duplicates.
- **Scheduled scans** (daily, weekly, or monthly) for media and subtitles. The newest results load when you open the app.
- **Built-in login** or **reverse-proxy authentication** (Authelia, Authentik, oauth2-proxy, and similar).

## How deletion is kept safe

Deleting media can't be undone, so Deduplarr adds several checks:

- **Off by default.** Deletes are disabled until you turn them on in Settings.
- **Typed confirmation.** Every delete needs you to type `DELETE`, or `DELETE ALL` for bulk deletes.
- **Server-side checks.** Before each delete, the server asks Plex for the item's current versions. It refuses to delete:
  - the version you chose to keep
  - the last remaining copy of an item
  - anything at all, if your keeper has disappeared since the scan
- **Split movies stay whole.** A movie split into several files (`cd1`/`cd2`) counts as one version, never as duplicates of itself.
- **Bulk deletes can be canceled.** They show progress and a log of any failures.

## Requirements

- Docker with Docker Compose, Unraid, or Node.js 20 or newer
- A Plex Media Server and a [Plex token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)
- To delete files: **Allow media deletion** turned on in Plex (Settings → Library), and Plex must have write access to your media folders

## Installation

### Docker Compose (recommended)

Create a `docker-compose.yml`:

```yaml
services:
  deduplarr:
    image: ghcr.io/thedinz/deduplarr:latest
    container_name: deduplarr
    ports:
      - "7889:7889"
    environment:
      TZ: "America/New_York"   # your time zone; scheduled scans use it
      PUID: "1000"             # user that owns /config and runs the app
      PGID: "1000"
    volumes:
      - ./config:/config
    restart: unless-stopped
```

Start it:

```bash
docker compose up -d
```

### Docker CLI

```bash
docker run -d --name deduplarr -p 7889:7889 -e TZ=America/New_York -e PUID=1000 -e PGID=1000 -v ./config:/config --restart unless-stopped ghcr.io/thedinz/deduplarr:latest
```

### Unraid

Add a container with these settings:

| Setting | Value |
| --- | --- |
| Repository | `ghcr.io/thedinz/deduplarr:latest` |
| Port | `7889` → `7889` |
| Path | `/mnt/user/appdata/deduplarr` → `/config` |
| Variables | `TZ` = your time zone, `PUID` = `99`, `PGID` = `100` |

### First-time setup

1. Open `http://<your-server>:7889`.
2. Sign in with `admin` / `admin`.
3. Go to **Settings → Authentication** and change the password. The app shows a warning until you do.
4. In **Settings → Plex**, enter your Plex URL (for example `http://192.168.1.10:32400`) and your token. Click **Test**, then **Save**.
5. Open **Media Files** and click **Scan**.
6. When you're ready to delete, turn on **Enable delete buttons** in Settings → Plex.

### Updating

```bash
docker compose pull && docker compose up -d
```

Your settings are stored in `/config/config.json` and are kept across updates.

## Using Deduplarr

### Media Files

Click **Scan** to list every item that has more than one media version. Each version shows its path, resolution, codecs, audio, size, and score, and the best one is marked **Suggested**.

- **Manual mode:** pick a keeper in each group, then delete the other versions one at a time.
- **Auto mode:** keepers are chosen from the suggestions, and **Delete Rejected** removes every non-kept version in one confirmed action.

### Subtitle Files

Click **Scan** to list media files that have more than one external subtitle for the same language, forced, and SDH/CC combination. Deduplarr suggests a keeper based on your subtitle preferences.

If **Delete non-preferred languages** is on, subtitles in languages you didn't list are marked for removal as well. Languages match by code or name, so `en`, `eng`, and `English` are all the same language.

### Scan Plex

**Scan Plex** in the top bar tells Plex to rescan the selected libraries and shows its progress. Run it after adding or replacing files so Deduplarr sees the current state.

### Scheduled scans

In **Settings → Scan Schedules**, set separate media and subtitle schedules: off, daily, weekly, or monthly, at a chosen time.

- **Time zone:** times use the container's time zone (`TZ`), and Settings shows which zone is active.
- **Results:** the newest results load when you open Media Files or Subtitle Files. They're kept in memory until the container restarts.
- **Timing:** scheduled scans don't trigger a Plex library scan. Schedule them after Plex and any post-processing jobs usually finish.

## Configuration

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `TZ` | `Etc/UTC` | Time zone for scheduled scans |
| `PUID` / `PGID` | `1000` / `1000` | User and group that own `/config` and run the app |
| `PORT` | `7889` | HTTP port inside the container |
| `CONFIG_DIR` | `/config` | Directory holding `config.json` |
| `SESSION_SECRET` | generated | Session signing secret. If unset, a random one is generated and saved in `config.json`. |

Everything else, including Plex details, preferences, schedules, deletes, and authentication, is set in the web UI.

The container starts as root only long enough to give `/config` to `PUID:PGID`, then runs as that user.

### Authentication

**Built-in login** is on by default.

- **Rate limit:** after 10 failed sign-ins from one address, that address is blocked for 15 minutes.
- **Session reset:** changing the username, password, or auth mode signs out every other session.

**Reverse-proxy authentication** lets your proxy handle sign-in. Deduplarr then reads the username from one of these headers:

- `x-forwarded-user`
- `x-auth-request-user`
- `x-authentik-username`
- `remote-user`

These headers are only trusted from the **trusted proxy addresses** in Settings → Authentication. By default that's loopback and private networks (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`).

> [!IMPORTANT]
> With reverse-proxy auth on, anyone who can reach port 7889 from a trusted address can send a username header and sign in as that user. Narrow the trusted list to your proxy's address, and don't expose port 7889 directly.

Run Deduplarr behind HTTPS at your proxy. `X-Forwarded-For` and `X-Forwarded-Proto` are only accepted from trusted proxy addresses.

## Development

```bash
pnpm install
pnpm dev     # http://localhost:7889 with auto-reload
pnpm test
pnpm lint
```

## Images and releases

| Tag | Built from |
| --- | --- |
| `ghcr.io/thedinz/deduplarr:latest` | `main` branch |
| `ghcr.io/thedinz/deduplarr:dev` | `dev` branch |
| `ghcr.io/thedinz/deduplarr:X.Y.Z` | version tags (`vX.Y.Z`) |

GitHub Releases are created automatically from `v*` tags.

## License

[MIT](LICENSE)
