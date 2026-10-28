import { beforeEach, describe, expect, it } from 'vitest';

import { GatewayDatabase } from '../store/gateway-database.js';
import { SettingsRepository } from '../store/settings.repository.js';
import { UserModelsRepository } from '../store/user-models.repository.js';
import { UsersRepository } from '../store/users.repository.js';
import { UsersService } from './users.service.js';

const config = {
  getOrThrow: () => ({ dbPath: ':memory:' }),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    const database = new GatewayDatabase(config as never);
    const repository = new UsersRepository(database);
    service = new UsersService(repository, new UserModelsRepository(database), new SettingsRepository(database));
  });

  it('creates a user with a gateway key', async () => {
    const { user, gatewayApiKey } = await service.create({
      username: 'tester',
      email: 't@example.com',
      firstName: 'T',
      lastName: 'E',
      enabled: true,
      admin: false,
      password: 'dopadopa123',
    });
    expect(user.username).toBe('tester');
    expect(gatewayApiKey.startsWith('pont_sk_')).toBe(true);
    expect(service.resolveUsernameFromGatewayKey(gatewayApiKey)).toBe('tester');
    expect(service.getGatewayKey('tester')).toBe(gatewayApiKey);
  });

  it('authenticates enabled users', async () => {
    await service.create({
      username: 'armin',
      email: '',
      firstName: '',
      lastName: '',
      enabled: true,
      admin: true,
      password: 'dopadopa123',
    });
    const user = await service.authenticateLogin('armin', 'dopadopa123');
    expect(user.admin).toBe(true);
  });
});
