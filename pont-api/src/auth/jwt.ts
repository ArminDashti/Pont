import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PontJwtPayload {
  sub: string;
  admin: boolean;
  exp: number;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64url');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function sign(secret: string, header: string, payload: string): string {
  return createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
}

export function issueJwt(secret: string, username: string, admin: boolean, ttlSeconds = 86_400): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(
    JSON.stringify({
      sub: username,
      admin,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    }),
  );
  const signature = sign(secret, header, body);
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(secret: string, token: string): PontJwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token');
  }
  const [header, body, signature] = parts;
  const expected = sign(secret, header, body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid token');
  }
  const payload = JSON.parse(base64UrlDecode(body)) as PontJwtPayload;
  if (!payload.sub || typeof payload.admin !== 'boolean' || typeof payload.exp !== 'number') {
    throw new Error('Invalid token');
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
}
