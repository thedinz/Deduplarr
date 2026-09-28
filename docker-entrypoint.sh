#!/bin/sh
set -e

# Run the app as an unprivileged user. When started as root, hand /config to
# PUID:PGID (fixing ownership left by older root-run images) and drop privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$CONFIG_DIR"
  chown -R "$PUID:$PGID" "$CONFIG_DIR"
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
