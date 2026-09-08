"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { btn, cx, POPOVER } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * The size filter, beside the download on the workspace's top row (owner, 2026-09-08).
 *
 * One question: does the list include bids offering a machine LARGER than the one asked for?
 *
 * ⚠️ **A SERVER filter, not a client one.** `GET /marketplace/requests/{id}/bids` drops those bids
 * unless the call carries `sizeMatch=exact_or_larger`, so flipping this REFETCHES — nothing held on
 * this page could reveal a bid that never arrived. The same reason the app's own toggle lives on its
 * requests bloc rather than in its local filter state (`filter_sheet.dart`).
 *
 * The count is `sizeCounts.larger` off the same envelope, which is counted before the filter runs
 * and therefore holds still whichever way the switch is set: it is «how many bids offer a bigger
 * machine», not «how many are hidden right now».
 */
export function BidSizeFilter({
  showLarger,
  largerHeld,
  onChange,
}: {
  showLarger: boolean;
  /** How many bids on this item offer a larger machine, hidden or not. */
  largerHeld: number;
  onChange: (showLarger: boolean) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div {...pin("bid-size-filter")} ref={boxRef} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.workspace.filters}
        title={t.workspace.filters}
        className={btn("secondary", "md", { icon: true, className: "relative transition" })}
      >
        <Icon name="tune" size={16} />
        {/* The presence dot the app's own filter button wears: the list is narrowed, or widened,
            without the panel being open to say so. Held bids get it too — the renter is being kept
            from something and the closed panel is the only place that says how many. */}
        {(showLarger || largerHeld > 0) && (
          <span
            aria-hidden
            className={cx(
              "absolute end-1 top-1 size-2 rounded-full",
              showLarger ? "bg-navy" : "bg-brand",
            )}
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t.workspace.filters}
          className={cx(POPOVER, "absolute end-0 top-[calc(100%+6px)] w-[290px] p-3")}
        >
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={showLarger}
              onChange={(e) => onChange(e.target.checked)}
              className="mt-0.5 size-4 flex-none accent-[var(--navy)]"
            />
            <span className="min-w-0">
              <span className="block text-meta font-semibold text-navy">{t.workspace.sizeLargerToggle}</span>
              {/* What the switch is worth, in this list, right now: the number of bids it reaches.
                  Zero is said too — otherwise a renter flips it, sees nothing change, and reads the
                  control as broken rather than as answered. */}
              <span className="mt-0.5 block text-label text-muted">
                {largerHeld > 0
                  ? fmt(largerHeld === 1 ? t.workspace.sizeLargerHeldOne : t.workspace.sizeLargerHeldMany, { n: String(largerHeld) })
                  : t.workspace.sizeLargerNoneHeld}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
