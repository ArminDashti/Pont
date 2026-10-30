import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pontConfigKey } from '../config/pont.config.js';
import { SESSION_HEADER } from '../opencode-go/session.util.js';
import type { ProviderKeysService } from '../settings/provider-keys.service.js';
import { extractSample, ProviderTestService, TEST_PROMPT } from './provider-test.service.js';
import { ProviderRegistry } from './provider-registry.service.js';

function createService(keys: Record<string, string | undefined> = {}): ProviderTestService {
  const configService = {
    get: () => undefined,
    getOrThrow: (key: string) => {
      if (key !== pontConfigKey) {
        throw new Error('unexpected key');
      }
      return { upstreamBaseUrl: 'https://opencode.ai/inference/go', userAgent: 'pont/test' };
    },
  } as unknown as ConfigService;
  const providerKeys = {
    getKey: (id: string) => keys[id],
    freeModelSlugs: () => new Set<string>(),
  } as unknown as ProviderKeysService;
  const registry = new ProviderRegistry(configService);
  return new ProviderTestService(configService, registry, providerKeys);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ProviderTestService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses to test a provider with no key configured', async () => {
    const service = createService({});
    await expect(service.listModels('openrouter')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists pont-encoded model ids from openrouter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [{ id: 'openai/gpt-4o-mini' }, { id: 'deepseek/deepseek-4-1-free' }] })),
    );
    const models = await createService({ openrouter: 'or-key' }).listModels('openrouter');
    expect(models).toEqual(['openrouter-openai-gpt-4o-mini', 'openrouter-deepseek-deepseek-4-1-free']);
  });

  it('surfaces upstream model-list failures as bad gateway errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401)));
    await expect(createService({ openrouter: 'sk-bad' }).listModels('openrouter')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('sends x-opencode-session on OpenCode Go upstream requests', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      expect(headers.get(SESSION_HEADER)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      if (url.endsWith('/models')) {
        return jsonResponse({ data: [{ id: 'gpt-4o-mini' }] });
      }
      expect(url).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions');
      const sent = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      expect(sent.messages[0].content).toBe(TEST_PROMPT);
      return jsonResponse({ choices: [{ message: { content: 'OK.' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createService({ 'opencode-go': 'go-key' }).testChat('opencode-go');

    expect(result).toMatchObject({ providerId: 'opencode-go', ok: true, status: 200, sample: 'OK.' });
  });

  it('accepts pont-encoded model ids for upstream chat tests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/models')) {
          return jsonResponse({ data: [{ id: 'openai/gpt-4o-mini' }] });
        }
        const sent = JSON.parse(String(init?.body)) as { model: string };
        expect(sent.model).toBe('openai/gpt-4o-mini');
        return jsonResponse({ choices: [{ message: { content: 'OK.' } }] });
      }),
    );
    const result = await createService({ openrouter: 'or-key' }).testChat(
      'openrouter',
      'openrouter-openai-gpt-4o-mini',
    );
    expect(result).toMatchObject({ ok: true, model: 'openrouter-openai-gpt-4o-mini', sample: 'OK.' });
  });
});

describe('extractSample', () => {
  it('reads Responses API output_text and Messages text blocks', () => {
    expect(extractSample('responses', JSON.stringify({ output_text: 'OK' }), true)).toBe('OK');
    expect(extractSample('messages', JSON.stringify({ content: [{ type: 'text', text: 'Hi' }] }), true)).toBe('Hi');
  });
});
