import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import pontConfig from './config/pont.config.js';
import { AdminModule } from './admin/admin.module.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { HealthController } from './health/health.controller.js';
import { ProviderCatalogModule } from './providers/provider-catalog.module.js';
import { StoreModule } from './store/store.module.js';
import { WebuiModule } from './webui/webui.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [pontConfig],
      expandVariables: true,
    }),
    StoreModule,
    AdminModule,
    ProviderCatalogModule,
    GatewayModule,
    WebuiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
