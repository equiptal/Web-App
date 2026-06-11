"use client";

import { useState, type FormEvent } from "react";
import { postAuth, type AuthKind } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";

/**
 * Phone-entry screen (AC-01/02/15/24). `+966` preset; on submit requests a code and advances to the
 * code screen. T6 (#19) refines this to the prototype.
 */
export function PhoneEntry({ onCodeSent }: { onCodeSent: (phone: string) => void }) {
  const t = useT();
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-navy">{t.auth.signInTitle}</h1>
        <p className="mt-1 text-sm text-muted">{t.auth.signInSub}</p>
      </div>
      <label className="text-sm font-semibold text-navy-mid">
        {t.auth.phoneLabel}
        <div className="mt-1 flex items-center overflow-hidden rounded-lg border border-border">
          <span className="bg-surface2 px-3 py-2 text-sm font-bold text-muted" dir="ltr">
            +966
          </span>
          <input
            inputMode="numeric"
            autoComplete="tel-national"
            value={digits}
            onChange={(e) => setDigits(e.target.value)}
            className="w-full px-3 py-2 text-sm outline-none"
            placeholder={t.auth.phonePlaceholder}
            dir="ltr"
          />
        </div>
      </label>
      {err && <p className="text-sm text-red-600">{t.auth.errors[err]}</p>}
      <button
        type="submit"
        disabled={busy || !digits.trim()}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? t.auth.sending : t.auth.sendCode}
        {!busy && <Icon name="arrow_forward" size={16} />}
      </button>
    </form>
  );
}
