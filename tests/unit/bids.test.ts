import { describe, it, expect } from "vitest";
import { mapBidList, bidSuppliers, mapOfferedUnit, offeredFrontPhotoUrl, type BidCard } from "@/lib/contract/bids";
import { matchGrid } from "@/components/map/panel/machine-panel-model";
import { equipmentFilters } from "@/lib/contract/equipment-list";
import { mapFleet } from "@/lib/contract/fleet";

describe("mapBidList — unitsOffered (supplier's chosen quantity)", () => {
  const req = { request: { equipmentItems: [{ numberOfUnits: 10 }] } };
  it("reads units_offered array length as the offered count", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", unitsOffered: [1, 2, 3], ...req }] });
    expect(out[0].unitsOffered).toBe(3);
    expect(out[0].numberOfUnits).toBe(10); // still the request's needed units
  });
  it("falls back to the request's units when the bid omits units_offered", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", ...req }] });
    expect(out[0].unitsOffered).toBe(10);
  });
  it("treats an EMPTY units_offered array as 'bid the request as posted' (not 0)", () => {
    // Regression: empty array → 0 made the header tile read 0/N while the card said 'covers N of N'.
    const out = mapBidList({ activeBids: [{ id: "b1", unitsOffered: [], ...req }] });
    expect(out[0].unitsOffered).toBe(10);
  });
});

describe("mapBidList — supplierId", () => {
  it("maps a numeric supplier.id to a string", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", supplier: { id: 42, companyName: "Al Rajhi" } }] });
    expect(out[0].supplierId).toBe("42");
    expect(out[0].supplierName).toBe("Al Rajhi");
  });

  it("maps a missing supplier id to null", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", supplier: { companyName: "X" } }] });
    expect(out[0].supplierId).toBeNull();
  });
});

describe("mapBidList — supplierName precedence", () => {
  /* 🔴 **THE REGISTERED NAME WINS, and this case used to pin the opposite.** ~~"shows the supplier's
     profile company name over the verification-queue company row" — on the reasoning that
     `company.name` is an ops-typed row and the two drift.~~ The drift is real and the conclusion was
     wrong: the answer is the name on the REGISTRATION, which is `legalName`, and which neither side
     of that old rule ever read. The order is the backend's own (`identity-select.ts`) and the app's
     (`counterparty_name.dart`): company.legalName → profile.companyLegalName → company.name →
     profile.companyName → the person. */
  it("reads the four name columns in the registration's order", () => {
    const out = mapBidList({
      activeBids: [{
        id: "b1",
        supplierDisplayName: "Resolved By Server",
        supplier: {
          id: 7, firstName: "Yara", lastName: "Test", supplierStatus: 2,
          supplierProfile: { companyName: "Basic Profile Co", companyLegalName: "Profile Legal Co" },
          company: { name: "Trade Name Co", legalName: "Al Ghadeer Heavy Equipment Est.", isVerified: true },
        },
      }],
    });
    expect(out[0].supplierName).toBe("Al Ghadeer Heavy Equipment Est.");
    expect(out[0].verified).toBe(true); // the name source does not touch the verified signal
  });

  it("falls through the four columns as each one empties", () => {
    const at = (company: Record<string, unknown>, supplierProfile: Record<string, unknown>) =>
      mapBidList({ activeBids: [{ id: "b1", supplier: { id: 7, firstName: "Yara", lastName: "Test", company, supplierProfile } }] })[0].supplierName;
    expect(at({ legalName: "Legal", name: "Trade" }, { companyLegalName: "PLegal", companyName: "PName" })).toBe("Legal");
    expect(at({ name: "Trade" }, { companyLegalName: "PLegal", companyName: "PName" })).toBe("PLegal");
    expect(at({ name: "Trade" }, { companyName: "PName" })).toBe("Trade");
    expect(at({}, { companyName: "PName" })).toBe("PName");
    expect(at({}, {})).toBe("Yara Test");
  });

  /* 🔴 **NO VERIFICATION GATE** (product decision, 2026-09-21). The web gated a firm's name on
     `isVerified`, so a company name typed on a basic profile was stored and never shown and that
     supplier read by their PERSONAL name on every surface until ops approved them. The tick is what
     says anyone checked, and it is computed separately. */
  it("names an UNVERIFIED firm, and still says it is unverified", () => {
    const out = mapBidList({
      activeBids: [{
        id: "b1",
        supplier: { id: 7, firstName: "Yara", lastName: "Test", company: { name: "Unchecked Co", isVerified: false } },
      }],
    });
    expect(out[0].supplierName).toBe("Unchecked Co");
    expect(out[0].verified).toBe(false);
  });

  /* ⚠️ Several projections FLATTEN the profile onto the supplier, with no nested object at all.
     Reading only the nested shapes renamed every one of those to «Supplier». */
  it("reads a company name flattened straight onto the supplier", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", supplier: { id: 42, companyName: "Al Rajhi" } }] });
    expect(out[0].supplierName).toBe("Al Rajhi");
  });

  /* ⚠️ Renamed with the rule: the firm's brand no longer depends on the tick, so «the VERIFIED
     firm's brand» stated a premise that had stopped being true. `isVerified` is left on the fixture
     because it must make no difference, which the case above proves from the other side. */
  it("falls back to the firm's trade name, then the person's name", () => {
    const brand = mapBidList({ activeBids: [{ id: "b1", supplier: { id: 7, firstName: "Yara", lastName: "Test", company: { name: "Gulf Co", isVerified: true } } }] });
    expect(brand[0].supplierName).toBe("Gulf Co");
    const person = mapBidList({ activeBids: [{ id: "b1", supplier: { id: 7, firstName: "Yara", lastName: "Test" } }] });
    expect(person[0].supplierName).toBe("Yara Test");
  });
});

