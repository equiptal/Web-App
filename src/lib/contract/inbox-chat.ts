/**
 * **The inbox row's chat line** — the preview, the time stamp and the rule that tells an EVENT from
 * speech. Ported from the app's `features/inbox/presentation/inbox_row_text.dart` and the action
 * pattern in `deal_room/presentation/chat/deal_chat_controller.dart` (owner, 2026-09-22: *"can u
 * check the inbox changes on the app and align the web with"*).
 *
 * ⚠️ **The rule is now written TWICE, in two products.** A case added here must be added to the
 * app's `inbox_row_text_test.dart`, exactly as `contact-guard.ts` says of its own fixture list. The
 * three functions below are pure and take their strings as PARAMETERS rather than reading the
 * dictionary, which is what makes them testable without rendering anything.
 */

/**
 * The row's one-line preview of the last message.
 *
 * Rules, in order, and each is the app's:
 *   · no `text` — a structured card (a counter-offer or an ask carries its payload in `extraData`,
 *     so its `text` is absent) or an event that dropped its own — reads `updateLabel`, never a blank
 *     line and never prefixed: the placeholder is a system-shaped line, and «You:» on it made an
 *     event read like quoted speech;
 *   · the reader's OWN typed message takes `youPrefix`, so a row never reads as if the counterparty
 *     said what the renter did;
 *   · whitespace runs collapse to single spaces — the row is one line with an ellipsis, and a
 *     leading newline would otherwise blank it.
 */
export function inboxPreview({
  text,
  isMine,
  youPrefix,
  updateLabel,
}: {
  text: string | null | undefined;
  isMine: boolean;
  youPrefix: string;
  updateLabel: string;
}): string {
  const trimmed = text?.trim().replace(/\s+/g, " ");
  if (!trimmed) return updateLabel;
  return isMine ? `${youPrefix}${trimmed}` : trimmed;
}

/**
 * The chat-list time stamp: the time of day for today, `yesterdayLabel` for yesterday, a short date
 * otherwise, with the year only once it differs.
 *
 * `now` is a PARAMETER and never read here, so «today» is decided once per render by the caller and
 * the rule stays testable against a frozen clock. A `when` in the future (clock skew between a phone
 * and Stream) counts as today rather than inventing a «tomorrow» no reader would believe.
 *
 * ⚠️ **Latin digits in both locales**, which is this product's own rule since 2026-09-04 and the
 * app's `toLatinDigits` at the same call. `ar-SA` formats with Arabic-Indic digits, so the locale
 * passed to `Intl` for an Arabic reader is `ar` with `numberingSystem: "latn"` — the month name and
 * the ص/م marker survive, the digits do not change script.
 */
export function inboxTimeLabel({
  when,
  now,
  ar,
  yesterdayLabel,
}: {
  when: Date;
  now: Date;
  ar: boolean;
  yesterdayLabel: string;
}): string {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((midnight(now) - midnight(when)) / 86_400_000);
  const locale = ar ? "ar-u-nu-latn" : "en-US";

  if (daysAgo <= 0) {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(when);
  }
  if (daysAgo === 1) return yesterdayLabel;
  if (when.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(when);
  }
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(when);
}

/**
 * Whether a message is one of the backend's ACTION lines rather than something a person typed.
 *
 * 🔴 **Ported VERBATIM from the app's `_actionPattern`.** The backend bakes term events into the
 * channel as fixed ARABIC text («اقترح…», «قبل…»), so without this an English renter would read
 * untranslated Arabic attributed to the counterparty. Such a line is nobody's message: it takes no
 * «You:» prefix and no tick, and the row shows the localized «Update in the deal room» instead.
 *
 * ⚠️ **One owner, in each product.** The app's copy is the regex this was read from; a new event on
 * the backend has to be added in both places, and nothing fails when only one is.
 */
const ACTION_PATTERN =
  /proposed a rate:|countered |accepted |declined the deal|has closed this deal room|closed due to inactivity|has been released|updated |withdrew their acceptance|^Request Summary$|^Deal confirmed!|اقترح|مضاد|قبل |رفض الصفقة|أغلق غرفة التفاوض|عدّل|سحب المستأجر قبوله|^ملخص الطلب$|^تم تأكيد الصفقة/i;

/** Whether `text` is a backend action line (see {@link ACTION_PATTERN}). */
export const isDealActionMessage = (text: string): boolean => ACTION_PATTERN.test(text);

/** One room's last line of conversation, as an inbox row renders it. */
export interface InboxChatSummary {
  /** The message's text, or null for a structured card or an event — the row then shows the
   *  localized «Update in the deal room» line rather than a blank. */
  text: string | null;
  /** When it was sent. */
  sentAt: Date;
  /** Whether the CURRENT user sent it. A tick is drawn only on a mine-message, which is what keeps
   *  the list scannable: a tick always means «mine». */
  isMine: boolean;
  /**
   * Whether EVERY other member of the room has read past this message.
   *
   * ⚠️ `every`, not `some`: a company-shared room has colleagues on the far side, and claiming
   * «read» while one of them has not opened it would be a lie. Stream has no per-device delivery
   * receipt, so there are exactly TWO tick states — sent and read — and no invented middle one.
   */
  readByOther: boolean;
}

/** The shape this module needs off a Stream message; deliberately narrower than the SDK's type. */
export interface SummarizableMessage {
  type?: string;
  text?: string | null;
  deletedAt?: Date | string | null;
  createdAt?: Date | string | null;
  user?: { id?: string } | null;
}

/** The shape this module needs off a Stream read state. */
export interface SummarizableRead {
  userId: string;
  lastRead: Date | string;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The newest SURVIVING message of a channel, or null when it has none.
 *
 * ⚠️ **Walks BACK from the end**, because a deleted message still arrives in channel state, so the
 * last entry can be a tombstone.
 *
 * ⚠️ **A member whose read state is absent has read NOTHING.** The check is against the MEMBER list
 * rather than against the read states that happen to exist, or an absent state would let `every`
 * claim read. No other members at all reads false — the fail-safe grey tick.
 */
export function summarizeChannelMessages({
  messages,
  reads,
  otherMemberIds,
  currentUserId,
}: {
  messages: SummarizableMessage[];
  reads: SummarizableRead[];
  otherMemberIds: Set<string>;
  currentUserId: string;
}): InboxChatSummary | null {
  const readsById = new Map<string, Date>();
  for (const r of reads) {
    if (r.userId === currentUserId) continue;
    const at = asDate(r.lastRead);
    if (at) readsById.set(r.userId, at);
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (asDate(m.deletedAt)) continue;

    const rawText = m.text?.trim() ?? "";
    const hasText = rawText.length > 0;
    const isSystem = m.type === "system" || (hasText && isDealActionMessage(rawText));
    const isMine = !isSystem && m.user?.id === currentUserId;
    const sentAt = asDate(m.createdAt) ?? new Date();

    const readByOther =
      otherMemberIds.size > 0 &&
      [...otherMemberIds].every((id) => {
        const at = readsById.get(id);
        return at != null && at.getTime() >= sentAt.getTime();
      });

    return { text: isSystem || !hasText ? null : rawText, sentAt, isMine, readByOther };
  }
  return null;
}
