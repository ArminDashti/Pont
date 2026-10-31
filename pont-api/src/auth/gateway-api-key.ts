import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const GATEWAY_API_KEY_PREFIX = 'pont_sk_';

const PREFIX = GATEWAY_API_KEY_PREFIX;

export function isPontGatewayApiKey(key: string): boolean {
  return key.startsWith(PREFIX);
}

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
