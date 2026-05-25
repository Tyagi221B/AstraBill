"use client";
/**
 * AccountForm — edits the caller's own user record.
 *
 * Editable: display name. Read-only (and labelled as such): email +
 * sign-in method, both of which come from the OAuth provider (Google) on
 * each sign-in and would be overwritten by NextAuth anyway. The user has
 * to update those upstream — we surface a hint pointing to the provider.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AccountInitial {
  name: string;
  email: string;
  image: string | null;
}

export function AccountForm({ initial }: { initial: AccountInitial }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial.name);
  const [name, setName] = useState(initial.name);
  const [busy, setBusy] = useState(false);

  const dirty = useMemo(
    () => name.trim() !== saved.trim() && name.trim() !== "",
    [name, saved],
  );

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      setSaved(name.trim());
      toast.success("Account updated");
      // The sidebar + dashboard read name from the JWT — refresh so the
      // RSC tree re-renders with the new value (NextAuth refreshes the
      // token on the next request).
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const initials = (initial.name || initial.email)
    .split(/[\s@]+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your personal profile — separate from any business you own or
            belong to. Changes here apply to every business you can access.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {dirty && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setName(saved)}
              disabled={busy}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={busy || !dirty}
            onClick={save}
          >
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-foreground">
              {initial.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={initial.image}
                  alt={initial.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{initials || "?"}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {initial.name || initial.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {initial.email}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-name">Display name</Label>
              <Input
                id="account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Your name"
              />
              <p className="text-xs text-muted-foreground">
                What teammates see in audit logs and what we use to greet
                you in app emails.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-email">Email</Label>
              <Input
                id="account-email"
                value={initial.email}
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Managed by your sign-in provider. To change the email on
                file, update your Google account and sign in again.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-base font-semibold">Sign-in method</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You signed in with Google. Password and two-factor settings are
            managed there.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
