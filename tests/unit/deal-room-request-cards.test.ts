import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapDealRoom } from "@/lib/contract/deal-room";
import {
  buildChatCardView,
  chatCardOfMessage,
  requestRepliesByRef,
  requestThreadCards,
} from "@/lib/contract/deal-rounds";
import { mapFleet } from "@/lib/contract/fleet";
import {
  answeredAskRefs,
  askAnsweredBy,
  latestAnsweredRef,
  postedSubject,
  replyFoldsIntoAsk,
  requestCardView,
  requestDocLabel,
} from "@/lib/contract/request-card";
import type { RenteeRequestCardPayload, RenteeRequestReplyPayload } from "@/lib/contract/rentee-request";
import { fleetMachineResolver, fleetRequestMachine } from "@/components/map/request-card-ctx";

/**
 * **V12b — `/deal-room/[id]` renders the request loop as CARDS** (owner, 2026-08-11: *"i want it like
 * request card"*).
 *
 * The map's chat dock had shown the renter's ask, and the supplier's answer, as the prototype's
 * `rRequestCard` since the day before: an identity strip naming the equipment, the ask, and a live
 * status row. The deal room renders the SAME two messages off the SAME Stream channel and rendered
 * them as a title over key/value rows — because the one thing it lacked was the equipment's NAME.
 * `RenteeRequestCardPayload` carries `equipmentId` and a display-only `serial` (§7.3) and no label, so
 * the name can only come from the bid's fleet, and this route never fetched one.
 *
 * What is asserted here, in three groups:
 *
 * 1. **The shared derivations** — the projection, the reply index, the machine resolver and the
 *    document vocabulary the two surfaces now go through together. A second copy of any of these is
 *    how one ask starts reading differently from the renter's chair and the supplier's.
 * 2. **`fleetKnown`'s three states**, which is the rule this ticket had to respect rather than break:
 *    no fleet → no verdict; a fleet that lacks the machine → `unknown`, never an invented one; a
 *    fleet that holds it → the verdict re-derived (RM3-AC-18).
 * 3. **The wiring**, against the source and the stylesheets. This repo's vitest env is `node` and has
 *    no component harness, so the fetch's shape, the fall-back-on-failure, the author-siding and the
 *    reachability of the card's own chrome are read off the files — each with a positive control, so
 *    a green over a moved anchor is not possible.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/** Block and line comments removed. These files explain their rules in the words the rules use, so a
 *  naive grep would report the prose rather than the code. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const DEAL_ROOM = strip(read("src/components/deal-room/DealRoom.tsx"));
const CHAT_DOCK = strip(read("src/components/map/ChatDock.tsx"));
const RQ_CSS = read("src/components/map/request-card.css");
const DL_CSS = read("src/components/deal-room/deal-room-proto.css");

/** The English reading — the view-model's own `L(en, ar)` picker, as every other suite here takes
 *  it. A one-argument function satisfies the two-argument signature. */
const L = (en: string) => en;

const ask = (over: Partial<RenteeRequestCardPayload> = {}): RenteeRequestCardPayload => ({
  type: "rentee_request",
  scope: "equipment",
  equipmentId: "eq-1",
  kind: "availability",
  docTypes: null,
  ref: "RQ-7F3A",
  serial: "SN-9",
  ...over,
}) as RenteeRequestCardPayload;

const reply = (over: Partial<RenteeRequestReplyPayload> = {}): RenteeRequestReplyPayload => ({
  type: "rentee_request_reply",
  inReplyTo: "RQ-7F3A",
  equipmentId: null,
  resolution: "provided",
  ...over,
}) as RenteeRequestReplyPayload;

/** A Stream message carrying a card, as the channel hands it back. */
const msg = (custom: object) => ({ id: "m1", custom });

/** One fleet row, through the real parser — so the fixture cannot drift from the wire shape. */
const fleetRow = (p: Record<string, unknown> = {}) =>
  mapFleet([
    {
      equipmentId: "eq-1",
      serialNumber: "SN-FLEET",
      manufacturer: "Cat",
      modelName: "320D",
      subcategoryName: "Crawler excavator",
      subcategoryNameAr: "حفّار زاحف",
      documentKeys: [],
      photoKeys: [],
      locationSource: "unit_yard",
      inBid: true,
      yardConfirmed: true,
      ...p,
    },
  ]);

/* ═════════ 1 · the derivations both surfaces now share ═════════════════════════════════════════ */

