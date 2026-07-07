"use client";

import { useState, type FormEvent } from "react";
import { postAuth, type AuthKind, type OtpChannel } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";

export const SAUDI_DIAL = "+966";

// Dial codes offered on public web (KSA default + GCC + common expat origins). SMS is Saudi-only, so a
// non-Saudi number can't get an SMS code — the phone tab nudges those users to the Email tab. Exported
// so the Modal-2 inline phone-verify (OnboardingForm, Case 1) reuses the same list.
export const COUNTRY_CODES: { dial: string; flag: string; label: string }[] = [
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
 * Modal 1 — phone-identity entry. Phone is ALWAYS the account identity. Delivery is SMS (Saudi-only):
 * a non-Saudi country code can't receive SMS, so Send is disabled and we nudge to the Email tab
 * (`onUseEmail`). Email itself is collected later — Modal 2 for a new phone user, or the returning
 * user already has it. On submit it requests an SMS code and advances to the code screen.
 */
export function PhoneEntry({
  onCodeSent,
  onUseEmail,
  title,
  subtitle,
}: {
  onCodeSent: (phone: string, channel: OtpChannel) => void;
  /** Non-Saudi → offer to switch Modal 1 to the Email tab (SMS can't reach them). */
  onUseEmail?: () => void;
  title?: string;
  subtitle?: string;
}) {
  const t = useT();
  const a = t.auth;
  const [digits, setDigits] = useState("");
  const [dial, setDial] = useState(SAUDI_DIAL);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);

  const isSaudi = dial === SAUDI_DIAL;
  const smsBlocked = PUBLIC_WEB_ENABLED && !isSaudi; // non-Saudi can't SMS → use Email tab

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (smsBlocked) return;
    setErr(null);
    setBusy(true);
    const phone = `${dial}${digits.replace(/\D/g, "")}`;
    const r = await postAuth("/api/auth/request-code", { phone, countryCode: dial, otpMethod: "SMS" });
    setBusy(false);
    if (r.ok) onCodeSent(phone, { method: "SMS" });
    else setErr(r.kind);
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="mb-[6px] text-center text-[26px] font-extrabold tracking-[-.5px] text-navy">{title ?? a.signInTitle}</h2>
      <p className="mb-[24px] text-center text-[14px] leading-[1.55] text-muted">{subtitle ?? a.signInSub}</p>

      <label className="mb-[8px] block text-[12.5px] font-bold text-navy-mid">{a.phoneLabel}</label>
      <div className="flex gap-[10px]" dir="ltr">
        {PUBLIC_WEB_ENABLED ? (
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

      {/* Non-Saudi: SMS can't reach them → nudge to the Email tab. */}
      {smsBlocked && (
        <div className="mt-[14px] rounded-[10px] border border-warn/30 bg-warn-soft px-[12px] py-[10px]">
          <p className="text-[12.5px] leading-[1.5] text-warn">{a.smsSaudiOnly}</p>
          {onUseEmail && (
            <button type="button" onClick={onUseEmail} className="mt-[6px] inline-flex items-center gap-1.5 text-[13px] font-bold text-info">
              <Icon name="mail" size={16} /> {a.withEmail}
            </button>
          )}
        </div>
      )}

      {err && <p className="mt-[10px] text-[13px] font-semibold text-danger">{a.errors[err]}</p>}

      <button
        type="submit"
        disabled={busy || !digits.trim() || smsBlocked}
        className="mt-[24px] flex w-full items-center justify-center gap-[7px] rounded-[10px] border border-brand bg-brand px-[24px] py-[13px] text-[14.5px] font-bold text-white transition hover:brightness-[1.04] disabled:opacity-50"
      >
        <span>{busy ? a.sending : a.sendCode}</span>
        {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
      </button>

      <div className="mt-[22px] text-center text-[13px] leading-[1.55] text-muted">{a.signInFoot}</div>
    </form>
  );
}
