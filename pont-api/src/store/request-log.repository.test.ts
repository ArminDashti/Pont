import { beforeEach, describe, expect, it } from 'vitest';

import { GatewayDatabase } from './gateway-database.js';
import { RequestLogRepository } from './request-log.repository.js';

const config = {
  getOrThrow: () => ({ dbPath: ':memory:' }),
};

function sampleInput(overrides: Partial<Parameters<RequestLogRepository['insert']>[0]> = {}) {
  return {
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    app: 'client',
    title: 'Hi',
    username: 'armin',
    providerModel: 'opencode-go/glm-5',
    path: '/zen/go/v1/chat/completions',
    sessionId: 'sess-1',
    clientIp: '127.0.0.1',
    promptTokens: 1,
    completionTokens: 2,
    totalTokens: 3,
    inputCacheTokens: 0,
    outputCacheTokens: 0,
    durationMs: 10,
    status: 200,
    requestJson: '{"messages":[{"role":"user","content":"Hi"}]}',
    responseCapture: '{"choices":[{"message":{"content":"Hello"}}]}',
    ...overrides,
  };
}

describe('RequestLogRepository', () => {
  let repository: RequestLogRepository;

  beforeEach(() => {
    repository = new RequestLogRepository(new GatewayDatabase(config as never));
  });

  it('inserts and lists logs', () => {
    repository.insert(sampleInput());
    const { items, total } = repository.list({ limit: 10, offset: 0 });
    expect(total).toBe(1);
    expect(items[0].username).toBe('armin');
    expect(items[0].sessionId).toBe('sess-1');
  });

  it('aggregates sessions and filters prompts by session', () => {
    repository.insert(sampleInput({ sessionId: 'sess-a', status: 200 }));
    repository.insert(sampleInput({ sessionId: 'sess-a', status: 500, durationMs: 20 }));
    repository.insert(sampleInput({ sessionId: 'sess-b', username: 'other' }));

    const sessions = repository.listSessions({ limit: 10, offset: 0 });
    expect(sessions.total).toBe(2);
    const sessA = sessions.items.find((row) => row.sessionId === 'sess-a');
    expect(sessA?.durationMs).toBe(30);
    expect(sessA?.statusCodes.sort()).toEqual([200, 500]);

    const prompts = repository.listPrompts({ sessionId: 'sess-a', limit: 10, offset: 0 });
    expect(prompts.total).toBe(2);
  });

  it('filters logs and stats by username for non-admins', () => {
    repository.insert(sampleInput({ username: 'armin' }));
    repository.insert(sampleInput({ username: 'other' }));
    repository.insert(sampleInput({ username: 'other' }));

    expect(repository.list({ limit: 10, offset: 0 }).total).toBe(3);
    const own = repository.list({ username: 'armin', limit: 10, offset: 0 });
    expect(own.total).toBe(1);
    expect(own.items.every((row) => row.username === 'armin')).toBe(true);

    expect(repository.stats(24).allTime.requests).toBe(3);
    const ownStats = repository.stats(24, 'armin');
    expect(ownStats.allTime.requests).toBe(1);
  });
});
