import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { getOpenCodeGoApiStyle } from '@pont/opencode-go';

import { clientAuthorization } from '../auth/bearer.js';
import { openCodeGoUpstreamUrl } from '../opencode-go/upstream-url.js';
import { type PontConfig, pontConfigKey } from '../config/pont.config.js';
import { parsePontModelId, resolveUpstreamModelId } from '../models/pont-model-id.js';
import { transformModelsListJson } from '../models/transform-models-response.js';
import { type JsonObject, isJsonObject } from '../opencode-go/anthropic-bridge/json.js';
import { AnthropicToOpenAiStream, anthropicMessageToOpenAiCompletion } from '../opencode-go/anthropic-bridge/anthropic-to-openai.js';
import { isAnthropicModel, openAiChatToAnthropicRequest } from '../opencode-go/anthropic-bridge/openai-to-anthropic.js';
import { stripUnsupportedSampling } from '../opencode-go/sampling.util.js';
import { openAiChatToResponsesRequest } from '../opencode-go/responses-bridge/openai-to-responses.js';
import {
  ResponsesToOpenAiStream,
  responsesToOpenAiCompletion,
} from '../opencode-go/responses-bridge/responses-to-openai.js';
import { SESSION_HEADER, resolveSessionId } from '../opencode-go/session.util.js';
import { extractUsage } from '../logging/usage.js';
import {
  extractClientApp,
  extractTitle,
  parseJsonBody,
  readRequestModel,
  PONT_CLIENT_APP_HEADER,
} from '../logging/request-meta.js';
import { type ProviderDefinition } from '../providers/provider-definitions.js';
import { upstreamAuthHeaders } from '../providers/provider-auth.js';
import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { EligibleModelsService } from '../settings/eligible-models.service.js';
import { ProviderKeysService } from '../settings/provider-keys.service.js';
import { ServicesService } from '../settings/services.service.js';
import { RequestEventsService } from '../store/request-events.service.js';
import { RequestLogRepository } from '../store/request-log.repository.js';
import { UpstreamAuthService } from './upstream-auth.service.js';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

const FORWARD_REQUEST_HEADERS = new Set([
  'accept',
  'content-type',
  'anthropic-version',
  'anthropic-beta',
  'openai-beta',
]);

/**
 * Upstream headers describing the encoded bytes. fetch() already decodes the body (brotli/gzip) and the
 * length changes, so forwarding these would make clients decode plain bytes again and fail.
 */
const DECODED_BODY_HEADERS = new Set(['content-encoding', 'content-length']);

/** Upper bound on response text kept for usage parsing (about 4 MB); streaming still passes through. */
const MAX_CAPTURED_CHARS = 4_000_000;

interface CompletionRecord {
  clientApp: string;
  username: string;
  provider: ProviderDefinition;
  routePrefix: string;
  pathSuffix: string;
  body: unknown;
  status: number;
  captured: string;
  startedAt: number;
}

/** Proxies OpenAI-style and Anthropic-style requests to any catalog provider, streaming and logging each call. */
@Injectable()
export class ProviderProxyService {
  private readonly logger = new Logger(ProviderProxyService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly upstreamAuth: UpstreamAuthService,
    private readonly services: ServicesService,
    private readonly requestLogs: RequestLogRepository,
    private readonly requestEvents: RequestEventsService,
    private readonly providerKeys: ProviderKeysService,
    private readonly registry: ProviderRegistry,
    private readonly eligibleModels: EligibleModelsService,
  ) {}

  /** Single-endpoint routing: the model prefix (`openrouter-…`, `opencode-…`) picks the provider. */
  private providerForModel(modelName: string | undefined): ProviderDefinition {
    const parsed = modelName ? parsePontModelId(modelName) : undefined;
    if (!parsed) {
      throw new BadRequestException(
        'Model must start with a provider prefix, e.g. "openrouter-…" or "opencode-…"',
      );
    }
    return this.registry.get(parsed.providerId);
  }

  private userAgent(): string {
    return this.configService.getOrThrow<PontConfig>(pontConfigKey).userAgent;
  }

  async proxyModels(req: Request, res: Response, provider: ProviderDefinition): Promise<void> {
    const authorization = clientAuthorization(req.headers);
    const username = this.upstreamAuth.authorize(authorization);
    this.services.assertEnabled(username);
    const upstreamKey = this.upstreamAuth.resolveUpstreamApiKey(authorization, provider);
    const modelsUrl =
      provider.id === 'opencode-go'
        ? openCodeGoUpstreamUrl(provider.baseUrl, 'models')
        : `${provider.baseUrl}/models`;
    await this.forwardModelsGet(modelsUrl, provider, upstreamKey, req, res);
  }

