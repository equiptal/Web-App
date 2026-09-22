"use client";

import { useState } from "react";
import { Dialog, DialogButton } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { bucketBidTerms, termSides, CERT_LABEL, COUNTED_TERM_GROUP, type CertCode, type TermRow, type TermState } from "@/lib/contract/bids";

/**
 * ── THE TERMS PAGE, READ OFF THE APP ────────────────────────────────────────────────────────────
 * Owner: *"for terms panel ui from the terms in bid card, can u check how it is structured in the
 * app and align, like structure and language"*. Ported from
 * `features/marketplace/presentation/widgets/terms_modal.dart` (`TermsModalPage`, `_TermsByStatus`,
 * `_TermsLegendHeader`, `_TermsStatusSection`) and `core/widgets/term_attribution_block.dart`.
 *
 * 🔴 **THE TABS ARE GONE, and that is the structural change.** ~~Three buttons, one bucket on screen
 * at a time, opening on the first non-empty one.~~ The app stacks all three: a summary card, then one
 * colour-headed section per non-empty state, Conflict → Pending review → Matched. A tab hides two
 * thirds of the answer behind a press, and the question this page exists for — what is still open on
 * this offer — is read by looking DOWN the three groups, not by choosing one.
 *
 * 🔴 **EVERY ROW NAMES BOTH SIDES.** ~~The renter's value alone in red, with the supplier's added
 * only when he had proposed something else.~~ That rule (2026-09-06) was written for the COMPARISON's
 * one-line cells, where a second half restated the colour; this page has room, and the app's own row
 * carries two chips — «Renter» over her ask, «Supplier» over his — with the standing side filled and
 * a side that has answered nothing reading «Not selected yet» in italic. Under them, one muted line
 * saying who moved the value and when.
 *
 * ⚠️ **The FOOTER is the web's and stays.** The app's terms page is a route with its own back
 * control; this is a dialog opened from the bid card, and the button under it is the renter's way
 * from reading the terms to acting on them.
 *
 * ⚠️ **The buckets are NOT re-derived here.** `bucketBidTerms` is the same call the bid card's own
 * tally makes, so the counts on this page can never disagree with the card that opened it.
 */

type Bucket = "conflict" | "pending" | "matched";

/** The renter's own ask behind the two collapsible rows, straight off `BidCard`. */
export interface TermsAsk {
  certsRequested: CertCode[];
  certsHeld: CertCode[];
  operatorIncluded: boolean;
  /** The operator certificates the request asked for, comma-joined (`BidCard.operatorCertReq`). */
  operatorCertReq: string | null;
  fatFood: "supplier" | "me" | null;
  fatAccommodation: "supplier" | "me" | null;
}

/** The app's own tones for the three states (`AppColors.danger` / `.warning` / `.success`). */
const TONE: Record<Bucket, { c: string; soft: string }> = {
  conflict: { c: "var(--danger)", soft: "var(--danger-soft)" },
  pending: { c: "var(--warn)", soft: "var(--warn-soft)" },
  matched: { c: "var(--ok)", soft: "var(--ok-soft)" },
};

/**
 * The app's `termsItemLabelFor`, which is a SEPARATE vocabulary from the deal room's `termLabel` —
 * the same two-map split the app keeps. Keyed on `COUNTED_TERM_GROUP`, because a group can be filled
 * by either of two rows (`operator_included` or `operator`) and the app names the GROUP.
 *
 * ⚠️ A row outside the six falls back to its own label, which is what an off-platform bid needs:
 * `allTerms` counts every answered required term, and those carry keys this map has never heard of.
 */
const TERMS_ITEM_LABEL: Record<string, { en: string; ar: string }> = {
  payment: { en: "Payment Terms", ar: "شروط الدفع" },
  breakdown: { en: "Breakdown Response SLA", ar: "سرعة الاستجابة للأعطال" },
  overtime: { en: "Overtime", ar: "العمل الإضافي" },
  fuel: { en: "Fuel Responsibility", ar: "مسؤولية الوقود" },
  certs: { en: "Equipment Certifications", ar: "شهادات المعدات" },
  operator: { en: "Operator", ar: "المشغّل" },
};

const rowLabel = (r: TermRow, ar: boolean): string => {
  const app = TERMS_ITEM_LABEL[COUNTED_TERM_GROUP[r.key] ?? ""];
  if (app) return ar ? app.ar : app.en;
  return ar ? r.labelAr : r.labelEn;
};

