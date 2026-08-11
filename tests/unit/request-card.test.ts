import { describe, expect, it } from "vitest";
import {
  composeAvailabilityRequest,
  composeDocumentRequest,
  composeShortfallRequest,
  renteeDraftStep,
  type RenteeRequestCardPayload,
  type RenteeRequestDraft,
  type RenteeRequestReplyPayload,
} from "@/lib/contract/rentee-request";
import {
  askAnsweredBy,
  draftSubject,
  postedSubject,
  replyAnswerLine,
  replyCardView,
  requestCardView,
  type RequestCardCtx,
  type RequestCardMachine,
  type RequestThreadCard,
} from "@/lib/contract/request-card";

/**
 * **V12 — the request card in the chat, and the review step in front of it** (owner, 2026-08-10;
 * RM3-AC-17 / RM3-AC-18; prototype `rRequestCard` + `sendPendingCard`).
 *
 * Two things are asserted here and nothing else, because they are the two things that were wrong:
 *
 * 1. **The draft lifecycle.** Composing an ask used to POST it, which also created the deal room —
 *    there was no review card at all. The transition is now a pure step, so "cancel sends nothing" and
 *    "confirm sends exactly once" are properties that can be proved rather than behaviours that have to
 *    be watched.
 * 2. **The machine is resolved from `equipmentId`.** The card's title, serial and photo come from the
 *    FLEET row the id names — never from the message text, and never from the payload's own `serial`
 *    except as the last resort. A card that named its machine from prose would name a different one the
 *    moment the prose changed.
 *
 * No DOM is mounted: the view-model decides every string, so asserting it is asserting the card.
 */

const L = (en: string, ar: string) => ar;

/** A fleet row as the dock projects it — `model · spec`, the serial, the hero photo. */
function machine(over: Partial<RequestCardMachine> = {}): RequestCardMachine {
  return {
    locationSource: "listing_yard",
    documentKeys: [],
    photoKeys: [],
    label: "CAT 320D · حفّار ٢٠ طن",
    serial: "SN-0091",
    photoUrl: "https://example.test/front.jpg",
    ...over,
  };
}

function ctx(over: Partial<RequestCardCtx> = {}): RequestCardCtx {
  return {
    L,
    machine: () => null,
    reply: () => null,
    ...over,
  };
}

const posted = (over: Partial<RenteeRequestCardPayload> = {}): RenteeRequestCardPayload => ({
  type: "rentee_request",
  ref: "RQ-7F3A",
  scope: "equipment",
  equipmentId: "eq-1",
  serial: "SN-STAMPED",
  kind: "availability",
  docTypes: null,
  ...over,
});

/* ═══════════════════════ 1 · compose → review → send ═══════════════════════ */

