import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ProviderProxyService } from './provider-proxy.service.js';

/** One endpoint for every provider: the model prefix (`openrouter-…`, `opencode-…`) picks the upstream. */
@Controller('api/v1')
export class UnifiedGatewayController {
  constructor(private readonly proxy: ProviderProxyService) {}

  @Get('models')
  async models(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.proxyUnifiedModels(req, res);
  }

  @Post('chat/completions')
  async chatCompletions(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.proxyRoutedCompletion(req, res, 'chat/completions');
  }

  @Post('responses')
  async responses(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.proxyRoutedCompletion(req, res, 'responses');
  }

  @Post('messages')
  async messages(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.proxyRoutedCompletion(req, res, 'messages');
  }
}
