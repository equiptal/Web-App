/**
 * V7 / V8 / V9 — the machine panel's pure model (spec 004 v3 §6.1, §6.5, §6.6).
 *
 * Everything the detail, the documents tab and the company panel *decide* lives in
 * `machine-panel-model.ts`, so it is testable in this repo's `node` vitest env with no component
 * harness. The components paint what these functions return and decide nothing of their own.
 *
 * Fixtures go through `mapFleet` rather than being hand-built `FleetMachine` literals: the parser is
 * the only thing that ever produces one in production, so a test that skipped it could pass on a shape
 * the wire cannot make.
 */

import { describe, expect, it } from "vitest";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import {
  attentionCount,
  batchDocumentRequest,
  companyDocRows,
  COMPANY_DOC_KEYS,
  docRowActions,
  equipmentDocGroups,
  heroPhotoUrl,
  matchGrid,
  photoSlotOf,
  presentPhotoSlots,
  type MatchCellKey,
  type MatchCellState,
  type MatchRequest,
} from "@/components/map/panel/machine-panel-model";

/* ─────────────────────────────────── fixtures ─────────────────────────────────── */

interface RawMachine {
  photos?: { slot: string; url?: string | null }[];
  docs?: { type: string; url?: string | null; verifyStatus?: string | null; expiryDate?: string | null }[];
  year?: number | null;
  manufacturer?: string | null;
}

const machine = (raw: RawMachine = {}): FleetMachine =>
  mapFleet([
    {
      equipmentId: "eq-1",
      manufacturer: raw.manufacturer === undefined ? "Caterpillar" : raw.manufacturer,
      modelName: "320D",
      year: raw.year === undefined ? 2022 : raw.year,
      locationSource: "unit_yard",
      distanceKm: 12,
      photoKeys: (raw.photos ?? []).map((p, i) => ({ slot: p.slot, key: `k${i}`, url: p.url ?? `https://x/${p.slot}` })),
      documentKeys: (raw.docs ?? []).map((d, i) => ({
        type: d.type,
        key: `d${i}`,
        // `undefined` takes the default url; an explicit `null` means a paper on the file whose link
        // the projection did not carry — a real state, and one the row model has to survive.
        url: d.url === undefined ? `https://x/${d.type}` : d.url,
        verifyStatus: d.verifyStatus ?? null,
        expiryDate: d.expiryDate ?? null,
      })),
      inBid: true,
    },
  ])[0];

/** The four slots as the BACKEND spells them — front · serial · equipment · operating_hours. */
const ALL_FOUR = [{ slot: "front" }, { slot: "serial" }, { slot: "operating_hours" }, { slot: "equipment" }];

const cellsBy = (m: FleetMachine, r: MatchRequest): Record<MatchCellKey, { state: MatchCellState; en: string; ar: string }> => {
  const out = {} as Record<MatchCellKey, { state: MatchCellState; en: string; ar: string }>;
  for (const c of matchGrid(m, r)) out[c.key] = { state: c.state, en: c.finding.en, ar: c.finding.ar };
  return out;
};

/* ────────────────────────────── the six match cells (V7) ────────────────────────────── */

describe("matchGrid — six cells, in the spec's order (AC-36)", () => {
  it("returns exactly the six §6.5 cells and nothing descriptive", () => {
    const cells = matchGrid(machine({ photos: ALL_FOUR }), {});
    expect(cells.map((c) => c.key)).toEqual([
      "year_make",
      "attachments",
      "photos",
      "ownership",
      "equipment_cert",
      "operator_cert",
    ]);
  });

  it("every cell states an actual finding — never a bare tick (AC-37)", () => {
    for (const c of matchGrid(machine({ photos: ALL_FOUR }), { reqEquipmentCerts: ["tuv"] })) {
      expect(c.finding.en.trim().length).toBeGreaterThan(3);
      expect(c.finding.ar.trim().length).toBeGreaterThan(3);
      expect(["green", "grey", "red"]).toContain(c.state);
    }
  });
});

