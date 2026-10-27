import { Module } from '@nestjs/common';

import { ProviderRegistry } from './provider-registry.service.js';

/** Provider catalog (static definitions plus base URLs from configuration). */
@Module({
  providers: [ProviderRegistry],
  exports: [ProviderRegistry],
})
export class ProviderCatalogModule {}
