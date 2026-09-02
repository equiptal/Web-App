"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { useRfq } from "@/lib/store/rfq-store";
import { useT } from "@/lib/i18n";
import { Intake } from "@/components/screens/Intake";
import { Processing } from "@/components/screens/Processing";
import { Confirmation } from "@/components/screens/Confirmation";
import { Canvas } from "@/components/create/Canvas";
import { ReadyToSend } from "@/components/create/ReadyToSend";
import { ShareOnPost } from "@/components/create/ShareOnPost";
import { Icon } from "@/components/ui";
import { btn } from "@/lib/ds";

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
         * card, the operator rail and the schedule sharing a row and wrapping. That was then fixed
         * by `wide`, and `wide` is gone too: the shell has ONE gutter now (`PAGE_X`, 16/24/32/40),
         * which is the tighter scale this canvas always wanted. The page gets the room it needs
         * because every page does, and nothing inside it undoes its own container.
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
      {/* Started from a store → this goes to ONE supplier. Said above every phase, in the ribbon slot
          the trial banner uses, because «who receives this» is the one thing a renter cannot check
          anywhere else in the form — the fields look identical to a broadcast's. */}
      {state.direct && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-sm border border-brand/35 bg-brand-soft px-4 py-3">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-sm bg-brand/15 text-brand-deep">
            <Icon name="storefront" size={17} />
          </span>
          <span className="min-w-0 flex-1 text-body font-semibold text-navy">
            {t.store.directBanner.replace("{name}", state.direct.supplierName ?? t.store.directSupplierFallback)}
          </span>
          {state.direct.storeId && state.phase !== "confirmation" && (
            <Link
              href={`/stores/${state.direct.storeId}`}
              className="text-meta font-semibold text-brand underline decoration-brand/40 underline-offset-2 transition hover:decoration-brand"
            >
              {t.store.directBannerBack}
            </Link>
          )}
        </div>
      )}
      {screen}

      {/* ── «Share this request», the card under the review ──────────────────────────────────────
          A card on the page rather than a dialog (the owner's prototype): a renter looking at what
          he is about to send should see who it goes to without pressing anything first.

          Rendered HERE and not inside the phase switch, because its button posts — and posting flips
          `phase` to `confirmation`, which would unmount the card and its state mid-press, between
          the post and the share. Outside the switch it survives, so the flip happens behind it and
          it stays on screen to report what it shared. `shareOnPost` is what keeps it there
          afterwards; before the post it follows the review it belongs to.

          ⚠️ `shareOnPost` alone is NOT enough (owner, 2026-09-02: *"suddenly this is shown in some
          pages"*). It is set on a post and nothing clears it, so a renter who posted and then went
          back to the canvas carried a card advertising the PREVIOUS request's link into the request
          he was writing next. Pinning it to `confirmation` says what it always meant: this card
          belongs to the review it is posting, and to the moment just after. */}
      {(state.readyToSend || (state.phase === "confirmation" && state.shareOnPost)) && <ShareOnPost />}
      {/* The shared dialog, not a scrim of its own (owner, 2026-08-28: one design for every modal).
          This drew `bg-black/50` where the system's scrim is navy at 45%, and its own panel and
          heading with no way out but the two buttons — a prompt with no close is the one thing a
          renter cannot escape by pressing Escape. `Dialog` gives it that for free.

          `onClose` resumes rather than resets: dismissing a "you have a draft" prompt is not a
          decision to throw the draft away, so the destructive branch stays a deliberate press. */}
      {state.draftPrompt && (
        <Dialog
          open
          onClose={() => actions.resumeDraft()}
          size="sm"
          icon={
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-sm bg-brand-soft text-brand">
              <Icon name="drafts" size={19} />
            </span>
          }
          title={t.draftPrompt.title}
          footer={
            <>
              <button onClick={() => actions.reset()} className={btn("secondary", "md", { className: "transition" })}>
                {t.draftPrompt.startOver}
              </button>
              <button onClick={() => actions.resumeDraft()} className={btn("primary", "md", { className: "transition" })}>
                {t.draftPrompt.continue}
              </button>
            </>
          }
        >
          <p className="text-body leading-relaxed text-muted">{t.draftPrompt.body}</p>
        </Dialog>
      )}
    </>
  );
}
