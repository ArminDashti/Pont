import type { Request } from 'express';

/** First hop of X-Forwarded-For when behind a reverse proxy; otherwise the socket address. */
export function resolveClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const fromHeader =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]?.split(',')[0]?.trim()
        : undefined;
  if (fromHeader) {
    return fromHeader;
  }
  return req.socket?.remoteAddress ?? '';
}
