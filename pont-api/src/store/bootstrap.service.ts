import { Injectable, OnModuleInit } from '@nestjs/common';

import { generateGatewayApiKey, gatewayKeyPrefix, hashGatewayApiKey } from '../auth/gateway-api-key.js';
import { hashPassword } from '../settings/password.js';
import { SettingsRepository } from './settings.repository.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class BootstrapService implements OnModuleInit {
  constructor(
    private readonly users: UsersRepository,
    private readonly settings: SettingsRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.users.count() > 0) {
      return;
    }
    const gatewayApiKey = generateGatewayApiKey();
    const passwordHash = await hashPassword('admin');
    this.users.insert(
      {
        username: 'admin',
        email: '',
        firstName: 'Admin',
        lastName: '',
        enabled: true,
        admin: true,
        gatewayApiKeyPrefix: gatewayKeyPrefix(gatewayApiKey),
      },
      passwordHash,
      hashGatewayApiKey(gatewayApiKey),
      gatewayKeyPrefix(gatewayApiKey),
    );
    this.settings.set('user.admin.gatewayApiKey', gatewayApiKey);
    console.log(`[pont] Seeded admin user "admin". Gateway API key (save now): ${gatewayApiKey}`);
  }
}
