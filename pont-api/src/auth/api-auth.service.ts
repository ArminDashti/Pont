import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type PontConfig, pontConfigKey } from '../config/pont.config.js';
import { type PontJwtPayload, issueJwt, verifyJwt } from './jwt.js';
import { parseBearerToken } from './bearer.js';
import { UsersService } from '../settings/users.service.js';
import type { UserRecord } from '../store/users.repository.js';

@Injectable()
export class ApiAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly users: UsersService,
  ) {}

  private secret(): string {
    return this.configService.getOrThrow<PontConfig>(pontConfigKey).jwtSecret;
  }

  async login(username: string, password: string): Promise<{ token: string; user: UserRecord }> {
    const user = await this.users.authenticateLogin(username, password);
    const token = issueJwt(this.secret(), user.username, user.admin);
    return { token, user };
  }

  bearerPayload(authorization: string | undefined): { username: string; admin: boolean } {
    const token = parseBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    let payload: PontJwtPayload;
    try {
      payload = verifyJwt(this.secret(), token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    // Re-read the account so a demoted or disabled user loses access before the token expires.
    const user = this.users.find(payload.sub);
    if (!user?.enabled) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return { username: user.username, admin: user.admin };
  }

  assertAdmin(authorization: string | undefined): void {
    const payload = this.bearerPayload(authorization);
    if (!payload.admin) {
      throw new UnauthorizedException('Admin access required');
    }
  }

  assertUser(authorization: string | undefined): { username: string; admin: boolean } {
    return this.bearerPayload(authorization);
  }
}
