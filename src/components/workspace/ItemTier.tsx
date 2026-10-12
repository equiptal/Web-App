"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import type { RequestListItem } from "@/lib/contract/requests";
import { cx, POPOVER } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { Icon } from "@/components/ui";
import { CircleArt } from "@/components/workspace/CircleArt";

/** Three names, then «+n». A fourth pushes the row wider than the machine names it is naming. */
const SHOWN = 3;

/**
 * **Every machine in the submission, read the way the source filter is read** (owner, 2026-08-27).
 *
 * A multi-item RFQ fans out into one request per machine type and the workspace shows one at a time.
 * The context bar names the current one and its caret reaches the rest, but reaching them takes a
 * press: the owner wants the others *read* rather than *found*.
 *
 * ── It IS the source row (owner, 2026-08-27) ──────────────────────────────────────────────────
 * ~~Pills, on a row of their own under the rail.~~ Then a row of underlined words that merely looked
 * like the source filter. Now it shares that filter's line: the two narrow the same panel, one by
 * machine and one by where the bid came from, and a screen that asks one question in two rows is a
 * screen that has not decided the question is one.
 *
 * So this renders no chrome of its own — no background, no rule, no height. The source row owns
 * those, and this is a group inside it. The number after each name is the UNITS asked for — this row
 * is about the request, and what arrived against it is the source filter's business one group along.
 *
 * ── Pictures, and an overflow that cannot be missed (owner, 2026-10-11, multi-item decision 3, T3) ──
 * The «Items» label carries the request's combined picture (the rail's own `CircleArt`), and each
 * tab its machine's own picture before the name. No icons. ~~A grey «+1» in the same weight as the
 * names~~: it was the only way to reach the hidden machines' bids and it read as decoration. It is an
 * orange pill now, «+N more», and its list shows each hidden machine with its picture, units and bids.
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
  const bids = (n: number) => (n === 1 ? t.workspace.oneBid : t.workspace.bidsCount.replace("{n}", String(n)));

  return (
    <div {...pin("item-tier")} ref={boxRef} className="relative flex min-w-0 flex-nowrap items-center gap-4">
      {/* The label wears an icon, exactly as SOURCE does one group along (owner, 2026-08-28).
          The two groups share this row and narrow the same panel — one by machine, one by where the
          bid came from — so they must read as a matched pair. A bare word beside an iconned one made
          the source look like the row's only control. `precision_manufacturing` is the machine glyph
          this workspace already uses for an item (`RequestDetailsModal`), at the same 14px. */}
      <span className="inline-flex flex-none items-center gap-1.5 text-label font-extrabold uppercase tracking-wide text-muted">
        {/* The whole request's picture, the same component the rail and the request card draw. */}
        <span className="grid h-[22px] w-[22px] flex-none place-items-center overflow-hidden rounded-full bg-photo-ground">
          <CircleArt
            machines={items.map((it) => ({
              id: it.id,
              name: name(it) ?? "",
              url: it.item?.imageUrl ?? null,
              isPhoto: it.item?.imageIsPhoto ?? false,
              qty: it.item?.qty ?? 1,
              typeName: name(it) ?? "",
            }))}
            fallback={items.find((it) => it.item?.imageUrl)?.item?.imageUrl ?? null}
            fallbackIsPhoto={items.find((it) => it.item?.imageUrl)?.item?.imageIsPhoto ?? false}
            onBroken={() => {}}
            size={22}
          />
        </span>
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
              /* One line, never wrapping (owner, 2026-10-12): long names shrink and cut at their own
                 end, so «+N more» stays on the row. */
              "inline-flex min-w-0 max-w-[260px] items-center gap-1.5 whitespace-nowrap border-b-2 pb-0.5 text-meta font-semibold transition-colors",
              on ? "border-brand text-navy" : "border-transparent text-muted hover:text-navy-mid",
            )}
          >
            <ItemPic item={it} />
            <span className="min-w-0 truncate">{name(it)}</span>
            {/* UNITS asked for, not bids received (owner, 2026-08-28). This row is about the request:
                how many of this machine the renter wanted. What arrived against it is the panel's
                business, and the source filter beside this one already counts that. */}
            {(it.item?.qty ?? 1) > 1 && (
              <span className={cx("flex-none", on ? "text-muted" : "text-muted/70")}>×{it.item?.qty}</span>
            )}
          </button>
        );
      })}

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex flex-none items-center gap-0.5 rounded-full bg-brand py-0.5 pe-1.5 ps-2.5 text-meta font-extrabold text-white transition-colors hover:bg-brand-hover"
        >
          {t.workspace.chipMore.replace("{n}", String(rest.length))}
          <Icon name="expand_more" size={16} className={cx("transition-transform", open && "rotate-180")} />
        </button>
      )}

      {open && rest.length > 0 && (
        <div role="menu" className={cx(POPOVER, "absolute end-0 top-[calc(100%+6px)] z-50 min-w-[220px]")}>
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
              <ItemPic item={it} />
              <span className="flex-1 truncate">{name(it)}</span>
              {(it.item?.qty ?? 1) > 1 && (
                <span className="flex-none text-label text-muted">×{it.item?.qty}</span>
              )}
              <span className="flex-none text-label text-muted">{bids(it.bidCount)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A machine's own picture, round, before its name: the photo cropped to fill, a catalogue drawing
 *  contained on the photo ground (the rail's fit). Nothing when there is no picture: no icon. */
function ItemPic({ item }: { item: RequestListItem }) {
  const [broken, setBroken] = useState(false);
  const url = broken ? null : item.item?.imageUrl ?? null;
  const photo = item.item?.imageIsPhoto ?? false;
  return (
    <span className="grid h-[22px] w-[22px] flex-none place-items-center overflow-hidden rounded-full bg-photo-ground">
      {url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className={cx("h-full w-full", photo ? "object-cover" : "scale-[1.34] object-contain")}
        />
      )}
    </span>
  );
}

