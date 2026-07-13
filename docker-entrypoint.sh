#!/bin/sh
set -e

# Seed the template database into the mounted data volume if missing.
# The compose volume mount shadows /app/data, so we keep a pristine copy
# at /app/seed/_template.db and copy it into the volume on first run.
TEMPLATE_DEST="/app/data/games/_template.db"
TEMPLATE_SEED="/app/seed/_template.db"

if [ ! -f "$TEMPLATE_DEST" ] && [ -f "$TEMPLATE_SEED" ]; then
  mkdir -p /app/data/games
  cp "$TEMPLATE_SEED" "$TEMPLATE_DEST"
  echo "[entrypoint] Seeded template database into $TEMPLATE_DEST"
fi

exec "$@"