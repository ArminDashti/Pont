import { Injectable, NotFoundException } from '@nestjs/common';

import { SettingsRepository } from '../store/settings.repository.js';

/** Client apps whose settings (skills, models, options) the control panel manages. */
export const MANAGED_APPS = ['landing', 'opendots', 'nanobrowser', 'nanobot', 'providers'] as const;
export type ManagedApp = (typeof MANAGED_APPS)[number];

export type AppConfig = Record<string, unknown>;

function storageKey(app: string): string {
  return `app-config.${app}`;
}

/** Per-app JSON settings stored in the settings table; consumed by each app's own sync/fetch logic. */
@Injectable()
export class AppConfigService {
  constructor(private readonly settings: SettingsRepository) {}

  get(app: string): AppConfig {
    this.assertKnown(app);
    const raw = this.settings.get(storageKey(app));
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as AppConfig;
  }

  set(app: string, config: AppConfig): AppConfig {
    this.assertKnown(app);
    this.settings.set(storageKey(app), JSON.stringify(config));
    return config;
  }

  private assertKnown(app: string): asserts app is ManagedApp {
    if (!(MANAGED_APPS as readonly string[]).includes(app)) {
      throw new NotFoundException(`Unknown app "${app}"`);
    }
  }
}
