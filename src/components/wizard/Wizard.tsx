"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq, type Step } from "@/lib/store/rfq-store";
import { Button, Icon } from "@/components/ui";
import { gateStep1, gateStep2, gateStep3, type GateResult } from "@/lib/contract";
import { Step1Project } from "@/components/wizard/Step1Project";
import { Step2Equipment } from "@/components/wizard/Step2Equipment";
import { Step3Preferences } from "@/components/wizard/Step3Preferences";
import { Step4Preview } from "@/components/wizard/Step4Preview";

export function Wizard() {
  const t = useT();
  const { state, actions } = useRfq();
  const { step, draft } = state;
  // Persistent "start over" — available on every wizard step (not just the draft prompt), so the
  // renter can abandon the current request and begin a fresh one at any time. Confirmed first since
  // it clears the saved draft.
  const [confirmReset, setConfirmReset] = useState(false);

  // Land each step at the top on entry, so its header + settings panel are visible (not scrolled past).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  if (!draft) return null;

  const labels: Record<Step, string> = {
    1: t.nav.project,
    2: t.nav.equipment,
    3: t.nav.preferences,
    4: t.nav.preview,
  };

  // Gate for the *current* step (blocks advancing forward; back is always free — AC-44).
  const gate: GateResult =
    step === 1 ? gateStep1(draft.project) : step === 2 ? gateStep2(draft.items) : step === 3 ? gateStep3() : { ok: true, reasons: [] };

  function reasonText(key: string): string {
    const short = key.replace("gate.", "") as keyof typeof t.gate;
    return t.gate[short] ?? key;
  }

  return (
    <div>
      {/* Step indicator (AC-44) with a persistent "Start over" anchored to the end of the row — always
          available, even after choosing Continue on the draft prompt. Earlier steps are clickable
          (free back-nav); the leading "Your request" chip returns to the original input from ANY step. */}
      <div className="relative mb-6">
        <ol className="flex items-center justify-center gap-2 text-sm">
        <li className="flex items-center gap-2">
          <button
            onClick={() => window.history.go(-step)}
            className="flex items-center gap-2 rounded-full px-2.5 py-1 font-semibold text-navy-mid transition hover:bg-surface2"
          >
            <span className="grid h-[25px] w-[25px] place-items-center rounded-full border border-ok bg-ok text-white">
              <Icon name="description" size={15} />
            </span>
            <span className="hidden sm:inline">{t.intake.yourRequest}</span>
          </button>
          <span className="mx-2 h-px w-8 bg-border" />
        </li>
        {([1, 2, 3, 4] as Step[]).map((n) => {
          const active = n === step;
          const done = n < step;
          return (
            <li key={n} className="flex items-center gap-2">
              <button
                disabled={!done && !active}
                onClick={() => done && window.history.go(n - step)}
                className={`flex items-center gap-2 rounded-full px-2.5 py-1 font-semibold transition ${
                  active ? "bg-brand-soft text-navy ring-1 ring-brand/40" : done ? "text-navy-mid hover:bg-surface2" : "text-muted"
                }`}
              >
                <span
                  className={`grid h-[25px] w-[25px] place-items-center rounded-full border text-xs ${
                    active ? "border-navy bg-navy text-white" : done ? "border-ok bg-ok text-white" : "border-border bg-surface"
                  }`}
                >
                  {done ? <Icon name="check" size={15} /> : n}
                </span>
                <span className="hidden sm:inline">{labels[n]}</span>
              </button>
              {n < 4 && <span className="mx-2 h-px w-8 bg-border" />}
            </li>
          );
        })}
        </ol>
        <button
          onClick={() => setConfirmReset(true)}
          className="absolute end-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-navy-mid transition hover:bg-surface2"
        >
          <Icon name="restart_alt" size={16} />
          <span className="hidden sm:inline">{t.draftPrompt.startOver}</span>
        </button>
      </div>

      {step === 1 && <Step1Project />}
      {step === 2 && <Step2Equipment />}
      {step === 3 && <Step3Preferences />}
      {step === 4 && <Step4Preview />}

      {/* Footer nav. Step 4 carries its own Post action. */}
      <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
        {/* Step 1 Back returns to the RFQ input screen (draft preserved); later steps go one step back. */}
        <Button variant="secondary" onClick={() => window.history.back()}>
          {t.common.back}
        </Button>

        {step < 4 && (
          <div className="flex items-center gap-3">
            {/* Step 1 is gated (rental basis + location are genuinely required); Steps 2/3 stay
                non-blocking — their gate reasons are just a hint of what's still incomplete. */}
            {!gate.ok && <span className="hidden text-xs text-warn sm:inline">{gate.reasons.map(reasonText).join(" · ")}</span>}
            <Button disabled={step === 1 && !gate.ok} onClick={() => actions.goStep((step + 1) as Step)}>{t.common.next}</Button>
          </div>
        )}
      </div>

      {/* Start-over confirmation — clears the saved draft and returns to a fresh intake. */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-brand-soft text-brand">
                <Icon name="restart_alt" size={22} />
              </span>
              <div>
                <h2 className="text-[18px] font-extrabold text-navy">{t.draftPrompt.restartTitle}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{t.draftPrompt.restartConfirm}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirmReset(false)}
                className="rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13.5px] font-bold text-navy-mid transition hover:bg-surface2"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => {
                  setConfirmReset(false);
                  actions.reset();
                }}
                className="rounded-[10px] bg-brand px-4 py-2.5 text-[13.5px] font-bold text-brand-fg transition hover:brightness-[1.04]"
              >
                {t.draftPrompt.startOver}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
