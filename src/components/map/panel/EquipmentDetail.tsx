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
 * Four parts, in this order:
 *  1. a **full-bleed hero photo** with a back control — the machine is identified by sight first
 *  2. **two tabs** — the machine · its documents
 *  3. one line: availability chip · distance · yard
 *  4. **the match grid** — six cells scoring this machine against *this request*
 *
 * **It answers "does this machine fit my request", not "what is this machine."** There is no
 * specification dump here on purpose: a list of attributes hands the renter the judging, and the grid
 * exists to do the judging and show its working. Descriptive facts live on the card (V5).
 *
 * **Colour comes from `unitAvailability()` and nothing else** — never from the `yardConfirmed` boolean,
 * which supplier-side is just `yardId != null` and would turn every chip green (`bid-map.ts:64`,
 * AC-19). The chip here and the machine's pin must be the same fact.
 */

import { useMemo, useState } from "react";
import { unitAvailability } from "@/lib/contract/bid-map";
import type { FleetMachine } from "@/lib/contract/fleet";
import { EquipmentDocuments } from "./EquipmentDocuments";
import {
  arDigits,
  equipmentDocGroups,
  heroPhotoUrl,
  matchGrid,
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

  return (
    <div className="mp" dir={ar ? "rtl" : "ltr"}>
      <div className="mp-hero">
        <button type="button" className="mp-back" onClick={onBack}>
          <span aria-hidden="true">{ar ? "›" : "‹"}</span>
          {L("Back", "رجوع")}
        </button>
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt={title || L("Equipment", "المعدّة")} />
        ) : (
          <div className="mp-hero-empty">{L("No photo on this machine's file", "لا توجد صورة على ملف هذه المعدّة")}</div>
        )}
        <div className="mp-hero-tx">
          <b>{title || kind || L("Equipment", "المعدّة")}</b>
          {caption && <span>{caption}</span>}
        </div>
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

      {/* One line: availability · distance · yard. The chip states only that availability is or is not
          confirmed — no reason, no cause, no location-source explanation (AC-30), and "not confirmed"
          reads as unanswered, never as refused (AC-20). */}
      <div className="mp-line">
        {availability !== "absent" && (
          <span className={`mp-chip ${availability}`}>
            <i />
            {availability === "confirmed"
              ? L("Availability confirmed", "التوفّر مؤكّد")
              : L("Availability not confirmed yet", "لم يؤكد توفرها بعد")}
          </span>
        )}
        {km != null && <span>{ar ? `${arDigits(Math.round(km))} كم من مشروعك` : `${Math.round(km)} km from your project`}</span>}
        {km != null && yard && <span className="mp-line-dot">·</span>}
        {yard && <span>{yard}</span>}
      </div>

      <div className="mp-scroll">
        <div className="mp-body">
          {tab === "machine" ? (
            <>
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

              {/* The requests this surface raises (§6.7). Stacked, not side by side: two buttons in a
                  row read as "pick one", a list reads as "here is what you can send" — which is what
                  they are, independent asks, either or both. */}
              {availability !== "confirmed" && (
                <button type="button" className="mp-act" onClick={() => onRequest?.({ kind: "availability", equipmentId: machine.equipmentId })} disabled={!onRequest}>
                  <span className="plus" aria-hidden="true">+</span>
                  <span className="tx">
                    <b>{L("Ask him to confirm availability", "اطلب تأكيد التوفّر")}</b>
                    <span>{L("So he names the yard this machine leaves from", "ليحدّد الساحة التي تخرج منها هذه المعدّة")}</span>
                  </span>
                </button>
              )}
              <button type="button" className="mp-act" onClick={() => onRequest?.({ kind: "alternative", equipmentId: machine.equipmentId })} disabled={!onRequest}>
                <span className="plus" aria-hidden="true">+</span>
                <span className="tx">
                  <b>{L("Ask for a different machine", "اطلب معدّة أخرى")}</b>
                  <span>{L("To see what else he has of this type", "لترى ما لديه من نفس النوع")}</span>
                </span>
              </button>
            </>
          ) : (
            <EquipmentDocuments machine={machine} request={request} ar={ar} L={L} onRequest={onRequest} />
          )}
        </div>
      </div>
    </div>
  );
}