describe("requestThreadCards — ONE projection of a conversation into asks and answers", () => {
  it("keeps the list one-to-one with the messages, ordinary chat as empty entries", () => {
    const cards = requestThreadCards([
      msg(ask()),
      { id: "m2", text: "hello" },
      msg({ type: "rate_proposal", proposedRate: 100 }),
      msg(reply()),
    ]);
    expect(cards).toHaveLength(4);
    expect(cards[0].ask?.ref).toBe("RQ-7F3A");
    // A plain message and a rate proposal are not asks and must never be mistaken for one — a
    // compacted list would let an index into it mean something different from an index into messages.
    expect(cards[1]).toEqual({});
    expect(cards[2]).toEqual({});
    expect(cards[3].reply?.inReplyTo).toBe("RQ-7F3A");
  });

  it("pairs a reply with its ask whichever arrived first — a channel read is not ordered", () => {
    const backwards = requestThreadCards([
      msg(reply()),
      msg(ask()),
    ]);
    // The pairing searches the whole window rather than scanning backwards from the reply.
    expect(askAnsweredBy(backwards, reply())?.ref).toBe("RQ-7F3A");
  });

  it("indexes the answers by reference off that same projection", () => {
    const byRef = requestRepliesByRef(
      requestThreadCards([msg(reply({ resolution: "declined" }))]),
    );
    // `deliveredTypes` rides WITH the resolution (owner ruling, 2026-08-11, §8) — null on every
    // answer but a `partial` that named papers.
    expect(byRef.get("RQ-7F3A")).toEqual({ resolution: "declined", deliveredTypes: null });
    expect(byRef.get("RQ-NOPE")).toBeUndefined();
  });
});

describe("the machine resolver — one answer to what a machine is called", () => {
  it("titles the card `model · spec` off the fleet row, in the reader's script", () => {
    const [m] = fleetRow();
    expect(fleetRequestMachine(m, false).label).toBe("Cat 320D · Crawler excavator");
    expect(fleetRequestMachine(m, true).label).toBe("Cat 320D · حفّار زاحف");
    // The fleet's own serial, not the payload's — the stamped one is the FALLBACK (rule 1).
    expect(fleetRequestMachine(m, false).serial).toBe("SN-FLEET");
  });

  it("answers null for a machine the fleet response does not hold", () => {
    // Sold, unlisted, no longer qualifying. Null is what makes the card say "not in his current
    // list" rather than invent a verdict about the supplier.
    expect(fleetMachineResolver(fleetRow(), false)("eq-gone")).toBeNull();
    expect(fleetMachineResolver(null, false)("eq-1")).toBeNull();
  });
});

describe("requestDocLabel — one word for one paper, on both surfaces", () => {
  it("names the types the requests can ask for", () => {
    expect(requestDocLabel("operating_license", L)).toBe("Operator licence");
    expect(requestDocLabel("ISTIMARA", L)).toBe("Registration (Istimara)");
    expect(requestDocLabel("saso-registration", L)).toBe("SASO registration");
  });

  it("humanises an unknown type rather than shouting a database column", () => {
    expect(requestDocLabel("third_party_liability", L)).toBe("Third party liability");
  });
});

/* ═════════ 2 · fleetKnown's three states ═══════════════════════════════════════════════════════ */

