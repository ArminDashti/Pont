import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import type { RequestLogRecord } from './request-log.repository.js';

/** In-process fan-out of completed requests to live-monitoring subscribers. */
@Injectable()
export class RequestEventsService {
  private readonly subject = new Subject<RequestLogRecord>();

  publish(record: RequestLogRecord): void {
    this.subject.next(record);
  }

  stream(): Observable<RequestLogRecord> {
    return this.subject.asObservable();
  }
}