describe("year & manufacturer", () => {
  it("greys when the request asked for no year — a cell nobody asked about cannot fail", () => {
    const c = cellsBy(machine({ year: 2011 }), {}).year_make;
    expect(c.state).toBe("grey");
    expect(c.en).toContain("no year asked for");
  });

  it("greens when the machine meets the asked-for year, and names the year and the maker", () => {
    const c = cellsBy(machine({ year: 2022 }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("green");
    expect(c.en).toContain("2022");
    expect(c.en).toContain("Caterpillar");
  });

  it("reds when the machine is older than the asked-for year, and says what was asked", () => {
    const c = cellsBy(machine({ year: 2016 }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("red");
    expect(c.en).toContain("2020 or newer");
  });

  it("reds when a year was asked for and the machine's file carries none", () => {
    const c = cellsBy(machine({ year: null }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("red");
    expect(c.en).toContain("not on the file");
  });

  it("does not treat an AGE requirement as a year — `computeUnitReadiness` already ruled on that", () => {
    // reqMinYear can be a max-age (e.g. 5). It must not read as "built in year 5".
    const c = cellsBy(machine({ year: 2016 }), { reqMinYear: 5 }).year_make;
    expect(c.state).toBe("grey");
  });
});

describe("attachments — grey by decision, never red", () => {
  it("greys with 'none asked for' when the request asked for none", () => {
    const c = cellsBy(machine(), {}).attachments;
    expect(c.state).toBe("grey");
    expect(c.en).toContain("none asked for");
  });

  it("stays grey when the request DID ask, because a fleet row carries no attachment record", () => {
    // Red here would mark every machine on the platform as failing a check that was never run —
    // `FleetMachine` has no attachments field, and `bids.ts` hard-codes the same term grey.
    const c = cellsBy(machine(), { attachmentIds: ["a1", "a2"], customAttachments: ["ripper"] }).attachments;
    expect(c.state).toBe("grey");
    expect(c.en).toContain("3 asked for");
  });

  it("ignores blank attachment entries when counting", () => {
    const c = cellsBy(machine(), { attachmentIds: ["a1", "  "], customAttachments: [""] }).attachments;
    expect(c.en).toContain("1 asked for");
  });
});

// Scored on the REQUIRED slots — front + plate — since the owner ruled on 2026-08-08 that this cell
// follows the documents group. Before that, a machine carrying both mandatory shots and no meter photo
// read "nothing outstanding" in the documents tab and red "2 of 4 uploaded" here, on one screen.
describe("equipment photos — the fraction, over the slots the lessor is actually held to", () => {
  it("greens on the two REQUIRED slots, whether or not the optional two were uploaded", () => {
    const both = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "serial" }] }), {}).photos;
    expect(both.state).toBe("green");
    expect(both.en).toBe("2 of 2 uploaded");
    // All four reads the same: the optional shots are not a higher score, they are simply optional.
    const all = cellsBy(machine({ photos: ALL_FOUR }), {}).photos;
    expect(all.state).toBe("green");
    expect(all.en).toBe("2 of 2 uploaded");
  });

  it("does not fail a machine for a shot nobody requires", () => {
    // front + plate + side, no meter. The old rule called this "3 of 4" and red.
    const c = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "serial" }, { slot: "equipment" }] }), {}).photos;
    expect(c.state).toBe("green");
  });

  it("reds when a REQUIRED shot is missing, and says which fraction is short", () => {
    const c = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "equipment" }] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.en).toBe("1 of 2 uploaded");
  });

  it("reds at none, and reports zero rather than omitting the cell", () => {
    const c = cellsBy(machine({ photos: [] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.en).toBe("0 of 2 uploaded");
  });

  it("folds the wire's slot vocabulary onto the four the renter is shown", () => {
    // The backend stores front · serial · equipment · operating_hours. Matching the spec's words
    // ("plate", "meter", "side") literally would leave three rows permanently empty.
    expect(photoSlotOf("front")).toBe("front");
    expect(photoSlotOf("serial")).toBe("plate");
    expect(photoSlotOf("operating_hours")).toBe("meter");
    expect(photoSlotOf("equipment")).toBe("side");
    expect(photoSlotOf("OTHER")).toBeNull();
    expect(photoSlotOf("")).toBeNull();
  });

  it("counts a slot once however many photos sit in it", () => {
    const m = machine({ photos: [{ slot: "front" }, { slot: "front" }, { slot: "serial" }] });
    expect(presentPhotoSlots(m)).toEqual(["front", "plate"]);
  });
});

describe("proof of ownership — green when held, RED when absent", () => {
  it("greens when the machine's file carries one", () => {
    const c = cellsBy(machine({ docs: [{ type: "istimara" }] }), {}).ownership;
    expect(c.state).toBe("green");
    expect(c.en).toBe("on the machine's file");
  });

  it("reds when it does not — the paper reaches the renter now, so an absence is a real gap", () => {
    // An earlier revision made this grey, on the premise that `RENTEE_HIDDEN_DOC_TYPES` strips
    // ownership papers before they reach this client. That filter was DELETED when ownership documents
    // became renter-visible with usable urls, so a missing one is the supplier's omission — actionable,
    // and requestable from the documents tab. (`bid-readiness.ts` still excludes it from the readiness
    // SCORE; that is about a band, not about visibility.)
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), {}).ownership;
    expect(c.state).toBe("red");
    expect(c.en).toContain("not on the file");
  });
});

describe("certificates — grey when unasked, red when asked and missing", () => {
  it("greys the equipment cert when the request asked for none", () => {
    expect(cellsBy(machine(), {}).equipment_cert.state).toBe("grey");
  });

  it("greens when every asked-for equipment cert is on the file", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }, { type: "spsp" }] }), { reqEquipmentCerts: ["tuv", "spsp"] }).equipment_cert;
    expect(c.state).toBe("green");
    expect(c.en).toContain("on the machine's file");
  });

  it("reds and names ONLY the missing one", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), { reqEquipmentCerts: ["tuv", "spsp"] }).equipment_cert;
    expect(c.state).toBe("red");
    expect(c.en).toContain("SPSP");
    expect(c.en).not.toContain("TÜV");
    expect(c.en).toContain("not on the file");
  });

  it("greys operator certs when the request declared no operator licence level", () => {
    expect(cellsBy(machine(), { operatorCertReq: null }).operator_cert.state).toBe("grey");
  });

  it("reds operator certs the request asked for and the machine does not hold", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), { operatorCertReq: "spsp" }).operator_cert;
    expect(c.state).toBe("red");
  });
});

