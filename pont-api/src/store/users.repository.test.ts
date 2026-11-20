import { beforeEach, describe, expect, it } from 'vitest';

import { hashGatewayApiKey } from '../auth/gateway-api-key.js';
import { GatewayDatabase } from './gateway-database.js';
import { UsersRepository } from './users.repository.js';

const config = {
  getOrThrow: () => ({ dbPath: ':memory:' }),
};

describe('UsersRepository', () => {
  let repository: UsersRepository;

  beforeEach(() => {
    repository = new UsersRepository(new GatewayDatabase(config as never));
  });

  it('round-trips users', () => {
    repository.insert(
      {
        username: 'armin',
        email: '',
        firstName: 'A',
        lastName: 'B',
        enabled: true,
        admin: true,
        gatewayApiKeyPrefix: 'pont_sk_abc…',
      },
      'hash',
      hashGatewayApiKey('pont_sk_test'),
      'pont_sk_abc…',
    );
    expect(repository.list()[0]).toMatchObject({ username: 'armin', admin: true });
  });

  it('renames a user and keeps grants and logs on the new username', () => {
    repository.insert(
      {
        username: 'old',
        email: '',
        firstName: 'Old',
        lastName: 'Name',
        enabled: true,
        admin: false,
        gatewayApiKeyPrefix: '',
        timezone: 'UTC',
      },
      'hash',
      'key-hash',
      '',
    );
    const db = (repository as unknown as { database: GatewayDatabase }).database.db;
    db.prepare('INSERT INTO user_model_grants (username, model_id) VALUES (?, ?)').run('old', 'gpt');
    db.prepare(
      `INSERT INTO request_logs (created_at, app, title, username, provider_model, path, prompt_tokens, completion_tokens, total_tokens, duration_ms, status)
       VALUES ('t', 'a', 't', 'old', 'm', '/x', 0, 0, 0, 0, 200)`,
    ).run();
    repository.rename('old', 'new', 'New', 'Person');
    expect(repository.findByUsername('old')).toBeUndefined();
    expect(repository.findByUsername('new')).toMatchObject({ firstName: 'New', lastName: 'Person' });
    expect(
      (db.prepare('SELECT username FROM user_model_grants').get() as { username: string }).username,
    ).toBe('new');
    expect((db.prepare('SELECT username FROM request_logs').get() as { username: string }).username).toBe('new');
  });
});
