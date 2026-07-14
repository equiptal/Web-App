"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { StreamChat, type Channel } from "stream-chat";
import { useLocale } from "@/lib/i18n";
import { fetchDealRoom, fetchStreamToken, fetchDealRoomDocuments, fetchQuotation, proposeRate, acceptDeal, batchUpdateTerms, releaseDeal, withdrawAcceptance, ApiError } from "@/lib/api/client";
import type { DealRoomView, DealRoomDocument, DealRoomDocuments, QuotationView } from "@/lib/contract/deal-room";
import { DealRoomTerms, type ResolutionsMap } from "@/components/deal-room/DealRoomTerms";
import { VoiceRecorder } from "@/components/deal-room/VoiceRecorder";
import { renderQuotationSection, wrapQuotationPage, type QuotationDoc, type QuotationLineItem, type QuotationCard } from "@/lib/quotation/render";
import "@/components/deal-room/deal-room-proto.css";

type StreamAttachment = { type?: string; image_url?: string; thumb_url?: string; asset_url?: string; title?: string; mime_type?: string; file_size?: number; fallback?: string };
type ChatMsg = { id: string; text?: string; user?: { id?: string }; created_at?: string | Date; attachments?: StreamAttachment[] };

const STREAM_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY ?? "";
const nf = (n: number) => Math.round(n).toLocaleString("en-US");
type LFn = (en: string, arr: string) => string;

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

/**
 * Client-rendered confirmed-deal quotation (the backend server PDF is disabled — the client renders it
 * now, app parity). Values mirror the app's `extractQuotationData`: rental = agreedRate × durationFactor
 * (PER_DAY = duration days, PER_WEEK = ceil(days/7), PER_MONTH = ceil(days/30), PER_JOB = 1); estimated
 * total = (rental + mobilization + demobilization) × units; VAT 15%. Agreed values come from the confirmed
 * Quotation row (+ the deal room for mob/demob/units/fixed terms/supplier name; renter name from /api/me).
 */
