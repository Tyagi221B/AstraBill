/**
 * Typed application errors — the single source of truth for failure modes.
 *
 * Services and repositories throw these. The route wrapper in lib/http.ts
 * catches them and produces a consistent HTTP response. Generic `Error`s
 * (anything not extending `AppError`) become a 500 and are reported to Sentry.
 */

/** Base class. `status` is the HTTP status; `code` is a stable string clients
 *  can branch on (don't branch on `message` — that's for humans). */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  /** Optional structured detail — e.g. Zod field errors. Safe to expose. */
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", cause?: unknown) {
    super(message, { status: 401, code: "UNAUTHORIZED", cause });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have permission to perform this action",
    cause?: unknown,
  ) {
    super(message, { status: 403, code: "FORBIDDEN", cause });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", cause?: unknown) {
    super(message, { status: 404, code: "NOT_FOUND", cause });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", cause?: unknown) {
    super(message, { status: 409, code: "CONFLICT", cause });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input", details?: unknown, cause?: unknown) {
    super(message, { status: 422, code: "VALIDATION_ERROR", details, cause });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests", cause?: unknown) {
    super(message, { status: 429, code: "RATE_LIMITED", cause });
  }
}

/** Plan-limit hit (e.g. free plan, 20 invoices/month used). */
export class PlanLimitError extends AppError {
  constructor(message = "Your plan's limit has been reached", details?: unknown) {
    super(message, { status: 402, code: "PLAN_LIMIT", details });
  }
}

/** Programmer error / invariant break — should never reach a client. */
export class InternalError extends AppError {
  constructor(message = "Internal error", cause?: unknown) {
    super(message, { status: 500, code: "INTERNAL_ERROR", cause });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
