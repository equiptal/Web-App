"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/HeaderIcons";
import { CARD_FOOTER, cx, TITLE_CASE } from "@/lib/ds";
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

/**
 * The scrim, shared by the centred dialog and the side drawer so both dim the page identically.
 *
 * ── Why it is BLACK and blurred, not navy (owner, 2026-09-01) ────────────────────────────────────
 *
 * *"How do I make contrast between the modal and the background?"* — asked of the auth dialog, which
 * is `navy-deep`, opened over the guest home, which is a navy hero above navy cards. `navy/45` over
 * that is navy on navy on navy: the scrim darkened the page without separating anything from it, and
 * the panel's own edge dissolved into the picture behind it.
 *
 * Two changes, and neither is a shadow — this app has none:
 *
 *  · **`black/55`.** Black is the one ink that is not in the palette behind it, so it reads as a
 *    dimming of the PAGE rather than as more of the same colour. 55 over 45 because the page it has
 *    to suppress is already dark; on the light surfaces it costs nothing.
 *  · **A 3px blur.** Contrast is not only tone — a sharp photograph competing at full detail behind
 *    a form is what made the excavator look like part of the dialog. Blurring the page removes the
 *    competition outright, which no amount of opacity does.
 */
const SCRIM = "fixed inset-0 z-[60] bg-black/55 backdrop-blur-[3px]";

/**
 * How many dialogs are open, so a NESTED one does not dim the page twice.
 *
 * The share sheet opens from the request modal (owner, 2026-08-31: *"why does the share open like
 * this"*). Two scrims at `navy/45` composite to about 70%: the dialog underneath went muddy, its
 * text unreadable, and the whole surface looked broken rather than layered. The page is already
 * dimmed by the first one — the second only needs to catch a backdrop click.
 *
 * A module counter rather than a context: the shell is used by six surfaces that do not know about
 * each other, and a provider none of them render would dim twice again the day someone forgets it.
 * Mount and unmount are balanced, so React's double-invoked effects in development cancel out.
 */
let openDialogs = 0;

/** The panel's own skin — one radius, one border, one shadow.
 *
 *  `dark` is the SAME shell on the app's navy rather than a second dialog: the auth flow is the one
 *  surface that sells before it asks (owner's comp, 2026-08-30), and it earns a dark ground the way
 *  the home CTA band does. Everything else about the panel — the radius, the sheet behaviour on a
 *  phone, the three ways out, the focus trap — is unchanged, which is the point of it being a tone
 *  and not a new component. */
const PANEL: Record<DialogTone, string> = {
  default: "border border-border bg-surface",
  /* A brighter hairline than `white/10`: on a dark page the panel's own edge is the only line
     saying where it ends, and a tenth of white against a dimmed navy hero is not a line. */
  dark: "border border-white/20 bg-navy-deep text-white",
};

export type DialogTone = "default" | "dark";

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
  /**
   * `onClose` is held in a ref and deliberately NOT a dependency below.
   *
   * Callers write `onClose={() => setThing(null)}`, which is a new function on every render — and a
   * dialog containing a text field re-renders its parent on every keystroke. With `onClose` in the
   * dependency list this effect tore down and re-ran each time: the cleanup handed focus back to the
   * opener, the setup then focused the panel's first focusable, and the caret left the field after
   * ONE character. Every dialog in the app with an input had it.
   *
   * The effect is about OPENING and CLOSING. Reading the latest handler through a ref says that,
   * and asking callers to memoise theirs would only move the trap somewhere it is easier to forget.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Hand focus back to whatever opened this when it closes — otherwise the ring restarts at the top
    // of the document and a keyboard user has to walk the whole page again.
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeRef.current(); return; }
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
  }, [open, panel]);
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
  tone = "default",
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
  /** `dark` puts the same shell on navy — see {@link PANEL}. The floating close follows it. */
  tone?: DialogTone;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogKeys(open, onClose, panel);

  /** True when another dialog was already open when this one mounted — see {@link openDialogs}. */
  const [nested, setNested] = useState(false);
  useEffect(() => {
    if (!open) return;
    openDialogs += 1;
    setNested(openDialogs > 1);
    return () => {
      openDialogs -= 1;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div {...pin("dialog")}
      className={`${nested ? "fixed inset-0 z-[60]" : SCRIM} flex items-end justify-center p-0 sm:items-center sm:p-4`}
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
        className={`relative flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-lg sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg ${PANEL[tone]} ${SIZE[size]}`}
      >
        {/* A dialog whose body supplies its own headings still needs a way out, so the close floats
            in the corner rather than being dropped along with the header. */}
        {!title && !icon && (
          <div className="absolute end-1.5 top-1.5 z-10">
            <DialogClose onClose={onClose} tone={tone === "dark" ? "onDark" : "default"} />
          </div>
        )}

        {(title || icon) && (
          <div {...pin("dialog-header")} className={`flex flex-none items-start gap-3 bg-surface2 px-5 py-3.5 ${flushHeader ? "" : "border-b border-border"}`}>
            {icon && <span className="grid h-[34px] w-[34px] flex-none place-items-center">{icon}</span>}
            <div className="min-w-0 flex-1">
              {title && <h2 className={cx("text-title font-extrabold leading-tight tracking-[-.2px] text-navy", TITLE_CASE)}>{title}</h2>}
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
