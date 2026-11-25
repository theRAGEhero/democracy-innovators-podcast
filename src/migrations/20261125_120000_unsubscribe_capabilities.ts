import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'
import { randomBytes } from 'node:crypto'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE newsletter_subscribers ADD unsubscribe_key text;`)
  await db.run(sql`ALTER TABLE newsletter_subscribers ADD unsubscribe_token_version numeric DEFAULT 1 NOT NULL;`)

  const result = await db.run(sql`SELECT id FROM newsletter_subscribers;`)
  for (const row of result.rows) {
    await db.run(sql`UPDATE newsletter_subscribers SET unsubscribe_key = ${randomBytes(24).toString('base64url')} WHERE id = ${Number(row.id)};`)
  }
  await db.run(sql`CREATE INDEX newsletter_subscribers_unsubscribe_key_idx ON newsletter_subscribers (unsubscribe_key);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS newsletter_subscribers_unsubscribe_key_idx;`)
  await db.run(sql`ALTER TABLE newsletter_subscribers DROP COLUMN unsubscribe_token_version;`)
  await db.run(sql`ALTER TABLE newsletter_subscribers DROP COLUMN unsubscribe_key;`)
}
