"use client";

import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { useT } from "@/lib/i18n";
import { isOnMoedatech, type RenterSupplier } from "@/lib/contract/renter-suppliers";

/**
 * The finer cuts of the supplier list, behind one button — the prototype's `dlgFilters`.
 *
 * ── Why they are not pills ──────────────────────────────────────────────────────────────────────
 *
 * The prototype's own note: *"Two pills carry the everyday split. Everything finer lives behind one
 * Filters button."* A row of eight filters teaches a renter that filtering is the job; two pills and
 * a button teach him that **All** and **Registered vendors** are the two he will actually use, and
 * that the rest is there when he wants it.
 *
 * ── Each option carries its own count ───────────────────────────────────────────────────────────
 *
 * So a renter can see there is no point pressing one before he presses it. A filter that yields an
 * empty list reads as a broken screen; a filter that says «0» beforehand reads as an answer.
 */
export interface SupplierFilterState {
  /** `app` = holds a Moedatech account · `off` = does not. */
  where: "" | "app" | "off";
  /** `app` = has bid inside the app · `link` = has bid through the renter's shared form. */
  bid: "" | "app" | "link";
}

export const NO_FILTERS: SupplierFilterState = { where: "", bid: "" };

const bidInApp = (s: RenterSupplier) => (s.rollup?.bidsApp ?? 0) > 0;
const bidViaLink = (s: RenterSupplier) => (s.rollup?.bidsLink ?? 0) > 0;

/**
 * Does this row survive the filters?
 *
 * ⚠️ *On Moedatech* reads `isOnMoedatech`, **not `kind`** — the prototype used `kind` because the
 * distinction did not exist yet. A row typed in by hand whose phone matches an account carries the
 * badge, so filtering it into *Off platform* would put a supplier under a heading its own row
 * contradicts two columns to the left.
 */
export function passesFilters(s: RenterSupplier, f: SupplierFilterState): boolean {
  if (f.where === "app" && !isOnMoedatech(s)) return false;
  if (f.where === "off" && isOnMoedatech(s)) return false;
  if (f.bid === "app" && !bidInApp(s)) return false;
  if (f.bid === "link" && !bidViaLink(s)) return false;
  return true;
}

/** How many cuts are live, including the group — what the button's badge counts. */
export function activeFilterCount(f: SupplierFilterState, group: string): number {
  return (f.where ? 1 : 0) + (f.bid ? 1 : 0) + (group ? 1 : 0);
}

export function SupplierFilters({
  open,
  rows,
  value,
  onChange,
  onClearGroup,
  onClose,
}: {
  open: boolean;
  rows: RenterSupplier[];
  value: SupplierFilterState;
  onChange: (next: SupplierFilterState) => void;
  /** Clearing everything clears the group too — it is a filter, whatever menu it lives in. */
  onClearGroup: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const c = t.suppliers;

  const count = (fn: (s: RenterSupplier) => boolean) => rows.filter(fn).length;

  const Option = ({
    on,
    label,
    n,
    onPick,
  }: {
    on: boolean;
    label: string;
    n: number;
    onPick: () => void;
  }) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-meta font-semibold transition",
        on ? "border-navy bg-navy text-surface" : "border-border bg-surface text-navy-mid hover:border-brand",
      )}
    >
      {label}
      <span className={cx("font-mono tabular-nums", on ? "text-surface/75" : "text-muted")}>{n}</span>
    </button>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Icon name="tune" size={18} />}
      title={c.filtersTitle}
      subtitle={c.filtersSubtitle}
      footer={
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onChange(NO_FILTERS);
              onClearGroup();
            }}
            className={btn("ghost", "md")}
          >
            {c.clearAll}
          </button>
          <button type="button" onClick={onClose} className={cx(btn("primary", "md"), "ms-auto")}>
            {t.common.done}
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.filterWhere}</span>
          <div className="flex flex-wrap gap-2">
            {/* Pressing the live one again clears it — a filter with no way off is a trap. */}
            <Option
              on={value.where === "app"}
              label={c.onMoedatech}
              n={count(isOnMoedatech)}
              onPick={() => onChange({ ...value, where: value.where === "app" ? "" : "app" })}
            />
            <Option
              on={value.where === "off"}
              label={c.offPlatform}
              n={count((s) => !isOnMoedatech(s))}
              onPick={() => onChange({ ...value, where: value.where === "off" ? "" : "off" })}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.filterBidding}</span>
          <div className="flex flex-wrap gap-2">
            <Option
              on={value.bid === "app"}
              label={c.filterBidApp}
              n={count(bidInApp)}
              onPick={() => onChange({ ...value, bid: value.bid === "app" ? "" : "app" })}
            />
            <Option
              on={value.bid === "link"}
              label={c.filterBidLink}
              n={count(bidViaLink)}
              onPick={() => onChange({ ...value, bid: value.bid === "link" ? "" : "link" })}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
