import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPENCODE_GO_INFERENCE_BASE,
  apiStyleForPath,
  buildOpenCodeGoUpstreamUrl,
  getOpenCodeGoApiStyle,
} from './opencodeGo.js';

describe('getOpenCodeGoApiStyle', () => {
  it('routes luna models to responses', () => {
    expect(getOpenCodeGoApiStyle('gpt-6-luna')).toBe('responses');
  });

  it('routes claude haiku 5.5 to messages', () => {
    expect(getOpenCodeGoApiStyle('claude-haiku-5-5')).toBe('messages');
  });

  it('routes qwen flash to messages', () => {
    expect(getOpenCodeGoApiStyle('qwen3.8-flash')).toBe('messages');
  });

  it('routes qwen3.7 plus to messages', () => {
    expect(getOpenCodeGoApiStyle('qwen3.7-plus')).toBe('messages');
  });

  it('routes muse spark contributor models to responses', () => {
    expect(getOpenCodeGoApiStyle('muse-spark-1.3-contributor')).toBe('responses');
    expect(getOpenCodeGoApiStyle('muse-spark-1.2-contributor')).toBe('responses');
  });

  it('defaults unknown slugs to chat', () => {
    expect(getOpenCodeGoApiStyle('longcat-2.5-preview-free')).toBe('chat');
  });
});

describe('apiStyleForPath', () => {
  it('maps completion paths', () => {
    expect(apiStyleForPath('chat/completions')).toBe('chat');
    expect(apiStyleForPath('responses')).toBe('responses');
    expect(apiStyleForPath('messages')).toBe('messages');
  });
});

describe('buildOpenCodeGoUpstreamUrl', () => {
  it('uses inference/go paths from the OpenCode Go docs', () => {
    expect(buildOpenCodeGoUpstreamUrl(DEFAULT_OPENCODE_GO_INFERENCE_BASE, { kind: 'models' })).toBe(
      'https://opencode.ai/inference/go/v1/models',
    );
    expect(
      buildOpenCodeGoUpstreamUrl(DEFAULT_OPENCODE_GO_INFERENCE_BASE, {
        kind: 'completion',
        style: 'chat',
        model: 'longcat-2.5-preview-free',
      }),
    ).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions');
    expect(
      buildOpenCodeGoUpstreamUrl(DEFAULT_OPENCODE_GO_INFERENCE_BASE, {
        kind: 'completion',
        style: 'messages',
        model: 'qwen3.8-flash',
      }),
    ).toBe('https://opencode.ai/inference/go/anthropic/v1/messages');
  });

  it('maps legacy zen/go/v1 roots to inference/go upstream URLs', () => {
    expect(buildOpenCodeGoUpstreamUrl('https://opencode.ai/zen/go/v1', { kind: 'models' })).toBe(
      'https://opencode.ai/inference/go/v1/models',
    );
  });
});
