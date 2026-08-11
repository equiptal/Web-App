/**
 * **The renter's request card, as the conversation shows it** — prototype `rRequestCard`
 * (`prototype/05-chat-and-requests.js:92`), spec 004 §6.7 / RM3-AC-17 / RM3-AC-18.
 *
 * The generic `buildChatCardView` renders an ask as a title and a list of label/value rows, which is
 * what every negotiation event gets. The prototype's card is a different object: an **identity strip**
 * naming the machine (its photo, its model · spec, its serial, and the reference at the trailing edge),
 * then the ask, then a **live status row**. The owner asked for that card back on 2026-08-10 — his
 * reason being that a supplier reading it must be able to press it and land on the machine he is
 * expected to act on.
 *
 * Two rules this module exists to hold, both of them the prototype's:
 *
 * 1. **The machine is resolved from `equipmentId`, never from the message text.** The prototype's
 *    `unitByRef` looks the unit up in the fleet and titles the card `model · spec` from it; the serial
 *    on the payload is display-only and is the FALLBACK, not the source. A card that parsed a name out
 *    of prose would name a different machine than the one the ask is about the moment the prose
 *    changed.
 * 2. **The status is re-read on every render** (RM3-AC-18). There is no status column behind a request
 *    (§7.3), so `renteeRequestState` is called here with the machine as the fleet holds it *now* — the
 *    same derivation `buildChatCardView` uses, deliberately, so the two renderings of one ask can never
 *    disagree about whether it was answered.
 *
 * **NO React, NO DOM** — same rule as `deal-rounds.ts`, and like that module it takes its words through
 * an `L(en, ar)` so the view-model is fully decided before a component sees it.
 */

import {
  renteeRequestState,
  type RenteeRequestCardPayload,
  type RenteeRequestDraft,
  type RenteeRequestKind,
  type RenteeRequestReplyPayload,
  type RenteeRequestResolution,
  type RenteeRequestScope,
  type RequestTargetMachine,
} from "./rentee-request";

type LFn = (en: string, ar: string) => string;

/**
 * An ask, in the ONE shape this card renders — whether it is already in the conversation or is still
 * a draft awaiting «أرسل الطلب».
 *
 * `ref` is nullable **because a draft has none**: the reference is minted server-side by the send
 * (§7.3), so a draft that displayed one would be showing the renter a number that will not be the one
 * both sides quote. It renders as absent rather than as a placeholder.
 */
export interface RequestCardSubject {
  scope: RenteeRequestScope;
  equipmentId: string | null;
  kind: RenteeRequestKind;
  docTypes: string[] | null;
  ref: string | null;
  /** DISPLAY ONLY, and only ever a fallback for the fleet's own row — see rule 1 in the header. */
  serial: string | null;
}

/** A posted card → the subject. */
export function postedSubject(card: RenteeRequestCardPayload): RequestCardSubject {
  return {
    scope: card.scope,
    equipmentId: card.equipmentId,
    kind: card.kind,
    docTypes: card.docTypes,
    ref: card.ref,
    serial: card.serial,
  };
}

/** A composed-but-unsent ask → the subject. No `ref` and no `serial`: both are stamped by the send,
 *  and the machine's own serial is read from the fleet by the resolver below anyway. */
export function draftSubject(draft: RenteeRequestDraft): RequestCardSubject {
  return {
    scope: draft.scope,
    equipmentId: draft.equipmentId,
    kind: draft.kind,
    docTypes: draft.docTypes ?? null,
    ref: null,
    serial: null,
  };
}

/**
 * The machine as the identity strip needs it: the state derivation's two fields, plus the three things
 * that make the strip an identity rather than an id — what it is called, its serial, and its photo.
 *
 * Structurally satisfied by a `FleetMachine` projection, deliberately: the strip must name the machine
 * the same way the card and the detail name it, or the renter would be looking at two different labels
 * for one unit.
 */
export interface RequestCardMachine extends RequestTargetMachine {
  /** `model · spec`, already composed by the caller from the row it holds. */
  label: string | null;
  serial: string | null;
  photoUrl: string | null;
}

