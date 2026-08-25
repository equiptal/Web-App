"use client";

import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useT } from "@/lib/i18n";
import { Dialog } from "@/components/Dialog";

/* ------------------------------------ Icon ------------------------------------ */

/** Material Icons Outlined glyph (loaded via globals.css). e.g. <Icon name="place" />. */
export function Icon({ name, className = "", size }: { name: string; className?: string; size?: number }) {
  return (
    <span className={`material-icons-outlined ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden>
      {name}
    </span>
  );
}

/** Material Symbols Rounded glyph (for the triage filter nodes). */
export function MIcon({ name, className = "", size }: { name: string; className?: string; size?: number }) {
  return (
    <span className={`material-symbols-rounded ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden>
      {name}
    </span>
  );
}

/* ------------------------------------ Button ------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand text-brand-fg hover:opacity-90",
    secondary: "border border-border bg-surface text-foreground hover:bg-background",
    ghost: "text-brand hover:bg-brand-soft",
    danger: "bg-danger text-white hover:opacity-90",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

/* ------------------------------------ Card ------------------------------------ */

export function Card({
  title,
  children,
  aside,
  tone = "default",
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  tone?: "default" | "warn" | "danger" | "ok";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "border-border",
    warn: "border-warn/40",
    danger: "border-danger/40",
    ok: "border-ok/40",
  };
  return (
    <section className={`rounded-xl border ${tones[tone]} bg-surface p-4 shadow-sm ${className}`}>
      {(title || aside) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
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
 */
export function AgentMark({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-warn ${className}`}
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
      <span className={`mb-1 flex items-center gap-2 text-xs font-medium ${missing ? "text-danger" : agent ? "text-warn" : "text-muted"}`}>
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
        {agent && <AgentMark />}
        {optional && <span className="text-[10px] uppercase tracking-wide text-muted/70">{t.common.optional}</span>}
        {missing && <span className="text-[10px] font-semibold lowercase text-danger">{t.common.missing}</span>}
      </span>
      {/* Field box: red ring when a required value is missing, orange ring when the agent filled it. */}
      <div className={`rounded-lg ${missing ? "ring-2 ring-danger/70" : agent ? "ring-1 ring-warn/60" : ""}`}>
        {children}
      </div>
      {agent && note && (
        <span className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-info">
          <Icon name="lightbulb" size={13} className="mt-[1.5px] flex-none" /> {note}
        </span>
      )}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand ${props.className ?? ""}`}
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
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-50"
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------ RadioGroup ------------------------------------ */

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
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            name={name}
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              active ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface hover:bg-background"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------ Pchips (single-select) ------------------------------------ */

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
            onClick={() => (on && onClear ? onClear() : onChange(o.value))}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold transition ${
              on ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-navy-mid hover:border-navy-mid"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------ Seg2 (segmented) ------------------------------------ */

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
    <div className="inline-flex flex-wrap rounded-[10px] border border-border bg-surface2 p-[3px]">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => (on && onClear ? onClear() : onChange(o.value))}
            className={`rounded-[7px] px-4 py-2 text-[13px] font-semibold transition ${on ? "bg-surface text-navy shadow-sm" : "text-muted"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------ SelChips (multi toggle) ------------------------------------ */

/** Prototype `.selchip` — multi-select pill that fills navy with a ✓ when on. */
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
            onClick={() => onToggle(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-bold transition ${
              on ? "border-navy bg-navy text-white" : "border-border bg-surface text-navy-mid hover:border-navy-mid"
            }`}
          >
            {on && <Icon name="check" size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------ MultiChips ------------------------------------ */

export function MultiChips<T extends string>({
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
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(o.value)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              active ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface hover:bg-background"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------ Toggle ------------------------------------ */

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm"
    >
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-brand" : "bg-border"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "start-4" : "start-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------ Stepper ------------------------------------ */

export function Stepper({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-surface">
      <button type="button" className="px-3 py-1.5 text-sm disabled:opacity-40" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="min-w-8 text-center text-sm tabular-nums">{value}</span>
      <button type="button" className="px-3 py-1.5 text-sm disabled:opacity-40" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

/* ------------------------------------ Badge ------------------------------------ */

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ok" | "warn" | "danger" | "brand" }) {
  const tones: Record<string, string> = {
    default: "bg-background text-muted",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    brand: "bg-brand-soft text-brand",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
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
