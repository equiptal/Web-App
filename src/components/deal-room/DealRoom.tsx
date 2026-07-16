"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import { StreamChat, type Channel } from "stream-chat";
import { useLocale } from "@/lib/i18n";
import { fetchDealRoom, fetchStreamToken, fetchDealRoomDocuments, fetchQuotation, proposeRate, acceptDeal, batchUpdateTerms, releaseDeal, withdrawAcceptance, ApiError } from "@/lib/api/client";
import type { DealRoomView, DealTerm, DealRoomDocument, DealRoomDocuments, QuotationView } from "@/lib/contract/deal-room";
import { valText, type ResolutionsMap } from "@/components/deal-room/DealRoomTerms";
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
  const dateStr = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
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
  const [priceAll, setPriceAll] = useState(false); // price-bar للكل/للوحدة toggle (per-unit default)
  const [busy, setBusy] = useState(false);
  // App parity: a single guided flow modal (3 steps: Terms → Price → Summary) handles both Counter and
  // Accept. `flowMode` picks which — null = closed.
  const [flowMode, setFlowMode] = useState<"counter" | "accept" | null>(null);
  const [counterErr, setCounterErr] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
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
  // deal-room/negotiation — ÷period PRORATED math (matches the backend quotation + app): monthly ÷26 /
  // weekly ÷7 / daily, × duration(days) × rental units; PER_JOB = rate × units. Mob/demob = price × their
  // own unit count (0 when excluded). NO duration → assume ONE FULL PERIOD so the base rate is kept as-is
  // (monthly stays monthly), NOT prorated down to a single day.
  const FREQ_DAYS: Record<string, number> = { PER_DAY: 1, PER_WEEK: 7, PER_MONTH: 26 };
  const basisU = (room.priceUnit ?? "PER_DAY").toUpperCase();
  const dppRoom = FREQ_DAYS[basisU] || 1;
  const hasDuration = room.periods != null && room.periods > 0;
  const periods = hasDuration ? (room.periods as number) : dppRoom; // duration in DAYS; default = one full period
  const rentalUnits = room.agreedUnits ?? room.numberOfUnits ?? 1;
  const mobUnitsN = Math.min(room.mobUnits ?? rentalUnits, rentalUnits);
  const demobUnitsN = Math.min(room.demobUnits ?? rentalUnits, rentalUnits);
  const units = rentalUnits; // the rental count drives the card display
  const perDayRate = rate / dppRoom;
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
  // Rental factor label: no duration / one full period → base rate as-is ("1,600/week"); a whole number
  // of periods → "× N"; a partial (day-count) duration → effective per-day rate × days ("229/day × 3 days").
  const periodCount = periods / dppRoom;
  const rentalLabel =
    basisU === "PER_JOB"
      ? nf(rate)
      : !hasDuration || periodCount === 1
        ? `${nf(rate)}/${periodLabel}`
        : Number.isInteger(periodCount)
          ? `${nf(rate)}/${periodLabel} × ${periodCount}`
          : `${nf(Math.round(perDayRate))}/${L("day", "يوم")} × ${room.periods} ${L("days", "يوم")}`;
  const closed = room.status === "CLOSED";
  const abandoned = room.status === "ABANDONED";
  const awaiting = room.status === "AWAITING_SUPPLIER_CONFIRMATION";
  // Equipment title — real name + size (like the request/bid cards), not the bare "Equipment" fallback.
  const eqName = (ar ? room.details.equipmentLabelAr || room.details.equipmentLabel : room.details.equipmentLabel) || L("Equipment", "المعدّة");
  const eqSize = ar ? room.details.equipmentSizeAr || room.details.equipmentSize : room.details.equipmentSize || room.details.equipmentSizeAr;
  // Accept is gated (like the app) until every differing term is resolved — now satisfied by a LOCAL
  // resolution, not a server round-trip.
  const unresolvedDisputed = room.terms.filter((t) => t.state === "disputed" && !resolutions[t.key]);
  const canAccept = unresolvedDisputed.length === 0;

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
              Touch device → dial; desktop → show the number inline (no call possible from a laptop). */}
          {!room.supplier.phone
            ? <span className="tb-ic call locked" title={L("Number unavailable", "الرقم غير متاح")}><span className="material-icons-outlined">call</span></span>
            : canCall
              ? <a className="tb-ic call" href={`tel:${room.supplier.phone}`} title={L("Call", "اتصال")}><span className="material-icons-outlined">call</span></a>
              : <span className="tb-ic call tb-phone" title={L("Supplier phone", "هاتف المؤجّر")} style={{ width: "auto", padding: "0 12px", gap: 7, whiteSpace: "nowrap" }}>
                  <span className="material-icons-outlined">call</span>
                  <span style={{ direction: "ltr", unicodeBidi: "plaintext", fontSize: 13.5, fontWeight: 800, userSelect: "all" }}>{room.supplier.phone}</span>
                </span>}
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
          {/* CTAs — centered below the price */}
          {closed ? (
            <div className="pb-btns">
              <button className="pb-btn accept" disabled={quoteBusy} onClick={downloadQuotation}><span className="material-icons-outlined">download</span>{L("Download quote", "تنزيل العرض")}</button>
              <button className="pb-btn ghost" onClick={() => setReleaseOpen(true)}><span className="material-icons-outlined">refresh</span>{L("Reopen", "إعادة فتح")}</button>
            </div>
          ) : abandoned ? null : room.myTurn ? (
            <div className="pb-btns">
              <button className="pb-btn neg" disabled={busy} onClick={() => openFlow("counter")}><span className="material-icons-outlined">swap_horiz</span>{L("Negotiate", "تفاوض")}</button>
              {/* Accept is gated exactly like the app: blocked while any term is disputed (acceptAllTerms 409s otherwise). */}
              <button className="pb-btn accept" disabled={busy || !canAccept} onClick={() => openFlow("accept")}><span className="material-icons-outlined">check</span>{L("Accept", "قبول")}</button>
            </div>
          ) : awaiting ? (
            <div className="pb-btns">
              {/* deal-room/negotiation — withdraw the pending acceptance (AWAITING → NEGOTIATING). */}
              <button className="pb-btn ghost" disabled={withdrawing} onClick={doWithdraw}><span className="material-icons-outlined">undo</span>{withdrawing ? L("Withdrawing…", "جارٍ السحب…") : L("Withdraw", "سحب القبول")}</button>
            </div>
          ) : null}
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
      {!closed && !abandoned && room.myTurn && !canAccept && (
        <div className="pb-strip"><span className="material-icons-outlined">error_outline</span>{L("Resolve the differing terms below before you can accept", "قم بحل الشروط المختلفة أدناه قبل القبول")}</div>
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
            // deal-room/negotiation — system narration (posted by the backend's `system_bot`) renders as a
            // centered chip (prototype's role-tinted narration), NOT a left/right bubble.
            if (m.user?.id === "system_bot") {
              return (
                <div className="sysev" key={m.id}>
                  <span className="material-icons-outlined">bolt</span>
                  <span>{m.text}</span>
                </div>
              );
            }
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

  // Supplier's standing offer total (compare card) — same ÷26 math on the room's on-table numbers.
  const supTotal = (() => {
    const rl = ((room.rate ?? 0) / (FREQ_DAYS[basis] ?? 1)) * periods * rNU;
    const ml = room.mobExcluded ? 0 : (room.mobPrice ?? 0) * mNU;
    const dl = room.demobExcluded ? 0 : (room.demobPrice ?? 0) * dNU;
    const sub = rl + ml + dl;
    return sub + Math.round(sub * 0.15);
  })();
  const showCompare = editable && room.lastCounterBy === "supplier";
  const priceDiff = Math.abs(total - supTotal);

  const STEPS = [L("Price", "السعر"), L("Terms", "الشروط"), L("Review", "المراجعة")];
  const sheetTitle = `${room.details.equipmentLabel ?? L("Equipment", "المعدّة")}${rNU > 1 ? ` — ${rNU} ${L("units", "وحدات")}` : ""}`;
  const roomCode = room.shortCode ?? "";
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
  const legTr = (label: string, sub: string, priceStr: string, setPrice: (s: string) => void, u: number, setU: (v: number) => void, ex: boolean, setEx: (b: boolean) => void, refPrice: number | null) => {
    const line = ex ? 0 : num(priceStr) * Math.min(u, rentalUnits);
    return (
      <tr className={ex ? "ex" : undefined}>
        <td>
          <div className="qp-itemcell">
            {editable && !ex && <button type="button" className="qp-legx" title={L("Exclude", "استبعاد")} onClick={() => setEx(true)}>✕</button>}
            <div>
              <div className="lbl">{label}</div>
              <div className="sub">{sub}</div>
              {editable && ex && <button type="button" className="qp-legbtn restore" onClick={() => setEx(false)}>+ {L("Restore", "استعادة")}</button>}
            </div>
          </div>
        </td>
        <td className="mut">{L("Trip", "رحلة")}</td>
        <td>{ex ? "—" : <div className="qp-qty">{editable && <span className="hint">{L("Your choice", "خيارك")}</span>}{editable ? <Stepper value={Math.min(u, rentalUnits)} min={0} max={rentalUnits} onChange={setU} /> : <b>{Math.min(u, rentalUnits)}</b>}</div>}</td>
        <td>
          {ex ? <span className="qp-excluded">{L("Excluded", "مستبعد")}</span>
            : editable ? <>{priceBox(priceStr, setPrice)}{refPrice != null && <div className={`qp-ref${changedFrom(num(priceStr), refPrice) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {nf(refPrice)}</div>}</>
            : <b className="tot">{money(num(priceStr))}</b>}
        </td>
        <td><b className="tot">{ex ? L("Not incl.", "غير مشمول") : money(line)}</b></td>
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
              <div className="s">{L("Negotiation room", "غرفة التفاوض")}{roomCode ? ` · ${roomCode}` : ""}</div>
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
                </div>
              )}
              {qhead()}
              <div className="qp-sech">{L("Price quotation", "عرض السعر")}</div>
              <div className="qp-scrollx"><table className="qp-table">
                <thead><tr><th>{L("Item", "البند")}</th><th>{L("Duration", "المدة")}</th><th>{L("Qty", "العدد")}</th><th>{L("Price", "السعر")}</th><th>{L("Total", "الإجمالي")}</th></tr></thead>
                <tbody>
                  <tr>
                    <td><div className="lbl">{L("Base rental", "الإيجار الأساسي")}</div><div className="sub">{room.details.equipmentLabel ?? periodLabel}</div></td>
                    <td className="mut">{hasDuration ? `${periods} ${L("days", "يوم")}` : "—"}</td>
                    <td><div className="qp-qty">{editable && <span className="hint">{L("Your choice", "خيارك")}</span>}{editable ? <Stepper value={rentalUnits} min={1} max={cap} onChange={(v) => { setRentalUnits(v); setMobUnitsN((u) => Math.min(u, v)); setDemobUnitsN((u) => Math.min(u, v)); }} /> : <b>{rNU}</b>}<span className="qp-qmatch">✓ {L("Qty", "العدد")} {rNU}</span></div></td>
                    <td>{editable ? <>{priceBox(rateStr, setRateStr)}{room.rate != null && <div className={`qp-ref${changedFrom(rate, room.rate) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {nf(room.rate)}</div>}</> : <b className="tot">{money(rate)}</b>}</td>
                    <td><b className="tot">{money(rentalLine)}</b></td>
                  </tr>
                  {legTr(L("Mobilization — mob", "التعبئة — موب"), L("delivery", "توصيل"), mobStr, setMobStr, mobUnitsN, setMobUnitsN, mobExcluded, setMobExcluded, room.mobPrice)}
                  {legTr(L("Return — demob", "الإرجاع — ديموب"), L("pickup", "استلام"), demobStr, setDemobStr, demobUnitsN, setDemobUnitsN, demobExcluded, setDemobExcluded, room.demobPrice)}
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
                      <div className="qp-trow"><span className="l">{L("Quantity", "الكمية")}</span><span className="v">{rNU} {L("units", "وحدة")}{hasDuration ? ` · ${periods} ${L("days", "يوم")}` : ""}</span></div>
                      <div className="qp-trow"><span className="l">{L("Base rental", "الإيجار الأساسي")}</span><span className="v">{money(rentalLine)}</span></div>
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
