import { describe, it, expect } from "vitest";
import {
  parseChatCard, chatCardOfMessage, buildChatCardView, respondedProposalIds, latestProposalId, chatCardTermLabel,
  type ChatCard, type ChatCardCtx, type ChatCardTerm,
} from "@/lib/contract/deal-rounds";

/**
 * DRCARD — the negotiation chat cards the backend has always sent under `message.custom` and the web
 * used to discard, rendering all six types as one grey pill (English, for the two rate types, inside an
 * Arabic chat; and a counter-offer with its figures dropped entirely).
 *
 * `parseChatCard` + `buildChatCardView` are deliberately pure so this suite can cover them. RENDERED
 * behaviour — actual RTL direction, the arrow glyph on screen, the translate button — is manual-verify
 * (DRCARD-TC-10): this repo has no component-test harness (no jsdom, no @testing-library).
 */

const ar = (en: string, arr: string) => arr;
const en = (e: string) => e;

/** The room's terms as the deal-room payload delivers them. NOTE `PRICE` is absent on purpose —
 *  `mapDealRoom` strips HIDDEN_DEAL_ROOM_TERM_KEYS, which is exactly why the label map has to backstop. */
const TERMS: ChatCardTerm[] = [
  { key: "payment_terms", label: "Payment Terms", labelAr: "شروط الدفع" },
  {
    key: "fuel_responsibility", label: "Fuel Responsibility", labelAr: "مسؤولية الوقود",
    options: [
      { value: "supplier", labelEn: "Supplier", labelAr: "المؤجّر" },
      { value: "rentee", labelEn: "Rentee", labelAr: "المستأجر" },
    ],
  },
];

const ctx = (over: Partial<ChatCardCtx> = {}): ChatCardCtx => ({
  ar: true, L: ar, terms: TERMS, at: "2026-08-04T09:30:00.000Z",
  responded: false, superseded: false, live: true, ...over,
});

/** The real payload `proposeRate` posts (deal-room.service.ts), alongside its ENGLISH fallback text. */
const RATE_PROPOSAL = {
  type: "rate_proposal",
  proposedBy: "user_42",
  proposedByRole: "supplier",
  proposedRate: 3000,
  priceUnit: "PER_DAY",
  status: "pending",
  mobPrice: 800,
  demobPrice: 650,
  rentalUnits: 2,
};
const RATE_PROPOSAL_TEXT = "Ahmed Ali proposed a rate: 3000 per day";
const RATE_RESPONSE_TEXT = "Ahmed Ali accepted the proposed rate";

/** Every string a view-model puts on screen, for "the English text is never displayed" assertions. */
const shownStrings = (v: ReturnType<typeof buildChatCardView>): string[] => [
  v.title, v.outcome ?? "", v.at,
  ...v.rows.flatMap((r) => [r.label, r.value]),
  ...(v.transition ? [v.transition.from, v.transition.to] : []),
];

describe("DRCARD-TC-01 — rate_proposal parses, and renders from i18n not from m.text (AC-01, AC-02)", () => {
  it("parses the rate and price unit off the payload", () => {
    const card = parseChatCard(RATE_PROPOSAL);
    expect(card?.type).toBe("rate_proposal");
    expect(card).toMatchObject({ rate: 3000, priceUnit: "PER_DAY", byRole: "supplier", status: "pending" });
  });

  it("composes every visible string in Arabic — the English fallback text appears nowhere", () => {
    const card = parseChatCard(RATE_PROPOSAL)!;
    const view = buildChatCardView(card, ctx());
    expect(view.title).toBe("اقترح المؤجّر سعرًا");
    expect(view.rows[0]).toMatchObject({ label: "السعر", value: "3,000 ر.س / يوم", ltr: true });
    // Nothing on the card is sourced from `m.text`, so no fragment of the English can leak through.
    const shown = shownStrings(view).join(" | ");
    expect(shown).not.toContain(RATE_PROPOSAL_TEXT);
    expect(shown).not.toContain("proposed a rate");
    expect(shown).not.toMatch(/[A-Za-z]{4,}/); // no English words at all, only digits + Arabic
  });

  it("renders the renter's own proposal as theirs, not the supplier's", () => {
    const card = parseChatCard({ ...RATE_PROPOSAL, proposedByRole: "rentee" })!;
    expect(buildChatCardView(card, ctx()).title).toBe("اقترحت سعرًا");
  });

  it("labels the period from the price unit, matching the price bar's mapping", () => {
    for (const [unit, word] of [["PER_WEEK", "أسبوع"], ["PER_MONTH", "شهر"], ["PER_JOB", "مهمة"], ["PER_DAY", "يوم"]]) {
      const card = parseChatCard({ ...RATE_PROPOSAL, priceUnit: unit })!;
      expect(buildChatCardView(card, ctx()).rows[0].value).toContain(`/ ${word}`);
    }
  });
});

