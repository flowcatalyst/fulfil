export interface CapturedQuery {
  readonly sql: string;
  readonly params: unknown[];
  readonly capturedAt: Date;
}

export interface SqlAuditContext {
  readonly isCapturing: boolean;
  record(query: CapturedQuery): void;
  flush(): readonly CapturedQuery[];
}

function capturing(): SqlAuditContext {
  const buffer: CapturedQuery[] = [];
  return {
    isCapturing: true,
    record(query: CapturedQuery): void {
      buffer.push(query);
    },
    flush(): readonly CapturedQuery[] {
      return buffer.splice(0, buffer.length);
    },
  };
}

function inactive(): SqlAuditContext {
  return {
    isCapturing: false,
    record(_query: CapturedQuery): void {
      // no-op
    },
    flush(): readonly CapturedQuery[] {
      return [];
    },
  };
}

export const SqlAuditContext = { capturing, inactive } as const;
