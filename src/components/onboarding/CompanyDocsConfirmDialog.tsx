"use client";

import { useT, useLocale } from "@/lib/i18n";
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
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/45 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={p.confirmHeadline}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
          <Icon name="warning_amber" size={28} />
        </span>
        <p className="mt-4 text-[14px] font-bold leading-relaxed text-danger">{p.confirmHeadline}</p>
        <p className="mt-3 inline-block rounded-full bg-surface2 px-3 py-1.5 text-[12.5px] font-semibold text-muted">
          {p.confirmEstimate}
        </p>
        <div className="mt-5 border-t border-border pt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[10px] border border-border bg-surface px-4 py-3 text-[14px] font-bold text-navy-mid"
          >
            {p.confirmBack}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-[10px] border border-brand bg-brand px-4 py-3 text-[14px] font-bold text-brand-fg transition hover:brightness-[1.04]"
          >
            {p.confirmSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
