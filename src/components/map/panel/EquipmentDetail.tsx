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
 *     **It is a viewer, and it now has a second subject**: press a row on the documents tab and that
 *     paper is what the frame holds (owner, 2026-08-11 — the prototype's `eqViewer`, *"one frame, two
 *     subjects"*). The frame's state lives HERE because the frame does; the tab reports the press.
 *  2. **two underline tabs** — the machine · its documents
 *  3. one line: distance · band — yard, with the availability chip on the opposite corner (and the
 *     unconfirmed explainer under it, which is the only thing that stops red reading as a refusal)
 *  4. **the match grid** — six cells scoring this machine against *this request*
 *  5. **a 76 px footer** carrying the two asks this surface raises, on the machine tab only
 *
 * **It answers "does this machine fit my request", not "what is this machine."** There is no
 * specification dump here on purpose: a list of attributes hands the renter the judging, and the grid
 * exists to do the judging and show its working. Descriptive facts live on the card (V5).
 *
 * **Colour comes from `unitAvailability()` and nothing else** — never from the `yardConfirmed` boolean,
 * which supplier-side is just `yardId != null` and would turn every chip green (`bid-map.ts:64`,
 * AC-19). The chip here and the machine's pin must be the same fact.
 */

import { useCallback, useMemo, useState } from "react";
import { isOutOfCity, unitAvailability } from "@/lib/contract/bid-map";
import type { FleetMachine } from "@/lib/contract/fleet";
import { useDownloadBatch } from "./doc-download";
import { EquipmentDocuments, type DocViewSubject } from "./EquipmentDocuments";
import {
  arDigits,
  distanceBandLabel,
  equipmentDocGroups,
  heroPhotoUrl,
  matchGrid,
  type DocDownloadTarget,
  type MatchRequest,
  type PanelRequestDraft,
} from "./machine-panel-model";
import "./panel-proto.css";

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
  // Not the prototype's — it has no way back to the photograph because its back arrow leaves the
  // machine altogether. Ours does not, so the frame needs a door out of the document it is holding.
  close: ["M6 6l12 12", "M18 6L6 18"],
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
}

