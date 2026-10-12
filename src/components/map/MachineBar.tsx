"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import type { SupplierMachine } from "@/lib/contract/machine-bar";

/**
 * **The machine bar: this supplier's bids on the other machines of the same request** (owner,
 * 2026-10-11, multi-item decision 6, M1).
 *
 * One chip per machine, in the order the renter asked for them, with his price on it. A press moves
 * the WHOLE map to his bid on that machine: the panel, the pins, the price footer and the chat, since
 * one bid is one room. ~~The chat's own machine tabs, which moved the conversation and left the map on
 * the other machine~~ (RM3-AC-49, «switching tabs does not move the map»), reversed by the owner: the
 * chat and the map showing two different machines made no sense to him. The dock hides its tabs
 * wherever this bar is drawn.
 *
 * Only the machines he BID on (owner, 2026-10-12: «if supplier has no bids then dont show the item»).
 * ~~A dashed, inert chip reading «No bid from him»~~. «Other bids» in the back header is the other
 * direction: other suppliers on THIS machine.
 */
export function MachineBar({ machines, currentBidId }: { machines: SupplierMachine[]; currentBidId: string }) {
  const router = useRouter();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  const per = (u: string | null) =>
    u === "PER_MONTH" ? L("month", "شهر") : u === "PER_WEEK" ? L("week", "أسبوع") : u === "PER_JOB" ? L("job", "مهمة") : L("day", "يوم");

  return (
    <div {...pin("machine-bar")} className="flex flex-none items-center gap-2 overflow-x-auto border-b border-border bg-surface px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {machines.filter((m) => m.bidId != null).map((m) => {
        const here = m.bidId === currentBidId;
        const name = ar ? m.nameAr : m.name;
        return (
          <button
            key={m.itemId}
            type="button"
            disabled={here}
            aria-current={here ? "true" : undefined}
            title={name}
            /* `replace`, as «Other bids» does: moving across one request's offers is a lateral move on
               one surface, so Back still leaves the map rather than walking machine to machine. */
            onClick={() => { if (m.bidId && !here) router.replace(`/bids/${encodeURIComponent(m.bidId)}/equipment`); }}
            className={cx(
              "flex flex-none items-center gap-2 rounded-md py-1 pe-2.5 ps-1 text-start transition-colors",
              here ? "border-[2.5px] border-navy bg-surface2" : "border-[1.5px] border-border bg-surface hover:border-navy-mid",
            )}
          >
            <span className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-photo-ground">
              {m.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={m.imageUrl} alt="" className={cx("h-full w-full", m.imageIsPhoto ? "object-cover" : "scale-[1.34] object-contain")} />
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="max-w-[200px] truncate text-meta font-semibold text-navy">
                {name}
                {m.qty > 1 && <span className="font-extrabold text-muted"> ×{m.qty}</span>}
              </span>
              <span className="text-label font-semibold text-muted">
                {m.price != null
                  ? `${Math.round(m.price).toLocaleString("en-US")} ${L("SAR", "ر.س")} / ${per(m.priceUnit)}`
                  : L("Price on request", "السعر عند الطلب")}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
