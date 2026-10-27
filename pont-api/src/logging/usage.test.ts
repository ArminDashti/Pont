import { describe, expect, it } from 'vitest';

import { extractUsage } from './usage.js';

describe('extractUsage', () => {
  it('reads OpenAI chat usage from a JSON body', () => {
    const body = JSON.stringify({ usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } });
    expect(extractUsage(body)).toEqual({ promptTokens: 12, completionTokens: 4, totalTokens: 16 });
  });

  it('reads the final usage chunk from an OpenAI chat SSE stream', () => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}}',
      'data: [DONE]',
      '',
    ].join('\n');
    expect(extractUsage(stream)).toEqual({ promptTokens: 7, completionTokens: 2, totalTokens: 9 });
  });

  it('merges Anthropic messages usage split across message_start and message_delta', () => {
    const stream = [
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":25,"output_tokens":1}}}',
      'event: message_delta',
      'data: {"type":"message_delta","usage":{"output_tokens":15}}',
      '',
    ].join('\n');
    expect(extractUsage(stream)).toEqual({ promptTokens: 25, completionTokens: 15, totalTokens: 40 });
  });

  it('reads responses API usage from the response.completed event', () => {
    const stream = [
      'data: {"type":"response.created","response":{"usage":null}}',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":30,"output_tokens":5,"total_tokens":35}}}',
      '',
    ].join('\n');
    expect(extractUsage(stream)).toEqual({ promptTokens: 30, completionTokens: 5, totalTokens: 35 });
  });

  it('returns zeros when no usage is present', () => {
    expect(extractUsage('')).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    expect(extractUsage('not json at all')).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });
});
