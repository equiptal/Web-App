"use client";

/**
 * **V9 — company panel** (spec 004 v3 §6.1; AC-40, AC-41, AC-72). Opens **over the whole panel** with
 * its own dark header — company name · verified chip · back.
 *
 * **Usage** — standalone. The host renders it inside a `position: relative` container; `.mp-over`
 * covers that container, which is what "over the whole panel" means here.
 *
 *   <CompanyPanel
 *     companyName={bid.supplierName}
 *     verified={bid.verified}
 *     docs={{ cr: { present: bid.compliance.activityLicense },
 *             vat: { present: bid.compliance.taxNumber, renewsAnnually: true },
 *             national_address: { present: bid.compliance.nationalAddress },
 *             local_content: { present: bid.compliance.localContent } }}
 *     ar={ar} L={L}
 *     onBack={() => setCompanyOpen(false)}
 *   />
 *
 * **Read and open — never request** (product owner, 2026-08-08). This panel briefly carried the same
 * batch «اطلب مستنداً» the equipment tab does, so a renter could ask the firm for its CR. That is
 * withdrawn and stays withdrawn: **a document request names a machine**, and a company paper belongs to
 * the firm. There is **no request control anywhere on this panel**, `onRequest` is not a prop it has,
 * and the composer cannot represent the ask (`RenteeRequestDraft` in `rentee-request.ts`).
 *
 * **The ticks come back — for opening, not for asking** (product owner, same day, later). Removing the
 * ask took the selection UI with it, and that was one step too far: a renter checking a firm wants its
 * CR *and* its VAT certificate, and clicking five rows one at a time is the thing select-all exists to
 * stop. So the checkbox per row and the select-all bar are restored, and the batch action below them is
 * **download**, never a request. AC-72 is corrected in 004a §8 accordingly.
 *
 * **Why the batch saves rather than opens.** Every row's url is a presigned S3 link and the per-row
 * **view** is `target="_blank"`. Five of those from one click is five popups: the browser lets the first
 * through and blocks the rest, and the renter is left believing four papers failed. A batch view is not
 * a thing a browser does well, so **view stays per-row**, where a click is a gesture and the tab always
 * opens. The batch fetches each file and saves it through an object url — no popup permission is
 * involved, every file reports its own success or failure, and the panel says how many landed. See
 * `companyDownloadBatch` and `runCompanyDownloadBatch` below.
 *
 * **A row with no url cannot be ticked.** There is nothing to open or save, so it renders no checkbox
 * and select-all passes it by (`DocRowView.selectable`). AC-69 forbids a dead control; a tick that
 * yields nothing when the batch runs is that same dead control moved one step later.
 *
 * **A document list, not a profile.** No contact info, no deals count, no CR/VAT *numbers* — AC-02
 * keeps identity in the header and paperwork in these rows, and this panel is where the header's
 * «مستندات الشركة ›» lands.
 *
 * **Company rows DO carry verification state and expiry**, unlike the equipment rows of V8. The
 * asymmetry is deliberate (§6.6): a machine's paper is either there or it isn't, but a company's paper
 * is *checked* and it *expires* — hiding that would strand the renter with a CR that lapsed last month.
 *
 * **Every row with a url is openable** — **view**, and view only (004a §7, AC-69, narrowed 2026-08-08).
 * The control is `DocRowList`'s, written once for all three document families this surface names, so the
 * firm's papers and the machine's behave identically; only the status line differs, which is the point.
 * The **per-row download glyph is gone** on both lists: saving is what the batch beneath does, and a
 * second per-row way to do it is one the renter has to learn is redundant.
 *
 * **One mode, and no fork in the shared component.** The equipment tab's checkbox column carries two
 * mutually exclusive modes (download / request); here a row is never requestable, so `selectionModeOf`
 * can only answer `download` or neutral, the dimming path is unreachable, and the select-all bar shows
 * the one link its rows support — «حدّد كل المتاح». The single-mode case fell out of the general one;
 * nothing had to be forked or special-cased for it.
 *
 * **Built without IBAN.** Spec §6.1 and AC-41 both listed it; the product owner said to remove it, and
 * this is built to that decision. This note used to end **"the spec still needs editing"** — that half is
 * withdrawn and is no longer true: `004:131` and `004:704` have been edited and now say no IBAN, so code
 * and spec agree and nothing is outstanding. The decision itself stands: showing a supplier's bank details
 * is not reversible after the fact; adding the row back later is one line.
 */

import { useCallback, useMemo, useState } from "react";
import { DocRowList } from "./DocRowList";
import { downloadFileName, runDownloadBatch, useDownloadBatch } from "./doc-download";
import {
  arDigits,
  attentionCount,
  companyDocRows,
  docDownloadBatch,
  docRowMode,
  docRowSelectable,
  selectionModeOf,
  type CompanyDocInput,
  type CompanyDocKey,
  type CompanyDocRow,
  type DocDownloadTarget,
} from "./machine-panel-model";
import "./panel-proto.css";
import { Icon } from "@/components/Icon";
import { pin } from "@/lib/uiPins";