export interface RequestCardCtx {
  L: LFn;
  /** The fleet, by `equipmentId`, read on EVERY render. Null when this machine is not in the response
   *  — sold, unlisted, or a sibling tab whose fleet this surface does not hold. */
  machine: (equipmentId: string) => RequestCardMachine | null;
  /** The supplier's answer carrying this `ref`, if he posted one. A draft has no `ref` and is never
   *  asked. */
  reply: (ref: string) => { resolution: RenteeRequestResolution } | null;
  /** A wire document type → the renter's word for it, so a chip never reads `operating_license`. */
  docLabel?: (docType: string) => string;
  /**
   * Whether this surface holds the fleet these cards are derived from. Defaults to true.
   *
   * **False omits the status row entirely.** A sibling tab is a different room about a different item
   * and its fleet is not fetched here; deriving anyway would print «هذه المعدّة ليست ضمن قائمته
   * الحالية» — a claim about the SUPPLIER made out of our own ignorance. `/deal-room/[id]` renders the
   * same conversation with no fleet at all and shows the ask without a verdict for exactly this
   * reason (see `buildChatCardView`'s `requestCtx`); this is that rule, per card.
   */
  fleetKnown?: boolean;
  /**
   * Whether pressing this card can actually land the reader on the machine (the owner's reason for the
   * card, 2026-08-10). Omitted means "yes, if the fleet holds it" — but the surface that mounts this
   * knows more: a machine in the fleet that the offer does not name has no detail to open, and a card
   * that looked pressable and did nothing would be worse than one that never claimed to be.
   */
  canOpen?: (equipmentId: string) => boolean;
  /**
   * What the REQUEST asked for — "Crawler Excavator 30 ton" — already composed and localised by the
   * surface from the request's own taxonomy, singular.
   *
   * Only an `alternative` reads it, and it is what makes that card say the same thing the list-foot
   * control says (owner, 2026-08-11). Null on a surface holding no request — a sibling tab, the deal
   * room — where the card names no type rather than naming the wrong one.
   */
  typeWord?: string | null;
}

/** How the status row reads. `draft` is the one tone that is not a statement about the supplier — it
 *  is a statement about the renter, who has not pressed send yet. */
export type RequestCardTone = "answered" | "refused" | "waiting" | "unknown" | "draft";

export interface RequestCardView {
  scope: RenteeRequestScope;
  kind: RenteeRequestKind;
  /** The machine this card names, for the press that opens it. Null on a company-scope card. */
  equipmentId: string | null;
  /** Absent on a draft (see {@link RequestCardSubject}). */
  ref: string | null;
  /** The identity strip's title — `model · spec` off the FLEET, the serial as the last resort. */
  title: string;
  /** The serial, monospace and LTR beneath the title. Null when neither the fleet nor the payload has
   *  one. */
  serial: string | null;
  photoUrl: string | null;
  /** True only when a press has somewhere to go. A `company` card names no machine and is never
   *  pressable — the prototype's own rule, and the reason `scope` is on the payload at all. */
  openable: boolean;
  /** The blue line above the body. */
  kindLabel: string;
  /** The requested document types, in the renter's words. Empty on a non-document ask. */
  docChips: string[];
  /** The ask in prose — shown INSTEAD of the chips, exactly as the prototype alternates them. Null on
   *  a document ask, which states itself through its chips. */
  askText: string | null;
  /** Null when this surface cannot say — see {@link RequestCardCtx.fleetKnown}. */
  status: { tone: RequestCardTone; label: string } | null;
}

/**
 * The subject + the fleet → everything the card renders.
 *
 * `draft` changes exactly two things: the buttons the component adds, and the ONE status reading that
 * would otherwise be a lie. «بانتظار ردّه» on an unsent card claims the supplier owes an answer to a
 * question he has never seen; every other reading is still true of a draft and is left alone — a draft
 * whose machine already satisfies the ask should say so, which is the most useful moment to find out.
 */
