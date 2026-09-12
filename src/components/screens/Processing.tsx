"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useT, useLocale } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Icon } from "@/components/ui";
import { Mansour } from "@/components/Mansour";
import type { EquipmentItem } from "@/lib/contract/draft";
import { resolveRef } from "@/lib/contract/taxonomy";
import { publicTaxonomyUrl } from "@/lib/contract/requests";
import { pin } from "@/lib/uiPins";

/**
 * The agent at work: one ring, one picture, one line.
 *
 * ── What the owner asked for (2026-09-12) ───────────────────────────────────────────────────────
 * *"make it very simple processing icon that is aligned with our design system and no need for
 * steps and many complicated text he is doing, i want something simple and the taxonomy he is
 * thinking of and processing so images of taxonomy in our db will be shown in processing according
 * to what the agent is matching"*.
 *
 * ~~A four-stage rail, a four-line activity feed, a percentage pill, a progress bar and a counts
 * line.~~ Five devices narrating one request that the server answers in one shot. They are gone.
 * What is left is the thing the renter is actually waiting to learn: WHICH MACHINE the agent
 * decided he meant, shown as the catalogue's own picture of it with its catalogue name under it.
 *
 * ── The two states, and why only one of them names anything ─────────────────────────────────────
 *  · IN FLIGHT - the glyph, and «Reading your request». Nothing is named and no picture is shown,
 *    because nothing has been matched yet. The old screen filled this gap with paced lines about
 *    scanning and extracting; they were true about what was SENT and read as findings.
 *  · MATCHED - each item the agent returned, in the order the canvas will list them: its taxonomy
 *    picture, its name. This is the reveal, and the wait is what pays for it.
 *
 * 🔴 **The picture is `equipmentImageUrl`, and the catalogue has almost none of them.** Measured
 * against the live agents taxonomy on 2026-09-12: 413 nodes, **one** carrying
 * `equipment_image_url`, and no other image field on that payload at all. So today this screen
 * draws the glyph for nearly every machine, and the pictures arrive with no further web change as
 * the admin panel fills that column. The drawings on the requests rail come from the REQUEST
 * projection (`subtypeImageUrl` / `categoryImageUrl`), which does not exist before the request does
 * and therefore cannot be read here.
 *
 * ⚠️ **Nothing is invented to fill the wait.** Cycling catalogue pictures while the request is in
 * flight was considered and refused: a picture on this screen means «this is what the agent matched
 * you to», and showing machines it has not chosen would make the one honest use of the slot
 * unreadable.
 */

/** How long each matched machine holds the screen. Long enough to read, short enough not to delay. */
const REVEAL_MS = 620;
/** The last beat after the final machine, before the canvas replaces this. */
const HANDOVER_MS = 420;