describe("heroPhotoUrl", () => {
  it("prefers the front shot", () => {
    expect(heroPhotoUrl(machine({ photos: [{ slot: "serial" }, { slot: "front" }] }))).toBe("https://x/front");
  });
  it("falls back to any photo, and to null when there are none", () => {
    expect(heroPhotoUrl(machine({ photos: [{ slot: "serial" }] }))).toBe("https://x/serial");
    expect(heroPhotoUrl(machine({ photos: [] }))).toBeNull();
  });
});

/* ────────────────────────── equipment documents (V8) ────────────────────────── */

/* ────────────── V8 — the document groups (§6.6, AC-38, AC-39, AC-42) ──────────────
 *
 * The platform's one rule (owner, 2026-08-08), applied to photos, ownership, equipment certs and
 * operator papers alike:
 *
 *   required + held    → shown, green, openable
 *   required + absent  → RED, counted, requestable
 *   not required + held→ shown, openable, NO verdict, NOT counted, NOT requestable
 *   not required + absent → no row at all
 *
 * Required = front photo · plate/serial photo · proof of ownership (all three from the supplier's own
 * scorer, `bid_readiness.dart`) + every cert THIS request asked for.
 */

/** A request that asks for nothing — the no-operator, no-cert job. */
const NO_ASKS: MatchRequest = {};
/** A request naming equipment certs and/or the operator licence level the renter requires. */
const asking = (equip: string[] = [], operator = ""): MatchRequest => ({
  reqEquipmentCerts: equip,
  operatorCertReq: operator || null,
});
const groupBy = (m: FleetMachine, r: MatchRequest) =>
  Object.fromEntries(equipmentDocGroups(m, r).map((g) => [g.key, g]));

describe("equipmentDocGroups — the groups, and each one's own attention count (AC-42)", () => {
  it("splits photos from documents from the OPERATOR's documents, and never merges the counts", () => {
    const groups = equipmentDocGroups(
      machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv"),
    );
    expect(groups.map((g) => g.key)).toEqual(["photos", "documents", "operator"]);
    // The operator is a SECTION now, not one row buried in the equipment's papers.
    expect(groups[2].rows.map((r) => r.key)).toEqual(["doc:operator:tuv"]);
  });

  it("counts ROWS NEEDING ACTION, never totals", () => {
    const g = groupBy(machine({ photos: [{ slot: "front" }], docs: [{ type: "tuv" }] }), asking(["tuv"], "spsp"));
    expect(g.photos.attention).toBe(1); // the plate shot, and nothing else — meter and side are not required
    expect(g.documents.attention).toBe(1); // ownership; the asked-for TÜV is on the file
    expect(g.operator.attention).toBe(1); // the asked-for operator SPSP is not
  });

  it("reports zero attention when everything required is on the file", () => {
    const groups = equipmentDocGroups(
      machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "tuv" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv"),
    );
    expect(groups.map((g) => g.attention)).toEqual([0, 0, 0]);
  });

  it("answers an asked-for licence with a held `operating_license` — it carries no `operator_` prefix", () => {
    const g = groupBy(machine({ docs: [{ type: "operating_license" }] }), asking([], "operating_license"));
    expect(g.operator.rows.map((r) => r.key)).toEqual(["doc:operator:operating_license"]);
    expect(g.operator.rows[0].label.en).toBe("Operator licence");
    expect(g.operator.rows[0].status).toBe("present"); // the prefix test alone would have read it missing
    // …and it is NOT also a row under the equipment's papers, which hold only the ownership row here.
    expect(g.documents.rows.map((r) => r.key)).toEqual(["doc:ownership"]);
  });

  it("folds the three spellings of the operator's licence into ONE row", () => {
    const g = groupBy(machine({ docs: [] }), asking([], "operating_license / operator_license / operator_licence"));
    expect(g.operator.rows.map((r) => r.key)).toEqual(["doc:operator:operating_license"]);
  });

  it("keeps every operator paper the backend's vocabulary names as a row of its own", () => {
    // web-handoff.md:16 — operator_tuv · operating_license · operator_spsp · operator_id · operator_insurance
    const g = groupBy(
      machine({ docs: [] }),
      asking([], "operator_tuv, operating_license, operator_spsp, operator_id, operator_insurance"),
    );
    expect(g.operator.rows.map((r) => r.key)).toEqual([
      "doc:operator:tuv",
      "doc:operator:operating_license",
      "doc:operator:spsp",
      "doc:operator:id",
      "doc:operator:insurance",
    ]);
    expect(g.operator.rows.map((r) => r.label.en)).toEqual([
      "Operator TÜV",
      "Operator licence",
      "Operator SPSP",
      "Operator ID",
      "Operator insurance",
    ]);
  });

  it("does not call a spec sheet an equipment safety certificate — it calls it a spec sheet", () => {
    const g = groupBy(machine({ docs: [{ type: "spec_sheet" }, { type: "other" }] }), asking(["tuv"]));
    const cert = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(cert.status).toBe("missing");
    expect(g.documents.rows.find((r) => r.key === "doc:other:spec_sheet")?.label.en).toBe("Spec sheet");
  });

  it("shows PRESENCE ONLY — never a verification badge or an expiry (AC-39, §6.6)", () => {
    // The wire carries both fields. Nothing may render them here: a badge invites the renter to judge
    // a supplier on a state the platform sets.
    const groups = equipmentDocGroups(
      machine({ docs: [{ type: "tuv", verifyStatus: "verified", expiryDate: "2027-03-12" }] }),
      asking(["tuv"]),
    );
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "doc:equipment_cert:tuv");
    expect(row?.statusLine.en).toBe("on the machine's file");
    const text = JSON.stringify(groups);
    for (const leak of ["verified", "failed", "2027", "expiry", "valid until"]) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it("uses the presence vocabulary the spec names, and no other", () => {
    const groups = equipmentDocGroups(machine({ photos: ALL_FOUR, docs: [{ type: "tuv" }] }), NO_ASKS);
    for (const line of groups.flatMap((g) => g.rows.map((r) => r.statusLine.en))) {
      expect([
        "uploaded",
        "not uploaded",
        "uploaded · not required",
        "on the machine's file",
        "no document yet",
        "on the machine's file · not required",
      ]).toContain(line);
    }
  });

  it("gives every row a download link when it holds a file, and none when it does not", () => {
    const g = groupBy(machine({ photos: [{ slot: "front" }] }), NO_ASKS);
    expect(g.photos.rows[0].downloadUrl).toBe("https://x/front");
    expect(g.photos.rows[1].downloadUrl).toBeNull();
  });
});

describe("a document nobody asked for is never shown as missing (owner, 2026-08-08)", () => {
  it("an unrequested cert the machine does NOT hold is not a row at all", () => {
    const g = groupBy(machine({ docs: [] }), NO_ASKS);
    // Only proof of ownership, which is required of every lessor regardless of the request.
    expect(g.documents.rows.map((r) => r.key)).toEqual(["doc:ownership"]);
    expect(g.operator).toBeUndefined();
  });

  it("an unrequested cert the machine DOES hold is shown, openable, and carries no verdict", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), NO_ASKS);
    const row = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(row.status).toBe("on_file"); // not "present" — nothing was passed, because nothing was asked
    expect(row.statusLine.en).toBe("on the machine's file · not required");
    expect(docRowActions(row).map((a) => a.kind)).toEqual(["view", "download"]);
  });

  it("a held-but-unrequested row raises NOBODY's attention count", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }, { type: "tuv" }, { type: "operator_tuv" }] }), NO_ASKS);
    expect(g.documents.attention).toBe(0);
    // Nothing was asked of the operator, so he has no section to raise a count in.
    expect(g.operator).toBeUndefined();
  });

  it("a held-but-unrequested row cannot be ticked — there is nothing to chase", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }, { type: "operator_tuv" }] }), NO_ASKS);
    // Ownership is required of every lessor and this machine holds none, so it is the one askable row.
    for (const row of g.documents.rows) expect(row.requestable).toBe(row.key === "doc:ownership");
  });
});

