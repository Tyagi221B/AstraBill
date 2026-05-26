"use client";
/**
 * AccountForm — edits the caller's own user record.
 *
 * Editable:
 *   - Display name
 *   - Avatar — user-uploaded image that overrides the OAuth picture. Upload
 *     goes straight to Cloudinary (signed pipeline at
 *     /api/uploads/user-avatar/signature); the resulting URL is stored on
 *     `users.image_override`. "Use Google picture" clears the override.
 *
 * Read-only: email + sign-in method (managed by the OAuth provider; NextAuth
 * pulls them on each sign-in).
 *
 * After save: the new values land in the `users` row via PATCH, but the
 * sidebar avatar / name don't auto-refresh in this build — the session
 * helpers still read display fields from the NextAuth JWT, which only
 * re-issues on sign-in. Owner sees the new values on the next navigation.
 * (The auto-refresh comes with the next architecture step: Server Action +
 * DB-authoritative session helpers.)
 */
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AccountInitial {
  name: string;
  email: string;
  /** OAuth-provided picture (from the sign-in provider). */
  image: string | null;
  /** User-uploaded override. When set, takes precedence over `image`. */
  imageOverride: string | null;
}

interface EditorState {
  name: string;
  imageOverride: string | null;
}

export function AccountForm({ initial }: { initial: AccountInitial }) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [saved, setSaved] = useState<EditorState>({
    name: initial.name,
    imageOverride: initial.imageOverride,
  });
  const [s, setS] = useState<EditorState>({
    name: initial.name,
    imageOverride: initial.imageOverride,
  });
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  const dirty = useMemo(
    () =>
      (s.name.trim() !== saved.name.trim() && s.name.trim() !== "") ||
      s.imageOverride !== saved.imageOverride,
    [s, saved],
  );

  /** The avatar URL to display: override wins, then OAuth picture. */
  const displayImage = s.imageOverride ?? initial.image;

  async function uploadAvatar(file: File) {
    setUploadBusy(true);
    try {
      const sigRes = await fetch("/api/uploads/user-avatar/signature", {
        method: "POST",
      });
      const sigJson = (await sigRes.json()) as
        | {
            ok: true;
            data: {
              cloudName: string;
              apiKey: string;
              timestamp: number;
              signature: string;
              assetFolder: string;
            };
          }
        | { ok: false; error: { message: string } };
      if (!sigJson.ok) throw new Error(sigJson.error.message);

      const { cloudName, apiKey, timestamp, signature, assetFolder } =
        sigJson.data;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", apiKey);
      fd.append("timestamp", String(timestamp));
      fd.append("signature", signature);
      fd.append("asset_folder", assetFolder);

      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: fd },
      );
      const upJson = (await upRes.json()) as {
        secure_url?: string;
        error?: { message?: string };
      };
      if (!upRes.ok || !upJson.secure_url) {
        throw new Error(upJson.error?.message ?? "Upload failed");
      }
      setS((prev) => ({ ...prev, imageOverride: upJson.secure_url! }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar upload failed");
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setBusy(true);
    try {
      // Send only fields that changed.
      const body: { name?: string; imageOverride?: string | null } = {};
      if (s.name.trim() !== saved.name.trim()) body.name = s.name.trim();
      if (s.imageOverride !== saved.imageOverride) {
        body.imageOverride = s.imageOverride;
      }

      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      setSaved({ name: s.name.trim(), imageOverride: s.imageOverride });
      toast.success("Account updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const initials = (s.name || initial.email)
    .split(/[\s@]+/)
    .map((part) => part[0])
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
              onClick={() => setS(saved)}
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
          <div className="flex items-start gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
              {displayImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayImage}
                  alt={s.name || initial.email}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-foreground">
                  {initials || "?"}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAvatar(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadBusy || busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="mr-1.5 h-4 w-4" />
                  {uploadBusy
                    ? "Uploading…"
                    : s.imageOverride
                      ? "Replace photo"
                      : "Upload photo"}
                </Button>
                {s.imageOverride && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploadBusy || busy}
                    onClick={() =>
                      setS((prev) => ({ ...prev, imageOverride: null }))
                    }
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    Use Google picture
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {s.imageOverride
                  ? "Custom photo — overrides your Google picture."
                  : initial.image
                    ? "Using your Google picture. Upload one to override."
                    : "Upload a photo for your profile."}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-name">Display name</Label>
              <Input
                id="account-name"
                value={s.name}
                onChange={(e) => setS((prev) => ({ ...prev, name: e.target.value }))}
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
