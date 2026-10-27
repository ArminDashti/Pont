export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface UsageTotals {
  prompt: number;
  completion: number;
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberOf(...candidates: unknown[]): number | undefined {
  return candidates.find((candidate): candidate is number => typeof candidate === 'number');
}

/** Parses a JSON body or an SSE stream (`data:` lines) into JSON events. */
function parseEvents(payload: string): unknown[] {
  const trimmed = payload.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith('{')) {
    try {
      return [JSON.parse(trimmed)];
    } catch {
      // Not a single JSON document; fall through to SSE parsing.
    }
  }
  const events: unknown[] = [];
  for (const line of payload.split('\n')) {
    const text = line.trim();
    if (!text.startsWith('data:')) {
      continue;
    }
    const data = text.slice('data:'.length).trim();
    if (!data || data === '[DONE]') {
      continue;
    }
    try {
      events.push(JSON.parse(data));
    } catch {
      // Ignore partial or non-JSON data lines.
    }
  }
  return events;
}

/**
 * Walks one event and keeps the largest reported count per field. Covers
 * OpenAI chat (`usage.prompt_tokens`), OpenAI responses and Anthropic messages
 * (`usage.input_tokens` / `output_tokens`), and nested `message` / `response`
 * wrappers used by streaming events.
 */
function collectUsage(node: unknown, totals: UsageTotals): void {
  if (!isRecord(node)) {
    return;
  }
  if (isRecord(node.usage)) {
    const usage = node.usage;
    totals.prompt = Math.max(totals.prompt, numberOf(usage.prompt_tokens, usage.input_tokens) ?? 0);
    totals.completion = Math.max(totals.completion, numberOf(usage.completion_tokens, usage.output_tokens) ?? 0);
    totals.total = Math.max(totals.total, numberOf(usage.total_tokens) ?? 0);
  }
  collectUsage(node.message, totals);
  collectUsage(node.response, totals);
}

export function extractUsage(payload: string): TokenUsage {
  const totals: UsageTotals = { prompt: 0, completion: 0, total: 0 };
  for (const event of parseEvents(payload)) {
    collectUsage(event, totals);
  }
  return {
    promptTokens: totals.prompt,
    completionTokens: totals.completion,
    totalTokens: totals.total || totals.prompt + totals.completion,
  };
}
