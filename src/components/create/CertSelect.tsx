"use client";

/**
 * The machine's safety certificates — **more than one at a time** (owner, 2026-09-01).
 *
 * ── Why it is not the house dropdown ────────────────────────────────────────────────────────────
 *
 * `safety_certificates` has always been an ARRAY on the draft, on the wire and in the bid form, where
 * a supplier confirms each cert on its own row (`certConfKey` in `contract/link-bids.ts`). Only this
 * control disagreed: it was a single-select that wrote `[v]`, so a renter who needed TÜV *and* Aramco
 * could ask for one of them and then find out at the bids which half he had lost.
 *
 * `Dropdown` picks one value by construction. Rather than teach it a second mode for one field, this
 * is a small popover of its own: same trigger skin, same panel, checkboxes instead of rows.
 *
 * ── "No certificate" is an ANSWER, not an absence ───────────────────────────────────────────────
 *
 * MREQ-AC-55. An empty list means "nobody has said yet" and gaps the card; *No certificate* means the
 * renter looked and decided, and clears the gap. So it is a row of its own, and choosing it turns the
 * others off — the two cannot both be true.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { cx } from "@/lib/ds";
import { useT } from "@/lib/i18n";
import { SAFETY_CERTIFICATES, type SafetyCertificate } from "@/lib/contract";

export function CertSelect({
  values,
  touched,
  tone = "overlay",
  onChange,
}: {
  values: SafetyCertificate[];
  /** True once the renter has answered — an empty list then reads *No certificate*, not a placeholder. */
  touched: boolean;
  tone?: "overlay" | "brand";
  onChange: (next: SafetyCertificate[]) => void;
}) {
  const t = useT();
  const c = t.create.machineCard;
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const label = (k: SafetyCertificate) => t.options.safetyCert[k];

  /**
   * What the trigger says. The first cert plus a count, never a wrapped list: the control sits over
   * the machine photo in a 58%-wide corner, and three names would cover the machine it describes.
   */
  const summary = values.length
    ? values.length === 1
      ? label(values[0])
      : `${label(values[0])} +${values.length - 1}`
    : touched
      ? c.noCert
      : c.cert;

  const toggle = (k: SafetyCertificate) =>
    onChange(values.includes(k) ? values.filter((x) => x !== k) : [...values, k]);

  const trigger =
    tone === "overlay"
      ? "bg-[color-mix(in_srgb,var(--navy-deep)_80%,transparent)] text-white"
      : "bg-brand-press text-white";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={c.cert}
        className={cx(
          "flex w-full items-center gap-1.5 rounded-sm px-3 py-2 text-meta font-semibold",
          trigger,
          !values.length && !touched && "opacity-90",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-start">{summary}</span>
        <Icon name="expand_more" size={14} className="flex-none" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute z-30 mt-1 min-w-[190px] rounded-sm border border-border bg-surface p-1 shadow-none"
        >
          {/* Its own row, above the rule: choosing it is a different kind of answer from ticking one. */}
          <button
            type="button"
            role="option"
            aria-selected={touched && values.length === 0}
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className={cx(
              "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-start text-meta font-semibold",
              touched && values.length === 0 ? "bg-surface2 text-navy" : "text-navy-mid hover:bg-surface2",
            )}
          >
            <Icon name={touched && values.length === 0 ? "check_box" : "check_box_outline_blank"} size={15} />
            {c.noCert}
          </button>

          <div className="my-1 h-px bg-border" />

          {SAFETY_CERTIFICATES.map((k) => {
            const on = values.includes(k);
            return (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={on}
                /* Stays open: ticking two certificates should be two clicks, not two openings. */
                onClick={() => toggle(k)}
                className={cx(
                  "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-start text-meta font-semibold",
                  on ? "bg-surface2 text-navy" : "text-navy-mid hover:bg-surface2",
                )}
              >
                <Icon name={on ? "check_box" : "check_box_outline_blank"} size={15} />
                {label(k)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
