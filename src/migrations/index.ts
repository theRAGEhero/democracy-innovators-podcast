import * as migration_20260716_170425_schema_parity_archive_map_contact from './20260716_170425_schema_parity_archive_map_contact';
import * as migration_20260719_111032_page_views_counter from './20260719_111032_page_views_counter';
import * as migration_20260720_090000_episode_chapters from './20260720_090000_episode_chapters';
import * as migration_20260720_120000_comment_email from './20260720_120000_comment_email';
import * as migration_20260720_140000_users_api_key from './20260720_140000_users_api_key';
import * as migration_20260819_200000_api_limits from './20260819_200000_api_limits';
import * as migration_20260820_150000_episode_square_cover from './20260820_150000_episode_square_cover';
import * as migration_20260830_120000_chunk_timing from './20260830_120000_chunk_timing';

export const migrations = [
  {
    up: migration_20260716_170425_schema_parity_archive_map_contact.up,
    down: migration_20260716_170425_schema_parity_archive_map_contact.down,
    name: '20260716_170425_schema_parity_archive_map_contact',
  },
  {
    up: migration_20260719_111032_page_views_counter.up,
    down: migration_20260719_111032_page_views_counter.down,
    name: '20260719_111032_page_views_counter'
  },
  {
    up: migration_20260720_090000_episode_chapters.up,
    down: migration_20260720_090000_episode_chapters.down,
    name: '20260720_090000_episode_chapters'
  },
  {
    up: migration_20260720_120000_comment_email.up,
    down: migration_20260720_120000_comment_email.down,
    name: '20260720_120000_comment_email'
  },
  {
    up: migration_20260720_140000_users_api_key.up,
    down: migration_20260720_140000_users_api_key.down,
    name: '20260720_140000_users_api_key'
  },
  {
    up: migration_20260819_200000_api_limits.up,
    down: migration_20260819_200000_api_limits.down,
    name: '20260819_200000_api_limits'
  },
  {
    up: migration_20260820_150000_episode_square_cover.up,
    down: migration_20260820_150000_episode_square_cover.down,
    name: '20260820_150000_episode_square_cover'
  },
  {
    up: migration_20260830_120000_chunk_timing.up,
    down: migration_20260830_120000_chunk_timing.down,
    name: '20260830_120000_chunk_timing'
  },
];