/**
 * ⚠️ **Latin, in both locales.** `ar` formats a date with Arabic-Indic digits, and this product
 * prints Latin figures everywhere (2026-09-04). The app draws `DateFormat.MMMd`; this is its shape.
 */
const shortDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
};

/** Which side's value currently stands (app parity: `TermResolvedSide`). */
type Side = "rentee" | "supplier" | "both" | "none";

function resolvedSide(state: TermState, asked: string | null, offered: string | null): Side {
  // Locked in the room → the parties converged, and only that reads as a green pair. An equal but
  // un-locked pair is the supplier's offer STANDING, not an agreement — the app says so explicitly.
  if (state === "agreed") return "both";
  if (state === "matched") return offered ? "supplier" : "rentee";
  if (state === "conflict" || state === "negotiating") return "none";
  if (asked && !offered) return "rentee";
  if (offered && !asked) return "supplier";
  return "none";
}

export function BidTermsModal({
  supplier,
  terms,
  ar,
  L,
  busy,
  onNegotiate,
  negotiateLabel,
  onClose,
  hidePending,
  negotiable,
  allTerms,
  ask,
}: {
  supplier: string;
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] };
  ar: boolean;
  L: (en: string, arr: string) => string;
  busy: boolean;
  onNegotiate: () => void;
  negotiateLabel?: string;
  onClose: () => void;
  /** Off-platform (shared-link) bids have no deal room → no "Pending review" state; hide that group. */
  hidePending?: boolean;
  /** The comparison's specific negotiable terms (safety cert, operator cert, FAT, fuel resp, …) — the
   *  app-accurate rows. When present they replace the vague equipment "certs"/"operator" lumped rows. */
  negotiable?: TermRow[];
  /** Off-platform: count/show EVERY answered required term (not just the app's 6 negotiable ones), so the
   *  groups match the card tally + the full submission view. */
  allTerms?: boolean;
  /** The renter's own ask behind the two collapsible rows (app parity: `_CertParentTile`,
   *  `_OperatorFlatTile`). Optional — a caller that has no bid card in hand passes nothing and both
   *  rows draw flat, which is exactly the app's own legacy fallback. */
  ask?: TermsAsk;
}) {
  const { byBucket } = bucketBidTerms(terms, negotiable, { all: allTerms });

  const groups: { key: Bucket; label: string }[] = [
    { key: "conflict", label: L("Conflict", "تعارض") },
    ...(hidePending ? [] : [{ key: "pending" as Bucket, label: L("Pending review", "قيد المراجعة") }]),
    { key: "matched", label: L("Matched", "مطابق") },
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={L("Terms", "الشروط")}
      subtitle={supplier}
      footer={
        <DialogButton tone="primary" full disabled={busy} onClick={onNegotiate}>
          {negotiateLabel ?? L("Negotiate terms", "التفاوض على الشروط")}
        </DialogButton>
      }
    >
      <SummaryHeader groups={groups} counts={byBucket} L={L} />

      <div className="mt-3 flex flex-col gap-3">
        {groups
          .filter((g) => byBucket[g.key].length > 0)
          .map((g) => (
            <section key={g.key} className="overflow-hidden rounded-md border border-border">
              {/* The band carries the state ONCE, for every row under it — which is why the rows
                  themselves no longer repeat a verdict word beside each value. */}
              <header className="flex items-center gap-2 px-3.5 py-2.5" style={{ background: TONE[g.key].soft }}>
                <span aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: TONE[g.key].c }} />
                <span className="text-body font-extrabold" style={{ color: TONE[g.key].c }}>
                  {g.label}
                </span>
                <span className="text-meta font-extrabold tabular-nums" style={{ color: TONE[g.key].c }}>
                  {byBucket[g.key].length}
                </span>
              </header>
              {byBucket[g.key].map((r, i) => (
                <TermTile key={`${r.key}-${i}`} row={r} ar={ar} L={L} ask={ask} />
              ))}
            </section>
          ))}
      </div>
    </Dialog>
  );
}

/**
 * The app's `_TermsLegendHeader`: a segmented proportion bar over three stat pills. All three are
 * drawn whatever the counts, so the renter reads the whole picture rather than only what is wrong —
 * a zero pill greys out rather than disappearing, which keeps the row the same shape on every bid.
 */
