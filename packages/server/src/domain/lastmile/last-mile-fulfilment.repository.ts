import type { TransactionContext } from '../../infrastructure/transaction.js';
import type { LastMileFulfilmentId, TenantId } from './ids.js';
import type { LastMileFulfilment } from './last-mile-fulfilment.js';

export interface LastMileFulfilmentRepository {
  persist(
    aggregate: LastMileFulfilment,
    tx?: TransactionContext,
  ): Promise<LastMileFulfilment>;

  delete(
    aggregate: LastMileFulfilment,
    tx?: TransactionContext,
  ): Promise<boolean>;

  findById(
    tenantId: TenantId,
    id: LastMileFulfilmentId,
  ): Promise<LastMileFulfilment | null>;

  /**
   * Returns the active (non-terminated) fulfilment for the given upstream
   * source note, if any. Used by the Create use case to enforce the
   * one-active-fulfilment-per-source-note invariant.
   */
  findActiveBySourceNote(
    tenantId: TenantId,
    sourceNoteSystem: string,
    sourceNoteType: string,
    sourceNoteNumber: string,
  ): Promise<LastMileFulfilment | null>;
}
