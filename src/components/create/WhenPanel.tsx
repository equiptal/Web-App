"use client";

/**
 * *When it runs* (MREQ-AC-05/10/32–37).
 *
 * The panel exists to make one number honest. A renter books 181 days and is charged for 155,
 * because Fridays are not billed — and a request that never says so produces bids the renter reads
 * as covering a period they did not buy. So the charged-day figure is not a footnote here; it is the
 * thing the panel gates on.
 *
 * Dates are optional on the web (MREQ-AC-10) even though the app requires them, so the panel has to
 * work with none. Without them the figure is withheld rather than shown as zero, and the
 * acknowledgement changes to what is actually true: suppliers will price with no fixed end.
 */

import { useState } from "react";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon, Seg2, Toggle } from "@/components/ui";
import { CanvasField, PanelDot } from "@/components/create/Provenance";
import { useProvenance } from "@/components/create/hooks";
import { computeChargedDays, OVERTIME_RATES, RENTAL_BASES, type OvertimeRate, type RentalBasis } from "@/lib/contract";
import { arabicIndicDigits } from "@/lib/contract/bid-map";

const HOURS_OPTIONS = [8, 10, 12];

export function WhenPanel({
  open,
  complete,
  onToggle,
  shakeConfirm,
}: {
  open: boolean;
  complete: boolean;
  onToggle: () => void;
  /** True while a refused move is drawing attention to the acknowledgement. */
  shakeConfirm?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { state, actions } = useRfq();
  const prov = useProvenance(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const project = state.draft?.project;
  if (!project) return null;
  const { timing, advanced } = project;
  const charged = computeChargedDays(timing);
  const num = (n: number) => (locale === "ar" ? arabicIndicDigits(n) : String(n));

  const agentTiming = prov.agentProject?.timing;
  const basisSource = prov.projectSource("timing.rental_basis", timing.rentalBasis, agentTiming?.rentalBasis);
  const hoursSource = prov.projectSource("timing.hours_per_day", timing.hoursPerDay, agentTiming?.hoursPerDay, true);
  const overtimeSource = prov.projectSource("advanced.overtime_rate", advanced.overtimeRate, prov.agentProject?.advanced?.overtimeRate, true);

  const setTiming = (patch: Parameters<typeof actions.patchTiming>[0], key: string) => {
    prov.touchRaw(key);
    actions.patchTiming(patch);
  };

  /** The one-line summary on the collapsed header. */
  const summary = [
    timing.rentalBasis ? t.options.rentalBasis[timing.rentalBasis] : null,
    timing.startDate && timing.endDate ? `${timing.startDate} → ${timing.endDate}` : null,
    `${num(timing.hoursPerDay)} ${locale === "ar" ? "ساعة/يوم" : "h/day"}`,
    charged.known ? `${num(charged.chargedDays)} ${t.create.ready.chargedDays.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const nudge =
    charged.missing === "both"
      ? t.create.whenPanel.nudgeBoth
      : charged.missing === "end"
        ? t.create.whenPanel.nudgeEnd
        : charged.missing === "start"
          ? t.create.whenPanel.nudgeStart
          : null;

  return (
    <section
      className={`mb-3.5 rounded-[14px] border transition ${complete && !open ? "border-ok/40 bg-ok/[0.06]" : "border-border bg-surface"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <PanelDot complete={complete} />
          <Icon name="calendar_month" size={16} className="flex-none text-navy" />
          <span className="flex-none text-[15px] font-extrabold text-navy">{t.create.when}</span>
          <span className="truncate text-[13px] text-muted">{summary}</span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} className="flex-none text-muted" />
      </button>

      {open && (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="grid gap-4 md:grid-cols-2">
            {/* ---- Dates. Optional here; the nudge explains what it costs to leave them out. ---- */}
            <div className="rounded-[10px] bg-surface2 p-5">
              <CanvasField label={t.create.whenPanel.dates}>
                <div className="flex items-center gap-3">
                  <label className="flex-1 rounded-[10px] border border-border bg-surface px-3.5 py-2.5">
                    <span className="mb-1 block text-[11px] font-bold tracking-wide text-muted">{t.create.whenPanel.startDate}</span>
                    {/* Each end bounds the other, so the PICKER cannot offer a backwards window
                        (owner, 2026-08-25). A typed or pasted date still can, which is what the
                        reversal message below and the `gate.datesReversed` gap are for. */}
                    <input
                      type="date"
                      max={timing.endDate ?? undefined}
                      value={timing.startDate ?? ""}
                      onChange={(e) => setTiming({ startDate: e.target.value || null }, "timing.start_date")}
                      className="w-full bg-transparent text-[15px] font-bold text-navy outline-none"
                    />
                  </label>
                  <Icon name="arrow_forward" size={16} className="flex-none text-muted rtl:rotate-180" />
                  <label className="flex-1 rounded-[10px] border border-border bg-surface px-3.5 py-2.5">
                    <span className="mb-1 block text-[11px] font-bold tracking-wide text-muted">{t.create.whenPanel.endDate}</span>
                    <input
                      type="date"
                      min={timing.startDate ?? undefined}
                      value={timing.endDate ?? ""}
                      onChange={(e) => setTiming({ endDate: e.target.value || null }, "timing.end_date")}
                      className="w-full bg-transparent text-[15px] font-bold text-navy outline-none"
                    />
                  </label>
                </div>
              </CanvasField>

              {/* MREQ-AC-10 — shown whenever EITHER end is missing. The prototype gated this on the end
                  date alone, so its own "add a start date" wording could never appear. */}
              {nudge && (
                <p className="mt-3.5 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/[0.08] px-3.5 py-2.5 text-[13px] font-semibold leading-snug text-navy">
                  <Icon name="info" size={15} className="mt-px flex-none text-warn" />
                  {nudge}
                </p>
              )}
              {/* A backwards window is an ERROR, not a nudge: it blocks the send, where a missing end
                  date only costs a better bid. Said here, beside the two fields that caused it. */}
              {charged.reversed && (
                <p className="mt-3.5 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/[0.08] px-3.5 py-2.5 text-[13px] font-semibold leading-snug text-navy">
                  <Icon name="error" size={15} className="mt-px flex-none text-danger" />
                  {t.create.whenPanel.datesReversed}
                </p>
              )}
              {charged.known && (
                <p className="mt-3.5 text-[13px] text-muted">
                  {t.create.whenPanel.duration}: <span className="font-bold text-navy">{num(charged.totalDays)}</span>
                </p>
              )}
            </div>

            {/* ---- Billing basis. ---- */}
            <div className="rounded-[10px] bg-surface2 p-5">
              <CanvasField
                label={t.create.whenPanel.billing}
                source={basisSource}
                missing={!timing.rentalBasis}
                hint={timing.rentalBasis ? fmt(t.create.whenPanel.quoteRate, { basis: t.options.rentalBasis[timing.rentalBasis].toLowerCase() }) : undefined}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Seg2<RentalBasis>
                    value={timing.rentalBasis}
                    onChange={(v) => setTiming({ rentalBasis: v }, "timing.rental_basis")}
                    options={RENTAL_BASES.map((b) => ({ value: b, label: t.options.rentalBasis[b] }))}
                  />
                  <span className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1">
                    <span className="text-[12.5px] text-muted">{t.create.whenPanel.extendable}</span>
                    <Toggle checked={timing.extendable} onChange={(v) => setTiming({ extendable: v }, "timing.extendable")} />
                  </span>
                </div>
              </CanvasField>

              {/* MREQ-AC-36/37 — in DAYS. Applies to weekly as well as monthly. */}
              {charged.tooShort && (
                <p className="mt-3.5 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/[0.08] px-3.5 py-2.5 text-[13px] font-semibold leading-snug text-navy">
                  <Icon name="warning" size={15} className="mt-px flex-none text-warn" />
                  {fmt(
                    charged.tooShort.basis === "monthly" ? t.create.whenPanel.tooShortMonthly : t.create.whenPanel.tooShortWeekly,
                    { days: num(charged.tooShort.days) },
                  )}
                </p>
              )}

              {/* ---- The charged-day disclosure and its acknowledgement. ---- */}
              {/* TWO LINES and no heading (owner, 2026-08-25). The count leads its own sentence, so
                  «DAYS YOU'LL BE CHARGED FOR» above it was the same fact twice and a third line of
                  height. The number sits at 20px beside the text rather than above it, so the
                  sentence wraps under itself and not under the figure. */}
              <div className="mt-4 border-t border-border pt-4">
                {charged.known ? (
                  <p className="flex items-baseline gap-2 text-[12.5px] leading-relaxed text-muted">
                    <span className="flex-none text-[20px] font-extrabold text-navy">{num(charged.chargedDays)}</span>
                    <span>
                      {fmt(timing.rentalBasis ? t.create.whenPanel.chargedLineBasis : t.create.whenPanel.chargedLine, {
                        total: num(charged.totalDays),
                        fridays: num(charged.fridays),
                        hours: num(timing.hoursPerDay),
                        // Only reached when a basis is set; the other string has no {basis} slot.
                        basis: timing.rentalBasis ? t.options.rentalBasis[timing.rentalBasis].toLowerCase() : "",
                      })}
                    </span>
                  </p>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-muted">
                    {charged.reversed ? t.create.whenPanel.datesReversed : t.create.whenPanel.chargedNoDates}
                  </p>
                )}
                <label
                  className={`mt-3 flex cursor-pointer items-start gap-2 text-[12.5px] leading-snug text-navy-mid ${shakeConfirm ? "shake-error" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={state.chargedDaysUnderstood}
                    onChange={(e) => actions.setChargedDaysUnderstood(e.target.checked)}
                    className="mt-0.5 flex-none"
                  />
                  {charged.known
                    ? fmt(t.create.whenPanel.confirmCharged, { charged: num(charged.chargedDays) })
                    : t.create.whenPanel.confirmChargedNoDates}
                </label>
              </div>
            </div>
          </div>

          {/* ---- Hours and overtime. ---- */}
          <div className="overflow-hidden rounded-[10px] bg-surface2">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-start"
              aria-expanded={moreOpen}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
                {t.create.whenPanel.moreDetails} <span className="font-normal normal-case tracking-normal">{t.create.whenPanel.moreDetailsHint}</span>
              </span>
              <Icon name={moreOpen ? "expand_less" : "expand_more"} size={16} className="text-muted" />
            </button>
            {moreOpen && (
              <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
                <CanvasField label={t.create.whenPanel.hours} source={hoursSource} hint={t.create.whenPanel.hoursStandard}>
                  <Seg2<string>
                    value={String(timing.hoursPerDay)}
                    onChange={(v) => setTiming({ hoursPerDay: Number(v) }, "timing.hours_per_day")}
                    options={HOURS_OPTIONS.map((h) => ({ value: String(h), label: num(h) }))}
                  />
                </CanvasField>
                <CanvasField label={t.create.whenPanel.overtime} source={overtimeSource}>
                  <Seg2<OvertimeRate>
                    value={advanced.overtimeRate}
                    onChange={(v) => {
                      prov.touchRaw("advanced.overtime_rate");
                      actions.patchAdvanced({ overtimeRate: v });
                    }}
                    options={OVERTIME_RATES.map((o) => ({ value: o, label: t.options.overtime[o] }))}
                  />
                </CanvasField>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
