import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pontConfigKey } from '../config/pont.config.js';
import { VpnStatusService } from './vpn-status.service.js';

function createService(openvpnSkip = false): VpnStatusService {
  const configService = {
    getOrThrow: (key: string) => {
      if (key !== pontConfigKey) {
        throw new Error('unexpected key');
      }
      return { openvpnSkip };
    },
  } as unknown as ConfigService;
  return new VpnStatusService(configService);
}

describe('VpnStatusService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the public IP and the skip flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ip: '203.0.113.7' }))));

    const status = await createService(true).status();

    expect(status).toMatchObject({ skipped: true, publicIp: '203.0.113.7', publicIpError: null });
    expect(status.up).toBe(status.assignedIp !== null);
  });

  it('keeps the tunnel state when the public IP lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));

    const status = await createService().status();

    expect(status.publicIp).toBeNull();
    expect(status.publicIpError).toBe('HTTP 503');
    expect(status.interface).toBe('tun0');
  });

  it('caches the public IP until a refresh is requested', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ip: '203.0.113.9' })));
    vi.stubGlobal('fetch', fetchMock);
    const service = createService();

    await service.status();
    await service.status();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await service.status(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
