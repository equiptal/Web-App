"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import { fetchActivity, type ActivityCounts } from "@/lib/api/client";
import { HomeRequests } from "@/components/home/HomeRequests";
import { ProjectsSurface } from "@/components/projects/ProjectsSurface";
import { StartYourRequestModal, type StartRequestChoice } from "@/components/home/StartYourRequestModal";
import { useStartRequestGate } from "@/lib/access/start-request-gate";
import { btn, cx, PAGE_MAX, PAGE_X } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * mobile/016 — once-per-tab guard for the AUTOMATIC first-request pop-up, mirroring the app's
 * `TrialColdStartGuard`: it self-raises on the renter's first landing on home, and a client-side
 * re-render or an in-tab return to home doesn't re-raise it. Dismissing leaves the server-side slot
 * open, so it returns on the next visit (fresh tab / reload) — app parity (AC-20). Tapping
 * **Create request** is a separate, explicit trigger and is NOT subject to this guard.
 */
const POPUP_SHOWN_KEY = "start-request-popup-shown";

/* ~~`DARK_GRADIENT` and `GRID_STYLE`.~~ Both went with the gradient hero the CTA band replaced
   (owner's comp, 2026-08-29). The gradient had no reader outside this file, and the grid overlay's
   other user — the login page — declares its own copy in `AuthBrand.tsx`, so nothing here was
   shared with it. The band's ground is a photograph with two overlays; see the hero below. */

/**
 * Renter web home hub (web-app/004, AC-04/05/07/10/25). A gradient-to-dark hero (pitch left, Create-
 * request + Upload-RFQ buttons right), then the requests-and-bids block and the suggested suppliers.
 *
 * ── Two blocks removed (owner, 2026-08-30) ──────────────────────────────────────────────────────
 * The **activity tiles** (Your Requests / Price Bids / Completed Deals) and the **new-bids banner**
 * are gone. Both counted the same things `HomeRequests` states directly one block below — the tiles
 * as three numbers behind three links, all of which went to `/requests`, and the banner as a fourth
 * copy of the bid count that went there too. A page that says the same number four times and offers
 * the same door each time is not four features.
 *
 * `activity` is still fetched: `useStartRequestGate` reads `openRequests` from it.
 */
