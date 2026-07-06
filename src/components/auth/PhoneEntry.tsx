"use client";

import { useEffect, useState, type FormEvent } from "react";
import { postAuth, type AuthKind, type OtpChannel } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SAUDI_DIAL = "+966";

// Dial codes offered on public web (KSA default + GCC + common expat origins). SMS delivery is
// Saudi-only, so any other country forces Email (W-1). Extend freely — the force-Email rule keys off
// the dial code, not this list's contents.
const COUNTRY_CODES: { dial: string; flag: string; label: string }[] = [
  { dial: "+966", flag: "🇸🇦", label: "Saudi Arabia" },
  { dial: "+971", flag: "🇦🇪", label: "United Arab Emirates" },
  { dial: "+973", flag: "🇧🇭", label: "Bahrain" },
  { dial: "+965", flag: "🇰🇼", label: "Kuwait" },
  { dial: "+968", flag: "🇴🇲", label: "Oman" },
  { dial: "+974", flag: "🇶🇦", label: "Qatar" },
  { dial: "+20", flag: "🇪🇬", label: "Egypt" },
  { dial: "+962", flag: "🇯🇴", label: "Jordan" },
  { dial: "+91", flag: "🇮🇳", label: "India" },
  { dial: "+92", flag: "🇵🇰", label: "Pakistan" },
  { dial: "+63", flag: "🇵🇭", label: "Philippines" },
  { dial: "+1", flag: "🇺🇸", label: "United States" },
  { dial: "+44", flag: "🇬🇧", label: "United Kingdom" },
];

