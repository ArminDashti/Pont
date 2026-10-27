import { describe, expect, it } from 'vitest';

import { resolveSessionId } from './session.util.js';

describe('resolveSessionId', () => {
  it('passes through client session ids', () => {
    const result = resolveSessionId('task-abc');
    expect(result.sessionId).toBe('task-abc');
    expect(result.generated).toBe(false);
  });

  it('generates uuid when missing', () => {
    const result = resolveSessionId(undefined);
    expect(result.generated).toBe(true);
    expect(result.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
