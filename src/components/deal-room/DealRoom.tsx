"use client";

import { useEffect, useRef, useState } from "react";
import { StreamChat, type Channel } from "stream-chat";
import { useLocale } from "@/lib/i18n";
import { fetchDealRoom, fetchStreamToken, fetchDealRoomDocuments, fetchQuotation, proposeRate, acceptDeal, batchUpdateTerms, ApiError } from "@/lib/api/client";
import type { DealRoomView, DealRoomDocument, DealRoomDocuments, QuotationView } from "@/lib/contract/deal-room";
import { DealRoomTerms, type ResolutionsMap } from "@/components/deal-room/DealRoomTerms";
import "@/components/deal-room/deal-room-proto.css";

type StreamAttachment = { type?: string; image_url?: string; thumb_url?: string; asset_url?: string; title?: string; mime_type?: string; file_size?: number; fallback?: string };
type ChatMsg = { id: string; text?: string; user?: { id?: string }; created_at?: string | Date; attachments?: StreamAttachment[] };

const STREAM_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY ?? "";
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Client-rendered confirmed-deal quotation (the backend server PDF is disabled — the client renders it
 * now, app parity). Values mirror the app's `extractQuotationData`: rental = agreedRate × durationFactor
 * (PER_DAY = duration days, PER_WEEK = ceil(days/7), PER_MONTH = ceil(days/30), PER_JOB = 1); estimated
 * total = (rental + mobilization + demobilization) × units; VAT 15%. Agreed values come from the confirmed
 * Quotation row (+ the deal room for mob/demob/units/fixed terms/supplier name; renter name from /api/me).
 */
