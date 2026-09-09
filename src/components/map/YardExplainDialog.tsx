"use client";

/**
 * **What a red distance means, and the ask behind it** — the layer both the fleet card and the
 * machine detail open (owner, 2026-08-28, then 2026-09-08).
 *
 * ~~It lived inside `EquipmentList`, which owned the state and rendered the portal.~~ Withdrawn: the
 * detail panel is a TAKEOVER (`.bm-takeover` replaces the whole column, list included), so a layer
 * owned by the list could not be opened from the detail at all — and the owner's 2026-09-08 ruling is
 * that the yard card opens this *"whether from the details or from the fleet"*. The state moved up to
 * `BidMapWorkspace`, which is mounted in both cases, and the layer became this component.
 *
 * Two states, one layer:
 *  - **the explanation** — the FIRST press on an unconfirmed distance, because "not confirmed" is the
 *    one fact on the card a renter cannot get from the card. After that, a press asks straight away.
 *  - **already asked** — the question is in the room, so it shows what he asked and offers nothing to
 *    press: a second «Ask» would post a duplicate card the backend's own guard refuses.
 *
 * `position: fixed` in a portal to `<body>`: the chat is `z-index: 31` and the panel `24`, so a layer
 * rendered inside the panel paints UNDER the conversation the ask lands in.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { distanceDigits } from "@/lib/contract/bid-map";
import type { FleetMachine } from "@/lib/contract/fleet";
import { equipmentCardModel } from "@/components/map/equipment-card-model";
import type { MatchRequest } from "@/components/map/panel/machine-panel-model";
import { useLocale, useT } from "@/lib/i18n";
import { pin } from "@/lib/uiPins";

/**
 * **Has this renter had the red distance explained to him yet?**
 *
 * Per browser, and deliberately unimportant: losing it costs one extra explanation on a control that
 * explains itself, so a throw — a private window, storage blocked, a browser that refuses the
 * accessor outright — reads as "not seen" and the layer opens again. Nothing about the ask depends on
 * it, and nothing is stored but the flag.
 */
const YARD_EXPLAINED_KEY = "moeda.bidmap.yardExplained";

