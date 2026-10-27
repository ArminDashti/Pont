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
});
