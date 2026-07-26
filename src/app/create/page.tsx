"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RfqProvider, useRfq } from "@/lib/store/rfq-store";
import { CreateSurface } from "@/components/CreateSurface";
import { StartYourRequestModal, type StartRequestChoice } from "@/components/home/StartYourRequestModal";
import { useStartRequestGate } from "@/lib/access/start-request-gate";
import { useT } from "@/lib/i18n";

/**
 * /create — the RFQ creation flow (web-app/002), reached from the home's Create-request entry and
 * the sidebar Request action (web-app/004 AC-07). Guests run the whole flow; the account gate is at
 * Submit (Step 4 → AccountModal), then the request auto-posts.
 *
 * mobile/016: `?mode=trial` (the renter picked "Trial Request" on the home pop-up) runs the SAME flow
 * but submits with `isTrial: true` — no supplier dispatch, sample bids, 60-min TTL. `?mode=real` is the
 * default behaviour and only exists so the pop-up's two paths are symmetric in the URL.
 */
export default function CreatePage() {
  const t = useT();
  return (
    <RfqProvider>
      <Suspense fallback={null}>
        <FirstRequestGate />
      </Suspense>
      <AppShell title={t.shell.request}>
        <CreateSurface />
      </AppShell>
    </RfqProvider>
  );
}

/**
 * mobile/016 — the first-request gate on the create flow, mirroring the app's
 * `create_request_page._maybeShowFirstRequestPopup`:
 *
 *  - `?mode=trial|real` present → the choice was already made (the home pop-up appended it). Apply it
 *    and never show the dialog again.
 *  - no `mode`, and the renter has nothing live → raise the pop-up over the form. This is what covers
 *    every OTHER way into the flow (sidebar Request action, a bookmarked `/create`, a hard reload).
 *  - dismissed → leave the flow and return home, exactly as the app pops the form. The slot stays open,
 *    so the choice is offered again next time (AC-20).
 *
 * While `mode` is present the URL is the authority: the effect also watches `state.isTrial` and
 * re-asserts, because the provider's draft rehydration (which restores the persisted `isTrial`) lands
 * asynchronously once the session resolves and would otherwise overwrite the renter's choice.
 * `mode=real` explicitly clears trial mode for the same reason. Leaving trial mode mid-flow also goes
 * through the URL (the ribbon's "Switch to a real request" → `?mode=real`), so this never fights the
 * renter.
 *
 * Split into its own component because `useSearchParams` needs a Suspense boundary, and kept inside
 * `RfqProvider` so it can reach the store.
 */
function FirstRequestGate() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, actions } = useRfq();
  const mode = params.get("mode");
  const { isTrial, draft } = state;
  const offerStartChoice = useStartRequestGate();
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (mode === "trial" && !isTrial) actions.setTrial(true);
    else if (mode === "real" && isTrial) actions.setTrial(false);
    // `actions` is rebuilt each render but only wraps dispatch; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isTrial]);

  // Suppressed when `mode` settled the choice, and when a saved draft is in play — that renter is
  // resuming an existing request, not starting one, and the draft's continue/start-over prompt owns
  // the screen. `offerStartChoice` is null while unknown → never surfaces (app parity).
  const show = !mode && !draft && !asked && offerStartChoice === true;

  // Stamp the choice into the URL as well as the store, so this entry ends up in exactly the state a
  // home-pop-up entry would: the URL stays the authority for the mode, a reload keeps the choice, and
  // the ribbon's "Switch to a real request" behaves the same on both paths.
  const choose = (choice: StartRequestChoice) => {
    setAsked(true);
    actions.setTrial(choice === "trial");
    router.replace(`/create?mode=${choice}`);
  };

  return (
    <StartYourRequestModal
      open={show}
      onClose={() => {
        setAsked(true);
        router.push("/");
      }}
      onChoose={choose}
    />
  );
}
