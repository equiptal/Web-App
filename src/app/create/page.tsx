"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, PageBack } from "@/components/AppShell";
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
        <DirectRequestGate />
        <FirstRequestGate />
      </Suspense>
      <AppShell title={t.shell.request}>
        <PageBack fallback="/" />
        <CreateSurface />
      </AppShell>
    </RfqProvider>
  );
}

/**
 * The store entrance to this flow (app parity, Epic 008).
 *
 * `/create?supplierId=…&supplierName=…&storeId=…` means the renter pressed Request on one supplier's
 * equipment. Everything about the form stays the same; only the recipient changes — it submits as a
 * DIRECT request to that supplier instead of broadcasting to every firm that matches. The URL is the
 * authority, exactly as `?mode=` is for a trial: a reload keeps the recipient, and arriving at
 * `/create` with no `supplierId` clears one left over from a previous run rather than quietly
 * re-addressing the next request.
 *
 * `?prefill=` carries the equipment's own words into the intake box (the app seeds the form with the
 * machine the renter was looking at). It is a starting text, not a fact: the renter edits it, and the
 * agent reads what he ends up with — the taxonomy is never forced behind him.
 */
function DirectRequestGate() {
  const params = useSearchParams();
  const { state, actions } = useRfq();
  const supplierId = params.get("supplierId");
  const supplierName = params.get("supplierName");
  const storeId = params.get("storeId");
  const prefill = params.get("prefill");
  const { direct, draft, text } = state;
  const seeded = useRef(false);

  useEffect(() => {
    const same = (direct?.supplierId ?? null) === (supplierId ?? null);
    if (same) return;
    actions.setDirect(supplierId ? { supplierId, supplierName, storeId } : null);
    // The prefill seeds an EMPTY box only, and only once: a renter who has already typed owns what
    // he wrote, and a re-render must not push his words back to the machine's name.
    if (supplierId && prefill && !draft && !text.trim() && !seeded.current) {
      seeded.current = true;
      actions.setText(prefill);
    }
    // `actions` is rebuilt each render but only wraps dispatch; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, supplierName, storeId, prefill, direct, draft, text]);

  return null;
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
