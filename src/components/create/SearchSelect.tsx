"use client";

/**
 * A dropdown with a filter box (MREQ-AC-21).
 *
 * The taxonomy runs to dozens of subtypes and sizes per category, which is past the point where a
 * plain `<select>` is usable — the prototype's own type and size controls both carry a search field.
 * Kept local to the canvas rather than added to `ui.tsx`: nothing else needs it yet, and a shared
 * component invites callers who want subtly different behaviour.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  label,
  tone = "field",
  prefix,
  disabled = false,
  onChange,
}: {
  value: string | null;
  options: SearchSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  /**
   * Accessible name for the control. Without it the only thing a screen reader announces is the
   * currently selected value — "30 ton", with no indication of what is 30 tons — because the visible
   * label sits in a sibling element that carries no association.
   */
  label?: string;
  /**
   * Which surface the trigger sits on.
   *
   *  - `field` (default) — a white box inside a card.
   *  - `overlay` — the prototype's dark translucent chip, for a control anchored on the machine panel.
   *  - `brand` — the same chip in amber, which is how the prototype marks an overlay control the
   *    renter has not answered yet. The colour IS the prompt there; a dot alone is lost on a photo.
   */
  tone?: "field" | "overlay" | "brand";
  /** A small constant prefix inside the trigger, e.g. "FUEL Diesel" on the panel. */
  prefix?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /**
   * Which way the list opens.
   *
   * Two of these controls are anchored to the BOTTOM edge of the machine panel, so opening downward
   * put their options below the fold — the renter had to scroll the page to read a list they had just
   * opened. Measured on each open rather than fixed per call site: the taxonomy dropdowns hit the
   * same problem whenever the card sits low in the viewport.
   */
  const [dropUp, setDropUp] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // A combobox has to name the popup it controls, or assistive tech cannot follow the relationship.
  const listId = useId();

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

  /** Enough room for the filter box plus a few rows; below this it is better to flip. */
  const ESTIMATED_LIST_HEIGHT = 240;

  const openList = () => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      // Flip only when there is genuinely more room the other way, so a cramped viewport does not
      // send the list somewhere even worse.
      setDropUp(below < ESTIMATED_LIST_HEIGHT && rect.top > below);
    }
    setQuery("");
    setOpen(true);
  };

  const selected = options.find((o) => o.value === value);
  /**
   * The filter box earns its place only on a long list. Fuel has two options and the year bands
   * five — there a search field is pure furniture, and in a narrow overlay popup it clipped its own
   * placeholder to "MINIMUM YEA". The taxonomy lists, which run to dozens, keep it.
   */
  const searchable = options.length > 7;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => (open ? setOpen(false) : openList())}
        aria-expanded={open}
        role="combobox"
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={label}
        className={`flex w-full items-center justify-between gap-1.5 rounded-sm text-start disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg ${
          tone === "field"
            ? "border border-border bg-surface px-3 py-2.5 text-body text-navy"
            : tone === "overlay"
              ? "bg-[color-mix(in_srgb,var(--navy-deep)_80%,transparent)] px-3 py-2 text-meta font-semibold text-white"
              : "bg-brand-press px-3 py-2 text-body font-semibold text-white"
        }`}
      >
        {prefix && <span className="flex-none opacity-70">{prefix}</span>}
        <span className={`truncate ${selected || tone !== "field" ? "" : "text-muted"}`}>{selected?.label ?? placeholder}</span>
        <Icon name="expand_more" size={tone === "field" ? 16 : 14} className={`flex-none ${tone === "field" ? "text-muted" : ""}`} />
      </button>

      {open && (
        <div
          className={`absolute start-0 z-20 min-w-[max(100%,190px)] overflow-hidden rounded-sm border border-border bg-surface ${
            dropUp ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]"
          }`}
        >
          {searchable && (
            <div className="border-b border-border p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-sm border border-border px-2.5 py-1.5 text-body outline-none"
              />
            </div>
          )}
          <div id={listId} className="max-h-48 overflow-auto" role="listbox" aria-label={label}>
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3.5 py-2 text-start text-body hover:bg-surface2 ${
                  o.value === value ? "bg-surface2 font-semibold text-navy" : "text-navy-mid"
                }`}
              >
                {o.value === value && <Icon name="check" size={14} className="flex-none text-brand" />}
                <span className="whitespace-nowrap">{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3.5 py-3 text-body text-muted">—</p>}
          </div>
        </div>
      )}
    </div>
  );
}
