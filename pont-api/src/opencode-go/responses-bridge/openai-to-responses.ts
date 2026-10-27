import { type JsonObject, asArray, asObject } from '../anthropic-bridge/json.js';

function messageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return asArray(content)
    .map((part) => asObject(part))
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n');
}

/** Maps an OpenAI chat/completions body to the OpenCode Go Responses API. */
export function openAiChatToResponsesRequest(body: JsonObject): JsonObject {
  const messages = asArray(body.messages).map((message) => asObject(message));
  const lines = messages
    .map((message) => {
      const role = typeof message.role === 'string' ? message.role : 'user';
      const text = messageText(message.content).trim();
      return text.length > 0 ? `${role}: ${text}` : '';
    })
    .filter((line) => line.length > 0);

  const request: JsonObject = {
    model: body.model,
    input: lines.join('\n'),
  };
  if (body.stream === true) {
    request.stream = true;
  }
  const maxTokens = body.max_tokens ?? body.max_completion_tokens;
  if (typeof maxTokens === 'number') {
    request.max_output_tokens = maxTokens;
  }
  return request;
}
