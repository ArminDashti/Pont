import { Injectable, UnauthorizedException } from '@nestjs/common';

import { parseBearerToken } from '../auth/bearer.js';
import { isPontGatewayApiKey } from '../auth/gateway-api-key.js';
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
    if (this.looksLikeSessionJwt(token)) {
      throw new UnauthorizedException(
        'Session token cannot call the gateway. Sign in to the Pont panel and use your pont_sk_… gateway key (Users → reveal or rotate).',
      );
    }
    if (!isPontGatewayApiKey(token)) {
      throw new UnauthorizedException(
        'Invalid Pont API key. Use a pont_sk_… key issued from the Pont panel for your account.',
      );
    }
    const username = this.users.resolveUsernameFromGatewayKey(token);
    if (!username) {
      throw new UnauthorizedException('Invalid or missing Pont API key');
    }
    return username;
  }

  private looksLikeSessionJwt(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
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
