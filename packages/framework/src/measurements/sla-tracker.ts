import type { Scope } from '../scope/scope.js';
import type { SlaSample } from './sla-sample.js';

export interface RouteSlaDef {
  readonly route: string;
  readonly thresholdMs: number;
  readonly windowSize?: number;
  readonly samplesToCollect?: number;
}

export interface SlaTracker {
  /**
   * Called at request start. Returns true if SQL should be captured for this route.
   */
  shouldCaptureSql(route: string): boolean;

  /**
   * Called at request end. Returns a SlaSample if one should be persisted.
   */
  record(route: string, durationMs: number, scope: Scope): SlaSample | null;
}

type TrackingMode = 'monitoring' | 'collecting';

interface RouteState {
  readonly def: Required<RouteSlaDef>;
  window: boolean[];
  windowIndex: number;
  breachCount: number;
  mode: TrackingMode;
  samplesRemaining: number;
}

export function createSlaTracker(routes: RouteSlaDef[]): SlaTracker {
  const stateMap = new Map<string, RouteState>();

  for (const route of routes) {
    const windowSize = route.windowSize ?? 50;
    stateMap.set(route.route, {
      def: {
        route: route.route,
        thresholdMs: route.thresholdMs,
        windowSize,
        samplesToCollect: route.samplesToCollect ?? 3,
      },
      window: new Array<boolean>(windowSize).fill(true),
      windowIndex: 0,
      breachCount: 0,
      mode: 'monitoring',
      samplesRemaining: 0,
    });
  }

  return {
    shouldCaptureSql(route: string): boolean {
      const state = stateMap.get(route);
      return state !== undefined && state.mode === 'collecting';
    },

    record(route: string, durationMs: number, scope: Scope): SlaSample | null {
      const state = stateMap.get(route);
      if (!state) return null;

      const breached = durationMs > state.def.thresholdMs;

      // Update circular window
      const prev = state.window[state.windowIndex];
      state.window[state.windowIndex] = !breached;
      state.windowIndex = (state.windowIndex + 1) % state.def.windowSize;

      // Update breach count based on what left and entered the window
      if (prev === false && !breached) {
        // was breach, still breach — no change
      } else if (prev === true && breached) {
        // was ok, now breach
        state.breachCount++;
      } else if (prev === false && !breached) {
        // was breach, now breach — no change (already counted)
      } else if (prev === false && breached) {
        // was breach, still breach — no change
        // breach count stays same (this slot was already a breach)
      } else if (prev === true && !breached) {
        // was ok, still ok — no change
      }
      // Recompute breach count cleanly to avoid off-by-one errors
      state.breachCount = state.window.filter((v) => !v).length;

      if (state.mode === 'monitoring') {
        const breachRate = state.breachCount / state.def.windowSize;
        if (breachRate > 0.05) {
          state.mode = 'collecting';
          state.samplesRemaining = state.def.samplesToCollect;
        }
        return null;
      }

      // collecting mode
      if (!breached) {
        // SLA met — discard SQL buffer, no sample
        scope.sqlAudit.flush();
        return null;
      }

      // SLA breached while collecting — capture sample
      const queries = scope.sqlAudit.flush();
      state.samplesRemaining--;
      if (state.samplesRemaining <= 0) {
        state.mode = 'monitoring';
      }

      return {
        route,
        durationMs,
        thresholdMs: state.def.thresholdMs,
        excessMs: durationMs - state.def.thresholdMs,
        queries,
        correlationId: scope.correlationId,
        tenantId: scope.tenant?.tenantId ?? null,
        capturedAt: new Date(),
      };
    },
  };
}
