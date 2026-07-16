import * as migration_20260716_170425_schema_parity_archive_map_contact from './20260716_170425_schema_parity_archive_map_contact';

export const migrations = [
  {
    up: migration_20260716_170425_schema_parity_archive_map_contact.up,
    down: migration_20260716_170425_schema_parity_archive_map_contact.down,
    name: '20260716_170425_schema_parity_archive_map_contact'
  },
];
