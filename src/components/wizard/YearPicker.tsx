"use client";

import { useState } from "react";
import { Select, TextInput } from "@/components/ui";

/** Selectable equipment years, newest first: 2026 → 2010. */
const YEARS = Array.from({ length: 2026 - 2010 + 1 }, (_, i) => String(2026 - i));

/** Stored value uses the "custom:" prefix for free-text years (e.g. "custom:2008"). */
const CUSTOM = "__custom__";
function isCustomValue(v: string | null): boolean {
  return !!v && v !== "any" && (v.startsWith("custom:") || !YEARS.includes(v));
}
function customText(v: string | null): string {
  if (!v) return "";
  return v.startsWith("custom:") ? v.slice("custom:".length) : v;
}

/**
 * Equipment-year picker (AC-28): a dropdown of years 2010–2026 plus "Any" and a "Custom" option that
 * reveals a free-text field. Used both request-wide (Step 2 "settings for all") and per item. The
 * value is "any"/null (Any), a 4-digit year, or "custom:<text>"; `toManufactureYear` reads any of these.
 */
export function YearPicker({
  value,
  onChange,
  anyLabel,
  customLabel,
  customPlaceholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  anyLabel: string;
  customLabel: string;
  customPlaceholder: string;
}) {
  const [custom, setCustom] = useState(isCustomValue(value));
  const sel = custom ? CUSTOM : value && value !== "any" ? value : "any";
  const options = [
    { value: "any", label: anyLabel },
    ...YEARS.map((y) => ({ value: y, label: y })),
    { value: CUSTOM, label: customLabel },
  ];

  return (
    <div className="space-y-2">
      <Select<string>
        value={sel}
        options={options}
        onChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true);
            onChange(customText(value) ? `custom:${customText(value)}` : null);
          } else if (v === "any") {
            setCustom(false);
            onChange(null);
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
      />
      {custom && (
        <TextInput
          maxLength={60}
          value={customText(value)}
          placeholder={customPlaceholder}
          onChange={(e) => onChange(e.target.value.trim() ? `custom:${e.target.value}` : null)}
        />
      )}
    </div>
  );
}
