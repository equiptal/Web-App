"use client";

import { useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { Icon, TextInput } from "@/components/ui";
import { useT } from "@/lib/i18n";
import {
  NATIONALITY_OPTIONS,
  NATIONALITY_OTHER,
  composeExcluded,
  hydrateExcluded,
  saveExcluded,
} from "@/lib/contract/nationality";

/**
 * «Restricted operator nationalities»: the nationalities the renter does NOT want (app parity,
 * `equipment_step.dart` `_buildExcludedNationalities`, 2026-10-09).
 *
 * A multi-select with a tick per option; «Other» opens a free-text box (40 characters, several names
 * by commas). Nothing picked is a valid answer and means «any nationality».
 *
 * ⚠️ **The stored value it OPENED with decides what an empty list saves** (`saveExcluded`). An older
 * request holding `any`, `restricted`, `SAUDI` or `EXPAT` keeps that value until the renter picks
 * from this list, so opening and saving an old request never changes what it asks. That is why the
 * original is captured once, at mount: a caller showing a different item remounts this with a `key`.
 */
export function ExcludedNationalities({
  mode,
  custom,
  original: originalProp,
  onChange,
}: {
  /** `operatorNationality` as stored. */
  mode: string | null | undefined;
  /** `operatorNationalityCustom` as stored. */
  custom: string | null | undefined;
  /**
   * What the record held when it was LOADED, when that differs from `mode`/`custom` — a form that
   * keeps its own edited state and may remount this. Defaults to the values it mounts with.
   */
  original?: { mode: string | null | undefined; custom: string | null | undefined };
  onChange: (next: { mode: string | null; custom: string | null }) => void;
}) {
  const t = useT();
  const n = t.nationality;
  const [original] = useState(() => originalProp ?? { mode, custom });
  const [state, setState] = useState(() => {
    const h = hydrateExcluded(mode, custom);
    return { picked: h.picked, otherOn: h.other !== "", other: h.other };
  });

  const write = (next: typeof state) => {
    setState(next);
    onChange(saveExcluded(composeExcluded(next.picked, next.otherOn ? next.other : ""), original));
  };

  const values = [...state.picked, ...(state.otherOn ? [NATIONALITY_OTHER] : [])];

  return (
    <div className="grid gap-2">
      <span className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-[0.05em] text-muted">
        <Icon name="flag" size={13} />
        {n.label}
      </span>
      <Dropdown
        value={null}
        values={values}
        label={n.label}
        placeholder={n.pick}
        options={[...NATIONALITY_OPTIONS, NATIONALITY_OTHER].map((o) => ({ value: o, label: n.names[o] }))}
        onChange={(v) => {
          if (v === NATIONALITY_OTHER) {
            const otherOn = !state.otherOn;
            write({ ...state, otherOn, other: otherOn ? state.other : "" });
            return;
          }
          const picked = state.picked.includes(v) ? state.picked.filter((p) => p !== v) : [...state.picked, v];
          write({ ...state, picked });
        }}
      />
      {state.otherOn && (
        <TextInput
          value={state.other}
          maxLength={40}
          placeholder={n.otherPlaceholder}
          aria-label={n.otherPlaceholder}
          onChange={(e) => write({ ...state, other: e.target.value })}
        />
      )}
    </div>
  );
}
