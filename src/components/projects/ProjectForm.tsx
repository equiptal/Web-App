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
 * *Cancel · Save.* What is filed under the site is no longer listed here — a
 * separate decision, not a checkbox riding on Save: it can spend a renter's one post-bid edit on a
 * request they are not looking at, so it has to be its own deliberate press.
 */

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { Icon, Button, Toggle } from "@/components/ui";
import { Dropdown } from "@/components/Dropdown";
import {
  defaultProjectDefaults,
  shortSite,
  type Project,
  type ProjectDefaults,
  type SiteLocation,
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
export function Field({ label, hint, flag, children }: { label: string; hint?: string; flag?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</span>
        {/* An INDICATOR, never a requirement (owner, 2026-08-31). The dot and the word sit beside the
            label in the brand's amber, which everywhere else in this product means "this is worth
            your attention" — not `text-danger`, which would read as an error on a field the renter
            is allowed to leave alone. Nothing about Save changes: the location is still the only
            thing that can hold it. */}
        {flag && (
          <span className="flex items-center gap-1 text-label font-semibold text-warn">
            <span aria-hidden className="text-meta leading-none">●</span>
            {flag}
          </span>
        )}
      </span>
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
  onDelete,
  deleteLabel,
  deletable,
  onCancel,
  onSave,
  saving,
  markUnset,
}: {
  value: ProjectFormValue;
  onChange: (next: ProjectFormValue) => void;
  /** Edit only. What is already filed under this site — omit for a new one. */
  /** Editing rather than creating. The form itself no longer cares WHAT is filed — only the
   *  conflict step does, and that lives in the surface. */
  isEdit?: boolean;
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
  /**
   * Mark the values this form has NOT been given (owner, 2026-08-31).
   *
   * For the form opened from *Make a project from this request?*: the request supplies a site and
   * usually its dates, and leaves the title and the payment terms empty — so the renter is shown
   * exactly which two are blank while their own request is still in mind. An indicator, not a rule:
   * every one of them is optional and Save is untouched.
   *
   * Off for the ordinary new/edit dialog, where a blank field is a blank field and flagging five of
   * them on open would read as five errors.
   */
  markUnset?: boolean;
}) {
  const t = useT();


  const { timing } = value.defaults;
  const patchTiming = (patch: Partial<ProjectDefaults["timing"]>) =>
    onChange({ ...value, defaults: { ...value.defaults, timing: { ...timing, ...patch } } });

  /** The location is the one required field. A site with no place is not a site. */
  const canSave = value.location.label.trim().length > 0 && !saving;

  /** The flag for one optional field: the word when it is empty and we were asked to mark it. */
  const unset = (empty: boolean) => (markUnset && empty ? t.projects.form.unsetFlag : undefined);




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

        <Field
          label={t.projects.form.title}
          flag={unset(!value.title)}
          hint={t.projects.form.titleHint.replace("{fallback}", shortSite(value.location.label) || "—")}
        >
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
          <Field label={t.projects.form.start} flag={unset(!timing.startDate)}>
            <input type="date" className={input} value={timing.startDate ?? ""} onChange={(e) => patchTiming({ startDate: e.target.value || null })} />
          </Field>

          {/* Dates stay empty rather than being invented. A site with no dates yet is honest. */}
          <Field label={t.projects.form.end} flag={unset(!timing.endDate)}>
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

          <Field label={t.projects.form.basis} flag={unset(!timing.rentalBasis)}>
            <Dropdown
              label={t.projects.form.basis}
              placeholder="—"
              value={timing.rentalBasis}
              onChange={(v) => patchTiming({ rentalBasis: (v || null) as RentalBasis | null })}
              options={RENTAL_BASES.map((b) => ({ value: b, label: b }))}
            />
          </Field>
        </div>

        <div className="sm:max-w-[280px]">
          <Field label={t.projects.form.paymentTerms} flag={unset(!value.defaults.paymentTerms)}>
            <Dropdown
              label={t.projects.form.paymentTerms}
              placeholder="—"
              value={value.defaults.paymentTerms}
              onChange={(v) =>
                onChange({ ...value, defaults: { ...value.defaults, paymentTerms: (v || null) as PaymentTerm | null } })
              }
              options={PAYMENT_TERMS.map((p) => ({ value: p, label: p }))}
            />
          </Field>
          {/* ~~«Your finance team's terms — every machine on this site.»~~ Removed by the owner
              (2026-08-31). The label already says *payment terms* and the section already says these
              are the project's defaults; the line restated both and told the renter whose department
              to ask, which is not this dialog's business. */}
        </div>
      </section>

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

        {/* ONE save, whose words follow the ticks (owner, 2026-08-31: *"why only project button, it
            is not clear for user"*).

            There used to be two — *Project only* beside *Save and apply to 2* — which asked the
            renter to hold a distinction in their head that the list above already shows them. Worse,
            *Project only* appeared even on a site with nothing filed under it, where it named a
            choice against nothing.

            The list is the control; the button reports what the list is set to. Untick everything
            and it reads Save, and saves the site alone. */}
        {/* One save, and it saves the SITE (owner, 2026-08-31).
            *"Edit the project by default — no need to mention its sub children unless there is a
            conflict."* The form used to list every request and work order with tick boxes on every
            edit, which asked the renter to review a decision they mostly did not have: a work order
            with no period of its own already follows the site, and a request whose dates already
            match is not disagreeing with anything.

            Anything that WOULD now read differently is raised after this, by
            `PeriodConflictDialog`, and only then. */}
        <Button variant="primary" onClick={() => onSave(value, [])} disabled={!canSave}>
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}
