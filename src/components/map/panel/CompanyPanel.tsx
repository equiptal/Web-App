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
 * **Every row with a url is openable** — **view** first, download second (004a §7, AC-69). The pair is
 * `DocRowList`'s, written once for all three document families this surface names, so the firm's papers
 * and the machine's behave identically; only the status line differs, which is the point.
 *
 * **Built without IBAN.** Spec §6.1 and AC-41 both list it; the product owner has since said to remove
 * it, and this is built to that decision — **the spec still needs editing**. Showing a supplier's bank
 * details is not reversible after the fact; adding the row back later is one line.
 */

import { useMemo, useState } from "react";
import { DocRowList } from "./DocRowList";
import {
  arDigits,
  attentionCount,
  companyDocRows,
  type CompanyDocInput,
  type CompanyDocKey,
  type CompanyDocRow,
} from "./machine-panel-model";
import "./panel-proto.css";

/* ───────────────────── what the batch acts on — pure, so it is testable ───────────────────── */

/** One file the batch will save: the row it came from, its localisable name, and its presigned url. */
export interface CompanyDownloadTarget {
  key: CompanyDocKey;
  label: { en: string; ar: string };
  url: string;
}

/**
 * The keys a renter is allowed to tick — **only rows that carry a url**.
 *
 * The equipment tab's rule is the opposite one, and deliberately so: there, an absent paper is exactly
 * the row worth ticking, because ticking it *asks for it*. Here the tick feeds a download, so a row with
 * no file behind it can only disappoint.
 */
export function companySelectableKeys(rows: readonly CompanyDocRow[]): CompanyDocKey[] {
  return rows.filter((r) => !!r.downloadUrl).map((r) => r.key);
}

/**
 * Exactly what a batch run will fetch: **the ticked rows that have a url**, in the list's own order.
 *
 * Filtering here rather than trusting the selection set is what makes the control honest — a paper that
 * lost its url between the tick and the click simply is not counted, so the button's number and the
 * files that land are the same number.
 */
export function companyDownloadBatch(
  rows: readonly CompanyDocRow[],
  selected: ReadonlySet<string>,
): CompanyDownloadTarget[] {
  return rows
    .filter((r) => selected.has(r.key) && !!r.downloadUrl)
    .map((r) => ({ key: r.key, label: r.label, url: r.downloadUrl as string }));
}

/**
 * What the saved file is called. The presigned key is a uuid, so a batch of five would land as five
 * unreadable names; the row's own label is what the renter just read on screen.
 *
 * The extension is copied off the url's path when it looks like one, and omitted otherwise — a wrong
 * extension is worse than none, because it makes the operating system open the file with the wrong app.
 */
export function companyDownloadFileName(label: string, url: string): string {
  let ext = "";
  try {
    const path = new URL(url, "https://x.invalid").pathname;
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    if (m) ext = `.${m[1].toLowerCase()}`;
  } catch {
    /* an unparseable url still downloads; it just gets no extension */
  }
  // Anything a file system would read as a path separator, and the characters Windows refuses.
  const safe = label.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "document";
  return `${safe}${ext}`;
}

/** How a finished run reads. `failed > 0` is always shown — a partial batch that says nothing is the
 *  exact failure the popup-blocked "view all" would have been. */
type BatchState =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; saved: number; failed: number };

/**
 * Save one presigned file without navigating and without opening a tab.
 *
 * `<a download href={presignedUrl}>` will not do: the bucket is cross-origin and the objects are not
 * signed with an attachment disposition, so the browser ignores `download` and **navigates the panel
 * away**. Fetching to a blob and pointing the anchor at an object url keeps the download same-origin
 * from the browser's point of view, which is what makes `download` binding.
 *
 * Depends on the bucket answering the app's origin with CORS headers. When it does not, the fetch
 * rejects — which is why the caller counts failures and says so, instead of leaving the renter to guess.
 */
