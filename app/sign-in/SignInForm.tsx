"use client";
/**
 * Two equal entry doors: Google one-tap and WhatsApp OTP.
 * State machine: choose → (phone | google-redirect); phone → enter-phone → enter-code.
 */
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import posthog from "posthog-js";

type Mode = "choose" | "phone";
type PhoneStep = "enter-phone" | "enter-code";

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  fontSize: "1rem",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
};

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#111",
  color: "#fff",
  borderColor: "#111",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  fontSize: "1rem",
  borderRadius: 8,
  border: "1px solid #ddd",
  marginBottom: "0.75rem",
};

export function SignInForm() {
  const [mode, setMode] = useState<Mode>("choose");
  const [step, setStep] = useState<PhoneStep>("enter-phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (mode === "choose") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <button
          type="button"
          style={primaryBtnStyle}
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          Continue with Google
        </button>
        <div
          style={{
            textAlign: "center",
            color: "#999",
            fontSize: "0.875rem",
            margin: "0.25rem 0",
          }}
        >
          or
        </div>
        <button
          type="button"
          style={btnStyle}
          onClick={() => setMode("phone")}
        >
          Continue with phone
        </button>
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
        callbackUrl: "/",
      });
      if (!res || res.error) throw new Error("Invalid or expired code");
      posthog.capture("sign_in_completed", { method: "whatsapp_otp" });
      // Always go home on success — NextAuth's `res.url` echoes the
      // initiating page (/sign-in) when redirect:false, not the callback.
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return step === "enter-phone" ? (
    <form onSubmit={requestCode}>
      <label
        htmlFor="phone"
        style={{
          display: "block",
          fontSize: "0.875rem",
          marginBottom: "0.5rem",
        }}
      >
        Phone number
      </label>
      <input
        id="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="9876543210"
        required
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={busy || phone.replace(/\D/g, "").length < 10}
        style={primaryBtnStyle}
      >
        {busy ? "Sending…" : "Send code on WhatsApp"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode("choose");
          setError(null);
        }}
        style={{ ...btnStyle, marginTop: "0.5rem" }}
      >
        Back
      </button>
      {error && (
        <p style={{ color: "#c00", marginTop: "0.75rem" }}>{error}</p>
      )}
    </form>
  ) : (
    <form onSubmit={verifyCode}>
      <label
        htmlFor="code"
        style={{
          display: "block",
          fontSize: "0.875rem",
          marginBottom: "0.5rem",
        }}
      >
        Enter the 6-digit code from WhatsApp
      </label>
      <input
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
        style={{ ...inputStyle, letterSpacing: "0.3em", textAlign: "center" }}
      />
      <button
        type="submit"
        disabled={busy || code.length !== 6}
        style={primaryBtnStyle}
      >
        {busy ? "Verifying…" : "Verify"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("enter-phone");
          setCode("");
          setError(null);
        }}
        style={{ ...btnStyle, marginTop: "0.5rem" }}
      >
        Change number
      </button>
      {error && (
        <p style={{ color: "#c00", marginTop: "0.75rem" }}>{error}</p>
      )}
    </form>
  );
}
