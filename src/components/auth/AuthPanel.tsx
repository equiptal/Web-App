"use client";

import type { ReactNode } from "react";
import { btn } from "@/lib/ds";

/**
 * **The auth modal's dark shell** (owner's comp, 2026-08-30).
 *
 * *"Use this for sign in and create account modal but make it matched to our web theme and colors."*
 *
 * Two columns inside the one dialog panel: the form on navy, a photograph of a site beside it. It is
 * the only modal in the app that sells while it asks, and that is the whole argument for the ground
 * being dark — the same argument the home CTA band makes. Every other dialog stays on `--surface`.
 *
 * ── What is the comp's, and what is ours ────────────────────────────────────────────────────────
 * The comp's SHAPE is kept: logo top-start, a pill toggle above the headline, the form under it, a
 * rule, then a footnote — and the picture bleeding off the trailing edge with a gradient carrying it
 * into the ink rather than a hard seam.
 *
 * The comp's COLOURS are not. It ships `#1f2d3a` / `#eda153` and a white-on-black form; this uses
 * `--navy-deep`, `--brand` and `--surface`, which are the same three the home band and the primary
 * button already wear. A modal that introduced two new hexes would be a second palette living in the
 * one surface every user meets first.
 *
 * ── The photograph is the owner's own comp ──────────────────────────────────────────────────────
 *
 * `/auth-panel.webp` is the excavator arm from his sign-in reference (2026-08-31).
 *
 * ~~Lifted out of the comp itself — a screenshot-sourced asset, and therefore softer than a real
 * export would be.~~ **The owner supplied the photograph on 2026-09-06** and it is that file now:
 * 1920×1071, cropped 3:4 around the linkage (the subject sits right of centre; the blurred yard on
 * the left is what the mark and the top gradient sit on), resized to 900×1200 for retina and
 * encoded at WebP q82 — 85 KB, a hair over the screenshot it replaces and genuinely sharp.
 *
 * Nothing else references the file, so swapping it again is a one-line job: keep the 3:4 portrait,
 * because this panel is a column and `object-cover` will crop anything wider from the middle, which
 * is where this photograph keeps its subject.
 *
 * 🔴 **Superseded 2026-09-22** (owner: *"use this image exactly as it is in the sign in to look
 * somehow like this"*, with a comp where the photograph IS the whole card). The file is his image
 * uncropped now, 1920×1071, WebP q86. It fills the entire panel, anchored to its right edge, with no
 * mask, no navy multiply and no top/bottom ramp: the form sits on the photograph's own dark, blurred
 * yard, which is dark enough for white ink on its own. The 3:4 crop and the masked 62% layer below
 * are gone with that.
 *
 * ── What the comp has that this does not ────────────────────────────────────────────────────────
 * **The «5.0 ★★★★★ from 200+ reviews» row and its avatar stack.** Deliberately absent: we hold no
 * rating and no review count, and a number invented for a layout is a claim about the business that
 * a renter would reasonably rely on. The slot is where it was — put real figures behind
 * {@link AuthPanelProps.trust} and it draws.
 *
 * ── Below `lg` ──────────────────────────────────────────────────────────────────────────────────
 * The picture is dropped rather than stacked. A photograph above a form on a phone pushes the field
 * the renter came to fill below the fold, and this dialog is a sheet against the bottom edge there.
 */
export interface AuthPanelProps {
  /** The step's own form — it brings its own heading, so the shell states none. */
  children: ReactNode;
  /** The segmented Phone / Email toggle, when the step has one. Absent on the code screen. */
  toggle?: ReactNode;
  /** Social proof, when there is any that is TRUE. See the note above on why this is empty today. */
  trust?: ReactNode;
}

