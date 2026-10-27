import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiModule } from './api/api.module.js';
import pontConfig from './config/pont.config.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { HealthController } from './health/health.controller.js';
import { ProviderCatalogModule } from './providers/provider-catalog.module.js';
import { StoreModule } from './store/store.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [pontConfig],
      expandVariables: true,
    }),
    StoreModule,
    ProviderCatalogModule,
    GatewayModule,
    ApiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
