"use server";
/**
 * Server Actions — the web-side wrapper around the users service.
 *
 * Why a Server Action AND a Route Handler (PATCH /api/users/me) for the
 * same operation: each surface has a different caller.
 *   - Route Handler — HTTP API for the future mobile app + any external
 *     integration. Public contract, JSON in/out, stable URL.
 *   - Server Action — in-process call from the web UI. Lets us use Next
 *     16's `refresh()` to re-render the layout (and the sidebar) without
 *     a client-side `router.refresh()` round-trip, and removes the need
 *     to thread fetch + JSON + error-shape parsing through the form.
 * Both are thin wrappers around the SAME `updateUserProfile` service —
 * business logic lives there, not in the wrapper. When validation rules
 * or audit semantics change, the service is the one place that updates.
 *
 * Auth: `requireUser()` reads the row from the DB (see lib/session.ts),
 * so the patch we hand to the service is always against the caller's
 * own id — there is no actor / target split in this surface.
 */
import { refresh } from "next/cache";

import { updateUserProfileSchema } from "@/lib/schemas/user";
import { updateUserProfile } from "@/lib/services/users";
import { requireUser } from "@/lib/session";

export type SaveAccountResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveAccount(
  input: unknown,
): Promise<SaveAccountResult> {
  try {
    const user = await requireUser();
    const parsed = updateUserProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    await updateUserProfile(user.id, parsed.data);
    // Refresh the client router so the layout (sidebar UserMenu) re-renders
    // against the freshly-written row. Combined with the DB-authoritative
    // `requireUser()` helper, the sidebar shows the new name / avatar
    // instantly — no JWT round-trip, no sign-out / sign-in dance.
    refresh();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save",
    };
  }
}
