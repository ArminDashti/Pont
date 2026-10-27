export const TITLE_MAX_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseJsonBody(body: Buffer | undefined): unknown {
  if (!body) {
    return undefined;
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return undefined;
  }
}

export function readRequestModel(body: unknown): string | undefined {
  if (!isRecord(body) || typeof body.model !== 'string' || !body.model.trim()) {
    return undefined;
  }
  return body.model.trim();
}

/** Text of a chat message `content`, which is a string or an array of text parts. */
function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .filter(isRecord)
    .filter((part) => part.type === 'text' || part.type === 'input_text')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join(' ');
}

function firstUserItem(items: unknown[]): unknown {
  return items.find((item) => isRecord(item) && item.role === 'user');
}

/** Title = first user message text, whitespace-collapsed and truncated to 80 characters. */
export function extractTitle(body: unknown, pathSuffix: string): string {
  if (!isRecord(body)) {
    return '';
  }
  let text = '';
  if (Array.isArray(body.messages)) {
    const message = firstUserItem(body.messages);
    text = isRecord(message) ? textOf(message.content) : '';
  } else if (pathSuffix === 'responses') {
    if (typeof body.input === 'string') {
      text = body.input;
    } else if (Array.isArray(body.input)) {
      const item = firstUserItem(body.input);
      text = isRecord(item) ? textOf(item.content) : '';
    }
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH);
}

/**
 * Username from the standard provider field: `metadata.user_id` for Anthropic
 * `messages`, top-level `user` for OpenAI-style `chat/completions` and `responses`.
 */
export function extractUsername(body: unknown, pathSuffix: string): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const value =
    pathSuffix === 'messages' ? (isRecord(body.metadata) ? body.metadata.user_id : undefined) : body.user;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export const PONT_CLIENT_APP_HEADER = 'x-yoda-client-app';

const CLIENT_APP_ALIASES: Readonly<Record<string, string>> = {
  nanobot: 'agent',
  hawking: 'agent',
  opendots: 'agent',
  'always-on-agent': 'agent',
  'open-webui': 'chat',
  openwebui: 'chat',
  chatbot: 'chat',
  nanobrowser: 'extension',
  enzo: 'extension',
  'chromium-extension': 'extension',
};

/** Normalizes client app ids to `chat`, `agent`, or `extension` when possible. */
export function normalizeClientApp(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return 'unknown';
  }
  return CLIENT_APP_ALIASES[trimmed] ?? trimmed;
}

/** Client app from `X-Yoda-Client-App` or request body metadata. */
export function extractClientApp(headerValue: string | string[] | undefined, body: unknown): string {
  const fromHeader = typeof headerValue === 'string' ? headerValue : Array.isArray(headerValue) ? headerValue[0] : '';
  if (fromHeader?.trim()) {
    return normalizeClientApp(fromHeader);
  }
  if (!isRecord(body) || !isRecord(body.metadata)) {
    return 'unknown';
  }
  const meta = body.metadata.client_app ?? body.metadata.PONT_client_app;
  return typeof meta === 'string' && meta.trim() ? normalizeClientApp(meta) : 'unknown';
}