/* ───────────── ruling 2 — you can only ask for what is not there (owner, 2026-08-08) ───────────── */

describe("a document already on the file is never requestable", () => {
  it("a requested cert is askable when it is ABSENT and not when it is HELD", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), asking(["tuv", "spsp"]));
    const held = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    const gap = g.documents.rows.find((r) => r.key === "doc:equipment_cert:spsp")!;
    // The earlier rule made a held-and-required row askable too, so a renter could chase a legible
    // re-scan. Withdrawn: an ask naming a paper the lessor can see on his own file has one possible
    // answer — "it is already there".
    expect([held.status, held.requestable]).toEqual(["present", false]);
    expect([gap.status, gap.requestable]).toEqual(["missing", true]);
  });

  it("holds for photos too — an uploaded shot is not a shot to ask for", () => {
    const g = groupBy(machine({ photos: [{ slot: "front" }] }), NO_ASKS);
    const front = g.photos.rows.find((r) => r.key === "photo:front")!;
    const plate = g.photos.rows.find((r) => r.key === "photo:plate")!;
    expect([front.status, front.requestable]).toEqual(["present", false]);
    expect([plate.status, plate.requestable]).toEqual(["missing", true]);
  });

  it("holds for the operator's certificates too", () => {
    const g = groupBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "tuv, spsp"));
    expect(g.operator.rows.map((r) => [r.status, r.requestable])).toEqual([
      ["present", false],
      ["missing", true],
    ]);
  });

  it("makes requestable and missing the SAME set, in every group", () => {
    const g = equipmentDocGroups(
      machine({ photos: [{ slot: "front" }], docs: [{ type: "istimara" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv, spsp"),
    );
    for (const row of g.flatMap((x) => x.rows)) expect(row.requestable).toBe(row.status === "missing");
  });

  it("a group with nothing missing offers nothing to tick", () => {
    const g = groupBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "tuv"));
    expect(g.operator.attention).toBe(0);
    expect(g.operator.rows.filter((r) => r.requestable)).toEqual([]);
  });
});

