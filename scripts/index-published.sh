#!/usr/bin/env bash
# Make a newly published episode searchable, without anyone remembering to.
#
# Three steps, in this order because each feeds the next:
#
#   import-deepgram   pulls the timed, diarised turns RSS-Analysis produced for
#                     the episode into runtime/deepgram/ (read-only on that
#                     project's database; writes only our own gitignored dir)
#   embeddings:build  embeds whatever changed. Every chunk is hashed over its
#                     text, so an unchanged archive costs zero API calls and the
#                     run is cheap to repeat
#   search:index      the keyword index is derived from those chunks, so it is
#                     rebuilt after them and never before
#
# Why the host and not the app: runtime/deepgram is not mounted into the
# container (docker-compose mounts only database, uploads and embeddings), so a
# hook inside Payload would silently fall back to the published transcript and
# write chunks that disagree with the 66 built from turns.
#
# Daily rather than every fifteen minutes: the whole archive is re-hashed on
# each run, and the Gemini embedding quota is a daily allowance that resets at
# 09:00 Italian time — hence the timer at 09:30.
#
# An episode published before RSS-Analysis has transcribed it has no turn file
# yet, so it is embedded from its published transcript and becomes searchable
# immediately. When the turns arrive the hashes change and it is re-embedded
# from them. Self-correcting, and a couple of dozen chunks either way.
#
# The local tsx binary, not npx: nothing here may write to ~/.npm.
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>runtime/.index-published.lock
flock -n 9 || { echo "index-published: another run holds the lock"; exit 0; }
export NODE_OPTIONS=--no-deprecation
node_modules/.bin/tsx scripts/import-deepgram.ts
node_modules/.bin/tsx scripts/build-embeddings.ts
node_modules/.bin/tsx scripts/build-search-index.ts
