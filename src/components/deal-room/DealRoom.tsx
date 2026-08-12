"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { StreamChat, type Channel } from "stream-chat";
import { useLocale } from "@/lib/i18n";
import { useHeaderBack } from "@/components/AppShell";
import { fetchDealRoom, fetchStreamToken, fetchDealRoomDocuments, fetchQuotation, proposeRate, acceptDeal, batchUpdateTerms, releaseDeal, withdrawAcceptance, ApiError } from "@/lib/api/client";
import { computeDealTotals, type DealRoomView, type DealTerm, type DealRoomDocument, type DealRoomDocuments, type QuotationView } from "@/lib/contract/deal-room";
import { reconstructRounds, collapseRounds, latestRoundBy, withOpeningRound, chatCardOfMessage, buildChatCardView, respondedProposalIds, latestProposalId, type DealRound } from "@/lib/contract/deal-rounds";
import { valText, type ResolutionsMap } from "@/components/deal-room/DealRoomTerms";
import { ChatCard } from "@/components/deal-room/ChatCard";
import { VoiceRecorder } from "@/components/deal-room/VoiceRecorder";
import { renderQuotationSection, wrapQuotationPage, type QuotationDoc, type QuotationLineItem, type QuotationCard } from "@/lib/quotation/render";
import "@/components/deal-room/deal-room-proto.css";
import { computeQuoteTotals, computeRentalTotal, divisorNote } from "@/lib/pricing/rental";

type StreamAttachment = { type?: string; image_url?: string; thumb_url?: string; asset_url?: string; title?: string; mime_type?: string; file_size?: number; fallback?: string };
// `custom` carries the app's round payload (type:'rate_proposal', …) + location kind; i18n carries
// Stream's message translations. Both are read defensively (reconstructRounds / the translate toggle).
type ChatMsg = { id: string; text?: string; user?: { id?: string }; created_at?: string | Date; attachments?: StreamAttachment[]; custom?: Record<string, unknown>; i18n?: Record<string, unknown> };

/** Deal-room rounds → the standing supplier/rentee snapshots, for the allMatched gate + history. */
function roomOpeningRound(room: DealRoomView) {
  return {
    rate: room.rate, priceUnit: room.priceUnit, mobPrice: room.mobPrice, demobPrice: room.demobPrice,
    rentalUnits: room.agreedUnits ?? room.numberOfUnits, mobUnits: room.mobUnits, demobUnits: room.demobUnits,
    mobExcluded: room.mobExcluded, demobExcluded: room.demobExcluded,
  };
}
const eqNum = (a: number | null, b: number | null) => (a == null || b == null ? a == b : Math.round(a) === Math.round(b));
/** Total for one reconstructed round (reuses computeDealTotals with the round's full snapshot). */
function roundTotals(room: DealRoomView, r: DealRound) {
  return computeDealTotals(room, {
    rate: r.rate, priceUnit: r.priceUnit, mobPrice: r.mobPrice, demobPrice: r.demobPrice,
    rentalUnits: r.rentalUnits, mobUnits: r.mobUnits, demobUnits: r.demobUnits,
    mobExcluded: r.mobExcluded, demobExcluded: r.demobExcluded,
  });
}

const STREAM_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY ?? "";
const nf = (n: number) => Math.round(n).toLocaleString("en-US");
type LFn = (en: string, arr: string) => string;

/** A chat attachment's filename. `attName` produces a LOCALISED label for the bubble ("مرفق"), which is
 *  the wrong thing to write to disk — prefer the real title, then the name off the URL. */
