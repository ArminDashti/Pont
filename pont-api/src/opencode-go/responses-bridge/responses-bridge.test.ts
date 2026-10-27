import { describe, expect, it } from 'vitest';

import { openAiChatToResponsesRequest } from './openai-to-responses.js';
import { ResponsesToOpenAiStream, responsesToOpenAiCompletion } from './responses-to-openai.js';

describe('responses bridge', () => {
  it('maps chat/completions to responses input', () => {
    expect(
      openAiChatToResponsesRequest({
        model: 'grok-4.7',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 16,
        stream: true,
      }),
    ).toEqual({
      model: 'grok-4.7',
      input: 'user: Hello',
      max_output_tokens: 16,
      stream: true,
    });
  });

  it('maps a completed responses payload to chat.completion', () => {
    const completion = responsesToOpenAiCompletion({
      id: 'resp_1',
      model: 'grok-4.7',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'OK' }],
        },
      ],
      usage: { input_tokens: 3, output_tokens: 1 },
    });
    expect(completion.choices).toEqual([
      { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
    ]);
    expect(completion.usage).toEqual({ prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 });
  });

  it('streams output_text deltas as chat chunks', () => {
    const converter = new ResponsesToOpenAiStream();
    const sse =
      'event: response.created\n' +
      'data: {"type":"response.created","response":{"id":"r1","model":"grok-4.7"}}\n\n' +
      'event: response.output_text.delta\n' +
      'data: {"type":"response.output_text.delta","delta":"OK"}\n\n' +
      'event: response.completed\n' +
      'data: {"type":"response.completed","response":{"id":"r1","model":"grok-4.7"}}\n\n';
    const out = converter.feed(sse) + converter.flush();
    expect(out).toContain('"content":"OK"');
    expect(out).toContain('[DONE]');
  });
});
