/**
 * HTTP boundary — one consistent response envelope, one error handler.
 *
 * Routes wrap their handler with `route(...)` so they never write a response
 * by hand and never leak internal errors. Validation goes through
 * `parseJson(req, schema)` / `parseQuery(req, schema)` — Zod failures become
 * a `ValidationError` with field details.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError, type ZodSchema } from "zod";

import { AppError, ValidationError, isAppError } from "./errors";

// --- Response envelope ---------------------------------------------------

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiOk<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: AppError): NextResponse<ApiErr> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
    },
    { status: error.status },
  );
}

// --- Validation ----------------------------------------------------------

/** Parse and validate a JSON body. Zod failures → ValidationError. */
export async function parseJson<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (cause) {
    throw new ValidationError("Request body must be valid JSON", undefined, cause);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid request body", flattenZod(parsed.error));
  }
  return parsed.data;
}

/** Parse and validate the query string. */
export function parseQuery<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
): T {
  const query: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new ValidationError("Invalid query parameters", flattenZod(parsed.error));
  }
  return parsed.data;
}

function flattenZod(err: ZodError) {
  return err.issues.map((i) => ({
    path: i.path.join("."),
    code: i.code,
    message: i.message,
  }));
}

// --- Route wrapper -------------------------------------------------------

type Handler<Ctx> = (
  req: NextRequest,
  ctx: Ctx,
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a route handler with the standard error boundary.
 *
 *   export const POST = route(async (req) => {
 *     const body = await parseJson(req, CreateInvoiceSchema);
 *     ...
 *     return ok(invoice, { status: 201 });
 *   });
 */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      // Known, typed errors — safe to expose.
      if (isAppError(err)) {
        if (err.status >= 500) reportInternalError(err, req);
        return fail(err);
      }
      // Zod errors that escaped a parse* call.
      if (err instanceof ZodError) {
        return fail(new ValidationError("Invalid input", flattenZod(err)));
      }
      // Everything else: never leak it. Generic 500, full detail to Sentry.
      reportInternalError(err, req);
      return fail(
        new AppError("Something went wrong on our end. Please try again.", {
          status: 500,
          code: "INTERNAL_ERROR",
        }),
      );
    }
  };
}

/** Hook for Sentry (decided in DECISIONS.md). Wire up when @sentry/nextjs is
 *  installed — until then, surface in the server log so nothing is silent. */
function reportInternalError(err: unknown, req: NextRequest) {
  // TODO: replace with Sentry.captureException(err, { extra: { url, method } })
  // once @sentry/nextjs is installed and configured.
  // eslint-disable-next-line no-console
  console.error("[astrabill] unhandled error", {
    url: req.nextUrl.pathname,
    method: req.method,
    err,
  });
}
