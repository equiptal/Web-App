"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { getRenterSupplier } from "@/lib/api/client";
import type { SupplierProfile } from "@/lib/contract/renter-suppliers";

/**
 * SUP-T33 — every bid this supplier sent, and one step from each to the real thing.
 *
 * **It is a route, not a record.** Nothing about a bid is decided from the suppliers list: comparing,
 * negotiating and awarding all happen in the request, which is why every row ends in a way out and
 * this dialog carries no controls of its own.
 *
 * The history lives in the profile. Keeping them apart means a renter asking "what did they quote on
 * the generator" is not scrolled past deal-room counts and company papers to reach it.
 */
export function SupplierBidsDialog({
  id,
  onClose,
  onProfile,
}: {
  id: string | null;
  onClose: () => void;
  onProfile: (id: string) => void;
}) {
  const t = useT();
  const c = t.suppliers;
  const router = useRouter();
  const [p, setP] = useState<SupplierProfile | null>(null);

  useEffect(() => {
    if (!id) return;
    setP(null);
    getRenterSupplier(id)
      .then(setP)
      .catch(() => undefined);
  }, [id]);

  if (!id) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      icon={<Icon name="gavel" size={18} />}
      title={p ? fmt(c.bidsFrom, { name: p.name }) : "…"}
      subtitle={c.bidsFromSub}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={() => onProfile(id)} className={cx(btn("ghost", "md"), "me-auto")}>
            <Icon name="person" size={15} />
            {c.supplierProfile}
          </button>
          <button type="button" onClick={onClose} className={btn("primary", "md")}>
            {c.close}
          </button>
        </div>
      }
    >
      {!p ? (
        <p className="py-6 text-center text-meta text-muted">{c.loading}</p>
      ) : p.bids.length === 0 ? (
        <div className="flex items-start gap-2 rounded-md bg-surface2 px-3 py-2.5 text-meta text-muted-dark">
          <Icon name="info" size={15} className="flex-none" />
          <span>{c.noBidsYet}</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          {p.bids.map((b) => (
            <div key={b.bidId} className="flex items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1">
                <b className="flex items-center gap-1.5 text-body font-extrabold text-navy">
                  {b.equipment}
                  {/* Which channel it arrived through — an account holder can use the shared form too. */}
                  <span
                    className={cx(
                      "inline-flex h-[19px] flex-none items-center gap-1 rounded-full px-2 text-label font-extrabold",
                      b.via === "app" ? "bg-navy text-surface" : "border border-ok/40 bg-ok-soft text-ok-deep",
                    )}
                  >
                    <Icon name={b.via === "app" ? "verified_user" : "link"} size={12} />
                    {b.via === "app" ? c.onMoedatech : c.viaLinkShort}
                  </span>
                </b>
                <span className="block text-meta text-muted">{[b.site, b.requestCode].filter(Boolean).join(" · ")}</span>
              </span>
              {b.price !== null && <span className="flex-none font-mono text-meta font-semibold text-navy">{b.price}</span>}
              <button
                type="button"
                onClick={() => router.push(`/requests/${encodeURIComponent(b.requestId)}`)}
                className={cx(btn("secondary", "sm"), "flex-none")}
              >
                {c.openInRequest}
                <Icon name="arrow_forward" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
