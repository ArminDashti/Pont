import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Patch,
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
  type LogFilterOptions,
  type RequestLogQuery,
  type RequestLogRecord,
  type RequestStats,
  type SessionConversation,
  type SessionLogSummary,
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

  @Get('me/gateway-key/reveal')
  revealOwnGatewayKey(@Req() req: Request): { gatewayApiKey: string } {
    const { username } = this.auth.assertUser(req.headers.authorization);
    return { gatewayApiKey: this.users.getGatewayKey(username) };
  }

  @Post('me/gateway-key/rotate')
  async rotateOwnKey(@Req() req: Request): Promise<{ gatewayApiKey: string; prefix: string }> {
    const { username } = this.auth.assertUser(req.headers.authorization);
    return this.users.rotateGatewayKey(username);
  }

  @Patch('me/preferences')
  async patchPreferences(@Req() req: Request): Promise<UserRecord> {
    const { username } = this.auth.assertUser(req.headers.authorization);
    return this.users.updatePreferences(username, await readJsonBody(req));
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
    @Query('user') user?: string,
    @Query('providerModel') providerModel?: string,
    @Query('status') status?: string,
    @Query('session') session?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): { items: RequestLogRecord[]; total: number } {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    return this.requestLogs.listPrompts(this.logQuery(req, { app, limit, offset, user, providerModel, status, session, from, to }));
  }

  @Get('logs/prompts')
  listLogPrompts(
    @Req() req: Request,
    @Query('app') app?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('user') user?: string,
    @Query('providerModel') providerModel?: string,
    @Query('status') status?: string,
    @Query('session') session?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): { items: RequestLogRecord[]; total: number } {
    this.auth.assertUser(req.headers.authorization);
    return this.requestLogs.listPrompts(this.logQuery(req, { app, limit, offset, user, providerModel, status, session, from, to }));
  }

  @Get('logs/sessions')
  listLogSessions(
    @Req() req: Request,
    @Query('app') app?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('user') user?: string,
    @Query('providerModel') providerModel?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): { items: SessionLogSummary[]; total: number } {
    this.auth.assertUser(req.headers.authorization);
    return this.requestLogs.listSessions(this.logQuery(req, { app, limit, offset, user, providerModel, status, from, to }));
  }

  @Get('logs/sessions/:sessionId')
  logSessionDetail(@Req() req: Request, @Param('sessionId') sessionId: string): SessionConversation {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    const conversation = this.requestLogs.getSessionConversation(
      sessionId.trim(),
      admin ? undefined : username,
    );
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    return conversation;
  }

  @Get('logs/prompts/:id')
  logPromptDetail(@Req() req: Request, @Param('id') id: string): RequestLogRecord {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    const row = this.requestLogs.getPrompt(Number(id), admin ? undefined : username);
    if (!row) {
      throw new NotFoundException('Log entry not found');
    }
    return row;
  }

  @Get('logs/filter-options')
  logFilterOptions(@Req() req: Request): LogFilterOptions {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    return this.requestLogs.filterOptions(admin ? undefined : username);
  }

  @Delete('logs/:id')
  deleteLogPrompt(@Req() req: Request, @Param('id') id: string): { id: number } {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    const ok = this.requestLogs.deletePrompt(Number(id), admin ? undefined : username);
    if (!ok) {
      throw new NotFoundException('Log entry not found');
    }
    return { id: Number(id) };
  }

  @Delete('logs/sessions/:sessionId')
  deleteLogSession(@Req() req: Request, @Param('sessionId') sessionId: string): { sessionId: string; deleted: number } {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    const deleted = this.requestLogs.deleteSession(sessionId.trim(), admin ? undefined : username);
    if (deleted === 0) {
      throw new NotFoundException('Session not found');
    }
    return { sessionId: sessionId.trim(), deleted };
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
    this.auth.assertUser(req.headers.authorization);
    return { models: await this.modelsCatalog.listCatalog() };
  }

  @Get('models/eligibility')
  async listGatewayModelEligibility(
    @Req() req: Request,
  ): Promise<{ explicit: boolean; models: EligibleModelRow[] }> {
    this.auth.assertAdmin(req.headers.authorization);
    const catalog = await this.buildPontModelCatalog();
    return this.eligibleModels.gatewayEligibility(catalog);
  }

  @Put('models/eligibility')
  async setGatewayModelEligibility(@Req() req: Request): Promise<{ enabled: string[] }> {
    this.auth.assertAdmin(req.headers.authorization);
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
    return { enabled: this.eligibleModels.setEnabled(enabled) };
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

  private logQuery(
    req: Request,
    params: {
      app?: string;
      limit?: string;
      offset?: string;
      user?: string;
      providerModel?: string;
      status?: string;
      session?: string;
      from?: string;
      to?: string;
    },
  ): RequestLogQuery {
    const { username, admin } = this.auth.assertUser(req.headers.authorization);
    const statusRaw = params.status?.trim();
    const statusNum = statusRaw ? Number(statusRaw) : undefined;
    const filterUser = admin ? params.user?.trim() || undefined : username;
    return {
      app: params.app?.trim() || undefined,
      username: filterUser,
      providerModel: params.providerModel?.trim() || undefined,
      status: statusNum !== undefined && Number.isFinite(statusNum) ? statusNum : undefined,
      sessionId: params.session?.trim() || undefined,
      from: params.from?.trim() || undefined,
      to: params.to?.trim() || undefined,
      limit: parseIntParam(params.limit, 50, 1, MAX_PAGE_SIZE),
      offset: parseIntParam(params.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    };
  }
}