export function yardExplainedBefore(): boolean {
  try {
    return window.localStorage.getItem(YARD_EXPLAINED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markYardExplained(): void {
  try {
    window.localStorage.setItem(YARD_EXPLAINED_KEY, "1");
  } catch {
    // A renter who cannot store the flag reads the explanation again next time. That is the whole
    // cost, and it is smaller than any handling this could do.
  }
}

export interface YardExplainState {
  machine: FleetMachine;
  /** His question is already with the supplier — the third state, and not a tutorial. */
  asked: boolean;
}

export interface YardExplainDialogProps {
  state: YardExplainState;
  /** The request the specimen distance is read against, so the demo shows THIS machine's number. */
  request?: MatchRequest;
  onClose: () => void;
  /** «Ask the supplier» — the surface owns the composer; this only says which machine. */
  onAsk?: (machine: FleetMachine) => void;
}

export function YardExplainDialog({ state, request, onClose, onAsk }: YardExplainDialogProps) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* The specimen shows THIS machine's distance in both colours — an invented figure would be a
     screenshot of a different machine. */
  const card = equipmentCardModel(state.machine, request);
  const sampleKm = card.km != null ? distanceDigits(card.km, ar) : "—";
  const title = state.asked ? t.bidMap.eqYardAskedTitle : t.bidMap.eqYardExplainTitle;

  return createPortal(
    <div
      className="bm-eqyx-veil"
      onClick={(e) => {
        // The veil closes; the card on it does not. Without the target check every press inside the
        // dialog would bubble out here and shut it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div {...pin("yard-explain")} className="bm-eqyx" role="dialog" aria-modal="true" aria-label={title} dir={ar ? "rtl" : "ltr"}>
        <div className="bm-eqyx-head">
          <span className="bm-eqyx-t">{title}</span>
          <button
            type="button"
            // Its own class, not `.bm-eqfp-x`: that rule is scoped to `.bidmap`, and this dialog is
            // portalled out of it.
            className="bm-eqyx-x"
            aria-label={t.common.close}
            title={t.common.close}
            onClick={onClose}
          >
            <span className="material-icons-outlined">close</span>
          </button>
        </div>

        <div className="bm-eqyx-body">
          {/* ~~The machine's name and its distance, in a box at the top.~~ Removed (owner,
              2026-09-08: *"remove the model year box at top, just keep the red to green"*). The layer
              is opened FROM that machine's own card, one press earlier, and the specimen below carries
              its distance — so the box restated the two facts the renter had just pressed. */}
          {state.asked ? (
            <>
              <p className="bm-eqyx-p">{t.bidMap.eqYardAskedBody}</p>
              <div className="bm-eqyx-q">
                <span className="bm-eqyx-qh">{t.bidMap.eqYardAskedWhat}</span>
                {/* His own question, in the words the card put in the room — not a paraphrase. */}
                <span className="bm-eqyx-qt">{t.bidMap.eqAskConfirmWhy}</span>
              </div>
            </>
          ) : (
            <>
              {/* ── The colour, shown rather than described ────────────────────────────────────
                  Two specimens of the same distance, before and after he answers. The renter has the
                  red one in front of him; putting the green one beside it is what makes «turns green»
                  a thing he has seen rather than a promise in a paragraph. ONE LINE, on the owner's
                  word (2026-09-08) — the card is wide enough for both and the arrow between them. */}
              <div {...pin("yard-explain-demo")} className="bm-eqyx-demo" aria-hidden="true">
                {/* The specimens carry the mark where the CARD carries it — trailing — or the demo
                    stops being a picture of the thing the renter is looking at. */}
                <span className="bm-eqyx-spec no">
                  <span className="bm-eqyx-specn" dir="ltr">{sampleKm}</span>
                  <span className="bm-eqyx-specu">{t.bidMap.eqDistanceUnit}</span>
                  <span className="material-icons-outlined">help_outline</span>
                </span>
                <span className="bm-eqyx-arrow material-icons-outlined">arrow_forward</span>
                <span className="bm-eqyx-spec ok">
                  <span className="bm-eqyx-specn" dir="ltr">{sampleKm}</span>
                  <span className="bm-eqyx-specu">{t.bidMap.eqDistanceUnit}</span>
                  <span className="material-icons-outlined">check_circle</span>
                </span>
              </div>

              {/* TWO lines: what the red means and what to do about it, then what his answer does to
                  the colour above (owner, 2026-09-08). The third line — what the number is — went
                  with the box it repeated. */}
              <ul {...pin("yard-explain-lines")} className="bm-eqyx-lines">
                {[t.bidMap.eqYardLine1, t.bidMap.eqYardLine2].map((line) => (
                  <li key={line} className="bm-eqyx-line">
                    <span className="bm-eqyx-dot" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* The way on. Only the explanation has one: an asked machine's layer is a statement, and a
            statement with a primary button under it invites the press it exists to prevent.

            ~~«Not now» beside it.~~ Removed (owner, 2026-09-08): the head already carries an X, and a
            second dismissal on the same layer is one more thing to read past on the way to the one
            control that does anything. */}
        {!state.asked && (
          <div className="bm-eqyx-foot">
            <button
              {...pin("yard-explain-cta")}
              type="button"
              className="bm-eqyx-cta"
              disabled={!onAsk}
              onClick={() => {
                // Marked BEFORE the ask, not after: the renter has read it either way, and a failed
                // send that also reset the flag would explain the same thing twice.
                markYardExplained();
                const m = state.machine;
                onClose();
                onAsk?.(m);
              }}
            >
              {t.bidMap.eqYardExplainCta}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
