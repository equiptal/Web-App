"use client";

/**
 * The papers behind one award (W-T19 · spec §8.3).
 *
 * A purchase order, a signed contract, the supplier's own quotation. They hang on the **award**, not
 * the item, because a machine line split across two vendors has two POs and hanging both on the item
 * would leave a renter guessing which is whose.
 *
 * ── Ours is generated; theirs is uploaded ────────────────────────────────────────────────────────
 *
 * The product already generates a quotation for every marketplace request, and its download lives in
 * the row menu. The *supplier quotation* here is the one the SUPPLIER sent — a different paper with
 * the same name. On a marketplace row this dialog says which is which, because a renter who uploads
 * a supplier's quotation and later finds ours has lost track of who promised what.
 *
 * ── Removing one is not softened ─────────────────────────────────────────────────────────────────
 *
 * The file goes and does not come back. The confirmation is the file's own name in the button, so
 * the renter reads what they are removing rather than the word *Delete*.
 */

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import type { Award, AwardDocumentKind } from "@/lib/contract/award";

const KINDS: AwardDocumentKind[] = ["po", "contract", "quotation", "other"];

const ICON: Record<AwardDocumentKind, string> = {
  po: "receipt_long",
  contract: "gavel",
  quotation: "request_quote",
  other: "description",
};

/** 10 MB. A PO is a page; anything larger is a scan nobody meant to attach at that size. */
const MAX_BYTES = 10 * 1024 * 1024;

export function DocumentsDialog({
  open,
  onClose,
  award,
  /** True for a marketplace row — only then is there a generated quotation to distinguish ours from. */
  isRequest,
  onAttach,
  onRemove,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  award: Award;
  isRequest: boolean;
  onAttach: (doc: { kind: AwardDocumentKind; filename: string; data: string }) => void;
  onRemove: (docId: string) => void;
  busy?: boolean;
}) {
  const t = useT();
  const d = t.projects.docs;
  const [kind, setKind] = useState<AwardDocumentKind>("po");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      // Said before the upload rather than after it fails on the way out.
      setError(d.tooBig.replace("{max}", "10 MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onAttach({ kind, filename: file.name, data: String(reader.result) });
    reader.onerror = () => setError(d.readFailed);
    reader.readAsDataURL(file);
  }

  return (
    <Dialog open={open} onClose={onClose} title={d.title} subtitle={`${award.supplierName} ×${award.units}`}>
      <div className="flex flex-col gap-4">
        {award.documents.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {award.documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2.5 px-3 py-2">
                <Icon name={ICON[doc.kind] ?? "description"} size={15} className="flex-none text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-navy">{doc.filename}</span>
                  <span className="block text-meta text-muted">
                    {d.kinds[doc.kind]}
                    {doc.uploadedAt ? ` · ${doc.uploadedAt.slice(0, 10)}` : ""}
                  </span>
                </span>

                {confirming === doc.id ? (
                  <span className="flex flex-none items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirming(null);
                        onRemove(doc.id);
                      }}
                      className="text-meta font-semibold text-danger underline underline-offset-2"
                    >
                      {/* The file's own name, so they read what goes rather than the word Delete. */}
                      {d.removeNamed.replace("{name}", doc.filename)}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="text-meta text-muted underline underline-offset-2">
                      {t.common.cancel}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(doc.id)}
                    aria-label={t.common.remove}
                    className="flex-none text-muted transition hover:text-danger"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-muted">{d.none}</p>
        )}

        {/* Which quotation is which. Only on a marketplace row — a work order has no generated one. */}
        {isRequest && (
          <p className="flex items-start gap-2 rounded-sm border border-border bg-surface2/50 px-3 py-2 text-meta text-navy-mid">
            <Icon name="info" size={14} className="mt-px flex-none text-muted" />
            {d.oursIsGenerated}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{d.kind}</span>
            <select
              className="rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
              value={kind}
              onChange={(e) => setKind(e.target.value as AwardDocumentKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {d.kinds[k]}
                </option>
              ))}
            </select>
          </label>

          <input
            ref={picker}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => picker.current?.click()} disabled={busy}>
            <Icon name="upload" size={14} /> {d.attach}
          </Button>

          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.common.close}
          </Button>
        </div>

        {error && <p className="text-meta font-semibold text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
