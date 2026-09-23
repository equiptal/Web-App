"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RfqProvider, useRfq } from "@/lib/store/rfq-store";
import { CreateSurface } from "@/components/CreateSurface";
import { CreateBack } from "@/components/create/CreateBack";
import { StartYourRequestModal, type StartRequestChoice } from "@/components/home/StartYourRequestModal";
import { canSeedDirect, directRequestDraft, directRequestItem, type DirectPrefill } from "@/lib/agent/direct-draft";
import { consumeDirectStash } from "@/lib/agent/direct-stash";
import { TRIAL_REQUESTS_ENABLED } from "@/lib/flags";
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
        <CreateBack />
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
 * ── The machine comes by ID, and the intake is SKIPPED (app parity, Epic 008) ───────────────────
 *
 * `?catId=&subId=&capId=` (plus the listing's `fuel` and `year`) is the equipment itself, and with
 * them this gate opens the CANVAS directly — no describe-your-request screen, no parse, no wait.
 * That is what the app does: `public_equipment_detail_sheet.dart` builds an `EquipmentPrefill` from
 * the row the renter tapped and opens its wizard with the machine already chosen. Asking him to
 * write down the machine he just pressed, and then guessing which catalogue row he meant, was the
 * web inventing a step the app never had — and the guess can miss.
 *
 * `?prefill=` stays: it is the label the canvas shows under «YOU WROTE», and the FALLBACK for a
 * listing whose triple is incomplete (an older payload, a half-filled row). Without the ids the flow
 * is exactly what it was — the words in the box, the renter's to edit, the agent's to read.
 */
function DirectRequestGate() {
  const params = useSearchParams();
  const { state, actions } = useRfq();
  const supplierId = params.get("supplierId");
  const supplierName = params.get("supplierName");
  const storeId = params.get("storeId");
  const prefill = params.get("prefill");
  const equipment: DirectPrefill = {
    categoryId: params.get("catId"),
    subtypeId: params.get("subId"),
    capacityId: params.get("capId"),
    label: prefill,
    fuel: params.get("fuel"),
    year: Number(params.get("year")) || null,
  };
  const { direct, draft, text } = state;
  /**
   * WHICH machine this URL is for. The seed is keyed on it, not on the supplier and not on "have I
   * run once", which is what broke the flow twice over (owner, 2026-09-10: *"we have an issue in
   * direct request, why does it take him to the intake UI"*).
   *
   * ~~`if (direct?.supplierId === supplierId) return;` and `if (draft) return;`~~ Both were written to
   * stop the gate re-dispatching on every render, and both stopped the SEED as well:
   *
   *  · **The second press on the same supplier landed on INTAKE, with an empty box.** `state.direct`
   *    already named that supplier, so the effect returned before it seeded — and the `prefill`
   *    fallback sits after the same return, so the renter got a blank intake with a direct ribbon
   *    over it. Reproduced against staging: press a store's machine, «Start over», press another of
   *    that store's machines → «How would you like to create your request?».
   *  · **A press with a draft already open showed the WRONG machine.** The URL said 500 ton
   *    (`capId=183d…`) and the canvas kept the 220 ton from the press before it. Silently: nothing
   *    on screen said the machine he had just tapped was not the one he was pricing.
   *
   * So the guard is now the machine itself. Re-renders and reloads carry the same key and seed
   * nothing; a different machine seeds, replacing what was there — which is app parity
   * (`rfq-store`'s own note: the mobile flow refuses to restore a stored draft into a direct
   * request) and the only reading of the press that can be right: he tapped THAT machine.
   */
  const wanted = canSeedDirect(equipment)
    ? [equipment.categoryId, equipment.subtypeId, equipment.capacityId].join("/")
    : null;
  /** The machine the draft is already built around, in the same shape. */
  const inDraft = (() => {
    const live = (draft?.items ?? []).filter((i) => !i.removed);
    if (live.length !== 1) return null;
    const ref = live[0].ref;
    return ref.categoryId && ref.subcategoryId && ref.measurementId
      ? [ref.categoryId, ref.subcategoryId, ref.measurementId].join("/")
      : null;
  })();
  /** What the last seed answered — the key, so a second machine is not mistaken for a re-render. */
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    // The recipient, whenever the URL names a different one. Kept separate from the seed below: a
    // renter can arrive for a new machine at a supplier the store already names.
    if ((direct?.supplierId ?? null) !== (supplierId ?? null)) {
      actions.setDirect(supplierId ? { supplierId, supplierName, storeId } : null);
    }
    if (!supplierId) return;

    if (wanted) {
      // Already the machine on screen, or already seeded from this very URL: nothing to do. This is
      // what makes the effect idempotent under re-render, and it is why the key is the guard.
      if (wanted === inDraft || wanted === seeded.current) return;
      seeded.current = wanted;

      /* ── Back from the store on an errand, so MERGE rather than start over (app parity, AC-02/04) ──
         A direct request cannot pick its equipment on this page — the machine comes off a listing —
         so «change this one» and «add another» are both a trip to the supplier's store and back.
         `direct-stash.ts` holds what he had answered, because the rehydrate guard above deliberately
         refuses to restore a stored draft into a direct request and would otherwise drop all of it.

         `single` replaces the line he pressed the ✕ on; `append` adds the new one beside the ones he
         already has. Reading the stash CLEARS it, so this can only happen once per errand. */
      const stash = consumeDirectStash(supplierId);
      const stashed = stash?.snapshot.draft;
      if (stash && stashed) {
        const live = stashed.items.filter((it) => !it.removed);
        /* `d…` ids, so an appended line can never collide with `ADD_ITEM`'s `m{seq}` or with the
           first line's `i1`. */
        const items =
          stash.intent === "append"
            ? [...live, directRequestItem(equipment, `d${live.length + 1}`)]
            : [directRequestItem(equipment, live[0]?.id ?? "i1")];
        actions.resumeDirect({
          ...stash.snapshot,
          draft: { ...stashed, items },
          phase: "wizard",
          activeSection: "equipment",
          // Land ON the machine he just picked: the last one either way, since `single` leaves one.
          itemIndex: items.length - 1,
          // He is back on the canvas answering for a new machine, not on the review he may have
          // reached before the errand.
          readyToSend: false,
        });
        return;
      }

      actions.seedDraft(directRequestDraft(equipment));
      return;
    }

    /* No usable triple (an older payload, a half-filled row): the words in the box, the renter's to
       edit. Seeded ONCE and only into an EMPTY box — a renter who has already typed owns what he
       wrote, and a re-render must not push his words back to the machine's name. */
    if (prefill && !text.trim() && seeded.current !== prefill) {
      seeded.current = prefill;
      actions.setText(prefill);
    }
    // `actions` is rebuilt each render but only wraps dispatch; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, supplierName, storeId, prefill, wanted, inDraft, direct, text]);

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
    // Trial is off (owner, 2026-09-06): a bookmarked `?mode=trial` must not create one, so it is
    // read as a real request rather than honoured.
    if (mode === "trial" && !isTrial && TRIAL_REQUESTS_ENABLED) actions.setTrial(true);
    else if ((mode === "real" || !TRIAL_REQUESTS_ENABLED) && isTrial) actions.setTrial(false);
    // `actions` is rebuilt each render but only wraps dispatch; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isTrial]);

  // Suppressed when `mode` settled the choice, and when a saved draft is in play — that renter is
  // resuming an existing request, not starting one, and the draft's continue/start-over prompt owns
  // the screen. `offerStartChoice` is null while unknown → never surfaces (app parity).
  const show = TRIAL_REQUESTS_ENABLED && !mode && !draft && !asked && offerStartChoice === true;

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
