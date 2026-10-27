import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { ProviderProxyService } from './provider-proxy.service.js';

/** OpenAI- and Anthropic-style gateway routes for every catalog provider: `/<provider>/v1/...`. */
@Controller(':providerId/v1')
export class ProviderGatewayController {
  constructor(
    private readonly proxy: ProviderProxyService,
    private readonly registry: ProviderRegistry,
  ) {}

  @Get('models')
  async models(@Req() req: Request, @Res() res: Response, @Param('providerId') providerId: string): Promise<void> {
    await this.proxy.proxyModels(req, res, this.registry.get(providerId));
  }

  @Post('chat/completions')
  async chatCompletions(@Req() req: Request, @Res() res: Response, @Param('providerId') providerId: string): Promise<void> {
    await this.proxy.proxyCompletion(req, res, this.registry.get(providerId), 'chat/completions');
  }

  @Post('responses')
  async responses(@Req() req: Request, @Res() res: Response, @Param('providerId') providerId: string): Promise<void> {
    await this.proxy.proxyCompletion(req, res, this.registry.get(providerId), 'responses');
  }

  @Post('messages')
  async messages(@Req() req: Request, @Res() res: Response, @Param('providerId') providerId: string): Promise<void> {
    await this.proxy.proxyCompletion(req, res, this.registry.get(providerId), 'messages');
  }
}
