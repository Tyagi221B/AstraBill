"use client";
/**
 * Two equal entry doors: Google one-tap and WhatsApp OTP.
 * State machine: choose → (phone | google-redirect); phone → enter-phone → enter-code.
 */
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import posthog from "posthog-js";

import { GoogleIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "choose" | "phone";
type PhoneStep = "enter-phone" | "enter-code";

export function SignInForm() {
  const [mode, setMode] = useState<Mode>("choose");
  const [step, setStep] = useState<PhoneStep>("enter-phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (mode === "choose") {
    return (
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="w-full gap-3"
        >
          <GoogleIcon className="size-5" />
          Continue with Google
        </Button>
        <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
          <span aria-hidden className="h-px flex-1 bg-border" />
          or
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setMode("phone")}
          className="w-full gap-3"
        >
          <WhatsAppIcon className="size-5" />
          Continue with phone
        </Button>
      </div>
    );
  }

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { sent: boolean } }
        | { ok: false; error: { message: string } };
      if (!json.ok) throw new Error(json.error.message);
      setStep("enter-code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("credentials", {
        phone,
        code,
        redirect: false,
        callbackUrl: "/dashboard",
      });
      if (!res || res.error) throw new Error("Invalid or expired code");
      posthog.capture("sign_in_completed", { method: "whatsapp_otp" });
      // Straight to the dashboard on success — NextAuth's `res.url` echoes
      // the initiating page (/sign-in) when redirect:false, not the callback.
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return step === "enter-phone" ? (
    <form onSubmit={requestCode} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="9876543210"
          required
          autoFocus
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy || phone.replace(/\D/g, "").length < 10}
        className="w-full"
      >
        {busy ? "Sending…" : "Send code on WhatsApp"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={() => {
          setMode("choose");
          setError(null);
        }}
        className="w-full"
      >
        Back
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  ) : (
    <form onSubmit={verifyCode} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Enter the 6-digit code from WhatsApp</Label>
        <Input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          required
          autoFocus
          className="text-center tracking-[0.4em]"
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy || code.length !== 6}
        className="w-full"
      >
        {busy ? "Verifying…" : "Verify"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={() => {
          setStep("enter-phone");
          setCode("");
          setError(null);
        }}
        className="w-full"
      >
        Change number
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
