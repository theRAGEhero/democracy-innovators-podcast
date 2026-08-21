import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

// Castopod publishes a square cover per episode (<itunes:image> in the feed).
// The site's own featureImageUrl is 16:9, which is the wrong shape for the
// player tile and for OS media notifications. Episodes has drafts enabled, so
// the column has to exist on the versions table too.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`episodes\` ADD \`square_cover_url\` text;`)
  await db.run(sql`ALTER TABLE \`_episodes_v\` ADD \`version_square_cover_url\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`episodes\` DROP COLUMN \`square_cover_url\`;`)
  await db.run(sql`ALTER TABLE \`_episodes_v\` DROP COLUMN \`version_square_cover_url\`;`)
}
