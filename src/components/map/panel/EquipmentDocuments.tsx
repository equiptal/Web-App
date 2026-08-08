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
 * **You can only ask for what is not there** (owner, same day, and still true). The *ask* names a
 * **missing** row and no other — `DocRow.requestable`, enforced again inside `batchDocumentRequest`.
 *
 * **ONE checkbox column, two mutually exclusive modes** (owner's UI design, 2026-08-08). What changed is
 * not that rule but what a tick is *for*: a **held** row is tickable too, and ticking it means
 * *download*. The mode is set by the first tick and read back out of the ticked set (`selectionModeOf`);
 * the other kind dims to 45% and goes inert, so a selection can never be half an ask and half a save.
 * **Both footer buttons stay visible** — «تنزيل» and «اطلب من المؤجّر إرساله» — with only the one the
 * selection supports live, carrying its count; the other keeps its shape and is disabled. Clearing the
 * last tick returns to neutral and re-enables everything, which is free here because the mode is
 * derived rather than stored. Every judgement is the model's; this component paints it.
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
 * groups here — the photos and the papers — carry the same **view** control as the company panel,
 * because a machine's papers are exactly what the renter came to look at. The wording of §6.6 invites
 * the opposite reading, which is why it is written down twice. The per-row *download* is withdrawn
 * (2026-08-08): saving is the batch's job now, and view is what a row keeps so the renter can look at
 * one paper without selecting anything.
 *
 * **Both batches act on the ticked rows** — one request naming several types, never one per row (§6.6:
 * *"The renter ticks what he wants and asks once"*), and one download run over every file behind the
 * held rows he ticked.
 */

import { useCallback, useMemo, useState } from "react";
import type { FleetMachine } from "@/lib/contract/fleet";
import { DocRowList } from "./DocRowList";
import { useDownloadBatch } from "./doc-download";
import {
  arDigits,
  batchDocumentRequest,
  docDownloadBatch,
  docRowMode,
  docRowSelectable,
  equipmentDocGroups,
  selectionModeOf,
  type DocDownloadTarget,
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
  // ONE selection set across ALL groups — a batch is the renter's whole act, not one per heading. He can
  // tick the missing plate photo and the missing operator certificate and send once.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const allRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  // **The mode is derived, never stored.** One less piece of state to keep in step with the selection,
  // and the return to neutral on the last untick is free rather than a reset somebody has to remember.
  const mode = selectionModeOf(allRows, selected);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      // The model refuses the mixing tick, not this component — the dimmed checkbox is already inert,
      // so this is the same rule read a second time rather than the only place it is enforced.
      const row = allRows.find((r) => r.key === key);
      if (!row || !docRowSelectable(row, selectionModeOf(allRows, prev))) return prev;
      next.add(key);
      return next;
    });

  const toggleAll = (keys: string[], select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!select) {
        for (const k of keys) next.delete(k);
        return next;
      }
      // Select-all is per mode, so the first key it accepts fixes the mode for the rest of the run —
      // a list of keys can no more mix the selection than a sequence of clicks can.
      let running = selectionModeOf(allRows, prev);
      for (const k of keys) {
        const row = allRows.find((r) => r.key === k);
        if (!row || !docRowSelectable(row, running)) continue;
        next.add(k);
        running = running ?? docRowMode(row);
      }
      return next;
    });

  // ONE filter, in the model, for each verb. `batchDocumentRequest` drops a row that is not requestable
  // and `docDownloadBatch` drops one with no file, so the tick, the count on the live button and the
  // payload are the same rule read once — a second pre-filter here would be where they drift apart.
  const draft = batchDocumentRequest(machine.equipmentId, allRows, selected);
  const requestCount = draft?.kind === "document" ? draft.labels.length : 0;
  const targets = docDownloadBatch(allRows, selected);

  const labelOf = useCallback((t: DocDownloadTarget) => L(t.label.en, t.label.ar), [L]);
  const onDone = useCallback(({ failed }: { failed: number }) => {
    if (failed === 0) setSelected(new Set<string>());
  }, []);
  const { state: batch, running, run } = useDownloadBatch(labelOf, onDone);

  const canDownload = mode === "download" && targets.length > 0 && !running;
  const canRequest = mode === "request" && !!draft && !!onRequest;

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
            mode: docRowMode(r),
            selectable: docRowSelectable(r, mode),
          }))}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          L={L}
        />
      ))}

      {/* BOTH buttons stay visible, and only the one the selection supports is live (owner's UI design,
          2026-08-08). Hiding the other would make the panel change shape under the renter's first tick
          and hide the fact that the same column can do two things; the disabled one keeps its shape and
          says what the other kind of tick would have got him. */}
      <div className="mp-sendrow">
        <button type="button" className="mp-send" disabled={!canDownload} onClick={() => run(targets)}>
          {running
            ? L(`Saving ${batch.phase === "running" ? batch.done : 0}…`, `يُحفظ ${arDigits(batch.phase === "running" ? batch.done : 0)}…`)
            : canDownload
              ? L(`Download (${targets.length})`, `تنزيل (${arDigits(targets.length)})`)
              : L("Download", "تنزيل")}
        </button>
        <button
          type="button"
          className="mp-send wide"
          disabled={!canRequest}
          onClick={() => {
            if (draft && onRequest) {
              onRequest(draft);
              setSelected(new Set<string>());
            }
          }}
        >
          {canRequest
            ? L(`Ask the lessor to send it (${requestCount})`, `اطلب من المؤجّر إرساله (${arDigits(requestCount)})`)
            : L("Ask the lessor to send it", "اطلب من المؤجّر إرساله")}
        </button>
      </div>

      {batch.phase === "done" && (
        <p className="mp-note" dir={ar ? "rtl" : "ltr"} role="status">
          {batch.failed === 0
            ? L(`Saved ${batch.saved} documents.`, `تم حفظ ${arDigits(batch.saved)} مستندات.`)
            : L(
                `Saved ${batch.saved} of ${batch.saved + batch.failed}. Open the rest from their own rows.`,
                `تم حفظ ${arDigits(batch.saved)} من ${arDigits(batch.saved + batch.failed)}. افتح البقية من صفوفها.`,
              )}
        </p>
      )}

      <p className="mp-note" dir={ar ? "rtl" : "ltr"}>
        {L(
          "Tick what is on the file to download it, or what is missing to ask for it — one selection, never both.",
          "حدّد ما هو على الملف لتنزيله، أو ما ينقص لطلبه — تحديد واحد، لا الاثنان معاً.",
        )}
      </p>
    </div>
  );
}
