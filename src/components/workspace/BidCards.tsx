"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
// Both were written and tested for the bid list this workspace retired, and have had no caller since
// (owner, 2026-08-25). The rules did not stop being true when their surface went away.
import { bidCounterDelta } from "@/lib/contract/bid-counter-delta";
import { distinctMachinesOffered, unitCountNotes } from "@/lib/contract/unit-count-notes";
import { computeQuoteTotals, computeRentalTotal, divisorNote, formatSar, headlineAmount, legDisplay } from "@/lib/pricing/rental";
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
  durationDays,
  startDate,
  onSelect,
}: {
  bids: WorkspaceBid[];
  selectedId: string | null;
  /** The request's duration and start date — what the rental is prorated across. */
  durationDays: number | null;
  startDate: string | null;
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
          durationDays={durationDays}
          startDate={startDate}
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
  durationDays,
  startDate,
  onSelect,
}: {
  bid: WorkspaceBid;
  selected: boolean;
  unread: number;
  submission: LinkBidSubmission | null;
  durationDays: number | null;
  startDate: string | null;
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
  /** Local, like «Provide it for me?»'s own acknowledgement: WhatsApp opening is all we can observe,
   *  so the button reports that the renter was handed the message, never that it was sent. */
  const [invited, setInvited] = useState(false);

  const card = bid.card;
  const offline = bid.source === "offline";
  const dial = termsDial(card, bid.source);

  /** Digits only — `wa.me` refuses a number carrying spaces, dashes or a leading `+`. */
  const invitePhone = (card.supplierPhone ?? "").replace(/\D/g, "") || null;

  /**
   * The counter's round, or null on a bid nobody has moved. `viewerRole` is the renter's: this whole
   * surface is his, and the rule uses it to decide whose figure is being struck through.
   */
  const delta = bidCounterDelta({
    originalPrice: card.openingPrice,
    currentPrice: card.price,
    lastCounterBy: card.lastCounterBy,
    viewerRole: "rentee",
    status: card.status,
  });

  // ── The price block, built the way the app builds it ───────────────────────────────────────────
  // Mirrors `v3_bid_card.dart` + `price_expanded_breakdown.dart`, checked against the source on
  // 2026-08-12. Every row here is PER UNIT; a multi-unit offer adds an all-units row at the foot.
  const units = card.unitsOffered > 0 ? card.unitsOffered : card.numberOfUnits > 0 ? card.numberOfUnits : 1;


  /**
   * What this bid owes the reader when its counts disagree — machines actually NAMED against units
   * OFFERED against units PRICED. Silence where they agree, which is most bids.
   *
   * The three are genuinely different questions, and only the last one costs money: `offered` is what
   * the bid claims (padded with repeats when a supplier commits to more units than he holds machines
   * for), `machinesNamed` is how many distinct machines are actually behind it, and `priced` is what
   * the money was built on. A bid offering five and naming three said nothing at all until now.
   */
  const countNotes = unitCountNotes({
    priced: card.agreedUnits ?? card.currentRentalUnits ?? units,
    offered: units,
    machinesNamed: distinctMachinesOffered(card.offeredUnitsDetail),
  });
  // The rental is prorated: (rate ÷ 26 or ÷ 6) × billable days, Fridays excluded. With no duration
  // it stays the bare rate — never a fabricated single day, which would read as near-zero on a
  // monthly bid.
  const rental = computeRentalTotal({
    rate: card.price,
    priceUnit: card.priceUnit,
    startDate,
    durationDays,
  });
  const totals = computeQuoteTotals({
    perUnitRental: rental.total,
    rentalUnits: units,
    mob: { amount: card.mobPrice, units: card.mobUnits, excluded: card.mobExcluded },
    demob: { amount: card.demobPrice, units: card.demobUnits, excluded: card.demobExcluded },
  });
  // The headline is the RATE on a weekly or monthly bid, so suppliers compare on what they quoted;
  // the prorated total moves into the breakdown. A daily bid headlines its total, as the app does.
  const headline = headlineAmount(card.priceUnit, card.price ?? 0, rental.total);
  const rentalTypeLabel =
    card.priceUnit === "PER_MONTH" ? t.workspace.rentalMonthly
    : card.priceUnit === "PER_WEEK" ? t.workspace.rentalWeekly
    : card.priceUnit === "PER_JOB" ? t.workspace.rentalJob
    : t.workspace.rentalDaily;
  const headlineLabel = units > 1 ? t.workspace.perUnitLabel.replace("{label}", rentalTypeLabel) : rentalTypeLabel;
  // The rental row explains the headline, so it is dropped when there is nothing left to explain:
  // an exact period on a single-unit bid means the headline already IS the total.
  const showRentalRow = !(rental.exact && units <= 1);
  const rentalRowLabel = rental.raw
    ? t.workspace.rentalRowNoDuration
    : durationDays
      ? t.workspace.rentalRowDays.replace("{n}", String(rental.billable))
      : t.workspace.rentalRowCustom;
  const basis = divisorNote(card.priceUnit, L);
  const accepted = card.status === "ACCEPTED" || card.wonViaSurvey === true;
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
          {/* «Supplier · Riyadh», as the app's own card reads (owner, 2026-08-25). The city was on the
              wire the whole time — the bid-list `supplierProfile` carries it, and `mapBid` was already
              reading it into the composed national address. The distance keeps its place after it. */}
          <div className="truncate text-[11.5px] font-semibold text-muted">
            {L("Supplier", "مؤجّر")}
            {card.supplierCity ? ` · ${card.supplierCity}` : ""}
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
        {/* The headline: the rental type, and the rate or the total depending on the unit. An
            accepted bid is the only status that touches this block — green, and a tick. */}
        <div className={`flex items-start gap-2 ${accepted ? "-mx-3 -mt-3 mb-2.5 rounded-t-[13px] border-b-2 border-ok bg-ok-soft px-3 pb-2 pt-3" : ""}`}>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold text-navy">{headlineLabel}</div>
            {basis && <div className="text-[11px] font-semibold text-muted">{basis}</div>}
          </div>
          <div className="flex flex-none items-center gap-1">
            <b className="text-[17px] font-black text-navy">{formatSar(headline)}</b>
            <span className="text-[10.5px] font-bold text-muted">{t.priceFooter.currency}</span>
            {accepted && <Icon name="check_circle" size={16} className="text-ok" />}
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
            {/* The rental, prorated across the billable days — what the headline's rate adds up to
                over this request. Dropped when the headline already is the total. */}
            {showRentalRow && <Row label={rentalRowLabel} value={totals.perUnit.rental} />}
            <LegRow label={t.workspace.deliveryToSite} amount={card.mobPrice} excluded={card.mobExcluded} />
            <LegRow label={t.workspace.returnFromSite} amount={card.demobPrice} excluded={card.demobExcluded} />
            <div className="my-2 border-t border-border" />
            <Row label={t.priceFooter.subtotal} value={totals.perUnit.subtotal} muted />
            <Row label={t.priceFooter.vat} value={totals.perUnit.vat} muted />
          </div>
        )}

        <div className="mt-2.5 rounded-[10px] border border-border px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-extrabold text-navy">{t.workspace.grandTotalInclVat}</span>
            <span className="flex-none">
              <b className="text-[16px] font-black text-navy">{formatSar(totals.perUnit.total)}</b>{" "}
              <span className="text-[10.5px] font-bold text-muted">{t.priceFooter.currency}</span>
            </span>
          </div>

          {/* Multi-unit: a second row in the SAME box, carrying the real all-units figure. It is not
              the per-unit total × units — each transport leg carries its own count. */}
          {units > 1 && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
              <span className="text-[12px] font-extrabold text-brand">
                {t.workspace.overallTotal} <span className="font-bold text-muted">· {units}</span>
              </span>
              <span className="flex-none">
                <b className="text-[15px] font-black text-brand">{formatSar(totals.overall.total)}</b>{" "}
                <span className="text-[10.5px] font-bold text-muted">{t.priceFooter.currency}</span>
              </span>
            </div>
          )}
        </div>

        {/* ── What the counts do not agree about (owner, 2026-08-25) ────────────────────────────────
            `unitCountNotes` is the app's rule, ported and tested and — until now — called by nothing.
            Most bids say nothing here, which is the point: it speaks only where the three counts
            genuinely diverge, and a bid that offers five units while naming three machines has been
            silent about it on every surface this workspace replaced.

            Placed UNDER the totals rather than beside the headline: it qualifies what the money was
            built on, and a reader who has not reached the total has no use for it yet. */}
        {!countNotes.isEmpty && (
          <div className="mt-2 flex flex-col gap-1 text-[11.5px] font-semibold leading-snug text-muted">
            {countNotes.hasPricedNote && (
              <span>
                {fmt(
                  countNotes.relation === "above" ? t.workspace.countPricedAbove : t.workspace.countPricedBelow,
                  { priced: String(countNotes.priced), offered: String(countNotes.offered) },
                )}
              </span>
            )}
            {countNotes.hasClaimedNote && (
              <span className="text-brand">
                {fmt(t.workspace.countClaimed, {
                  n: String(countNotes.claimedUnits),
                  named: String(countNotes.machinesNamed),
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* The way on. */}
      <div className="mt-auto flex gap-2 px-3 pb-3">
        {offline ? (
          <>
            {/* ── Invite him onto the app (owner, 2026-08-25) ────────────────────────────────────
                Off-platform only, by decision: a supplier who bid THROUGH the app already has it.

                The mechanism is «Provide it for me?»'s, not a new one (`MachineCard.tsx:327`) — fill a
                template, open WhatsApp at the number, and let the renter press send. It reaches the
                supplier from the renter's OWN account, which is what the owner asked for, and it
                needs no endpoint and no projection: `supplierPhone` is already on the bid.

                Where we hold no number the control still renders, disabled, saying why — a button
                that vanished would read as «this supplier cannot be invited», when the truth is only
                that this bid arrived without a way to reach him. */}
            {invitePhone ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const msg = fmt(t.workspace.inviteMessage, { supplier: card.supplierName });
                  window.open(`https://wa.me/${invitePhone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
                  setInvited(true);
                }}
                className="flex-1 rounded-[12px] bg-navy px-3 py-2.5 text-[13px] font-extrabold text-white transition hover:brightness-110"
              >
                {invited ? t.workspace.inviteSent : t.workspace.inviteToApp}
              </button>
            ) : (
              <button
                type="button"
                disabled
                title={t.workspace.inviteNoContact}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 rounded-[12px] bg-navy px-3 py-2.5 text-[13px] font-extrabold text-white disabled:opacity-40"
              >
                {t.workspace.inviteToApp}
              </button>
            )}
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
            {/* ── The button carries the ROUND, once there has been one (owner, 2026-08-25) ────────
                `bidCounterDelta` is the app's rule and was already written and tested; its only
                caller was the bid list this workspace retired, so it has been deciding nothing.
                It returns null on an unmoved bid — the backend defaults `currentPrice` to
                `priceAmount`, so an untouched offer arrives as two equal numbers — which is exactly
                «after the first round» without a second rule to keep in step.

                The old figure is struck through and the live one follows it, so the button says what
                pressing it continues rather than starting the conversation over. */}
            {delta ? (
              <span className="inline-flex items-baseline gap-1.5">
                {t.priceFooter.counterPrice}
                <span className="text-[11.5px] font-bold text-white/55 line-through">{formatSar(delta.from)}</span>
                <span aria-hidden="true" className="text-[11.5px] font-bold text-white/55">→</span>
                <span className="text-[12.5px] font-black">{formatSar(delta.to)}</span>
              </span>
            ) : (
              t.priceFooter.counterPrice
            )}
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

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  const t = useT();
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 text-[12.5px] ${muted ? "text-muted" : "text-navy"}`}>
      <span className="font-semibold">{label}</span>
      <span className="flex-none font-bold">
        {formatSar(value)} <span className="text-[10px] font-bold text-muted">{t.priceFooter.currency}</span>
      </span>
    </div>
  );
}

/**
 * A transport leg. It falls back to words rather than a number, in the app's own priority: excluded
 * first, then a price that was never quoted. A zero would claim the supplier delivers free, and a
 * blank would claim nothing at all — both say more than the quote does.
 */
function LegRow({ label, amount, excluded }: { label: string; amount: number | null; excluded?: boolean | null }) {
  const t = useT();
  const leg = legDisplay({ amount, excluded });
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[12.5px] text-navy">
      <span className="font-semibold">{label}</span>
      <span className={`flex-none font-bold ${leg.kind === "amount" ? "" : "text-muted"}`}>
        {leg.kind === "amount" ? (
          <>
            {formatSar(leg.amount)} <span className="text-[10px] font-bold text-muted">{t.priceFooter.currency}</span>
          </>
        ) : leg.kind === "excluded" ? (
          t.priceFooter.excluded
        ) : (
          t.workspace.notQuoted
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
