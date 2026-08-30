"use client";

import type { ReactNode } from "react";

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
    <div className="grid min-h-[520px] lg:grid-cols-[minmax(0,1fr)_44%]">
      <div className="flex flex-col gap-5 p-7 sm:p-9">
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

      {/* The picture. `isolate` so the gradient over it cannot reach the form column, and
          `aria-hidden` because it says nothing a screen reader needs — the words are all on the left. */}
      <div aria-hidden="true" className="relative isolate hidden overflow-hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/auth-panel.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
        {/* Carried into the ink rather than cut against it: the comp blends the photograph into the
            panel over roughly a third of its width, which is what stops the split reading as two
            pasted rectangles. Mirrored under `rtl:`, since the seam is on the other side there. */}
        <span
          className="absolute inset-0 rtl:hidden"
          style={{ background: "linear-gradient(90deg, var(--navy-deep) 0%, color-mix(in srgb, var(--navy-deep) 55%, transparent) 22%, transparent 60%)" }}
        />
        <span
          className="absolute inset-0 hidden rtl:block"
          style={{ background: "linear-gradient(270deg, var(--navy-deep) 0%, color-mix(in srgb, var(--navy-deep) 55%, transparent) 22%, transparent 60%)" }}
        />
        {/* The same flat multiply the home band uses, so the two photographs sit at one depth. */}
        <span className="absolute inset-0 bg-navy-deep opacity-30 mix-blend-multiply" />
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
      className={`flex-1 rounded-full py-2.5 text-body font-extrabold transition ${
        mode === m ? "bg-surface text-navy" : "text-white/70 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-1 rounded-full border border-white/12 bg-white/[0.06] p-1">
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
    ? "h-[52px] rounded-md border border-white/15 bg-white/[0.07] px-4 text-subhead font-semibold text-white outline-0 transition placeholder:font-semibold placeholder:text-white/35 focus:border-white/40 focus:bg-white/[0.1]"
    : "h-[50px] rounded-md border border-border bg-surface px-4 text-subhead font-semibold text-navy outline-0 placeholder:font-semibold placeholder:text-muted-light focus:border-brand";

export const authLabel = (tone: AuthTone): string =>
  tone === "dark" ? "mb-2 block text-meta font-extrabold text-white/75" : "mb-2 block text-meta font-semibold text-navy-mid";

export const authTitle = (tone: AuthTone): string =>
  tone === "dark"
    ? "mb-2 text-display font-extrabold tracking-[-.5px] text-white"
    : "mb-2 text-center text-display font-extrabold tracking-[-.5px] text-navy";

export const authSub = (tone: AuthTone): string =>
  tone === "dark" ? "mb-6 text-body leading-[1.55] text-white/60" : "mb-6 text-center text-body leading-[1.55] text-muted";

export const authFoot = (tone: AuthTone): string =>
  tone === "dark"
    ? "mt-6 border-t border-white/10 pt-4 text-center text-meta leading-[1.55] text-white/55"
    : "mt-6 text-center text-body leading-[1.55] text-muted";

/**
 * The step's own primary button.
 *
 * On the dark ground it is `--surface` with navy ink, not `--brand`: the comp's one filled control is
 * the lightest thing on the panel, and on navy that is what reads as the way forward. `--brand` is
 * still this app's primary — it simply has no contrast to spend here, where everything around it is
 * already dark and the orange would land beside the logo rather than under the reader's eye.
 */
export const authSubmit = (tone: AuthTone): string =>
  tone === "dark"
    ? "mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-surface text-subhead font-extrabold text-navy transition hover:bg-white disabled:bg-white/25 disabled:text-white/50"
    : "";