function attFilename(a: StreamAttachment): string {
  const title = (a.title ?? "").trim();
  if (title) return title;
  const path = (a.asset_url || a.image_url || a.thumb_url || "").split(/[?#]/)[0];
  const last = decodeURIComponent(path.split("/").pop() ?? "");
  return last || "attachment";
}

/**
 * SAVE a chat attachment to the device, as opposed to opening it.
 *
 * The bubble's anchor navigates to the file, which for a PDF or an image means the browser renders it in
 * a tab — you can read it, but there's no in-page way to keep a copy. This fetches the bytes and hands
 * the browser a blob with a filename, the same idiom the export/quotation downloads use.
 *
 * `download` on a plain anchor would NOT do: the attachment lives on Stream's CDN, and browsers ignore
 * the attribute cross-origin.
 *
 * Falls back to opening the URL if the fetch is refused (a CDN that sends no CORS headers). That's the
 * behaviour the anchor already gives, so the button can never be worse than not having it.
 */
async function saveAttachment(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Deal-room chat attachments — matched EXACTLY to the mobile app (chat_input_bar.dart): images +
// documents ≤ 10 MB, video ≤ 25 MB, and ONE attachment per message. The web used to allow any file,
// any size, multiple at once — these bring it in line.
const CHAT_IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "heic"];
const CHAT_DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "ppt", "pptx"];
const CHAT_VIDEO_EXT = ["mp4", "mov", "m4v", "webm", "3gp"];
const CHAT_ACCEPT = [
  "image/jpeg", "image/png", "image/webp", "image/heic", ".jpg", ".jpeg", ".png", ".webp", ".heic",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".ppt", ".pptx",
  "video/mp4", "video/quicktime", "video/webm", ".mp4", ".mov", ".m4v", ".webm", ".3gp",
].join(",");
const CHAT_MAX_MEDIA = 10 * 1024 * 1024; // images + documents
const CHAT_MAX_VIDEO = 25 * 1024 * 1024; // video

/** Who the rentee party is, for the quotation's party block (from `/api/me` — the renter is themselves). */
type RenteeIdentity = { name: string; phone: string | null; email: string | null };

/**
 * Client-rendered deal-room quotation (the backend server PDF is disabled — the client renders it
 * now, app parity). Values mirror the app's `extractQuotationData`: rental = agreedRate × durationFactor
 * (PER_DAY = duration days, PER_WEEK = ceil(days/7), PER_MONTH = ceil(days/30), PER_JOB = 1); estimated
 * total = (rental + mobilization + demobilization) × units; VAT 15%.
 *
 * TWO kinds, and the distinction is the point:
 *
 *   • `final` (room CLOSED) — the signed document. Agreed values come from the confirmed Quotation
 *     row (+ the deal room for mob/demob/units/fixed terms/supplier name).
 *
 *   • `draft` (before CLOSED) — there is no Quotation row yet, so EVERYTHING comes from the live deal
 *     room. `q` is null. This is deliberately built from the room and not from the bid: the bid only
 *     tracks the negotiated PRICE (the backend writes price counters back to `bid.priceAmount`), so a
 *     bid-derived document silently misses negotiated unit counts, excluded delivery/return legs and
 *     non-price terms — i.e. it can state the right number for the wrong deal. The room has all of it.
 *     Rendered with a DRAFT badge + watermark and no quotation number; see `draftLabel` in render.ts.
 */
function buildQuotationHtml(room: DealRoomView, q: QuotationView | null, rentee: RenteeIdentity, ar: boolean, L: (en: string, arr: string) => string, kind: "final" | "draft"): string {
  const draft = kind === "draft";
  const lang = ar ? "ar" : "en";
  const sar = L("SAR", "ر.س");
  // EXACT same math as the live price bar (computeDealTotals) — prorated ÷26/÷7, PER_JOB / no-duration =
  // one full period, mob/demob use their own counts + honor leg exclusion, VAT 15%. Guarantees the
  // quotation total == the number the renter saw in the room.
  const t = computeDealTotals(room, { rate: q?.agreedRate ?? room.rate, priceUnit: q?.priceUnit ?? room.priceUnit });
  const rate = t.rate;
  const unit = t.priceUnit;
  const units = t.rentalUnits;
  const days = room.periods;
  const periodLabel = unit === "PER_WEEK" ? L("week", "أسبوع") : unit === "PER_MONTH" ? L("month", "شهر") : unit === "PER_JOB" ? L("job", "مهمة") : L("day", "يوم");
  const rentalTotal = t.rentalTotal;
  const subtotal = t.subtotal;
  const vat = t.vat;
  const total = t.grand;
  const dateStr = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  // A DRAFT must NOT carry a quotation number — an issued reference is precisely what makes a document
  // read as final. Cite the REQUEST code instead: a reference to the negotiation, not to a quotation.
  const qnum = draft ? (room.shortCode || "—") : ((q?.quotationNumber ?? "").slice(0, 8).toUpperCase() || "—");
  const contractType = q?.contractType ?? room.contractType;

  const valFmt = (v: unknown): string => {
    if (v == null || v === "") return "—";
    if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : "—";
    if (typeof v === "boolean") return v ? L("Yes", "نعم") : L("No", "لا");
    const t = String(v).toLowerCase();
    if (t === "supplier") return L("Supplier", "المؤجّر");
    if (t === "rentee" || t === "renter") return L("Rentee", "المستأجر");
    if (t === "true" || t === "included" || t === "yes") return L("Yes", "نعم");
    if (t === "false" || t === "excluded" || t === "not_included" || t === "no") return L("No", "لا");
    return String(v);
  };

  // Invoice line items (rental + delivery + return) — SAME 6-column table as the bid-card quotation.
  const lineItems: QuotationLineItem[] = [];
  // Rental qty/price columns mirror the live price bar's factor logic: PER_JOB → units jobs; whole
  // period count → "N × units"; a partial (day-count) duration → effective per-day rate × days.
  const factorInt = Number.isInteger(t.periodCount) ? t.periodCount : null;
  const partial = unit !== "PER_JOB" && t.hasDuration && factorInt == null;
  const rentalQty = unit === "PER_JOB"
    ? String(units)
    : partial
      ? `${room.periods} ${L("days", "يوم")}${units > 1 ? ` × ${units}` : ""}`
      : `${factorInt ?? 1}${units > 1 ? ` × ${units}` : ""}`;
  lineItems.push({
    num: 1, label: L("Rental", "الإيجار"), detail: room.supplier.name,
    unit: partial ? L("day", "يوم") : periodLabel,
    qty: rentalQty,
    price: partial ? `${nf(Math.round(t.perDayRate))} / ${L("day", "يوم")}` : `${nf(rate)} / ${periodLabel}`,
    total: nf(rentalTotal),
  });
  // Mob/demob ALWAYS shown; honor each leg's OWN unit count + exclusion (excluded → "Not included",
  // matching the price bar which contributes 0 for an excluded leg).
  const logiRow = (label: string, excluded: boolean, price: number, unitsN: number, lineTotal: number, byRentee: boolean): QuotationLineItem =>
    excluded
      ? { num: null, label, detail: L("Not included", "غير مشمول"), unit: "—", qty: "—", price: "—", total: L("Not included", "غير مشمول") }
      : price > 0
        ? { num: null, label, detail: room.supplier.name, unit: L("Trip", "رحلة"), qty: String(unitsN), price: nf(price), total: nf(lineTotal) }
        : { num: null, label, detail: byRentee ? L("Arranged by the rentee", "يُرتّبه المستأجر") : L("Included", "مشمول"), unit: "—", qty: "—", price: "—", total: byRentee ? L("By rentee", "على المستأجر") : L("Included", "مشمول") };
  lineItems.push(logiRow(L("Delivery to site", "النقل إلى الموقع"), t.mobExcluded, t.mobPrice, t.mobUnitsN, t.mobTotal, room.mobByRentee === true));
  lineItems.push(logiRow(L("Return from site", "الإرجاع من الموقع"), t.demobExcluded, t.demobPrice, t.demobUnitsN, t.demobTotal, room.demobByRentee === true));

  const cards: QuotationCard[] = [];
  // Structured rental/equipment details (from the request item) — rows with no value are skipped
  // (field names best-effort). Operator/safety + cost responsibilities are NOT separate cards: they
  // flow through the Agreed/Fixed terms + the price extras below, matching the app.
  const dd = room.details;
  const yn = (b: boolean | null) => (b == null ? null : b ? L("Yes", "نعم") : L("No", "لا"));
  const fmtDate = (v: string | null) => { if (!v) return null; const dt = new Date(v); return isNaN(dt.getTime()) ? v : dt.toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const addRow = (rowsArr: { label: string; value: string }[], label: string, v: unknown) => {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
    rowsArr.push({ label, value: Array.isArray(v) ? v.join(", ") : String(v) });
  };
  const detailRows: { label: string; value: string }[] = [];
  addRow(detailRows, L("Equipment", "المعدة"), dd.equipmentLabel);
  addRow(detailRows, L("Location", "الموقع"), dd.location);
  addRow(detailRows, L("Rental type", "نوع الإيجار"), dd.rentalType);
  addRow(detailRows, L("Contract type", "نوع العقد"), contractType);
  addRow(detailRows, L("Start date", "تاريخ البدء"), fmtDate(dd.startDate));
  addRow(detailRows, L("End date", "تاريخ الانتهاء"), fmtDate(dd.endDate));
  addRow(detailRows, L("Duration", "المدة"), days != null ? `${days} ${L("days", "يوم")}` : null);
  addRow(detailRows, L("Working hours/day", "ساعات العمل/يوم"), dd.workingHoursPerDay);
  addRow(detailRows, L("Working days/week", "أيام العمل/أسبوع"), dd.workingDaysPerWeek);
  addRow(detailRows, L("Fulfillment", "التنفيذ"), dd.fulfillment);
  addRow(detailRows, L("Urgency", "الأولوية"), dd.urgency);
  addRow(detailRows, L("Subletting", "التأجير من الباطن"), yn(dd.subletting));
  addRow(detailRows, L("Local content", "المحتوى المحلي"), yn(dd.localContent));
  addRow(detailRows, L("Rental extendable", "قابل للتمديد"), yn(dd.extendable));
  addRow(detailRows, L("Additional notes", "ملاحظات إضافية"), dd.additionalNotes);
  if (detailRows.length) cards.push({ title: L("Rental & equipment details", "تفاصيل الإيجار والمعدة"), rows: detailRows });

  // Price extras (app parity): overtime rate + cost-responsibility items ("fuel → supplier"), shown in
  // the price section. These cost keys are excluded from the term cards below to avoid duplication.
  const COST_KEYS = new Set(["fuel", "maintenance", "overtime", "overtime_rate", "operator_food", "fat_food", "operator_transport_accommodation", "fat_accommodation_transport", "operator_transport"]);
  const isCost = (k: string) => COST_KEYS.has(k);
  const priceExtras: { label: string; value: string }[] = [];
  if (dd.overtimeRate) priceExtras.push({ label: L("Overtime rate", "سعر العمل الإضافي"), value: /^\d+(\.\d+)?$/.test(dd.overtimeRate) ? `${dd.overtimeRate}x` : dd.overtimeRate });
  const seenCost = new Set<string>();
  for (const term of q?.agreedTerms ?? []) if (isCost(term.key) && !seenCost.has(term.key)) { seenCost.add(term.key); priceExtras.push({ label: ar ? term.labelAr : term.label, value: valFmt(term.value) }); }
  for (const term of room.terms) if (isCost(term.key) && !seenCost.has(term.key)) { seenCost.add(term.key); priceExtras.push({ label: ar ? term.labelAr : term.label, value: valFmt(term.value ?? term.platformDefault) }); }

  // FINAL reads the agreed snapshot off the Quotation row. DRAFT has no snapshot, so it derives from the
  // room's live term states — and SPLITS them. A term the two sides haven't settled has no agreed value,
  // so listing its current value under "Agreed" would assert something untrue; those get their own card.
  const roomRows = (ts: DealTerm[]) => ts.filter((tm) => tm.key !== "PRICE" && !isCost(tm.key)).map((tm) => ({ label: ar ? tm.labelAr : tm.label, value: valFmt(tm.value ?? tm.platformDefault) }));
  if (draft) {
    const settledRows = roomRows(room.terms.filter((tm) => tm.state === "agreed" || tm.state === "soft_accepted"));
    if (settledRows.length) cards.push({ title: L("Agreed so far", "ما اتُّفق عليه حتى الآن"), rows: settledRows });
    const openRows = room.terms
      .filter((tm) => tm.key !== "PRICE" && !isCost(tm.key) && (tm.state === "disputed" || tm.state === "pending"))
      .map((tm) => ({ label: ar ? tm.labelAr : tm.label, value: L("Under negotiation", "قيد التفاوض") }));
    if (openRows.length) cards.push({ title: L("Still under negotiation", "لا يزال قيد التفاوض"), rows: openRows });
  } else {
    const agreedRows = (q?.agreedTerms ?? []).filter((tm) => tm.key !== "PRICE" && !isCost(tm.key)).map((tm) => ({ label: ar ? tm.labelAr : tm.label, value: valFmt(tm.value) }));
    if (agreedRows.length) cards.push({ title: L("Agreed terms", "الشروط المتفق عليها"), rows: agreedRows });
  }
  const fixedRows = roomRows(room.terms.filter((tm) => tm.state === "fixed"));
  if (fixedRows.length) cards.push({ title: L("Fixed terms", "الشروط الثابتة"), rows: fixedRows });

  const doc: QuotationDoc = {
    lang,
    title: draft ? L("Draft quotation", "مسودة عرض سعر") : L("Equipment rental quotation", "عرض سعر تأجير معدات"),
    quotationNumber: qnum,
    dateStr,
    supplier: {
      label: L("Supplier", "المؤجِّر"),
      name: room.supplier.name,
      idRows: [
        { label: L("National Address", "العنوان الوطني"), verified: room.supplier.isVerified },
        { label: L("CR #", "س.ت"), verified: room.supplier.isVerified },
        { label: L("VAT #", "ض.ق.م"), verified: room.supplier.isVerified },
        // Pre-close there's no Quotation row: the room always carries the supplier's phone
        // (server-gated, see DealParty.phone). Supplier email isn't on the deal-room projection yet.
        { label: L("Phone", "الهاتف"), value: q?.supplierPhone ?? room.supplier.phone },
        { label: L("Email", "البريد"), value: q?.supplierEmail },
      ],
      // Verified shows on the CR/VAT rows ("✓ Verified") — no standalone orphan party chip.
      chips: [],
    },
    rentee: {
      label: L("Rentee", "المُستأجِر"),
      name: rentee.name,
      idRows: [
        // The rentee IS the viewer, so /api/me backfills their own contact pre-close (the room gates
        // rentee.phone to CLOSED).
        { label: L("Phone", "الهاتف"), value: q?.renteePhone ?? rentee.phone },
        { label: L("Email", "البريد"), value: q?.renteeEmail ?? rentee.email },
      ],
      chips: [],
    },
    logoUrl: typeof window !== "undefined" ? `${window.location.origin}/moedatech-logomark.svg` : undefined,
    meta: [], // no meta strip (app parity) — reference/contract/period live in the details card
    priceExtras,
    lineItems,
    currency: sar,
    totals: { subtotal, vat, total },
    cards,
    showSigned: false,
    draftLabel: draft ? L("Draft — not final", "مسودة — غير نهائية") : null,
    // Short disclaimer instead of the full legal clause list + signed block (app parity). A draft gets a
    // DIFFERENT one: no validity period (it isn't an offer, so there's nothing to expire) and an explicit
    // statement that neither party is bound — the renter may forward this file to a third party.
    legal: draft
      ? [L("This is a DRAFT of a deal still under negotiation — it is not a quotation, not an offer, and not binding on either party. The supplier has not confirmed it, and the price, quantities and terms can still change. A final quotation is issued only once both sides confirm.", "هذه مسودة لصفقة لا تزال قيد التفاوض — وهي ليست عرض سعر ولا إيجابًا، وغير ملزمة لأي من الطرفين. لم يؤكّدها المؤجّر بعد، وقد تتغيّر الأسعار والكميات والشروط. يُصدَر عرض السعر النهائي فقط بعد تأكيد الطرفين.")]
      : [L("This quotation is generated electronically via Moedatech, valid for 7 days from the issue date. Prices exclude anything not listed above; VAT at 15% applies per Saudi tax law.", "صدر هذا العرض إلكترونيًا عبر منصة معداتك، وهو ساري المفعول لمدة ٧ أيام من تاريخ الإصدار. الأسعار لا تشمل ما لم يُذكر أعلاه، وتُطبَّق ضريبة القيمة المضافة بنسبة ١٥٪ وفقًا للنظام السعودي.")],
  };
  // The window title is what the browser offers as the print/save filename — so it must carry DRAFT too.
  const pageTitle = draft
    ? `${L("DRAFT", "مسودة")} · ${room.shortCode || L("Deal room", "غرفة الصفقة")}`
    : L("Confirmed Quotation", "عرض سعر مؤكّد");
  return wrapQuotationPage(renderQuotationSection(doc), { lang, title: pageTitle });
}

export function DealRoom({ id, onTitle }: { id: string; onTitle?: (t: string) => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  // In-app Back arrow in the AppShell header → the Inbox (the deal-room list). A deal room is a
  // drill-down, so this gives an explicit way up instead of relying on the browser back button.
  useHeaderBack(() => router.push("/inbox"));

  const [room, setRoom] = useState<DealRoomView | null>(null);
  const [error, setError] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [priceAll, setPriceAll] = useState(false); // price-bar للكل/للوحدة toggle (per-unit default)
  const [busy, setBusy] = useState(false);
  // App parity: a single guided flow modal (3 steps: Terms → Price → Summary) handles both Counter and
  // Accept. `flowMode` picks which — null = closed.
  const [flowMode, setFlowMode] = useState<"counter" | "accept" | null>(null);
  const [counterErr, setCounterErr] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [callOpen, setCallOpen] = useState(false); // call-supplier modal (shows the number + dial/copy)
  // Touch device → dial (tel:). Desktop/laptop → just SHOW the number (you can't place a call from a laptop).
  const [canCall, setCanCall] = useState(false);
  useEffect(() => { setCanCall(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true); }, []);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false); // mic active → composer hands its row to the recorder
  const [releaseOpen, setReleaseOpen] = useState(false); // reopen-accepted-deal confirm modal
  const [releasing, setReleasing] = useState(false);
  const [releaseErr, setReleaseErr] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false); // withdraw a pending acceptance (AWAITING)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // App parity: term accept/counter are collected LOCALLY here and submitted once (batched) on
  // Counter/Accept — nothing is PATCHed per click.
  const [resolutions, setResolutions] = useState<ResolutionsMap>({});

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [myStreamId, setMyStreamId] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState(false);
  const [text, setText] = useState("");
  // deal-room/chat parity — per-message inline translation (incoming text only): id → translated text.
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<string | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const roomRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const errMsg = (e: unknown, fb: string) => (e instanceof ApiError ? (ar ? e.messageAr : e.detail) || fb : fb);

  const loadRoom = () => fetchDealRoom(id).then(setRoom).catch(() => setError(true));
  // Reopen an accepted (CLOSED) deal for re-negotiation (app parity: "release"). Backend flips
  // CLOSED → NEGOTIATING and re-arms the bid; loadRoom then brings the terms/price card + composer back.
  async function doRelease() {
    setReleaseErr(null);
    setReleasing(true);
    try {
      await releaseDeal(id);
      setReleaseOpen(false);
      await loadRoom();
    } catch (e) {
      setReleaseErr(e instanceof ApiError ? e.message : L("Couldn't reopen the deal. Please try again.", "تعذّر إعادة فتح الصفقة. حاول مرة أخرى."));
    } finally {
      setReleasing(false);
    }
  }

  // deal-room/negotiation — withdraw a pending acceptance (AWAITING → NEGOTIATING). App parity:
  // "withdraw acceptance"; backend clears the reserved units + re-arms the bid, loadRoom restores the
  // negotiate controls. Distinct from release (which reopens a CLOSED deal).
  async function doWithdraw() {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      await withdrawAcceptance(id);
      await loadRoom();
    } catch (e) {
      window.alert(errMsg(e, L("Couldn't withdraw right now — please try again.", "تعذّر سحب القبول الآن — حاول مرة أخرى.")));
    } finally {
      setWithdrawing(false);
    }
  }

  // The confirmed-deal quotation. The server-side PDF is disabled (app parity — the client renders it
  // now), so we build it CLIENT-SIDE from the confirmed Quotation row's AGREED snapshot (agreedRate,
  // agreedTerms, contractType, phones/emails) + the deal room (mob/demob, units, fixed terms, supplier
  // name) + the renter's name (/api/me), matching the app's extractQuotationData. If a real presigned
  // pdfUrl ever exists it's opened as-is (fallback).
  async function downloadQuotation(kind: "final" | "draft") {
    if (quoteBusy || !room) return;
    setQuoteBusy(true);
    setQuoteErr(null);
    try {
      // FINAL only: the Quotation row is created by the SUPPLIER's confirm, so requesting it before the
      // room is CLOSED would fail and land in the catch below as "couldn't load". A draft never asks.
      let q: QuotationView | null = null;
      if (kind === "final") {
        q = await fetchQuotation(id);
        if (q.pdfUrl) {
          window.open(q.pdfUrl, "_blank", "noopener,noreferrer");
          return;
        }
      }
      let rentee: RenteeIdentity = { name: "", phone: null, email: null };
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.ok) {
          const d = (await meRes.json()) as { user?: { firstName?: string | null; lastName?: string | null; companyName?: string | null; phone?: string | null; email?: string | null } };
          const u = d.user ?? {};
          rentee = {
            name: (u.companyName?.trim() || [u.firstName, u.lastName].filter(Boolean).join(" ")) ?? "",
            phone: u.phone ?? null,
            email: u.email ?? null,
          };
        }
      } catch {
        /* identity is best-effort */
      }
      const w = window.open("", "_blank");
      if (!w) {
        setQuoteErr(L("Allow pop-ups to open the quotation.", "اسمح بالنوافذ المنبثقة لفتح عرض السعر."));
        return;
      }
      w.document.write(buildQuotationHtml(room, q, rentee, ar, L, kind));
      w.document.close();
    } catch (e) {
      setQuoteErr(errMsg(e, L("Couldn’t load the quotation.", "تعذّر تحميل عرض السعر.")));
    } finally {
      setQuoteBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchDealRoom(id).then((d) => active && setRoom(d)).catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [id]);

  // Live refresh (app parity): the supplier's moves happen server-side — a rate counter, term updates,
  // and especially the CONFIRM that closes the deal (and a decline that reopens it). The app reacts to
  // FCM signals; here we poll the room while it's active so the renter sees those without reloading.
  // Stops once the deal is terminal (CLOSED / ABANDONED).
  useEffect(() => {
    const st = room?.status;
    if (!st || st === "CLOSED" || st === "ABANDONED") return;
    const t = setInterval(() => { void loadRoom(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, id]);

  useEffect(() => {
    if (room && onTitle) onTitle(room.supplier.name);
  }, [room, onTitle]);


  // Live chat (GetStream).
  useEffect(() => {
    if (!STREAM_KEY) return;
    let client: StreamChat | null = null;
    let cancelled = false;
    (async () => {
      try {
        const tok = await fetchStreamToken(id);
        if (cancelled || !tok.token || !tok.userId || !tok.channelId) return;
        client = StreamChat.getInstance(STREAM_KEY);
        await client.connectUser({ id: tok.userId }, tok.token);
        if (cancelled) return;
        setMyStreamId(tok.userId);
        const ch = client.channel("messaging", tok.channelId);
        await ch.watch();
        if (cancelled) return;
        channelRef.current = ch;
        setMessages([...ch.state.messages] as ChatMsg[]);
        setChatReady(true);
        ch.on("message.new", () => {
          setMessages([...ch.state.messages] as ChatMsg[]);
          // A supplier action (rate counter / term update / confirm / decline) arrives as a system
          // message — refetch the room (debounced ~1.5s, app parity) so the status + terms reflect it
          // immediately rather than waiting for the 15s poll.
          if (roomRefetchTimer.current) clearTimeout(roomRefetchTimer.current);
          roomRefetchTimer.current = setTimeout(() => { void loadRoom(); }, 1500);
        });
      } catch {
        /* chat unavailable — the rest of the room still works */
      }
    })();
    return () => {
      cancelled = true;
      channelRef.current = null;
      if (roomRefetchTimer.current) clearTimeout(roomRefetchTimer.current);
      client?.disconnectUser().catch(() => {});
    };
    // loadRoom just re-reads fetchDealRoom(id) (id stable) — don't re-open the chat connection for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || !channelRef.current) return;
    setText("");
    try {
      await channelRef.current.sendMessage({ text: body });
    } catch {
      setText(body);
    }
  }

  /** Upload + send ONE attachment via GetStream, gated to the app's allowed types + size caps. */
  async function sendFiles(files: FileList | null) {
    const ch = channelRef.current;
    if (!ch || !files || !files.length) return;
    setFileErr(null);
    // App parity: one attachment per message — take the first only.
    const file = files[0];
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const isImg = file.type.startsWith("image/") || CHAT_IMAGE_EXT.includes(ext);
    const isVideo = file.type.startsWith("video/") || CHAT_VIDEO_EXT.includes(ext);
    const isDoc = CHAT_DOC_EXT.includes(ext);
    if (!isImg && !isVideo && !isDoc) {
      setFileErr(L("That file type isn't supported.", "نوع الملف غير مدعوم."));
      return;
    }
    const cap = isVideo ? CHAT_MAX_VIDEO : CHAT_MAX_MEDIA;
    if (file.size > cap) {
      setFileErr(L(`File is too large (max ${Math.round(cap / (1024 * 1024))} MB).`, `الملف كبير جدًا (الحد ${Math.round(cap / (1024 * 1024))} ميغابايت).`));
      return;
    }
    setUploading(true);
    try {
      const res = isImg ? await ch.sendImage(file) : await ch.sendFile(file);
      const attachment: StreamAttachment = isImg
        ? { type: "image", image_url: res.file, fallback: file.name }
        : { type: "file", asset_url: res.file, title: file.name, mime_type: file.type, file_size: file.size };
      const body = text.trim();
      await ch.sendMessage({ text: body || undefined, attachments: [attachment] });
      setText("");
    } catch {
      setFileErr(L("Upload failed — please try again.", "فشل الرفع — حاول مجددًا."));
    } finally {
      setUploading(false);
    }
  }

  /** Send a recorded voice note as an audio attachment (app parity: mic → voice bubble). */
  async function sendVoiceNote(file: File) {
    const ch = channelRef.current;
    if (!ch) return;
    setFileErr(null);
    setUploading(true);
    try {
      const res = await ch.sendFile(file);
      await ch.sendMessage({ attachments: [{ type: "audio", asset_url: res.file, title: file.name, mime_type: file.type, file_size: file.size }] });
    } catch {
      setFileErr(L("Couldn't send the voice note.", "تعذّر إرسال الملاحظة الصوتية."));
    } finally {
      setUploading(false);
    }
  }

  function openFlow(mode: "counter" | "accept") {
    if (!room || busy) return;
    setCounterErr(null);
    setFlowMode(mode);
  }

  // Collect a term resolution locally (no server call — app parity). Submitted on Counter/Accept.
  const setResolution = (key: string, action: "accept" | "counter", value?: unknown) =>
    setResolutions((r) => ({ ...r, [key]: { action, value } }));
  const clearResolution = (key: string) =>
    setResolutions((r) => { const n = { ...r }; delete n[key]; return n; });
  const resolutionUpdates = () =>
    Object.entries(resolutions).map(([termKey, r]) => ({ termKey, action: r.action, value: r.value }));

  async function submitCounter(next: {
    rate: number; mobPrice?: number; demobPrice?: number;
    // deal-room/negotiation — per-type unit counts + leg exclusion travel with the counter.
    rentalUnits?: number; mobUnits?: number; demobUnits?: number; mobExcluded?: boolean; demobExcluded?: boolean;
  }) {
    if (!room || busy) return;
    setBusy(true);
    setCounterErr(null);
    try {
      // App parity (DealRoomCounterWithRate): batch the locally-resolved term updates, THEN propose the
      // rate + mob/demob prices + per-type unit counts + leg exclusion — all as one counter move.
      const updates = resolutionUpdates();
      if (updates.length) await batchUpdateTerms(id, updates);
      await proposeRate(id, {
        proposedRate: next.rate, priceUnit: room.priceUnit ?? "PER_DAY",
        mobPrice: next.mobPrice, demobPrice: next.demobPrice,
        rentalUnits: next.rentalUnits, mobUnits: next.mobUnits, demobUnits: next.demobUnits,
        mobExcluded: next.mobExcluded, demobExcluded: next.demobExcluded,
      });
      setResolutions({});
      await loadRoom();
      setFlowMode(null);
    } catch (e) {
      setCounterErr(errMsg(e, L("Couldn’t send your counter — please try again.", "تعذّر إرسال عرضك المقابل — حاول مرة أخرى.")));
    } finally {
      setBusy(false);
    }
  }

  async function doAccept(contractType: string = "formal") {
    if (!room || busy) return;
    setBusy(true);
    try {
      // App parity (accept-all-terms): submit the locally-collected term resolutions together with the
      // accept. contractType is chosen on the flow's Summary step (defaults to "formal"). Send the
      // accepted rental count as agreedUnits (the app sends it — records the count for multi-unit /
      // partial-fulfilment requests instead of defaulting to the full offer).
      await acceptDeal(id, contractType, { termResolutions: resolutionUpdates(), agreedUnits: room.agreedUnits ?? room.numberOfUnits });
      setResolutions({});
      await loadRoom();
      setFlowMode(null);
    } catch (e) {
      window.alert(errMsg(e, L("Couldn’t accept right now — please try again.", "تعذّر القبول الآن — حاول مرة أخرى.")));
    } finally {
      setBusy(false);
    }
  }

  // Inline translate (app parity): toggle an incoming message to the opposite script via Stream's
  // translateMessage; a second tap restores the original. Best-effort — silent if translate is off.
  async function translateMsg(m: ChatMsg) {
    const body = (m.text ?? "").trim();
    if (!body || translating) return;
    if (translations[m.id]) { setTranslations((t) => { const n = { ...t }; delete n[m.id]; return n; }); return; }
    const client = channelRef.current?.getClient?.();
    if (!client) return;
    const target = /[؀-ۿ]/.test(body) ? "en" : "ar";
    setTranslating(m.id);
    try {
      const res = await client.translateMessage(m.id, target);
      const i18n = ((res as { message?: { i18n?: Record<string, unknown> } })?.message?.i18n ?? {}) as Record<string, unknown>;
      const tx = (i18n[`${target}_text`] as string) || "";
      if (tx) setTranslations((t) => ({ ...t, [m.id]: tx }));
    } catch {
      /* translation unavailable — keep original */
    } finally {
      setTranslating(null);
    }
  }

  if (error) return <div className="dlproto"><div className="rempty">{L("Couldn’t open this deal room.", "تعذّر فتح غرفة الصفقة.")}</div></div>;
  if (!room) return <div className="dlproto"><div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div></div>;

  // Single source of truth for the money — SHARED with the confirmed quotation via computeDealTotals so
  // the price bar and the quotation can never diverge. Prorated ÷26/÷7; PER_JOB / no-duration = one full
  // period; mob/demob use their own counts + honor exclusion; VAT 15%.
  const totals = computeDealTotals(room);
  const rate = totals.rate;
  const basisU = totals.priceUnit;
  const hasDuration = totals.hasDuration;
  const periods = totals.periods; // duration in DAYS; no duration = one full period
  const rentalUnits = totals.rentalUnits;
  const mobUnitsN = totals.mobUnitsN;
  const demobUnitsN = totals.demobUnitsN;
  const units = rentalUnits; // the rental count drives the card display
  const rentalTotal = totals.rentalTotal;
  const mobTotal = totals.mobTotal;
  const demobTotal = totals.demobTotal;
  const subtotal = totals.subtotal;
  const vat = totals.vat;
  const grand = totals.grand;
  // Billing-period label from the bid's price unit (same mapping the bid cards use).
  const periodLabel = (() => {
    switch ((room.priceUnit ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  })();
  // Rental factor label, in the bid card's words: the supplier's RAW quoted rate over its own period,
  // the divisor that turns it into days, and the BILLABLE day count it is charged across. It used to
  // read "229/day × 61 days" off the calendar duration while the total charged 53 — a label stating an
  // arithmetic its own total did not follow. Nothing prorated (PER_JOB, open-ended, no start date)
  // keeps the bare rate, since there is no day count to explain.
  const rentalDivisorNote = divisorNote(basisU, L);
  const rentalLabel =
    basisU === "PER_JOB"
      ? nf(rate)
      : totals.rentalRaw
        ? `${nf(rate)}/${periodLabel}`
        : `${nf(rate)}/${periodLabel}${rentalDivisorNote ? ` · ${rentalDivisorNote}` : ""} × ${totals.billableDays} ${L("billable days", "يوم محتسب")}`;
  const closed = room.status === "CLOSED";
  const abandoned = room.status === "ABANDONED";
  const awaiting = room.status === "AWAITING_SUPPLIER_CONFIRMATION";
  // Equipment title — real name + size (like the request/bid cards), not the bare "Equipment" fallback.
  const eqName = (ar ? room.details.equipmentLabelAr || room.details.equipmentLabel : room.details.equipmentLabel) || L("Equipment", "المعدّة");
  const eqSize = ar ? room.details.equipmentSizeAr || room.details.equipmentSize : room.details.equipmentSize || room.details.equipmentSizeAr;
  // deal-room/negotiation rounds — reconstructed from the chat's rate_proposal messages (app parity).
  // Drive the allMatched accept gate, the turn badges, and the round-history log. Falls back to the
  // room's standing values if the chat custom data isn't reachable (never breaks the live flow).
  const rounds = withOpeningRound(collapseRounds(reconstructRounds(messages as unknown[])), roomOpeningRound(room));
  const rRound = latestRoundBy(rounds, "rentee");
  const sRound = latestRoundBy(rounds, "supplier");
  // DRCARD — which rate proposals a later `rate_response` has settled, and which one is still the live
  // offer. Both derived from the stream, not from local state, so a reload shows the same
  // settled/actionable split and only the standing offer is ever actionable.
  const respondedIds = respondedProposalIds(messages as unknown[]);
  const lastProposalId = latestProposalId(messages as unknown[]);

  // Accept gate — app parity `allMatched` (rentee perspective): every non-fixed term matched/accepted,
  // AND the rentee's latest price+units round equals the supplier's (nothing left to change). When rounds
  // can't be reconstructed, rRound/sRound are the room fallback so the price/units checks pass and the gate
  // degrades to the term check — never stricter than the backend's disputed-only 409.
  const termMatched = (t: DealTerm): boolean => {
    if (t.state === "fixed" || t.state === "agreed" || t.state === "soft_accepted") return true;
    const r = resolutions[t.key];
    if (!r) return false;
    if (r.action === "accept") return true;
    return r.value != null && String(r.value) === String(t.supplierDeclared);
  };
  const termsMatched = room.terms.every(termMatched);
  const priceMatches = !rRound || !sRound ? true
    : eqNum(rRound.rate, sRound.rate) && (rRound.priceUnit ?? "") === (sRound.priceUnit ?? "") && eqNum(rRound.mobPrice, sRound.mobPrice) && eqNum(rRound.demobPrice, sRound.demobPrice);
  const unitsMatch = !rRound || !sRound ? true
    : eqNum(rRound.rentalUnits, sRound.rentalUnits) && eqNum(rRound.mobUnits, sRound.mobUnits) && eqNum(rRound.demobUnits, sRound.demobUnits) && rRound.mobExcluded === sRound.mobExcluded && rRound.demobExcluded === sRound.demobExcluded;
  const unresolvedDisputed = room.terms.filter((t) => t.state === "disputed" && !resolutions[t.key]);
  const canAccept = termsMatched && priceMatches && unitsMatch;
  // Show the Accept/Negotiate CTAs on the renter's turn OR whenever everything already matches (app parity
  // deadlock-break: allMatched surfaces Accept even if it would otherwise read as the supplier's turn).
  const live = !closed && !abandoned && !awaiting;
  const showAct = live && (room.myTurn || canAccept);
  const acceptBlockMsg = !termsMatched
    ? L("Resolve the differing terms below before you can accept", "قم بحل الشروط المختلفة أدناه قبل القبول")
    : L("Match the supplier's latest price and quantities before you can accept", "طابق أحدث سعر وكميات المورد قبل القبول");
  // Turn cue (app `negotiateFresh` vs `negotiate`): the supplier countered last vs the renter's opening move.
  const supplierCountered = room.myTurn && room.lastCounterBy === "supplier";

  return (
    <div className="dlproto" dir={ar ? "rtl" : "ltr"}>
      {/* top bar (§5.2) — supplier chip · equipment/request block · phase pill · icon actions */}
      <div className="topbar">
        {/* supplier chip → profile & documents. NOTE: the deal-room payload only carries name + isVerified
            (no rating/deals/commitment), so that prototype stat line is omitted rather than fabricated. */}
        <button type="button" className="tb-sup" onClick={() => setShowDocs(true)}>
          <span className="av">{room.supplier.name.charAt(0).toUpperCase()}</span>
          <span className="nm">
            <span className="n">{room.supplier.name}{room.supplier.isVerified && <span className="material-icons-outlined">verified</span>}</span>
            <span className="sub">{L("Supplier", "المورد")}</span>
          </span>
        </button>
        <span className="tb-div" />
        {/* equipment / request block */}
        <div className="tb-eq">
          <span className="ic"><span className="material-icons-outlined">construction</span></span>
          <span className="meta">
            <span className="t">
              {room.shortCode && <span className="tb-code">{room.shortCode}</span>}
              {eqName}{eqSize ? ` · ${eqSize}` : ""}
              {room.numberOfUnits > 1 ? ` · ${room.numberOfUnits} ${L("units", "وحدة")}` : ""}
              {room.details.operatorIncluded ? ` · ${L("with operator", "مع عامل")}` : ""}
            </span>
            <span className="sub">{[room.details.location, periods ? `${periods} ${L("days", "يوم")}` : room.details.rentalType].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
        {/* phase pill (status label placement — §5.2) */}
        <span className="tb-phase">
          <span className="dot" />
          {closed ? L("Closed", "مغلق") : abandoned ? L("Cancelled", "ملغاة") : awaiting ? L("Awaiting confirmation", "بانتظار التأكيد") : L("Negotiating", "قيد التفاوض")}
        </span>
        <span className="tb-spacer" />
        {/* icon actions — documents + call */}
        <div className="tb-icons">
          <span className="tb-ic" role="button" tabIndex={0} title={L("Documents", "المستندات")} onClick={() => setShowDocs(true)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowDocs(true)}><span className="material-icons-outlined">description</span></span>
          {/* deal-room/negotiation (B5): the rentee gets the supplier's number from the start (server-gated).
              A single Call button opens a modal with the number — dial on touch, copy on desktop. */}
          {!room.supplier.phone
            ? <span className="tb-ic call locked" title={L("Number unavailable", "الرقم غير متاح")}><span className="material-icons-outlined">call</span></span>
            : <span className="tb-ic call" role="button" tabIndex={0} title={L("Call", "اتصال")} onClick={() => setCallOpen(true)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setCallOpen(true)}><span className="material-icons-outlined">call</span></span>}
        </div>
      </div>

      {/* price bar — prototype navy banner: centered hero price + end-side status/CTA cluster + breakdown popover */}
      <div className="price-bar">
        {/* status pill — pinned to the top corner (end: right in LTR, left in RTL) */}
        {closed ? (
          <span className="pb-status done"><span className="dot" />{L("Approved", "معتمد")}</span>
        ) : abandoned ? (
          <span className="pb-status" style={{ background: "var(--danger-bg)", borderColor: "rgba(217,54,42,.4)", color: "var(--danger)" }}><span className="dot" />{L("Cancelled", "ملغاة")}</span>
        ) : awaiting ? (
          <span className="pb-status wait"><span className="dot" />{L("Awaiting confirmation", "بانتظار التأكيد")}</span>
        ) : (
          <span className="pb-status"><span className="dot" />{L("Negotiating", "قيد التفاوض")}</span>
        )}

        {/* centered price + CTAs below */}
        <div className="pb-center">
          <div className={`pb-src${closed ? " done" : awaiting ? " wait" : ""}`}>
            <span className="dot" />
            {closed ? L("Agreed", "متفق عليه") : room.myTurn ? L("Supplier's counter", "عرض المورد المقابل") : L("Supplier's offer", "عرض المورد الافتتاحي")}
            {units > 1 ? ` · ${priceAll ? L("all units", "للكل") : L("per unit", "للوحدة")}` : ""}
          </div>
          <div className="pb-hero">
            <span className="n">{nf(priceAll ? rate * units : rate)}</span>
            <span className="u">{L("SAR", "ر.س")}/{periodLabel}</span>
          </div>
          <div className="pb-tools">
            {units > 1 && (
              <div className="pb-seg">
                <button className={priceAll ? "on" : ""} onClick={() => setPriceAll(true)}>{L("All", "للكل")} ({units})</button>
                <button className={!priceAll ? "on" : ""} onClick={() => setPriceAll(false)}>{L("Per unit", "للوحدة")}</button>
              </div>
            )}
            <button className={`pb-details${breakdown ? " open" : ""}`} onClick={() => setBreakdown((b) => !b)}>
              {L("Details", "التفاصيل")}<span className="material-icons-outlined">expand_more</span>
            </button>
          </div>
          {/* Turn cue (app parity): supplier countered → pulsing "New reply"; renter's opening move → "Your turn". */}
          {showAct && (supplierCountered || room.myTurn) && (
            <div className={`pb-turn${supplierCountered ? " alert" : ""}`}>{supplierCountered ? `🔔 ${L("New reply", "ردّ جديد")}` : `⚡ ${L("Your turn", "دورك")}`}</div>
          )}
          {/* CTAs — centered below the price */}
          {closed ? (
            <div className="pb-btns">
              <button className="pb-btn accept" disabled={quoteBusy} onClick={() => downloadQuotation("final")}><span className="material-icons-outlined">download</span>{L("Download quote", "تنزيل العرض")}</button>
              <button className="pb-btn ghost" onClick={() => setReleaseOpen(true)}><span className="material-icons-outlined">refresh</span>{L("Reopen", "إعادة فتح")}</button>
            </div>
          ) : abandoned ? null : awaiting ? (
            <div className="pb-btns">
              {/* deal-room/negotiation — withdraw the pending acceptance (AWAITING → NEGOTIATING). */}
              <button className="pb-btn ghost" disabled={withdrawing} onClick={doWithdraw}><span className="material-icons-outlined">undo</span>{withdrawing ? L("Withdrawing…", "جارٍ السحب…") : L("Withdraw", "سحب القبول")}</button>
            </div>
          ) : showAct ? (
            <div className="pb-btns">
              {/* App parity: Negotiate always available; Accept surfaces via allMatched (deadlock-break) even
                  when it'd otherwise be the supplier's turn, and stays gated until terms+price+units match. */}
              <button className={`pb-btn neg${supplierCountered ? " pulse" : ""}`} disabled={busy} onClick={() => openFlow("counter")}><span className="material-icons-outlined">swap_horiz</span>{L("Negotiate", "تفاوض")}</button>
              <button className="pb-btn accept" disabled={busy || !canAccept} onClick={() => openFlow("accept")}><span className="material-icons-outlined">check</span>{L("Accept", "قبول")}</button>
            </div>
          ) : null}
          {/* Pre-confirmation DRAFT of the quotation (app parity: the rentee's "معاينة" link). Built from
              the LIVE room, so it reflects negotiated units, excluded legs and term states — not just the
              price. Deliberately SECONDARY: whatever the state's real CTA is stays primary (Withdraw keeps
              precedence while AWAITING). Hidden once CLOSED (the signed download takes over) and for an
              abandoned room, which has no deal to quote. */}
          {!closed && !abandoned && (
            <div className="pb-draft-row">
              <button type="button" className="pb-draft" disabled={quoteBusy} onClick={() => downloadQuotation("draft")}>
                <span className="material-icons-outlined">description</span>
                {quoteBusy ? L("Preparing…", "جارٍ التجهيز…") : L("Preview quotation", "معاينة عرض السعر")}
              </button>
              {quoteErr && <span className="pb-draft-err">{quoteErr}</span>}
            </div>
          )}
        </div>

        {breakdown && (
          <>
            <div className="pb-bd-backdrop" onClick={() => setBreakdown(false)} />
          <div className="pb-breakdown">
            <div className="pb-brow"><span className="l">{L("Rental", "الإيجار")} ({rentalLabel}{units > 1 ? ` × ${units}` : ""})</span><span className="v">{nf(rentalTotal)}</span></div>
            {room.mobExcluded
              ? <div className="pb-brow"><span className="l">{L("Mobilization", "التعبئة — موب")}</span><span className="v ex">{L("Not included", "غير مشمول")}</span></div>
              : room.mobPrice ? <div className="pb-brow"><span className="l">{L("Mobilization", "التعبئة — موب")}{mobUnitsN > 1 ? ` (${nf(room.mobPrice)} × ${mobUnitsN})` : ""}</span><span className="v">{nf(mobTotal)}</span></div> : null}
            {room.demobExcluded
              ? <div className="pb-brow"><span className="l">{L("Return", "الإرجاع — ديموب")}</span><span className="v ex">{L("Not included", "غير مشمول")}</span></div>
              : room.demobPrice ? <div className="pb-brow"><span className="l">{L("Return", "الإرجاع — ديموب")}{demobUnitsN > 1 ? ` (${nf(room.demobPrice)} × ${demobUnitsN})` : ""}</span><span className="v">{nf(demobTotal)}</span></div> : null}
            <div className="pb-brow"><span className="l">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{nf(subtotal)}</span></div>
            <div className="pb-brow"><span className="l">{L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)")}</span><span className="v">{nf(vat)}</span></div>
            <div className="pb-brow tot"><span className="l">{L("Estimated total", "الإجمالي التقديري")}</span><span className="v">{nf(grand)} {L("SAR", "ر.س")}</span></div>
          </div>
          </>
        )}
      </div>

      {/* below-bar strips */}
      {showAct && !canAccept && (
        <div className="pb-strip"><span className="material-icons-outlined">error_outline</span>{acceptBlockMsg}</div>
      )}
      {abandoned && (
        <div className="pb-strip danger"><span className="material-icons-outlined">cancel</span>{L("This deal room has been cancelled", "تم إلغاء غرفة الصفقة هذه")}</div>
      )}

      {/* terms are negotiated inside the negotiation sheet (§6 step ②) — no standalone terms card here. */}

      {/* thread */}
      <div className="thread">
        {!STREAM_KEY ? (
          <div className="sysev">{L("Chat is unavailable.", "المحادثة غير متاحة.")}</div>
        ) : !chatReady ? (
          <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 22 }}>progress_activity</span></div>
        ) : messages.length === 0 ? (
          <div className="sysev">{L("No messages yet — say hello 👋", "لا رسائل بعد — ابدأ المحادثة 👋")}</div>
        ) : (
          messages.map((m) => {
            // deal-room/negotiation — the structured `custom` payload FIRST (DRCARD). This branch has to
            // precede the `system_bot` check below: all six negotiation card types are posted by
            // `system_bot`, so the early return used to swallow them into one grey pill, showing English
            // `text` in an Arabic chat and dropping a counter-offer's figures entirely.
            const card = chatCardOfMessage(m);
            if (card) {
              const view = buildChatCardView(card, {
                ar, L, terms: room.terms, at: m.created_at,
                responded: respondedIds.has(m.id),
                superseded: card.type === "rate_proposal" && lastProposalId !== null && lastProposalId !== m.id,
                live,
              });
              return (
                <ChatCard
                  key={m.id}
                  view={view}
                  ar={ar}
                  L={L}
                  busy={busy}
                  onAccept={() => openFlow("accept")}
                  onCounter={() => openFlow("counter")}
                  onTranslate={(m.text ?? "").trim() ? () => void translateMsg(m) : undefined}
                  translating={translating === m.id}
                  translation={translations[m.id]}
                />
              );
            }
            // deal-room/negotiation — system narration (posted by the backend's `system_bot`) renders as a
            // centered chip (prototype's role-tinted narration), NOT a left/right bubble. An UNKNOWN
            // `custom.type` lands here too: a card type added later degrades to this pill rather than
            // vanishing from the conversation.
            if (m.user?.id === "system_bot") {
              return (
                <div className="sysev" key={m.id}>
                  <span className="material-icons-outlined">bolt</span>
                  <span>{m.text}</span>
                </div>
              );
            }
            const mine = m.user?.id === myStreamId;
            const custom = m.custom ?? {};
            const lat = Number(custom.lat), lng = Number(custom.lng);
            const isLocation = custom.kind === "location" && Number.isFinite(lat) && Number.isFinite(lng);
            const shownText = translations[m.id] ?? m.text;
            const canTranslate = !mine && !isLocation && !!(m.text ?? "").trim();
            // Attachments are open to both parties at ANY status. A file the counterparty deliberately
            // sent in chat is the recipient's to keep — a renter has to be able to save a quotation while
            // they're deciding on it, which is precisely when the room is NOT closed. The old lock (open
            // only once `closed`, app parity with mobile's isDownloadEnabled) was never protection either:
            // images were viewable inline the whole time, so it only added friction.
            const attName = (a: StreamAttachment) => a.title || (a.type === "image" ? L("Photo", "صورة") : a.type === "audio" || (a.mime_type || "").startsWith("audio/") ? L("Voice note", "ملاحظة صوتية") : L("Attachment", "مرفق"));
            return (
              <div className={`msg ${mine ? "mine" : "them"}`} key={m.id}>
                {isLocation ? (
                  <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="msg-att-file msg-loc">
                    <span className="material-icons-outlined">place</span>
                    <span className="msg-att-name">{(shownText && String(shownText).trim()) || L("Shared location", "موقع مشترك")}</span>
                  </a>
                ) : shownText}
                {m.attachments?.map((a, i) => {
                  // The element itself OPENS the attachment (image fullsize, PDF in the browser's viewer,
                  // voice note inline). Saving is a separate, explicit action beside it — opening a file
                  // is not keeping it, and the anchor alone gave no way to keep it.
                  const src = a.asset_url || a.image_url || a.thumb_url || "";
                  return (
                    <Fragment key={i}>
                      {a.type === "image" ? (
                        <a href={a.image_url || a.thumb_url} target="_blank" rel="noopener noreferrer" className="msg-att-img">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.thumb_url || a.image_url} alt={a.fallback || ""} />
                        </a>
                      ) : a.type === "audio" || (a.mime_type || "").startsWith("audio/") ? (
                        <audio controls preload="none" src={a.asset_url} className="msg-att-audio" style={{ display: "block", maxWidth: "100%", marginTop: 6 }} />
                      ) : (
                        <a href={a.asset_url} target="_blank" rel="noopener noreferrer" className="msg-att-file">
                          <span className="material-icons-outlined">{(a.mime_type || "").includes("pdf") ? "picture_as_pdf" : "insert_drive_file"}</span>
                          <span className="msg-att-name">{attName(a)}</span>
                        </a>
                      )}
                      {src && (
                        <button type="button" className="msg-att-dl" onClick={() => void saveAttachment(src, attFilename(a))}>
                          <span className="material-icons-outlined">download</span>
                          {L("Save", "حفظ")}
                        </button>
                      )}
                    </Fragment>
                  );
                })}
                {canTranslate && (
                  <button type="button" className="msg-tr" disabled={translating === m.id} onClick={() => void translateMsg(m)}>
                    {translating === m.id ? L("Translating…", "جارٍ الترجمة…") : translations[m.id] ? L("Show original", "النص الأصلي") : L("Translate", "ترجمة")}
                  </button>
                )}
                <div className="meta">{m.created_at ? new Date(m.created_at as string).toLocaleTimeString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      {closed ? (
        <div className="composer ro quote-bar">
          <button type="button" className="dl-quote" onClick={() => downloadQuotation("final")} disabled={quoteBusy}>
            <span className="material-icons-outlined">{quoteBusy ? "hourglass_top" : "download"}</span>
            {quoteBusy ? L("Preparing quotation…", "يتم تجهيز عرض السعر…") : L("Download quotation", "تنزيل عرض السعر")}
          </button>
          <button type="button" className="dl-quote reopen" onClick={() => { setReleaseErr(null); setReleaseOpen(true); }} disabled={releasing}>
            <span className="material-icons-outlined">lock_open</span>
            {L("Reopen negotiation", "إعادة فتح التفاوض")}
          </button>
          {quoteErr && <span className="ro-note quote-err">{quoteErr}</span>}
        </div>
      ) : abandoned ? (
        <div className="composer ro"><span className="ro-note">{L("Deal room has been cancelled", "تم إلغاء غرفة الصفقة")}</span></div>
      ) : (
        <div className="composer">
          {!voiceRecording && (
            <>
              <button type="button" className="ib" disabled={!chatReady || uploading} onClick={() => fileInputRef.current?.click()} aria-label={L("Attach a file", "إرفاق ملف")}>
                <span className="material-icons-outlined">{uploading ? "hourglass_top" : "attach_file"}</span>
              </button>
              <input ref={fileInputRef} type="file" accept={CHAT_ACCEPT} hidden onChange={(e) => { void sendFiles(e.target.files); e.target.value = ""; }} />
            </>
          )}
          <VoiceRecorder
            disabled={!chatReady || uploading}
            ar={ar}
            L={L}
            maxBytes={CHAT_MAX_MEDIA}
            onRecordingChange={setVoiceRecording}
            onRecorded={(f) => void sendVoiceNote(f)}
            onError={setFileErr}
          />
          {!voiceRecording && (
            <>
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={!chatReady} placeholder={L("Type a message…", "اكتب رسالة…")} />
              <span className="ib send" onClick={send}><span className="material-icons-outlined">send</span></span>
            </>
          )}
          {fileErr && <span className="ro-note quote-err">{fileErr}</span>}
        </div>
      )}

      {flowMode && (
        <CounterFlow
          mode={flowMode}
          room={room}
          ar={ar}
          L={L}
          busy={busy}
          error={counterErr}
          resolutions={resolutions}
          onResolveLocal={setResolution}
          onReopenLocal={clearResolution}
          unresolvedCount={unresolvedDisputed.length}
          periodLabel={periodLabel}
          periods={periods}
          hasDuration={hasDuration}
          units={units}
          messages={messages}
          onClose={() => !busy && setFlowMode(null)}
          onCounter={submitCounter}
          onAccept={doAccept}
        />
      )}

      {releaseOpen && (
        <div className="dl-modal" dir={ar ? "rtl" : "ltr"} onClick={() => !releasing && setReleaseOpen(false)}>
          <div className="dl-modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="dl-modal-head">
              <span className="dl-modal-ic warn"><span className="material-icons-outlined">lock_open</span></span>
              <div className="dl-modal-tt"><div className="dl-modal-title">{L("Reopen this deal?", "إعادة فتح هذه الصفقة؟")}</div></div>
              <button className="dl-modal-x" disabled={releasing} onClick={() => setReleaseOpen(false)} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
            </div>
            <div className="dl-modal-body">
              <p className="dl-modal-msg">
                {L("This reopens negotiation with the supplier — the accepted deal returns to negotiating and the terms/price can change again. A new quotation is issued once you re-confirm.", "يعيد هذا فتح التفاوض مع المؤجّر — تعود الصفقة المقبولة إلى التفاوض ويمكن تغيير الشروط والسعر. يصدر عرض سعر جديد بعد إعادة التأكيد.")}
              </p>
              {releaseErr && <p className="dl-err">{releaseErr}</p>}
            </div>
            <div className="dl-modal-foot">
              <button className="dl-mbtn" disabled={releasing} onClick={() => setReleaseOpen(false)}>{L("Cancel", "إلغاء")}</button>
              <button className="dl-mbtn warn" disabled={releasing} onClick={() => void doRelease()}>{releasing ? L("Reopening…", "جارٍ إعادة الفتح…") : L("Reopen", "إعادة الفتح")}</button>
            </div>
          </div>
        </div>
      )}

      {showDocs && <DocumentsModal id={id} ar={ar} L={L} supplierName={room.supplier.name} onClose={() => setShowDocs(false)} />}

      {callOpen && room.supplier.phone && (
        <CallModal ar={ar} L={L} phone={room.supplier.phone} name={room.supplier.name} canCall={canCall} onClose={() => setCallOpen(false)} />
      )}
    </div>
  );
}

/** Call-supplier modal: shows the number, dials it (tel:) on a touch device, and copies it anywhere. */
function CallModal({ ar, L, phone, name, canCall, onClose }: { ar: boolean; L: (en: string, arr: string) => string; phone: string; name: string; canCall: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(phone); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  return (
    <div dir={ar ? "rtl" : "ltr"} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(16,38,63,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px rgba(16,38,63,.35)", padding: "26px 22px 22px", textAlign: "center" }}>
        <span style={{ display: "inline-flex", width: 56, height: 56, borderRadius: "50%", background: "#e7f7ee", color: "#1daf58", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <span className="material-icons-outlined" style={{ fontSize: 28 }}>call</span>
        </span>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "#1c3550", margin: 0 }}>{L("Call supplier", "الاتصال بالمؤجّر")}</h3>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#6b8fa8", margin: "4px 0 16px" }}>{name}</p>
        <div style={{ direction: "ltr", unicodeBidi: "plaintext", fontSize: 22, fontWeight: 900, color: "#1c3550", letterSpacing: 0.5, userSelect: "all", marginBottom: 18 }}>{phone}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {canCall && (
            <a href={`tel:${phone}`} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px", borderRadius: 13, border: "none", background: "#1daf58", color: "#fff", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>call</span>{L("Call", "اتصال")}
            </a>
          )}
          <button onClick={copy} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px", borderRadius: 13, border: "1.5px solid #d4e0ec", background: "#fff", color: "#1c3550", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>{copied ? "check" : "content_copy"}</span>{copied ? L("Copied", "تم النسخ") : L("Copy number", "نسخ الرقم")}
          </button>
        </div>
        <button onClick={onClose} style={{ marginTop: 12, width: "100%", padding: "11px", borderRadius: 13, border: "none", background: "#eff4f9", color: "#6b8fa8", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>{L("Close", "إغلاق")}</button>
      </div>
    </div>
  );
}

/**
 * Documents sheet — mirrors the app's deal-room documents sheet. The backend returns the OTHER
 * party's documents only (for the renter: the supplier's company + equipment docs). Each doc opens
 * its backend-presigned URL (pdf/image) in a new tab.
 */
function DocumentsModal({ id, ar, L, supplierName, onClose }: { id: string; ar: boolean; L: (en: string, arr: string) => string; supplierName: string; onClose: () => void }) {
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

/** "Supplier's documents" titled with the supplier name, matching the app's docsSheetTitle. */
function fmtDocsTitle(L: (en: string, arr: string) => string, supplierName: string): string {
  const name = supplierName || L("the supplier", "المؤجّر");
  return L(`${name}’s documents`, `مستندات ${name}`);
}

/**
 * Guided counter/accept flow — app parity (counter_offer_flow_sheet + accept flow). One 3-step modal
 * (Terms → Price → Summary) drives BOTH modes:
 *  · Step 1 Terms — reuses `DealRoomTerms` so the renter resolves each differing term LOCALLY
 *    (accept / keep-mine / counter). Next is gated until nothing is left unresolved (the app's
 *    "resolve all first" rule; the backend's accept-all-terms 409s otherwise).
 *  · Step 2 Price — line items (daily rate / mobilization / return) with a live estimated total. In
 *    ACCEPT mode these are read-only (you're accepting the standing offer); in COUNTER mode editable.
 *  · Step 3 Summary — the composed offer + (accept only) a contract-type selector, plus an
 *    acknowledgment. The CTA morphs: "Send counter offer" vs "Accept offer".
 * Accept is preceded by a binding-commitment warning. Nothing is submitted until the final CTA — the
 * parent's `submitCounter`/`doAccept` do the batched term + rate/accept-all call.
 */
function CounterFlow({
  mode, room, ar, L, busy, error,
  resolutions, onResolveLocal, onReopenLocal, unresolvedCount,
  periodLabel, periods, hasDuration, units, messages, onClose, onCounter, onAccept,
}: {
  mode: "counter" | "accept";
  room: DealRoomView;
  ar: boolean;
  L: LFn;
  busy: boolean;
  error: string | null;
  resolutions: ResolutionsMap;
  onResolveLocal: (key: string, action: "accept" | "counter", value?: unknown) => void;
  onReopenLocal: (key: string) => void;
  unresolvedCount: number;
  periodLabel: string;
  periods: number;
  hasDuration: boolean;
  units: number;
  messages: ChatMsg[];
  onClose: () => void;
  onCounter: (next: {
    rate: number; mobPrice?: number; demobPrice?: number;
    rentalUnits?: number; mobUnits?: number; demobUnits?: number; mobExcluded?: boolean; demobExcluded?: boolean;
  }) => void;
  onAccept: (contractType: string) => void;
}) {
  const editable = mode === "counter";
  // Reconstructed negotiation history (app parity) — the LIVE position is read off this, not just the
  // room columns, so a supplier's unit counter is RECEIVED here (app resolveLivePosition). Also drives
  // the round number, the "Supplier: N units" references, and the supplier-total on the compare card.
  const flowRounds = withOpeningRound(collapseRounds(reconstructRounds(messages as unknown[])), roomOpeningRound(room));
  const latestRound = flowRounds.length ? flowRounds[flowRounds.length - 1] : null;
  const supRound = latestRoundBy(flowRounds, "supplier");
  // Accept is gated behind a binding-commitment warning first (app parity). Counter skips it.
  const [bindingOk, setBindingOk] = useState(mode === "counter");
  const [page, setPage] = useState(0); // 0 = Terms, 1 = Price, 2 = Summary
  // Price seeds from the LIVE position too (app resolveLivePosition: latest?.rate ?? room.lastProposedRate
  // ?? bid.priceAmount). room.rate already collapses lastProposedRate → bid.priceAmount, so preferring the
  // latest reconstructed round first guards against any lag between the DB column and the chat message.
  const seedRate = latestRound?.rate ?? room.rate;
  const seedMob = latestRound?.mobPrice ?? room.mobPrice;
  const seedDemob = latestRound?.demobPrice ?? room.demobPrice;
  const [rateStr, setRateStr] = useState(seedRate ? String(seedRate) : "");
  const [mobStr, setMobStr] = useState(seedMob ? String(seedMob) : "");
  const [demobStr, setDemobStr] = useState(seedDemob ? String(seedDemob) : "");
  const [contractType, setContractType] = useState(room.contractType ?? "formal");
  const [ack, setAck] = useState(false);

  // deal-room/negotiation — per-type unit counts (cap = requested; mob/demob ≤ rental) + leg exclusion.
  // Seed from the LIVE position (app resolveLivePosition precedence: latest reconstructed round → room
  // columns → offered/requested → clamp) so the supplier's countered units land on the rentee side.
  const cap = Math.max(1, room.requestedUnits || units || 1);
  const liveRental = Math.max(1, Math.min(cap, latestRound?.rentalUnits ?? room.agreedUnits ?? units ?? 1));
  const liveMob = Math.max(0, Math.min(liveRental, latestRound?.mobUnits ?? room.mobUnits ?? liveRental));
  const liveDemob = Math.max(0, Math.min(liveRental, latestRound?.demobUnits ?? room.demobUnits ?? liveRental));
  const [rentalUnits, setRentalUnits] = useState<number>(liveRental);
  const [mobUnitsN, setMobUnitsN] = useState<number>(liveMob);
  const [demobUnitsN, setDemobUnitsN] = useState<number>(liveDemob);
  const [mobExcluded, setMobExcluded] = useState<boolean>(latestRound?.mobExcluded ?? room.mobExcluded);
  const [demobExcluded, setDemobExcluded] = useState<boolean>(latestRound?.demobExcluded ?? room.demobExcluded);
  const [cmpOpen, setCmpOpen] = useState(false); // compare-card per-line breakdown toggle
  // Confirm before a leg (delivery/return) is excluded from the offer — reversible, but the app confirms.
  const [pendingEx, setPendingEx] = useState<null | { title: string; onYes: () => void }>(null);
  // Quotation-paper UI-only state (spec §6): collapsible دليل البنود categories + the السجل log modal.
  const [guideOpen, setGuideOpen] = useState<Record<string, boolean>>({});
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<"all" | "price" | "terms">("all");
  const [paperZoom, setPaperZoom] = useState(0.85); // desk paper zoom (§6 oldWrap): 50%–180%

  const num = (s: string) => { const n = Number(s); return s.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : 0; };
  const rate = editable ? num(rateStr) : (room.rate ?? 0);
  const mob = editable ? num(mobStr) : (room.mobPrice ?? 0);
  const demob = editable ? num(demobStr) : (room.demobPrice ?? 0);
  const rateValid = rate > 0;

  // The counter-offer editor recomputes locally (the rate + unit counts are being edited, so it can't
  // read `computeDealTotals`' snapshot) — but it must recompute the SAME WAY, through the shared module.
  // It previously carried its own divisor table with a SEVEN-day week and no Friday exclusion, so a
  // counter-offer at an unchanged rate showed a different total from the price bar right above it.
  const rNU = editable ? rentalUnits : (room.agreedUnits ?? units);
  const mNU = Math.min(editable ? mobUnitsN : (room.mobUnits ?? rNU), rNU);
  const dNU = Math.min(editable ? demobUnitsN : (room.demobUnits ?? rNU), rNU);
  const mEx = editable ? mobExcluded : room.mobExcluded;
  const dEx = editable ? demobExcluded : room.demobExcluded;
  // Same date the price bar prorates against. It lives on `details`, NOT at the top of the room — a
  // `room.startDate` here type-checks under a loose signature and silently evaluates to undefined,
  // which turns proration off and shows the raw rate.
  const startDate = room.details?.startDate ?? null;
  // `periods` arrives as one full period when the room has no duration, so it must NOT be handed to the
  // module as a window — that would strike out Fridays nobody booked and undercut the rate the renter
  // typed. Open deals price at the bare rate, exactly as the app's open-deal branch does.
  const rentalCalc = hasDuration
    ? computeRentalTotal({ rate, priceUnit: room.priceUnit, startDate, durationDays: periods })
    : { total: rate, billable: 0, raw: true, exact: true };
  const perUnitRental = rentalCalc.total;
  // The paper states the days the rate is actually charged across, not the calendar duration — the same
  // number the bid card puts on its rental row, and the one `perUnitRental` above was built from.
  const rentalDivisorNote = divisorNote(room.priceUnit, L);
  const lines = computeQuoteTotals({
    perUnitRental,
    rentalUnits: rNU,
    mob: { amount: mob, units: mNU, excluded: mEx },
    demob: { amount: demob, units: dNU, excluded: dEx },
  });
  const rentalLine = lines.overall.rental;
  const mobLine = lines.overall.mob;
  const demobLine = lines.overall.demob;
  const subtotal = lines.overall.subtotal;
  const vat = Math.round(lines.overall.vat);
  const total = subtotal + vat;

  // العدد stepper — symmetric, capped. Rental caps at requested; mob/demob cap at the current rental.
  const Stepper = ({ value, min, max, onChange, disabled }: { value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) => {
    const btn = (d: number, lbl: string, off: boolean) => (
      <button type="button" disabled={disabled || off} onClick={() => onChange(Math.max(min, Math.min(max, value + d)))}
        className="grid h-[26px] w-[26px] place-items-center rounded-[8px] border text-[16px] font-extrabold disabled:opacity-40"
        style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)", background: "var(--surface1,#fff)" }}>{lbl}</button>
    );
    return (
      <span className="inline-flex items-center gap-1.5">
        {btn(-1, "−", value <= min)}
        <span className="min-w-[20px] text-center text-[14px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>{value}</span>
        {btn(1, "+", value >= max)}
      </span>
    );
  };
  const sar = L("SAR", "ر.س");
  const money = (v: number) => `${nf(v)} ${sar}`;

  const CONTRACT_TYPES: { value: string; label: string }[] = [
    { value: "formal", label: L("Formal contract", "عقد رسمي") },
    { value: "simple", label: L("Simple agreement", "اتفاق مبسّط") },
    { value: "platform", label: L("Platform terms", "شروط المنصّة") },
    { value: "direct", label: L("Direct", "مباشر") },
    { value: "none", label: L("No contract", "بدون عقد") },
  ];

  // Binding-commitment warning before the accept flow.
  if (!bindingOk) {
    return (
      <div className="dl-modal" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
        <div className="dl-modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
          <div className="dl-modal-head">
            <span className="dl-modal-ic danger"><span className="material-icons-outlined">gavel</span></span>
            <div className="dl-modal-tt"><div className="dl-modal-title">{L("This is a binding commitment", "هذا التزام مُلزِم")}</div></div>
            <button className="dl-modal-x" onClick={onClose} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
          </div>
          <div className="dl-modal-body center">
            <p className="dl-modal-msg">
              {L("Accepting confirms the agreed rate and terms with the supplier for final confirmation. Please review the terms and price before you continue.", "القبول يؤكّد السعر والشروط المتفق عليها مع المؤجّر للتأكيد النهائي. يُرجى مراجعة الشروط والسعر قبل المتابعة.")}
            </p>
            <label className="dl-modal-ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              {L("I understand this is binding", "أفهم أن هذا مُلزِم")}
            </label>
          </div>
          <div className="dl-modal-foot">
            <button className="dl-mbtn" onClick={onClose}>{L("Cancel", "إلغاء")}</button>
            <button className="dl-mbtn green" disabled={!ack} onClick={() => { setAck(false); setBindingOk(true); }}>{L("Continue", "متابعة")}</button>
          </div>
        </div>
      </div>
    );
  }

  // Pages reordered to spec §6: 0 = السعر (price), 1 = الشروط (terms), 2 = المراجعة (review).
  const canNext = page === 0 ? (editable ? rateValid : true) : page === 1 ? unresolvedCount === 0 : true;
  const canSubmit = editable ? rateValid : ack;
  const allMatched = unresolvedCount === 0;
  const doSubmit = () =>
    editable
      ? onCounter({ rate, mobPrice: mob || undefined, demobPrice: demob || undefined, rentalUnits, mobUnits: Math.min(mobUnitsN, rentalUnits), demobUnits: Math.min(demobUnitsN, rentalUnits), mobExcluded, demobExcluded })
      : onAccept(contractType);

  // ── quotation-paper helpers (classic terms table + payment card + دليل البنود) ──
  const PAY_KEYS = new Set(["payment_terms", "payment_method"]);
  const payTerms = room.terms.filter((t) => PAY_KEYS.has(t.key));
  const operatingTerms = room.terms.filter((t) => !PAY_KEYS.has(t.key));
  const supStr = (t: DealTerm) => (t.supplierDeclared != null ? String(t.supplierDeclared) : null);
  type Dec = { badge: "match" | "conflict" | "none" | "locked"; chosen: unknown; server: boolean };
  const decide = (t: DealTerm): Dec => {
    if (t.state === "fixed") return { badge: "locked", chosen: t.value ?? t.platformDefault, server: true };
    if (t.state === "agreed" || t.state === "soft_accepted") return { badge: "match", chosen: t.value ?? t.supplierDeclared ?? t.renteePreference, server: true };
    const r = resolutions[t.key];
    if (!r) return { badge: "none", chosen: null, server: false };
    if (r.action === "accept") return { badge: "match", chosen: t.supplierDeclared, server: false };
    const cv = r.value != null ? String(r.value) : null;
    return { badge: cv != null && cv === supStr(t) ? "match" : "conflict", chosen: r.value, server: false };
  };
  const choicesFor = (t: DealTerm): { value: string; label: string }[] => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    const push = (v: unknown, label?: string) => {
      if (v == null || v === "") return;
      const val = String(v);
      if (seen.has(val)) return;
      seen.add(val);
      out.push({ value: val, label: label ?? valText(v, L) });
    };
    push(t.supplierDeclared);
    for (const o of t.options) push(o.value, ar ? o.labelAr : o.labelEn);
    push(t.renteePreference);
    return out;
  };
  const pickTerm = (t: DealTerm, val: string) => {
    if (val === "__none") { onReopenLocal(t.key); return; }
    if (supStr(t) != null && val === supStr(t)) onResolveLocal(t.key, "accept");
    else onResolveLocal(t.key, "counter", val);
  };
  const chosenSel = (t: DealTerm): string => { const c = decide(t).chosen; return c != null ? String(c) : "__none"; };
  const catOf = (k: string): string => {
    if (/^operator|^fat|nationality|night_shift/.test(k)) return L("Operator", "المشغّل");
    if (/fuel|maintenance|breakdown|equipment|saso|attachment/.test(k)) return L("Equipment", "المعدّة");
    if (/overtime|working|crosshire|local_content|shift/.test(k)) return L("Work", "العمل");
    return L("Other", "أخرى");
  };
  const badgeLabel = (b: Dec["badge"]) => (b === "match" ? L("Match", "مطابق") : b === "conflict" ? L("Differs", "يختلف") : b === "locked" ? L("Fixed", "مثبّت") : L("Not set", "لم تحدّد"));
  const isSettled = (b: Dec["badge"]) => b === "match" || b === "locked";
  const groupByCat = (list: DealTerm[]): [string, DealTerm[]][] => {
    const m = new Map<string, DealTerm[]>();
    for (const t of list) { const c = catOf(t.key); const g = m.get(c) ?? []; g.push(t); m.set(c, g); }
    return [...m];
  };

  // Supplier's standing offer (compare card) — from the SUPPLIER's latest reconstructed round (their real
  // offer INCL. their unit counts + leg exclusion), via the shared ÷26/÷7 + VAT math; falls back to the
  // room's on-table numbers when no supplier round exists. This is why a supplier unit counter now moves it.
  const supDeal = supRound ? roundTotals(room, supRound) : computeDealTotals(room);
  const supTotal = supDeal.grand;
  // "Supplier: {price}" references — read the supplier's own round (app parity: otherSide.rate/mobPrice/
  // demobPrice), falling back to the room columns, exactly like the "Supplier: N units" refs beside them.
  const refRate = supRound?.rate ?? room.rate;
  const refMobPrice = supRound?.mobPrice ?? room.mobPrice;
  const refDemobPrice = supRound?.demobPrice ?? room.demobPrice;
  const showCompare = editable && room.lastCounterBy === "supplier";
  const priceDiff = Math.abs(total - supTotal);

  const STEPS = [L("Price", "السعر"), L("Terms", "الشروط"), L("Review", "المراجعة")];
  const sheetTitle = `${room.details.equipmentLabel ?? L("Equipment", "المعدّة")}${rNU > 1 ? ` — ${rNU} ${L("units", "وحدات")}` : ""}`;
  const roomCode = room.shortCode ?? "";
  // Round number in the header + the Log list — from the history reconstructed at the top of the flow.
  const roundNo = flowRounds.length + 1;
  const today = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const changedFrom = (cur: number, ref: number | null) => ref != null && Math.round(cur) !== Math.round(ref);

  // Quotation head (reused on the price + review papers). CR/VAT + a formal quotation number aren't in
  // the deal-room payload, so we show the company + location + the room short code (no fabricated ids).
  const qhead = () => (
    <div className="qp-qhead">
      <div className="qp-qco">
        <div className="qp-qlogo">{room.supplier.name.charAt(0).toUpperCase()}</div>
        <div className="qp-qcoinfo">
          <b>{room.supplier.name}</b>
          {room.details.location && <span className="ln">{room.details.location}</span>}
        </div>
      </div>
      <div className="qp-qno" dir="ltr">
        <div className="lbl">{L("QUOTATION №", "عرض سعر رقم")}</div>
        <div className="num">{roomCode || "—"}</div>
        <div className="sub">{L("Issued", "التاريخ")} {today}</div>
      </div>
    </div>
  );

  // Editable price → the prototype's green "عدّل" box (green tint + inner edit icon).
  const priceBox = (val: string, onChange: (s: string) => void) => (
    <span className="qp-pricebox"><span className="material-icons-outlined ic">edit</span><input type="number" inputMode="numeric" min={0} value={val} onChange={(e) => onChange(e.target.value)} className="qp-price-in" placeholder="0" /></span>
  );

  // A price-table leg row (mob/demob): red ✕ exclude + trip stepper + green price box + المورد ref.
  const legTr = (label: string, sub: string, priceStr: string, setPrice: (s: string) => void, u: number, setU: (v: number) => void, ex: boolean, setEx: (b: boolean) => void, refPrice: number | null, refUnits: number | null, exTitle: string) => {
    const line = ex ? 0 : num(priceStr) * Math.min(u, rentalUnits);
    return (
      <tr className={ex ? "ex" : undefined}>
        <td>
          <div className="qp-itemcell">
            {editable && !ex && <button type="button" className="qp-legx" title={L("Exclude", "استبعاد")} onClick={() => setPendingEx({ title: exTitle, onYes: () => setEx(true) })}>✕</button>}
            <div>
              <div className="lbl">{label}</div>
              <div className="sub">{sub}</div>
              {editable && ex && <button type="button" className="qp-legbtn restore" onClick={() => setEx(false)}>+ {L("Restore", "استعادة")}</button>}
            </div>
          </div>
        </td>
        <td className="mut">{L("Trip", "رحلة")}</td>
        <td>{ex ? "—" : <div className="qp-qty">{editable && <span className="hint">{L("Your choice", "خيارك")}</span>}{editable ? <Stepper value={Math.min(u, rentalUnits)} min={0} max={rentalUnits} onChange={setU} /> : <b>{Math.min(u, rentalUnits)}</b>}{editable && refUnits != null && <div className={`qp-ref${changedFrom(Math.min(u, rentalUnits), refUnits) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {refUnits} {L("units", "وحدة")}</div>}</div>}</td>
        <td>
          {ex ? <span className="qp-excluded">{L("Excluded", "مستبعد")}</span>
            : editable ? <>{priceBox(priceStr, setPrice)}{refPrice != null && <div className={`qp-ref${changedFrom(num(priceStr), refPrice) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {nf(refPrice)}</div>}</>
            : <b className="tot">{money(num(priceStr))}</b>}
        </td>
        <td><b className="tot">{ex ? L("Not incl.", "غير مشمول") : money(line)}</b></td>
      </tr>
    );
  };

  // One row of the compare-card per-line breakdown (app _DeltaTable parity): your PER-UNIT price vs the
  // supplier's per-unit price (rate / mobPrice / demobPrice) + the per-line difference. Units are shown
  // separately in the qty steppers' "Supplier: N units" refs (app splits price vs count the same way).
  // Excluded legs read "Not included".
  const cmpRow = (label: string, mine: number, myEx: boolean, theirs: number, theirEx: boolean) => {
    const bothEx = myEx && theirEx;
    const oneEx = myEx !== theirEx;
    const eq = Math.round(mine) === Math.round(theirs);
    const noDiff = bothEx || (!oneEx && eq); // no meaningful per-unit difference to show
    return (
      <tr>
        <td className="ln">{label}</td>
        <td>{myEx ? <span className="na">{L("Not incl.", "غير مشمول")}</span> : nf(mine)}</td>
        <td>{theirEx ? <span className="na">{L("Not incl.", "غير مشمول")}</span> : nf(theirs)}</td>
        <td className={noDiff ? "na" : "gap"}>{bothEx ? "—" : oneEx ? "±" : eq ? "—" : nf(Math.abs(mine - theirs))}</td>
      </tr>
    );
  };

  return (
    <div className="qp-scrim" dir={ar ? "rtl" : "ltr"} onClick={() => !busy && onClose()}>
      <div className="qp-sheet qp-full" onClick={(e) => e.stopPropagation()}>
        {/* two-row header */}
        <div className="qp-head">
          <div className="qp-head-r1">
            <div className="qp-htitle">
              <div className="t">{sheetTitle}</div>
              <div className="s">{L("Negotiation room", "غرفة التفاوض")}{roomCode ? ` · ${roomCode}` : ""} · {L(`Round ${roundNo}`, `الجولة ${roundNo}`)}</div>
            </div>
            <div className="qp-htotal"><div className="k">{L("Your offer", "إجمالي عرضك")}</div><div className="v">{nf(total)} {sar}</div></div>
            <button className="qp-x" onClick={() => !busy && onClose()} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
          </div>
          <div className="qp-steps">
            {STEPS.map((s, i) => (
              <Fragment key={i}>
                {i > 0 && <span className={`bar${i <= page ? " done" : ""}`} />}
                <span className={`qp-step${i === page ? " on" : i < page ? " done" : ""}`}>
                  <span className="badge">{i < page ? "✓" : i + 1}</span>
                  <span className="lbl">{s}</span>
                </span>
              </Fragment>
            ))}
          </div>
        </div>

        {/* body — full-screen grey desk holding the zoomable white paper (§6 oldWrap) */}
        <div className="qp-desk">
          <div className="qp-deskpad">
          {/* ① السعر — quotation paper */}
          {page === 0 && (
            <div className="qp-paper" style={{ zoom: String(paperZoom) }}>
              {showCompare && (
                <div className="qp-compare">
                  <div className="duo">
                    <div className="side sup"><div className="k">{L("Supplier's offer", "عرض المورد")}</div><div className="v">{nf(supTotal)}</div></div>
                    <div className="side me"><div className="k">{L("Your offer", "عرضك")}</div><div className="v">{nf(total)}</div></div>
                  </div>
                  <div className="conv"><span className="track" /><span className={`chip${priceDiff === 0 ? " ok" : ""}`}>{priceDiff === 0 ? L("Match ✓", "تطابق ✓") : `${L("Gap", "الفرق")} ${nf(priceDiff)}`}</span><span className="track" /></div>
                  <button type="button" className="qp-cmp-toggle" onClick={() => setCmpOpen((o) => !o)} aria-expanded={cmpOpen}>
                    <span>{cmpOpen ? L("Hide breakdown", "إخفاء التفاصيل") : L("Show breakdown", "عرض التفاصيل")}</span>
                    <span className="material-icons-outlined">{cmpOpen ? "expand_less" : "expand_more"}</span>
                  </button>
                  {cmpOpen && (
                    <div className="qp-scrollx"><table className="qp-cmp-tbl">
                      <thead><tr><th>{L("Per-unit rate", "السعر لكل وحدة")}</th><th>{L("Yours", "عرضك")}</th><th>{L("Supplier", "المورد")}</th><th>{L("Difference", "الفرق")}</th></tr></thead>
                      <tbody>
                        {cmpRow(L("Base rental", "الإيجار الأساسي"), rate, false, supDeal.rate, false)}
                        {cmpRow(L("Mobilization", "التعبئة"), mob, mEx, supDeal.mobPrice, supDeal.mobExcluded)}
                        {cmpRow(L("Return — demob", "الإرجاع"), demob, dEx, supDeal.demobPrice, supDeal.demobExcluded)}
                      </tbody>
                    </table></div>
                  )}
                </div>
              )}
              {qhead()}
              <div className="qp-sech">{L("Price quotation", "عرض السعر")}</div>
              <div className="qp-scrollx"><table className="qp-table">
                <thead><tr><th>{L("Item", "البند")}</th><th>{L("Duration", "المدة")}</th><th>{L("Qty", "العدد")}</th><th>{L("Price", "السعر")}</th><th>{L("Total", "الإجمالي")}</th></tr></thead>
                <tbody>
                  <tr>
                    <td><div className="lbl">{L("Base rental", "الإيجار الأساسي")}</div><div className="sub">{room.details.equipmentLabel ?? periodLabel}</div></td>
                    {/* Billable days, not the calendar duration — the rate below is charged across THESE,
                        exactly as the bid card's rental row states it. The calendar span stays underneath
                        so the renter can see where the number came from. */}
                    <td className="mut">
                      {hasDuration && !rentalCalc.raw ? (
                        <>
                          <div>{rentalCalc.billable} {L("days", "يوم")}</div>
                          <div className="sub">{periods} {L("days, Fridays excluded", "يوم، باستثناء الجمعة")}</div>
                        </>
                      ) : hasDuration ? `${periods} ${L("days", "يوم")}` : "—"}
                    </td>
                    <td><div className="qp-qty">{editable && <span className="hint">{L("Your choice", "خيارك")}</span>}{editable ? <Stepper value={rentalUnits} min={1} max={cap} onChange={(v) => { setRentalUnits(v); setMobUnitsN((u) => Math.min(u, v)); setDemobUnitsN((u) => Math.min(u, v)); }} /> : <b>{rNU}</b>}<span className="qp-qmatch">✓ {L("Qty", "العدد")} {rNU}</span>{editable && supRound?.rentalUnits != null && <div className={`qp-ref${changedFrom(rentalUnits, supRound.rentalUnits) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {supRound.rentalUnits} {L("units", "وحدة")}</div>}</div></td>
                    <td>
                      {editable ? <>{priceBox(rateStr, setRateStr)}{refRate != null && <div className={`qp-ref${changedFrom(rate, refRate) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {nf(refRate)}</div>}</> : <b className="tot">{money(rate)}</b>}
                      {/* The rate is per PERIOD, and the divisor is what turns it into the day count in the
                          Duration column. Both stated the way the bid card states them. */}
                      <div className="sub">/ {periodLabel}{rentalDivisorNote ? ` · ${rentalDivisorNote}` : ""}</div>
                    </td>
                    <td><b className="tot">{money(rentalLine)}</b></td>
                  </tr>
                  {legTr(L("Mobilization — mob", "التعبئة — موب"), L("delivery", "توصيل"), mobStr, setMobStr, mobUnitsN, setMobUnitsN, mobExcluded, setMobExcluded, refMobPrice, supRound?.mobUnits ?? null, L("Cancel mobilization (delivery to site) from the supplier?", "إلغاء التعبئة (النقل إلى الموقع) من المورد؟"))}
                  {legTr(L("Return — demob", "الإرجاع — ديموب"), L("pickup", "استلام"), demobStr, setDemobStr, demobUnitsN, setDemobUnitsN, demobExcluded, setDemobExcluded, refDemobPrice, supRound?.demobUnits ?? null, L("Cancel demobilization (return from site) from the supplier?", "إلغاء الإرجاع (النقل من الموقع) من المورد؟"))}
                </tbody>
              </table></div>
              <div className="qp-totals">
                <div className="qp-trow"><span className="l">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{money(subtotal)}</span></div>
                <div className="qp-trow"><span className="l">{L("VAT 15%", "ضريبة القيمة المضافة ١٥٪")}</span><span className="v">{money(vat)}</span></div>
                <div className="qp-trow net"><span className="l">{L("Net incl. VAT", "الصافي شامل الضريبة")}</span><span className="v">{money(total)}</span></div>
              </div>
              <div className="qp-words"><span className="k">{L("Amount in words", "المبلغ بالحروف")}</span>{nf(total)} {L("Saudi Riyals only", "ريال سعودي فقط لا غير")}</div>
              {payTerms.length > 0 && (
                <div className="qp-pay">
                  <div className="qp-sech">{L("Payment terms", "شروط الدفع")}</div>
                  {payTerms.map((t) => { const d = decide(t); const opts = choicesFor(t); return (
                    <div key={t.key} className="qp-pay-row">
                      <span className="k">{ar ? t.labelAr : t.label}</span>
                      {editable && !d.server ? (
                        <select className="qp-sel" value={chosenSel(t)} onChange={(e) => pickTerm(t, e.target.value)}>
                          <option value="__none">{L("— choose —", "— اختر —")}</option>
                          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : <b style={{ flex: 1 }}>{valText(d.chosen ?? t.supplierDeclared, L)}</b>}
                      <span className={`qp-badge ${isSettled(d.badge) ? "match" : d.badge === "conflict" ? "diff" : "none"}`}>{badgeLabel(d.badge)}</span>
                    </div>
                  ); })}
                </div>
              )}
              {editable && !rateValid && <p style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "var(--danger,#d9362a)" }}>{L("Enter a rate to continue", "أدخل سعرًا للمتابعة")}</p>}
            </div>
          )}

          {/* ② الشروط — classic quotation table */}
          {page === 1 && (
            <div className="qp-paper" style={{ zoom: String(paperZoom) }}>
              {qhead()}
              <div className="qp-sech">{L("Operating terms", "شروط التشغيل")}</div>
              {operatingTerms.length === 0 ? (
                <p style={{ padding: "20px 0", textAlign: "center", color: "var(--muted,#6b8fa8)", fontSize: 13 }}>{L("No operating terms.", "لا توجد شروط تشغيل.")}</p>
              ) : (
                <div className="qp-scrollx"><table className="qp-tt">
                  <thead><tr><th>{L("Term", "البند")}</th><th>{L("Supplier's offer", "عرض المورد")}</th><th>{L("Your decision", "قرارك")}</th><th>{L("Status", "الحالة")}</th></tr></thead>
                  <tbody>
                    {groupByCat(operatingTerms.filter((t) => !isSettled(decide(t).badge))).map(([cat, list]) => (
                      <Fragment key={cat}>
                        <tr className="cat"><td colSpan={4}>{cat}</td></tr>
                        {list.map((t) => { const d = decide(t); const opts = choicesFor(t); return (
                          <tr key={t.key}>
                            <td className="lbl">{ar ? t.labelAr : t.label}</td>
                            <td className="sup">{valText(t.supplierDeclared, L)}</td>
                            <td>{editable ? (
                              <select className="qp-sel" value={chosenSel(t)} onChange={(e) => pickTerm(t, e.target.value)}>
                                <option value="__none">{L("— choose —", "— اختر —")}</option>
                                {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            ) : <span className="sup">{valText(d.chosen, L)}</span>}</td>
                            <td><span className={`qp-ttbadge ${d.badge}`}>{badgeLabel(d.badge)}</span></td>
                          </tr>
                        ); })}
                      </Fragment>
                    ))}
                    {operatingTerms.some((t) => isSettled(decide(t).badge)) && (
                      <>
                        <tr className="cat settled"><td colSpan={4}>{L("Settled & fixed terms", "البنود المحسومة والمقرّرة")}</td></tr>
                        {operatingTerms.filter((t) => isSettled(decide(t).badge)).map((t) => { const d = decide(t); return (
                          <tr key={t.key} className={d.badge === "locked" ? "locked" : undefined}>
                            <td className="lbl">{d.badge === "locked" ? "🔒 " : ""}{ar ? t.labelAr : t.label}</td>
                            <td className="sup" colSpan={2}>{valText(d.chosen ?? t.value, L)}{editable && !d.server && <button type="button" className="qp-ttreopen" title={L("Reopen", "إعادة فتح")} onClick={() => onReopenLocal(t.key)}>↻</button>}</td>
                            <td><span className={`qp-ttbadge ${d.badge}`}>{badgeLabel(d.badge)}</span></td>
                          </tr>
                        ); })}
                      </>
                    )}
                  </tbody>
                </table></div>
              )}
            </div>
          )}

          {/* ③ المراجعة — quotation summary */}
          {page === 2 && (
            <div className="qp-paper" style={{ zoom: String(paperZoom) }}>
              {qhead()}
              {room.details.location && (
                <div className="qp-addr">
                  <div className="qp-addrbox"><span className="k">{L("Address", "العنوان")}</span><span className="v">{room.details.location}</span></div>
                  <div className="qp-addrbox"><span className="k">{L("City", "المدينة")}</span><span className="v">{room.details.location.split(/[·,،]/).map((s) => s.trim()).filter(Boolean).pop()}</span></div>
                </div>
              )}
              <div className="qp-rgrid">
                <div className="qp-rcol">
                  <div className="qp-rcard">
                    <div className="qp-rcard-h"><span className="material-icons-outlined">receipt_long</span>{L("Price summary", "ملخص عرض السعر")}</div>
                    <div className="qp-totals" style={{ borderTop: 0, paddingTop: 0 }}>
                      {/* The days quoted here are the BILLABLE ones — the rental below is charged across
                          exactly these, and naming the calendar span would overstate what the money buys. */}
                      <div className="qp-trow"><span className="l">{L("Quantity", "الكمية")}</span><span className="v">{rNU} {L("units", "وحدة")}{hasDuration ? (rentalCalc.raw ? ` · ${periods} ${L("days", "يوم")}` : ` · ${rentalCalc.billable} ${L("billable days", "يوم محتسب")}`) : ""}</span></div>
                      <div className="qp-trow"><span className="l">{L("Base rental", "الإيجار الأساسي")}</span><span className="v">{money(rentalLine)}{rentalDivisorNote ? <span className="sub"> · {rentalDivisorNote}</span> : null}</span></div>
                      <div className="qp-trow"><span className="l">{L("Mobilization", "التعبئة (موب)")}</span><span className="v">{mEx ? L("Excluded", "غير مشمولة") : money(mobLine)}</span></div>
                      <div className="qp-trow"><span className="l">{L("Return", "الإرجاع (ديموب)")}</span><span className="v">{dEx ? L("Excluded", "غير مشمول") : money(demobLine)}</span></div>
                      <div className="qp-trow"><span className="l">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{money(subtotal)}</span></div>
                      <div className="qp-trow"><span className="l">{L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)")}</span><span className="v">{money(vat)}</span></div>
                      <div className="qp-trow net"><span className="l">{L("Net incl. VAT", "الصافي · شامل الضريبة")}</span><span className="v">{money(total)}</span></div>
                    </div>
                    {showCompare && <span className={`qp-sumbadge${priceDiff === 0 ? " match" : " diff"}`}>{priceDiff === 0 ? L("Matches supplier's offer", "مطابق لعرض المورد") : `${L("Differs from supplier", "يختلف عن عرض المورد")} (${nf(priceDiff)})`}</span>}
                  </div>
                  {payTerms.length > 0 && (
                    <div className="qp-rcard">
                      <div className="qp-rcard-h"><span className="material-icons-outlined">credit_card</span>{L("Payment terms", "شروط الدفع")}</div>
                      <div className="qp-totals" style={{ borderTop: 0, paddingTop: 0 }}>
                        {payTerms.map((t) => { const d = decide(t); return <div key={t.key} className="qp-trow"><span className="l">{ar ? t.labelAr : t.label}</span><span className="v" style={{ fontFamily: "inherit", color: d.badge === "conflict" ? "var(--danger,#d9362a)" : "var(--navy,#1c3550)" }}>{valText(d.chosen ?? t.supplierDeclared, L)}</span></div>; })}
                      </div>
                    </div>
                  )}
                </div>
                {operatingTerms.length > 0 && (() => {
                  const matched = operatingTerms.filter((t) => isSettled(decide(t).badge)).length;
                  const diff = operatingTerms.filter((t) => decide(t).badge === "conflict").length;
                  const pct = (n: number) => `${Math.round((n / operatingTerms.length) * 100)}%`;
                  return (
                    <div className="qp-guide-navy">
                      <div className="qp-gn-h"><span className="material-icons-outlined">list_alt</span>{L("Terms index", "دليل البنود")}<span className="rdy">{matched}/{operatingTerms.length} {L("ready", "جاهز")}</span></div>
                      <div className="qp-gn-bar"><div className="ok" style={{ width: pct(matched) }} /><div className="df" style={{ width: pct(diff) }} /></div>
                      <div className="qp-gn-legend"><span className="d ok" />{matched} {L("ready", "جاهز")}<span className="d df" />{diff} {L("differ", "يختلف")}</div>
                      {diff > 0 && <div className="qp-gn-review"><span className="material-icons-outlined" style={{ fontSize: 15 }}>autorenew</span>{L("Review differing terms", "راجع البنود المختلفة")} ({diff})</div>}
                      {groupByCat(operatingTerms).map(([cat, list]) => { const open = guideOpen[cat] ?? true; const cm = list.filter((t) => isSettled(decide(t).badge)).length; return (
                        <div key={cat} className="qp-gncat">
                          <button type="button" className="qp-gncat-h" onClick={() => setGuideOpen((g) => ({ ...g, [cat]: !open }))}>{cat}<span className="cnt">{cm}/{list.length}</span><span className={`material-icons-outlined chev${open ? " open" : ""}`}>expand_more</span></button>
                          {open && list.map((t) => { const d = decide(t); return <div key={t.key} className={`qp-gnrow ${d.badge}`}><span className="k">{ar ? t.labelAr : t.label}</span><span className={`qp-gnbadge ${d.badge}`}>{badgeLabel(d.badge)}</span></div>; })}
                        </div>
                      ); })}
                    </div>
                  );
                })()}
              </div>
              {mode === "accept" && (
                <label style={{ display: "block", marginTop: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--navy-mid,#2a4f72)" }}>{L("Contract type", "نوع العقد")}</span>
                  <select value={contractType} onChange={(e) => setContractType(e.target.value)} className="qp-sel" style={{ marginTop: 5, width: "100%", height: 42 }}>
                    {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
              )}
              {mode === "accept" && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, fontSize: 12.5, fontWeight: 600, color: "var(--navy,#1c3550)" }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
                  {L("I confirm the agreed rate and terms.", "أؤكّد السعر والشروط المتفق عليها.")}
                </label>
              )}
              {error && <p style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "var(--danger,#d9362a)" }}>{error}</p>}
            </div>
          )}
          </div>
          {/* zoom rail — fixed in the desk's side margin (right in RTL, left in LTR) */}
          <div className="qp-zoom">
            <button type="button" title={L("Zoom in", "تكبير")} onClick={() => setPaperZoom((z) => Math.min(1.8, Math.round((z + 0.15) * 100) / 100))}>+</button>
            <button type="button" className="pct" title={L("Fit (85%)", "ملاءمة ٨٥٪")} onClick={() => setPaperZoom(0.85)}>{Math.round(paperZoom * 100)}%</button>
            <button type="button" title={L("Zoom out", "تصغير")} onClick={() => setPaperZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))}>−</button>
          </div>
        </div>

        {/* footer */}
        <div className="qp-foot">
          <button type="button" className="qp-log" onClick={() => setLogOpen(true)}><span className="material-icons-outlined" style={{ fontSize: 16 }}>history</span>{L("Log", "السجل")}</button>
          <div className="spacer" />
          <div className="qp-foot-main">
            {!editable && allMatched && page < 2 && <button className="qp-fbtn accept" onClick={() => setPage(2)}>✓ {L("Accept offer", "قبول العرض")}</button>}
            {page < 2 ? (
              <button className="qp-fbtn primary" disabled={!canNext} onClick={() => setPage((p) => (p + 1) as 0 | 1 | 2)}>{page === 0 ? L("Next: Terms", "التالي: الشروط") : L("Review & send", "مراجعة وإرسال")}<span className="qp-cch">‹</span></button>
            ) : (
              <button className={`qp-fbtn ${editable ? "primary" : "accept"}`} disabled={busy || !canSubmit} onClick={doSubmit}>{busy ? L("Sending…", "جارٍ الإرسال…") : editable ? L("Send reply", "إرسال الرد") : L("Accept offer", "قبول العرض")}<span className="qp-cch">‹</span></button>
            )}
            <button className="qp-fbtn back" disabled={busy} onClick={() => (page > 0 ? setPage((p) => (p - 1) as 0 | 1 | 2) : onClose())}>{page > 0 ? L("Back", "رجوع") : L("Close", "إغلاق")}<span className="qp-cch">›</span></button>
          </div>
          <div className="spacer" />
        </div>

        {pendingEx && (
          <div className="qp-scrim" style={{ zIndex: 75 }} dir={ar ? "rtl" : "ltr"} onClick={() => setPendingEx(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px rgba(16,38,63,.35)", padding: "22px 22px 20px", textAlign: "start" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <h3 style={{ fontSize: 16.5, fontWeight: 900, color: "#1c3550", margin: 0, lineHeight: 1.45 }}>{pendingEx.title}</h3>
                <span style={{ flexShrink: 0, display: "inline-flex", width: 42, height: 42, borderRadius: 12, background: "#fff4e5", color: "#d4780a", alignItems: "center", justifyContent: "center" }}>
                  <span className="material-icons-outlined" style={{ fontSize: 24 }}>warning_amber</span>
                </span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#6b8fa8", lineHeight: 1.7, margin: "10px 0 18px" }}>
                {L("If you cancel, the supplier won't handle it — it becomes your responsibility: you arrange the transport and cover its cost, and it won't appear in the supplier's offer.", "عند الإلغاء لن يتكفّل المورد بها — تصبح على مسؤوليتك أنت: تنظّم النقل وتتحمّل تكلفته، ولن تظهر ضمن عرض المورد.")}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setPendingEx(null)} style={{ flex: "0 0 auto", padding: "13px 22px", borderRadius: 13, border: "1.5px solid #d4e0ec", background: "#fff", color: "#1c3550", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>{L("Go back", "تراجع")}</button>
                <button onClick={() => { pendingEx.onYes(); setPendingEx(null); }} style={{ flex: 1, padding: "13px 12px", borderRadius: 13, border: "none", background: "#d9362a", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{L("Yes, cancel it — on me", "نعم، ألغِها — عليّ أنا")}</button>
              </div>
            </div>
          </div>
        )}

        {logOpen && (
          <div className="qp-scrim" style={{ zIndex: 70 }} onClick={() => setLogOpen(false)}>
            <div className="qp-sheet" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="qp-head-r1"><div className="qp-htitle"><div className="t">{L("Negotiation log", "سجل التفاوض")}</div></div><button className="qp-x" onClick={() => setLogOpen(false)}><span className="material-icons-outlined">close</span></button></div>
              <div className="qp-log-tabs">
                {([["all", L("All", "الكل")], ["price", L("Price", "السعر")], ["terms", L("Terms", "الشروط")]] as const).map(([k, lbl]) => (
                  <button key={k} type="button" className={`qp-log-tab${logTab === k ? " on" : ""}`} onClick={() => setLogTab(k)}>{lbl}</button>
                ))}
              </div>
              <div className="qp-body" style={{ background: "#fff", padding: "4px 0 8px" }}>
                {/* Reconstructed price rounds (newest first) — role, rate, units, legs, total per round. */}
                {logTab !== "terms" && flowRounds.length > 0 && (
                  <div className="qp-rounds">
                    {[...flowRounds].reverse().map((r, i) => {
                      const rt = roundTotals(room, r);
                      const per = ({ PER_DAY: L("day", "يوم"), PER_WEEK: L("week", "أسبوع"), PER_MONTH: L("month", "شهر"), PER_JOB: L("job", "مهمة") } as Record<string, string>)[rt.priceUnit] ?? L("day", "يوم");
                      return (
                        <div key={`rnd-${i}`} className="qp-round">
                          <div className="qp-round-h">
                            <span className={`qp-round-role ${r.role}`}>{r.role === "supplier" ? L("Supplier", "المورد") : L("You", "أنت")}</span>
                            <span className="qp-round-tot">{nf(rt.grand)} {sar}</span>
                          </div>
                          <div className="qp-round-d">
                            {nf(rt.rate)}/{per} · {rt.rentalUnits} {L("units", "وحدة")}
                            {rt.mobExcluded ? ` · ${L("no mob", "بدون تعبئة")}` : rt.mobPrice ? ` · ${L("mob", "تعبئة")} ${nf(rt.mobPrice)}×${rt.mobUnitsN}` : ""}
                            {rt.demobExcluded ? ` · ${L("no demob", "بدون إرجاع")}` : rt.demobPrice ? ` · ${L("demob", "إرجاع")} ${nf(rt.demobPrice)}×${rt.demobUnitsN}` : ""}
                          </div>
                          {r.at && <div className="qp-round-t">{new Date(r.at).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {(() => {
                  // Real activity log — the deal room's system_bot narration (each counter / rate proposal /
                  // term action / lifecycle event), newest-first. Full structured per-round price history is
                  // still latest-only backend-side (spec §11), but every round is narrated here as it happens.
                  const sys = messages.filter((m) => m.user?.id === "system_bot" && (m.text ?? "").trim());
                  const sorted = [...sys].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
                  const PRICE_RE = /سعر|ر\.?\s?س|price|rate|تعبئة|إرجاع|موب|ديموب|SAR/i;
                  const TERMS_RE = /شرط|بند|term|إعاشة|وقود|صيانة|دفع|مشغّل|مشغل|قبول/i;
                  const shown = sorted.filter((m) => (logTab === "all" ? true : logTab === "price" ? PRICE_RE.test(m.text ?? "") : TERMS_RE.test(m.text ?? "")));
                  if (shown.length === 0) return <p style={{ fontSize: 13, color: "var(--muted,#6b8fa8)", textAlign: "center", padding: "24px 0" }}>{L("No activity yet.", "لا يوجد نشاط بعد.")}</p>;
                  return (
                    <ul className="qp-log-list">
                      {shown.map((m) => (
                        <li key={m.id} className="qp-log-row">
                          <span className="material-icons-outlined qp-log-ic">bolt</span>
                          <span className="qp-log-txt">{m.text}</span>
                          {m.created_at && <span className="qp-log-time">{new Date(m.created_at).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
