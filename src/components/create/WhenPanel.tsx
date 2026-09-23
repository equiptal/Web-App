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
import { Icon, Toggle } from "@/components/ui";
import { CanvasField, CheckFromProject, ChoiceRow, PanelDot } from "@/components/create/Provenance";
import { useProvenance } from "@/components/create/hooks";
import { computeChargedDays, RENTAL_BASES, type RentalBasis } from "@/lib/contract";
// Re-add `OVERTIME_RATES, type OvertimeRate` here when the overtime picker below comes back.
import { arabicIndicDigits } from "@/lib/contract/bid-map";
import { pin } from "@/lib/uiPins";

const HOURS_OPTIONS = [8, 10, 12];

export function WhenPanel({
  open,
  complete,
  onToggle,
  shakeConfirm,
  tried,
  prefilledNote,
}: {
  open: boolean;
  complete: boolean;
  onToggle: () => void;
  /** True while a refused move is drawing attention to the acknowledgement. */
  shakeConfirm?: boolean;
  /** The renter has tried to move on — see `tried` in `Canvas`. */
  tried?: boolean;
  /** This panel opened on its own because the renter had never seen it — see `CheckFromProject`. */
  prefilledNote?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { state, actions } = useRfq();
  const prov = useProvenance(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const project = state.draft?.project;
  if (!project) return null;
  const { timing } = project; // `advanced` was read only by the hidden overtime picker below.
  const charged = computeChargedDays(timing);
  const num = (n: number) => (locale === "ar" ? arabicIndicDigits(n) : String(n));

  const agentTiming = prov.agentProject?.timing;
  const basisSource = prov.projectSource("timing.rental_basis", timing.rentalBasis, agentTiming?.rentalBasis);
  const hoursSource = prov.projectSource("timing.hours_per_day", timing.hoursPerDay, agentTiming?.hoursPerDay, true);

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
    <section {...pin("when-panel")}
      className={`mb-3.5 rounded-sm border transition ${complete && !open ? "border-ok/40 bg-ok/[0.06]" : "border-border bg-surface"}`}
    >
      <button {...pin("when-panel-head")}
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <PanelDot complete={complete} />
          <Icon name="calendar_month" size={16} className="flex-none text-navy" />
          <span className="flex-none text-subhead font-extrabold text-navy">{t.create.when}</span>
          <span className="truncate text-body text-muted">{summary}</span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} className="flex-none text-muted" />
      </button>

      {open && (
        <div {...pin("when-panel-body")} className="flex flex-col gap-4 px-5 pb-5">
          {prefilledNote && <CheckFromProject />}
          <div className="grid gap-4 md:grid-cols-2">
            {/* ---- Dates. Optional here; the nudge explains what it costs to leave them out. ---- */}
            <div className="rounded-sm bg-surface2 p-5">
              {/* Dates are OPTIONAL (MREQ-AC-10) — the mark appears only for the one date state
                  that blocks a send, a window that runs backwards. */}
              <CanvasField label={t.create.whenPanel.dates} required={!!tried && charged.reversed}>
                <div className="flex items-center gap-3">
                  <label className="flex-1 rounded-sm border border-border bg-surface px-3.5 py-2.5">
                    <span className="mb-1 block text-label font-semibold tracking-wide text-muted">{t.create.whenPanel.startDate}</span>
                    {/* Each end bounds the other, so the PICKER cannot offer a backwards window
                        (owner, 2026-08-25). A typed or pasted date still can, which is what the
                        reversal message below and the `gate.datesReversed` gap are for. */}
                    <input
                      type="date"
                      max={timing.endDate ?? undefined}
                      value={timing.startDate ?? ""}
                      onChange={(e) => setTiming({ startDate: e.target.value || null }, "timing.start_date")}
                      className="w-full bg-transparent text-subhead font-extrabold text-navy outline-none"
                    />
                  </label>
                  <Icon name="arrow_forward" size={16} className="flex-none text-muted rtl:rotate-180" />
                  <label className="flex-1 rounded-sm border border-border bg-surface px-3.5 py-2.5">
                    <span className="mb-1 block text-label font-semibold tracking-wide text-muted">{t.create.whenPanel.endDate}</span>
                    <input
                      type="date"
                      min={timing.startDate ?? undefined}
                      value={timing.endDate ?? ""}
                      onChange={(e) => setTiming({ endDate: e.target.value || null }, "timing.end_date")}
                      className="w-full bg-transparent text-subhead font-extrabold text-navy outline-none"
                    />
                  </label>
                </div>
              </CanvasField>

              {/* MREQ-AC-10 — shown whenever EITHER end is missing. The prototype gated this on the end
                  date alone, so its own "add a start date" wording could never appear. */}
              {nudge && (
                <p className="mt-3.5 flex items-start gap-2 rounded-sm border border-warn/40 bg-warn/[0.08] px-3.5 py-2.5 text-body font-semibold leading-snug text-navy">
                  <Icon name="info" size={15} className="mt-px flex-none text-warn" />
                  {nudge}
                </p>
              )}
              {/* A backwards window is an ERROR, not a nudge: it blocks the send, where a missing end
                  date only costs a better bid. Said here, beside the two fields that caused it. */}
              {charged.reversed && (
                <p className="mt-3.5 flex items-start gap-2 rounded-sm border border-danger/40 bg-danger/[0.08] px-3.5 py-2.5 text-body font-semibold leading-snug text-navy">
                  <Icon name="error" size={15} className="mt-px flex-none text-danger" />
                  {t.create.whenPanel.datesReversed}
                </p>
              )}
              {charged.known && (
                <p className="mt-3.5 text-body text-muted">
                  {t.create.whenPanel.duration}:{" "}
                  {/* «122 days», not «122» (owner, 2026-09-01). A bare figure under two dates reads
                      as anything — a price, a count of machines — and the unit is one word. */}
                  <span className="font-semibold text-navy">
                    {fmt(t.create.whenPanel.durationDays, { n: num(charged.totalDays) })}
                  </span>
                </p>
              )}
            </div>

            {/* ---- Billing basis. ---- */}
            <div className="rounded-sm bg-surface2 p-5">
              {/* The BASIS is what `gateWhen` refuses on, so its title carries the mark once the
                  renter has tried to move on. Without it, a refusal opened this panel with the
                  acknowledgement line not even rendered — it needs a basis to have anything to
                  acknowledge — and so with nothing at all marked (owner, 2026-09-02). */}
              <CanvasField
                label={t.create.whenPanel.billing}
                source={basisSource}
                missing={!timing.rentalBasis}
                required={!!tried && !timing.rentalBasis}
                star
                hint={timing.rentalBasis ? fmt(t.create.whenPanel.quoteRate, { basis: t.options.rentalBasis[timing.rentalBasis].toLowerCase() }) : undefined}
              >
                {/* ── One control for every choice on the canvas (owner, 2026-08-26) ─────────────
                     These three were a segmented pill — grey labels on a grey track, 15px — while
                     every other choice the renter makes is a bordered box that turns navy when it is
                     picked. Two shapes for one act, and the selected billing basis read as quieter
                     than the unselected fuel option next to it. ChoiceRow is what the rest use. */}
                <div className="flex flex-wrap items-center gap-2">
                  <ChoiceRow<RentalBasis>
                    columns={RENTAL_BASES.length}
                    value={timing.rentalBasis}
                    onChange={(v) => setTiming({ rentalBasis: v }, "timing.rental_basis")}
                    options={RENTAL_BASES.map((b) => ({ value: b, label: t.options.rentalBasis[b] }))}
                  />
                  <span className="flex items-center gap-2 rounded-sm border border-border bg-surface px-2.5 py-1">
                    <span className="text-meta text-muted">{t.create.whenPanel.extendable}</span>
                    <Toggle checked={timing.extendable} onChange={(v) => setTiming({ extendable: v }, "timing.extendable")} />
                  </span>
                </div>
              </CanvasField>

              {/* MREQ-AC-36/37 — in DAYS. Applies to weekly as well as monthly. */}
              {charged.tooShort && (
                <p className="mt-3.5 flex items-start gap-2 rounded-sm border border-warn/40 bg-warn/[0.08] px-3.5 py-2.5 text-body font-semibold leading-snug text-navy">
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
              {/* ── Only once there is something to acknowledge (owner, 2026-09-01) ──────────────
                  *"This note must be shown after the start–end and how you're billed are filled,
                  whether filled by agent detection or by the user."*

                  It stated «suppliers will quote against the days you use» over a blank pair of
                  dates and no basis — an acknowledgement of a figure that did not exist yet, asked
                  before the renter had answered anything. Now the dates and the basis are the
                  condition, and it appears the moment both hold, whoever filled them: the agent's
                  extraction and the renter's own typing land in the same two fields.

                  ⚠️ The condition is the BASIS, not the dates. Dates are optional on the web
                  (MREQ-AC-10) and the acknowledgement is what makes an undated request sendable —
                  its second wording is *"I understand suppliers will price without a fixed end
                  date."* Requiring dates to show it would have locked every undated request out of
                  sending, since `gateWhen` still needs the tick. The basis is required either way,
                  so gating on it means the line appears the moment the panel has been answered at
                  all, and never over an empty one.

                  With dates it names the billable figure; without them it names the consequence. */}
              {timing.rentalBasis && (
              <div className="mt-4 border-t border-border pt-4">
                {charged.known ? (
                  <p className="flex items-baseline gap-2 text-meta leading-relaxed text-muted">
                    <span className="flex-none text-display font-extrabold text-navy">{num(charged.chargedDays)}</span>
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
                  <p className="text-meta leading-relaxed text-muted">
                    {charged.reversed ? t.create.whenPanel.datesReversed : t.create.whenPanel.chargedNoDates}
                  </p>
                )}
                <label
                  className={`mt-3 flex cursor-pointer items-start gap-2 text-meta leading-snug text-navy-mid ${shakeConfirm ? "shake-error" : ""}`}
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
                  {/* ── The two stages, on the tick itself (owner, 2026-09-03) ──────────────────
                      *"Even for the acknowledgement, don't set it yourself, let the user check it,
                      and if he clicks next equipment or review and send without checking it, shake
                      it and show the red required."*

                      It has always started unticked and nothing in the app ever ticks it for him —
                      `chargedDaysUnderstood` is seeded false, is not persisted with the draft, and
                      is cleared again whenever the figure it refers to changes. What was missing is
                      that it never SAID it was owed until a refusal. Now the star stands from the
                      moment the line appears, and the word arrives with the shake. */}
                  {!state.chargedDaysUnderstood &&
                    (tried ? (
                      <span className="ms-1 flex-none font-extrabold text-danger">{t.create.requiredMark}</span>
                    ) : (
                      <span className="ms-1 flex-none font-extrabold text-danger">*</span>
                    ))}
                </label>
              </div>
              )}
            </div>
          </div>

          {/* ---- Hours and overtime. ---- */}
          <div className="overflow-hidden rounded-sm bg-surface2">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-start"
              aria-expanded={moreOpen}
            >
              <span className="text-label font-semibold uppercase tracking-[0.05em] text-muted">
                {t.create.whenPanel.moreDetails} <span className="font-normal normal-case tracking-normal">{t.create.whenPanel.moreDetailsHint}</span>
              </span>
              <Icon name={moreOpen ? "expand_less" : "expand_more"} size={16} className="text-muted" />
            </button>
            {moreOpen && (
              // One field left, so no second column. Restore `md:grid-cols-2` with the picker below.
              <div className="grid gap-4 px-4 pb-4">
                <CanvasField label={t.create.whenPanel.hours} source={hoursSource} hint={t.create.whenPanel.hoursStandard}>
                  <ChoiceRow<string>
                    columns={HOURS_OPTIONS.length}
                    value={String(timing.hoursPerDay)}
                    onChange={(v) => setTiming({ hoursPerDay: Number(v) }, "timing.hours_per_day")}
                    options={HOURS_OPTIONS.map((h) => ({ value: String(h), label: num(h) }))}
                  />
                </CanvasField>
                {/* ── OVERTIME RATE — HIDDEN (2026-09-04, following the app's own retirement of it).
                    Neither side is asked for an overtime rate any more: the app removed the renter's
                    picker and the supplier's row on 2026-08-30, `submitBid` made `overtimeRate`
                    optional, and `overtime_rate` joined the T3 keys a bid need not declare. The state
                    and the option list stay, so a request created BEFORE this still reads back and
                    re-enabling is uncommenting rather than rebuilding.

                    <CanvasField label={t.create.whenPanel.overtime} source={overtimeSource}>
                      <ChoiceRow<OvertimeRate>
                        columns={OVERTIME_RATES.length}
                        value={advanced.overtimeRate}
                        onChange={(v) => {
                          prov.touchRaw("advanced.overtime_rate");
                          actions.patchAdvanced({ overtimeRate: v });
                        }}
                        options={OVERTIME_RATES.map((o) => ({ value: o, label: t.options.overtime[o] }))}
                      />
                    </CanvasField> */}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
