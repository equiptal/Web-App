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
import { btn } from "@/lib/ds";

export function CarryForwardModal({
  open,
  itemNumber,
  copied = true,
  onClose,
  onContinue,
}: {
  open: boolean;
  /** 1-based number of the item being moved TO. */
  itemNumber: number;
  /**
   * Whether the destination inherits this machine's other details.
   *
   * True moving between parsed items. False for a machine the renter adds by hand, which starts
   * blank — claiming its details already match would be a promise the form does not keep.
   */
  copied?: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={fmt(t.create.carry.title, { n: itemNumber })}>
      <div className="mb-5 flex flex-col gap-3.5">
        <p className="flex items-start gap-3 text-body leading-relaxed text-navy-mid">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-sm bg-surface2 text-navy">
            <Icon name="lock" size={15} />
          </span>
          {t.create.carry.locked}
        </p>
        {copied && (
          <p className="flex items-start gap-3 text-body leading-relaxed text-navy-mid">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-sm bg-surface2 text-navy">
              <Icon name="content_copy" size={15} />
            </span>
            {t.create.carry.copied}
          </p>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          onClick={onClose}
          className={btn("secondary", "md", { className: "transition" })}
        >
          {t.create.carry.editFirst}
        </button>
        <button
          onClick={onContinue}
          className={btn("primary", "md", { className: "transition" })}
        >
          {t.create.carry.continue}
        </button>
      </div>
    </Modal>
  );
}
