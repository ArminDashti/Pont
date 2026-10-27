export const PROVIDER_IDS = ['openrouter', 'opencode-go'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const ENDPOINT_IDS = ['models', 'chat', 'responses', 'messages'] as const;
export type ProviderEndpointId = (typeof ENDPOINT_IDS)[number];

export interface ProviderEndpoint {
  id: ProviderEndpointId;
  method: 'GET' | 'POST';
  path: string;
}

export interface ProviderAuth {
  bearer: boolean;
  xApiKey: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  baseUrl: string;
  gatewayPrefix: string;
  envVar: string;
  auth: ProviderAuth;
  defaultHeaders: Readonly<Record<string, string>>;
  bridgesClaudeToChat: boolean;
  endpoints: readonly ProviderEndpoint[];
}

const ANTHROPIC_VERSION_HEADER = { 'anthropic-version': '2023-06-01' } as const;

const OPENAI_COMPATIBLE_ENDPOINTS: readonly ProviderEndpoint[] = [
  { id: 'models', method: 'GET', path: 'models' },
  { id: 'chat', method: 'POST', path: 'chat/completions' },
  { id: 'responses', method: 'POST', path: 'responses' },
];

const OPENCODE_ENDPOINTS: readonly ProviderEndpoint[] = [
  ...OPENAI_COMPATIBLE_ENDPOINTS,
  { id: 'messages', method: 'POST', path: 'messages' },
];

export interface ProviderBaseUrls {
  opencodeGo: string;
}

export function buildProviderDefinitions(baseUrls: ProviderBaseUrls): readonly ProviderDefinition[] {
  return [
    {
      id: 'openrouter',
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      gatewayPrefix: 'openrouter/v1',
      envVar: 'OPENROUTER_API_KEY',
      auth: { bearer: true, xApiKey: false },
      defaultHeaders: {},
      bridgesClaudeToChat: false,
      endpoints: OPENAI_COMPATIBLE_ENDPOINTS,
    },
    {
      id: 'opencode-go',
      label: 'OpenCode Go',
      baseUrl: baseUrls.opencodeGo,
      gatewayPrefix: 'zen/go/v1',
      envVar: 'OPENCODE_GO_API_KEY',
      auth: { bearer: true, xApiKey: true },
      defaultHeaders: ANTHROPIC_VERSION_HEADER,
      bridgesClaudeToChat: true,
      endpoints: OPENCODE_ENDPOINTS,
    },
  ];
}
