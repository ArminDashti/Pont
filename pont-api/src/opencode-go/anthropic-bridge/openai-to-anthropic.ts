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
