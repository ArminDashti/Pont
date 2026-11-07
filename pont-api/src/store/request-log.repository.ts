import { Injectable, NotFoundException } from '@nestjs/common';

import { buildConversationTurn, type ConversationTurn } from '../logging/conversation-parse.js';
import { normalizeClientApp } from '../logging/request-meta.js';
import { GatewayDatabase } from './gateway-database.js';
import type { UserRecord } from './users.repository.js';

/** Max bytes stored per log row for upstream response capture. */
export const RESPONSE_CAPTURE_DB_MAX = 512 * 1024;

export interface RequestLogInput {
  createdAt: Date;
  app: string;
  title: string;
  username: string;
  providerModel: string;
  path: string;
  sessionId: string;
  clientIp: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCacheTokens: number;
  outputCacheTokens: number;
  durationMs: number;
  status: number;
  requestJson: string;
  responseCapture: string;
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
  providerModel?: string;
  status?: number;
  sessionId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface SessionLogSummary {
  sessionId: string;
  username: string;
  providerModels: string[];
  ips: string[];
  promptTokens: number;
  completionTokens: number;
  inputCacheTokens: number;
  outputCacheTokens: number;
  durationMs: number;
  startedAt: string;
  statusCodes: number[];
  promptCount: number;
}

export interface LogFilterOptions {
  apps: string[];
  users: string[];
  providerModels: string[];
  statuses: number[];
}

export interface SessionConversation {
  sessionId: string;
  username: string;
  turns: ConversationTurn[];
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
  session_id: string;
  client_ip: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cache_tokens: number;
  output_cache_tokens: number;
  duration_ms: number;
  status: number;
  request_json: string;
  response_capture: string;
}

function splitDistinctCsv(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return [...new Set(raw.split(',').map((part) => part.trim()).filter(Boolean))];
}

function splitStatusCodes(raw: string | null | undefined): number[] {
  return splitDistinctCsv(raw)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));
}

function buildWhere(query: RequestLogQuery): { sql: string; args: Array<string | number> } {
  const conditions: string[] = [];
  const args: Array<string | number> = [];
  const push = (clause: string, value: string | number): void => {
    conditions.push(clause);
    args.push(value);
  };
  if (query.app) {
    push('app = ?', query.app);
  }
  if (query.username) {
    push('username = ?', query.username);
  }
  if (query.providerModel) {
    push('provider_model = ?', query.providerModel);
  }
  if (query.status !== undefined) {
    push('status = ?', query.status);
  }
  if (query.sessionId) {
    push('session_id = ?', query.sessionId);
  }
  if (query.from) {
    push('created_at >= ?', query.from);
  }
  if (query.to) {
    push('created_at < ?', query.to);
  }
  const sql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { sql, args };
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
    sessionId: row.session_id ?? '',
    clientIp: row.client_ip ?? '',
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    inputCacheTokens: row.input_cache_tokens ?? 0,
    outputCacheTokens: row.output_cache_tokens ?? 0,
    durationMs: row.duration_ms,
    status: row.status,
    requestJson: row.request_json ?? '',
    responseCapture: row.response_capture ?? '',
  };
}

export function truncateResponseCapture(capture: string): string {
  if (capture.length <= RESPONSE_CAPTURE_DB_MAX) {
    return capture;
  }
  return capture.slice(0, RESPONSE_CAPTURE_DB_MAX);
}

@Injectable()
export class RequestLogRepository {
  constructor(private readonly database: GatewayDatabase) {}

  insert(input: RequestLogInput): RequestLogRecord {
    const storedCapture = truncateResponseCapture(input.responseCapture);
    const result = this.database.db
      .prepare(
        `INSERT INTO request_logs
          (created_at, app, title, username, provider_model, path, session_id, client_ip,
           prompt_tokens, completion_tokens, total_tokens, input_cache_tokens, output_cache_tokens,
           duration_ms, status, request_json, response_capture)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.createdAt.toISOString(),
        input.app,
        input.title,
        input.username,
        input.providerModel,
        input.path,
        input.sessionId,
        input.clientIp,
        input.promptTokens,
        input.completionTokens,
        input.totalTokens,
        input.inputCacheTokens,
        input.outputCacheTokens,
        input.durationMs,
        input.status,
        input.requestJson,
        storedCapture,
      );

    return {
      id: Number(result.lastInsertRowid),
      createdAt: input.createdAt.toISOString(),
      app: input.app,
      title: input.title,
      username: input.username,
      providerModel: input.providerModel,
      path: input.path,
      sessionId: input.sessionId,
      clientIp: input.clientIp,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      inputCacheTokens: input.inputCacheTokens,
      outputCacheTokens: input.outputCacheTokens,
      durationMs: input.durationMs,
      status: input.status,
      requestJson: input.requestJson,
      responseCapture: storedCapture,
    };
  }

  list(query: RequestLogQuery): { items: RequestLogRecord[]; total: number } {
    return this.listPrompts(query);
  }

  listPrompts(query: RequestLogQuery): { items: RequestLogRecord[]; total: number } {
    const { sql: where, args } = buildWhere(query);

    const count = this.database.db
      .prepare(`SELECT COUNT(*) AS count FROM request_logs ${where}`)
      .get(...args) as unknown as { count: number };

    const rows = this.database.db
      .prepare(`SELECT * FROM request_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...args, query.limit, query.offset) as unknown as RequestLogRow[];

    return { items: rows.map(toRecord), total: count.count };
  }

