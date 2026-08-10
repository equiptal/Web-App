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
    (subject.scope === "company" ? L("The company", "الشركة") : L("The machine", "المعدّة"));

  const kindLabel = ((): string => {
    switch (subject.kind) {
      case "availability":
        return L("Availability confirmation request", "طلب تأكيد التوفّر");
      case "document":
        return L("Document request", "طلب مستند");
      case "alternative":
        // The shortfall ask names no machine — it asks FOR one. «طلب معدّة أخرى» would describe a swap
        // the renter never proposed.
        return subject.equipmentId
          ? L("Request for another machine", "طلب معدّة أخرى")
          : L("Request to add the missing units", "طلب إضافة الوحدات الناقصة");
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
        return L("Can you confirm this machine is available?", "هل يمكنك تأكيد توفّر هذه المعدّة؟");
      case "alternative":
        return subject.equipmentId
          ? L(
              "Do you have another machine matching these specifications?",
              "هل لديك معدّة أخرى مطابقة لمواصفات الطلب؟",
            )
          : L("Can you add the missing units to the offer?", "هل يمكنك إضافة الوحدات الناقصة إلى العرض؟");
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
        return { tone: "refused", label: L("He declined", "اعتذر المورد") };
      case "unavailable":
        return { tone: "refused", label: L("He answered: not available", "ردّ: غير متوفّرة") };
      case "unknown":
        return {
          tone: "unknown",
          label: L("This machine isn't in his current list", "هذه المعدّة ليست ضمن قائمته الحالية"),
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
    // A company card is never pressable, and a machine the surface cannot open is not either.
    openable:
      subject.scope !== "company" &&
      subject.equipmentId != null &&
      (ctx.canOpen ? ctx.canOpen(subject.equipmentId) : machine != null),
    kindLabel,
    docChips,
    askText,
    status,
  };
}
