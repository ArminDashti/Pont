import { Injectable } from '@nestjs/common';

import {
  catalogRowsFromModelsJson,
  mergeMissingCatalogPricing,
  pricingLookupFromModelsJson,
  type CatalogModelRow,
  type CatalogPricingFields,
} from '../models/upstream-model-catalog.js';
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
    let openRouterPricing: Map<string, CatalogPricingFields> | undefined;
    for (const provider of this.registry.list()) {
      if (!this.providerKeys.getKey(provider.id)) {
        continue;
      }
      try {
        const bodyText = await this.providerTests.fetchModelsBody(provider.id);
        if (provider.id === 'openrouter') {
          openRouterPricing = pricingLookupFromModelsJson(bodyText);
        }
        rows.push(...catalogRowsFromModelsJson(bodyText, provider.id, freeSlugs));
      } catch {
        // skip providers that cannot list models right now
      }
    }
    if (openRouterPricing) {
      for (const row of rows) {
        mergeMissingCatalogPricing(row, openRouterPricing);
      }
    }
    rows.sort((a, b) => a.id.localeCompare(b.id));
    return rows;
  }
}
