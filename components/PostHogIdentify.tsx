"use client";
/**
 * Idempotent PostHog `identify` for the signed-in user.
 *
 * Mounted from the root layout when there's a session. Calling `identify`
 * with the same distinct_id repeatedly is cheap — PostHog dedupes on its
 * end — so re-running on every layout render is fine. Reset happens in
 * SignOutButton.
 */
import { useEffect } from "react";
import posthog from "posthog-js";

export function PostHogIdentify({
  userId,
  email,
  name,
}: {
  userId: string;
  email?: string | null;
  name?: string | null;
}) {
  useEffect(() => {
    const properties: Record<string, string> = {};
    if (email) properties.email = email;
    if (name) properties.name = name;
    posthog.identify(userId, properties);
  }, [userId, email, name]);

  return null;
}
