import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { pontConfigKey } from '../config/pont.config.js';
import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { ProviderKeysService } from '../settings/provider-keys.service.js';
import { UsersService } from '../settings/users.service.js';
import { BootstrapService } from '../store/bootstrap.service.js';
import { GatewayDatabase } from '../store/gateway-database.js';
import { RequestLogRepository } from '../store/request-log.repository.js';
import { SettingsRepository } from '../store/settings.repository.js';
import { UserModelsRepository } from '../store/user-models.repository.js';
import { UsersRepository } from '../store/users.repository.js';
import { AdminController } from './admin.controller.js';
import { AdminSessionService } from './admin-session.service.js';

function configService(): ConfigService {
  return {
    get: () => undefined,
    getOrThrow: (key: string) => {
      if (key !== pontConfigKey) {
        throw new Error(key);
      }
      return {
        upstreamBaseUrl: 'https://opencode.ai/inference/go',
        opencodeZenBaseUrl: 'https://opencode.ai/zen/v1',
        dbPath: ':memory:',
        userAgent: 'pont/test',
        port: 0,
        webuiOrigin: 'http://127.0.0.1',
      };
    },
  } as unknown as ConfigService;
}

describe('admin API', () => {
  it('logs in and stores a provider key', async () => {
    const database = new GatewayDatabase(configService());
    const settings = new SettingsRepository(database);
    const usersRepo = new UsersRepository(database);
    await new BootstrapService(usersRepo, settings).onModuleInit();
    const registry = new ProviderRegistry(configService());
    const keys = new ProviderKeysService(configService(), settings, registry);
    const sessions = new AdminSessionService();
    const controller = new AdminController(
      sessions,
      new UsersService(usersRepo, new UserModelsRepository(database), settings),
      new UserModelsRepository(database),
      new RequestLogRepository(database),
      keys,
      registry,
      configService(),
    );

    let cookie = '';
    const res = {
      cookie: (_name: string, token: string) => {
        cookie = `pont_admin=${token}`;
      },
    } as unknown as Response;
    const login = await controller.login({ username: 'admin', password: 'admin' }, res);
    expect(login.username).toBe('admin');

    const req = { headers: { cookie } } as Request;
    const saved = controller.setKey(req, 'openai', { apiKey: 'sk-test-openai-key-value' });
    expect(saved).toMatchObject({ id: 'openai', source: 'settings' });
    expect(saved.maskedKey?.startsWith('sk-t')).toBe(true);

    const cleared = controller.setKey(req, 'openai', { apiKey: '' });
    expect(cleared.source).toBe('none');
  });
});
