"use client";

import { useState, type ReactNode } from "react";
import { pin } from "@/lib/uiPins";

/**
 * **One offer in the chat** — the supplier's bid that opens the room, or a counter from either side
 * (Moedatech-App release #548, alignment 1.2; the app's `offer_chat_card.dart`).
 *
 * It draws and decides nothing: which offer is the latest, what its buttons are and where they lead
 * are the dock's (`offerFooterFor`). Your own offer is SOLID in your role colour with white ink, on the
 * RIGHT in both languages; the other side's is white on the LEFT (alignment 1.12 a). Physical sides,
 * not logical: Arabic does not mirror them. The buttons sit on ONE row at one height, and a long label
 * shrinks rather than wrapping or being cut (1.12 d).
 */
export function OfferChatCard({
  mine, title, rate, currency, unitSuffix, previousRate, perUnit, time, superseded = false,
  details, detailsLabel, footer, status, exVat,
}: {
  mine: boolean;
  title: string;
  /** The rate, formatted. */
  rate: string;
  /** «SAR» / «ر.س». The web prints the currency as a word; there is no riyal glyph in this product. */
  currency: string;
  /** «/day». */
  unitSuffix: string;
  /** The rate this one replaced, struck through in red; null when there is none. */
  previousRate: string | null;
  /** «per unit» on a multi-unit offer, null on one unit. */
  perUnit: string | null;
  /** «excl. VAT», drawn as a soft grey tag beside the per-unit word: the rate is always before VAT. */
  exVat?: string;
  time: string;
  /** An older offer: faded to 60%. */
  superseded?: boolean;
  /** The breakdown «Details» opens, on the latest offer only: it is the room's CURRENT position. */
  details?: ReactNode;
  detailsLabel?: string;
  /** The buttons, or a state line in their place. */
  footer?: ReactNode[];
  /** One state line under the buttons, at the end: «Awaiting reply», «Accepted». */
  status?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div {...pin("chat-offer")} className={`oc ${mine ? "mine" : "them"}${superseded ? " old" : ""}`}>
      <div className="oc-h">
        <span className="material-icons-outlined" aria-hidden="true">local_offer</span>
        <span className="oc-ti">{title}</span>
        <span className="oc-tm">{time}</span>
      </div>
      <div className="oc-pr">
        {/* Money reads left to right in both languages. */}
        <span className="oc-money" dir="ltr">
          {previousRate && <span className="oc-was">{previousRate}</span>}
          <span className="oc-cur">{currency}</span>
          <span className="oc-rate">{rate}</span>
          <span className="oc-u">{unitSuffix}</span>
        </span>
        <span className="oc-pu">{perUnit}{exVat && <span className="vat-tag">{exVat}</span>}</span>
        {details && detailsLabel && (
          <button type="button" className="oc-det" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {detailsLabel}
            <span className="material-icons-outlined" aria-hidden="true">{open ? "keyboard_arrow_up" : "keyboard_arrow_down"}</span>
          </button>
        )}
      </div>
      {open && details && <div className="oc-dt">{details}</div>}
      {footer && footer.length > 0 && <div className="oc-acts">{footer}</div>}
      {status && <div className="oc-stat">{status}</div>}
    </div>
  );
}

/** A filled offer action: «Accept», «Download quotation». */
export function OfferPrimaryButton({ label, icon, tone = "ok", onClick, disabled }: { label: string; icon?: string; tone?: "ok" | "brand"; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`oc-btn primary ${tone}`} onClick={onClick} disabled={disabled}>
      {icon && <span className="material-icons-outlined" aria-hidden="true">{icon}</span>}
      <span className="oc-btn-t">{label}</span>
    </button>
  );
}

/** The outlined counter action, orange. */
export function OfferGhostButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="oc-btn ghost" onClick={onClick} disabled={disabled}>
      <span className="material-icons-outlined" aria-hidden="true">swap_horiz</span>
      <span className="oc-btn-t">{label}</span>
    </button>
  );
}

/** A state line in place of buttons: nothing to press, so it must not look pressable. */
export function OfferStateLine({ label, icon, positive = false }: { label: string; icon: string; positive?: boolean }) {
  return (
    <span className={`oc-sl${positive ? " pos" : ""}`}>
      <span className="material-icons-outlined" aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
