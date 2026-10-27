import { Injectable } from '@nestjs/common';

import { normalizeClientApp } from '../logging/request-meta.js';
import { GatewayDatabase } from './gateway-database.js';
import type { UserRecord } from './users.repository.js';

export interface RequestLogInput {
  createdAt: Date;
  app: string;
  title: string;
  username: string;
  providerModel: string;
  path: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  status: number;
}

export interface RequestLogRecord extends Omit<RequestLogInput, 'createdAt'> {
  id: number;
  /** ISO 8601 UTC timestamp; the panel formats it for display. */
  createdAt: string;
}

export interface RequestLogQuery {
  app?: string;
  /** Set for non-admin callers: only their own rows are returned. */
  username?: string;
  limit: number;
  offset: number;
}

export interface UsageBreakdown {
  key: string;
  requests: number;
  tokens: number;
}

export interface RequestStats {
  allTime: { requests: number; tokens: number };
  window: { hours: number; requests: number; tokens: number; avgDurationMs: number; errorRate: number };
  byApp: UsageBreakdown[];
  byModel: UsageBreakdown[];
  byUser: UsageBreakdown[];
}


export interface AppUsageTotals {
  turns: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UserUsageStatRow {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  nanobot: AppUsageTotals;
  openwebui: AppUsageTotals;
  nanobrowser: AppUsageTotals;
}

const EMPTY_APP_USAGE: AppUsageTotals = { turns: 0, inputTokens: 0, outputTokens: 0 };

type UsageBucket = 'nanobot' | 'openwebui' | 'nanobrowser';

function usageBucketForApp(app: string): UsageBucket | undefined {
  switch (normalizeClientApp(app)) {
    case 'agent':
      return 'nanobot';
    case 'chat':
      return 'openwebui';
    case 'extension':
      return 'nanobrowser';
    default:
      return undefined;
  }
}

interface RequestLogRow {
  id: number;
  created_at: string;
  app: string;
  title: string;
  username: string;
  provider_model: string;
  path: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
  status: number;
}

function toRecord(row: RequestLogRow): RequestLogRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    app: row.app,
    title: row.title,
    username: row.username,
    providerModel: row.provider_model,
    path: row.path,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    durationMs: row.duration_ms,
    status: row.status,
  };
}

@Injectable()
export class RequestLogRepository {
  constructor(private readonly database: GatewayDatabase) {}

  insert(input: RequestLogInput): RequestLogRecord {
    const result = this.database.db
      .prepare(
        `INSERT INTO request_logs
          (created_at, app, title, username, provider_model, path,
           prompt_tokens, completion_tokens, total_tokens, duration_ms, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.createdAt.toISOString(),
        input.app,
        input.title,
        input.username,
        input.providerModel,
        input.path,
        input.promptTokens,
        input.completionTokens,
        input.totalTokens,
        input.durationMs,
        input.status,
      );

    return {
      id: Number(result.lastInsertRowid),
      createdAt: input.createdAt.toISOString(),
      app: input.app,
      title: input.title,
      username: input.username,
      providerModel: input.providerModel,
      path: input.path,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      durationMs: input.durationMs,
      status: input.status,
    };
  }

  list(query: RequestLogQuery): { items: RequestLogRecord[]; total: number } {
    const conditions: string[] = [];
    const filter: string[] = [];
    if (query.app) {
      conditions.push('app = ?');
      filter.push(query.app);
    }
    if (query.username) {
      conditions.push('username = ?');
      filter.push(query.username);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const count = this.database.db
      .prepare(`SELECT COUNT(*) AS count FROM request_logs ${where}`)
      .get(...filter) as unknown as { count: number };

    const rows = this.database.db
      .prepare(`SELECT * FROM request_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...filter, query.limit, query.offset) as unknown as RequestLogRow[];

    return { items: rows.map(toRecord), total: count.count };
  }

