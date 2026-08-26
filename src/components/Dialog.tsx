"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/HeaderIcons";
import { CARD_FOOTER, cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * The one dialog shell (owner, 2026-08-26: "i want consistent layout for these modals in terms of ui
 * and fonts and size etc so all modal and forms of our system has same design theme").
 *
 * ── What it replaces ────────────────────────────────────────────────────────────────────────────
 * Six surfaces, six different answers to the same questions:
 *
 *   scrim     black/40 · black/45 · navy/40 · navy-deep/50 · a gradient in a stylesheet
 *   radius    12 · 16 · 18 · 20
 *   width     448 · 512 · 560 · 880 (and one at 440 as a side sheet)
 *   title     16 semibold · 18 extrabold · 18 black · 20 extrabold · 22 extrabold
 *   close     a 36px chip · a 34px ring · a bare glyph · nothing at all
 *
 * None of that was decided; it accumulated. One of the six even styled itself from a separate CSS
 * file. What follows is a single answer to each question, so a reader who has opened one dialog knows
 * where the title, the close and the buttons will be in the next.
 *
 * ── The shape ───────────────────────────────────────────────────────────────────────────────────
 * Header, body, footer — and only the BODY scrolls. A dialog whose whole panel scrolls takes its own
 * title and its confirm button off screen, which is how you end up with a «Save» nobody can find.
 *
 * `size` is a named width rather than a number at the call site: four sizes is a decision, and
 * `max-w-[537px]` in one file is not.
 *
 * ── Getting out ─────────────────────────────────────────────────────────────────────────────────
 * Three ways, on every dialog, because the owner asked for exactly that: click the backdrop, press
 * Escape, or press the X. Several of these surfaces used to offer one of the three — one offered
 * none but the backdrop, which on a phone means guessing where the panel ends.
 *
 * Focus is trapped while a dialog is open and handed back to whatever opened it on close. Tab from
 * the last field cycles to the first rather than walking into the page behind, which was reachable
 * but invisible, and could be typed into.
 */

export type DialogSize = "sm" | "md" | "lg" | "xl";

/** Four widths, and no fifth. `xl` is for a dialog showing a document, not a form. */
const SIZE: Record<DialogSize, string> = {
  sm: "max-w-[420px]",
  md: "max-w-[520px]",
  lg: "max-w-[640px]",
  xl: "max-w-[880px]",
};

/** The scrim, shared by the centred dialog and the side drawer so both dim the page identically. */
const SCRIM = "fixed inset-0 z-[60] bg-navy/45";

/** The panel's own skin — one radius, one border, one shadow. */
const PANEL = "border border-border bg-surface";

/** Anything a keyboard can land on, in the order it would reach them. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Escape, the focus trap, and giving focus back.
 *
 * The trap is a Tab handler rather than an `inert` on the page behind: `inert` needs every sibling of
 * the dialog to be marked, and the dialog is rendered at the end of the body by a portal-less React
 * tree, so there is no reliable list of siblings to mark. Cycling the ring is what the panel itself
 * can guarantee.
 */
function useDialogKeys(open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;

    // Hand focus back to whatever opened this when it closes — otherwise the ring restarts at the top
    // of the document and a keyboard user has to walk the whole page again.
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) { e.preventDefault(); return; }
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, onClose, panel]);
}

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = "md",
  footer,
  children,
  /** Drops the header rule — for a dialog whose body starts with its own coloured band. */
  flushHeader = false,
  padded = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** A mark beside the title. Sized by the caller; the slot is 34px, the bar's own control size. */
  icon?: ReactNode;
  size?: DialogSize;
  footer?: ReactNode;
  children: ReactNode;
  flushHeader?: boolean;
  /** Off for a body that brings its own edges — a multi-step flow, or a document in an iframe. */
  padded?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogKeys(open, onClose, panel);
  if (!open) return null;

  return (
    <div {...pin("dialog")}
      className={`${SCRIM} flex items-end justify-center p-0 sm:items-center sm:p-4`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      /* Print hooks. A caller that wants to print only its own dialog needs to name the scrim and the
         panel from a stylesheet, and should not have to know how either is built to do it. */
      data-dialog-scrim=""
    >
      {/*
        Full-bleed at the bottom of a phone, centred with a margin from `sm` up. A 520px panel
        floating in the middle of a 390px screen is a card with nowhere to go; against the bottom
        edge it is a sheet, which is what a phone expects.

        `100dvh` rather than `100vh`: on a phone the address bar makes `vh` lie, and a dialog sized
        against the lie puts its footer under the browser's own chrome.
      */}
      <div {...pin("dialog-panel")}
        ref={panel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-dialog-panel=""
        className={`relative flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-sm sm:max-h-[calc(100dvh-2rem)] sm:rounded-sm ${PANEL} ${SIZE[size]}`}
      >
        {/* A dialog whose body supplies its own headings still needs a way out, so the close floats
            in the corner rather than being dropped along with the header. */}
        {!title && !icon && (
          <div className="absolute end-1.5 top-1.5 z-10">
            <DialogClose onClose={onClose} />
          </div>
        )}

        {(title || icon) && (
          <div {...pin("dialog-header")} className={`flex flex-none items-start gap-3 px-5 py-3.5 ${flushHeader ? "" : "border-b border-border"}`}>
            {icon && <span className="grid h-[34px] w-[34px] flex-none place-items-center">{icon}</span>}
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-title font-extrabold leading-tight tracking-[-.2px] text-navy">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-meta leading-snug text-muted">{subtitle}</p>}
            </div>
            <DialogClose onClose={onClose} />
          </div>
        )}

        {/* The ONLY scrolling region. See the note at the top on why the panel itself must not. */}
        <div className={`min-h-0 flex-1 overflow-y-auto ${padded ? "px-5 py-4" : ""}`}>{children}</div>

        {footer && (
          <div className={cx(CARD_FOOTER, "flex-none")}>{footer}</div>
        )}
      </div>
    </div>
  );
}

