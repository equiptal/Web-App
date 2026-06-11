"use client";

import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { postAuth, type AuthKind } from "./authClient";
import { useT, fmt } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * Code-entry screen (AC-02/09/10/11/12/13/15/24). 4-box OTP input, verify, resend (no cooldown —
 * AC-12; the prototype's 30s timer is illustrative only), and back/edit-number (AC-13).
 */
export function CodeEntry({
  phone,
  onVerified,
  onEditNumber,
}: {
  phone: string;
  onVerified: (user: RenterUser) => void;
  onEditNumber: () => void;
}) {
  const t = useT();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [boxes, setBoxes] = useState(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);
  const [resent, setResent] = useState(false);

  const code = boxes.join("");

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

  const resetBoxes = () => {
    setBoxes(["", "", "", ""]);
    inputs.current[0]?.focus();
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setResent(false);
    setBusy(true);
    const r = await postAuth("/api/auth/verify", { phone, code });
    setBusy(false);
    if (r.ok) {
      onVerified(r.data.user as RenterUser);
      return;
    }
    setErr(r.kind);
    if (r.kind === "invalid_code") resetBoxes(); // AC-09: let them re-enter
  };

  const resend = async () => {
    setErr(null);
    setResent(false);
    const r = await postAuth("/api/auth/resend", { phone }); // AC-12: no cooldown
    if (r.ok) {
      setResent(true);
      resetBoxes();
    } else {
      setErr(r.kind);
    }
  };

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onEditNumber}
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-navy-mid"
      >
        <Icon name="arrow_back" size={16} />
        {t.auth.editNumber}
      </button>

      <h1 className="text-xl font-extrabold text-navy">{t.auth.codeTitle}</h1>
      <p className="text-sm text-muted">
        {fmt(t.auth.codeSentTo, { phone })}
      </p>

      <div className="flex gap-2" dir="ltr">
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
            className="h-14 w-full rounded-lg border border-border text-center text-2xl font-bold outline-none focus:border-navy"
          />
        ))}
      </div>

      {err && <p className="text-sm text-red-600">{t.auth.errors[err]}</p>}
      {resent && !err && <p className="text-sm text-green-600">{t.auth.resent}</p>}

      <button
        type="submit"
        disabled={busy || code.length < 4}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {!busy && <Icon name="check" size={16} />}
        {busy ? t.auth.verifying : t.auth.verify}
      </button>

      <button type="button" onClick={resend} className="text-sm font-semibold text-brand">
        {t.auth.resend}
      </button>
    </form>
  );
}
