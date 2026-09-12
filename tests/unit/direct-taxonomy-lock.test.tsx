import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Canvas } from "@/components/create/Canvas";
import { en } from "@/lib/i18n/en";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";
import type { useRfq } from "@/lib/store/rfq-store";

/**
 * ── A DIRECT request's machine is the LISTING's (app parity, Epic 008 AC-01) ────────────────────
 *
 * Owner, 2026-09-12: *"in direct request he cant change the taxonamy right? it is filled from
 * equipment he selected so if he want to change will be back to store"*, then *"match the app"*.
 *
 * The app hides the size-edit badge when `isDirect` — *"the measurement is locked from the listing
 * prefill"* — and hides the «need a different type» section outright, for the reason its own comment
 * gives: *"direct-mode rentees are tied to one supplier; offering siblings under the same parent
 * category could route them to a subcategory the supplier doesn't carry."*
 *
 * The web had no direct-mode branch at all: type and size were ordinary dropdowns, so a renter could
 * turn the crawler excavator he tapped into a forklift while the ribbon above still promised the
 * request went to that one supplier.
 */

/**
 * ⚠️ `SET_DIRECT` DROPS the draft when the target changes — *"the draft in hand belongs to the other
 * request"* — so naming the supplier after the draft has landed would leave nothing on screen. That
 * is right in the app and wrong for a fixture, so this puts the draft straight back through
 * `RESUME_DIRECT`, which is the same door `/create` uses coming back from the store.
 */
const asDirect = (store: ReturnType<typeof useRfq>) => {
  const keep = store.state.draft;
  store.actions.setDirect({ supplierId: "42", supplierName: "Abr Alkhalij", storeId: "s1" });
  store.actions.resumeDirect({ draft: keep, phase: "wizard", activeSection: "equipment", itemIndex: 0 });
};

const draft = () => makeAgentDraft({ items: [makeItem({ id: "a0" })], project: confirmedProject() });

/**
 * The two taxonomy controls, read by their accessible NAME so the copy can move without this moving.
 * `Dropdown` is a `combobox`, not a button — the ✕ below is the button.
 */
const typeBox = () => screen.getByRole("combobox", { name: new RegExp(en.create.machineCard.type, "i") });
const sizeBox = () => screen.getByRole("combobox", { name: new RegExp(en.create.machineCard.size, "i") });

describe("the taxonomy on a direct request", () => {
  it("Given the request goes to one supplier, Then type and size cannot be changed here", async () => {
    await renderCanvas(<Canvas />, { draft: draft(), prepare: asDirect });
    expect(typeBox().hasAttribute("disabled")).toBe(true);
    expect(sizeBox().hasAttribute("disabled")).toBe(true);
  });

  it("Given an ordinary broadcast, Then both are pickable as before", async () => {
    /**
     * The lock is about the ONE supplier, not about a machine that arrived pre-filled. A broadcast
     * reaches every firm that matches, so re-picking the type is the renter's to do.
     */
    await renderCanvas(<Canvas />, { draft: draft() });
    expect(typeBox().hasAttribute("disabled")).toBe(false);
    expect(sizeBox().hasAttribute("disabled")).toBe(false);
  });
});

describe("changing it anyway", () => {
  it("Given the only equipment, Then its ✕ offers the STORE rather than a removal", async () => {
    /**
     * AC-04. On a broadcast the ✕ is withheld on the only equipment — `gate.noItems` refuses a
     * request with none, so the press would lead nowhere but a refusal. On a direct request it is
     * the one way to change the machine, and it swaps rather than removes: the draft is stashed
     * whole and the pick made at the store replaces this line on return.
     */
    await renderCanvas(<Canvas />, { draft: draft(), prepare: asDirect });
    const swap = screen.getByRole("button", { name: /change/i });
    expect(swap).toBeTruthy();
    // It does not say «Remove»: that would describe neither the press nor what comes back.
    expect(screen.queryByRole("button", { name: /^remove/i })).toBeNull();
  });

  it("Given a broadcast with one equipment, Then there is no ✕ at all", async () => {
    await renderCanvas(<Canvas />, { draft: draft() });
    expect(screen.queryByRole("button", { name: /change/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^remove/i })).toBeNull();
  });
});