describe("the draft lifecycle — compose stages, cancel discards, confirm sends once", () => {
  const ask = composeAvailabilityRequest("eq-1") as RenteeRequestDraft;

  it("composing STAGES the ask and sends nothing — no card, and therefore no deal room", () => {
    const step = renteeDraftStep({ pending: null }, { type: "compose", draft: ask });
    expect(step.state.pending).toEqual(ask);
    // The whole point of the review step: composing is not a write. A non-null `send` here would be
    // the old behaviour — post on press — wearing the new API.
    expect(step.send).toBeNull();
  });

  it("cancelling discards the draft and sends nothing", () => {
    const step = renteeDraftStep({ pending: ask }, { type: "cancel" });
    expect(step.state.pending).toBeNull();
    expect(step.send).toBeNull();
  });

  it("confirming yields the ask ONCE — the second press has nothing left to send", () => {
    const first = renteeDraftStep({ pending: ask }, { type: "confirm" });
    expect(first.send).toEqual(ask);
    // The confirm clears the staged ask in the SAME step that hands it over, which is what makes a
    // double-tap, a re-render or a stale handler unable to post it twice.
    expect(first.state.pending).toBeNull();
    const second = renteeDraftStep(first.state, { type: "confirm" });
    expect(second.send).toBeNull();
  });

  it("a cancelled ask can never be sent afterwards", () => {
    const cancelled = renteeDraftStep({ pending: ask }, { type: "cancel" });
    expect(renteeDraftStep(cancelled.state, { type: "confirm" }).send).toBeNull();
  });

  it("stages nothing for an ask the composer refused — a card whose send could only 400", () => {
    // `composeAvailabilityRequest` needs a machine; this is the shape a control with none produces.
    const step = renteeDraftStep({ pending: null }, { type: "compose", draft: null });
    expect(step.state.pending).toBeNull();
    expect(step.send).toBeNull();
  });

  it("keeps whatever was already staged when a null ask arrives — it is not a cancel", () => {
    const step = renteeDraftStep({ pending: ask }, { type: "compose", draft: null });
    expect(step.state.pending).toEqual(ask);
  });

  it("refuses to stage a repeat of an ask the supplier has not answered (one ask, one card)", () => {
    // The seam holds the guard as well as each control, because a control's copy of "what is
    // outstanding" can be a poll behind and this cannot.
    const outstanding = new Set(["availability|equipment|eq-1|"]);
    const step = renteeDraftStep({ pending: null }, { type: "compose", draft: ask, outstanding });
    expect(step.state.pending).toBeNull();
  });

  it("still stages a DIFFERENT question while another is outstanding", () => {
    // The positive control for the line above: the guard is about one identity, not about asking at
    // all. Having asked for the availability does not bar asking for a document.
    const outstanding = new Set(["availability|equipment|eq-1|"]);
    const other = composeDocumentRequest("eq-1", ["istimara"]) as RenteeRequestDraft;
    expect(renteeDraftStep({ pending: null }, { type: "compose", draft: other, outstanding }).state.pending).toEqual(other);
  });

  it("composing again replaces the staged ask — never two review cards at once", () => {
    const other = composeShortfallRequest() as RenteeRequestDraft;
    expect(renteeDraftStep({ pending: ask }, { type: "compose", draft: other }).state.pending).toEqual(other);
  });
});

/* ═══════════════════════ 2 · the machine, resolved by equipmentId ═══════════════════════ */

describe("the identity strip is resolved from equipmentId (RM3-AC-17/18)", () => {
  it("titles the card `model · spec` from the FLEET row the id names", () => {
    const view = requestCardView(
      postedSubject(posted()),
      ctx({ machine: (id) => (id === "eq-1" ? machine() : null) }),
    );
    expect(view.title).toBe("CAT 320D · حفّار ٢٠ طن");
    // The serial and the photo come off the same row — the strip is one machine's identity, not
    // three fields assembled from three places.
    expect(view.serial).toBe("SN-0091");
    expect(view.photoUrl).toBe("https://example.test/front.jpg");
  });

  it("asks for the id it was given, and for no other", () => {
    // The mutation this catches: resolving off `serial`, or off the first fleet row, or off the
    // conversation. Any of those would still produce a titled card — naming the wrong machine.
    const asked: string[] = [];
    requestCardView(
      postedSubject(posted({ equipmentId: "eq-42" })),
      ctx({
        machine: (id) => {
          asked.push(id);
          return machine();
        },
      }),
    );
    expect(asked).toEqual(["eq-42"]);
  });

  it("falls back to the payload's stamped serial when the fleet does not hold the machine", () => {
    // Sold, unlisted, or simply not fetched. The card still names something the renter can read —
    // and `serial` is DISPLAY only, which is why it is the fallback rather than the source.
    const view = requestCardView(postedSubject(posted()), ctx());
    expect(view.title).toBe("SN-STAMPED");
    expect(view.photoUrl).toBeNull();
  });

  it("never looks a machine up for a company-scope card, and never lets it be pressed", () => {
    let looked = false;
    const view = requestCardView(
      postedSubject(posted({ scope: "company", equipmentId: null, serial: null, kind: "alternative" })),
      ctx({
        machine: () => {
          looked = true;
          return machine();
        },
        canOpen: () => true,
      }),
    );
    expect(looked).toBe(false);
    // The shortfall ask asks FOR a machine — there is none to open, so the card must not offer.
    expect(view.openable).toBe(false);
    // Both `alternative` cards now read as an ADDITION and in the same words (owner, 2026-08-11) —
    // «طلب إضافة الوحدات الناقصة» named a shortfall the renter never sees on the list-foot control
    // that raises the identical ask. With no request type in hand it names no type rather than the
    // wrong one.
    expect(view.kindLabel).toBe("طلب إضافة معدّة أخرى");
  });

  it("keeps a company card inert even if one arrives carrying a machine id", () => {
    /* The backend pairs `company` with a null id and refuses the other combination, but
       `parseRenteeRequestCard` reads a channel — an old or malformed `custom` can carry both. The
       scope check is the guard for exactly that, and without this line it is untested: every
       well-formed company card is already inert because it names no machine. */
    const view = requestCardView(
      postedSubject(posted({ scope: "company", equipmentId: "eq-1", kind: "alternative" })),
      ctx({ machine: () => machine(), canOpen: () => true }),
    );
    expect(view.openable).toBe(false);
  });

  it("is pressable only when the surface says it can open that machine", () => {
    const held = ctx({ machine: () => machine() });
    expect(requestCardView(postedSubject(posted()), held).openable).toBe(true);
    // A machine in the fleet that the OFFER does not name has no detail to open, and a card that
    // looked pressable and did nothing would be worse than one that never claimed to be.
    expect(requestCardView(postedSubject(posted()), { ...held, canOpen: () => false }).openable).toBe(false);
  });
});