describe("mapBidList — compliance block", () => {
  it("maps supplier credentials (CR/VAT/certs/company) + equipment verification", () => {
    const out = mapBidList({
      activeBids: [{
        id: "b1",
        supplier: { id: 1, supplierProfile: { companyName: "Al Rajhi", crNumber: "1010", vatNumber: "300V" }, certs: { TUV: true, SASO: false, SPSP: false }, heldCerts: ["TUV", "local-content"] },
        equipment: { verificationStatus: "VERIFIED" },
      }],
    });
    const c = out[0].compliance;
    expect(c.entityType).toBe("company");
    expect(c.activityLicense).toBe(true);
    expect(c.taxNumber).toBe(true);
    expect(c.safety).toBe(true);
    expect(c.localContent).toBe(true);
    expect(c.saso).toBe(false);
    expect(out[0].eqVerified).toBe(true);
  });

  it("falls back to individual / unmet when the profile is empty", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", supplier: { supplierProfile: {} } }] });
    expect(out[0].compliance.entityType).toBe("individual");
    expect(out[0].compliance.activityLicense).toBe(false);
    expect(out[0].eqVerified).toBe(false);
  });
});

describe("bidSuppliers", () => {
  const bc = (p: Partial<BidCard>): BidCard => ({
    id: "b", status: "PENDING", supplierId: null, supplierCompanyId: null, supplierName: "S", supplierLogoUrl: null, verified: false, rating: null,
    distanceKm: null, submittedAt: null, validUntil: null, price: null, mobPrice: null, demobPrice: null,
    priceUnit: null, duration: null, numberOfUnits: 1, unitsOffered: 1, openingPrice: null, lastCounterBy: null, dealRoomStatus: null, requestChangedAt: null, liveStatus: null, reqMinYear: null, equipment: null, eqVerified: false,
    compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
    matchCount: 0, conflictCount: 0, dealRoomId: null, expired: false,
    note: null, requiredCerts: [], heldCertCodes: [], ownershipDocs: [], mobLeadTime: null, demobLeadTime: null,
    terms: { equipment: [], contract: [], supplier: [] },
    requestTerms: { operatorIncluded: null, operatorNationality: null, fuelType: null, paymentMethod: null, paymentTerms: null, breakdownResponseSla: null, overtimeRate: null, maintenanceResponsibility: null },
    lockedTerms: [], unreadTerms: [], progress: { agreed: 0, total: 0 }, lastEventAr: null, round: 1,
    uiState: null,
    ...p,
  });

  it("returns distinct suppliers in first-appearance order with counts", () => {
    const s = bidSuppliers([
      bc({ supplierId: "1", supplierName: "A" }),
      bc({ supplierId: "2", supplierName: "B" }),
      bc({ supplierId: "1", supplierName: "A" }),
    ]);
    expect(s.map((x) => x.key)).toEqual(["1", "2"]);
    expect(s[0].count).toBe(2);
    expect(s[1].count).toBe(1);
  });

  it("falls back to name when there's no id, and ORs the verified flag", () => {
    const s = bidSuppliers([
      bc({ supplierId: null, supplierName: "A", verified: false }),
      bc({ supplierId: null, supplierName: "A", verified: true }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].key).toBe("A");
    expect(s[0].verified).toBe(true);
    expect(s[0].count).toBe(2);
  });
});

/**
 * The backend signs a document by OVERWRITING `key` — `toSignedStructured` returns
 * `{...entry, key: <presigned URL>}` and never fills `url`. Every consumer on this side reads
 * `url`, so before this was resolved a real document rendered with no view control, no thumbnail,
 * and could not be put in the download batch.
 *
 * The payloads below are the shape staging actually returned on 2026-08-10 with seeded documents.
 */
describe("mapOfferedUnit — the openable link (backend signs into `key`, not `url`)", () => {
  const SIGNED =
    "https://moedatech-staging-eu.s3.eu-central-1.amazonaws.com/default/equipment/documents/1786381128000-istimara-seed.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=fa6f";

  it("resolves a document's url from the presigned key when url is null", () => {
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "istimara", key: SIGNED, url: null }] });
    expect(u.documentKeys[0].url).toBe(SIGNED);
    // `key` stays as-is — it is still the row's identity for dedupe.
    expect(u.documentKeys[0].key).toBe(SIGNED);
  });

  it("resolves a photo's url the same way", () => {
    const u = mapOfferedUnit({ equipmentId: "eq-1", photoKeys: [{ slot: "front", key: SIGNED, url: null }] });
    expect(u.photoKeys[0].url).toBe(SIGNED);
  });

  it("passes an explicit url through verbatim — it is the backend's own answer", () => {
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "tuv", key: SIGNED, url: "https://cdn/explicit.pdf" }] });
    expect(u.documentKeys[0].url).toBe("https://cdn/explicit.pdf");
  });

  it("does not second-guess an explicit url's shape — the http test is for the key fallback only", () => {
    // `fleet.test.ts` has always asserted a bare "u1" passes through. Applying the absolute-link
    // test to the explicit url too silently nulled it, which is how this was caught.
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "tuv", key: "k1", url: "u1" }] });
    expect(u.documentKeys[0].url).toBe("u1");
  });

  it("does NOT invent a url from a bare S3 key", () => {
    // No bucket origin is known here, so a fabricated link would look live and 404. Null keeps the
    // row rendering without a view action, which is what an unopenable paper should do.
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "istimara", key: "default/equipment/documents/x.pdf", url: null }] });
    expect(u.documentKeys[0].url).toBeNull();
    expect(u.documentKeys[0].key).toBe("default/equipment/documents/x.pdf");
  });

  it("leaves a row with neither url nor key unopenable", () => {
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "istimara" }] });
    expect(u.documentKeys[0].url).toBeNull();
  });
});

