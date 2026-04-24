import type { Logger } from 'drizzle-orm';
import { ScopeStore } from '../scope/scope-store.js';

export class ScopeAwareDrizzleLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    const scope = ScopeStore.get();
    if (scope?.sqlAudit.isCapturing) {
      scope.sqlAudit.record({ sql: query, params, capturedAt: new Date() });
    }
  }
}
