import { randomUUID } from 'node:crypto';

export const SESSION_HEADER = 'x-opencode-session';

export function resolveSessionId(incoming: string | string[] | undefined): {
  sessionId: string;
  generated: boolean;
} {
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;
  const trimmed = raw?.trim();
  if (trimmed) {
    return { sessionId: trimmed, generated: false };
  }
  return { sessionId: randomUUID(), generated: true };
}
