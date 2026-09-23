import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * What the request EDIT form may change — the app's line, drawn in this repo.
 *
 * Owner, 2026-09-14: *"why i cant edit a location of a request?"*, then *"follow the app, all fields
 * editable except taxonomy right"*.
 *
 * The app locks exactly two ids (`bug/post-bid-request-editing.md`, pin 3), twice over:
 *  · `equipment_step.dart` refuses the category picker, the ✕ on the only tab and the + in edit mode;
 *  · `_onEquipmentItemUpdated` copies the OLD `categoryId` / `subtypeId` back over any incoming item,
 *    and its own comment adds *"every other field on the item … stays freely editable"*.
 * `capacityId` is NOT in that backstop, and the capacity chooser renders on
 * `caps.length >= 2 && !isDirect` with no edit-mode condition — so SIZE is editable there.
 * The location rides the app's own edit PATCH (`projectLat` / `projectLng` / `projectAddressLabel`),
 * and `updateRequestSchema` accepts all three.
 *
 * ⚠️ Read from the SOURCE rather than rendered. This modal pulls a `Dialog`, six `Dropdown`s, a
 * `next/dynamic` Google Maps picker, an attachment fetch and a taxonomy fetch; a render test would
 * mock five things to assert one ruling about which fields exist. What is under test here is that
 * ruling.
 */

const SRC = resolve(__dirname, "../../src");
const form = readFileSync(resolve(SRC, "components/requests/RequestEditModals.tsx"), "utf8");
/** The edit form only — `ConfirmCancelModal` shares the file and shares none of these rules. */
const editForm = form.slice(form.indexOf("export function EditRequestModal"));

describe("the taxonomy is the one thing the edit form may not change", () => {
  it("Given the item patch, Then category and type are read off the RECORD, never off a control", () => {
    /**
     * 🔴 The whole lock is this line. Both ids come from `it!` — the stored item — so there is no
     * control that could move them and no branch where a changed id could reach the wire.
     */
    expect(editForm).toContain("categoryId: it!.categoryId as string");
    expect(editForm).toContain("subtypeId: it!.subtypeId as string");
  });

  it("Given the form's state, Then nothing holds a category or a type to be picked", () => {
    // A `useState` for either id is the shape the lock would break in, so it is forbidden outright.
    expect(editForm).not.toMatch(/setCategoryId/);
    expect(editForm).not.toMatch(/setSubtypeId/);
  });

  it("Given the equipment section, Then there is no add or remove for an equipment", () => {
    /**
     * The app blocks both in edit mode, because either changes the request's category/type SET. This
     * modal never offered them — it edits the one fanned-out item it was opened on — and the case
     * exists so that stays true.
     */
    expect(editForm).not.toMatch(/equipmentItems:\s*\[\s*\.\.\./);
  });
});

describe("the SIZE is editable, because it is in the app", () => {
  it("Given the item patch, Then the capacity comes from the renter's pick", () => {
    // Falling back to the stored id, so a catalogue that has not loaded cannot blank the size.
    expect(editForm).toContain("capacityId: capacityId || (it!.capacityId as string)");
  });

  it("Given a type with one size, Then no control is drawn", () => {
    // `caps.length >= 2`, the app's own condition. A dropdown holding the only answer does nothing.
    expect(editForm).toContain("sizeOpts.length >= 2");
  });

  it("Given the size list, Then it holds only the sizes under THIS item's own type", () => {
    /**
     * ⚠️ Scoped to the locked subtype on purpose. Listing the whole catalogue would offer picks the
     * save has to refuse, which is a control that lies about what it can do.
     */
    expect(editForm).toMatch(/find\(\(sc\) => sc\.id === it\.subtypeId\)/);
  });

  it("Given an off-catalogue line, Then no catalogue is fetched and no size is offered", () => {
    // Such a line has no subtype at all — there is nothing to list.
    expect(editForm).toContain("if (offCatalogue || !it?.subtypeId) return;");
  });
});

describe("the SITE is editable, through the picker and never through a text box", () => {
  it("Given the Where section, Then it draws the create flow's own map picker", () => {
    expect(form).toContain('import("@/components/shared/GoogleMapLocationPicker")');
    expect(editForm).toContain("<MapLocationPicker");
  });

  it("Given a moved pin, Then the point and the words are written together", () => {
    /**
     * 🔴 The reason this was read-only until now: a label edited without its coordinates leaves the
     * words naming one place while every distance, pin and supplier match is computed from another.
     * One guard covers all three fields, so they cannot part.
     */
    const guard = editForm.slice(editForm.indexOf("if (lat != null && lng != null) {"));
    expect(guard.slice(0, 400)).toContain("patch.projectLat = lat");
    expect(guard.slice(0, 400)).toContain("patch.projectLng = lng");
    expect(guard.slice(0, 400)).toContain("patch.projectAddressLabel");
  });

  it("Given a label with no pin behind it, Then nothing about the site is sent", () => {
    // The label assignment is INSIDE the coordinate guard, which is what makes that true.
    const labelAt = editForm.indexOf("patch.projectAddressLabel");
    const guardAt = editForm.indexOf("if (lat != null && lng != null) {");
    expect(guardAt).toBeGreaterThan(-1);
    expect(labelAt).toBeGreaterThan(guardAt);
  });

  it("Given the old read-only note, Then it is gone from both locales", () => {
    expect(form).not.toContain("so it is not edited here");
    expect(form).not.toContain("لذلك لا يُعدَّل من هنا");
  });
});

describe("a pin outside Saudi Arabia is refused before the press, not after it", () => {
  it("Given the bounds, Then they are the backend's own", () => {
    /**
     * `saudiProjectLat` / `saudiProjectLng` in `apps/backend/src/validators/request.schema.ts`:
     * 16 … 32.5 and 34.5 … 56. A pin outside them is a 422.
     */
    expect(form).toContain("latMin: 16");
    expect(form).toContain("latMax: 32.5");
    expect(form).toContain("lngMin: 34.5");
    expect(form).toContain("lngMax: 56");
  });

  it("Given such a pin, Then Save is disabled AND the save returns early", () => {
    /**
     * ⚠️ Both, because this form's save ends in a bare `catch` that only clears the busy flag: a 422
     * here would look exactly like a save that worked. The refusal has to happen on this side.
     */
    expect(editForm).toContain("disabled={busy || datesReversed || outsideSaudi}");
    expect(editForm).toContain("if (datesReversed || outsideSaudi) return;");
  });

  it("Given such a pin, Then the renter is told which way to move it", () => {
    expect(editForm).toContain("That pin is outside Saudi Arabia");
  });
});
