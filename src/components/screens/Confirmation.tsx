"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { postableItems } from "@/lib/contract";
import { fetchRequestSubmissions, bidShareUrl, setBidDeadline, setShareLinkLogo } from "@/lib/api/client";
import { ShareForBidsSheet } from "@/components/requests/ShareForBidsSheet";
import { pin } from "@/lib/uiPins";
import { ProjectFiled } from "@/components/create/ProjectFiled";

/**
 * AC-42 confirmation — "Your request is live" (prototype: Request Sent). Animated success hero,
 * a navy card with the shareable bid-link (copy / Share / Preview) and an auto-playing "how it works"
 * carousel (Share → Supplier fills → Bid submitted → Compare), then the primary path. Bilingual + RTL.
 * The Share button + "Set a deadline" open the same ShareForBidsSheet used from the request header.
 * Brand orange kept as var(--brand) (not the prototype's var(--brand)) per our palette.
 */

// Prototype animation system — scoped so it can't leak into the app's global CSS.
const CSS = `
.rlive{min-height:100vh;padding:10px 24px 28px}
.rlive *{box-sizing:border-box}
.rlive-in{max-width:900px;margin:0 auto}
@keyframes rlv-rise{0%{transform:translateY(10px);opacity:0}100%{transform:translateY(0);opacity:1}}
@keyframes rlv-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes rlv-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes rlv-popCheck{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes rlv-ring{0%{transform:scale(.7);opacity:.5}100%{transform:scale(1.9);opacity:0}}
@keyframes rlv-ringOut{0%{transform:scale(.7);opacity:.5}100%{transform:scale(2);opacity:0}}
@keyframes rlv-dropIn{0%{opacity:0;transform:translateY(-14px) scale(.96)}60%{transform:translateY(2px) scale(1.01)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes rlv-fillBar{from{width:0}to{width:var(--w)}}
@keyframes rlv-pulse{0%,100%{}50%{outline: 8px solid color-mix(in srgb, var(--ok) 0%, transparent); outline-offset: 0}}
.rlive-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--navy-deep);color:var(--surface);font-size:13px;font-weight:700;padding:11px 18px;border-radius: var(--radius-md);z-index:60;display:inline-flex;align-items:center;gap:8px;animation:rlv-fade .25s ease both}
@media (prefers-reduced-motion: reduce){.rlive [style*="animation"]{animation:none!important}}
`;

const OR = "var(--brand)"; // brand orange (prototype used var(--brand))

