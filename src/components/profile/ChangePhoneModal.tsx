"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { useT, useLocale, fmt } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { requestPhoneChange, verifyPhoneChange } from "@/lib/api/profile-client";
import { btn } from "@/lib/ds";

const OTP_FONT: React.CSSProperties = { fontFamily: "var(--font-plex), monospace" };

/**
 * Change-phone flow (app parity: change_phone_page.dart). Step 1 collects the new +966 number and
 * requests a 4-digit OTP; step 2 verifies it. On success the backend rotates the identity and returns
 * `requireReLogin` — the parent clears the session and routes to /login.
 */
export function ChangePhoneModal({
  onClose,
  onReLogin,
}: {
  onClose: () => void;
  /** Called after a successful phone change — clear session + go to /login. */
  onReLogin: () => void;
}) {
  const t = useT();
  const p = t.profile;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [boxes, setBoxes] = useState(["", "", "", ""]);
  const code = boxes.join("");
  const newPhone = `+966${digits.replace(/\D/g, "")}`;

  const sendCode = async () => {
    setErr(null);
    setBusy(true);
    const r = await requestPhoneChange(newPhone);
    setBusy(false);
    if (r.ok) {
      setStep("code");
      setBoxes(["", "", "", ""]);
      return;
    }
    setErr(r.code === "conflict" ? p.phoneInUse : ar && r.messageAr ? r.messageAr : p.changePhoneError);
  };

  const resend = async () => {
    setErr(null);
    setResent(false);
    const r = await requestPhoneChange(newPhone);
    if (r.ok) {
      setResent(true);
      setBoxes(["", "", "", ""]);
      inputs.current[0]?.focus();
    } else {
      setErr(r.code === "conflict" ? p.phoneInUse : p.changePhoneError);
    }
  };

  const verify = async () => {
    setErr(null);
    setResent(false);
    setBusy(true);
    const r = await verifyPhoneChange(newPhone, code);
    setBusy(false);
    if (r.ok) {
      onReLogin();
      return;
    }
    setErr(ar && r.messageAr ? r.messageAr : p.otpError);
    setBoxes(["", "", "", ""]);
    inputs.current[0]?.focus();
  };

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

  return (
    <Dialog open onClose={onClose} size="md" padded={false}>
      <div
        className="p-6"
        dir={ar ? "rtl" : "ltr"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-title font-extrabold text-navy">{p.changePhone}</h2>
            <p className="mt-0.5 text-meta text-muted">{step === "phone" ? p.changePhoneSub : fmt(p.phoneCodeSentTo, { phone: newPhone })}</p>
          </div>
          <button onClick={onClose} className="flex-none rounded-sm p-1 text-muted hover:bg-surface2" aria-label={p.cancel}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {step === "phone" ? (
          <>
            <label className="mb-1.5 block text-meta font-semibold text-navy-mid">{p.newPhone}</label>
            <div className="flex gap-2" dir="ltr">
              <div className="flex h-[48px] items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-surface2 px-3 text-body font-semibold text-navy">
                <span className="text-subhead">🇸🇦</span> +966
              </div>
              <input
                className="h-[48px] min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 text-subhead font-semibold text-navy outline-0 focus:border-brand"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={digits}
                onChange={(e) => setDigits(e.target.value)}
                placeholder="5XXXXXXXX"
                autoFocus
              />
            </div>
            {err && <p className="mt-2 text-meta font-semibold text-danger">{err}</p>}
            <button
              onClick={sendCode}
              disabled={busy || digits.replace(/\D/g, "").length < 9}
              className={btn("primary", "lg", { full: true, className: "mt-5 flex transition" })}
            >
              {busy ? p.sending : p.sendCode}
              {!busy && <Icon name="arrow_forward" size={16} className="rtl:scale-x-[-1]" />}
            </button>
          </>
        ) : (
          <>
            <h3 className="mb-3 text-body font-semibold text-navy">{p.phoneCodeTitle}</h3>
            <div className="grid grid-cols-4 gap-3" dir="ltr">
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
                  className={`h-[56px] w-full rounded-md border-[1.5px] text-center text-display font-semibold text-navy outline-0 focus:border-brand ${
                    d ? "border-brand bg-brand-soft" : "border-border bg-surface"
                  }`}
                />
              ))}
            </div>
            {err && <p className="mt-3 text-meta font-semibold text-danger">{err}</p>}
            {resent && !err && <p className="mt-3 text-meta font-semibold text-ok">{p.resent}</p>}
            <button
              onClick={verify}
              disabled={busy || code.length < 4}
              className={btn("primary", "lg", { full: true, className: "mt-5 flex transition" })}
            >
              {!busy && <Icon name="check" size={16} />}
              {busy ? p.verifying : p.verify}
            </button>
            <button onClick={resend} className="mt-4 w-full text-center text-body font-semibold text-info">
              {p.resend}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
