import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cancelBlockedReason,
  cancelFailureLine,
  cancelRetryWorthIt,
  isCancelledStatus,
  type CancelReport,
} from "@/lib/contract/requests";

/**
 * **A cancellation says what it did — and a refused one says why.**
 *
 * Owner, 2026-09-20, forwarding a renter stuck on «لم يتمّ الإجراء. حاول مجددًا» over a request that
 * was CANCELLED in the database: *"it is cancelled in backend but no succuess message or failed
 * mesage shown or anything so he just keep trying and says fail cause already cancelled so make
 * sure the state is clear"*.
 *
 * The reference is the mobile app's own request-detail page: a loading overlay, then either a
 * success snackbar and a jump back to My Requests, or an error snackbar carrying the BACKEND's own
 * sentence through `localizedError(message, messageAr)`. The web threw that sentence away and
 * printed one generic line for every refusal — including the refusal that means it had already
 * worked.
 *
 * ⚠️ The two components are read from SOURCE. Both pull a drawer, a table, four API calls and the
 * session, and what is under test is a set of rulings — that neither door closes in silence, that
 * the success note is drawn where the question was asked, that a dead refusal offers no retry. A
 * render test would mock five things to assert the same facts.
 */

const SRC = resolve(__dirname, "../../src");
const modal = readFileSync(resolve(SRC, "components/requests/RequestEditModals.tsx"), "utf8");
const drawer = readFileSync(resolve(SRC, "components/workspace/RequestDetailsModal.tsx"), "utf8");
const home = readFileSync(resolve(SRC, "components/home/HomeRequests.tsx"), "utf8");
const client = readFileSync(resolve(SRC, "lib/api/client.ts"), "utf8");

const report = (over: Partial<CancelReport> = {}): CancelReport => ({ cancelled: 0, refused: [], ...over });

describe("what the press actually achieved", () => {
  it("Given an already-CANCELLED request, Then the act is satisfied", () => {
    // 🔴 The whole bug: a refused DELETE is not «still live». CANCELLED and ABANDONED are the two
    // spellings of «it is gone», and both mean the renter got what he pressed for.
    expect(isCancelledStatus("CANCELLED")).toBe(true);
    expect(isCancelledStatus("ABANDONED")).toBe(true);
  });

  it("Given a shut-but-not-cancelled request, Then it is NOT a success", () => {
    // ⚠️ CLOSED / ACCEPTED / EXPIRED are uncancellable too, and reporting them as done would be a
    // lie the renter acts on — he would stop chasing a request that is still awarded to somebody.
    for (const s of ["CLOSED", "HUB_CLOSED", "ACCEPTED", "EXPIRED", "OPEN", null, undefined]) {
      expect(isCancelledStatus(s)).toBe(false);
    }
  });
});

describe("the line a refusal prints", () => {
  it("Given nothing refused, Then there is no line at all", () => {
    expect(cancelFailureLine(report({ cancelled: 2 }), false)).toBe("");
  });

  it("Given the request is ACCEPTED, Then it says so rather than «try again»", () => {
    const line = cancelFailureLine(report({ refused: [{ id: "r1", status: "ACCEPTED" }] }), false, "request");
    expect(line).toContain("A bid was accepted for this request");
    expect(line).not.toContain("Try again");
  });

  it("Given the noun, Then a whole request is not called «this item»", () => {
    // ⚠️ The drawer cancels ONE request; the dashboard row cancels the items of a group. Calling a
    // request «this item» there reads as a statement about something else on the screen.
    expect(cancelBlockedReason("CANCELLED", false, "request")).toBe("This request is already cancelled.");
    expect(cancelBlockedReason("CANCELLED", false, "item")).toBe("This item is already cancelled.");
    expect(cancelBlockedReason("CANCELLED", true, "request")).toContain("هذا الطلب");
  });

  it("Given a PARTLY cancelled group, Then the count is the line", () => {
    const line = cancelFailureLine(report({ cancelled: 3, refused: [{ id: "r4", status: "ACCEPTED" }] }), false);
    expect(line).toContain("3 of 4 were cancelled");
    expect(cancelFailureLine(report({ cancelled: 3, refused: [{ id: "r4", status: "ACCEPTED" }] }), true)).toContain("3 من 4");
  });

  it("Given no readable status, Then the SERVER's own sentence is printed", () => {
    /**
     * The mobile app's rule verbatim (`localizedError`): its detail page prints the backend's
     * `message` / `messageAr`, which is the only text that names the actual refusal. The web threw
     * it away, so «a request can only be cancelled while it is open or active» arrived as «that
     * didn't go through» — and the renter pressed again.
     */
    const r = report({ refused: [{ id: "r1", status: null, said: "Only OPEN or ACTIVE", saidAr: "مفتوح أو نشط فقط" }] });
    expect(cancelFailureLine(r, false)).toBe("Only OPEN or ACTIVE");
    expect(cancelFailureLine(r, true)).toBe("مفتوح أو نشط فقط");
  });

  it("Given nothing at all, Then the plain line is the only honest one left", () => {
    expect(cancelFailureLine(report({ refused: [{ id: "r1", status: null }] }), false)).toContain("didn’t go through");
    expect(cancelFailureLine(report({ refused: [{ id: "r1", status: null }] }), true)).toContain("حاول مجددًا");
  });
});

