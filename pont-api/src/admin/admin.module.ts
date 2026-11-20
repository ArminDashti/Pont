import { Module } from '@nestjs/common';

import { StoreModule } from '../store/store.module.js';
import { AdminController } from './admin.controller.js';
import { AdminSessionService } from './admin-session.service.js';

@Module({
  imports: [StoreModule],
  controllers: [AdminController],
  providers: [AdminSessionService],
})
export class AdminModule {}