describe("the status row, and the three things this route can honestly say", () => {
  const ctx = (over: Record<string, unknown> = {}) => ({
    L,
    machine: fleetMachineResolver(fleetRow(), false),
    reply: () => null,
    ...over,
  });

  it("says NOTHING while the fleet is unknown — the pre-existing rule, unchanged", () => {
    // Before the fetch lands, and forever if it fails. The ask is still stated in full.
    const view = requestCardView(postedSubject(ask()), ctx({ fleetKnown: false, machine: () => null }));
    expect(view.status).toBeNull();
    expect(view.kindLabel).toBeTruthy();
    expect(view.title).toBe("SN-9");
  });

  it("re-derives the verdict once the fleet is in hand (RM3-AC-18)", () => {
    const view = requestCardView(postedSubject(ask()), ctx({ fleetKnown: true }));
    expect(view.status?.tone).toBe("answered");
    // And the equipment is finally NAMED — the whole reason the fleet had to reach this route.
    expect(view.title).toBe("Cat 320D · Crawler excavator");
  });

  it("claims no verdict for a machine missing from a fleet we DO hold", () => {
    const view = requestCardView(postedSubject(ask({ equipmentId: "eq-gone" })), ctx({ fleetKnown: true }));
    expect(view.status?.tone).toBe("unknown");
    expect(view.status?.label).toContain("isn't in his current list");
  });

  /* ── V12c · ONE card per request on this surface too (owner, 2026-08-11, evening) ────────────────
     *"make it one card for request and show his answer"*, superseding this morning's *"the supplier
     response must arrive in the same format of the sent card"*. The deal room and the map's dock read
     the same channel from the two chairs, so they must fold it identically — which is why the fold is
     a contract-layer function and is asserted here as well as in `request-card.test.ts`. */

  it("puts the supplier's answer in the card of the ask, and gives it no card of its own", () => {
    const thread = requestThreadCards([msg(ask()), msg(reply({ resolution: "declined" }))]);
    const answered = answeredAskRefs(thread);
    // The reply's own card is suppressed — the ask above is already saying this.
    expect(replyFoldsIntoAsk(answered, reply({ resolution: "declined" }))).toBe(true);

    const view = requestCardView(
      postedSubject(ask()),
      ctx({
        fleetKnown: true,
        // A yard the ask was never satisfied by, so the file has not overtaken what he said — that
        // precedence rule is RM3-AC-58's, and it has its own tests in `request-card.test.ts`.
        machine: fleetMachineResolver(fleetRow({ locationSource: "listing_yard" }), false),
        reply: () => ({ resolution: "declined" }),
      }),
    );
    expect(view.title).toBe("Cat 320D · Crawler excavator");
    expect(view.ref).toBe("RQ-7F3A");
    expect(view.status?.tone).toBe("refused");
    // The SPECIFIC wording, not the generic «He declined» the ask card used to derive on its own.
    expect(view.status?.label).toBe("He declined to confirm availability");
  });

  it("falls back to the bare form when the ask is not in the loaded window", () => {
    // An older page, a partial read. Naming an equipment nobody read would be a guess — and deleting
    // the answer along with its card would be worse, so it is NOT folded.
    expect(replyFoldsIntoAsk(answeredAskRefs(requestThreadCards([msg(reply())])), reply())).toBe(false);
    expect(replyFoldsIntoAsk(answeredAskRefs([]), reply())).toBe(false);
  });

  it("cues the card the newest answer landed in, and nothing when none has", () => {
    expect(latestAnsweredRef(requestThreadCards([msg(ask()), msg(reply())]))).toBe("RQ-7F3A");
    expect(latestAnsweredRef(requestThreadCards([msg(ask())]))).toBeNull();
  });
});

/* ═════════ 3 · the wiring ══════════════════════════════════════════════════════════════════════ */

describe("mapDealRoom exposes the bid the room settles", () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    id: "room-1",
    status: "NEGOTIATING",
    supplier: { id: 2, companyName: "Acme" },
    bid: { priceAmount: 100 },
    request: { equipmentItems: [{ numberOfUnits: 1 }] },
    terms: [],
    ...over,
  });

  it("reads the room's own bidId column", () => {
    expect(mapDealRoom(raw({ bidId: "bid-9" })).bidId).toBe("bid-9");
  });

  it("falls back to the nested bid's id", () => {
    expect(mapDealRoom(raw({ bid: { id: "bid-7", priceAmount: 100 } })).bidId).toBe("bid-7");
  });

  it("is null when neither is on the wire — never fabricated from the room id", () => {
    // A wrong bid id fetches ANOTHER supplier's fleet and puts his machines' names on this
    // conversation's cards, which is worse than the fleet-less fallback in every direction.
    const view = mapDealRoom(raw());
    expect(view.bidId).toBeNull();
    expect(view.id).toBe("room-1");
  });
});

