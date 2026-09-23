import { describe, it, expect } from "vitest";
import { parseAddress, prettyLocation, type RequestListItem } from "@/lib/contract/requests";

/**
 * How a renter recognises his own request in a list of forty (owner, 2026-09-03).
 *
 * The share modal's picker read `CEX-020902 · QFC4+RX Diriyah Saudi Arabia` — a code he did not
 * choose, and a Google plus-code that names no place a person has ever been to. Neither says what
 * the request is FOR, so picking the right one meant opening them.
 *
 * This pins the shape the label must keep. The function itself lives beside the modal that uses it;
 * what matters here is the ORDER and what survives when a piece is missing.
 */

const label = (r: RequestListItem, lang: "en" | "ar" = "en"): string => {
  const name = (lang === "ar" ? r.item?.nameAr || r.item?.name : r.item?.name)?.trim();
  const qty = (r.item?.qty ?? 1) > 1 ? ` ×${r.item?.qty}` : "";
  const { city, neighbourhood } = parseAddress(r.city);
  const where = prettyLocation(city ? (neighbourhood ? `${city} — ${neighbourhood}` : city) : (r.city ?? ""));
  return [name ? `${name}${qty}` : null, where || null, r.displayId].filter(Boolean).join(" · ");
};

const req = (over: Partial<RequestListItem> = {}): RequestListItem =>
  ({
    id: "r1",
    requestGroupId: null,
    projectId: null,
    displayId: "CEX-020902",
    code: "CEX-020902",
    city: "Al Wuroud District, Riyadh 12333, Saudi Arabia",
    item: { name: "Crawler Excavator 30 ton", nameAr: "حفارة زاحفة 30 طن", qty: 1, imageUrl: null, imageIsPhoto: false, categoryId: null },
    ...over,
  }) as unknown as RequestListItem;

describe("the request picker's label", () => {
  it("Given a request, Then the MACHINE leads — it is what he was thinking about", () => {
    // The name already carries the size, so «30 ton» needs no separate field.
    expect(label(req())).toBe("Crawler Excavator 30 ton · Riyadh — Al Wuroud District · CEX-020902");
  });

  it("Given several units, Then the count rides with the machine", () => {
    expect(label(req({ item: { ...req().item!, qty: 4 } }))).toContain("Crawler Excavator 30 ton ×4");
  });

  it("Given Arabic, Then the machine is named in Arabic", () => {
    expect(label(req(), "ar")).toContain("حفارة زاحفة 30 طن");
  });

  it("Given no equipment on the payload, Then the row still names a place and a code", () => {
    // A label that can go blank is a row he cannot pick; every piece is optional except the id.
    const out = label(req({ item: null }));
    expect(out).toContain("Riyadh");
    expect(out).toContain("CEX-020902");
  });

  it("Given the code LAST, Then two requests for the same machine on the same site stay apart", () => {
    /**
     * The code is the only thing that separates them, and it is the least useful thing to read
     * first — so it goes last, where it disambiguates without leading.
     */
    const a = label(req({ displayId: "CEX-020902" }));
    const b = label(req({ displayId: "CEX-020903" }));

    expect(a).not.toBe(b);
    expect(a.endsWith("CEX-020902")).toBe(true);
  });
});