/* ───────────────────── what the batch acts on — pure, so it is testable ───────────────────── */

/** One file the batch will save: the row it came from, its localisable name, and its presigned url.
 *  Shared with the equipment tab's own download batch — one shape, one runner. */
export type CompanyDownloadTarget = DocDownloadTarget;

/**
 * The keys a renter may tick to DOWNLOAD — **only rows that carry a url**.
 *
 * ~~The panel's whole tick rule: a company row is never requestable, so the panel had one mode~~
 * (owner's UI design, 2026-08-08). Since 2026-10-12 (option 3A) a missing paper can be ticked to ASK
 * for it wherever the host passes `onAsk`; this still answers the download half. The equipment tab reaches the same rule from the other side, where an
 * absent paper is the row worth ticking because ticking it *asks for it*.
 */
export function companySelectableKeys(rows: readonly CompanyDocRow[]): CompanyDocKey[] {
  return rows.filter((r) => docRowMode(r) === "download").map((r) => r.key);
}

/**
 * Exactly what a batch run will fetch: **the ticked rows that have a url**, in the list's own order.
 *
 * Filtering here rather than trusting the selection set is what makes the control honest — a paper that
 * lost its url between the tick and the click simply is not counted, so the button's number and the
 * files that land are the same number. `docDownloadBatch` is the one implementation, shared with the
 * equipment tab; a company row carries exactly one file, so the general "every file behind the row"
 * expansion collapses to one target per row here.
 */
export function companyDownloadBatch(
  rows: readonly CompanyDocRow[],
  selected: ReadonlySet<string>,
): CompanyDownloadTarget[] {
  return docDownloadBatch(rows, selected);
}

/** @see downloadFileName — kept under the panel's own name because this is where the batch was born and
 *  where the spec's TC-25 looks for it. */
export const companyDownloadFileName = downloadFileName;

/** @see runDownloadBatch — the browser half now lives in `doc-download.ts`, because the equipment tab
 *  runs the same batch and the alternative was importing a component file for its helpers. */
export const runCompanyDownloadBatch = runDownloadBatch;

export interface CompanyPanelProps {
  companyName: string;
  /** The firm's verification. The chip renders **only when true** (AC-02) — an absent chip is the whole
   *  statement for an unverified firm, and a grey "not verified" badge is a verdict nobody asked for. */
  verified: boolean;
  /** CR · VAT · national address · local content · SASO. A key the caller omits reads as "no document
   *  yet" — and, carrying no url, is a row the renter cannot tick. */
  docs: Partial<Record<CompanyDocKey, CompanyDocInput>>;
  ar: boolean;
  L: (en: string, ar: string) => string;
  onBack: () => void;
  /**
   * Ask the supplier for the ticked MISSING papers (owner, 2026-10-12, option 3A: «ask in the
   * documents view, not only in the chat»). Handed up: the chat dock sends it, after the renter
   * reviews it there. Absent, the panel is download-only, as it was.
   */
  onAsk?: (keys: CompanyDocKey[]) => void;
  /** Papers already asked for and still waiting: never tickable again, and they say so. */
  asked?: ReadonlySet<CompanyDocKey>;
}

