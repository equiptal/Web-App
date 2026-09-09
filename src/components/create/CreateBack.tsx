"use client";

import { useState } from "react";
import { usePageBack } from "@/components/AppShell";
import { Modal } from "@/components/ui";
import { btn } from "@/lib/ds";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { pin } from "@/lib/uiPins";

/**
 * Back, on the create flow, steps back through the FLOW before it leaves it (owner, 2026-09-06:
 * *"even back on the review and summary, or any request page, must be back to the previous page, not
 * to the requests page"*).
 *
 * The control was `<PageBack fallback="/" />`, which always left: pressed on the review screen it
 * took the renter off the page he was working on and onto whatever he had visited before it — usually
 * the requests workspace, since that is where most people start a request from. The review is not a
 * page he arrived at, it is the last step of the one he is standing on, so Back there means «back to
 * the canvas», exactly as the browser's own Back already does (`rfq-store`'s three-stop history
 * chain: intake → canvas → review).
 *
 * So the control walks the same chain, and only the bottom of it leaves:
 *
 *   review  → the canvas
 *   canvas  → «Your request», where the words were typed
 *   intake  → out, to wherever he came from (the shell's trail; `/` when there is none)
 *
 * The confirmation screen registers nothing: the request is sent, there is no step to walk back to,
 * and its own controls say where to go next.
 */
export function CreateBack() {
  const t = useT();
  const { state, actions } = useRfq();
  const { phase, readyToSend, draft } = state;
  /**
   * ── Leaving the request is asked about, once (owner, 2026-09-09) ───────────────────────────────
   * *"If clicked while user is on the request page and back taking him to the intake again then show
   * short simple confirm modal asking do you want to leave this request? … just very simple one line
   * question."*
   *
   * ONE step of the chain earns it: the canvas → «Your request». Everything on screen at that point
   * is the drafted request, and that press replaces it with the typing box — a renter who meant
   * «back one panel» loses the machine, the site and the dates in one press. The other two steps are
   * left alone deliberately: review → canvas keeps the draft whole (nothing to warn about), and
   * intake → out is leaving a page where nothing has been built yet.
   */
  const [confirmLeave, setConfirmLeave] = useState(false);
  /* ONE registration, not two.
     ⚠️ Registering `null` here and rendering `<PageBack>` underneath does NOT work, and the failure
     is silent: child effects run before the parent's, so `PageBack`'s spec lands first and this
     component's `null` overwrites it — the page ends up with no Back control at all. Both cases go
     through the same hook instead, and the value decides which.

     A function spec is an ACT rather than a destination; `{ fallback }` is the ordinary page Back,
     which the shell points at the trail. `null` only on the confirmation screen, where the request
     is sent and there is no step to walk back to. */
  const spec =
    phase === "wizard" && readyToSend
      ? () => actions.setReadyToSend(false)
      : phase === "wizard" && draft
        ? () => setConfirmLeave(true)
        : phase === "confirmation"
          ? null
          : { fallback: "/" };
  usePageBack(spec);

  /* ~~`return null`~~ — it still renders nothing until the question is asked. The dialog lives HERE
     rather than in `CreateSurface` because the act it guards is this component's: one place decides
     what Back does, and one place asks about it. */
  return (
    <Modal
      open={confirmLeave}
      onClose={() => setConfirmLeave(false)}
      title={t.create.leaveRequest.title}
    >
      {/* ONE line, and no body paragraph: the title IS the question (owner: *"just very simple one
          line question"*), so a sentence under it would be the same news in smaller type. */}
      <div {...pin("create-leave-confirm")} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          onClick={() => setConfirmLeave(false)}
          className={btn("secondary", "md", { className: "transition" })}
        >
          {t.create.leaveRequest.stay}
        </button>
        <button
          onClick={() => {
            setConfirmLeave(false);
            actions.goIntake();
          }}
          className={btn("primary", "md", { className: "transition" })}
        >
          {t.create.leaveRequest.leave}
        </button>
      </div>
    </Modal>
  );
}
