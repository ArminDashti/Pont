import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { filter, map, Observable } from 'rxjs';

import { ApiAuthService } from '../auth/api-auth.service.js';
import { isJsonObject, readJsonBody } from '../http/read-json-body.js';
import { type ProviderDefinition, type ProviderId } from '../providers/provider-definitions.js';
import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { ProviderTestService, type ProviderTestResult } from '../providers/provider-test.service.js';
import { EligibleModelsService, type EligibleModelRow } from '../settings/eligible-models.service.js';
import { ModelsCatalogService } from '../settings/models-catalog.service.js';
import type { CatalogModelRow } from '../models/upstream-model-catalog.js';
import { ProviderKeysService, type ProviderKeyStatus } from '../settings/provider-keys.service.js';
import { UsersService, type CreateUserResult } from '../settings/users.service.js';
import { RequestEventsService } from '../store/request-events.service.js';
import { VpnStatusService, type VpnStatus } from '../vpn/vpn-status.service.js';
import {
  RequestLogRepository,
  type RequestLogRecord,
  type RequestStats,
} from '../store/request-log.repository.js';
import type { UserRecord } from '../store/users.repository.js';

const STATS_WINDOW_HOURS = 24;
const MAX_PAGE_SIZE = 200;

function parseIntParam(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (raw === undefined || !Number.isInteger(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

@Controller('api')
export class ApiController {
  constructor(
    private readonly auth: ApiAuthService,
    private readonly requestLogs: RequestLogRepository,
    private readonly requestEvents: RequestEventsService,
    private readonly providerKeys: ProviderKeysService,
    private readonly users: UsersService,
    private readonly registry: ProviderRegistry,
    private readonly providerTests: ProviderTestService,
    private readonly eligibleModels: EligibleModelsService,
    private readonly modelsCatalog: ModelsCatalogService,
    private readonly vpn: VpnStatusService,
  ) {}

  @Post('login')
  async login(@Req() req: Request): Promise<{ token: string; user: UserRecord }> {
    const body = await readJsonBody(req);
    if (!isJsonObject(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
      throw new BadRequestException('Body must include string "username" and "password"');
    }
    return this.auth.login(body.username, body.password);
  }

  @Get('me')
  me(@Req() req: Request): UserRecord {
    const { username } = this.auth.assertUser(req.headers.authorization);
    const user = this.users.find(username);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  @Get('me/gateway-key')
  gatewayKeyMasked(@Req() req: Request): { prefix: string } {
    const { username } = this.auth.assertUser(req.headers.authorization);
    const user = this.users.find(username);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return { prefix: user.gatewayApiKeyPrefix || 'pont_…' };
  }

  @Post('me/gateway-key/rotate')
  async rotateOwnKey(@Req() req: Request): Promise<{ gatewayApiKey: string; prefix: string }> {
    const { username } = this.auth.assertUser(req.headers.authorization);
    return this.users.rotateGatewayKey(username);
  }

  @Get('users')
  listUsers(@Req() req: Request): UserRecord[] {
    this.auth.assertAdmin(req.headers.authorization);
    return this.users.list();
  }

  @Post('users')
  async createUser(@Req() req: Request): Promise<CreateUserResult> {
    this.auth.assertAdmin(req.headers.authorization);
    return this.users.create(await readJsonBody(req));
  }

  @Put('users/:username')
  async updateUser(@Req() req: Request, @Param('username') username: string): Promise<UserRecord> {
    this.auth.assertAdmin(req.headers.authorization);
    return this.users.update(username, await readJsonBody(req));
  }

  @Delete('users/:username')
  deleteUser(@Req() req: Request, @Param('username') username: string): { username: string } {
    this.auth.assertAdmin(req.headers.authorization);
    this.users.delete(username);
    return { username };
  }

  @Get('users/:username/gateway-key')
  revealUserKey(@Req() req: Request, @Param('username') username: string): { gatewayApiKey: string } {
    this.auth.assertAdmin(req.headers.authorization);
    return { gatewayApiKey: this.users.getGatewayKey(username) };
  }

  @Post('users/:username/gateway-key/rotate')
  async rotateUserKey(
    @Req() req: Request,
    @Param('username') username: string,
  ): Promise<{ gatewayApiKey: string; prefix: string }> {
    this.auth.assertAdmin(req.headers.authorization);
    return this.users.rotateGatewayKey(username);
  }

  @Get('logs')
  logs(
    @Req() req: Request,
    @Query('app') app?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): { items: RequestLogRecord[]; total: number } {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    return this.requestLogs.list({
      app: app?.trim() || undefined,
      username: admin ? undefined : username,
      limit: parseIntParam(limit, 50, 1, MAX_PAGE_SIZE),
      offset: parseIntParam(offset, 0, 0, Number.MAX_SAFE_INTEGER),
    });
  }

  @Get('stats')
  stats(@Req() req: Request): RequestStats {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    return this.requestLogs.stats(STATS_WINDOW_HOURS, admin ? undefined : username);
  }

  @Get('vpn/status')
  vpnStatus(@Req() req: Request, @Query('refresh') refresh?: string): Promise<VpnStatus> {
    this.auth.assertUser(req.headers.authorization);
    return this.vpn.status(refresh === '1');
  }

  @Sse('events')
  events(@Req() req: Request): Observable<MessageEvent> {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    return this.requestEvents.stream().pipe(
      filter((record) => admin || record.username === username),
      map((record) => ({ data: record })),
    );
  }

  @Get('providers')
  listProviders(@Req() req: Request): ProviderKeyStatus[] {
    this.auth.assertAdmin(req.headers.authorization);
    return this.providerKeys.listStatus();
  }

  @Put('providers/:id')
  async setProviderKey(@Req() req: Request, @Param('id') id: string): Promise<ProviderKeyStatus> {
    this.auth.assertAdmin(req.headers.authorization);
    const body = await readJsonBody(req);
    if (!isJsonObject(body) || typeof body.apiKey !== 'string') {
      throw new BadRequestException('Body must include string "apiKey" (empty string clears the key)');
    }
    return this.providerKeys.setKey(id, body.apiKey);
  }

  @Get('providers/catalog')
  listProviderCatalog(@Req() req: Request): ProviderDefinition[] {
    this.auth.assertAdmin(req.headers.authorization);
    return this.registry.list();
  }

  @Get('providers/:id/models')
  async listProviderModels(@Req() req: Request, @Param('id') id: string): Promise<{ models: string[] }> {
    this.auth.assertAdmin(req.headers.authorization);
    return { models: await this.providerTests.listModels(id) };
  }

  @Post('providers/:id/test')
  async testProviderChat(@Req() req: Request, @Param('id') id: string): Promise<ProviderTestResult> {
    this.auth.assertAdmin(req.headers.authorization);
    return this.providerTests.testChat(id, await this.optionalModel(req));
  }

  @Get('models')
  async listModelsCatalog(@Req() req: Request): Promise<{ models: CatalogModelRow[] }> {
    const { username } = this.auth.assertUser(req.headers.authorization);
    const catalog = await this.modelsCatalog.listCatalog();
    return {
      models: catalog.filter((row) => this.eligibleModels.isEnabledForUser(username, row.id)),
    };
  }

  private async buildPontModelCatalog(): Promise<Array<{ id: string; providerId: ProviderId }>> {
    const catalog: Array<{ id: string; providerId: ProviderId }> = [];
    for (const provider of this.registry.list()) {
      if (!this.providerKeys.getKey(provider.id)) {
        continue;
      }
      try {
        const ids = await this.providerTests.listModels(provider.id);
        for (const id of ids) {
          catalog.push({ id, providerId: provider.id });
        }
      } catch {
        // skip providers that cannot list models right now
      }
    }
    catalog.sort((a, b) => a.id.localeCompare(b.id));
    return catalog;
  }

  @Get('users/:username/models')
  async listUserModels(
    @Req() req: Request,
    @Param('username') username: string,
  ): Promise<{ customized: boolean; models: EligibleModelRow[] }> {
    this.auth.assertAdmin(req.headers.authorization);
    if (!this.users.find(username)) {
      throw new NotFoundException(`Unknown user "${username}"`);
    }
    const catalog = await this.buildPontModelCatalog();
    return {
      customized: this.eligibleModels.userAssignmentCustomized(username),
      models: this.eligibleModels.rowsForUserCatalog(username, catalog),
    };
  }

  @Put('users/:username/models')
  async setUserModels(@Req() req: Request, @Param('username') username: string): Promise<{ enabled: string[] }> {
    this.auth.assertAdmin(req.headers.authorization);
    if (!this.users.find(username)) {
      throw new NotFoundException(`Unknown user "${username}"`);
    }
    const body = await readJsonBody(req);
    if (!isJsonObject(body) || !Array.isArray(body.enabled)) {
      throw new BadRequestException('Body must include array "enabled" of Pont model ids');
    }
    const enabled: string[] = [];
    for (const item of body.enabled) {
      if (typeof item !== 'string') {
        throw new BadRequestException('Each entry in "enabled" must be a string model id');
      }
      enabled.push(item);
    }
    return { enabled: this.eligibleModels.setUserEnabled(username, enabled) };
  }

  private async optionalModel(req: Request): Promise<string | undefined> {
    const body = await readJsonBody(req);
    if (body === undefined) {
      return undefined;
    }
    if (!isJsonObject(body) || (body.model !== undefined && typeof body.model !== 'string')) {
      throw new BadRequestException('Body may include a string "model"');
    }
    return typeof body.model === 'string' ? body.model : undefined;
  }
}
