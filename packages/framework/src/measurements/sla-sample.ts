import type { CapturedQuery } from '../scope/contexts/sql-audit-context.js';

export interface SlaSample {
  readonly route: string;
  readonly durationMs: number;
  readonly thresholdMs: number;
  readonly excessMs: number;
  readonly queries: readonly CapturedQuery[];
  readonly correlationId: string;
  readonly tenantId: string | null;
  readonly capturedAt: Date;
}

export interface SlaSampleRepository {
  save(sample: SlaSample): Promise<void>;
}