/**
 * **The request's asks, projected onto the bid — read off the wire the backend actually sends.**
 *
 * Both defects these cover were invisible to a suite that hand-built the asks onto a `MatchRequest`
 * literal: the panel model was right, the MAPPER never produced the fields, and nothing crossed the
 * seam. So every case here starts at a raw bid in the shape staging returned on 2026-08-10 and ends at
 * the surface that consumes it.
 *
 * The item shapes are live: `minimumEquipmentYear: 2020` on request `c4d18b6f`, `2021` on `f0438260`,
 * `attachmentIds: ["6ef091c4-…"]` on `90dfe350` — and NOT ONE of them carries `maxEquipmentAge`.
 */
describe("mapBidList — the request's year ask (RM3-AC-28a / 28c / 37)", () => {
  const bidWith = (item: Record<string, unknown>) => mapBidList({ activeBids: [{ id: "b1", request: { equipmentItems: [item] } }] })[0];

  it("reads `minimumEquipmentYear` — the field the live backend sends", () => {
    expect(bidWith({ minimumEquipmentYear: 2020 }).reqMinYear).toBe(2020);
    expect(bidWith({ minimumEquipmentYear: 2021 }).reqMinYear).toBe(2021);
  });

  it("still reads the deprecated `maxEquipmentAge` alias, for requests old app builds posted", () => {
    expect(bidWith({ maxEquipmentAge: 2018 }).reqMinYear).toBe(2018);
  });

  it("prefers the live field when a payload carries both", () => {
    expect(bidWith({ minimumEquipmentYear: 2020, maxEquipmentAge: 2015 }).reqMinYear).toBe(2020);
  });

  it("stays null when the request asked for no year", () => {
    expect(bidWith({ minimumEquipmentYear: null }).reqMinYear).toBeNull();
    expect(bidWith({}).reqMinYear).toBeNull();
  });

  it("the Terms modal and the card agree — one reader, one answer", () => {
    // They disagreed for real: the modal read the live field, the card read the dead alias.
    const bid = bidWith({ minimumEquipmentYear: 2020 });
    const year = bid.terms.equipment.find((t) => t.key === "year");
    expect(bid.reqMinYear).toBe(2020);
    expect(year).toBeTruthy();
  });

  it("carries far enough for the match grid to state the ask, not deny it (RM3-AC-37)", () => {
    const bid = bidWith({ minimumEquipmentYear: 2020 });
    const machine = mapFleet([{ equipmentId: "eq-1", manufacturer: "BOMAG", year: 2026, inBid: true }])[0];
    const cell = matchGrid(machine, bid).find((c) => c.key === "year_make")!;
    expect(cell.state).toBe("green");
    // The ✓ IS the statement — the app's satisfied year cell is `'${year} · $make'` and carries no
    // "· meets 2020 or newer" clause (`bid_readiness_sheets.dart:1128`). The verdict tail is the grid's
    // shared shape 1 since the owner's UAT of 2026-08-11 (`machine-panel-model.ts`), not a clause of
    // approval. What this test guards is unchanged: the ask reached the grid, so the cell is green and
    // does NOT deny the ask.
    expect(cell.finding.en).toBe("2026 · BOMAG — on the unit's file");
    expect(cell.finding.ar).not.toContain("لم يُطلب"); // the falsehood the dead alias produced
  });

  it("carries far enough for the السنة control to exist at all (RM3-AC-28a)", () => {
    // Rule 2 needs the ask to actually split the offer, so two machines — one meeting it, one not.
    const bid = bidWith({ minimumEquipmentYear: 2020 });
    const fleet = mapFleet([
      { equipmentId: "new", year: 2026, inBid: true },
      { equipmentId: "old", year: 2005, inBid: true },
    ]);
    expect(equipmentFilters(fleet, bid).map((g) => g.kind)).toContain("year");
  });
});

