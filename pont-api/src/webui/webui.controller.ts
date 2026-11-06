import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { join } from 'node:path';

import { type PontConfig, pontConfigKey } from '../config/pont.config.js';

@Controller()
export class WebuiController {
  constructor(private readonly configService: ConfigService) {}

  @Get('*')
  serve(@Res() res: Response): void {
    const config = this.configService.getOrThrow<PontConfig>(pontConfigKey);
    if (!config.webuiDist) {
      res.status(404).json({ message: 'Not Found', statusCode: 404 });
      return;
    }
    res.sendFile(join(config.webuiDist, 'index.html'));
  }
}
