"use client";

/**
 * **V9 — company panel** (spec 004 v3 §6.1; AC-40, AC-41). Opens **over the whole panel** with its own
 * dark header — company name · verified chip · back.
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
 * select-all + batch «اطلب مستنداً» the equipment tab does, so a renter could ask the firm for its CR.
 * That is withdrawn: **a document request names a machine**, and a company paper belongs to the firm.
 * The checkboxes, the select-all bar, the send button and the `onRequest` prop are all gone, and the
 * composer can no longer represent the ask (`RenteeRequestDraft` in `rentee-request.ts`). §6.6's "both
 * use the same grammar" is corrected in the spec accordingly.
 *
 * **Nothing else changed.** All five papers are still listed, still carry verification state and
 * expiry, and still open and download (V15 / AC-69).
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

import { useMemo } from "react";
import { DocRowList } from "./DocRowList";
import {
  attentionCount,
  companyDocRows,
  type CompanyDocInput,
  type CompanyDocKey,
} from "./machine-panel-model";
import "./panel-proto.css";

export interface CompanyPanelProps {
  companyName: string;
  /** The firm's verification. The chip renders **only when true** (AC-02) — an absent chip is the whole
   *  statement for an unverified firm, and a grey "not verified" badge is a verdict nobody asked for. */
  verified: boolean;
  /** CR · VAT · national address · local content. A key the caller omits reads as "no document yet". */
  docs: Partial<Record<CompanyDocKey, CompanyDocInput>>;
  ar: boolean;
  L: (en: string, ar: string) => string;
  onBack: () => void;
}

export function CompanyPanel({ companyName, verified, docs, ar, L, onBack }: CompanyPanelProps) {
  const rows = useMemo(() => companyDocRows({ verified, docs }), [verified, docs]);
  const attention = attentionCount(rows);

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
            }))}
            /* No `selected` / `onToggle` / `onToggleAll`: these rows cannot be requested, so they
               render with no tick and no select-all bar. See the note at the top of this file. */
            L={L}
          />
        </div>
      </div>
    </div>
  );
}