export function Confirmation() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const router = useRouter();
  const { state, actions } = useRfq();
  const draft = state.draft;
  const count = draft ? postableItems(draft.items).length : 0;
  const city = draft?.project?.location?.label ?? null;

  const reqId = state.requestIds[0] ?? ""; // per-request short code (display only)
  const reqUuid = state.requestUuids[0] ?? reqId; // bid link + deadline resolve by UUID
  const [origin, setOrigin] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [renterName, setRenterName] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [groupRef, setGroupRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); }, []);
  // Land at the top of the screen — the wizard/preview swaps out in place, so without this the page
  // keeps the previous step's scroll position and opens part-way down. (AC-42 "Your request is live".)
  useEffect(() => { if (typeof window !== "undefined") window.scrollTo(0, 0); }, []);
  useEffect(() => {
    if (!reqUuid) return;
    let alive = true;
    fetchRequestSubmissions(reqUuid)
      .then((r) => { if (alive) { setRenterName(r.renterName); setDeadline(r.bidDeadline); setLogo(r.logoUrl); setGroupRef(r.groupRef); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [reqUuid]);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const shareUrl = origin && reqUuid ? bidShareUrl(origin, reqUuid, renterName) : "";
  const formUrl = shareUrl || `${origin}/supplier-bid-v2.html?preview=1`;
  // The RFQ group code (RFQ-NNNNN) when the backend emits one, else the per-request code (REQ-…).
  const refCode = groupRef ?? (reqId ? `REQ-${reqId}` : "");
  // A short, human display of the link for the pill (strip the scheme).
  const linkDisplay = shareUrl ? shareUrl.replace(/^https?:\/\//, "") : L("Preparing your link…", "يتم تجهيز رابطك…");

  const saveDeadline = (iso: string | null) => { if (reqUuid) setBidDeadline(reqUuid, iso).then(() => setDeadline(iso)).catch(() => {}); };
  const saveLogo = (url: string | null) => { if (reqUuid) setShareLinkLogo(reqUuid, url).then(() => setLogo(url)).catch(() => {}); };

  const flash = (msg: string) => { setToast(msg); if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setToast(null), 2200); };
  const onCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); flash(L("Link copied to clipboard", "تم نسخ الرابط")); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };
  // Land on the multi-item GROUP detail (resolves the whole group from this member request id) so the
  // post-submit view matches the request-details screen — not the single-request page.
  const onView = () => router.push(reqUuid ? `/requests/group/${encodeURIComponent(reqUuid)}` : "/requests");

  return (
    <div {...pin("create-confirmation")} className="rlive" dir={ar ? "rtl" : "ltr"}>
      <style>{CSS}</style>
      <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
      <div className="rlive-in">

        {/* ── success header ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", animation: "rlv-rise .5s ease both" }}>
          <div style={{ position: "relative", width: 48, height: 48, marginBottom: 6 }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ok)", opacity: 0.28, animation: "rlv-ring 1.1s ease-out .1s both" }} />
            <div style={{ position: "relative", width: 48, height: 48, borderRadius: "50%", background: "var(--ok-soft)", display: "flex", alignItems: "center", justifyContent: "center", animation: "rlv-pop .5s cubic-bezier(.2,1.3,.5,1) both" }}>
              <Svg w={24} stroke="var(--ok)" sw={3.2}><path d="M20 6L9 17l-5-5" /></Svg>
            </div>
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, color: "var(--navy-deep)", letterSpacing: "-.01em" }}>{L("Your request is live", "طلبك الآن نشط")}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--muted-dark)", marginTop: 4, lineHeight: 1.4 }}>
            {refCode && <span style={{ color: "var(--navy-deep)", fontWeight: 700 }}>{refCode}</span>}
            {refCode && " · "}
            {count > 0 && `${count} ${count === 1 ? L("item", "بند") : L("items", "بنود")} · `}
            {city
              ? L(`broadcast to matching suppliers in ${city}. Bids will start landing in your requests.`, `تم إرساله للمؤجّرين المطابقين في ${city}. ستبدأ العروض بالوصول إلى طلباتك.`)
              : L("broadcast to matching suppliers. Bids will start landing in your requests.", "تم إرساله للمؤجّرين المطابقين. ستبدأ العروض بالوصول إلى طلباتك.")}
          </div>
        </div>

        {/* ── one card, stacked: a compact horizontal share strip on top, the how-it-works demo below ── */}
        <div style={{ marginTop: 14, background: "var(--navy-deep)", borderRadius: "var(--radius-lg)", overflow: "hidden", animation: "rlv-rise .55s ease .05s both" }}>

          {/* share strip — invite line + inline link/copy/share/preview, kept to two tight rows */}
          <div style={{ padding: "16px 22px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
              <div style={{ width: 34, height: 34, borderRadius: "var(--radius-md)", background: "color-mix(in srgb, var(--brand-light) 16%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Svg w={18} stroke="var(--brand-light)" sw={2.2}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></Svg>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <span style={{ fontSize: 15.5, fontWeight: 800, color: "var(--surface)" }}>{L("Know suppliers already? Invite them", "تعرف مؤجّرين؟ ادعهم")}</span>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-light)", marginInlineStart: 8 }}>{L("Share a private link. Their bids land right here.", "شارك رابطاً خاصاً: تصل عروضهم هنا مباشرة.")}</span>
              </div>
              <button onClick={() => setShareOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--brand-light)", flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <Svg w={14} stroke="var(--brand-light)" sw={2.1}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
                {deadline ? L("Edit deadline", "تعديل الموعد") : L("Set a deadline", "حدد موعداً نهائياً")}
              </button>
            </div>

            {/* link + share + preview — one inline row */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240, display: "flex", alignItems: "center", gap: 9, background: "var(--navy-deep)", border: "1px solid var(--navy)", borderRadius: "var(--radius-md)", padding: "7px 7px 7px 14px" }}>
                <Svg w={15} stroke="var(--muted)" sw={2} style={{ flexShrink: 0 }}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--border-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "ltr", textAlign: ar ? "right" : "left" }}>{linkDisplay}</span>
                <button onClick={onCopy} disabled={!shareUrl} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: "var(--radius-sm)", border: "none", cursor: shareUrl ? "pointer" : "default", fontFamily: "inherit", fontWeight: 700, fontSize: 13, background: copied ? "var(--ok)" : "var(--background)", color: copied ? "var(--surface)" : "var(--navy-deep)", transition: "background .2s ease", whiteSpace: "nowrap", flexShrink: 0 }}>
                  <span className="material-icons-outlined" style={{ fontSize: 16 }}>{copied ? "check" : "content_copy"}</span>{copied ? L("Copied", "تم النسخ") : L("Copy", "نسخ")}
                </button>
              </div>
              <button onClick={() => setShareOpen(true)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 20px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 14, background: OR, color: "var(--surface)", whiteSpace: "nowrap" }}>
                <Svg w={17} stroke="currentColor" sw={2.3}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></Svg>
                {L("Share link", "شارك الرابط")}
              </button>
              <a href={formUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--navy)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, background: "var(--navy-deep)", color: "var(--border)", whiteSpace: "nowrap", textDecoration: "none" }}>
                <Svg w={17} stroke="currentColor" sw={2.2}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></Svg>
                {L("Preview form", "معاينة النموذج")}
              </a>
            </div>
          </div>

          {/* how it works · inside the same card */}
          <HowItWorks ar={ar} L={L} />
        </div>

        {/* ── primary path ── */}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", animation: "rlv-rise .65s ease .15s both" }}>
          <button onClick={onView} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px 26px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 15, background: "var(--navy-deep)", color: "var(--surface)" }}>
            {L("View request & bids", "عرض الطلب والعروض")}
            <span style={ar ? { transform: "scaleX(-1)", display: "inline-flex" } : { display: "inline-flex" }}><Svg w={17} stroke="currentColor" sw={2.4}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></Svg></span>
          </button>
          <button onClick={() => actions.reset()} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 22px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 15, background: "var(--surface)", color: "var(--navy-deep)" }}>
            <Svg w={16} stroke="currentColor" sw={2.4}><path d="M12 5v14M5 12h14" /></Svg>
            {L("New request", "طلب جديد")}
          </button>
        </div>
      </div>

      {toast && <div className="rlive-toast"><span className="material-icons-outlined" style={{ fontSize: 17 }}>check_circle</span>{toast}</div>}

      <ShareForBidsSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
        formUrl={formUrl}
        renterName={renterName}
        requestCode={refCode || null}
        deadline={deadline}
        onSaveDeadline={saveDeadline}
        logoUrl={logo}
        onSaveLogo={saveLogo}
        ar={ar}
        L={L}
      />
      {/* PROJ (W-T24) — the offer, after a PROJECTLESS submit only. A renter who already filed
          this under a site has been asked nothing and is asked nothing now.

          It opens ITSELF as a dialog (owner, 2026-08-31): as a panel it sat under *View request &
          bids*, which is the control a renter presses the moment this screen appears, so the offer
          was below the thing that navigates away from it. No wrapper here — the dialog owns its own
          geometry, and its own "already dismissed" check decides whether it renders at all. */}
      {!draft?.projectId && draft && (
        <ProjectFiled
          requestId={state.requestUuids[0] ?? null}
          project={draft.project}
          preferences={draft.preferences}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── How it works — auto-playing 4-scene carousel ─────────────────────────── */

function HowItWorks({ ar, L }: { ar: boolean; L: (e: string, a: string) => string }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setStep((s) => (s + 1) % 4), 2600);
    return () => clearInterval(id);
  }, [playing]);

  const scenes = [
    { url: "rentbid.sa/requests", tag: L("Share", "المشاركة") },
    { url: "rentbid.sa/r/00196", tag: L("Supplier fills the form", "المؤجّر يملأ النموذج") },
    { url: "rentbid.sa/r/00196", tag: L("Bid submitted", "تم إرسال العرض") },
    { url: "rentbid.sa/requests", tag: L("Compare", "المقارنة") },
  ];
  const sc = scenes[step];

  const dot = (i: number) => (
    <button key={i} onClick={() => { setStep(i); }} style={{ border: "none", cursor: "pointer", height: 7, borderRadius: "var(--radius-sm)", padding: 0, transition: "all .3s ease", width: i === step ? 22 : 7, background: i === step ? OR : "var(--navy)" }} aria-label={`Step ${i + 1}`} />
  );
  const navBtn = (dir: "prev" | "next") => (
    <button onClick={() => setStep((s) => (dir === "next" ? (s + 1) % 4 : (s + 3) % 4))} style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--navy)", background: "var(--navy-deep)", color: "var(--muted-light)", cursor: "pointer", fontSize: 13, lineHeight: 1 }} aria-label={dir}>
      <span style={ar ? { transform: "scaleX(-1)", display: "inline-block" } : undefined}>{dir === "prev" ? "‹" : "›"}</span>
    </button>
  );

  return (
    <div style={{ borderTop: "1px solid var(--navy)", padding: "16px 22px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 2px", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 30, height: 30, borderRadius: "var(--radius-sm)", background: OR, color: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>▶</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--surface)", lineHeight: 1.1 }}>{L("How it works", "كيف تعمل")}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{L(`Step ${step + 1} of 4`, `الخطوة ${step + 1} من ٤`)} · {sc.tag}</div>
          </div>
        </div>
        <button onClick={() => setPlaying((p) => !p)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--navy)", background: "var(--navy-deep)", color: "var(--border)", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          {playing ? `⏸ ${L("Pause", "إيقاف")}` : `▶ ${L("Play", "تشغيل")}`}
        </button>
      </div>

      {/* browser stage */}
      <div style={{ background: "var(--navy-deep)", border: "1px solid var(--navy)", borderRadius: "var(--radius-lg) var(--radius-lg) 0 0", padding: "8px 12px", display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--danger)" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--brand-light)" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--ok)" }} />
        <div style={{ flex: 1, marginInlineStart: 6, background: "var(--navy-deep)", border: "1px solid var(--navy)", borderRadius: "var(--radius-sm)", padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--muted-light)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "ltr" }}>{sc.url}</div>
      </div>
      <div style={{ height: 240, background: "var(--surface2)", border: "1px solid var(--navy)", borderTop: "none", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)", position: "relative", overflow: "hidden" }}>
        {step === 0 && <SceneShare key="s0" ar={ar} L={L} />}
        {step === 1 && <SceneForm key="s1" ar={ar} L={L} />}
        {step === 2 && <SceneDone key="s2" ar={ar} L={L} />}
        {step === 3 && <SceneCompare key="s3" ar={ar} L={L} />}
      </div>

      {/* dots */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 13 }}>
        {navBtn("prev")}
        {[0, 1, 2, 3].map(dot)}
        {navBtn("next")}
      </div>
    </div>
  );
}

