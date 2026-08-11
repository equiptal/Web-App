"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { computeQuoteTotals, divisorNote, formatSar } from "@/lib/pricing/rental";
import { startDealRoom } from "@/lib/api/client";
import { BidTermsModal } from "@/components/requests/BidTermsModal";
import { SharedBidSubmissionModal } from "@/components/requests/SharedBidSubmissionModal";
import type { LinkBidSubmission } from "@/lib/contract/link-bids";
import { termsDial, type WorkspaceBid } from "@/lib/contract/workspace";

/**
 * The Cards tab — one card per bid on the selected item, in a row that scrolls sideways.
 *
 * Every figure on a card is the LIVE one. `BidCard.price` already resolves to the deal room's last
 * proposed rate where a negotiation has moved it, falling back to the opening offer where it has
 * not, so the card needs no second number and no arrow between two: it shows what this bid costs
 * today. The money itself is `computeQuoteTotals`, the same assembly the deal room and the quotation
 * use — the three surfaces cannot drift because they are one calculation.
 */
export function BidCards({
  bids,
  selectedId,
  unreadByBid,
  submissionsByBid,
  onSelect,
}: {
  bids: WorkspaceBid[];
  selectedId: string | null;
  /** Unread chat messages per bid, from received-bids. */
  unreadByBid: Record<string, number>;
  /** The raw submission behind an off-platform card, for the viewer. */
  submissionsByBid: Record<string, LinkBidSubmission>;
  onSelect: (bidId: string) => void;
}) {
  const t = useT();

  if (bids.length === 0) {
    return (
      <div className="grid min-h-[220px] place-items-center px-4 py-12 text-center">
        <div>
          <Icon name="inbox" size={30} className="text-muted" />
          <p className="mt-2 text-[13px] font-semibold text-muted">{t.workspace.noBidsYet}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex snap-x gap-3 overflow-x-auto p-3 sm:p-4">
      {bids.map((b) => (
        <BidCardTile
          key={b.card.id}
          bid={b}
          selected={b.card.id === selectedId}
          unread={unreadByBid[b.card.id] ?? 0}
          submission={submissionsByBid[b.card.id] ?? null}
          onSelect={() => onSelect(b.card.id)}
        />
      ))}
    </div>
  );
}

function BidCardTile({
  bid,
  selected,
  unread,
  submission,
  onSelect,
}: {
  bid: WorkspaceBid;
  selected: boolean;
  unread: number;
  submission: LinkBidSubmission | null;
  onSelect: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [termsOpen, setTermsOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const card = bid.card;
  const offline = bid.source === "offline";
  const dial = termsDial(card, bid.source);

  // Per-unit figures, which is what the breakdown rows state. A multi-unit offer says so on its own
  // line rather than quietly showing a bigger number under the same labels.
  const units = card.unitsOffered > 0 ? card.unitsOffered : card.numberOfUnits > 0 ? card.numberOfUnits : 1;
  const totals = computeQuoteTotals({
    perUnitRental: card.price ?? 0,
    rentalUnits: units,
    mob: { amount: card.mobPrice, units: card.mobUnits, excluded: card.mobExcluded },
    demob: { amount: card.demobPrice, units: card.demobUnits, excluded: card.demobExcluded },
  });
  const periodWord =
    card.priceUnit === "PER_MONTH" ? t.priceFooter.month
    : card.priceUnit === "PER_WEEK" ? t.priceFooter.week
    : card.priceUnit === "PER_JOB" ? t.priceFooter.job
    : t.priceFooter.day;
  const rentalLabel = t.workspace.rentalPer.replace("{period}", periodWord);
  const basis = divisorNote(card.priceUnit, L);
  const submitted = card.submittedAt
    ? new Date(card.submittedAt).toLocaleString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  /** The chat: an existing room is opened, a first message creates one. */
  const openRoom = async () => {
    if (busy) return;
    if (card.dealRoomId) {
      router.push(`/deal-room/${encodeURIComponent(card.dealRoomId)}`);
      return;
    }
    setBusy(true);
    try {
      const room = await startDealRoom(card.id);
      router.push(`/deal-room/${encodeURIComponent(room.id)}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <article
      onClick={onSelect}
      className={`flex w-[330px] flex-none snap-start cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-surface transition ${
        selected ? "border-brand shadow-[0_0_0_1px_var(--brand)]" : "border-border hover:border-navy-mid/40"
      }`}
    >
      {/* Where it came from, and when. */}
      <header className="flex items-center justify-between gap-2 border-b border-border bg-surface2 px-3 py-2 text-[11.5px] font-bold">
        <span className="inline-flex items-center gap-1.5 text-navy-mid">
          <Icon name={offline ? "drive_file_move" : "verified_user"} size={14} className={offline ? "text-muted" : "text-ok"} />
          {offline ? t.workspace.sourceOfflineLong : t.workspace.sourceAppLong}
        </span>
        {submitted && <span className="font-semibold text-muted">{submitted}</span>}
      </header>

      <div className="flex items-center gap-2.5 px-3 py-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-navy text-[13px] font-extrabold text-white">
          {card.supplierName.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-extrabold text-navy">{card.supplierName}</div>
          <div className="truncate text-[11.5px] font-semibold text-muted">
            {L("Supplier", "مؤجّر")}
            {card.distanceKm != null ? ` · ${Math.round(card.distanceKm)} ${L("km", "كم")}` : ""}
          </div>
        </div>
        {offline ? (
          <span className="flex-none rounded-full border border-border px-2 py-1 text-[10.5px] font-bold text-muted">{t.workspace.notOnApp}</span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void openRoom();
            }}
            disabled={busy}
            aria-label={t.workspace.openChat}
            title={t.workspace.openChat}
            className="relative grid h-9 w-9 flex-none place-items-center rounded-full bg-surface2 text-navy-mid transition hover:bg-surface3 disabled:opacity-50"
          >
            <Icon name="chat_bubble_outline" size={17} />
            {unread > 0 && <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-surface" />}
          </button>
        )}
      </div>

      {/* Terms: the dial says how much of them this supplier answered — never how good the offer is. */}
      <div className="flex items-center gap-2 border-y border-border px-3 py-2">
        <TermsDialGlyph met={dial.met} against={dial.against} unanswered={dial.unanswered} />
        <span className="flex-1 text-[13px] font-extrabold text-navy">{L("Terms", "الشروط")}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setTermsOpen(true);
          }}
          className="text-[12.5px] font-bold text-info"
        >
          {L("View", "عرض")} ›
        </button>
      </div>

      {/* The money. */}
      <div className="px-3 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold text-navy">{rentalLabel}</div>
            {basis && <div className="text-[11px] font-semibold text-muted">{basis}</div>}
          </div>
          <div className="flex flex-none items-center gap-1">
            <b className="text-[17px] font-black text-navy">{formatSar(totals.perUnit.rental)}</b>
            <span className="text-[10.5px] font-bold text-muted">{t.priceFooter.currency}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              aria-expanded={open}
              aria-label={open ? t.priceFooter.hideDetails : t.priceFooter.showDetails}
              className="grid h-6 w-6 place-items-center rounded-full text-muted transition hover:bg-surface2"
            >
              <Icon name={open ? "expand_less" : "expand_more"} size={18} />
            </button>
          </div>
        </div>

        {open && (
          <div className="mt-2.5 rounded-[10px] bg-surface2 px-3 py-2.5">
            <Row label={t.priceFooter.mobilisation} value={totals.perUnit.mob} excluded={card.mobExcluded} />
            <Row label={t.priceFooter.demobilisation} value={totals.perUnit.demob} excluded={card.demobExcluded} />
            <div className="my-2 border-t border-border" />
            <Row label={t.priceFooter.subtotal} value={totals.perUnit.subtotal} muted />
            <Row label={t.priceFooter.vat} value={totals.perUnit.vat} muted />
          </div>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2.5">
          <span className="text-[12.5px] font-extrabold text-navy">
            {t.workspace.grandTotal} · {periodWord}
          </span>
          <span className="flex-none">
            <b className="text-[16px] font-black text-navy">{formatSar(totals.perUnit.total)}</b>{" "}
            <span className="text-[10.5px] font-bold text-muted">{t.priceFooter.currency}</span>
          </span>
        </div>

        {/* Only when there is more than one machine, and stated rather than folded into the rows
            above — the breakdown is per unit, and a bigger number under the same labels would lie. */}
        {units > 1 && (
          <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11.5px] font-bold text-muted">
            <span>{t.workspace.allUnits.replace("{n}", String(units))}</span>
            <span>
              {formatSar(totals.overall.total)} {t.priceFooter.currency}
            </span>
          </div>
        )}
      </div>

      {/* The way on. */}
      <div className="mt-auto flex gap-2 px-3 pb-3">
        {offline ? (
          <>
            <button
              type="button"
              disabled
              title={t.workspace.notBuiltYet}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded-[12px] bg-navy px-3 py-2.5 text-[13px] font-extrabold text-white disabled:opacity-40"
            >
              {t.workspace.inviteToApp}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSubOpen(true);
              }}
              className="rounded-[12px] border border-border px-3 py-2.5 text-[13px] font-bold text-navy"
            >
              {t.workspace.viewQuote}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (card.dealRoomId) router.push(`/deal-room/${encodeURIComponent(card.dealRoomId)}?act=counter`);
              else void openRoom();
            }}
            className="flex-1 rounded-[12px] bg-navy px-3 py-2.5 text-[13px] font-extrabold text-white transition hover:brightness-110"
          >
            {t.priceFooter.counterPrice}
          </button>
        )}
      </div>

      {termsOpen && (
        <BidTermsModal
          supplier={card.supplierName}
          terms={card.terms}
          negotiable={card.negotiableTerms}
          // Off-platform terms are answered Yes/No on a form: every answer is final, so there is no
          // "pending review" state to show and no room to take them to.
          allTerms={offline}
          hidePending={offline}
          busy={busy}
          negotiateLabel={offline ? t.workspace.viewQuote : t.priceFooter.counterPrice}
          onNegotiate={() => {
            setTermsOpen(false);
            if (offline) setSubOpen(true);
            else if (card.dealRoomId) router.push(`/deal-room/${encodeURIComponent(card.dealRoomId)}?act=counter`);
            else void openRoom();
          }}
          ar={ar}
          L={L}
          onClose={() => setTermsOpen(false)}
        />
      )}
      {subOpen && (
        <SharedBidSubmissionModal bid={card} submission={submission} ar={ar} L={L} onClose={() => setSubOpen(false)} />
      )}
    </article>
  );
}

function Row({ label, value, muted, excluded }: { label: string; value: number; muted?: boolean; excluded?: boolean | null }) {
  const t = useT();
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 text-[12.5px] ${muted ? "text-muted" : "text-navy"}`}>
      <span className="font-semibold">{label}</span>
      <span className="flex-none font-bold">
        {excluded ? (
          t.priceFooter.excluded
        ) : (
          <>
            {formatSar(value)} <span className="text-[10px] font-bold text-muted">{t.priceFooter.currency}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** Three arcs — met, against, unanswered — drawn as one ring. Empty terms render as a plain outline
 *  rather than a full circle of any colour, which would claim an answer that was never given. */
function TermsDialGlyph({ met, against, unanswered }: { met: number; against: number; unanswered: number }) {
  const total = met + against + unanswered;
  if (total === 0) return <span className="h-4 w-4 flex-none rounded-full border-2 border-border" />;
  const pct = (n: number) => (n / total) * 360;
  const a = pct(met);
  const b = a + pct(against);
  return (
    <span
      className="h-4 w-4 flex-none rounded-full"
      style={{
        background: `conic-gradient(var(--ok) 0deg ${a}deg, var(--danger) ${a}deg ${b}deg, var(--border) ${b}deg 360deg)`,
      }}
    />
  );
}
