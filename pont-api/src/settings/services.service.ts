import { Injectable } from '@nestjs/common';

/** Pont does not gate client apps; kept for compatibility with gateway proxy calls. */
@Injectable()
export class ServicesService {
  assertEnabled(_app: string): void {
    // no-op
  }
}
