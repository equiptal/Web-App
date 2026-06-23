"use client";

import { useRfq } from "@/lib/store/rfq-store";
import { useT } from "@/lib/i18n";
import { Intake } from "@/components/screens/Intake";
import { Processing } from "@/components/screens/Processing";
import { Confirmation } from "@/components/screens/Confirmation";
import { Wizard } from "@/components/wizard/Wizard";
import { Icon } from "@/components/ui";

/**
 * The RFQ create surface. Guests can now run the WHOLE flow — the account gate moved to Submit
 * (Step 4): a guest who posts is shown the account-creation modal, then the request auto-submits.
 *
 * When a saved draft is rehydrated on entry, a continue/start-over prompt overlays the restored
 * screen so the renter explicitly chooses to resume the draft or reset (web-app/002 draft UX).
 */
export function CreateSurface() {
  const { state, actions } = useRfq();
  const t = useT();

  const screen = (() => {
    switch (state.phase) {
      case "intake":
        return <Intake />;
      case "processing":
        return <Processing />;
      case "wizard":
        return <Wizard />;
      case "confirmation":
        return <Confirmation />;
    }
  })();

  return (
    <>
      {screen}
      {state.draftPrompt && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-brand-soft text-brand">
                <Icon name="drafts" size={22} />
              </span>
              <div>
                <h2 className="text-[18px] font-extrabold text-navy">{t.draftPrompt.title}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{t.draftPrompt.body}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => actions.reset()}
                className="rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13.5px] font-bold text-navy-mid transition hover:bg-surface2"
              >
                {t.draftPrompt.startOver}
              </button>
              <button
                onClick={() => actions.resumeDraft()}
                className="rounded-[10px] bg-brand px-4 py-2.5 text-[13.5px] font-bold text-brand-fg transition hover:brightness-[1.04]"
              >
                {t.draftPrompt.continue}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