describe("mapBidList — the request's attachments ask (RM3-AC-37)", () => {
  const bidWith = (item: Record<string, unknown>) => mapBidList({ activeBids: [{ id: "b1", request: { equipmentItems: [item] } }] })[0];

  it("carries the item's attachment ids and the renter's free-text ones", () => {
    const bid = bidWith({ attachmentIds: ["6ef091c4-fc08-4073-93fd-0ee5af27bcf5"], customAttachments: ["ripper"] });
    expect(bid.attachmentIds).toEqual(["6ef091c4-fc08-4073-93fd-0ee5af27bcf5"]);
    expect(bid.customAttachments).toEqual(["ripper"]);
  });

  it("accepts the snake_case spelling too, and drops blanks", () => {
    const bid = bidWith({ attachment_ids: ["a1", "   "], custom_attachments: [""] });
    expect(bid.attachmentIds).toEqual(["a1"]);
    expect(bid.customAttachments).toEqual([]);
  });

  it("reads a missing/non-array field as nothing asked for, never as one blank ask", () => {
    expect(bidWith({}).attachmentIds).toEqual([]);
    expect(bidWith({ attachmentIds: null, customAttachments: {} }).customAttachments).toEqual([]);
  });

  it("makes the attachments cell say what was asked instead of «لم يُطلب شيء»", () => {
    const bid = bidWith({ attachmentIds: ["6ef091c4-fc08-4073-93fd-0ee5af27bcf5"] });
    const machine = mapFleet([{ equipmentId: "eq-1", year: 2020, inBid: true }])[0];
    const cell = matchGrid(machine, bid).find((c) => c.key === "attachments")!;
    // ~~«1 asked for · …»~~ — one of the three spellings of the ask the owner read side by side on
    // 2026-08-11; the grid says «requested» everywhere now.
    expect(cell.finding.en).toBe("1 requested — not recorded on the unit's file");
    // STILL GREY, and that is the decision `attachmentsCell` documents: no fleet row records the
    // attachments a machine comes with, so red here would accuse the supplier of failing a check the
    // platform never ran. Plumbing the ask must not turn this cell into an accusation.
    expect(cell.state).toBe("grey");
  });

  it("does NOT switch on the الملحقات filter — it now exits at rule 2, not on a zero ask (§6.4a)", () => {
    // The control was suppressed for the wrong reason while `asked` was permanently 0. With the ask
    // real, `splits()` is what drops it: no machine's file can be shown to have the attachments, so a
    // chip would empty the list and read as a claim about the lessor drawn from our own missing column.
    const bid = bidWith({ attachmentIds: ["a1"], customAttachments: ["ripper"] });
    const fleet = mapFleet([
      { equipmentId: "eq-1", year: 2026, inBid: true },
      { equipmentId: "eq-2", year: 2005, inBid: true },
    ]);
    expect(equipmentFilters(fleet, bid).map((g) => g.kind)).not.toContain("attachments");
  });
});

