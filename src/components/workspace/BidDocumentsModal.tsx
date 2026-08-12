"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { fetchBidDocuments } from "@/lib/api/client";
import type { DealRoomDocument, DealRoomDocuments } from "@/lib/contract/deal-room";

/**
 * The papers behind one bid — the company's, and the offered machine's — raised from the dark strip.
 *
 * A row **opens** its document and nothing else. There is no per-row download and no request control:
 * downloading is a batch, and a document request names a machine, both settled in spec 004a §8. This
 * surface only shows what is there.
 *
 * A row whose link never arrived is listed but not pressable. Hiding it would say the paper does not
 * exist, when what is true is that we cannot open it — different facts, and the renter is here to
 * judge which.
 */
export function BidDocumentsModal({ bidId, supplier, onClose }: { bidId: string; supplier: string; onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [docs, setDocs] = useState<DealRoomDocuments | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchBidDocuments(bidId)
      .then((d) => live && setDocs(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [bidId]);

  const total = (docs?.companyDocuments.length ?? 0) + (docs?.equipmentDocuments.length ?? 0);

  return (
    <>
      <div className="fixed inset-0 z-[55] bg-navy/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.workspace.viewDocuments}
        className="fixed inset-x-4 top-1/2 z-[56] mx-auto max-h-[80vh] w-full max-w-[440px] -translate-y-1/2 overflow-y-auto rounded-[16px] bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[16px] font-extrabold text-navy">{t.workspace.viewDocuments}</h3>
            <p className="truncate text-[12.5px] font-semibold text-muted">{supplier}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface2 text-navy-mid">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          {failed ? (
            <p className="py-6 text-center text-[13px] font-semibold text-muted">{t.workspace.docsFailed}</p>
          ) : !docs ? (
            <p className="py-6 text-center text-[13px] font-semibold text-muted">{t.workspace.loading}</p>
          ) : total === 0 ? (
            <p className="py-6 text-center text-[13px] font-semibold text-muted">{t.workspace.docsNone}</p>
          ) : (
            <>
              <Group title={t.workspace.docsEquipment} docs={docs.equipmentDocuments} ar={ar} />
              <Group title={t.workspace.docsCompany} docs={docs.companyDocuments} ar={ar} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Group({ title, docs, ar }: { title: string; docs: DealRoomDocument[]; ar: boolean }) {
  const t = useT();
  if (docs.length === 0) return null;
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">{title}</div>
      <ul className="mt-2 space-y-1.5">
        {docs.map((d, i) => {
          const label = (ar ? d.labelAr : null) ?? d.label;
          const openable = Boolean(d.url);
          return (
            <li key={`${d.type}-${i}`}>
              <a
                href={openable ? d.url : undefined}
                target={openable ? "_blank" : undefined}
                rel={openable ? "noopener noreferrer" : undefined}
                aria-disabled={!openable}
                className={`flex items-center gap-2.5 rounded-[10px] border border-border px-3 py-2.5 ${
                  openable ? "bg-surface transition hover:border-navy-mid" : "cursor-not-allowed bg-surface2"
                }`}
              >
                <Icon name="description" size={18} className={openable ? "text-navy-mid" : "text-muted"} />
                <span className={`flex-1 truncate text-[13px] font-bold ${openable ? "text-navy" : "text-muted"}`}>{label}</span>
                <span className="flex-none text-[11.5px] font-bold text-muted">
                  {openable ? t.workspace.docOpen : t.workspace.docNoLink}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
