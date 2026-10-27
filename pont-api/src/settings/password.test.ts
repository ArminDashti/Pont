import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the original password and rejects others', async () => {
    const stored = await hashPassword('correct horse');

    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
  });

  it('salts each hash, so the same password never produces the same stored value', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');

    expect(first).not.toBe(second);
    expect(first.startsWith('scrypt$')).toBe(true);
  });

  it('treats malformed stored values as a mismatch', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$zz$')).toBe(false);
    expect(await verifyPassword('anything', 'md5$00$00')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$00$00$extra')).toBe(false);
  });
});