export function requestCardView(
  subject: RequestCardSubject,
  ctx: RequestCardCtx,
  opts: { draft?: boolean } = {},
): RequestCardView {
  const { L } = ctx;
  const draft = opts.draft === true;
  // Rule 1: the machine comes from the id. `scope === "company"` names none by construction — the
  // shortfall ask asks FOR a machine — so it is not looked up rather than looked up and missed.
  const machine = subject.scope === "company" || !subject.equipmentId ? null : ctx.machine(subject.equipmentId);

  const title =
    machine?.label?.trim() ||
    machine?.serial ||
    subject.serial ||
    (subject.scope === "company" ? L("The company", "الشركة") : L("The equipment", "المعدّة"));

  /* ── `alternative` asks for an ADDITION, and names the REQUEST's type (owner, 2026-08-11) ───────
     «طلب معدّة أخرى» / "Request for another machine" described a SWAP — a different unit instead of
     this one — which is not what either control raises. Both ask the supplier to ADD one more machine
     that meets the request, so both now read the way the list-foot control reads: *"ask to add
     another Crawler Excavator 30 ton"*. The type word comes from the request's own taxonomy through
     `ctx.typeWord`, never from the machine the ask was raised beside — the ask is not about it. */
  const another = ctx.typeWord?.trim() || null;

  const kindLabel = ((): string => {
    switch (subject.kind) {
      case "availability":
        return L("Availability confirmation request", "طلب تأكيد التوفّر");
      case "document":
        return L("Document request", "طلب مستند");
      case "alternative":
        // The shortfall ask names no machine — it asks FOR one — and neither does this one, which is
        // why they now read alike. Only the type word separates them from "another machine".
        return another
          ? L(`Request to add another ${another}`, `طلب إضافة ${another} أخرى`)
          : L("Request to add other equipment", "طلب إضافة معدّة أخرى");
    }
  })();

  const naming = ctx.docLabel;
  const docChips = (subject.docTypes ?? []).map((t) => naming?.(t) ?? t);

  /* The ask in the renter's own words. The wire carries no prose — the backend composes the message
     text itself — so it is written here from the kind, which is the only thing that decides it. A
     document ask gets none: its chips ARE the ask, and a sentence above them would say it twice. */
  const askText = ((): string | null => {
    switch (subject.kind) {
      case "availability":
        return L("Can you confirm this equipment is available?", "هل يمكنك تأكيد توفّر هذه المعدّة؟");
      case "alternative":
        // An ADDITION, not a swap. "matching these specifications" read as *instead of this one* —
        // and it is asked from beside a machine, which made the misreading the obvious one.
        return another
          ? L(
              `Do you have another ${another} to add that meets my request?`,
              `هل لديك ${another} أخرى تضيفها وتطابق طلبي؟`,
            )
          : L(
              // "equipment", never "machine" — one word for the thing across the whole surface.
              "Do you have other equipment to add that meets my request?",
              "هل لديك معدّة أخرى تضيفها وتطابق طلبي؟",
            );
      case "document":
        return null;
    }
  })();

  // Rule 2 — the verdict, re-derived. A draft has no `ref`, so it has no reply to consult and the
  // machine is the whole of its answer.
  const state =
    ctx.fleetKnown === false
      ? null
      : renteeRequestState(
          { kind: subject.kind, equipmentId: subject.equipmentId, docTypes: subject.docTypes },
          machine,
          subject.ref ? ctx.reply(subject.ref) : null,
        );

  const status = ((): { tone: RequestCardTone; label: string } | null => {
    switch (state) {
      case null:
        return null;
      case "answered":
        return { tone: "answered", label: L("Answered — his file now shows it", "تم الردّ — ظهر على ملفه") };
      case "refused":
        return { tone: "refused", label: L("He declined", "اعتذر المورّد") };
      case "unavailable":
        return { tone: "refused", label: L("He answered: not available", "ردّ: غير متوفّرة") };
      case "unknown":
        return {
          tone: "unknown",
          label: L("This equipment isn't in his current list", "هذه المعدّة ليست ضمن قائمته الحالية"),
        };
      default:
        // NEVER "he refused" — an unanswered ask is unanswered (RM3-AC-20's rule, on the card). And
        // never "waiting for his answer" on something he has not been sent.
        return draft
          ? { tone: "draft", label: L("Not sent yet — review it, then send", "لم يُرسل بعد — راجعه ثم أرسله") }
          : { tone: "waiting", label: L("Waiting for his answer", "بانتظار ردّه") };
    }
  })();

  return {
    scope: subject.scope,
    kind: subject.kind,
    equipmentId: subject.equipmentId,
    ref: subject.ref,
    title,
    serial: machine?.serial ?? subject.serial,
    photoUrl: machine?.photoUrl ?? null,
    /* Never pressable: a `company` card (it names no machine at all), an `alternative` (owner,
       2026-08-11 — it asks for a machine that does not exist yet, so the unit it happens to carry is
       the one it is NOT about, and opening that would land the reader on the wrong machine), and a
       machine this surface cannot open. */
    openable:
      subject.scope !== "company" &&
      subject.kind !== "alternative" &&
      subject.equipmentId != null &&
      (ctx.canOpen ? ctx.canOpen(subject.equipmentId) : machine != null),
    kindLabel,
    docChips,
    askText,
    status,
  };
}

