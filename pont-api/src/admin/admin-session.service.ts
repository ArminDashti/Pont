import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

const TTL_MS = 12 * 60 * 60 * 1000;

interface Session {
  username: string;
  expires: number;
}

@Injectable()
export class AdminSessionService {
  private readonly sessions = new Map<string, Session>();

  create(username: string): string {
    const token = randomBytes(24).toString('hex');
    this.sessions.set(token, { username, expires: Date.now() + TTL_MS });
    return token;
  }

  username(token: string | undefined): string | undefined {
    if (!token) {
      return undefined;
    }
    const session = this.sessions.get(token);
    if (!session) {
      return undefined;
    }
    if (session.expires < Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return session.username;
  }

  destroy(token: string | undefined): void {
    if (token) {
      this.sessions.delete(token);
    }
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}
