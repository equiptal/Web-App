"use client";

/**
 * **The one dropdown** (owner, 2026-08-31: *"I want to redesign all the dropdowns to be nice and
 * consistent across all"*).
 *
 * Every list in this product was a native `<select>` except the taxonomy pickers on the create
 * canvas, which had their own. That is two answers to one question, and the native half is the one
 * the renter complained about: the browser paints it with the OS's own menu — a full-bleed blue
 * highlight, system type, no room for a tick or a hint — so the same control looked different on
 * Windows, on a Mac and inside the same dialog.
 *
 * This is `SearchSelect`'s implementation, which was already the good half, lifted out of the canvas
 * and made general. `SearchSelect` now re-exports it, so the canvas keeps the component it had.
 *
 * ── What it is ───────────────────────────────────────────────────────────────────────────────────
 *
 * A `combobox` trigger and a `listbox` popup. The trigger takes one of four TONES so a pill in the
 * intake strip and a field in a dialog can be the same control without pretending to be the same
 * shape:
 *
 *   `field`   a white box in a form — the default, and the shape `input` in `ProjectForm` wears
 *   `pill`    an `h-8` rounded pill, for the value strips
 *   `bare`    a caret and nothing else, for a trigger that sits INSIDE something already framed —
 *             the project pill, which is a control in its own right and must not gain a second box
 *   `overlay` the dark translucent chip anchored on the machine panel
 *   `brand`   the same chip in amber, for an overlay control nobody has answered yet
 *
 * ── Three things it does that a native select cannot ─────────────────────────────────────────────
 *
 *  · **It flips up** when the trigger sits low in the viewport, measured on each open. Two of these
 *    are anchored to the bottom edge of the machine panel, and a list that opened below the fold had
 *    to be scrolled to be read.
 *  · **It filters** past seven options. The taxonomy runs to dozens of subtypes per category, which
 *    is past the point where any list is usable by eye. Below seven the box is furniture, so there
 *    is none.
 *  · **It marks the chosen row** with a tick and the app's own weight, rather than a system
 *    highlight bar.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { pin } from "@/lib/uiPins";

export interface DropdownOption {
  value: string;
  label: string;
  /** A second line under the label — what a row means, when the label alone does not say it. */
  hint?: string;
  /**
   * Shown, and not pickable.
   *
   * For a row the renter must be able to FIND and be told why it cannot be chosen — an unregistered
   * supplier, say. Hiding it instead makes them wonder where it went.
   */
  disabled?: boolean;
}

export type DropdownTone = "field" | "pill" | "bare" | "overlay" | "brand";

/** Roughly what an open list needs. Only used to decide which way to open. */
const ESTIMATED_LIST_HEIGHT = 240;

export function Dropdown({
  value,
  options,
  placeholder,
  searchPlaceholder,
  label,
  tone = "field",
  prefix,
  triggerClass,
  disabled = false,
  onChange,
}: {
  value: string | null;
  options: DropdownOption[];
  /** Shown on the trigger while nothing is chosen. */
  placeholder: string;
  /** Only reachable past seven options — see the note above. */
  searchPlaceholder?: string;
  /**
   * Accessible name for the control. Without it the only thing a screen reader announces is the
   * currently selected value — "30 ton", with no indication of what is 30 tons — because the visible
   * label sits in a sibling element that carries no association.
   */
  label?: string;
  tone?: DropdownTone;
  /**
   * A small constant prefix inside the trigger, e.g. «BASIS monthly» in a value strip.
   *
   * A node rather than a string since 2026-09-01: the storefront's city filter puts a pin there, and
   * an icon is the same slot doing the same job — a constant mark that says what the menu is about
   * before it says what is chosen.
   */
  prefix?: ReactNode;
  /**
   * The trigger's own skin, replacing the tone's.
   *
   * For a surface with a skin of its own that this file must not learn — the auth panel's dark
   * field, which is `authField(tone)` and lives with the panel. The LIST is unchanged: it is the
   * app's own white panel wherever it opens, which is also what fixed the bug this replaced (a
   * native popup inheriting white-on-navy from its control, so white text on white).
   */
  triggerClass?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // A combobox has to name the popup it controls, or assistive tech cannot follow the relationship.
  const listId = useId();

  // Close on an outside click or Escape — a dropdown left open behind a panel switch is how a
  // surface ends up with two of them showing at once.
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
  const searchable = options.length > 7;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const trigger =
    triggerClass ??
    (tone === "field"
      ? "w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy hover:border-brand"
      : tone === "pill"
        ? "h-8 rounded-sm border border-border bg-surface px-2.5 text-label text-navy hover:border-brand"
        : tone === "bare"
          ? "text-inherit hover:text-brand"
        : tone === "overlay"
          ? "bg-[color-mix(in_srgb,var(--navy-deep)_80%,transparent)] px-3 py-2 text-meta font-semibold text-white rounded-sm"
          : "bg-brand-press px-3 py-2 text-body font-semibold text-white rounded-sm");

  return (
    <div {...pin("search-select")} ref={boxRef} className={`relative ${tone === "pill" ? "inline-flex" : ""}`}>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => (open ? setOpen(false) : openList())}
        aria-expanded={open}
        role="combobox"
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={label}
        className={`flex items-center justify-between gap-1.5 text-start transition disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-fg ${trigger}`}
      >
        {prefix && (
          <span className={tone === "pill" ? "font-semibold uppercase tracking-[.03em] opacity-55" : "flex-none opacity-70"}>{prefix}</span>
        )}
        {/* `bare` shows the caret alone: whatever it sits inside is already saying what it is. */}
        {tone !== "bare" && (
          <span className={`truncate ${tone === "pill" ? "font-semibold" : ""} ${selected || tone !== "field" ? "" : "text-muted"}`}>
            {selected?.label ?? placeholder}
          </span>
        )}
        <Icon name="expand_more" size={tone === "field" ? 16 : 14} className={`flex-none ${tone === "brand" || tone === "overlay" ? "" : "opacity-50"}`} />
      </button>

      {open && (
        <div
          /* `min-w` off the trigger so a short pill still opens a readable list, and `max-w` so a
             long machine name cannot run the list off the side of a narrow card. */
          className={`absolute start-0 z-30 min-w-[max(100%,220px)] max-w-[min(340px,80vw)] overflow-hidden rounded-md border border-border bg-surface ${
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
                className="w-full rounded-sm border border-border px-2.5 py-1.5 text-body outline-none focus:border-brand"
              />
            </div>
          )}
          <div id={listId} className="max-h-56 overflow-auto py-1" role="listbox" aria-label={label}>
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 px-3 py-1.5 text-start text-body transition ${
                  o.disabled
                    ? "cursor-not-allowed text-disabled-fg"
                    : o.value === value
                      ? "bg-surface2 font-semibold text-navy hover:bg-surface2"
                      : "text-navy-mid hover:bg-surface2"
                }`}
              >
                {/* The tick holds its column whether or not it is drawn, so the labels line up. */}
                <span className="grid h-[18px] w-3.5 flex-none place-items-center">
                  {o.value === value && <Icon name="check" size={14} className="text-brand" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-meta text-muted">{o.hint}</span>}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-3 text-body text-muted">—</p>}
          </div>
        </div>
      )}
    </div>
  );
}
