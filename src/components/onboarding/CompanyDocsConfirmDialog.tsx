"use client";

import { useT, useLocale } from "@/lib/i18n";
import { Dialog, DialogButton } from "@/components/Dialog";
import { Icon } from "@/components/ui";

/**
 * The warning and the review-time estimate, shown last — after the identity popup, before anything
 * leaves the browser. Mirrors the app's `showCompanyDocsConfirmDialog`.
 *
 * ⚠️ The 24–48h figure is carried over from the equipment flow and is flagged in the app as its own
 * open question. Confirm the real company-verification turnaround before release; it is one string in
 * `verify.pile.confirmEstimate` (and `sentBody`).
 */
export function CompanyDocsConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const p = t.verify.pile;
  const { locale } = useLocale();

  if (!open) return null;

  return (
    <Dialog open onClose={onCancel} size="sm">
      <div
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="text-center"
      >
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
          <Icon name="warning_amber" size={28} />
        </span>
        <p className="mt-4 text-[14px] font-bold leading-relaxed text-danger">{p.confirmHeadline}</p>
        <p className="mt-3 inline-block rounded-full bg-surface2 px-3 py-1.5 text-[12.5px] font-semibold text-muted">
          {p.confirmEstimate}
        </p>
        {/* The two buttons come from `DialogButton` now, so they are the same height, radius and
            weight as the pair in every other dialog. */}
        <div className="mt-5 flex gap-2 border-t border-border pt-4">
          <DialogButton full onClick={onCancel}>{p.confirmBack}</DialogButton>
          <DialogButton full tone="primary" onClick={onConfirm}>{p.confirmSubmit}</DialogButton>
        </div>
      </div>
    </Dialog>
  );
}
