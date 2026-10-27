import { Injectable } from '@nestjs/common';

import { GatewayDatabase } from './gateway-database.js';

export interface UserRecord {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  admin: boolean;
  gatewayApiKeyPrefix: string;
}

interface UserRow {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  enabled: number;
  admin: number;
  gateway_api_key_prefix: string;
}

function toRecord(row: UserRow): UserRecord {
  return {
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    enabled: row.enabled === 1,
    admin: row.admin === 1,
    gatewayApiKeyPrefix: row.gateway_api_key_prefix,
  };
}

@Injectable()
export class UsersRepository {
  constructor(private readonly database: GatewayDatabase) {}

  count(): number {
    const row = this.database.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    return row.n;
  }

  list(): UserRecord[] {
    const rows = this.database.db
      .prepare('SELECT username, email, first_name, last_name, enabled, admin, gateway_api_key_prefix FROM users ORDER BY username COLLATE NOCASE')
      .all() as unknown as UserRow[];
    return rows.map(toRecord);
  }

  findByUsername(username: string): UserRecord | undefined {
    const row = this.database.db
      .prepare(
        'SELECT username, email, first_name, last_name, enabled, admin, gateway_api_key_prefix FROM users WHERE username = ?',
      )
      .get(username) as unknown as UserRow | undefined;
    return row ? toRecord(row) : undefined;
  }

  findPasswordHash(username: string): string | undefined {
    const row = this.database.db
      .prepare('SELECT password_hash FROM users WHERE username = ?')
      .get(username) as unknown as { password_hash: string | null } | undefined;
    return row?.password_hash ?? undefined;
  }

  findGatewayKeyHash(username: string): string | undefined {
    const row = this.database.db
      .prepare('SELECT gateway_api_key_hash FROM users WHERE username = ?')
      .get(username) as unknown as { gateway_api_key_hash: string | null } | undefined;
    return row?.gateway_api_key_hash ?? undefined;
  }

  findUsernameByGatewayKeyHash(hash: string): string | undefined {
    const row = this.database.db
      .prepare('SELECT username FROM users WHERE gateway_api_key_hash = ?')
      .get(hash) as unknown as { username: string } | undefined;
    return row?.username;
  }

  insert(
    user: UserRecord,
    passwordHash: string,
    gatewayKeyHash: string,
    gatewayKeyPrefix: string,
  ): UserRecord {
    this.database.db
      .prepare(
        `INSERT INTO users (username, email, first_name, last_name, enabled, admin, password_hash,
                            gateway_api_key_hash, gateway_api_key_prefix)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.username,
        user.email,
        user.firstName,
        user.lastName,
        Number(user.enabled),
        Number(user.admin),
        passwordHash,
        gatewayKeyHash,
        gatewayKeyPrefix,
      );
    return user;
  }

  setPasswordHash(username: string, passwordHash: string): void {
    this.database.db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(passwordHash, username);
  }

  setGatewayKey(username: string, gatewayKeyHash: string, gatewayKeyPrefix: string): void {
    this.database.db
      .prepare('UPDATE users SET gateway_api_key_hash = ?, gateway_api_key_prefix = ? WHERE username = ?')
      .run(gatewayKeyHash, gatewayKeyPrefix, username);
  }

  update(user: UserRecord): UserRecord {
    this.database.db
      .prepare(
        `UPDATE users SET email = ?, first_name = ?, last_name = ?, enabled = ?, admin = ?
         WHERE username = ?`,
      )
      .run(user.email, user.firstName, user.lastName, Number(user.enabled), Number(user.admin), user.username);
    return user;
  }

  delete(username: string): void {
    this.database.db.prepare('DELETE FROM users WHERE username = ?').run(username);
  }
}
