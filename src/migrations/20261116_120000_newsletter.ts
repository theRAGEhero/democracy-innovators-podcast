import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

// The newsletter: subscribers, mailings, and one delivery row per recipient.
//
// Two things here cannot be expressed in Payload field config and so exist only
// because this migration is hand-written:
//
//  - the UNIQUE index on newsletter_deliveries (mailing_id, subscriber_id),
//    which is what makes building the recipient list twice a no-op instead of a
//    double send;
//  - the UNIQUE index on newsletter_mailings (episode_id). SQLite treats NULLs
//    as distinct in a unique index, so this pins one mailing per episode while
//    leaving announcements (episode_id NULL) unconstrained.
//
// The integration suite builds its schema with push: true and therefore has
// neither. Both guards are duplicated in application code for that reason.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`newsletter_subscribers\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`email\` text NOT NULL,
    \`name\` text,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`source\` text DEFAULT 'web' NOT NULL,
    \`consent_at\` text,
    \`confirmed_at\` text,
    \`unsubscribed_at\` text,
    \`confirm_sent_at\` text,
    \`confirm_token_hash\` text,
    \`confirm_token_expires_at\` text,
    \`signup_ip\` text,
    \`signup_user_agent\` text,
    \`bounce_count\` numeric DEFAULT 0,
    \`last_error\` text,
    \`notes\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)
  await db.run(sql`CREATE UNIQUE INDEX \`newsletter_subscribers_email_idx\` ON \`newsletter_subscribers\` (\`email\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_subscribers_status_idx\` ON \`newsletter_subscribers\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_subscribers_confirm_token_hash_idx\` ON \`newsletter_subscribers\` (\`confirm_token_hash\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_subscribers_updated_at_idx\` ON \`newsletter_subscribers\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_subscribers_created_at_idx\` ON \`newsletter_subscribers\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`newsletter_mailings\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`kind\` text DEFAULT 'episode' NOT NULL,
    \`episode_id\` integer,
    \`subject\` text,
    \`preheader\` text,
    \`status\` text DEFAULT 'draft' NOT NULL,
    \`body_html\` text,
    \`body_text\` text,
    \`html_bytes\` numeric,
    \`excerpt_source\` text,
    \`allow_duplicate\` integer DEFAULT false,
    \`allow_old_episode\` integer DEFAULT false,
    \`recipient_count\` numeric DEFAULT 0,
    \`sent_count\` numeric DEFAULT 0,
    \`failed_count\` numeric DEFAULT 0,
    \`queued_at\` text,
    \`started_at\` text,
    \`completed_at\` text,
    \`test_sent_to\` text,
    \`last_error\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`episode_id\`) REFERENCES \`episodes\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`CREATE INDEX \`newsletter_mailings_kind_idx\` ON \`newsletter_mailings\` (\`kind\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`newsletter_mailings_episode_idx\` ON \`newsletter_mailings\` (\`episode_id\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_mailings_status_idx\` ON \`newsletter_mailings\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_mailings_updated_at_idx\` ON \`newsletter_mailings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_mailings_created_at_idx\` ON \`newsletter_mailings\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`newsletter_deliveries\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`mailing_id\` integer NOT NULL,
    \`subscriber_id\` integer NOT NULL,
    \`email\` text NOT NULL,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`attempts\` numeric DEFAULT 0 NOT NULL,
    \`provider_message_id\` text,
    \`last_error\` text,
    \`sent_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`mailing_id\`) REFERENCES \`newsletter_mailings\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`subscriber_id\`) REFERENCES \`newsletter_subscribers\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`CREATE INDEX \`newsletter_deliveries_mailing_idx\` ON \`newsletter_deliveries\` (\`mailing_id\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_deliveries_subscriber_idx\` ON \`newsletter_deliveries\` (\`subscriber_id\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_deliveries_email_idx\` ON \`newsletter_deliveries\` (\`email\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_deliveries_status_idx\` ON \`newsletter_deliveries\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_deliveries_updated_at_idx\` ON \`newsletter_deliveries\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`newsletter_deliveries_created_at_idx\` ON \`newsletter_deliveries\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`newsletter_deliveries_mailing_subscriber_idx\` ON \`newsletter_deliveries\` (\`mailing_id\`, \`subscriber_id\`);`)

  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`newsletter_subscribers_id\` integer REFERENCES newsletter_subscribers(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`newsletter_mailings_id\` integer REFERENCES newsletter_mailings(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`newsletter_deliveries_id\` integer REFERENCES newsletter_deliveries(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_newsletter_subscribers_id_idx\` ON \`payload_locked_documents_rels\` (\`newsletter_subscribers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_newsletter_mailings_id_idx\` ON \`payload_locked_documents_rels\` (\`newsletter_mailings_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_newsletter_deliveries_id_idx\` ON \`payload_locked_documents_rels\` (\`newsletter_deliveries_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_newsletter_deliveries_id_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_newsletter_mailings_id_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_newsletter_subscribers_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`newsletter_deliveries_id\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`newsletter_mailings_id\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`newsletter_subscribers_id\`;`)
  await db.run(sql`DROP TABLE \`newsletter_deliveries\`;`)
  await db.run(sql`DROP TABLE \`newsletter_mailings\`;`)
  await db.run(sql`DROP TABLE \`newsletter_subscribers\`;`)
}
