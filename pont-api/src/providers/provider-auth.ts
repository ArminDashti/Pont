import type { ProviderDefinition } from './provider-definitions.js';

/** Builds the upstream auth and default headers for one provider. */
export function upstreamAuthHeaders(provider: ProviderDefinition, upstreamKey: string): Headers {
  const headers = new Headers(provider.defaultHeaders);
  if (provider.auth.bearer) {
    headers.set('Authorization', `Bearer ${upstreamKey}`);
  }
  if (provider.auth.xApiKey) {
    headers.set('x-api-key', upstreamKey);
  }
  return headers;
}
