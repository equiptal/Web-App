"use client";

/**
 * **The supplier's documents sheet — one component, two surfaces** (owner, 2026-08-19).
 *
 * Lifted out of `DealRoom.tsx` unchanged so the map's chat dock can reach the same papers from its
 * kebab. It was private to a 1,700-line file, which is why the dock had no route to a supplier's
 * documents at all and the renter had to close the conversation to read them.
 *
 * Addressed by DEAL ROOM id: the endpoint is the room's, and the room exists as soon as anything has
 * been sent — a message, an ask, a counter (004a §4.5). A bid nobody has written to has no room and
 * therefore no sheet, which is why the control that opens this is gated on the id rather than always
 * drawn.
 *
 * Mirrors the app's deal-room documents sheet. The backend returns the OTHER
 * party's documents only (for the renter: the supplier's company + equipment docs). Each doc opens
 * its backend-presigned URL (pdf/image) in a new tab.
 */

import { useEffect, useState } from "react";
import { fetchDealRoomDocuments } from "@/lib/api/client";
import type { DealRoomDocument, DealRoomDocuments } from "@/lib/contract/deal-room";
import "@/components/deal-room/deal-room-proto.css";


/** "Supplier's documents" titled with the supplier name, matching the app's docsSheetTitle. */
function fmtDocsTitle(L: (en: string, arr: string) => string, supplierName: string): string {
  const name = supplierName || L("the supplier", "المؤجّر");
  return L(name + "’s documents", "مستندات " + name);
}

export function DocumentsModal({ id, ar, L, supplierName, onClose }: { id: string; ar: boolean; L: (en: string, arr: string) => string; supplierName: string; onClose: () => void }) {
  const [docs, setDocs] = useState<DealRoomDocuments | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDealRoomDocuments(id)
      .then((d) => active && setDocs(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [id]);

  const total = (docs?.companyDocuments.length ?? 0) + (docs?.equipmentDocuments.length ?? 0);

  const Row = ({ d }: { d: DealRoomDocument }) => (
    <a href={d.url} target="_blank" rel="noopener noreferrer" className="dl-docrow">
      <span className="material-icons-outlined ft" style={{ color: d.fileType === "image" ? "var(--rentee)" : "var(--danger)" }}>
        {d.fileType === "image" ? "image" : "picture_as_pdf"}
      </span>
      <span className="nm">{ar && d.labelAr ? d.labelAr : d.label}</span>
      <span className="material-icons-outlined go">open_in_new</span>
    </a>
  );

  const Section = ({ title, items }: { title: string; items: DealRoomDocument[] }) =>
    items.length === 0 ? null : (
      <div className="dl-docsec">
        <div className="dl-docsec-h">{title}</div>
        {items.map((d) => <Row key={d.type} d={d} />)}
      </div>
    );

  return (
    <div className="dl-modal" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
      <div className="dl-modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="dl-modal-head">
          <span className="dl-modal-ic"><span className="material-icons-outlined">folder</span></span>
          <div className="dl-modal-tt"><div className="dl-modal-title">{fmtDocsTitle(L, supplierName)}</div></div>
          <button className="dl-modal-x" onClick={onClose} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
        </div>
        <div className="dl-modal-body">
          {error ? (
            <p className="dl-modal-note">{L("Couldn’t load documents.", "تعذّر تحميل المستندات.")}</p>
          ) : !docs ? (
            <div style={{ display: "grid", placeItems: "center", padding: "24px 0" }}><span className="material-icons-outlined" style={{ fontSize: 24, color: "var(--muted)" }}>progress_activity</span></div>
          ) : total === 0 ? (
            <p className="dl-modal-note">{L("No documents shared yet.", "لا توجد مستندات بعد.")}</p>
          ) : (
            <>
              <Section title={L("Company", "مستندات الشركة")} items={docs.companyDocuments} />
              <Section title={L("Equipment", "مستندات المعدة")} items={docs.equipmentDocuments} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
