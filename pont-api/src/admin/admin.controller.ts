import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { catalogRowsFromModelsJson } from '../models/upstream-model-catalog.js';
import { openCodeGoUpstreamUrl } from '../opencode-go/upstream-url.js';
import { type PontConfig, pontConfigKey } from '../config/pont.config.js';
import { upstreamAuthHeaders } from '../providers/provider-auth.js';
import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { ProviderKeysService } from '../settings/provider-keys.service.js';
import { UsersService } from '../settings/users.service.js';
import { RequestLogRepository } from '../store/request-log.repository.js';
import { UserModelsRepository } from '../store/user-models.repository.js';
import { ConfigService } from '@nestjs/config';
import { AdminSessionService, readCookie } from './admin-session.service.js';

const COOKIE = 'pont_admin';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly sessions: AdminSessionService,
    private readonly users: UsersService,
    private readonly userModels: UserModelsRepository,
    private readonly logs: RequestLogRepository,
    private readonly providerKeys: ProviderKeysService,
    private readonly registry: ProviderRegistry,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() body: { username?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ username: string }> {
    const username = body?.username?.trim() ?? '';
    const password = body?.password ?? '';
    if (!username || !password) {
      throw new BadRequestException('Username and password are required');
    }
    const user = await this.users.authenticateLogin(username, password);
    if (!user.admin) {
      throw new ForbiddenException('Admin only');
    }
    const token = this.sessions.create(user.username);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
    return { username: user.username };
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): { ok: true } {
    this.sessions.destroy(readCookie(req.headers.cookie, COOKIE));
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('overview')
  overview(@Req() req: Request): {
    users: number;
    requests: number;
    providersWithKeys: number;
  } {
    this.requireAdmin(req);
    const providersWithKeys = this.providerKeys.listStatus().filter((row) => row.source !== 'none').length;
    return {
      users: this.users.list().length,
      requests: this.logs.countAll(),
      providersWithKeys,
    };
  }

  @Get('provider-keys')
  listKeys(@Req() req: Request): Array<{ id: string; label: string; source: string; maskedKey?: string }> {
    this.requireAdmin(req);
    return this.providerKeys.listStatus().map((row) => ({
      id: row.id,
      label: this.registry.get(row.id).label,
      source: row.source,
      maskedKey: row.maskedKey,
    }));
  }

  @Put('provider-keys/:id')
  setKey(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { apiKey?: string },
  ): { id: string; label: string; source: string; maskedKey?: string } {
    this.requireAdmin(req);
    if (typeof body?.apiKey !== 'string') {
      throw new BadRequestException('"apiKey" must be a string');
    }
    const status = this.providerKeys.setKey(id, body.apiKey);
    return {
      id: status.id,
      label: this.registry.get(status.id).label,
      source: status.source,
      maskedKey: status.maskedKey,
    };
  }

  @Get('models')
  async models(@Req() req: Request): Promise<{
    rows: Array<{
      provider: string;
      model: string;
      inputToken: string | null;
      inputCacheToken: string | null;
      outputToken: string | null;
      outputCacheToken: string | null;
      free: boolean;
    }>;
  }> {
    this.requireAdmin(req);
    const freeSlugs = this.providerKeys.freeModelSlugs();
    const userAgent = this.configService.getOrThrow<PontConfig>(pontConfigKey).userAgent;
    const lists = await Promise.all(
      this.registry.list().map(async (provider) => {
        const key = this.providerKeys.getKey(provider.id);
        if (!key) {
          return [];
        }
        const url =
          provider.id === 'opencode-go'
            ? openCodeGoUpstreamUrl(provider.baseUrl, 'models')
            : `${provider.baseUrl}/models`;
        const headers = upstreamAuthHeaders(provider, key);
        headers.set('User-Agent', userAgent);
        try {
          const upstream = await fetch(url, { method: 'GET', headers });
          if (!upstream.ok) {
            return [];
          }
          return catalogRowsFromModelsJson(await upstream.text(), provider.id, freeSlugs).map((row) => ({
            provider: provider.label,
            model: row.id,
            inputToken: row.inputToken,
            inputCacheToken: row.inputCacheToken,
            outputToken: row.outputToken,
            outputCacheToken: row.outputCacheToken,
            free: row.free,
          }));
        } catch {
          return [];
        }
      }),
    );
    return { rows: lists.flat() };
  }

  @Get('logs')
  listLogs(
    @Req() req: Request,
    @Query('username') username?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ): {
    total: number;
    items: Array<{
      method: 'GET' | 'POST';
      endpoint: string;
      model: string;
      username: string;
      ip: string;
      inputTokens: number;
      inputCacheTokens: number;
      outputTokens: number;
      outputCacheTokens: number;
      code: number;
      createdAt: string;
    }>;
  } {
    this.requireAdmin(req);
    const limit = Math.min(Number(limitRaw) || 100, 500);
    const offset = Number(offsetRaw) || 0;
    const page = this.logs.list({
      username: username?.trim() || undefined,
      limit,
      offset,
    });
    return {
      total: page.total,
      items: page.items.map((row) => ({
        method: row.path.endsWith('/models') ? 'GET' : 'POST',
        endpoint: row.path,
        model: row.providerModel,
        username: row.username,
        ip: row.clientIp,
        inputTokens: row.promptTokens,
        inputCacheTokens: row.inputCacheTokens,
        outputTokens: row.completionTokens,
        outputCacheTokens: row.outputCacheTokens,
        code: row.status,
        createdAt: row.createdAt,
      })),
    };
  }

  @Get('users')
  listUsers(@Req() req: Request): {
    users: Array<{
      username: string;
      fullName: string;
      email: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      enabled: boolean;
    }>;
  } {
    this.requireAdmin(req);
    const usage = new Map(this.logs.usageByUsername().map((row) => [row.username, row]));
    return {
      users: this.users.list().map((user) => {
        const stats = usage.get(user.username);
        return {
          username: user.username,
          fullName: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          calls: stats?.calls ?? 0,
          promptTokens: stats?.promptTokens ?? 0,
          completionTokens: stats?.completionTokens ?? 0,
          enabled: user.enabled,
        };
      }),
    };
  }

  @Patch('users/:username')
  setEnabled(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('username') username: string,
    @Body() body: { enabled?: boolean; username?: string; fullName?: string },
  ): { username: string; enabled: boolean; fullName: string } {
    const actor = this.requireAdmin(req);
    if (body?.username !== undefined || body?.fullName !== undefined) {
      const user = this.users.updateProfile(username, { username: body.username, fullName: body.fullName });
      if (actor === username && user.username !== username) {
        const token = this.sessions.create(user.username);
        res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
      }
      return {
        username: user.username,
        enabled: user.enabled,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
      };
    }
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('"enabled" must be a boolean');
    }
    const user = this.users.setEnabled(username, body.enabled);
    return {
      username: user.username,
      enabled: user.enabled,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
    };
  }

  @Delete('users/:username')
  removeUser(@Req() req: Request, @Param('username') username: string): { ok: true } {
    const actor = this.requireAdmin(req);
    if (actor === username) {
      throw new BadRequestException('Cannot delete the signed-in admin');
    }
    this.users.delete(username);
    return { ok: true };
  }

  @Post('users/:username/password')
  async resetPassword(
    @Req() req: Request,
    @Param('username') username: string,
    @Body() body: { password?: string },
  ): Promise<{ ok: true }> {
    this.requireAdmin(req);
    await this.users.resetPassword(username, body?.password ?? '');
    return { ok: true };
  }

  @Get('users/:username/api-key')
  revealKey(@Req() req: Request, @Param('username') username: string): { gatewayApiKey: string } {
    this.requireAdmin(req);
    return { gatewayApiKey: this.users.getGatewayKey(username) };
  }

  @Post('users/:username/api-key')
  async rotateKey(
    @Req() req: Request,
    @Param('username') username: string,
  ): Promise<{ gatewayApiKey: string }> {
    this.requireAdmin(req);
    const rotated = await this.users.rotateGatewayKey(username);
    return { gatewayApiKey: rotated.gatewayApiKey };
  }

  @Get('users/:username/models')
  userModelsList(@Req() req: Request, @Param('username') username: string): { modelIds: string[] } {
    this.requireAdmin(req);
    if (!this.users.find(username)) {
      throw new BadRequestException(`Unknown user "${username}"`);
    }
    return { modelIds: this.userModels.listModelIds(username) };
  }

  @Put('users/:username/models')
  setUserModels(
    @Req() req: Request,
    @Param('username') username: string,
    @Body() body: { modelIds?: string[] },
  ): { modelIds: string[] } {
    this.requireAdmin(req);
    if (!this.users.find(username)) {
      throw new BadRequestException(`Unknown user "${username}"`);
    }
    if (!Array.isArray(body?.modelIds) || body.modelIds.some((id) => typeof id !== 'string')) {
      throw new BadRequestException('"modelIds" must be a string array');
    }
    return { modelIds: this.userModels.setModelIds(username, body.modelIds) };
  }

  private requireAdmin(req: Request): string {
    const username = this.sessions.username(readCookie(req.headers.cookie, COOKIE));
    if (!username) {
      throw new UnauthorizedException('Sign in required');
    }
    const user = this.users.find(username);
    if (!user?.admin || !user.enabled) {
      throw new UnauthorizedException('Sign in required');
    }
    return username;
  }
}
