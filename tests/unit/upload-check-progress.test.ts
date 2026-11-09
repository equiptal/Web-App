/**
 * The company check's progress file as the browser reads it (company doc check CC-12, contract-v4
 * §2, §7): lenient on what it does not know, never «missing» on a guess (R2).
 */
import { describe, expect, it } from "vitest";
import { companyFindings, isAnswer, parseProgress, sharpToSend } from "@/lib/upload-check/progress";

const file = (extra: Record<string, unknown> = {}) => ({
  checkId: "c1",
  status: "done",
  updatedAt: "t1",
  files: [{ id: 0, kind: "company", paper: "cr", state: "read" }],
  machines: [],
  papers: [
    { paper: "cr", state: "present", files: [0] },
    { paper: "vat", state: "present", files: [1] },
    { paper: "address", state: "missing", files: [] },
  ],
  notes: [],
  ...extra,
});

describe("parseProgress (company)", () => {
  it("Given a pile with CR and VAT read, Then the address is the one missing paper", () => {
    const p = parseProgress(file())!;
    expect(companyFindings(p)).toEqual({ missing: ["address"], allPresent: false, notes: [] });
  });

  it("Given a paper not checked, Then it is never shown as missing (R2)", () => {
    const p = parseProgress(
      file({
        papers: [
          { paper: "cr", state: "not_checked" },
          { paper: "vat", state: "present" },
          { paper: "address", state: "present" },
        ],
      }),
    )!;
    expect(companyFindings(p)).toEqual({ missing: [], allPresent: false, notes: [] });
  });

  it("Given an unknown paper state, Then it reads as not_checked, not missing", () => {
    const p = parseProgress(file({ papers: [{ paper: "cr", state: "weird" }] }))!;
    expect(p.papers).toEqual([{ paper: "cr", state: "not_checked" }]);
    expect(companyFindings(p)!.missing).toEqual([]);
  });

  it("Given all three present, Then allPresent", () => {
    const p = parseProgress(
      file({ papers: ["cr", "vat", "address"].map((paper) => ({ paper, state: "present" })) }),
    )!;
    expect(companyFindings(p)).toEqual({ missing: [], allPresent: true, notes: [] });
  });

  it("Given notes, Then the known codes are kept with their paper and date, unknown codes skipped", () => {
    const p = parseProgress(
      file({
        notes: [
          { code: "expired", paper: "cr", date: "2026-03-12" },
          { code: "cr_on_platform", paper: "cr" },
          { code: "name_mismatch", paper: null },
          { code: "a_code_from_tomorrow", paper: "cr" },
          { code: "unclear_number", paper: "local_content" },
          { code: "expired", paper: "address" }, // no date: cannot be worded
        ],
      }),
    )!;
    expect(p.notes).toEqual([
      { code: "expired", paper: "cr", date: "2026-03-12" },
      { code: "cr_on_platform", paper: "cr", date: null },
      { code: "name_mismatch", paper: null, date: null },
    ]);
  });

  it("Given a half-written or foreign object, Then null", () => {
    expect(parseProgress(null)).toBeNull();
    expect(parseProgress({ status: "done" })).toBeNull();
    expect(parseProgress("x")).toBeNull();
  });

  it("Given a failed check, Then nothing to draw", () => {
    expect(companyFindings(parseProgress(file({ status: "failed" }))!)).toBeNull();
  });

  it("Given a running check, Then nothing to draw yet (no «missing» while files are read)", () => {
    expect(companyFindings(parseProgress(file({ status: "running" }))!)).toBeNull();
  });
});

describe("isAnswer and sharpToSend", () => {
  it("Given the stale write or a missing file, Then not the answer", () => {
    const p = parseProgress(file())!;
    expect(isAnswer(p, "c1", [0], null)).toBe(true);
    expect(isAnswer(p, "c1", [0], "t1")).toBe(false);
    expect(isAnswer(p, "c1", [0, 1], null)).toBe(false);
    expect(isAnswer(p, "other", [0], null)).toBe(false);
  });

  it("Given needSharp, Then only the pages not sent yet", () => {
    const p = parseProgress(file({ needSharp: [{ id: 0, pages: [0, 1] }] }))!;
    expect(sharpToSend(p, new Set(["0:0"]))).toEqual([{ id: 0, pages: [1] }]);
  });
});
