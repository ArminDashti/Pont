import { describe, expect, it } from 'vitest';

import { rejectsSamplingParams, stripUnsupportedSampling } from './sampling.util.js';

describe('sampling.util', () => {
  it('detects models that reject sampling params', () => {
    expect(rejectsSamplingParams('claude-haiku-5-5')).toBe(true);
    expect(rejectsSamplingParams('claude-sonnet-5-0')).toBe(true);
    expect(rejectsSamplingParams('claude-opus-4-7')).toBe(true);
    expect(rejectsSamplingParams('claude-haiku-4-5')).toBe(false);
    expect(rejectsSamplingParams('kimi-k3')).toBe(false);
  });

  it('strips temperature/top_p/top_k only for those models', () => {
    const { body, changed } = stripUnsupportedSampling({ model: 'claude-haiku-5-5', temperature: 0.1, top_p: 1, max_tokens: 5 });
    expect(changed).toBe(true);
    expect(body).toEqual({ model: 'claude-haiku-5-5', max_tokens: 5 });
    const kept = { model: 'kimi-k3', temperature: 0.1 };
    expect(stripUnsupportedSampling(kept).body).toBe(kept);
  });
});