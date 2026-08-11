import { describe, expect, it } from "vitest";
import {
  composeAvailabilityRequest,
  composeDocumentRequest,
  composeShortfallRequest,
  renteeDraftStep,
  stillMissingDocTypes,
  type RenteeRequestCardPayload,
  type RenteeRequestDraft,
  type RenteeRequestReplyPayload,
} from "@/lib/contract/rentee-request";
import {
  ANSWER_CUE_MS,
  answeredAskRefs,
  askAnsweredBy,
  draftSubject,
  latestAnsweredRef,
  postedSubject,
  replyAnswerLine,
  replyFoldsIntoAsk,
  requestCardView,
  requestDocLabel,
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
    expect(view.status?.tone).toBe("refused");
    /* The WORDS changed with the owner's evening ruling (V12c, 2026-08-11): this card used to read
       «اعتذر المورّد» because the answer had a card of its own to say the specific thing in. There is
       one card now, so it says the specific thing — «اعتذر عن تأكيد التوفّر» — and «اعتذر المورّد»
       survives only where the ask cannot be resolved. The counterparty is «المورّد» either way, never
       «المؤجّر». See section 5. */
    expect(view.status?.label).toBe("اعتذر عن تأكيد التوفّر");
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

/* ═══════════════════════ 5 · ONE card per request, carrying the answer ═════════════════════════ */

/**
 * **V12c — one card per request, and it is the ask's** (owner, 2026-08-11, evening).
 *
 * *"why the cards each one on different side… make it one card for request and show his answer, but
 * light plumbing or something to show the answer when opening the chat"*.
 *
 * This **supersedes V12a of the same morning** — *"the supplier response must arrive in the same
 * format of the sent card but with supplier answer"* — which was implemented by rendering the ask's
 * card a second time under the reply (`replyCardView`, withdrawn). Each card is sided by its own
 * author, correctly, so the pair landed on OPPOSITE edges of the column, both stating the answer and
 * in different words: the ask's derived status said *"He answered: not available"* while the reply's
 * said *"He answered: he has no other Crawler Excavator 30 ton available"*.
 *
 * Four properties are asserted, and they are the four the ruling turns on:
 *
 * 1. **The fold.** Ask + answer both in the window → the reply's own card is suppressed and the ask's
 *    card carries the answer.
 * 2. **The wording is the SPECIFIC one.** The surviving card must not fall back to the generic
 *    resolution reading — that is the sentence the owner was made to read twice.
 * 3. **The fallback survives.** A reply whose ask is not in the window is not folded and not deleted.
 * 4. **The cue is finite and stable** — one card, and the same value across a poll, so it cannot
 *    re-fire on every render.
 *
 * The answer's own vocabulary (`replyAnswerLine`) is unchanged by the ruling and is still asserted
 * below: one table words the folded card AND the unfoldable reply's bare form.
 */

const EN = (en: string, _ar: string) => en;
const AR = (_en: string, ar: string) => ar;

const reply = (over: Partial<RenteeRequestReplyPayload> = {}): RenteeRequestReplyPayload => ({
  type: "rentee_request_reply",
  inReplyTo: "RQ-7F3A",
  equipmentId: "eq-1",
  resolution: "provided",
  // `partial` is the only resolution that ever names papers (owner ruling, 2026-08-11, §8); every
  // other answer names none, and so does a client too old to send them.
  deliveredTypes: null,
  ...over,
  // `Partial<>` lets an override set the field to `undefined`, which the payload type does not
  // allow — normalised so a fixture can spell "he named nothing" either way.
  ...(over.deliveredTypes === undefined ? { deliveredTypes: null } : {}),
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

describe("the fold — a request and its answer are ONE card, and it is the request's", () => {
  const ask = posted();

  it("folds a reply whose ask is in the window, whichever order the window loaded in", () => {
    for (const t of [thread({ ask }, {}, { reply: reply() }), thread({ reply: reply() }, {}, { ask })]) {
      const answered = answeredAskRefs(t);
      expect([...answered]).toEqual(["RQ-7F3A"]);
      // The reply's own card is suppressed: the ask above it is already saying this.
      expect(replyFoldsIntoAsk(answered, reply())).toBe(true);
    }
  });

  it("does NOT fold a reply whose ask is missing — the answer would vanish with it", () => {
    // An older page, a partial channel read. The surface keeps rendering it in the bare form, which
    // names no equipment because nothing read one.
    expect(replyFoldsIntoAsk(answeredAskRefs(thread({ reply: reply() })), reply())).toBe(false);
    expect(replyFoldsIntoAsk(answeredAskRefs(thread()), reply())).toBe(false);
    // Nor an ask that is merely NEAR one: the reference has to match.
    const other = thread({ ask: posted({ ref: "RQ-0001" }) }, { reply: reply({ inReplyTo: "RQ-7F3A" }) });
    expect(replyFoldsIntoAsk(answeredAskRefs(other), reply())).toBe(false);
  });

  it("folds nothing on an unanswered ask — there is one card there already", () => {
    expect([...answeredAskRefs(thread({ ask }, {}, {}))]).toEqual([]);
  });
});

describe("the surviving card says what he answered, in the words of the question", () => {
  /** The window's own answers, as both surfaces hand them to the card (`requestRepliesByRef`). */
  const answering = (resolution: RenteeRequestReplyPayload["resolution"], over: Partial<RequestCardCtx> = {}) =>
    ctx({ machine: () => machine(), reply: () => ({ resolution }), ...over });

  it("takes the reply's KIND-SPECIFIC wording, never the generic resolution reading", () => {
    /* THE defect, in the owner's screenshot: his ask card read *"He answered: not available"* while
       the supplier's card beside it read *"He answered: he has no other Crawler Excavator 30 ton
       available"*. One card survives now, and it has to be the second sentence. */
    const view = requestCardView(
      postedSubject(posted({ kind: "alternative" })),
      answering("unavailable", { L: EN, typeWord: "Crawler Excavator 30 ton" }),
    );
    expect(view.status).toEqual({
      tone: "refused",
      label: "He answered: he has no other Crawler Excavator 30 ton available",
    });
    expect(view.status?.label).not.toBe("He answered: not available");
  });

  it("confirms, declines and adds papers in the ask's own terms", () => {
    // Corroborated by the file — `unit_yard` is what an availability ask is derived from, and an
    // uncorroborated `provided` is a different rule entirely (RM3-AC-58, below).
    const availability = requestCardView(
      postedSubject(posted()),
      answering("provided", { L: EN, machine: () => machine({ locationSource: "unit_yard" }) }),
    );
    expect(availability.status).toEqual({ tone: "answered", label: "He confirmed this equipment is available" });
    // …and never the wait it replaced.
    expect(availability.status?.label).not.toBe("Waiting for his answer");

    const declined = requestCardView(postedSubject(posted()), answering("declined", { L: EN }));
    expect(declined.status).toEqual({ tone: "refused", label: "He declined to confirm availability" });
    // The generic line — the one the ask card used to derive — says less than this one.
    expect(declined.status?.label).not.toBe("He declined");
  });

  it("states the answer even where no fleet is known — an answer is not read off a machine", () => {
    /* `/deal-room/[id]` before its fleet lands, and forever if the read fails. The VERDICT stays
       withheld there (it cannot be derived), but what the supplier SAID still stands — the withdrawn
       reply card stated it on a fleet-less surface for exactly this reason, and folding it into the
       ask must not lose it. */
    const view = requestCardView(
      postedSubject(posted()),
      answering("provided", { fleetKnown: false, machine: () => null }),
    );
    expect(view.status).toEqual({ tone: "answered", label: "أكّد توفّر هذه المعدّة" });
    // Unanswered, that same surface still says nothing at all.
    expect(requestCardView(postedSubject(posted()), ctx({ fleetKnown: false })).status).toBeNull();
  });

  it("never lets his words overrule the file — RM3-AC-58 survives the fold", () => {
    /* A `provided` the machine does not corroborate is downgraded to waiting: the reply stays in the
       thread as the record of what was said, but it does not move the verdict. Folding the answer into
       the card must not smuggle "he added it" past that rule — so his wording is printed only where it
       AGREES with what the card derived. */
    const uncorroborated = requestCardView(
      postedSubject(posted()),
      answering("provided", { L: EN, machine: () => machine({ locationSource: "listing_yard" }) }),
    );
    expect(uncorroborated.status).toEqual({ tone: "waiting", label: "Waiting for his answer" });

    // The mirror: he said no, and his file has since shown it anyway. The file is what the renter can
    // act on, so the card reports it rather than repeating a refusal the machine has overtaken.
    const overtaken = requestCardView(
      postedSubject(posted()),
      answering("declined", { L: EN, machine: () => machine({ locationSource: "unit_yard" }) }),
    );
    expect(overtaken.status).toEqual({ tone: "answered", label: "Answered — his file now shows it" });
  });

  it("leaves an UNANSWERED ask exactly as it read before", () => {
    // The fold only speaks where there IS an answer. Nothing about the waiting card moved, and the
    // draft's own reading (section 4) is untouched.
    const waiting = requestCardView(postedSubject(posted()), ctx({ machine: () => machine() }));
    expect(waiting.status).toEqual({ tone: "waiting", label: "بانتظار ردّه" });
  });
});

describe("the arrival cue — finite, one card, and it does not re-fire", () => {
  it("points at the LAST answered ask in the window, never at a set of them", () => {
    const t = thread(
      { ask: posted({ ref: "RQ-0001" }) },
      { reply: reply({ inReplyTo: "RQ-0001" }) },
      { ask: posted({ ref: "RQ-7F3A" }) },
      { reply: reply({ inReplyTo: "RQ-7F3A" }) },
    );
    expect(latestAnsweredRef(t)).toBe("RQ-7F3A");
  });

  it("returns the SAME string for the same conversation — what keeps a poll from re-firing it", () => {
    // The surfaces key their timer on this value. A refresh that returns the same messages must
    // produce the same reference, or the ring would restart every 15 seconds.
    const t = thread({ ask: posted() }, { reply: reply() });
    expect(latestAnsweredRef(t)).toBe(latestAnsweredRef([...t]));
  });

  it("points at nothing when nothing in the window is answered", () => {
    expect(latestAnsweredRef(thread({ ask: posted() }))).toBeNull();
    // An answer whose ask is not loaded renders on its OWN card, so there is nothing to point at.
    expect(latestAnsweredRef(thread({ reply: reply() }))).toBeNull();
    expect(latestAnsweredRef(thread())).toBeNull();
  });

  it("ENDS — a cue that loops is decoration", () => {
    expect(ANSWER_CUE_MS).toBeGreaterThan(0);
    expect(Number.isFinite(ANSWER_CUE_MS)).toBe(true);
    // Shorter than V6's landing cue: this one sits on a card the renter keeps re-reading.
    expect(ANSWER_CUE_MS).toBeLessThan(9_400);
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

/* ═════════ `partial` — the third answer, in amber (owner ruling, 2026-08-11, §8) ═════════════════
 *
 * > *"Sending something other than what was asked is still an answer. He can upload a missing
 * > document the renter didn't ask for. The renter is told exactly that: sent Insurance — the TUV
 * > certificate is still not on file. Amber. Not 'provided', not 'declined'."*
 *
 * The renter reads this card, so this file is where the ruling's sentence is pinned — both clauses,
 * both scripts, and the tone that must never be the green of an answer or the tone of a refusal he
 * did not make.
 */
describe("`partial` — he sent something other than what was asked", () => {
  const docLabel = (t: string) => requestDocLabel(t, EN);
  const docLabelAr = (t: string) => requestDocLabel(t, AR);

  it("names what arrived and what is still owed — the owner's own sentence, in English", () => {
    expect(
      replyAnswerLine(
        {
          kind: "document",
          resolution: "partial",
          deliveredTypes: ["insurance"],
          askedTypes: ["tuv_cert"],
          docLabel,
        },
        EN,
      ),
    ).toEqual({
      tone: "partial",
      label: "Sent Insurance — the TÜV certificate is still not on file",
    });
  });

  it("says the same sentence in Arabic, and calls the counterparty nothing it should not", () => {
    const { tone, label } = replyAnswerLine(
      {
        kind: "document",
        resolution: "partial",
        deliveredTypes: ["insurance"],
        askedTypes: ["tuv_cert"],
        docLabel: docLabelAr,
      },
      AR,
    );
    expect(tone).toBe("partial");
    expect(label).toBe("أرسل التأمين — لا تزال شهادة TÜV غير مرفوعة");
    // «المؤجّر» is the word this feature does not use.
    expect(label).not.toContain("المؤجّر");
  });

  it("handles SEVERAL delivered and SEVERAL still-missing papers, with the verb agreeing", () => {
    expect(
      replyAnswerLine(
        {
          kind: "document",
          resolution: "partial",
          deliveredTypes: ["insurance", "customs"],
          askedTypes: ["tuv_cert", "spsp_cert"],
          docLabel,
        },
        EN,
      ).label,
    ).toBe(
      "Sent Insurance and Customs card — the TÜV certificate and the SPSP certificate are still not on file",
    );

    expect(
      replyAnswerLine(
        {
          kind: "document",
          resolution: "partial",
          deliveredTypes: ["insurance", "customs"],
          askedTypes: ["tuv_cert", "spsp_cert"],
          docLabel: docLabelAr,
        },
        AR,
      ).label,
    ).toBe("أرسل التأمين والبطاقة الجمركية — لا تزال شهادة TÜV وشهادة SPSP غير مرفوعة");
  });

  it("counts a paper delivered under the OTHER vocabulary as delivered — `tuv` answers `tuv_cert`", () => {
    // The listing stores `tuv`; the ask names the catalogue's `tuv_cert`. One TÜV. Comparing them
    // raw would report a paper as still missing while it sat on the machine — the failure
    // `documentAskSatisfied` folds through the same table to avoid.
    expect(stillMissingDocTypes(["tuv_cert", "istimara"], ["tuv"])).toEqual(["istimara"]);
    expect(stillMissingDocTypes(["tuv_cert"], ["tuv"])).toEqual([]);
  });

  it("degrades one clause at a time and NEVER falls silent", () => {
    // He named what he sent, but the ask is not in this window — the bare fallback form.
    expect(
      replyAnswerLine({ kind: null, resolution: "partial", deliveredTypes: ["insurance"], docLabel }, EN).label,
    ).toBe("Sent Insurance — but not everything that was asked for");

    // An older client named nothing at all. Still said, because the alternative is the silence this
    // ruling replaced.
    expect(replyAnswerLine({ kind: null, resolution: "partial" }, EN).label).toBe(
      "He sent something else — what was asked for is still not on file",
    );
    expect(replyAnswerLine({ kind: null, resolution: "partial" }, AR).label).toBe(
      "أرسل شيئًا آخر — ما طُلب لا يزال غير مرفوع",
    );
  });

  it("is never worded as an answer and never as a refusal — the one rule that outranks the rest", () => {
    const labels = (["document", "availability", "alternative", null] as const).map(
      (kind) =>
        replyAnswerLine(
          { kind, resolution: "partial", deliveredTypes: ["insurance"], askedTypes: ["tuv_cert"], docLabel },
          EN,
        ).label,
    );
    for (const label of labels) {
      // He refused nothing.
      expect(label.toLowerCase()).not.toContain("declin");
      // And he did not answer: the ask is still open underneath.
      expect(label.toLowerCase()).not.toContain("added the document");
      expect(label.toLowerCase()).not.toContain("machine");
    }
    // Its tone is neither of the other two, on every kind.
    for (const kind of ["document", "availability", "alternative", null] as const) {
      expect(replyAnswerLine({ kind, resolution: "partial" }, EN).tone).toBe("partial");
    }
  });

  it("folds onto its ask exactly like any other answer, and the ask still reads as open", () => {
    const ask = posted({ kind: "document", docTypes: ["tuv_cert"] });
    const partial = reply({ resolution: "partial", deliveredTypes: ["insurance"] });

    // Rule 1 of V12c: the reply's own card is suppressed and the ASK's card carries the answer.
    const answered = answeredAskRefs(thread({ ask }, {}, { reply: partial }));
    expect([...answered]).toEqual(["RQ-7F3A"]);
    expect(replyFoldsIntoAsk(answered, partial)).toBe(true);
    // …and it is the card the arrival cue points at, like any other answer.
    expect(latestAnsweredRef(thread({ ask }, { reply: partial }))).toBe("RQ-7F3A");

    const view = requestCardView(
      postedSubject(ask),
      ctx({
        L: EN,
        // The machine still does NOT hold the TÜV — which is exactly the state a partial describes.
        machine: () => machine({ documentKeys: [{ type: "insurance" }] }),
        reply: () => ({ resolution: "partial", deliveredTypes: ["insurance"] }),
        docLabel,
      }),
    );
    expect(view.status).toEqual({
      tone: "partial",
      label: "Sent Insurance — the TÜV certificate is still not on file",
    });
  });

  it("stops speaking the moment the file really does carry every paper — derived state still wins", () => {
    // RM3-AC-58 unchanged: a stale `partial` must not out-shout a machine that now satisfies the ask.
    const view = requestCardView(
      postedSubject(posted({ kind: "document", docTypes: ["tuv_cert"] })),
      ctx({
        L: EN,
        machine: () => machine({ documentKeys: [{ type: "insurance" }, { type: "tuv" }] }),
        reply: () => ({ resolution: "partial", deliveredTypes: ["insurance"] }),
        docLabel,
      }),
    );
    expect(view.status).toEqual({ tone: "answered", label: "Answered — his file now shows it" });
  });
});
