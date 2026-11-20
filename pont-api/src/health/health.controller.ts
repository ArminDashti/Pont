import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health(): { ok: true; service: string } {
    return { ok: true, service: '@pont/api' };
  }
}