function buildQuotationHtml(room: DealRoomView, q: QuotationView, renteeName: string, ar: boolean, L: (en: string, arr: string) => string): string {
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
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
  const rentalTotal = hasTotal ? rate * (durationFactor as number) : 0;
  const subtotal = hasTotal ? (rentalTotal + mob + demob) * units : 0;
  const vat = Math.round(subtotal * 0.15);
  const total = subtotal + vat;
  const dateStr = new Date().toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const ref = (q.quotationNumber ?? "").slice(0, 8).toUpperCase();
  const money = (v: number) => `${nf(v)} ${sar}`;

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
  const termRow = (label: string, v: unknown) => `<div class="kv"><span>${esc(label)}</span><b>${esc(valFmt(v))}</b></div>`;
  const agreedRows = q.agreedTerms.filter((t) => t.key !== "PRICE").map((t) => termRow(ar ? t.labelAr : t.label, t.value)).join("");
  const fixedRows = room.terms.filter((t) => t.state === "fixed").map((t) => termRow(ar ? t.labelAr : t.label, t.value ?? t.platformDefault)).join("");
  const party = (label: string, name: string, phone: string | null, email: string | null) =>
    `<div class="party"><div class="plabel">${esc(label)}</div><div class="pname">${esc(name || "—")}</div>${phone ? `<div class="pmeta" dir="ltr">${esc(phone)}</div>` : ""}${email ? `<div class="pmeta" dir="ltr">${esc(email)}</div>` : ""}</div>`;
  const contractType = q.contractType ?? room.contractType;

  return `<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(L("Confirmed Quotation", "عرض سعر مؤكّد"))}</title>
  <style>
  *{box-sizing:border-box;} body{font-family:system-ui,'Segoe UI',Tahoma,sans-serif;color:#12263a;margin:0;padding:28px;background:#fff;}
  .q{max-width:800px;margin:0 auto;}
  .qh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f7900a;padding-bottom:14px;margin-bottom:18px;}
  .qt{font-size:22px;font-weight:800;color:#1c3550;} .qsub{font-size:12px;color:#6b8fa8;font-weight:700;text-align:${ar ? "left" : "right"};}
  .ref{display:inline-block;background:#eff4f9;border-radius:100px;padding:3px 10px;font-size:11px;font-weight:800;color:#2a4f72;margin-bottom:6px;}
  .card{border:1px solid #e4edf5;border-radius:12px;padding:14px 16px;margin-bottom:16px;}
  .card-h{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#6b8fa8;margin-bottom:8px;}
  .kv{display:flex;justify-content:space-between;gap:16px;font-size:13px;padding:6px 0;border-bottom:1px solid #f2f6fa;} .kv:last-child{border-bottom:0;} .kv span{color:#6b8fa8;font-weight:600;} .kv b{font-weight:800;color:#12263a;}
  .kv.tot b{color:#f7900a;font-size:15px;}
  .parties{display:flex;gap:20px;margin-bottom:16px;} .party{flex:1;border:1px solid #e4edf5;border-radius:12px;padding:12px 14px;}
  .plabel{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#6b8fa8;} .pname{font-size:16px;font-weight:800;margin-top:4px;color:#1c3550;} .pmeta{font-size:12px;color:#6b8fa8;font-weight:600;margin-top:3px;}
  @media print{body{padding:0;}}
  </style></head><body><div class="q">
    <div class="qh"><div>${ref ? `<div class="ref">#${esc(ref)}</div>` : ""}<div class="qt">${esc(L("Confirmed Quotation", "عرض سعر مؤكّد"))}</div></div><div class="qsub">${esc(dateStr)}${contractType ? `<br>${esc(L("Contract", "العقد"))}: ${esc(contractType)}` : ""}</div></div>
    <div class="parties">
      ${party(L("Supplier", "المؤجّر"), room.supplier.name, q.supplierPhone, q.supplierEmail)}
      ${party(L("Rentee", "المستأجر"), renteeName, q.renteePhone, q.renteeEmail)}
    </div>
    <div class="card"><div class="card-h">${esc(L("Price breakdown", "تفصيل السعر"))}</div>
      <div class="kv"><span>${esc(L("Agreed rate", "السعر المتفق عليه"))}</span><b>${esc(money(rate))} / ${esc(periodLabel)}${units > 1 ? ` · ${esc(L("per unit", "لكل وحدة"))}` : ""}</b></div>
      ${mob ? `<div class="kv"><span>${esc(L("Mobilization", "النقل"))}</span><b>${esc(money(mob))}</b></div>` : ""}
      ${demob ? `<div class="kv"><span>${esc(L("Return", "الإرجاع"))}</span><b>${esc(money(demob))}</b></div>` : ""}
      ${units > 1 ? `<div class="kv"><span>${esc(L("Units", "الوحدات"))}</span><b>${units}</b></div>` : ""}
      ${hasTotal
        ? `<div class="kv"><span>${esc(L("Subtotal before VAT", "المجموع قبل الضريبة"))}</span><b>${esc(money(subtotal))}</b></div><div class="kv"><span>${esc(L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"))}</span><b>${esc(money(vat))}</b></div><div class="kv tot"><span>${esc(L("Estimated total", "الإجمالي التقديري"))}</span><b>${esc(money(total))}</b></div>`
        : `<div class="kv tot"><span>${esc(L("Estimated total", "الإجمالي التقديري"))}</span><b>${esc(L("As operated", "حسب التشغيل"))}</b></div>`}
    </div>
    ${agreedRows ? `<div class="card"><div class="card-h">${esc(L("Agreed terms", "الشروط المتفق عليها"))}</div>${agreedRows}</div>` : ""}
    ${fixedRows ? `<div class="card"><div class="card-h">${esc(L("Fixed terms", "الشروط الثابتة"))}</div>${fixedRows}</div>` : ""}
  </div></body></html>`;
}

export function DealRoom({ id, onTitle }: { id: string; onTitle?: (t: string) => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);

  const [room, setRoom] = useState<DealRoomView | null>(null);
  const [error, setError] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [showCounter, setShowCounter] = useState(false);
  const [counterErr, setCounterErr] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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

  const errMsg = (e: unknown, fb: string) => (e instanceof ApiError ? (ar ? e.messageAr : e.detail) || fb : fb);

  const loadRoom = () => fetchDealRoom(id).then(setRoom).catch(() => setError(true));

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
        ch.on("message.new", () => setMessages([...ch.state.messages] as ChatMsg[]));
      } catch {
        /* chat unavailable — the rest of the room still works */
      }
    })();
    return () => {
      cancelled = true;
      channelRef.current = null;
      client?.disconnectUser().catch(() => {});
    };
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

  /** Upload + send any media (image/pdf/file/video) via GetStream; backend sets no type restriction. */
  async function sendFiles(files: FileList | null) {
    const ch = channelRef.current;
    if (!ch || !files || !files.length) return;
    setUploading(true);
    try {
      const attachments: StreamAttachment[] = [];
      for (const file of Array.from(files)) {
        const isImg = file.type.startsWith("image/");
        const res = isImg ? await ch.sendImage(file) : await ch.sendFile(file);
        attachments.push(
          isImg
            ? { type: "image", image_url: res.file, fallback: file.name }
            : { type: "file", asset_url: res.file, title: file.name, mime_type: file.type, file_size: file.size },
        );
      }
      const body = text.trim();
      await ch.sendMessage({ text: body || undefined, attachments });
      setText("");
    } catch {
      /* upload/send failed — leave the composer untouched so the renter can retry */
    } finally {
      setUploading(false);
    }
  }

  function onCounter() {
    if (!room || busy) return;
    setCounterErr(null);
    setShowCounter(true);
  }

  // Collect a term resolution locally (no server call — app parity). Submitted on Counter/Accept.
  const setResolution = (key: string, action: "accept" | "counter", value?: unknown) =>
    setResolutions((r) => ({ ...r, [key]: { action, value } }));
  const clearResolution = (key: string) =>
    setResolutions((r) => { const n = { ...r }; delete n[key]; return n; });
  const resolutionUpdates = () =>
    Object.entries(resolutions).map(([termKey, r]) => ({ termKey, action: r.action, value: r.value }));

  async function submitCounter(next: { rate: number; mobPrice?: number; demobPrice?: number }) {
    if (!room || busy) return;
    setBusy(true);
    setCounterErr(null);
    try {
      // App parity (DealRoomCounterWithRate): batch the locally-resolved term updates, THEN propose the
      // daily rate + mobilization/return prices — all as one counter move.
      const updates = resolutionUpdates();
      if (updates.length) await batchUpdateTerms(id, updates);
      await proposeRate(id, { proposedRate: next.rate, priceUnit: room.priceUnit ?? "PER_DAY", mobPrice: next.mobPrice, demobPrice: next.demobPrice });
      setResolutions({});
      await loadRoom();
      setShowCounter(false);
    } catch (e) {
      setCounterErr(errMsg(e, L("Couldn’t send your counter — please try again.", "تعذّر إرسال عرضك المقابل — حاول مرة أخرى.")));
    } finally {
      setBusy(false);
    }
  }

  async function doAccept() {
    if (!room || busy) return;
    setBusy(true);
    try {
      // App parity (accept-all-terms): submit the locally-collected term resolutions together with the
      // accept. contractType defaults to "formal"; agreedUnits is omitted (no assembled deals on web).
      await acceptDeal(id, "formal", { termResolutions: resolutionUpdates() });
      setResolutions({});
      await loadRoom();
      setShowAccept(false);
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
  const units = room.numberOfUnits || 1; // rate is PER-UNIT → rental × units (consistent with cards/quotations)
  const rentalTotal = rate * periods * units;
  const subtotal = rentalTotal + (room.mobPrice ?? 0) + (room.demobPrice ?? 0);
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
          <span className="role">{L("Supplier", "مؤجّر")}</span>
        </div>
        <div className="cacts">
          <span className="cbtn" role="button" tabIndex={0} title={L("Documents", "المستندات")} onClick={() => setShowDocs(true)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowDocs(true)}><span className="material-icons-outlined">description</span></span>
          <span className={`cbtn call${closed ? "" : " locked"}`} title={closed ? L("Call", "اتصال") : L("Unlocks after the deal is confirmed", "يُفتح بعد تأكيد الصفقة")}><span className="material-icons-outlined">call</span></span>
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
              <div className="brow"><span className="l">{L("Rental", "الإيجار")} ({nf(rate)} × {periods}{units > 1 ? ` × ${units}` : ""})</span><span className="v">{nf(rentalTotal)}</span></div>
              {room.mobPrice ? <div className="brow"><span className="l">{L("Mobilization", "النقل")}</span><span className="v">{nf(room.mobPrice)}</span></div> : null}
              {room.demobPrice ? <div className="brow"><span className="l">{L("Return", "الإرجاع")}</span><span className="v">{nf(room.demobPrice)}</span></div> : null}
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
              <button className="btn outline" disabled={busy} onClick={onCounter}><span className="material-icons-outlined">swap_horiz</span>{L("Counter", "تفاوض")}</button>
              {/* Accept is gated exactly like the app: blocked while any term is disputed (acceptAllTerms 409s otherwise). */}
              <button className="btn green" disabled={busy || !canAccept} onClick={() => setShowAccept(true)}><span className="material-icons-outlined">check</span>{L("Accept", "قبول")}</button>
            </div>
            {!canAccept && (
              <div className="turn-strip" style={{ color: "var(--warn,#b45309)" }}>
                <span className="material-icons-outlined" style={{ color: "var(--warn,#b45309)" }}>error_outline</span>
                {L("Resolve the differing terms below before you can accept", "قم بحل الشروط المختلفة أدناه قبل القبول")}
              </div>
            )}
          </>
        ) : (
          <div className="turn-strip"><span className="material-icons-outlined">hourglass_top</span>{awaiting ? L("Sent — awaiting supplier confirmation", "أُرسل — بانتظار تأكيد المؤجر") : L("Waiting for the supplier", "في انتظار المؤجر")}</div>
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
      {room.terms.length > 0 && (
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
          {quoteErr && <span className="ro-note quote-err">{quoteErr}</span>}
        </div>
      ) : abandoned ? (
        <div className="composer ro"><span className="ro-note">{L("Deal room has been cancelled", "تم إلغاء غرفة الصفقة")}</span></div>
      ) : (
        <div className="composer">
          <button type="button" className="ib" disabled={!chatReady || uploading} onClick={() => fileInputRef.current?.click()} aria-label={L("Attach a file", "إرفاق ملف")}>
            <span className="material-icons-outlined">{uploading ? "hourglass_top" : "attach_file"}</span>
          </button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { void sendFiles(e.target.files); e.target.value = ""; }} />
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={!chatReady} placeholder={L("Type a message…", "اكتب رسالة…")} />
          <span className="ib send" onClick={send}><span className="material-icons-outlined">send</span></span>
        </div>
      )}

      {showAccept && (
        <AcceptModal ar={ar} L={L} busy={busy} rate={rate} periods={periods} units={units} grand={grand} onClose={() => !busy && setShowAccept(false)} onConfirm={doAccept} />
      )}

      {showCounter && (
        <CounterModal ar={ar} L={L} busy={busy} error={counterErr} initialRate={room.rate ?? 0} initialMob={room.mobPrice ?? 0} initialDemob={room.demobPrice ?? 0} onClose={() => !busy && setShowCounter(false)} onSubmit={submitCounter} />
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

/** Styled in-app accept confirmation (replaces the browser confirm) — matches the app's deal dialog. */
function CounterModal({ ar, L, busy, error, initialRate, initialMob, initialDemob, onClose, onSubmit }: { ar: boolean; L: (en: string, arr: string) => string; busy: boolean; error: string | null; initialRate: number; initialMob: number; initialDemob: number; onClose: () => void; onSubmit: (next: { rate: number; mobPrice?: number; demobPrice?: number }) => void }) {
  const [val, setVal] = useState(initialRate > 0 ? String(initialRate) : "");
  const [mob, setMob] = useState(initialMob > 0 ? String(initialMob) : "");
  const [demob, setDemob] = useState(initialDemob > 0 ? String(initialDemob) : "");
  const rate = Number(val);
  const valid = val.trim() !== "" && !Number.isNaN(rate) && rate > 0;
  const numOrUndef = (s: string) => { const n = Number(s); return s.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : undefined; };
  const submit = () => onSubmit({ rate, mobPrice: numOrUndef(mob), demobPrice: numOrUndef(demob) });
  const priceField = (label: string, v: string, set: (s: string) => void, unit: string, autoFocus = false) => (
    <label className="mt-3 block">
      <span className="text-[12px] font-bold" style={{ color: "var(--navy-mid,#33506e)" }}>{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-[10px] border px-3" style={{ borderColor: "var(--border,#e5e7eb)", background: "var(--surface2,#f5f7fa)" }}>
        <input type="number" inputMode="numeric" min={0} autoFocus={autoFocus} className="h-[44px] w-full bg-transparent text-[15px] font-bold outline-0" style={{ color: "var(--navy,#0f1e2e)" }} value={v} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && valid && !busy) submit(); }} placeholder="0" />
        <span className="flex-none text-[12px] font-bold" style={{ color: "var(--muted,#6b7280)" }}>{unit}</span>
      </div>
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--surface1,#fff)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(247,144,9,.12)" }}>
          <span className="material-icons-outlined" style={{ color: "var(--action,#f7900a)", fontSize: 26 }}>swap_horiz</span>
        </div>
        <h3 className="text-center text-[17px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>{L("Send a counter-offer", "إرسال عرض مقابل")}</h3>
        <p className="mt-1.5 text-center text-[13px] leading-relaxed" style={{ color: "var(--muted,#6b7280)" }}>
          {L("Propose your daily rate and delivery/return prices. The supplier can accept or counter back.", "اقترح سعرك اليومي وأسعار التوصيل/الإرجاع. يمكن للمؤجّر قبولها أو الرد بعرض مقابل.")}
        </p>
        {priceField(L("Your daily rate (SAR)", "سعرك اليومي (ر.س)"), val, setVal, L("SAR / day", "ر.س / يوم"), true)}
        {priceField(L("Mobilization / delivery (SAR)", "النقل / التوصيل (ر.س)"), mob, setMob, L("SAR", "ر.س"))}
        {priceField(L("Return (SAR)", "الإرجاع (ر.س)"), demob, setDemob, L("SAR", "ر.س"))}
        {error && <p className="mt-2 text-[12.5px] font-semibold" style={{ color: "#dc2626" }}>{error}</p>}
        <div className="mt-5 flex gap-2.5">
          <button className="flex-1 rounded-[10px] border px-4 py-2.5 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)" }} disabled={busy} onClick={onClose}>{L("Cancel", "إلغاء")}</button>
          <button className="flex-1 rounded-[10px] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "var(--action,#f7900a)" }} disabled={busy || !valid} onClick={submit}>{busy ? L("Sending…", "جارٍ الإرسال…") : L("Send counter", "إرسال العرض")}</button>
        </div>
      </div>
    </div>
  );
}

function AcceptModal({ ar, L, busy, rate, periods, units, grand, onClose, onConfirm }: { ar: boolean; L: (en: string, arr: string) => string; busy: boolean; rate: number; periods: number; units: number; grand: number; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--surface1,#fff)] p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(22,163,74,.12)" }}>
          <span className="material-icons-outlined" style={{ color: "#16a34a", fontSize: 26 }}>handshake</span>
        </div>
        <h3 className="text-[17px] font-extrabold" style={{ color: "var(--navy,#0f1e2e)" }}>{L("Accept all terms?", "قبول جميع الشروط؟")}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--muted,#6b7280)" }}>
          {L("This sends your acceptance to the supplier for final confirmation. The agreed terms will be locked in.", "سيتم إرسال قبولك للمؤجر للتأكيد النهائي. سيتم تثبيت الشروط المتفق عليها.")}
        </p>
        <div className="mt-3.5 rounded-[12px] px-4 py-3 text-start" style={{ background: "var(--surface2,#f5f7fa)" }}>
          <div className="flex items-center justify-between text-[13px]">
            <span style={{ color: "var(--muted,#6b7280)" }}>{L("Rate", "السعر")}</span>
            <span className="font-bold" style={{ color: "var(--navy,#0f1e2e)" }}>{nf(rate)} × {periods}{units > 1 ? ` × ${units}` : ""}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[14px]">
            <span className="font-bold" style={{ color: "var(--navy,#0f1e2e)" }}>{L("Estimated total", "الإجمالي التقديري")}</span>
            <span className="font-extrabold" style={{ color: "#16a34a" }}>{nf(grand)} {L("SAR", "ر.س")}</span>
          </div>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button className="flex-1 rounded-[10px] border px-4 py-2.5 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: "var(--border,#e5e7eb)", color: "var(--navy,#0f1e2e)" }} disabled={busy} onClick={onClose}>{L("Cancel", "إلغاء")}</button>
          <button className="flex-1 rounded-[10px] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "#16a34a" }} disabled={busy} onClick={onConfirm}>{busy ? L("Accepting…", "جارٍ القبول…") : L("Accept", "قبول")}</button>
        </div>
      </div>
    </div>
  );
}
