import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  companyPanelSource,
  mapCompanyDocuments,
  type CompanyPresence,
} from "@/lib/contract/company-documents";
import { companyDocRows, COMPANY_DOC_KEYS, docRowActions } from "@/components/map/panel/machine-panel-model";

/**
 * **V15 — the read, WIRED** (spec 004a §7; RM3-AC-68 / AC-69 / AC-70).
 *
 * `company-documents.test.ts` proved the parser. It could not catch the actual defect:
 * `BidMapWorkspace` built the company panel's `docs` prop from `bid.compliance` — presence booleans,
 * no `downloadUrl`, no `expiryDate`, no verification, no `saso` row — so every row rendered
 * "no document yet", `docRowActions` returned `[]` for all five, and AC-69's view/download was
 * unreachable on that panel while a fully-tested mapper sat behind a prop nobody fed.
 *
 * **A proven model behind an unwired prop is not coverage.** So this suite asserts the SEAM: what the
 * panel's source carries when the read has answered, what it carries when it has not, and — coarsely,
 * because this repo's vitest env is `node` with no component harness (see `chat-dock.test.ts`) — that
 * the host actually asks for it.
 */

const row = (over: Record<string, unknown> = {}) => ({
  documentKey: "cr",
  name: "Commercial Registration",
  nameAr: "السجل التجاري",
  // `batchSignItems` replaces the S3 key with the presigned url IN PLACE, so the url arrives as `key`.
  key: "https://s3/signed/cr.pdf?sig=abc",
  verified: true,
  expiryDate: "2027-03-01",
  ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  companyName: "Al Rajhi Equipment",
  verified: true,
  documents: [row()],
  ...over,
});

const presence = (over: Partial<CompanyPresence> = {}): CompanyPresence => ({
  activityLicense: true,
  taxNumber: true,
  nationalAddress: true,
  localContent: true,
  saso: true,
  ...over,
});

const bidLike = (over: Record<string, unknown> = {}) => ({
  supplierName: "Al Rajhi Equipment",
  verified: true,
  compliance: presence(),
  ...over,
});

/** All five papers as the backend serves them — one presigned url each, and a date where the platform
 *  stores one. This is the payload the panel was never given. */
const fullRead = () =>
  mapCompanyDocuments(
    payload({
      documents: [
        row({ documentKey: "cr", key: "https://s3/cr", expiryDate: "2027-03-01" }),
        row({ documentKey: "vat_cert", key: "https://s3/vat", expiryDate: "2026-12-31" }),
        row({ documentKey: "national_address", key: "https://s3/addr", expiryDate: "2028-01-15" }),
        row({ documentKey: "local_content", key: "https://s3/lc", expiryDate: "2027-06-30" }),
        row({ documentKey: "saso", key: "https://s3/saso", expiryDate: "2027-09-09" }),
      ],
    }),
  );

