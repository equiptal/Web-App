/**
 * **The renter's chat-only asks** (Moedatech-App release #548, alignment 1.1): «I need the quotation»
 * and the company documents ask, and the supplier's «Not available» reply to either. A port of the
 * app's `deal_room/presentation/chat/quote_request.dart`.
 *
 * They are ordinary Stream messages tagged in their extra data (`kind`), so nothing is stored on the
 * server and an older client reads them as plain text. The JS SDK spreads extra data onto the message
 * root, which is where these fields are read. The supplier answers by sending a FILE as a reply to
 * the ask (`quoted_message_id`), and that reply is the whole record that it was answered.
 *
 * ⚠️ The company ask goes against spec RM3-AC-71/72 (company papers are read-only). The app chose it
 * knowingly on 2026-10-07, and the owner ruled the web follows the app (2026-10-11).
 */

export const QUOTE_REQUEST_KIND = "quote_request";
export const COMPANY_DOCS_REQUEST_KIND = "company_docs_request";
export const ASK_DECLINED_KIND = "ask_declined";

/** The company papers, in the app's order, by their wire keys (`CompanyDocumentKey.wire`). */
export const COMPANY_DOC_KEYS = ["cr", "vat_cert", "national_address", "local_content", "saso"] as const;

const COMPANY_DOC_LABELS: Record<string, [string, string]> = {
  cr: ["Commercial registration", "السجل التجاري"],
  vat_cert: ["VAT certificate", "الشهادة الضريبية"],
  national_address: ["National address", "العنوان الوطني"],
  local_content: ["Local content", "المحتوى المحلي"],
  // «تسجيل ساسو» verbatim from the backend's own term labels, as the app has it.
  saso: ["SASO registration", "تسجيل ساسو"],
};

/** One company paper's name, or null for a key that is not one of the five. */
export function companyDocLabel(key: string, ar: boolean): string | null {
  const l = COMPANY_DOC_LABELS[key.trim().toLowerCase()];
  return l ? (ar ? l[1] : l[0]) : null;
}

/** The names of several papers, joined the way the app joins them. */
export function companyDocNames(keys: readonly string[], ar: boolean): string {
  return keys
    .map((k) => companyDocLabel(k, ar))
    .filter((x): x is string => !!x)
    .join(ar ? "، " : ", ");
}

/** The fields these rules read off a Stream message. */
export interface ChatAskMessage {
  id: string;
  text?: string;
  kind?: unknown;
  docs?: unknown;
  docKey?: unknown;
  quoted_message_id?: string | null;
  attachments?: readonly unknown[];
}

export const isQuoteRequest = (m: ChatAskMessage) => m.kind === QUOTE_REQUEST_KIND;
export const isAskDecline = (m: ChatAskMessage) => m.kind === ASK_DECLINED_KIND;
const hasAttachment = (m: ChatAskMessage) => (m.attachments?.length ?? 0) > 0;

/** The papers a company ask names, or null when the message is not one. */
export function companyDocKeysOf(m: ChatAskMessage): string[] | null {
  if (m.kind !== COMPANY_DOCS_REQUEST_KIND || !Array.isArray(m.docs)) return null;
  const keys = m.docs.map((k) => String(k));
  return keys.length > 0 ? keys : null;
}

/** The company paper ONE file answers (`docKey`), or null for an older, unnamed file. */
export function answerDocKeyOf(m: ChatAskMessage): string | null {
  return typeof m.docKey === "string" && m.docKey.trim() ? m.docKey.trim() : null;
}

/**
 * The papers of company ask `askId` already sent, one file each. Null when an older, unnamed file
 * answered it: that file covered the whole ask.
 */
export function companyDocsSent(messages: readonly ChatAskMessage[], askId: string): Set<string> | null {
  const sent = new Set<string>();
  for (const m of messages) {
    if (m.quoted_message_id !== askId || !hasAttachment(m)) continue;
    const key = answerDocKeyOf(m);
    if (key == null) return null;
    sent.add(key);
  }
  return sent;
}

/**
 * Answered = a reply to `askId` carries a FILE. A text reply does not count: the renter asked for the
 * document. A company ask is answered once every paper it named has its own file.
 */
