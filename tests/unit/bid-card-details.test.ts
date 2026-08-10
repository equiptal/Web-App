/**
 * Splitting a bid preview's two strings back into fields.
 *
 * The strings under test are produced by `buildPreviewCopy` in the agents backend
 * (`apps/backend-agents/src/handlers/agents/bid-form/getBidFormPreview.ts`) — every fixture here is
 * copied from that handler's own unit test, so this file fails if the two ends drift apart. That
 * coupling is the point: we are parsing a format rather than reading fields, and the only thing making
 * that safe is that both ends are ours.
 */

import { describe, it, expect } from "vitest";
import { bidCardDetails } from "@/lib/bidCardDetails";

describe("bidCardDetails", () => {
  it("Given a full English preview, When split, Then reference, headline, rows and status come apart", () => {
    const d = bidCardDetails({
      title: "REQ-00082 — Glass Vacuum rental, 1 unit",
      description: "Riyadh · 30-day rental · Awaiting your response",
    });

    expect(d.ref).toBe("REQ-00082");
    expect(d.headline).toBe("Glass Vacuum rental, 1 unit");
    expect(d.rows).toEqual([
      { label: "Location", value: "Riyadh" },
      { label: "Rental", value: "30-day rental" },
    ]);
    expect(d.status).toBe("Awaiting your response");
    expect(d.accepting).toBe(true);
  });

  it("Given an Arabic preview, When split, Then the same separators still divide it", () => {
    // The em dash and the middot are identical in both locales — only the comma inside the headline
    // changes (U+060C), and nothing splits on commas.
    const d = bidCardDetails(
      {
        title: "RFQ-00077 — إيجار حفار، وحدة",
        description: "Riyadh · إيجار 30 يومًا · يُغلق 12 سبتمبر",
      },
      "ar",
    );

    expect(d.ref).toBe("RFQ-00077");
    expect(d.headline).toBe("إيجار حفار، وحدة");
    expect(d.rows).toEqual([
      { label: "الموقع", value: "Riyadh" },
      { label: "نوع الإيجار", value: "إيجار 30 يومًا" },
    ]);
    expect(d.status).toBe("يُغلق 12 سبتمبر");
  });

  it("Given a request with no short code, When split, Then the whole title is the headline", () => {
    const d = bidCardDetails({
      title: "Excavator rental, 1 unit",
      description: "Riyadh · Monthly rental · Awaiting your response",
    });

    expect(d.ref).toBeNull();
    expect(d.headline).toBe("Excavator rental, 1 unit");
  });

  it("Given an em dash inside the equipment name, When split, Then it is not mistaken for a reference", () => {
    // Only REQ-/RFQ- codes lead a title; anything else before a dash belongs to the headline.
    const d = bidCardDetails({
      title: "Excavator — Long Reach rental, 2 units",
      description: "Jeddah · Daily rental · Awaiting your response",
    });

    expect(d.ref).toBeNull();
    expect(d.headline).toBe("Excavator — Long Reach rental, 2 units");
  });

  it("Given only a rental basis, When split, Then it is labelled as the basis and not as a city", () => {
    // The backend drops absent parts rather than leaving empty separators, so a two-part description
    // is ambiguous by position. The basis is recognisable; a city name is not.
    const d = bidCardDetails({
      title: "REQ-1 — Crane rental, 1 unit",
      description: "Weekly rental · Awaiting your response",
    });

    expect(d.rows).toEqual([{ label: "Rental", value: "Weekly rental" }]);
    expect(d.status).toBe("Awaiting your response");
  });

  it("Given only a city, When split, Then it is labelled as the location", () => {
    const d = bidCardDetails({
      title: "REQ-1 — Crane rental, 1 unit",
      description: "Riyadh · Bids close 12 Sep",
    });

    expect(d.rows).toEqual([{ label: "Location", value: "Riyadh" }]);
    expect(d.status).toBe("Bids close 12 Sep");
  });

  it("Given an Arabic rental basis alone, When split, Then إيجار still identifies it", () => {
    const d = bidCardDetails(
      { title: "REQ-1 — إيجار رافعة، وحدة", description: "إيجار يومين · بانتظار ردّك" },
      "ar",
    );

    expect(d.rows).toEqual([{ label: "نوع الإيجار", value: "إيجار يومين" }]);
  });

  it("Given a closed request, When split, Then there are no detail rows", () => {
    // A location and a rental basis under "no longer accepting bids" would read as an invitation.
    const d = bidCardDetails(
      { title: "REQ-00082 — Glass Vacuum rental, 1 unit", description: "This request is no longer accepting bids." },
      "en",
      false,
    );

    expect(d.rows).toEqual([]);
    expect(d.status).toBe("This request is no longer accepting bids.");
    expect(d.accepting).toBe(false);
  });

  it("Given a description with no separators at all, When split, Then the whole line becomes the status", () => {
    // The fallback copy, and anything else unexpected: no rows, still a valid card.
    const d = bidCardDetails({
      title: "Bid request",
      description: "Submit a bid on an equipment request — no account needed.",
    });

    expect(d.rows).toEqual([]);
    expect(d.status).toBe("Submit a bid on an equipment request — no account needed.");
  });
});
