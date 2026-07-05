"use client";

import { useState, type FormEvent } from "react";
import { postAuth, type AuthKind, type OtpChannel } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Phone-entry screen (AC-01/02/15/24), matching the prototype's login `form-inner`. `+966` preset.
 * The renter picks the OTP delivery channel — Text (SMS, default) or Email; the phone is ALWAYS the
 * account identity, and choosing Email reveals a destination-email field (T5, delivery-only). On submit
 * it requests a code over the chosen channel and advances to the code screen (carrying the channel so
 * Resend uses it too).
 */
export function PhoneEntry({
  onCodeSent,
  title,
  subtitle,
}: {
  onCodeSent: (phone: string, channel: OtpChannel) => void;
  title?: string;
  subtitle?: string;
}) {
  const t = useT();
  const a = t.auth;
  const [digits, setDigits] = useState("");
  const [method, setMethod] = useState<"SMS" | "EMAIL">("SMS");
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedEmail = email.trim();
    if (method === "EMAIL" && !EMAIL_RE.test(trimmedEmail)) {
      setEmailErr(true);
      return;
    }
    setEmailErr(false);
    setBusy(true);
    const phone = `+966${digits.replace(/\D/g, "")}`;
    const channel: OtpChannel = method === "EMAIL" ? { method: "EMAIL", email: trimmedEmail } : { method: "SMS" };
    const r = await postAuth("/api/auth/request-code", { phone, otpMethod: channel.method, otpEmail: channel.email });
    setBusy(false);
    if (r.ok) onCodeSent(phone, channel);
    else setErr(r.kind);
  };

  const segBtn = (m: "SMS" | "EMAIL", icon: string, label: string) => (
    <button
      type="button"
      onClick={() => setMethod(m)}
      aria-pressed={method === m}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-2 text-[13px] font-bold transition ${
        method === m ? "bg-surface text-navy shadow-[0_1px_2px_rgba(28,53,80,.12)]" : "text-navy-mid"
      }`}
    >
      <Icon name={icon} size={16} /> {label}
    </button>
  );

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="mb-[6px] text-[26px] font-extrabold tracking-[-.5px] text-navy">{title ?? a.signInTitle}</h2>
      <p className="mb-[24px] text-[14px] leading-[1.55] text-muted">{subtitle ?? a.signInSub}</p>

      {/* Delivery-channel toggle (T5) — public-web epic only. When the flag is OFF (production) sign-in
          is SMS-only, exactly as prod is today (method stays "SMS", so the email field never shows). */}
      {PUBLIC_WEB_ENABLED && (
        <>
          <label className="mb-[8px] block text-[12.5px] font-bold text-navy-mid">{a.deliveryLabel}</label>
          <div className="mb-[18px] grid grid-cols-2 gap-[6px] rounded-[10px] border border-border bg-surface2 p-[4px]">
            {segBtn("SMS", "sms", a.viaSms)}
            {segBtn("EMAIL", "mail", a.viaEmail)}
          </div>
        </>
      )}

      <label className="mb-[8px] block text-[12.5px] font-bold text-navy-mid">{a.phoneLabel}</label>
      <div className="flex gap-[10px]" dir="ltr">
        <div className="flex h-[50px] items-center gap-[6px] whitespace-nowrap rounded-[10px] border border-border bg-surface px-[14px] text-[14.5px] font-bold text-navy">
          <span className="text-[17px]">🇸🇦</span> +966
        </div>
        <input
          className="h-[50px] min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-[14px] text-[15px] font-semibold text-navy outline-0 placeholder:font-medium placeholder:text-[#9BB3C8] focus:border-brand focus:shadow-[0_0_0_3px_rgba(247,144,9,.12)]"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={11}
          value={digits}
          onChange={(e) => setDigits(e.target.value)}
          placeholder={a.phonePlaceholder}
        />
      </div>

      {method === "EMAIL" && (
        <div className="mt-[14px]">
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
        </div>
      )}

      {err && <p className="mt-[10px] text-[13px] font-semibold text-danger">{a.errors[err]}</p>}

      <button
        type="submit"
        disabled={busy || !digits.trim()}
        className="mt-[24px] flex w-full items-center justify-center gap-[7px] rounded-[10px] border border-brand bg-brand px-[24px] py-[13px] text-[14.5px] font-bold text-white transition hover:brightness-[1.04] disabled:opacity-50"
      >
        <span>{busy ? a.sending : a.sendCode}</span>
        {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
      </button>

      <div className="mt-[22px] text-center text-[13px] leading-[1.55] text-muted">{a.signInFoot}</div>
    </form>
  );
}
