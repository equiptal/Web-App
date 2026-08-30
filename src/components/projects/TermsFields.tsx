"use client";

/**
 * The machine-terms block (spec §5.2 · PROJ-AC-43, AC-44).
 *
 * Every field a work order can state about how a machine is worked: who operates it, under what
 * certificates, who delivers it, who pays for the fuel. One component, used twice — once for the
 * order's shared block and once inside a machine that differs — so the two can never drift into
 * asking different questions.
 *
 * ── Complete, never a patch ──────────────────────────────────────────────────────────────────────
 *
 * A machine that overrides holds its OWN complete terms, not a diff against the shared ones. That is
 * what lets a crane and a generator sit on one order with different delivery and different
 * certificates instead of being split into two orders — and it is why clearing an override is a
 * deletion rather than a merge, with no stale copy left behind (AC-44).
 *
 * ── Why it was missing ───────────────────────────────────────────────────────────────────────────
 *
 * W-T17 shipped with the note *"the per-machine terms editor is a stub"* because one field's
 * visibility depended on a deferred ticket. That deferred eleven fields over a detail affecting one,
 * and the caveat lived only in a commit message, so nothing surfaced it again. The operator block is
 * simply always shown; when W-T5 decides otherwise it is a one-line condition here.
 */

import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { SAFETY_CERTIFICATES, OPERATOR_CERTIFICATES, FUEL_TYPES, type Party, type OperatorNeeded } from "@/lib/contract/options";
import type { MachineTerms } from "@/lib/contract/work-order";

const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none transition focus:border-brand";

const PARTY_OPTS: Party[] = ["me", "supplier"];
const OPERATOR_OPTS: OperatorNeeded[] = ["yes", "no"];
const NATIONALITY_OPTS = ["any", "restricted"] as const;

/** Nothing answered. The two non-nullable fields take the app's own defaults, not a lie about null. */
export function blankTerms(): MachineTerms {
  return {
    operatorNeeded: "yes",
    operator: {
      nationality: null,
      nationalityCustom: "",
      certificate: [],
      certificateOther: "",
      nightShift: false,
      fatFood: null,
      fatAccommodationTransport: null,
    } as MachineTerms["operator"],
    fuelType: "diesel",
    equipmentYear: null,
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    safetyCertsOverride: null,
    safetyCertsOtherText: null,
  };
}

/**
 * How many fields this machine states differently from the order's.
 *
 * Shown on the card so a renter can see which machines are not standard without opening each one
 * (AC-43). Compared field by field rather than by deep-equalling the objects, because the operator
 * block nests and two structurally different objects can mean the same thing.
 */
export function countDifferences(machine: MachineTerms | null, shared: MachineTerms): number {
  if (!machine) return 0;

  const same = (a: unknown, b: unknown) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      const x = [...((a as string[]) ?? [])].sort();
      const y = [...((b as string[]) ?? [])].sort();
      return x.length === y.length && x.every((v, i) => v === y[i]);
    }
    // "" and null both mean "not stated" here, and a renter did not change anything by touching a
    // box and emptying it again.
    return (a ?? "") === (b ?? "");
  };

  const pairs: [unknown, unknown][] = [
    [machine.operatorNeeded, shared.operatorNeeded],
    [machine.operator?.nationality, shared.operator?.nationality],
    [machine.operator?.nationalityCustom, shared.operator?.nationalityCustom],
    [machine.operator?.certificate, shared.operator?.certificate],
    [machine.operator?.certificateOther, shared.operator?.certificateOther],
    [machine.operator?.nightShift, shared.operator?.nightShift],
    [machine.operator?.fatFood, shared.operator?.fatFood],
    [machine.operator?.fatAccommodationTransport, shared.operator?.fatAccommodationTransport],
    [machine.fuelType, shared.fuelType],
    [machine.equipmentYear, shared.equipmentYear],
    [machine.deliveryOverride, shared.deliveryOverride],
    [machine.returnOverride, shared.returnOverride],
    [machine.fuelResponsibilityOverride, shared.fuelResponsibilityOverride],
    [machine.safetyCertsOverride, shared.safetyCertsOverride],
    [machine.safetyCertsOtherText, shared.safetyCertsOtherText],
  ];

  return pairs.filter(([a, b]) => !same(a, b)).length;
}

