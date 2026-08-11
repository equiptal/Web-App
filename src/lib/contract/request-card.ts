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
  stillMissingDocTypes,
  type RenteeRequestCardPayload,
  type RenteeRequestDraft,
  type RenteeRequestKind,
  type RenteeRequestReplyPayload,
  type RenteeRequestResolution,
  type RenteeRequestScope,
  type RenteeRequestState,
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
  /**
   * The supplier's answer carrying this `ref`, if he posted one. A draft has no `ref` and is never
   * asked.
   *
   * `deliveredTypes` rides along because a `partial` is not fully described by its resolution: the
   * line the renter reads names the papers that landed (owner ruling, 2026-08-11, §8). Optional, so
   * a caller that only holds resolutions still type-checks and simply words the unnamed form.
   */
  reply: (ref: string) => {
    resolution: RenteeRequestResolution;
    deliveredTypes?: readonly string[] | null;
  } | null;
  /** A wire document type → the renter's word for it, so a chip never reads `operating_license`. */
  docLabel?: (docType: string) => string;
  /**
   * Whether this surface holds the fleet these cards are derived from. Defaults to true.
   *
   * **False omits the status row entirely.** A sibling tab is a different room about a different item
   * and its fleet is not fetched here; deriving anyway would print «هذه المعدّة ليست ضمن قائمته
   * الحالية» — a claim about the SUPPLIER made out of our own ignorance.
   *
   * `/deal-room/[id]` was the other surface this described: it rendered the same conversation with no
   * fleet at all. It now fetches one (owner, 2026-08-11 — *"i want it like request card"*), so it
   * passes `fleetKnown: fleet != null` and the false state there means **the read has not landed, or
   * failed**. The rule is unchanged and is the reason the fetch could be made non-blocking at all:
   * a card with no fleet behind it says less rather than guessing, on any surface and for any reason.
   *
   * Distinct from `machine()` answering null, which is a fleet we DO hold that lacks this machine —
   * that is a verdict (`unknown`), and one the fleet supports.
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

/**
 * How the status row reads. `draft` is the one tone that is not a statement about the supplier — it
 * is a statement about the renter, who has not pressed send yet.
 *
 * **`partial` is AMBER** (owner ruling, 2026-08-11, §8: *"Amber. Not 'provided', not 'declined'."*).
 * It has its own tone rather than borrowing `refused` — which is already amber on this surface — for
 * two reasons: a supplier who sent the wrong paper has not refused anything, and a tone that two
 * different verdicts share is a tone that cannot be restyled for one of them later. It must never
 * take the green of `answered`.
 */
