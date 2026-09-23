"use client";

/**
 * **V7 — equipment detail** (spec 004 v3 §6.5; AC-14, AC-36, AC-37). Replaces the panel with one
 * machine.
 *
 * **Usage** — standalone. It mounts nothing and owns no route; the panel shell (another ticket) renders
 * it in place of the equipment list when the renter presses «التفاصيل ›».
 *
 *   <EquipmentDetail
 *     machine={machine}                     // FleetMachine — the only data shape this surface has
 *     request={bid}                         // MatchRequest: reqEquipmentCerts · operatorCertReq ·
 *                                           // reqMinYear (+ attachmentIds). A BidCard satisfies it.
 *     ar={ar} L={L}                         // component-local bilingual pattern (a later ticket
 *                                           // lifts these strings into i18n)
 *     onBack={() => setDetail(null)}
 *     onRequest={(draft) => compose(draft)} // PanelRequestDraft — V11 owns the composer
 *   />
 *
 * Five parts, in this order:
 *  1. a **196 px viewer** — the machine's photo, a circular back control, «تكبير» / «تحميل» as icons,
 *     and a caption strip naming what is in the frame; the machine is identified by sight first.
 *     **It is a viewer, and it now has a second subject**: press a row on the documents tab — or a
 *     GREEN match cell, which opens the same paper (UAT of 2026-08-11) — and that paper is what the
 *     frame holds (owner, 2026-08-11 — the prototype's `eqViewer`, *"one frame, two subjects"*). The
 *     frame's state lives HERE because the frame does; the two tabs report the press. Pressing what is
 *     already framed is the way back to the photograph — the frame carries no X (owner, same UAT).
 *  2. **two underline tabs** — «Equipment» · its documents
 *  3. **the yard card** — the fleet list's own control (`.bm-eq-yard`), carrying the distance, the
 *     yard and a small «not confirmed» badge, and opening the layer that explains the colour and
 *     offers the ask (owner, 2026-09-08). ~~A 20px distance with a band word and an availability chip
 *     on the far corner, over a titled paragraph saying red is not a refusal.~~
 *  4. **the match grid** — six cells scoring this machine against *this request*
 *  5. ~~a 76 px footer carrying two asks.~~ Removed (owner, 2026-09-08): the availability ask is the
 *     yard card in 3, and «ask for another one» is the fleet list's own control one press behind this
 *     panel. The documents tab keeps its own action bar.
 *
 * **It answers "does this machine fit my request", not "what is this machine."** There is no
 * specification dump here on purpose: a list of attributes hands the renter the judging, and the grid
 * exists to do the judging and show its working. Descriptive facts live on the card (V5).
 *
 * **Colour comes from `unitAvailability()` and nothing else** — never from the `yardConfirmed` boolean,
 * which supplier-side is just `yardId != null` and would turn every card green (`bid-map.ts:64`,
 * AC-19). The yard card here and the machine's pin must be the same fact.
 */

import { useCallback, useMemo, useState } from "react";
import { distanceDigits, isOutOfCity, unitAvailability } from "@/lib/contract/bid-map";
import type { FleetMachine } from "@/lib/contract/fleet";
import { useDownloadBatch } from "./doc-download";
import { EquipmentDocuments, type DocViewSubject } from "./EquipmentDocuments";
import {
  arDigits,
  equipmentDocGroups,
  heroPhotoUrl,
  matchGrid,
  type DocDownloadTarget,
  type MatchRequest,
  type PanelRequestDraft,
} from "./machine-panel-model";
import "./panel-proto.css";
import { PhotoPlaceholder } from "@/components/Photo";
import { pin } from "@/lib/uiPins";

const MARK: Record<"green" | "grey" | "red", string> = { green: "✓", grey: "—", red: "!" };

/**
 * The viewer's three tools, as line art (owner, 2026-08-11 — see `.mp-tools` in `panel-proto.css` for
 * why they stopped being words). Each path list is the prototype's own, off `eqViewer`'s `ico()`
 * (`app-decoded.js` 4280–4300) at its `15px` / `2.2` stroke, so the glyphs are the ones the design was
 * drawn with rather than a second set chosen by us. `aria-hidden`: every one of them sits inside a
 * control that carries the whole sentence on its `aria-label`.
 */
