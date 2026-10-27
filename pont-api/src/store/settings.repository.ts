import { Injectable } from '@nestjs/common';

import { GatewayDatabase } from './gateway-database.js';

/** Key/value settings table: service toggles and encrypted provider keys. */
@Injectable()
export class SettingsRepository {
  constructor(private readonly database: GatewayDatabase) {}

  get(key: string): string | undefined {
    const row = this.database.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as unknown as
      | { value: string }
      | undefined;
    return row?.value;
  }

  set(key: string, value: string): void {
    this.database.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, new Date().toISOString());
  }

  delete(key: string): void {
    this.database.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}
