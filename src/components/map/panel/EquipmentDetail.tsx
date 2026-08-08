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
 *  1. a **196 px viewer** — the machine's photo, a circular back control, «تكبير» / «تحميل», and a
 *     caption strip naming what is in the frame; the machine is identified by sight first
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
import { EquipmentDocuments } from "./EquipmentDocuments";
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

export interface EquipmentDetailProps {
  machine: FleetMachine;
  /** The request's asks. Structurally satisfied by a `BidCard`, which already carries them. */
  request: MatchRequest;
  ar: boolean;
  L: (en: string, ar: string) => string;
  /** Back to the equipment list. */
  onBack: () => void;
  onRequest?: (draft: PanelRequestDraft) => void;
}

export function EquipmentDetail({ machine, request, ar, L, onBack, onRequest }: EquipmentDetailProps) {
  const [tab, setTab] = useState<"machine" | "documents">("machine");

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

  // «تحميل» saves the photo through the same batch runner the document lists use, for the same reason
  // it exists: `<a download>` on a cross-origin presigned url is ignored by the browser and navigates
  // the panel away instead (`doc-download.ts`). One file is a batch of one.
  const photoLabel = useCallback((t: DocDownloadTarget) => L(t.label.en, t.label.ar), [L]);
  const { running: savingPhoto, run: savePhoto } = useDownloadBatch(photoLabel);

  return (
    <div className="mp" dir={ar ? "rtl" : "ltr"}>
      {/* **A VIEWER, not a hero** (2026-08-09): `196px`, a circular back control, tool pills on the
          opposite corner, and a caption STRIP rather than a gradient scrim. The scrim dimmed the
          photograph in order to write over it the two facts the panel repeats underneath anyway; a
          white strip under the image leaves the image alone and still names what is being looked at.
          The prototype's own frame, and the owner's screenshot's. */}
      <div className="mp-viewer">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt={heroName} />
        ) : (
          <div className="mp-hero-empty">{L("No photo on this machine's file", "لا توجد صورة على ملف هذه المعدّة")}</div>
        )}
        <button type="button" className="mp-back" onClick={onBack} aria-label={L("Back to the equipment", "العودة إلى المعدّات")} title={L("Back to the equipment", "العودة إلى المعدّات")}>
          <span aria-hidden="true">{ar ? "›" : "‹"}</span>
        </button>

        {/* Both pills, because the owner's screenshot shows both. «تكبير» opens the photograph at its
            own size in a new tab — the same "a tab is the whole viewer" decision `DocRowList` records
            for presigned urls, and for the same reason: a modal here would need a MIME strategy this
            row does not get to decide. Neither renders when there is no photo to act on. */}
        {hero && (
          <div className="mp-tools">
            <a className="mp-tool solid" href={hero} target="_blank" rel="noopener noreferrer" title={L("Enlarge", "تكبير")}>
              {L("Enlarge", "تكبير")}
            </a>
            <button
              type="button"
              className="mp-tool"
              disabled={savingPhoto}
              onClick={() => savePhoto([{ key: "photo", label: { en: heroName, ar: heroName }, url: hero }])}
            >
              {savingPhoto ? L("Saving…", "يُحفظ…") : L("Download", "تحميل")}
            </button>
          </div>
        )}

        {/* The strip names what the viewer is showing. In the prototype that is whichever document the
            renter clicked into the frame; here the frame holds the machine's photograph and nothing
            else — our document rows open in their own tab (AC-69) rather than in this frame — so it
            names the machine. Same surface, same job: say what is on screen. */}
        <div className="mp-cap">{caption ? `${heroName} · ${caption}` : heroName}</div>
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
                the panel that says it is not (AC-20). «المؤجّر», not the prototype's «المورد» —
                this surface's word for the other party, as the equipment list already has it. */}
            {availability === "unconfirmed" && (
              <div className="mp-sect">
                <div className="mp-sect-h">{L("Availability", "التوفّر")}</div>
                <p className="mp-sect-n">
                  {L(
                    "The lessor has not named this machine's yard yet — an open question, not a refusal.",
                    "لم يحدّد المؤجّر ساحة هذه المعدّة بعد — سؤال معلّق، وليس رفضاً.",
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
          <div className="mp-body">
            <EquipmentDocuments machine={machine} request={request} ar={ar} L={L} onRequest={onRequest} />
          </div>
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
            <button type="button" className="mp-foot-b solid" onClick={() => onRequest?.({ kind: "availability", equipmentId: machine.equipmentId })} disabled={!onRequest}>
              {L("Ask him to confirm availability", "اطلب تأكيد التوفّر")}
            </button>
          )}
          <button type="button" className="mp-foot-b" onClick={() => onRequest?.({ kind: "alternative", equipmentId: machine.equipmentId })} disabled={!onRequest}>
            {L("Ask for a different machine", "اطلب معدّة أخرى")}
          </button>
        </div>
      )}
    </div>
  );
}