/**
 * The supplier's own photograph, on surfaces that show one machine.
 *
 * Taxonomy artwork answers "what kind of machine is this"; a renter reading a bid is asking what he
 * is being SENT, and a stock drawing cannot answer that — least of all under a «CONFIRMED» ribbon,
 * where it comes close to claiming it has. The uploads were always on the offered units; nothing
 * read them (owner, 2026-08-26).
 */
describe("offeredFrontPhotoUrl", () => {
  const unit = (photos: { slot: string; url: string | null }[]) => ({
    photoKeys: photos.map((p) => ({ slot: p.slot, key: "k", url: p.url })),
  });

  it("prefers the front shot — the view a machine is recognised by", () => {
    const u = unit([
      { slot: "serial", url: "https://x/serial.jpg" },
      { slot: "front", url: "https://x/front.jpg" },
    ]);
    expect(offeredFrontPhotoUrl([u])).toBe("https://x/front.jpg");
  });

  it("matches the slot loosely, because the backend has spelled it three ways", () => {
    for (const slot of ["front", "FRONT_VIEW", "front_photo"]) {
      expect(offeredFrontPhotoUrl([unit([{ slot, url: "https://x/f.jpg" }])])).toBe("https://x/f.jpg");
    }
  });

  it("takes any photograph over none", () => {
    expect(offeredFrontPhotoUrl([unit([{ slot: "meter", url: "https://x/m.jpg" }])])).toBe("https://x/m.jpg");
  });

  it("ignores a photo with no presigned url rather than rendering a broken image", () => {
    const u = unit([
      { slot: "front", url: null },
      { slot: "side", url: "https://x/s.jpg" },
    ]);
    expect(offeredFrontPhotoUrl([u])).toBe("https://x/s.jpg");
  });

  it("reads across every offered unit, not only the first", () => {
    expect(offeredFrontPhotoUrl([unit([]), unit([{ slot: "front", url: "https://x/2.jpg" }])])).toBe("https://x/2.jpg");
  });

  it("answers null on no units, no photos, or nothing openable — the caller then falls back", () => {
    expect(offeredFrontPhotoUrl(null)).toBeNull();
    expect(offeredFrontPhotoUrl([])).toBeNull();
    expect(offeredFrontPhotoUrl([unit([])])).toBeNull();
    expect(offeredFrontPhotoUrl([unit([{ slot: "front", url: null }])])).toBeNull();
  });
});

