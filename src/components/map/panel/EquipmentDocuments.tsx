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
 * **Up to three groups** — photos · documents · **the operator's documents**, which are a section of
 * their own and not one row buried in the equipment's papers. The first two carry an attention count of
 * **rows needing action, never totals**; the operator's carries none (see below). A group with nothing to
 * say does not render.
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
 * **Both footer buttons stay visible** — «تنزيل» and «اطلب من المورد إرساله» — with only the one the
 * selection supports live, carrying its count; the other keeps its shape and is disabled. Clearing the
 * last tick returns to neutral and re-enables everything, which is free here because the mode is
 * derived rather than stored. Every judgement is the model's; this component paints it.
 *
 * **The operator's group is a status, not a document list** (owner, same day, narrowed later the same
 * day). Its rows say only whether each certificate is on file — *"they are just a view of what the
 * supplier has"* — and it **participates in nothing else on this tab**: no checkbox in either mode, no
 * place in either batch, no select-all key, and no attention count of its own or in the tab badge above.
 * Nothing validates an operator document on upload, so presence is the only claim the platform can stand
 * behind and there is nothing here for the renter to act on. Those rows simply arrive with no files and
 * `requestable: false`, so the shared row grammar below needs no special case — `docRowMode` answers
 * `null` and every mechanism on this page already ignores a `null`-mode row.
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
 * **And pressing a row now puts that paper in the panel's VIEWER** (owner, 2026-08-11; the prototype's
 * `eqDocsTab`, *"Every row opens in the viewer above"*). This tab does not own the frame — `V7` does —
 * so the press is handed up through `onView` exactly as the ask is handed up through `onRequest`, and
 * the row that is currently framed comes back down as `viewingKey`. What this component adds on the way
 * is the one thing V7 cannot know: whether the row is a **photo** or a **paper**, which it reads off the
 * group the row came from rather than by sniffing a url. The two are framed differently — a photograph
 * fills its frame, a certificate is a sheet laid on white — and guessing that from a presigned link is
 * exactly the MIME sniffing this directory has refused twice.
 *
 * **The tab's own FOOTER** (the prototype's `eqDocsTab`, 4399/4408). The tab is a column with
 * `min-height: 100%`, its groups on the prototype's `13px 14px 4px`, and the two batch buttons in a
 * sticky 76 px bar at the foot of it — not a row of buttons that scrolls away under the last document.
 * V7's own footer already steps aside on this tab for exactly that reason, and until now it stepped
 * aside for nothing: the actions were wherever the renter had scrolled to.
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

/**
 * What the panel's viewer is being asked to show (owner, 2026-08-11).
 *
 * It is a **resolved subject**, not a row key: the frame above cannot reach into this tab's model, and a
 * key would make it. Four fields and no more — what to draw, what to call it, and which of the two ways
 * to draw it.
 */
export interface DocViewSubject {
  /** The row this came from, handed straight back down as `viewingKey` so the list can mark it. */
  key: string;
  /** Already localised — the frame's caption says it verbatim and does no lookup of its own. */
  name: string;
  /** The row's primary file (`docRowActions(row)[0]`), resolved by `DocRowList`. */
  url: string;
  /**
   * **A photograph fills the frame; a paper is a sheet laid on white.** Read off the GROUP the row
   * belongs to, never guessed from the url — the prototype makes the same split (`eqViewer`: a photo
   * renders `contain` over its dark backdrop, a document `contain` over white with the caption's height
   * cleared beneath it) and gets it from `eqDocKind` for the same reason.
   */
  kind: "photo" | "paper";
}

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
  /**
   * Whether the batch currently ticked is a question already with the lessor and unanswered — the
   * owner's "one ask, one card" rule (2026-08-10). Asked of the host for the same reason `onRequest`
   * is handed upward: the conversation that records these cards is V12's, and this tab cannot see it.
   *
   * It is asked about the **built draft**, never about the ticks, so the guard sees exactly the
   * `docTypes` that would be sent — the same set, canonicalised the same way, whatever order the rows
   * were ticked in.
   */
  askPending?: (draft: PanelRequestDraft) => boolean;
  /** Put this document in the panel's viewer. Handed upward for the same reason `onRequest` is: the
   *  frame is V7's, and this tab can no more draw in it than it can post a request. Omit it and rows
   *  stop pressing — they keep their `↗`, and nothing else about the tab changes. */
  onView?: (subject: DocViewSubject) => void;
  /** Which row the frame is showing right now, so the list can mark it. V7's state, read back down. */
  viewingKey?: string | null;
}