export function HomeHub() {
  const t = useT();
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityCounts | null>(null);
  const [startPopup, setStartPopup] = useState(false);
  // Reuses the activity count this screen already loads, so the gate costs one extra /api/me read.
  const offerStartChoice = useStartRequestGate(activity?.openRequests ?? null);

  useEffect(() => {
    let active = true;
    fetchActivity()
      .then((a) => active && setActivity(a))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // mobile/016 (AC-01/22/23) — self-raise the pop-up once per tab on landing, mirroring the app's
  // cold-start trigger. The explicit "Create request" path below doesn't depend on this.
  useEffect(() => {
    if (offerStartChoice !== true) return;
    try {
      if (window.sessionStorage.getItem(POPUP_SHOWN_KEY) === "1") return;
      window.sessionStorage.setItem(POPUP_SHOWN_KEY, "1");
    } catch {
      /* storage blocked → still show it, just without the once-per-tab guard */
    }
    setStartPopup(true);
  }, [offerStartChoice]);

  // "Create request": when the renter has nothing live, ask Trial-or-Real FIRST instead of dropping
  // straight into the form. Otherwise (they already have active requests) go straight to /create as
  // before. `offerStartChoice` is null while unknown → never blocks the button.
  const onCreateRequest = () => {
    if (offerStartChoice === true) {
      setStartPopup(true);
      return;
    }
    router.push("/create");
  };

  // Both choices go through the normal RFQ flow ("Write your RFQ"); `mode` only tells the flow whether
  // the eventual submit is a trial. Dismissing does nothing — the slot stays open (AC-20).
  const onChooseStart = (choice: StartRequestChoice) => {
    setStartPopup(false);
    router.push(`/create?mode=${choice}`);
  };


  return (
    <div {...pin("home-hub")} className="flex flex-col gap-7">
      {/* ── The CTA band (owner's comp, «Moedatech Create Request CTA», 2026-08-29) ───────────────
          ~~A 220px gradient block: an eyebrow pill, a hero-scale headline, a paragraph, and the
          button stacked to its side.~~ Replaced by the comp, which says the same thing in 160px and
          says it better.

          What the comp changes, and why each part earns its place:
           · **A photograph, not a gradient.** The block is about equipment; a site at dusk says that
             in the half-second before a word is read, and the old grid-and-blur said only "this is a
             header". The image is 15% oversized and offset so `object-fit: cover` has slack to crop
             from at any width without ever showing an edge.
           · **Two overlays, not one.** A left-to-right gradient (94% → 42%) so the text sits on ink
             and the machines stay visible on the trailing side, then a flat navy `multiply` at 35%
             to pull the whole photograph's contrast down under the copy. One overlay dark enough for
             the text would have flattened the picture to a texture.
           · **The headline names the ACT.** «Let AI find your next equipment», with AI as its own
             token in the brand's ink — the comp colours that one word and nothing else, which is
             what makes it read as the subject rather than as decoration.
           · **One button, and it is the block's only control.** «Upload RFQ» is not lost: the create
             flow's own first step offers it, and a second button here made the renter choose between
             two doors before he knew what was behind either.

          The palette is the repo's tokens, not the comp's hexes: `--brand` for the button (the one
          primary orange this app uses everywhere) and `--brand-light` for the word and the sparkle,
          which is the accent the new-bids banner already wears on a dark ground. */}
      <div
        {...pin("home-hero")}
        /* ── Full window, and flush under the nav bar (owner, 2026-08-30) ────────────────────
           *"Set the cta width for full window fit and for height stick it to the nav bar, same as
           prototype."*

           Two escapes, because the shell wraps every page in both a cap and a gutter
           (`PAGE_MAX` and `PAGE_X`) and the comp's band has neither:

            · **Across** — `w-screen` with `-ms-[50vw]` off the container's own midpoint. A logical
              margin, not `-ml`, so it escapes the same way in Arabic. `body { overflow-x: clip }`
              takes the scrollbar's width of overhang that `100vw` always carries; the rule there
              records why it is `clip` and not `hidden`.
            · **Up** — `PAGE_Y`'s top half, **plus one pixel** (owner, 2026-08-30: *"small white line
              between the banner and the nav bar"*). Cancelling the padding alone leaves the header's
              own `border-b border-white/10` drawing between the two: on a light page that border is
              invisible, but against this dark band it is the only thing with any lightness in it, so
              it reads as a seam. The extra pixel slides the band under it. Written against `PAGE_Y`'s
              own numbers (1.5rem / 1.75rem); if that rhythm changes, this follows it.

           The rounding goes with the gutter: a radius on a band whose corners are off-screen draws a
           notch against the header and nothing else. The COPY keeps the page's reading gutter, so
           the headline still lines up with the blocks below it. */
        className="relative isolate -mt-[calc(1.5rem+1px)] flex h-[160px] w-screen items-center overflow-hidden sm:-mt-[calc(1.75rem+1px)]"
        /* `calc(50% - 50vw)`, and the 50% is of the CONTAINER — the padded, capped main. That centres a
           100vw child on a container which is itself centred in the viewport, which lands the band on
           the window's edges at every width. Inline because a Tailwind arbitrary value cannot mix the
           two units, and logical (`marginInlineStart`) so it escapes the same way in Arabic. */
        style={{ marginInlineStart: "calc(50% - 50vw)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/home-cta-site.webp"
          alt=""
          aria-hidden="true"
          /* `max-w-none` is load-bearing (owner, 2026-08-30: *"why the image doesn't fit the full
             width"*). Tailwind's Preflight sets `img, video { max-width: 100%; height: auto }`, and
             a WIDTH utility cannot beat a MAX-WIDTH declaration — different property, so it clamps
             whatever the layer order. `w-[115%]` was therefore rendering at 100%, and the `-7.5%`
             offset pushed that 100% off the leading edge, leaving exactly 7.5% of the band bare on
             the trailing side: 143px at a 1910px window. The overlays kept painting that strip, so
             it read as a flat grey block rather than as a missing photograph.

             The height never had this problem, which is why only one side showed it: `h-[115%]`
             overrides `height: auto` because they ARE the same property. */
          className="absolute -start-[7.5%] -top-[7.5%] -z-10 h-[115%] w-[115%] max-w-none object-cover"
          style={{ objectPosition: "center 55%" }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--navy) 94%, transparent) 0%, color-mix(in srgb, var(--navy) 75%, transparent) 45%, color-mix(in srgb, var(--navy) 42%, transparent) 100%)",
          }}
        />
        {/* RTL takes the same gradient mirrored — the ink has to be under the words, and in Arabic
            the words start on the other side. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden rtl:block"
          style={{
            background:
              "linear-gradient(270deg, color-mix(in srgb, var(--navy) 94%, transparent) 0%, color-mix(in srgb, var(--navy) 75%, transparent) 45%, color-mix(in srgb, var(--navy) 42%, transparent) 100%)",
          }}
        />
        <span aria-hidden="true" className="absolute inset-0 -z-10 bg-navy opacity-[0.35] mix-blend-multiply" />

        <div className={cx("relative mx-auto flex w-full items-center gap-6", PAGE_MAX, PAGE_X)}>
          <div className="min-w-0 flex-1">
            {/* A BLOCK, not a flex row: the three text nodes are one sentence, and as flex items the
                spaces between them collapse and the row's own `gap` stands in for them — which sets
                the word spacing of a headline from a layout property. Inline flow keeps the spaces
                the copy actually carries, in both scripts. */}
            {/* Larger than the type scale's six sizes, and deliberately so (owner, 2026-08-30: *"you
                can make the font bigger in the banner as we have space"*). The band is a fixed 160px
                carrying two lines of copy, so `--text-display` (22px) left most of that height as
                air. This is the ONE arbitrary size in the app; it is a hero, not a heading in a card,
                and giving it a scale token would invite it into layouts where 30px is shouting.

                The sparkle that sat after the headline is gone on the same instruction. It marked
                "the assistant did this", which the sentence already says in words. */}
            <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.3px] text-white sm:text-[30px]">
              {t.home.ctaTitleBefore}
              <span className="text-brand-light">{t.home.ctaTitleAi}</span>
              {t.home.ctaTitleAfter}
            </h1>
            <p className="mt-2.5 max-w-[480px] text-subhead leading-relaxed text-white/70">{t.home.ctaSubtitle}</p>
          </div>

          {/* Single entry into the RFQ input flow (web-app/002). */}
          <div {...pin("home-hero-actions")} className="flex-none">
            <button onClick={onCreateRequest} className={btn("primary", "lg", { className: "transition" })}>
              <Icon name="add" size={16} /> {t.home.createRequest}
            </button>
          </div>
        </div>
      </div>

      {/* ── The requests, and the bids beside them (owner, 2026-08-29) ────────────────────────────
          The dashboard's first block, above the activity tiles: what is out to the market, how long
          each one still takes bids, and what has come back — the two halves of one question, on one
          row. It draws nothing for a renter with no requests, so a new account still opens on the
          hero and the suppliers. */}
      <HomeRequests />

      {/* ── The sites, under the requests (owner, 2026-08-30) ──────────────────────────────
          Not a route of its own. A renter's sites are part of the picture the dashboard already
          draws — what is out to the market, what came back, and what is standing on the ground — so
          they sit in that column rather than behind a tab that has to be remembered.

          It renders nothing for a guest or a renter with no sites, so a new account sees exactly
          today's dashboard. */}
      <ProjectsSurface embedded />

      {/* Suggested suppliers — filter bar always shown; View all only adds cards (AC-05/10/11/12/13) */}
      <BrowseSurface title={t.home.suppliersTitle} previewCount={8} />

      {/* mobile/016 — first-request choice: Trial or Real, both into /create. */}
      <StartYourRequestModal open={startPopup} onClose={() => setStartPopup(false)} onChoose={onChooseStart} />
    </div>
  );
}