/* ═══════════════════════ 3 · the live status row ═══════════════════════ */

describe("the status row is re-read from the machine, never stored (RM3-AC-18)", () => {
  const availability = postedSubject(posted());

  it("moves from waiting to answered when the MACHINE moves — the message never changes", () => {
    const waiting = requestCardView(availability, ctx({ machine: () => machine() }));
    expect(waiting.status).toEqual({ tone: "waiting", label: "بانتظار ردّه" });
    const answered = requestCardView(
      availability,
      ctx({ machine: () => machine({ locationSource: "unit_yard" }) }),
    );
    expect(answered.status?.tone).toBe("answered");
  });

  it("reads a supplier's refusal as amber-toned refusal, never as an availability red", () => {
    const view = requestCardView(
      availability,
      ctx({ machine: () => machine(), reply: () => ({ resolution: "declined" }) }),
    );
    // «المورّد» — the one word for the counterparty, the same one the reply card uses.
    expect(view.status).toEqual({ tone: "refused", label: "اعتذر المورّد" });
  });

  it("says nothing at all when this surface holds no fleet to read it off", () => {
    // A sibling tab is a different room about a different item. «ليست ضمن قائمته الحالية» there would
    // be a claim about the SUPPLIER made out of our own ignorance.
    const view = requestCardView(availability, ctx({ fleetKnown: false }));
    expect(view.status).toBeNull();
    // …and the ask itself is still stated, which is the positive control for the line above.
    expect(view.kindLabel).toBe("طلب تأكيد التوفّر");
  });
});

/* ═══════════════════════ 4 · the draft card ═══════════════════════ */

describe("the draft card states what it is, and never what the supplier owes", () => {
  const draft = composeAvailabilityRequest("eq-1") as RenteeRequestDraft;

  it("carries no reference — one is minted by the send", () => {
    const view = requestCardView(draftSubject(draft), ctx({ machine: () => machine() }), { draft: true });
    expect(view.ref).toBeNull();
  });

  it("says «لم يُرسل بعد», never «بانتظار ردّه»", () => {
    const view = requestCardView(draftSubject(draft), ctx({ machine: () => machine() }), { draft: true });
    expect(view.status?.tone).toBe("draft");
    expect(view.status?.label).toContain("لم يُرسل بعد");
    // The mutation: dropping the draft flag. The same subject then claims the supplier owes an
    // answer to a question he has never been sent.
    const sent = requestCardView(draftSubject(draft), ctx({ machine: () => machine() }));
    expect(sent.status?.label).toBe("بانتظار ردّه");
  });

  it("still reports an already-satisfied machine — the most useful moment to find out", () => {
    const view = requestCardView(
      draftSubject(draft),
      ctx({ machine: () => machine({ locationSource: "unit_yard" }) }),
      { draft: true },
    );
    expect(view.status?.tone).toBe("answered");
  });

  it("names its machine from the fleet, exactly as the sent card does", () => {
    const view = requestCardView(
      draftSubject(composeDocumentRequest("eq-1", ["istimara", "tuv"]) as RenteeRequestDraft),
      ctx({ machine: () => machine(), docLabel: (t) => `«${t}»` }),
      { draft: true },
    );
    expect(view.title).toBe("CAT 320D · حفّار ٢٠ طن");
    // A document ask states itself through its chips; a sentence above them would say it twice.
    expect(view.docChips).toEqual(["«istimara»", "«tuv_cert»"]);
    expect(view.askText).toBeNull();
  });
});

