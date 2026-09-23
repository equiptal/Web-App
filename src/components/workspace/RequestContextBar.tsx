"use client";

import { useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { groupBiddingClosed, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import { railMachines } from "@/lib/contract/workspace";
import { CircleArt, MAX_IN_CIRCLE } from "@/components/workspace/CircleArt";
import { cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * **What this page is about, in one small bar** (owner, 2026-08-27).
 *
 * It replaces the request strip, which was a full-width band carrying the request code, the bid
 * count, the date it was raised, the picked machine as a white card, a yard ribbon, three fact chips
 * and two controls. All of that already had a home — the drawer states the request, the bid cards
 * state the offers — so the band spent the top of the workspace restating them.
 *
 * Two lines: **where the work is**, and **which machine of the submission is on screen**.
 *
 * ── It is not the item switcher any more (owner, 2026-08-28) ───────────────────────────────────
 * It carried a caret that opened the submission's other machines, because at the time nothing else
 * could reach them. The item filter on the row below does that now, in the open, three names at a
 * time — so the caret was a second way to do one thing, and the quieter of the two.
 *
 * What is left is one target: pressing the bar opens the request. The machine's name stays on it
 * because the bar is what the eye goes to for "which one is this", and the filter below answers a
 * different question — "which others are there".
 *
 * The unit count is a `<span>`, not a control. It states a quantity; it does not do anything, and a
 * pill that looks pressable but is not is worse than a plain one.
 */
export function RequestContextBar({
  group,
  item,
  onOpenRequest,
}: {
  group: RequestGroup;
  /** The item on screen. Null before the first has resolved. */
  item: RequestListItem | null;
  /** Opens the request drawer. Null where the page cannot show one. */
  onOpenRequest: (() => void) | null;
}) {
  const { locale } = useLocale();
  const t = useT();
  const ar = locale === "ar";

  const label = itemLabel(item, ar);
  const qty = item?.item?.qty ?? 1;

  /* 🔴 **The bar stands for the REQUEST, not for the machine on screen** (owner, 2026-09-22:
     *"mak it also show the items name in the navy card"*, answering where the rail's montage should
     reach). ~~The active item's one picture, and its name alone.~~ A multi-item request drew one of
     its machines here while the rail circle above it drew three, so the same request had two
     portraits a row apart - and which line is being READ is the ITEMS strip's own job, which marks
     it with `aria-current`.

     ⚠️ `railMachines` is the RAIL's derivation, shared rather than repeated. Two answers to
     «which machines does this request hold» is how the bar and the tile above it come to name
     different machines, and nothing would fail when they did. */
  const machines = railMachines(group, ar);
  /* An `<img>` absorbs a 403 as «no artwork», and the taxonomy's objects are not public-read on
     staging, so a perfectly well-formed URL answers 403 and the circle would draw a broken-image
     glyph, which is strictly worse than the icon. Keyed by URL rather than a bare boolean: the bar
     re-renders for a different request and a flag would carry the last one's failure onto it. */
  const [brokenArt, setBrokenArt] = useState<string[]>([]);
  const live = machines.map((m) => (m.url && brokenArt.includes(m.url) ? { ...m, url: null } : m));
  /* The FIRST machine that has a picture, which is exactly what `railTiles` puts on the tile - so a
     request whose montage cannot be drawn (fewer than two pictures) falls back to the same single
     image in both places. */
  const lead = live.find((m) => m.url) ?? null;

  /* The machines NAMED, up to the same three the circle draws, each with its own count. Past three
     a bare «+N» rather than a sentence: the row is one line inside a 44px control and the drawer
     one press away lists every line in full. */
  const multi = machines.length > 1;
  const shownNames = live.slice(0, MAX_IN_CIRCLE);
  const restCount = live.length - shownNames.length;
  const namesLine = shownNames
    .map((m) => (m.qty > 1 ? `${m.qty} × ${m.name}` : m.name))
    .join(ar ? "\u060c " : ", ");

  return (
    <div {...pin("request-context")} className="relative flex flex-none items-stretch">
      {/* ── Navy, and 44px like everything else on this row (owner, 2026-08-27) ────────────────────
          It is the subject of the page, so it takes the app's own dark surface rather than another
          white box among white boxes. Two lines inside a 44px control: 15px and 13px of leading with
          4px between them — 32 in total, 6px clear a side. The gap was 0 and the two lines ran into
          each other, which is what made the machine's name hard to pick out (owner, 2026-08-27).

          `control-lg` is the same 44 the export button and the tabs carry — the row reads as one set
          of controls rather than three things that happen to be near each other.

          ── Saying that it opens something (owner, 2026-08-29) ────────────────────────────────────
          It was a navy block with two lines of text in it and nothing else, and a navy block is what
          this app uses for a MASTHEAD — something you read, not something you press. Nobody found the
          request behind it.

          So it now carries the two marks this app already uses for "this goes somewhere": the
          underline under the line you are meant to read, and a chevron at the trailing edge. Both,
          not one. The chevron alone sits at the far end of a 30rem bar, too far from the words to
          attach to them; the underline alone reads as emphasis. Together they say target.

          `rtl:scale-x-[-1]` on the chevron, as every other one in this app has — an arrow that means
          "onward" has to turn around when the reading does. */}
      <button
        type="button"
        onClick={() => onOpenRequest?.()}
        disabled={!onOpenRequest}
        title={group.address ?? group.locationLabel}
        className={cx(
          "group control-lg flex min-w-0 max-w-[30rem] items-center gap-2 rounded-md border border-navy bg-navy !px-3 text-start transition-colors",
          onOpenRequest ? "hover:bg-navy-mid" : "cursor-default",
        )}
      >
        {/* ── The machines, on the leading edge (owner, 2026-09-15, then 2026-09-22) ───────────────────────────────
            *"can u have the equipment image as circle on the left of this card"* — «left» being the
            LEADING edge, so it mirrors with the reading direction like everything else on this row;
            it is first in the flex row and needs no rule of its own to land there.

            ~~«The MACHINE's own picture», read straight off the active `RequestListItem.item`.~~
            It is the whole REQUEST's now; see the note beside `machines` above. It still costs no
            request and no new field - the pictures were already on every item of the group.

            32px inside a 44px control leaves 6px clear a side, which is the same air the two lines
            beside it already sit in. The ground is `surface3`, the rail's own: a picture with a
            transparent margin needs something behind it, and on navy that has to be the light tone
            or the margin swallows the machine. */}
        <span className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full border border-white/15 bg-surface3">
          {/* 🔴 **The RAIL's montage, at 32px** - the same component, so the two discs cannot drift
              apart in fit, in spread or in how many machines they admit. Every ruling behind it
              lives in `CircleArt`: the photograph takes the crop and the drawing the scale, each
              cell is masked so the pictures lose their own rectangular edges, and the row is capped
              at three.

              ⚠️ **A 32px disc holding three machines gives each ~12px**, which reads as a montage
              rather than as three machines. That is the cost of putting the request here rather
              than one of its lines, and the lever is this number - never a second cap inside
              `CircleArt`, which the rail reads too. */}
          <CircleArt
            machines={live}
            fallback={lead?.url ?? null}
            fallbackIsPhoto={lead?.isPhoto ?? false}
            onBroken={(url) => setBrokenArt((b) => (b.includes(url) ? b : [...b, url]))}
            size={32}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {/* ── The site leads, the machine follows (owner, 2026-08-27) ────────────────────────────
            The site is the 12.5px white and the machines the 11px grey under them. The ITEMS strip
            one row down says WHICH of them is being read, so the bar does not have to carry that as
            well - it names what the request asked for. Where the work is has no such second home.

            Both lines size to their content up to 30rem — they were capped at 170px each, which cut
            «Impact Hammer (Diesel/Hydraulic)» in half and a Riyadh address before its district.
            `min-w-0` is what lets `truncate` work inside a flex row at all. */}
          <span className="flex min-w-0 items-center gap-1.5 text-meta font-semibold leading-[15px] text-white">
            <Icon name="place" size={13} className="flex-none" />
            {/* The underline sits on the WORDS, not the row: a rule running under the pin as well
                would read as a divider. It is always drawn — a hover-only hint is no hint at all to
                someone who has not hovered — and firms up under the pointer. */}
            <span
              className={cx(
                "truncate",
                onOpenRequest && "underline decoration-white/40 decoration-1 underline-offset-[3px] transition-colors group-hover:decoration-white",
              )}
            >
              {group.locationLabel}
            </span>
          </span>
          <span {...pin("context-machines")} className="flex min-w-0 items-center gap-1.5 text-label font-semibold leading-[13px] text-white/60">
            <span className="truncate">{multi ? namesLine : label}</span>
            {multi && restCount > 0 && (
              /* Latin digits in both locales, product-wide since 2026-09-04. */
              <span className="tabular flex-none rounded-full bg-white/15 px-1.5 text-label font-semibold text-white/70">
                +{restCount}
              </span>
            )}
            {!multi && qty > 1 && (
              <span className="flex-none rounded-full bg-white/15 px-1.5 text-label font-semibold text-white/70">
                ×{qty}
              </span>
            )}
            {/* CLOSED, on the request being read (owner, 2026-09-17: *"if a request is cancelled add
                the closed label to it"*).

                The rail has said it under the circle since 2026-08-30 and the drawer says it in its
                title, and BETWEEN those two sits the bar naming the request the whole page is about
                - which said nothing. A renter who cancelled one and stayed on it read a live-looking
                subject over a table of bids that can no longer change.

                `groupBiddingClosed`, never a status of its own: a group is shut only when every item
                in it is, because one live sibling still takes bids. It is the same predicate the
                rail greys its circle with, so the two can never disagree. */}
            {groupBiddingClosed(group.items) && (
              <span className="flex-none rounded-full bg-white/15 px-1.5 text-label font-semibold uppercase tracking-[.04em] text-white/70">
                {t.workspace.closed}
              </span>
            )}
          </span>
        </span>
        {onOpenRequest && (
          <Icon
            name="chevron_right"
            size={18}
            className="flex-none text-white/50 transition-colors group-hover:text-white rtl:scale-x-[-1]"
          />
        )}
      </button>
    </div>
  );
}

/** What an item calls itself: the machine's own name, or the request's display id when it has none. */
function itemLabel(item: RequestListItem | null, ar: boolean): string {
  if (!item) return "—";
  if (!item.item) return item.displayId ?? "—";
  return (ar ? item.item.nameAr || item.item.name : item.item.name) ?? "—";
}
