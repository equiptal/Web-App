"use client";

import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { postAuth, type AuthKind } from "./authClient";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { RenterUser } from "@/lib/contract/auth";

const OTP_FONT: React.CSSProperties = { fontFamily: "var(--font-plex), monospace" };

/**
 * Code-entry screen (AC-02/09/10/11/12/13/15/24), matching the prototype's OTP `form-inner`. 4-box
 * input with filled state, verify, resend (no cooldown — AC-12; the prototype's 30s timer is
 * illustrative only), and back (AC-13).
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
  const a = t.auth;
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [boxes, setBoxes] = useState(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AuthKind | null>(null);
  const [resent, setResent] = useState(false);

  const code = boxes.join("");
  const [sentPre, sentPost] = a.codeSentTo.split("{phone}");

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
    <form onSubmit={verify} noValidate>
      <button
        type="button"
        onClick={onEditNumber}
        className="mb-[20px] inline-flex items-center gap-[4px] text-[13px] font-bold text-muted"
      >
        <Icon name="arrow_back" size={18} className="rtl:-scale-x-100" />
        {a.back}
      </button>

      <h2 className="mb-[6px] text-[26px] font-extrabold tracking-[-.5px] text-navy">{a.codeTitle}</h2>
      <p className="mb-[28px] text-[14px] leading-[1.55] text-muted">
        {sentPre}
        <b className="text-navy">{phone}</b>
        {sentPost}
      </p>

      <div className="grid grid-cols-4 gap-[12px]" dir="ltr">
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
            style={OTP_FONT}
            className={`h-[60px] w-full rounded-[10px] border-[1.5px] text-center text-[24px] font-bold text-navy outline-0 focus:border-brand focus:shadow-[0_0_0_3px_rgba(247,144,9,.12)] ${
              d ? "border-brand bg-brand-soft" : "border-border bg-surface"
            }`}
          />
        ))}
      </div>

      {err && <p className="mt-[12px] text-[13px] font-semibold text-danger">{a.errors[err]}</p>}
      {resent && !err && <p className="mt-[12px] text-[13px] font-semibold text-ok">{a.resent}</p>}

      <button
        type="submit"
        disabled={busy || code.length < 4}
        className="mt-[24px] flex w-full items-center justify-center gap-[7px] rounded-[10px] border border-brand bg-brand px-[24px] py-[13px] text-[14.5px] font-bold text-white transition hover:brightness-[1.04] disabled:opacity-50"
      >
        {!busy && <Icon name="check" size={18} />}
        <span>{busy ? a.verifying : a.verify}</span>
      </button>

      <div className="mt-[22px] text-center text-[13px] text-muted">
        <button type="button" onClick={resend} className="font-bold text-[#2563EB]">
          {a.resend}
        </button>
      </div>
    </form>
  );
}
