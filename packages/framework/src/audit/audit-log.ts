/**
 * Audit Log
 *
 * Tracks operations performed on entities. Created atomically with entity
 * changes and domain events by the UnitOfWork.
 */

export interface AuditLog {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly operation: string;
  readonly operationJson: string;
  readonly principalId: string;
  readonly performedAt: Date;
}

export interface CreateAuditLogData {
  entityType: string;
  entityId: string;
  operation: string;
  operationJson: string;
  principalId: string;
}
