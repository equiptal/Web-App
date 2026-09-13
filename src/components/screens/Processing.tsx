"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useT, useLocale } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Icon } from "@/components/ui";
import { Mansour } from "@/components/Mansour";
import type { EquipmentItem } from "@/lib/contract/draft";
import type { TaxonomyNode } from "@/lib/contract/stores";
import { iconForRef, reelIcons, taxonomyIcons, type TaxonomyIcons } from "@/lib/contract/taxonomy-icons";
import { pin } from "@/lib/uiPins";

/**
 * The agent at work: one ring, the catalogue's own drawing of the machine, one line.
 *
 * ── What the owner asked for ────────────────────────────────────────────────────────────────────
 * 2026-09-12: *"make it very simple processing icon ... no need for steps and many complicated
 * text ... the taxonomy he is thinking of and processing so images of taxonomy in our db will be
 * shown in processing according to what the agent is matching"*.
 * 2026-09-13, on a shot of a lone spinner: *"didnt we say it must show equipment he is trying to
 * map, the ui is so dull"*.
 *
 * ~~A four-stage rail, a four-line activity feed, a percentage pill, a progress bar and a counts
 * line.~~ Six devices narrating a request the server answers in ONE shot. They are gone. What is
 * left is the one thing the renter is waiting to learn — WHICH MACHINE — drawn as the catalogue
 * draws it.
 *
 * ── The two states ──────────────────────────────────────────────────────────────────────────────
 *  · READING — the catalogue is flicked through, a drawing every 380ms, with NOTHING named. That is
 *    the licence for showing them: unnamed and moving they read as a search, which is what is
 *    happening. Naming one would claim a match that has not been made.
 *  · MATCHED — each item the agent returned, in the canvas's own order: its own drawing, its name,
 *    and «Matched from our catalogue» under it.
 *
 * 🔴 **The drawings come from `/api/stores/taxonomy`, NOT from the agents taxonomy.** The first cut
 * read `equipmentImageUrl` off `/api/taxonomy`, found 1 row of 413 with a picture, and drew a glyph
 * because of it — which is the empty screen the owner photographed. The artwork was one endpoint
 * away, the app backend's tree that the browse filters already use, and the ids are the same in
 * both: all 58 agent subtypes resolve to a drawing. See `taxonomy-icons.ts`.
 */

/** How long each matched machine holds the screen. Long enough to read, short enough not to delay. */
const REVEAL_MS = 700;
/** The last beat after the final machine, before the canvas replaces this. */
const HANDOVER_MS = 420;
/** How fast the catalogue is flicked through while the request is still in flight. */
const REEL_MS = 380;

export function Processing() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { state, actions } = useRfq();
  const { busy, error, draft, errorDetail } = state;

  /** The items the agent returned, in the order the canvas will list them. */
  const items: EquipmentItem[] = useMemo(
    () => (draft ? draft.items.filter((i) => !i.removed) : []),
    [draft],
  );

  /** Which machine is on screen. -1 while the request is still in flight. */
  const [at, setAt] = useState(-1);
  const [icons, setIcons] = useState<TaxonomyIcons>(() => new Map());
  const [broken, setBroken] = useState<string | null>(null);
  /** Where the reel has got to while reading. Meaningless once there is an answer. */
  const [spin, setSpin] = useState(0);

  /* The app backend's tree, for its drawings alone. A separate request from the agents taxonomy the
     store already holds, and a cheap one: the browse filters fetch the same thing, and it works
     signed out — which this flow needs, because a guest can run the whole of it. */
  useEffect(() => {
    let live = true;
    fetch("/api/stores/taxonomy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { taxonomy: TaxonomyNode[] }) => {
        if (live) setIcons(taxonomyIcons(d.taxonomy ?? []));
      })
      .catch(() => {
        /* No drawings. The screen still reads — Mansour holds the ring and the line still says what
           is happening. A failed picture must never stop the request the renter is waiting on. */
      });
    return () => {
      live = false;
    };
  }, []);

  const done = !busy && !!draft && !error;
  const reel = useMemo(() => reelIcons(icons), [icons]);

  useEffect(() => {
    if (busy) setAt(-1);
  }, [busy]);

  // The reel, while reading. It stops the moment there is something real to show.
  useEffect(() => {
    if (done || !reel.length) return;
    const id = setInterval(() => setSpin((n) => n + 1), REEL_MS);
    return () => clearInterval(id);
  }, [done, reel.length]);

  // One machine at a time, then the canvas. Nothing here is paced against a clock while the request
  // is in flight — the reveal starts when the answer does.
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
   * What is in the ring: the matched machine's drawing, else whatever the reel is on.
   *
   * An off-catalogue line has no ref at all and resolves to nothing, which is right — the catalogue
   * has no drawing of a machine it does not carry, and Mansour holds the ring instead.
   */
  const picture = item ? iconForRef(icons, item.ref) : reel.length ? reel[spin % reel.length] : null;

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

  return (
    <ProcessingView
      imageUrl={picture && broken !== picture ? picture : null}
      title={item ? name : t.processing.reading}
      caption={item ? t.processing.matched : null}
      onImageError={() => setBroken(picture)}
    />
  );
}

