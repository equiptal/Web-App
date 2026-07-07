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
      <h2 className="mb-[6px] text-center text-[26px] font-extrabold tracking-[-.5px] text-navy">{title ?? a.signInTitle}</h2>
      <p className="mb-[24px] text-center text-[14px] leading-[1.55] text-muted">{subtitle ?? a.signInSub}</p>

      <label className="mb-[8px] block text-[12.5px] font-bold text-navy-mid">{a.emailLabel}</label>
      <input
        className="h-[50px] w-full rounded-[10px] border border-border bg-surface px-[14px] text-[15px] font-semibold text-navy outline-0 placeholder:font-medium placeholder:text-[#9BB3C8] focus:border-brand focus:shadow-[0_0_0_3px_rgba(247,144,9,.12)]"
        type="email"
        dir="ltr"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
      />
      {emailErr && <p className="mt-[8px] text-[13px] font-semibold text-danger">{a.emailInvalid}</p>}

      {err && (
        <div className="mt-[10px]">
          <p className="text-[13px] font-semibold text-danger">{a.errors[err]}</p>
          {err === "email_ambiguous" && onUsePhone && (
            <button type="button" onClick={onUsePhone} className="mt-[6px] inline-flex items-center gap-1.5 text-[13px] font-bold text-info">
              <Icon name="smartphone" size={16} /> {a.withPhone}
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="mt-[24px] flex w-full items-center justify-center gap-[7px] rounded-[10px] border border-brand bg-brand px-[24px] py-[13px] text-[14.5px] font-bold text-white transition hover:brightness-[1.04] disabled:opacity-50"
      >
        <span>{busy ? a.sending : a.sendCode}</span>
        {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
      </button>

      <div className="mt-[22px] text-center text-[13px] leading-[1.55] text-muted">{a.signInFoot}</div>
    </form>
  );
}