/**
 * ── The supplier's own declaration is the term's VALUE (owner, 2026-09-09) ───────────────────────
 * *"How can someone not say? It must say yes or no in the form, even in a bid he must choose."*
 * The bid form makes every T3 term a required choice, so a bid arrives with the answers in
 * `t3Declarations`. These rows used to carry a state and the RENTER's value only, so the comparison
 * printed «Didn't say» about terms the supplier had answered.
 */
describe("mapBidList — a declared term carries what the supplier chose", () => {
  const withDecl = (t3: Record<string, unknown>) =>
    mapBidList({
      activeBids: [
        {
          id: "b1",
          t3Declarations: t3,
          request: { paymentTerms: "net_30", breakdownResponseSla: "TWENTY_FOUR_HR", maintenanceResponsibility: "supplier" },
        },
      ],
    })[0];

  const row = (b: BidCard, key: string) => (b.negotiableTerms ?? []).find((r) => r.key === key);

  it("reads payment, the breakdown SLA and maintenance off the bid", () => {
    const b = withDecl({ payment_terms: "net_60", breakdown_response_sla: "FORTY_EIGHT_HR", maintenance_responsibility: "rentee" });
    expect(row(b, "payment_terms")?.value).toBe("net_60");
    expect(row(b, "breakdown_response_sla")?.value).toBe("FORTY_EIGHT_HR");
    expect(row(b, "maintenance_responsibility")?.value).toBe("rentee");
  });

  it("treats the empty string `submitBid` writes for an omitted key as NO answer", () => {
    // The service fills any required key the client left out with '' — that is silence, not a choice.
    const b = withDecl({ payment_terms: "", breakdown_response_sla: "  " });
    expect(row(b, "payment_terms")?.value ?? null).toBeNull();
    expect(row(b, "breakdown_response_sla")?.value ?? null).toBeNull();
  });

  it("leaves the STATE alone — a declaration is still pending until the deal room locks it", () => {
    const b = withDecl({ payment_terms: "net_60" });
    expect(row(b, "payment_terms")?.state).toBe("grey");
  });
});

describe("mapBidList — the price the card SHOWS", () => {
  /* 🔴 **THE SUPPLIER'S OWN LATEST, then acceptance, then his opening bid** (app parity,
     `BidModel.displayPrice`). Owner + PM, on the app, 2026-09-19: *"a quotation is an offer from
     seller to buyer … whatever supplier's latest offer is shows regardless of acceptance"*.

     ~~`currentPrice ?? negRate ?? priceAmount` — the live room rate, whoever moved it.~~ So the
     RENTER'S OWN COUNTER rewrote the price on his own bid card: he asked 16,800 against an offer of
     18,400 and the card then read 16,800, as though the supplier had agreed to it. */
  const bid = (over: Record<string, unknown>) =>
    mapBidList({ activeBids: [{ id: "b1", priceAmount: 18400, supplier: { id: 7, companyName: "S" }, ...over }] })[0];

  it("ignores the renter's counter and keeps the supplier's opening figure", () => {
    // The room's live rate is the renter's ask; the supplier has proposed nothing of his own.
    expect(bid({ currentPrice: 16800, lastCounterBy: "rentee" }).price).toBe(18400);
  });

  it("moves the moment the SUPPLIER proposes, accepted or not", () => {
    expect(bid({ currentPrice: 16800, lastCounterBy: "rentee", supplierLatest: { rate: 17900, at: "2026-09-20T10:00:00Z" } }).price).toBe(17900);
  });

  /* ⚠️ The `accepted` arm is UNDER it and is NOT dead: a room created before the history carried its
     proposal snapshot has no `supplierLatest`, and there acceptance is the only thing that makes the
     room's figures safe to print. */
  it("takes the negotiated figure once the bid is ACCEPTED, with no supplierLatest on the row", () => {
    expect(bid({ status: "ACCEPTED", currentPrice: 16800 }).price).toBe(16800);
    // …and still prefers the supplier's own latest when the row does carry one.
    expect(bid({ status: "ACCEPTED", currentPrice: 16800, supplierLatest: { rate: 17900, at: "x" } }).price).toBe(17900);
  });

  it("applies the same rule to both transport legs", () => {
    const b = bid({ mobPrice: 1200, demobPrice: 900, currentPrice: 16800, lastCounterBy: "rentee",
      supplierLatest: { rate: 17900, mobPrice: 1400, at: "x" } });
    expect(b.mobPrice).toBe(1400);
    // The supplier named no demob in his proposal, so his opening figure stands rather than the room's.
    expect(b.demobPrice).toBe(900);
  });

  /* ⚠️ An EMPTY `supplierLatest` is not an offer. Treating the object's presence as the test would
     blank every figure on a row the backend sent as `{}`. */
  it("falls through an empty supplierLatest rather than blanking the price", () => {
    expect(bid({ supplierLatest: {}, currentPrice: 16800, lastCounterBy: "rentee" }).price).toBe(18400);
  });

  /* The OPENING price is kept whole beside it, which is what `bidCounterDelta` strikes through. */
  it("keeps the opening figure intact for the delta", () => {
    expect(bid({ currentPrice: 16800, supplierLatest: { rate: 17900, at: "x" } }).openingPrice).toBe(18400);
  });
});

