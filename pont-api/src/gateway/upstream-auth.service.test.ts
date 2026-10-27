import { describe, expect, it, vi } from 'vitest';

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
});
