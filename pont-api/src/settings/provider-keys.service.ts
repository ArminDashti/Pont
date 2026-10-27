import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type ProviderDefinition } from '../providers/provider-definitions.js';
import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { SettingsRepository } from '../store/settings.repository.js';

export type ProviderKeySource = 'settings' | 'env' | 'none';

export interface ProviderKeyStatus {
  id: string;
  source: ProviderKeySource;
  maskedKey: string | undefined;
}

export function maskSecret(secret: string): string {
  return secret.length <= 8 ? '********' : `${secret.slice(0, 4)}********${secret.slice(-4)}`;
}

function storageKey(providerId: string): string {
  return `provider.${providerId}.apiKey`;
}

/** Provider API keys: settings-stored key wins over the environment key. */
@Injectable()
export class ProviderKeysService {
  constructor(
    private readonly configService: ConfigService,
    private readonly settings: SettingsRepository,
    private readonly registry: ProviderRegistry,
  ) {}

  getKey(providerId: string): string | undefined {
    return this.readStored(providerId) ?? this.readEnv(this.registry.get(providerId));
  }

  listStatus(): ProviderKeyStatus[] {
    return this.registry.list().map((provider) => this.getStatus(provider.id));
  }

  getStatus(providerId: string): ProviderKeyStatus {
    const provider = this.registry.get(providerId);
    const stored = this.readStored(providerId);
    const env = this.readEnv(provider);
    const key = stored ?? env;
    return {
      id: provider.id,
      source: stored ? 'settings' : env ? 'env' : 'none',
      maskedKey: key ? maskSecret(key) : undefined,
    };
  }

  /** Stores the key; an empty value clears the stored key. */
  setKey(providerId: string, apiKey: string): ProviderKeyStatus {
    this.registry.get(providerId);
    const trimmed = apiKey.trim();
    if (!trimmed) {
      this.settings.delete(storageKey(providerId));
      return this.getStatus(providerId);
    }
    this.settings.set(storageKey(providerId), trimmed);
    return this.getStatus(providerId);
  }

  private readStored(providerId: string): string | undefined {
    return this.settings.get(storageKey(providerId)) || undefined;
  }

  private readEnv(provider: ProviderDefinition): string | undefined {
    return this.configService.get<string>(provider.envVar)?.trim() || undefined;
  }

  freeModelSlugs(): ReadonlySet<string> {
    const raw = this.settings.get('pont.freeModelSlugs');
    if (!raw) {
      return new Set();
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return new Set();
      }
      return new Set(parsed.filter((item): item is string => typeof item === 'string').map((s) => s.toLowerCase()));
    } catch {
      return new Set();
    }
  }
}
