"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { fetchActivity, type ActivityCounts } from "@/lib/api/client";
import { useStartRequestGate } from "@/lib/access/start-request-gate";
import { StartYourRequestModal, type StartRequestChoice } from "@/components/home/StartYourRequestModal";
import { btn, cx, PAGE_MAX, PAGE_X } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/** Once per tab, mirroring the app's cold-start trigger. */
const POPUP_SHOWN_KEY = "mt-start-popup-shown";

/**
 * The CTA banner — the photograph, the headline and the one button.
 *
 * ── Why it is a component and not part of the dashboard (owner, 2026-08-30) ─────────────────────
 * It was written inside `HomeHub`, because the dashboard was the only page that had one. Browse now
 * carries the same banner, and a banner copied into two pages is two banners that drift: the comp it
 * is drawn from is one design, and the next change to it has to land in one place.
 *
 * It brings its own machinery rather than taking it as props. "Create request" is not a link — a
 * renter with nothing live is asked Trial-or-Real before the form, and that gate reads the account's
 * open-request count. A caller passing `onCreateRequest` in would have to own that logic, and then
 * both callers would own a copy of it.
 *
 * On BROWSE, for a guest, `fetchActivity` answers for nobody and the gate stays null — so the button
 * goes straight to `/create`, which is the correct behaviour for someone with no account, and the
 * self-raising pop-up below never fires because it needs `offerStartChoice === true`.
 */
export function CtaBanner() {
  const t = useT();
  const router = useRouter();
  const { sessionKey, status } = useSession();
  const [activity, setActivity] = useState<ActivityCounts | null>(null);
  const [startPopup, setStartPopup] = useState(false);
  // Reuses the activity count this screen already loads, so the gate costs one extra /api/me read.
  const offerStartChoice = useStartRequestGate(activity?.openRequests ?? null);

  /* Re-read whenever the ACCOUNT changes, not only on mount (owner, 2026-08-30). Signing in through
     the modal never remounts this page, so with `[]` the counts stayed the guest's — zero requests,
     zero bids — until something forced a reload. `sessionKey` is that change; see its note in
     `lib/session`.

     Nothing is asked for while the session is still resolving: a call made then answers for nobody,
     and the key moves again the moment it lands. */
  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    fetchActivity()
      .then((a) => active && setActivity(a))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionKey, status]);

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
    <>
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
        /* ── Mirrored in Arabic, with the text (owner, 2026-08-30) ─────────────────────────
           The gradients already flip — the ink has to stay under the words, and in Arabic the words
           start on the other edge. The photograph did not, so the composition fought the copy: the
           machines sat on the same side as the headline while the empty sky sat behind nothing.

           `-scale-x-100` flips the picture itself, and `-start` is already logical, so the crop
           offset follows the direction on its own. Safe to mirror because the frame carries no text
           and no lettering on the machines — if a future photograph does, this has to go and the
           image has to be re-shot for both directions instead. */
        /* ── Drawn at the band's own size, not 115% of it (owner, 2026-08-30: *"the image hd"*) ──
           The oversize existed to give `object-fit: cover` slack to crop from. It never needed any:
           `cover` scales the picture to fill the box and crops the overflow itself, which is the
           whole of what it does. What the 115% actually bought was a 1.15× magnification on top of
           the upscale the band already asks for — at a 1920 window the 1584px source was being
           drawn at 2208px — and softness is exactly what that costs.

           `inset-0 h-full w-full`: the smallest scale factor the band can be filled at. */
        className="absolute inset-0 -z-10 h-full w-full max-w-none object-cover rtl:-scale-x-100"
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
              air. ~~This is the ONE arbitrary size in the app.~~ It does not have to be: the scale
              already carries `--text-hero` (32px), added for exactly this — display copy, and
              nothing else. `text-[30px]` failed the design lint, and `next build` runs lint, so it
              took the whole Amplify build down with it (owner, 2026-08-30).

              32 rather than 30 is the only thing that moved, and it moves in the direction the
              note above was already arguing for.

              The sparkle that sat after the headline is gone on the same instruction. It marked
              "the assistant did this", which the sentence already says in words. */}
          {/* `font-hero` is Oswald — a tall condensed grotesque, the only webfont on the app and used
              on this one line. Site signage and equipment livery are set in faces like it, and the
              banner is about machinery (owner, 2026-08-30).

              It runs NARROW, so it takes the tracking back to normal: the -0.3px above was
              pulling Segoe UI's wider letterforms together, and applying it to a condensed face
              closes counters that are already tight. Weight 600 rather than 800 for the same
              reason — Oswald at 800 fills its own counters at this size. */}
          <h1 className="font-hero text-display font-semibold leading-tight text-white sm:text-hero">
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

      {/* mobile/016 — first-request choice: Trial or Real, both into /create. */}
      <StartYourRequestModal open={startPopup} onClose={() => setStartPopup(false)} onChoose={onChooseStart} />
    </>
  );
}