function buildQuotationHtml(room: DealRoomView, q: QuotationView, renteeName: string, ar: boolean, L: (en: string, arr: string) => string): string {
  const lang = ar ? "ar" : "en";
  const sar = L("SAR", "ر.س");
  const rate = q.agreedRate ?? room.rate ?? 0;
  const unit = (q.priceUnit ?? room.priceUnit ?? "PER_DAY").toUpperCase();
  const mob = room.mobPrice ?? 0;
  const demob = room.demobPrice ?? 0;
  const units = room.numberOfUnits || 1;
  const days = room.periods;
  const periodLabel = unit === "PER_WEEK" ? L("week", "أسبوع") : unit === "PER_MONTH" ? L("month", "شهر") : unit === "PER_JOB" ? L("job", "مهمة") : L("day", "يوم");
  let durationFactor: number | null = null;
  if (unit === "PER_JOB") durationFactor = 1;
  else if (days != null) durationFactor = unit === "PER_WEEK" ? Math.ceil(days / 7) : unit === "PER_MONTH" ? Math.ceil(days / 30) : days;
  const hasTotal = rate > 0 && durationFactor != null;
  // Same money math as the live card: rental + mob + demob, all × units, + 15% VAT (offered units).
  const rentalTotal = hasTotal ? rate * (durationFactor as number) * units : 0;
  const mobTotal = mob * units;
  const demobTotal = demob * units;
  const subtotal = hasTotal ? rentalTotal + mobTotal + demobTotal : 0;
  const vat = Math.round(subtotal * 0.15);
  const total = subtotal + vat;
  const dateStr = new Date().toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const qnum = (q.quotationNumber ?? "").slice(0, 8).toUpperCase() || "—";
  const contractType = q.contractType ?? room.contractType;

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
  if (hasTotal) {
    lineItems.push({ num: 1, label: L("Rental", "الإيجار"), detail: room.supplier.name, unit: periodLabel, qty: `${durationFactor}${units > 1 ? ` × ${units}` : ""}`, price: `${nf(rate)} / ${periodLabel}`, total: nf(rentalTotal) });
  } else {
    lineItems.push({ num: 1, label: L("Rental", "الإيجار"), detail: room.supplier.name, unit: periodLabel, qty: "∞", price: `${nf(rate)} / ${periodLabel}`, total: `${nf(rate)} / ${periodLabel}`, totalNote: L("As operated", "حسب التشغيل") });
  }
  // Mobilization/demobilization are ALWAYS shown — even when the rentee arranges them (supplier
  // charges nothing), that must be stated on the quotation.
  const logiRow = (label: string, price: number, priceTotal: number, byRentee: boolean): QuotationLineItem =>
    price > 0
      ? { num: null, label, detail: room.supplier.name, unit: L("Trip", "رحلة"), qty: String(units), price: nf(price), total: nf(priceTotal) }
      : { num: null, label, detail: byRentee ? L("Arranged by the rentee", "يُرتّبه المستأجر") : L("Included", "مشمول"), unit: "—", qty: "—", price: "—", total: byRentee ? L("By rentee", "على المستأجر") : L("Included", "مشمول") };
  lineItems.push(logiRow(L("Delivery to site", "النقل إلى الموقع"), mob, mobTotal, room.mobByRentee === true));
  lineItems.push(logiRow(L("Return from site", "الإرجاع من الموقع"), demob, demobTotal, room.demobByRentee === true));

  const cards: QuotationCard[] = [];
  // Structured rental/equipment details (from the request item) — rows with no value are skipped
  // (field names best-effort). Operator/safety + cost responsibilities are NOT separate cards: they
  // flow through the Agreed/Fixed terms + the price extras below, matching the app.
  const dd = room.details;
  const yn = (b: boolean | null) => (b == null ? null : b ? L("Yes", "نعم") : L("No", "لا"));
  const fmtDate = (v: string | null) => { if (!v) return null; const dt = new Date(v); return isNaN(dt.getTime()) ? v : dt.toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); };
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
  for (const term of q.agreedTerms) if (isCost(term.key) && !seenCost.has(term.key)) { seenCost.add(term.key); priceExtras.push({ label: ar ? term.labelAr : term.label, value: valFmt(term.value) }); }
  for (const term of room.terms) if (isCost(term.key) && !seenCost.has(term.key)) { seenCost.add(term.key); priceExtras.push({ label: ar ? term.labelAr : term.label, value: valFmt(term.value ?? term.platformDefault) }); }

  const agreedRows = q.agreedTerms.filter((t) => t.key !== "PRICE" && !isCost(t.key)).map((t) => ({ label: ar ? t.labelAr : t.label, value: valFmt(t.value) }));
  if (agreedRows.length) cards.push({ title: L("Agreed terms", "الشروط المتفق عليها"), rows: agreedRows });
  const fixedRows = room.terms.filter((t) => t.state === "fixed" && !isCost(t.key)).map((t) => ({ label: ar ? t.labelAr : t.label, value: valFmt(t.value ?? t.platformDefault) }));
  if (fixedRows.length) cards.push({ title: L("Fixed terms", "الشروط الثابتة"), rows: fixedRows });

  const doc: QuotationDoc = {
    lang,
    title: L("Equipment rental quotation", "عرض سعر تأجير معدات"),
    quotationNumber: qnum,
    dateStr,
    supplier: {
      label: L("Supplier", "المؤجِّر"),
      name: room.supplier.name,
      idRows: [
        { label: L("National Address", "العنوان الوطني"), verified: room.supplier.isVerified },
        { label: L("CR #", "س.ت"), verified: room.supplier.isVerified },
        { label: L("VAT #", "ض.ق.م"), verified: room.supplier.isVerified },
        { label: L("Phone", "الهاتف"), value: q.supplierPhone },
        { label: L("Email", "البريد"), value: q.supplierEmail },
      ],
      // Verified shows on the CR/VAT rows ("✓ Verified") — no standalone orphan party chip.
      chips: [],
    },
    rentee: {
      label: L("Rentee", "المُستأجِر"),
      name: renteeName,
      idRows: [
        { label: L("Phone", "الهاتف"), value: q.renteePhone },
        { label: L("Email", "البريد"), value: q.renteeEmail },
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
    // Short disclaimer instead of the full legal clause list + signed block (app parity).
    legal: [L("This quotation is generated electronically via Moedatech, valid for 7 days from the issue date. Prices exclude anything not listed above; VAT at 15% applies per Saudi tax law.", "صدر هذا العرض إلكترونيًا عبر منصة معداتك، وهو ساري المفعول لمدة ٧ أيام من تاريخ الإصدار. الأسعار لا تشمل ما لم يُذكر أعلاه، وتُطبَّق ضريبة القيمة المضافة بنسبة ١٥٪ وفقًا للنظام السعودي.")],
  };
  return wrapQuotationPage(renderQuotationSection(doc), { lang, title: L("Confirmed Quotation", "عرض سعر مؤكّد") });
}

export function DealRoom({ id, onTitle }: { id: string; onTitle?: (t: string) => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);

  const [room, setRoom] = useState<DealRoomView | null>(null);
  const [error, setError] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [busy, setBusy] = useState(false);
  // App parity: a single guided flow modal (3 steps: Terms → Price → Summary) handles both Counter and
  // Accept. `flowMode` picks which — null = closed.
  const [flowMode, setFlowMode] = useState<"counter" | "accept" | null>(null);
  const [counterErr, setCounterErr] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
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
  const [termsOpen, setTermsOpen] = useState(true);
  const termsToggled = useRef(false);
  // App parity: term accept/counter are collected LOCALLY here and submitted once (batched) on
  // Counter/Accept — nothing is PATCHed per click.
  const [resolutions, setResolutions] = useState<ResolutionsMap>({});

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [myStreamId, setMyStreamId] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState(false);
  const [text, setText] = useState("");
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
  async function downloadQuotation() {
    if (quoteBusy || !room) return;
    setQuoteBusy(true);
    setQuoteErr(null);
    try {
      const q = await fetchQuotation(id);
      if (q.pdfUrl) {
        window.open(q.pdfUrl, "_blank", "noopener,noreferrer");
        return;
      }
      let renteeName = "";
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.ok) {
          const d = (await meRes.json()) as { user?: { firstName?: string | null; lastName?: string | null; companyName?: string | null } };
          const u = d.user ?? {};
          renteeName = (u.companyName?.trim() || [u.firstName, u.lastName].filter(Boolean).join(" ")) ?? "";
        }
      } catch {
        /* name is best-effort */
      }
      const w = window.open("", "_blank");
      if (!w) {
        setQuoteErr(L("Allow pop-ups to open the quotation.", "اسمح بالنوافذ المنبثقة لفتح عرض السعر."));
        return;
      }
      w.document.write(buildQuotationHtml(room, q, renteeName, ar, L));
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

  // Collapse the Terms card by default when nothing needs resolving; open it when a term differs.
  useEffect(() => {
    if (room && !termsToggled.current) setTermsOpen(room.hasDisputedTerms);
  }, [room]);

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
      // accept. contractType is chosen on the flow's Summary step (defaults to "formal"); agreedUnits is
      // omitted (no assembled deals on web).
      await acceptDeal(id, contractType, { termResolutions: resolutionUpdates() });
      setResolutions({});
      await loadRoom();
      setFlowMode(null);
    } catch (e) {
      window.alert(errMsg(e, L("Couldn’t accept right now — please try again.", "تعذّر القبول الآن — حاول مرة أخرى.")));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="dlproto"><div className="rempty">{L("Couldn’t open this deal room.", "تعذّر فتح غرفة الصفقة.")}</div></div>;
  if (!room) return <div className="dlproto"><div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div></div>;

  const rate = room.rate ?? 0;
  const periods = room.periods ?? 1;
  // deal-room/negotiation — per-type units + ÷26 PRORATED math (matches the backend quotation + app):
  // monthly rate ÷26 / weekly ÷7 / daily × duration(days) × rental units; PER_JOB = rate × units (no
  // duration). Mob/demob = price × their own unit count (0 when excluded).
  const FREQ_DAYS: Record<string, number> = { PER_DAY: 1, PER_WEEK: 7, PER_MONTH: 26 };
  const basisU = (room.priceUnit ?? "PER_DAY").toUpperCase();
  const rentalUnits = room.agreedUnits ?? room.numberOfUnits ?? 1;
  const mobUnitsN = Math.min(room.mobUnits ?? rentalUnits, rentalUnits);
  const demobUnitsN = Math.min(room.demobUnits ?? rentalUnits, rentalUnits);
  const units = rentalUnits; // the rental count drives the card display
  const perDayRate = rate / (FREQ_DAYS[basisU] ?? 1);
  const rentalTotal = basisU === "PER_JOB" ? rate * rentalUnits : perDayRate * periods * rentalUnits;
  const mobTotal = room.mobExcluded ? 0 : (room.mobPrice ?? 0) * mobUnitsN;
  const demobTotal = room.demobExcluded ? 0 : (room.demobPrice ?? 0) * demobUnitsN;
  const subtotal = rentalTotal + mobTotal + demobTotal;
  const vat = Math.round(subtotal * 0.15);
  const grand = subtotal + vat;
  // Billing-period label from the bid's price unit (same mapping the bid cards use).
  const periodLabel = (() => {
    switch ((room.priceUnit ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  })();
  const closed = room.status === "CLOSED";
  const abandoned = room.status === "ABANDONED";
  const awaiting = room.status === "AWAITING_SUPPLIER_CONFIRMATION";
  const waiting = awaiting || (!room.myTurn && room.status === "NEGOTIATING");
  const cardCls = closed ? "closed" : waiting ? "neg" : "";
  // Accept is gated (like the app) until every differing term is resolved — now satisfied by a LOCAL
  // resolution, not a server round-trip.
  const unresolvedDisputed = room.terms.filter((t) => t.state === "disputed" && !resolutions[t.key]);
  const canAccept = unresolvedDisputed.length === 0;

  return (
    <div className="dlproto" dir={ar ? "rtl" : "ltr"}>
      {/* contact bar */}
      <div className="contact">
        <div className="av">{room.supplier.name.charAt(0).toUpperCase()}<span className="online" /></div>
        <div className="nm">
          <div className="row1">{room.supplier.name}{room.supplier.isVerified && <span className="material-icons-outlined">check_circle</span>}</div>
          <span className="role">{L("Supplier", "مؤجّر")}{room.shortCode ? ` · ${room.shortCode}` : ""}</span>
        </div>
        <div className="cacts">
          <span className="cbtn" role="button" tabIndex={0} title={L("Documents", "المستندات")} onClick={() => setShowDocs(true)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowDocs(true)}><span className="material-icons-outlined">description</span></span>
          {/* deal-room/negotiation (B5): the renter is the rentee → the supplier's number is delivered from
              the start (server-gated), so calling is unlocked immediately (no wait for CLOSED). */}
          {room.supplier.phone
            ? <a className="cbtn call" href={`tel:${room.supplier.phone}`} title={L("Call", "اتصال")}><span className="material-icons-outlined">call</span></a>
            : <span className="cbtn call locked" title={L("Number unavailable", "الرقم غير متاح")}><span className="material-icons-outlined">call</span></span>}
        </div>
      </div>

      {/* price card */}
      <div className={`price-card ${cardCls}`}>
        <div className="pc-top">
          {closed ? (
            <span className="turn-chip done"><span className="material-icons-outlined">verified</span>{L("Accepted", "تم القبول")}</span>
          ) : room.myTurn ? (
            <span className="turn-chip mine"><span className="material-icons-outlined">bolt</span>{L("Your move", "دورك")}</span>
          ) : waiting ? (
            <span className="turn-chip"><span className="material-icons-outlined">hourglass_top</span>{L("Waiting for supplier response", "في انتظار رد المؤجر")}</span>
          ) : null}
          <span className="terms-btn"><span className="material-icons-outlined">check_circle</span>{room.contractType ?? L("Terms", "الشروط")}</span>
        </div>
        <div className="pc-body">
          <div className="pc-rate">{L("SAR", "ر.س")} {nf(rate)} <small>/ {periodLabel}{units > 1 ? ` · ${L("per unit", "لكل وحدة")}` : ""}</small></div>
          <div className="pc-total">{L("Estimated total", "الإجمالي التقديري")}: <b>{nf(grand)} {L("SAR", "ر.س")}</b></div>
          <div className={`bd-toggle${breakdown ? " open" : ""}`} onClick={() => setBreakdown((b) => !b)}>
            {breakdown ? L("Hide breakdown", "إخفاء التفصيل") : L("Show breakdown", "عرض التفصيل")}<span className="material-icons-outlined">expand_more</span>
          </div>
          {breakdown && (
            <div className="breakdown">
              <div className="brow"><span className="l">{L("Rental", "الإيجار")} ({nf(rate)}/{periodLabel}{basisU !== "PER_JOB" ? ` × ${periods}` : ""}{units > 1 ? ` × ${units}` : ""})</span><span className="v">{nf(rentalTotal)}</span></div>
              {room.mobExcluded
                ? <div className="brow"><span className="l">{L("Mobilization", "التعبئة")}</span><span className="v">{L("Not included", "غير مشمول")}</span></div>
                : room.mobPrice ? <div className="brow"><span className="l">{L("Mobilization", "التعبئة")}{mobUnitsN > 1 ? ` (${nf(room.mobPrice)} × ${mobUnitsN})` : ""}</span><span className="v">{nf(mobTotal)}</span></div> : null}
              {room.demobExcluded
                ? <div className="brow"><span className="l">{L("Return", "الإرجاع")}</span><span className="v">{L("Not included", "غير مشمول")}</span></div>
                : room.demobPrice ? <div className="brow"><span className="l">{L("Return", "الإرجاع")}{demobUnitsN > 1 ? ` (${nf(room.demobPrice)} × ${demobUnitsN})` : ""}</span><span className="v">{nf(demobTotal)}</span></div> : null}
              <div className="brow"><span className="l">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{nf(subtotal)}</span></div>
              <div className="brow"><span className="l">{L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)")}</span><span className="v">{nf(vat)}</span></div>
              <div className="brow tot"><span className="l">{L("Estimated total", "الإجمالي التقديري")}</span><span className="v">{nf(grand)} {L("SAR", "ر.س")}</span></div>
            </div>
          )}
        </div>
        {/* status-driven footer */}
        {closed ? (
          <div className="confirmed"><span className="material-icons-outlined">check_circle</span><span className="ct">{L("Deal Confirmed", "تم تأكيد الصفقة")}</span></div>
        ) : abandoned ? (
          <div className="turn-strip" style={{ color: "var(--danger)" }}><span className="material-icons-outlined" style={{ color: "var(--danger)" }}>cancel</span>{L("This deal room has been cancelled", "تم إلغاء غرفة الصفقة هذه")}</div>
        ) : room.myTurn ? (
          <>
            <div className="pc-cta">
              <button className="btn outline" disabled={busy} onClick={() => openFlow("counter")}><span className="material-icons-outlined">swap_horiz</span>{L("Counter", "تفاوض")}</button>
              {/* Accept is gated exactly like the app: blocked while any term is disputed (acceptAllTerms 409s otherwise). */}
              <button className="btn green" disabled={busy || !canAccept} onClick={() => openFlow("accept")}><span className="material-icons-outlined">check</span>{L("Accept", "قبول")}</button>
            </div>
            {!canAccept && (
              <div className="turn-strip" style={{ color: "var(--warn,#b45309)" }}>
                <span className="material-icons-outlined" style={{ color: "var(--warn,#b45309)" }}>error_outline</span>
                {L("Resolve the differing terms below before you can accept", "قم بحل الشروط المختلفة أدناه قبل القبول")}
              </div>
            )}
          </>
        ) : awaiting ? (
          <>
            <div className="turn-strip"><span className="material-icons-outlined">hourglass_top</span>{L("Sent — awaiting supplier confirmation", "أُرسل — بانتظار تأكيد المؤجر")}</div>
            {/* deal-room/negotiation — withdraw the pending acceptance (AWAITING → NEGOTIATING). */}
            <div className="pc-cta">
              <button className="btn outline" disabled={withdrawing} onClick={doWithdraw}>
                <span className="material-icons-outlined">undo</span>{withdrawing ? L("Withdrawing…", "جارٍ السحب…") : L("Withdraw acceptance", "سحب القبول")}
              </button>
            </div>
          </>
        ) : (
          <div className="turn-strip"><span className="material-icons-outlined">hourglass_top</span>{L("Waiting for the supplier", "في انتظار المؤجر")}</div>
        )}
      </div>

      {/* the supplier opened this room first (chatted before the renter entered) — app-parity prompt */}
      {room.supplierFirstEntry && room.status !== "CLOSED" && room.status !== "ABANDONED" && (
        <div className="started-banner">
          <span className="material-icons-outlined">forum</span>
          {L("The supplier started this conversation — reply to negotiate.", "بدأ المؤجّر هذه المحادثة — ردّ للتفاوض.")}
        </div>
      )}

      {/* terms — show negotiable terms; the renter resolves any DIFFERING (disputed) one before accept */}
      {/* App parity: terms are surfaced only when it's the renter's turn to act (the app shows them in a
          turn-gated sheet, never inline while awaiting/closed). This also stops a resolved deal from still
          showing a red "Conflict" card after acceptance/confirmation. */}
      {room.myTurn && room.terms.length > 0 && (
        <div className="terms-card">
          <button type="button" className="tc-h tc-toggle" aria-expanded={termsOpen} onClick={() => { termsToggled.current = true; setTermsOpen((o) => !o); }}>
            <span className="material-icons-outlined">fact_check</span>
            <span>{L("Terms", "الشروط")}</span>
            <span className="tc-h-meta">{room.terms.length}{unresolvedDisputed.length ? ` · ${unresolvedDisputed.length} ${L("differ", "مختلف")}` : ""}</span>
            <span className="material-icons-outlined tc-chev" style={{ transform: termsOpen ? "rotate(180deg)" : "none" }}>expand_more</span>
          </button>
          {termsOpen && <DealRoomTerms terms={room.terms} ar={ar} L={L} busy={busy} readOnly={!room.myTurn} resolutions={resolutions} onResolveLocal={setResolution} onReopenLocal={clearResolution} />}
        </div>
      )}

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
            const mine = m.user?.id === myStreamId;
            return (
              <div className={`msg ${mine ? "mine" : "them"}`} key={m.id}>
                {m.text}
                {m.attachments?.map((a, i) =>
                  a.type === "image" ? (
                    <a key={i} href={a.image_url || a.thumb_url} target="_blank" rel="noopener noreferrer" className="msg-att-img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.thumb_url || a.image_url} alt={a.fallback || ""} />
                    </a>
                  ) : a.type === "audio" || (a.mime_type || "").startsWith("audio/") ? (
                    <audio key={i} controls preload="none" src={a.asset_url} className="msg-att-audio" style={{ display: "block", maxWidth: "100%", marginTop: 6 }} />
                  ) : (
                    <a key={i} href={a.asset_url} target="_blank" rel="noopener noreferrer" className="msg-att-file">
                      <span className="material-icons-outlined">{(a.mime_type || "").includes("pdf") ? "picture_as_pdf" : "insert_drive_file"}</span>
                      <span className="msg-att-name">{a.title || L("Attachment", "مرفق")}</span>
                    </a>
                  ),
                )}
                <div className="meta">{m.created_at ? new Date(m.created_at as string).toLocaleTimeString(ar ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      {closed ? (
        <div className="composer ro quote-bar">
          <button type="button" className="dl-quote" onClick={downloadQuotation} disabled={quoteBusy}>
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
          units={units}
          onClose={() => !busy && setFlowMode(null)}
          onCounter={submitCounter}
          onAccept={doAccept}
        />
      )}

      {releaseOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4" style={{ background: "rgba(16,38,63,.5)" }} onClick={() => !releasing && setReleaseOpen(false)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-5 text-center" dir={ar ? "rtl" : "ltr"} onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(247,144,10,.12)" }}>
              <span className="material-icons-outlined" style={{ color: "#f7900a", fontSize: 26 }}>lock_open</span>
            </div>
            <h3 className="text-[17px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>{L("Reopen this deal?", "إعادة فتح هذه الصفقة؟")}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--muted,#6b7280)" }}>
              {L("This reopens negotiation with the supplier — the accepted deal returns to negotiating and the terms/price can change again. A new quotation is issued once you re-confirm.", "يعيد هذا فتح التفاوض مع المؤجّر — تعود الصفقة المقبولة إلى التفاوض ويمكن تغيير الشروط والسعر. يصدر عرض سعر جديد بعد إعادة التأكيد.")}
            </p>
            {releaseErr && <p className="mt-2 text-[12px] font-semibold" style={{ color: "#d9362a" }}>{releaseErr}</p>}
            <div className="mt-5 flex gap-2.5">
              <button className="flex-1 rounded-[10px] border px-4 py-2.5 text-[13px] font-bold" style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)" }} disabled={releasing} onClick={() => setReleaseOpen(false)}>{L("Cancel", "إلغاء")}</button>
              <button className="flex-1 rounded-[10px] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: "#f7900a" }} disabled={releasing} onClick={() => void doRelease()}>{releasing ? L("Reopening…", "جارٍ إعادة الفتح…") : L("Reopen", "إعادة الفتح")}</button>
            </div>
          </div>
        </div>
      )}

      {showDocs && <DocumentsModal id={id} ar={ar} L={L} supplierName={room.supplier.name} onClose={() => setShowDocs(false)} />}
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
    <a
      href={d.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-[10px] border border-[var(--border,#e5e7eb)] px-3 py-2.5 hover:bg-[var(--surface2,#f5f7fa)]"
    >
      <span className="material-icons-outlined" style={{ color: d.fileType === "image" ? "#2563eb" : "#dc2626", fontSize: 22 }}>
        {d.fileType === "image" ? "image" : "picture_as_pdf"}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: "var(--navy,#0f1e2e)" }}>
        {ar && d.labelAr ? d.labelAr : d.label}
      </span>
      <span className="material-icons-outlined" style={{ color: "var(--info,#2563eb)", fontSize: 20 }}>open_in_new</span>
    </a>
  );

  const Section = ({ title, items }: { title: string; items: DealRoomDocument[] }) =>
    items.length === 0 ? null : (
      <div>
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--muted,#6b7280)]">{title}</div>
        <div className="space-y-2">{items.map((d) => <Row key={d.type} d={d} />)}</div>
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[var(--surface1,#fff)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border,#e5e7eb)] px-5 py-3.5">
          <h3 className="text-[15px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>
            {fmtDocsTitle(L, supplierName)}
          </h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted,#6b7280)] hover:bg-[var(--surface2,#f5f7fa)]" aria-label={L("Close", "إغلاق")}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error ? (
            <p className="py-6 text-center text-[13px] text-[var(--muted,#6b7280)]">{L("Couldn’t load documents.", "تعذّر تحميل المستندات.")}</p>
          ) : !docs ? (
            <div className="grid place-items-center py-8"><span className="material-icons-outlined" style={{ fontSize: 24 }}>progress_activity</span></div>
          ) : total === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--muted,#6b7280)]">{L("No documents shared yet.", "لا توجد مستندات بعد.")}</p>
          ) : (
            <div className="space-y-4">
              <Section title={L("Company", "مستندات الشركة")} items={docs.companyDocuments} />
              <Section title={L("Equipment", "مستندات المعدة")} items={docs.equipmentDocuments} />
            </div>
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

/** Centered modal shell for the guided flow — a flex column card that scrolls its body. */
function FlowShell({ ar, onClose, children }: { ar: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[var(--surface1,#fff)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
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
  periodLabel, periods, units, onClose, onCounter, onAccept,
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
  units: number;
  onClose: () => void;
  onCounter: (next: {
    rate: number; mobPrice?: number; demobPrice?: number;
    rentalUnits?: number; mobUnits?: number; demobUnits?: number; mobExcluded?: boolean; demobExcluded?: boolean;
  }) => void;
  onAccept: (contractType: string) => void;
}) {
  const editable = mode === "counter";
  // Accept is gated behind a binding-commitment warning first (app parity). Counter skips it.
  const [bindingOk, setBindingOk] = useState(mode === "counter");
  const [page, setPage] = useState(0); // 0 = Terms, 1 = Price, 2 = Summary
  const [rateStr, setRateStr] = useState(room.rate ? String(room.rate) : "");
  const [mobStr, setMobStr] = useState(room.mobPrice ? String(room.mobPrice) : "");
  const [demobStr, setDemobStr] = useState(room.demobPrice ? String(room.demobPrice) : "");
  const [contractType, setContractType] = useState(room.contractType ?? "formal");
  const [ack, setAck] = useState(false);

  // deal-room/negotiation — per-type unit counts (cap = requested; mob/demob ≤ rental) + leg exclusion.
  const cap = Math.max(1, room.requestedUnits || units || 1);
  const dflt = Math.min(cap, room.agreedUnits ?? units ?? 1);
  const [rentalUnits, setRentalUnits] = useState<number>(dflt);
  const [mobUnitsN, setMobUnitsN] = useState<number>(room.mobUnits ?? dflt);
  const [demobUnitsN, setDemobUnitsN] = useState<number>(room.demobUnits ?? dflt);
  const [mobExcluded, setMobExcluded] = useState<boolean>(room.mobExcluded);
  const [demobExcluded, setDemobExcluded] = useState<boolean>(room.demobExcluded);

  const num = (s: string) => { const n = Number(s); return s.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : 0; };
  const rate = editable ? num(rateStr) : (room.rate ?? 0);
  const mob = editable ? num(mobStr) : (room.mobPrice ?? 0);
  const demob = editable ? num(demobStr) : (room.demobPrice ?? 0);
  const rateValid = rate > 0;

  // Per-type PRORATED math — monthly ÷26 / weekly ÷7 / daily, × duration(days) × units — matches the
  // backend quotation calc + the app. Excluded legs contribute 0.
  const FREQ_DAYS: Record<string, number> = { PER_DAY: 1, PER_WEEK: 7, PER_MONTH: 26 };
  const basis = (room.priceUnit ?? "PER_DAY").toUpperCase();
  const perDay = rate / (FREQ_DAYS[basis] ?? 1);
  const rNU = editable ? rentalUnits : (room.agreedUnits ?? units);
  const mNU = Math.min(editable ? mobUnitsN : (room.mobUnits ?? rNU), rNU);
  const dNU = Math.min(editable ? demobUnitsN : (room.demobUnits ?? rNU), rNU);
  const mEx = editable ? mobExcluded : room.mobExcluded;
  const dEx = editable ? demobExcluded : room.demobExcluded;
  const rentalLine = perDay * periods * rNU;
  const mobLine = mEx ? 0 : mob * mNU;
  const demobLine = dEx ? 0 : demob * dNU;
  const subtotal = rentalLine + mobLine + demobLine;
  const vat = Math.round(subtotal * 0.15);
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
      <FlowShell ar={ar} onClose={onClose}>
        <div className="p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(217,54,42,.1)" }}>
            <span className="material-icons-outlined" style={{ color: "#d9362a", fontSize: 26 }}>gavel</span>
          </div>
          <h3 className="text-[17px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>{L("This is a binding commitment", "هذا التزام مُلزِم")}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--muted,#6b7280)" }}>
            {L("Accepting confirms the agreed rate and terms with the supplier for final confirmation. Please review the terms and price before you continue.", "القبول يؤكّد السعر والشروط المتفق عليها مع المؤجّر للتأكيد النهائي. يُرجى مراجعة الشروط والسعر قبل المتابعة.")}
          </p>
          <label className="mt-4 flex items-center justify-center gap-2 text-[13px] font-bold" style={{ color: "var(--navy,#0f1e2e)" }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            {L("I understand this is binding", "أفهم أن هذا مُلزِم")}
          </label>
          <div className="mt-5 flex gap-2.5">
            <button className="flex-1 rounded-[10px] border px-4 py-2.5 text-[13px] font-bold" style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)" }} onClick={onClose}>{L("Cancel", "إلغاء")}</button>
            <button className="flex-1 rounded-[10px] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "#16a34a" }} disabled={!ack} onClick={() => { setAck(false); setBindingOk(true); }}>{L("Continue", "متابعة")}</button>
          </div>
        </div>
      </FlowShell>
    );
  }

  const canNext = page === 0 ? unresolvedCount === 0 : page === 1 ? (editable ? rateValid : true) : true;
  const canSubmit = editable ? rateValid && ack : ack;
  const doSubmit = () =>
    editable
      ? onCounter({ rate, mobPrice: mob || undefined, demobPrice: demob || undefined, rentalUnits, mobUnits: Math.min(mobUnitsN, rentalUnits), demobUnits: Math.min(demobUnitsN, rentalUnits), mobExcluded, demobExcluded })
      : onAccept(contractType);

  // A mob/demob leg row: العدد stepper (≤ rental) + editable price + ✕ cancel / + restore, or "غير مشمول".
  const legRow = (label: string, priceStr: string, setPrice: (s: string) => void, u: number, setU: (v: number) => void, ex: boolean, setEx: (b: boolean) => void) => {
    const line = ex ? 0 : num(priceStr) * Math.min(u, rentalUnits);
    return (
      <div className="mt-2.5 rounded-[10px] border px-3 py-2.5" style={{ borderColor: "var(--border,#e5e7eb)", background: ex ? "var(--surface2,#f5f7fa)" : "var(--surface1,#fff)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-bold" style={{ color: "var(--navy-mid,#33506e)" }}>{label}</span>
          {editable && (ex
            ? <button type="button" onClick={() => setEx(false)} className="text-[11px] font-bold" style={{ color: "#16a34a" }}>+ {L("Restore", "استعادة")}</button>
            : <button type="button" onClick={() => setEx(true)} className="text-[11px] font-bold" style={{ color: "#d9362a" }}>✕ {L("Cancel", "إلغاء")}</button>)}
        </div>
        {ex ? (
          <div className="mt-1.5 text-[12px] font-semibold" style={{ color: "var(--muted,#6b7280)" }}>{L("Not included — by the rentee", "غير مشمول — على المستأجر")}</div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10.5px] font-semibold" style={{ color: "var(--muted,#6b7280)" }}>{L("Units", "العدد")}</div>
              {editable ? <Stepper value={Math.min(u, rentalUnits)} min={0} max={rentalUnits} onChange={setU} /> : <b className="text-[14px]" style={{ color: "var(--navy,#0f1e2e)" }}>{Math.min(u, rentalUnits)}</b>}
            </div>
            {editable
              ? <span className="inline-flex items-center gap-1"><input type="number" inputMode="numeric" min={0} value={priceStr} onChange={(e) => setPrice(e.target.value)} className="w-20 rounded-[8px] border px-2 py-1 text-end text-[13px] font-bold outline-0" style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)" }} placeholder="0" /><span className="text-[11px]" style={{ color: "var(--muted,#6b7280)" }}>{sar}</span></span>
              : <b className="text-[13px]" style={{ color: "var(--navy,#0f1e2e)" }}>{money(num(priceStr))}</b>}
            <b className="text-[13px]" style={{ color: "var(--navy,#0f1e2e)" }}>{money(line)}</b>
          </div>
        )}
      </div>
    );
  };


  return (
    <FlowShell ar={ar} onClose={() => !busy && onClose()}>
      {/* header */}
      <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--border,#e5e7eb)" }}>
        <h3 className="text-[15px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>
          {mode === "counter" ? L("Send a counter-offer", "إرسال عرض مقابل") : L("Accept the offer", "قبول العرض")}
        </h3>
        <button onClick={() => !busy && onClose()} className="grid h-8 w-8 place-items-center rounded-full" style={{ color: "var(--muted,#6b7280)" }} aria-label={L("Close", "إغلاق")}>
          <span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      </div>

      {/* pagination dots */}
      <div className="flex items-center justify-center gap-1.5 py-2.5">
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === page ? "var(--action,#f7900a)" : "var(--border,#d4e0ec)", transition: "background .15s" }} />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        {page === 0 && (
          <div>
            <div className="mb-1.5 text-[13px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>{L("Review terms", "مراجعة الشروط")}</div>
            {room.terms.length === 0 ? (
              <p className="py-6 text-center text-[13px]" style={{ color: "var(--muted,#6b7280)" }}>{L("No terms to review.", "لا توجد شروط للمراجعة.")}</p>
            ) : (
              <DealRoomTerms terms={room.terms} ar={ar} L={L} busy={busy} resolutions={resolutions} onResolveLocal={onResolveLocal} onReopenLocal={onReopenLocal} />
            )}
            {unresolvedCount > 0 && (
              <p className="mt-2 text-[12px] font-semibold" style={{ color: "var(--warn,#b45309)" }}>
                {L(`Resolve ${unresolvedCount} differing term${unresolvedCount > 1 ? "s" : ""} to continue`, `قم بحل ${unresolvedCount} شرطًا مختلفًا للمتابعة`)}
              </p>
            )}
          </div>
        )}

        {page === 1 && (
          <div>
            <div className="mb-1.5 text-[13px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>{editable ? L("Propose your price", "اقترح سعرك") : L("Price", "السعر")}</div>
            {editable && (
              <p className="mb-1 text-[12px]" style={{ color: "var(--muted,#6b7280)" }}>{L("The supplier can accept or counter back.", "يمكن للمؤجّر القبول أو الرد بعرض مقابل.")}</p>
            )}
            {/* Base rental — العدد stepper (cap = requested) + rate + line total (÷26 prorated) */}
            <div className="mt-2.5 rounded-[10px] border px-3 py-2.5" style={{ borderColor: "var(--border,#e5e7eb)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-bold" style={{ color: "var(--navy-mid,#33506e)" }}>{L("Base rental", "الإيجار الأساسي")}</span>
                <span className="text-[11px]" style={{ color: "var(--muted,#6b7280)" }}>{periodLabel}{periods ? ` · ${periods} ${L("days", "يوم")}` : ""}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10.5px] font-semibold" style={{ color: "var(--muted,#6b7280)" }}>{L("Units", "العدد")}</div>
                  {editable
                    ? <Stepper value={rentalUnits} min={1} max={cap} onChange={(v) => { setRentalUnits(v); setMobUnitsN((u) => Math.min(u, v)); setDemobUnitsN((u) => Math.min(u, v)); }} />
                    : <b className="text-[14px]" style={{ color: "var(--navy,#0f1e2e)" }}>{rNU}</b>}
                </div>
                {editable
                  ? <span className="inline-flex items-center gap-1"><input type="number" inputMode="numeric" min={0} value={rateStr} onChange={(e) => setRateStr(e.target.value)} className="w-24 rounded-[8px] border px-2 py-1 text-end text-[14px] font-bold outline-0" style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)" }} placeholder="0" /><span className="text-[11px]" style={{ color: "var(--muted,#6b7280)" }}>{sar}</span></span>
                  : <b className="text-[14px]" style={{ color: "var(--navy,#0f1e2e)" }}>{money(rate)}</b>}
                <b className="text-[13px]" style={{ color: "var(--navy,#0f1e2e)" }}>{money(rentalLine)}</b>
              </div>
              {editable && <div className="mt-1 text-[10.5px]" style={{ color: "var(--muted,#6b7280)" }}>{L("Requested", "المطلوب")}: {cap}</div>}
            </div>

            {legRow(L("Mobilization / delivery", "التعبئة (موب)"), mobStr, setMobStr, mobUnitsN, setMobUnitsN, mobExcluded, setMobExcluded)}
            {legRow(L("Return", "الإرجاع (ديموب)"), demobStr, setDemobStr, demobUnitsN, setDemobUnitsN, demobExcluded, setDemobExcluded)}

            <div className="mt-3 rounded-[10px] px-3 py-2.5" style={{ background: "var(--surface2,#f5f7fa)" }}>
              <div className="flex items-center justify-between text-[12.5px]"><span style={{ color: "var(--muted,#6b7280)" }}>{L("Subtotal", "المجموع قبل الضريبة")}</span><b style={{ color: "var(--navy,#0f1e2e)" }}>{money(subtotal)}</b></div>
              <div className="mt-1 flex items-center justify-between text-[12.5px]"><span style={{ color: "var(--muted,#6b7280)" }}>{L("VAT 15%", "ضريبة القيمة المضافة ١٥٪")}</span><b style={{ color: "var(--navy,#0f1e2e)" }}>{money(vat)}</b></div>
              <div className="mt-1 flex items-center justify-between border-t pt-1 text-[13px]" style={{ borderColor: "var(--border,#e5e7eb)" }}><b style={{ color: "var(--navy,#0f1e2e)" }}>{L("Estimated total", "الإجمالي التقديري")}</b><b style={{ color: "var(--action,#f7900a)" }}>{money(total)}</b></div>
            </div>
            {editable && !rateValid && <p className="mt-2 text-[12px] font-semibold" style={{ color: "#d9362a" }}>{L("Enter a rate to continue", "أدخل سعرًا للمتابعة")}</p>}
          </div>
        )}

        {page === 2 && (
          <div>
            <div className="mb-1.5 text-[13px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>{L("Summary", "الملخّص")}</div>
            <div className="rounded-[10px] border px-3 py-2.5" style={{ borderColor: "var(--border,#e5e7eb)" }}>
              <div className="flex items-center justify-between text-[13px]"><span style={{ color: "var(--muted,#6b7280)" }}>{L("Rate", "السعر")}</span><b style={{ color: "var(--navy,#0f1e2e)" }}>{money(rate)} / {periodLabel}{rNU > 1 ? ` · ×${rNU}` : ""}</b></div>
              <div className="mt-1 flex items-center justify-between text-[13px]"><span style={{ color: "var(--muted,#6b7280)" }}>{L("Mobilization", "التعبئة")}</span><b style={{ color: mEx ? "var(--muted,#6b7280)" : "var(--navy,#0f1e2e)" }}>{mEx ? L("Not included", "غير مشمول") : `${money(mob)}${mNU > 1 ? ` · ×${mNU}` : ""}`}</b></div>
              <div className="mt-1 flex items-center justify-between text-[13px]"><span style={{ color: "var(--muted,#6b7280)" }}>{L("Return", "الإرجاع")}</span><b style={{ color: dEx ? "var(--muted,#6b7280)" : "var(--navy,#0f1e2e)" }}>{dEx ? L("Not included", "غير مشمول") : `${money(demob)}${dNU > 1 ? ` · ×${dNU}` : ""}`}</b></div>
              <div className="mt-1.5 flex items-center justify-between border-t pt-1.5 text-[14px]" style={{ borderColor: "var(--border,#e5e7eb)" }}><b style={{ color: "var(--navy,#0f1e2e)" }}>{L("Estimated total", "الإجمالي التقديري")}</b><b style={{ color: "var(--action,#f7900a)" }}>{money(total)}</b></div>
            </div>
            {mode === "accept" && (
              <label className="mt-3 block">
                <span className="text-[12px] font-bold" style={{ color: "var(--navy-mid,#33506e)" }}>{L("Contract type", "نوع العقد")}</span>
                <select value={contractType} onChange={(e) => setContractType(e.target.value)} className="mt-1 h-[42px] w-full rounded-[10px] border px-3 text-[14px] font-bold outline-0" style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)", background: "var(--surface1,#fff)" }}>
                  {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
            )}
            <label className="mt-3 flex items-start gap-2 text-[12.5px] font-semibold" style={{ color: "var(--navy,#0f1e2e)" }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
              {mode === "counter"
                ? L("I confirm this counter-offer is correct.", "أؤكّد أن هذا العرض المقابل صحيح.")
                : L("I confirm the agreed rate and terms.", "أؤكّد السعر والشروط المتفق عليها.")}
            </label>
            {error && <p className="mt-2 text-[12.5px] font-semibold" style={{ color: "#d9362a" }}>{error}</p>}
          </div>
        )}
      </div>

      {/* footer nav */}
      <div className="flex items-center gap-2.5 border-t px-5 py-3.5" style={{ borderColor: "var(--border,#e5e7eb)" }}>
        {page > 0 && (
          <button className="rounded-[10px] border px-4 py-2.5 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)" }} disabled={busy} onClick={() => setPage((p) => p - 1)}>{L("Back", "رجوع")}</button>
        )}
        {page < 2 ? (
          <button className="rounded-[10px] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "var(--action,#f7900a)", marginInlineStart: "auto" }} disabled={!canNext} onClick={() => setPage((p) => p + 1)}>{L("Next", "التالي")}</button>
        ) : (
          <button className="rounded-[10px] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: mode === "counter" ? "var(--action,#f7900a)" : "#16a34a", marginInlineStart: "auto" }} disabled={busy || !canSubmit} onClick={doSubmit}>
            {busy ? L("Sending…", "جارٍ الإرسال…") : mode === "counter" ? L("Send counter offer", "إرسال العرض المقابل") : L("Accept offer", "قبول العرض")}
          </button>
        )}
      </div>
    </FlowShell>
  );
}