/* Scene 0 — share the request */
function SceneShare({ L }: { ar?: boolean; L: (e: string, a: string) => string }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: "18px 20px", animation: "rlv-fade .35s ease both" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "var(--muted)" }}>{L("REQUESTS FOR QUOTE", "طلبات عروض الأسعار")}</div>
      <div style={{ marginTop: 10, background: "var(--navy-deep)", borderRadius: "var(--radius-lg)", padding: "15px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--surface)" }}>{L("Riyadh: Qiddiya Project", "الرياض: مشروع القدية")}</span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "var(--ok-soft)", background: "color-mix(in srgb, var(--ok) 16%, transparent)", padding: "2px 7px", borderRadius: "var(--radius-lg)" }}>● {L("Open", "مفتوح")}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-light)", marginTop: 3 }}>REQ-00196 · 1 Jul 2026</div>
        <div style={{ marginTop: 13, display: "flex", alignItems: "center", gap: 8, background: "var(--navy-deep)", border: "1px solid var(--navy)", borderRadius: "var(--radius-md)", padding: "6px 6px 6px 12px" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: "var(--border-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "ltr" }}>rentbid.sa/r/00196</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: "var(--radius-sm)", background: OR, color: "var(--surface)", fontWeight: 800, fontSize: 11.5 }}>⤴ {L("Share", "مشاركة")}</span>
          <span style={{ padding: "7px 11px", borderRadius: "var(--radius-sm)", background: "var(--navy-deep)", border: "1px solid var(--navy)", color: "var(--border)", fontWeight: 700, fontSize: 11.5, animation: "rlv-pulse 1.6s ease infinite" }}>⧉ {L("Copy", "نسخ")}</span>
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-dark)" }}>{L("Send to any supplier you trust", "أرسله لأي مؤجّر تثق به")}</span>
        <div style={{ display: "flex" }}>
          {["A", "B", "C"].map((c, i) => (
            <span key={c} style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--navy-deep)", color: "var(--surface)", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--surface2)", marginInlineStart: i ? -6 : 0 }}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Scene 1 — supplier fills the bid form */
function SceneForm({ L }: { ar?: boolean; L: (e: string, a: string) => string }) {
  const terms = [
    { label: L("OPERATOR", "المشغّل"), want: L("Included", "مشمول"), delay: "0s", yes: true },
    { label: L("CERT", "الشهادة"), want: "TÜV", delay: ".08s", yes: true },
    { label: L("YEAR", "السنة"), want: "≥ 2018", delay: ".16s", yes: true },
  ];
  const pricing = [
    { item: L("Rental", "الإيجار"), unit: L("month", "شهر"), qty: 1, price: "SAR 1,900", delay: "0s" },
    { item: L("Delivery", "التوصيل"), unit: L("trip", "رحلة"), qty: 1, price: "SAR 200", delay: ".1s" },
    { item: L("Return", "الإرجاع"), unit: L("trip", "رحلة"), qty: 1, price: "SAR 85", delay: ".2s" },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", animation: "rlv-fade .35s ease both" }}>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--surface3)", padding: "10px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ width: 32, height: 32, borderRadius: "var(--radius-sm)", background: "var(--info)", color: "var(--surface)", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>AB</span>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em", color: "var(--muted)" }}>{L("REQUEST FROM", "الطلب من")}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--navy-deep)" }}>{L("Al Bawani Contracting", "شركة البواني للمقاولات")}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "14px 18px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-dark)", marginBottom: 8 }}>📋 {L("TERMS: CAN YOU MEET EACH?", "الشروط: هل يمكنك الالتزام؟")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {terms.map((t) => (
            <div key={t.label} style={{ background: "var(--surface)", border: "1px solid var(--surface3)", borderRadius: "var(--radius-sm)", padding: "8px 9px", animation: `rlv-dropIn .45s ease ${t.delay} both` }}>
              <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".03em", color: "var(--muted)" }}>{t.label}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-dark)", margin: "2px 0 6px" }}>{L("Wants", "يريد")}: <span style={{ color: "var(--navy-deep)", fontWeight: 800 }}>{t.want}</span></div>
              <div style={{ display: "flex", gap: 4 }}>
                <span style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 800, padding: "3px 0", borderRadius: "var(--radius-sm)", background: "var(--ok-soft)", color: "var(--ok-deep)" }}>✓ {L("Yes", "نعم")}</span>
                <span style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 800, padding: "3px 0", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--muted)" }}>{L("No", "لا")}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-dark)", margin: "13px 0 7px" }}>🧾 {L("PRICING", "التسعير")}</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface3)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
          {pricing.map((p, i) => (
            <div key={p.item} style={{ display: "grid", gridTemplateColumns: "1.4fr .7fr .4fr 1fr", alignItems: "center", padding: "7px 11px", borderBottom: i < pricing.length - 1 ? "1px solid var(--background)" : "none", fontSize: 11 }}>
              <span style={{ fontWeight: 800, color: "var(--navy-deep)" }}>{p.item}</span>
              <span style={{ fontWeight: 600, color: "var(--muted)" }}>{p.unit}</span>
              <span style={{ fontWeight: 600, color: "var(--muted)" }}>×{p.qty}</span>
              <span style={{ justifySelf: "end", fontWeight: 800, color: "var(--ok-deep)", background: "var(--ok-soft)", padding: "2px 9px", borderRadius: "var(--radius-sm)", animation: `rlv-dropIn .4s ease ${p.delay} both` }}>{p.price}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "0 18px 14px", flexShrink: 0 }}>
        <div style={{ textAlign: "center", padding: 11, borderRadius: "var(--radius-md)", background: OR, color: "var(--surface)", fontWeight: 800, fontSize: 13, animation: "rlv-pulse 1.6s ease infinite" }}>➤ {L("Submit bid", "إرسال العرض")}</div>
      </div>
    </div>
  );
}

