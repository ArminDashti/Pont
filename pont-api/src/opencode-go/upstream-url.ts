import {
  apiStyleForPath,
  buildOpenCodeGoUpstreamUrl,
  getOpenCodeGoApiStyle,
  type OpenCodeGoApiStyle,
} from '@pont/opencode-go';

export function openCodeGoUpstreamUrl(baseUrl: string, pathSuffix: string, model?: string): string {
  if (pathSuffix === 'models') {
    return buildOpenCodeGoUpstreamUrl(baseUrl, { kind: 'models' });
  }
  if (pathSuffix === 'messages/count_tokens') {
    return `${buildOpenCodeGoUpstreamUrl(baseUrl, { kind: 'completion', style: 'messages', model })}/count_tokens`;
  }
  const fromPath = apiStyleForPath(pathSuffix);
  const style: OpenCodeGoApiStyle =
    fromPath === 'chat' && model
      ? getOpenCodeGoApiStyle(model)
      : fromPath ?? (model ? getOpenCodeGoApiStyle(model) : 'chat');
  return buildOpenCodeGoUpstreamUrl(baseUrl, { kind: 'completion', style, model });
}
