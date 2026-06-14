"use client";

import { useEffect, useRef, useState } from "react";
import { StreamChat, type Channel } from "stream-chat";
import { useLocale } from "@/lib/i18n";
import { fetchDealRoom, fetchStreamToken, proposeRate, acceptDeal, resolveTerm, ApiError } from "@/lib/api/client";
import type { DealRoomView } from "@/lib/contract/deal-room";
import "@/components/deal-room/deal-room-proto.css";

type ChatMsg = { id: string; text?: string; user?: { id?: string }; created_at?: string | Date };

const STREAM_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY ?? "";
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/** Render a term value (scalar/bool/null) for display. */
function fmtVal(v: unknown, L: (en: string, ar: string) => string): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? L("Yes", "نعم") : L("No", "لا");
  if (typeof v === "number") return String(v);
  return String(v);
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

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [myStreamId, setMyStreamId] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState(false);
  const [text, setText] = useState("");
  const channelRef = useRef<Channel | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const errMsg = (e: unknown, fb: string) => (e instanceof ApiError ? (ar ? e.messageAr : e.detail) || fb : fb);

  const loadRoom = () => fetchDealRoom(id).then(setRoom).catch(() => setError(true));
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

  async function onCounter() {
    if (!room || busy) return;
    const input = window.prompt(L("Your counter — daily rate (SAR):", "عرضك المقابل — السعر اليومي (ر.س):"), String(room.rate ?? ""));
    const rate = Number(input);
    if (!input || Number.isNaN(rate) || rate <= 0) return;
    setBusy(true);
    try {
      await proposeRate(id, { proposedRate: rate, priceUnit: "PER_DAY" });
      await loadRoom();
    } catch (e) {
      window.alert(errMsg(e, L("Couldn’t send your counter — please try again.", "تعذّر إرسال عرضك المقابل — حاول مرة أخرى.")));
    } finally {
      setBusy(false);
    }
  }

  async function onResolve(key: string, action: "accept" | "counter", value?: unknown) {
    if (!room || busy) return;
    setBusy(true);
    try {
      await resolveTerm(id, key, action, value);
      await loadRoom();
    } catch (e) {
      window.alert(errMsg(e, L("Couldn’t update that term — please try again.", "تعذّر تحديث هذا الشرط — حاول مرة أخرى.")));
    } finally {
      setBusy(false);
    }
  }

  async function doAccept() {
    if (!room || busy) return;
    setBusy(true);
    try {
      await acceptDeal(id);
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
  const subtotal = rate * periods + (room.mobPrice ?? 0) + (room.demobPrice ?? 0);
  const vat = Math.round(subtotal * 0.15);
  const grand = subtotal + vat;
  const closed = room.status === "CLOSED";
  const abandoned = room.status === "ABANDONED";
  const awaiting = room.status === "AWAITING_SUPPLIER_CONFIRMATION";
  const waiting = awaiting || (!room.myTurn && room.status === "NEGOTIATING");
  const cardCls = closed ? "closed" : waiting ? "neg" : "";

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
          <span className="cbtn"><span className="material-icons-outlined">description</span></span>
          <span className={`cbtn call${closed ? "" : " locked"}`} title={closed ? L("Call", "اتصال") : L("Unlocks after the deal is confirmed", "يُفتح بعد تأكيد الصفقة")}><span className="material-icons-outlined">call</span></span>
        </div>
      </div>

      {/* price card */}
      <div className={`price-card ${cardCls}`}>
        <div className="pc-top">
          {waiting && <span className="turn-chip"><span className="material-icons-outlined">hourglass_top</span>{L("Waiting for supplier response", "في انتظار رد المؤجر")}</span>}
          <span className="terms-btn"><span className="material-icons-outlined">check_circle</span>{room.contractType ?? L("Terms", "الشروط")}</span>
        </div>
        <div className="pc-body">
          <div className="pc-rate">{L("SR", "ر.س")} {nf(rate)} <small>/ {L("day", "يوم")}</small></div>
          <div className="pc-total">{L("Est. total", "الإجمالي التقديري")}: <b>{nf(grand)} {L("SAR", "ريال")}</b></div>
          <div className={`bd-toggle${breakdown ? " open" : ""}`} onClick={() => setBreakdown((b) => !b)}>
            {breakdown ? L("Hide breakdown", "إخفاء التفصيل") : L("Show breakdown", "عرض التفصيل")}<span className="material-icons-outlined">expand_more</span>
          </div>
          {breakdown && (
            <div className="breakdown">
              <div className="brow"><span className="l">{L("Rental", "الإيجار")} ({nf(rate)} × {periods})</span><span className="v">{nf(rate * periods)}</span></div>
              {room.mobPrice ? <div className="brow"><span className="l">{L("Mobilization", "النقل")}</span><span className="v">{nf(room.mobPrice)}</span></div> : null}
              {room.demobPrice ? <div className="brow"><span className="l">{L("Return", "الإرجاع")}</span><span className="v">{nf(room.demobPrice)}</span></div> : null}
              <div className="brow"><span className="l">{L("VAT 15%", "ضريبة ١٥٪")}</span><span className="v">{nf(vat)}</span></div>
              <div className="brow tot"><span className="l">{L("Grand total", "الإجمالي")}</span><span className="v">{nf(grand)} {L("SAR", "ر.س")}</span></div>
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
              <button className="btn green" disabled={busy || room.hasDisputedTerms} onClick={() => setShowAccept(true)}><span className="material-icons-outlined">check</span>{L("Accept", "قبول")}</button>
            </div>
            {room.hasDisputedTerms && (
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

      {/* terms — show negotiable terms; the renter resolves any DIFFERING (disputed) one before accept */}
      {room.terms.length > 0 && (
        <div className="terms-card">
          <div className="tc-h"><span className="material-icons-outlined">fact_check</span>{L("Terms", "الشروط")}</div>
          {room.terms.map((tm) => {
            const disputed = tm.state === "disputed";
            const settled = tm.state === "agreed" || tm.state === "fixed" || tm.state === "soft_accepted";
            return (
              <div className={`tc-row${disputed ? " differ" : ""}`} key={tm.key + (tm.itemLabel ?? "")}>
                <div className="tc-main">
                  <span className="tc-lab">{ar ? tm.labelAr : tm.label}{tm.itemLabel ? <em> · {tm.itemLabel}</em> : null}</span>
                  {disputed ? (
                    <span className="tc-diff">
                      <span>{L("Supplier", "المؤجّر")}: <b>{fmtVal(tm.supplierDeclared, L)}</b></span>
                      <span>{L("You", "أنت")}: <b>{fmtVal(tm.renteePreference, L)}</b></span>
                    </span>
                  ) : (
                    <span className="tc-val">{fmtVal(tm.value ?? tm.supplierDeclared ?? tm.renteePreference, L)}</span>
                  )}
                </div>
                {disputed ? (
                  <div className="tc-acts">
                    <button className="tc-btn ghost" disabled={busy} onClick={() => onResolve(tm.key, "counter", tm.renteePreference)}>{L("Keep mine", "إبقاء عرضي")}</button>
                    <button className="tc-btn solid" disabled={busy} onClick={() => onResolve(tm.key, "accept")}>{L("Accept supplier’s", "قبول عرض المؤجّر")}</button>
                  </div>
                ) : settled ? (
                  <span className="tc-ok"><span className="material-icons-outlined">check_circle</span></span>
                ) : null}
              </div>
            );
          })}
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
                <div className="meta">{m.created_at ? new Date(m.created_at as string).toLocaleTimeString(ar ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      {closed || abandoned ? (
        <div className="composer ro"><span className="ro-note">{closed ? L("Deal room is closed · quotation ready", "غرفة الصفقة مغلقة · عرض السعر جاهز") : L("Deal room has been cancelled", "تم إلغاء غرفة الصفقة")}</span></div>
      ) : (
        <div className="composer">
          <span className="ib"><span className="material-icons-outlined">attach_file</span></span>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={!chatReady} placeholder={L("Type a message…", "اكتب رسالة…")} />
          <span className="ib send" onClick={send}><span className="material-icons-outlined">send</span></span>
        </div>
      )}

      {showAccept && (
        <AcceptModal ar={ar} L={L} busy={busy} rate={rate} periods={periods} grand={grand} onClose={() => !busy && setShowAccept(false)} onConfirm={doAccept} />
      )}
    </div>
  );
}

/** Styled in-app accept confirmation (replaces the browser confirm) — matches the app's deal dialog. */
function AcceptModal({ ar, L, busy, rate, periods, grand, onClose, onConfirm }: { ar: boolean; L: (en: string, arr: string) => string; busy: boolean; rate: number; periods: number; grand: number; onClose: () => void; onConfirm: () => void }) {
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
            <span style={{ color: "var(--muted,#6b7280)" }}>{L("Daily rate", "السعر اليومي")}</span>
            <span className="font-bold" style={{ color: "var(--navy,#0f1e2e)" }}>{nf(rate)} × {periods}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[14px]">
            <span className="font-bold" style={{ color: "var(--navy,#0f1e2e)" }}>{L("Grand total", "الإجمالي")}</span>
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
