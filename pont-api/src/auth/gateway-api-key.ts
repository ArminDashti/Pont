import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = 'pont_sk_';

export function generateGatewayApiKey(): string {
  return `${PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function gatewayKeyPrefix(fullKey: string): string {
  if (fullKey.length <= 12) {
    return 'pont_…';
  }
  return `${fullKey.slice(0, 12)}…`;
}

export function hashGatewayApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyGatewayApiKey(key: string, storedHash: string | undefined): boolean {
  if (!storedHash) {
    return false;
  }
  const digest = hashGatewayApiKey(key);
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
