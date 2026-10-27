import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module.js';
import { type PontConfig, pontConfigKey } from './config/pont.config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService).getOrThrow<PontConfig>(pontConfigKey);
  app.enableCors({
    origin: config.webuiOrigin,
    credentials: true,
  });
  await app.listen(config.port);
  console.log(`@pont/api listening on http://localhost:${config.port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
