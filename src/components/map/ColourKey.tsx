"use client";

/**
 * RMAP T15 — the colour key, hosted **inside** the bid panel and collapsed by default.
 *
 * Not floating on the map: a floating overlay positioned with `inset-inline-end` at a low z-index
 * renders *behind* the bid panel in RTL, which is exactly how the key became invisible in the one
 * state that needed it (§6.9.2, AC-131). Living in the panel's footer it cannot be occluded, it is
 * present in every state of the view, and it sits next to the counts it explains. Sitting outside the
 * list's scroll container is also what makes expanding it shrink the list rather than scroll it away
 * (AC-132).
 *
 * **Exactly one scale, and its subject is a machine** — green confirmed, red not confirmed, no
 * supplier-level aggregate and no amber (AC-167, AC-168). The scale is not written here: it comes from
 * `colourKeyModel()` in `bid-map.ts`, which is the same function the pin, the machine chip and the
 * composition bar resolve their colour through, so the key cannot describe pins that do not exist.
 */

import { useState } from "react";
import { colourKeyModel, type ColourMeaning } from "@/lib/contract/bid-map";
import { useLocale, useT } from "@/lib/i18n";

export function ColourKey() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false); // collapsed by default (AC-132)

  // Exactly one scale by contract — `scales` is a list only so a test can assert its length is 1.
  const scale = colourKeyModel().scales[0];
  const label: Record<ColourMeaning, string> = {
    confirmed: t.bidMap.keyConfirmed,
    not_confirmed: t.bidMap.keyUnconfirmed,
  };

  return (
    <div className="bm-key">
      <button type="button" className="bm-key-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="bm-key-q">{ar ? "؟" : "?"}</span>
        <span className="bm-key-lbl">{t.bidMap.keyToggle}</span>
        <span className={`bm-key-chev${open ? " open" : ""}`}>{ar ? "‹" : "›"}</span>
      </button>
      {open && (
        <div className="bm-key-body">
          <div className="bm-key-h">{t.bidMap.keyHeading}</div>
          {scale.entries.map((e) => {
            const solid = e.availability === "confirmed";
            return (
              <div key={e.meaning} className="bm-key-row">
                {/* Fill, border style and glyph all follow the entry's own colour — nothing here picks
                    a hex, so the key and the pin can never drift apart. */}
                <span className="bm-key-dot" style={{ border: `2.5px ${solid ? "solid" : "dashed"} ${e.colour}`, color: e.colour }}>
                  {solid ? "✓" : ar ? "؟" : "?"}
                </span>
                <span className="bm-key-txt">{label[e.meaning]}</span>
              </div>
            );
          })}
          {/* The load-bearing clause (§6.9.3): red is a strong signal, and without this sentence an
              unconfirmed machine reads as *rejected* — the renter discards a lessor who never declined
              anything. It must not be dropped. */}
          <div className="bm-key-clause">{t.bidMap.keyNotUnavailable}</div>
          <div className="bm-key-clause">{t.bidMap.keyCountOnly}</div>
          <div className="bm-key-clause">{t.bidMap.keyOffPlatform}</div>
        </div>
      )}
    </div>
  );
}
