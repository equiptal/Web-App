"use client";

import { useState, type FormEvent } from "react";
import { postAuth, type AuthKind } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";

/**
 * Phone-entry screen (AC-01/02/15/24), matching the prototype's login `form-inner`. `+966` preset;
 * on submit requests a code and advances to the code screen.
 */
export function PhoneEntry({ onCodeSent, title, subtitle }: { onCodeSent: (phone: string) => void; title?: string; subtitle?: string }) {
  const t = useT();
  const a = t.auth;
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const phone = `+966${digits.replace(/\D/g, "")}`;
    const r = await postAuth("/api/auth/request-code", { phone });
    setBusy(false);
    if (r.ok) onCodeSent(phone);
    else setErr(r.kind);
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="mb-[6px] text-[26px] font-extrabold tracking-[-.5px] text-navy">{title ?? a.signInTitle}</h2>
      <p className="mb-[28px] text-[14px] leading-[1.55] text-muted">{subtitle ?? a.signInSub}</p>

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