function SummaryHeader({
  groups,
  counts,
  L,
}: {
  groups: { key: Bucket; label: string }[];
  counts: Record<Bucket, TermRow[]>;
  L: (en: string, arr: string) => string;
}) {
  const total = groups.reduce((n, g) => n + counts[g.key].length, 0);
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex h-2 gap-[3px] overflow-hidden rounded-full">
        {total === 0 ? (
          <span className="flex-1 rounded-full bg-surface2" />
        ) : (
          groups
            .filter((g) => counts[g.key].length > 0)
            .map((g) => (
              <span
                key={g.key}
                className="rounded-full"
                style={{ flex: counts[g.key].length, background: TONE[g.key].c }}
              />
            ))
        )}
      </div>
      <div className="mt-3.5 flex gap-2">
        {groups.map((g) => {
          const n = counts[g.key].length;
          const tone = n > 0 ? TONE[g.key].c : "var(--muted-light)";
          return (
            <div
              key={g.key}
              className="flex flex-1 flex-col items-center rounded-md px-2.5 py-2.5"
              style={{ background: n > 0 ? TONE[g.key].soft : "var(--surface2)" }}
            >
              <span className="text-title font-extrabold leading-none tabular-nums" style={{ color: tone }}>
                {n}
              </span>
              <span className="mt-1.5 flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: tone }} />
                <span className={`truncate text-label font-semibold ${n > 0 ? "text-navy" : "text-muted"}`}>{g.label}</span>
              </span>
            </div>
          );
        })}
      </div>
      <span className="sr-only">{L("Terms by status", "الشروط حسب الحالة")}</span>
    </div>
  );
}

