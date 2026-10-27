import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pontConfigKey } from '../config/pont.config.js';
import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { EligibleModelsService } from '../settings/eligible-models.service.js';
import type { ProviderKeysService } from '../settings/provider-keys.service.js';
import { SettingsRepository } from '../store/settings.repository.js';
import { GatewayDatabase } from '../store/gateway-database.js';
import type { ServicesService } from '../settings/services.service.js';
import type { RequestLogInput, RequestLogRepository } from '../store/request-log.repository.js';
import type { RequestEventsService } from '../store/request-events.service.js';
import { SESSION_HEADER } from '../opencode-go/session.util.js';
import { ProviderProxyService } from './provider-proxy.service.js';
import { UpstreamAuthService } from './upstream-auth.service.js';

import { DEFAULT_OPENCODE_GO_INFERENCE_BASE } from '@pont/opencode-go';

const OPENCODE_GO_BASE_URL = DEFAULT_OPENCODE_GO_INFERENCE_BASE;

function mockConfigService(): ConfigService {
  return {
    get: (key: string) => (key === 'OPENCODE_GO_API_KEY' ? 'platform-key' : undefined),
    getOrThrow: (key: string) => {
      if (key !== pontConfigKey) {
        throw new Error('unexpected key');
      }
      return {
        upstreamBaseUrl: OPENCODE_GO_BASE_URL,
        platformApiKey: 'platform-key',
        dbPath: ':memory:',
        userAgent: 'pont/0.1.0',
        port: 9880,
        jwtSecret: 'test',
        webuiOrigin: 'http://127.0.0.1:9881',
      };
    },
  } as unknown as ConfigService;
}

function mockRequest(body: string, session?: string): Request {
  const stream = Readable.from([Buffer.from(body)]);
  const req = stream as Request;
  req.method = 'POST';
  req.headers = {
    'content-type': 'application/json',
    ...(session ? { [SESSION_HEADER]: session } : {}),
  };
  return req;
}

function mockResponse(): Response & { headers: Record<string, string | number>; body: Buffer } {
  const res = new EventEmitter() as Response & {
    headers: Record<string, string | number>;
    body: Buffer;
    statusCode: number;
  };
  res.headers = {};
  res.body = Buffer.alloc(0);
  res.statusCode = 200;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (name: string, value: string | number) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  };
  res.write = (chunk: Buffer) => {
    res.body = Buffer.concat([res.body, Buffer.from(chunk)]);
    return true;
  };
  res.end = ((chunk?: string) => {
    if (chunk) {
      res.body = Buffer.concat([res.body, Buffer.from(chunk)]);
    }
    res.emit('finish');
    return res;
  }) as typeof res.end;
  return res;
}

function createProxy(insert = vi.fn((input: RequestLogInput) => ({ ...input, id: 1, createdAt: '' }))) {
  const requestLogs = { insert } as unknown as RequestLogRepository;
  const requestEvents = { publish: vi.fn() } as unknown as RequestEventsService;
  const services = { assertEnabled: vi.fn() } as unknown as ServicesService;
  const configService = mockConfigService();
  const users = { resolveUsernameFromGatewayKey: vi.fn().mockReturnValue('armin') } as never;
  const providerKeys = {
    getKey: () => 'platform-key',
    freeModelSlugs: () => new Set<string>(),
  } as unknown as ProviderKeysService;
  const upstreamAuth = new UpstreamAuthService(users, providerKeys);
  const registry = new ProviderRegistry(configService);
  const eligibleModels = new EligibleModelsService(
    new SettingsRepository(new GatewayDatabase(configService)),
  );
  const proxy = new ProviderProxyService(
    configService,
    upstreamAuth,
    services,
    requestLogs,
    requestEvents,
    providerKeys,
    registry,
    eligibleModels,
  );
  return { proxy, insert, requestEvents, registry, eligibleModels };
}

describe('ProviderProxyService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards session header to upstream and records the completed request', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      expect(headers.get(SESSION_HEADER)).toBe('task-abc');
      expect(headers.get('User-Agent')).toBe('pont/0.1.0');
      expect(headers.get('Authorization')).toBe('Bearer platform-key');
      return new Response('{"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { proxy, insert, requestEvents, registry } = createProxy();
    const req = mockRequest(
      JSON.stringify({ model: 'opencode-longcat-2.5-preview-free', messages: [{ role: 'user', content: 'Hello there' }] }),
      'task-abc',
    );
    req.headers.authorization = 'Bearer pont_sk_test';
    const res = mockResponse();
    await proxy.proxyCompletion(req, res, registry.get('opencode-go'), 'chat/completions');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
    const recorded = insert.mock.calls[0][0];
    expect(recorded).toMatchObject({
      title: 'Hello there',
      username: 'armin',
      providerModel: 'opencode-go/longcat-2.5-preview',
      path: '/zen/go/v1/chat/completions',
      totalTokens: 5,
      status: 200,
    });
    expect(requestEvents.publish).toHaveBeenCalledOnce();
  });

  it('builds the catalog base URL from configuration for OpenCode Go', () => {
    const { registry } = createProxy();
    expect(registry.get('opencode-go').baseUrl).toBe(OPENCODE_GO_BASE_URL);
  });

  it('routes a unified /api/v1 call to the provider named in the model id', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      return new Response('{"usage":{"total_tokens":1}}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { proxy, insert, eligibleModels } = createProxy();
    eligibleModels.setEnabled(['openrouter-gpt-4o']);
    const req = mockRequest(JSON.stringify({ model: 'openrouter-gpt-4o', messages: [] }));
    req.headers.authorization = 'Bearer pont_sk_test';
    await proxy.proxyRoutedCompletion(req, mockResponse(), 'chat/completions');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0]).toMatchObject({
      providerModel: 'openrouter/gpt-4o',
      path: '/api/v1/chat/completions',
      status: 200,
    });
  });

  it('rejects a unified /api/v1 call whose model has no provider prefix', async () => {
    const { proxy } = createProxy();
    const req = mockRequest(JSON.stringify({ model: 'gpt-4o', messages: [] }));
    req.headers.authorization = 'Bearer pont_sk_test';
    await expect(proxy.proxyRoutedCompletion(req, mockResponse(), 'chat/completions')).rejects.toThrow(
      /provider prefix/,
    );
  });

  it('rejects OpenRouter models until an admin enables them', async () => {
    const { proxy } = createProxy();
    const req = mockRequest(JSON.stringify({ model: 'openrouter-gpt-4o', messages: [] }));
    req.headers.authorization = 'Bearer pont_sk_test';
    await expect(proxy.proxyRoutedCompletion(req, mockResponse(), 'chat/completions')).rejects.toThrow(
      /not eligible/,
    );
  });
});
