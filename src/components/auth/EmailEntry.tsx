"use client";

import { useState, type FormEvent } from "react";
import { postAuth, type AuthKind, type OtpChannel } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Modal 1 — email-identity entry (the Email tab). Email is a soft-unique alias, not the account
 * identity: the backend finds the account by email and sends a code. A NEW email → the code step gets
 * `needsSignup` and routes to Modal 2 (add phone). If the email is on >1 account the backend returns
 * `email_ambiguous` → we show the notice + a "use phone" switch (`onUsePhone`).
 */
export function EmailEntry({
  onCodeSent,
  onUsePhone,
  title,
  subtitle,
}: {
  onCodeSent: (email: string, channel: OtpChannel) => void;
  /** email_ambiguous → offer to switch Modal 1 to the Phone tab. */
  onUsePhone?: () => void;
  title?: string;
  subtitle?: string;
}) {
  const t = useT();
  const a = t.auth;
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!EMAIL_RE.test(v)) {
      setEmailErr(true);
      return;
    }
    setEmailErr(false);
    setErr(null);
    setBusy(true);
    const r = await postAuth("/api/auth/request-code", { otpEmail: v, otpMethod: "EMAIL" });
    setBusy(false);
    if (r.ok) onCodeSent(v, { method: "EMAIL", email: v });
    else setErr(r.kind);
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="mb-2 text-center text-display font-extrabold tracking-[-.5px] text-navy">{title ?? a.signInTitle}</h2>
      <p className="mb-6 text-center text-body leading-[1.55] text-muted">{subtitle ?? a.signInSub}</p>

      <label className="mb-2 block text-meta font-semibold text-navy-mid">{a.emailLabel}</label>
      <input
        className="h-[50px] w-full rounded-sm border border-border bg-surface px-4 text-subhead font-semibold text-navy outline-0 placeholder:font-semibold placeholder:text-muted-light focus:border-brand"
        type="email"
        dir="ltr"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
      />
      {emailErr && <p className="mt-2 text-body font-semibold text-danger">{a.emailInvalid}</p>}

      {err && (
        <div className="mt-3">
          {/* `invalid_phone` here is the backend's generic VALIDATION_ERROR — nonsensical on the email
              tab, so show an email-appropriate message. Both it and ambiguous offer the phone fallback. */}
          <p className="text-body font-semibold text-danger">{err === "invalid_phone" ? a.emailSignInUnavailable : a.errors[err]}</p>
          {(err === "email_ambiguous" || err === "invalid_phone") && onUsePhone && (
            <button type="button" onClick={onUsePhone} className="mt-2 inline-flex items-center gap-1.5 text-body font-semibold text-info">
              <Icon name="smartphone" size={16} /> {a.withPhone}
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm border border-brand bg-brand px-6 py-3 text-subhead font-extrabold text-white transition disabled:bg-disabled-bg disabled:text-disabled-fg"
      >
        <span>{busy ? a.sending : a.sendCode}</span>
        {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
      </button>

      <div className="mt-6 text-center text-body leading-[1.55] text-muted">{a.signInFoot}</div>
    </form>
  );
}
