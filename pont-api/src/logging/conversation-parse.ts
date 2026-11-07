import { parseEvents } from './usage.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .filter(isRecord)
    .map((part) => {
      if (typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('');
}

function lastAssistantFromMessages(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (isRecord(item) && item.role === 'assistant') {
      return textOf(item.content);
    }
  }
  return '';
}

/** Best-effort user text from stored request JSON; falls back to log title. */
export function userTextFromRequestJson(requestJson: string | undefined, title: string): string {
  if (!requestJson?.trim()) {
    return title;
  }
  try {
    const body = JSON.parse(requestJson) as unknown;
    if (!isRecord(body)) {
      return title;
    }
    if (Array.isArray(body.messages)) {
      for (let i = body.messages.length - 1; i >= 0; i -= 1) {
        const item = body.messages[i];
        if (isRecord(item) && item.role === 'user') {
          const text = textOf(item.content);
          if (text) {
            return text;
          }
        }
      }
    }
    if (typeof body.input === 'string' && body.input.trim()) {
      return body.input.trim();
    }
  } catch {
    // ignore
  }
  return title;
}

/** Best-effort assistant text from captured upstream body (JSON or SSE). */
export function assistantTextFromCapture(capture: string | undefined): string {
  if (!capture?.trim()) {
    return '';
  }
  const trimmed = capture.trim();
  if (trimmed.startsWith('{')) {
    try {
      const body = JSON.parse(trimmed) as unknown;
      if (!isRecord(body)) {
        return '';
      }
      if (Array.isArray(body.choices) && body.choices.length > 0) {
        const choice = body.choices[0];
        if (isRecord(choice)) {
          if (isRecord(choice.message)) {
            const text = textOf(choice.message.content);
            if (text) {
              return text;
            }
          }
          if (typeof choice.text === 'string') {
            return choice.text;
          }
        }
      }
      if (isRecord(body.message)) {
        const text = textOf(body.message.content);
        if (text) {
          return text;
        }
      }
      if (Array.isArray(body.content)) {
        return textOf(body.content);
      }
    } catch {
      // fall through to SSE
    }
  }

  let assistant = '';
  for (const event of parseEvents(trimmed)) {
    if (!isRecord(event)) {
      continue;
    }
    if (Array.isArray(event.choices)) {
      for (const choice of event.choices) {
        if (isRecord(choice) && isRecord(choice.delta) && typeof choice.delta.content === 'string') {
          assistant += choice.delta.content;
        }
      }
    }
    if (isRecord(event.message)) {
      const text = textOf(event.message.content);
      if (text) {
        assistant = text;
      }
    }
    if (event.type === 'content_block_delta' && isRecord(event.delta) && typeof event.delta.text === 'string') {
      assistant += event.delta.text;
    }
  }
  if (assistant) {
    return assistant;
  }

  try {
    const body = JSON.parse(trimmed) as unknown;
    if (isRecord(body) && Array.isArray(body.messages)) {
      return lastAssistantFromMessages(body.messages);
    }
  } catch {
    // ignore
  }
  return '';
}

export interface ConversationTurn {
  id: number;
  createdAt: string;
  providerModel: string;
  status: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  userText: string;
  assistantText: string;
  capturePreview: string | null;
}

export function buildConversationTurn(row: {
  id: number;
  createdAt: string;
  providerModel: string;
  status: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  title: string;
  requestJson?: string;
  responseCapture?: string;
}): ConversationTurn {
  const userText = userTextFromRequestJson(row.requestJson, row.title);
  const assistantText = assistantTextFromCapture(row.responseCapture);
  const capturePreview =
    assistantText || !row.responseCapture?.trim()
      ? null
      : row.responseCapture.length > 4000
        ? `${row.responseCapture.slice(0, 4000)}…`
        : row.responseCapture;
  return {
    id: row.id,
    createdAt: row.createdAt,
    providerModel: row.providerModel,
    status: row.status,
    durationMs: row.durationMs,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    userText,
    assistantText,
    capturePreview,
  };
}
