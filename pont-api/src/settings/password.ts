import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** Hashes a password as `scrypt$<salt-hex>$<hash-hex>` with a random per-password salt. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(plain, salt, KEY_BYTES);
  return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Checks a password against a stored hash in constant time. Malformed hashes never match. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex, extra] = stored.split('$');
  if (scheme !== SCHEME || !saltHex || !hashHex || extra !== undefined) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) {
    return false;
  }
  const derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(derived, expected);
}
