"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { postAuth, type AuthKind } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { RestoreAccountPrompt } from "./RestoreAccountPrompt";
import type { RenterUser } from "@/lib/contract/auth";
import { authSubmit, type AuthTone } from "@/components/auth/AuthPanel";

const OTP_FONT: React.CSSProperties = { fontFamily: "var(--font-plex), monospace" };

/**
 * Code-entry screen (AC-02/09/10/11/12/13/15/24) — identity-agnostic. The caller passes the identity to
 * verify/resend against (`{ phone }` or `{ otpEmail }`) and a `dest` label for the "sent to" line.
 * Verify branches on the response: an email-first NEW user comes back with `needsSignup` (no session) →
 * `onNeedsSignup`; a SELF-DELETED account comes back with `accountDeleted` → the restore prompt gates
 * the hand-off (the session is held, not adopted, until they restore); otherwise a session is set →
 * `onVerified(user, storedEmail)` (storedEmail feeds W-1).
 * 4-box input with filled state, resend (no cooldown — AC-12), and back (AC-13).
 */
export function CodeEntry({
  dest,
  verifyPayload,
  resendPayload,
  onVerified,
  onNeedsSignup,
  onEditNumber,
  verifyLabel,
  tone = "light",
}: {
  dest: string;
  verifyPayload: Record<string, unknown>;
  resendPayload: Record<string, unknown>;
  onVerified: (user: RenterUser, storedEmail: string | null) => void;
  onNeedsSignup?: (onboardingToken: string, email: string | null) => void;
  onEditNumber: () => void;
  /** Override the verify button label (e.g. "Verify & create account" for the Modal-2 phone-add). */
  verifyLabel?: string;
  /** `dark` is the auth modal's navy panel (owner's comp, 2026-08-30). The Modal-2 inline verify
   *  stays `light` — it sits inside the ordinary white profile form. */
  tone?: AuthTone;
}) {
  const t = useT();
  const a = t.auth;
  const dark = tone === "dark";
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [boxes, setBoxes] = useState(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);
  const [resent, setResent] = useState(false);
  // Verified, but the account is self-deleted: the identity is held here (NOT handed to `onVerified`,
  // which would adopt the session) until the renter restores or signs out.
  const [deleted, setDeleted] = useState<{ user: RenterUser; storedEmail: string | null } | null>(null);

  const code = boxes.join("");
  const [sentPre, sentPost] = a.codeSentTo.split("{phone}");

  const setBox = (i: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setBoxes((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < 3) inputs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !boxes[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!text) return;
    e.preventDefault();
    setBoxes([0, 1, 2, 3].map((i) => text[i] ?? ""));
    inputs.current[Math.min(text.length, 3)]?.focus();
  };

  /**
   * **WebOTP — the browser reads the SMS itself** (Chrome on Android; a no-op everywhere else).
   *
   * `autoComplete="one-time-code"` above is the iOS half: Safari offers the code above the keyboard.
   * It is all the web had, and on Android it does nothing, which is why an Arabic-speaking renter was
   * opening the Messages app and copying the code by hand. The app hit the same wall from the other
   * side and fixed the message (`b1fa5297`, "Arabic OTP SMS format for iOS autofill").
   *
   * ⚠️ **Inert until the SMS carries the binding line.** WebOTP only fires for a message whose LAST
   * line is `@<origin-host> #<code>` — e.g. `@moedatech.net #1234`. Without it the promise simply
   * never resolves, which is why this is safe to ship first and costs nothing if the message never
   * changes. It is also why `autoComplete` stays: the two mechanisms are independent.
   *
   * Aborted on unmount, so leaving the screen does not leave a live SMS listener behind.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: ac.signal } as CredentialRequestOptions)
      .then((cred) => {
        const otp = (cred as { code?: string } | null)?.code?.replace(/\D/g, "").slice(0, 4);
        if (!otp) return;
        setBoxes([0, 1, 2, 3].map((i) => otp[i] ?? ""));
        inputs.current[Math.min(otp.length, 3)]?.focus();
      })
      .catch(() => {
        /* aborted, dismissed, or unsupported — the renter types it, exactly as before */
      });
    return () => ac.abort();
  }, []);

  const resetBoxes = () => {
    setBoxes(["", "", "", ""]);
    inputs.current[0]?.focus();
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setResent(false);
    setBusy(true);
    const r = await postAuth("/api/auth/verify", { ...verifyPayload, code });
    setBusy(false);
    if (r.ok) {
      if (r.data.needsSignup) {
        onNeedsSignup?.(String(r.data.onboardingToken ?? ""), typeof r.data.email === "string" ? r.data.email : null);
        return;
      }
      const storedEmail = typeof r.data.storedEmail === "string" ? r.data.storedEmail : null;
      // Deleted account → gate on restore before the session is adopted.
      if (r.data.accountDeleted === true) {
        setDeleted({ user: r.data.user as RenterUser, storedEmail });
        return;
      }
      onVerified(r.data.user as RenterUser, storedEmail);
      return;
    }
    setErr(r.kind);
    if (r.kind === "invalid_code") resetBoxes(); // AC-09: let them re-enter
  };

  const resend = async () => {
    setErr(null);
    setResent(false);
    const r = await postAuth("/api/auth/resend", resendPayload); // AC-12: no cooldown; same identity
    if (r.ok) {
      setResent(true);
      resetBoxes();
    } else {
      setErr(r.kind);
    }
  };

  // Restore gate — replaces the code form once a deleted account has verified.
  if (deleted) {
    return (
      <RestoreAccountPrompt
        onRestored={() => onVerified(deleted.user, deleted.storedEmail)}
        onDeclined={() => {
          setDeleted(null);
          resetBoxes();
          onEditNumber(); // cookies already cleared — back to the identity step
        }}
      />
    );
  }

  return (
    <form onSubmit={verify} noValidate>
      <button
        type="button"
        onClick={onEditNumber}
        className={`mb-5 inline-flex items-center gap-1 text-body font-semibold ${dark ? "text-white/60 hover:text-white" : "text-muted"}`}
      >
        <Icon name="arrow_back" size={18} className="rtl:-scale-x-100" />
        {a.back}
      </button>

      <h2 className={`mb-2 text-display font-extrabold capitalize tracking-[-.5px] ${dark ? "text-white" : "text-navy"}`}>{a.codeTitle}</h2>
      <p className={`mb-7 text-body leading-[1.55] ${dark ? "text-white/60" : "text-muted"}`}>
        {sentPre}
        <b className={dark ? "text-white" : "text-navy"} dir="ltr">{dest}</b>
        {sentPost}
      </p>

      <div className="grid grid-cols-4 gap-3" dir="ltr">
        {boxes.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={d}
            onChange={(e) => setBox(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            aria-label={`Digit ${i + 1}`}
            style={OTP_FONT}
            className={
              dark
                ? `h-[60px] w-full rounded-md border-[1.5px] bg-white/[0.07] text-center text-display font-semibold text-white outline-0 transition focus:border-white/50 ${
                    d ? "border-white/45" : "border-white/15"
                  }`
                : `h-[60px] w-full rounded-md border-[1.5px] text-center text-display font-semibold text-navy outline-0 focus:border-brand ${
                    d ? "border-brand bg-brand-soft" : "border-border bg-surface"
                  }`
            }
          />
        ))}
      </div>

      {err && <p className="mt-3 text-body font-semibold text-danger">{a.errors[err]}</p>}
      {resent && !err && <p className="mt-3 text-body font-semibold text-ok">{a.resent}</p>}

      <button
        type="submit"
        disabled={busy || code.length < 4}
        className={authSubmit(tone)}
      >
        {!busy && <Icon name="check" size={18} />}
        <span>{busy ? a.verifying : verifyLabel ?? a.verify}</span>
      </button>

      <div className={`mt-6 text-center text-body ${dark ? "text-white/55" : "text-muted"}`}>
        <button type="button" onClick={resend} className={`font-semibold ${dark ? "text-white underline underline-offset-4" : "text-info"}`}>
          {a.resend}
        </button>
      </div>
    </form>
  );
}
