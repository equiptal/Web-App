/**
 * **What a system line in the deal room is about**, and therefore which glyph it wears.
 *
 * A port of the app's `dealSystemEventType`. The backend narrates every move in the room as a plain
 * sentence from `system_bot` and carries no type alongside it, so both clients read the sentence.
 * That is not ideal and is stated here rather than hidden: the keywords are matched in BOTH locales
 * because the narration arrives in whichever language the room was acted in, and an unmatched line
 * falls back to the neutral glyph rather than to nothing.
 *
 * **NO React, NO DOM, NO i18n imports.** The icon names are Material's, which both surfaces already
 * speak; the caller supplies the wording.
 *
 * ⚠ **This picks a GLYPH, never a colour.** Every system line is the same quiet grey pill on both
 * clients — an accepted deal does not get a green chip here, because the pill is narration and the
 * outcome already has louder homes (the phase pill, the price bar, the card). A green "deal
 * confirmed" in the thread competes with all three and wins none of them.
 */

import { chatCardTermLabel } from "./deal-rounds";

export type DealSystemEventKind =
  /** The room exists. Also the fallback for a line nothing else matches. */
  | "room-opened"
  | "offer-received"
  | "counter-sent"
  | "accepted"
  | "cancelled";

/** Material Symbols/Icons name per kind — the app's own choices, spelled for the web's icon font. */
export const SYSTEM_EVENT_ICON: Record<DealSystemEventKind, string> = {
  "room-opened": "meeting_room",
  "offer-received": "local_offer",
  "counter-sent": "swap_horiz",
  accepted: "check_circle",
  cancelled: "cancel",
};

/**
 * Read one narration line.
 *
 * Order matters and is the app's: a line can honestly contain more than one of these words — "the
 * renter declined the counter" holds both `counter` and `declined` — and the app resolves such a
 * line to the act that CHANGED the room, which is the later test. Reordering these silently
 * relabels real conversations, so they stay in the app's sequence.
 *
 * `isRoomOpened` is passed rather than sniffed: the app keys it off a synthetic message id
 * (`__room_opened__`) that the web does not mint, so the caller says whether this is that line.
 */
export function dealSystemEventKind(text: string | null | undefined, opts?: { isRoomOpened?: boolean }): DealSystemEventKind {
  if (opts?.isRoomOpened) return "room-opened";
  const t = (text ?? "").toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => t.includes(n));

  if (has("proposed", "اقترح")) return "offer-received";
  if (has("countered", "مضاد")) return "counter-sent";
  if (has("updated", "عدّل")) return "counter-sent";
  // The renter withdrew his acceptance — the room is back in negotiation, which is a counter-shaped
  // move rather than a cancellation.
  if (has("withdrew their acceptance", "سحب المستأجر قبوله")) return "counter-sent";
  if (has("accepted all", "قبل جميع")) return "accepted";
  if (has("deal confirmed", "تم تأكيد الصفقة")) return "accepted";
  if (has("declined", "رفض", "cancel", "closed this deal room", "أغلق غرفة التفاوض", "inactivity", "عدم النشاط")) {
    return "cancelled";
  }
  return "room-opened";
}

/** Convenience: the glyph for one line. */
export function dealSystemEventIcon(text: string | null | undefined, opts?: { isRoomOpened?: boolean }): string {
  return SYSTEM_EVENT_ICON[dealSystemEventKind(text, opts)];
}