export function Processing() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { state, actions } = useRfq();
  const { busy, error, draft, errorDetail, taxonomy } = state;

  /** The items the agent returned, in the order the canvas will list them. */
  const items: EquipmentItem[] = useMemo(
    () => (draft ? draft.items.filter((i) => !i.removed) : []),
    [draft],
  );

  /** Which machine is on screen. -1 while the request is still in flight. */
  const [at, setAt] = useState(-1);
  const [broken, setBroken] = useState<string | null>(null);

  const done = !busy && !!draft && !error;

  useEffect(() => {
    if (busy) setAt(-1);
  }, [busy]);

  // One machine at a time, then the canvas. Nothing here is paced against a clock while the request
  // is in flight - the reveal starts when the answer does.
  useEffect(() => {
    if (!done) return;
    if (at + 1 < items.length) {
      const id = setTimeout(() => setAt((n) => n + 1), at < 0 ? 0 : REVEAL_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => actions.enterWizard(), HANDOVER_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, at, items.length]);

  const item: EquipmentItem | null = at >= 0 ? items[at] ?? null : null;

  /**
   * The catalogue's picture of this machine: the subtype's, else its category's.
   *
   * Read off the taxonomy the browser already holds for the dropdowns, so this costs no request.
   * An off-catalogue line has no ref at all and resolves to nothing, which is correct - the
   * catalogue has no picture of a machine it does not carry.
   */
  const picture = useMemo(() => {
    if (!item) return null;
    const { category, subcategory } = resolveRef(taxonomy, item.ref);
    return publicTaxonomyUrl(subcategory?.equipmentImageUrl ?? category?.equipmentImageUrl ?? null);
  }, [item, taxonomy]);

  /** What the agent resolved this line to, named as the canvas will name it. */
  const name = useMemo(() => {
    if (!item) return "";
    const a = item.agentNames;
    const sub = a ? (ar ? a.subtypeAr || a.subtype : a.subtype) : "";
    const cap = a ? (ar ? a.capacityAr || a.capacity : a.capacity) : "";
    return [sub, cap].filter(Boolean).join(" ") || item.rawLabel || t.processing.oneMachine;
  }, [item, ar, t]);

  /* ----------------------------- Error (AC-09 / AC-10) — clear modal ----------------------------- */
  if (error) {
    const isEmpty = error === "empty";
    // Distinguish the agent's real failure (forwarded from Mansour) from a plain connection drop, so the
    // reason is clear: 429 = busy/rate-limited, 402/403 = unavailable (usage/credits/auth).
    const bs = errorDetail?.backendStatus;
    const agentBusy = bs === 429;
    const agentDown = bs === 402 || bs === 403;
    const title = isEmpty ? t.errors.emptyTitle : agentBusy ? t.errors.busyTitle : agentDown ? t.errors.unavailableTitle : t.errors.networkTitle;
    const body = isEmpty ? t.errors.emptyBody : agentBusy ? t.errors.busyBody : agentDown ? t.errors.unavailableBody : t.errors.networkBody;
    const icon = isEmpty ? "search_off" : agentBusy ? "hourglass_empty" : agentDown ? "cloud_off" : "wifi_off";
    return (
      /* ── The shared dialog, keeping its own shape (owner, 2026-08-28: one design for every modal)
         ─────────────────────────────────────────────────────────────────────────────────────────
         It drew its own scrim, panel, and close — and its own focus handling, which is to say none.
         `Dialog` supplies all four.

         It passes NO title, deliberately. A failure is read from the middle out: the glyph, then
         what went wrong, then the way back. Putting that title into a header bar at the leading edge
         would make this look like every panel and read like none of them. A title-less dialog floats
         its close in the corner, which is exactly the control this was hand-rolling. */
      <Dialog open onClose={() => actions.goIntake()} size="sm">
        <div className="text-center">
          <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full ${isEmpty || agentBusy ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"}`}>
            <Icon name={icon} size={34} />
          </div>
          <h2 id="proc-err-title" className="text-title font-extrabold tracking-tight text-navy">{title}</h2>
          <p className="mx-auto mt-2 max-w-[300px] text-body leading-relaxed text-muted">{body}</p>
          {errorDetail?.detail && (
            <p className="mx-auto mt-3 max-w-[320px] break-words rounded-sm bg-surface3 px-3 py-2 text-start font-mono text-label leading-snug text-muted">{errorDetail.detail}</p>
          )}
          <Button className="mt-6 w-full py-3 text-subhead" onClick={() => actions.process()}>
            <Icon name="refresh" size={19} /> {t.common.retry}
          </Button>
        </div>
      </Dialog>
    );
  }

  return <ProcessingView imageUrl={picture && broken !== picture ? picture : null} title={item ? name : t.processing.reading} caption={item ? t.processing.matched : null} onImageError={() => setBroken(picture)} />;
}

/**
 * What the screen actually draws, with the state taken out of it.
 *
 * Split from {@link Processing} so `dev/preview` can photograph both of its states: the screen is
 * on its feet for about four seconds inside a flow that needs a session, a project and a live
 * agent, which is not a thing anyone can look at while changing it. This is the real component -
 * `Processing` renders this and nothing else.
 */
export function ProcessingView({
  imageUrl,
  title,
  caption,
  onImageError,
}: {
  /** The catalogue's picture of the machine on screen, or null for the glyph. */
  imageUrl: string | null;
  /** One line: what is happening, or - once there is an answer - the machine. */
  title: string;
  /** Drawn only under a machine's name, to mark it as a finding rather than a label. */
  caption: string | null;
  onImageError?: () => void;
}) {
  return (
    <div {...pin("create-processing")} className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-4 text-center">
      {/* ── The ring, and what is inside it ────────────────────────────────────────────────────────
          ONE moving thing on the screen. A 2px ring of `brand` at a fifth strength with a solid
          quarter turning through it: the design system's own orange, no gradient, no glow, no
          second tile. It never reports a POSITION, because there is none to report - the server
          answers this request in one shot, which is what the bar and the percentage pill were
          pretending otherwise about.

          The picture sits INSIDE the ring rather than beside it, so the machine is the subject and
          the spinner is its frame, and it takes `object-cover`.

          🔴 **`object-contain` was tried here first and looked at.** These are PHOTOGRAPHS -
          `equipment_image_url`, 1408x768 on the one node that has one, 1.83:1 - so contain drew a
          76x41 band across the middle of a round hole with empty crescents above and below, the
          machine tiny in a circle that is mostly nothing. That is the same fault the requests rail
          measured on 2026-08-31 and answered the same way: a photograph reaches its own edges, so
          it wants the crop. The rail's OTHER rule, the 1.34 scale, belongs to the taxonomy DRAWINGS
          and is not copied - no drawing can reach this screen (see the note at the top). */}
      <span className="relative grid h-[104px] w-[104px] flex-none place-items-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-[3px] border-brand/15 border-t-brand motion-safe:animate-spin"
          style={{ animationDuration: "1.1s" }}
        />
        <span className="grid h-[84px] w-[84px] place-items-center overflow-hidden rounded-full bg-surface2">
          {imageUrl ? (
            /* ── A URL that fails falls back to the glyph ──────────────────────────────────────
               A plain `<img>`, the same as the requests rail and for the same two reasons. The
               taxonomy's equipment objects are NOT public-read on staging, so a well-formed URL
               answers 403 and `onError` is the only signal a client gets; and `next/image` would
               need this S3 host in `next.config.ts`'s `remotePatterns`, which it is not - it throws
               at render rather than degrading, which is the opposite of what this slot needs. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              onError={onImageError}
              className="h-full w-full object-cover"
            />
          ) : (
            /* ── MANSOUR is what is waited on, so he is what is drawn (owner, 2026-09-13) ──────
               *"use this mansour kit that represent the agent, use it in the processing"*.

               ~~A `precision_manufacturing` glyph.~~ A generic machine icon on the one screen whose
               subject is the AGENT: it said «equipment» where the honest word was «him». He is at
               56px inside the 84px well, `is-live` - the kit's working state, a small bob - so the
               ring turning around him and his own bob are the two halves of one idea.

               ⚠️ There is no artwork FALLBACK problem here: he is drawn, not fetched, and the
               stylesheet stops every one of his animations under `prefers-reduced-motion`. */
            <Mansour size={56} state="live" />
          )}
        </span>

        {/* ── Once there is a picture, he keeps the corner ──────────────────────────────────────
            The machine becomes the subject and he becomes the one who found it: a 30px mark on the
            trailing-bottom edge, on the app's own ground so he reads as standing ON the tile rather
            than inside it. `is-live` stays, because he still is.

            This is where the old screen's green «it is running» dot sat, and it is doing that job
            with something that also says WHO. */}
        {imageUrl && (
          <span className="absolute -bottom-0.5 -end-0.5 grid h-[34px] w-[34px] place-items-center rounded-full border border-border bg-surface">
            <Mansour size={26} state="live" />
          </span>
        )}
      </span>

      {/* One line. While the request is in flight it says what is happening; from the moment the
          answer lands it says the MACHINE, which is the only thing here worth reading. The caption
          under it is what makes the name a FINDING rather than a label - without it a machine name
          alone on a loading screen reads as the thing being waited for. */}
      <div className="flex min-h-[52px] max-w-[420px] flex-col items-center gap-1">
        <p className="text-subhead font-extrabold tracking-tight text-navy">{title}</p>
        {caption && <p className="text-meta font-semibold text-muted">{caption}</p>}
      </div>
    </div>
  );
}
