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
      {/* ⚠️ **The glass was opaque enough to erase the page** (owner, 2026-09-12: *"show the
          background state too, it is totally blank"*). A skeleton is already pale — `surface3` on
          `surface2` — and 60% of it under a blur came out as four grey ghosts on an empty screen,
          which is the opposite of the argument this wall exists to make. At 92% the shape reads as a
          page behind glass while staying unmistakably a placeholder.

          The blur is UNCHANGED at 3px: it is what says «not yours yet», and raising it would put the
          emptiness back by another route. */}
      {/* ⚠️ **`[&_.bg-surface2]:bg-surface3` is what actually made the page visible**, and the opacity
          was only half of it. `Skeleton` paints `surface2` (#f4f4f4), which is 11 levels off white:
          on the page it is a placeholder inside a card the reader is already looking at, and under a
          blur behind a card he is NOT looking at it disappears. One step down the same ramp
          (#e8e8e8) is still unmistakably a placeholder and is a shape you can see.
          It is a variant rather than 30 edited `Skeleton` calls: the tone belongs to the BACKDROP,
          not to the previews, which are ordinary skeletons anywhere else they are drawn. */}
      <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] saturate-[0.85] opacity-[0.92] [&_.bg-surface2]:bg-surface3">
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

/**
 * The dashboard's own shape: the CTA band, the requests table beside the bids rail, then a row of
 * cards for the sites and the suppliers under it.
 *
 * ⚠️ The two SLABS were enriched with the requests page on 2026-09-12, for the same reason and under
 * the same rule: a band and a card get their own furniture (a heading, a line, the control), and no
 * row of them carries a word. ~~`h-[132px]` and `h-[168px]`, empty.~~ A flat rectangle under a blur
 * is a grey patch; what makes a page look like a page is the things INSIDE its boxes.
 */
export function GuestDashboardPreview() {
  return (
    <div className="flex flex-col gap-7">
      {/* The CTA band: what it offers, on the leading edge, with the press opposite it. */}
      {/* ⚠️ Ground `surface`, never `surface2`: the glass darkens every `surface2` to `surface3` so the
          skeletons can be seen, and a band painted in it would come out the same tone as its own
          contents — which is the flat slab this replaces, with different markup. */}
      <div className="flex h-[132px] items-center gap-4 rounded-lg border border-border bg-surface px-6">
        <span className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-3 w-80 max-w-full" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </span>
        <Skeleton className="h-11 w-40 flex-none rounded-md" />
      </div>
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
          <div key={i} className={cx(CARD, "flex h-[168px] flex-col overflow-hidden")}>
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="ms-auto h-2.5 w-10" />
            </div>
            <div className="flex flex-col gap-2.5 p-3.5">
              {Array.from({ length: 3 }, (_, r) => (
                <div key={r} className="flex items-center gap-2.5">
                  <Skeleton className="size-6 flex-none rounded-full" />
                  <Skeleton className="h-2.5 w-28" />
                  <Skeleton className="ms-auto h-2.5 w-10" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The workspace's own shape: the request rail, the tab strip, then the row of bid cards.
 *
 * ⚠️ **It follows the real bands, and it invents no content.** Five circles with a caption under
 * each, two tabs and an export beside them, four cards with a head, three rows and a footer — the
 * FURNITURE of the page. Nothing here carries a name, a price or a date, because a guest has none
 * and a plausible-looking row would be a dashboard he does not have.
 *
 * ~~Three shapes: circles, a bar, four blank rectangles.~~ Under the glass that read as an empty
 * screen with some grey on it, which is the report this replaces. What a card looks like INSIDE is
 * most of what makes the page recognisable.
 */
export function GuestRequestsPreview() {
  return (
    <div className="flex flex-col gap-4">
      {/* The rail band, with its own ground and the rule under it — the real one is full-bleed. */}
      <div className="-mx-4 flex h-[96px] items-center gap-4 border-b border-border bg-surface3/60 px-4 sm:-mx-6 sm:px-6">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex w-[104px] flex-none flex-col items-center gap-1">
            <Skeleton className="size-14 rounded-full" />
            <span className="flex h-[22px] flex-col items-center gap-1">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-2 w-10" />
            </span>
          </span>
        ))}
      </div>

      {/* Cards / Compare, and the export opposite them. */}
      <div className="flex items-end gap-1.5 border-b border-border pb-0">
        <Skeleton className="h-9 w-24 rounded-t-md" />
        <Skeleton className="h-9 w-28 rounded-t-md" />
        <Skeleton className="ms-auto mb-1.5 h-8 w-24 rounded-sm" />
      </div>

      {/* The bid rail. 344px and `flex-none` is the card's OWN width (`BidCards`, 2026-09-09), so the
          fourth one hangs off the edge here the way it does on the real page. */}
      <div className="flex items-stretch gap-3 overflow-hidden pt-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cx(CARD, "flex w-[344px] flex-none flex-col overflow-hidden")}>
            {/* The source strip, the supplier with his price, then the two acts — the real card's
                four bands, in its own order. */}
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="ms-auto size-3.5 rounded-sm" />
            </div>
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <Skeleton className="size-10 flex-none rounded-full" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </span>
              <span className="flex flex-none flex-col items-end gap-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-2.5 w-12" />
              </span>
            </div>
            <div className="flex flex-col gap-2.5 px-3.5 pb-3">
              {Array.from({ length: 3 }, (_, r) => (
                <div key={r} className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="ms-auto h-2.5 w-16" />
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-3 border-t border-border px-3.5 py-3">
              <Skeleton className="size-4 flex-none rounded-sm" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex items-center gap-3 border-t border-border px-3.5 py-3">
              <Skeleton className="size-4 flex-none rounded-sm" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
