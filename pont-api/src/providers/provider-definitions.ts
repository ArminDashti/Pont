export const PROVIDER_IDS = ['openrouter', 'openai', 'opencode-go', 'opencode-zen'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderAuth {
  bearer: boolean;
  xApiKey: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  baseUrl: string;
  envVar: string;
  auth: ProviderAuth;
  defaultHeaders: Readonly<Record<string, string>>;
  bridgesClaudeToChat: boolean;
}

const ANTHROPIC_VERSION_HEADER = { 'anthropic-version': '2023-06-01' } as const;

export interface ProviderBaseUrls {
  opencodeGo: string;
  opencodeZen: string;
}

export function buildProviderDefinitions(baseUrls: ProviderBaseUrls): readonly ProviderDefinition[] {
  return [
    {
      id: 'openrouter',
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      envVar: 'OPENROUTER_API_KEY',
      auth: { bearer: true, xApiKey: false },
      defaultHeaders: {},
      bridgesClaudeToChat: false,
    },
    {
      id: 'openai',
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      envVar: 'OPENAI_API_KEY',
      auth: { bearer: true, xApiKey: false },
      defaultHeaders: {},
      bridgesClaudeToChat: false,
    },
    {
      id: 'opencode-go',
      label: 'OpenCode Go',
      baseUrl: baseUrls.opencodeGo,
      envVar: 'OPENCODE_GO_API_KEY',
      auth: { bearer: true, xApiKey: true },
      defaultHeaders: ANTHROPIC_VERSION_HEADER,
      bridgesClaudeToChat: true,
    },
    {
      id: 'opencode-zen',
      label: 'OpenCode Zen',
      baseUrl: baseUrls.opencodeZen,
      envVar: 'OPENCODE_ZEN_API_KEY',
      auth: { bearer: true, xApiKey: false },
      defaultHeaders: {},
      bridgesClaudeToChat: false,
    },
  ];
}