/**
 * What the screen actually draws, with the state taken out of it.
 *
 * Split from {@link Processing} so `dev/preview` can photograph its states: the screen is on its
 * feet for a few seconds inside a flow that needs a session, a project and a live agent, which is
 * not a thing anyone can look at while changing it. This is the real component — `Processing`
 * renders this and nothing else.
 */
export function ProcessingView({
  imageUrl,
  title,
  caption,
  onImageError,
}: {
  /** The catalogue's drawing of the machine on screen, or null for the agent alone. */
  imageUrl: string | null;
  /** One line: what is happening, or — once there is an answer — the machine. */
  title: string;
  /** Drawn only under a machine's name, to mark it as a finding rather than a label. */
  caption: string | null;
  onImageError?: () => void;
}) {
  return (
    <div {...pin("create-processing")} className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 text-center">
      {/* ── The ring, and what is inside it ────────────────────────────────────────────────────────
          ONE moving thing besides the picture. A 3px ring of `brand` at a sixth strength with a
          solid quarter turning through it: the design system's own orange, no gradient, no glow, no
          second tile. It never reports a POSITION, because there is none to report — the server
          answers this request in one shot, which is what the bar and the percentage pill were
          pretending otherwise about.

          144px, not 104. The screen holds three things and a viewport of air; at the smaller size it
          read as a spinner somebody forgot to build a page around (owner, 2026-09-13: *"the ui is so
          dull"*).

          `object-contain`: these are flat DRAWINGS carrying their own transparent margin, and
          cropping one enlarges the margin rather than the machine — the requests rail's own note,
          2026-08-31. Its other rule, the 1.34 scale, belongs to a 52px circle where a letterboxed
          drawing leaves more hole than machine; at 118px there is room to simply fit it. */}
      <span className="relative grid h-[144px] w-[144px] flex-none place-items-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-[3px] border-brand/15 border-t-brand motion-safe:animate-spin"
          style={{ animationDuration: "1.1s" }}
        />
        <span className="grid h-[118px] w-[118px] place-items-center overflow-hidden rounded-full bg-surface2">
          {imageUrl ? (
            /* ── A URL that fails falls back to the agent ──────────────────────────────────────
               A plain `<img>`, the same as the requests rail and for the same two reasons. The
               taxonomy's objects are not public-read on every environment, so a well-formed URL can
               answer 403 and `onError` is the only signal a client gets; and `next/image` would need
               this S3 host in `next.config.ts`'s `remotePatterns`, which it is not — it throws at
               render rather than degrading, which is the opposite of what this slot needs.

               `key` on the URL so a swap is a NEW element: without it the browser keeps the old
               pixels until the next decode, and the reel stutters instead of flicking. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={imageUrl}
              src={imageUrl}
              alt=""
              draggable={false}
              onError={onImageError}
              /* ⚠️ Scaled PAST its box, and only safe because the parent is `overflow-hidden
                 rounded-full`. These drawings carry a wide transparent margin of their own - at a
                 plain `contain` fit the machine filled under half the circle and the tile read as
                 empty, which is the report this answers. 1.25 is measured off the catalogue's own
                 art, not chosen: it fills the disc without the widest drawings touching its edge. */
              className="h-full w-full scale-[1.25] object-contain"
            />
          ) : (
            /* No drawing — an off-catalogue line, or the tree failed to load. The agent holds the
               ring rather than an empty grey disc. */
            <Mansour size={72} state="live" />
          )}
        </span>

        {/* ── He keeps the corner whenever the ring holds a machine ─────────────────────────────
            The machine is the subject and he is the one who found it: a mark on the trailing-bottom
            edge, on the app's own ground so he reads as standing ON the tile rather than inside it.
            This is where the old screen's green «it is running» dot sat, and it does that job with
            something that also says WHO. */}
        {imageUrl && (
          <span className="absolute -bottom-1 -end-1 grid h-[38px] w-[38px] place-items-center rounded-full border border-border bg-surface">
            <Mansour size={30} state="live" />
          </span>
        )}
      </span>

      {/* One line. While the request is in flight it says what is happening; from the moment the
          answer lands it says the MACHINE, which is the only thing here worth reading. The caption
          under it is what makes the name a FINDING rather than a label — without it a machine name
          alone on a loading screen reads as the thing being waited for. */}
      <div className="flex min-h-[56px] max-w-[420px] flex-col items-center gap-1.5">
        <p className="text-title font-extrabold tracking-tight text-navy">{title}</p>
        {caption && <p className="text-meta font-semibold text-muted">{caption}</p>}
      </div>
    </div>
  );
}
