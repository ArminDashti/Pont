import { Injectable, UnauthorizedException } from '@nestjs/common';

import { parseBearerToken } from '../auth/bearer.js';
import { type ProviderDefinition } from '../providers/provider-definitions.js';
import { ProviderKeysService } from '../settings/provider-keys.service.js';
import { UsersService } from '../settings/users.service.js';

@Injectable()
export class UpstreamAuthService {
  constructor(
    private readonly users: UsersService,
    private readonly providerKeys: ProviderKeysService,
  ) {}

  /** Authenticates the caller and returns username for logs. */
  authorize(authorization: string | undefined): string {
    const token = parseBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedException('Invalid or missing Pont API key');
    }
    const username = this.users.resolveUsernameFromGatewayKey(token);
    if (!username) {
      throw new UnauthorizedException('Invalid or missing Pont API key');
    }
    return username;
  }

  resolveUpstreamApiKey(_authorization: string | undefined, provider: ProviderDefinition): string {
    const key = this.providerKeys.getKey(provider.id);
    if (key) {
      return key;
    }
    throw new UnauthorizedException(
      `No ${provider.label} API key: set one in the admin panel or ${provider.envVar}`,
    );
  }
}
