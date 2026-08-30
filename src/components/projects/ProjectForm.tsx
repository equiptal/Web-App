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
import { Icon, Button } from "@/components/ui";
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</span>
      {children}
      {hint && <span className="text-meta text-muted">{hint}</span>}
    </label>
  );
}

const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none transition focus:border-brand";

/* ----------------------------- The form ----------------------------- */

export function ProjectForm({
  value,
  onChange,
  rows,
  onCancel,
  onSave,
  saving,
}: {
  value: ProjectFormValue;
  onChange: (next: ProjectFormValue) => void;
  /** Edit only. What is already filed under this site — omit for a new one. */
  rows?: PropagationRow[];
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

  /** The address is the one required field. A site with no place is not a site. */
  const canSave = value.location.label.trim().length > 0 && !saving;

  const eligible = useMemo(() => (rows ?? []).filter((r) => r.eligible), [rows]);
  const applyTo = useMemo(() => eligible.filter((r) => ticked.has(r.id)).map((r) => r.id), [eligible, ticked]);

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
      {/* ── Where ── */}
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

      {/* ── When & terms ── */}
      <section className="flex flex-col gap-3">
        <h3 className="text-subhead font-extrabold text-navy">{t.projects.form.whenTitle}</h3>

        <div className="grid gap-3 sm:grid-cols-2">
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

          <Field label={t.projects.form.hours}>
            <input
              type="number"
              min={1}
              max={24}
              className={input}
              value={timing.hoursPerDay ?? ""}
              onChange={(e) => patchTiming({ hoursPerDay: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>

          {/* Dates stay empty rather than being invented. A site with no dates yet is honest. */}
          <Field label={t.projects.form.start}>
            <input type="date" className={input} value={timing.startDate ?? ""} onChange={(e) => patchTiming({ startDate: e.target.value || null })} />
          </Field>

          <Field label={t.projects.form.end}>
            <input type="date" className={input} value={timing.endDate ?? ""} onChange={(e) => patchTiming({ endDate: e.target.value || null })} />
          </Field>

          <Field label={t.projects.form.paymentTerms} hint={t.projects.form.paymentHint}>
            <select
              className={input}
              value={value.defaults.paymentTerms ?? ""}
              onChange={(e) => onChange({ ...value, defaults: { ...value.defaults, paymentTerms: (e.target.value || null) as PaymentTerm | null } })}
            >
              <option value="">—</option>
              {PAYMENT_TERMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 self-end pb-2 text-body text-navy">
            <input type="checkbox" checked={timing.extendable} onChange={(e) => patchTiming({ extendable: e.target.checked })} />
            {t.projects.form.extendable}
          </label>
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
        {!canSave && !saving && (
          <span className="me-auto flex items-center gap-1.5 text-meta font-semibold text-warn">
            <Icon name="info" size={13} className="flex-none" />
            {t.projects.form.addressRequired}
          </span>
        )}
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          {t.common.cancel}
        </Button>

        <Button variant="secondary" onClick={() => onSave(value, [])} disabled={!canSave}>
          {isEdit ? t.projects.form.saveProjectOnly : t.common.save}
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
