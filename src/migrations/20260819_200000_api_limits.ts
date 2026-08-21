import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

// Daily tally of upstream API rate-limit / quota refusals.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`api_limits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`key\` text NOT NULL,
    \`day\` text NOT NULL,
    \`provider\` text NOT NULL,
    \`operation\` text NOT NULL,
    \`model\` text,
    \`count\` numeric DEFAULT 0 NOT NULL,
    \`last_status\` numeric,
    \`last_message\` text,
    \`last_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)
  await db.run(sql`CREATE UNIQUE INDEX \`api_limits_key_idx\` ON \`api_limits\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`api_limits_day_idx\` ON \`api_limits\` (\`day\`);`)
  await db.run(sql`CREATE INDEX \`api_limits_updated_at_idx\` ON \`api_limits\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`api_limits_created_at_idx\` ON \`api_limits\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`api_limits_id\` integer REFERENCES api_limits(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_api_limits_id_idx\` ON \`payload_locked_documents_rels\` (\`api_limits_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`api_limits\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_api_limits_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`api_limits_id\`;`)
}
