import { Module } from '@nestjs/common';

import { ApiAuthService } from '../auth/api-auth.service.js';
import { ProviderCatalogModule } from '../providers/provider-catalog.module.js';
import { ProviderTestService } from '../providers/provider-test.service.js';
import { ModelsCatalogService } from '../settings/models-catalog.service.js';
import { StoreModule } from '../store/store.module.js';
import { VpnStatusService } from '../vpn/vpn-status.service.js';
import { ApiController } from './api.controller.js';

@Module({
  imports: [StoreModule, ProviderCatalogModule],
  controllers: [ApiController],
  providers: [ApiAuthService, ProviderTestService, ModelsCatalogService, VpnStatusService],
})
export class ApiModule {}
