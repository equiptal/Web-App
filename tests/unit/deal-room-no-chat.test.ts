import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The deal room carries no chat, and the sheet it hosts leaves the way it came.**
 *
 * Two rulings, one route (owner, 2026-08-28): *"we decided to not include this chat view at all, our
 * chat is now in the map, so this must be removed from any route"*, and *"that x button must just
 * close it and return to existing screen before opening the 3 styles sheet"*.
 *
 * Asserted against the source rather than a render because both are absences, and an absence is
 * exactly what a rendering test stops noticing the moment someone adds the markup back under a
 * condition the test does not set up. The strings below are the ones a chat surface cannot avoid
 * having.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const ROOM = read("src/components/deal-room/DealRoom.tsx");
const CSS = read("src/components/deal-room/deal-room-proto.css");
const INBOX = read("src/components/inbox/InboxView.tsx");

/** Comments say what the page NO LONGER does, and would fail every check below on their own. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("no chat surface on the deal-room route", () => {
  it("renders no signpost to the chat, and no button onto it", () => {
    expect(code(ROOM)).not.toContain("dl-chat-away");
    expect(code(ROOM)).not.toContain("The conversation lives with the machines");
    // The pointer's destination — the map dock with its chat open. Nothing here may send anyone there.
    expect(code(ROOM)).not.toContain("?chat=1");
  });

  it("keeps no styles for the card it no longer renders", () => {
    expect(code(CSS)).not.toContain(".dl-chat-away");
  });

  it("still READS the messages, which are the ledger the rounds come from", () => {
    // The fetch is not chat and must survive: `reconstructRounds` produces the live position and
    // seeds the sheet's rate. Deleting it would take the negotiation with the conversation.
    expect(code(ROOM)).toContain("reconstructRounds");
  });

  it("is not advertised as chat from the inbox either", () => {
    // The inbox CTA opens this route. It said «Open chat» while the route had none.
    expect(code(INBOX)).not.toContain("Open chat");
  });
});

describe("closing the counter sheet", () => {
  it("goes through closeFlow, not a bare setFlowMode(null)", () => {
    expect(code(ROOM)).toContain("onClose={closeFlow}");
  });

  it("returns the renter the way he came when the room was opened FOR the sheet", () => {
    const fn = code(ROOM).slice(code(ROOM).indexOf("function closeFlow"));
    const body = fn.slice(0, fn.indexOf("\n  }") + 4);
    expect(body).toContain("arrivedForFlow.current");
    expect(body).toContain("router.back()");
  });

  it("marks the visit only when the deep link actually opened the sheet", () => {
    // A gated-shut act leaves the renter on the room deliberately — closing nothing must not navigate.
    const seed = code(ROOM).slice(code(ROOM).indexOf("if (flowGate.current[initialFlow])"));
    expect(seed.slice(0, 200)).toContain("arrivedForFlow.current = true");
  });

  it("falls through to a real route when there is no history to go back to", () => {
    expect(code(ROOM)).toContain('router.push("/inbox")');
  });
});
