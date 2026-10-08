#!/bin/sh
set -eu

# Snapshot the archive, keep a copy in Nextcloud, and verify what was written.
#
# Two things this script will not do: copy a live SQLite file with `cp`, or
# report success for a backup it has not checked.
#
#   * `cp` of a database in WAL mode is not atomic. The main file and the -wal
#     are read at different moments, and a commit in between yields a torn
#     restore. VACUUM INTO takes a read lock and writes one consistent file,
#     WAL included. A sibling project learned this the hard way first.
#   * The snapshot is then integrity-checked, because a backup nobody has ever
#     opened is a guess rather than a backup.
#
# The optional Nextcloud copy is a second location, not a second machine: on a
# single-server deployment that folder is on the same filesystem as the
# database. It protects against losing the project directory, and against
# nothing worse. It becomes a real off-site copy only through whatever sync
# clients pull that folder off the box. Configure it in .env; without it the
# script keeps the local snapshot and says so.

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# cron runs this with almost no environment, so the few settings it needs are
# read out of .env. Only these keys, and read rather than sourced: `.` would
# execute every line of a file written for dotenv, which tolerates spaces and
# quoting that sh does not.
env_value() {
  [ -f "$SCRIPT_DIR/../.env" ] || return 0
  sed -n "s/^$1=//p" "$SCRIPT_DIR/../.env" | tail -1 | sed 's/^["'"'"']//; s/["'"'"']$//'
}

ROOT="${DIP_DATA_ROOT:-$SCRIPT_DIR/../runtime}"
BACKUP_DIR="$ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEEP="${BACKUP_KEEP:-30}"

# Deployment-specific, so it lives in .env rather than here. Writes go to this
# one folder and nowhere beside it.
NEXTCLOUD_DIR="${DIP_NEXTCLOUD_DIR:-$(env_value DIP_NEXTCLOUD_DIR)}"
NEXTCLOUD_SCAN_PATH="${DIP_NEXTCLOUD_SCAN_PATH:-$(env_value DIP_NEXTCLOUD_SCAN_PATH)}"
NEXTCLOUD_CONTAINER="${DIP_NEXTCLOUD_CONTAINER:-$(env_value DIP_NEXTCLOUD_CONTAINER)}"
: "${NEXTCLOUD_CONTAINER:=nextcloud}"

mkdir -p "$BACKUP_DIR"

DB="$ROOT/database/payload.db"
DB_BACKUP="$BACKUP_DIR/payload-$STAMP.db"
UPLOADS_BACKUP="$BACKUP_DIR/uploads-$STAMP.tar.gz"

if [ -f "$DB" ]; then
  sqlite3 "$DB" "VACUUM INTO '$DB_BACKUP'"
  result="$(sqlite3 "$DB_BACKUP" 'PRAGMA integrity_check;' | head -1)"
  if [ "$result" != "ok" ]; then
    echo "Backup FAILED integrity check: $result" >&2
    rm -f "$DB_BACKUP"
    exit 1
  fi
  echo "Database snapshot verified: $(basename "$DB_BACKUP")"
fi

if [ -d "$ROOT/uploads" ]; then
  tar -czf "$UPLOADS_BACKUP" -C "$ROOT" uploads
fi

# --- second copy, into Nextcloud ------------------------------------------
if [ -n "$NEXTCLOUD_DIR" ] && [ -d "$NEXTCLOUD_DIR" ]; then
  for file in "$DB_BACKUP" "$UPLOADS_BACKUP"; do
    [ -f "$file" ] || continue
    cp "$file" "$NEXTCLOUD_DIR/"
    # Nextcloud serves only what its own user owns; a root-owned file is
    # invisible in the web interface however correctly it was copied.
    chown www-data:www-data "$NEXTCLOUD_DIR/$(basename "$file")" 2>/dev/null || true
  done
  find "$NEXTCLOUD_DIR" -maxdepth 1 -type f -mtime "+$KEEP" -delete
  # Nextcloud indexes its own writes; a file placed on disk behind its back has
  # to be announced or it never appears.
  if docker exec -u www-data "$NEXTCLOUD_CONTAINER" php occ files:scan --path="$NEXTCLOUD_SCAN_PATH" >/dev/null 2>&1; then
    echo "Copied to Nextcloud and indexed."
  else
    echo "WARNING: copied to Nextcloud but 'occ files:scan' failed — the files are on disk but will not show in the interface." >&2
  fi
else
  echo "No second copy configured (DIP_NEXTCLOUD_DIR); keeping the local snapshot only." >&2
fi

find "$BACKUP_DIR" -type f -mtime "+$KEEP" -delete
echo "Backup completed: $STAMP (keeping $KEEP days)"