/* ═════════ V12a · the supplier's ANSWER, in the card of the ask it answers (owner, 2026-08-11) ═════
 *
 * The ruling: *"the supplier response must arrive in the same format of the sent card but with
 * supplier answer"*.
 *
 * Until now a reply rendered through the generic `buildChatCardView` — a "The supplier answered"
 * title, a `Reference` row, an `Answer: Done` row. It said nothing about WHAT was asked or WHICH
 * equipment, so a renter scrolling the thread saw his own card followed by an unrelated receipt and
 * had to carry the reference in his head to pair them.
 *
 * The reply payload carries only `inReplyTo` and a resolution (§7.3) — no equipment, no kind — so the
 * header cannot be built from it. It is **resolved from the thread**: the ask carrying that `ref` is
 * found among the loaded messages and its OWN view is built by `requestCardView` above, so the two
 * cards cannot drift — one function decides the tile, the title, the reference and the ask line for
 * both. Only the status row differs, and that is the whole point: where the request says «بانتظار
 * ردّه», the reply says what he answered.
 *
 * **An unresolved reply says less; it never guesses.** When the ask is not in the loaded window — an
 * older page, a partial channel read — `replyCardView` returns null and the caller keeps today's bare
 * form. Naming an equipment we have not read would put a machine's name under a supplier's answer on
 * nothing but a matching reference.
 */

/** The thread as these functions read it: the asks and the answers, in load order. Deliberately the
 *  same shape `outstandingAskIdentities` takes — one projection of a message list serves both. */
export interface RequestThreadCard {
  ask?: RenteeRequestCardPayload | null;
  reply?: RenteeRequestReplyPayload | null;
}

/**
 * The ask a reply answers, or null when the thread in hand does not hold it.
 *
 * Pure and order-independent: a channel read is not guaranteed to be ordered, so the ask is looked up
 * across the whole window rather than searched backwards from the reply.
 */
export function askAnsweredBy(
  thread: readonly RequestThreadCard[],
  reply: Pick<RenteeRequestReplyPayload, "inReplyTo">,
): RenteeRequestCardPayload | null {
  const want = reply.inReplyTo.trim();
  if (!want) return null;
  for (const c of thread) {
    if (c.ask && c.ask.ref.trim() === want) return c.ask;
  }
  return null;
}

/** What the supplier's answer is worded FROM: the ask's own kind, and the resolution he sent. */
export interface ReplyAnswerSubject {
  /** Null when the ask could not be resolved — the wording then says only what the resolution says. */
  kind: RenteeRequestKind | null;
  resolution: RenteeRequestResolution;
  /** How many documents were asked for, so a one-paper ask does not read as several. */
  docCount?: number;
  /** The request's type word, as {@link RequestCardCtx.typeWord} carries it. */
  typeWord?: string | null;
}

/**
 * The answer as a line the renter can read without re-reading the question — "Done" is not an answer
 * (owner, 2026-08-11). Each resolution is worded in the terms of the ask it answers: an `availability`
 * ask answered `provided` is a confirmation, a `document` ask answered `provided` is papers added, and
 * `unavailable` is always about the equipment rather than about the papers.
 *
 * The one wording rule that outranks the rest is the card's existing one: **never imply a refusal that
 * was not made.** `declined` is the only resolution that says he refused, and it is the only wording
 * here that says so; `unavailable` reports a fact about the equipment, not an unwillingness.
 *
 * Exported so the bare fallback in `buildChatCardView` says the same words with the kind removed —
 * one table, two renderings, no drift.
 */
