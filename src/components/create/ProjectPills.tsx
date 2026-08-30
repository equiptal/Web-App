"use client";

/**
 * The pills — what the site is filling in, and how to change any of it (W-T8 · spec §11.1, §11.2).
 *
 * Replaces the chip row once a site is picked, in the same strip inside the intake card, so nothing
 * jumps when you choose one.
 *
 * ── Every edit here is REQUEST-LOCAL ─────────────────────────────────────────────────────────────
 *
 * Change *hrs/day* to 12 and Qiddiya still says 10. The pills edit a copy the intake screen holds,
 * and the project is never written from this surface (PROJ-AC-25). Editing the site itself is a
 * separate, deliberate act on the project page, which then asks whether the change should reach
 * anything already filed under it.
 *
 * A changed pill is **marked**, and the field it covers reads `renter` rather than `project` on the
 * canvas afterwards: once someone has answered a question it stops being the site's answer.
 *
 * ── The caption is not decoration ────────────────────────────────────────────────────────────────
 *
 * A strip of filled values implies the whole request is filled. It is not: the renter still has to
 * say what the machine is. Without the line saying so, a screen that looks finished invites Continue
 * on an empty request.
 *
 * ── Conflict ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The agent already returns `detected_locations`. The comparison against the site happens **here, in
 * the browser** — string comparison, no model. The site pill turns red and offers both. Keeping what
 * was written is a valid answer: the request sits in the project with a different site, and they
 * simply disagree. That is the point of the independence rule, not a state to resolve away.
 */

import { useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { shortSite } from "@/lib/contract/project";
import { RENTAL_BASES, type RentalBasis } from "@/lib/contract/options";
import { Icon } from "@/components/ui";

/* ----------------------------- One pill ----------------------------- */

function Pill({
  label,
  value,
  changed,
  conflict,
  onClick,
  children,
}: {
  label: string;
  value: ReactNode;
  changed?: boolean;
  conflict?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const tone = conflict
    ? "border-danger bg-danger/5 text-danger"
    : changed
      ? "border-brand bg-brand-soft text-navy"
      : "border-border bg-surface text-navy";

  return (
    <span className={`relative flex items-center gap-1.5 rounded-full border px-3 py-1 text-label ${tone}`}>
      <span className="font-semibold uppercase tracking-[.03em] opacity-60">{label}</span>
      {onClick ? (
        <button type="button" onClick={onClick} className="font-semibold underline-offset-2 hover:underline">
          {value}
        </button>
      ) : (
        <span className="font-semibold">{value}</span>
      )}
      {/* The changed dot. A renter scanning the strip has to be able to see, without opening
          anything, which values are no longer their site's. */}
      {changed && !conflict && <span aria-hidden className="text-meta leading-none text-brand">●</span>}
      {children}
    </span>
  );
}

/* ----------------------------- The strip ----------------------------- */

export function ProjectPills() {
  const t = useT();
  const { state, actions } = useRfq();
  const [sheet, setSheet] = useState(false);

  const project = state.project;
  if (!project) return null;

  const { timing } = project.defaults;
  const dirty = (key: string) => state.projectDirty.includes(key);

  /**
   * The site the agent read out of the renter's own words, when it read one that is not this site's.
   *
   * Only meaningful once the agent has run — before that there is nothing to disagree with. Plain
   * case-insensitive comparison of the leading segment: the site label carries a postcode and a city
   * the renter would never type, so comparing the whole string would report a conflict on every
   * request (spec §11.2).
   */
  const spoken = state.draft?.detectedLocations?.[0] ?? null;
  const conflict =
    spoken && shortSite(spoken).toLowerCase() !== shortSite(project.location.label).toLowerCase() ? spoken : null;

  const dates =
    timing.startDate && timing.endDate
      ? `${timing.startDate} → ${timing.endDate}`
      : (timing.startDate ?? timing.endDate ?? t.projects.pills.noDates);

  return (
    <div className="flex flex-col gap-2 border-t border-border px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* The site itself, with the way out. Deselecting drops every prefill (PROJ-AC-26). */}
        <span className="flex items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-3 py-1 text-label font-semibold text-navy">
          <Icon name="place" size={13} className="flex-none text-brand" />
          {project.title}
          <button
            type="button"
            onClick={actions.clearProject}
            aria-label={t.common.close}
            className="grid h-4 w-4 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-navy"
          >
            <Icon name="close" size={11} />
          </button>
        </span>

        <Pill
          label={t.projects.pills.site}
          value={shortSite(project.location.label)}
          changed={dirty("location.label")}
          conflict={!!conflict}
        />

        <Pill label={t.projects.pills.basis} value={timing.rentalBasis ?? "—"} changed={dirty("timing.rental_basis")}>
          <select
            value={timing.rentalBasis ?? ""}
            onChange={(e) =>
              actions.patchProjectDefaults({ rentalBasis: (e.target.value || null) as RentalBasis | null }, [
                "timing.rental_basis",
              ])
            }
            aria-label={t.projects.pills.basis}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="">—</option>
            {RENTAL_BASES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Pill>

        <Pill label={t.projects.pills.dates} value={dates} />

        <Pill label={t.projects.pills.hours} value={timing.hoursPerDay ?? "—"} changed={dirty("timing.hours_per_day")}>
          <input
            type="number"
            min={1}
            max={24}
            value={timing.hoursPerDay ?? ""}
            step={1}
            onChange={(e) =>
              actions.patchProjectDefaults({ hoursPerDay: e.target.value ? Number(e.target.value) : undefined }, [
                "timing.hours_per_day",
              ])
            }
            aria-label={t.projects.pills.hours}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </Pill>

        <button
          type="button"
          onClick={() => setSheet((v) => !v)}
          className="rounded-full border border-dashed border-border px-3 py-1 text-label font-semibold text-muted transition hover:border-brand hover:text-brand"
        >
          {t.projects.pills.more}
        </button>
      </div>

      {/* The conflict. Both values stay; the renter picks, and keeping theirs is a valid answer. */}
      {conflict && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 text-meta text-navy">
          <Icon name="warning" size={14} className="flex-none text-danger" />
          <span>{t.projects.pills.conflict.replace("{spoken}", shortSite(conflict))}</span>
          <button
            type="button"
            onClick={() => actions.patchProjectSite({ label: conflict, lat: null, lng: null })}
            className="font-semibold text-danger underline underline-offset-2"
          >
            {t.projects.pills.keepMine}
          </button>
          <span className="text-muted">·</span>
          <button
            type="button"
            onClick={() => actions.patchProjectSite(project.location)}
            className="font-semibold text-navy underline underline-offset-2"
          >
            {t.projects.pills.useProject}
          </button>
        </div>
      )}

      {/* The rest of the site's values, read-only here: they are ordinary request fields on the
          canvas, which is where they are edited with their own labels and their own validation. */}
      {sheet && (
        <div className="grid gap-1.5 rounded-sm border border-border bg-surface2/50 px-3 py-2.5 text-meta text-navy sm:grid-cols-2">
          <div>
            <span className="text-muted">{t.projects.pills.paymentTerms}: </span>
            {project.defaults.paymentTerms ?? "—"}
          </div>
          <div>
            <span className="text-muted">{t.projects.pills.extendable}: </span>
            {project.defaults.timing.extendable ? t.common.yes : t.common.no}
          </div>
          <div className="sm:col-span-2 text-muted">{t.projects.pills.sheetNote}</div>
        </div>
      )}

      {/* Without this, a strip of filled values reads as a finished request. */}
      <p className="text-meta text-muted">
        <b className="font-semibold text-navy">{t.projects.pills.captionLead}</b> {t.projects.pills.caption}
      </p>
    </div>
  );
}