/** One row: the label, the two sides, and what the deal room did to it. */
function TermTile({
  row,
  ar,
  L,
  ask,
}: {
  row: TermRow;
  ar: boolean;
  L: (en: string, arr: string) => string;
  ask?: TermsAsk;
}) {
  const [open, setOpen] = useState(false);
  const group = COUNTED_TERM_GROUP[row.key] ?? "";
  const children = ask ? childRows(group, ask, L) : [];
  const canOpen = children.length > 0;

  return (
    <div className="border-t border-border">
      <div className="px-3.5 py-2.5">
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-start gap-2 text-start ${canOpen ? "" : "cursor-default"}`}
        >
          {canOpen && (
            <Icon name={open ? "keyboard_arrow_up" : "keyboard_arrow_down"} size={18} className="mt-0.5 flex-none text-muted" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-subhead font-semibold text-navy">{rowLabel(row, ar)}</span>
            {canOpen && <span className="mt-0.5 block text-label font-semibold text-muted">{subtitle(group, ask!, L)}</span>}
          </span>
        </button>
        <Attribution row={row} ar={ar} L={L} />
      </div>
      {open &&
        children.map((c) => (
          <div key={c.label} className="flex items-center gap-2 border-t border-border bg-surface2 py-2 pe-3.5 ps-9">
            {c.held != null && (
              <Icon
                name={c.held ? "check_circle" : "radio_button_unchecked"}
                size={c.held ? 15 : 10}
                className={c.held ? "flex-none text-ok" : "flex-none text-muted-light"}
              />
            )}
            <span className="min-w-0 flex-1 truncate text-meta font-semibold text-muted">{c.label}</span>
            {c.value && <span className="flex-none text-meta font-semibold text-navy">{c.value}</span>}
            {c.held === true && (
              <span className="flex-none rounded-full bg-ok-soft px-2 py-0.5 text-label font-extrabold text-ok">
                {L("Held", "متوفرة")}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

/**
 * The renter's ask and the supplier's answer, side by side (app: `TermAttributionBlock`).
 *
 * ⚠️ `termSides` is what tells the two apart, and it returns `offered: null` for a REFUSAL — a dash,
 * an empty half, or the words this codebase uses for "not confirmed". That null is what makes the
 * supplier's chip read «Not selected yet» rather than echoing a refusal back as an offer.
 */
function Attribution({ row, ar, L }: { row: TermRow; ar: boolean; L: (en: string, arr: string) => string }) {
  const { asked, offered } = termSides(row, ar);

  // Neither side has said anything: one muted line, and no pair of empty chips.
  if (!asked && !offered) {
    return <p className="mt-1.5 text-label font-semibold text-muted-light">{L("Not determined", "غير محدَّد")}</p>;
  }

  const side = resolvedSide(row.state, asked, offered);
  const both = side === "both";
  const when = shortDate(row.updatedAt);
  /* ⚠️ Every counter that reaches a row is the SUPPLIER's — `mapBid` drops a renter's own counter
     before the overlay writes it into the value column — so the role in this caption is not a
     variable. It is named anyway rather than folded into the sentence, because the app's string
     takes the role as a placeholder and the day a renter's counter is surfaced it fills here. */
  const caption =
    row.state === "agreed"
      ? join(L("Agreed in deal room", "تم الاتفاق في غرفة الصفقة"), when)
      : row.counterSide
        ? join(
            row.counterSide === "rentee"
              ? L("Updated by Renter", "تم التحديث بواسطة المستأجر")
              : L("Updated by Supplier", "تم التحديث بواسطة المؤجر"),
            when,
          )
        : asked && !offered
          ? L("Supplier hasn't responded", "لم يرد المورد بعد")
          : null;

  return (
    <div className="mt-2">
      <div className="flex items-start gap-2">
        <Chip role={L("Renter", "مستأجر")} value={asked} placeholder={L("Not selected yet", "لم يُحدَّد بعد")} highlight={!!asked && (both || side === "rentee")} matched={both && !!asked} />
        <Chip role={L("Supplier", "مؤجر")} value={offered} placeholder={L("Not selected yet", "لم يُحدَّد بعد")} highlight={!!offered && (both || side === "supplier")} matched={both && !!offered} />
      </div>
      {caption && (
        <p className="mt-1.5 flex items-center gap-1 text-label font-semibold text-muted">
          <Icon name={row.state === "agreed" ? "check_circle" : "history"} size={13} className="flex-none text-muted/70" />
          {caption}
        </p>
      )}
    </div>
  );
}

const join = (what: string, when: string | null): string => (when ? `${what} · ${when}` : what);

/** One side's value. Navy when it stands, green with a tick when the room locked the pair. */
function Chip({
  role,
  value,
  placeholder,
  highlight,
  matched,
}: {
  role: string;
  value: string | null;
  placeholder: string;
  highlight: boolean;
  matched: boolean;
}) {
  const empty = !value;
  const bg = empty ? "bg-surface2/60" : matched ? "bg-ok-soft" : highlight ? "bg-info-soft/60" : "bg-surface2";
  const ink = empty ? "text-muted-light" : matched ? "text-ok-deep" : highlight ? "text-navy" : "text-muted";
  return (
    <span className={`min-w-0 flex-1 rounded-sm px-2.5 py-1.5 ${bg}`}>
      <span className="block text-label font-semibold text-muted">{role}</span>
      <span className="mt-0.5 flex items-center gap-1">
        {matched && <Icon name="check" size={12} className="flex-none text-ok" />}
        <span className={`min-w-0 truncate text-meta ${empty ? "font-semibold italic" : "font-semibold"} ${ink}`}>
          {value ?? placeholder}
        </span>
      </span>
    </span>
  );
}

/** The header's second line on a collapsible row: what the renter asked for, counted. */
function subtitle(group: string, ask: TermsAsk, L: (en: string, arr: string) => string): string {
  if (group === "certs") {
    return ask.certsRequested.length
      ? L(`${ask.certsRequested.length} requested`, `${ask.certsRequested.length} مطلوبة`)
      : L("No certificates requested", "لا توجد شهادات مطلوبة");
  }
  return ask.operatorIncluded ? L("Yes", "نعم") : L("No", "لا");
}

/**
 * The children behind the two collapsible rows.
 *
 * 🔴 **The cert rows are the renter's REQUEST, with a «Held» badge where the platform tracks the
 * supplier's status** — informational, exactly as the app has it: a requested cert never gates a bid.
 *
 * ⚠️ The app's child row OPENS the supplier's uploaded certificate when one exists
 * (`bid.equipment.certDocUrls`). That map is not on `BidCard`, so these rows carry the badge and no
 * press. See the report.
 */
function childRows(
  group: string,
  ask: TermsAsk,
  L: (en: string, arr: string) => string,
): { label: string; value?: string; held?: boolean }[] {
  if (group === "certs") {
    const held = new Set(ask.certsHeld);
    return ask.certsRequested.map((c) => ({ label: CERT_LABEL[c]?.en ?? c, held: held.has(c) }));
  }
  if (group === "operator" && ask.operatorIncluded) {
    const fat = (v: "supplier" | "me" | null) =>
      v == null ? L("Not specified", "غير محدد") : v === "supplier" ? L("On Supplier", "على المورد") : L("On Renter", "على المستأجر");
    return [
      ...(ask.operatorCertReq ? [{ label: L("Operator Certifications", "شهادات المشغل"), value: ask.operatorCertReq }] : []),
      ...(ask.fatFood != null ? [{ label: L("Food", "الطعام"), value: fat(ask.fatFood) }] : []),
      ...(ask.fatAccommodation != null
        ? [{ label: L("Accommodation / Transport", "الإقامة / النقل"), value: fat(ask.fatAccommodation) }]
        : []),
    ];
  }
  return [];
}
