export type NoticeLevel = 'info' | 'warn' | 'error';

export interface Notice {
  readonly id: string;
  readonly message: string;
  readonly level: NoticeLevel;
  readonly code: string;
  readonly aggregateType: string | null;
  readonly aggregateId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly correlationId: string;
  readonly principalId: string;
  readonly tenantId: string | null;
  readonly emitEvent: boolean;
  readonly capturedAt: Date;
}

export interface CreateNotice {
  readonly message: string;
  readonly level: NoticeLevel;
  readonly code: string;
  readonly aggregateType?: string;
  readonly aggregateId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly emitEvent?: boolean;
}
