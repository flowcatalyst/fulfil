export interface MeasurementContext {
  readonly startedAt: Date;
  finish(): { readonly durationMs: number };
}

export function createMeasurementContext(): MeasurementContext {
  const startedAt = new Date();
  return {
    startedAt,
    finish() {
      return { durationMs: Date.now() - startedAt.getTime() };
    },
  };
}
