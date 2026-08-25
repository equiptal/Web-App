import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { MachineCard } from "@/components/create/MachineCard";
import { EQUIPMENT_YEARS, FUEL_TYPES, SAFETY_CERTIFICATES, itemGaps, transportGaps } from "@/lib/contract";
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
async function open(handle: Awaited<ReturnType<typeof card>>, name: string) {
  const trigger = screen.getByRole("combobox", { name });
  // Idempotent: the trigger toggles, so opening one that is already open would close it.
  if (trigger.getAttribute("aria-expanded") !== "true") {
    await handle.run(() => trigger.click());
  }
  return screen.getByRole("listbox", { name });
}

async function close(handle: Awaited<ReturnType<typeof card>>, name: string) {
  const trigger = screen.getByRole("combobox", { name });
  if (trigger.getAttribute("aria-expanded") === "true") {
    await handle.run(() => trigger.click());
  }
}

async function optionsOf(handle: Awaited<ReturnType<typeof card>>, name: string): Promise<string[]> {
  const listbox = await open(handle, name);
  const labels = within(listbox)
    .getAllByRole("option")
    .map((o) => o.textContent!.replace(/^check/, "").trim());
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
    expect(screen.getByRole("combobox", { name: "CERTIFICATE" })).toBeTruthy();
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

  it("offers exactly the platform's year bands, with Any year as a real choice", async () => {
    const handle = await card();
    const labels = await optionsOf(handle, "MINIMUM YEAR");
    // Same set, same length — a stray "2021+" would fail here.
    expect(labels).toEqual(["2015+", "2018+", "2020+", "2022+", "Any year"]);
    expect(EQUIPMENT_YEARS.length).toBe(labels.length);
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

describe("logistics terms name the obligation (MREQ-AC-62/63)", () => {
  // The prototype's own labels, since the row layout is the prototype's — but our option wording,
  // which names the act rather than the party.
  it("uses the prototype's labels and our obligation wording", async () => {
    await card();
    expect(screen.getByText("DELIVERY TO SITE")).toBeTruthy();
    expect(screen.getByText("RETURN FROM SITE")).toBeTruthy();
    expect(screen.getByText("FUEL RESPONSIBILITY")).toBeTruthy();
    expect(screen.getByText("We collect")).toBeTruthy();
    expect(screen.getByText("We return")).toBeTruthy();
    expect(screen.getByText("We pay")).toBeTruthy();
    // The bare "Me" is what these replaced.
    expect(screen.queryByText("Me")).toBeNull();
  });

  // All three sit on ONE row, which is what the smaller chip type buys: the two haulage legs share
  // a box as a 2-column grid, and fuel has its own beside it.
  it("keeps all three choices on one row", async () => {
    const { view } = await card();
    const delivery = screen.getByText("DELIVERY TO SITE").closest("div")!.parentElement!;
    const ret = screen.getByText("RETURN FROM SITE").closest("div")!.parentElement!;
    const fuel = screen.getByText("FUEL RESPONSIBILITY").closest("div")!.parentElement!;
    // Delivery and return share a grid; fuel is a sibling box in the same row container.
    // Attribute match rather than a class selector: Tailwind arbitrary values contain brackets
    // that querySelector parses as pseudo-class syntax.
    const row = view.container.querySelector('[class*="2fr_1fr"]');
    expect(row).toBeTruthy();
    for (const el of [delivery, ret, fuel]) expect(row!.contains(el)).toBe(true);
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