export type RequestCardTone = "answered" | "refused" | "partial" | "waiting" | "unknown" | "draft";

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
  const answer = subject.ref ? ctx.reply(subject.ref) : null;
  const state =
    ctx.fleetKnown === false
      ? null
      : renteeRequestState(
          { kind: subject.kind, equipmentId: subject.equipmentId, docTypes: subject.docTypes },
          machine,
          answer,
        );

  /* ── V12c · this card SAYS what he answered, in the ask's own words (owner, 2026-08-11) ──────────
     One card per request now (see the V12c section below), so this status row is the only place the
     supplier's answer can appear — and the generic derivation was the WEAKER of the two wordings the
     renter was seeing. His thread showed the ask card saying «ردّ: غير متوفّرة» *"He answered: not
     available"* beside a reply card saying *"He answered: he has no other Crawler Excavator 30 ton
     available"*. The second sentence is an answer to the question that was asked; the first is a
     resolution enum read aloud. The card that survives must carry the second.

     `replyAnswerLine` is that wording, and it is the SAME table the bare fallback form uses — so the
     folded card and an unfoldable reply can never word one resolution two ways.

     **It speaks only when the answer is what this card is reporting**, which is the rule that keeps
     RM3-AC-58 intact in both directions:
       · `state === saidState` — the derivation and the supplier agree, so his own words are simply the
         specific form of the same verdict;
       · `state === null` — this surface holds no fleet (`fleetKnown: false`) and derives nothing. What
         he SAID still stands: an answer is a thing he said, not a thing read off a machine, which is
         why the withdrawn reply card stated it here too;
       · otherwise the derivation wins and his words are not printed — a `provided` the file does not
         corroborate is downgraded to «بانتظار ردّه» (RM3-AC-58) and must not read as "he added it",
         and a refusal his file has since overtaken must not out-shout «ظهر على ملفه». */
  const saidState: RenteeRequestState | null = !answer
    ? null
    : answer.resolution === "provided"
      ? "answered"
      : answer.resolution === "partial"
        ? "partial"
        : answer.resolution === "declined"
          ? "refused"
          : "unavailable";

  const status = ((): { tone: RequestCardTone; label: string } | null => {
    if (answer && (state === null || state === saidState)) {
      return replyAnswerLine(
        {
          kind: subject.kind,
          resolution: answer.resolution,
          docCount: subject.docTypes?.length ?? 0,
          typeWord: ctx.typeWord ?? null,
          /* The `partial` half (owner, 2026-08-11, §8). Both lists are handed over so the line can
             name what arrived AND what is still owed: the ask's own types are right here on the
             subject, so the folded card — unlike the bare fallback — can always state the second
             clause. `docLabel` is passed too, so the sentence names a paper the same way the chips
             two lines above it do. */
          deliveredTypes: answer.deliveredTypes ?? null,
          askedTypes: subject.docTypes,
          docLabel: naming,
        },
        L,
      );
    }
    switch (state) {
      case null:
        return null;
      case "answered":
        return { tone: "answered", label: L("Answered — his file now shows it", "تم الردّ — ظهر على ملفه") };
      case "refused":
        return { tone: "refused", label: L("He declined", "اعتذر المورّد") };
      case "unavailable":
        return { tone: "refused", label: L("He answered: not available", "ردّ: غير متوفّرة") };
      /* Reachable only when the derivation and the answer disagree — `state === "partial"` while
         `saidState` is something else, which cannot happen — or when there is no answer object to
         word from. Kept explicit rather than folded into the default so a partial can never fall
         through to «بانتظار ردّه» and erase the news. */
      case "partial":
        return {
          tone: "partial",
          label: L(
            "He sent something else — what was asked for is still not on file",
            "أرسل شيئًا آخر — ما طُلب لا يزال غير مرفوع",
          ),
        };
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

/* ═════════ The document vocabulary — ONE table, every surface (owner, 2026-08-11) ═════════════════
 *
 * A document chip must never read `operating_license`, and it must never read one thing in the map's
 * chat dock and another in `/deal-room/[id]` — the two surfaces render the SAME channel, so a second
 * table is a second answer to "what paper is this?" about one card.
 *
 * It lived in `ChatDock.tsx` until the deal room grew the same cards (the owner's ruling of
 * 2026-08-11 — *"i want it like request card"*). Lifted here rather than copied there: this module
 * already owns every other word on the card, and `docLabel` is the one hole the surface had to fill.
 */

/** Wire document types → the renter's words. Only the types the requests can name; anything else is
 *  humanised from its key rather than guessed at, because a wrong label on a document request is a
 *  request for the wrong paper. */
const DOC_TYPE_LABELS: Record<string, [string, string]> = {
  istimara: ["Registration (Istimara)", "الاستمارة"],
  istimarah: ["Registration (Istimara)", "الاستمارة"],
  registration: ["Registration", "التسجيل"],
  customs: ["Customs card", "البطاقة الجمركية"],
  customs_card: ["Customs card", "البطاقة الجمركية"],
  sale_contract: ["Sale contract", "عقد البيع"],
  sales_contract: ["Sale contract", "عقد البيع"],
  saso_registration: ["SASO registration", "تسجيل ساسو"],
  tuv: ["TÜV certificate", "شهادة TÜV"],
  spsp: ["SPSP certificate", "شهادة SPSP"],
  saso: ["SASO certificate", "شهادة ساسو"],
  aramco: ["Aramco certificate", "شهادة أرامكو"],
  insurance: ["Insurance", "التأمين"],
  /* ── The CATALOGUE's spellings of papers already named above ────────────────────────────────────
     One paper, two vocabularies: a machine stores `tuv` / `insurance` / `customs`
     (`validators/equipment.schema.ts`) while the catalogue row an ASK is validated against is
     `tuv_cert` / `equipment_insurance` / `custom_card` (`EquipmentDocumentType.documentKey`). Both
     spellings reach this table from real data — the ask carries the catalogue's, the reply's
     `deliveredTypes` carries the listing's — so a table holding only one of them humanises the other
     into `Tuv cert`, and the owner's sentence becomes *"sent Insurance — the Tuv cert is still not on
     file"*. Added as labels rather than folded through `canonicalDocType`, because that function's
     canonical form is the catalogue's and half of these keys are not it. */
  tuv_cert: ["TÜV certificate", "شهادة TÜV"],
  tuv_certificate: ["TÜV certificate", "شهادة TÜV"],
  spsp_cert: ["SPSP certificate", "شهادة SPSP"],
  spsp_certificate: ["SPSP certificate", "شهادة SPSP"],
  saso_inspection: ["SASO certificate", "شهادة ساسو"],
  safety_cert: ["Safety certificate", "شهادة السلامة"],
  equipment_insurance: ["Insurance", "التأمين"],
  custom_card: ["Customs card", "البطاقة الجمركية"],
  vat_cert: ["VAT certificate", "الشهادة الضريبية"],
  ownership_letter: ["Proof of ownership", "إثبات الملكية"],
  operating_license: ["Operator licence", "رخصة المشغّل"],
  operator_license: ["Operator licence", "رخصة المشغّل"],
  operator_tuv: ["Operator TÜV", "شهادة TÜV للمشغّل"],
  operator_spsp: ["Operator SPSP", "شهادة SPSP للمشغّل"],
  operator_id: ["Operator ID", "هوية المشغّل"],
  operator_insurance: ["Operator insurance", "تأمين المشغّل"],
  cr: ["Commercial registration", "السجل التجاري"],
  vat: ["VAT certificate", "الشهادة الضريبية"],
  national_address: ["National address", "العنوان الوطني"],
  local_content: ["Local content", "المحتوى المحلي"],
};

/**
 * A wire document type → the word the reader knows it by, in his script.
 *
 * An UNKNOWN type is humanised from its key rather than printed raw or dropped: a request for a paper
 * this table has not learned yet is still a real request, and `operating_license` shouted at the
 * renter is a database column rather than a document.
 */
export function requestDocLabel(docType: string, L: LFn): string {
  const key = docType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const known = DOC_TYPE_LABELS[key];
  if (known) return L(known[0], known[1]);
  const words = key.replace(/_+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : docType;
}

/* ═════════ V12a · the supplier's ANSWER, in the card of the ask it answers (owner, 2026-08-11) ═════
 *
 * **SUPERSEDED the same evening by V12c below — `replyCardView` is withdrawn.** The reasoning is kept
 * because half of it still runs the fallback (a reply whose ask is not in the window), and because the
 * ruling it implemented is the reason the ANSWER is worded the way it is; only the second card is gone.
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
  /**
   * **What actually landed** — the reply's own `deliveredTypes` (owner ruling, 2026-08-11, §8).
   *
   * Read only by `partial`. Null/absent is a real case — an older client names nothing — and the
   * wording falls back to saying that something else was sent without naming it.
   */
  deliveredTypes?: readonly string[] | null;
  /**
   * **What was asked for** — the ask's own `docTypes`, so what is STILL missing can be derived
   * (`stillMissingDocTypes`) rather than read off a wire field that would go stale.
   *
   * Null on the bare fallback form, where the ask is not in the loaded window at all: the line then
   * says something else arrived and says nothing about which paper is still owed, because naming one
   * would be a guess about a question nobody read.
   */
  askedTypes?: readonly string[] | null;
  /**
   * A wire document type → the renter's word for it. Handed in rather than reached for, so this
   * module keeps its "takes its words through an `L`" rule and a surface with its own naming (the
   * dock's `docLabel`) cannot end up disagreeing with the chips right above the line.
   */
  docLabel?: (docType: string) => string;
}

/**
 * A list of paper names → one readable run, in the reader's script.
 *
 * Prose, not chips: this sentence is read as a sentence — *"sent Insurance and the customs card"* —
 * and a `·`-joined run there reads as a stray list dropped into the middle of it. Arabic joins with
 * a prefixed «و» on the last item, which is how the language conjoins rather than by borrowing the
 * English comma-and.
 */
function namedList(items: readonly string[], L: LFn): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  const head = items.slice(0, -1);
  const last = items[items.length - 1];
  return L(`${head.join(", ")} and ${last}`, `${head.join("، ")} و${last}`);
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
  const tone: RequestCardTone =
    resolution === "provided" ? "answered" : resolution === "partial" ? "partial" : "refused";

  /* ═══ `partial` — "sent Insurance — the TÜV certificate is still not on file" ═════════════════════
     Owner ruling, 2026-08-11, §8:

       *"Sending something other than what was asked is still an answer. He can upload a missing
       document the renter didn't ask for. The renter is told exactly that: sent Insurance — the TUV
       certificate is still not on file. Amber. Not 'provided', not 'declined'."*

     Two clauses, and the sentence is built to keep BOTH or degrade one at a time, because on real
     data either half can be unknown:

       · what LANDED comes off the reply (`deliveredTypes`), and an older client sends none;
       · what is STILL MISSING is DERIVED here from the ask's own types (`stillMissingDocTypes`),
         never read off the wire — a stored "still missing" would go on saying so after the supplier
         had filed the paper, and this whole loop re-derives on every render for exactly that reason
         (RM3-AC-18). It is also unknowable on the bare fallback form, where the ask is not in the
         loaded window at all.

     Handled before the kind switch because it is answered the same way whatever the ask's kind was:
     it is a statement about PAPERS, and the sentence names them. The non-document kinds fall through
     to their own wordings below, where "he sent a paper" would be nonsense.

     It is worded so it can NEVER read as a refusal and never as an answer — the one rule that
     outranks the rest on this card. "Sent X" is a thing he did; "still not on file" is a fact about
     the machine, stated the way `documentAskSatisfied` states it, not an accusation. */
  if (resolution === "partial") {
    const naming = subject.docLabel ?? ((t: string) => t);
    const sent = (subject.deliveredTypes ?? []).map(naming).filter((t) => t.trim() !== "");
    const missing = stillMissingDocTypes(subject.askedTypes, subject.deliveredTypes)
      .map(naming)
      .filter((t) => t.trim() !== "");

    /* The delivered papers are named BARE — *"Sent Insurance"*, the owner's own phrasing: they are a
       list of things that arrived, and an article in front of each would read as a receipt. The
       still-missing ones each take "the", because that clause is a sentence about them and the
       ruling words it that way. Arabic needs neither: every label in `DOC_TYPE_LABELS` already
       carries its own «الـ». */
    const sentClause = L(`Sent ${namedList(sent, L)}`, `أرسل ${namedList(sent, L)}`);
    // "the TÜV certificate IS still not on file" / "…ARE still not on file" — the verb agrees, so a
    // two-paper shortfall does not read as a typo. Arabic «لا تزال … غير مرفوعة» carries both.
    const missingClause = L(
      `${namedList(missing.map((m) => `the ${m}`), L)} ${missing.length > 1 ? "are" : "is"} still not on file`,
      `لا تزال ${namedList(missing, L)} غير مرفوعة`,
    );

    if (sent.length > 0 && missing.length > 0) {
      return { tone, label: `${sentClause} — ${missingClause}` };
    }
    // He named what he sent, but we cannot say what is still owed — the ask is not in this window.
    // The first clause is the news; the second degrades to the honest generality rather than naming
    // a paper nobody read.
    if (sent.length > 0) {
      return {
        tone,
        label: L(
          `${sentClause} — but not everything that was asked for`,
          `${sentClause} — لكن ليس كل ما طُلب`,
        ),
      };
    }
    // Nothing named at all: an older client, or an ask this window does not hold. Still worth
    // saying — the alternative is the silence this ruling replaced.
    if (missing.length > 0) {
      return {
        tone,
        label: L(
          `He sent something else — ${missingClause}`,
          `أرسل شيئًا آخر — ${missingClause}`,
        ),
      };
    }
    return {
      tone,
      label: L(
        "He sent something else — what was asked for is still not on file",
        "أرسل شيئًا آخر — ما طُلب لا يزال غير مرفوع",
      ),
    };
  }

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

/* ═════════ V12c · ONE card per request, carrying the answer (owner, 2026-08-11) ═══════════════════
 *
 * **This supersedes V12a above, and withdraws `replyCardView` with it.**
 *
 * V12a satisfied *"the supplier response must arrive in the same format of the sent card"* by building
 * the ask's card a SECOND time under the reply. Both cards were sided by their own author — which is
 * still the right rule for a side — so the renter's thread ended up with two cards per request on
 * OPPOSITE edges of the column, each stating the answer in different words: his own ask card (his
 * side) derived «ردّ: غير متوفّرة» *"He answered: not available"*, and the supplier's reply card (the
 * other side) said *"He answered: he has no other Crawler Excavator 30 ton available"*. One question,
 * two objects, two sentences, and the reader has to work out that they are the same event.
 *
 * The owner, on seeing it: *"why the cards each one on different side… make it one card for request
 * and show his answer, but light plumbing or something to show the answer when opening the chat"*.
 *
 * So, three rules, and this section is where the first two are decided for BOTH surfaces at once —
 * the map's `ChatDock` and `/deal-room/[id]` render the same channel and must fold it identically:
 *
 * 1. **A request and its answer, both in the loaded window → the REQUEST's card, alone.** The reply's
 *    own card is suppressed by the surface, through {@link replyFoldsIntoAsk}.
 * 2. **The surviving card carries the SPECIFIC wording**, because a generic one is what the pair made
 *    the renter read twice. `requestCardView` above words its status with `replyAnswerLine` whenever
 *    the answer is what it is reporting — see the V12c comment inside it.
 * 3. **A reply with no ask in the window still renders**, on its own, through the bare
 *    `buildChatCardView` form. It has nothing to fold into, and suppressing it would delete the answer
 *    from the conversation entirely. That fallback is V12a's own second half and is untouched.
 *
 * Nothing here decides a SIDE. The surviving card is the renter's own ask and sits on its author's
 * edge exactly as it did — from the supplier's chair the same card is his counterparty's, and it moves
 * to the other edge without a line of this module changing.
 *
 * Pure and order-independent, like everything else here: a channel read is not guaranteed to be
 * ordered, so a reply that loaded before its own ask folds into it just the same.
 */

/**
 * **The references this window can fold** — an ask AND an answer to it, both loaded.
 *
 * The one reading behind both halves of rule 1: the surface asks it once per thread, the ask card
 * finds its own answer through `ctx.reply(ref)` (the same window, indexed by `requestRepliesByRef`),
 * and the reply card asks whether it is in this set. A membership test rather than a per-reply search
 * so a long thread costs one pass, and so the two halves cannot answer differently.
 *
 * References are compared TRIMMED, the same way {@link askAnsweredBy} pairs them — one definition of
 * "these two messages are about the same request", or a card could be folded by one rule and rendered
 * by the other, and the answer would appear twice or not at all.
 */
export function answeredAskRefs(thread: readonly RequestThreadCard[]): Set<string> {
  const asked = new Set<string>();
  const replied = new Set<string>();
  for (const c of thread) {
    const ask = c.ask?.ref.trim();
    if (ask) asked.add(ask);
    const to = c.reply?.inReplyTo.trim();
    if (to) replied.add(to);
  }
  const out = new Set<string>();
  for (const ref of replied) if (asked.has(ref)) out.add(ref);
  return out;
}

/**
 * **Is this reply's own card suppressed?** — true when the ask it answers is in the window and is
 * already carrying the answer (rule 1).
 *
 * False is the FALLBACK (rule 3) and the caller must keep rendering it: an older page or a partial
 * channel read leaves an answer whose question is not on screen, and that answer is the only record of
 * what the supplier said.
 */
export function replyFoldsIntoAsk(
  answered: ReadonlySet<string>,
  reply: Pick<RenteeRequestReplyPayload, "inReplyTo">,
): boolean {
  return answered.has(reply.inReplyTo.trim());
}

/**
 * **How long the answer's arrival cue runs before the card rests.**
 *
 * The owner's *"light plumbing or something to show the answer when opening the chat"* — folding the
 * answer into a card that was already in the thread means it lands where the QUESTION is, which may be
 * far above the last message, so something has to point at it.
 *
 * Modelled on V6's landing cue (`LANDING_CUE_MS`, `bmCue`) and deliberately SHORTER: 3 × 1.6s, plus a
 * beat so the class leaves the DOM after the animation has already stopped rather than cutting it. The
 * rule that matters is the same one — **it is finite and it ends.** A ring that loops is not a cue,
 * it is decoration the renter learns to ignore, and this one sits on a card he will keep re-reading.
 */
export const ANSWER_CUE_MS = 5_000;

/**
 * **Which card the cue points at** — the reference of the LAST answered ask in load order, or null
 * when nothing in this window is answered.
 *
 * One card, never a set: two rings at once is a page announcing itself rather than an arrival. The
 * newest answer is the one the renter has not read, and on a thread whose answers he has all read it
 * is simply the last thing that happened in the conversation.
 *
 * Pure, and a stable STRING — which is what keeps the cue from re-firing. A surface keys its timer on
 * this value, so a poll that returns the same conversation returns the same reference and starts
 * nothing; only a new answer, or a fresh reading of the thread (opening the chat), changes it.
 */
export function latestAnsweredRef(thread: readonly RequestThreadCard[]): string | null {
  const answered = answeredAskRefs(thread);
  let last: string | null = null;
  for (const c of thread) {
    const to = c.reply?.inReplyTo.trim();
    if (to && answered.has(to)) last = to;
  }
  return last;
}