describe("the operator's section on a job with NO operator", () => {
  it("does not exist when nothing was asked for and nothing is held", () => {
    expect(groupBy(machine({ docs: [{ type: "tuv" }] }), NO_ASKS).operator).toBeUndefined();
  });

  it("never shows a missing operator paper on a job that asked for no operator", () => {
    const rows = equipmentDocGroups(machine({ docs: [] }), NO_ASKS).flatMap((g) => g.rows);
    expect(rows.filter((r) => r.key.startsWith("doc:operator:"))).toEqual([]);
  });

  it("raises no row for an operator paper the lessor happens to hold, either", () => {
    // The group is a STATUS of what THIS request asked of the operator. With nothing asked there is
    // nothing to state — and a row carrying no verdict, no count and (per ruling 1) no file would be a
    // line of text with nothing to say.
    expect(groupBy(machine({ docs: [{ type: "operator_tuv" }] }), NO_ASKS).operator).toBeUndefined();
  });

  it("turns red only once the request asks for the operator's papers", () => {
    const g = groupBy(machine({ docs: [] }), asking([], "TÜV / SPSP"));
    expect(g.operator.rows.map((r) => [r.key, r.status])).toEqual([
      ["doc:operator:tuv", "missing"],
      ["doc:operator:spsp", "missing"],
    ]);
    expect(g.operator.attention).toBe(2);
  });
});

describe("photos follow the same rule as the papers", () => {
  it("front and plate are required of every lessor — absent, they are red and counted", () => {
    const g = groupBy(machine({ photos: [] }), NO_ASKS);
    expect(g.photos.rows.map((r) => [r.key, r.status])).toEqual([
      ["photo:front", "missing"],
      ["photo:plate", "missing"],
    ]);
    expect(g.photos.attention).toBe(2);
  });

  it("meter and side are required nowhere — absent, they are NOT rows", () => {
    const g = groupBy(machine({ photos: ALL_FOUR.filter((p) => p.slot === "front" || p.slot === "serial") }), NO_ASKS);
    expect(g.photos.rows.map((r) => r.key)).toEqual(["photo:front", "photo:plate"]);
    expect(g.photos.attention).toBe(0);
  });

  it("meter and side DO show when uploaded, with no verdict and no tick", () => {
    const g = groupBy(machine({ photos: ALL_FOUR }), NO_ASKS);
    const meter = g.photos.rows.find((r) => r.key === "photo:meter")!;
    expect([meter.status, meter.statusLine.en, meter.requestable]).toEqual([
      "on_file",
      "uploaded · not required",
      false,
    ]);
    expect(g.photos.attention).toBe(0);
  });
});

describe("a row holding several files exposes EVERY one of them", () => {
  it("OWNERSHIP had the bug — an istimara AND a customs card both reach the renter, not just the first", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "istimara", url: "https://x/ist" },
          { type: "customs_card", url: "https://x/cus" },
        ],
      }),
      NO_ASKS,
    );
    const row = g.documents.rows.find((r) => r.key === "doc:ownership")!;
    expect(row.files.map((f) => f.url)).toEqual(["https://x/ist", "https://x/cus"]);
    expect(docRowActions(row).map((a) => a.href)).toEqual([
      "https://x/ist",
      "https://x/ist",
      "https://x/cus",
      "https://x/cus",
    ]);
    // The invariant survives the second file: exactly one primary, and it is the first file's view.
    expect(docRowActions(row).filter((a) => a.primary)).toHaveLength(1);
    expect(docRowActions(row).filter((a) => a.primary)[0]).toMatchObject({ kind: "view", href: "https://x/ist" });
  });

  it("the EQUIPMENT CERTIFICATE row too — two TÜV uploads are two openable files", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "tuv", url: "https://x/tuv-a" },
          { type: "tüv", url: "https://x/tuv-b" },
        ],
      }),
      asking(["tuv"]),
    );
    const row = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(row.files.map((f) => f.url)).toEqual(["https://x/tuv-a", "https://x/tuv-b"]);
    expect(docRowActions(row)).toHaveLength(4);
  });

  it("names each file after its own type, so two controls are never two unlabelled twins", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "istimara", url: "https://x/ist" },
          { type: "customs_card", url: "https://x/cus" },
        ],
      }),
      NO_ASKS,
    );
    const row = g.documents.rows.find((r) => r.key === "doc:ownership")!;
    expect(row.files.map((f) => f.label.en)).toEqual(["Registration (Istimara)", "Customs card"]);
    expect(row.files.map((f) => f.label.ar)).toEqual(["الاستمارة", "البطاقة الجمركية"]);
  });

  it("a file with no url is not a control — it cannot become a link to nowhere", () => {
    const g = groupBy(
      machine({ docs: [{ type: "istimara", url: null }, { type: "customs_card", url: "https://x/cus" }] }),
      NO_ASKS,
    );
    const row = g.documents.rows.find((r) => r.key === "doc:ownership")!;
    expect(row.status).toBe("present"); // the paper IS on the file; only its link is absent
    expect(docRowActions(row).map((a) => a.href)).toEqual(["https://x/cus", "https://x/cus"]);
  });
});