  /** Unified `/api/v1/models`: every provider that has a key, merged into one list of Pont ids. */
  async proxyUnifiedModels(req: Request, res: Response): Promise<void> {
    const authorization = clientAuthorization(req.headers);
    const username = this.upstreamAuth.authorize(authorization);
    this.services.assertEnabled(username);
    const freeSlugs = this.providerKeys.freeModelSlugs();

    const perProvider = await Promise.all(
      this.registry.list().map(async (provider) => {
        const key = this.providerKeys.getKey(provider.id);
        if (!key) {
          return [];
        }
        const url =
          provider.id === 'opencode-go'
            ? openCodeGoUpstreamUrl(provider.baseUrl, 'models')
            : `${provider.baseUrl}/models`;
        const headers = upstreamAuthHeaders(provider, key);
        headers.set('User-Agent', this.userAgent());
        try {
          const upstream = await fetch(url, { method: 'GET', headers });
          if (!upstream.ok) {
            return [];
          }
          const transformed: unknown = JSON.parse(transformModelsListJson(await upstream.text(), provider.id, freeSlugs));
          return isJsonObject(transformed) && Array.isArray(transformed.data) ? transformed.data : [];
        } catch (error) {
          this.logger.error(`Model list failed for ${provider.id}`, error instanceof Error ? error.stack : error);
          return [];
        }
      }),
    );

    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    const merged = perProvider.flat().filter((item) => {
      return isJsonObject(item) && typeof item.id === 'string' && this.eligibleModels.isEnabled(item.id);
    });
    res.end(JSON.stringify({ object: 'list', data: merged }));
  }

  /** Provider-specific routes (`/openrouter/v1/...`, `/zen/go/v1/...`). */
  async proxyCompletion(req: Request, res: Response, provider: ProviderDefinition, pathSuffix: string): Promise<void> {
    await this.handleCompletion(req, res, pathSuffix, `/${provider.gatewayPrefix}`, () => provider);
  }

  /** Unified `/api/v1/...`: the model prefix picks the provider. */
  async proxyRoutedCompletion(req: Request, res: Response, pathSuffix: string): Promise<void> {
    await this.handleCompletion(req, res, pathSuffix, '/api/v1', (model) => this.providerForModel(model));
  }

  private async handleCompletion(
    req: Request,
    res: Response,
    pathSuffix: string,
    routePrefix: string,
    providerOf: (model: string | undefined) => ProviderDefinition,
  ): Promise<void> {
    const startedAt = performance.now();
    const authorization = clientAuthorization(req.headers);
    const username = this.upstreamAuth.authorize(authorization);
    this.services.assertEnabled(username);

    let body = await this.readRequestBody(req);
    let requestBody = parseJsonBody(body);
    const clientApp = extractClientApp(req.headers[PONT_CLIENT_APP_HEADER], requestBody);

    const modelName =
      isJsonObject(requestBody) && typeof requestBody.model === 'string' ? requestBody.model : undefined;
    this.eligibleModels.assertEligible(modelName);
    const provider = providerOf(modelName);
    const upstreamKey = this.upstreamAuth.resolveUpstreamApiKey(authorization, provider);

    const upstreamModel = modelName ? resolveUpstreamModelId(modelName) : undefined;
    if (isJsonObject(requestBody) && upstreamModel && upstreamModel !== modelName) {
      requestBody = { ...requestBody, model: upstreamModel };
      body = Buffer.from(JSON.stringify(requestBody));
    }
    const openCodeStyle =
      provider.id === 'opencode-go' && upstreamModel ? getOpenCodeGoApiStyle(upstreamModel) : undefined;
    // Claude and several OpenCode Go models are served only as Anthropic Messages; bridge OpenAI-style callers.
    const bridgedMessages =
      provider.bridgesClaudeToChat &&
      pathSuffix === 'chat/completions' &&
      isJsonObject(requestBody) &&
      typeof requestBody.model === 'string' &&
      (isAnthropicModel(upstreamModel ?? requestBody.model) || openCodeStyle === 'messages');
    const bridgedResponses =
      provider.id === 'opencode-go' &&
      pathSuffix === 'chat/completions' &&
      isJsonObject(requestBody) &&
      openCodeStyle === 'responses';
    const upstreamPath = bridgedMessages ? 'messages' : bridgedResponses ? 'responses' : pathSuffix;
    let upstreamBody: Buffer | undefined = body;
    if (bridgedMessages && isJsonObject(requestBody)) {
      upstreamBody = this.sanitizeUpstreamBody(
        Buffer.from(JSON.stringify(openAiChatToAnthropicRequest(requestBody as JsonObject))),
      );
    } else if (bridgedResponses && isJsonObject(requestBody)) {
      upstreamBody = Buffer.from(JSON.stringify(openAiChatToResponsesRequest(requestBody as JsonObject)));
    } else if (provider.bridgesClaudeToChat) {
      upstreamBody = this.sanitizeUpstreamBody(body);
    }

    const { sessionId, generated } = resolveSessionId(req.headers[SESSION_HEADER]);
    const url =
      provider.id === 'opencode-go'
        ? openCodeGoUpstreamUrl(provider.baseUrl, upstreamPath, upstreamModel ?? modelName)
        : `${provider.baseUrl}/${upstreamPath}`;
    const headers = this.buildUpstreamHeaders(provider, upstreamKey, sessionId, req, upstreamBody?.length);

    let status = 502;
    let captured = '';
    try {
      const upstream = await this.fetchUpstream(provider, url, headers, upstreamBody);
      status = upstream.status;
      const echoSessionId = generated ? sessionId : undefined;
      captured =
        bridgedMessages && upstream.ok
          ? await this.pipeBridgedResponse(upstream, res, isJsonObject(requestBody) && requestBody.stream === true, echoSessionId)
          : bridgedResponses && upstream.ok
            ? await this.pipeResponsesBridgedResponse(
                upstream,
                res,
                isJsonObject(requestBody) && requestBody.stream === true,
                echoSessionId,
              )
            : await this.pipeUpstreamResponse(upstream, res, echoSessionId);
    } finally {
      this.recordCompletion({
        clientApp,
        username,
        provider,
        routePrefix,
        pathSuffix,
        body: requestBody,
        status,
        captured,
        startedAt,
      });
    }
  }

