"use client";

import { useRouter } from "next/navigation";
import { useRfq } from "@/lib/store/rfq-store";
import { useT } from "@/lib/i18n";
import { Intake } from "@/components/screens/Intake";
import { Processing } from "@/components/screens/Processing";
import { Confirmation } from "@/components/screens/Confirmation";
import { Canvas } from "@/components/create/Canvas";
import { ReadyToSend } from "@/components/create/ReadyToSend";
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
  const router = useRouter();

  const screen = (() => {
    switch (state.phase) {
      case "intake":
        return <Intake />;
      case "processing":
        return <Processing />;
      // MREQ — the four-step wizard is gone. The same phase now renders one canvas, and the
      // Ready-to-send review is a mode of it rather than a fifth step.
      case "wizard":
        /**
         * The canvas asks for the WORKING gutter, and gets it from the shell.
         *
         * It used to cancel the shell's reading gutter with negative margins at every breakpoint and
         * put a tighter one back on, because 112px a side was the difference between the machine
         * card, the operator rail and the schedule sharing a row and wrapping. The reason still
         * holds; the mechanism does not. `/create` passes `wide`, and `wide` now means exactly those
         * numbers (see `PAGE_X_WORKING`), so the page has the gutter it needs without a component
         * inside it undoing its own container.
         */
        return state.readyToSend ? <ReadyToSend /> : <Canvas />;
      case "confirmation":
        return <Confirmation />;
    }
  })();

  return (
    <>
      {/* mobile/016 — trial-run ribbon. Stays above every phase of the flow (intake → wizard →
          confirmation) so it's never ambiguous whether this submission reaches real suppliers. Switching
          to a real request goes through the URL, which is the authority for the mode (see /create). */}
      {state.isTrial && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-sm border border-warn/35 bg-warn/[0.07] px-4 py-3">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-sm bg-warn/15 text-warn">
            <Icon name="science" size={17} />
          </span>
          <span className="min-w-0 flex-1 text-body font-semibold text-navy">{t.startRequest.modeBanner}</span>
          {state.phase !== "confirmation" && (
            <button
              type="button"
              onClick={() => router.replace("/create?mode=real")}
              className="text-meta font-semibold text-brand underline decoration-brand/40 underline-offset-2 transition hover:decoration-brand"
            >
              {t.startRequest.modeBannerSwitch}
            </button>
          )}
        </div>
      )}
      {screen}
      {state.draftPrompt && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-surface p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-brand-soft text-brand">
                <Icon name="drafts" size={22} />
              </span>
              <div>
                <h2 className="text-title font-extrabold text-navy">{t.draftPrompt.title}</h2>
                <p className="mt-1 text-body leading-relaxed text-muted">{t.draftPrompt.body}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => actions.reset()}
                className="rounded-sm border border-border bg-surface px-4 py-2.5 text-body font-semibold text-navy-mid transition hover:bg-surface2"
              >
                {t.draftPrompt.startOver}
              </button>
              <button
                onClick={() => actions.resumeDraft()}
                className="rounded-sm bg-brand px-4 py-2.5 text-body font-semibold text-brand-fg transition"
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
