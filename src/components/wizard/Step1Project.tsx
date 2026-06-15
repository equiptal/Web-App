"use client";

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n";
import { useRfq, agentMatches } from "@/lib/store/rfq-store";
import { Card, Field, Icon, Seg2, SelChips, Select, Stepper, TextInput } from "@/components/ui";
import {
  RENTAL_BASES,
  OVERTIME_RATES,
  EQUIPMENT_YEARS,
  type RentalBasis,
  type OvertimeRate,
} from "@/lib/contract";

// Leaflet touches `window` at import, so the map picker is client-only.
// web-app/002: Google Maps picker (swapped from the Leaflet/OSM MapLocationPicker — kept alongside).
const MapLocationPicker = dynamic(() => import("@/components/shared/GoogleMapLocationPicker"), { ssr: false });

function opt<T extends string>(values: readonly T[], dict: Record<string, string>) {
  return values.map((v) => ({ value: v, label: dict[v] ?? v }));
}

export function Step1Project() {
  const t = useT();
  const { state, actions } = useRfq();
  const project = state.draft!.project;
  const loc = project.location;
  const conflictUnresolved = Boolean(loc.conflict && !loc.conflict.resolvedFrom);
  // AC-16: a location must actually be set (address label or map coords) before it can be confirmed.
  // AC-16: must be an actual point found on the map (coordinates) before it can be confirmed —
  // a typed label alone isn't enough.
  const hasLocation = loc.lat != null && loc.lng != null;
  const multi = state.draft!.detectedLocations.filter(Boolean);
  const ap = state.agentOrigin?.project; // agent's original values, for the orange "AI" marker
  const ey = project.advanced.equipmentYear;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[23px] font-extrabold tracking-tight">{t.step1.title}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">{t.step1.subtitle}</p>
      </div>

      {/* ---------- Location (AC-11/16/47/48) ---------- */}
      <Card title={<><Icon name="place" size={18} className="me-1.5 align-[-3px] text-navy-mid" />{t.step1.location.card}</>}>
        {/* AC-47: text↔file conflict — pick a source before confirming. */}
        {conflictUnresolved && loc.conflict && (
          <div className="mb-3 rounded-[10px] border border-warn/40 bg-warn-soft p-3.5">
            <div className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-warn">
              <Icon name="error_outline" size={18} /> {t.step1.location.conflictTitle}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button className="flex flex-col gap-1 rounded-[10px] border border-border bg-surface p-3 text-start hover:border-brand" onClick={() => actions.resolveLocationConflict("text")}>
                <span className="flex items-center gap-1 text-[11px] font-bold text-muted"><Icon name="notes" size={14} /> {t.step1.location.fromText}</span>
                <span className="text-[13.5px] font-bold">{loc.conflict.fromText}</span>
              </button>
              <button className="flex flex-col gap-1 rounded-[10px] border border-border bg-surface p-3 text-start hover:border-brand" onClick={() => actions.resolveLocationConflict("file")}>
                <span className="flex items-center gap-1 text-[11px] font-bold text-muted"><Icon name="picture_as_pdf" size={14} /> {t.step1.location.fromFile}</span>
                <span className="text-[13.5px] font-bold">{loc.conflict.fromFile}</span>
              </button>
            </div>
          </div>
        )}

        {!conflictUnresolved && (
          <>
            {/* addr line */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[15px] font-bold">
              <Icon name="location_on" size={20} className="text-brand" />
              <span>{loc.label ?? "—"}</span>
              {loc.source === "agent" && <span className="rounded-md border border-border bg-surface2 px-2 py-0.5 text-[11px] font-bold text-navy-mid">{t.step1.location.extractedFrom}</span>}
            </div>

            {/* Agent's location note — shown while it's still the agent's pin and unconfirmed; clears
                once the renter moves the pin (source→map) or confirms. */}
            {loc.source === "agent" && !loc.confirmed && state.draft?.fieldNotes?.["rfq_header.project_address_label"] && (
              <p className="mb-3 flex items-start gap-1.5 text-[12px] leading-snug text-info">
                <Icon name="lightbulb" size={14} className="mt-[1.5px] flex-none" />
                {state.draft.fieldNotes["rfq_header.project_address_label"]}
              </p>
            )}

            <MapLocationPicker
              value={loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng } : null}
              label={loc.label}
              onChange={(lat, lng, address) => actions.patchLocation({ lat, lng, label: address || loc.label, source: "map" })}
            />

            {/* AC-16: explicit confirm — always required, even when extracted. */}
            {loc.confirmed ? (
              // No "Change" button: editing the location in the search/map auto-unconfirms (store
              // PATCH_LOCATION), so the renter just changes it and reconfirms.
              <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-ok/30 bg-ok-soft px-3.5 py-3 text-[13px] font-bold text-ok">
                <Icon name="check_circle" size={19} /> {t.step1.location.confirmed}
                <span className="ms-auto text-xs font-medium text-ok/80">{t.step1.location.changeHint}</span>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-warn/30 bg-warn-soft px-3.5 py-3">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
                  <Icon name="help_outline" size={17} /> {hasLocation ? t.step1.location.confirmPrompt : t.step1.location.fillPrompt}
                </span>
                <button
                  disabled={!hasLocation}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => actions.confirmLocation()}
                >
                  <Icon name="check" size={16} /> {t.step1.location.confirmAction}
                </button>
              </div>
            )}
          </>
        )}

        {/* AC-48: one location per request. */}
        <div className="mt-3 flex items-start gap-3 rounded-[10px] border border-info/25 bg-info-soft px-3.5 py-3">
          <Icon name="pin_drop" size={22} className="flex-none text-info" />
          <div className="text-[#0e4f7e]">
            <div className="text-[13px] font-extrabold">{t.step1.location.multiLocationTitle}</div>
            <div className="mt-0.5 text-xs opacity-85">{t.step1.location.multiLocationBody}</div>
            {multi.length > 1 && (
              <ul className="mt-1 list-disc ps-5 text-xs opacity-85">
                {multi.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            {/* AC-48: each other site is its own request — opens a fresh RFQ in a new tab (prototype openNewRequest). */}
            <button
              onClick={() => window.open(window.location.href, "_blank", "noopener")}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-info/40 bg-surface px-3 py-1.5 text-xs font-bold text-info hover:border-info"
            >
              {t.step1.location.startSeparateRequest} <Icon name="open_in_new" size={14} />
            </button>
          </div>
        </div>
      </Card>

      {/* ---------- Timing & Hours (AC-13/14) ---------- */}
      <Card title={<><Icon name="schedule" size={18} className="me-1.5 align-[-3px] text-navy-mid" />{t.step1.timing.card}</>}>
        <Field
          label={t.step1.timing.rentalBasis}
          required
          missing={!project.timing.rentalBasis}
          agent={agentMatches(project.timing.rentalBasis, ap?.timing.rentalBasis)}
          note={state.draft?.fieldNotes?.["rfq_header.rental_type"]}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Seg2<RentalBasis> value={project.timing.rentalBasis} onChange={(v) => actions.patchTiming({ rentalBasis: v })} options={opt(RENTAL_BASES, t.options.rentalBasis)} />
            <SelChips
              values={project.timing.extendable ? ["extendable"] : []}
              onToggle={() => actions.patchTiming({ extendable: !project.timing.extendable })}
              options={[{ value: "extendable", label: t.step1.timing.extendable }]}
            />
          </div>
        </Field>
        <p className="mt-1.5 text-xs text-muted">{t.step1.timing.quoteNote} {t.step1.timing.extendableHint}</p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t.step1.timing.startDate} optional agent={agentMatches(project.timing.startDate, ap?.timing.startDate)}>
            <TextInput type="date" value={project.timing.startDate ?? ""} onChange={(e) => actions.patchTiming({ startDate: e.target.value || null })} />
          </Field>
          <Field label={t.step1.timing.endDate} optional agent={agentMatches(project.timing.endDate, ap?.timing.endDate)}>
            <TextInput type="date" value={project.timing.endDate ?? ""} onChange={(e) => actions.patchTiming({ endDate: e.target.value || null })} />
          </Field>
          <Field label={t.step1.timing.hoursPerDay} optional agent={agentMatches(project.timing.hoursPerDay, ap?.timing.hoursPerDay)}>
            <TextInput type="number" min={1} max={24} value={project.timing.hoursPerDay} onChange={(e) => actions.patchTiming({ hoursPerDay: Number(e.target.value) || 10 })} />
          </Field>
        </div>
      </Card>

      {/* ---------- Advanced (AC-15/27/28) — open by default ---------- */}
      <Card title={<><Icon name="tune" size={18} className="me-1.5 align-[-3px] text-navy-mid" />{t.step1.advanced.card} <span className="text-xs font-semibold text-muted">{t.common.optional}</span></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t.step1.advanced.workingDays} agent={agentMatches(project.advanced.workingDaysPerWeek, ap?.advanced.workingDaysPerWeek)}>
            <Stepper value={project.advanced.workingDaysPerWeek} min={1} max={7} onChange={(v) => actions.patchAdvanced({ workingDaysPerWeek: v })} />
          </Field>
          <Field label={t.step1.advanced.overtime} agent={agentMatches(project.advanced.overtimeRate, ap?.advanced.overtimeRate)}>
            <Seg2<OvertimeRate> value={project.advanced.overtimeRate} onChange={(v) => actions.patchAdvanced({ overtimeRate: v })} options={opt(OVERTIME_RATES, t.options.overtime)} />
          </Field>
          <Field label={t.step1.advanced.equipmentYear} optional agent={agentMatches(project.advanced.equipmentYear, ap?.advanced.equipmentYear)}>
            <Select<string>
              value={ey}
              placeholder={t.options.equipmentYear.any}
              onChange={(v) => actions.patchAdvanced({ equipmentYear: v })}
              options={EQUIPMENT_YEARS.map((y) => ({ value: y, label: y === "any" ? t.options.equipmentYear.any : y }))}
            />
          </Field>
        </div>
      </Card>

      {/* Certificates + Delivery / Return / Fuel responsibility (AC-25/26/50) are unified in the
          "Settings for all equipment" panel on the Equipment step. */}
    </div>
  );
}