export function EquipmentDetail({ machine, request, ar, L, onBack, onRequest, askPending }: EquipmentDetailProps) {
  const [tab, setTab] = useState<"machine" | "documents">("machine");

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

  const cells = useMemo(() => matchGrid(machine, request), [machine, request]);
  const hero = heroPhotoUrl(machine);
  const availability = unitAvailability(machine);
  // Every group's outstanding rows, so the tab badge agrees with the headings inside it. The groups are
  // request-dependent — a paper nobody asked for is not outstanding, and cannot be counted here — so
  // the badge reads the same `request` the grid above it is scored against.
  //
  // **A group whose `attention` is `null` adds nothing** — it is not zero, it is a group that makes no
  // such claim (the operator's, owner 2026-08-08). The badge counts what the renter can act on, and there
  // is nothing to act on there; counting it would send him to a tab and then to rows with no controls.
  const docAttention = useMemo(
    () => equipmentDocGroups(machine, request).reduce((n, g) => n + (g.attention ?? 0), 0),
    [machine, request],
  );

  const title = [machine.manufacturer, machine.modelName].filter(Boolean).join(" ").trim();
  const kind = (ar ? machine.subcategoryNameAr : machine.subcategoryName) || machine.subcategoryName;
  const size = (ar ? machine.measurementNameAr : machine.measurementName) || machine.measurementName;
  const caption = [kind, size].filter(Boolean).join(" · ");
  const km = machine.distanceKm;
  const yard = machine.yardName || machine.yardCity;
  const band = distanceBandLabel(km);
  const outOfCity = isOutOfCity(km);
  const heroName = title || kind || L("Equipment", "المعدّة");

  /* ── One ask, one card (owner, 2026-08-10) ──────────────────────────────────────────────────────
     The two asks this footer raises, composed ONCE and used for both verbs: the object that would be
     sent is the object the guard is asked about, so the control cannot be disabled for an ask it
     would not have made, or stay live for one it already did.

     The copy is written inline through `L`, not pulled from the dictionary, because that is how this
     whole directory takes its words (see the file header) — a panel that reached for `useT` for one
     sentence would be the only one that did. */
  const availabilityAsk: PanelRequestDraft = { kind: "availability", equipmentId: machine.equipmentId };
  const alternativeAsk: PanelRequestDraft = { kind: "alternative", equipmentId: machine.equipmentId };
  const availabilityPending = askPending?.(availabilityAsk) ?? false;
  const alternativePending = askPending?.(alternativeAsk) ?? false;
  /** The disabled control says what it is waiting for rather than going quietly inert. «المورد» is
   *  this surface's word for the other party, matching the prototype — the owner's ruling of
   *  2026-08-10, which reversed an earlier one that had this surface saying «المؤجّر». */
  const pendingLabel = L("Asked — awaiting his reply", "طُلب — بانتظار ردّه");
  const pendingWhy = L(
    "You've already asked this, and the supplier hasn't answered yet.",
    "سبق أن طلبت هذا، ولم يردّ المورد بعد.",
  );

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
    <div className="mp" dir={ar ? "rtl" : "ltr"}>
      {/* **A VIEWER, not a hero** (2026-08-09): `196px`, a circular back control, its tools on the
          opposite corner (pills then, icons since 2026-08-11), and a caption STRIP rather than a
          gradient scrim. The scrim dimmed the
          photograph in order to write over it the two facts the panel repeats underneath anyway; a
          white strip under the image leaves the image alone and still names what is being looked at.
          The prototype's own frame, and the owner's screenshot's. */}
      {/* `.doc` is the prototype's taller frame for a paper (268 px over its `#EEF3F9`) — a certificate
          at 196 px is a picture of a certificate. The `photo` / `paper` half decides how the file sits
          in it, and comes off the ROW'S GROUP rather than off its url; see `DocViewSubject.kind`. */}
      <div className={`mp-viewer${framedDoc ? ` doc ${framedDoc.kind}` : ""}`}>
        {framed == null ? (
          <div className="mp-hero-empty">{L("No photo on this machine's file", "لا توجد صورة على ملف هذه المعدّة")}</div>
        ) : framedBroken ? (
          // Not an image, and there is no way to have known that in advance. It says so, and hands over
          // the one control that always works on a presigned url: a tab.
          <div className="mp-hero-empty">
            <span>{L("This file can't be shown here.", "لا يمكن عرض هذا الملف هنا.")}</span>
            <a href={framed.url} target="_blank" rel="noopener noreferrer">
              {L("Open it in a new tab", "افتحه في تبويب جديد")}
            </a>
          </div>
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
            {/* Only while a document is in the frame: the way back to the machine's photograph. The
                prototype needs none — its back arrow clears the document and leaves the machine in one
                press — but ours goes back to the list, so without this the frame keeps the last paper
                the renter opened until he leaves the machine entirely. */}
            {framedDoc && (
              <button
                type="button"
                className="mp-tool"
                aria-label={L("Back to the machine's photo", "العودة إلى صورة المعدّة")}
                title={L("Back to the machine's photo", "العودة إلى صورة المعدّة")}
                onClick={() => {
                  setFramedDoc(null);
                  setFramedFailed(null);
                }}
              >
                <Ico paths={GLYPH.close} />
              </button>
            )}
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

      <div className="mp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "machine"} className={`mp-tab${tab === "machine" ? " on" : ""}`} onClick={() => setTab("machine")}>
          {L("The machine", "المعدّة")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "documents"} className={`mp-tab${tab === "documents" ? " on" : ""}`} onClick={() => setTab("documents")}>
          {/* «المستندات», the prototype's and the screenshot's word — not «مستنداتها». The possessive
              was ours; on a panel that is already one machine, whose documents these are is not in
              question, and the pronoun only made the tab longer than its neighbour. */}
          {L("Documents", "المستندات")}
          {docAttention > 0 && <span className="mp-att">{ar ? arDigits(docAttention) : docAttention}</span>}
        </button>
      </div>

      {/* The line and the explainer are FULL-BLEED — outside `.mp-body`'s inset — because the rule
          that separates them from the grid is the panel's own hairline, and a border-top inside a
          padded box stops short of both edges and reads as a stray line rather than a division. */}
      <div className="mp-scroll">
        {tab === "machine" ? (
          <>
            {/* **The distance is the headline of this line, and the chip sits on the far corner**
                (2026-08-09, the prototype's own typography). It used to be one wrapping muted
                sentence with a filled chip leading it. Two things were wrong with that: a filled
                chip is the loudest object on the panel and availability is not the first question
                the line answers, and «١٢ كم من مشروعك» set at 11 px alongside the yard made the one
                number the renter is actually comparing between machines the hardest thing to find.

                Now: the kilometres at 20 px, the band word and the yard after them, and the chip
                TINTED rather than filled on the opposite corner. It still states only that
                availability is or is not confirmed — no reason, no cause, no location-source
                (AC-30) — and "not confirmed" still reads as unanswered, never refused (AC-20).

                It also moves INSIDE the machine tab. It was rendering above the tab strip, so a
                line about where the machine is stood over the list of its papers. */}
            <div className="mp-line">
              <span className="mp-line-tx">
                {km != null && (
                  <>
                    <span className="mp-km" dir="ltr">{ar ? arDigits(Math.round(km)) : Math.round(km)}</span>
                    <span className="mp-band">{band ? L(`km · ${band.en}`, `كم · ${band.ar}`) : L("km", "كم")}</span>
                  </>
                )}
                {yard && <span className="mp-yard">— {yard}</span>}
                {/* Restored 2026-08-09. `isOutOfCity` was already the contract's (bid-map.ts) and
                    this surface simply never drew it: presentation only, no filtering, no sorting,
                    and it never contradicts the distance beside it. It is the fact that turns a
                    delivery into a mobilisation the renter should be asking about. */}
                {outOfCity && <span className="mp-outcity">{L("Outside the request's city", "خارج مدينة الطلب")}</span>}
              </span>
              {availability !== "absent" && (
                <span className={`mp-chip ${availability}`}>
                  <i />
                  {availability === "confirmed"
                    ? L("Availability confirmed", "التوفّر مؤكّد")
                    : L("Availability not confirmed yet", "لم يؤكد توفرها بعد")}
                </span>
              )}
            </div>

            {/* A CONFIRMED machine needs no explanation — the chip is the whole statement. The
                unanswered one does: red reads as rejection, and this sentence is the only thing on
                the panel that says it is not (AC-20). «المورد», not the prototype's «المورد» —
                this surface's word for the other party, as the equipment list already has it. */}
            {availability === "unconfirmed" && (
              <div className="mp-sect">
                <div className="mp-sect-h">{L("Availability", "التوفّر")}</div>
                <p className="mp-sect-n">
                  {L(
                    "The supplier has not named this machine's yard yet — an open question, not a refusal.",
                    "لم يحدّد المورد ساحة هذه المعدّة بعد — سؤال معلّق، وليس رفضاً.",
                  )}
                </p>
              </div>
            )}

            <div className="mp-body">
              <div className="mp-h4">
                {L("Against your request", "مقابل طلبك")}
                <small>{L("What this machine answers, and what it does not.", "ما تفي به هذه المعدّة، وما لا تفي به.")}</small>
              </div>
              <div className="mp-grid">
                {cells.map((c) => (
                  <div key={c.key} className={`mp-cell ${c.state}`}>
                    <div className="k">{L(c.label.en, c.label.ar)}</div>
                    <div className="v">
                      <span>{L(c.finding.en, c.finding.ar)}</span>
                      <span className="mark" aria-hidden="true">{MARK[c.state]}</span>
                    </div>
                  </div>
                ))}
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
            onView={(subject) => {
              setFramedDoc(subject);
              setFramedFailed(null);
            }}
            viewingKey={framedDoc?.key ?? null}
          />
        )}
      </div>

      {/* **The machine's own footer** — a 76 px bar over the panel's grey, two buttons side by side
          (2026-08-09, the prototype's). It was two stacked full-width rows inside the scroll, each
          with a `+` tile and a sub-line explaining itself.

          ~~Stacked, not side by side: two buttons in a row read as "pick one", a list reads as "here
          is what you can send".~~ Withdrawn. The reasoning holds for a list of five asks; for two it
          bought a `+` tile and two lines of explanation for controls whose own labels already say
          what they do, and it put the panel's actions wherever the renter happened to have scrolled
          to. A footer is where an action bar goes, and it is where the documents tab's own already
          is — two tabs of one panel were putting their actions in two different places.

          It renders on the machine tab only: the documents tab has its own footer over the selection,
          and this one steps aside rather than stacking two action bars. */}
      {tab === "machine" && (
        <div className="mp-foot">
          {availability !== "confirmed" && (
            <button
              type="button"
              className="mp-foot-b solid"
              onClick={() => onRequest?.(availabilityAsk)}
              disabled={!onRequest || availabilityPending}
              title={availabilityPending ? pendingWhy : undefined}
            >
              {availabilityPending ? pendingLabel : L("Ask him to confirm availability", "اطلب تأكيد التوفّر")}
            </button>
          )}
          <button
            type="button"
            className="mp-foot-b"
            onClick={() => onRequest?.(alternativeAsk)}
            disabled={!onRequest || alternativePending}
            title={alternativePending ? pendingWhy : undefined}
          >
            {alternativePending ? pendingLabel : L("Ask for a different machine", "اطلب معدّة أخرى")}
          </button>
        </div>
      )}
    </div>
  );
}
