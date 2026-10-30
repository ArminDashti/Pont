import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import { getOpenCodeGoApiStyle } from '@pont/opencode-go';

import { type PontConfig, pontConfigKey } from '../config/pont.config.js';
import { encodePontModelIdFromUpstream, resolveUpstreamModelId } from '../models/pont-model-id.js';
import { isAnthropicModel } from '../opencode-go/anthropic-bridge/openai-to-anthropic.js';
import { openCodeGoUpstreamUrlForEndpoint } from '../opencode-go/upstream-url.js';
import { SESSION_HEADER, resolveSessionId } from '../opencode-go/session.util.js';
import { ProviderKeysService } from '../settings/provider-keys.service.js';
import { upstreamAuthHeaders } from './provider-auth.js';
import {
  type ProviderDefinition,
  type ProviderEndpoint,
  type ProviderEndpointId,
} from './provider-definitions.js';
import { ProviderRegistry } from './provider-registry.service.js';

export const TEST_PROMPT = 'Reply with OK.';
const TEST_MAX_TOKENS = 32;
const TEST_TIMEOUT_MS = 30_000;
const SAMPLE_MAX_CHARS = 300;

export interface ProviderTestResult {
  providerId: string;
  endpointId: ProviderEndpointId;
  model?: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  /** Short excerpt of the reply (or the upstream error). Never contains the API key. */
  sample: string;
}

interface UpstreamReply {
  ok: boolean;
  status: number;
  text: string;
  latencyMs: number;
}

/** Sends test requests straight to a provider's upstream, using the stored or environment key. */
@Injectable()
export class ProviderTestService {
  constructor(
    private readonly configService: ConfigService,
    private readonly registry: ProviderRegistry,
    private readonly providerKeys: ProviderKeysService,
  ) {}

  /** Raw JSON body from the provider /models endpoint. */
  async fetchModelsBody(providerId: string): Promise<string> {
    const provider = this.registry.get(providerId);
    const key = this.requireKey(provider);
    const reply = await this.send(provider, this.endpointOf(provider, 'models'), key);
    if (!reply.ok) {
      throw new BadGatewayException(extractSample('models', reply.text, false));
    }
    return reply.text;
  }

  /** Model ids the provider reports on its /models endpoint. */
  async listModels(providerId: string): Promise<string[]> {
    const provider = this.registry.get(providerId);
    const text = await this.fetchModelsBody(providerId);
    const upstream = modelIdsFrom(text);
    const freeSlugs = this.providerKeys.freeModelSlugs();
    return upstream.map((id) => encodePontModelIdFromUpstream(provider.id, id, freeSlugs));
  }

  /** Sends one simple message through the provider's chat endpoint (Messages for Anthropic and Claude on OpenCode). */
  async testChat(providerId: string, model?: string): Promise<ProviderTestResult> {
    const provider = this.registry.get(providerId);
    const rawModel = model?.trim() || (await this.firstModel(provider, this.requireKey(provider)));
    const upstreamModel = resolveUpstreamModelId(rawModel);
    return this.testEndpoint(providerId, chatEndpointId(provider, upstreamModel), rawModel);
  }

  /** Calls one catalog endpoint with a minimal request and reports the outcome. */
  async testEndpoint(providerId: string, endpointId: string, model?: string): Promise<ProviderTestResult> {
    const provider = this.registry.get(providerId);
    const endpoint = this.endpointOf(provider, endpointId);
    const key = this.requireKey(provider);

    if (endpoint.id === 'models') {
      const reply = await this.send(provider, endpoint, key);
      return toResult(provider, endpoint.id, reply, undefined);
    }

    const rawModel = model?.trim() || (await this.firstModel(provider, key));
    const upstreamModel = resolveUpstreamModelId(rawModel);
    const reply = await this.send(provider, endpoint, key, buildTestBody(endpoint.id, upstreamModel));
    return toResult(provider, endpoint.id, reply, rawModel);
  }

  private requireKey(provider: ProviderDefinition): string {
    const key = this.providerKeys.getKey(provider.id);
    if (!key) {
      throw new BadRequestException(`No ${provider.label} API key is configured`);
    }
    return key;
  }

  private endpointOf(provider: ProviderDefinition, endpointId: string): ProviderEndpoint {
    const endpoint = provider.endpoints.find((candidate) => candidate.id === endpointId);
    if (!endpoint) {
      throw new NotFoundException(`${provider.label} does not offer endpoint "${endpointId}"`);
    }
    return endpoint;
  }

  private async firstModel(provider: ProviderDefinition, key: string): Promise<string> {
    const reply = await this.send(provider, this.endpointOf(provider, 'models'), key);
    if (!reply.ok) {
      throw new BadGatewayException(extractSample('models', reply.text, false));
    }
    const [model] = modelIdsFrom(reply.text);
    if (!model) {
      throw new BadRequestException(`No models available from ${provider.label}`);
    }
    return model;
  }

