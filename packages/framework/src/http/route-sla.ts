export interface RouteSlaOptions {
  readonly thresholdMs: number;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    sla?: RouteSlaOptions;
  }
}
