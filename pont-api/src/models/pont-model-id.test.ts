import { describe, expect, it } from 'vitest';

import {
  encodePontModelId,
  encodePontModelIdFromUpstream,
  parsePontModelId,
  resolveUpstreamModelId,
} from './pont-model-id.js';

describe('pont-model-id', () => {
  it('parses opencode examples', () => {
    expect(parsePontModelId('opencode-deepseek-4-1-2609-free')).toEqual({
      pontPrefix: 'opencode',
      providerId: 'opencode-go',
      upstreamSlug: 'deepseek-4-1-2609',
      freeTier: true,
    });
    expect(parsePontModelId('opencode-deepseek-4-1-free')).toEqual({
      pontPrefix: 'opencode',
      providerId: 'opencode-go',
      upstreamSlug: 'deepseek-4-1',
      freeTier: true,
    });
  });

  it('resolves upstream slug for completions', () => {
    expect(resolveUpstreamModelId('openrouter-anthropic-claude-3.5-sonnet')).toBe('anthropic/claude-3.5-sonnet');
    expect(resolveUpstreamModelId('openrouter-anthropic/claude-3.5-sonnet')).toBe('anthropic/claude-3.5-sonnet');
    expect(resolveUpstreamModelId('plain-upstream-id')).toBe('plain-upstream-id');
  });

  it('normalizes OpenRouter upstream ids for Pont', () => {
    expect(encodePontModelId('openrouter', '~anthropic/claude-fable-latest')).toBe(
      'openrouter-anthropic-claude-fable-latest',
    );
    expect(encodePontModelId('openrouter', 'cohere/command-a')).toBe('openrouter-cohere-command-a');
  });

  it('maps OpenRouter :free variants to Pont -free ids', () => {
    expect(encodePontModelIdFromUpstream('openrouter', 'liquid/lfm-2.5-2.6b:free', new Set())).toBe(
      'openrouter-liquid-lfm-2.5-2.6b-free',
    );
    expect(resolveUpstreamModelId('openrouter-liquid-lfm-2.5-2.6b-free')).toBe('liquid/lfm-2.5-2.6b:free');
  });

  it('encodes pont ids', () => {
    expect(encodePontModelId('opencode-go', 'glm-5', { freeTier: true })).toBe('opencode-glm-5-free');
    expect(encodePontModelId('openrouter', 'gpt-4o')).toBe('openrouter-gpt-4o');
  });
});
