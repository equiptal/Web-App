"use client";

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
      {/* Step indicator (AC-44). Earlier steps are clickable (free back-nav). */}
      <ol className="mb-6 flex items-center justify-center gap-2 text-sm">
        {([1, 2, 3, 4] as Step[]).map((n) => {
          const active = n === step;
          const done = n < step;
          return (
            <li key={n} className="flex items-center gap-2">
              <button
                disabled={!done && !active}
                onClick={() => done && actions.goStep(n)}
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

      {step === 1 && <Step1Project />}
      {step === 2 && <Step2Equipment />}
      {step === 3 && <Step3Preferences />}
      {step === 4 && <Step4Preview />}

      {/* Footer nav. Step 4 carries its own Post action. */}
      <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
        <Button variant="secondary" disabled={step === 1} onClick={() => actions.goStep((step - 1) as Step)}>
          {t.common.back}
        </Button>

        {step < 4 && (
          <div className="flex items-center gap-3">
            {!gate.ok && <span className="text-xs text-warn">{gate.reasons.map(reasonText).join(" · ")}</span>}
            <Button disabled={!gate.ok} onClick={() => actions.goStep((step + 1) as Step)}>
              {t.common.next}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
