"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import { pin } from "@/lib/uiPins";

/**
 * The parts an account-shaped page is built from — a masthead, labelled sections, list rows and
 * label/value pairs (owner, 2026-08-26: one organization page, and a profile that carries settings,
 * "with nice redesign according to our new theme").
 *
 * ── Why this is a file and not a convention ─────────────────────────────────────────────────────
 * `/company` and `/profile` had each arrived at `rounded-sm border border-border bg-surface`
 * independently, written out in both, and then diverged everywhere else: one titled its sections at
 * 11px uppercase and the other at 14px extrabold; one padded cards `p-5`, the other `p-4`; the
 * settings rows had a shape nothing else could reuse. Two pages agreeing by coincidence is not a
 * theme — it is two pages that will disagree at the next edit.
 *
 * ── The scale, which is the app's ───────────────────────────────────────────────────────────────
 * 11px uppercase for a section label, 17px extrabold for a name, 13px for an answer, 12.5px muted
 * for the sentence under it. Controls are 34px, the same as the top bar's. Nothing here invents a
 * size; it names the ones already in use so the next page does not have to guess.
 */

/** The card skin. Exported because a page occasionally needs the box without the label above it. */
export const CARD = "rounded-sm border border-border bg-surface";

/**
 * The navy block a page opens with: who or what this page is about.
 *
 * `/profile` and `/company` both had one and they did not match — 16 vs 12 avatar, 17 vs 17 name but
 * different pills. One shape now, filled differently.
 */
export function PageMasthead({
  icon,
  title,
  subtitle,
  badge,
  tone = "navy",
  iconShape = "square",
  children,
}: {
  /** A mark, a logo, or an initial. Sized by the caller inside a 56px slot. */
  icon?: ReactNode;
  /**
   * Square for a thing, round for a person (owner's references, 2026-08-26).
   *
   * The organization page opens on a rounded-square tile and the profile on a circle, and that is a
   * distinction worth keeping rather than flattening: a circle reads as somebody, a square as
   * something. It is the only difference between the two mastheads.
   */
  iconShape?: "square" | "circle";
  title: ReactNode;
  subtitle?: ReactNode;
  /** The one status worth carrying up here — verified, pending, owner. */
  badge?: ReactNode;
  /**
   * `navy` is a filled block; `plain` is the same shape with no box at all, sitting on the page
   * (owner's reference, 2026-08-26).
   *
   * The organization page opens on `plain`: it is followed immediately by two white cards, and a
   * navy slab above them made the page read as three stacked boxes rather than a subject with its
   * details under it. Profile keeps the block — it has no card directly beneath its masthead.
   */
  tone?: "navy" | "plain";
  /** Actions, under the name rather than beside it, so a long name never squeezes them. */
  children?: ReactNode;
}) {
  const plain = tone === "plain";
  return (
    <div className={plain ? "px-1 pb-1" : "rounded-sm bg-navy p-5 text-white"}>
      <div className="flex items-center gap-4">
        {icon && (
          <span
            className={`grid h-14 w-14 flex-none place-items-center ${iconShape === "circle" ? "rounded-full" : "rounded-sm"} ${
              plain ? "bg-navy text-white" : "bg-white/10"
            }`}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-title font-extrabold leading-tight ${plain ? "text-navy" : ""}`}>{title}</p>
          {subtitle && <p className={`mt-0.5 truncate text-meta ${plain ? "text-muted" : "text-white/65"}`}>{subtitle}</p>}
          {/* On the plain tone the badge takes the trailing edge instead of a third line under the
              name: there is no dark field for it to sit quietly on, so beneath the subtitle it read
              as a fact ABOUT the subtitle. */}
          {badge && !plain && <span className="mt-2 inline-flex items-center gap-1">{badge}</span>}
        </div>
        {badge && plain && <span className="flex-none">{badge}</span>}
      </div>
      {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** A status pill for the masthead. Three tones, and the neutral one is the default. */
export function MastheadPill({
  tone = "neutral",
  /** True on a `plain` masthead: the pill has to carry its own colour, having no navy to sit on. */
  onLight = false,
  children,
}: {
  tone?: "neutral" | "ok" | "warn";
  onLight?: boolean;
  children: ReactNode;
}) {
  const skin = onLight
    ? tone === "ok"
      ? "bg-ok-soft text-ok"
      : tone === "warn"
        ? "bg-warn-soft text-warn"
        : "bg-surface2 text-navy-mid"
    : tone === "ok"
      ? "bg-ok/20 text-white"
      : tone === "warn"
        ? "bg-warn/25 text-white"
        : "bg-white/12 text-white";
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-label font-semibold uppercase tracking-wide ${skin}`}>
      {children}
    </span>
  );
}

/**
 * A labelled group of content. The label sits ABOVE the card rather than inside it: a heading inside
 * a bordered box competes with the box for the job of separating things, and the box wins.
 */
export function Section({
  title,
  hint,
  action,
  children,
  /** Off when the children draw their own boxes — a roster of rows, say. */
  boxed = true,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  /** A control on the label's trailing edge — Edit, Add, Copy. */
  action?: ReactNode;
  children: ReactNode;
  boxed?: boolean;
}) {
  return (
    <section {...pin("page-section")} className="mt-5 first:mt-0">
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && <h2 className="text-label font-semibold uppercase tracking-wide text-muted">{title}</h2>}
            {hint && <p className="mt-1 text-meta leading-snug text-muted">{hint}</p>}
          </div>
          {action && <div className="flex-none">{action}</div>}
        </div>
      )}
      {boxed ? <div className={CARD}>{children}</div> : children}
    </section>
  );
}

