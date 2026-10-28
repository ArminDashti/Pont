import { describe, expect, it } from 'vitest';

import { catalogRowsFromModelsJson } from './upstream-model-catalog.js';

const FREE_SLUGS = new Set<string>();

describe('catalogRowsFromModelsJson', () => {
  it('maps OpenRouter-style pricing and context fields', () => {
    const body = JSON.stringify({
      data: [
        {
          id: 'anthropic/claude-3.5-sonnet',
          name: 'Claude 3.5 Sonnet',
          context_length: 200000,
          pricing: {
            prompt: '0.000003',
            completion: '0.000015',
            input_cache_read: '0.0000003',
          },
        },
      ],
    });
    const [row] = catalogRowsFromModelsJson(body, 'openrouter', FREE_SLUGS);
    expect(row).toMatchObject({
      id: 'openrouter-anthropic-claude-3.5-sonnet',
      providerId: 'openrouter',
      owner: 'anthropic',
      model: 'Claude 3.5 Sonnet',
      contextLength: 200000,
      free: false,
      inputToken: '0.000003',
      inputCacheToken: '0.0000003',
      outputToken: '0.000015',
    });
  });

  it('ignores aggregator owned_by and infers OpenCode Go model creators', () => {
    const body = JSON.stringify({
      data: [
        { id: 'claude-haiku-5-5', owned_by: 'opencode' },
        { id: 'gpt-5.6-luna', owned_by: 'opencode' },
        { id: 'deepseek-v4-pro', owned_by: 'opencode' },
      ],
    });
    const rows = catalogRowsFromModelsJson(body, 'opencode-go', FREE_SLUGS);
    expect(rows.map((row) => row.owner)).toEqual(['anthropic', 'openai', 'deepseek']);
  });

  it('marks free-tier Pont ids and zero pricing', () => {
    const body = JSON.stringify({
      data: [{ id: 'deepseek/deepseek-4-1-free', name: 'DeepSeek Free', pricing: { prompt: '0', completion: '0' } }],
    });
    const [row] = catalogRowsFromModelsJson(body, 'opencode-go', FREE_SLUGS);
    expect(row?.free).toBe(true);
    expect(row?.id).toBe('opencode-deepseek-deepseek-4-1-free');
  });
});