/** The app's `localizedPriceUnit`: its own words, including the mixed casing it ships with. */
function priceUnitLabel(raw: string, L: (en: string, ar: string) => string): string {
  switch (raw.trim().toUpperCase().replace(/ /g, "_")) {
    case "PER_DAY": return L("day", "يوم");
    case "PER_WEEK": return L("Per Week", "للأسبوع");
    case "PER_MONTH": return L("Per Month", "للشهر");
    case "PER_JOB": return L("Per Job", "لكل مشروع");
    default: return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** Whether `L` speaks Arabic: these lines take `L` alone, as {@link dealSystemLine} always has. */
const isAr = (L: (en: string, ar: string) => string) => L("en", "ar") === "ar";

/** «Payment Terms» → `payment_terms`, then the term's own label (the app's `_toSnakeCase`). */
const termOf = (raw: string, L: (en: string, ar: string) => string) =>
  chatCardTermLabel(raw.trim().toLowerCase().replace(/\s+/g, "_"), [], isAr(L));

/**
 * **A narration line, in the thread's language.** A port of the app's `localizedSystemMessage`
 * (`core/utils/localized_labels.dart`), pattern for pattern and in its order: the lines the backend
 * posts with no `custom` card (`awaiting_confirmation`, `acceptance_withdrawn`, `deal_closed`,
 * «Request Summary») in the chat, and every event line in the inbox preview (alignment 1.4).
 *
 * 🔴 **«awaiting YOUR confirmation» is the supplier's sentence** (owner, 2026-10-01: *"this message
 * is for supplier wording"*). The backend posts ONE line into the channel both sides read, worded for
 * the supplier, so shown raw it tells the renter he is waiting on himself. The app rewrites it to the
 * neutral «{name} accepted all terms, awaiting confirmation», and so does this.
 *
 * Anything unmatched comes back as it arrived: a line the web has no wording for is still the
 * backend's words, never a blank.
 */
export function dealSystemLine(text: string, L: (en: string, ar: string) => string): string {
  const t = text.trim();
  if (t === "Request Summary") return L("Request Summary", "ملخص الطلب");
  if (t.startsWith("Deal confirmed!")) return L("Deal confirmed! Quotation generated", "تم تأكيد الصفقة! تم إنشاء عرض السعر");
  const rate = /^(.+?)\s+proposed a rate:\s*([\d,.]+)\s+(.+)$/.exec(t);
  if (rate) {
    const [, name, amount, unit] = rate;
    const u = priceUnitLabel(unit, L);
    return L(`${name} proposed a rate: ${amount} ${u}`, `${name} اقترح سعرًا: ${amount} ${u}`);
  }
  // The backend's Arabic line carries the raw English unit before the amount («Per Day 200»).
  const rateAr = /^(.+?)\s+اقترح[^:]*:\s*(.+?)\s+([\d,.]+)$/.exec(t);
  if (rateAr) {
    const [, name, unit, amount] = rateAr;
    const u = priceUnitLabel(unit, L);
    return L(`${name} proposed a rate: ${amount} ${u}`, `${name} اقترح سعرًا: ${amount} ${u}`);
  }
  const countered = /^(.+?)\s+countered\s+(.+)$/.exec(t);
  if (countered) {
    const term = termOf(countered[2], L);
    return L(`${countered[1]} countered ${term}`, `${countered[1]} قدّم عرضًا مضادًا على ${term}`);
  }
  const updated = /^(.+?)\s+updated\s+(.+)$/.exec(t);
  if (updated) {
    const term = termOf(updated[2], L);
    return L(`${updated[1]} updated ${term}`, `${updated[1]} عدّل بند ${term}`);
  }
  const acceptedTerm = /^(.+?)\s+accepted\s+(.+?):\s*.+$/.exec(t);
  if (acceptedTerm) {
    const term = termOf(acceptedTerm[2], L);
    return L(`${acceptedTerm[1]} accepted ${term}`, `${acceptedTerm[1]} قبل بند ${term}`);
  }
  const awaiting = /^(.+?)\s+has accepted all terms and is awaiting your confirmation\.?$/.exec(t);
  if (awaiting) {
    const name = awaiting[1];
    return L(`${name} accepted all terms, awaiting confirmation`, `${name} قبل جميع الشروط، بانتظار التأكيد`);
  }
  const acceptedAll = /^(.+?)\s+accepted all terms$/.exec(t);
  if (acceptedAll) return L(`${acceptedAll[1]} accepted all terms`, `${acceptedAll[1]} قبل جميع البنود`);
  const declined = /^(.+?)\s+declined the deal$/.exec(t);
  if (declined) return L(`${declined[1]} declined the deal`, `${declined[1]} رفض الصفقة`);
  const closed = /^(.+?)\s+has closed this deal room\.?$/.exec(t);
  if (closed) return L(`${closed[1]} closed the deal room`, `${closed[1]} أغلق غرفة التفاوض`);
  if (t === "This deal room has been closed due to inactivity.") {
    return L("This deal room was closed due to inactivity", "تم إغلاق غرفة التفاوض بسبب عدم النشاط");
  }
  if (t === "This confirmed deal has been released.") {
    return L("The confirmed deal was released. The room is open for negotiation again", "تم تحرير الصفقة المؤكدة. الغرفة مفتوحة للتفاوض من جديد");
  }
  if (t.includes("withdrew their acceptance") || t.includes("سحب المستأجر قبوله")) {
    return L("The rentee withdrew their acceptance. The deal is back in negotiation", "سحب المستأجر قبوله. عادت الصفقة إلى التفاوض");
  }
  return text;
}

/** The action words the backend puts after the caller's name, per term-event `type` (the app's
 *  `_termEventNameMarkers`): current Arabic with and without diacritics, and the older English. */
const TERM_EVENT_MARKERS: Record<string, string[]> = {
  counter: ["قدّم عرضًا مضادًا", "قدم عرضا مضادا", "countered "],
  term_accepted: ["قبل بند", "قبِل بند", "accepted "],
  term_reopened: ["أعاد فتح", "reopened"],
  term_updated: ["عدّل بند", "عدل بند", "updated "],
};

/**
 * A term event (`counter`, `term_accepted`, `term_updated`, `term_reopened`) from its `custom`
 * payload rather than its text. A port of the app's `localizedTermEventFromMeta`: the backend writes
 * these lines in fixed ARABIC, so the term is read off `termKey` and only the caller's name is cut
 * from the text. Null when the payload is not one of these, so the caller falls back to
 * {@link dealSystemLine}.
 */
export function termEventLine(text: string, custom: unknown, L: (en: string, ar: string) => string): string | null {
  if (!custom || typeof custom !== "object") return null;
  const c = custom as Record<string, unknown>;
  const type = typeof c.type === "string" ? c.type : "";
  const markers = TERM_EVENT_MARKERS[type];
  if (!markers) return null;
  const termKey = typeof c.termKey === "string" ? c.termKey : "";
  if (!termKey) return null;
  let cut = text.length;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i >= 0 && i < cut) cut = i;
  }
  if (cut === text.length) return null;
  const name = text.slice(0, cut).trim();
  if (!name) return null;
  const term = chatCardTermLabel(termKey, [], isAr(L));
  switch (type) {
    case "counter": return L(`${name} countered ${term}`, `${name} قدّم عرضًا مضادًا على ${term}`);
    case "term_accepted": return L(`${name} accepted ${term}`, `${name} قبل بند ${term}`);
    case "term_updated": return L(`${name} updated ${term}`, `${name} عدّل بند ${term}`);
    default: return L(`${term} reopened`, `تم إعادة فتح ${term}`);
  }
}