describe("the deal room's fleet fetch — once, non-blocking, and harmless when it fails", () => {
  it("uses the map's own client function, keyed by the room's bid", () => {
    // Reused, not re-written: `inBid`/`yardConfirmed` are only meaningful relative to ONE bid, which
    // is why the endpoint and its cache are bid-keyed.
    expect(DEAL_ROOM).toContain("fetchBidFleet");
    expect(DEAL_ROOM).toMatch(/const bidId = room\?\.bidId;/);
    expect(DEAL_ROOM).toMatch(/fetchBidFleet\(bidId\)/);
  });

  it("fires in an effect of its own, so nothing in the conversation waits on it", () => {
    const effect = DEAL_ROOM.slice(DEAL_ROOM.indexOf("const bidId = room?.bidId;"));
    // Its whole dependency is the bid id — the 15s room poll must not re-request a fleet.
    expect(effect).toMatch(/\}, \[room\?\.bidId\]\);/);
    // The thread's own render is gated on chat readiness and NOT on the fleet.
    const thread = DEAL_ROOM.slice(DEAL_ROOM.indexOf('<div className="thread">'));
    expect(thread).toContain("!chatReady ?");
    expect(thread).not.toContain("!fleet ?");
  });

  it("starts null and stays null on a failure — exactly the behaviour this route had before", () => {
    expect(DEAL_ROOM).toMatch(/useState<FleetMachine\[\] \| null>\(null\)/);
    // The catch sets nothing. A latched failure flag would only give the surface something to say
    // about a read the renter can do nothing about.
    const effect = DEAL_ROOM.slice(DEAL_ROOM.indexOf("fetchBidFleet(bidId)"));
    expect(effect.slice(0, 400)).toMatch(/\.catch\(\(\) => \{\s*\}\)/);
    // …and null is precisely what makes the card say less rather than guess.
    expect(DEAL_ROOM).toContain("fleetKnown: fleet != null");
  });

  it("offers no press it cannot honour — this route has no equipment detail to open", () => {
    expect(DEAL_ROOM).toContain("canOpen: () => false");
    expect(DEAL_ROOM).not.toContain("onOpenMachine");
  });

  it("names no equipment TYPE it does not hold", () => {
    // `details.equipmentLabel` falls back to the accepted bid's make+model, so naming it would make
    // an `alternative` ask read as a swap for that unit.
    expect(DEAL_ROOM).toContain("typeWord: null");
  });
});

