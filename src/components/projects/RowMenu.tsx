"use client";

/**
 * The row menu — every action this chart has (W-T15 · spec §8.4).
 *
 * The bar itself carries no controls. Two pins is all it shows, and everything a renter can *do*
 * lives here, so the chart stays a thing you read rather than a surface covered in targets.
 *
 * ── The list is different four ways, and each difference means something ─────────────────────────
 *
 * **A request that is not awarded yet** offers *Award* and the bids. There are no marks, because
 * there is nothing to mark — nobody has said who is supplying it.
 *
 * **A work order is never awarded from here.** It is awarded on its own form, at the moment it is
 * created, because a machine you already have on site was never waiting on anyone.
 *
 * **Only marketplace rows carry the three navigation links.** A work order has no request to open,
 * no quotation, and no deal room — it went to nobody. Showing them greyed out would imply a renter
 * could have had them.
 *
 * **An unfiled row says *File in a project*, not *Move to another project*.** It was never in one,
 * and "move" asks the renter to remember a place it has never been.
 *
 * ── It is ANCHORED to its row, and flips up when the window is short ─────────────────────────────
 *
 * `absolute` inside the trigger's own `relative` box: the menu is placed by layout, so it cannot come
 * unstuck from the ⋮ it belongs to.
 *
 * ~~`position: fixed`, placed from the trigger's rect and re-placed on every scroll and resize.~~
 * Written on 2026-08-31 against a chart body that was `max-h-[64vh] overflow-y-auto` — a box that did
 * clip an absolute menu, and the reason fixed was reached for. **The owner removed that box the same
 * afternoon** (*"don't make the project scrollable, it will depend on the page scrolling"*), which
 * left the measuring with nothing to buy and two costs of its own, both of which he then hit:
 *
 *   · **The menu opened away from its row.** Fixed coordinates are a snapshot. Any layout change
 *     after the press — and opening a menu is one — leaves them pointing at where the row *was*, and
 *     nothing re-places them until the next scroll event.
 *   · **The page shook.** `setAt({…})` builds a NEW object, so every scroll event re-rendered the
 *     row whether the numbers had changed or not, with a `scroll` listener in capture mode firing on
 *     every scrollable ancestor.
 *
 * What survives is the part that was right: the FLIP. Down by default, up when the window has no room
 * below the button — measured at the moment of the press, because the same row is near the bottom or
 * not depending on where the renter has scrolled to.
 *
 * ── Our quotation is a download ──────────────────────────────────────────────────────────────────
 *
 * It opens the PDF this product already generates for that request. It is **not** an upload slot: a
 * supplier's own quotation is a document the renter attaches to an award, and putting both behind
 * one word would mean a renter attaching a supplier's paper and later finding ours.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { POPOVER } from "@/lib/ds";
import type { Award, ChartGroup } from "@/lib/contract/award";

export interface RowMenuActions {
  onAward?: () => void;
  onChangeAward?: () => void;
  onAttachDocument?: () => void;
  onMark?: (which: "mobilizedAt" | "demobilizedAt", value: string | null) => void;
  onOpenRequest?: () => void;
  onQuotation?: () => void;
  onDealRoom?: () => void;
  onReviewBids?: () => void;
  onEditWorkOrder?: () => void;
  onDeleteWorkOrder?: () => void;
  onRemoveFromProject?: () => void;
  onFileInProject?: () => void;
}

/** One number for the layer's width: the placement maths and the element must not drift apart. */
const WIDTH = 232;

interface Entry {
  key: string;
  label: string;
  icon: string;
  run: () => void;
  danger?: boolean;
}

