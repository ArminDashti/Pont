import { Injectable } from '@nestjs/common';

import { catalogRowsFromModelsJson, type CatalogModelRow } from '../models/upstream-model-catalog.js';
import { ProviderKeysService } from './provider-keys.service.js';
import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { ProviderTestService } from '../providers/provider-test.service.js';

/** Upstream model catalog for keyed providers (gateway allowlist is separate). */
@Injectable()
export class ModelsCatalogService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly providerKeys: ProviderKeysService,
    private readonly providerTests: ProviderTestService,
  ) {}

  async listCatalog(): Promise<CatalogModelRow[]> {
    const freeSlugs = this.providerKeys.freeModelSlugs();
    const rows: CatalogModelRow[] = [];
    for (const provider of this.registry.list()) {
      if (!this.providerKeys.getKey(provider.id)) {
        continue;
      }
      try {
        const bodyText = await this.providerTests.fetchModelsBody(provider.id);
        rows.push(...catalogRowsFromModelsJson(bodyText, provider.id, freeSlugs));
      } catch {
        // skip providers that cannot list models right now
      }
    }
    rows.sort((a, b) => a.id.localeCompare(b.id));
    return rows;
  }
}