export function EquipmentDocuments({
  machine,
  request,
  ar,
  L,
  onRequest,
  askPending,
  onView,
  viewingKey,
}: EquipmentDocumentsProps) {
  const groups = useMemo(() => equipmentDocGroups(machine, request), [machine, request]);
  // ONE selection set across ALL groups — a batch is the renter's whole act, not one per heading. He can
  // tick the missing plate photo and a missing equipment certificate — two different groups — and send once.
  //
  // That example used to read «the missing plate photo **and the missing operator certificate**». **The
  // operator half is withdrawn** (owner, 2026-08-08, narrowing AC-75) and would now be false: operator
  // rows are inert in every mode. `operatorStatusRows` gives them no url and `requestable: false`, so
  // `docRowMode` answers `null` and they carry no checkbox to tick — they can join neither the request
  // batch nor the download one. The cross-group point the example was making still holds; it just needs
  // two groups that actually have checkboxes.
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
  /* ── One ask, one card (owner, 2026-08-10) ──────────────────────────────────────────────────────
     A batch is a question about a SET of papers, so re-ticking the same rows — in any order, from
     either group — is the same question asked twice and the send is withheld. Ticking a different
     set is a different question and goes through: having asked for the istimara does not bar asking
     for the TÜV as well. All of that judgement is the identity's, upstream; this only asks. */
  const pending = draft != null && (askPending?.(draft) ?? false);
  const canRequest = mode === "request" && !!draft && !!onRequest && !pending;

  return (
    <div className="mp-docs">
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
          // The group is what decides `kind`, which is the whole reason this closure is built per group
          // rather than passed straight through. Anything the operator's group might send is moot — its
          // rows carry no file, so `DocRowList` never offers the press on one.
          onView={
            onView
              ? (row, href) => onView({ key: row.key, name: row.name, url: href, kind: g.key === "photos" ? "photo" : "paper" })
              : undefined
          }
          viewingKey={viewingKey}
          L={L}
        />
      ))}

      {/* **The notes come BEFORE the bar now.** They are sentences about the list — what a tick means,
          why the send is withheld, what the last run saved — and the bar they used to sit under is
          sticky, so leaving them there would have put the explanation permanently below the control it
          explains, at the bottom of a scroll. */}
      <div className="mp-docs-notes">
        {/* The reason the send is inert, IN WORDS — the ticks are still on screen and still look
            sendable, so a control that merely greyed out would read as a broken page rather than as a
            rule. It says what to do about it too: the answer arrives in the conversation, not here.
            Written inline through `L` like every other sentence in this directory. */}
        {pending && (
          <p className="mp-note" dir={ar ? "rtl" : "ltr"} role="status">
            {L(
              "You've already asked for exactly these documents and the supplier hasn't answered yet — his reply will arrive in the chat. Tick a different document to ask for that one.",
              "سبق أن طلبت هذه المستندات بعينها ولم يردّ المورد بعد — سيصلك ردّه في المحادثة. حدّد مستنداً آخر لطلبه.",
            )}
          </p>
        )}

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
            "Tick what is on the file to download it, or what is missing to ask for it — one selection, never both. Press a row to read it in the viewer above.",
            "حدّد ما هو على الملف لتنزيله، أو ما ينقص لطلبه — تحديد واحد، لا الاثنان معاً. اضغط الصف لقراءته في العارض أعلاه.",
          )}
        </p>
      </div>

      {/* BOTH buttons stay visible, and only the one the selection supports is live (owner's UI design,
          2026-08-08). Hiding the other would make the panel change shape under the renter's first tick
          and hide the fact that the same column can do two things; the disabled one keeps its shape and
          says what the other kind of tick would have got him.

          The bar is the prototype's own (4408): 76 px, `0 18px`, `margin-top: auto` so it sits at the
          foot of a short list, and `position: sticky` so it is still there at the foot of a long one. */}
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
          title={pending ? L("You've already asked this, and the supplier hasn't answered yet.", "سبق أن طلبت هذا، ولم يردّ المورد بعد.") : undefined}
          onClick={() => {
            if (draft && onRequest) {
              onRequest(draft);
              setSelected(new Set<string>());
            }
          }}
        >
          {pending
            ? L("Asked — awaiting his reply", "طُلب — بانتظار ردّه")
            : canRequest
              ? L(`Ask the supplier to send it (${requestCount})`, `اطلب من المورد إرساله (${arDigits(requestCount)})`)
              : L("Ask the supplier to send it", "اطلب من المورد إرساله")}
        </button>
      </div>
    </div>
  );
}
