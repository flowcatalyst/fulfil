/**
 * FlowCatalyst inbound-webhook HMAC verification.
 *
 * Mirrors the Laravel SDK's `WebhookValidator` scheme so the same signing
 * secret works across both clients:
 *   message       = `${timestamp}${rawBody}`
 *   signature     = hmac_sha256(message, secret), hex-encoded
 *   headers       = X-FlowCatalyst-Signature, X-FlowCatalyst-Timestamp
 *   tolerance     = 300s past, 60s future (replay protection)
 *   comparison    = constant-time
 *
 * Plugged onto the reactor route plugin via `flowcatalystWebhookAuthHook` so
 * every `/reactors/*` request is verified before the route handler runs.
 *
 * Dev mode: when no signing secret is configured, the hook logs a one-time
 * warning per request and skips verification — so local dev + tests don't
 * need a secret. NEVER deploy without setting `FLOWCATALYST_SIGNING_SECRET`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Augment FastifyRequest to expose the raw body string captured by the
// content-type parser registered in server.ts.
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export const FC_SIGNATURE_HEADER = 'x-flowcatalyst-signature';
export const FC_TIMESTAMP_HEADER = 'x-flowcatalyst-timestamp';

export interface VerifyOptions {
  /** Max age of the signed timestamp in seconds. Default 300 (5 min). */
  readonly toleranceSeconds?: number;
  /** Grace window for clock skew in the future. Default 60s. */
  readonly futureGraceSeconds?: number;
  /** Override `Date.now()` for testing. */
  readonly nowSeconds?: () => number;
}

export type VerifyResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code:
        | 'MISSING_SIGNATURE'
        | 'MISSING_TIMESTAMP'
        | 'TIMESTAMP_INVALID'
        | 'TIMESTAMP_EXPIRED'
        | 'TIMESTAMP_FUTURE'
        | 'SIGNATURE_MISMATCH';
      readonly message: string;
    };

/**
 * Pure HMAC verification. Returns a `VerifyResult` discriminated union so
 * the caller (Fastify hook, tests, etc.) decides how to respond.
 *
 * Constant-time comparison uses `timingSafeEqual` on equal-length buffers.
 */
export function verifyFlowCatalystSignature(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
  options?: VerifyOptions,
): VerifyResult {
  if (!signature) {
    return {
      ok: false,
      code: 'MISSING_SIGNATURE',
      message: 'Missing X-FlowCatalyst-Signature header.',
    };
  }
  if (!timestamp) {
    return {
      ok: false,
      code: 'MISSING_TIMESTAMP',
      message: 'Missing X-FlowCatalyst-Timestamp header.',
    };
  }

  const webhookSeconds = Number(timestamp);
  if (!Number.isFinite(webhookSeconds)) {
    return {
      ok: false,
      code: 'TIMESTAMP_INVALID',
      message: `X-FlowCatalyst-Timestamp '${timestamp}' is not a valid number.`,
    };
  }

  const tolerance = options?.toleranceSeconds ?? 300;
  const futureGrace = options?.futureGraceSeconds ?? 60;
  const now = options?.nowSeconds?.() ?? Math.floor(Date.now() / 1000);

  if (webhookSeconds < now - tolerance) {
    return {
      ok: false,
      code: 'TIMESTAMP_EXPIRED',
      message: `Webhook timestamp is older than ${tolerance}s.`,
    };
  }
  if (webhookSeconds > now + futureGrace) {
    return {
      ok: false,
      code: 'TIMESTAMP_FUTURE',
      message: `Webhook timestamp is more than ${futureGrace}s in the future.`,
    };
  }

  const message = `${timestamp}${rawBody}`;
  const expected = createHmac('sha256', secret).update(message).digest('hex');

  // Buffer.compare requires equal lengths — short-circuit length mismatch
  // before timingSafeEqual so it never throws.
  if (expected.length !== signature.length) {
    return {
      ok: false,
      code: 'SIGNATURE_MISMATCH',
      message: 'Webhook signature does not match.',
    };
  }
  const matches = timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8'),
  );
  if (!matches) {
    return {
      ok: false,
      code: 'SIGNATURE_MISMATCH',
      message: 'Webhook signature does not match.',
    };
  }

  return { ok: true };
}

export interface WebhookAuthHookOptions {
  /** Shared secret from `FLOWCATALYST_SIGNING_SECRET`. When undefined, the hook skips verification (dev mode). */
  readonly signingSecret: string | undefined;
  /** Override defaults for tolerance / clock skew (mainly for tests). */
  readonly verifyOptions?: VerifyOptions;
}

/**
 * Build a Fastify `preHandler` hook that verifies the FlowCatalyst HMAC
 * signature on the request before the route handler runs.
 *
 * The hook expects `request.rawBody` to be populated by the content-type
 * parser registered in `server.ts`. If the raw body is missing (parser not
 * registered or non-JSON content), it 415s.
 *
 * Use inside a plugin scope (the reactor plugin) so it only applies to
 * webhook routes — public routes don't get the verification penalty.
 */
export function flowcatalystWebhookAuthHook(options: WebhookAuthHookOptions) {
  return async function authHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!options.signingSecret) {
      request.log.warn(
        { route: request.routeOptions?.url },
        'FLOWCATALYST_SIGNING_SECRET is not set — accepting webhook unverified (DEV ONLY).',
      );
      return;
    }

    if (request.rawBody === undefined) {
      await reply.code(415).send({
        error: {
          type: 'ValidationError',
          code: 'RAW_BODY_UNAVAILABLE',
          message:
            'Webhook signature verification requires a raw JSON body — register the raw-body content-type parser before this plugin.',
        },
      });
      return;
    }

    const result = verifyFlowCatalystSignature(
      request.rawBody,
      readHeader(request.headers[FC_SIGNATURE_HEADER]),
      readHeader(request.headers[FC_TIMESTAMP_HEADER]),
      options.signingSecret,
      options.verifyOptions,
    );

    if (!result.ok) {
      request.log.warn(
        { code: result.code, route: request.routeOptions?.url },
        'FlowCatalyst webhook signature verification failed',
      );
      await reply.code(401).send({
        error: {
          type: 'AuthorizationError',
          code: result.code,
          message: result.message,
        },
      });
      return;
    }
  };
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
