"use client";

/**
 * A dropdown with a filter box (MREQ-AC-21).
 *
 * The taxonomy runs to dozens of subtypes and sizes per category, which is past the point where a
 * plain `<select>` is usable — the prototype's own type and size controls both carry a search field.
 * Kept local to the canvas rather than added to `ui.tsx`: nothing else needs it yet, and a shared
 * component invites callers who want subtly different behaviour.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";

export interface SearchSelectOption {
  value: string;
  label: string;
}

export function SearchSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  disabled = false,
  onChange,
}: {
  value: string | null;
  options: SearchSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — a dropdown left open behind a panel switch is how the
  // canvas ends up with two of them showing at once.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => {
          setQuery("");
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-start text-[13px] text-navy disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`truncate ${selected ? "" : "text-muted"}`}>{selected?.label ?? placeholder}</span>
        <Icon name="expand_more" size={16} className="flex-none text-muted" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-border px-2.5 py-1.5 text-[13px] outline-none"
            />
          </div>
          <div className="max-h-48 overflow-auto">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3.5 py-2 text-start text-[13px] hover:bg-surface2 ${
                  o.value === value ? "bg-surface2 font-bold text-navy" : "text-navy-mid"
                }`}
              >
                {o.value === value && <Icon name="check" size={14} className="flex-none text-brand" />}
                <span className="truncate">{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3.5 py-3 text-[13px] text-muted">—</p>}
          </div>
        </div>
      )}
    </div>
  );
}
