// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { readSubmitError } from "@/lib/contract/submit-error";
import { SubmitError } from "@/components/create/SubmitError";

/**
 * What a failed submit says to the renter.
 *
 * Owner, 2026-09-12, after meeting «Connection problem / Failed to create request /
 * INTERNAL_ERROR · 500» over a request that would not post: *"can we make the error messages clear
 * to the user and user friendly and clearly have the reason, not like this by numbers"*.
 */

const c = en.errors.submit;
const draw = (detail: Parameters<typeof readSubmitError>[0]) =>
  render(
    <LocaleProvider initialLocale="en">
      <SubmitError detail={detail} />
    </LocaleProvider>,
  );

afterEach(cleanup);

describe("which side the fault is on", () => {
  it("Given a 5xx, Then it is OURS and says so", () => {
    /**
     * 🔴 The case he hit. A renter told "check your details" about our own 500 goes hunting through
     * a request that is fine, so the sentence has to name the side.
     */
    expect(readSubmitError({ backendCode: "INTERNAL_ERROR", backendStatus: 500 }).kind).toBe("ours");
    expect(readSubmitError({ backendStatus: 502 }).kind).toBe("ours");
    expect(readSubmitError({ backendStatus: 503 }).kind).toBe("ours");
  });

  it("Given a 4xx, Then it is the REQUEST", () => {
    expect(readSubmitError({ backendCode: "VALIDATION_ERROR", backendStatus: 422 }).kind).toBe("yours");
    expect(readSubmitError({ backendStatus: 400 }).kind).toBe("yours");
  });

  it("Given 401 or 403, Then it is the ACCOUNT, not the request", () => {
    // ⚠️ Its own answer, because retrying changes nothing: he signs in, or completes his profile.
    expect(readSubmitError({ backendStatus: 401 }).kind).toBe("auth");
    expect(readSubmitError({ backendCode: "E8007", backendStatus: 403 }).kind).toBe("auth");
  });

  it("Given NO status at all, Then it is the connection", () => {
    /**
     * ⚠️ Not "unknown". A fetch that never got a reply leaves no status, and the renter's next move
     * is to check his connection rather than to press again.
     */
    expect(readSubmitError({ detail: "Failed to fetch" }).kind).toBe("offline");
    expect(readSubmitError(null).kind).toBe("offline");
  });

  it("Given the eighteen E80xx codes, Then no sentence is invented for them", () => {
    /**
     * 🔴 This app has verified the meaning of two of them. Eighteen sentences would mean inventing
     * sixteen, and a confident wrong explanation sends a renter to fix something that is not broken.
     * The STATUS decides; the code is only ever carried as a reference.
     */
    const a = readSubmitError({ backendCode: "E8013", backendStatus: 500 });
    const b = readSubmitError({ backendCode: "E8004", backendStatus: 500 });
    expect(a.key).toBe(b.key);
    expect(a.reference).toBe("E8013 · 500");
  });
});

describe("the backend's own words", () => {
  it("Given a real sentence, Then it is shown under ours", () => {
    const read = readSubmitError({ detail: "This project already has a request for that machine", backendStatus: 409 });
    expect(read.detail).toBe("This project already has a request for that machine");
  });

  it("Given OUR OWN failure, Then the backend's echo is dropped", () => {
    /* ⚠️ «Failed to create request» under «your request was not sent» is the same news twice, in
       two voices. On a 5xx there is nothing he can do with the backend's words, so they go. */
    expect(readSubmitError({ detail: "Failed to create request", backendStatus: 500 }).detail).toBeNull();
  });

  it("Given something written for a log, Then it is dropped", () => {
    // ⚠️ A message meant for whoever reads the logs is not an explanation, and printing it is how
    // the banner degrades back into the thing this replaces.
    for (const d of ["undefined", "INTERNAL_ERROR", "TypeError: x is not a function at foo.bar", "{ code: 422 }", "https://x/y"]) {
      expect(readSubmitError({ detail: d, backendStatus: 422 }).detail).toBeNull();
    }
  });
});