describe("mapBidList — whose counter stands on a term", () => {
  /* 🔴 **HIS counters, never hers** (app parity: `buildBidTermsArgs` filters `c.side == 'supplier'`
     and says why). `counters` carries the latest counter on a term WHICHEVER side wrote it, and the
     overlay writes it into `value` — the column every reader treats as the SUPPLIER's offer. So a
     renter who countered read his own proposal back as the supplier's, and it equals his own ask by
     construction, so the row went GREEN as though the supplier had agreed to something unseen. */
  const row = (over: Record<string, unknown>) =>
    mapBidList({
      activeBids: [{
        id: "b1",
        request: { paymentTerms: "net_30", equipmentItems: [{}] },
        ...over,
      }],
    })[0].negotiableTerms?.find((r) => r.key === "payment_terms");

  it("ignores a counter the RENTER wrote", () => {
    const r = row({ counters: [{ termKey: "payment_terms", newValue: "net_30", side: "rentee", occurredAt: "2026-09-12T09:00:00Z" }] });
    // Neither his value nor a green state: the supplier has still said nothing.
    expect(r?.value ?? null).not.toBe("net_30");
    expect(r?.state).not.toBe("matched");
    expect(r?.counterSide ?? null).toBeNull();
  });

  it("takes the SUPPLIER's counter, and says who moved it and when", () => {
    const r = row({ counters: [{ termKey: "payment_terms", newValue: "net_90", side: "supplier", occurredAt: "2026-09-12T09:00:00Z" }] });
    expect(r?.value).toBe("net_90");
    expect(r?.state).toBe("conflict"); // his value differs from the ask
    expect(r?.counterSide).toBe("supplier");
    expect(r?.updatedAt).toBe("2026-09-12T09:00:00Z");
  });

  /* ⚠️ **A counter with NO side is kept.** An older payload does not carry the field, and reading
     its silence as the renter's would retire the whole overlay on every bid predating it. */
  it("keeps a counter that names no side", () => {
    const r = row({ counters: [{ termKey: "payment_terms", newValue: "net_90" }] });
    expect(r?.value).toBe("net_90");
  });

  it("stamps an AGREED term with the lock's own time, and no counter side", () => {
    const r = row({ lockedTerms: [{ termKey: "payment_terms", lockedValue: "net_60", lockedAt: "2026-09-13T08:00:00Z" }] });
    expect(r?.state).toBe("agreed");
    expect(r?.updatedAt).toBe("2026-09-13T08:00:00Z");
    expect(r?.counterSide ?? null).toBeNull();
  });

  it("leaves a term the room never touched with no provenance at all", () => {
    const r = row({});
    expect(r?.counterSide ?? null).toBeNull();
    expect(r?.updatedAt ?? null).toBeNull();
  });
});