  async pingUpstreamModels(provider: ProviderDefinition, upstreamKey: string): Promise<boolean> {
    const headers = upstreamAuthHeaders(provider, upstreamKey);
    headers.set('User-Agent', this.userAgent());
    const modelsUrl =
      provider.id === 'opencode-go'
        ? openCodeGoUpstreamUrl(provider.baseUrl, 'models')
        : `${provider.baseUrl}/models`;
    const response = await fetch(modelsUrl, { method: 'GET', headers });
    return response.ok;
  }

  private recordCompletion(record: CompletionRecord): void {
    try {
      const usage = extractUsage(record.captured);
      const model = readRequestModel(record.body);
      const entry = this.requestLogs.insert({
        createdAt: new Date(),
        app: record.clientApp,
        title: extractTitle(record.body, record.pathSuffix),
        username: record.username,
        providerModel: `${record.provider.id}/${model ?? 'unknown'}`,
        path: `${record.routePrefix}/${record.pathSuffix}`,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs: Math.round(performance.now() - record.startedAt),
        status: record.status,
      });
      this.requestEvents.publish(entry);
    } catch (error) {
      this.logger.error('Failed to record gateway request', error instanceof Error ? error.stack : error);
    }
  }

  /** Drops sampling params (temperature/top_p/top_k) that newer Claude models reject upstream. */
  private sanitizeUpstreamBody(body: Buffer | undefined): Buffer | undefined {
    const parsed = parseJsonBody(body);
    if (!isJsonObject(parsed)) return body;
    const { body: cleaned, changed } = stripUnsupportedSampling(parsed);
    return changed ? Buffer.from(JSON.stringify(cleaned)) : body;
  }

