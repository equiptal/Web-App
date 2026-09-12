import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchChart, listTemplates } from "@/lib/api/client";

/**
 * **A machine the catalogue cannot name still has a name** (owner, 2026-09-08: *"some request items
 * aren't shown in the project if they were undefined, so let it read from the equipment taxonomy of
 * the request or the new column, custom type, as free text"*).
 *
 * `getChart` labels a request's item from its taxonomy pair alone — `label(subtypeId, capacityId)` —
 * and an off-catalogue line has NEITHER id, so `label` arrives `null` and the chart row drew an
 * empty name with the request's code as the only thing on it. The same handler already falls back to
 * `rawLabel` for a work order's machines; only the request branch never did.
 *
 * The projection is the proper place for it and a ticket is out. What these pin is the web's half:
 * the free-text name is READ from the payload under any of the spellings the platform uses, so the
 * renter's own words appear the moment the column is selected, with no second change here.
 */

const payload = (items: Record<string, unknown>[]) => ({
  project: { id: "p-1", locationLabel: "Riyadh, Saudi Arabia", version: 3 },
  version: 3,
  groups: [{ kind: "request", id: "r-1", ref: "JTR080920", title: null, when: null, items }],
  documents: [],
});

const serve = (body: unknown) =>
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );

const firstItem = async () => (await fetchChart("p-1")).groups[0].items[0];

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("naming a chart item", () => {
  it("keeps the catalogue's name when there is one", async () => {
    serve(payload([{ id: "r-1", label: "Crawler Excavator 20 ton", labelAr: "حفارة زاحفة 20 طن", quantity: 2, awards: [] }]));
    const item = await firstItem();
    expect(item.label).toBe("Crawler Excavator 20 ton");
    expect(item.labelAr).toBe("حفارة زاحفة 20 طن");
  });

  it("falls back to the request's free-text column", async () => {
    // The reported case: no taxonomy pair, so the projection sends label: null.
    serve(payload([{ id: "r-1", label: null, labelAr: null, customEquipmentName: "Floating crane barge", quantity: 1, awards: [] }]));
    const item = await firstItem();
    expect(item.label).toBe("Floating crane barge");
  });

  it("serves both languages from the renter's own words", async () => {
    // He typed his machine in one language; there is no translation of it to prefer.
    serve(payload([{ id: "r-1", label: null, labelAr: null, customEquipmentName: "Floating crane barge", quantity: 1, awards: [] }]));
    expect((await firstItem()).labelAr).toBe("Floating crane barge");
  });

  it("accepts the snake_case spelling, since the column is read straight off a row", async () => {
    serve(payload([{ id: "r-1", label: null, custom_equipment_name: "Jeep truck", quantity: 1, awards: [] }]));
    expect((await firstItem()).label).toBe("Jeep truck");
  });

  it("joins a work order's raw label and size, as that branch already sends them", async () => {
    serve(payload([{ id: "w-1", label: null, rawLabel: "Boom truck", rawSize: "12 ton", quantity: 1, awards: [] }]));
    expect((await firstItem()).label).toBe("Boom truck 12 ton");
  });

  it("leaves the name null when nothing at all carries one", async () => {
    // The row then says «Equipment (not named)» rather than drawing a blank — `ChartRow` does that,
    // because a nameless row reads as a failed load.
    serve(payload([{ id: "r-1", label: null, quantity: 1, awards: [] }]));
    expect((await firstItem()).label).toBeNull();
  });

  it("does not mistake a blank string for a name", async () => {
    serve(payload([{ id: "r-1", label: "   ", customEquipmentName: "Floating crane barge", quantity: 1, awards: [] }]));
    expect((await firstItem()).label).toBe("Floating crane barge");
  });

  it("gives Arabic the English name rather than nothing, when the projection sends only one", async () => {
    /* The work-order branch of `getChart` fills `labelAr` from the catalogue alone, so an
       off-catalogue work order arrives named in `label` with `null` beside it — while a request now
       carries the typed name in both. Same screen, two shapes; this makes them one on arrival. */
    serve(payload([{ id: "w-1", label: "Boom truck 12 ton", labelAr: null, quantity: 1, awards: [] }]));
    expect((await firstItem()).labelAr).toBe("Boom truck 12 ton");
  });

  it("keeps everything else on the item and the group untouched", async () => {
    serve(payload([{ id: "r-1", label: "Excavator", quantity: 3, awards: [], terms: { operator: "YES" } }]));
    const chart = await fetchChart("p-1");
    expect(chart.groups[0].ref).toBe("JTR080920");
    expect(chart.groups[0].items[0].quantity).toBe(3);
    expect(chart.groups[0].items[0].terms).toEqual({ operator: "YES" });
  });

  it("survives a payload with no groups at all", async () => {
    serve({ project: { id: "p-1", locationLabel: "Riyadh", version: 1 }, version: 1 });
    expect((await fetchChart("p-1")).groups).toEqual([]);
  });
});

/**
 * ── «12 × null», typed into the renter's own request (owner, 2026-09-12) ────────────────────────
 * *"still why the equipment name doesn't appear here, why showing null"*.
 *
 * When NOTHING can name the machine — no taxonomy pair and no free-text column either, which is the
 * request branch of the projection as it stands — `chartItemName` returns null, and `ChartRow` has
 * always said «Equipment (not named)» for it. Nothing else knew the null was possible, because
 * `ChartItem.label` was typed `string` and the cast in `fetchChart` laundered it: `listTemplates`
 * copied it into `TemplateOption.machine`, and `ProjectChips` interpolated that into a line it TYPED
 * into the request box. `${null}` is the four characters «null», and `trim()` reports them as a
 * perfectly good line — so the renter's own words reached the agent reading «12 × null».
 */
describe("a machine nothing can name", () => {
  it("comes back as NULL rather than as a name, so every reader has to decide", async () => {
    serve(payload([{ id: "r-1", label: null, labelAr: null, quantity: 12, awards: [] }]));
    const item = await firstItem();
    expect(item.label).toBeNull();
    expect(item.labelAr).toBeNull();
    // Never the STRING. This is the value that reached the request box.
    expect(item.label as unknown as string).not.toBe("null");
  });

  it("reaches a template as null, never as the word", async () => {
    serve(payload([{ id: "r-1", label: null, labelAr: null, quantity: 12, awards: [] }]));
    const [tpl] = await listTemplates("p-1");
    expect(tpl.machine).toBeNull();
    // What `ProjectChips` used to build out of it, and must never build again.
    expect(`${tpl.quantity} × ${tpl.machine}`).toBe("12 × null");
  });

  it("still carries the rest of the template, because terms are keyed on the item and not its name", async () => {
    serve(payload([{ id: "r-1", label: null, quantity: 12, awards: [] }]));
    const [tpl] = await listTemplates("p-1");
    expect(tpl.itemId).toBe("r-1");
    expect(tpl.quantity).toBe(12);
    // The picker falls back to the request's ref, which is why the DROPDOWN read correctly all along
    // while the typed line did not.
    expect(tpl.ref).toBe("JTR080920");
  });
});