describe("whether pressing again could help", () => {
  it("Given a state no retry can move, Then the retry is withheld", () => {
    // A «Try again» over «already accepted» is a button that is going to refuse, which is the loop.
    for (const s of ["ACCEPTED", "EXPIRED", "CLOSED", "HUB_CLOSED"]) {
      expect(cancelRetryWorthIt(report({ refused: [{ id: "r1", status: s }] }))).toBe(false);
    }
  });

  it("Given it is still OPEN, or unreadable, Then the retry stands", () => {
    expect(cancelRetryWorthIt(report({ refused: [{ id: "r1", status: "OPEN" }] }))).toBe(true);
    expect(cancelRetryWorthIt(report({ refused: [{ id: "r1", status: "ACTIVE" }] }))).toBe(true);
    // ⚠️ `null` is «we could not find out», which really can be a blip — never a verdict.
    expect(cancelRetryWorthIt(report({ refused: [{ id: "r1", status: null }] }))).toBe(true);
  });

  it("Given a mixed group, Then one movable refusal keeps the retry", () => {
    const r = report({ refused: [{ id: "a", status: "ACCEPTED" }, { id: "b", status: "OPEN" }] });
    expect(cancelRetryWorthIt(r)).toBe(true);
  });
});

describe("the call settles every item and re-reads the ones that refused", () => {
  it("Given a fanned-out RFQ, Then it is allSettled and not all", () => {
    /**
     * 🔴 `Promise.all` rejects at the first refusal and throws away what the others answered, so
     * five cancelled lines and one accepted one reported as a total failure — and the retry then
     * re-sent the five, which the backend refused in turn.
     */
    const fn = client.slice(client.indexOf("export async function cancelRequests"));
    expect(fn).toContain("Promise.allSettled");
    expect(fn).toContain("fetchRequestDetail");
    expect(fn).toContain("isCancelledStatus(status)");
  });

  it("Given a refusal, Then the backend's words are kept rather than dropped", () => {
    const fn = client.slice(client.indexOf("export async function cancelRequest("), client.indexOf("export async function cancelRequests"));
    expect(fn).toContain("messageAr");
    expect(fn).toContain("backendCode");
  });
});

describe("neither door closes in silence", () => {
  it("Given it went through, Then the same box says so with a tick", () => {
    // ONE box, two states — a tick that arrives where the question was asked is the answer to it.
    expect(modal).toContain("if (done) {");
    expect(modal).toContain("check_circle");
    expect(modal).toContain("Request cancelled");
    expect(modal).toContain("is closed now, and suppliers can no longer bid on it");
    const done = modal.slice(modal.indexOf("if (done) {"), modal.indexOf("const dead ="));
    // One way out of the success state, and it is not a second chance to cancel.
    expect(done).not.toContain("onConfirm");
  });

  it("Given a refusal nothing can move, Then no «Try again» is drawn", () => {
    expect(modal).toContain("const dead = !!error && !canRetry;");
    expect(modal).toContain("{!dead && (");
  });

  it("Given the DRAWER, Then success holds the box and failure names itself", () => {
    /**
     * 🔴 Both halves were silent on beta: success ran `onChanged(); onClose();` and the catch
     * CLOSED THE DIALOG with no error set at all — so a refused cancel said nothing whatsoever.
     */
    const fn = drawer.slice(drawer.indexOf("const doCancel = async"), drawer.indexOf("/* The share-only path"));
    expect(fn).toContain("setCancelled(true);");
    expect(fn).toContain("setCancelError(cancelFailureLine(report, ar, \"request\"));");
    expect(fn).not.toContain("onClose();");
    // The reload and the exit ride the Done press, not the success itself.
    expect(drawer).toContain("done={cancelled}");
    expect(drawer).toContain("error={cancelError}");
    expect(drawer).toContain("canRetry={cancelRetry}");
  });

  it("Given the DASHBOARD path, Then it behaves the same way", () => {
    // One modal, two callers: a confirmation on one and silence on the other is the drift this
    // repo keeps finding between two doors onto one act.
    const fn = home.slice(home.indexOf("const doCancel = async"), home.indexOf("/** «Closed» /"));
    expect(fn).toContain("cancelRequests(");
    expect(fn).toContain("setCancelled(true);");
    expect(fn).toContain("cancelRetryWorthIt(report)");
    expect(home).toContain("done={cancelled}");
    expect(home).toContain("canRetry={cancelRetry}");
  });

  it("Given a PARTIAL group cancel, Then the table redraws behind the open dialog", () => {
    // ⚠️ Otherwise the retry re-sends items already gone, which the backend refuses in turn — the
    // renter's own loop, rebuilt one press later.
    const fn = home.slice(home.indexOf("const doCancel = async"), home.indexOf("/** «Closed» /"));
    expect(fn).toContain("if (report.cancelled > 0) reload();");
  });
});
