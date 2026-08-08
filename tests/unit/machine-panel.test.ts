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
// The company panel's *decisions* are pure functions exported beside the component — which rows may be
// ticked, what a batch covers, what each saved file is called. Imported as a namespace as well, because
// "this module exports no request path" is itself one of the claims (AC-72).
import * as companyPanelModule from "@/components/map/panel/CompanyPanel";
import {
  companyDownloadBatch,
  companyDownloadFileName,
  companySelectableKeys,
} from "@/components/map/panel/CompanyPanel";
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
  type CompanyDocKey,
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
        url: d.url ?? `https://x/${d.type}`,
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

describe("equipment photos — the fraction the spec asks for", () => {
  it("greens only at four of four", () => {
    const c = cellsBy(machine({ photos: ALL_FOUR }), {}).photos;
    expect(c.state).toBe("green");
    expect(c.en).toBe("4 of 4 uploaded");
  });

  it("reds at three of four and says so — a '3 of 4' that read green would contradict itself", () => {
    const c = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "serial" }, { slot: "equipment" }] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.en).toBe("3 of 4 uploaded");
  });

  it("reds at none, and reports zero rather than omitting the cell", () => {
    const c = cellsBy(machine({ photos: [] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.en).toBe("0 of 4 uploaded");
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

describe("equipmentDocGroups — two groups, each with its own attention count (AC-42)", () => {
  it("splits photos from documents and never merges the two counts", () => {
    const groups = equipmentDocGroups(machine({ photos: ALL_FOUR, docs: [] }));
    expect(groups.map((g) => g.key)).toEqual(["photos", "documents"]);
    expect(groups[0].rows).toHaveLength(4);
    expect(groups[1].rows).toHaveLength(3);
  });

  it("counts ROWS NEEDING ACTION, never totals", () => {
    const groups = equipmentDocGroups(machine({ photos: [{ slot: "front" }], docs: [{ type: "tuv" }] }));
    expect(groups[0].attention).toBe(3); // plate · meter · side outstanding, not 4
    expect(groups[1].attention).toBe(2); // ownership · operator outstanding, not 3
  });

  it("reports zero attention when everything is on the file", () => {
    const groups = equipmentDocGroups(
      machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "tuv" }, { type: "operator_tuv" }] }),
    );
    expect(groups.map((g) => g.attention)).toEqual([0, 0]);
  });

  it("files `operating_license` under the OPERATOR row — it carries no `operator_` prefix", () => {
    const [, docs] = equipmentDocGroups(machine({ docs: [{ type: "operating_license" }] }));
    const operator = docs.rows.find((r) => r.key === "doc:operator_cert");
    const equip = docs.rows.find((r) => r.key === "doc:equipment_cert");
    expect(operator?.status).toBe("present");
    expect(equip?.status).toBe("missing");
  });

  it("does not call a spec sheet an equipment safety certificate", () => {
    const [, docs] = equipmentDocGroups(machine({ docs: [{ type: "spec_sheet" }, { type: "other" }] }));
    expect(docs.rows.find((r) => r.key === "doc:equipment_cert")?.status).toBe("missing");
  });

  it("shows PRESENCE ONLY — never a verification badge or an expiry (AC-39, §6.6)", () => {
    // The wire carries both fields. Nothing may render them here: a badge invites the renter to judge
    // a supplier on a state the platform sets.
    const groups = equipmentDocGroups(
      machine({ docs: [{ type: "tuv", verifyStatus: "verified", expiryDate: "2027-03-12" }] }),
    );
    const row = groups[1].rows.find((r) => r.key === "doc:equipment_cert");
    expect(row?.statusLine.en).toBe("on the machine's file");
    const text = JSON.stringify(groups);
    for (const leak of ["verified", "failed", "2027", "expiry", "valid until"]) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it("uses the presence vocabulary the spec names, and no other", () => {
    const groups = equipmentDocGroups(machine({ photos: [{ slot: "front" }] }));
    const lines = groups.flatMap((g) => g.rows.map((r) => r.statusLine.en));
    for (const line of lines) {
      expect(["uploaded", "not uploaded", "on the machine's file", "no document yet"]).toContain(line);
    }
  });

  it("gives every row a download link when it holds a file, and none when it does not", () => {
    const groups = equipmentDocGroups(machine({ photos: [{ slot: "front" }] }));
    expect(groups[0].rows[0].downloadUrl).toBe("https://x/front");
    expect(groups[0].rows[1].downloadUrl).toBeNull();
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
    const [, papers] = equipmentDocGroups(machine({ docs: [{ type: "istimara" }] }));
    const ownership = papers.rows.find((r) => r.key === "doc:ownership")!;
    const operator = papers.rows.find((r) => r.key === "doc:operator_cert")!;
    expect(docRowActions(ownership).map((a) => a.kind)).toEqual(["view", "download"]);
    expect(docRowActions(operator)).toEqual([]);
  });

  it("equipment PHOTOS — a separate group, and just as openable as a paper", () => {
    const [photos] = equipmentDocGroups(machine({ photos: [{ slot: "front" }] }));
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
    );
    for (const row of groups.flatMap((g) => g.rows)) {
      expect(["present", "missing"]).toContain(row.status);
      expect(["uploaded", "not uploaded", "on the machine's file", "no document yet"]).toContain(row.statusLine.en);
      expect(Object.keys(row).sort()).toEqual(
        ["docTypes", "downloadUrl", "key", "label", "status", "statusLine", "thumbUrl"],
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
    expect(batchDocumentRequest("eq-1", rows, new Set())).toBeNull();
  });

  it("emits ONE draft carrying every ticked type, deduped", () => {
    const draft = batchDocumentRequest("eq-1", rows, new Set(["a", "b", "c"]));
    expect(draft).toEqual({
      kind: "document",
      equipmentId: "eq-1",
      docTypes: ["tuv", "istimara"],
      labels: [rows[0].label, rows[1].label, rows[2].label],
    });
  });

  /* A test here asserted that a `"company"` scope nulled the equipmentId, because company papers
   * belong to the firm. The product owner withdrew the company-scope document request on 2026-08-08 —
   * a document request names a machine — so the `scope` parameter is gone, the id is non-nullable, and
   * the test is deleted rather than inverted. The company panel's ticks came back later the same day —
   * for a batch **download**, not an ask (AC-72) — and are covered at the bottom of this file; nothing
   * about the composer changed with them. See `CompanyPanel.tsx`. */

  it("never emits the retired `add_to_offer` kind", () => {
    const draft = batchDocumentRequest("eq-1", rows, new Set(["a"]));
    expect(draft?.kind).toBe("document");
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

/* ───────── the company panel's selection — ticks that DOWNLOAD, never ask (AC-72) ───────── */

/**
 * The panel lost its ticks on 2026-08-08 with the company-scope request, and got them back the same day
 * for a different verb: a renter wants a firm's CR **and** its VAT certificate, and select-all is the
 * thing that stops him clicking five rows one at a time.
 *
 * The two claims below are the whole of it. **What the batch covers** — the ticked rows that have a url,
 * never one more — because a control that saves four of the five files it counted is the failure a batch
 * "view" would have been (five `window.open`s, four blocked). And **no request control**, which is the
 * half that did not come back: `CompanyPanel` has no `onRequest` prop, and a company row still carries
 * no requestable document types for one to name.
 */
describe("the company panel's batch — download, and only over rows with a file (AC-69, AC-72)", () => {
  const withUrls = (keys: CompanyDocKey[]) =>
    companyDocRows({
      verified: true,
      docs: Object.fromEntries(
        COMPANY_DOC_KEYS.map((k) => [k, { present: keys.includes(k), downloadUrl: keys.includes(k) ? `https://x/${k}.pdf` : null }]),
      ),
    });

  it("supplies selection: every row carrying a url may be ticked", () => {
    const rows = withUrls([...COMPANY_DOC_KEYS]);
    expect(companySelectableKeys(rows)).toEqual(COMPANY_DOC_KEYS);
  });

  it("a row with NO url is not selectable — a tick that saves nothing is a dead control", () => {
    const rows = withUrls(["cr", "vat"]);
    expect(companySelectableKeys(rows)).toEqual(["cr", "vat"]);
    // The three papers the firm has not filed are still LISTED — they are just not tickable.
    expect(rows).toHaveLength(COMPANY_DOC_KEYS.length);
    expect(rows.filter((r) => !r.downloadUrl).map((r) => r.key)).toEqual(["national_address", "local_content", "saso"]);
  });

  it("a paper present but url-less (an unsigned key) is listed and still not selectable", () => {
    const rows = companyDocRows({ verified: true, docs: { cr: { present: true } } });
    expect(rows.find((r) => r.key === "cr")?.statusLine.en).toBe("verified");
    expect(companySelectableKeys(rows)).toEqual([]);
  });

  it("the batch covers EXACTLY the selected rows that have urls — in the list's order", () => {
    const rows = withUrls(["cr", "vat", "saso"]);
    const batch = companyDownloadBatch(rows, new Set(["saso", "cr", "national_address"]));
    expect(batch.map((t) => t.key)).toEqual(["cr", "saso"]);
    expect(batch.map((t) => t.url)).toEqual(["https://x/cr.pdf", "https://x/saso.pdf"]);
    expect(batch.map((t) => t.label.en)).toEqual(["Commercial registration", "SASO registration"]);
  });

  it("a tick that survived a row losing its url drops out of the batch, so the count cannot overstate", () => {
    const before = withUrls(["cr", "vat"]);
    const selected = new Set(companySelectableKeys(before));
    expect(companyDownloadBatch(before, selected)).toHaveLength(2);
    // Same selection, a payload where VAT is no longer signed: the batch shrinks with it.
    expect(companyDownloadBatch(withUrls(["cr"]), selected).map((t) => t.key)).toEqual(["cr"]);
  });

  it("selecting nothing yields an empty batch, so the send control has one source of truth", () => {
    expect(companyDownloadBatch(withUrls([...COMPANY_DOC_KEYS]), new Set())).toEqual([]);
  });

  it("names each saved file after the row the renter read, keeping the url's extension", () => {
    expect(companyDownloadFileName("Commercial registration", "https://s3/x/abc-123.pdf?sig=1")).toBe(
      "Commercial registration.pdf",
    );
    expect(companyDownloadFileName("السجل التجاري", "https://s3/x/abc-123.PNG")).toBe("السجل التجاري.png");
  });

  it("omits the extension rather than guessing one — a wrong extension opens the wrong app", () => {
    expect(companyDownloadFileName("VAT certificate", "https://s3/x/abc-123?sig=1")).toBe("VAT certificate");
  });

  it("never lets a label become a path — a batch writes files, and '/' is not a name", () => {
    expect(companyDownloadFileName("CR / VAT", "https://s3/x/a.pdf")).toBe("CR VAT.pdf");
  });

  /* The load-bearing half of the reversal, unchanged: the ticks are back, the ASK is not. */
  it("carries NO request control: no company row names a requestable document type", () => {
    for (const row of companyDocRows({ verified: true, docs: { cr: { present: true, downloadUrl: "https://x/cr.pdf" } } })) {
      expect(row).not.toHaveProperty("docTypes");
    }
  });

  it("exports a download path and no request path — a tick feeds nothing else", () => {
    expect(Object.keys(companyDownloadBatch(withUrls(["cr"]), new Set(["cr"]))[0]).sort()).toEqual([
      "key",
      "label",
      "url",
    ]);
    const exported = Object.keys(companyPanelModule);
    expect(exported).toContain("CompanyPanel");
    // V8 takes an `onRequest` and composes a `PanelRequestDraft`; V9 has no such thing to export, and
    // this is the assertion that fails the day somebody re-adds one.
    expect(exported.filter((n) => /request|ask|compose/i.test(n))).toEqual([]);
  });
});