export function replyAnswerLine(
  subject: ReplyAnswerSubject,
  L: LFn,
): { tone: RequestCardTone; label: string } {
  const { resolution } = subject;
  const another = subject.typeWord?.trim() || null;
  const many = (subject.docCount ?? 0) > 1;
  const tone: RequestCardTone = resolution === "provided" ? "answered" : "refused";

  const label = ((): string => {
    if (subject.kind === "availability") {
      switch (resolution) {
        case "provided":
          return L("He confirmed this equipment is available", "أكّد توفّر هذه المعدّة");
        case "declined":
          return L("He declined to confirm availability", "اعتذر عن تأكيد التوفّر");
        case "unavailable":
          return L("He answered: this equipment is not available", "ردّ: هذه المعدّة غير متوفّرة");
      }
    }
    if (subject.kind === "document") {
      switch (resolution) {
        case "provided":
          return many
            ? L("He added the documents to this equipment's file", "أضاف المستندات إلى ملف هذه المعدّة")
            : L("He added the document to this equipment's file", "أضاف المستند إلى ملف هذه المعدّة");
        case "declined":
          return many
            ? L("He declined to provide the documents", "اعتذر عن تقديم المستندات")
            : L("He declined to provide the document", "اعتذر عن تقديم المستند");
        case "unavailable":
          // A document ask answered `unavailable` is not a statement about the PAPERS — he answered
          // about the equipment, and "the documents are unavailable" would invent an answer he did
          // not give.
          return L("He answered: this equipment is not available", "ردّ: هذه المعدّة غير متوفّرة");
      }
    }
    if (subject.kind === "alternative") {
      switch (resolution) {
        case "provided":
          return another
            ? L(`He added another ${another}`, `أضاف ${another} أخرى`)
            : L("He added other equipment", "أضاف معدّة أخرى");
        case "declined":
          return another
            ? L(`He declined to add another ${another}`, `اعتذر عن إضافة ${another} أخرى`)
            : L("He declined to add other equipment", "اعتذر عن إضافة معدّة أخرى");
        case "unavailable":
          // This ask is FOR equipment that is not on his list yet, so "not available" reads as "he
          // has none to add" — a fact about his fleet, not a refusal.
          return another
            ? L(`He answered: he has no other ${another} available`, `ردّ: لا تتوفّر لديه ${another} أخرى`)
            : L("He answered: he has no other equipment available", "ردّ: لا تتوفّر لديه معدّة أخرى");
      }
    }
    // The ask is not in hand. Say what the resolution says and NOTHING about equipment or papers.
    switch (resolution) {
      case "provided":
        return L("He provided what was asked", "قدّم ما طُلب");
      case "declined":
        return L("He declined", "اعتذر المورّد");
      case "unavailable":
        return L("He answered: not available", "ردّ: غير متوفّرة");
    }
  })();

  return { tone, label };
}

/**
 * The thread + a reply → **the ask's own card, with the answer where its waiting state was**.
 *
 * Null when the ask is not in the loaded window — see the section header: the caller falls back to the
 * bare form rather than this function inventing a header.
 *
 * The status is NOT re-derived from the fleet here, and that is deliberate. Rule 2 above re-reads the
 * machine because a REQUEST asks what is true right now; a reply is a thing the supplier said at a
 * moment, and it keeps saying it whether or not his file has moved since. The request card sitting
 * above it is the one that tracks the fleet — which is also why the pair is worth showing.
 */
export function replyCardView(
  thread: readonly RequestThreadCard[],
  reply: RenteeRequestReplyPayload,
  ctx: RequestCardCtx,
): RequestCardView | null {
  const ask = askAnsweredBy(thread, reply);
  if (!ask) return null;
  const view = requestCardView(postedSubject(ask), ctx);
  return {
    ...view,
    status: replyAnswerLine(
      {
        kind: ask.kind,
        resolution: reply.resolution,
        docCount: ask.docTypes?.length ?? 0,
        typeWord: ctx.typeWord ?? null,
      },
      ctx.L,
    ),
  };
}
