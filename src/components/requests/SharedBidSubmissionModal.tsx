"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogButton, DialogSpacer } from "@/components/Dialog";
import type { BidCard } from "@/lib/contract/bids";
import type { BidFormData, BidFormItem, LinkBidSubmission, LinkBidItem } from "@/lib/contract/link-bids";
import { CERT_TERM_KEYS, certCodesFromValue, certConfKey, prettyCert } from "@/lib/contract/link-bids";
import { fetchBidFormData } from "@/lib/api/client";
import { hasVatInclusiveNote, stripVatInclusiveNote, vatLines } from "@/lib/contract/vat-inclusive";
import { computeRentalTotal, durationDaysBetween } from "@/lib/pricing/rental";
import { qualityFromSubmission, qualityFromSubmissionItem } from "@/lib/contract/bid-quality";
import { latinDigits } from "@/lib/contract/labels";
import { Icon } from "@/components/ui";
import { QualityRing } from "@/components/bid/QualityRing";
import { CARD, cx } from "@/lib/ds";

/**
 * web-app/006 — read-only viewer of an off-platform bid submitted through the renter's shared link.
 *
 * It renders the SAME SHAPE as the bid form the supplier filled, with his answers in it and nothing
 * editable. We fetch the request's `BidFormData` for full context (project terms, delivery/return,
 * renter notes) and overlay the submission's answers; if that is unavailable (request closed) we
 * render from the submission alone.
 *
 * ── The form it mirrors is the NEW one (owner, 2026-09-04) ──────────────────────────────────────
 *
 * *"I want the view bid submission on the bid card to render the same UI as this form, but with the
 * filled values of the supplier answers."*
 *
 * So the layout is the supplier form's own: three numbered steps down the page — **Terms**, **The
 * price**, **The supplier's details** — and a rail beside them carrying **The request** and **The
 * quotation**. Each step is drawn in the state the form itself uses once it is answered, because that
 * IS the read-only rendering the form already has:
 *
 *   · Terms — the form's review list: a progress bar, `n / m answered`, one row per term with the
 *     answer as a green ✓ Yes or a red ✗ No. The form puts a «Change» link on each row; there is
 *     nothing to change here, and the renter gets what he asked for on the row instead.
 *   · The price — the form's own rows with the controls frozen: units as `2 / 2` rather than a
 *     stepper, the rate as a figure with `SAR / month` beside it, the transport legs under it.
 *   · The details — the same field grid, filled, and the documents panel with its completeness ring.
 *
 * ~~The old viewer drew the OLD form: `bidpage`/`sec`/`treqgrid` markup out of `BID_FORM_CSS` and
 * `requests-proto.css`.~~ Both are gone from this file. The markup is the app's own design system now
 * (`--navy`, `--brand`, `CARD`), which is also what the new form is built in, so the two cannot drift
 * through a stylesheet neither of them owns.
 *
 * A submission covering SEVERAL items keeps the three-step spine: the terms step holds one group per
 * item and the price step one block per item, so the page still reads top-to-bottom as one bid rather
 * than as three forms stacked.
 */

// Mirrors the bid form's TERM_KEYS so the renter reads back exactly the terms the supplier confirmed.
// `fuelType` is NOT here (2026-09-04, following the app's `f48793ec`). It is the renter's
// `fuelTypePreference` — what fuel they asked for — and it is a different fact from `fuel`,
// which is fuel RESPONSIBILITY and stays. The renter is not really choosing it either: the
// system prefills it (owner, 2026-09-03, when the same chip left the item pills), so asking a
// supplier to confirm a value nobody chose added a row and settled nothing. Still stored, still
// matched on; simply not shown to the supplier.
const TERM_KEYS = ["operator", "nationality", "nightShift", "fatFood", "fatTransport", "fuel", "year", "operatorCert", "equipmentCert"] as const;
type TermKey = (typeof TERM_KEYS)[number];
const TERM_LABEL: Record<TermKey, [string, string]> = {
  operator: ["Operator", "المشغّل"],
  nationality: ["Operator nationality", "جنسية المشغّل"],
  nightShift: ["Night shift required", "العمل الليلي مطلوب"],
  fatFood: ["Food (F.A.T)", "الطعام"],
  fatTransport: ["Accommodation & transport", "السكن والمواصلات"],
  fuel: ["Fuel responsibility", "مسؤولية الوقود"],
  year: ["Equipment year", "سنة الصنع"],
  operatorCert: ["Operator certificate", "شهادة المشغّل"],
  equipmentCert: ["Equipment certificate", "شهادة المعدة"],
};
const UNIT_LABEL: Record<string, [string, string]> = {
  PER_DAY: ["day", "يوم"], PER_WEEK: ["week", "أسبوع"], PER_MONTH: ["month", "شهر"], PER_JOB: ["job", "مهمة"],
};
// Attachment type code → readable label (EN/AR) for the read-only viewer chips/thumbnails.
const ATT_LABEL: Record<string, [string, string]> = {
  front_photo: ["Front photo", "صورة أمامية"], serial_photo: ["Serial / plate", "الرقم التسلسلي"], hours_photo: ["Operating hours", "ساعات التشغيل"],
  istimara: ["Istimara", "الاستمارة"], customs_card: ["Customs card", "البطاقة الجمركية"], sales_contract: ["Sales contract", "عقد البيع"], saso_registration: ["SASO registration", "تسجيل ساسو"], combined: ["Several documents (one file)", "عدة مستندات (ملف واحد)"],
  tuv: ["TÜV", "فحص TÜV"], spsp: ["SPSP", "SPSP"], saso: ["SASO", "ساسو"], other: ["Other", "أخرى"],
  operator_tuv: ["Operator TÜV", "فحص TÜV للمشغّل"], operator_spsp: ["Operator SPSP", "SPSP للمشغّل"], operator_saso: ["Operator SASO", "ساسو للمشغّل"], operator_other: ["Operator (other)", "المشغّل (أخرى)"],
  cr: ["Commercial registration", "السجل التجاري"], vat_cert: ["VAT certificate", "شهادة الضريبة"], national_address: ["National address", "العنوان الوطني"], local_content: ["Local content", "المحتوى المحلي"], saso_heavy_equip: ["SASO heavy equipment", "ساسو للمعدات الثقيلة"],
};
// Classify an item's documents back into the same groups the form uploads them under.
const OWNERSHIP_TYPES = new Set(["istimara", "customs_card", "sales_contract", "saso_registration", "combined"]);
// Party-responsibility values read clearer as "On renter" / "On supplier" (matches the supplier form).
const PARTY_CHOICE: Record<string, [string, string]> = { RENTER: ["On renter", "على المستأجر"], RENTEE: ["On renter", "على المستأجر"], SUPPLIER: ["On supplier", "على المؤجّر"], ME: ["On supplier", "على المؤجّر"] };
const renterChoice = (v: string | null | undefined, ar: boolean): string => { const p = PARTY_CHOICE[String(v ?? "").trim().toUpperCase()]; return p ? (ar ? p[1] : p[0]) : String(v ?? ""); };

