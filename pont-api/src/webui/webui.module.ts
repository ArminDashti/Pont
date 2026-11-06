import { Module } from '@nestjs/common';

import { WebuiController } from './webui.controller.js';

@Module({
  controllers: [WebuiController],
})
export class WebuiModule {}
