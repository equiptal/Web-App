import { describe, it, expect } from "vitest";
import { mapCompanyDocuments } from "@/lib/contract/company-documents";

/**
 * **V14 — the company panel's missing read** (spec 004a §7, RM3-AC-68 / AC-70).
 *
 * `CompanyPanel` takes its rows as a `docs` prop and nothing could fill it: `getMyCompany` serves a
 * supplier his OWN company and `partner/company.ts` is the partner surface, so V9 rendered four rows
 * that were structurally always "no document yet". This suite pins the parser that finally can.
 *
 * What is asserted is the SHAPE the panel consumes, not a render: the mapper's whole job is to hand
 * `CompanyPanel` a `CompanyDocsSource` it can spread, so a host only has to pass one prop.
 */

const row = (over: Record<string, unknown> = {}) => ({
  documentKey: "cr",
  type: "cr",
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
  photoKeys: [],
  ...over,
});

describe("mapCompanyDocuments — the panel's source, parsed", () => {
  it("hands back exactly what CompanyPanel spreads: companyName, verified and a docs map", () => {
    const src = mapCompanyDocuments(payload());

    expect(src.companyName).toBe("Al Rajhi Equipment");
    expect(src.verified).toBe(true);
    expect(src.docs.cr).toMatchObject({
      present: true,
      expiryDate: "2027-03-01",
      downloadUrl: "https://s3/signed/cr.pdf?sig=abc",
      docType: "cr",
    });
  });

  it("reconciles the panel's `vat` with the catalogue's `vat_cert` — the docs map is keyed the panel's way, the docType the catalogue's", () => {
    // The row carries BOTH so a request raised from it names `vat_cert`, which is the only spelling
    // `assertKnownDocTypes` accepts; keying the map by `vat` is what the panel already iterates.
    const src = mapCompanyDocuments(payload({ documents: [row({ documentKey: "vat_cert", key: "u", expiryDate: null })] }));

    expect(src.docs.vat?.docType).toBe("vat_cert");
    expect(src.docs.vat_cert).toBeUndefined();
  });

  it("VAT with no date renders as `renews annually`, never as a blank expiry", () => {
    const src = mapCompanyDocuments(payload({ documents: [row({ documentKey: "vat_cert", key: "u", expiryDate: null })] }));
    expect(src.docs.vat?.renewsAnnually).toBe(true);
    // A paper that DOES carry a date states the date instead — the two lines are alternatives.
    const dated = mapCompanyDocuments(payload({ documents: [row({ documentKey: "vat_cert", key: "u", expiryDate: "2027-01-01" })] }));
    expect(dated.docs.vat?.renewsAnnually).toBeUndefined();
    expect(dated.docs.vat?.expiryDate).toBe("2027-01-01");
  });

  it("AC-70 — local content arrives as a first-class company paper", () => {
    // It is a HELD CERT server-side (`held_cert_docs.LC` / the legacy `local_content_doc_key`), which
    // is invisible from here on purpose: the endpoint resolved it, and the panel gets a row like any
    // other. That is what makes a `local_content` request answerable rather than merely sendable.
    const src = mapCompanyDocuments(
      payload({ documents: [row({ documentKey: "local_content", name: "Local Content", key: "https://s3/lc", expiryDate: null })] }),
    );

    expect(src.docs.local_content).toMatchObject({
      present: true,
      downloadUrl: "https://s3/lc",
      docType: "local_content",
      expiryDate: null,
    });
    // No expiry column exists for it, so `null` — and no `renewsAnnually` either, because it does not.
    expect(src.docs.local_content?.renewsAnnually).toBeUndefined();
  });

  it("a paper the backend did not send is simply ABSENT — which the panel already reads as `no document yet`", () => {
    const src = mapCompanyDocuments(payload());
    expect(src.docs.vat).toBeUndefined();
    expect(src.docs.national_address).toBeUndefined();
    expect(src.docs.local_content).toBeUndefined();
  });

  it("a row with NO url is dropped — never a dead control (AC-69)", () => {
    const src = mapCompanyDocuments(payload({ documents: [row({ key: null }), row({ documentKey: "vat_cert", key: "u" })] }));
    expect(src.docs.cr).toBeUndefined();
    expect(src.docs.vat).toBeDefined();
    expect(src.documents).toHaveLength(1);
  });

  it("tolerates the legacy names getDealRoomDocuments emits, so either projection lands on the same row", () => {
    const src = mapCompanyDocuments(
      payload({
        documents: [
          { documentKey: "commercial_register", url: "https://s3/cr" },
          { documentKey: "municipal_license", url: "https://s3/addr" },
        ],
      }),
    );
    expect(src.docs.cr?.downloadUrl).toBe("https://s3/cr");
    expect(src.docs.national_address?.downloadUrl).toBe("https://s3/addr");
  });

  it("a document key the platform does not know is dropped rather than rendered under a guessed label", () => {
    const src = mapCompanyDocuments(payload({ documents: [row({ documentKey: "iban", key: "https://s3/iban" })] }));
    expect(src.documents).toEqual([]);
    expect(Object.keys(src.docs)).toEqual([]);
  });

  it("per-row verification defaults to the FIRM's — there is no per-document review", () => {
    const src = mapCompanyDocuments(payload({ verified: false, documents: [{ documentKey: "cr", key: "u" }] }));
    expect(src.verified).toBe(false);
    expect(src.documents[0].verified).toBe(false);
  });

  it("an unparseable expiry is a GAP, never a printed null and never a false `expired`", () => {
    const src = mapCompanyDocuments(payload({ documents: [row({ expiryDate: "1448/07/15" })] }));
    expect(src.docs.cr?.expiryDate).toBeNull();
  });

  it("unwraps a `{data: …}` envelope, and never throws on junk", () => {
    expect(mapCompanyDocuments({ data: payload() }).docs.cr).toBeDefined();
    for (const junk of [null, undefined, 0, "", [], { documents: "no" }]) {
      const src = mapCompanyDocuments(junk);
      expect(src.documents).toEqual([]);
      expect(src.verified).toBe(false);
      expect(src.companyName).toBeNull();
    }
  });

  it("a duplicated key keeps the FIRST row — two rows for one paper would render the panel twice", () => {
    const src = mapCompanyDocuments(payload({ documents: [row({ key: "https://s3/one" }), row({ key: "https://s3/two" })] }));
    expect(src.documents).toHaveLength(1);
    expect(src.docs.cr?.downloadUrl).toBe("https://s3/one");
  });
});