export function chatAskAnswered(messages: readonly ChatAskMessage[], askId: string): boolean {
  const ask = messages.find((m) => m.id === askId);
  const keys = ask ? companyDocKeysOf(ask) : null;
  if (!keys) return messages.some((m) => m.quoted_message_id === askId && hasAttachment(m));
  const sent = companyDocsSent(messages, askId);
  return sent == null || keys.every((k) => sent.has(k));
}

/** Declined = the supplier replied «Not available» to `askId`. */
export function chatAskDeclined(messages: readonly ChatAskMessage[], askId: string): boolean {
  return messages.some((m) => m.quoted_message_id === askId && isAskDecline(m));
}

/**
 * The company papers the supplier has SENT in this chat, key to file url, the newest file winning.
 * A named file (`docKey`) fills its own paper; an older, unnamed one fills every paper its ask named.
 * A chat reply files nothing on the firm's profile, so the company read never sees it: without this,
 * the documents panel kept saying «no document yet» and offered the ask again (CEX-171071).
 */
export function companyDocsReceived<M extends ChatAskMessage>(
  messages: readonly M[],
  urlOf: (m: M) => string | null,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of messages) {
    const ask = chatAskFor(m, messages);
    const keys = ask ? companyDocKeysOf(ask) : null;
    if (!keys || isAskDecline(m)) continue;
    const url = urlOf(m);
    if (!url) continue;
    const key = answerDocKeyOf(m);
    for (const k of key ? [key] : keys) out.set(k, url);
  }
  return out;
}

/** A quotation ask still waiting for its file: the ask bar then shows Quotation as asked. */
export function hasOpenQuoteRequest(messages: readonly ChatAskMessage[]): boolean {
  return messages.some((m) => isQuoteRequest(m) && !chatAskAnswered(messages, m.id));
}

/** The company papers asked for and still waiting: a file reply or a decline closes an ask. */
export function openCompanyDocAsks(messages: readonly ChatAskMessage[]): Set<string> {
  const out = new Set<string>();
  for (const m of messages) {
    const keys = companyDocKeysOf(m);
    if (!keys || chatAskAnswered(messages, m.id) || chatAskDeclined(messages, m.id)) continue;
    for (const k of keys) out.add(k);
  }
  return out;
}

/**
 * The chat-only ask `message` answers: a file or a «Not available» that replies to a quotation or a
 * company ask. Null for anything else, including a plain text reply.
 */
export function chatAskFor<M extends ChatAskMessage>(message: M, messages: readonly M[]): M | null {
  const id = message.quoted_message_id;
  if (!id || !(hasAttachment(message) || isAskDecline(message))) return null;
  return messages.find((m) => m.id === id && (isQuoteRequest(m) || companyDocKeysOf(m) != null)) ?? null;
}

/**
 * What an ask bar pill shows (owner, 2026-10-12: «if ask is waiting reply then show clock, if
 * answered then green tick»). `idle` is pressable with its own icon; `waiting` is the clock;
 * `answered` the green tick.
 */
export type AskPillState = "idle" | "waiting" | "answered";

/** Quotation: never asked is idle, an open ask waits, and the last one answered is a tick. */
export function quoteAskState(messages: readonly ChatAskMessage[]): AskPillState {
  if (!messages.some(isQuoteRequest)) return "idle";
  return hasOpenQuoteRequest(messages) ? "waiting" : "answered";
}

/** Company papers: an open ask waits; asks that were all answered or declined are a tick. */
export function companyAskState(messages: readonly ChatAskMessage[]): AskPillState {
  if (!messages.some((m) => companyDocKeysOf(m) != null)) return "idle";
  return openCompanyDocAsks(messages).size > 0 ? "waiting" : "answered";
}

/**
 * Availability over the offered machines: any machine neither confirmed nor asked keeps the pill
 * pressable; otherwise one still waiting on its answer is the clock, and all confirmed is the tick.
 * ~~A tick as soon as every machine had been ASKED~~, which read as answered while he had not replied.
 */
export function availabilityAskState(units: readonly { confirmed: boolean; asked: boolean }[]): AskPillState {
  if (units.some((u) => !u.confirmed && !u.asked)) return "idle";
  return units.some((u) => !u.confirmed) ? "waiting" : "answered";
}
