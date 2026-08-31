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
 * ── It opens where there is ROOM ─────────────────────────────────────────────────────────────────
 *
 * Downward by default, upward when the viewport is short of it. A menu on the last row of a chart had
 * nothing below it to open into and was simply not there (owner, 2026-08-31). Measured from the
 * button's own rect at the moment of the press rather than guessed from the row index: the same row
 * is near the bottom or not depending on where the renter has scrolled to.
 *
 * ── Our quotation is a download ──────────────────────────────────────────────────────────────────
 *
 * It opens the PDF this product already generates for that request. It is **not** an upload slot: a
 * supplier's own quotation is a document the renter attaches to an award, and putting both behind
 * one word would mean a renter attaching a supplier's paper and later finding ours.
 */

import { useEffect, useRef, useState } from "react";
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
  /** Which way the list opens. Decided from the button's rect when it is pressed. */
  const [up, setUp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const isWorkOrder = group.kind === "work_order";
  const a = actions;
  const items: Entry[] = [];
  const push = (key: string, label: string, icon: string, run: (() => void) | undefined, danger?: boolean) => {
    if (run) items.push({ key, label, icon, run, danger });
  };

  if (!award) {
    if (!isWorkOrder) {
      push("award", m.award, "handshake", a.onAward);
      push("bids", m.reviewBids, "gavel", a.onReviewBids);
    }
  } else {
    // Papers hang on an award — there is no id to file them under until one exists.
    push("doc", m.attachDocument, "attach_file", a.onAttachDocument);
  }

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

  if (!items.length) return null;

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          const rect = trigger.current?.getBoundingClientRect();
          // Roughly what the list needs, capped. Overestimating is safe — it opens upward a little
          // early, which is never wrong; underestimating puts the last entry under the fold.
          if (rect) setUp(window.innerHeight - rect.bottom < Math.min(300, items.length * 34 + 24));
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
          className={`${POPOVER} absolute end-0 flex w-[232px] flex-col p-1 ${up ? "bottom-8" : "top-8"}`}
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