const GLYPH = {
  enlarge: ["M4 10V4h6", "M20 14v6h-6", "M4 4l7 7", "M20 20l-7-7"],
  download: ["M12 3v12", "M7 11l5 5 5-5", "M4 20h16"],
  /* ~~`close` — not the prototype's; it has no way back to the photograph because its back arrow leaves
     the machine altogether. Ours does not, so the frame needs a door out of the document it is
     holding.~~ **Removed by the owner's UAT of 2026-08-11** — *"the X button must be removed"*, and the
     prototype agrees with him. The door it argued for is real and is still there; it is the row itself.
     Pressing the framed row (or the framed match cell) a second time returns the frame to the machine's
     photograph, so the way out is the control the renter used to come in, rather than a third glyph
     stacked on the corner of the photograph he is trying to look at. */
} as const;

function Ico({ paths }: { paths: readonly string[] }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export interface EquipmentDetailProps {
  machine: FleetMachine;
  /** The request's asks. Structurally satisfied by a `BidCard`, which already carries them. */
  request: MatchRequest;
  ar: boolean;
  L: (en: string, ar: string) => string;
  /** Back to the equipment list. */
  onBack: () => void;
  onRequest?: (draft: PanelRequestDraft) => void;
  /**
   * Whether this exact ask is already with the lessor and unanswered — the owner's "one ask, one
   * card" rule (2026-08-10). Asked of the host, because the conversation that records these cards is
   * V12's and this panel cannot see it; answered against the same composer the ask would have been
   * sent through, so the panel never invents a second spelling of what "the same question" means.
   */
  askPending?: (draft: PanelRequestDraft) => boolean;
  /**
   * **The yard card was pressed** — the surface decides what happens next (owner, 2026-09-08:
   * *"clicking it whether from the details or from the fleet will open this"*). It is the SAME
   * handler `EquipmentList` is given, so the layer, the explain-once rule and the ask behind it are
   * one thing rather than two spellings of it. `asked` says whether his question is already out.
   */
  onYardPress?: (machine: FleetMachine, asked: boolean) => void;
  /**
   * Which tab the panel opens on. Defaults to the machine, which is what a renter who pressed a
   * card came to see. `"documents"` is for arriving from `View documents` in the requests workspace,
   * where the papers ARE the errand — landing on the machine would make him press one more time to
   * reach what he asked for.
   */
  initialTab?: "machine" | "documents";
}

export function EquipmentDetail({ machine, request, ar, L, onBack, onRequest, askPending, onYardPress, initialTab }: EquipmentDetailProps) {
  const [tab, setTab] = useState<"machine" | "documents">(initialTab ?? "machine");

  /* ── The frame's second subject (owner, 2026-08-11) ─────────────────────────────────────────────
     What the viewer is holding instead of the machine's photograph, or null for the photograph. It
     lives here rather than in the documents tab because the FRAME is here; the tab reports a press
     and reads back which row is framed, exactly as it hands an ask up and reads back whether it is
     pending.

     `framedFailed` is the url of a file the browser would not render as an image. There is no MIME to
     read — these are presigned links on a private bucket, and this directory has twice refused to
     sniff one — so the honest test is to try. A PDF, a DWG or a corrupt scan fires `onError` once and
     the frame says so in words with a way out, rather than showing the broken-image glyph and letting
     the renter conclude the supplier uploaded nothing. */
  const [framedDoc, setFramedDoc] = useState<DocViewSubject | null>(null);
  const [framedFailed, setFramedFailed] = useState<string | null>(null);
  /* A different machine is a different set of papers, so a document from the last one cannot stay in
     the frame. Adjusted during render off a key we keep ourselves — the host is not obliged to remount
     this component per machine, and an effect would paint the wrong paper for one frame first. */
  const [framedFor, setFramedFor] = useState(machine.equipmentId);
  if (framedFor !== machine.equipmentId) {
    setFramedFor(machine.equipmentId);
    setFramedDoc(null);
    setFramedFailed(null);
  }

  /* **ONE way in and out of the frame** (owner, 2026-08-11, after the X was removed). Pressing what is
     already framed puts the machine's photograph back — the control that opened a paper is the control
     that closes it, on the documents tab's rows and on the match grid's cells alike, so neither surface
     needs a close button of its own and there is no state where a paper is stuck in the frame.
     Identified by the ROW's key rather than by the url, so the two subjects a `DocViewSubject` can name
     are told apart even when one machine files the same paper twice. */
  const frame = useCallback((subject: DocViewSubject) => {
    setFramedDoc((cur) => (cur?.key === subject.key ? null : subject));
    setFramedFailed(null);
  }, []);

  const cells = useMemo(() => matchGrid(machine, request), [machine, request]);
  const hero = heroPhotoUrl(machine);
  const availability = unitAvailability(machine);
  // Every group's outstanding rows, so the tab badge agrees with the headings inside it. The groups are
  // request-dependent — a paper nobody asked for is not outstanding, and cannot be counted here — so
  // the badge reads the same `request` the grid above it is scored against.
  //
  // ~~A group whose `attention` is `null` adds nothing — it is not zero, it is a group that makes no such
  // claim (the operator's, owner 2026-08-08).~~ That group left the tab in the UAT of 2026-08-11, and
  // with it the only `null` this sum ever had to survive. Every row this badge counts is now a row the
  // renter can tick, ask for or open.
  const docAttention = useMemo(
    () => equipmentDocGroups(machine, request).reduce((n, g) => n + g.attention, 0),
    [machine, request],
  );

  const title = [machine.manufacturer, machine.modelName].filter(Boolean).join(" ").trim();
  const kind = (ar ? machine.subcategoryNameAr : machine.subcategoryName) || machine.subcategoryName;
  const size = (ar ? machine.measurementNameAr : machine.measurementName) || machine.measurementName;
  const caption = [kind, size].filter(Boolean).join(" · ");
  const km = machine.distanceKm;
  /* ── A yard we cannot place does not get to name itself (owner, 2026-09-12) ──────────────────────
     *"can we solve it without backend?"* — this is the half that needed answering. `yardName` is
     printed VERBATIM, so the «Unspecified yard» in his screenshot is the backend's own row: a
     placeholder, with `(0, 0)` for coordinates, reading on the card as though somebody had named the
     place. The web cannot tell a placeholder NAME from a real one — but it can tell that this yard
     resolved to no position at all, and a yard that cannot be placed has nothing to say about where
     the machine is. So the name is withheld and the cell says «Location not specified» on its own.

     ⚠️ «Placed» is deliberately **a point OR a distance**, not a point alone. The platform can know
     how far a yard is without publishing where it is, and `yard-card.test.tsx` has always fixed a
     machine at 12.4 km with no coordinates — gating on the point alone blanked that yard's name too.
     A yard nothing can place in EITHER sense is the one that has nothing to say. */
  const anchored = machine.lat != null || machine.distanceKm != null;
  const yard = anchored ? machine.yardName || machine.yardCity : null;
  const outOfCity = isOutOfCity(km);
  const heroName = title || kind || L("Equipment", "المعدّة");

  /* ── One ask, one card (owner, 2026-08-10) ──────────────────────────────────────────────────────
     The availability ask, composed ONCE and used for both verbs: the object that would be sent is
     the object the guard is asked about, so the yard card cannot read «asked» for an ask it would
     not have made, or stay unasked for one it already did.

     ~~`alternativeAsk` beside it.~~ Gone with the footer that raised it (owner, 2026-09-08): «ask for
     another one» lives on the fleet list, one press behind this panel.

     The copy is written inline through `L`, not pulled from the dictionary, because that is how this
     whole directory takes its words (see the file header) — a panel that reached for `useT` for one
     sentence would be the only one that did. */
  const availabilityAsk: PanelRequestDraft = { kind: "availability", equipmentId: machine.equipmentId };
  const availabilityPending = askPending?.(availabilityAsk) ?? false;
  /** The disabled control says what it is waiting for rather than going quietly inert. «المورد» is
   *  this surface's word for the other party, matching the prototype — the owner's ruling of
   *  2026-08-10, which reversed an earlier one that had this surface saying «المؤجّر». */
  const pendingWhy = L(
    "You've already asked this, and the supplier hasn't answered yet.",
    "سبق أن طلبت هذا، ولم يردّ المورد بعد.",
  );

  /* The yard card's state as ONE word rather than three booleans read in four places — the fleet
     card's own `yard` variable, so the two surfaces cannot end up with four states between them.
     `null` is the machine whose availability is `absent` (an unidentified unit, AC-58): it gets the
     card WITHOUT a skin, a badge or a press, because none of the three would be a fact about it. */
  const yardState: "ok" | "asked" | "no" | null =
    availability === "absent"
      ? null
      : availability === "confirmed"
        ? "ok"
        : availabilityPending
          ? "asked"
          : "no";

  // «تحميل» saves the photo through the same batch runner the document lists use, for the same reason
  // it exists: `<a download>` on a cross-origin presigned url is ignored by the browser and navigates
  // the panel away instead (`doc-download.ts`). One file is a batch of one.
  const photoLabel = useCallback((t: DocDownloadTarget) => L(t.label.en, t.label.ar), [L]);
  const { running: savingPhoto, run: savePhoto } = useDownloadBatch(photoLabel);

  /* **ONE subject, resolved once**, and every one of the frame's parts reads it: the image, the two
     tools and the caption. The document when there is one, the machine's photograph otherwise, and
     nothing at all when the machine has no photograph either — which is the state that gives the tools
     nothing to act on and is why they render off this rather than off `hero`. */
  const framed: DocViewSubject | null = framedDoc ?? (hero ? { key: "hero", name: heroName, url: hero, kind: "photo" } : null);
  const framedBroken = framed != null && framedFailed === framed.url;

  return (
    <div {...pin("equipment-detail")} className="mp" dir={ar ? "rtl" : "ltr"}>
      {/* **A VIEWER, not a hero** (2026-08-09): `196px`, a circular back control, its tools on the
          opposite corner (pills then, icons since 2026-08-11), and a caption STRIP rather than a
          gradient scrim. The scrim dimmed the
          photograph in order to write over it the two facts the panel repeats underneath anyway; a
          white strip under the image leaves the image alone and still names what is being looked at.
          The prototype's own frame, and the owner's screenshot's. */}
      {/* `.doc` is the prototype's taller frame for a paper (268 px over its `var(--surface2)`) — a certificate
          at 196 px is a picture of a certificate. The `photo` / `paper` half decides how the file sits
          in it, and comes off the ROW'S GROUP rather than off its url; see `DocViewSubject.kind`. */}
      <div {...pin("equipment-detail-viewer")} className={`mp-viewer${framedDoc ? ` doc ${framedDoc.kind}` : ""}`}>
        {framed == null ? (
          /* The placeholder rather than the sentence (owner, 2026-09-02): the frame is 196px of
             photograph-shaped space, and what belongs in it when there is no photograph is the shape of
             one. The words stay as the label, so a screen reader still hears the fact. */
          <div className="mp-hero-empty" aria-label={L("No photo on this equipment's file", "لا توجد صورة على ملف هذه المعدّة")}>
            <PhotoPlaceholder />
          </div>
        ) : framedBroken ? (
          /* **The paper renders HERE, not in a message about the paper** (owner, UAT of 2026-08-11 —
             *"the document does not render at the top"*, over a screenshot of this very state). What he
             pressed was a PDF, and `<img>` cannot draw one, so the frame said so and offered a tab.

             `<object>` can draw one: every browser this app supports renders a PDF inline with its own
             viewer, and an `<object>` picks the viewer off the RESPONSE's content type rather than off a
             guess we made about the url — which is the MIME sniffing this directory has twice refused to
             do. It is the second attempt rather than the first because `<img>` is the right element for
             a photograph and most of what is framed here is one.

             **And the message is not lost — it is the fallback.** An `<object>` renders its children
             when it cannot display its data, so a DWG or a corrupt scan still lands on the same sentence
             and the same way out it landed on before, with no detection code of ours in between. */
          <object className="mp-frame-doc" data={framed.url} aria-label={framed.name}>
            <div className="mp-hero-empty">
              <span>{L("This file can't be shown here.", "لا يمكن عرض هذا الملف هنا.")}</span>
              <a href={framed.url} target="_blank" rel="noopener noreferrer">
                {L("Open it in a new tab", "افتحه في تبويب جديد")}
              </a>
            </div>
          </object>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={framed.url} alt={framed.name} onError={() => setFramedFailed(framed.url)} />
        )}
        <button type="button" className="mp-back" onClick={onBack} aria-label={L("Back to the equipment", "العودة إلى المعدّات")} title={L("Back to the equipment", "العودة إلى المعدّات")}>
          <span aria-hidden="true">{ar ? "›" : "‹"}</span>
        </button>

        {/* **ICONS, not words** (owner, 2026-08-11). ~~LABELLED pills rather than bare glyph circles,
            which is the prototype's own note on them: a 32 px circle with an unfamiliar icon in it is a
            guess.~~ Withdrawn by the owner against the prototype and against its comment. The objection
            it raised is answered instead of ignored: every one of these carries `aria-label` AND
            `title`, so the name is on the control for a screen reader and one hover away for everyone
            else — an icon-only control with neither announces as "button", which is the actual defect
            the pill was protecting against.

            «تكبير» opens the file at its own size in a new tab — the same "a tab is the whole viewer"
            decision `DocRowList` records for presigned urls, and for the same reason: a modal would
            need the MIME strategy nothing on this surface is allowed to guess at. Both act on whatever
            the frame is HOLDING, so on a document they save and enlarge that document and not the
            machine's photograph behind it. */}
        {framed && (
          <div className="mp-tools">
            {/* ~~Only while a document is in the frame: the way back to the machine's photograph.~~
                **Removed on the owner's word** (UAT of 2026-08-11): the frame carries no X. The state it
                existed for cannot arise — pressing the framed row or cell again is the way back (see
                `frame` above) — so what is gone is the third glyph, not the exit. */}
            <a
              className="mp-tool solid"
              href={framed.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={L("Enlarge", "تكبير")}
              title={L("Enlarge", "تكبير")}
            >
              <Ico paths={GLYPH.enlarge} />
            </a>
            <button
              type="button"
              className="mp-tool"
              disabled={savingPhoto}
              aria-label={savingPhoto ? L("Saving…", "يُحفظ…") : L("Download", "تحميل")}
              title={savingPhoto ? L("Saving…", "يُحفظ…") : L("Download", "تحميل")}
              onClick={() => savePhoto([{ key: framed.key, label: { en: framed.name, ar: framed.name }, url: framed.url }])}
            >
              <Ico paths={GLYPH.download} />
            </button>
          </div>
        )}

        {/* The strip names what the viewer is showing — the machine when it holds the photograph, and
            the document's own name when it holds one. ~~Here the frame holds the machine's photograph
            and nothing else, because our document rows open in their own tab (AC-69) rather than in
            this frame.~~ No longer true as of 2026-08-11: a row press frames the paper, which is the
            prototype's *"one frame, two subjects"*, and it makes this strip the only thing on screen
            that says which of the two the renter is looking at. AC-69's tab is untouched — it is now
            the `↗` beside the row, and the way to reach a PDF or a second file. */}
        <div className="mp-cap">{framedDoc ? framedDoc.name : caption ? `${heroName} · ${caption}` : heroName}</div>
      </div>

      <div {...pin("equipment-detail-tabs")} className="mp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "machine"} className={`mp-tab${tab === "machine" ? " on" : ""}`} onClick={() => setTab("machine")}>
          {/* ~~«The machine»~~ — **«Equipment»** (owner, UAT of 2026-08-11: *"for the machine tab call it
              Equipment"*). It is the word the rest of this surface already uses for the same object: the
              panel it sits in is headed «المعدّات في هذا العرض», the list behind the back arrow is the
              equipment list, and «الطلب» names an equipment item. One noun, everywhere the renter
              travels. The Arabic already said «المعدّة» and is unchanged — «المعدّة» *is* "the
              equipment"; the two locales had drifted apart, not the Arabic away from the ruling. */}
          {L("Equipment", "المعدّة")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "documents"} className={`mp-tab${tab === "documents" ? " on" : ""}`} onClick={() => setTab("documents")}>
          {/* «المستندات», the prototype's and the screenshot's word — not «مستنداتها». The possessive
              was ours; on a panel that is already one machine, whose documents these are is not in
              question, and the pronoun only made the tab longer than its neighbour. */}
          {L("Documents", "المستندات")}
          {docAttention > 0 && <span className="mp-att">{ar ? arDigits(docAttention) : docAttention}</span>}
        </button>
      </div>

      {/* The yard card is FULL-BLEED — outside `.mp-body`'s inset — because the rule that separates it
          from the grid is the panel's own hairline, and a border-top inside a padded box stops short
          of both edges and reads as a stray line rather than a division. */}
      <div className="mp-scroll">
        {tab === "machine" ? (
          <>
            {/* ── The yard card, the fleet card's own (owner, 2026-09-08) ─────────────────────
                *"Show it red yard and distance similar to how it appears in the fleet cards, so no
                need to «availability not confirmed» and no need for availability differentiation,
                just the red card of the distance and yard with maybe a small badge on the card
                saying not confirmed."*

                ~~A 20px distance with a tinted availability chip on the far corner, and a paragraph
                under it explaining that red is not a refusal.~~ Three objects for one fact: the
                colour said it, the chip said it again in words, and the paragraph said it a third
                time — on the one surface where the renter has already pressed the red card to get
                here. What is left is the card the fleet list draws, with the distance and the yard on
                it and a small «not confirmed» badge, and it opens the same layer that card opens.

                The classes are `EquipmentList`'s, deliberately: the rules are shared in
                `map-proto.css` so the two mounts cannot drift into two looks for one state. */}
            <div {...pin("equipment-detail-yard")} className="mp-yardbox">
              {(() => {
                const inner = (
                  <>
                    {km != null ? (
                      <span className="bm-eq-dist">
                        {/* ONE DECIMAL, never a whole kilometre (owner, 2026-08-11) — and through the
                            SAME `distanceDigits` the card and the marker's chip use, so the three
                            cannot state one machine's distance three ways. */}
                        <span className="bm-eq-km" dir="ltr">{distanceDigits(km, ar)}</span>
                        {/* Word for word `t.bidMap.eqDistanceUnit`, which is what the fleet card prints.
                            Written inline because this directory takes all of its copy through `L`
                            (see the file header) — if either side is ever reworded, reword both. */}
                        <span className="bm-eq-kmu">{L("km from your project", "كم من مشروعك")}</span>
                      </span>
                    ) : (
                      <span className="bm-eq-kmu">{L("Location not specified", "الموقع غير محدّد")}</span>
                    )}
                    {/* The yard itself, which is what the colour is ABOUT. */}
                    {yard && <span className="mp-yard">{yard}</span>}
                    {/* The badge, and it says only that the availability is unanswered — no reason, no
                        cause, no location-source (AC-30) — and «not confirmed» still reads as
                        unanswered, never refused (AC-20). */}
                    {yardState != null && yardState !== "ok" && (
                      <span className="mp-yard-badge">
                        {yardState === "asked" ? L("Asked", "طُلب") : L("Not confirmed", "غير مؤكّدة")}
                      </span>
                    )}
                    {yardState != null && (
                      <span className="material-icons-outlined" aria-hidden="true">
                        {yardState === "ok" ? "check_circle" : yardState === "asked" ? "schedule" : "help_outline"}
                      </span>
                    )}
                  </>
                );
                /* Green is settled and is not a control — there is nothing left to ask. Red is the
                   question, and red with a clock is the question already put: it still opens, and
                   shows him what he asked rather than offering to ask again. */
                return yardState == null ? (
                  <span className="bm-eq-yard">{inner}</span>
                ) : yardState === "ok" ? (
                  <span className="bm-eq-yard ok" title={L("The supplier named the yard this machine moves from, so this distance is confirmed for your offer.", "حدّد المورد الساحة التي تنتقل منها، فهذه المسافة مؤكّدة لعرضك.")}>
                    {inner}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`bm-eq-yard ${yardState}`}
                    disabled={!onYardPress}
                    title={yardState === "asked" ? pendingWhy : L("Not confirmed for this offer: press to see what that means and to ask.", "غير مؤكّدة لهذا العرض: اضغط لتعرف ما معناه ولتسأل.")}
                    onClick={() => onYardPress?.(machine, yardState === "asked")}
                  >
                    {inner}
                  </button>
                );
              })()}
              {/* Restored 2026-08-09. `isOutOfCity` was already the contract's (bid-map.ts) and this
                  surface simply never drew it: presentation only, no filtering, no sorting, and it
                  never contradicts the distance beside it. It is the fact that turns a delivery into a
                  mobilisation the renter should be asking about. */}
              {outOfCity && <div className="mp-outcity">{L("Outside the request's city", "خارج مدينة الطلب")}</div>}
            </div>

            <div className="mp-body">
              <div className="mp-h4">
                {L("Against your request", "مقابل طلبك")}
                <small>{L("What this equipment answers, and what it does not.", "ما تفي به هذه المعدّة، وما لا تفي به.")}</small>
              </div>
              {/* **A CELL OPENS ITS EVIDENCE** (owner, UAT of 2026-08-11: *"clicking on any document
                  field here, like '2 of 2 unit photos', will take them to the document"*). The cell is a
                  `<button>` when the model resolved a file behind it and a plain `<div>` when it did not
                  — a cell with nothing to show must not press, which is the same rule the document rows
                  hold to and the reason `MatchCell.evidence` is null on every red and grey cell.

                  It puts the paper in the frame at the top of THIS panel rather than opening a tab: the
                  viewer is already there, already sized for a sheet, and the renter reading a grid of
                  findings should not have to leave the findings to check one. Pressing the framed cell
                  again brings the machine's photograph back (`frame`). The subject it hands over is the
                  documents tab's own row, so the frame marks that row too if he crosses over. */}
              <div {...pin("equipment-detail-grid")} className="mp-grid">
                {cells.map((c) => {
                  const ev = c.evidence;
                  const framedHere = ev != null && framedDoc?.key === ev.key;
                  const body = (
                    <>
                      <div className="k">{L(c.label.en, c.label.ar)}</div>
                      <div className="v">
                        <span>{L(c.finding.en, c.finding.ar)}</span>
                        <span className="mark" aria-hidden="true">{MARK[c.state]}</span>
                      </div>
                    </>
                  );
                  if (!ev) {
                    return (
                      <div key={c.key} className={`mp-cell ${c.state}`}>
                        {body}
                      </div>
                    );
                  }
                  const evName = L(ev.label.en, ev.label.ar);
                  // The accessible name says the ACT and names the paper, because the cell's own two
                  // lines are a label and a finding — neither of them says that pressing shows a file.
                  const say = framedHere
                    ? L("Back to the equipment's photo", "العودة إلى صورة المعدّة")
                    : L(`Show ${evName} in the viewer`, `اعرض ${evName} في العارض`);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className={`mp-cell ${c.state} press${framedHere ? " open" : ""}`}
                      aria-label={say}
                      title={say}
                      // Stated, not only outlined: a colour is not something a screen reader can read.
                      aria-current={framedHere ? "true" : undefined}
                      onClick={() => frame({ key: ev.key, name: evName, url: ev.url, kind: ev.kind })}
                    >
                      {body}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* No `.mp-body` around it, unlike the machine tab and unlike the company panel: this tab is a
             COLUMN with its own sticky action bar at the foot of it (the prototype's `eqDocsTab`), so it
             owns its insets — a padded box around it would have inset the bar too and left it floating
             14 px off both edges. */
          <EquipmentDocuments
            machine={machine}
            request={request}
            ar={ar}
            L={L}
            onRequest={onRequest}
            askPending={askPending}
            onView={frame}
            viewingKey={framedDoc?.key ?? null}
          />
        )}
      </div>

      {/* ── The footer is GONE (owner, 2026-09-08) ──────────────────────────────────────────────
          *"Remove these 2: one is already in the fleet to add another one, and for availability let
          it be like the fleet card as «?» on the yard card."*

          ~~A 76px bar carrying «Ask him to confirm availability» and «Ask for different equipment».~~
          Both asks are still reachable and neither was raised here twice by accident: the
          availability ask is the yard card above, which is where the red the renter is asking about
          actually is, and «ask for another one» is the dashed control that closes the fleet list one
          press behind this panel. A bar that duplicated both put the panel's actions somewhere the
          fact they act on is not.

          `availabilityAsk` / `alternativeAsk` and their pending readings went with it; the documents
          tab keeps its own footer, which is the only action bar on this panel now. */}
    </div>
  );
}
