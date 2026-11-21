import { type JsonObject, asArray, asObject, isJsonObject } from './json.js';

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

function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return asArray(content)
    .map((part) => asObject(part))
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n');
}

function convertAnthropicTools(tools: unknown): JsonObject[] | undefined {
  const converted = asArray(tools).map((tool) => {
    const item = asObject(tool);
    return {
      type: 'function',
      function: {
        name: item.name,
        ...(typeof item.description === 'string' ? { description: item.description } : {}),
        parameters: isJsonObject(item.input_schema) ? item.input_schema : { type: 'object', properties: {} },
      },
    };
  });
  return converted.length > 0 ? converted : undefined;
}

function convertAnthropicToolChoice(choice: unknown): unknown | undefined {
  if (!isJsonObject(choice)) {
    return undefined;
  }
  if (choice.type === 'auto') {
    return 'auto';
  }
  if (choice.type === 'any') {
    return 'required';
  }
  if (choice.type === 'tool' && typeof choice.name === 'string') {
    return { type: 'function', function: { name: choice.name } };
  }
  return undefined;
}

/** Converts an Anthropic Messages request into an OpenAI chat/completions request (inverse of openAiChatToAnthropicRequest). */
export function anthropicRequestToOpenAiChat(body: JsonObject): JsonObject {
  const messages: JsonObject[] = [];
  const systemText = textOf(body.system);
  if (systemText.length > 0) {
    messages.push({ role: 'system', content: systemText });
  }

  for (const entry of asArray(body.messages)) {
    const message = asObject(entry);
    const blocks = asArray(message.content).map((block) => asObject(block));
    const openAiParts: JsonObject[] = [];
    const toolCalls: JsonObject[] = [];
    const toolResults: JsonObject[] = [];

    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        openAiParts.push({ type: 'text', text: block.text });
      } else if (block.type === 'image') {
        const source = asObject(block.source);
        if (source.type === 'url' && typeof source.url === 'string') {
          openAiParts.push({ type: 'image_url', image_url: { url: source.url } });
        } else if (source.type === 'base64' && typeof source.data === 'string') {
          const media = typeof source.media_type === 'string' ? source.media_type : 'image/jpeg';
          openAiParts.push({ type: 'image_url', image_url: { url: `data:${media};base64,${source.data}` } });
        }
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      } else if (block.type === 'tool_result') {
        toolResults.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: textOf(block.content),
        });
      }
    }

    if (typeof message.content === 'string' && message.content.length > 0) {
      openAiParts.push({ type: 'text', text: message.content });
    }

    if (message.role === 'assistant') {
      const content =
        openAiParts.length === 0 && toolCalls.length > 0
          ? null
          : openAiParts.length === 1 && openAiParts[0].type === 'text'
            ? openAiParts[0].text
            : openAiParts.length > 0
              ? openAiParts
              : null;
      const row: JsonObject = { role: 'assistant', content };
      if (toolCalls.length > 0) {
        row.tool_calls = toolCalls;
      }
      messages.push(row);
      continue;
    }

    for (const toolMessage of toolResults) {
      messages.push(toolMessage);
    }
    if (openAiParts.length > 0) {
      const content =
        openAiParts.length === 1 && openAiParts[0].type === 'text' ? openAiParts[0].text : openAiParts;
      messages.push({ role: 'user', content });
    }
  }

  const request: JsonObject = {
    model: body.model,
    messages,
    stream: body.stream === true,
    max_tokens: body.max_tokens,
  };
  if (typeof body.temperature === 'number') {
    request.temperature = body.temperature;
  }
  if (typeof body.top_p === 'number') {
    request.top_p = body.top_p;
  }
  const stop = asArray(body.stop_sequences).filter((s) => typeof s === 'string');
  if (stop.length === 1) {
    request.stop = stop[0];
  } else if (stop.length > 1) {
    request.stop = stop;
  }
  const tools = convertAnthropicTools(body.tools);
  if (tools) {
    request.tools = tools;
    const toolChoice = convertAnthropicToolChoice(body.tool_choice);
    if (toolChoice !== undefined) {
      request.tool_choice = toolChoice;
    }
  }
  return request;
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
