import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

// The number the podcast actually gives an episode.
//
// The site had only list positions: EpisodeRow rendered index + 1, so the
// newest episode was always 01 and /episodes restarted the arithmetic on every
// page. Castopod publishes <itunes:episode>, which is the real number — Paul
// Nemitz is 62 — and it accounts for every episode here: 62 numbered, one
// unnumbered trailer, and three on the Italian feed that number themselves 1-3.
// The series is stored alongside the number so those three can be told apart
// rather than appearing to be the main series' first three.
//
// episodes keeps drafts, so both columns are mirrored on _episodes_v with the
// version_ prefix; without the mirror Payload's draft reads fail on the missing
// column (see 20260820_150000_episode_square_cover.ts for the same pairing).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`episodes\` ADD \`episode_number\` numeric;`)
  await db.run(sql`ALTER TABLE \`episodes\` ADD \`episode_series\` text;`)
  await db.run(sql`CREATE INDEX \`episodes_episode_number_idx\` ON \`episodes\` (\`episode_number\`);`)
  await db.run(sql`ALTER TABLE \`_episodes_v\` ADD \`version_episode_number\` numeric;`)
  await db.run(sql`ALTER TABLE \`_episodes_v\` ADD \`version_episode_series\` text;`)
  await db.run(sql`CREATE INDEX \`_episodes_v_version_version_episode_number_idx\` ON \`_episodes_v\` (\`version_episode_number\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`_episodes_v_version_version_episode_number_idx\`;`)
  await db.run(sql`ALTER TABLE \`_episodes_v\` DROP COLUMN \`version_episode_series\`;`)
  await db.run(sql`ALTER TABLE \`_episodes_v\` DROP COLUMN \`version_episode_number\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`episodes_episode_number_idx\`;`)
  await db.run(sql`ALTER TABLE \`episodes\` DROP COLUMN \`episode_series\`;`)
  await db.run(sql`ALTER TABLE \`episodes\` DROP COLUMN \`episode_number\`;`)
}