export function AuthPanel({ children, toggle, trust }: AuthPanelProps) {
  return (
    /* `relative isolate`, because the picture is no longer a COLUMN — it is a layer under the whole
       panel, and the form sits on top of it. See the note on the picture below. */
    <div className="relative isolate grid min-h-[520px] lg:grid-cols-[minmax(0,1fr)_44%]">
      <div className="relative z-10 flex flex-col gap-5 p-7 sm:p-9">
        {/* The mark, in white. `brightness(0) invert(1)` rather than a second asset: one logo file,
            and a colourway that cannot fall out of step with it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/moedatech-logo.png" alt="Moedatech" className="h-8 w-auto self-start [filter:brightness(0)_invert(1)]" />

        {toggle}

        <div className="flex-1">{children}</div>

        {trust && (
          <div className="border-t border-white/10 pt-4">{trust}</div>
        )}
      </div>

      {/* ── The picture: the WHOLE panel, exactly as supplied (owner, 2026-09-22) ─────────────────
          ~~Masked into a 62% layer on the trailing edge, tinted navy, ramped top and bottom
          (2026-08-31).~~ The photograph is the card now: `object-cover` over the full panel, anchored
          to the right so the linkage stays in view and the blurred yard lands under the form.
          Mirrored in Arabic, where the form is on the right, so the dark side is still under it. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/auth-panel.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-right rtl:-scale-x-100" />
      </div>
    </div>
  );
}

/**
 * The Phone / Email toggle, in the comp's shape: one dark track, the chosen side a light pill.
 *
 * A real pair of buttons with `aria-pressed`, not a radio group dressed as one — it switches which
 * form is mounted, which is a control, not a value being collected.
 */
export function AuthToggle({
  mode,
  onMode,
  phoneLabel,
  emailLabel,
}: {
  mode: "phone" | "email";
  onMode: (m: "phone" | "email") => void;
  phoneLabel: string;
  emailLabel: string;
}) {
  const seg = (m: "phone" | "email", label: string) => (
    <button
      type="button"
      onClick={() => onMode(m)}
      aria-pressed={mode === m}
      /* `rounded-md`, the app's own control radius, not the comp's capsule (owner, 2026-08-30: use
         our theme). Every control in this product — button, field, chip — is `rounded-md`; a pair of
         full capsules at the top of the one modal every user meets first taught a shape that appears
         nowhere else in it. The weight stays `font-extrabold` — the scale has three (400/600/800) and
         a control label is the top one. */
      className={`flex-1 rounded-md py-2.5 text-body font-extrabold transition ${
        mode === m ? "bg-surface text-navy" : "text-white/70 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-1 rounded-lg border border-white/12 bg-white/[0.06] p-1">
      {seg("phone", phoneLabel)}
      {seg("email", emailLabel)}
    </div>
  );
}

/**
 * **The auth form's skin on the dark ground**, in one place.
 *
 * Held here rather than spelled at each field because there are five of them across three steps —
 * phone, country, email, code, and the code screen's resend — and a hairline that drifted between
 * two of them is the kind of thing nobody sees and everybody feels. `light` is the existing skin,
 * unchanged, so a caller that has not been converted looks exactly as it did.
 */
export type AuthTone = "light" | "dark";

export const authField = (tone: AuthTone): string =>
  tone === "dark"
    ? "h-[var(--control-lg)] rounded-md border border-white/15 bg-white/[0.07] px-4 text-subhead font-semibold text-white outline-0 transition placeholder:font-semibold placeholder:text-white/35 focus:border-white/40 focus:bg-white/[0.1]"
    : "h-[50px] rounded-md border border-border bg-surface px-4 text-subhead font-semibold text-navy outline-0 placeholder:font-semibold placeholder:text-muted-light focus:border-brand";

export const authLabel = (tone: AuthTone): string =>
  tone === "dark" ? "mb-2 block text-meta font-extrabold text-white/75" : "mb-2 block text-meta font-semibold text-navy-mid";

export const authTitle = (tone: AuthTone): string =>
  tone === "dark"
    ? "mb-2 text-display font-extrabold capitalize tracking-[-.5px] text-white"
    : "mb-2 text-center text-display font-extrabold capitalize tracking-[-.5px] text-navy";

export const authSub = (tone: AuthTone): string =>
  tone === "dark" ? "mb-6 text-body leading-[1.55] text-white/60" : "mb-6 text-center text-body leading-[1.55] text-muted";

export const authFoot = (tone: AuthTone): string =>
  tone === "dark"
    ? "mt-6 border-t border-white/10 pt-4 text-center text-meta leading-[1.55] text-white/55"
    : "mt-6 text-center text-body leading-[1.55] text-muted";

/**
 * The step's own primary button — **the app's**, not a shape invented for this panel.
 *
 * ~~`--surface` with navy ink, in a full capsule: the comp's one filled control is the lightest thing
 * on it, and on navy that is what reads as the way forward.~~ Withdrawn (owner, 2026-08-30: use our
 * theme). It was a white pill of a size and radius that exist nowhere else in the product, and its
 * disabled state — the state a renter meets FIRST, before typing a digit — was a dead grey slab that
 * was still the loudest object on the panel.
 *
 * It is `btn("primary", "lg", { full: true })` now: `--brand`, the app's one primary, at the app's
 * radius, height and weight. The same button the home CTA band puts on the same navy.
 *
 * The one override is the DISABLED skin. `--disabled-bg` is `--surface2`, a pale slate meant for a
 * white page; on navy it is a light block shouting from the middle of a dark panel. On this ground
 * the disabled button recedes instead — a dimmed fill and dimmed ink, the treatment `MastheadPill`
 * already uses for the same "this token has a dark counterpart" reason.
 */
export const authSubmit = (tone: AuthTone): string =>
  tone === "dark"
    ? btn("primary", "lg", {
        full: true,
        className:
          "mt-6 transition disabled:border-transparent disabled:bg-white/10 disabled:text-white/40",
      })
    : btn("primary", "lg", { full: true, className: "mt-6 flex transition" });
