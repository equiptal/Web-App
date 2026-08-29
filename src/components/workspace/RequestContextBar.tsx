"use client";

import { useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { RequestGroup, RequestListItem } from "@/lib/contract/requests";
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
  const ar = locale === "ar";

  const label = itemLabel(item, ar);
  const qty = item?.item?.qty ?? 1;

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
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {/* ── The site leads, the machine follows (owner, 2026-08-27) ────────────────────────────
            The site is the 12.5px white and the machine the 11px grey under it. The item filter one
            row down names the machine in full and says which is being read, so the bar does not have
            to carry it loudly as well. Where the work is has no such second home.

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
          <span className="flex min-w-0 items-center gap-1.5 text-label font-semibold leading-[13px] text-white/60">
            <span className="truncate">{label}</span>
            {qty > 1 && (
              <span className="flex-none rounded-full bg-white/15 px-1.5 text-label font-semibold text-white/70">
                ×{qty}
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
