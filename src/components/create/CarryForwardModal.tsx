"use client";

/**
 * What carries to the next machine (MREQ-AC-39).
 *
 * Raised when the renter moves to the next equipment item. It exists because two different things
 * happen at once and only one of them is reversible: the site and schedule are request-wide and the
 * next item simply uses them, while its other details are COPIED and can be changed. A renter who
 * assumes the first is editable sets up a second site that never takes; one who assumes the second
 * is fixed re-enters everything by hand.
 */

import { fmt, useT } from "@/lib/i18n";
import { Icon, Modal } from "@/components/ui";

export function CarryForwardModal({
  open,
  itemNumber,
  onClose,
  onContinue,
}: {
  open: boolean;
  /** 1-based number of the item being moved TO. */
  itemNumber: number;
  onClose: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={fmt(t.create.carry.title, { n: itemNumber })}>
      <div className="mb-5 flex flex-col gap-3.5">
        <p className="flex items-start gap-3 text-[13.5px] leading-relaxed text-navy-mid">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-surface2 text-navy">
            <Icon name="lock" size={15} />
          </span>
          {t.create.carry.locked}
        </p>
        <p className="flex items-start gap-3 text-[13.5px] leading-relaxed text-navy-mid">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-surface2 text-navy">
            <Icon name="content_copy" size={15} />
          </span>
          {t.create.carry.copied}
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          onClick={onClose}
          className="rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13px] font-bold text-navy-mid transition hover:bg-surface2"
        >
          {t.create.carry.editFirst}
        </button>
        <button
          onClick={onContinue}
          className="rounded-[10px] bg-brand px-4 py-2.5 text-[13px] font-bold text-brand-fg transition hover:brightness-[1.04]"
        >
          {t.create.carry.continue}
        </button>
      </div>
    </Modal>
  );
}
