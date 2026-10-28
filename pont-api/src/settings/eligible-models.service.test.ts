import { describe, expect, it } from 'vitest';

import { SettingsRepository } from '../store/settings.repository.js';
import { GatewayDatabase } from '../store/gateway-database.js';
import { UserModelsRepository } from '../store/user-models.repository.js';
import { ConfigService } from '@nestjs/config';
import { pontConfigKey } from '../config/pont.config.js';
import { EligibleModelsService } from './eligible-models.service.js';

function createService(): EligibleModelsService {
  const config = {
    getOrThrow: (key: string) => {
      if (key !== pontConfigKey) {
        throw new Error(key);
      }
      return { dbPath: ':memory:' };
    },
  } as ConfigService;
  const db = new GatewayDatabase(config);
  return new EligibleModelsService(new SettingsRepository(db), new UserModelsRepository(db));
}

describe('EligibleModelsService', () => {
  it('defaults to OpenCode Go models only', () => {
    const service = createService();
    expect(service.isEnabled('opencode-deepseek-4-1-free')).toBe(true);
    expect(service.isEnabled('openrouter-openai/gpt-4o-mini')).toBe(false);
  });

  it('honors an explicit allowlist after save', () => {
    const service = createService();
    service.setEnabled(['openrouter-openai/gpt-4o-mini']);
    expect(service.isEnabled('openrouter-openai/gpt-4o-mini')).toBe(true);
    expect(service.isEnabled('opencode-deepseek-4-1-free')).toBe(false);
  });

  it('restricts users to an assigned subset of gateway-eligible models', () => {
    const service = createService();
    service.setEnabled(['opencode-deepseek-4-1-free', 'opencode-other-model', 'openrouter-openai/gpt-4o-mini']);
    service.setUserEnabled('alice', ['opencode-deepseek-4-1-free']);
    expect(service.isEnabledForUser('alice', 'opencode-deepseek-4-1-free')).toBe(true);
    expect(service.isEnabledForUser('alice', 'opencode-other-model')).toBe(false);
    expect(service.isEnabledForUser('bob', 'opencode-other-model')).toBe(true);
  });
});