  stats(windowHours: number, username?: string): RequestStats {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { db } = this.database;
    // Non-admin callers see their own numbers only.
    const own = username ? 'WHERE username = ?' : '';
    const ownAndSince = username ? 'WHERE username = ? AND created_at >= ?' : 'WHERE created_at >= ?';
    const sinceArgs = username ? [username, since] : [since];

    const allTime = db
      .prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(total_tokens), 0) AS tokens FROM request_logs ${own}`)
      .get(...(username ? [username] : [])) as unknown as { requests: number; tokens: number };

    const window = db
      .prepare(
        `SELECT COUNT(*) AS requests,
                COALESCE(SUM(total_tokens), 0) AS tokens,
                COALESCE(AVG(duration_ms), 0) AS avgDurationMs,
                COALESCE(SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END), 0) AS errors
         FROM request_logs ${ownAndSince}`,
      )
      .get(...sinceArgs) as unknown as { requests: number; tokens: number; avgDurationMs: number; errors: number };

    const byApp = db
      .prepare(
        `SELECT app AS key, COUNT(*) AS requests, COALESCE(SUM(total_tokens), 0) AS tokens
         FROM request_logs ${ownAndSince} GROUP BY app ORDER BY requests DESC`,
      )
      .all(...sinceArgs) as unknown as UsageBreakdown[];

    const byModel = db
      .prepare(
        `SELECT provider_model AS key, COUNT(*) AS requests, COALESCE(SUM(total_tokens), 0) AS tokens
         FROM request_logs ${ownAndSince} GROUP BY provider_model ORDER BY requests DESC`,
      )
      .all(...sinceArgs) as unknown as UsageBreakdown[];

    const byUser = username
      ? [{ key: username, requests: window.requests, tokens: window.tokens }]
      : (db
          .prepare(
            `SELECT username AS key, COUNT(*) AS requests, COALESCE(SUM(total_tokens), 0) AS tokens
             FROM request_logs ${ownAndSince} GROUP BY username ORDER BY requests DESC`,
          )
          .all(...sinceArgs) as unknown as UsageBreakdown[]);

    return {
      allTime: { requests: allTime.requests, tokens: allTime.tokens },
      window: {
        hours: windowHours,
        requests: window.requests,
        tokens: window.tokens,
        avgDurationMs: Math.round(window.avgDurationMs),
        errorRate: window.requests === 0 ? 0 : window.errors / window.requests,
      },
      byApp,
      byModel,
      byUser,
    };
  }

  userUsageStats(users: UserRecord[]): UserUsageStatRow[] {
    const rows = this.database.db
      .prepare(
        `SELECT username, app,
                COUNT(*) AS turns,
                COALESCE(SUM(prompt_tokens), 0) AS input_tokens,
                COALESCE(SUM(completion_tokens), 0) AS output_tokens
         FROM request_logs
         GROUP BY username, app`,
      )
      .all() as unknown as {
      username: string;
      app: string;
      turns: number;
      input_tokens: number;
      output_tokens: number;
    }[];

    const usageByUser = new Map<string, Record<UsageBucket, AppUsageTotals>>();
    for (const row of rows) {
      const bucket = usageBucketForApp(row.app);
      if (!bucket || row.username === 'unknown' || row.username === 'gateway' || row.username === 'unidentified') {
        continue;
      }
      const key = row.username.toLowerCase();
      const entry = usageByUser.get(key) ?? {
        nanobot: { ...EMPTY_APP_USAGE },
        openwebui: { ...EMPTY_APP_USAGE },
        nanobrowser: { ...EMPTY_APP_USAGE },
      };
      entry[bucket].turns += row.turns;
      entry[bucket].inputTokens += row.input_tokens;
      entry[bucket].outputTokens += row.output_tokens;
      usageByUser.set(key, entry);
    }

    return users.map((user) => {
      const usage = usageByUser.get(user.username.toLowerCase());
      return {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        nanobot: usage?.nanobot ?? { ...EMPTY_APP_USAGE },
        openwebui: usage?.openwebui ?? { ...EMPTY_APP_USAGE },
        nanobrowser: usage?.nanobrowser ?? { ...EMPTY_APP_USAGE },
      };
    });
  }
}
