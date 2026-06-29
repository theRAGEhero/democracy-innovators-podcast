#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="${DIP_DATA_ROOT:-$SCRIPT_DIR/../runtime}"
BACKUP_DIR="$ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

if [ -f "$ROOT/database/payload.db" ]; then
  cp "$ROOT/database/payload.db" "$BACKUP_DIR/payload-$STAMP.db"
fi

if [ -d "$ROOT/uploads" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$ROOT" uploads
fi

find "$BACKUP_DIR" -type f -mtime +30 -delete
echo "Backup completed: $STAMP"
