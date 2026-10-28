import { Injectable } from '@nestjs/common';

import { GatewayDatabase } from './gateway-database.js';

@Injectable()
export class UserModelsRepository {
  constructor(private readonly database: GatewayDatabase) {}

  listModelIds(username: string): string[] {
    const rows = this.database.db
      .prepare('SELECT model_id FROM user_model_grants WHERE username = ? ORDER BY model_id COLLATE NOCASE')
      .all(username) as unknown as Array<{ model_id: string }>;
    return rows.map((row) => row.model_id);
  }

  hasAssignment(username: string): boolean {
    const row = this.database.db
      .prepare('SELECT 1 AS n FROM user_model_grants WHERE username = ? LIMIT 1')
      .get(username) as unknown as { n: number } | undefined;
    return row !== undefined;
  }

  setModelIds(username: string, modelIds: string[]): string[] {
    const unique = [...new Set(modelIds.map((id) => id.trim()).filter(Boolean))];
    const db = this.database.db;
    db.prepare('DELETE FROM user_model_grants WHERE username = ?').run(username);
    const insert = db.prepare('INSERT INTO user_model_grants (username, model_id) VALUES (?, ?)');
    for (const modelId of unique) {
      insert.run(username, modelId);
    }
    return unique;
  }

  deleteForUser(username: string): void {
    this.database.db.prepare('DELETE FROM user_model_grants WHERE username = ?').run(username);
  }
}
