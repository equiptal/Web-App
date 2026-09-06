"use client";

import { usePageBack } from "@/components/AppShell";
import { useRfq } from "@/lib/store/rfq-store";

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
  const { state, actions } = useRfq();
  const { phase, readyToSend, draft } = state;
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
        ? () => actions.goIntake()
        : phase === "confirmation"
          ? null
          : { fallback: "/" };
  usePageBack(spec);
  return null;
}
