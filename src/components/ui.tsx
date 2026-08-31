"use client";

import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useT } from "@/lib/i18n";
import { Dialog } from "@/components/Dialog";
import { Dropdown } from "@/components/Dropdown";
import { Icon } from "@/components/Icon";
import {
  btn,
  cx,
  BADGE_BASE,
  BADGE_TONE,
  CHIP,
  CHIP_BOX,
  INPUT,
  INPUT_AGENT,
  INPUT_ERROR,
  NOTICE_BASE,
  NOTICE_TONE,
  SEGMENT,
  TEXTAREA,
  TRACK,
  TYPE,
  type ButtonVariant,
  type ControlSize,
  type Tone,
} from "@/lib/ds";

/**
 * The app's primitives.
 *
 * Every one of these is a thin wrapper over a recipe in `@/lib/ds` — the classes live there so that
 * a feature file needing the same shape without the component (a `<label>` that has to look like a
 * chip, a link that has to look like a button) reaches for the same string rather than copying it
 * by eye. `DESIGN.md` says which to use when.
 */

/* ------------------------------------ Icon ------------------------------------ */

/* Defined in `@/components/Icon` and re-exported here, so every existing import keeps working —
   see that file for why they had to leave this one. */
export { Icon, MIcon } from "@/components/Icon";

/* ------------------------------------ Button ------------------------------------ */

/**
 * The app's button. Six variants and three heights, and nothing else.
 *
 * `primary` is the one orange thing on a screen — if two of them are visible at once, one of them
 * is wrong. `secondary` is the bordered alternative beside it, `tinted` a filled but quieter one,
 * `ghost` a bare icon or a toolbar action, `danger` a destructive confirm, `link` a word in a
 * sentence.
 */
export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  icon,
  full,
  disabled,
  type = "button",
  className = "",
  title,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  /** `sm` 30px · `md` 34px (default) · `lg` 44px, the touch minimum for a CTA or a phone row. */
  size?: ControlSize;
  /** Squares the button off for a lone glyph. Give it an `ariaLabel` when you do. */
  icon?: boolean;
  full?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={btn(variant, size, { icon, full, className })}
    >
      {children}
    </button>
  );
}

/* ------------------------------------ Card ------------------------------------ */

/**
 * A bordered box with an optional header. No shadow — this app has none; a card is its border and
 * its fill, and a card that needs more weight than its neighbours takes `raised`, which darkens the
 * border rather than lifting the box.
 */
export function Card({
  title,
  children,
  aside,
  tone = "default",
  pad = "md",
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  tone?: "default" | "raised" | "warn" | "danger" | "ok";
  pad?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "border-border",
    raised: "border-border-strong",
    warn: "border-warn/40",
    danger: "border-danger/40",
    ok: "border-ok/40",
  };
  const pads = { sm: "p-3", md: "p-4", lg: "p-5" };
  return (
    <section className={cx("rounded-lg border bg-surface", tones[tone], pads[pad], className)}>
      {(title || aside) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className={TYPE.subhead}>{title}</h3>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------ Field ------------------------------------ */

/**
 * web-app/002: marks a value the AI agent filled in from the RFQ (orange + agent icon). The caller
 * decides when to show it — it clears once the renter edits the field (the value stops matching the
 * agent's original). See `agentMatches` in the rfq-store.
 *
 * Coral is the caution colour. It used to be an orange one shade off the primary CTA, which meant
 * an assumption the renter should check looked like a button they should press.
 */
export function AgentMark({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span
      className={cx("inline-flex items-center gap-0.5 text-warn", className)}
      title={t.common.byAgent}
      aria-label={t.common.byAgent}
    >
      <Icon name="smart_toy" size={14} />
      <Icon name="auto_awesome" size={13} />
    </span>
  );
}

export function Field({
  label,
  hint,
  note,
  optional,
  agent,
  required,
  missing,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** Agent's note for this field — shown (info-styled) ONLY while `agent` is true, i.e. the value
   *  still holds what the agent assumed; it clears the moment the renter edits. Dynamic by design. */
  note?: ReactNode;
  optional?: boolean;
  /** AC: value was filled by the AI agent (orange badge). */
  agent?: boolean;
  /** AC: field is required to advance. */
  required?: boolean;
  /** AC: required field with no value the RFQ/agent supplied → render in red. */
  missing?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <label className="block">
      <span
        className={cx(
          "mb-1 flex items-center gap-2 text-label font-semibold uppercase tracking-[0.05em]",
          missing ? "text-danger" : agent ? "text-warn" : "text-muted",
        )}
      >
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
        {agent && <AgentMark />}
        {optional && <span className="text-label normal-case text-muted-light">{t.common.optional}</span>}
        {missing && <span className="text-label normal-case text-danger">{t.common.missing}</span>}
      </span>
      {children}
      {agent && note && (
        <span className="mt-1 flex items-start gap-1.5 text-meta leading-snug text-info-deep">
          <Icon name="lightbulb" size={13} className="mt-[1px] flex-none" /> {note}
        </span>
      )}
      {hint && <span className={cx("mt-1 block", TYPE.meta)}>{hint}</span>}
    </label>
  );
}

/**
 * A text input. The error and agent states sit on the border, not on a ring — a ring means focus in
 * this app, and only focus, so that a keyboard user is never guessing which of two rings they are
 * looking at.
 */
export function TextInput({
  invalid,
  agent,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; agent?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(INPUT, invalid && INPUT_ERROR, !invalid && agent && INPUT_AGENT, props.className)}
    />
  );
}

export function TextArea({
  invalid,
  agent,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; agent?: boolean }) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(TEXTAREA, invalid && INPUT_ERROR, !invalid && agent && INPUT_AGENT, props.className)}
    />
  );
}

