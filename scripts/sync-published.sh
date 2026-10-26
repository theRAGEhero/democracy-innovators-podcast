#!/usr/bin/env bash
# Fill in what only the Castopod feed and the Nextcloud share know about a
# published episode: audio URL, square cover, episode number and series
# (sync-castopod-audio) and the chapter anchors that make chapter titles links
# into the transcript (import-castopod-chapters).
#
# Both scripts are idempotent and scoped to published episodes, so this runs
# unattended from dip-website-sync.timer every 15 minutes. It used to be two
# commands typed by hand after every release.
#
# The local tsx binary, not npx: nothing here may write to ~/.npm.
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>runtime/.sync-published.lock
flock -n 9 || { echo "sync-published: another run holds the lock"; exit 0; }
export NODE_OPTIONS=--no-deprecation
node_modules/.bin/tsx scripts/sync-castopod-audio.ts --apply
node_modules/.bin/tsx scripts/import-castopod-chapters.ts --apply