export function RowMenu({
  group,
  award,
  /** True for a row that is filed nowhere — its action is *File in a project*. */
  unfiled,
  actions,
  today = new Date().toISOString().slice(0, 10),
}: {
  group: Pick<ChartGroup, "kind">;
  /** `null` for an item nobody has awarded yet. */
  award: Award | null;
  unfiled?: boolean;
  actions: RowMenuActions;
  today?: string;
}) {
  const t = useT();
  const m = t.projects.menu;
  const [open, setOpen] = useState(false);
  /** Which way the list opens. One boolean, decided at the press — see the note above. */
  const [up, setUp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);


  const isWorkOrder = group.kind === "work_order";
  const a = actions;
  const items: Entry[] = [];
  const push = (key: string, label: string, icon: string, run: (() => void) | undefined, danger?: boolean) => {
    if (run) items.push({ key, label, icon, run, danger });
  };

  if (!award) {
    /* Award, on EITHER kind (owner, 2026-08-31).
     *
     * ~~A work order is awarded the moment it exists, so there is nothing to award from here.~~ Only
     * when the renter filled the supplier section in. Leaving it blank is normal — they may not know
     * yet, or it is their own fleet — and it left the machine with no way to name a supplier later
     * except by reopening the whole order. The dialog this opens is the same *who supplies it*
     * section that lives in the form, so nothing new has to be learned. */
    push("award", m.award, "handshake", a.onAward);

    // Bids belong to the marketplace: a work order went out to nobody.
    if (!isWorkOrder) push("bids", m.reviewBids, "gavel", a.onReviewBids);
  }

  /* ── The papers, whether or not anybody supplies it (owner, 2026-08-31) ───────────────────────
   *
   * *"attach must alwasy also shown like mebo/demo"*.
   *
   * ~~Papers hang on an award — there is no id to file them under until one exists.~~ True of the
   * award's own papers, and false as a rule: the backend's attach endpoint has always read `-` in
   * the award slot as *file this against the SITE*, written for exactly the paper that belongs to no
   * single award. The framework agreement, the permit, the signed scope — those usually exist BEFORE
   * anyone is named, which is precisely when this entry used to be missing.
   *
   * So it sits with the marks now: three things that are facts about the machine rather than facts
   * about an award, and none of them waiting on a supplier. The dialog states where an unawarded
   * row's paper is filed, rather than implying it lands on the machine. */
  push("doc", m.attachDocument, "attach_file", a.onAttachDocument);

  /* ── The marks, whether or not anybody supplies it (owner, 2026-08-31) ────────────────────

     *"For the mark as mobilized or demobilized, I want them allowed even if no supplier is
     mentioned, so they are always visible."*

     And they are right about the case: a work order with no supplier line is the renter's OWN fleet,
     and their own excavator still arrives on a Tuesday. Hiding the mark behind an award made the one
     kind of machine that needs no supplier the one kind that could not be tracked.

     ⇄ undo: one entry sets the mark and clears it, because a mistyped date is the common case and a
     separate *undo* doubles the list to say the same thing. */
  if (a.onMark) {
    push(
      "mob",
      award?.mobilizedAt ? m.undoMobilized : m.markMobilized,
      "login",
      () => a.onMark!("mobilizedAt", award?.mobilizedAt ? null : today),
    );
    push(
      "demob",
      award?.demobilizedAt ? m.undoDemobilized : m.markDemobilized,
      "logout",
      () => a.onMark!("demobilizedAt", award?.demobilizedAt ? null : today),
    );
  }

  // Marketplace rows only — a work order went to nobody.
  if (!isWorkOrder) {
    push("open", m.openRequest, "open_in_new", a.onOpenRequest);
    push("quote", m.ourQuotation, "download", a.onQuotation);
    push("deal", m.openDealRoom, "forum", a.onDealRoom);
  } else {
    push("edit", m.editWorkOrder, "edit", a.onEditWorkOrder);
  }

  if (award) push("change", m.changeAward, "tune", a.onChangeAward);

  /* ONE last entry, and it is RED (owner, 2026-08-31).

     A work order used to carry two — *Remove from the project* and *Delete the work order* — which
     asked the renter to know that for this kind of row those are the same act. They are: the site is
     the only place a work order exists. So there is one door, it is red, and what it does is decided
     inside, where there is room to say which of the two things will happen and to offer the move
     instead. */
  push(
    "file",
    unfiled ? m.fileInProject : m.removeFromProject,
    unfiled ? "playlist_add" : "playlist_remove",
    unfiled ? a.onFileInProject : a.onRemoveFromProject,
    !unfiled,
  );

  /** Roughly what the list needs: one row is 31px, plus the 4px padding at each end. */
  const needed = items.length * 31 + 8;

  /** Down unless down does not fit and up does. Never up into a worse fit. */
  const decide = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 6;
    const downFits = r.bottom + gap + needed <= window.innerHeight - 8;
    const upFits = r.top - gap - needed >= 8;
    setUp(!downFits && upFits);
  }, [needed]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    /* No scroll or resize listener. The menu travels with its row because layout places it, and a
       listener that re-rendered the row on every scroll event is what made the page shake. */
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          decide();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={m.label}
        className="grid h-7 w-7 place-items-center rounded-sm text-muted transition hover:bg-surface2 hover:text-navy"
      >
        <Icon name="more_vert" size={16} />
      </button>

      {open && (
        <div
          role="menu"
          /* The house treatment for a popover. This app has no shadows — a floating layer is
             separated by its border and the ground behind it (see OVERLAY / POPOVER in ds.ts). */
          /* `absolute`, anchored to the trigger — see the note above on why the fixed layer went.
             Its inline-END edge lines up with the button's, so it opens back over the row it belongs
             to rather than off the side of the chart; `end-0` mirrors that in Arabic on its own. */
          style={{ width: WIDTH }}
          className={`${POPOVER} absolute end-0 z-50 flex flex-col p-1 ${up ? "bottom-9" : "top-9"}`}
        >
          {items.map((e) => (
            <button
              key={e.key}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                e.run();
              }}
              className={`flex items-center gap-2 px-3 py-1.5 text-start text-body transition hover:bg-surface2 ${
                e.danger ? "text-danger" : "text-navy"
              }`}
            >
              <Icon name={e.icon} size={14} className={`flex-none ${e.danger ? "text-danger" : "text-muted"}`} />
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
