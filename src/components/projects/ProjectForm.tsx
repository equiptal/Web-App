"use client";

/**
 * The project form — new site, and its defaults (W-T10 · W-T11 · spec §5.1, §12).
 *
 * **One component for both.** New and Edit ask for the same seven fields in the same order; the edit
 * variant adds the propagation list and nothing else. Two components would be two places for the
 * field set to drift, and the field set is the whole discipline here.
 *
 * ── Seven fields, and the rule that keeps it seven ───────────────────────────────────────────────
 *
 * The project holds only what the create flow actually asks a renter for. A field the backend
 * receives but nobody is ever shown is a silent default, and a project setting for a question that
 * is never put is a setting for nothing. That rule is what keeps `workingDaysPerWeek`, `terrain` and
 * the overtime rate out, and it is why budget, payment method, maintenance, SLA, supplier filters
 * and the bid window stay on the REQUEST: those are decisions about one hire, and a project is a
 * fact about a place.
 *
 * ── The map leads ────────────────────────────────────────────────────────────────────────────────
 *
 * Dropping a pin is how a site is chosen; typing an address is the fallback. The picker is the one
 * `WherePanel` already uses, not a second one — a renter who has confirmed a location once in this
 * product should not meet a different map the next time.
 *
 * ── Three actions, not two ───────────────────────────────────────────────────────────────────────
 *
 * *Cancel · Project only · Save and apply to the ticked.* "Apply to what is already filed" is a
 * separate decision, not a checkbox riding on Save: it can spend a renter's one post-bid edit on a
 * request they are not looking at, so it has to be its own deliberate press.
 */

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { Icon, Button, Toggle } from "@/components/ui";
import {
  defaultProjectDefaults,
  shortSite,
  type Project,
  type ProjectDefaults,
  type SiteLocation,
  type PropagationRow,
} from "@/lib/contract/project";
import { RENTAL_BASES, PAYMENT_TERMS, type RentalBasis, type PaymentTerm } from "@/lib/contract/options";

const MapLocationPicker = dynamic(() => import("@/components/shared/GoogleMapLocationPicker"), { ssr: false });

export interface ProjectFormValue {
  title: string | null;
  location: SiteLocation;
  defaults: ProjectDefaults;
}

export function emptyProjectForm(): ProjectFormValue {
  return { title: null, location: { label: "", lat: null, lng: null }, defaults: defaultProjectDefaults() };
}

export function projectToForm(p: Pick<Project, "title" | "location" | "defaults">): ProjectFormValue {
  return {
    title: p.title,
    location: { ...p.location },
    defaults: { timing: { ...p.defaults.timing }, paymentTerms: p.defaults.paymentTerms },
  };
}

/* ----------------------------- Field chrome ----------------------------- */

/**
 * One label over one control, and the ONE definition of it.
 *
 * Exported because the work-order dialog asks its questions the same way (owner, 2026-08-31: *"make
 * it same width and layout as adding the project"*) — two dialogs that open from the same page and
 * spell a label two ways read as two products.
 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</span>
      {children}
      {hint && <span className="text-meta text-muted">{hint}</span>}
    </label>
  );
}

/** The one control skin. Exported with {@link Field} and for the same reason. */
export const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none transition focus:border-brand";

/* ----------------------------- The form ----------------------------- */

