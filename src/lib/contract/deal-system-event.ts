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

/**
 * **A narration line with no card, in the thread's language.** A port of the app's
 * `localizedSystemMessage` for the lines the backend posts with a `custom.type` the card parser does
 * not read (`awaiting_confirmation`, `acceptance_withdrawn`, `deal_closed`) and for «Request Summary».
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
  const awaiting = /^(.+?)\s+has accepted all terms and is awaiting your confirmation\.?$/.exec(t);
  if (awaiting) {
    const name = awaiting[1];
    return L(`${name} accepted all terms, awaiting confirmation`, `${name} قبل جميع الشروط، بانتظار التأكيد`);
  }
  if (t.includes("withdrew their acceptance") || t.includes("سحب المستأجر قبوله")) {
    return L("The rentee withdrew their acceptance. The deal is back in negotiation", "سحب المستأجر قبوله. عادت الصفقة إلى التفاوض");
  }
  return text;
}
