import {
  Registry,
  Histogram,
  Counter,
  type HistogramConfiguration,
  type CounterConfiguration,
} from 'prom-client';

const registry = new Registry();

const httpDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
} satisfies HistogramConfiguration<'method' | 'route' | 'status_code'>);

const slaBreach = new Counter({
  name: 'sla_breach_total',
  help: 'Total number of SLA breaches per route',
  labelNames: ['route'] as const,
  registers: [registry],
} satisfies CounterConfiguration<'route'>);

const jobDuration = new Histogram({
  name: 'job_duration_ms',
  help: 'Job execution duration in milliseconds',
  labelNames: ['job_name'] as const,
  buckets: [100, 500, 1000, 5000, 10000, 30000, 60000],
  registers: [registry],
} satisfies HistogramConfiguration<'job_name'>);

const cacheOperation = new Counter({
  name: 'cache_operations_total',
  help: 'Total cache operations',
  labelNames: ['store', 'operation'] as const,
  registers: [registry],
} satisfies CounterConfiguration<'store' | 'operation'>);

const noticesCaptured = new Counter({
  name: 'notices_captured_total',
  help: 'Total notices captured',
  labelNames: ['level'] as const,
  registers: [registry],
} satisfies CounterConfiguration<'level'>);

export const metrics = {
  httpDuration,
  slaBreach,
  jobDuration,
  cacheOperation,
  noticesCaptured,
} as const;

export function getMetricsRegistry(): Registry {
  return registry;
}
