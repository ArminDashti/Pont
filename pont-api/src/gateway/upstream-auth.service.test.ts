import { describe, expect, it, vi } from 'vitest';

import { UnauthorizedException } from '@nestjs/common';

import type { ProviderDefinition } from '../providers/provider-definitions.js';
import { UpstreamAuthService } from './upstream-auth.service.js';

const OPENCODE_GO: ProviderDefinition = {
  id: 'opencode-go',
  label: 'OpenCode Go',
  baseUrl: 'https://opencode.ai/inference/go',
  gatewayPrefix: 'zen/go/v1',
  envVar: 'OPENCODE_GO_API_KEY',
  auth: { bearer: true, xApiKey: true },
  defaultHeaders: {},
  bridgesClaudeToChat: true,
  endpoints: [],
};

describe('UpstreamAuthService', () => {
  it('resolves username from gateway api key', () => {
    const users = {
      resolveUsernameFromGatewayKey: vi.fn().mockReturnValue('armin'),
    };
    const providerKeys = { getKey: vi.fn().mockReturnValue('upstream-key') };
    const service = new UpstreamAuthService(users as never, providerKeys as never);
    expect(service.authorize('Bearer pont_sk_test')).toBe('armin');
    expect(service.resolveUpstreamApiKey('Bearer pont_sk_test', OPENCODE_GO)).toBe('upstream-key');
  });

  it('rejects session JWT and non-panel credentials on the gateway', () => {
    const users = { resolveUsernameFromGatewayKey: vi.fn() };
    const service = new UpstreamAuthService(users as never, { getKey: vi.fn() } as never);
    expect(() => service.authorize('Bearer eyJhbG.a.b')).toThrow(UnauthorizedException);
    expect(() => service.authorize('Bearer sk-or-v1-test')).toThrow(UnauthorizedException);
    expect(() => service.authorize('Bearer oc_sk_test')).toThrow(UnauthorizedException);
    expect(users.resolveUsernameFromGatewayKey).not.toHaveBeenCalled();
  });
});
