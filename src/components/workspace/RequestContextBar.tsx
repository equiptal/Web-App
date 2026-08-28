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

          It rounds on both ends now: the caret that used to close its trailing edge is gone. */}
      <button
        type="button"
        onClick={() => onOpenRequest?.()}
        disabled={!onOpenRequest}
        title={group.address ?? group.locationLabel}
        className={cx(
          "control-lg flex min-w-0 max-w-[30rem] flex-col justify-center gap-1 rounded-md border border-navy bg-navy !px-3 text-start transition-colors",
          onOpenRequest ? "hover:bg-navy-mid" : "cursor-default",
        )}
      >
        {/* ── The site leads, the machine follows (owner, 2026-08-27) ────────────────────────────
            The site is the 12.5px white and the machine the 11px grey under it. The item filter one
            row down names the machine in full and says which is being read, so the bar does not have
            to carry it loudly as well. Where the work is has no such second home.

            Both lines size to their content up to 30rem — they were capped at 170px each, which cut
            «Impact Hammer (Diesel/Hydraulic)» in half and a Riyadh address before its district.
            `min-w-0` is what lets `truncate` work inside a flex row at all. */}
        <span className="flex min-w-0 items-center gap-1.5 text-meta font-semibold leading-[15px] text-white">
          <Icon name="place" size={13} className="flex-none" />
          <span className="truncate">{group.locationLabel}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-label font-semibold leading-[13px] text-white/60">
          <span className="truncate">{label}</span>
          {qty > 1 && (
            <span className="flex-none rounded-full bg-white/15 px-1.5 text-label font-semibold text-white/70">
              ×{qty}
            </span>
          )}
        </span>
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