  private async readRequestBody(req: Request): Promise<Buffer | undefined> {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      return undefined;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) {
      return undefined;
    }
    return Buffer.concat(chunks);
  }

  private buildUpstreamHeaders(
    provider: ProviderDefinition,
    upstreamKey: string,
    sessionId: string,
    req: Request,
    contentLength?: number,
  ): Headers {
    // Provider auth and default headers first; client headers below may override defaults such as anthropic-version
    const headers = upstreamAuthHeaders(provider, upstreamKey);
    headers.set('User-Agent', this.userAgent());
    headers.set(SESSION_HEADER, sessionId);

    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) {
        continue;
      }
      const lower = key.toLowerCase();
      // Client credentials are never forwarded; the upstream key above replaces them
      if (HOP_BY_HOP.has(lower) || lower === 'authorization' || lower === 'x-api-key') {
        continue;
      }
      if (FORWARD_REQUEST_HEADERS.has(lower) || lower.startsWith('x-')) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    if (contentLength !== undefined) {
      headers.set('content-length', String(contentLength));
    }

    return headers;
  }

  private async fetchUpstream(
    provider: ProviderDefinition,
    url: string,
    headers: Headers,
    body: Buffer | undefined,
  ): Promise<globalThis.Response> {
    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body: body ? new Uint8Array(body) : undefined,
      });
    } catch (error) {
      this.logger.error(`Upstream request failed: ${url}`, error instanceof Error ? error.stack : error);
      throw new BadGatewayException(`${provider.label} is unreachable`);
    }
  }

  private async forwardModelsGet(
    url: string,
    provider: ProviderDefinition,
    upstreamKey: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const { sessionId, generated } = resolveSessionId(req.headers[SESSION_HEADER]);
    const headers = this.buildUpstreamHeaders(provider, upstreamKey, sessionId, req);
    const upstream = await fetch(url, { method: 'GET', headers });
    if (!upstream.ok) {
      await this.pipeUpstreamResponse(upstream, res, generated ? sessionId : undefined);
      return;
    }
    const text = await upstream.text();
    const transformed = this.eligibleModels.filterModelsListJson(
      transformModelsListJson(text, provider.id, this.providerKeys.freeModelSlugs()),
    );
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    if (generated) {
      res.setHeader(SESSION_HEADER, sessionId);
    }
    res.end(transformed);
  }

  /**
   * Converts an Anthropic Messages response into OpenAI chat format while streaming it to the client.
   * Returns the converted text for usage parsing.
   */
  private async pipeResponsesBridgedResponse(
    upstream: globalThis.Response,
    res: Response,
    stream: boolean,
    echoSessionId?: string,
  ): Promise<string> {
    res.status(upstream.status);
    res.setHeader('Content-Type', stream ? 'text/event-stream' : 'application/json');
    if (echoSessionId) {
      res.setHeader(SESSION_HEADER, echoSessionId);
    }
    if (!upstream.body) {
      res.end();
      return '';
    }

    const reader = upstream.body.getReader();
    res.on('close', () => {
      void reader.cancel().catch(() => undefined);
    });

    const decoder = new TextDecoder();
    let captured = '';
    const emit = (text: string): void => {
      if (!text) {
        return;
      }
      if (captured.length < MAX_CAPTURED_CHARS) {
        captured += text;
      }
      res.write(text);
    };

    if (stream) {
      const converter = new ResponsesToOpenAiStream();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        emit(converter.feed(decoder.decode(value, { stream: true })));
      }
      emit(converter.feed(decoder.decode()));
      emit(converter.flush());
      res.end();
      return captured;
    }

    let raw = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    try {
      const response: unknown = JSON.parse(raw);
      emit(JSON.stringify(responsesToOpenAiCompletion(response as JsonObject)));
    } catch {
      emit(raw);
    }
    res.end();
    return captured;
  }

  private async pipeBridgedResponse(
    upstream: globalThis.Response,
    res: Response,
    stream: boolean,
    echoSessionId?: string,
  ): Promise<string> {
    res.status(upstream.status);
    res.setHeader('Content-Type', stream ? 'text/event-stream' : 'application/json');
    if (echoSessionId) {
      res.setHeader(SESSION_HEADER, echoSessionId);
    }
    if (!upstream.body) {
      res.end();
      return '';
    }

    const reader = upstream.body.getReader();
    res.on('close', () => {
      void reader.cancel().catch(() => undefined);
    });

    const decoder = new TextDecoder();
    let captured = '';
    const emit = (text: string): void => {
      if (!text) {
        return;
      }
      if (captured.length < MAX_CAPTURED_CHARS) {
        captured += text;
      }
      res.write(text);
    };

    if (stream) {
      const converter = new AnthropicToOpenAiStream();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        emit(converter.feed(decoder.decode(value, { stream: true })));
      }
      emit(converter.feed(decoder.decode()));
      emit(converter.flush());
      res.end();
      return captured;
    }

    let raw = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    try {
      const message: unknown = JSON.parse(raw);
      emit(JSON.stringify(anthropicMessageToOpenAiCompletion(message as JsonObject)));
    } catch {
      emit(raw);
    }
    res.end();
    return captured;
  }

  /** Streams the upstream response to the client and returns the captured text for usage parsing. */
  private async pipeUpstreamResponse(
    upstream: globalThis.Response,
    res: Response,
    echoSessionId?: string,
  ): Promise<string> {
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP.has(lower) || DECODED_BODY_HEADERS.has(lower)) {
        return;
      }
      res.setHeader(key, value);
    });
    if (echoSessionId) {
      res.setHeader(SESSION_HEADER, echoSessionId);
    }
    if (!upstream.body) {
      res.end();
      return '';
    }

    const reader = upstream.body.getReader();
    res.on('close', () => {
      void reader.cancel().catch(() => undefined);
    });

    const decoder = new TextDecoder();
    let captured = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (captured.length < MAX_CAPTURED_CHARS) {
        captured += decoder.decode(value, { stream: true });
      }
      if (!res.write(value)) {
        await Promise.race([once(res, 'drain'), once(res, 'close')]);
      }
    }
    captured += decoder.decode();
    res.end();
    return captured;
  }
}
