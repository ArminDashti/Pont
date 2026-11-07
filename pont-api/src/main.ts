import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import { existsSync } from 'node:fs';

import { AppModule } from './app.module.js';
import { type PontConfig, pontConfigKey } from './config/pont.config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService).getOrThrow<PontConfig>(pontConfigKey);
  if (config.webuiDist) {
    if (existsSync(config.webuiDist)) {
      app.use(express.static(config.webuiDist));
    } else {
      console.warn(`PONT_WEBUI_DIST is set but ${config.webuiDist} does not exist`);
    }
  }
  app.enableCors({
    origin: config.webuiOrigin,
    credentials: true,
  });
  app.set('trust proxy', 1);
  await app.listen(config.port);
  console.log(`@pont/api listening on http://localhost:${config.port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
