import { generateTsid } from '@flowcatalyst/sdk';
import { ScopeStore } from '../scope/scope-store.js';
import { metrics } from '../measurements/prometheus.js';
import type { Notice, CreateNotice } from './notice.js';
import type { NoticeRepository } from './notice-repository.js';

export interface NoticeService {
  capture(notice: CreateNotice): Promise<void>;
}

export interface NoticeServiceOptions {
  readonly repository: NoticeRepository;
  readonly onEmitEvent?: (notice: Notice) => Promise<void>;
}

export function createNoticeService(options: NoticeServiceOptions): NoticeService {
  return {
    async capture(input: CreateNotice): Promise<void> {
      const scope = ScopeStore.require();

      const notice: Notice = {
        id: generateTsid(),
        message: input.message,
        level: input.level,
        code: input.code,
        aggregateType: input.aggregateType ?? null,
        aggregateId: input.aggregateId ?? null,
        metadata: input.metadata ?? null,
        correlationId: scope.correlationId,
        principalId: scope.principalId,
        tenantId: scope.tenant?.tenantId ?? null,
        emitEvent: input.emitEvent ?? false,
        capturedAt: new Date(),
      };

      await options.repository.save(notice);

      metrics.noticesCaptured.inc({ level: notice.level });

      if (notice.emitEvent && options.onEmitEvent) {
        await options.onEmitEvent(notice);
      }
    },
  };
}
