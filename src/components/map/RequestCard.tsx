"use client";

/**
 * **V12 · the renter's request card** — the prototype's `rRequestCard`
 * (`prototype/05-chat-and-requests.js:92`), in both of its states.
 *
 * ONE component for the sent card and the draft, because they are one object: the prototype renders
 * the draft by passing `true` to the same function, and the renter is meant to recognise the thing he
 * confirmed when it appears in the thread. A separate "review" component would drift from it.
 *
 * Three things it does that the generic `ChatCard` cannot:
 *
 * 1. **An identity strip.** A 34px tile — the machine's photo when its file has one, else a glyph —
 *    the `model · spec` title, the serial in monospace LTR under it, and the reference at the trailing
 *    edge. All of it resolved from `equipmentId` (see `requestCardView`), never from the message text.
 * 2. **It is pressable.** The owner's stated reason for the card (2026-08-10): a supplier reading an
 *    ask must be able to press it and land on the machine he is expected to add a document to or
 *    confirm. A `scope: "company"` card names no machine and is a plain `<div>` — not a button that
 *    looks alive and does nothing.
 * 3. **A live status row** above the dashed divider, re-derived on every render (RM3-AC-18).
 *
 * Purely presentational: every string is decided by `requestCardView` or handed in as a label, so this
 * file holds no copy and no derivation.
 */

import { equipmentIcon } from "@/components/requests/EquipImg";
import type { RequestCardView } from "@/lib/contract/request-card";
/* The card's own chrome travels WITH it. These rules were `.bidmap`-scoped in `map-proto.css` until
   the owner put the same card in `/deal-room/[id]` (2026-08-11) — a surface that is not `.bidmap`,
   where the shared markup therefore painted as unstyled text. See `request-card.css`. */
import "@/components/map/request-card.css";

export interface RequestCardProps {
  view: RequestCardView;
  /** Renders the blue border, the shadow and the two buttons. */
  draft?: boolean;
  /** Called with the machine the card names. Never called for a card whose `openable` is false. */
  onOpenMachine?: (equipmentId: string) => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  /** A send is in flight — the confirm must not fire twice. */
  busy?: boolean;
  /** Draft copy, from the dock's dictionary. Absent on a sent card. */
  cancelLabel?: string;
  confirmLabel?: string;
  /** Accessible name for the press that opens the machine. */
  openLabel?: string;
  /**
   * The message's time, already formatted (`chatCardTime`). Every card in a conversation carries one
   * (AC-16), and this card is no exception now that it renders itself rather than through `ChatCard`.
   * A DRAFT has none — it is not in the conversation yet, and stamping "now" on it would be a time it
   * will not have been sent at.
   */
  at?: string | null;
}

export function RequestCard({
  view,
  draft = false,
  onOpenMachine,
  onCancel,
  onConfirm,
  busy = false,
  cancelLabel,
  confirmLabel,
  openLabel,
  at,
}: RequestCardProps) {
  /* ── The EQUIPMENT's picture, not a glyph tile (owner, 2026-08-11) ───────────────────────────────
     The card showed the same gold `precision_manufacturing` tile on every machine — a robot arm on an
     excavator — because the fallback named one glyph for the whole taxonomy. It now walks the same
     chain the rest of the feature walks (`EquipImg`, and `MapCanvas` for the pins): the unit's own
     photo when its file has one, else the icon `equipmentIcon` derives from what the machine IS.

     The name it derives from is the card's own title — `model · spec`, whose spec half is the
     subcategory the fleet row carries — so the icon is keyed to the same words the reader sees. The
     fleet payload carries no taxonomy IMAGE url (`OfferedUnitDetail` has photos and nothing else),
     which is why the chain ends at the icon here rather than at a second picture.

     `scope: "company"` is untouched: that card names a firm, not a machine, and its glyph is the
     building it has always been. */
  const strip = (
    <>
      <span
        className={`bm-rq-tile${view.scope === "company" ? " is-co" : ""}${view.photoUrl ? " has-photo" : ""}`}
        aria-hidden="true"
      >
        {view.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.photoUrl} alt="" />
        ) : (
          <span className="material-icons-outlined">
            {view.scope === "company" ? "apartment" : equipmentIcon(view.title)}
          </span>
        )}
      </span>
      <span className="bm-rq-who">
        <span className="bm-rq-t">{view.title}</span>
        {/* A serial is a Latin run inside an Arabic card: monospace and LTR, the same treatment the
            arrival bubble and the machine cards give it. */}
        {view.serial && <span className="bm-rq-serial" dir="ltr">{view.serial}</span>}
      </span>
      {/* Absent on a draft — the reference is minted by the send, and showing a placeholder would have
          the renter quote a number that is not the one the supplier will see. */}
      {view.ref && <span className="bm-rq-ref" dir="ltr">{view.ref}</span>}
    </>
  );

  return (
    <article className={`bm-rq${draft ? " is-draft" : ""}`}>
      {view.openable && view.equipmentId && onOpenMachine ? (
        <button
          type="button"
          className="bm-rq-id is-open"
          onClick={() => onOpenMachine(view.equipmentId as string)}
          title={openLabel}
          aria-label={openLabel ? `${openLabel} — ${view.title}` : view.title}
        >
          {strip}
          {/* The affordance, in the flow direction — without it the strip reads as a heading. The
              glyph is mirrored in CSS with the script, the way the composer's send arrow is. */}
          <span className="bm-rq-go material-icons-outlined" aria-hidden="true">chevron_right</span>
        </button>
      ) : (
        <div className="bm-rq-id">{strip}</div>
      )}

      <div className="bm-rq-body">
        <div className="bm-rq-kind">{view.kindLabel}</div>
        {view.docChips.length > 0 ? (
          <div className="bm-rq-chips">
            {view.docChips.map((c, i) => (
              <span className="bm-rq-chip" key={i}>{c}</span>
            ))}
          </div>
        ) : view.askText ? (
          <p className="bm-rq-ask">{view.askText}</p>
        ) : null}
        {/* The live answer — no stored status, re-read from the machine on every render. Absent
            entirely when this surface holds no fleet to read it off. */}
        {view.status && (
          <div className={`bm-rq-state is-${view.status.tone}`}>
            <span className="bm-rq-dot" aria-hidden="true" />
            <span>{view.status.label}</span>
          </div>
        )}
        {at && <div className="bm-rq-at">{at}</div>}
      </div>

      {draft && (
        <div className="bm-rq-acts">
          <button type="button" className="bm-rq-btn ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="bm-rq-btn go" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      )}
    </article>
  );
}