describe("the batch ask raised from the operator's section (AC-38)", () => {
  it("names the machine and the operator types, and nothing the renter did not tick", () => {
    const g = groupBy(machine({ docs: [] }), asking(["tuv"], "tuv,spsp"));
    // Every row goes in unfiltered — the model, not the caller, decides what may be asked for.
    const rows = [...g.documents.rows, ...g.operator.rows];
    const draft = batchDocumentRequest("equipment", "eq-1", rows, new Set(g.operator.rows.map((r) => r.key)));
    expect(draft).toEqual({
      kind: "document",
      scope: "equipment",
      equipmentId: "eq-1",
      // Coarse BY DESIGN — see `EQUIPMENT_ASK_TYPE`: only names proven to resolve into the backend's
      // document catalogue are sent, and the operator category is the only proven operator name.
      docTypes: ["operator_safety_certificate"],
      labels: [
        { en: "Operator TÜV", ar: "شهادة TÜV للمشغّل" },
        { en: "Operator SPSP", ar: "شهادة SPSP للمشغّل" },
      ],
    });
  });

  it("an equipment ask names the precise cert where the catalogue is known to accept it", () => {
    const g = groupBy(machine({ docs: [] }), asking(["tuv", "spsp", "aramco"]));
    const rows = g.documents.rows.filter((r) => r.key.startsWith("doc:equipment_cert:"));
    const draft = batchDocumentRequest("equipment", "eq-1", rows, new Set(rows.map((r) => r.key)));
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual([
      "tuv",
      "spsp",
      "equipment_safety_certificate",
    ]);
  });

  it("asks for the paper, not for a second copy of one already on the file", () => {
    const g = groupBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "tuv"));
    // The asked-for operator TÜV is on the file, so nothing here is askable: the batch is null and the
    // send control disables itself from the same value it would have sent.
    expect(batchDocumentRequest("equipment", "eq-1", g.operator.rows, new Set(g.operator.rows.map((r) => r.key)))).toBeNull();
  });

  it("drops a held row from the ask even when it was somehow ticked", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), asking(["tuv", "spsp"]));
    const draft = batchDocumentRequest("equipment", "eq-1", g.documents.rows, new Set(g.documents.rows.map((r) => r.key)));
    // Ownership and SPSP are missing; the held TÜV is not in the payload however the set was arrived at.
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual(["istimara", "spsp"]);
  });
});

/* ───── ruling 1 — the operator's documents are a STATUS, not a document list (owner, 2026-08-08) ───── */

describe("the operator's certificates say present or absent, and expose no file", () => {
  const held = () => groupBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "tuv, spsp")).operator;

  it("states presence, green or red, with the group's own attention count", () => {
    const g = held();
    expect(g.rows.map((r) => [r.key, r.status, r.statusLine.en])).toEqual([
      ["doc:operator:tuv", "present", "on the machine's file"],
      ["doc:operator:spsp", "missing", "no document yet"],
    ]);
    expect(g.attention).toBe(1);
  });

  it("exposes NO url — not on the held row, and not on the missing one", () => {
    // Nothing validates an operator document on upload, so a file the renter can open would present an
    // unchecked upload as verified evidence. Presence is a fact the platform can stand behind.
    for (const row of held().rows) {
      expect(row.downloadUrl).toBeNull();
      expect(row.files).toEqual([]);
      expect(row.thumbUrl).toBeNull();
    }
  });

  it("offers NO view and NO download control — the withdrawn behaviour cannot come back by accident", () => {
    for (const row of held().rows) expect(docRowActions(row)).toEqual([]);
  });

  it("carries no url even when the lessor filed several copies", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "operator_tuv", url: "https://x/op-1" },
          { type: "operator_tuv", url: "https://x/op-2" },
        ],
      }),
      asking([], "tuv"),
    );
    expect(g.operator.rows[0].status).toBe("present");
    expect(JSON.stringify(g.operator)).not.toContain("https://x/op-");
  });

  it("reads the SCORER's `present`, so the panel and the readiness card cannot disagree", () => {
    // `computeUnitReadiness` falls back to the equipment bucket for a paper carrying no `operator_`
    // prefix. Bucketing `documentKeys` a second time here is exactly the second opinion this avoids —
    // which also means the panel inherits the scorer's own reach, including this one.
    const g = groupBy(machine({ docs: [{ type: "operating_license" }] }), asking([], "operating_license"));
    expect(g.operator.rows.map((r) => [r.key, r.status])).toEqual([["doc:operator:operating_license", "present"]]);
  });

  it("folds two spellings of one licence into one row, and one verdict — satisfied if EITHER was", () => {
    // `operator_license` and `operating_license` are one paper. The scorer answers each ask token
    // separately and its `canonicalCertCode` sends the two spellings to different keys, so only the
    // second is matched here; folding them without OR-ing would let the spelling the renter typed decide
    // whether his own licence counts.
    const g = groupBy(
      machine({ docs: [{ type: "operating_license" }] }),
      asking([], "operator_license / operating_license"),
    );
    expect(g.operator.rows.map((r) => [r.key, r.status])).toEqual([["doc:operator:operating_license", "present"]]);
  });

  it("keeps a held operator paper out of the equipment's papers — no url through the other door", () => {
    const g = groupBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "tuv"));
    expect(g.documents.rows.map((r) => r.key)).toEqual(["doc:ownership"]);
    expect(JSON.stringify(g.documents)).not.toContain("operator_tuv");
  });
});

/* ──────────── V15 — view and download on every document (004a §7, RM3-AC-69) ──────────── */

