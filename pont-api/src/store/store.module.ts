import { Module } from '@nestjs/common';

import { ProviderCatalogModule } from '../providers/provider-catalog.module.js';
import { ProviderKeysService } from '../settings/provider-keys.service.js';
import { EligibleModelsService } from '../settings/eligible-models.service.js';
import { ServicesService } from '../settings/services.service.js';
import { UsersService } from '../settings/users.service.js';
import { GatewayDatabase } from './gateway-database.js';
import { RequestEventsService } from './request-events.service.js';
import { RequestLogRepository } from './request-log.repository.js';
import { SettingsRepository } from './settings.repository.js';
import { BootstrapService } from './bootstrap.service.js';
import { UsersRepository } from './users.repository.js';

@Module({
  imports: [ProviderCatalogModule],
  providers: [
    GatewayDatabase,
    RequestLogRepository,
    SettingsRepository,
    RequestEventsService,
    ProviderKeysService,
    ServicesService,
    EligibleModelsService,
    UsersRepository,
    UsersService,
    BootstrapService,
  ],
  exports: [
    RequestLogRepository,
    SettingsRepository,
    RequestEventsService,
    ProviderKeysService,
    ServicesService,
    EligibleModelsService,
    UsersService,
    ProviderCatalogModule,
  ],
})
export class StoreModule {}
