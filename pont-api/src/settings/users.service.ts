import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  gatewayKeyPrefix,
  generateGatewayApiKey,
  hashGatewayApiKey,
  verifyGatewayApiKey,
} from '../auth/gateway-api-key.js';
import { isJsonObject } from '../http/read-json-body.js';
import { SettingsRepository } from '../store/settings.repository.js';
import { type UserRecord, UsersRepository } from '../store/users.repository.js';
import { UserModelsRepository } from '../store/user-models.repository.js';
import { hashPassword, verifyPassword } from './password.js';

const TEXT_FIELDS = ['email', 'firstName', 'lastName'] as const;
const FLAG_FIELDS = ['enabled', 'admin'] as const;
const MAX_TEXT_LENGTH = 200;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const unknownUserHash = hashPassword(`unknown-${Math.random()}`);

export interface CreateUserResult {
  user: UserRecord;
  gatewayApiKey: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly userModels: UserModelsRepository,
    private readonly settings: SettingsRepository,
  ) {}

  list(): UserRecord[] {
    return this.users.list();
  }

  find(username: string): UserRecord | undefined {
    return this.users.findByUsername(username);
  }

  async create(body: unknown): Promise<CreateUserResult> {
    if (!isJsonObject(body)) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const username = this.parseUsername(body.username);
    if (this.users.findByUsername(username)) {
      throw new ConflictException(`User "${username}" already exists`);
    }
    const record = this.parseRecord(username, body);
    const passwordHash = await hashPassword(this.requirePassword(body.password));
    const gatewayApiKey = generateGatewayApiKey();
    const keyHash = hashGatewayApiKey(gatewayApiKey);
    const prefix = gatewayKeyPrefix(gatewayApiKey);
    this.users.insert(record, passwordHash, keyHash, prefix);
    this.storeGatewayKeySecret(username, gatewayApiKey);
    return { user: record, gatewayApiKey };
  }

  async update(username: string, body: unknown): Promise<UserRecord> {
    if (!isJsonObject(body)) {
      throw new BadRequestException('Body must be a JSON object');
    }
    const existing = this.users.findByUsername(username);
    if (!existing) {
      throw new NotFoundException(`Unknown user "${username}"`);
    }
    const record = this.parseRecord(existing.username, body);
    const rawPassword = body.password;
    const newPasswordHash =
      rawPassword === undefined || rawPassword === ''
        ? undefined
        : await hashPassword(this.requirePassword(rawPassword));
    this.users.update(record);
    if (newPasswordHash !== undefined) {
      this.users.setPasswordHash(existing.username, newPasswordHash);
    }
    return record;
  }

  delete(username: string): void {
    if (!this.users.findByUsername(username)) {
      throw new NotFoundException(`Unknown user "${username}"`);
    }
    this.userModels.deleteForUser(username);
    this.settings.delete(this.gatewayKeyStorageKey(username));
    this.users.delete(username);
  }

  async authenticateLogin(username: string, password: string): Promise<UserRecord> {
    const user = this.users.findByUsername(username);
    const storedHash = this.users.findPasswordHash(username);
    const passwordOk = await verifyPassword(password, storedHash ?? (await unknownUserHash));
    if (!user || !storedHash || !passwordOk || !user.enabled) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return user;
  }

  async rotateGatewayKey(username: string): Promise<{ gatewayApiKey: string; prefix: string }> {
    const user = this.users.findByUsername(username);
    if (!user) {
      throw new NotFoundException(`Unknown user "${username}"`);
    }
    const gatewayApiKey = generateGatewayApiKey();
    const keyHash = hashGatewayApiKey(gatewayApiKey);
    const prefix = gatewayKeyPrefix(gatewayApiKey);
    this.users.setGatewayKey(username, keyHash, prefix);
    this.storeGatewayKeySecret(username, gatewayApiKey);
    return { gatewayApiKey, prefix };
  }

  getGatewayKey(username: string): string {
    const user = this.users.findByUsername(username);
    if (!user) {
      throw new NotFoundException(`Unknown user "${username}"`);
    }
    const key = this.settings.get(this.gatewayKeyStorageKey(username));
    if (!key) {
      throw new NotFoundException(`Gateway key for "${username}" is not stored; rotate to issue a new key.`);
    }
    return key;
  }

  resolveUsernameFromGatewayKey(key: string): string | undefined {
    const hash = hashGatewayApiKey(key);
    const username = this.users.findUsernameByGatewayKeyHash(hash);
    if (!username) {
      return undefined;
    }
    const stored = this.users.findGatewayKeyHash(username);
    if (!stored || !verifyGatewayApiKey(key, stored)) {
      return undefined;
    }
    const user = this.users.findByUsername(username);
    if (!user?.enabled) {
      return undefined;
    }
    return username;
  }

  private gatewayKeyStorageKey(username: string): string {
    return `user.${username}.gatewayApiKey`;
  }

  private storeGatewayKeySecret(username: string, gatewayApiKey: string): void {
    this.settings.set(this.gatewayKeyStorageKey(username), gatewayApiKey);
  }

  private parseUsername(raw: unknown): string {
    const username = typeof raw === 'string' ? raw.trim() : '';
    if (!username || username.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(`"username" must be 1-${MAX_TEXT_LENGTH} characters`);
    }
    return username;
  }

  private requirePassword(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length < MIN_PASSWORD_LENGTH || raw.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(`"password" must be ${MIN_PASSWORD_LENGTH}-${MAX_TEXT_LENGTH} characters`);
    }
    return raw;
  }

  private parseRecord(username: string, body: Record<string, unknown>): UserRecord {
    for (const field of TEXT_FIELDS) {
      const value = body[field];
      if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
        throw new BadRequestException(`"${field}" must be a string up to ${MAX_TEXT_LENGTH} characters`);
      }
    }
    for (const field of FLAG_FIELDS) {
      if (typeof body[field] !== 'boolean') {
        throw new BadRequestException(`"${field}" must be a boolean`);
      }
    }
    const email = (body.email as string).trim();
    if (email && !EMAIL_PATTERN.test(email)) {
      throw new BadRequestException('"email" must be a valid email address');
    }
    const existing = this.users.findByUsername(username);
    return {
      username,
      email,
      firstName: (body.firstName as string).trim(),
      lastName: (body.lastName as string).trim(),
      enabled: body.enabled as boolean,
      admin: body.admin as boolean,
      gatewayApiKeyPrefix: existing?.gatewayApiKeyPrefix ?? '',
    };
  }
}
