/** OpenCode Go routes models to chat, responses, messages, or Google Gemini APIs. */

export type OpenCodeGoApiStyle = 'chat' | 'responses' | 'messages' | 'google';

/** Default upstream root from https://opencode.ai/v2/docs/console/go */
export const DEFAULT_OPENCODE_GO_INFERENCE_BASE = 'https://opencode.ai/inference/go';

const messagesModels = new Set([
  'claude-haiku-5-5',
  'qwen3.8-flash',
  'qwen3.8-max',
  'minimax-m3',
  'minimax-m2.7',
  'qwen3.7-plus',
]);

const googleModels = new Set(['gemini-4-argon-contributor']);

const responsesModels = new Set([
  'gpt-6-luna',
  'gpt-5.6-luna',
  'grok-4.6',
  'grok-4.7',
  'muse-spark-1.3-contributor',
  'muse-spark-1.2-contributor',
]);

function modelSlug(modelName: string): string {
  const base = modelName.includes('/') ? modelName.split('/').pop()! : modelName;
  return base.trim();
}

export function getOpenCodeGoApiStyle(modelName: string): OpenCodeGoApiStyle {
  const slug = modelSlug(modelName);
  if (googleModels.has(slug) || /^gemini-/i.test(slug)) {
    return 'google';
  }
  if (messagesModels.has(slug)) {
    return 'messages';
  }
  if (
    responsesModels.has(slug) ||
    /^gpt-6/i.test(slug) ||
    /^gpt-5\.6/i.test(slug) ||
    /^grok-4/i.test(slug)
  ) {
    return 'responses';
  }
  return 'chat';
}

export function apiStyleForPath(pathSuffix: string): OpenCodeGoApiStyle | null {
  if (pathSuffix === 'chat/completions') {
    return 'chat';
  }
  if (pathSuffix === 'responses') {
    return 'responses';
  }
  if (pathSuffix === 'messages') {
    return 'messages';
  }
  return null;
}

function isLegacyZenGoBase(base: string): boolean {
  return /\/zen\/go\/v1$/i.test(base.replace(/\/$/, ''));
}

/** Maps deprecated zen/go/v1 roots to the current inference/go upstream root. */
export function normalizeOpenCodeGoBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  return isLegacyZenGoBase(trimmed) ? DEFAULT_OPENCODE_GO_INFERENCE_BASE : trimmed;
}

export function buildOpenCodeGoUpstreamUrl(
  inferenceBase: string,
  target: { kind: 'models' } | { kind: 'completion'; style: OpenCodeGoApiStyle; model?: string },
): string {
  const base = normalizeOpenCodeGoBase(inferenceBase);

  if (target.kind === 'models') {
    return `${base}/v1/models`;
  }

  if (target.style === 'google') {
    const slug = modelSlug(target.model ?? 'gemini-4-argon-contributor');
    return `${base}/google/v1beta/models/${slug}`;
  }

  const completionPaths: Record<Exclude<OpenCodeGoApiStyle, 'google'>, string> = {
    chat: 'openai/v1/chat/completions',
    responses: 'openai/v1/responses',
    messages: 'anthropic/v1/messages',
  };
  return `${base}/${completionPaths[target.style]}`;
}
