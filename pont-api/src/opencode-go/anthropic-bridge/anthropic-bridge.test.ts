import { describe, expect, it } from 'vitest';

import { AnthropicToOpenAiStream, anthropicMessageToOpenAiCompletion } from './anthropic-to-openai.js';
import { isAnthropicModel, openAiChatToAnthropicRequest } from './openai-to-anthropic.js';

describe('openAiChatToAnthropicRequest', () => {
  it('moves system messages to the top-level system field and defaults max_tokens', () => {
    const request = openAiChatToAnthropicRequest({
      model: 'claude-haiku-5-5',
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Hi' },
      ],
    });

    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 4096,
      system: 'Be brief.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    });
  });

  it('maps tool calls and tool results into Anthropic blocks and merges consecutive user turns', () => {
    const request = openAiChatToAnthropicRequest({
      model: 'claude-haiku-5-5',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'Weather?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{"city":"Oslo"}' } }],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '5C' },
        { role: 'user', content: 'Thanks' },
      ],
      tools: [{ type: 'function', function: { name: 'weather', description: 'Get weather', parameters: { type: 'object' } } }],
      tool_choice: 'required',
    });

    expect(request.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Weather?' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'weather', input: { city: 'Oslo' } }] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: '5C' },
          { type: 'text', text: 'Thanks' },
        ],
      },
    ]);
    expect(request.tools).toEqual([
      { name: 'weather', description: 'Get weather', input_schema: { type: 'object' } },
    ]);
    expect(request.tool_choice).toEqual({ type: 'any' });
  });

  it('maps stop sequences and sampling options', () => {
    const request = openAiChatToAnthropicRequest({
      model: 'claude-haiku-5-5',
      max_completion_tokens: 50,
      temperature: 0.2,
      stop: ['END'],
      messages: [{ role: 'user', content: 'x' }],
    });

    expect(request).toMatchObject({ max_tokens: 50, temperature: 0.2, stop_sequences: ['END'] });
  });
});

describe('isAnthropicModel', () => {
  it('detects Claude models only', () => {
    expect(isAnthropicModel('claude-haiku-5-5')).toBe(true);
    expect(isAnthropicModel('kimi-k2')).toBe(false);
    expect(isAnthropicModel(undefined)).toBe(false);
  });
});

describe('anthropicMessageToOpenAiCompletion', () => {
  it('converts text and tool_use blocks with usage and finish reason', () => {
    const completion = anthropicMessageToOpenAiCompletion({
      id: 'msg_1',
      model: 'claude-haiku-5-5',
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Checking.' },
        { type: 'tool_use', id: 'toolu_1', name: 'weather', input: { city: 'Oslo' } },
      ],
      usage: { input_tokens: 10, output_tokens: 4 },
    });

    expect(completion).toMatchObject({
      id: 'msg_1',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: 'Checking.',
            tool_calls: [{ id: 'toolu_1', type: 'function', function: { name: 'weather', arguments: '{"city":"Oslo"}' } }],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    });
  });
});

describe('AnthropicToOpenAiStream', () => {
  it('converts text deltas across split network chunks and ends with usage and DONE', () => {
    const converter = new AnthropicToOpenAiStream();
    const events = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_2","model":"claude-haiku-5-5","usage":{"input_tokens":7}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join('');

    // Split mid-event to prove buffering across network chunks
    const output = converter.feed(events.slice(0, 120)) + converter.feed(events.slice(120)) + converter.flush();

    expect(output).toContain('"content":"Hel"');
    expect(output).toContain('"content":"lo"');
    expect(output).toContain('"finish_reason":"stop"');
    expect(output).toContain('"usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}');
    expect(output.endsWith('data: [DONE]\n\n')).toBe(true);
  });

  it('streams tool call arguments with the matching index', () => {
    const converter = new AnthropicToOpenAiStream();
    const output = converter.feed(
      [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"m","model":"claude-haiku-5-5","usage":{"input_tokens":1}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_9","name":"weather"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":3}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ].join(''),
    ) + converter.flush();

    expect(output).toContain('"id":"toolu_9"');
    expect(output).toContain('"arguments":"{\\"city\\":"');
    expect(output).toContain('"finish_reason":"tool_calls"');
  });
});