describe("docRowActions — view first, download second, and neither without a url (AC-69)", () => {
  it("a row WITH a url exposes both controls", () => {
    const actions = docRowActions({ downloadUrl: "https://x/cr.pdf" });
    expect(actions.map((a) => a.kind)).toEqual(["view", "download"]);
    for (const a of actions) expect(a.href).toBe("https://x/cr.pdf");
  });

  it("view comes FIRST — the common act must not be the effortful one", () => {
    expect(docRowActions({ downloadUrl: "https://x/cr.pdf" })[0].kind).toBe("view");
  });

  it("view is the ONLY primary", () => {
    const actions = docRowActions({ downloadUrl: "https://x/cr.pdf" });
    expect(actions.filter((a) => a.primary).map((a) => a.kind)).toEqual(["view"]);
  });

  it("only DOWNLOAD asks the browser to save — view renders", () => {
    expect(docRowActions({ downloadUrl: "https://x/cr.pdf" }).map((a) => a.download)).toEqual([false, true]);
  });

  it("a row WITHOUT a url exposes NEITHER control — never a dead button", () => {
    expect(docRowActions({ downloadUrl: null })).toEqual([]);
  });

  it("an empty-string url is an absent url, not a link to nowhere", () => {
    expect(docRowActions({ downloadUrl: "" })).toEqual([]);
  });
});

describe("every document family on this surface is openable (AC-69)", () => {
  it("equipment PAPERS — a held paper gets both controls, an absent one gets none", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }] }), asking(["tuv"], "tuv"));
    const ownership = g.documents.rows.find((r) => r.key === "doc:ownership")!;
    const cert = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(docRowActions(ownership).map((a) => a.kind)).toEqual(["view", "download"]);
    expect(docRowActions(cert)).toEqual([]);
    // The operator's rows are the deliberate exception — never openable, held or not (ruling 1).
    expect(g.operator.rows.flatMap((r) => docRowActions(r))).toEqual([]);
  });

  it("equipment PHOTOS — a separate group, and just as openable as a paper", () => {
    const [photos] = equipmentDocGroups(machine({ photos: [{ slot: "front" }] }), NO_ASKS);
    const front = photos.rows.find((r) => r.key === "photo:front")!;
    expect(docRowActions(front).map((a) => a.kind)).toEqual(["view", "download"]);
    expect(docRowActions(front)[0].href).toBe("https://x/front");
    // The three slots the machine has no photo for stay unopenable rather than dead.
    for (const row of photos.rows.filter((r) => r.key !== "photo:front")) expect(docRowActions(row)).toEqual([]);
  });

  it("COMPANY papers — same pair, and a row with no url still has nothing to press", () => {
    const rows = companyDocRows({
      verified: true,
      docs: { cr: { present: true, downloadUrl: "https://x/cr.pdf" }, vat: { present: true } },
    });
    const by = (k: string) => rows.find((r) => r.key === k)!;
    expect(docRowActions(by("cr")).map((a) => a.kind)).toEqual(["view", "download"]);
    // Present but with no url, and absent entirely, come out the same way: nothing to press.
    expect(docRowActions(by("vat"))).toEqual([]);
    expect(docRowActions(by("national_address"))).toEqual([]);
  });

  it("SASO — the fifth company row, openable on exactly the same terms", () => {
    const withUrl = companyDocRows({
      verified: true,
      docs: { saso: { present: true, downloadUrl: "https://x/saso.pdf" } },
    }).find((r) => r.key === "saso")!;
    expect(docRowActions(withUrl).map((a) => a.kind)).toEqual(["view", "download"]);
    expect(docRowActions(withUrl)[0].href).toBe("https://x/saso.pdf");

    const absent = companyDocRows({ verified: true, docs: {} }).find((r) => r.key === "saso")!;
    expect(absent.statusLine.en).toBe("no document yet");
    expect(docRowActions(absent)).toEqual([]);
  });

  it("EVERY company key the panel lists is covered — the list cannot grow past these assertions", () => {
    const docs = Object.fromEntries(
      COMPANY_DOC_KEYS.map((k) => [k, { present: true, downloadUrl: `https://x/${k}.pdf` }]),
    );
    for (const row of companyDocRows({ verified: true, docs })) {
      expect(docRowActions(row).map((a) => a.kind)).toEqual(["view", "download"]);
    }
    for (const row of companyDocRows({ verified: true, docs: {} })) {
      expect(docRowActions(row)).toEqual([]);
    }
  });

  it("being openable adds NO verification state to an equipment row (§6.6, §7.2)", () => {
    const groups = equipmentDocGroups(
      machine({ docs: [{ type: "istimara", verifyStatus: "verified", expiryDate: "2030-01-01" }] }),
      asking(["tuv"], "tuv"),
    );
    for (const row of groups.flatMap((g) => g.rows)) {
      expect(["present", "on_file", "missing"]).toContain(row.status);
      expect([
        "uploaded",
        "not uploaded",
        "uploaded · not required",
        "on the machine's file",
        "no document yet",
        "on the machine's file · not required",
      ]).toContain(row.statusLine.en);
      // The row's whole shape, so a verify badge or an expiry cannot arrive by accident.
      expect(Object.keys(row).sort()).toEqual(
        ["docTypes", "downloadUrl", "files", "key", "label", "requestable", "status", "statusLine", "thumbUrl"],
      );
    }
  });
});

describe("attentionCount", () => {
  it("counts only rows whose status is missing", () => {
    expect(
      attentionCount([{ status: "present" }, { status: "missing" }, { status: "verified" }, { status: "on_file" }, { status: "missing" }]),
    ).toBe(2);
  });
});

