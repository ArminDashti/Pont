import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ProviderRegistry } from '../providers/provider-registry.service.js';
import { ProviderProxyService } from './provider-proxy.service.js';

const OPENCODE_GO_ID = 'opencode-go';

/** Legacy OpenCode Go paths (`/zen/go/v1/...`) kept so existing clients (nanobot, nanobrowser, Open WebUI) keep working. */
@Controller()
export class OpencodeGoLegacyController {
  constructor(
    private readonly proxy: ProviderProxyService,
    private readonly registry: ProviderRegistry,
  ) {}

  @Get('zen/go/v1/models')
  async models(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.proxyModels(req, res, this.registry.get(OPENCODE_GO_ID));
  }

  @Post('zen/go/v1/chat/completions')
  async chatCompletions(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.proxyCompletion(req, res, this.registry.get(OPENCODE_GO_ID), 'chat/completions');
  }

  @Post('zen/go/v1/responses')
  async responses(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.proxyCompletion(req, res, this.registry.get(OPENCODE_GO_ID), 'responses');
  }

  @Post('zen/go/v1/messages')
  async messages(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.proxyCompletion(req, res, this.registry.get(OPENCODE_GO_ID), 'messages');
  }
}
