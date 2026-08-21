import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`episodes\` ADD \`chapters\` text;`)
  // Episodes has drafts enabled, so the versions table needs the column too.
  await db.run(sql`ALTER TABLE \`_episodes_v\` ADD \`version_chapters\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`episodes\` DROP COLUMN \`chapters\`;`)
  await db.run(sql`ALTER TABLE \`_episodes_v\` DROP COLUMN \`version_chapters\`;`)
}
