import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { ProviderProxyService } from '../gateway/provider-proxy.service.js';
import { UpstreamAuthService } from '../gateway/upstream-auth.service.js';
import { ProviderRegistry } from '../providers/provider-registry.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly proxy: ProviderProxyService,
    private readonly upstreamAuth: UpstreamAuthService,
    private readonly registry: ProviderRegistry,
  ) {}

  @Get()
  health(): { ok: true; service: string } {
    return { ok: true, service: '@pont/api' };
  }

  @Get('opencode')
  async opencodeHealth(): Promise<{ ok: boolean; upstream: string }> {
    const provider = this.registry.get('opencode-go');
    let upstreamKey: string;
    try {
      upstreamKey = this.upstreamAuth.resolveUpstreamApiKey(undefined, provider);
    } catch {
      throw new ServiceUnavailableException('OPENCODE_GO_API_KEY is not configured');
    }
    const ok = await this.proxy.pingUpstreamModels(provider, upstreamKey);
    if (!ok) {
      throw new ServiceUnavailableException('OpenCode Go upstream /models check failed');
    }
    return { ok: true, upstream: provider.baseUrl };
  }
}
