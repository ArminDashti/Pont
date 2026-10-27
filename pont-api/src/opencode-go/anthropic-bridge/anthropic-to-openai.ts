import { type JsonObject, asArray, asObject } from './json.js';

function finishReason(stopReason: unknown): string {
  switch (stopReason) {
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    default:
      return 'stop';
  }
}

function usageOf(inputTokens: unknown, outputTokens: unknown): JsonObject {
  const prompt = typeof inputTokens === 'number' ? inputTokens : 0;
  const completion = typeof outputTokens === 'number' ? outputTokens : 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

/** Converts a non-streaming Anthropic Messages response into an OpenAI chat.completion object. */
export function anthropicMessageToOpenAiCompletion(message: JsonObject): JsonObject {
  const blocks = asArray(message.content).map((block) => asObject(block));
  const text = blocks
    .filter((block) => block.type === 'text')
    .map((block) => String(block.text ?? ''))
    .join('');
  const toolCalls = blocks
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      id: block.id,
      type: 'function',
      function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
    }));
  const assistant: JsonObject = { role: 'assistant', content: text.length > 0 ? text : null };
  if (toolCalls.length > 0) {
    assistant.tool_calls = toolCalls;
  }
  const usage = asObject(message.usage);
  return {
    id: message.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: message.model,
    choices: [{ index: 0, message: assistant, finish_reason: finishReason(message.stop_reason) }],
    usage: usageOf(usage.input_tokens, usage.output_tokens),
  };
}

/**
 * Stateful converter from Anthropic Messages SSE to OpenAI chat.completion.chunk SSE.
 * Feed decoded text as it arrives; call flush() once the upstream ends.
 */
export class AnthropicToOpenAiStream {
  private buffer = '';
  private id = '';
  private model = '';
  private created = Math.floor(Date.now() / 1000);
  private inputTokens = 0;
  private outputTokens = 0;
  private stopReason: unknown = 'end_turn';
  private nextToolIndex = 0;
  private readonly toolIndexByBlock = new Map<number, number>();
  private finished = false;

  feed(text: string): string {
    this.buffer += text;
    let output = '';
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      output += this.convertEvent(rawEvent);
      boundary = this.buffer.indexOf('\n\n');
    }
    return output;
  }

  flush(): string {
    const pending = this.buffer.trim().length > 0 ? this.convertEvent(this.buffer) : '';
    this.buffer = '';
    return pending + this.finish();
  }

  private convertEvent(rawEvent: string): string {
    const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) {
      return '';
    }
    let event: JsonObject;
    try {
      event = asObject(JSON.parse(dataLine.slice('data:'.length).trim()));
    } catch {
      return '';
    }
    switch (event.type) {
      case 'message_start': {
        const message = asObject(event.message);
        this.id = String(message.id ?? '');
        this.model = String(message.model ?? '');
        this.inputTokens = Number(asObject(message.usage).input_tokens ?? 0);
        return this.chunk({ role: 'assistant', content: '' });
      }
      case 'content_block_start': {
        const block = asObject(event.content_block);
        if (block.type !== 'tool_use') {
          return '';
        }
        const index = this.nextToolIndex++;
        this.toolIndexByBlock.set(Number(event.index), index);
        return this.chunk({
          tool_calls: [
            {
              index,
              id: block.id,
              type: 'function',
              function: { name: block.name, arguments: '' },
            },
          ],
        });
      }
      case 'content_block_delta': {
        const delta = asObject(event.delta);
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          return this.chunk({ content: delta.text });
        }
        if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const index = this.toolIndexByBlock.get(Number(event.index));
          if (index === undefined) {
            return '';
          }
          return this.chunk({ tool_calls: [{ index, function: { arguments: delta.partial_json } }] });
        }
        return '';
      }
      case 'message_delta': {
        const delta = asObject(event.delta);
        if (delta.stop_reason !== undefined) {
          this.stopReason = delta.stop_reason;
        }
        this.outputTokens = Number(asObject(event.usage).output_tokens ?? this.outputTokens);
        return '';
      }
      case 'message_stop':
        return this.finish();
      default:
        return '';
    }
  }

  private finish(): string {
    if (this.finished) {
      return '';
    }
    this.finished = true;
    const final = this.envelope({}, finishReason(this.stopReason));
    const usage = {
      id: this.id,
      object: 'chat.completion.chunk',
      created: this.created,
      model: this.model,
      choices: [],
      usage: usageOf(this.inputTokens, this.outputTokens),
    };
    return `data: ${JSON.stringify(final)}\n\ndata: ${JSON.stringify(usage)}\n\ndata: [DONE]\n\n`;
  }

  private chunk(delta: JsonObject): string {
    return `data: ${JSON.stringify(this.envelope(delta, null))}\n\n`;
  }

  private envelope(delta: JsonObject, reason: string | null): JsonObject {
    return {
      id: this.id,
      object: 'chat.completion.chunk',
      created: this.created,
      model: this.model,
      choices: [{ index: 0, delta, finish_reason: reason }],
    };
  }
}
