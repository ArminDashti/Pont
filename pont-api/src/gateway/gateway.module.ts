import { Module } from '@nestjs/common';

import { ProviderCatalogModule } from '../providers/provider-catalog.module.js';
import { StoreModule } from '../store/store.module.js';
import { OpencodeGoLegacyController } from './opencode-go-legacy.controller.js';
import { ProviderGatewayController } from './provider-gateway.controller.js';
import { ProviderProxyService } from './provider-proxy.service.js';
import { UnifiedGatewayController } from './unified-gateway.controller.js';
import { UpstreamAuthService } from './upstream-auth.service.js';

@Module({
  imports: [StoreModule, ProviderCatalogModule],
  controllers: [UnifiedGatewayController, ProviderGatewayController, OpencodeGoLegacyController],
  providers: [ProviderProxyService, UpstreamAuthService],
  exports: [ProviderProxyService, UpstreamAuthService],
})
export class GatewayModule {}
