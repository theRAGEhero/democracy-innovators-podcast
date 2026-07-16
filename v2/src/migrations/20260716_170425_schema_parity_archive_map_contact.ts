import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`archive_chunks\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`episode_id\` integer NOT NULL,
    \`episode_title\` text NOT NULL,
    \`episode_slug\` text NOT NULL,
    \`source_type\` text DEFAULT 'transcript' NOT NULL,
    \`chunk_index\` numeric NOT NULL,
    \`text\` text NOT NULL,
    \`text_hash\` text NOT NULL,
    \`embedding_model\` text NOT NULL,
    \`embedding_dimension\` numeric NOT NULL,
    \`embedding\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`episode_id\`) REFERENCES \`episodes\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`CREATE INDEX \`archive_chunks_episode_idx\` ON \`archive_chunks\` (\`episode_id\`);`)
  await db.run(sql`CREATE INDEX \`archive_chunks_episode_title_idx\` ON \`archive_chunks\` (\`episode_title\`);`)
  await db.run(sql`CREATE INDEX \`archive_chunks_episode_slug_idx\` ON \`archive_chunks\` (\`episode_slug\`);`)
  await db.run(sql`CREATE INDEX \`archive_chunks_chunk_index_idx\` ON \`archive_chunks\` (\`chunk_index\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`archive_chunks_text_hash_idx\` ON \`archive_chunks\` (\`text_hash\`);`)
  await db.run(sql`CREATE INDEX \`archive_chunks_embedding_model_idx\` ON \`archive_chunks\` (\`embedding_model\`);`)
  await db.run(sql`CREATE INDEX \`archive_chunks_updated_at_idx\` ON \`archive_chunks\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`archive_chunks_created_at_idx\` ON \`archive_chunks\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`map_points\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`slug\` text NOT NULL,
    \`kind\` text NOT NULL,
    \`country\` text NOT NULL,
    \`iso2\` text,
    \`city_or_place\` text,
    \`latitude\` numeric NOT NULL,
    \`longitude\` numeric NOT NULL,
    \`confidence\` text DEFAULT 'Medium' NOT NULL,
    \`episode_no\` text,
    \`episode_title\` text,
    \`time_label\` text,
    \`research_notes\` text,
    \`needs_verification\` text,
    \`episode_id\` integer,
    \`project_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`episode_id\`) REFERENCES \`episodes\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`CREATE INDEX \`map_points_title_idx\` ON \`map_points\` (\`title\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`map_points_slug_idx\` ON \`map_points\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`map_points_kind_idx\` ON \`map_points\` (\`kind\`);`)
  await db.run(sql`CREATE INDEX \`map_points_country_idx\` ON \`map_points\` (\`country\`);`)
  await db.run(sql`CREATE INDEX \`map_points_confidence_idx\` ON \`map_points\` (\`confidence\`);`)
  await db.run(sql`CREATE INDEX \`map_points_episode_title_idx\` ON \`map_points\` (\`episode_title\`);`)
  await db.run(sql`CREATE INDEX \`map_points_episode_idx\` ON \`map_points\` (\`episode_id\`);`)
  await db.run(sql`CREATE INDEX \`map_points_project_idx\` ON \`map_points\` (\`project_id\`);`)
  await db.run(sql`CREATE INDEX \`map_points_updated_at_idx\` ON \`map_points\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`map_points_created_at_idx\` ON \`map_points\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`map_points_source_urls\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`url\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`map_points\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX \`map_points_source_urls_order_idx\` ON \`map_points_source_urls\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`map_points_source_urls_parent_id_idx\` ON \`map_points_source_urls\` (\`_parent_id\`);`)

  await db.run(sql`CREATE TABLE \`contact_submissions\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`email\` text NOT NULL,
    \`organization\` text,
    \`subject\` text NOT NULL,
    \`message\` text NOT NULL,
    \`status\` text DEFAULT 'new' NOT NULL,
    \`email_sent\` integer DEFAULT false,
    \`user_agent\` text,
    \`ip_address\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)
  await db.run(sql`CREATE INDEX \`contact_submissions_email_idx\` ON \`contact_submissions\` (\`email\`);`)
  await db.run(sql`CREATE INDEX \`contact_submissions_status_idx\` ON \`contact_submissions\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`contact_submissions_updated_at_idx\` ON \`contact_submissions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`contact_submissions_created_at_idx\` ON \`contact_submissions\` (\`created_at\`);`)

  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`archive_chunks_id\` integer;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`map_points_id\` integer;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`contact_submissions_id\` integer;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_archive_chunks_id_idx\` ON \`payload_locked_documents_rels\` (\`archive_chunks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_map_points_id_idx\` ON \`payload_locked_documents_rels\` (\`map_points_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_contact_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`contact_submissions_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`payload_locked_documents_rels_archive_chunks_id_idx\`;`)
  await db.run(sql`DROP INDEX \`payload_locked_documents_rels_map_points_id_idx\`;`)
  await db.run(sql`DROP INDEX \`payload_locked_documents_rels_contact_submissions_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`archive_chunks_id\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`map_points_id\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`contact_submissions_id\`;`)
  await db.run(sql`DROP TABLE \`map_points_source_urls\`;`)
  await db.run(sql`DROP TABLE \`map_points\`;`)
  await db.run(sql`DROP TABLE \`archive_chunks\`;`)
  await db.run(sql`DROP TABLE \`contact_submissions\`;`)
}
