"use client";

import { useState, type FormEvent } from "react";
import { Dropdown } from "@/components/Dropdown";
import { postAuth, type AuthKind, type OtpChannel } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";
import { authField, authFoot, authLabel, authSub, authSubmit, authTitle, type AuthTone } from "@/components/auth/AuthPanel";

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
  tone = "light",
}: {
  onCodeSent: (phone: string, channel: OtpChannel) => void;
  /** Non-Saudi → offer to switch Modal 1 to the Email tab (SMS can't reach them). */
  onUseEmail?: () => void;
  title?: string;
  subtitle?: string;
  /** `dark` is the auth modal's navy panel (owner's comp, 2026-08-30). Everything else — the login
   *  page, the inline verify inside Modal 2 — stays `light` and is untouched. */
  tone?: AuthTone;
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
      <h2 className={authTitle(tone)}>{title ?? a.signInTitle}</h2>
      <p className={authSub(tone)}>{subtitle ?? a.signInSub}</p>

      <label className={authLabel(tone)}>{a.phoneLabel}</label>
      <div className="flex gap-3" dir="ltr">
        {PUBLIC_WEB_ENABLED ? (
          /* The house dropdown, wearing the auth field's skin (owner, 2026-08-31: one dropdown
             across the product). ~~`[&>option]:text-navy`~~ went with the native popup it patched:
             the browser's own list inherited this control's white-on-navy and rendered white text
             on a white ground. The app's list is the app's list wherever it opens, so the class of
             bug is gone rather than corrected. */
          <Dropdown
            label={a.countryLabel}
            placeholder="—"
            value={dial}
            onChange={setDial}
            triggerClass={`${authField(tone)} flex-none font-extrabold`}
            options={COUNTRY_CODES.map((c) => ({ value: c.dial, label: `${c.flag} ${c.dial}` }))}
          />
        ) : (
          <div className={`${authField(tone)} flex flex-none items-center gap-2 whitespace-nowrap font-extrabold`}>
            <span className="text-title">🇸🇦</span> +966
          </div>
        )}
        <input
          className={`${authField(tone)} min-w-0 flex-1`}
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
        <div className="mt-4 rounded-sm border border-warn/30 bg-warn-soft px-3 py-3">
          <p className="text-meta leading-[1.5] text-warn">{a.smsSaudiOnly}</p>
          {onUseEmail && (
            <button type="button" onClick={onUseEmail} className="mt-2 inline-flex items-center gap-1.5 text-body font-semibold text-info">
              <Icon name="mail" size={16} /> {a.withEmail}
            </button>
          )}
        </div>
      )}

      {err && <p className="mt-3 text-body font-semibold text-danger">{a.errors[err]}</p>}

      <button
        type="submit"
        disabled={busy || !digits.trim() || smsBlocked}
        /* One call for both grounds: `authSubmit` returns the app's primary button either way, and
           only its disabled skin differs — see the note on it. */
        className={authSubmit(tone)}
      >
        <span>{busy ? a.sending : a.sendCode}</span>
        {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
      </button>

      <div className={authFoot(tone)}>{a.signInFoot}</div>
    </form>
  );
}