/* ------------------------------------ Select ------------------------------------ */

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  /* ── The house dropdown, under the old name (owner, 2026-08-31) ────────────────────────────────
     Every caller of `Select` keeps its props; what changes is the list they open — the app's own
     panel with a ticked row, rather than the operating system's menu. See `Dropdown`. */
  return (
    <Dropdown
      value={value ?? null}
      disabled={disabled}
      placeholder={placeholder ?? "—"}
      onChange={(v) => onChange(v as T)}
      options={options.map((o) => ({ value: o.value, label: o.label }))}
    />
  );
}

/* ------------------------------------ Selection controls ------------------------------------
   Two rules, and both live in `@/lib/ds`. A segmented control marks its choice by lifting a white
   panel out of a tinted groove; a chip marks its choice with a brand tint. Which one a control uses
   is decided by its shape, not by which file it was written in. */

export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            name={name}
            onClick={() => onChange(o.value)}
            className={cx("rounded-md px-3 text-body control-sm", on ? CHIP.on : CHIP.off)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Prototype `.pchips` — single-select rounded chips (e.g. Me/Supplier, fuel type). */
export function Pchips<T extends string>({
  value,
  onChange,
  onClear,
  options,
}: {
  value: T | null;
  onChange: (v: T) => void;
  /** When provided, clicking the already-selected pill clears the value (tap-again to unselect). */
  onClear?: () => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => (on && onClear ? onClear() : onChange(o.value))}
            className={cx(CHIP_BOX, on ? CHIP.on : CHIP.off)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Prototype `.seg2` — segmented single-select (e.g. Daily/Weekly/Monthly, Supplier/Renter). */
export function Seg2<T extends string>({
  value,
  onChange,
  onClear,
  options,
}: {
  value: T | null;
  onChange: (v: T) => void;
  /** When provided, clicking the already-selected segment clears the value (tap-again to unselect). */
  onClear?: () => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className={cx(TRACK, "flex-wrap")}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => (on && onClear ? onClear() : onChange(o.value))}
            className={on ? SEGMENT.on : SEGMENT.off}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Prototype `.selchip` — multi-select pill that shows a ✓ when on. */
export function SelChips<T extends string>({
  values,
  onToggle,
  options,
}: {
  values: T[];
  onToggle: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={cx(CHIP_BOX, on ? CHIP.on : CHIP.off)}
          >
            {on && <Icon name="check" size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Kept as a name (owner, 2026-08-26). This and `SelChips` were the same control drawn twice — a
 * multi-select pill row — differing only in that one filled navy and the other tinted brand, which
 * is exactly the inconsistency the selection rule exists to settle. It forwards rather than being
 * deleted because its call sites read fine as they are.
 */
export function MultiChips<T extends string>(props: {
  values: T[];
  onToggle: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return <SelChips {...props} />;
}

/* ------------------------------------ Toggle ------------------------------------ */

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-body"
    >
      <span className={cx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-brand" : "bg-border")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-all", checked ? "start-4" : "start-0.5")} />
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------ Stepper ------------------------------------ */

export function Stepper({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-surface">
      <button
        type="button"
        aria-label="−"
        className={btn("ghost", "sm", { icon: true, className: "rounded-none rounded-s-md" })}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="min-w-8 text-center text-body font-semibold tabular">{value}</span>
      <button
        type="button"
        aria-label="+"
        className={btn("ghost", "sm", { icon: true, className: "rounded-none rounded-e-md" })}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}

/* ------------------------------------ Badge ------------------------------------ */

/**
 * A status, small. Each tone lays its `deep` text colour on its `soft` background — the base colour
 * alone is not readable at 11px on its own tint.
 */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone | "default" }) {
  const key: Tone = tone === "default" ? "neutral" : tone;
  return <span className={cx(BADGE_BASE, BADGE_TONE[key])}>{children}</span>;
}

/** A status, full width — the panel form, for a caution or an error above a form. */
export function Notice({ children, tone = "info", icon }: { children: ReactNode; tone?: Tone; icon?: string }) {
  return (
    <div className={cx(NOTICE_BASE, NOTICE_TONE[tone])} role={tone === "danger" ? "alert" : undefined}>
      {icon && <Icon name={icon} size={16} className="mt-[1px] flex-none" />}
      <div>{children}</div>
    </div>
  );
}

/* ------------------------------------ Modal ------------------------------------ */

/**
 * Kept as a name, not as an implementation (owner, 2026-08-26).
 *
 * This drew its own scrim, radius and 16px semibold title — a fourth answer to questions `Dialog`
 * now answers once — and it had NO close control at all, so a caller using it offered the backdrop
 * and nothing else. It forwards to `Dialog` instead of being deleted because its call sites read
 * fine as they are; what they get is the shared shell, the X, and Escape.
 */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={title}>
      {children}
    </Dialog>
  );
}