/* Scene 2 — bid submitted */
function SceneDone({ L }: { ar: boolean; L: (e: string, a: string) => string }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "rlv-fade .35s ease both" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--surface3)", borderRadius: "var(--radius-lg)", padding: "28px 34px", textAlign: "center", }}>
        <div style={{ position: "relative", width: 54, height: 54, margin: "0 auto 14px" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ok)", opacity: 0.25, animation: "rlv-ringOut 1.1s ease-out .1s both" }} />
          <div style={{ position: "relative", width: 54, height: 54, borderRadius: "50%", background: "var(--ok-soft)", display: "flex", alignItems: "center", justifyContent: "center", animation: "rlv-popCheck .5s cubic-bezier(.2,1.3,.5,1) both" }}>
            <Svg w={25} stroke="var(--ok)" sw={3.2}><path d="M20 6L9 17l-5-5" /></Svg>
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--navy-deep)" }}>{L("Bid submitted", "تم إرسال العرض")}</div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-dark)", marginTop: 6, lineHeight: 1.5, maxWidth: 260 }}>{L("Their offer is now with you on Moedatech: ready to compare side by side.", "عرضهم الآن لديك على معداتك: جاهز للمقارنة جنباً إلى جنب.")}</div>
        <div style={{ display: "inline-block", marginTop: 13, fontSize: 13, fontWeight: 800, color: "var(--navy-deep)", background: "var(--background)", padding: "7px 15px", borderRadius: "var(--radius-sm)" }}>💵 SAR 2,185</div>
      </div>
    </div>
  );
}

