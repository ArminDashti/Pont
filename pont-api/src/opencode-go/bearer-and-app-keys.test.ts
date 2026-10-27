import { describe, expect, it } from 'vitest';

import { clientAuthorization, parseBearerToken, secureEquals } from '../auth/bearer.js';

describe('bearer helpers', () => {
  it('extracts bearer tokens case-insensitively', () => {
    expect(parseBearerToken('bearer abc')).toBe('abc');
    expect(parseBearerToken(undefined)).toBeUndefined();
    expect(parseBearerToken('Basic abc')).toBeUndefined();
  });

  it('reads the client credential from Authorization, then from x-api-key', () => {
    expect(clientAuthorization({ authorization: 'Bearer abc', 'x-api-key': 'other' })).toBe('Bearer abc');
    expect(clientAuthorization({ 'x-api-key': ' abc ' })).toBe('Bearer abc');
    expect(clientAuthorization({ 'x-api-key': '  ' })).toBeUndefined();
    expect(clientAuthorization({})).toBeUndefined();
  });

  it('compares secrets in constant time and rejects length mismatches', () => {
    expect(secureEquals('same', 'same')).toBe(true);
    expect(secureEquals('same', 'diff')).toBe(false);
    expect(secureEquals('short', 'longer-value')).toBe(false);
  });
});
