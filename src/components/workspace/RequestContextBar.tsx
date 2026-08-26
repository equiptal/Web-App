"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { RequestGroup, RequestListItem } from "@/lib/contract/requests";
import { cx, POPOVER } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * **What this page is about, in one small bar** (owner, 2026-08-27).
 *
 * It replaces the request strip, which was a full-width band carrying the request code, the bid
 * count, the date it was raised, the picked machine as a white card, a yard ribbon, three fact chips
 * and two controls. All of that already had a home — the drawer states the request, the bid cards
 * state the offers — so the band spent the top of the workspace restating them.
 *
 * Two lines survive, because they are the two facts a renter loses track of while reading bids:
 * **where the work is**, and **which machine of the submission he is looking at**.
 *
 * ── It is also the item switcher, and that is not a second job ─────────────────────────────────
 * A multi-item RFQ fans out into one request per machine type and this page shows one at a time.
 * The strip carried that switch as chips beside the machine's name; here it is the caret on the bar
 * that already names the current machine, which is where a reader looks to ask "which one is this".
 * The caret appears only when there is somewhere to go.
 *
 * ── Two targets, and each says which it is ────────────────────────────────────────────────────
 * Pressing the bar opens the request — what was ASKED for on this item. Pressing the caret opens the
 * list of the submission's other items. Both are real `<button>`s with their own accessible names:
 * a compact control has to carry a role, a name and a visible focus state, and the app's own
 * `:focus-visible` outline supplies the last of those.
 *
 * The unit count is a `<span>`, not a control. It states a quantity; it does not do anything, and a
 * pill that looks pressable but is not is worse than a plain one.
 */
export function RequestContextBar({
  group,
  item,
  items,
  onPickItem,
  onOpenRequest,
}: {
  group: RequestGroup;
  /** The item on screen. Null before the first has resolved. */
  item: RequestListItem | null;
  /** Every item in the submission, this one included. */
  items: RequestListItem[];
  onPickItem: (itemId: string) => void;
  /** Opens the request drawer. Null where the page cannot show one. */
  onOpenRequest: (() => void) | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";

  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /* Escape closes it, and so does a press anywhere else. Both are set directly rather than waited
     for: a control whose correctness depends on a transition finishing is a control that stays open
     when the transition is interrupted. */
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

  const label = itemLabel(item, ar);
  const qty = item?.item?.qty ?? 1;
  const others = items.filter((it) => it.id !== item?.id);

  return (
    <div {...pin("request-context")} ref={boxRef} className="relative flex flex-none items-stretch">
      {/* ── Navy, and 34px like everything else on this row (owner, 2026-08-27) ────────────────────
          It is the subject of the page, so it takes the app's own dark surface rather than another
          white box among white boxes. Two lines inside a 44px control: 13px and 15px of leading, 28
          in total, which now clears the height with 8px a side rather than 3.

          `control-lg` is the same 44 the export button and the tabs carry — the row reads as one set
          of controls rather than three things that happen to be near each other. 34 was consistent and
          too thin with it (owner, 2026-08-27); 44 is the scale's own next step, not a new number. */}
      <button
        type="button"
        onClick={() => onOpenRequest?.()}
        disabled={!onOpenRequest}
        title={group.address ?? group.locationLabel}
        className={cx(
          "control-lg flex min-w-0 max-w-[30rem] flex-col justify-center rounded-s-md border border-navy bg-navy !px-3 text-start transition-colors",
          others.length === 0 && "rounded-e-md",
          onOpenRequest ? "hover:bg-navy-mid" : "cursor-default",
        )}
      >
        {/* ── Sized to the name, not to 170px (owner, 2026-08-27) ────────────────────────────────
            Both lines were capped at 170, which cut «Impact Hammer (Diesel/Hydraulic)» in half and
            cut a Riyadh street address well before its district. The cap is on the BUTTON now and it
            is generous: the bar takes what the name needs, up to 30rem, and only past that does
            anything truncate. The two lines no longer cap each other, so a long address does not
            shorten the machine's name.

            `min-w-0` is what makes `truncate` work at all inside a flex row — without it the span
            refuses to shrink below its content and the overflow escapes instead of ellipsing. */}
        {/* ── The site leads, the machine follows (owner, 2026-08-27) ────────────────────────────
            The order of the lines is unchanged; their WEIGHT is swapped. Where the machine used to be
            the strong line and the site the note under it, the site is now the 12.5px white and the
            machine the 11px grey.

            The item tier under the rail is why that works: the machine is named there in full, on a
            chip that also says which one is being read, so the bar does not have to carry it loudly
            as well. What the tier cannot say is where the work is. */}
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

      {/* Only where there is another machine to reach. */}
      {others.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={ar ? "معدّات أخرى في هذا الطلب" : "Other equipment in this request"}
          className={cx(
            "control-lg -ms-px grid w-9 flex-none place-items-center rounded-e-md border border-navy bg-navy !px-0 text-white/60 transition-colors",
            "hover:bg-navy-mid hover:text-white",
            open && "bg-navy-mid text-white",
          )}
        >
          <Icon name="expand_more" size={16} className={open ? "rotate-180" : undefined} />
        </button>
      )}

      {open && others.length > 0 && (
        <div role="menu" className={cx(POPOVER, "absolute start-0 top-[calc(100%+6px)] min-w-[210px]")}>
          {items.map((it) => {
            const on = it.id === item?.id;
            const n = it.item?.qty ?? 1;
            return (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                aria-current={on ? "true" : undefined}
                onClick={() => {
                  setOpen(false);
                  if (!on) onPickItem(it.id);
                }}
                className={cx(
                  "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-start text-meta font-semibold transition-colors",
                  on ? "bg-surface2 text-navy" : "text-navy-mid hover:bg-surface2 hover:text-navy",
                )}
              >
                <Icon
                  name={on ? "check" : "chevron_right"}
                  size={14}
                  className={cx("flex-none", on ? "text-brand" : "text-muted-light")}
                />
                <span className="flex-1 truncate">{itemLabel(it, ar)}</span>
                {n > 1 && <span className="flex-none text-label text-muted">×{n}</span>}
              </button>
            );
          })}
        </div>
      )}
      {/* `t` is read so the component keeps its i18n dependency as copy moves into it. */}
      <span className="sr-only">{t.workspace.title}</span>
    </div>
  );
}

/** What an item calls itself: the machine's own name, or the request's display id when it has none. */
function itemLabel(item: RequestListItem | null, ar: boolean): string {
  if (!item) return "—";
  if (!item.item) return item.displayId ?? "—";
  return (ar ? item.item.nameAr || item.item.name : item.item.name) ?? "—";
}
