import { describe, expect, it } from 'vitest';

import { extractClientApp, extractTitle, extractUsername } from './request-meta.js';

describe('extractTitle', () => {
  it('uses the first user message string and collapses whitespace', () => {
    const body = { messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: '  Plan\n  my trip ' }] };
    expect(extractTitle(body, 'chat/completions')).toBe('Plan my trip');
  });

  it('joins text parts of array content', () => {
    const body = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Summarize' }, { type: 'image_url' }, { type: 'text', text: 'this page' }] }],
    };
    expect(extractTitle(body, 'messages')).toBe('Summarize this page');
  });

  it('reads a plain string input for the responses API', () => {
    expect(extractTitle({ input: 'Write a haiku' }, 'responses')).toBe('Write a haiku');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(200);
    expect(extractTitle({ messages: [{ role: 'user', content: long }] }, 'chat/completions')).toHaveLength(80);
  });

  it('returns an empty title for non-object bodies', () => {
    expect(extractTitle(undefined, 'chat/completions')).toBe('');
  });
});

describe('extractUsername', () => {
  it('reads body.user for chat/completions and responses', () => {
    expect(extractUsername({ user: 'armin' }, 'chat/completions')).toBe('armin');
    expect(extractUsername({ user: 'armin' }, 'responses')).toBe('armin');
  });

  it('reads metadata.user_id for Anthropic messages', () => {
    expect(extractUsername({ metadata: { user_id: 'armin' } }, 'messages')).toBe('armin');
    expect(extractUsername({ user: 'ignored' }, 'messages')).toBeUndefined();
  });

  it('returns undefined when the field is missing or blank', () => {
    expect(extractUsername({ user: '   ' }, 'chat/completions')).toBeUndefined();
    expect(extractUsername(undefined, 'chat/completions')).toBeUndefined();
  });
});

describe('extractClientApp', () => {
  it('reads the client app header and normalizes aliases', () => {
    expect(extractClientApp('nanobot', undefined)).toBe('agent');
    expect(extractClientApp('OpenWebUI', undefined)).toBe('chat');
    expect(extractClientApp('nanobrowser', undefined)).toBe('extension');
  });

  it('reads metadata.client_app from the JSON body', () => {
    expect(extractClientApp(undefined, { metadata: { client_app: 'chat' } })).toBe('chat');
  });

  it('returns unknown when nothing is set', () => {
    expect(extractClientApp(undefined, undefined)).toBe('unknown');
  });
});
