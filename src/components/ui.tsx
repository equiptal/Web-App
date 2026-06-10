"use client";

import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

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

export function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
        {label}
        {optional && <span className="text-[10px] uppercase tracking-wide text-muted/70">opt</span>}
      </span>
      {children}
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
  options,
}: {
  value: T | null;
  onChange: (v: T) => void;
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
            onClick={() => onChange(o.value)}
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

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="mb-3 text-base font-semibold">{title}</h3>}
        {children}
      </div>
    </div>
  );
}