describe("DRCARD-TC-02 — rate_response renders an Arabic acceptance (AC-03)", () => {
  it("parses and renders without touching the English m.text", () => {
    const card = parseChatCard({ type: "rate_response", originalMessageId: "msg_1", response: "accepted" });
    expect(card).toEqual({ type: "rate_response", response: "accepted", originalMessageId: "msg_1" });
    const view = buildChatCardView(card!, ctx());
    expect(view.title).toBe("تم قبول السعر");
    expect(shownStrings(view).join(" | ")).not.toContain(RATE_RESPONSE_TEXT);
  });

  it("rejects a response value it does not model, rather than half-rendering it", () => {
    expect(parseChatCard({ type: "rate_response", response: "rejected" })).toBeNull();
  });
});

describe("DRCARD-TC-03 — counter figures survive, term keys are localised (AC-04, AC-05)", () => {
  it("carries BOTH oldValue and newValue — before this the counter's numbers only existed in custom", () => {
    const card = parseChatCard({ type: "counter", termKey: "PRICE", oldValue: 3000, newValue: 2600 });
    expect(card).toEqual({ type: "counter", termKey: "PRICE", oldValue: 3000, newValue: 2600 });
    const view = buildChatCardView(card!, ctx());
    expect(view.transition).toEqual({ from: "3000", to: "2600" });
  });

  it("never prints a raw termKey — PRICE is not a user-facing string", () => {
    const view = buildChatCardView(parseChatCard({ type: "term_updated", termKey: "PRICE", oldValue: 1, newValue: 2 })!, ctx());
    expect(view.rows[0].value).toBe("السعر");
    expect(shownStrings(view)).not.toContain("PRICE");
  });

  it("resolves a key the room does carry from the room's own labels", () => {
    expect(chatCardTermLabel("payment_terms", TERMS, true)).toBe("شروط الدفع");
    expect(chatCardTermLabel("payment_terms", TERMS, false)).toBe("Payment Terms");
  });

  it("humanises a key it has never seen instead of showing it raw", () => {
    expect(chatCardTermLabel("SOME_NEW_KEY", TERMS, true)).toBe("Some new key");
    expect(chatCardTermLabel("brand_new_term", [], false)).toBe("Brand new term");
  });

  it("localises a term VALUE through the term's own options", () => {
    const view = buildChatCardView(
      parseChatCard({ type: "counter", termKey: "fuel_responsibility", oldValue: "supplier", newValue: "rentee" })!,
      ctx(),
    );
    expect(view.transition).toEqual({ from: "المؤجّر", to: "المستأجر" });
  });
});

describe("DRCARD-TC-04 — the four term actions are four distinct cards (AC-06, AC-07)", () => {
  it("gives each its own kind, icon and tone", () => {
    const views = [
      { type: "term_accepted", termKey: "payment_terms", value: "net_30" },
      { type: "counter", termKey: "payment_terms", oldValue: "net_30", newValue: "net_60" },
      { type: "term_updated", termKey: "payment_terms", oldValue: "net_30", newValue: "net_60" },
      { type: "term_reopened", termKey: "payment_terms" },
    ].map((c) => buildChatCardView(parseChatCard(c)!, ctx()));

    expect(new Set(views.map((v) => v.kind)).size).toBe(4);
    expect(new Set(views.map((v) => v.tone)).size).toBe(4);
    expect(new Set(views.map((v) => v.icon)).size).toBe(4);
    expect(new Set(views.map((v) => v.title)).size).toBe(4);
  });

  it("renders term_reopened even though the backend leaves it out of the unread set", () => {
    const view = buildChatCardView(parseChatCard({ type: "term_reopened", termKey: "insurance" })!, ctx());
    expect(view.kind).toBe("term_reopened");
    expect(view.title).toBe("أُعيد فتح البند للتفاوض");
    expect(view.rows[0].value).toBe("التأمين");
  });
});

describe("DRCARD-TC-05 — unknown and absent custom both fall back to m.text (AC-08, AC-09)", () => {
  it("returns null for a type the registry does not know", () => {
    expect(parseChatCard({ type: "rentee_request", requestId: 9 })).toBeNull();
    expect(parseChatCard({ type: "something_shipped_next_year" })).toBeNull();
  });

  it("returns null when there is no custom at all — behaviour identical to today", () => {
    expect(parseChatCard(undefined)).toBeNull();
    expect(parseChatCard(null)).toBeNull();
    expect(parseChatCard({})).toBeNull();
  });

  it("does not mistake the location payload on a party message for a card", () => {
    expect(parseChatCard({ kind: "location", lat: 24.7, lng: 46.7 })).toBeNull();
  });
});

