import { beforeEach, describe, expect, it } from 'vitest';

import { GatewayDatabase } from './gateway-database.js';
import { RequestLogRepository } from './request-log.repository.js';

const config = {
  getOrThrow: () => ({ dbPath: ':memory:' }),
};

describe('RequestLogRepository', () => {
  let repository: RequestLogRepository;

  beforeEach(() => {
    repository = new RequestLogRepository(new GatewayDatabase(config as never));
  });

  it('inserts and lists logs', () => {
    repository.insert({
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      app: 'client',
      title: 'Hi',
      username: 'armin',
      providerModel: 'opencode-go/glm-5',
      path: '/zen/go/v1/chat/completions',
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      durationMs: 10,
      status: 200,
    });
    const { items, total } = repository.list({ limit: 10, offset: 0 });
    expect(total).toBe(1);
    expect(items[0].username).toBe('armin');
  });

  it('filters logs and stats by username for non-admins', () => {
    const insert = (username: string): void => {
      repository.insert({
        createdAt: new Date(),
        app: 'chat',
        title: 'Hi',
        username,
        providerModel: 'opencode-go/glm-5',
        path: '/zen/go/v1/chat/completions',
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        durationMs: 10,
        status: 200,
      });
    };
    insert('armin');
    insert('other');
    insert('other');

    expect(repository.list({ limit: 10, offset: 0 }).total).toBe(3);
    const own = repository.list({ username: 'armin', limit: 10, offset: 0 });
    expect(own.total).toBe(1);
    expect(own.items.every((row) => row.username === 'armin')).toBe(true);

    expect(repository.stats(24).allTime.requests).toBe(3);
    const ownStats = repository.stats(24, 'armin');
    expect(ownStats.allTime.requests).toBe(1);
    expect(ownStats.window.requests).toBe(1);
    expect(ownStats.byUser).toEqual([{ key: 'armin', requests: 1, tokens: 3 }]);
  });
});
