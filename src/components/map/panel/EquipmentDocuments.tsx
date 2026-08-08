"use client";

/**
 * **V8 — equipment documents** (spec 004 v3 §6.6; AC-16, AC-38, AC-39, AC-42). The equipment detail's
 * second tab.
 *
 * **Usage** — standalone, no mount point of its own; `EquipmentDetail` hosts it as the second tab.
 *
 *   <EquipmentDocuments
 *     machine={machine}                       // FleetMachine
 *     request={bid}                           // MatchRequest — WHICH PAPERS ARE REQUIRED. A BidCard
 *                                             // satisfies it; without it the tab cannot tell a gap
 *                                             // from a paper nobody asked about, which is why it is
 *                                             // required rather than optional.
 *     ar={ar} L={L}                           // component-local bilingual pattern, as
 *                                             // requests/SharedBidSubmissionModal.tsx does it
 *     onRequest={(draft) => compose(draft)}    // PanelRequestDraft — V11 owns the composer
 *   />
 *
 * **Up to three groups, each with its own attention count** — photos · documents · **the operator's
 * documents**, which are a section of their own and not one row buried in the equipment's papers. The
 * counts count **rows needing action, never totals**, and a group with nothing to say does not render.
 *
 * **A row is red only if the request required it** (owner, 2026-08-08). A paper the lessor holds that
 * nobody asked for still shows and still opens, with no verdict and no tick — there is nothing to
 * chase on a document the renter is looking straight at. A paper nobody asked for and nobody holds is
 * not a row. All of that judgement is `equipmentDocGroups`'; this component paints it.
 *
 * **You can only ask for what is not there** (owner, same day). A tick appears on a **missing** row and
 * on no other, and a group with nothing missing shows no batch control at all rather than one that
 * composes an empty ask. The rule lives in the model (`DocRow.requestable`, enforced again inside
 * `batchDocumentRequest`), so this component never decides who may be ticked.
 *
 * **The operator's group is a status, not a document list** (owner, same day). Its rows say only whether
 * each certificate is on file — no view, no download, no url — because nothing validates an operator
 * document on upload and this surface must not present an unchecked file as evidence. Those rows simply
 * arrive carrying no files, so the shared row grammar below needs no special case.
 *
 * **Presence only.** `documentKeys` entries carry `verifyStatus` and `expiryDate`; this tab renders
 * neither, and the model never reads them. §6.6: a machine's paper is either there or it isn't, and a
 * verification badge would invite the renter to judge a supplier on a state the platform sets. The
 * asymmetry with the company panel (V9), which *does* show verification and expiry, is deliberate.
 *
 * **This is the ONLY document surface that can raise a request** (product owner, 2026-08-08): a
 * document request names a machine, and the company panel's rows are read-and-open only. The
 * checkboxes and the batch button below are untouched by that reversal — they were always about a
 * machine.
 *
 * **Presence only never meant unopenable** (004a §7.2, AC-69). It governs verification STATE. Both
 * groups here — the photos and the papers — carry the same **view / download** pair as the company
 * panel, view first, because a machine's papers are exactly what the renter came to look at. The
 * wording of §6.6 invites the opposite reading, which is why it is written down twice.
 *
 * **Requesting is a BATCH action** over the ticked rows — one request naming several types, never one
 * per row. §6.6: *"The renter ticks what he wants and asks once."*
 */

import { useMemo, useState } from "react";
import type { FleetMachine } from "@/lib/contract/fleet";
import { DocRowList } from "./DocRowList";
import {
  arDigits,
  batchDocumentRequest,
  equipmentDocGroups,
  type MatchRequest,
  type PanelRequestDraft,
} from "./machine-panel-model";
import "./panel-proto.css";

export interface EquipmentDocumentsProps {
  machine: FleetMachine;
  /** The request's asks — what makes a missing paper a **gap** rather than a paper nobody wanted.
   *  Structurally satisfied by a `BidCard`, exactly as `EquipmentDetail`'s own `request` is. */
  request: MatchRequest;
  ar: boolean;
  L: (en: string, ar: string) => string;
  /** Hand the ask upward. This component never posts — the `rentee_request` contract (§7.3) has one
   *  caller, so `ref` minting and serial stamping can never be duplicated here. */
  onRequest?: (draft: PanelRequestDraft) => void;
}

export function EquipmentDocuments({ machine, request, ar, L, onRequest }: EquipmentDocumentsProps) {
  const groups = useMemo(() => equipmentDocGroups(machine, request), [machine, request]);
  // ONE selection set across BOTH groups — the batch is the renter's whole ask, not one ask per
  // heading. He can tick the missing plate photo and the missing operator certificate and send once.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = (keys: string[], select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (select) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  // ONE filter, in the model. `batchDocumentRequest` drops a row that is not requestable, so the tick,
  // the count on the button and the payload are the same rule read once — a second pre-filter here
  // would be a place for them to drift apart. The count comes off the draft for the same reason.
  const allRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const draft = batchDocumentRequest(machine.equipmentId, allRows, selected);
  const pickedCount = draft?.kind === "document" ? draft.labels.length : 0;

  return (
    <div>
      {groups.map((g) => (
        <DocRowList
          key={g.key}
          groupLabel={L(g.label.en, g.label.ar)}
          attention={g.attention}
          rows={g.rows.map((r) => ({
            key: r.key,
            name: L(r.label.en, r.label.ar),
            status: L(r.statusLine.en, r.statusLine.ar),
            dot: r.status,
            thumbUrl: r.thumbUrl,
            downloadUrl: r.downloadUrl,
            files: r.files,
            selectable: r.requestable,
          }))}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          L={L}
        />
      ))}

      <button
        type="button"
        className="mp-send"
        disabled={!draft || !onRequest}
        onClick={() => {
          if (draft && onRequest) {
            onRequest(draft);
            setSelected(new Set<string>());
          }
        }}
      >
        {pickedCount === 0
          ? L("Request documents — tick what you need", "اطلب مستندات — حدّد ما تحتاجه")
          : L(`Request ${pickedCount} documents`, `اطلب ${arDigits(pickedCount)} مستندات`)}
      </button>
      <p className="mp-note" dir={ar ? "rtl" : "ltr"}>
        {L(
          "One request naming everything you ticked — not one message per row.",
          "طلب واحد يذكر كل ما حدّدته — لا رسالة لكل صف.",
        )}
      </p>
    </div>
  );
}
