import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { MachineCard } from "@/components/create/MachineCard";
import { equipmentYears, FUEL_TYPES, SAFETY_CERTIFICATES, itemGaps, transportGaps } from "@/lib/contract";
import { makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-12/13/14/15/16 — the machine card's controls, and the vocabularies behind them.
 *
 * The defect worth guarding here is a wrong option list. The prototype offered CE, ISO 9001, a 2021+
 * year band and Net 15/45 — none of which exist on this platform — and a certificate the platform
 * does not recognise becomes a document demanded of every supplier who bids, i.e. a request nobody
 * can answer. So each list is asserted against `options.ts` rather than against a literal.
 */

/** Render the card with the real gap computation, the way Canvas passes it. */
function card(opts: Parameters<typeof renderCanvas>[1] = {}) {
  return renderCanvas(
    (store) => {
      const draft = store.state.draft!;
      const item = draft.items[0];
      return <MachineCard item={item} gaps={[...itemGaps(item, draft), ...transportGaps([item], draft.project)]} shaking={false} />;
    },
    opts,
  );
}

/**
 * Open a dropdown by its accessible name and list what it offers.
 *
 * Queried by role rather than by DOM position: the check glyph beside the selected row is an
 * `aria-hidden` ligature span, so its text is in `textContent` but not in the accessible name. Going
 * through the a11y tree is both more robust and the thing a screen-reader user actually gets.
 */
/**
 * The trigger, whichever kind it is.
 *
 * Certificates became a MULTI-select (owner, 2026-09-01) — the field has always been an array on the
 * draft, on the wire and on the bid form, and only this control disagreed. A multi-select opener is a
 * `button` with `aria-haspopup="listbox"`, not a `combobox`, so the helpers accept both rather than
 * every certificate test learning which one it is.
 */
function triggerFor(name: string) {
  const combo = screen.queryByRole("combobox", { name });
  return combo ?? screen.getByRole("button", { name });
}

async function open(handle: Awaited<ReturnType<typeof card>>, name: string) {
  const trigger = triggerFor(name);
  // Idempotent: the trigger toggles, so opening one that is already open would close it.
  if (trigger.getAttribute("aria-expanded") !== "true") {
    await handle.run(() => trigger.click());
  }
  return screen.getByRole("listbox", name === "CERTIFICATE" ? undefined : { name });
}

async function close(handle: Awaited<ReturnType<typeof card>>, name: string) {
  const trigger = triggerFor(name);
  if (trigger.getAttribute("aria-expanded") === "true") {
    await handle.run(() => trigger.click());
  }
}

async function optionsOf(handle: Awaited<ReturnType<typeof card>>, name: string): Promise<string[]> {
  const listbox = await open(handle, name);
  const labels = within(listbox)
    .getAllByRole("option")
    // The longest ligature first: "check_box_outline_blank" starts with "check", so stripping the
    // short one leaves "_box_outline_blank" glued to the label.
    .map((o) => o.textContent!.replace(/^(check_box_outline_blank|check_box|check)/, "").trim());
  await close(handle, name);
  return labels;
}

async function pick(handle: Awaited<ReturnType<typeof card>>, name: string, option: string) {
  const listbox = await open(handle, name);
  await handle.run(() => within(listbox).getByRole("option", { name: option }).click());
}

describe("the four overlay controls (MREQ-AC-16)", () => {
  // These sit ON the machine panel, where the prototype gives them no visible label — the control
  // itself carries the meaning. So they are addressed by accessible name, which is also the only
  // thing a screen-reader user gets, and the reason SearchSelect grew a `label` prop.
  it("renders certificate, quantity, fuel and minimum year", async () => {
    await card();
    // A multi-select opener: `button` + aria-haspopup, not a combobox.
    expect(screen.getByRole("button", { name: "CERTIFICATE" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "FUEL" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "MINIMUM YEAR" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "QUANTITY +" })).toBeTruthy();
  });

  it("floors the quantity stepper at one (MREQ-AC-16)", async () => {
    const handle = await card();
    const minus = screen.getByRole("button", { name: "QUANTITY −" });
    await handle.run(() => minus.click());
    await handle.run(() => minus.click());
    expect(handle.store().state.draft!.items[0].quantity).toBe(1);
    // At the floor it is disabled rather than silently doing nothing.
    expect(minus.hasAttribute("disabled")).toBe(true);
  });

  it("counts up from the panel chip", async () => {
    const handle = await card();
    await handle.run(() => screen.getByRole("button", { name: "QUANTITY +" }).click());
    expect(handle.store().state.draft!.items[0].quantity).toBe(2);
    expect(screen.getByText("×2")).toBeTruthy();
  });
});

describe("option lists come from the contract (MREQ-AC-17/18/19)", () => {
  it("offers exactly the platform's fuel types", async () => {
    const handle = await card();
    expect(await optionsOf(handle, "FUEL")).toEqual(["Diesel", "Electric"]);
    expect(FUEL_TYPES).toEqual(["diesel", "electric"]);
  });

  it("offers the app's own years — every one from 2010 to now, newest first, Any leading", async () => {
    /**
     * ⚠️ This used to assert the bands `2015+ … 2022+` and call them "the platform's". They were
     * this app's alone: `year_stepper.dart` offers every year from 2010 to the current one, and the
     * backend stores a plain number. A renter on the web could only ask for something the app has no
     * way to express (owner, 2026-09-01).
     */
    const handle = await card();
    const labels = await optionsOf(handle, "MINIMUM YEAR");
    const thisYear = new Date().getFullYear();

    expect(labels[0]).toBe("Any year");
    expect(labels[1]).toBe(String(thisYear));
    expect(labels[labels.length - 1]).toBe("2010");
    // Computed, so it is right every January rather than silently missing the newest year.
    expect(labels.length).toBe(equipmentYears().length);
    expect(labels).not.toContain("2018+");
  });

  it("offers the platform's certificates plus an explicit No certificate", async () => {
    const handle = await card();
    const labels = await optionsOf(handle, "CERTIFICATE");
    expect(labels[0]).toBe("No certificate");
    expect(labels.slice(1)).toEqual(["TÜV", "Aramco Certified", "Other"]);
    expect(SAFETY_CERTIFICATES).toEqual(["tuv", "aramco", "other"]);
    // The prototype's inventions must not be reachable.
    for (const invented of ["CE", "ISO 9001", "SASO"]) expect(labels).not.toContain(invented);
  });

  it("takes more than one certificate, because the field has always been a list", async () => {
    /**
     * The defect this closes: a renter needing TÜV AND Aramco could ask for one of them, and found
     * out which half he had lost at the bids. `safety_certificates` is an array on the draft, on the
     * wire, and on the bid form where a supplier confirms each cert on its own row.
     */
    const handle = await card();
    await pick(handle, "CERTIFICATE", "TÜV");
    await pick(handle, "CERTIFICATE", "Aramco Certified");

    expect(handle.store().state.draft!.items[0].safetyCertsOverride).toEqual(["tuv", "aramco"]);
  });

  it("un-ticks one without losing the other", async () => {
    const handle = await card();
    await pick(handle, "CERTIFICATE", "TÜV");
    await pick(handle, "CERTIFICATE", "Aramco Certified");
    await pick(handle, "CERTIFICATE", "TÜV");

    expect(handle.store().state.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
  });

  it("stores No certificate as an explicit empty list, and records the answer (MREQ-AC-55)", async () => {
    const handle = await card();
    await pick(handle, "CERTIFICATE", "No certificate");

    const item = handle.store().state.draft!.items[0];
    expect(item.safetyCertsOverride).toEqual([]);
    expect(handle.store().state.draft!.touchedFields).toContain(`line_items[${item.id}].safety_certificates`);
  });

  it("maps Any year to the literal 'any', which yearOut turns into null (MREQ-AC-55)", async () => {
    const handle = await card();
    await pick(handle, "MINIMUM YEAR", "Any year");
    expect(handle.store().state.draft!.items[0].equipmentYear).toBe("any");
  });
});

describe("taxonomy — one pick, category derived (MREQ-AC-20/21)", () => {
  it("shows the resolved names, never a hardcoded label", async () => {
    await card();
    expect(screen.getByText("Crawler excavator")).toBeTruthy();
    expect(screen.getByText("30 ton")).toBeTruthy();
    // CATEGORY renders the taxonomy's `tag`, which is what the prototype shows there.
    expect(screen.getByText("Earthmoving")).toBeTruthy();
  });

  // The renter picks a TYPE and nothing else, so the list spans every category rather than being
  // scoped to one that has not been chosen yet.
  it("lists every subtype across all categories", async () => {
    const handle = await card();
    expect(await optionsOf(handle, "TYPE")).toEqual(["Crawler excavator", "Wheel loader", "Mobile crane"]);
  });

  it("offers no category control at all — it is derived", async () => {
    await card();
    expect(screen.getByText("CATEGORY")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "CATEGORY" })).toBeNull();
  });

  it("sets BOTH ids from one pick, and re-tags the category", async () => {
    const handle = await card();
    await pick(handle, "TYPE", "Mobile crane");

    const ref = handle.store().state.draft!.items[0].ref;
    expect(ref.subcategoryId).toBe("sub-mobile-crane");
    expect(ref.categoryId).toBe("cat-lifting");
    // The derived category follows, shown as that branch's tag.
    expect(screen.getByText("Lifting, Cranes & Aerial")).toBeTruthy();
    expect(handle.store().state.draft!.touchedFields).toContain("line_items[a0].subtype");
  });

  it("cascades the size list to the newly chosen subtype", async () => {
    const handle = await card();
    await pick(handle, "TYPE", "Mobile crane");
    expect(await optionsOf(handle, "SIZE")).toEqual(["50 ton"]);
  });

  it("disables size until a type is chosen", async () => {
    await card({
      draft: makeAgentDraft({ items: [makeItem({ ref: { categoryId: "cat-earth", subcategoryId: null, measurementId: null } })] }),
    });
    expect(screen.getByRole("combobox", { name: "SIZE" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("attachments (MREQ-AC-22)", () => {
  it("renders the admin list and defaults the pre-selected rows on", async () => {
    const handle = await card({
      attachments: [
        { id: "att-bucket", name: "Standard bucket", nameAr: "دلو قياسي", preSelected: true },
        { id: "att-breaker", name: "Rock breaker", nameAr: "مطرقة" },
      ],
    });
    expect(screen.getByText("ATTACHMENT")).toBeTruthy();
    expect(screen.getByText("Rock breaker")).toBeTruthy();
    expect(handle.store().state.draft!.items[0].attachmentIds).toEqual(["att-bucket"]);
  });

  it("hides the section entirely when the subtype has none", async () => {
    await card({ attachments: [] });
    expect(screen.queryByText("ATTACHMENT")).toBeNull();
  });

  it("offers no free-text path — selection is from the admin set only", async () => {
    await card({ attachments: [{ id: "att-bucket", name: "Standard bucket", nameAr: "دلو" }] });
    const section = screen.getByText("ATTACHMENT").closest("div")!.parentElement!;
    expect(section.querySelector("input")).toBeNull();
  });
});

describe("crane-only work type (MREQ-AC-23)", () => {
  it("appears for a crane subtype", async () => {
    await card({
      draft: makeAgentDraft({
        items: [makeItem({ ref: { categoryId: "cat-lifting", subcategoryId: "sub-mobile-crane", measurementId: "cap-50t" } })],
      }),
    });
    expect(screen.getByText("WORK TYPE")).toBeTruthy();
  });

  it("does not appear for an excavator", async () => {
    await card();
    expect(screen.queryByText("WORK TYPE")).toBeNull();
  });
});

describe("logistics — the prototype's labels and options (MREQ-AC-62/63)", () => {
  it("uses the prototype's wording throughout", async () => {
    await card();
    expect(screen.getByText("DELIVERY TO SITE")).toBeTruthy();
    expect(screen.getByText("RETURN FROM SITE")).toBeTruthy();
    expect(screen.getByText("FUEL RESPONSIBILITY")).toBeTruthy();
    // Three choices, each Supplier then Me — never the other way round.
    expect(screen.getAllByRole("button", { name: "Supplier" }).length).toBe(3);
    expect(screen.getAllByRole("button", { name: "Me" }).length).toBe(3);
  });

  // `PARTIES` is ["me","supplier"], so mapping it in array order silently reversed every pair.
  it("puts Supplier before Me in every pair", async () => {
    await card();
    for (const label of ["DELIVERY TO SITE", "RETURN FROM SITE", "FUEL RESPONSIBILITY"]) {
      const field = screen.getByText(label).closest("div")!.parentElement!;
      const names = within(field)
        .getAllByRole("button")
        .map((b) => b.textContent!.trim());
      expect(names).toEqual(["Supplier", "Me"]);
    }
  });

  // All three sit on ONE row: the two haulage legs share a box, fuel has its own beside it.
  it("keeps all three choices on one row", async () => {
    const { view } = await card();
    const row = view.container.querySelector('[class*="2fr_1fr"]');
    expect(row).toBeTruthy();
    for (const label of ["DELIVERY TO SITE", "RETURN FROM SITE", "FUEL RESPONSIBILITY"]) {
      expect(row!.contains(screen.getByText(label))).toBe(true);
    }
  });
});

describe("an item the marketplace cannot supply (MREQ-AC-24)", () => {
  it("shows the red panel and hands off to WhatsApp without dropping the row", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const handle = await card({
      draft: makeAgentDraft({ items: [makeItem({ verdict: "no-match", rawLabel: "40 ton wheel digger" })] }),
    });

    expect(screen.getByText(/isn't available from suppliers right now/)).toBeTruthy();
    // The taxonomy controls are replaced, not merely annotated.
    expect(screen.queryByText("TYPE")).toBeNull();

    await handle.run(() => {
      screen.getByText(/Message us on WhatsApp/).closest("button")!.click();
    });

    expect(open).toHaveBeenCalledOnce();
    expect(String(open.mock.calls[0][0])).toContain("wa.me");
    const item = handle.store().state.draft!.items[0];
    expect(item.sourcingRequested).toBe(true);
    expect(item.removed).toBe(false); // the row stays visible
    expect(screen.getByText(/We're looking for this one/)).toBeTruthy();
  });
});

/**
 * MREQ — which way a dropdown opens.
 *
 * jsdom has no layout engine, so `getBoundingClientRect` returns zeros and every control looks like
 * it has the whole viewport beneath it. The geometry is stubbed here to exercise the decision, which
 * is the only part that can be tested without a renderer — that the list actually lands on screen is
 * a thing only a real browser can confirm.
 */
describe("the option list opens where it can be read", () => {
  const atViewportY = (top: number) => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top,
      bottom: top + 34,
      left: 0,
      right: 120,
      width: 120,
      height: 34,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect);
  };

  /* The list is a PORTAL on `document.body` since 2026-09-01 — an absolute list was clipped by the
     nearest scroll box, and half this app's lists live in one. So the direction is no longer a
     Tailwind class on a relative box; it is a `top` in viewport pixels, which is what these read.
     The control is stubbed at y=700 with a height of 34, so `bottom` is 734. */
  const topOf = (listbox: HTMLElement) => Number.parseFloat(listbox.parentElement!.style.top);

  it("opens upward when the control sits near the bottom of the viewport", async () => {
    // 768-tall jsdom viewport; a control at 700 has ~34px below it and 700 above.
    atViewportY(700);
    const handle = await card();
    const listbox = await open(handle, "MINIMUM YEAR");
    // Above the trigger's own top edge, never below its bottom.
    expect(topOf(listbox)).toBeLessThan(700);
  });

  it("opens downward when there is room", async () => {
    atViewportY(80);
    const handle = await card();
    const listbox = await open(handle, "MINIMUM YEAR");
    // Just under the trigger's bottom edge (80 + 34 + a 4px gap).
    expect(topOf(listbox)).toBe(118);
  });

  // A cramped viewport must not send the list somewhere even worse than below.
  it("stays downward when neither side has room", async () => {
    atViewportY(20);
    const handle = await card();
    const listbox = await open(handle, "MINIMUM YEAR");
    expect(topOf(listbox)).toBe(58);
  });
});