/** One labelled dropdown over a closed option list. */
function Pick({
  label,
  value,
  options,
  labels,
  onPick,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  labels: Record<string, string>;
  onPick: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</span>
      <select className={input} value={value ?? ""} onChange={(e) => onPick(e.target.value || null)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A set of checkboxes over a closed list, with a free-text box for whatever is not on it. */
function CertSet({
  legend,
  codes,
  chosen,
  otherText,
  otherLabel,
  otherPlaceholder,
  labels,
  onChoose,
  onOther,
}: {
  legend: string;
  codes: readonly string[];
  chosen: string[];
  otherText: string;
  otherLabel: string;
  otherPlaceholder: string;
  labels: Record<string, string>;
  onChoose: (next: string[]) => void;
  onOther: (v: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5 sm:col-span-3">
      <legend className="text-label font-semibold uppercase tracking-[.03em] text-muted">{legend}</legend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {codes.map((c) => {
          const on = chosen.includes(c);
          return (
            <label key={c} className="flex items-center gap-1.5 text-body text-navy">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChoose(on ? chosen.filter((x) => x !== c) : [...chosen, c])}
              />
              {labels[c] ?? c}
            </label>
          );
        })}
      </div>
      {/* Only once "other" is actually ticked — an empty box for a thing nobody asked for is noise. */}
      {chosen.includes("other") && (
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{otherLabel}</span>
          <input className={input} value={otherText} placeholder={otherPlaceholder} onChange={(e) => onOther(e.target.value)} />
        </label>
      )}
    </fieldset>
  );
}

export function TermsFields({ value, onChange }: { value: MachineTerms; onChange: (t: MachineTerms) => void }) {
  const t = useT();
  const w = t.projects.workOrder;
  const op = value.operator ?? blankTerms().operator;

  const patch = (p: Partial<MachineTerms>) => onChange({ ...value, ...p });
  const patchOp = (p: Partial<NonNullable<MachineTerms["operator"]>>) =>
    onChange({ ...value, operator: { ...op, ...p } as MachineTerms["operator"] });

  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      <Pick
        label={w.operator}
        value={value.operatorNeeded}
        options={OPERATOR_OPTS}
        labels={{ yes: t.common.yes, no: t.common.no }}
        onPick={(v) => patch({ operatorNeeded: (v ?? "yes") as MachineTerms["operatorNeeded"] })}
      />
      <Pick
        label={w.nationality}
        value={op.nationality}
        options={NATIONALITY_OPTS}
        labels={{ any: w.natAny, restricted: w.natRestricted }}
        onPick={(v) => patchOp({ nationality: v as never })}
      />
      {/* Which ones — asked only when the answer is "restricted", because otherwise there is no
          question. */}
      {op.nationality === "restricted" ? (
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{w.natCustom}</span>
          <input
            className={input}
            value={op.nationalityCustom ?? ""}
            placeholder={w.natCustomPlaceholder}
            onChange={(e) => patchOp({ nationalityCustom: e.target.value })}
          />
        </label>
      ) : (
        <span aria-hidden />
      )}

      <Pick
        label={w.delivery}
        value={value.deliveryOverride}
        options={PARTY_OPTS}
        labels={t.options.party}
        onPick={(v) => patch({ deliveryOverride: v as MachineTerms["deliveryOverride"] })}
      />
      <Pick
        label={w.ret}
        value={value.returnOverride}
        options={PARTY_OPTS}
        labels={t.options.party}
        onPick={(v) => patch({ returnOverride: v as MachineTerms["returnOverride"] })}
      />
      <Pick
        label={w.fuelResp}
        value={value.fuelResponsibilityOverride}
        options={PARTY_OPTS}
        labels={t.options.party}
        onPick={(v) => patch({ fuelResponsibilityOverride: v as MachineTerms["fuelResponsibilityOverride"] })}
      />

      <Pick
        label={w.fuelType}
        value={value.fuelType}
        options={FUEL_TYPES}
        labels={t.options.fuelType}
        onPick={(v) => patch({ fuelType: (v ?? "diesel") as MachineTerms["fuelType"] })}
      />
      <label className="flex flex-col gap-1">
        <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{w.year}</span>
        <input
          className={input}
          value={value.equipmentYear ?? ""}
          placeholder={w.yearPlaceholder}
          onChange={(e) => patch({ equipmentYear: (e.target.value || null) as MachineTerms["equipmentYear"] })}
        />
      </label>
      <label className="flex h-[38px] items-center gap-2 self-end rounded-sm border border-border bg-surface px-3 text-body text-navy">
        <input type="checkbox" checked={op.nightShift === true} onChange={(e) => patchOp({ nightShift: e.target.checked })} />
        {w.night}
      </label>

      {/* F.A.T — who feeds and houses the operator. Only worth asking when there IS one. */}
      {value.operatorNeeded !== "no" && (
        <>
          <Pick
            label={w.fatFood}
            value={op.fatFood}
            options={PARTY_OPTS}
            labels={t.options.party}
            onPick={(v) => patchOp({ fatFood: v as never })}
          />
          <Pick
            label={w.fatAT}
            value={op.fatAccommodationTransport}
            options={PARTY_OPTS}
            labels={t.options.party}
            onPick={(v) => patchOp({ fatAccommodationTransport: v as never })}
          />
          <span aria-hidden />

          <CertSet
            legend={w.opCerts}
            codes={OPERATOR_CERTIFICATES}
            chosen={(op.certificate ?? []) as string[]}
            otherText={op.certificateOther ?? ""}
            otherLabel={w.opCertOther}
            otherPlaceholder={w.opCertOtherPlaceholder}
            labels={t.options.safetyCert}
            onChoose={(next) => patchOp({ certificate: next as never })}
            onOther={(v) => patchOp({ certificateOther: v })}
          />
        </>
      )}

      <CertSet
        legend={w.safety}
        codes={SAFETY_CERTIFICATES}
        chosen={(value.safetyCertsOverride ?? []) as string[]}
        otherText={value.safetyCertsOtherText ?? ""}
        otherLabel={w.safetyOther}
        otherPlaceholder={w.safetyOtherPlaceholder}
        labels={t.options.safetyCert}
        onChoose={(next) =>
          patch({ safetyCertsOverride: (next.length ? next : null) as MachineTerms["safetyCertsOverride"] })
        }
        onOther={(v) => patch({ safetyCertsOtherText: v as MachineTerms["safetyCertsOtherText"] })}
      />
    </div>
  );
}

/**
 * A machine's own terms — closed until the renter opens it (owner, 2026-08-31).
 *
 * Closed because the common case is that every machine works the same way, and eleven fields per
 * machine on a five-machine order is a wall between the renter and the thing they came to do. The
 * badge is what makes closing safe: a machine that differs says so on its face, so nothing hides.
 */
export function MachineTermsOverride({
  terms,
  shared,
  onChange,
}: {
  /** `null` means this machine follows the order's terms. */
  terms: MachineTerms | null;
  shared: MachineTerms;
  onChange: (t: MachineTerms | null) => void;
}) {
  const t = useT();
  const w = t.projects.workOrder;
  const n = countDifferences(terms, shared);

  if (!terms) {
    return (
      <button
        type="button"
        /* Seeded FROM the shared block, not from blank. Opening an override must not silently
           discard the answers the renter already gave for the order. */
        onClick={() => onChange({ ...shared, operator: { ...shared.operator } as MachineTerms["operator"] })}
        className="flex items-center gap-1.5 self-start text-meta font-semibold text-brand"
      >
        <Icon name="tune" size={13} /> {w.overrideOpen}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface2/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{w.overrideTitle}</span>
        {n > 0 && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-meta font-semibold text-brand">
            {w.overrideBadge.replace("{n}", String(n))}
          </span>
        )}
        <span className="flex-1" />
        {/* A deletion, not a merge — the machine goes back to reading the shared block, and no stale
            copy of the old override is left behind (AC-44). */}
        <button type="button" onClick={() => onChange(null)} className="text-meta font-semibold text-muted underline underline-offset-2 hover:text-danger">
          {w.followShared}
        </button>
      </div>

      <TermsFields value={terms} onChange={onChange} />
    </div>
  );
}
