import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { SettingsRepository } from '../store/settings.repository.js';
import { AppConfigService } from './app-config.service.js';

function memorySettings(): SettingsRepository {
  const values = new Map<string, string>();
  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: string) => void values.set(key, value),
    delete: (key: string) => void values.delete(key),
  } as unknown as SettingsRepository;
}

describe('AppConfigService', () => {
  it('returns an empty object before any config is saved', () => {
    const service = new AppConfigService(memorySettings());
    expect(service.get('nanobrowser')).toEqual({});
  });

  it('round-trips a JSON config per app', () => {
    const service = new AppConfigService(memorySettings());
    service.set('opendots', { models: ['claude-haiku-5-5'], skills: ['office'] });
    expect(service.get('opendots')).toEqual({ models: ['claude-haiku-5-5'], skills: ['office'] });
    expect(service.get('landing')).toEqual({});
  });

  it('rejects unknown apps', () => {
    const service = new AppConfigService(memorySettings());
    expect(() => service.get('unknown')).toThrow(NotFoundException);
    expect(() => service.set('unknown', {})).toThrow(NotFoundException);
  });
});

