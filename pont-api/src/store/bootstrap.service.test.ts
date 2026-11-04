import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GatewayDatabase } from './gateway-database.js';
import { BootstrapService } from './bootstrap.service.js';
import { SettingsRepository } from './settings.repository.js';
import { UsersRepository } from './users.repository.js';

const config = {
  getOrThrow: () => ({ dbPath: ':memory:' }),
};

describe('BootstrapService', () => {
  let users: UsersRepository;
  let settings: SettingsRepository;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const database = new GatewayDatabase(config as never);
    users = new UsersRepository(database);
    settings = new SettingsRepository(database);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('seeds the default admin when the users table is empty', async () => {
    const service = new BootstrapService(users, settings);
    await service.onModuleInit();

    expect(users.count()).toBe(1);
    expect(users.findByUsername('admin')).toMatchObject({
      username: 'admin',
      email: 'admin@local.local',
      firstName: 'admin',
      lastName: 'admin',
      enabled: true,
      admin: true,
    });
    expect(settings.get('user.admin.gatewayApiKey')?.startsWith('pont_sk_')).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Seeded admin user "admin"/));
  });

  it('does not seed when users already exist', async () => {
    const service = new BootstrapService(users, settings);
    await service.onModuleInit();
    logSpy.mockClear();
    await service.onModuleInit();

    expect(users.count()).toBe(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
