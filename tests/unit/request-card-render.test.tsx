/**
 * **The request card's chrome** (owner, 2026-09-08).
 *
 * *"Change the company icon to use the real company icons and colours used in other places, and
 * render the real company name not «The company»; also the card is tall, I want it more horizontal
 * and no need for this sentence «Not sent yet — review it, then send». These changes apply to this
 * card and the request to add a document too."*
 *
 * `request-card.test.ts` pins the model (which name, which status, which chips). This file exists for
 * the two things only a render shows: what the tile draws for a firm, and that the draft's status row
 * is absent rather than merely reworded.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequestCard } from "@/components/map/RequestCard";
import { composeDocumentRequest, composeShortfallRequest, type RenteeRequestDraft } from "@/lib/contract/rentee-request";
import { draftSubject, requestCardView, type RequestCardCtx } from "@/lib/contract/request-card";

const L = (en: string) => en;
const ctx = (over: Partial<RequestCardCtx> = {}): RequestCardCtx => ({
  L,
  machine: () => null,
  reply: () => null,
  ...over,
});

describe("a company-scope card names the firm and wears the app's own mark", () => {
  it("draws his INITIALS, not a building glyph, and prints his real name", () => {
    const view = requestCardView(
      draftSubject(composeShortfallRequest()),
      ctx({ companyName: "Al Ghadeer Company", typeWord: "Crawler excavator 20 ton" }),
      { draft: true },
    );
    render(<RequestCard view={view} draft cancelLabel="Cancel" confirmLabel="Send the request" />);

    expect(screen.getByText("Al Ghadeer Company")).toBeTruthy();
    // The mark: two letters in the tile, in the same treatment the chat header and the company panel
    // give a counterparty.
    expect(document.querySelector(".bm-rq-tile.is-co .bm-rq-initials")?.textContent).toBe("AG");
    // ~~`apartment`, the material building glyph.~~ It was this card's own invention.
    expect(document.querySelector(".bm-rq-tile .material-icons-outlined")).toBeNull();
  });

  it("says nothing about being unsent — the two buttons under it already do", () => {
    const view = requestCardView(draftSubject(composeShortfallRequest()), ctx(), { draft: true });
    render(<RequestCard view={view} draft cancelLabel="Cancel" confirmLabel="Send the request" />);
    expect(screen.queryByText(/Not sent yet/)).toBeNull();
    expect(document.querySelector(".bm-rq-state")).toBeNull();
    // The card is still visibly a draft — that is the frame's job, and the buttons'.
    expect(document.querySelector(".bm-rq.is-draft")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Send the request" })).toBeTruthy();
  });

  it("holds to both rules on a DOCUMENT ask too, which is the same card", () => {
    const doc = composeDocumentRequest("eq-1", ["tuv_cert"]) as RenteeRequestDraft;
    const view = requestCardView(draftSubject(doc), ctx({ docLabel: () => "TÜV certificate" }), { draft: true });
    render(<RequestCard view={view} draft cancelLabel="Cancel" confirmLabel="Send the request" />);
    expect(screen.queryByText(/Not sent yet/)).toBeNull();
    expect(screen.getByText("TÜV certificate")).toBeTruthy();
  });
});
