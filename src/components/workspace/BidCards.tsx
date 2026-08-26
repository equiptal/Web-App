"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { btn } from "@/lib/ds";
// Both were written and tested for the bid list this workspace retired, and have had no caller since
// (owner, 2026-08-25). The rules did not stop being true when their surface went away.
import { bidCounterDelta } from "@/lib/contract/bid-counter-delta";
import { distinctMachinesOffered, unitCountNotes } from "@/lib/contract/unit-count-notes";
import { computeQuoteTotals, computeRentalTotal, divisorNote, formatSar, headlineAmount, legDisplay } from "@/lib/pricing/rental";
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
          <p className="mt-2 text-body font-semibold text-muted">{t.workspace.noBidsYet}</p>
        </div>
      </div>
    );
  }

  return (
    // `items-stretch`, not `items-start`: the pane now has a definite height, so every card takes
    // all of it and they end on one line instead of stepping down with their content. The footer was
    // already `mt-auto`, waiting for exactly this — the way on sits at the bottom of every card.
    <div className="flex h-full snap-x items-stretch gap-5 overflow-x-auto p-3">
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
  // The headline is the quoted RATE — on a daily bid too (owner, 2026-08-26). It used to headline the
  // period total there, which put a total in the same column as the other units' rates and made the
  // rental row below a restatement of it. `headlineShowsRawRate` is the app's own rule and its own
  // name for it. The prorated figure lives in the breakdown, one row down, for every unit alike.
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
  /**
   * `computeCycleTotals` is deliberately NOT called here any more.
   *
   * It is the comparison table's engine, and the table needs it: three columns that separate what
   * recurs from what is paid once are the whole point of that view. A card is one bid read on its
   * own, and the per-period column has no one to be compared against here — it only competed with the
   * card's own total. `computeQuoteTotals` already gives this card the request's figure, and the two
   * agree to the riyal at one unit, so nothing is lost by asking the simpler question.
   */
  const accepted = card.status === "ACCEPTED" || card.wonViaSurvey === true;
  const submitted = card.submittedAt
    ? new Date(card.submittedAt).toLocaleString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  /**
   * ── The chat is the MAP's dock now, not the deal room (owner, 2026-08-26) ─────────────────────
   *
   * Chat is chat; negotiating is the three-step sheet. So the icon opens the conversation where the
   * conversation lives — the dock on the equipment map, with a tab per item of this supplier's bid —
   * instead of the deal-room page, which wrapped the same messages in a negotiation header.
   *
   * It also stops MINTING a room to read one. `startDealRoom` ran on every press, and a `DealRoom`
   * row freezes the supplier's offered count; the dock's own rule is that opening a tab creates
   * nothing and the first SEND creates the room (RM3-AC-47). Pressing chat is no longer an act.
   */
  const openRoom = () => {
    router.push(`/bids/${encodeURIComponent(card.id)}/equipment?chat=1`);
  };

  return (
    <article
      onClick={onSelect}
      className={`flex max-h-full w-[344px] max-w-full flex-none snap-start cursor-pointer flex-col overflow-hidden rounded-lg border bg-surface transition ${
        selected
          ? "border-brand"
          : "border-border hover:border-navy-mid/40"
      }`}
    >
      {/* Where it came from, and when. */}
      <header
        className={`flex flex-none items-center justify-between gap-2 border-b px-3.5 py-1.5 text-label font-semibold ${
          offline ? "border-border bg-surface2 text-navy-mid" : "border-info/20 bg-info-soft text-info"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <Icon name={offline ? "drive_file_move" : "verified_user"} size={14} />
          {offline ? t.workspace.sourceOfflineLong : t.workspace.sourceAppLong}
        </span>
        {submitted && <span className="font-semibold text-muted">{submitted}</span>}
      </header>

      <div className="flex flex-none items-center gap-3 px-3.5 py-2.5">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-navy text-body font-semibold text-white">
          {card.supplierName.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-subhead font-extrabold leading-[1.15] text-navy">{card.supplierName}</div>
          {/* «Supplier · Riyadh», as the app's own card reads (owner, 2026-08-25). The city was on the
              wire the whole time — the bid-list `supplierProfile` carries it, and `mapBid` was already
              reading it into the composed national address. The distance keeps its place after it. */}
          <div className="truncate text-label font-semibold text-muted">
            {L("Supplier", "مؤجّر")}
            {card.supplierCity ? ` · ${card.supplierCity}` : ""}
            {card.distanceKm != null ? ` · ${Math.round(card.distanceKm)} ${L("km", "كم")}` : ""}
          </div>
        </div>
        {offline ? (
          <span className="flex-none rounded-full border border-border px-2 py-1 text-label font-semibold text-muted">{t.workspace.notOnApp}</span>
        ) : (
          /* The conversation, as one round control: filled while there is something unread on it,
             quiet while there is not. */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void openRoom();
            }}
            aria-label={t.workspace.openChat}
            title={t.workspace.openChat}
            className={`relative grid h-[34px] w-[34px] flex-none place-items-center rounded-full border transition disabled:bg-disabled-bg disabled:text-disabled-fg ${
              unread > 0 ? "border-navy bg-navy text-white" : "border-border bg-surface2 text-muted hover:bg-surface3"
            }`}
          >
            <Icon name="chat_bubble_outline" size={16} />
            {unread > 0 && <span className="absolute -end-px -top-px h-[9px] w-[9px] rounded-full bg-brand ring-2 ring-surface" />}
          </button>
        )}
      </div>

      {/* Terms: the dial says how much of them this supplier answered — never how good the offer is. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setTermsOpen(true);
        }}
        className={btn("secondary", "md", { className: "flex flex-none text-start transition" })}
      >
        <TermsDialGlyph met={dial.met} against={dial.against} unanswered={dial.unanswered} />
        <span className="flex-1 text-body font-semibold text-navy">{L("Terms", "الشروط")}</span>
        <span className="text-label font-semibold text-info">{L("View", "عرض")} ›</span>
      </button>

      {/* The money. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto border-t border-border px-3.5 py-2.5">
        {/* The headline: the rental type, and the rate or the total depending on the unit. An
            accepted bid is the only status that touches this block — green, and a tick. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          className={`flex items-start gap-2.5 text-start ${
            accepted ? "-mx-3.5 -mt-3.5 rounded-t-sm border-b-2 border-ok bg-ok-soft px-3.5 pb-2 pt-3.5" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="text-body font-extrabold leading-none text-navy">{headlineLabel}</div>
            {basis && <div className="mt-1.5 text-label font-semibold leading-none text-muted">{basis}</div>}
          </div>
          <div className="flex flex-none items-baseline gap-1.5">
            <b className="text-subhead font-extrabold leading-none text-navy">{formatSar(headline)}</b>
            <span className="text-label font-semibold leading-none text-muted">{t.priceFooter.currency}</span>
            {accepted && <Icon name="check_circle" size={15} className="self-center text-ok" />}
            <span aria-hidden="true" className={`text-label leading-none ${open ? "text-info" : "rotate-180 text-muted"}`}>
              ⌃
            </span>
          </div>
        </button>

        {open && (
          <div className="flex flex-none flex-col gap-2 rounded-sm border border-info/15 bg-info-soft/40 px-3 py-2.5">
            {/* The rental, prorated across the billable days — what the headline's rate adds up to
                over this request. Dropped when the headline already is the total. */}
            {showRentalRow && <Row label={rentalRowLabel} value={totals.perUnit.rental} />}
            <LegRow label={t.workspace.deliveryToSite} amount={card.mobPrice} excluded={card.mobExcluded} />
            <LegRow label={t.workspace.returnFromSite} amount={card.demobPrice} excluded={card.demobExcluded} />
            <div className="flex flex-col gap-1.5 border-t border-border/70 pt-2">
              <Row label={t.priceFooter.subtotal} value={totals.perUnit.subtotal} muted />
              <Row label={t.priceFooter.vat} value={totals.perUnit.vat} muted />
            </div>
          </div>
        )}

        <div className="flex flex-none flex-col gap-2 rounded-sm border border-border px-3 py-2.5">
          {/* ── One grand total, as the app and prod both state it (owner, 2026-08-26) ─────────────
              There were two here: one billing period, then the whole request. The per-period one is
              gone, and the app is where that was already settled — it carried the same pair, removed
              it, and left the reasoning in `price_expanded_breakdown.dart:190-206`:

                · **Delivery and return are charged ONCE, not per period.** Folding them into a "per
                  month" subtotal makes 80,210 + 1,500 read as the cost of a month when the 1,500 is
                  paid one time across the whole rental. On a daily bid it was worse than untidy — a
                  5/day machine with a 20 delivery showed «Grand total · day 28.75», which multiplies
                  out to 402 against a real total of 92.
                · **Two shapes meant two rules**, so no one sentence described the card and the rental
                  row restated the headline on daily bids.

              On this web card it also printed a figure SMALLER than the subtotal directly above it —
              93,967 under 476,590 — with both rows called «Grand total». Nothing told the reader
              which one was the answer.

              What is left is the request's own total, which is what the app's single grand total and
              prod's «Grand total · incl. VAT» both are. The day count keeps its place in the rental
              row above rather than being restated here. PER UNIT, like every row above it; the
              all-units figure keeps its own row below. */}
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="text-meta font-extrabold text-navy">{t.workspace.grandTotalInclVat}</span>
            <span className="flex-none whitespace-nowrap">
              <b className="text-subhead font-extrabold text-navy">{formatSar(totals.perUnit.total)}</b>{" "}
              <span className="text-label font-semibold text-muted">{t.priceFooter.currency}</span>
            </span>
          </div>

          {/* Multi-unit: a second row in the SAME box, carrying the real all-units figure. It is not
              the per-unit total × units — each transport leg carries its own count. */}
          {units > 1 && (
            <div className="flex items-baseline justify-between gap-2 border-t border-border/70 pt-2.5">
              <span className="text-meta font-extrabold text-brand">
                {t.workspace.overallTotal} <span className="font-semibold text-muted">· {units}</span>
              </span>
              <span className="flex-none">
                <b className="text-subhead font-extrabold text-brand">{formatSar(totals.overall.total)}</b>{" "}
                <span className="text-label font-semibold text-muted">{t.priceFooter.currency}</span>
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
          <div className="mt-2 flex flex-col gap-1 text-label font-semibold leading-snug text-muted">
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
      <div className="mt-auto flex flex-none gap-2 px-3.5 pb-3.5 pt-0.5">
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
                className={btn("primary", "lg", { className: "flex-1 transition" })}
              >
                {invited ? t.workspace.inviteSent : t.workspace.inviteToApp}
              </button>
            ) : (
              <button
                type="button"
                disabled
                title={t.workspace.inviteNoContact}
                onClick={(e) => e.stopPropagation()}
                className={btn("primary", "lg", { className: "flex-1" })}
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
              className={btn("secondary", "lg", { className: "transition" })}
            >
              {t.workspace.editQuote}
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
            className={btn("primary", "lg", { className: "flex-1 transition" })}
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
                <span className="text-label font-semibold text-white/55 line-through">{formatSar(delta.from)}</span>
                <span aria-hidden="true" className="text-label font-semibold text-white/55">→</span>
                <span className="text-meta font-extrabold">{formatSar(delta.to)}</span>
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
          busy={false}
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
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-meta ${muted ? "font-semibold text-muted" : "font-semibold text-navy"}`}>{label}</span>
      <span className={`flex-none whitespace-nowrap text-meta ${muted ? "font-semibold text-muted" : "font-semibold text-navy"}`}>
        {formatSar(value)} <span className="text-label font-semibold text-muted">{t.priceFooter.currency}</span>
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
    <div className="flex items-baseline justify-between gap-2 text-navy">
      <span className="text-meta font-semibold">{label}</span>
      <span className={`flex-none whitespace-nowrap text-meta font-semibold ${leg.kind === "amount" ? "" : "text-muted"}`}>
        {leg.kind === "amount" ? (
          <>
            {formatSar(leg.amount)} <span className="text-label font-semibold text-muted">{t.priceFooter.currency}</span>
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
  if (total === 0) return <span className="h-[18px] w-[18px] flex-none rounded-full border-2 border-border" />;
  const pct = (n: number) => (n / total) * 360;
  const a = pct(met);
  const b = a + pct(against);
  return (
    <span
      className="h-[18px] w-[18px] flex-none rounded-full"
      style={{
        background: `conic-gradient(var(--ok) 0deg ${a}deg, var(--danger) ${a}deg ${b}deg, var(--border) ${b}deg 360deg)`,
      }}
    />
  );
}