async function saveOne(target: CompanyDownloadTarget, name: string): Promise<void> {
  const res = await fetch(target.url, { credentials: "omit", mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: Safari and Firefox still need the object url alive when the save actually starts.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Run the batch **one file at a time**, reporting progress, and never let one failure kill the rest.
 *
 * Sequential rather than parallel because a browser's own "download several files?" prompt is per-run,
 * and because a serial run gives a truthful running count.
 */
export async function runCompanyDownloadBatch(
  targets: readonly CompanyDownloadTarget[],
  labelOf: (t: CompanyDownloadTarget) => string,
  onProgress: (done: number) => void,
): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      await saveOne(t, companyDownloadFileName(labelOf(t), t.url));
      saved += 1;
    } catch {
      failed += 1;
    }
    onProgress(saved + failed);
  }
  return { saved, failed };
}

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
}

export function CompanyPanel({ companyName, verified, docs, ar, L, onBack }: CompanyPanelProps) {
  const rows = useMemo(() => companyDocRows({ verified, docs }), [verified, docs]);
  const attention = attentionCount(rows);

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [batch, setBatch] = useState<BatchState>({ phase: "idle" });

  // A key with no url never enters the set. `companyDownloadBatch` filters again on the way out, so the
  // guard is belt-and-braces — but keeping the set clean is what makes the button's count truthful.
  const openable = useMemo(() => new Set<string>(companySelectableKeys(rows)), [rows]);

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
  const running = batch.phase === "running";

  const sendLabel =
    batch.phase === "running"
      ? L(`Saving ${batch.done} of ${batch.total}…`, `يُحفظ ${arDigits(batch.done)} من ${arDigits(batch.total)}…`)
      : targets.length === 0
        ? L("Download documents — tick what you need", "نزّل المستندات — حدّد ما تحتاجه")
        : L(`Download ${targets.length} documents`, `نزّل ${arDigits(targets.length)} مستندات`);

  const download = async () => {
    if (running || targets.length === 0) return;
    setBatch({ phase: "running", done: 0, total: targets.length });
    const { saved, failed } = await runCompanyDownloadBatch(
      targets,
      (t) => L(t.label.en, t.label.ar),
      (done) => setBatch({ phase: "running", done, total: targets.length }),
    );
    setBatch({ phase: "done", saved, failed });
    if (failed === 0) setSelected(new Set<string>());
  };

  return (
    <div className="mp mp-over" dir={ar ? "rtl" : "ltr"}>
      <div className="mp-cohead">
        <button type="button" className="mp-back" onClick={onBack}>
          <span aria-hidden="true">{ar ? "›" : "‹"}</span>
          {L("Back", "رجوع")}
        </button>
        <span className="tx">
          <b>{companyName}</b>
          <span>{L("Company documents", "مستندات الشركة")}</span>
        </span>
        {verified && (
          <span className="mp-vchip">
            <span aria-hidden="true">✓</span>
            {L("Verified company", "شركة موثّقة")}
          </span>
        )}
      </div>

      <div className="mp-scroll">
        <div className="mp-body">
          <DocRowList
            groupLabel={L("Company documents", "مستندات الشركة")}
            attention={attention}
            rows={rows.map((r) => ({
              key: r.key,
              name: L(r.label.en, r.label.ar),
              status: L(r.statusLine.en, r.statusLine.ar),
              dot: r.status,
              thumbUrl: null,
              downloadUrl: r.downloadUrl,
              // No file behind it, so nothing for a batch to save — and never a tick that does nothing.
              selectable: !!r.downloadUrl,
            }))}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            L={L}
          />

          {/* The batch is DOWNLOAD, never a request (AC-72). Same `.mp-send` affordance the equipment
              tab uses, so the renter reads it the same way — the verb is what differs. */}
          <button type="button" className="mp-send" disabled={running || targets.length === 0} onClick={download}>
            {sendLabel}
          </button>

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
