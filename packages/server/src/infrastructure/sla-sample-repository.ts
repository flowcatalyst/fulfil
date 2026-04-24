import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { generateTsid } from '@flowcatalyst/sdk';
import type { SlaSampleRepository, SlaSample } from '@fulfil/framework';
import { slaSamples, type NewSlaSample } from './schema/sla-samples.js';

export function createDrizzleSlaSampleRepository(
  db: PostgresJsDatabase,
): SlaSampleRepository {
  return {
    async save(sample: SlaSample): Promise<void> {
      const row: NewSlaSample = {
        id: generateTsid(),
        route: sample.route,
        durationMs: sample.durationMs,
        thresholdMs: sample.thresholdMs,
        excessMs: sample.excessMs,
        queries: sample.queries as unknown as Record<string, unknown>[],
        correlationId: sample.correlationId,
        tenantId: sample.tenantId ?? undefined,
        capturedAt: sample.capturedAt,
      };
      await db.insert(slaSamples).values(row);
    },
  };
}