/* ═══════════════════════ 5 · the supplier's reply, in the ask's own card ═══════════════════════ */

/**
 * **V12a — the answer arrives in the format of the card it answers** (owner, 2026-08-11: *"the
 * supplier response must arrive in the same format of the sent card but with supplier answer"*).
 *
 * The reply payload carries only `inReplyTo` and a resolution, so everything the header shows has to
 * be resolved from the thread. Three properties are asserted, and they are the three that were wrong:
 *
 * 1. **The header is the REQUEST's header**, built by the request's own function — not a second
 *    rendering that can drift from it.
 * 2. **The answer answers the question that was asked.** "Done" said nothing; each kind × resolution
 *    now reads as an answer to that kind, and only `declined` ever reads as a refusal.
 * 3. **An unresolved reply says less, never more.** No ask in the window → no card, and the caller
 *    keeps the bare form rather than naming equipment nobody read.
 */

const EN = (en: string, _ar: string) => en;
const AR = (_en: string, ar: string) => ar;

const reply = (over: Partial<RenteeRequestReplyPayload> = {}): RenteeRequestReplyPayload => ({
  type: "rentee_request_reply",
  inReplyTo: "RQ-7F3A",
  equipmentId: "eq-1",
  resolution: "provided",
  ...over,
});

/** A thread as the dock projects it: asks, replies, and the ordinary chat between them. */
const thread = (...cards: RequestThreadCard[]): RequestThreadCard[] => cards;

describe("a reply resolves the ask it answers, out of the thread, by reference", () => {
  it("finds the ask whatever order the window loaded in — a channel read is not ordered", () => {
    const ask = posted();
    expect(askAnsweredBy(thread({ reply: reply() }, {}, { ask }), reply())).toBe(ask);
    expect(askAnsweredBy(thread({ ask }, {}, { reply: reply() }), reply())).toBe(ask);
  });

  it("does not answer with SOME other ask — the reference has to match", () => {
    expect(askAnsweredBy(thread({ ask: posted({ ref: "RQ-0001" }) }), reply({ inReplyTo: "RQ-7F3A" }))).toBeNull();
    // Ordinary chat and the negotiation vocabulary ride this list as empty entries.
    expect(askAnsweredBy(thread({}, {}, {}), reply())).toBeNull();
  });
});

describe("the reply card IS the request card, with the answer where the waiting state was", () => {
  const ask = posted();
  const c = ctx({ machine: () => machine() });

  it("carries the same tile, title, serial, reference and ask line as the card it answers", () => {
    const sent = requestCardView(postedSubject(ask), c);
    const answered = replyCardView(thread({ ask }, { reply: reply() }), reply(), c)!;
    // Everything BUT the status row is the request's own view — one function decides both, so the
    // pair cannot drift into naming one machine two ways.
    expect({ ...answered, status: null }).toEqual({ ...sent, status: null });
    expect(answered.title).toBe("CAT 320D · حفّار ٢٠ طن");
    expect(answered.ref).toBe("RQ-7F3A");
    expect(answered.kindLabel).toBe("طلب تأكيد التوفّر");
  });

  it("states the answer, not the wait", () => {
    const answered = replyCardView(thread({ ask }, { reply: reply() }), reply(), c)!;
    expect(answered.status).toEqual({ tone: "answered", label: "أكّد توفّر هذه المعدّة" });
    // The mutation this guards: the request's own reading leaking onto the reply.
    expect(answered.status?.label).not.toBe("بانتظار ردّه");
  });

  it("still states the answer on a surface holding no fleet — a reply needs none", () => {
    // The REQUEST goes quiet without a fleet (a verdict it cannot derive). The reply does not: what
    // the supplier said is a thing he said, not a thing read off a machine.
    const answered = replyCardView(thread({ ask }, { reply: reply() }), reply(), ctx({ fleetKnown: false }))!;
    expect(answered.status).toEqual({ tone: "answered", label: "أكّد توفّر هذه المعدّة" });
  });

  it("falls back to the bare form — null — when the ask is not in the loaded window", () => {
    // An older page, a partial read. Naming an equipment on nothing but a matching reference would
    // put a machine's name under a supplier's answer as a guess.
    expect(replyCardView(thread({ reply: reply() }), reply(), c)).toBeNull();
    expect(replyCardView(thread(), reply(), c)).toBeNull();
  });
});

