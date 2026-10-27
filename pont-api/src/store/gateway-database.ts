import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type PontConfig, pontConfigKey } from '../config/pont.config.js';

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    app TEXT NOT NULL,
    title TEXT NOT NULL,
    username TEXT NOT NULL,
    provider_model TEXT NOT NULL,
    path TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    status INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs (created_at);
  CREATE INDEX IF NOT EXISTS idx_request_logs_app ON request_logs (app);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    admin INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    gateway_api_key_hash TEXT,
    gateway_api_key_prefix TEXT NOT NULL DEFAULT ''
  );
`;

@Injectable()
export class GatewayDatabase implements OnModuleDestroy {
  readonly db: DatabaseSync;

  constructor(configService: ConfigService) {
    const { dbPath } = configService.getOrThrow<PontConfig>(pontConfigKey);
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA);
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}
