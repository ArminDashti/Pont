import { type JsonObject, asArray, asObject } from '../anthropic-bridge/json.js';

function textFromResponse(response: JsonObject): string {
  if (typeof response.output_text === 'string' && response.output_text.length > 0) {
    return response.output_text;
  }
  const parts = asArray(response.output).flatMap((item) => {
    const block = asObject(item);
    if (block.type !== 'message') {
      return [];
    }
    return asArray(block.content).flatMap((part) => {
      const content = asObject(part);
      return content.type === 'output_text' && typeof content.text === 'string' ? [content.text] : [];
    });
  });
  return parts.join('');
}

function usageOf(response: JsonObject): JsonObject | undefined {
  const usage = asObject(response.usage);
  const prompt = usage.input_tokens;
  const completion = usage.output_tokens;
  if (typeof prompt !== 'number' && typeof completion !== 'number') {
    return undefined;
  }
  const promptTokens = typeof prompt === 'number' ? prompt : 0;
  const completionTokens = typeof completion === 'number' ? completion : 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

/** Converts a non-streaming Responses API payload into an OpenAI chat.completion object. */
export function responsesToOpenAiCompletion(response: JsonObject): JsonObject {
  const text = textFromResponse(response);
  const usage = usageOf(response);
  return {
    id: response.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text.length > 0 ? text : null },
        finish_reason: 'stop',
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

function chunk(id: string, model: string, created: number, delta: JsonObject, finishReason?: string): string {
  const choice: JsonObject = { index: 0, delta };
  if (finishReason) {
    choice.finish_reason = finishReason;
  }
  const payload: JsonObject = {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [choice],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Stateful converter from Responses SSE to OpenAI chat.completion.chunk SSE. */
export class ResponsesToOpenAiStream {
  private buffer = '';
  private id = '';
  private model = '';
  private created = Math.floor(Date.now() / 1000);
  private started = false;
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

    if (event.type === 'response.created' || event.type === 'response.in_progress') {
      const response = asObject(event.response);
      this.id = String(response.id ?? this.id);
      this.model = String(response.model ?? this.model);
      if (!this.started) {
        this.started = true;
        return chunk(this.id, this.model, this.created, { role: 'assistant', content: '' });
      }
      return '';
    }

    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string' && event.delta.length > 0) {
      return chunk(this.id, this.model, this.created, { content: event.delta });
    }

    if (event.type === 'response.completed') {
      const response = asObject(event.response);
      this.id = String(response.id ?? this.id);
      this.model = String(response.model ?? this.model);
      return chunk(this.id, this.model, this.created, {}, 'stop');
    }

    return '';
  }

  private finish(): string {
    if (this.finished) {
      return '';
    }
    this.finished = true;
    return 'data: [DONE]\n\n';
  }
}
