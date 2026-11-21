import { type JsonObject, asArray, asObject, isJsonObject } from './json.js';

/** Anthropic Messages requires max_tokens; OpenAI clients often omit it. */
const DEFAULT_MAX_TOKENS = 4096;

/** Claude models on OpenCode Go only accept the Anthropic Messages protocol. */
export function isAnthropicModel(model: unknown): boolean {
  return typeof model === 'string' && model.startsWith('claude-');
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

function imageBlock(url: string): JsonObject {
  const dataUrl = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (dataUrl) {
    return { type: 'image', source: { type: 'base64', media_type: dataUrl[1], data: dataUrl[2] } };
  }
  return { type: 'image', source: { type: 'url', url } };
}

function contentBlocks(content: unknown): JsonObject[] {
  if (typeof content === 'string') {
    return content.length > 0 ? [{ type: 'text', text: content }] : [];
  }
  const blocks: JsonObject[] = [];
  for (const part of asArray(content)) {
    const item = asObject(part);
    if (item.type === 'text' && typeof item.text === 'string' && item.text.length > 0) {
      blocks.push({ type: 'text', text: item.text });
    } else if (item.type === 'image_url') {
      const image = asObject(item.image_url);
      if (typeof image.url === 'string') {
        blocks.push(imageBlock(image.url));
      }
    }
  }
  return blocks;
}

function parseArguments(raw: unknown): JsonObject {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Appends blocks to the last message when roles match, because Anthropic expects alternating turns. */
function appendBlocks(messages: JsonObject[], role: 'user' | 'assistant', blocks: JsonObject[]): void {
  if (blocks.length === 0) {
    return;
  }
  const last = messages.at(-1);
  if (last && last.role === role) {
    (last.content as JsonObject[]).push(...blocks);
    return;
  }
  messages.push({ role, content: [...blocks] });
}

function convertTools(tools: unknown): JsonObject[] | undefined {
  const converted = asArray(tools)
    .map((tool) => asObject(tool))
    .filter((tool) => tool.type === 'function' && isJsonObject(tool.function))
    .map((tool) => {
      const fn = asObject(tool.function);
      return {
        name: fn.name,
        ...(typeof fn.description === 'string' ? { description: fn.description } : {}),
        input_schema: isJsonObject(fn.parameters) ? fn.parameters : { type: 'object', properties: {} },
      };
    });
  return converted.length > 0 ? converted : undefined;
}

function convertToolChoice(choice: unknown): JsonObject | undefined {
  if (choice === 'auto') {
    return { type: 'auto' };
  }
  if (choice === 'required') {
    return { type: 'any' };
  }
  if (isJsonObject(choice) && isJsonObject(choice.function) && typeof choice.function.name === 'string') {
    return { type: 'tool', name: choice.function.name };
  }
  return undefined;
}

/** Converts an OpenAI Chat Completions request body into an Anthropic Messages request body. */
export function openAiChatToAnthropicRequest(body: JsonObject): JsonObject {
  const systemParts: string[] = [];
  const messages: JsonObject[] = [];

  for (const entry of asArray(body.messages)) {
    const message = asObject(entry);
    if (message.role === 'system' || message.role === 'developer') {
      const text = textOf(message.content);
      if (text.length > 0) {
        systemParts.push(text);
      }
    } else if (message.role === 'tool') {
      appendBlocks(messages, 'user', [
        { type: 'tool_result', tool_use_id: message.tool_call_id, content: textOf(message.content) },
      ]);
    } else if (message.role === 'assistant') {
      const toolUses = asArray(message.tool_calls).map((call) => {
        const item = asObject(call);
        const fn = asObject(item.function);
        return { type: 'tool_use', id: item.id, name: fn.name, input: parseArguments(fn.arguments) };
      });
      appendBlocks(messages, 'assistant', [...contentBlocks(message.content), ...toolUses]);
    } else {
      appendBlocks(messages, 'user', contentBlocks(message.content));
    }
  }

  const request: JsonObject = {
    model: body.model,
    max_tokens: body.max_completion_tokens ?? body.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages,
    stream: body.stream === true,
  };
  if (systemParts.length > 0) {
    request.system = systemParts.join('\n\n');
  }
  if (typeof body.temperature === 'number') {
    request.temperature = body.temperature;
  }
  if (typeof body.top_p === 'number') {
    request.top_p = body.top_p;
  }
  const stop = typeof body.stop === 'string' ? [body.stop] : asArray(body.stop).filter((s) => typeof s === 'string');
  if (stop.length > 0) {
    request.stop_sequences = stop;
  }

  const tools = convertTools(body.tools);
  if (tools && body.tool_choice !== 'none') {
    request.tools = tools;
    const toolChoice = convertToolChoice(body.tool_choice);
    if (toolChoice) {
      request.tool_choice = toolChoice;
    }
  }
  return request;
}

function stopReason(finishReason: unknown): string {
  switch (finishReason) {
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}

/** Converts a non-streaming OpenAI chat.completion into an Anthropic Messages response. */
export function openAiCompletionToAnthropicMessage(completion: JsonObject): JsonObject {
  const choice = asObject(asArray(completion.choices)[0]);
  const assistant = asObject(choice.message);
  const content: JsonObject[] = [];
  const text = typeof assistant.content === 'string' ? assistant.content : textOf(assistant.content);
  if (text.length > 0) {
    content.push({ type: 'text', text });
  }
  for (const call of asArray(assistant.tool_calls)) {
    const item = asObject(call);
    const fn = asObject(item.function);
    content.push({
      type: 'tool_use',
      id: item.id,
      name: fn.name,
      input: parseArguments(fn.arguments),
    });
  }
  const usage = asObject(completion.usage);
  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
  return {
    id: completion.id ?? `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: completion.model,
    content,
    stop_reason: stopReason(choice.finish_reason),
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function anthropicSse(type: string, data: JsonObject): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Stateful converter from OpenAI chat.completion.chunk SSE to Anthropic Messages SSE. */
export class OpenAiToAnthropicStream {
  private buffer = '';
  private id = '';
  private model = '';
  private inputTokens = 0;
  private outputTokens = 0;
  private stopReason = 'end_turn';
  private started = false;
  private finished = false;
  private textBlockOpen = false;
  private nextBlockIndex = 0;
  private readonly toolBlockIndexByCall = new Map<number, number>();

  feed(text: string): string {
    this.buffer += text;
    let output = '';
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      output += this.convertChunk(raw);
      boundary = this.buffer.indexOf('\n\n');
    }
    return output;
  }

  flush(): string {
    const pending = this.buffer.trim().length > 0 ? this.convertChunk(this.buffer) : '';
    this.buffer = '';
    return pending + this.finish();
  }

  private convertChunk(raw: string): string {
    const dataLine = raw.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) {
      return '';
    }
    const payload = dataLine.slice('data:'.length).trim();
    if (payload === '[DONE]') {
      return this.finish();
    }
    let chunk: JsonObject;
    try {
      chunk = asObject(JSON.parse(payload));
    } catch {
      return '';
    }
    if (chunk.object === 'chat.completion.chunk' && isJsonObject(chunk.usage) && asArray(chunk.choices).length === 0) {
      const usage = asObject(chunk.usage);
      this.inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : this.inputTokens;
      this.outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : this.outputTokens;
      return '';
    }

    this.id = String(chunk.id ?? this.id);
    this.model = String(chunk.model ?? this.model);
    const choice = asObject(asArray(chunk.choices)[0]);
    const delta = asObject(choice.delta);
    let output = '';

    if (!this.started) {
      this.started = true;
      output += anthropicSse('message_start', {
        type: 'message_start',
        message: {
          id: this.id || `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          model: this.model,
          content: [],
          stop_reason: null,
          usage: { input_tokens: this.inputTokens, output_tokens: 0 },
        },
      });
    }

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      if (!this.textBlockOpen) {
        this.textBlockOpen = true;
        output += anthropicSse('content_block_start', {
          type: 'content_block_start',
          index: this.nextBlockIndex,
          content_block: { type: 'text', text: '' },
        });
      }
      output += anthropicSse('content_block_delta', {
        type: 'content_block_delta',
        index: this.nextBlockIndex,
        delta: { type: 'text_delta', text: delta.content },
      });
    }

    for (const call of asArray(delta.tool_calls)) {
      const item = asObject(call);
      const callIndex = Number(item.index ?? 0);
      const fn = asObject(item.function);
      if (!this.toolBlockIndexByCall.has(callIndex)) {
        const blockIndex = this.nextBlockIndex++;
        this.toolBlockIndexByCall.set(callIndex, blockIndex);
        output += anthropicSse('content_block_start', {
          type: 'content_block_start',
          index: blockIndex,
          content_block: { type: 'tool_use', id: item.id, name: fn.name, input: {} },
        });
      }
      if (typeof fn.arguments === 'string' && fn.arguments.length > 0) {
        const blockIndex = this.toolBlockIndexByCall.get(callIndex)!;
        output += anthropicSse('content_block_delta', {
          type: 'content_block_delta',
          index: blockIndex,
          delta: { type: 'input_json_delta', partial_json: fn.arguments },
        });
      }
    }

    if (choice.finish_reason) {
      this.stopReason = stopReason(choice.finish_reason);
    }
    return output;
  }

  private finish(): string {
    if (this.finished) {
      return '';
    }
    this.finished = true;
    let output = '';
    if (this.textBlockOpen) {
      output += anthropicSse('content_block_stop', {
        type: 'content_block_stop',
        index: 0,
      });
    }
    for (const blockIndex of this.toolBlockIndexByCall.values()) {
      output += anthropicSse('content_block_stop', { type: 'content_block_stop', index: blockIndex });
    }
    output += anthropicSse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: this.stopReason },
      usage: { output_tokens: this.outputTokens || 1 },
    });
    output += anthropicSse('message_stop', { type: 'message_stop' });
    return output;
  }
}