/**
 * Phone-entry screen (AC-01/02/15/24), matching the prototype's login `form-inner`. `+966` default.
 * Phone is ALWAYS the account identity. On public web (flag on) email is a required account field too
 * (collected here, persisted at login) and the renter picks the code-delivery channel — SMS or Email.
 * SMS is Saudi-only: a non-Saudi country code (W-1) forces Email and shows a notice. On submit it
 * requests a code and advances to the code screen (carrying the channel so Resend uses it too).
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
  const [dial, setDial] = useState(SAUDI_DIAL);
  const [method, setMethod] = useState<"SMS" | "EMAIL">("SMS");
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);

  const isSaudi = dial === SAUDI_DIAL;
  // W-1: SMS is Saudi-only → a non-Saudi number forces Email delivery (the SMS toggle is disabled).
  useEffect(() => {
    if (PUBLIC_WEB_ENABLED && !isSaudi) setMethod("EMAIL");
  }, [isSaudi]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedEmail = email.trim();
    // Public web: email is a required ACCOUNT field, ALWAYS collected (persisted at login) regardless
    // of the delivery channel. Legacy/prod (flag off): SMS-only, no email field.
    if (PUBLIC_WEB_ENABLED && !EMAIL_RE.test(trimmedEmail)) {
      setEmailErr(true);
      return;
    }
    setEmailErr(false);
    setBusy(true);
    // Non-Saudi can never use SMS (Saudi-only) — force Email regardless of the toggle state.
    const effectiveMethod: "SMS" | "EMAIL" = PUBLIC_WEB_ENABLED && !isSaudi ? "EMAIL" : method;
    const phone = `${dial}${digits.replace(/\D/g, "")}`;
    const channel: OtpChannel = effectiveMethod === "EMAIL" ? { method: "EMAIL", email: trimmedEmail } : { method: "SMS" };
    // Send otpEmail on EVERY public-web login so the backend persists it as the account email (Case A);
    // otpMethod only chooses where the code is delivered. countryCode carries the dial (E.164).
    const r = await postAuth("/api/auth/request-code", {
      phone,
      countryCode: dial,
      otpMethod: channel.method,
      otpEmail: PUBLIC_WEB_ENABLED ? trimmedEmail : channel.email,
    });
    setBusy(false);
    if (r.ok) onCodeSent(phone, channel);
    else setErr(r.kind);
  };

  const segBtn = (m: "SMS" | "EMAIL", icon: string, label: string, disabled = false) => (
    <button
      type="button"
      onClick={() => !disabled && setMethod(m)}
      disabled={disabled}
      aria-pressed={method === m}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-2 text-[13px] font-bold transition ${
        disabled ? "cursor-not-allowed opacity-40" : method === m ? "bg-surface text-navy shadow-[0_1px_2px_rgba(28,53,80,.12)]" : "text-navy-mid"
      }`}
    >
      <Icon name={icon} size={16} /> {label}
    </button>
  );

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="mb-[6px] text-[26px] font-extrabold tracking-[-.5px] text-navy">{title ?? a.signInTitle}</h2>
      <p className="mb-[24px] text-[14px] leading-[1.55] text-muted">{subtitle ?? a.signInSub}</p>

      <label className="mb-[8px] block text-[12.5px] font-bold text-navy-mid">
        {a.phoneLabel} {PUBLIC_WEB_ENABLED && <span className="text-danger">*</span>}
      </label>
      <div className="flex gap-[10px]" dir="ltr">
        {PUBLIC_WEB_ENABLED ? (
          // Public web: a country-code selector (W-1). Legacy/prod keeps the fixed +966 chip below.
          <select
            aria-label={a.countryLabel}
            value={dial}
            onChange={(e) => setDial(e.target.value)}
            className="h-[50px] rounded-[10px] border border-border bg-surface px-[10px] text-[14.5px] font-bold text-navy outline-0 focus:border-brand focus:shadow-[0_0_0_3px_rgba(247,144,9,.12)]"
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.dial} value={c.dial}>{c.flag} {c.dial}</option>
            ))}
          </select>
        ) : (
          <div className="flex h-[50px] items-center gap-[6px] whitespace-nowrap rounded-[10px] border border-border bg-surface px-[14px] text-[14.5px] font-bold text-navy">
            <span className="text-[17px]">🇸🇦</span> +966
          </div>
        )}
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

      {/* Public web: email is ALWAYS required (the account is filed under the phone; email is captured
          here too and persisted at login). Legacy/prod (flag off): SMS-only, no email field. */}
      {PUBLIC_WEB_ENABLED && (
        <div className="mt-[14px]">
          <label className="mb-[8px] block text-[12.5px] font-bold text-navy-mid">
            {a.emailLabel} <span className="text-danger">*</span>
          </label>
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

      {/* Delivery-channel toggle (T5) — public-web epic only. Chooses WHERE the code is sent; it does
          NOT change whether email is collected (email is required above either way). */}
      {PUBLIC_WEB_ENABLED && (
        <div className="mt-[18px]">
          <label className="mb-[8px] block text-[12.5px] font-bold text-navy-mid">{a.deliveryLabel}</label>
          <div className="grid grid-cols-2 gap-[6px] rounded-[10px] border border-border bg-surface2 p-[4px]">
            {segBtn("SMS", "sms", a.viaSms, !isSaudi)}
            {segBtn("EMAIL", "mail", a.viaEmail)}
          </div>
          {/* W-1: SMS is Saudi-only — a non-Saudi number is forced to Email, with a notice. */}
          {!isSaudi && <p className="mt-[8px] text-[12px] leading-[1.5] text-warn">{a.smsSaudiOnly}</p>}
        </div>
      )}

      {err && <p className="mt-[10px] text-[13px] font-semibold text-danger">{a.errors[err]}</p>}

      <button
        type="submit"
        disabled={busy || !digits.trim() || (PUBLIC_WEB_ENABLED && !email.trim())}
        className="mt-[24px] flex w-full items-center justify-center gap-[7px] rounded-[10px] border border-brand bg-brand px-[24px] py-[13px] text-[14.5px] font-bold text-white transition hover:brightness-[1.04] disabled:opacity-50"
      >
        <span>{busy ? a.sending : a.sendCode}</span>
        {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
      </button>

      <div className="mt-[22px] text-center text-[13px] leading-[1.55] text-muted">{a.signInFoot}</div>
    </form>
  );
}