describe("what the renter actually reads", () => {
  it("Given the 500 he hit, Then no number is on screen", () => {
    draw({ detail: "Failed to create request", backendCode: "INTERNAL_ERROR", backendStatus: 500 });

    expect(screen.getByText(c.oursTitle)).toBeTruthy();
    expect(screen.getByText(c.oursBody)).toBeTruthy();
    // 🔴 The whole point: the code is not printed.
    expect(screen.queryByText(/INTERNAL_ERROR/)).toBeNull();
    expect(screen.queryByText(/500/)).toBeNull();
    // ⚠️ And "Failed to create request" is the backend talking to its logs, so it is dropped too.
    expect(screen.queryByText(/Failed to create request/)).toBeNull();
  });

  it("Given support needs the code, Then it is one press away", () => {
    // ⚠️ Kept, not deleted (2026-09-03 put it on screen so a renter could paste one line). It is a
    // press now, so it cannot be the first thing he reads.
    draw({ backendCode: "INTERNAL_ERROR", backendStatus: 500 });
    expect(screen.getByText(c.copyRef)).toBeTruthy();
  });

  it("Given no code at all, Then nothing offers to copy one", () => {
    draw(null);
    expect(screen.getByText(c.offlineTitle)).toBeTruthy();
    expect(screen.queryByText(c.copyRef)).toBeNull();
  });
});

describe("naming the field the backend refused", () => {
  /** What a `VALIDATION_ERROR` actually carries: zod's `flatten()`. */
  const flat = (fieldErrors: Record<string, string[]>) => ({
    backendCode: "VALIDATION_ERROR",
    backendStatus: 422,
    details: { formErrors: [], fieldErrors },
  });

  it("Given a refused field, Then it is named in the renter's words", () => {
    /**
     * 🔴 Owner, 2026-09-12: *"can it be specific, like if a field is missing"*. It always could be:
     * the backend sends `parsed.error.flatten()`, and `/api/requests` threw it away — so the most
     * specific thing this screen could say was «Validation Error».
     */
    const read = readSubmitError(flat({ projectAddressLabel: ["Required"], startDate: ["Required"] }));
    expect(read.fields).toEqual(["the site address", "the start date"]);
  });

  it("Given a field inside an equipment item, Then the LEAF names the control", () => {
    // ⚠️ `equipmentItems.0.subtypeId` is a path; «the equipment type» is a thing on his screen.
    expect(readSubmitError(flat({ "equipmentItems.0.subtypeId": ["Required"] })).fields).toEqual([
      "the equipment type",
    ]);
  });

  it("Given the same field on two items, Then it is named once", () => {
    // ⚠️ He has one control per answer to fix; listing it twice is noise, not precision.
    const read = readSubmitError(flat({ "equipmentItems.0.numberOfUnits": ["x"], "equipmentItems.1.numberOfUnits": ["x"] }));
    expect(read.fields).toEqual(["how many units"]);
  });

  it("Given a key we have no name for, Then the backend's own spelling is shown", () => {
    /**
     * 🔴 **Never invented.** The map is read off `draftToCreateRequest`, so it covers what this app
     * SENDS. A key outside it is printed raw rather than guessed at, because a wrong field name
     * sends him to fix a control that is fine.
     */
    expect(readSubmitError(flat({ somethingNewTheBackendAdded: ["x"] })).fields).toEqual([
      "somethingNewTheBackendAdded",
    ]);
  });

  it("Given no fieldErrors at all, Then nothing is named", () => {
    // ⚠️ Only a validation refusal has a field. Naming one on a 500 would be an invention.
    expect(readSubmitError({ backendStatus: 500, details: { fallback: "builtin_export" } }).fields).toEqual([]);
    expect(readSubmitError({ backendStatus: 422 }).fields).toEqual([]);
  });

  it("Given a shape we do not recognise, Then it does not throw", () => {
    // ⚠️ This runs inside an error screen. A crash here is the one that costs the most.
    for (const d of [null, "nope", 7, [], { fieldErrors: "nope" }]) {
      expect(() => readSubmitError({ backendStatus: 422, details: d })).not.toThrow();
    }
  });

  it("Given named fields, Then they are on screen and the backend echo is not", () => {
    draw(flat({ startDate: ["Required"] }));
    expect(screen.getByText(c.yoursTitle)).toBeTruthy();
    expect(screen.getByText("the start date")).toBeTruthy();
  });
});