describe("both card types render through RequestCard, sided by their author", () => {
  it("renders the request as the full card, and folds the answer into it", () => {
    expect(DEAL_ROOM).toContain("requestCardView(postedSubject(card.card), cardCtx)");
    expect(DEAL_ROOM).toMatch(/<RequestCard[\s\S]{0,200}view=\{requestCardView/);
    /* V12c (owner, 2026-08-11, evening): the reply's SECOND full card is gone — `replyCardView` was
       what built it and is withdrawn — and the reply is suppressed only where its ask is on screen
       carrying the answer. The bare fallback below is untouched. */
    expect(DEAL_ROOM).not.toContain("replyCardView");
    expect(DEAL_ROOM).toContain("replyFoldsIntoAsk(answeredRefs, card.reply)");
  });

  it("carries the finite arrival cue on the card the answer folded into", () => {
    // Owner, 2026-08-11: *"light plumbing or something to show the answer when opening the chat"*.
    expect(DEAL_ROOM).toContain("cue={cuedRef != null && cuedRef === card.card.ref}");
    // Keyed on a STABLE ref, so the room's 15s poll cannot restart it; and it takes itself off.
    expect(DEAL_ROOM).toContain("latestAnsweredRef(threadCards)");
    expect(DEAL_ROOM).toMatch(/setTimeout\(\(\) => setCuedRef\(null\), ANSWER_CUE_MS\)/);
  });

  it("reads the side off the Stream AUTHOR, never off the card's type", () => {
    // The renter and the supplier read the same channel from opposite chairs: "an ask is mine, a
    // reply is theirs" is true from one and inverted from the other (owner, 2026-08-11).
    expect(DEAL_ROOM).toMatch(/const cardMine = myStreamId != null && m\.user\?\.id === myStreamId;/);
    expect(DEAL_ROOM).toMatch(/dl-rq-card \$\{cardMine \? "is-mine" : "is-them"\}/);
  });

  it("leaves the negotiation vocabulary centred — an event belongs to neither party", () => {
    // A rate, a counter, an acceptance is narration the room emitted. Only the request loop's cards
    // take a side, so the un-paired reply is wrapped and everything else is not.
    const branch = DEAL_ROOM.slice(DEAL_ROOM.indexOf("const chatCard = ("));
    expect(branch).toMatch(/card\.type === RENTEE_REQUEST_REPLY_CARD_TYPE \?/);
    expect(branch).toMatch(/<Fragment key=\{m\.id\}>\{chatCard\}<\/Fragment>/);
  });

  it("does not disturb the `?act=` deep link added the same day", () => {
    expect(DEAL_ROOM).toContain("initialFlow");
    expect(DEAL_ROOM).toMatch(/flowGate\.current = \{ counter: showAct, accept: showAct && canAccept \};/);
  });
});

describe("the card's chrome reaches a surface that is not the map", () => {
  it("carries no `.bidmap` scope — the deal room would otherwise paint it as bare text", () => {
    expect(RQ_CSS).toContain(".bm-rq {");
    expect(RQ_CSS).toContain(".bm-rq-state.is-answered");
    // The positive control above proves the file holds the real rules; this is the point of moving
    // it. Comments are stripped first — the header EXPLAINS the move in the words the rule forbids.
    expect(RQ_CSS.replace(/\/\*[\s\S]*?\*\//g, " ")).not.toContain(".bidmap");
  });

  it("draws the answer's arrival cue as a FINITE ring, and stills it for reduced motion", () => {
    // V6's rule, on a smaller cue: it ENDS. A ring that loops is decoration the renter learns to
    // ignore — and this one sits on a card he keeps re-reading.
    expect(RQ_CSS).toContain(".bm-rq.is-cued { animation: bmRqAnswer 1.6s ease-out 3 both; }");
    expect(RQ_CSS).not.toMatch(/animation:[^;]*infinite/);
    // Nothing animated but the shadow — a card mid-cue cannot appear to move or reflow the thread.
    const keyframes = RQ_CSS.match(/@keyframes bmRqAnswer \{[\s\S]*?\n\}/)![0];
    expect(keyframes).toMatch(/box-shadow/);
    expect(keyframes).not.toMatch(/transform|width|margin|border/);
    const reduced = RQ_CSS.slice(RQ_CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("animation: none");
    // …and still FINDABLE without motion: a still ring, on the surface's own timer.
    expect(reduced).toContain("0 0 0 3px rgba(37, 99, 235, 0.24)");
  });

  it("mirrors the chevron under RTL without depending on the map's root", () => {
    expect(RQ_CSS).toContain('[dir="rtl"] .bm-rq-go { transform: scaleX(-1); }');
  });

  it("travels with the component, so any surface that mounts it gets it", () => {
    expect(read("src/components/map/RequestCard.tsx")).toContain('import "@/components/map/request-card.css"');
  });

  it("leaves the map's own placement rules where the map's geometry lives", () => {
    // Higher specificity than the moved rules, so stylesheet order cannot change the outcome.
    const MAP_CSS = read("src/components/map/map-proto.css");
    expect(MAP_CSS).toContain(".bidmap .bm-chat-card .bm-rq,");
    expect(MAP_CSS).toContain(".bidmap .bm-chat-draft .bm-rq");
  });

  it("gives the deal room a wrapper that carries BOTH the side and the width", () => {
    // A card with a width of its own inside a sided wrapper is a second opinion about one geometry,
    // and the disagreement is what leaves it floating in from the edge.
    expect(DL_CSS).toContain(".dlproto .thread .dl-rq-card.is-mine { align-self: flex-end; }");
    expect(DL_CSS).toContain(".dlproto .thread .dl-rq-card.is-them { align-self: flex-start; }");
    expect(DL_CSS).toMatch(/\.dlproto \.thread \.dl-rq-card \.bm-rq,\s*\n\.dlproto \.thread \.dl-rq-card \.chatcard \{[^}]*width: 100%/);
  });
});

describe("the dock and the deal room share the derivations rather than copying them", () => {
  it("both go through the lifted projection", () => {
    expect(CHAT_DOCK).toContain("requestThreadCards(messages)");
    expect(DEAL_ROOM).toContain("requestThreadCards(messages as unknown[])");
    // The inline `messages.map` that used to build it in the dock is gone — one implementation.
    expect(CHAT_DOCK).not.toMatch(/if \(card\?\.type === RENTEE_REQUEST_CARD_TYPE\) return \{ ask:/);
  });

  it("both go through the lifted machine resolver and the lifted document table", () => {
    for (const src of [CHAT_DOCK, DEAL_ROOM]) {
      expect(src).toContain("fleetMachineResolver");
      expect(src).toContain("requestDocLabel");
    }
    // The dock's private copy of the document vocabulary is gone.
    expect(CHAT_DOCK).not.toContain("DOC_TYPE_LABELS");
  });
});

/* ═════════ `partial` folds and paints like any other answer (owner ruling, 2026-08-11, §8) ════════
 *
 * > *"…the renter is told exactly that: sent Insurance — the TUV certificate is still not on file.
 * > Amber. Not 'provided', not 'declined'."*
 *
 * BOTH surfaces render this one channel, so a `partial` that folded on one and not the other would
 * put two cards about one answer on the map and one in the deal room. The V12c fold is asserted here
 * for the new resolution, and the amber is read off the two stylesheets that draw it.
 */
describe("`partial` — one card, amber, on both surfaces", () => {
  const docLabel = (t: string) => requestDocLabel(t, L);
  const asked = ask({ kind: "document", docTypes: ["tuv_cert"] });
  const partial = reply({ resolution: "partial", deliveredTypes: ["insurance"] });

  it("survives the shared projection and the reply index, carrying its papers", () => {
    const thread = requestThreadCards([msg(asked), msg(partial)]);
    expect(requestRepliesByRef(thread).get("RQ-7F3A")).toEqual({
      resolution: "partial",
      deliveredTypes: ["insurance"],
    });
  });

  it("folds onto its ask exactly as `provided` does — one card, and it is the request's", () => {
    const thread = requestThreadCards([msg(asked), msg(partial)]);
    const answered = answeredAskRefs(thread);
    expect(replyFoldsIntoAsk(answered, partial)).toBe(true);
    // …and the arrival cue points at it, because it IS news.
    expect(latestAnsweredRef(thread)).toBe("RQ-7F3A");
  });

  it("names both clauses on the surviving card, and the ask still reads as unsatisfied underneath", () => {
    const thread = requestThreadCards([msg(asked), msg(partial)]);
    const replies = requestRepliesByRef(thread);
    // The machine holds what he SENT and not what was ASKED — the state a partial describes.
    const fleet = fleetRow({ documentKeys: [{ type: "insurance" }], locationSource: "listing_yard" });

    const view = requestCardView(postedSubject(asked), {
      L,
      machine: fleetMachineResolver(fleet, false),
      reply: (ref) => replies.get(ref) ?? null,
      docLabel,
      fleetKnown: true,
    });

    expect(view.status).toEqual({
      tone: "partial",
      label: "Sent Insurance — the TÜV certificate is still not on file",
    });
    // Never the green of an answer, never the words of a refusal.
    expect(view.status?.tone).not.toBe("answered");
    expect(view.status?.label.toLowerCase()).not.toContain("declin");
  });

  it("the bare fallback — a reply whose ask is NOT in the window — still names what arrived", () => {
    // Rule 3 of V12c: nothing to fold into, so it renders on its own. It can still say the first
    // clause (it is on the reply) and must not invent the second (the question was never read).
    const thread = requestThreadCards([msg(partial)]);
    expect(replyFoldsIntoAsk(answeredAskRefs(thread), partial)).toBe(false);

    const card = chatCardOfMessage(msg(partial))!;
    const view = buildChatCardView(card, {
      ar: false, L, terms: [], at: null, responded: false, superseded: false, live: false,
      requestCtx: { machine: () => null, reply: () => null, docLabel },
    });
    const answerRow = view.rows.find((r) => r.label === "Answer");
    expect(answerRow?.value).toBe("Sent Insurance — but not everything that was asked for");
  });

  it("paints amber on both stylesheets, and never the success colour", () => {
    // One channel, one colour. The map's card and the deal room's smaller form must not disagree
    // about what a partial looks like.
    expect(RQ_CSS).toContain(".bm-rq-state.is-partial");
    expect(DL_CSS).toContain(".cc-out-partial");
    // Neither borrows the green of an answer.
    const partialRules = [
      RQ_CSS.slice(RQ_CSS.indexOf(".bm-rq-state.is-partial")).split("\n")[0],
      DL_CSS.slice(DL_CSS.indexOf(".dlproto .cc-out-partial")).split("\n")[0],
    ];
    for (const rule of partialRules) {
      expect(rule).not.toContain("--success");
      expect(rule).not.toContain("#16a34a");
    }
  });

  it("does not read as a refusal on the dock's arrival bubble", () => {
    // The bubble's warm «رفض طلبك» tone was written as `resolution !== "provided"`, which would have
    // swept the new resolution into it and told the renter the supplier refused him when he had just
    // sent him a document. It is now an allow-list of the two resolutions that really refuse.
    expect(CHAT_DOCK).toContain('resolution === "declined"');
    expect(CHAT_DOCK).toContain('resolution === "unavailable"');
    expect(CHAT_DOCK).not.toContain('reply.resolution !== "provided"');
  });
});