export function CompanyPanel({ companyName, verified, docs, ar, L, onBack, onAsk, asked }: CompanyPanelProps) {
  const rows = useMemo(() => companyDocRows({ verified, docs }), [verified, docs]);
  const attention = attentionCount(rows);

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());

  /* 🔴 **A missing paper is now a row to ASK for** (owner, 2026-10-12, option 3A), reversing the
     2026-08-08 «a company row is never requestable» (RM3-AC-72) wherever the host can send the ask.
     The two modes cannot mix for the same reason they cannot on the equipment tab: the mode is the
     first tick's kind (`selectionModeOf`), and the other kind's rows go inert until it is cleared. */
  const askRows = useMemo(
    () => rows.map((r) => ({ ...r, requestable: !!onAsk && r.status === "missing" && !asked?.has(r.key) })),
    [rows, onAsk, asked],
  );
  const mode = selectionModeOf(askRows, selected);

  // A row with no mode never enters the set. `companyDownloadBatch` filters again on the way out, so the
  // guard is belt-and-braces — but keeping the set clean is what makes the button's count truthful.
  const openable = useMemo(() => new Set<string>(askRows.filter((r) => docRowMode(r) !== null).map((r) => r.key)), [askRows]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      if (!openable.has(key)) return prev;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = (keys: string[], select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (select) {
          if (openable.has(k)) next.add(k);
        } else next.delete(k);
      }
      return next;
    });

  const targets = companyDownloadBatch(rows, selected);
  const askKeys = mode === "request" ? askRows.filter((r) => r.requestable && selected.has(r.key)).map((r) => r.key) : [];

  const labelOf = useCallback((t: DocDownloadTarget) => L(t.label.en, t.label.ar), [L]);
  const onDone = useCallback(({ failed }: { failed: number }) => {
    if (failed === 0) setSelected(new Set<string>());
  }, []);
  const { state: batch, running, run } = useDownloadBatch(labelOf, onDone);

  const sendLabel =
    batch.phase === "running"
      ? L(`Saving ${batch.done} of ${batch.total}…`, `يُحفظ ${arDigits(batch.done)} من ${arDigits(batch.total)}…`)
      : targets.length === 0
        ? L("Download", "تنزيل")
        : L(`Download (${targets.length})`, `تنزيل (${arDigits(targets.length)})`);

  return (
    <div {...pin("company-panel")} className="mp mp-over" dir={ar ? "rtl" : "ltr"}>
      {/* **The prototype's header, at 64 px** (2026-08-09): a circular back, the firm's initials, its
          name, and the verified chip. The subtitle «مستندات الشركة» is gone from it — the group
          heading four lines down already says exactly that, and a header that repeats the first
          heading under it is a line of chrome. The prototype's own note is stronger still: rating,
          deal count and city are absent because this file exists to answer «are his papers in
          order?», and nothing that does not serve that question belongs up here. */}
      <div className="mp-cohead">
        <button type="button" className="mp-back" onClick={onBack} aria-label={L("Back", "رجوع")} title={L("Back", "رجوع")}>
          <span aria-hidden="true">{ar ? "›" : "‹"}</span>
        </button>
        {/* ~~A 40px tile carrying the firm's initials.~~ Removed (owner, 2026-09-10: *"remove this
            capital icon"*). It was decoration in front of the name it abbreviated, on the one header
            whose whole job is to say whose papers these are — «AC» beside «Al-Faisal Contracting
            Est.» told the reader nothing the next element did not say in full. `companyInitials` is
            NOT dead: `RequestCard` draws the counterparty's mark from it. */}
        <span className="mp-coname">{companyName}</span>
        {verified && (
          <span className="mp-vchip">
            {/* ── The product's OWN verified badge (owner, 2026-09-10) ────────────────────────────
                *"use the verified badge style and icon used in other surfaces"*.

                ~~A hand-drawn stroked check~~ (2026-08-19, when this surface was a prototype with a
                palette of its own). Everywhere else the fact is stated with the material `verified`
                rosette — the profile's own block, the Moedatech picker, the request details chips —
                so the map panel was the last place drawing its own tick. The chip's colours follow
                in `panel-proto.css`: `--ok` on `--ok-soft`, the shape those chips carry. */}
            <Icon name="verified" size={13} />
            {L("Verified company", "شركة موثّقة")}
          </span>
        )}
      </div>

      <div className="mp-scroll">
        <div className="mp-body">
          <DocRowList
            groupLabel={L("Company documents", "مستندات الشركة")}
            attention={attention}
            rows={askRows.map((r) => ({
              key: r.key,
              name: L(r.label.en, r.label.ar),
              status: asked?.has(r.key) && r.status === "missing"
                ? L("asked, awaiting reply", "طُلب، بانتظار الرد")
                : L(r.statusLine.en, r.statusLine.ar),
              dot: r.status,
              thumbUrl: null,
              downloadUrl: r.downloadUrl,
              // A file to save, a missing paper to ask for, or neither (asked already, or no host to send).
              mode: docRowMode(r),
              selectable: docRowSelectable(r, mode),
            }))}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            L={L}
          />

          {/* The batch is DOWNLOAD, never a request (AC-72), and there is only ever ONE button here —
              the equipment tab's disabled second button would name an act this panel refuses to offer.
              Same `.mp-send` affordance, so the renter reads it the same way; the verb is what differs. */}
          {mode === "request" && onAsk ? (
            <button
              type="button"
              className="mp-send"
              disabled={askKeys.length === 0}
              onClick={() => { onAsk(askKeys); setSelected(new Set<string>()); }}
            >
              {L(`Ask the supplier (${askKeys.length})`, `اطلبها من المؤجر (${arDigits(askKeys.length)})`)}
            </button>
          ) : (
            <button
              type="button"
              className="mp-send"
              disabled={running || targets.length === 0}
              onClick={() => run(targets)}
            >
              {sendLabel}
            </button>
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
              "Ticking saves papers together. Viewing stays per row — a browser blocks several tabs opened at once.",
              "التحديد يحفظ المستندات معاً. أمّا العرض فيبقى لكل صف — المتصفح يحجب فتح عدة تبويبات دفعةً واحدة.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
