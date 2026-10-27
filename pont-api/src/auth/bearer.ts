import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || undefined;
}

/**
 * Client credential as an Authorization value. Anthropic-style SDKs send `x-api-key` instead of
 * `Authorization: Bearer`, so that header is accepted as the same credential.
 */
export function clientAuthorization(headers: IncomingHttpHeaders): string | undefined {
  if (headers.authorization) {
    return headers.authorization;
  }
  const apiKey = headers['x-api-key'];
  return typeof apiKey === 'string' && apiKey.trim() ? `Bearer ${apiKey.trim()}` : undefined;
}

/** Constant-time string comparison; returns false for different lengths without leaking the mismatch point. */
export function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