/**
 * A dialog that arrives from the trailing edge instead of the middle — for a surface you READ
 * alongside the page rather than answer and dismiss, which is the request drawer's whole job.
 *
 * Same scrim, same header, same footer, same type. Only the geometry differs, and it differs because
 * the content does.
 */
export function DialogDrawer({
  open,
  onClose,
  title,
  subtitle,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Replaces the standard header outright, for a drawer with a coloured masthead of its own. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useDialogKeys(open, onClose, panel);
  if (!open) return null;

  return (
    <>
      <div className={SCRIM} onClick={onClose} />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 end-0 z-[61] flex w-full max-w-[440px] flex-col border-s border-border bg-surface"
      >
        {header ?? (
          (title || subtitle) && (
            <div className="flex flex-none items-start gap-3 border-b border-border px-5 py-3.5">
              <div className="min-w-0 flex-1">
                {title && <h2 className="text-title font-extrabold leading-tight tracking-[-.2px] text-navy">{title}</h2>}
                {subtitle && <p className="mt-0.5 text-meta leading-snug text-muted">{subtitle}</p>}
              </div>
              <DialogClose onClose={onClose} />
            </div>
          )
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className={cx(CARD_FOOTER, "flex-none")}>{footer}</div>}
      </aside>
    </>
  );
}

/**
 * The close control, exported because a drawer with its own masthead still has to close the same way.
 *
 * 34px, and the same hairline glyph the top bar uses — a dialog is chrome, and the app has one set of
 * chrome icons now. `tone="onDark"` for a coloured masthead.
 */
export function DialogClose({ onClose, tone = "default" }: { onClose: () => void; tone?: "default" | "onDark" }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={`grid h-[34px] w-[34px] flex-none place-items-center rounded-full transition ${
        tone === "onDark" ? "text-white/70 hover:bg-surface/10 hover:text-white" : "text-muted hover:bg-surface2 hover:text-navy"
      }`}
    >
      <CloseIcon size={18} />
    </button>
  );
}

/**
 * The buttons a dialog closes with.
 *
 * Three tones and no more. `primary` is the thing the dialog is FOR, `ghost` is the way out, and
 * `danger` is the one that cannot be undone — every dialog in the app should be describable in those
 * terms, and one that is not is probably two dialogs.
 *
 * Height is fixed at 40px so a row of them lines up whatever their labels say.
 */
export function DialogButton({
  tone = "ghost",
  full = false,
  className = "",
  ...rest
}: {
  tone?: "primary" | "ghost" | "danger";
  /** Fill the row — for a dialog whose footer holds one button. */
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const skin =
    tone === "primary"
      ? "bg-brand text-white"
      : tone === "danger"
        ? "bg-danger text-white"
        : "border border-border bg-surface text-navy-mid hover:border-navy-mid";
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-sm px-4 text-body font-semibold transition disabled:bg-disabled-bg disabled:text-disabled-fg ${
        full ? "w-full" : ""
      } ${skin} ${className}`}
    />
  );
}

/** Pushes whatever follows it to the trailing edge of a dialog footer. */
export function DialogSpacer() {
  return <span className="flex-1" />;
}
