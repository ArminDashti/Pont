import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type PontConfig, pontConfigKey } from '../config/pont.config.js';
import { type ProviderDefinition, type ProviderId, PROVIDER_IDS, buildProviderDefinitions } from './provider-definitions.js';

/** Read-only lookup over the provider catalog. */
@Injectable()
export class ProviderRegistry {
  private readonly definitions: ReadonlyMap<ProviderId, ProviderDefinition>;

  constructor(configService: ConfigService) {
    const { upstreamBaseUrl } = configService.getOrThrow<PontConfig>(pontConfigKey);
    this.definitions = new Map(
      buildProviderDefinitions({ opencodeGo: upstreamBaseUrl }).map((definition) => [definition.id, definition]),
    );
  }

  list(): ProviderDefinition[] {
    return PROVIDER_IDS.map((id) => this.get(id));
  }

  find(providerId: string): ProviderDefinition | undefined {
    return this.definitions.get(providerId as ProviderId);
  }

  get(providerId: string): ProviderDefinition {
    const definition = this.find(providerId);
    if (!definition) {
      throw new NotFoundException(`Unknown provider "${providerId}"`);
    }
    return definition;
  }
}
