"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import type { RequestListItem } from "@/lib/contract/requests";
import { cx, POPOVER } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/** Three names, then «+n». A fourth pushes the row wider than the machine names it is naming. */
const SHOWN = 3;

/**
 * **Every machine in the submission, read the way the source filter is read** (owner, 2026-08-27).
 *
 * A multi-item RFQ fans out into one request per machine type and the workspace shows one at a time.
 * The context bar names the current one and its caret reaches the rest, but reaching them takes a
 * press: the owner wants the others *read* rather than *found*.
 *
 * ── Why it looks like the source row and not like chips ───────────────────────────────────────
 * ~~Pills.~~ The source filter directly under this one is a label and a row of underlined words, and
 * these two rows do the same kind of work — narrowing what the panel below shows. Two rows doing one
 * job in two visual languages is how a screen stops looking designed. The label names the row, the
 * chosen word carries the brand rule under it, and the number after each name is that item's bid
 * count, exactly as the source row counts what each source contributed.
 *
 * ── The chosen item is always among the three ─────────────────────────────────────────────────
 * The first three in the order the renter asked for them, except that a selection outside that slice
 * takes the third place. A row that could hide the item currently being read would be a row that
 * contradicts the panel under it.
 */
export function ItemTier({
  items,
  activeId,
  onPick,
}: {
  /** Every item in the submission, in the order it was asked for. */
  items: RequestListItem[];
  activeId: string | null;
  onPick: (itemId: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";

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

  // The first three, with the chosen one swapped into the last place when it falls outside them.
  const shown = items.slice(0, SHOWN);
  const activeIndex = items.findIndex((it) => it.id === activeId);
  if (activeIndex >= SHOWN) shown[SHOWN - 1] = items[activeIndex];
  const rest = items.filter((it) => !shown.some((sh) => sh.id === it.id));

  const name = (it: RequestListItem) =>
    it.item ? (ar ? it.item.nameAr || it.item.name : it.item.name) : it.displayId;

  return (
    <div
      {...pin("item-tier")}
      ref={boxRef}
      className="relative flex h-[38px] flex-none items-center gap-4 border-b border-border bg-surface2 px-4 sm:px-6"
    >
      <span className="flex-none text-label font-extrabold uppercase tracking-wide text-muted">
        {t.workspace.itemsInRequest}
      </span>

      {shown.map((it) => {
        const on = it.id === activeId;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onPick(it.id)}
            aria-current={on ? "true" : undefined}
            title={name(it) ?? undefined}
            className={cx(
              "max-w-[220px] truncate border-b-2 pb-0.5 text-meta font-semibold transition-colors",
              on ? "border-brand text-navy" : "border-transparent text-muted hover:text-navy-mid",
            )}
          >
            {name(it)}
            {/* The bid count, as the source row counts what each source sent. */}
            <span className={on ? "text-muted" : "text-muted/70"}> {it.bidCount}</span>
          </button>
        );
      })}

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t.workspace.chipMore.replace("{n}", String(rest.length))}
          className={cx(
            "flex-none border-b-2 pb-0.5 text-meta font-semibold transition-colors",
            open ? "border-brand text-navy" : "border-transparent text-muted hover:text-navy-mid",
          )}
        >
          +{rest.length}
        </button>
      )}

      {open && rest.length > 0 && (
        <div role="menu" className={cx(POPOVER, "absolute end-4 top-[calc(100%-2px)] z-50 min-w-[220px] sm:end-6")}>
          {rest.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(it.id);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-start text-meta font-semibold text-navy-mid transition-colors hover:bg-surface2 hover:text-navy"
            >
              <span className="flex-1 truncate">{name(it)}</span>
              <span className="flex-none text-label text-muted">{it.bidCount}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