export function ProjectForm({
  value,
  onChange,
  rows,
  onDelete,
  deleteLabel,
  deletable,
  onCancel,
  onSave,
  saving,
}: {
  value: ProjectFormValue;
  onChange: (next: ProjectFormValue) => void;
  /** Edit only. What is already filed under this site — omit for a new one. */
  rows?: PropagationRow[];
  /** Editing only. Absent while creating — there is nothing yet to delete. */
  onDelete?: () => void;
  /** What the delete control should say: the plain action, or why it cannot happen yet. */
  deleteLabel?: string;
  /** False when the site still holds requests or work orders — the control explains instead. */
  deletable?: boolean;
  onCancel: () => void;
  /** `applyTo` is the explicit id list. Empty means *project only*. */
  onSave: (value: ProjectFormValue, applyTo: string[]) => void;
  saving?: boolean;
}) {
  const t = useT();
  const isEdit = !!rows;

  // Pre-ticked comes from the row itself, never from "all of them": see `PropagationRow.preTicked`.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set((rows ?? []).filter((r) => r.preTicked).map((r) => r.id)));

  const { timing } = value.defaults;
  const patchTiming = (patch: Partial<ProjectDefaults["timing"]>) =>
    onChange({ ...value, defaults: { ...value.defaults, timing: { ...timing, ...patch } } });

  /** The location is the one required field. A site with no place is not a site. */
  const canSave = value.location.label.trim().length > 0 && !saving;

  const eligible = useMemo(() => (rows ?? []).filter((r) => r.eligible), [rows]);
  const applyTo = useMemo(() => eligible.filter((r) => ticked.has(r.id)).map((r) => r.id), [eligible, ticked]);

  /** Is there anything under this site that a save could reach? Decides the save button's wording. */
  const hasApplicable = isEdit && (rows?.length ?? 0) > 0;

  const stateLabel: Record<PropagationRow["state"], string> = {
    free: t.projects.form.stateFree,
    costs_the_edit: t.projects.form.stateCosts,
    edit_used: t.projects.form.stateUsed,
    closed: t.projects.form.stateClosed,
    work_order: t.projects.form.stateWorkOrder,
  };

  const hasPin = value.location.lat != null && value.location.lng != null;

  return (
    <div className="flex flex-col gap-5">
      {/* ── 1 · Where ──
          The place leads, because the place is what a project IS: the dates can change and the
          payment terms can change, but a project whose location moves is a different project. It is
          also the only required field, so asking it first means the renter can never fill a screen
          and then be told the one thing that mattered is still missing. */}
      <section className="flex flex-col gap-3">
        <h3 className="text-subhead font-extrabold text-navy">{t.projects.form.whereTitle}</h3>

        <MapLocationPicker
          value={hasPin ? { lat: value.location.lat as number, lng: value.location.lng as number } : null}
          label={value.location.label || null}
          onChange={(lat, lng, address) => onChange({ ...value, location: { lat, lng, label: address || value.location.label } })}
          hideAddress
        />

        <Field label={t.projects.form.address}>
          <input
            className={input}
            value={value.location.label}
            placeholder={t.projects.form.addressPlaceholder}
            onChange={(e) => onChange({ ...value, location: { ...value.location, label: e.target.value } })}
          />
        </Field>

        <Field label={t.projects.form.title} hint={t.projects.form.titleHint.replace("{fallback}", shortSite(value.location.label) || "—")}>
          <input
            className={input}
            value={value.title ?? ""}
            placeholder={shortSite(value.location.label) || t.projects.form.titlePlaceholder}
            onChange={(e) => onChange({ ...value, title: e.target.value.trim() ? e.target.value : null })}
          />
        </Field>
      </section>

      {/* ── 2 · When & terms ──
          One section, not two. The renter's own prototype (owner, 2026-08-30) puts the schedule and
          the payment terms under a single heading, and it is right: both are *terms of the hire on
          this site*, and splitting them made the dialog read as three questions when it asks two.

          Four fields on ONE row — start · end · extendable · basis — because they are one question
          ("how long, and on what footing?"). The row runs in the order the answers arrive: the two
          dates, then whether the end is soft, then the footing the whole thing is priced on. The
          basis is last because it is the one answer that does not move when the dates do (owner,
          2026-08-31). The dialog is sized to hold all four abreast (see the `xl` at the call site);
          a wrapped fourth field reads as a separate question.

          Payment terms drop to their own row rather than becoming a fifth column — they come from a
          different part of the renter's company than the dates do, and a row of five would have
          implied a fifth scheduling field. */}
      <section className="flex flex-col gap-3">
        <h3 className="text-subhead font-extrabold text-navy">{t.projects.form.whenTitle}</h3>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.projects.form.start}>
            <input type="date" className={input} value={timing.startDate ?? ""} onChange={(e) => patchTiming({ startDate: e.target.value || null })} />
          </Field>

          {/* Dates stay empty rather than being invented. A site with no dates yet is honest. */}
          <Field label={t.projects.form.end}>
            <input type="date" className={input} value={timing.endDate ?? ""} onChange={(e) => patchTiming({ endDate: e.target.value || null })} />
          </Field>

          <Field label={t.projects.form.extendableLabel}>
            {/* A switch, not a tickbox (owner, 2026-08-31). This is a state the site is IN — the
                period may run on — rather than a box you tick to agree to something, and the switch
                reads its own value from across the row where an unticked box reads as unanswered.
                The control-height frame stays so it lines up with the three inputs beside it rather
                than floating against their labels. */}
            <div className="flex h-[38px] items-center rounded-sm border border-border bg-surface px-3">
              <Toggle
                checked={timing.extendable}
                onChange={(v) => patchTiming({ extendable: v })}
                label={<span className="text-body text-navy">{timing.extendable ? t.common.yes : t.common.no}</span>}
              />
            </div>
          </Field>

          <Field label={t.projects.form.basis}>
            <select
              className={input}
              value={timing.rentalBasis ?? ""}
              onChange={(e) => patchTiming({ rentalBasis: (e.target.value || null) as RentalBasis | null })}
            >
              <option value="">—</option>
              {RENTAL_BASES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="sm:max-w-[280px]">
          <Field label={t.projects.form.paymentTerms}>
            <select
              className={input}
              value={value.defaults.paymentTerms ?? ""}
              onChange={(e) =>
                onChange({ ...value, defaults: { ...value.defaults, paymentTerms: (e.target.value || null) as PaymentTerm | null } })
              }
            >
              <option value="">—</option>
              {PAYMENT_TERMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          {/* ~~«Your finance team's terms — every machine on this site.»~~ Removed by the owner
              (2026-08-31). The label already says *payment terms* and the section already says these
              are the project's defaults; the line restated both and told the renter whose department
              to ask, which is not this dialog's business. */}
        </div>
      </section>

      {/* ── What is already filed here (edit only) ── */}
      {isEdit && rows!.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-subhead font-extrabold text-navy">{t.projects.form.applyTitle}</h3>
          <p className="text-meta text-muted">{t.projects.form.applyNote}</p>

          <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {rows!.map((r) => (
              <label key={r.id} className={`flex items-center gap-2.5 px-3 py-2 text-body ${r.eligible ? "text-navy" : "text-muted"}`}>
                <input
                  type="checkbox"
                  disabled={!r.eligible}
                  checked={ticked.has(r.id)}
                  onChange={(e) =>
                    setTicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    })
                  }
                />
                <Icon name={r.kind === "work_order" ? "handyman" : "campaign"} size={14} className="flex-none text-muted" />
                <span className="min-w-0 flex-1 truncate font-semibold">{r.ref}</span>
                <span className={`flex-none text-meta ${r.state === "costs_the_edit" ? "text-warn" : "text-muted"}`}>{stateLabel[r.state]}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ── Three actions ── */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        {/* A disabled button with no reason beside it is indistinguishable from a broken one: the
            renter presses it, nothing happens, and there is nowhere to look. This is the only thing
            that can hold Save, so it names it. */}
        {/* Delete sits in the row with the others (owner, 2026-08-31), in the danger colour with a
            matching icon — it was an underlined grey link floating below the footer, which read as a
            footnote rather than as the most destructive thing on the screen.

            Not disabled when the site is not empty: a project with rows gets an explanation, and a
            refusal a renter cannot open is a wall with no door. */}
        <div className="me-auto flex flex-wrap items-center gap-3">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 text-meta font-semibold text-danger transition hover:underline"
            >
              <Icon name={deletable ? "delete" : "info"} size={14} className="flex-none" />
              {deleteLabel}
            </button>
          )}

          {!canSave && !saving && (
            <span className="flex items-center gap-1.5 text-meta font-semibold text-warn">
              <Icon name="info" size={13} className="flex-none" />
              {t.projects.form.addressRequired}
            </span>
          )}
        </div>
        {/* Ghost, not a bordered white box: a white button beside an orange one reads as a second
            action of equal weight, and cancelling is not an action of equal weight. */}
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          {t.common.cancel}
        </Button>

        {/* *Project only* only means something when there IS something else it could apply to.
            On a site with nothing filed under it the phrase asked the renter to choose between one
            option and nothing, which is how it read on staging: *"what does it mean, project only?"*

            So the label follows the list: with rows, this is the safe half of a pair and stays navy
            because the orange belongs to the button that also changes requests. With no rows it is
            simply Save, and the only action, so it takes the orange. */}
        <Button variant={hasApplicable ? "tinted" : "primary"} onClick={() => onSave(value, [])} disabled={!canSave}>
          {hasApplicable ? t.projects.form.saveProjectOnly : t.common.save}
        </Button>

        {/* Only when something is actually ticked — an always-present third button that sometimes
            means the same as the second one teaches the renter to stop reading it. */}
        {isEdit && applyTo.length > 0 && (
          <Button onClick={() => onSave(value, applyTo)} disabled={!canSave}>
            {t.projects.form.saveAndApply.replace("{n}", String(applyTo.length))}
          </Button>
        )}
      </div>
    </div>
  );
}
