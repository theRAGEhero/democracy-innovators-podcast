import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

// Passages that know when they were said.
//
// Until now a chunk was a 560-word window cut out of the published transcript,
// carrying no connection to the audio at all: the minute shown beside a
// citation was reverse-engineered from speaker cues written into the prose, and
// only 32 of 61 episodes have those. The rest fell back to the start of the
// chapter, which can sit minutes away from the sentence being quoted.
//
// The chunker now cuts on turns of speech taken from Deepgram, so each passage
// arrives with the seconds it spans, the voice that spoke it when there is only
// one, and a timeline mapping each turn's offset in the text to its time and
// speaker — which is what lets a citation resolve the exact second of the words
// that were matched, rather than the start of the passage they sit in.
//
// archive-chunks has no drafts, so there is no versions table to mirror.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`archive_chunks\` ADD \`start_time\` numeric;`)
  await db.run(sql`ALTER TABLE \`archive_chunks\` ADD \`end_time\` numeric;`)
  await db.run(sql`ALTER TABLE \`archive_chunks\` ADD \`speaker_name\` text;`)
  await db.run(sql`ALTER TABLE \`archive_chunks\` ADD \`timeline\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`archive_chunks\` DROP COLUMN \`start_time\`;`)
  await db.run(sql`ALTER TABLE \`archive_chunks\` DROP COLUMN \`end_time\`;`)
  await db.run(sql`ALTER TABLE \`archive_chunks\` DROP COLUMN \`speaker_name\`;`)
  await db.run(sql`ALTER TABLE \`archive_chunks\` DROP COLUMN \`timeline\`;`)
}
