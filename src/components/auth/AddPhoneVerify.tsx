"use client";

import { useState, type FormEvent } from "react";
import { postAuth, type AuthKind } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { CodeEntry } from "./CodeEntry";
import { COUNTRY_CODES, SAUDI_DIAL } from "./PhoneEntry";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * Modal 2, Case 1 — an email-first NEW user adds a phone (the account identity) with an inline OTP;
 * verifying it CREATES the account + session (via the onboardingToken from the email verify). Two
 * sub-steps: enter phone → send code, then the shared CodeEntry verifies with the onboarding payload.
 * SMS is Saudi-only; a non-Saudi phone here would fail to receive a code (surfaced as an error).
 */
export function AddPhoneVerify({
  onboardingToken,
  onVerified,
}: {
  onboardingToken: string;
  onVerified: (user: RenterUser) => void;
}) {
  const t = useT();
  const a = t.auth;
  const [digits, setDigits] = useState("");
  const [dial, setDial] = useState(SAUDI_DIAL);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const p = `${dial}${digits.replace(/\D/g, "")}`;
    const r = await postAuth("/api/auth/request-code", { onboardingToken, phone: p, countryCode: dial, otpMethod: "SMS" });
    setBusy(false);
    if (r.ok) setPhone(p);
    else setErr(r.kind);
  };

  if (phone) {
    return (
      <div className="p-[22px]">
        <CodeEntry
          dest={phone}
          verifyPayload={{ onboardingToken, phone, role: "rentee" }}
          resendPayload={{ onboardingToken, phone, countryCode: dial, otpMethod: "SMS" }}
          verifyLabel={a.verifyCreate}
          onVerified={(user) => onVerified(user)}
          onEditNumber={() => setPhone(null)}
        />
      </div>
    );
  }

  return (
    <form onSubmit={sendCode} noValidate className="p-[22px]">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-brand"><Icon name="smartphone" size={22} /></span>
      <h2 className="mb-[6px] text-[22px] font-extrabold tracking-[-.4px] text-navy">{a.addPhoneTitle}</h2>
      <p className="mb-[20px] text-[14px] leading-[1.55] text-muted">{a.addPhoneSub}</p>

      <label className="mb-[8px] block text-[12.5px] font-bold text-navy-mid">{a.phoneLabel} <span className="text-danger">*</span></label>
      <div className="flex gap-[10px]" dir="ltr">
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

      {err && <p className="mt-[10px] text-[13px] font-semibold text-danger">{a.errors[err]}</p>}

      <button
        type="submit"
        disabled={busy || !digits.trim()}
        className="mt-[24px] flex w-full items-center justify-center gap-[7px] rounded-[10px] border border-brand bg-brand px-[24px] py-[13px] text-[14.5px] font-bold text-white transition hover:brightness-[1.04] disabled:opacity-50"
      >
        <span>{busy ? a.sending : a.sendCode}</span>
        {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
      </button>
    </form>
  );
}