describe("companyPanelSource — what the company panel is actually fed", () => {
  it("REGRESSION: a successful read reaches the panel with ALL FIVE papers, each openable and each dated", () => {
    // The defect, stated as an assertion. Fed from `bid.compliance` this fails on the first
    // `downloadUrl` — which is exactly what shipped, and exactly why nothing could be pressed.
    const src = companyPanelSource(fullRead(), bidLike());

    expect(src.origin).toBe("read");
    // The panel iterates COMPANY_DOC_KEYS, so the source must answer under those spellings and no
    // others — `vat`, never the catalogue's `vat_cert`.
    expect(Object.keys(src.docs).sort()).toEqual([...COMPANY_DOC_KEYS].sort());

    for (const key of COMPANY_DOC_KEYS) {
      const entry = src.docs[key];
      expect(entry, `${key} is missing from the panel's source`).toBeDefined();
      expect(entry?.present).toBe(true);
      expect(typeof entry?.downloadUrl, `${key} carries no url — its row would expose no control`).toBe("string");
      expect(entry?.expiryDate, `${key} lost its expiry date on the way to the panel`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("REGRESSION: every row the read produced opens (AC-69) — which the presence fallback cannot", () => {
    const rows = companyDocRows({ verified: true, docs: companyPanelSource(fullRead(), bidLike()).docs });
    expect(rows).toHaveLength(COMPANY_DOC_KEYS.length);
    for (const r of rows) {
      expect(r.status, `${r.key} still reads as missing`).not.toBe("missing");
      // One control — view — pointed at the presigned url. The per-row DOWNLOAD glyph was withdrawn on
      // 2026-08-08 (downloading is the batch's job); what this regression pins is that the row is
      // reachable at all, which is what the presence fallback cannot make it.
      expect(docRowActions(r).map((a) => a.kind)).toEqual(["view"]);
    }

    // …and the shipped behaviour, for contrast: presence only, so not one control exists.
    const fallback = companyDocRows({ verified: true, docs: companyPanelSource(null, bidLike()).docs });
    expect(fallback.every((r) => docRowActions(r).length === 0)).toBe(true);
  });

  it("a read that has NOT answered falls back to the bid's presence — never to `no document yet`", () => {
    // "no document yet" is a statement about the LESSOR. A pending or failed read is a statement about
    // us, and the two must not be spelled the same way.
    const src = companyPanelSource(null, bidLike());

    expect(src.origin).toBe("presence");
    expect(Object.keys(src.docs).sort()).toEqual([...COMPANY_DOC_KEYS].sort());
    expect(companyDocRows({ verified: true, docs: src.docs }).some((r) => r.status === "missing")).toBe(false);
    // Presence, and nothing more: no invented url, no invented date.
    for (const key of COMPANY_DOC_KEYS) {
      expect(src.docs[key]?.downloadUrl ?? null).toBeNull();
      expect(src.docs[key]?.expiryDate ?? null).toBeNull();
    }
  });

  it("SASO is answerable from the fallback too — `compliance.saso` is the FIRM's registration", () => {
    // It reads `supplier_profiles.saso_heavy_equip_doc_key` / `held_cert_docs.SASO` / `certs.SASO` —
    // the same store the company SASO row names, never a listing's safety cert. So the fifth row is
    // not withheld for want of a field, and a firm without it says so honestly.
    expect(companyPanelSource(null, bidLike()).docs.saso?.present).toBe(true);
    expect(companyPanelSource(null, bidLike({ compliance: presence({ saso: false }) })).docs.saso).toBeUndefined();
  });

  it("a paper the bid does not claim is absent from the fallback — presence is never invented", () => {
    const src = companyPanelSource(null, bidLike({ compliance: presence({ taxNumber: false, localContent: false }) }));
    expect(src.docs.vat).toBeUndefined();
    expect(src.docs.local_content).toBeUndefined();
    expect(src.docs.cr?.present).toBe(true);
  });

  it("VAT falls back as `renews annually` rather than as a blank second line", () => {
    // The bid knows the certificate exists, never when it lapses.
    expect(companyPanelSource(null, bidLike()).docs.vat?.renewsAnnually).toBe(true);
  });

  it("a read that ANSWERED wins wholesale — a gap in it is not re-filled from `compliance`", () => {
    // The firm has a CR on file and no VAT certificate. `compliance.taxNumber` says otherwise; the read
    // is the one authority on the question, and re-filling the gap would render "on file" with nothing
    // behind it — a claim about the lessor the backend has just contradicted.
    const partial = mapCompanyDocuments(payload({ documents: [row({ documentKey: "cr", key: "https://s3/cr" })] }));
    const src = companyPanelSource(partial, bidLike());

    expect(src.origin).toBe("read");
    expect(src.docs.vat).toBeUndefined();
    expect(companyDocRows({ verified: true, docs: src.docs }).find((r) => r.key === "vat")?.status).toBe("missing");
  });

  it("identity comes from the BID, so the panel cannot contradict the header two lines above it", () => {
    const read = mapCompanyDocuments(payload({ companyName: "A Different Legal Name", verified: false }));
    const src = companyPanelSource(read, bidLike({ supplierName: "Al Rajhi Equipment", verified: true }));

    expect(src.companyName).toBe("Al Rajhi Equipment");
    expect(src.verified).toBe(true);
    // With no bid to ask, the read's own identity is used instead.
    expect(companyPanelSource(read, null).companyName).toBe("A Different Legal Name");
  });

  it("no bid and no read is an empty source, never a verified firm with five missing papers", () => {
    expect(companyPanelSource(null, null)).toEqual({
      companyName: null,
      verified: false,
      docs: {},
      origin: "presence",
    });
  });
});

describe("the wiring itself — the endpoint must have a caller", () => {
  // V14 shipped the BFF route, the mapper and thirteen passing tests, and NOTHING called any of it.
  // These assertions are coarse on purpose: with no component harness, reading the host's source is
  // the only way to catch a prop wired to the wrong place. They fail loudly if the fetch is removed or
  // the fallback ever becomes the only source again.
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("the BFF route has a typed client caller, and it is a GET", () => {
    const client = src("../../src/lib/api/client.ts");
    expect(client).toContain("fetchBidCompanyDocuments");
    expect(client).toContain("/company-documents");
    // A GET and only a GET: opening this panel creates no deal room (004a §4.5), and a `DealRoom` row
    // would freeze the lessor's offered count.
    expect(client).toMatch(/fetchBidCompanyDocuments[\s\S]{0,400}?getJson</);
  });

  it("BidMapWorkspace fetches the papers and feeds the panel from them, not from `bid.compliance`", () => {
    const host = src("../../src/components/map/BidMapWorkspace.tsx");
    expect(host).toContain("fetchBidCompanyDocuments");
    expect(host).toContain("companyPanelSource");
    // The old wiring, verbatim: the `docs` prop must not be the presence-only literal again.
    expect(host).not.toMatch(/docs=\{companyDocs\}/);
    expect(host).toMatch(/docs=\{companySource\.docs\}/);
  });
});
