"use client";

import type { ChatCardView } from "@/lib/contract/deal-rounds";

type LFn = (en: string, arr: string) => string;

/**
 * A negotiation chat card (DRCARD) — the structured `custom` payload the backend attaches to every
 * negotiation system message, rendered as itself.
 *
 * All six types used to collapse into one grey `.sysev` pill showing `message.text`: identical for a
 * rate proposal, a rate acceptance, a term accept, a counter and a term edit — and English for the two
 * rate types, inside an Arabic RTL conversation. Everything shown here is composed client-side from the
 * payload + i18n (see `buildChatCardView`), so `message.text` is never displayed on a known card.
 *
 * Purely presentational: the view-model decides every string, including whether actions appear.
 */
export function ChatCard({
  view, ar, L, busy, onAccept, onCounter, onTranslate, translating, translation,
}: {
  view: ChatCardView;
  ar: boolean;
  L: LFn;
  busy: boolean;
  onAccept: () => void;
  onCounter: () => void;
  /**
   * Translate affordance for the underlying `message.text` (AC-17). System messages used to be the ONLY
   * ones that couldn't be translated — the `system_bot` early return fired before `canTranslate` — and
   * they are the likeliest to be in the wrong language, since `proposeRate` accepts a caller-supplied
   * free-text `message` and otherwise falls back to English.
   *
   * The card's own strings are already localised from the payload, so the original text is NOT shown by
   * default; translating it surfaces it as a note. Omitted when the message has no body.
   */
  onTranslate?: () => void;
  translating?: boolean;
  /** The translated body, once fetched — rendered as a note under the card. */
  translation?: string;
}) {
  // RTL: the transition reads in the flow direction, so the glyph follows the script rather than being
  // a hardcoded `→` that would point out of the sentence in Arabic.
  const arrow = ar ? "←" : "→";
  /**
   * **Only the request loop gets the full card. Owner's ruling, 2026-08-08.**
   *
   * The renter's ask and the lessor's answer are a conversation he is *in* — they carry a question,
   * two buttons and a state he is waiting on. The negotiation vocabulary is narration of moves he
   * already made or already saw on the price bar. Giving both the same white card made the thread read
   * as a wall of equally-important boxes, and the one thing needing his attention stopped standing out.
   *
   * **This is a treatment, not a content change.** Every string still comes from the payload
   * (`buildChatCardView`), so the quiet events keep what `923b90f` fixed: Arabic in an Arabic thread
   * rather than the backend's English `message.text`, a counter that actually shows its figures, and a
   * translate control. Reverting them to `.sysev` would bring all three defects back.
   */
  const prominent = view.tone === "ask" || view.tone === "ask-reply";
  return (
    <div className={`chatcard ${prominent ? "cc-prominent" : "cc-quiet"} cc-${view.tone}`}>
      <div className="cc-head">
        <span className="material-icons-outlined">{view.icon}</span>
        <span className="cc-title">{view.title}</span>
      </div>
      {view.rows.length > 0 && (
        <div className="cc-rows">
          {view.rows.map((r, i) => (
            <div className="cc-row" key={i}>
              <span className="cc-k">{r.label}</span>
              {/* Numbers and price units stay LTR inside an RTL bubble — same treatment serials get. */}
              <span className="cc-v" {...(r.ltr ? { dir: "ltr" as const } : {})}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {view.transition && (
        <div className="cc-trans">
          <span className="cc-old">{view.transition.from}</span>
          <span className="cc-arrow" aria-hidden="true">{arrow}</span>
          <span className="cc-new">{view.transition.to}</span>
        </div>
      )}
      {view.actions ? (
        <div className="cc-acts">
          <button type="button" className="cc-btn accept" disabled={busy} onClick={onAccept}>
            <span className="material-icons-outlined">check</span>{L("Accept", "قبول")}
          </button>
          <button type="button" className="cc-btn ghost" disabled={busy} onClick={onCounter}>
            <span className="material-icons-outlined">swap_horiz</span>{L("Counter", "عرض مضاد")}
          </button>
        </div>
      ) : view.outcome ? (
        <div className={`cc-outcome cc-out-${view.outcomeTone}`}>
          {/* The view names its own glyph where the tone's default would be wrong — a request still
              waiting is neither an acceptance nor history. */}
          <span className="material-icons-outlined">{view.outcomeIcon ?? (view.outcomeTone === "accepted" ? "task_alt" : "history")}</span>
          {view.outcome}
        </div>
      ) : null}
      {translation && <div className="cc-note">{translation}</div>}
      <div className="cc-foot">
        {onTranslate && (
          <button type="button" className="cc-tr" disabled={translating} onClick={onTranslate}>
            {translating ? L("Translating…", "جارٍ الترجمة…") : translation ? L("Hide translation", "إخفاء الترجمة") : L("Translate", "ترجمة")}
          </button>
        )}
        <span className="cc-at">{view.at}</span>
      </div>
    </div>
  );
}
