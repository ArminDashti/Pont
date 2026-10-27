import { beforeEach, describe, expect, it } from 'vitest';

import { GatewayDatabase } from '../store/gateway-database.js';
import { UsersRepository } from '../store/users.repository.js';
import { UsersService } from '../settings/users.service.js';
import { ApiAuthService } from './api-auth.service.js';

const SECRET = 'test-secret';
const config = {
  getOrThrow: () => ({ dbPath: ':memory:', jwtSecret: SECRET }),
};

describe('ApiAuthService', () => {
  let service: ApiAuthService;
  let users: UsersService;

  beforeEach(() => {
    const database = new GatewayDatabase(config as never);
    users = new UsersService(new UsersRepository(database));
    service = new ApiAuthService(config as never, users);
  });

  async function signIn(username: string, admin: boolean): Promise<string> {
    await users.create({
      username,
      email: '',
      firstName: '',
      lastName: '',
      enabled: true,
      admin,
      password: 'dopadopa123',
    });
    return (await service.login(username, 'dopadopa123')).token;
  }

  it('rejects admin routes for a member token', async () => {
    const token = await signIn('member', false);
    expect(() => service.assertAdmin(`Bearer ${token}`)).toThrow('Admin access required');
  });

  it('revokes admin and disabled access before the token expires', async () => {
    const token = await signIn('boss', true);
    expect(() => service.assertAdmin(`Bearer ${token}`)).not.toThrow();

    await users.update('boss', { email: '', firstName: '', lastName: '', enabled: true, admin: false });
    expect(() => service.assertAdmin(`Bearer ${token}`)).toThrow('Admin access required');

    await users.update('boss', { email: '', firstName: '', lastName: '', enabled: false, admin: false });
    expect(() => service.assertUser(`Bearer ${token}`)).toThrow('Invalid or expired token');
  });
});