/* Scene 3 — compare bids */
function SceneCompare({ L }: { ar: boolean; L: (e: string, a: string) => string }) {
  const rows = [
    { i: "A", name: L("Gulf Co", "شركة الخليج"), badge: "✓", price: "SAR 2,185", pct: "100%", barColor: "var(--ok)", border: "var(--ok-soft)", avBg: "var(--ok-soft)", avColor: "var(--ok-deep)", delay: "0s" },
    { i: "B", name: L("Najd Rentals", "نجد للتأجير"), badge: "", price: "SAR 2,410", pct: "84%", barColor: OR, border: "var(--surface3)", avBg: "var(--surface2)", avColor: "var(--info)", delay: ".12s" },
    { i: "C", name: L("Saraya Equip", "سرايا للمعدات"), badge: "", price: "SAR 2,640", pct: "70%", barColor: "var(--muted-light)", border: "var(--surface3)", avBg: "var(--surface2)", avColor: "var(--info)", delay: ".24s" },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, padding: "18px 20px", animation: "rlv-fade .35s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--navy-deep)" }}>{L("Forklift · 10 ton: 3 bids", "رافعة شوكية · ١٠ طن: ٣ عروض")}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ok-deep)", background: "var(--ok-soft)", padding: "3px 8px", borderRadius: "var(--radius-lg)" }}>{L("1/1 fulfilled", "١/١ مكتمل")}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((c) => (
          <div key={c.i} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: `1px solid ${c.border}`, borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
            <span style={{ width: 32, height: 32, borderRadius: "var(--radius-sm)", background: c.avBg, color: c.avColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{c.i}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--navy-deep)" }}>{c.name} {c.badge && <span style={{ color: "var(--ok-deep)" }}>{c.badge}</span>}</span>
                <span style={{ fontSize: 12.5, fontWeight: 900, color: "var(--navy-deep)" }}>{c.price}</span>
              </div>
              <div style={{ height: 6, borderRadius: "var(--radius-sm)", background: "var(--surface2)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: "var(--radius-sm)", background: c.barColor, "--w": c.pct, animation: `rlv-fillBar 1s ease ${c.delay} both` } as React.CSSProperties} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 11, textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{L("Broadcast & shared-link bids, side by side", "عروض البث والرابط المشترك، جنباً إلى جنب")}</div>    </div>
  );
}

/** Inline stroke SVG icon (24×24 viewBox), matching the prototype's line icons. */
function Svg({ w, stroke, sw, children, style }: { w: number; stroke: string; sw: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </svg>
  );
}
