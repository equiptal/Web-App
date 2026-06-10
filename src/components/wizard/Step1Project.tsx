"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";

// Leaflet touches `window` at import, so the map picker is client-only.
const MapLocationPicker = dynamic(() => import("@/components/shared/MapLocationPicker"), { ssr: false });
import { Badge, Button, Card, Field, MultiChips, RadioGroup, Select, Stepper, TextInput, Toggle } from "@/components/ui";
import {
  RENTAL_BASES,
  OVERTIME_RATES,
  EQUIPMENT_YEARS,
  SITE_ACCESS_RESTRICTIONS,
  SAFETY_CERTIFICATES,
  OTHER_CERTIFICATES,
  type RentalBasis,
  type OvertimeRate,
  type SiteAccessRestriction,
  type SafetyCertificate,
  type OtherCertificate,
} from "@/lib/contract";

export function Step1Project() {
  const t = useT();
  const { state, actions } = useRfq();
  const project = state.draft!.project;
  const loc = project.location;
  const conflictUnresolved = Boolean(loc.conflict && !loc.conflict.resolvedFrom);
  const showMultiLocation = state.draft!.detectedLocations.length > 1 && !state.multiLocationDismissed;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const opt = <T extends string>(values: readonly T[], dict: Record<string, string>) =>
    values.map((v) => ({ value: v, label: dict[v] ?? v }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t.step1.title}</h2>

      {/* ---------- Location card (AC-11/16/47/48) ---------- */}
      <Card
        title={t.step1.location.card}
        tone={loc.confirmed ? "ok" : "warn"}
        aside={
          <Badge tone={loc.confirmed ? "ok" : "warn"}>{loc.confirmed ? t.step1.location.confirmed : t.step1.location.unconfirmed}</Badge>
        }
      >
        {/* AC-48: multiple locations detected → one location per request. */}
        {showMultiLocation && (
          <div className="mb-3 rounded-lg bg-warn-soft p-3 text-sm">
            <p className="font-medium text-warn">{t.step1.location.multiLocationTitle}</p>
            <p className="mt-1 text-muted">{t.step1.location.multiLocationBody}</p>
            <ul className="mt-1 list-disc ps-5 text-xs text-muted">
              {state.draft!.detectedLocations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <button className="mt-2 text-xs text-brand" onClick={() => actions.dismissMultiLocation()}>
              {t.common.done}
            </button>
          </div>
        )}

        {/* AC-47: text↔file conflict — pick a source before confirming. */}
        {conflictUnresolved && loc.conflict && (
          <div className="mb-3 rounded-lg border border-warn/40 p-3 text-sm">
            <p className="font-medium">{t.step1.location.conflictTitle}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="rounded-lg border border-border p-2 text-start hover:border-brand" onClick={() => actions.resolveLocationConflict("text")}>
                <span className="block text-xs text-muted">{t.step1.location.fromText}</span>
                {loc.conflict.fromText}
              </button>
              <button className="rounded-lg border border-border p-2 text-start hover:border-brand" onClick={() => actions.resolveLocationConflict("file")}>
                <span className="block text-xs text-muted">{t.step1.location.fromFile}</span>
                {loc.conflict.fromFile}
              </button>
            </div>
          </div>
        )}

        <Field label={t.step1.location.card}>
          <TextInput value={loc.label ?? ""} onChange={(e) => actions.patchLocation({ label: e.target.value, source: "manual" })} />
        </Field>
        {loc.source === "agent" && <p className="mt-1 mb-2 text-xs text-muted">{t.step1.location.extractedFrom}</p>}

        {/* Real map/GPS picker (ported from Moedatech-App c-hub): search, click-to-pin, drag, use-my-location. */}
        <div className="mt-3">
          <MapLocationPicker
            value={loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng } : null}
            onChange={(lat, lng, city) => actions.patchLocation({ lat, lng, label: city || loc.label, source: "map" })}
          />
        </div>

        {/* AC-16: explicit confirm, always required (even when extracted), blocked while conflict unresolved. */}
        <div className="mt-3">
          <Button disabled={conflictUnresolved || loc.confirmed} onClick={() => actions.confirmLocation()}>
            {t.step1.location.confirmAction}
          </Button>
        </div>
      </Card>

      {/* ---------- Timing & Hours card (AC-13/14) ---------- */}
      <Card title={t.step1.timing.card}>
        <Field label={`${t.step1.timing.rentalBasis} (${t.common.required})`}>
          <RadioGroup<RentalBasis>
            name="rentalBasis"
            value={project.timing.rentalBasis}
            onChange={(v) => actions.patchTiming({ rentalBasis: v })}
            options={opt(RENTAL_BASES, t.options.rentalBasis)}
          />
        </Field>
        <div className="mt-2 flex items-center gap-3">
          <Toggle checked={project.timing.extendable} onChange={(v) => actions.patchTiming({ extendable: v })} label={t.step1.timing.extendable} />
          <span className="text-xs text-muted">{t.step1.timing.extendableHint}</span>
        </div>
        {project.timing.rentalBasis && <p className="mt-1 text-xs text-muted">{t.step1.timing.quoteNote}</p>}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t.step1.timing.startDate} optional>
            <TextInput type="date" value={project.timing.startDate ?? ""} onChange={(e) => actions.patchTiming({ startDate: e.target.value || null })} />
          </Field>
          <Field label={t.step1.timing.endDate} optional>
            <TextInput type="date" value={project.timing.endDate ?? ""} onChange={(e) => actions.patchTiming({ endDate: e.target.value || null })} />
          </Field>
          <Field label={t.step1.timing.hoursPerDay}>
            <TextInput
              type="number"
              min={1}
              max={24}
              value={project.timing.hoursPerDay}
              onChange={(e) => actions.patchTiming({ hoursPerDay: Number(e.target.value) || 8 })}
            />
          </Field>
        </div>
      </Card>

      {/* ---------- Advanced card (AC-15/27/28) ---------- */}
      <Card
        title={t.step1.advanced.card}
        aside={
          <button className="text-xs text-brand" onClick={() => setAdvancedOpen((o) => !o)}>
            {advancedOpen ? t.common.close : t.common.edit}
          </button>
        }
      >
        {!advancedOpen ? (
          <p className="text-sm text-muted">{advancedSummary(project.advanced, t)}</p>
        ) : (
          <div className="space-y-3">
            <Field label={t.step1.advanced.workingDays}>
              <Stepper value={project.advanced.workingDaysPerWeek} min={1} max={7} onChange={(v) => actions.patchAdvanced({ workingDaysPerWeek: v })} />
            </Field>
            <Field label={t.step1.advanced.overtime}>
              <RadioGroup<OvertimeRate>
                name="overtime"
                value={project.advanced.overtimeRate}
                onChange={(v) => actions.patchAdvanced({ overtimeRate: v })}
                options={opt(OVERTIME_RATES, t.options.overtime)}
              />
            </Field>
            {(() => {
              // AC-28: Any + 2020–2026 + Customize…. A custom pick stores `custom:<year>`,
              // which app-adapters.toManufactureYear maps to maxEquipmentAge.
              const ey = project.advanced.equipmentYear;
              const isCustom = !!ey && ey.startsWith("custom:");
              return (
                <Field label={t.step1.advanced.equipmentYear} optional>
                  <Select<string>
                    value={isCustom ? "customize" : ey}
                    placeholder={t.step1.advanced.equipmentYear}
                    onChange={(v) => actions.patchAdvanced({ equipmentYear: v === "customize" ? "custom:" : v })}
                    options={[
                      ...[...EQUIPMENT_YEARS].map((y) => ({ value: y, label: y === "any" ? t.options.equipmentYear.any : y })),
                      { value: "customize", label: t.step1.advanced.customize },
                    ]}
                  />
                  {isCustom && (
                    <div className="mt-2">
                      <TextInput
                        type="number"
                        min={1980}
                        max={2026}
                        placeholder="YYYY"
                        value={ey.slice("custom:".length)}
                        onChange={(e) => actions.patchAdvanced({ equipmentYear: e.target.value ? `custom:${e.target.value}` : "custom:" })}
                      />
                    </div>
                  )}
                </Field>
              );
            })()}
            <Field label={t.step1.advanced.siteAccess}>
              <MultiChips<SiteAccessRestriction>
                values={project.advanced.siteAccessRestrictions}
                onToggle={(v) => actions.patchAdvanced({ siteAccessRestrictions: toggle(project.advanced.siteAccessRestrictions, v) })}
                options={opt(SITE_ACCESS_RESTRICTIONS, t.options.siteAccess)}
              />
            </Field>
          </div>
        )}
      </Card>

      {/* ---------- Certificates card (AC-50) ---------- */}
      <Card title={t.step1.certificates.card}>
        <Field label={t.step1.certificates.safety}>
          <MultiChips<SafetyCertificate>
            values={project.certificates.safety}
            onToggle={(v) => actions.setCertificates({ safety: toggle(project.certificates.safety, v) })}
            options={opt(SAFETY_CERTIFICATES, t.options.safetyCert)}
          />
        </Field>
        <p className="mt-1 text-xs text-muted">{t.step1.certificates.safetyAppliesNote}</p>
        <Field label={t.step1.certificates.other}>
          <MultiChips<OtherCertificate>
            values={project.certificates.other}
            onToggle={(v) => actions.setCertificates({ other: toggle(project.certificates.other, v) })}
            options={opt(OTHER_CERTIFICATES, t.options.otherCert)}
          />
        </Field>
      </Card>

      {/* Delivery / Return / Fuel responsibility (AC-25/26) live on the Equipment step
          ("Settings for all items"), matching the prototype. */}
    </div>
  );
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function advancedSummary(a: { workingDaysPerWeek: number; overtimeRate: string; equipmentYear: string | null; siteAccessRestrictions: string[] }, t: ReturnType<typeof useT>): string {
  const parts: string[] = [];
  parts.push(`${a.workingDaysPerWeek}d/wk`);
  if (a.overtimeRate !== "without") parts.push(`OT ${a.overtimeRate}`);
  if (a.equipmentYear) parts.push(a.equipmentYear.replace("custom:", ""));
  if (a.siteAccessRestrictions.length) parts.push(`${a.siteAccessRestrictions.length} restrictions`);
  return parts.length ? parts.join(" · ") : t.step1.advanced.collapsedEmpty;
}