export function SharedBidSubmissionModal({
  bid,
  submission,
  focusItemId,
  ar,
  L,
  onClose,
  onDownloadQuotation,
}: {
  bid: BidCard;
  submission: LinkBidSubmission | null;
  /** When set, the viewer shows ONLY this request item (opened from a single item's bid card) instead
   *  of every item in the group submission. */
  focusItemId?: string;
  ar: boolean;
  L: (en: string, arr: string) => string;
  onClose: () => void;
  /** Export this submission as the app-parity quotation doc (same template as an on-platform bid). */
  onDownloadQuotation?: () => void;
  /** web-app/006 — deal-room-style negotiate relay. Accepted from callers but currently unused: the
   *  contact number is shown plainly for now, so there's no masked row to trigger it from. */
  onNegotiate?: () => void;
}) {
  const nf = (n: number) => new Intl.NumberFormat(ar ? "ar-EG" : "en-US").format(Math.round(n));
  /**
   * The three price rows as they are PRINTED.
   *
   * `vatLines` derives VAT as `total − subtotal` so the arithmetic reconciles with the figure the
   * supplier sent (RMAP AC-216). Rounding each of the three for display independently breaks that
   * again — 148,384.6 and 22,257.7 print as 148,385 and 22,258, which sum to one riyal more than the
   * 170,642 printed beside them. On the screen a renter uses to choose between bids, three rows that
   * do not add up read as a bug in the price. So the tax is taken between the ROUNDED ends.
   */
  const shownLines = (l: { subtotal: number; total: number }) => {
    const subtotal = Math.round(l.subtotal);
    const total = Math.round(l.total);
    return { subtotal, vat: total - subtotal, total };
  };
  const sar = L("SAR", "ر.س");
  const attLabel = (t: string) => { const e = ATT_LABEL[t]; return e ? (ar ? e[1] : e[0]) : t.replace(/_/g, " "); };
  // Read-only chip row for uploaded documents (open in a new tab to view / download). The form draws
  // an upload slot here; a submitted bid has files, so the slot becomes the file.
  const DocChips = ({ docs }: { docs?: { key: string; type: string; filename?: string | null }[] }) => (
    !docs?.length ? null : (
      <div className="flex flex-wrap gap-1.5">
        {docs.map((d, i) => (
          <a
            key={i}
            href={d.key}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border bg-surface2 px-2.5 py-1.5 text-meta font-semibold text-navy transition hover:border-brand hover:text-brand-deep"
          >
            <Icon name="description" size={15} className="flex-none text-muted" />
            <span className="min-w-0 truncate">{attLabel(d.type)}{d.filename ? ` · ${d.filename}` : ""}</span>
            <Icon name="download" size={15} className="flex-none text-muted" />
          </a>
        ))}
      </div>
    )
  );
  // A company field the supplier gave as text OR a document — render whichever they submitted, in place.
  const coDoc = (type: string) => submission?.companyDocuments?.find((d) => d.type === type);
  /** AC-218 — a row the supplier left empty says so, rather than showing a dash that reads like a gap. */
  const notEntered = L("not entered", "غير مُدخل");
  const CoField = ({ label, text, docType }: { label: string; text?: string | null; docType: string }) => {
    if (text && text.trim()) return <RoField label={label} value={text} />;
    const doc = coDoc(docType);
    if (!doc) return <RoField label={label} value={null} empty={notEntered} />;
    return (
      <div className="min-w-0">
        <FieldLabel>{label}</FieldLabel>
        <DocChips docs={[doc]} />
      </div>
    );
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Full request context (project terms, size, delivery/return, renter notes) — best-effort.
  const [form, setForm] = useState<BidFormData | null>(null);
  useEffect(() => {
    if (!submission?.requestId) return;
    let alive = true;
    fetchBidFormData(submission.requestId).then((d) => alive && setForm(d)).catch(() => {});
    return () => { alive = false; };
  }, [submission?.requestId]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  // Match a form item to the supplier's submitted answers (group submissions cover several items;
  // fall back to the sole submitted item when the per-item link is missing — mirrors My Bids).
  const ansFor = (requestItemId: string): LinkBidItem | undefined => {
    if (!submission) return undefined;
    return submission.items.find((i) => i.requestItemId === requestItemId) ?? (submission.items.length === 1 ? submission.items[0] : undefined);
  };

  // Items to render: prefer the live request's items (full context); else synthesize from the submission.
  const items: BidFormItem[] = useMemo(() => {
    if (form && form.items.length) return form.items;
    if (!submission) return [];
    return submission.items.map((s) => {
      const rt = (s.requiredTerms ?? {}) as Record<string, string | null>;
      return {
        requestItemId: s.requestItemId,
        label: s.label ?? null,
        labelAr: null,
        size: null,
        sizeAr: null,
        numberOfUnits: s.numberOfUnits ?? 1,
        priceUnit: s.priceUnit ?? null,
        deliveryBy: null,
        returnBy: null,
        notes: null,
        requiredTerms: { operator: rt.operator ?? null, nationality: rt.nationality ?? null, fatFood: rt.fatFood ?? null, fatTransport: rt.fatTransport ?? null, fuel: rt.fuel ?? null, fuelType: rt.fuelType ?? null, year: rt.year ?? null, operatorCert: rt.operatorCert ?? null, equipmentCert: rt.equipmentCert ?? null },
      };
    });
  }, [form, submission]);

  const contractAns = submission?.items[0]?.confirmations ?? {};
  const contractTerms = useMemo(() => {
    if (form && form.contractTerms.length) return form.contractTerms;
    const rt = (submission?.items[0]?.requiredTerms ?? {}) as Record<string, string | null>;
    const labels: Record<string, [string, string]> = { payment: ["Payment type", "نوع الدفع"], overtime: ["Overtime rate", "أجر العمل الإضافي"], breakdownSla: ["Breakdown response", "زمن الاستجابة للأعطال"] };
    // "overtime" dropped: retired as a term, and a legacy request carries the truthy string '0',
    // which would print as a rate nobody was ever asked for.
    return (["payment", "breakdownSla"] as const)
      .filter((k) => rt[k])
      // The locally-built fallback is already in the reader's language, so it needs no `*Ar` twin.
      .map((k) => ({ key: k, label: L(labels[k][0], labels[k][1]), labelAr: null, value: rt[k] as string, valueAr: null }));
  }, [form, submission, L]);

  // When opened from a single item's card, show only that item (fall back to all if it doesn't match).
  const focusedItems = focusItemId ? items.filter((it) => it.requestItemId === focusItemId) : items;
  const shownItems = focusedItems.length ? focusedItems : items;
  const singleItem = !!focusItemId && shownItems.length === 1 && items.length > 1;

  // The request's rental window, straight off the bid-form payload this modal already fetches — the
  // same pair the supplier's own form prorates against. Nothing here comes from the backend's stored
  // total (see below), so an off-platform bid reads identically on the form, this viewer and the card.
  const durationDays = durationDaysBetween(form?.projectTerms?.startDate, form?.projectTerms?.endDate);
  const startDate = form?.projectTerms?.startDate ?? null;
  /** Per-unit rental for one submitted line — prorated exactly as the supplier saw it when quoting. */
  const itemRental = (a?: LinkBidItem) =>
    computeRentalTotal({ rate: a?.rentalRate, priceUnit: a?.priceUnit, startDate, durationDays });
  const itemSubtotal = (a?: LinkBidItem) => {
    if (!a) return 0;
    const q = a.numberOfUnits || 1;
    // Rental prorates over the period; the two transport legs stay flat per unit — a trip, not a period.
    return (itemRental(a).total + (a.deliveryPrice ?? 0) + (a.returnPrice ?? 0)) * q;
  };
  /** True once ANY shown line was actually prorated — see the AC-216 note on `shownStoredGross`. */
  const proratedAny = (rows: LinkBidItem[]) => rows.some((a) => !itemRental(a).raw);
  const subtotal = (submission?.items ?? []).reduce((s, a) => s + itemSubtotal(a), 0);
  // Focused on one item → total for THAT item only; otherwise the whole-submission grand total.
  const shownIds = new Set(shownItems.map((it) => it.requestItemId));
  const shownItemAnswers = (submission?.items ?? []).filter((a) => shownIds.has(a.requestItemId));
  const shownSubtotal = shownItemAnswers.reduce((s, a) => s + itemSubtotal(a), 0);
  // RMAP AC-216 — prefer the STORED gross figure over a recomputation, so a supplier who quoted
  // VAT-inclusive sees their exact number back rather than a re-rounded one. `×1.15` is the fallback
  // for rows stored before `total` existed.
  //
  // BUT the stored total is computed by the backend RATE-BASED — it never prorates. Once the rental has
  // a period applied, that figure is one period's money for a multi-period job (wrong by ~4× on a
  // two-month rental), so it is dropped and the total is recomputed. AC-216's exactness is only worth
  // preserving while the number it protects is right; a rounding riyal is not worth a factor of four.
  const storedGross = (rows: LinkBidItem[]) =>
    proratedAny(rows) ? null : rows.reduce<number | null>((s, a) => (a.total == null ? s : (s ?? 0) + a.total), null);
  const shownStoredGross = storedGross(shownItemAnswers);
  const allItemAnswers = submission?.items ?? [];
  const grandIncl = singleItem
    ? vatLines(shownSubtotal, shownStoredGross).total
    : vatLines(subtotal, proratedAny(allItemAnswers) ? null : (submission?.grandTotal ?? shownStoredGross)).total;
  // Per-ITEM quality when opened from a single item's card (focusItemId) — this item's terms/docs +
  // the shared company details; otherwise the whole-submission score.
  const focusedSub = focusItemId ? submission?.items.find((a) => a.requestItemId === focusItemId) : null;
  const quality = submission ? (focusedSub ? qualityFromSubmissionItem(submission, focusedSub) : qualityFromSubmission(submission)) : null;
  // Supplier's quote expiry ("Valid until") + the renter's bid deadline ("Bids close").
  const validUntil = submission?.validUntil ?? null;
  const vDaysLeft = validUntil ? Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86400000) : null;
  const vExpired = vDaysLeft != null && vDaysLeft < 0;
  const bidsClose = form?.deadline ?? null;

  const projectTerms = form?.projectTerms ?? null;
  const renterNotes = form?.notes ?? null;
  const dir = ar ? "rtl" : "ltr";

  // VAT-inclusive pricing has no backend flag — the form carries it as a "[VAT-INCLUSIVE]" line in the
  // supplier's notes. Detect it (language-agnostic token), show a dedicated note, and strip the token
  // line from the notes we display so it reads cleanly.
  const vatInclusive = hasVatInclusiveNote(submission?.notes);
  const supplierNotes = stripVatInclusiveNote(submission?.notes);

  /**
   * One term, as the form's review list draws it: what the renter asked for, and the supplier's
   * Yes/No. A certificate term the renter asked for by NAME becomes one row per certificate, because
   * a supplier can hold TÜV and not SPSP and the two answers are stored separately.
   */
  const termRowsFor = (it: BidFormItem): { key: string; label: string; asked: string; ok: boolean | undefined }[] => {
    const a = ansFor(it.requestItemId);
    const conf = (a?.confirmations ?? {}) as Record<string, boolean | undefined>;
    const rows: { key: string; label: string; asked: string; ok: boolean | undefined }[] = [];
    for (const k of TERM_KEYS) {
      const asked = it.requiredTerms[k];
      if (asked == null) continue;
      const label = L(TERM_LABEL[k][0], TERM_LABEL[k][1]);
      const codes = CERT_TERM_KEYS.has(k) ? certCodesFromValue(asked) : [];
      if (codes.length > 1) {
        for (const code of codes) {
          const rk = certConfKey(k, code);
          rows.push({ key: `${it.requestItemId}:${rk}`, label, asked: prettyCert(code), ok: conf[rk] ?? conf[k] });
        }
      } else {
        const val = k === "operatorCert" || k === "equipmentCert" ? prettyCert(asked) : renterChoice(asked, ar);
        rows.push({ key: `${it.requestItemId}:${k}`, label, asked: val, ok: conf[k] });
      }
    }
    return rows;
  };

  /* The contract terms first, exactly where the form puts them: its opening card is the one marked
     «Applies to every item». */
  const contractRows = contractTerms.map((c) => ({
    key: `contract:${c.key}`,
    // The backend's own Arabic where it sends it (`c304828a`), with its digits normalised to Latin:
    // `valueAr` is seeded «٢٤ ساعة», and digits are Latin in both languages now.
    label: (ar && c.labelAr) || c.label,
    asked: ar && c.valueAr ? latinDigits(c.valueAr) : c.value,
    ok: contractAns[c.key as keyof typeof contractAns] as boolean | undefined,
  }));
  const itemTermGroups = shownItems.map((it) => ({ item: it, rows: termRowsFor(it) }));
  const allTermRows = [...contractRows, ...itemTermGroups.flatMap((g) => g.rows)];
  const answeredCount = allTermRows.filter((r) => r.ok !== undefined).length;

  /* The quotation rail, line by line. The rows are the same three an item block shows, summed over
     whatever is on screen: one item when the card that opened this was one item's, else the lot.

     VAT is `total − subtotal` and NEVER `subtotal × 0.15` (RMAP AC-216): the submission stores an
     already-rounded gross, so recomputing the tax gives a breakdown that does not add up to the
     figure the supplier actually sent. */
  const unitsOf = (a: LinkBidItem) => a.numberOfUnits || 1;
  const railRental = shownItemAnswers.reduce((s, a) => s + itemRental(a).total * unitsOf(a), 0);
  const railDelivery = shownItemAnswers.reduce((s, a) => s + (a.deliveryPrice ?? 0) * unitsOf(a), 0);
  const railReturn = shownItemAnswers.reduce((s, a) => s + (a.returnPrice ?? 0) * unitsOf(a), 0);
  const railTotals = shownLines({ subtotal: shownSubtotal, total: grandIncl });
  const railBillable = shownItemAnswers.length ? itemRental(shownItemAnswers[0]) : null;

  const unitWord = (u?: string | null) =>
    u ? (ar ? UNIT_LABEL[u]?.[1] : UNIT_LABEL[u]?.[0]) ?? u : L("unit", "وحدة");

  return (
    /* `xl` because the body is a two-column document, and `padded={false}` because it brings its own
       margins — the same two reasons as before the shape changed. */
    <Dialog
      open
      onClose={onClose}
      size="xl"
      padded={false}
      title={submission?.companyName ?? bid.supplierName}
      subtitle={L("Off-platform · submitted via your shared link · read-only", "خارج المنصة · مُقدَّم عبر رابطك المشترك · للقراءة فقط")}
      icon={<span className="grid h-[34px] w-[34px] place-items-center rounded-sm bg-brand-soft text-brand"><Icon name="link" size={19} /></span>}
      footer={
        <>
          <DialogButton onClick={onClose}>{L("Close", "إغلاق")}</DialogButton>
          <DialogSpacer />
          {submission && (
            onDownloadQuotation
              ? <DialogButton tone="primary" className="qprint-hide" onClick={onDownloadQuotation}>{L("Download quotation", "تنزيل عرض السعر")}</DialogButton>
              : <DialogButton className="qprint-hide" onClick={() => window.print()}>{L("Download / Print", "تنزيل / طباعة")}</DialogButton>
          )}
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col bg-surface2" dir={dir}>
        {/* Printing this dialog prints THIS dialog, not the page behind it — the sort of thing nobody
            notices until a supplier is handed six blank sheets. */}
        <style>{`@media print{body *{visibility:hidden!important}[data-dialog-panel],[data-dialog-panel] *{visibility:visible!important}[data-dialog-scrim]{position:static!important;background:var(--surface)!important;padding:0!important;overflow:visible!important}[data-dialog-panel]{position:absolute!important;inset-inline-start:0;top:0;width:100%!important;height:auto!important;max-height:none!important;border:0!important;}.qprint{max-height:none!important;overflow:visible!important;background:var(--surface)!important}.qprint-hide{display:none!important}}`}</style>
        <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />

        <div className="qprint min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          {!submission ? (
            <p className="py-10 text-center text-body text-muted">{L("Submission details aren't available.", "تفاصيل العرض غير متاحة.")}</p>
          ) : (
            <div className="mx-auto grid max-w-[1100px] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              {/* ── The three steps, in the form's own order ────────────────────────────────────── */}
              <div className="flex min-w-0 flex-col gap-3">
                {/* The form's masthead names who the request is FROM, because a supplier is reading
                    it. Here a renter is reading a bid, so it names who the bid is from. */}
                <div className={cx(CARD, "flex flex-wrap items-center gap-3 p-3.5")}>
                  <span className="grid size-11 flex-none place-items-center rounded-md bg-navy text-white">
                    <Icon name="apartment" size={22} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-meta text-muted">{L("Bid from", "عرض من")}</span>
                    <span className="block truncate text-subhead font-extrabold text-navy">{submission.companyName || bid.supplierName}</span>
                  </span>
                  <span className="ms-auto flex flex-none flex-wrap items-center justify-end gap-1.5">
                    {submission.quotationRef && <CodeChip>{submission.quotationRef}</CodeChip>}
                    {submission.groupRef && <CodeChip>{submission.groupRef}</CodeChip>}
                    {!submission.groupRef && submission.rfqRef && <CodeChip>{submission.rfqRef}</CodeChip>}
                  </span>
                </div>

                {/* ── 1 · Terms ─────────────────────────────────────────────────────────────────
                    The form's answered state: a green bar, `n / m answered`, and one row per term.
                    Where the form offers «Change», this offers the fact the renter needs instead —
                    what he asked for, under the term's name. */}
                <StepCard
                  n={1}
                  title={L("Terms", "الشروط")}
                  done={allTermRows.length > 0 && answeredCount === allTermRows.length}
                  meta={allTermRows.length ? `${answeredCount} / ${allTermRows.length}` : undefined}
                >
                  {!allTermRows.length ? (
                    <p className="text-meta text-muted">{L("This request set no terms to answer.", "لم يحدّد هذا الطلب شروطًا للإجابة عليها.")}</p>
                  ) : (
                    <>
                      <div className="mb-3 flex items-center gap-3">
                        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface2">
                          <span
                            className="block h-full rounded-full bg-ok"
                            style={{ width: `${Math.round((answeredCount / allTermRows.length) * 100)}%` }}
                          />
                        </span>
                        <span className="flex-none text-meta font-semibold text-muted">{L("answered", "تمّت الإجابة")}</span>
                      </div>
                      {contractRows.length > 0 && (
                        <TermGroup title={L("Applies to every item", "تنطبق على كل البنود")}>
                          {contractRows.map((r) => <TermRow key={r.key} row={r} L={L} />)}
                        </TermGroup>
                      )}
                      {itemTermGroups.map((g) =>
                        g.rows.length ? (
                          <TermGroup
                            key={g.item.requestItemId}
                            title={shownItems.length > 1 ? itemName(g.item, ar, L) : undefined}
                          >
                            {g.rows.map((r) => <TermRow key={r.key} row={r} L={L} />)}
                          </TermGroup>
                        ) : null,
                      )}
                    </>
                  )}
                </StepCard>

                {/* ── 2 · The price ─────────────────────────────────────────────────────────────
                    The form's price step with its controls frozen: the unit stepper reads as a
                    count, the rate as a figure, and the two transport legs stay under it because
                    they are what a renter is comparing when two bids quote the same machine. */}
                <StepCard n={2} title={L("The price", "السعر")} done meta={nf(railTotals.total)}>
                  <div className="flex flex-col gap-4">
                    {shownItems.map((it) => {
                      const a = ansFor(it.requestItemId);
                      const q = (a?.numberOfUnits ?? it.numberOfUnits) || 1;
                      const offered = a?.offeredUnits ?? q;
                      const rate = a?.rentalRate ?? 0;
                      const del = a?.deliveryPrice ?? 0;
                      const ret = a?.returnPrice ?? 0;
                      const rental = itemRental(a);
                      const sub = itemSubtotal(a);
                      const lines = shownLines(vatLines(sub, rental.raw ? a?.total : null));
                      const unit = unitWord(a?.priceUnit ?? it.priceUnit);
                      return (
                        <div key={it.requestItemId} className="min-w-0">
                          {shownItems.length > 1 && (
                            <p className="mb-2 flex items-center gap-1.5 text-body font-extrabold text-navy">
                              <Icon name="construction" size={17} className="text-muted" />
                              {itemName(it, ar, L)}
                            </p>
                          )}
                          <div className="flex items-center justify-between gap-3 rounded-md bg-surface2 px-3 py-2.5">
                            <span className="text-body text-navy">{L("Units offered", "الوحدات المعروضة")}</span>
                            <span className="flex-none text-body font-extrabold tabular text-navy">
                              {nf(offered)} <span className="font-semibold text-muted">/ {nf(it.numberOfUnits || q)}</span>
                            </span>
                          </div>
                          <div className="mt-2 flex items-baseline justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                            <span className="min-w-0">
                              <span className="block text-meta text-muted">
                                {L("Rate", "السعر")} <b className="font-extrabold text-navy">{L("per", "لكل")} {unit}</b>
                              </span>
                              {!rental.raw && (
                                <span className="block text-meta text-muted">
                                  {L(`${rental.billable} billable days`, `${rental.billable} يوم محتسب`)}
                                </span>
                              )}
                            </span>
                            <span className="flex-none text-subhead font-extrabold tabular text-navy">
                              {rate ? nf(rate) : "—"} <span className="text-meta font-semibold text-muted">{sar} / {unit}</span>
                            </span>
                          </div>
                          {del || ret ? (
                            <div className="mt-2 flex flex-col gap-1.5">
                              {del ? <MoneyRow label={L("Delivery to site", "النقل إلى الموقع")} sub={L("price × qty", "السعر × العدد")} value={`${nf(del * q)} ${sar}`} /> : null}
                              {ret ? <MoneyRow label={L("Return from site", "النقل من الموقع")} sub={L("price × qty", "السعر × العدد")} value={`${nf(ret * q)} ${sar}`} /> : null}
                            </div>
                          ) : null}
                          <div className="mt-2.5 border-t border-border pt-2.5">
                            <MoneyRow label={L("Subtotal", "المجموع")} value={sub ? `${nf(lines.subtotal)} ${sar}` : "—"} />
                            <MoneyRow label={L("VAT 15%", "ضريبة 15٪")} value={sub ? `${nf(lines.vat)} ${sar}` : "—"} />
                            <MoneyRow label={L("Item total", "إجمالي البند")} value={sub ? `${nf(lines.total)} ${sar}` : "—"} strong />
                          </div>
                        </div>
                      );
                    })}
                    {vatInclusive && (
                      <p className="flex items-start gap-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2.5 text-meta font-semibold text-navy-mid">
                        <Icon name="receipt_long" size={17} className="flex-none text-brand" />
                        {L(
                          "The supplier quoted VAT-inclusive prices. Amounts here are shown net of 15% VAT, and the grand total is exactly what they entered.",
                          "قدّم المؤجّر أسعارًا شاملة لضريبة القيمة المضافة. تُعرض المبالغ هنا صافية من ضريبة 15٪، والإجمالي الكلي هو ما أدخله تمامًا.",
                        )}
                      </p>
                    )}
                  </div>
                </StepCard>

                {/* ── 3 · The supplier's details ────────────────────────────────────────────────
                    The form's own field grid, filled, and its documents panel underneath with the
                    completeness ring the supplier was bidding against. */}
                <StepCard n={3} title={L("The supplier's details", "بيانات المؤجّر")} done>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <RoField label={L("Company name", "اسم الشركة")} value={submission.companyName} empty={notEntered} />
                    <RoField label={L("Phone", "رقم الجوال")} value={submission.contactInfo} empty={notEntered} ltr />
                    <RoField label={L("E-mail", "البريد الإلكتروني")} value={submission.contactEmail} empty={notEntered} ltr />
                    <RoField label={L("City", "المدينة")} value={submission.city} empty={notEntered} />
                    <CoField label={L("Commercial registration", "السجل التجاري")} text={submission.crNumber} docType="cr" />
                    <CoField label={L("VAT number", "الرقم الضريبي")} text={submission.vatNumber} docType="vat_cert" />
                    <CoField label={L("National address", "العنوان الوطني")} text={submission.nationalAddress} docType="national_address" />
                    <RoField
                      label={L("Quote valid until", "العرض صالح حتى")}
                      value={validUntil ? (vExpired ? L("Expired", "منتهٍ") : fmtDate(validUntil)) : null}
                      empty={notEntered}
                      tone={vExpired ? "danger" : undefined}
                    />
                  </div>
                  {supplierNotes && (
                    <div className="mt-3">
                      <RoField label={L("Notes for the whole quotation", "ملاحظات لكامل عرض السعر")} value={supplierNotes} multiline />
                    </div>
                  )}

                  {/* Photos and documents — the form's own panel, with the ring it draws while the
                      supplier fills it. Read back, that percentage is how complete the bid arrived. */}
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="flex items-start gap-3">
                      {/* The ring's own `.qring` layout class lives in `BID_FORM_CSS`, which this
                          viewer no longer injects — so the wrapper brings the two lines of layout
                          that class provided (centred column, never stretched). */}
                      {quality && (
                        <span className="inline-flex flex-none flex-col items-center gap-1">
                          <QualityRing quality={quality} L={L} size={64} />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-body font-extrabold text-navy">{L("Photos and documents", "الصور والمستندات")}</span>
                        <span className="block text-meta text-muted">
                          {L("What the supplier attached to this bid", "ما أرفقه المؤجّر مع هذا العرض")}
                        </span>
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-3">
                      {shownItems.map((it) => {
                        const a = ansFor(it.requestItemId);
                        const docs = a?.documents ?? [];
                        const ownership = docs.filter((d) => OWNERSHIP_TYPES.has(d.type));
                        const operatorCert = docs.filter((d) => d.type.startsWith("operator_"));
                        const equipCert = docs.filter((d) => !OWNERSHIP_TYPES.has(d.type) && !d.type.startsWith("operator_"));
                        if (!(a?.photos?.length || docs.length)) return null;
                        return (
                          <div key={it.requestItemId} className="min-w-0">
                            {shownItems.length > 1 && (
                              <p className="mb-1.5 text-meta font-extrabold text-navy">{itemName(it, ar, L)}</p>
                            )}
                            {a?.photos?.length ? (
                              <DocGroup title={L("Equipment photos", "صور المعدة")}>
                                <div className="flex flex-wrap gap-2">
                                  {a.photos.map((p, i) => (
                                    <a
                                      key={i}
                                      href={p.key}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={p.filename ?? undefined}
                                      className="block w-[104px] overflow-hidden rounded-sm border border-border bg-surface2 transition hover:border-brand"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={p.key} alt={attLabel(p.type)} className="block h-[70px] w-full object-cover" />
                                      <span className="block truncate px-1.5 py-1 text-label font-semibold text-muted-dark">{attLabel(p.type)}</span>
                                    </a>
                                  ))}
                                </div>
                              </DocGroup>
                            ) : null}
                            {ownership.length ? <DocGroup title={L("Proof of ownership", "إثبات الملكية")}><DocChips docs={ownership} /></DocGroup> : null}
                            {equipCert.length ? <DocGroup title={L("Equipment certificate", "شهادة المعدة")}><DocChips docs={equipCert} /></DocGroup> : null}
                            {operatorCert.length ? <DocGroup title={L("Operator certificate", "شهادة المشغّل")}><DocChips docs={operatorCert} /></DocGroup> : null}
                          </div>
                        );
                      })}
                      {(() => {
                        const extras = (submission.companyDocuments ?? []).filter((d) => !["cr", "vat_cert", "national_address"].includes(d.type));
                        return extras.length ? (
                          <DocGroup title={L("Other company documents", "مستندات أخرى للشركة")}><DocChips docs={extras} /></DocGroup>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </StepCard>

                <p className="pb-1 text-center text-label font-semibold text-muted-light">
                  {L("Powered by", "مُشغّل بواسطة")} <b className="font-extrabold text-navy">Moedatech</b>
                </p>
              </div>

              {/* ── The rail: the request, then the quotation ───────────────────────────────────── */}
              <aside className="flex min-w-0 flex-col gap-4">
                <div className={cx(CARD, "overflow-hidden")}>
                  <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                    <Icon name="sell" size={17} className="text-muted" />
                    <h3 className="text-body font-extrabold text-navy">{L("The request", "الطلب")}</h3>
                  </div>
                  <div className="flex flex-col gap-3 p-3.5">
                    {shownItems.map((it) => {
                      const a = ansFor(it.requestItemId);
                      const q = (a?.numberOfUnits ?? it.numberOfUnits) || 1;
                      const size = (ar ? it.sizeAr : it.size) || it.size;
                      return (
                        <div key={it.requestItemId} className="flex items-center gap-2.5">
                          {it.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.imageUrl} alt="" className="size-11 flex-none rounded-sm border border-border object-cover" />
                          ) : (
                            <span className="grid size-11 flex-none place-items-center rounded-sm border border-border bg-surface2 text-muted">
                              <Icon name="construction" size={20} />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-body font-extrabold text-navy">
                              {(ar ? it.labelAr : it.label) || it.label || L("Equipment", "المعدة")}
                            </span>
                            {size && <span className="block truncate text-meta text-muted">{size}</span>}
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-brand-soft px-2 py-px text-label font-extrabold text-brand-deep">×{nf(q)}</span>
                              <span className="rounded-full border border-border px-2 py-px text-label font-semibold text-muted-dark">{unitWord(it.priceUnit)}</span>
                            </span>
                          </span>
                        </div>
                      );
                    })}
                    {projectTerms && (
                      <div className="flex flex-col">
                        {projectTerms.rentalBasis && <RailRow k={L("Rental basis", "أساس الإيجار")} v={rentalBasisLabel(projectTerms.rentalBasis, L)} />}
                        {(projectTerms.startDate || projectTerms.endDate) && (
                          <RailRow
                            k={L("Rental period", "مدة الإيجار")}
                            v={`${projectTerms.startDate ? fmtDate(projectTerms.startDate) : "—"} → ${projectTerms.endDate ? fmtDate(projectTerms.endDate) : L("Open-ended", "بدون نهاية")}`}
                          />
                        )}
                        {railBillable && !railBillable.raw && <RailRow k={L("Billable days", "الأيام المحتسبة")} v={nf(railBillable.billable)} />}
                        {projectTerms.hoursPerDay != null && <RailRow k={L("Hours per day", "ساعات/يوم")} v={nf(projectTerms.hoursPerDay)} />}
                        {projectTerms.workingDaysPerWeek != null && <RailRow k={L("Working days / week", "أيام العمل/أسبوع")} v={nf(projectTerms.workingDaysPerWeek)} />}
                        {projectTerms.location && (
                          <RailRow
                            k={L("Location", "الموقع")}
                            v={
                              projectTerms.lat != null && projectTerms.lng != null ? (
                                <a
                                  className="font-extrabold text-brand-deep underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
                                  href={`https://www.google.com/maps?q=${projectTerms.lat},${projectTerms.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {projectTerms.location}
                                </a>
                              ) : (
                                projectTerms.location
                              )
                            }
                          />
                        )}
                        {bidsClose && <RailRow k={L("Bids close", "إغلاق العروض")} v={fmtDate(bidsClose)} />}
                        {submission.createdAt && <RailRow k={L("Bid received", "تاريخ العرض")} v={fmtDate(submission.createdAt)} />}
                      </div>
                    )}
                    {renterNotes && (
                      <p className="rounded-md bg-surface2 px-3 py-2.5 text-meta leading-relaxed text-muted-dark">
                        <b className="font-extrabold text-navy">{L("Your notes", "ملاحظاتك")}: </b>
                        {renterNotes}
                      </p>
                    )}
                  </div>
                </div>

                <div className={cx(CARD, "overflow-hidden")}>
                  <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                    <Icon name="receipt_long" size={17} className="text-muted" />
                    <h3 className="text-body font-extrabold text-navy">{L("The quotation", "عرض السعر")}</h3>
                  </div>
                  <div className="flex flex-col gap-1.5 p-3.5">
                    <MoneyRow
                      label={L("Rental", "الإيجار")}
                      sub={railBillable && !railBillable.raw ? L(`${railBillable.billable} billable days`, `${railBillable.billable} يوم محتسب`) : undefined}
                      value={railRental ? `${nf(railRental)} ${sar}` : "—"}
                    />
                    {railDelivery ? <MoneyRow label={L("Delivery to site", "النقل إلى الموقع")} value={`${nf(railDelivery)} ${sar}`} /> : null}
                    {railReturn ? <MoneyRow label={L("Return from site", "النقل من الموقع")} value={`${nf(railReturn)} ${sar}`} /> : null}
                    <div className="mt-1 border-t border-border pt-2">
                      <MoneyRow label={L("Subtotal", "المجموع")} value={`${nf(railTotals.subtotal)} ${sar}`} />
                      <MoneyRow label={L("VAT 15%", "ضريبة 15٪")} value={`${nf(railTotals.vat)} ${sar}`} />
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border pt-2.5">
                      <span className="text-body font-extrabold text-navy">
                        {singleItem ? L("Item total incl. VAT", "إجمالي البند شامل الضريبة") : L("Total incl. VAT", "الإجمالي شامل الضريبة")}
                      </span>
                      <span className="flex-none text-display font-extrabold tabular text-navy">{nf(railTotals.total)}</span>
                    </div>
                    {validUntil && (
                      <p className={cx("text-center text-meta font-semibold", vExpired ? "text-danger" : "text-muted")}>
                        {vExpired
                          ? L("This quote has expired", "انتهت صلاحية هذا العرض")
                          : L(`Valid until ${fmtDate(validUntil)}`, `صالح حتى ${fmtDate(validUntil)}`)}
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** The equipment's name, with its size where the request carries one. */
function itemName(it: BidFormItem, ar: boolean, L: (e: string, a: string) => string): string {
  const label = (ar ? it.labelAr : it.label) || it.label || L("Equipment", "المعدة");
  const size = (ar ? it.sizeAr : it.size) || it.size;
  return size ? `${label} · ${size}` : label;
}

/**
 * One numbered step of the form.
 *
 * The badge carries its state the way the form's does: the number while there is anything left to
 * answer, a green check once there is not. Read back, a submitted bid's steps are all complete —
 * except Terms, where a supplier who skipped a question leaves the count short, and that shortfall is
 * exactly what the renter is looking for.
 */
function StepCard({
  n,
  title,
  done,
  meta,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cx(CARD, "min-w-0")}>
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <span
          className={cx(
            "grid size-7 flex-none place-items-center rounded-full text-label font-extrabold",
            done ? "bg-ok text-white" : "bg-brand text-brand-fg",
          )}
        >
          {done ? <Icon name="check" size={17} /> : n}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-subhead font-extrabold text-navy">{title}</h3>
        {meta && <span className="flex-none text-meta font-semibold tabular text-muted">{meta}</span>}
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

/** A named block of term rows — the contract terms, or one item's. */
function TermGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      {title && <p className="mb-1 text-label font-extrabold uppercase tracking-wide text-muted">{title}</p>}
      <div className="rounded-md border border-border">{children}</div>
    </div>
  );
}

/**
 * One row of the form's answered-terms list: the term, what the renter asked for, and the answer.
 *
 * The answer is the point of the row, so it is the only thing on it carrying colour — green for Yes,
 * red for No, and a dash for a term the supplier never answered, which is a third state and must not
 * read as a No.
 */
function TermRow({
  row,
  L,
}: {
  row: { label: string; asked: string; ok: boolean | undefined };
  L: (e: string, a: string) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <span className="min-w-0">
        <span className="block truncate text-body text-navy">{row.label}</span>
        {row.asked && (
          <span className="block truncate text-meta text-muted">
            {L("you asked", "طلبتَ")}: <b className="font-semibold text-muted-dark">{row.asked}</b>
          </span>
        )}
      </span>
      <AnswerChip ok={row.ok} L={L} />
    </div>
  );
}

/** The supplier's answer to one term. */
function AnswerChip({ ok, L }: { ok: boolean | undefined; L: (e: string, a: string) => string }) {
  if (ok === true)
    return (
      <span className="flex flex-none items-center gap-1 text-body font-extrabold text-ok">
        <Icon name="check" size={16} />
        {L("Yes", "نعم")}
      </span>
    );
  if (ok === false)
    return (
      <span className="flex flex-none items-center gap-1 text-body font-extrabold text-danger">
        <Icon name="close" size={16} />
        {L("No", "لا")}
      </span>
    );
  return <span className="flex-none text-body font-semibold text-muted">—</span>;
}

/** A money line: label, an optional caption under it, and the figure. */
function MoneyRow({ label, sub, value, strong }: { label: string; sub?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="min-w-0">
        <span className={cx("block truncate text-body", strong ? "font-extrabold text-navy" : "text-navy")}>{label}</span>
        {sub && <span className="block truncate text-meta text-muted">{sub}</span>}
      </span>
      <span className={cx("flex-none whitespace-nowrap text-body tabular", strong ? "font-extrabold text-navy" : "font-semibold text-navy")}>
        {value}
      </span>
    </div>
  );
}

/** A key/value row in the rail's request card. */
function RailRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="flex-none text-meta text-muted">{k}</span>
      <span className="min-w-0 text-end text-meta font-extrabold text-navy">{v}</span>
    </div>
  );
}

/** A request or quotation code, in the form's own mono chip. */
function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="keep-mono rounded-sm border border-border bg-surface2 px-2 py-1 text-label font-semibold text-muted-dark">{children}</span>
  );
}

/** A titled group of attachments. */
function DocGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-label font-extrabold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

/** The label over a read-only field, matching the form's own. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-meta font-semibold text-muted-dark">{children}</label>;
}

/**
 * A read-only field, drawn as the form's input with the answer in it.
 *
 * An absent value says «not entered» rather than showing a bare dash (RMAP AC-218): the renter has to
 * be able to tell "the supplier left this blank" from "this failed to render".
 */
function RoField({
  label,
  value,
  multiline,
  empty,
  ltr,
  tone,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
  empty?: string;
  ltr?: boolean;
  tone?: "danger";
}) {
  const filled = !!(value && String(value).trim());
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div
        dir={ltr && filled ? "ltr" : undefined}
        className={cx(
          "rounded-md border border-border bg-surface2 px-3 py-2 text-body font-semibold",
          multiline ? "whitespace-pre-wrap leading-relaxed" : "min-h-[38px] truncate",
          tone === "danger" ? "text-danger" : filled ? "text-navy" : "text-muted",
        )}
      >
        {filled ? value : empty || "—"}
      </div>
    </div>
  );
}

function rentalBasisLabel(v: string, L: (e: string, a: string) => string) {
  const m: Record<string, [string, string]> = { DAILY: ["Daily", "يومي"], WEEKLY: ["Weekly", "أسبوعي"], MONTHLY: ["Monthly", "شهري"], PER_JOB: ["Per job", "للمهمة"], LONG_TERM: ["Long term", "طويل الأمد"] };
  const e = m[String(v).toUpperCase()];
  return e ? L(e[0], e[1]) : v;
}