  listSessions(query: RequestLogQuery): { items: SessionLogSummary[]; total: number } {
    const sessionWhereParts = ["session_id != ''"];
    const { sql: filterWhere, args } = buildWhere(query);
    if (filterWhere) {
      sessionWhereParts.push(filterWhere.replace(/^WHERE /, ''));
    }
    const where = `WHERE ${sessionWhereParts.join(' AND ')}`;

    const countRow = this.database.db
      .prepare(`SELECT COUNT(DISTINCT session_id) AS count FROM request_logs ${where}`)
      .get(...args) as unknown as { count: number };

    const rows = this.database.db
      .prepare(
        `SELECT session_id AS sessionId,
                MIN(username) AS username,
                GROUP_CONCAT(DISTINCT provider_model) AS providerModels,
                GROUP_CONCAT(DISTINCT client_ip) AS ips,
                SUM(prompt_tokens) AS promptTokens,
                SUM(completion_tokens) AS completionTokens,
                SUM(input_cache_tokens) AS inputCacheTokens,
                SUM(output_cache_tokens) AS outputCacheTokens,
                SUM(duration_ms) AS durationMs,
                MIN(created_at) AS startedAt,
                GROUP_CONCAT(DISTINCT status) AS statusCodes,
                COUNT(*) AS promptCount
         FROM request_logs
         ${where}
         GROUP BY session_id
         ORDER BY MIN(id) DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...args, query.limit, query.offset) as unknown as {
      sessionId: string;
      username: string;
      providerModels: string;
      ips: string;
      promptTokens: number;
      completionTokens: number;
      inputCacheTokens: number;
      outputCacheTokens: number;
      durationMs: number;
      startedAt: string;
      statusCodes: string;
      promptCount: number;
    }[];

    return {
      items: rows.map((row) => ({
        sessionId: row.sessionId,
        username: row.username,
        providerModels: splitDistinctCsv(row.providerModels),
        ips: splitDistinctCsv(row.ips),
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        inputCacheTokens: row.inputCacheTokens,
        outputCacheTokens: row.outputCacheTokens,
        durationMs: row.durationMs,
        startedAt: row.startedAt,
        statusCodes: splitStatusCodes(row.statusCodes).sort((a, b) => a - b),
        promptCount: row.promptCount,
      })),
      total: countRow.count,
    };
  }

  getPrompt(id: number, username?: string): RequestLogRecord | undefined {
    const row = this.database.db.prepare('SELECT * FROM request_logs WHERE id = ?').get(id) as unknown as
      | RequestLogRow
      | undefined;
    if (!row) {
      return undefined;
    }
    if (username && row.username !== username) {
      return undefined;
    }
    return toRecord(row);
  }

  getSessionConversation(sessionId: string, username?: string): SessionConversation | undefined {
    const args: Array<string | number> = [sessionId];
    let where = 'WHERE session_id = ?';
    if (username) {
      where += ' AND username = ?';
      args.push(username);
    }
    const rows = this.database.db
      .prepare(`SELECT * FROM request_logs ${where} ORDER BY id ASC`)
      .all(...args) as unknown as RequestLogRow[];
    if (rows.length === 0) {
      return undefined;
    }
    return {
      sessionId,
      username: rows[0].username,
      turns: rows.map((row) => {
        const record = toRecord(row);
        return buildConversationTurn({
          id: record.id,
          createdAt: record.createdAt,
          providerModel: record.providerModel,
          status: record.status,
          durationMs: record.durationMs,
          promptTokens: record.promptTokens,
          completionTokens: record.completionTokens,
          title: record.title,
          requestJson: record.requestJson,
          responseCapture: record.responseCapture,
        });
      }),
    };
  }

  deletePrompt(id: number, username?: string): boolean {
    if (username) {
      const result = this.database.db
        .prepare('DELETE FROM request_logs WHERE id = ? AND username = ?')
        .run(id, username);
      return result.changes > 0;
    }
    const result = this.database.db.prepare('DELETE FROM request_logs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteSession(sessionId: string, username?: string): number {
    if (username) {
      const result = this.database.db
        .prepare('DELETE FROM request_logs WHERE session_id = ? AND username = ?')
        .run(sessionId, username);
      return Number(result.changes);
    }
    const result = this.database.db.prepare('DELETE FROM request_logs WHERE session_id = ?').run(sessionId);
    return Number(result.changes);
  }

  filterOptions(username?: string): LogFilterOptions {
    const own = username ? 'WHERE username = ?' : '';
    const args = username ? [username] : [];
    const apps = (
      this.database.db
        .prepare(`SELECT DISTINCT app AS key FROM request_logs ${own} ORDER BY key COLLATE NOCASE`)
        .all(...args) as { key: string }[]
    ).map((row) => row.key);
    const users = username
      ? [username]
      : (
          this.database.db
            .prepare('SELECT DISTINCT username AS key FROM request_logs ORDER BY key COLLATE NOCASE')
            .all() as { key: string }[]
        ).map((row) => row.key);
    const providerModels = (
      this.database.db
        .prepare(`SELECT DISTINCT provider_model AS key FROM request_logs ${own} ORDER BY key COLLATE NOCASE`)
        .all(...args) as { key: string }[]
    ).map((row) => row.key);
    const statuses = (
      this.database.db
        .prepare(`SELECT DISTINCT status AS key FROM request_logs ${own} ORDER BY key`)
        .all(...args) as { key: number }[]
    ).map((row) => row.key);
    return { apps, users, providerModels, statuses };
  }

  stats(windowHours: number, username?: string): RequestStats {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { db } = this.database;
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

/** @throws NotFoundException when row missing or not owned */
export function assertPromptFound(found: boolean): void {
  if (!found) {
    throw new NotFoundException('Log entry not found');
  }
}
