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
 *     onRequest={(draft) => compose(draft)}   // PanelRequestDraft — V11 owns the composer
 *   />
 *
 * **A document list, not a profile.** No contact info, no deals count, no CR/VAT *numbers* — AC-02
 * keeps identity in the header and paperwork in these rows, and this panel is where the header's
 * «مستندات الشركة ›» lands.
 *
 * **Company rows DO carry verification state and expiry**, unlike the equipment rows of V8. The
 * asymmetry is deliberate (§6.6): a machine's paper is either there or it isn't, but a company's paper
 * is *checked* and it *expires* — hiding that would strand the renter with a CR that lapsed last month.
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
  batchDocumentRequest,
  companyDocRows,
  type CompanyDocInput,
  type CompanyDocKey,
  type PanelRequestDraft,
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
  onRequest?: (draft: PanelRequestDraft) => void;
}

export function CompanyPanel({ companyName, verified, docs, ar, L, onBack, onRequest }: CompanyPanelProps) {
  const rows = useMemo(() => companyDocRows({ verified, docs }), [verified, docs]);
  const attention = attentionCount(rows);
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

  // Company papers belong to the FIRM, so the draft carries a null `equipmentId` — naming a machine on
  // a CR request would thread the answer onto the wrong subject.
  const draft = batchDocumentRequest("company", null, rows, selected);
  const picked = rows.filter((r) => selected.has(r.key)).length;

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
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            L={L}
          />

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
            {picked === 0
              ? L("Request documents — tick what you need", "اطلب مستندات — حدّد ما تحتاجه")
              : L(`Request ${picked} documents`, `اطلب ${arDigits(picked)} مستندات`)}
          </button>
          <p className="mp-note">
            {L(
              "One request naming everything you ticked — not one message per row.",
              "طلب واحد يذكر كل ما حدّدته — لا رسالة لكل صف.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