  private async send(
    provider: ProviderDefinition,
    endpoint: ProviderEndpoint,
    key: string,
    body?: Record<string, unknown>,
  ): Promise<UpstreamReply> {
    const headers = upstreamAuthHeaders(provider, key);
    headers.set('User-Agent', this.userAgent());
    if (provider.id === 'opencode-go') {
      headers.set(SESSION_HEADER, resolveSessionId(undefined).sessionId);
    }
    if (body) {
      headers.set('Content-Type', 'application/json');
    }
    const started = performance.now();
    try {
      const modelName = typeof body?.model === 'string' ? body.model : undefined;
      const url =
        provider.id === 'opencode-go'
          ? openCodeGoUpstreamUrlForEndpoint(provider.baseUrl, endpoint.id, modelName)
          : `${provider.baseUrl}/${endpoint.path}`;
      const response = await fetch(url, {
        method: endpoint.method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      });
      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
        latencyMs: Math.round(performance.now() - started),
      };
    } catch {
      return {
        ok: false,
        status: 502,
        text: `${provider.label} is unreachable`,
        latencyMs: Math.round(performance.now() - started),
      };
    }
  }

  private userAgent(): string {
    return this.configService.getOrThrow<PontConfig>(pontConfigKey).userAgent;
  }
}

function chatEndpointId(provider: ProviderDefinition, model: string | undefined): ProviderEndpointId {
  if (provider.bridgesClaudeToChat && model && isAnthropicModel(model)) {
    return 'messages';
  }
  if (provider.id === 'opencode-go' && model) {
    const style = getOpenCodeGoApiStyle(model);
    if (style === 'messages') {
      return 'messages';
    }
    if (style === 'responses') {
      return 'responses';
    }
  }
  return 'chat';
}

function buildTestBody(endpointId: ProviderEndpointId, model: string): Record<string, unknown> {
  const userMessage = [{ role: 'user', content: TEST_PROMPT }];
  switch (endpointId) {
    case 'chat':
      return { model, messages: userMessage, max_tokens: TEST_MAX_TOKENS };
    case 'messages':
      return { model, messages: userMessage, max_tokens: TEST_MAX_TOKENS };
    case 'responses':
      return { model, input: TEST_PROMPT, max_output_tokens: TEST_MAX_TOKENS };
    case 'models':
      return {};
  }
}

function toResult(
  provider: ProviderDefinition,
  endpointId: ProviderEndpointId,
  reply: UpstreamReply,
  model: string | undefined,
): ProviderTestResult {
  return {
    providerId: provider.id,
    endpointId,
    model,
    ok: reply.ok,
    status: reply.status,
    latencyMs: reply.latencyMs,
    sample: extractSample(endpointId, reply.text, reply.ok),
  };
}

function modelIdsFrom(text: string): string[] {
  const parsed = parseJson(text);
  const data = isRecord(parsed) && Array.isArray(parsed.data) ? parsed.data : [];
  return data.flatMap((item) => (isRecord(item) && typeof item.id === 'string' ? [item.id] : []));
}

/** Pulls the human-readable reply (or error message) out of an upstream response body. */
export function extractSample(endpointId: ProviderEndpointId, text: string, ok: boolean): string {
  const parsed = parseJson(text);
  if (!ok) {
    const error = isRecord(parsed) ? parsed.error : undefined;
    const message = isRecord(error) && typeof error.message === 'string' ? error.message : undefined;
    return truncate(message ?? (isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : text));
  }
  if (endpointId === 'models') {
    return `${modelIdsFrom(text).length} models available`;
  }
  return truncate(replyTextFrom(parsed) ?? text);
}

function replyTextFrom(parsed: unknown): string | undefined {
  if (!isRecord(parsed)) {
    return undefined;
  }
  // Chat Completions
  if (Array.isArray(parsed.choices)) {
    const [choice] = parsed.choices;
    const message = isRecord(choice) ? choice.message : undefined;
    if (isRecord(message) && typeof message.content === 'string') {
      return message.content;
    }
  }
  // Anthropic Messages
  if (Array.isArray(parsed.content)) {
    const texts = parsed.content.flatMap((block) =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : [],
    );
    if (texts.length > 0) {
      return texts.join('');
    }
  }
  // Responses API
  if (typeof parsed.output_text === 'string') {
    return parsed.output_text;
  }
  return undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(text: string): string {
  return text.length > SAMPLE_MAX_CHARS ? `${text.slice(0, SAMPLE_MAX_CHARS)}...` : text;
}