describe("DRCARD-TC-05b — reading the card off a raw Stream message (AC-08, AC-09)", () => {
  it("finds the payload nested under `custom`, as the backend sends it", () => {
    const card = chatCardOfMessage({ id: "m1", type: "regular", text: RATE_PROPOSAL_TEXT, custom: RATE_PROPOSAL });
    expect(card?.type).toBe("rate_proposal");
  });

  it("never mistakes Stream's OWN message.type for a card type", () => {
    // Stream sets message.type to 'regular' | 'system' | 'reply' | … on every message. Reading it as a
    // card type would parse the entire conversation as cards.
    expect(chatCardOfMessage({ id: "m1", type: "system", text: "hello" })).toBeNull();
    expect(chatCardOfMessage({ id: "m2", type: "rate_proposal", proposedRate: 3000 })).toBeNull();
  });

  it("returns null for a plain typed message — behaviour identical to today (AC-09)", () => {
    expect(chatCardOfMessage({ id: "m3", type: "regular", text: "when can you deliver?" })).toBeNull();
    expect(chatCardOfMessage({ id: "m4", custom: { kind: "location", lat: 24.7, lng: 46.7 } })).toBeNull();
  });

  it("leaves the PARTY messages that carry their own custom.type as party bubbles", () => {
    // `postUserMessage` attaches these to real supplier/renter messages. Capturing one would strip its
    // author, its side of the thread and its attachments — the reason text IS the message.
    for (const custom of [
      { type: "decline_reason", declineCount: 2 },
      { type: "release_reason" },
      { type: "close_reason" },
    ]) {
      expect(chatCardOfMessage({ id: "r1", text: "price too high for us", custom })).toBeNull();
    }
  });

  it("does not throw on junk", () => {
    for (const raw of [null, undefined, 3, "x", [], { custom: "nope" }, { custom: [] }]) {
      expect(() => chatCardOfMessage(raw)).not.toThrow();
      expect(chatCardOfMessage(raw)).toBeNull();
    }
  });
});

describe("DRCARD-TC-06 — malformed payloads return null and never throw (AC-10)", () => {
  const bad: unknown[] = [
    { type: "rate_proposal" },                                    // no rate
    { type: "rate_proposal", proposedRate: "3000" },              // a numeric STRING is not a rate
    { type: "rate_proposal", proposedRate: null },
    { type: "rate_proposal", proposedRate: NaN },
    { type: "rate_proposal", proposedRate: Infinity },
    { type: "counter", oldValue: 1, newValue: 2 },                // no termKey
    { type: "counter", termKey: "   " },                          // blank termKey
    { type: "term_accepted", termKey: 42 },                       // non-string termKey
    { type: "term_reopened" },
    { type: 7 },                                                  // non-string type
    [],                                                           // an array is not a custom object
    "rate_proposal",
    0,
  ];

  it("returns null for every malformed shape, without throwing", () => {
    for (const c of bad) {
      expect(() => parseChatCard(c)).not.toThrow();
      expect(parseChatCard(c), JSON.stringify(c) ?? String(c)).toBeNull();
    }
  });

  it("still parses the rest of the conversation around a malformed card", () => {
    const msgs = [
      { id: "a", custom: { type: "rate_proposal" } },
      { id: "b", custom: RATE_PROPOSAL },
      { id: "c", custom: null },
    ];
    const parsed = msgs.map((m) => parseChatCard(m.custom));
    expect(parsed.map((p) => p?.type ?? null)).toEqual([null, "rate_proposal", null]);
  });

  it("defaults only a missing price UNIT — never a missing rate", () => {
    expect(parseChatCard({ type: "rate_proposal", proposedRate: 500 })).toMatchObject({ rate: 500, priceUnit: "PER_DAY" });
  });
});

