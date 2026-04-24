import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { generateTsid } from '@flowcatalyst/sdk';
import type { NoticeRepository, Notice } from '@fulfil/framework';
import { notices, type NewNotice } from './schema/notices.js';

export function createDrizzleNoticeRepository(
  db: PostgresJsDatabase,
): NoticeRepository {
  return {
    async save(notice: Notice): Promise<void> {
      const row: NewNotice = {
        id: generateTsid(),
        message: notice.message,
        level: notice.level,
        code: notice.code,
        aggregateType: notice.aggregateType ?? undefined,
        aggregateId: notice.aggregateId ?? undefined,
        metadata: notice.metadata ?? undefined,
        correlationId: notice.correlationId,
        principalId: notice.principalId,
        tenantId: notice.tenantId ?? undefined,
        emitEvent: notice.emitEvent,
        capturedAt: notice.capturedAt,
      };
      await db.insert(notices).values(row);
    },
  };
}