describe("the answer is worded as an answer to the question that was asked", () => {
  type Subject = Parameters<typeof replyAnswerLine>[0];
  const line = (
    kind: Subject["kind"],
    resolution: RenteeRequestReplyPayload["resolution"],
    over: Partial<Subject> = {},
    l = EN,
  ) => replyAnswerLine({ kind, resolution, ...over }, l);

  it("an availability ask: confirmed, declined, or not available — never «Done»", () => {
    expect(line("availability", "provided").label).toBe("He confirmed this equipment is available");
    expect(line("availability", "declined").label).toBe("He declined to confirm availability");
    expect(line("availability", "unavailable").label).toBe("He answered: this equipment is not available");
    expect(line("availability", "provided", {}, AR).label).toBe("أكّد توفّر هذه المعدّة");
  });

  it("a document ask: the papers were added — and singular when one was asked for", () => {
    expect(line("document", "provided", { docCount: 1 }).label).toBe(
      "He added the document to this equipment's file",
    );
    expect(line("document", "provided", { docCount: 3 }).label).toBe(
      "He added the documents to this equipment's file",
    );
    expect(line("document", "declined", { docCount: 1 }).label).toBe("He declined to provide the document");
    // `unavailable` on a document ask is about the EQUIPMENT — he never said the papers were missing.
    expect(line("document", "unavailable", { docCount: 2 }).label).toBe(
      "He answered: this equipment is not available",
    );
  });

  it("an alternative ask reads in the request's own type word, and is never a swap", () => {
    const w = { typeWord: "حفّار زاحف ٣٠ طن" };
    expect(line("alternative", "provided", w, AR).label).toBe("أضاف حفّار زاحف ٣٠ طن أخرى");
    expect(line("alternative", "declined", w, AR).label).toBe("اعتذر عن إضافة حفّار زاحف ٣٠ طن أخرى");
    expect(line("alternative", "unavailable", w, AR).label).toBe("ردّ: لا تتوفّر لديه حفّار زاحف ٣٠ طن أخرى");
    // No type word — «معدّة», and "equipment" in English.
    expect(line("alternative", "provided").label).toBe("He added other equipment");
    expect(line("alternative", "unavailable").label).toBe("He answered: he has no other equipment available");
  });

  it("says only what the resolution says when the ask could not be resolved", () => {
    expect(line(null, "provided").label).toBe("He provided what was asked");
    expect(line(null, "declined").label).toBe("He declined");
    expect(line(null, "unavailable").label).toBe("He answered: not available");
    // «المورّد», never «المؤجّر».
    expect(line(null, "declined", {}, AR).label).toBe("اعتذر المورّد");
  });

  it("NEVER implies a refusal that was not made — only `declined` is a refusal", () => {
    for (const k of ["availability", "document", "alternative", null] as const) {
      expect(line(k, "provided").tone).toBe("answered");
      // "I can't" is not "I won't": `unavailable` takes the amber tone but says nothing about
      // willingness, and its words never contain a declining.
      expect(line(k, "unavailable").tone).toBe("refused");
      expect(line(k, "unavailable").label.toLowerCase()).not.toContain("declin");
      expect(line(k, "declined").label.toLowerCase()).toContain("declin");
    }
  });

  it("says «equipment», never «machine» — one word for the thing across the surface", () => {
    const all = (["availability", "document", "alternative", null] as const).flatMap((k) =>
      (["provided", "declined", "unavailable"] as const).map((r) => line(k, r, { docCount: 2 }).label),
    );
    for (const label of all) expect(label.toLowerCase()).not.toContain("machine");
  });
});