describe("DRCARD-TC-07 — action selector (AC-11, AC-12, AC-13)", () => {
  const supplierProposal = parseChatCard(RATE_PROPOSAL)!;
  const myProposal = parseChatCard({ ...RATE_PROPOSAL, proposedByRole: "rentee" })!;

  it("pending + not mine → accept and counter are offered", () => {
    const view = buildChatCardView(supplierProposal, ctx());
    expect(view.actions).toBe(true);
    expect(view.outcome).toBeNull();
  });

  it("pending + mine → no accept action; a party cannot accept its own proposal", () => {
    expect(buildChatCardView(myProposal, ctx()).actions).toBe(false);
  });

  it("a rate_response naming the proposal settles it — no actions, an outcome instead", () => {
    const view = buildChatCardView(supplierProposal, ctx({ responded: true }));
    expect(view.actions).toBe(false);
    expect(view.outcome).toBe("تم قبول السعر");
  });

  it("reads that settlement off the stream, not off local state", () => {
    const messages = [
      { id: "msg_1", custom: RATE_PROPOSAL },
      { id: "msg_2", custom: RATE_PROPOSAL },
      { id: "msg_3", custom: { type: "rate_response", originalMessageId: "msg_1", response: "accepted" } },
    ];
    const responded = respondedProposalIds(messages);
    expect(responded.has("msg_1")).toBe(true);
    expect(responded.has("msg_2")).toBe(false);
    expect(buildChatCardView(supplierProposal, ctx({ responded: responded.has("msg_1") })).actions).toBe(false);
    expect(buildChatCardView(supplierProposal, ctx({ responded: responded.has("msg_2") })).actions).toBe(true);
  });

  it("ignores a rate_response with no originalMessageId rather than settling everything", () => {
    expect(respondedProposalIds([{ id: "x", custom: { type: "rate_response", response: "accepted" } }]).size).toBe(0);
  });

  it("survives junk in the message list", () => {
    expect(() => respondedProposalIds([null, 3, "x", {}, { custom: [] }])).not.toThrow();
    expect(respondedProposalIds(undefined as unknown as unknown[]).size).toBe(0);
  });

  it("offers nothing once the room is no longer live", () => {
    expect(buildChatCardView(supplierProposal, ctx({ live: false })).actions).toBe(false);
  });

  it("treats a non-pending status as settled too", () => {
    const accepted = parseChatCard({ ...RATE_PROPOSAL, status: "accepted" })!;
    expect(buildChatCardView(accepted, ctx()).actions).toBe(false);
    const countered = parseChatCard({ ...RATE_PROPOSAL, status: "countered" })!;
    expect(buildChatCardView(countered, ctx()).actions).toBe(false);
  });

  it("offers nothing on a proposal a NEWER proposal has replaced, and says so honestly", () => {
    const view = buildChatCardView(supplierProposal, ctx({ superseded: true }));
    expect(view.actions).toBe(false);
    expect(view.outcome).toBe("تجاوزه عرض أحدث");
    // Superseded is history, not an acceptance — the tone must not claim otherwise.
    expect(view.outcomeTone).toBe("history");
  });

  it("marks an ACCEPTED proposal as accepted even if a later proposal exists", () => {
    const view = buildChatCardView(supplierProposal, ctx({ responded: true, superseded: true }));
    expect(view.outcome).toBe("تم قبول السعر");
    expect(view.outcomeTone).toBe("accepted");
  });

  it("finds the standing offer as the LAST proposal in the stream", () => {
    const messages = [
      { id: "p1", custom: RATE_PROPOSAL },
      { id: "t1", custom: { type: "counter", termKey: "insurance", oldValue: true, newValue: false } },
      { id: "p2", custom: { ...RATE_PROPOSAL, proposedByRole: "rentee", proposedRate: 2600 } },
      { id: "chat", type: "regular", text: "ok" },
    ];
    expect(latestProposalId(messages)).toBe("p2");
    // …so only p2 is live: p1 is superseded, and p2 is the renter's own → neither offers Accept.
    expect(buildChatCardView(supplierProposal, ctx({ superseded: latestProposalId(messages) !== "p1" })).actions).toBe(false);
    expect(buildChatCardView(supplierProposal, ctx({ superseded: latestProposalId(messages) !== "p2" })).actions).toBe(true);
  });

  it("returns no standing offer when the conversation has none", () => {
    expect(latestProposalId([{ id: "a", type: "regular", text: "hi" }])).toBeNull();
    expect(latestProposalId([])).toBeNull();
    expect(latestProposalId(undefined as unknown as unknown[])).toBeNull();
    expect(() => latestProposalId([null, 5, { custom: null }])).not.toThrow();
  });

  it("never offers actions on a term card — this spec scopes actions to rate proposals", () => {
    for (const c of [
      { type: "term_accepted", termKey: "insurance", value: true },
      { type: "counter", termKey: "insurance", oldValue: true, newValue: false },
      { type: "term_updated", termKey: "insurance", oldValue: true, newValue: false },
      { type: "term_reopened", termKey: "insurance" },
      { type: "rate_response", response: "accepted" },
    ]) {
      expect(buildChatCardView(parseChatCard(c)!, ctx()).actions).toBe(false);
    }
  });
});