/**
 * One row of a list — a setting, a link, a member, a document.
 *
 * Renders as a button when it acts, an anchor when it leaves the app, and a plain row when it only
 * states something. The caller does not pick the element; what it passes decides.
 */
export function Row({
  icon,
  label,
  hint,
  value,
  href,
  onClick,
  danger = false,
  chevron,
  children,
}: {
  icon?: string;
  label: ReactNode;
  hint?: ReactNode;
  /** The answer, on the trailing edge. */
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  /** Force the arrow on or off; by default a row that acts gets one and a row that states does not. */
  chevron?: boolean;
  /** A control instead of a value — a toggle, a pair of buttons. */
  children?: ReactNode;
}) {
  const acts = !!href || !!onClick;
  const showArrow = chevron ?? acts;
  const body = (
    <>
      {icon && (
        <span className={`grid h-[34px] w-[34px] flex-none place-items-center rounded-sm ${danger ? "bg-danger-soft text-danger" : "bg-surface2 text-navy-mid"}`}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-body font-semibold ${danger ? "text-danger" : "text-navy"}`}>{label}</span>
        {hint && <span className="mt-0.5 block text-meta leading-snug text-muted">{hint}</span>}
      </span>
      {children}
      {value != null && <span className="flex-none text-body font-semibold text-muted">{value}</span>}
      {showArrow && <Icon name="chevron_right" size={18} className="flex-none text-muted rtl:scale-x-[-1]" />}
    </>
  );
  const cls = `flex w-full items-center gap-3 px-4 py-3 text-start ${acts ? "transition hover:bg-surface2" : ""}`;

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Hairlines between rows of one card, without each row having to remember to draw one. */
export function RowList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>;
}

/**
 * A label over its answer. Two columns from `sm` up, one on a phone — a CR number beside a VAT
 * number reads as a pair; stacked, each is its own line to scan.
 */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 p-4 sm:grid-cols-2">{children}</dl>;
}

export function Field({
  label,
  value,
  icon,
  ltr = false,
}: {
  label: ReactNode;
  value: ReactNode;
  /**
   * A mark beside the pair (owner's reference, 2026-08-26).
   *
   * Amber-soft, because these are the facts a firm was VERIFIED on and amber is this app's word for
   * "we know this". Optional: a field with no icon still reads as a field, and inventing a glyph for
   * every possible fact would put a meaningless mark next to half of them.
   */
  icon?: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {icon && (
        <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-sm bg-brand-soft text-brand">
          <Icon name={icon} size={17} />
        </span>
      )}
      <div className="min-w-0">
        <dt className="text-label font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-0.5 truncate text-body font-semibold text-navy" dir={ltr ? "ltr" : undefined}>
          {value}
        </dd>
      </div>
    </div>
  );
}

/**
 * One paper, as a row you can open — the shape the owner's reference draws for CR, VAT and the
 * national-address certificate.
 *
 * A document is not a label with an answer: its "value" is the file itself, so the row states the
 * KIND on a badge, names it, and offers the one thing there is to do with it. Where no presigned URL
 * came back — `/verification/docs` 403s for a caller who is not verified — it says «Verified» in
 * green instead of a dead link, which is the same rule the old field-shaped version held.
 */
export function DocPill({ label, url, viewLabel, verifiedLabel }: { label: ReactNode; url: string | null; viewLabel: string; verifiedLabel: string }) {
  const body = (
    <>
      <span className="flex-none rounded-sm bg-navy px-1.5 py-0.5 text-label font-extrabold uppercase tracking-wide text-white">
        PDF
      </span>
      <span className="min-w-0 flex-1 truncate text-body font-semibold text-navy">{label}</span>
      {url ? (
        <span className="flex flex-none items-center gap-1 text-body font-semibold text-brand">
          <Icon name="visibility" size={15} /> {viewLabel}
        </span>
      ) : (
        <span className="flex flex-none items-center gap-1 text-body font-semibold text-ok">
          <Icon name="verified" size={14} /> {verifiedLabel}
        </span>
      )}
    </>
  );
  const cls = "flex items-center gap-2.5 rounded-sm border border-border bg-surface1 px-3 py-2.5";
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`${cls} transition hover:bg-surface2`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
