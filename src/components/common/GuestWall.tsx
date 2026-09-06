"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/Skeleton";
import { useAuthGate } from "@/components/auth/AuthGate";
import { useT } from "@/lib/i18n";
import { btn, CARD, cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * ── What a guest sees on a page that is his once he signs in (owner, 2026-09-06) ─────────────────
 *
 * *"For guest mode can you show dashboard and requests as a blurry page with a sign-in modal at the
 * front, kind of as marketing, like this — using the same style and same modal, but centred."*
 *
 * The reference is Supplier OS's own guarded pages: the surface renders behind, blurred and inert,
 * and a small card sits over the middle of it — «Join Moedatech», then what this page IS, then one
 * line of what it holds, then the one control.
 *
 * ~~A single bordered `SignInPrompt` in an empty column.~~ That is a dead end drawn as a card: it
 * says the page needs an account and shows nothing of what the account is FOR. The shape behind the
 * glass is the argument, which is why this exists at all.
 *
 * ── It is a picture, and it is honest about that ─────────────────────────────────────────────────
 * The backdrop is the page's own SKELETON, not invented data. A guest has no requests, no bids and
 * no suppliers, and rendering plausible-looking rows of somebody's business behind a blur would be
 * inventing a dashboard he does not have. Blocks in the shape of the real thing say «this is where
 * your work goes» without claiming any of it is his.
 *
 * `aria-hidden` and `pointer-events-none` on the backdrop: it is decoration, so a screen reader
 * hears the card and nothing else, and a mouse cannot reach controls that would refuse it anyway.
 */
export function GuestWall({
  title,
  body,
  cta,
  preview,
}: {
  /** What this page is, in the renter's words — «Your dashboard», «Your requests». */
  title: string;
  /** One line of what it holds. Not a pitch; the contents. */
  body: string;
  /** Overrides the button's word where a page has a better one than «Sign in». */
  cta?: string;
  /** The shape behind the glass — one of the `Guest*` previews below. */
  preview: ReactNode;
}) {
  const t = useT();
  const { openAuth } = useAuthGate();
  return (
    <div {...pin("guest-wall")} className="relative min-h-[420px]">
      <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] saturate-[0.85] opacity-60">
        {preview}
      </div>

      {/* Centred over the page, not pinned to its top: the card is the subject and the surface is
          the backdrop, so it sits where the eye already is. `sticky` inside the absolute layer keeps
          it in the middle of the VIEWPORT on a tall page, which is what the OS does. */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className={cx(CARD, "w-full max-w-[380px] overflow-hidden")}>
          <p className="border-b border-border bg-surface2 px-4 py-2.5 text-meta font-semibold text-muted-dark">
            {t.guestWall.join}
          </p>
          <div className="p-4">
            <h2 className="text-subhead font-extrabold text-navy">{title}</h2>
            <p className="mt-1 text-body leading-relaxed text-muted">{body}</p>
            <button type="button" onClick={() => openAuth()} className={btn("primary", "md", { className: "mt-3.5 transition" })}>
              {cta ?? t.shell.signIn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The dashboard's own shape: the CTA band, the requests table beside the bids rail, then a row of
 *  cards for the sites and the suppliers under it. */
export function GuestDashboardPreview() {
  return (
    <div className="flex flex-col gap-7">
      <Skeleton className="h-[132px] rounded-lg" />
      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className={cx(CARD, "overflow-hidden")}>
          <Skeleton className="h-[34px] rounded-none" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-[52px] items-center gap-3 border-b border-border px-3.5 last:border-b-0">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="ms-auto h-3 w-16" />
            </div>
          ))}
        </div>
        <div className={cx(CARD, "overflow-hidden")}>
          <Skeleton className="h-[34px] rounded-none" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-[52px] items-center gap-2.5 border-b border-border px-3 last:border-b-0">
              <Skeleton className="size-7 rounded-full" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-40" />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[168px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** The workspace's own shape: the rail of request circles, then the row of bid cards. */
export function GuestRequestsPreview() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="size-[72px] flex-none rounded-full" />
        ))}
      </div>
      <Skeleton className="h-[46px] rounded-md" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[280px] w-[260px] flex-none rounded-lg" />
        ))}
      </div>
    </div>
  );
}