describe("DRCARD-TC-08 — mob, demob and unit counts reach the view-model (AC-14)", () => {
  it("parses all three off the payload", () => {
    expect(parseChatCard(RATE_PROPOSAL)).toMatchObject({ mobPrice: 800, demobPrice: 650, rentalUnits: 2 });
  });

  it("renders them — they were on the wire and shown nowhere", () => {
    const view = buildChatCardView(parseChatCard(RATE_PROPOSAL)!, ctx());
    const values = view.rows.map((r) => r.value).join(" | ");
    expect(values).toContain("800");
    expect(values).toContain("650");
    expect(view.rows.map((r) => r.label)).toEqual(["السعر", "التعبئة — موب", "الإرجاع — ديموب", "عدد الوحدات"]);
  });

  it("omits the rows the payload does not carry, rather than showing zeros", () => {
    const view = buildChatCardView(parseChatCard({ type: "rate_proposal", proposedRate: 3000 })!, ctx());
    expect(view.rows).toHaveLength(1);
  });

  it("keeps a legitimate zero (a waived mobilisation fee is not a missing one)", () => {
    const view = buildChatCardView(parseChatCard({ type: "rate_proposal", proposedRate: 3000, mobPrice: 0 })!, ctx());
    expect(view.rows.map((r) => r.label)).toContain("التعبئة — موب");
  });

  it("marks every numeric run LTR so it survives an RTL bubble (AC-15, structural half)", () => {
    const view = buildChatCardView(parseChatCard(RATE_PROPOSAL)!, ctx());
    expect(view.rows.every((r) => r.ltr === true)).toBe(true);
  });
});

describe("DRCARD-TC-09 — every card kind carries the message timestamp (AC-16)", () => {
  const all: unknown[] = [
    RATE_PROPOSAL,
    { type: "rate_response", response: "accepted" },
    { type: "term_accepted", termKey: "insurance", value: true },
    { type: "counter", termKey: "insurance", oldValue: true, newValue: false },
    { type: "term_updated", termKey: "insurance", oldValue: true, newValue: false },
    { type: "term_reopened", termKey: "insurance" },
  ];

  it("formats one for all six", () => {
    const views = all.map((c) => buildChatCardView(parseChatCard(c)!, ctx()));
    expect(views).toHaveLength(6);
    for (const v of views) expect(v.at).not.toBe("");
  });

  it("degrades to an empty timestamp rather than 'Invalid Date'", () => {
    for (const at of [null, undefined, "", "not-a-date"]) {
      expect(buildChatCardView(parseChatCard(RATE_PROPOSAL)!, ctx({ at })).at).toBe("");
    }
  });

  it("accepts a Date as readily as an ISO string", () => {
    expect(buildChatCardView(parseChatCard(RATE_PROPOSAL)!, ctx({ at: new Date("2026-08-04T09:30:00Z") })).at).not.toBe("");
  });
});

describe("DRCARD — the English locale is composed too, not inherited from m.text", () => {
  it("renders the same card in English from i18n", () => {
    const view = buildChatCardView(parseChatCard(RATE_PROPOSAL)!, ctx({ ar: false, L: en }));
    expect(view.title).toBe("Supplier proposed a rate");
    expect(view.rows[0].value).toBe("3,000 SAR / day");
    // Coincidentally English — but composed here, not lifted off the message.
    expect(shownStrings(view).join(" | ")).not.toContain(RATE_PROPOSAL_TEXT);
  });
});

/** Guard the union stays exhaustive: a seventh type added to `ChatCard` without a `buildChatCardView`
 *  arm would fail to compile here, not silently render blank. */
describe("DRCARD — the registry covers every modelled type", () => {
  it("builds a view for each member of the union", () => {
    const kinds: ChatCard["type"][] = [
      "rate_proposal", "rate_response", "term_accepted", "counter", "term_updated", "term_reopened",
    ];
    const built = kinds.map((k) => {
      const custom =
        k === "rate_proposal" ? RATE_PROPOSAL
        : k === "rate_response" ? { type: k, response: "accepted" }
        : k === "term_accepted" ? { type: k, termKey: "insurance", value: true }
        : k === "term_reopened" ? { type: k, termKey: "insurance" }
        : { type: k, termKey: "insurance", oldValue: true, newValue: false };
      return buildChatCardView(parseChatCard(custom)!, ctx()).kind;
    });
    expect(built).toEqual(kinds);
  });
});