describe("batchDocumentRequest — one request naming several types (AC-38)", () => {
  const rows = [
    { key: "a", label: { en: "A", ar: "أ" }, docTypes: ["tuv"] },
    { key: "b", label: { en: "B", ar: "ب" }, docTypes: ["istimara"] },
    { key: "c", label: { en: "C", ar: "ج" }, docTypes: ["tuv"] },
  ];

  it("is null when nothing is ticked, so the send control has one source of truth", () => {
    expect(batchDocumentRequest("equipment", "eq-1", rows, new Set())).toBeNull();
  });

  it("emits ONE draft carrying every ticked type, deduped", () => {
    const draft = batchDocumentRequest("equipment", "eq-1", rows, new Set(["a", "b", "c"]));
    expect(draft).toEqual({
      kind: "document",
      equipmentId: "eq-1",
      scope: "equipment",
      docTypes: ["tuv", "istimara"],
      labels: [rows[0].label, rows[1].label, rows[2].label],
    });
  });

  it("nulls the equipmentId for company papers — they belong to the firm, not a machine", () => {
    const draft = batchDocumentRequest("company", "eq-1", rows, new Set(["a"]));
    expect(draft && draft.kind === "document" && draft.equipmentId).toBeNull();
  });

  it("never emits the retired `add_to_offer` kind", () => {
    const draft = batchDocumentRequest("equipment", "eq-1", rows, new Set(["a"]));
    expect(draft?.kind).toBe("document");
  });

  it("drops a ticked row that is not requestable — the tick and the ask cannot disagree", () => {
    const mixed = [{ ...rows[0], requestable: false }, { ...rows[1], requestable: true }];
    const draft = batchDocumentRequest("equipment", "eq-1", mixed, new Set(["a", "b"]));
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual(["istimara"]);
  });

  it("is null when every ticked row is unrequestable, so an empty ask cannot be composed", () => {
    const none = rows.map((r) => ({ ...r, requestable: false }));
    expect(batchDocumentRequest("equipment", "eq-1", none, new Set(["a", "b", "c"]))).toBeNull();
  });
});

/* ────────────────────────── company documents (V9) ────────────────────────── */

describe("companyDocRows — verification AND expiry, unlike the equipment rows (AC-40)", () => {
  it("carries CR, VAT, national address, local content and SASO", () => {
    expect(COMPANY_DOC_KEYS).toEqual(["cr", "vat", "national_address", "local_content", "saso"]);
  });

  // `local_content` and `saso` are HELD CERTS, not catalogue documents — the reason a renter's
  // request naming either was refused until V14 gave them catalogue keys. A renter verifying a firm
  // does not care which table a paper is stored in, so both belong in this list.
  it("lists the two held certs beside the three catalogue papers", () => {
    expect(COMPANY_DOC_KEYS).toContain("local_content");
    expect(COMPANY_DOC_KEYS).toContain("saso");
  });

  it("labels SASO with the backend's own Arabic — one paper must not read as two", () => {
    const saso = companyDocRows({ verified: true, docs: {} }).find((r) => r.key === "saso")!;
    expect(saso.label.en).toBe("SASO registration");
    expect(saso.label.ar).toBe("تسجيل ساسو");
  });

  it("carries NO IBAN row — the product owner removed it, so the spec (§6.1 / AC-41) is now wrong", () => {
    const rows = companyDocRows({ verified: true, docs: { cr: { present: true } } });
    const text = JSON.stringify(rows).toLowerCase();
    expect(text).not.toContain("iban");
    expect(text).not.toContain("bank");
    expect(COMPANY_DOC_KEYS).not.toContain("iban" as never);
  });

  it("reads a missing paper as needing action, with 'no document yet'", () => {
    const rows = companyDocRows({ verified: true, docs: {} });
    expect(rows.every((r) => r.status === "missing")).toBe(true);
    expect(rows[0].statusLine.en).toBe("no document yet");
    // Reads the array's length rather than a literal, so a sixth paper does not fail an unrelated
    // assertion — the claim is "every missing paper needs action", not "there are five of them".
    expect(attentionCount(rows)).toBe(COMPANY_DOC_KEYS.length);
  });

  it("says VERIFIED for a paper on a verified firm's file, and 'on file' otherwise", () => {
    expect(companyDocRows({ verified: true, docs: { cr: { present: true } } })[0].statusLine.en).toBe("verified");
    expect(companyDocRows({ verified: false, docs: { cr: { present: true } } })[0].statusLine.en).toBe("on file");
  });

  it("renders an expiry when one is known", () => {
    const row = companyDocRows({ verified: true, docs: { cr: { present: true, expiryDate: "2027-03-12" } } })[0];
    expect(row.statusLine.en).toContain("valid until");
    expect(row.statusLine.en).toContain("2027");
  });

  it("renders 'renews annually' instead when the paper has no fixed expiry", () => {
    const rows = companyDocRows({ verified: true, docs: { vat: { present: true, renewsAnnually: true } } });
    expect(rows.find((r) => r.key === "vat")?.statusLine.en).toBe("verified · renews annually");
  });

  it("prints no expiry clause at all when the payload carries none — never 'valid until null'", () => {
    const row = companyDocRows({ verified: true, docs: { cr: { present: true, expiryDate: null } } })[0];
    expect(row.statusLine.en).toBe("verified");
  });

  it("ignores an unparseable expiry rather than printing it raw", () => {
    const row = companyDocRows({ verified: true, docs: { cr: { present: true, expiryDate: "not-a-date" } } })[0];
    expect(row.statusLine.en).toBe("verified");
  });
});
