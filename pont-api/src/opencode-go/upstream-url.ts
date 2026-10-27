import {
  apiStyleForPath,
  buildOpenCodeGoUpstreamUrl,
  getOpenCodeGoApiStyle,
  type OpenCodeGoApiStyle,
} from '@pont/opencode-go';

import type { ProviderEndpointId } from '../providers/provider-definitions.js';

export function openCodeGoUpstreamUrl(baseUrl: string, pathSuffix: string, model?: string): string {
  if (pathSuffix === 'models') {
    return buildOpenCodeGoUpstreamUrl(baseUrl, { kind: 'models' });
  }
  const fromPath = apiStyleForPath(pathSuffix);
  const style: OpenCodeGoApiStyle =
    fromPath === 'chat' && model
      ? getOpenCodeGoApiStyle(model)
      : fromPath ?? (model ? getOpenCodeGoApiStyle(model) : 'chat');
  return buildOpenCodeGoUpstreamUrl(baseUrl, { kind: 'completion', style, model });
}

export function openCodeGoUpstreamUrlForEndpoint(
  baseUrl: string,
  endpointId: ProviderEndpointId,
  model?: string,
): string {
  if (endpointId === 'models') {
    return buildOpenCodeGoUpstreamUrl(baseUrl, { kind: 'models' });
  }
  const style: OpenCodeGoApiStyle =
    endpointId === 'chat' ? (model ? getOpenCodeGoApiStyle(model) : 'chat') : endpointId;
  return buildOpenCodeGoUpstreamUrl(baseUrl, { kind: 'completion', style, model });
}
