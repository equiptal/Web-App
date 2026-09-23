// @vitest-environment jsdom
//
// The stash lives in `sessionStorage`, so this file needs a DOM. The config's default is `node`
// and only `.test.tsx` gets jsdom by glob, deliberately — a logic test that drifts into needing a
// DOM has to say so, which is what this line is.
import { beforeEach, describe, expect, it } from "vitest";
import { clearDirectStash, consumeDirectStash, saveDirectStash } from "@/lib/agent/direct-stash";
import { directRequestItem } from "@/lib/agent/direct-draft";
import { initialState, reducer } from "@/lib/store/rfq-store";
import { defaultPreferences, defaultProjectDetails, newManualItem } from "@/lib/contract/draft";
import type { RfqState } from "@/lib/store/rfq-store";
import type { RfqDraft } from "@/lib/contract/draft";

/**
 * ── Changing the machine on a DIRECT request is a trip to the supplier's store ───────────────────
 *
 * Owner, 2026-09-12: *"in direct request he cant change the taxonamy right? it is filled from
 * equipment he selected so if he want to change will be back to store"*, then *"match the app"*.
 *
 * The app has done it this way since Epic 008: in direct mode the ✕ on the only equipment tab
 * stashes the wizard state with `intent: single` and pushes the supplier's store, the + stashes with
 * `intent: append`, and the machine picked there comes back as the tab (AC-02 / AC-04).
 *
 * The stash is not a nicety. `/create` deliberately REFUSES to rehydrate a stored draft when the URL
 * names a supplier — the 2026-09-10 fix, because the stored intake phase was overwriting the machine
 * the renter had just pressed — so without this everything he had answered would be gone on the way
 * back, and he would return to a bare one-item draft.
 */

const LISTING = {
  categoryId: "cat-earth",
  subtypeId: "sub-crawler",
  capacityId: "cap-30",
  label: "Crawler excavator 30 ton",
  fuel: "DIESEL",
  year: 2021,
};
const OTHER_LISTING = { ...LISTING, subtypeId: "sub-boom", capacityId: "cap-10", label: "Boom truck 10 ton" };

/** A draft mid-flow: one machine answered, and a site the renter chose. */
function answeredDraft(): RfqDraft {
  const project = defaultProjectDetails();
  project.location = { label: "Qiddiya, Riyadh", confirmed: true } as RfqDraft["project"]["location"];
  return {
    rfqId: null,
    project,
    items: [{ ...newManualItem("i1"), ref: { categoryId: "cat-earth", subcategoryId: "sub-crawler", measurementId: "cap-30" } }],
    preferences: defaultPreferences(),
    detectedLocations: [],
    summary: "",
    justifications: [],
    fieldNotes: {},
    touchedFields: ["items.i1.safety_certificates"],
  } as unknown as RfqDraft;
}

function snapshotOf(draft: RfqDraft): Partial<RfqState> {
  return { phase: "wizard", activeSection: "equipment", itemIndex: 0, draft, text: "", direct: { supplierId: "42", supplierName: "Abr Alkhalij", storeId: "s1" } };
}

beforeEach(() => {
  clearDirectStash();
});

describe("the stash", () => {
  it("comes back for the SAME supplier, and once", () => {
    saveDirectStash({ intent: "single", supplierId: "42", snapshot: snapshotOf(answeredDraft()) });
    const first = consumeDirectStash("42");
    expect(first?.intent).toBe("single");
    expect(first?.snapshot.draft?.project.location.label).toBe("Qiddiya, Riyadh");
    // Reading it CLEARS it: a stash is one errand, and a spent one left behind is how the next,
    // unrelated direct request would inherit these answers.
    expect(consumeDirectStash("42")).toBeNull();
  });

  it("is refused for a DIFFERENT supplier, and does not survive the attempt", () => {
    saveDirectStash({ intent: "append", supplierId: "42", snapshot: snapshotOf(answeredDraft()) });
    // He did not come back from the errand — he started a direct request somewhere else entirely.
    expect(consumeDirectStash("99")).toBeNull();
    expect(consumeDirectStash("42")).toBeNull();
  });

  it("is refused once it is stale", () => {
    const snapshot = snapshotOf(answeredDraft());
    saveDirectStash({ intent: "single", supplierId: "42", snapshot });
    // 31 minutes later: a tab left open overnight must not merge yesterday's answers into today's.
    const raw = JSON.parse(sessionStorage.getItem("mt_direct_stash") as string) as { savedAt: number };
    sessionStorage.setItem(
      "mt_direct_stash",
      JSON.stringify({ ...raw, savedAt: Date.now() - 31 * 60 * 1000 }),
    );
    expect(consumeDirectStash("42")).toBeNull();
  });
});

/**
 * The merge itself. `/create` does this inline, so these assert the SHAPE it builds — one line for
 * `single`, one more line for `append` — and that `RESUME_DIRECT` restores it without touching the
 * answers or raising the reload prompt.
 */
describe("what comes back from the store", () => {
  it("«single» REPLACES the line, keeping its id and everything else on the draft", () => {
    const stashed = answeredDraft();
    const live = stashed.items.filter((it: RfqDraft["items"][number]) => !it.removed);
    const items = [directRequestItem(OTHER_LISTING, live[0]?.id ?? "i1")];

    const next = reducer(
      { ...initialState, draft: null },
      { t: "RESUME_DIRECT", saved: { ...snapshotOf({ ...stashed, items }), phase: "wizard", itemIndex: 0 } },
    );

    expect(next.draft?.items).toHaveLength(1);
    expect(next.draft?.items[0].id).toBe("i1");
    expect(next.draft?.items[0].ref.subcategoryId).toBe("sub-boom");
    // The site he had already chosen is still there — the whole point of the stash.
    expect(next.draft?.project.location.label).toBe("Qiddiya, Riyadh");
    // And so is which answers were HIS: «no certificate» is stored as absent, so losing this would
    // make the gate ask for a certificate he had already declined.
    expect(next.draft?.touchedFields).toContain("items.i1.safety_certificates");
  });

  it("«append» ADDS the machine beside the ones he already has", () => {
    const stashed = answeredDraft();
    const live = stashed.items.filter((it: RfqDraft["items"][number]) => !it.removed);
    const items = [...live, directRequestItem(OTHER_LISTING, `d${live.length + 1}`)];

    const next = reducer(
      { ...initialState, draft: null },
      { t: "RESUME_DIRECT", saved: { ...snapshotOf({ ...stashed, items }), itemIndex: items.length - 1 } },
    );

    expect(next.draft?.items.map((it) => it.ref.subcategoryId)).toEqual(["sub-crawler", "sub-boom"]);
    // `d…` so an appended line can never collide with ADD_ITEM's `m{seq}` or with the first line's `i1`.
    expect(next.draft?.items[1].id).toBe("d2");
    // He lands ON the machine he just picked.
    expect(next.itemIndex).toBe(1);
  });

  it("does NOT raise the continue/start-over prompt", () => {
    /**
     * That prompt belongs to a RELOAD, where «is this still the request you meant?» is a real
     * question. This is not one: he pressed the ✕ thirty seconds ago, went to pick a machine, and
     * picked one. `HYDRATE` would ask him about his own last two presses.
     */
    const next = reducer({ ...initialState, draft: null }, { t: "RESUME_DIRECT", saved: snapshotOf(answeredDraft()) });
    expect(next.draftPrompt).toBeFalsy();
    expect(next.phase).toBe("wizard");
  });
});
