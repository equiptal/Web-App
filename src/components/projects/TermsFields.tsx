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

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Icon, Toggle } from "@/components/ui";
import { SAFETY_CERTIFICATES, OPERATOR_CERTIFICATES, type Party } from "@/lib/contract/options";
import type { MachineTerms } from "@/lib/contract/work-order";

const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none transition focus:border-brand";

const PARTY_OPTS: Party[] = ["me", "supplier"];
const NATIONALITY_OPTS = ["any", "restricted"] as const;

/** Nothing answered. The two non-nullable fields take the app's own defaults, not a lie about null. */
export function blankTerms(): MachineTerms {
  return {
    /* ~~"yes"~~ — **off by default** (owner, 2026-08-31). It is the question most often answered
       *no*, and a toggle that starts on asks a renter hiring a generator to turn something off
       before they can move past four fields about operator nationality. Starting off means the four
       appear only for the renter who actually wants them. */
    operatorNeeded: "no",
    operator: {
      nationality: null,
      nationalityCustom: "",
      certificate: [],
      certificateOther: "",
      nightShift: false,
      fatFood: null,
      fatAccommodationTransport: null,
    } as MachineTerms["operator"],
    /* Not asked any more (owner, 2026-08-31: *"also remove fuel"*). Diesel is the app's own
       default and the type does not admit null, so it is seeded and left alone rather than deleted
       from the shape — which would move a backend contract for a field nobody is arguing about.
       `night shift` went the same way: the key stays `false` and no control offers it. */
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

  /* Only fields a renter can actually set. Night shift and fuel TYPE were removed from the form
     (owner, 2026-08-31); comparing them would count a difference nobody could see or undo, and the
     badge would say 1 with nothing to point at.

     Fuel RESPONSIBILITY is back — it was never meant to go with them. It is money, and the third leg
     of the same who-covers-what question as delivery and return; the form asks it again, so the
     badge has to count it. Left out, a machine differing only in who pays for the fuel read as
     identical to the first one. */
  const pairs: [unknown, unknown][] = [
    [machine.operatorNeeded, shared.operatorNeeded],
    [machine.operator?.nationality, shared.operator?.nationality],
    [machine.operator?.nationalityCustom, shared.operator?.nationalityCustom],
    [machine.operator?.certificate, shared.operator?.certificate],
    [machine.operator?.certificateOther, shared.operator?.certificateOther],
    [machine.operator?.fatFood, shared.operator?.fatFood],
    [machine.operator?.fatAccommodationTransport, shared.operator?.fatAccommodationTransport],
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
    <div className="flex flex-col gap-3">
      {/* Who does what, and what the machine has to carry. These are the order's commercial terms —
          asked of every machine, answered once. */}
      <div className="grid gap-2.5 sm:grid-cols-3">
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
        {/* ⚠️ WHO PAYS FOR THE FUEL — missing entirely until now (owner, 2026-08-31).
            Not the same question as the fuel TYPE, which was removed on purpose: diesel-or-petrol is
            a property of the machine, and this is money. It is the third leg of the same
            who-covers-what question as delivery and return, and it belongs beside them. */}
        <Pick
          label={w.fuelResp}
          value={value.fuelResponsibilityOverride}
          options={PARTY_OPTS}
          labels={t.options.party}
          onPick={(v) => patch({ fuelResponsibilityOverride: v as MachineTerms["fuelResponsibilityOverride"] })}
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
      </div>

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

      {/* ── The operator, last, behind its own toggle (owner, 2026-08-31) ──────────────────────

          It is the largest question here and the one most often answered *no*, so it sits at the end
          and its four sub-questions only exist once the answer is yes. Asking a renter hiring a
          generator about operator nationality is asking them to skip four fields.

          The toggle IS `operatorNeeded` — not a disclosure control over it. Turning it off does not
          hide an answer, it gives one, which is why nothing needs remembering when it goes back on. */}
      <div className="flex flex-col gap-2.5 rounded-sm border border-border bg-surface2/40 p-3">
        <Toggle
          checked={value.operatorNeeded !== "no"}
          onChange={(on: boolean) => patch({ operatorNeeded: (on ? "yes" : "no") as MachineTerms["operatorNeeded"] })}
          label={<span className="text-body font-semibold text-navy">{w.operatorNeeded}</span>}
        />

        {value.operatorNeeded !== "no" && (
          <div className="grid gap-2.5 sm:grid-cols-3">
            {/* ── Food, accommodation, nationality — one row, that order (owner, 2026-08-31) ─────

                ~~Nationality alone on the first row, the two money questions below it.~~ It read as
                the headline question and it is the least of the three: food and accommodation are
                costs somebody pays every day the machine is on site, and nationality is a preference
                that most renters leave at *any*. Money first, preference last, and all three fit the
                row that was carrying one. */}
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
            <Pick
              label={w.nationality}
              value={op.nationality}
              options={NATIONALITY_OPTS}
              labels={{ any: w.natAny, restricted: w.natRestricted }}
              onPick={(v) => patchOp({ nationality: v as never })}
            />

            {/* Which nationalities — a full row of its own, and only when the answer is
                *restricted*. Otherwise there is no question, so there is no field. */}
            {op.nationality === "restricted" && (
              <label className="flex flex-col gap-1 sm:col-span-3">
                <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{w.natCustom}</span>
                <input
                  className={input}
                  value={op.nationalityCustom ?? ""}
                  placeholder={w.natCustomPlaceholder}
                  onChange={(e) => patchOp({ nationalityCustom: e.target.value })}
                />
              </label>
            )}

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
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One machine's terms, closed until asked for.
 *
 * ── Why there is no shared block above this ──────────────────────────────────────────────────────
 *
 * There was one, and it existed to make the second machine cheap to add. Seeding buys the same thing
 * for less: the renter answers once on machine 1, machine 2 arrives already answered, and changing
 * it is a local edit rather than a fork of the order (owner, 2026-08-31). One concept instead of two,
 * and no rule to learn about what a blank means.
 *
 * ── Closed, with a badge ─────────────────────────────────────────────────────────────────────────
 *
 * Thirteen fields per machine on a five-machine order is a wall between the renter and the thing
 * they came to do, and the common case is that every machine works the same way. The badge is what
 * makes closing safe: a machine that differs from the first one says how many fields it differs by,
 * so nothing hides behind a collapsed panel.
 */
export function MachineTermsPanel({
  terms,
  /** Machine 1's terms — what this one is compared against. Absent on machine 1 itself. */
  first,
  onChange,
}: {
  terms: MachineTerms;
  first?: MachineTerms;
  onChange: (t: MachineTerms) => void;
}) {
  const t = useT();
  const w = t.projects.workOrder;
  /**
   * **Open on machine 1, closed on the rest** (owner, 2026-08-31).
   *
   * The first machine's terms are the ones being ANSWERED — operator, delivery, certificates, model
   * year — and every machine after it is seeded from them, so those panels hold answers the renter
   * has already given. Opening all of them made a two-machine order an eleven-field form twice over;
   * opening none of them hid the questions the order actually asks.
   *
   * `!first` is exactly "am I machine 1": the prop is machine 1's terms to compare against, and only
   * machine 1 is given none. No second flag to keep in step with the first.
   */
  const [open, setOpen] = useState(!first);
  const n = first ? countDifferences(terms, first) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface2/40">
      <button
        type="button"
        onClick={() => setOpen((v: boolean) => !v)}
        className="flex items-center gap-2 px-3 py-2 text-start"
      >
        <Icon name={open ? "expand_more" : "chevron_right"} size={15} className="flex-none text-muted" />
        <span className="text-body font-semibold text-navy">{w.termsTitle}</span>
        {n > 0 && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-meta font-semibold text-brand">
            {w.overrideBadge.replace("{n}", String(n))}
          </span>
        )}
        {/* Said only on a machine that is NOT the first and has not been touched — the one case where
            a renter might wonder where these answers came from. */}
        {!!first && n === 0 && <span className="text-meta text-muted">{w.sameAsFirst}</span>}
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3">
          <TermsFields value={terms} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
