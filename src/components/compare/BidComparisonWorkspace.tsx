"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchMyRequests, fetchBids, startDealRoom, recommendBids, askBids, parseBid, captureBidEvents, fetchDealRoomDocuments } from "@/lib/api/client";
import { groupRequests, type RequestGroup } from "@/lib/contract/requests";
import { CERT_LABEL, type BidCard, type CertCode } from "@/lib/contract/bids";
import { buildItemComparison, sortByPreset, type BidColumn, type Preset, type CostResponsibility } from "@/lib/contract/comparison";
import { bidColumnToComputed, normalizedBidToBidCard, presetToAgent, type RecommendResult } from "@/lib/contract/agent-bids";
import { EquipImg } from "@/components/requests/EquipImg";
import { useSharedLinkMock, tagSharedLinkBids } from "@/lib/mock/shared-link-bids";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

// Prototype palette (bid-comparison-workspace.html) — exact hex for the bits Tailwind tokens don't cover.
const C = {
  navy: "#1C3550", navyDeep: "#12263A", navyMid: "#2A4F72", gold: "#B8860B",
  action: "#F79009", actionDim: "#FFF4E5", rentee: "#2563EB", renteeDim: "#EAF1FE", supplier: "#0D8A6A",
  success: "#1DAF58", successBg: "#E7F7EE", warning: "#D4780A", warningBg: "#FFF3E0",
  danger: "#D9362A", dangerBg: "#FCEBEA", muted: "#6B8FA8",
  surface2: "#EFF4F9", surface3: "#E4EDF5", border: "#D4E0EC", line: "#E4EDF5", disabled: "#9BB3C8",
};

/** The five cost-responsibility items (AC-11/12). */
const RESP_META: { key: CostResponsibility["key"]; en: string; ar: string; icon: string }[] = [
  { key: "fuel", en: "Fuel", ar: "الوقود", icon: "local_gas_station" },
  { key: "maintenance", en: "Maintenance", ar: "الصيانة", icon: "build" },
  { key: "overtime", en: "Overtime", ar: "العمل الإضافي", icon: "more_time" },
  { key: "operator_food", en: "Operator food", ar: "طعام المشغّل", icon: "restaurant" },
  { key: "operator_transport_accommodation", en: "Operator transport & accom", ar: "تنقّل وإقامة المشغّل", icon: "card_travel" },
];

interface LocationNode { key: string; label: string; groups: RequestGroup[]; itemCount: number; bidCount: number }
interface ChatMsg { role: "mansour" | "user"; text: string }

// Level 2 equipment-safety certs only (tuv/spsp/saso/saso_technical_inspection → TUV/SPSP/SASO).
// Operator certs are a declared deal-room term (not held-doc pills); LC + SASO-registration are
// Level 1 company docs — neither belongs in this equipment-cert set.
const EQUIP_CERTS: CertCode[] = ["TUV", "SPSP", "SASO"];

/** Map Mansour's semantic suggestion icon → a material icon. */
const SUGGEST_ICON: Record<string, string> = {
  fuel: "local_gas_station", maintenance: "build", overtime: "more_time", food: "restaurant",
  transport: "local_shipping", recency: "new_releases", shield: "verified_user", help: "help",
};

export function BidComparisonWorkspace() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const sar = L("SAR", "ر.س");
  const certLabel = (c: CertCode) => (ar ? CERT_LABEL[c].ar : CERT_LABEL[c].en);
  const periodLabel = (u: string | null) => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  };

  const [groups, setGroups] = useState<RequestGroup[] | null>(null);
  const [error, setError] = useState(false);
  const [activeLoc, setActiveLoc] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [bids, setBids] = useState<BidCard[] | null>(null);
  const [bidsLoading, setBidsLoading] = useState(false);
  const mockEnabled = useSharedLinkMock(); // staging demo: label one bid "via shared link"
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<Preset>("best");
  const [busy, setBusy] = useState(false);
  const [renterCosts, setRenterCosts] = useState<Partial<Record<CostResponsibility["key"], number>>>({});
  // Mansour judgement layer (live when connected; deterministic fallback otherwise).
  const [uploaded, setUploaded] = useState<BidCard[]>([]);
  const [rec, setRec] = useState<RecommendResult | null>(null);
  const [agentLive, setAgentLive] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [freeApplied, setFreeApplied] = useState("");
  const [fxEcho, setFxEcho] = useState<string | null>(null);
  // UI chrome state to mirror the prototype.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectorOpen, setSelectorOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false); // the AI chat is a side drawer (the re-rank bar stays inline)
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [costAsk, setCostAsk] = useState<{ type: "resp"; key: CostResponsibility["key"]; label: string } | { type: "mob"; bidId: string; label: string } | null>(null);
  const [costInput, setCostInput] = useState("");
  const [renterMob, setRenterMob] = useState<Record<string, number>>({}); // renter's own delivery (mob/demob) estimate per bid
  // A parsed quote the agent flagged (match.needs_confirmation) — added to the comparison only on confirm.
  const [confirmAdd, setConfirmAdd] = useState<{ card: BidCard; warnings: string[] } | null>(null);
  const prevRankRef = useRef<RecommendResult["ranking"] | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preselectRef = useRef<Set<string> | null>(null); // bid ids to pre-select from ?bids= (one-shot, from My Bids)
  const router = useRouter();

  function toast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }

  useEffect(() => {
    let active = true;
    fetchMyRequests()
      .then((d) => active && setGroups(groupRequests(d.requests)))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  const locations = useMemo<LocationNode[]>(() => {
    if (!groups) return [];
    const map = new Map<string, LocationNode>();
    for (const g of groups) {
      const key = g.locationLabel || g.city || g.id;
      const node = map.get(key) ?? { key, label: g.locationLabel || g.city || L("Location", "الموقع"), groups: [], itemCount: 0, bidCount: 0 };
      node.groups.push(g);
      node.itemCount += g.items.length;
      node.bidCount += g.totalBids;
      map.set(key, node);
    }
    // Only surface locations that actually have bids to compare (fall back to all if none do).
    const all = [...map.values()];
    const withBids = all.filter((n) => n.bidCount > 0);
    const ranked = (withBids.length ? withBids : all).sort((a, b) => b.bidCount - a.bidCount);
    // Demo ordering: Airport project first.
    const isAir = (n: LocationNode) => /airport|مطار/i.test(n.label || "");
    return [...ranked.filter(isAir), ...ranked.filter((n) => !isAir(n))];
  }, [groups, ar]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!locations.length || activeLoc) return;
    const sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const groupId = sp?.get("group") ?? null;
    const itemId = sp?.get("item") ?? null;
    const bidsParam = sp?.get("bids"); // pre-selected bids passed from My Bids → Compare
    if (bidsParam) preselectRef.current = new Set(bidsParam.split(",").filter(Boolean));
    if (groupId) {
      const node = locations.find((l) => l.groups.some((g) => g.id === groupId));
      if (node) {
        setActiveLoc(node.key);
        const g = node.groups.find((gg) => gg.id === groupId);
        const target = (itemId && g?.items.find((i) => i.id === itemId)) || g?.items.find((i) => i.bidCount > 0) || g?.items[0];
        if (target) setActiveItem(target.id);
        return;
      }
    }
    setActiveLoc(locations[0].key);
  }, [locations, activeLoc]);

  const loc = locations.find((l) => l.key === activeLoc) ?? locations[0];
  const group = loc?.groups.find((g) => g.totalBids > 0) ?? loc?.groups[0];
  const items = loc ? loc.groups.flatMap((g) => g.items) : [];

  useEffect(() => {
    if (items.length && !items.some((i) => i.id === activeItem)) {
      const firstWithBids = items.find((i) => i.bidCount > 0) ?? items[0];
      setActiveItem(firstWithBids?.id ?? null);
    }
  }, [loc?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeItem) { setBids(null); return; }
    let active = true;
    setBidsLoading(true);
    setUploaded([]); setRec(null); setAgentLive(false); setFreeText(""); setFreeApplied(""); setFxEcho(null); setChat([]); setConfirmAdd(null); setRenterMob({}); prevRankRef.current = null;
    fetchBids(activeItem)
      .then((d) => active && setBids(d.bids))
      .catch(() => active && setBids([]))
      .finally(() => active && setBidsLoading(false));
    return () => { active = false; };
  }, [activeItem]);

  // Auto-refresh: while any compared bid has an active deal room, poll its live term state (locked →
  // agreed, counter → negotiating, deviation → conflict) so the matrix + Terms stay in sync without a
  // manual reload. Refreshes ONLY `bids` — the renter's working state (costs, selection, uploads, AI
  // rank, chat) is preserved. Paused while the tab is hidden; re-syncs immediately on regaining focus.
  const hasActiveDealRoom = useMemo(() => (bids ?? []).some((b) => !!b.dealRoomId), [bids]);
  useEffect(() => {
    if (!activeItem || !hasActiveDealRoom) return;
    let active = true;
    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return; // don't poll a hidden tab
      fetchBids(activeItem).then((d) => { if (active) setBids(d.bids); }).catch(() => {});
    };
    const id = setInterval(refresh, 20000); // 20s — fast enough for live negotiation, light on the API
    const onVis = () => { if (typeof document !== "undefined" && !document.hidden) refresh(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      clearInterval(id);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    };
  }, [activeItem, hasActiveDealRoom]);

  const reqDurationDays = items.find((i) => i.id === activeItem)?.durationDays ?? null;
  // Staging demo: tag the first real bid as off-platform "via shared link" (rest = via Moedatech app).
  const raw = useMemo<BidCard[] | null>(() => {
    if (!bids) return null;
    const tagged = mockEnabled ? tagSharedLinkBids(bids) : bids;
    return [...tagged, ...uploaded];
  }, [bids, uploaded, mockEnabled]);
  const comparison = useMemo(() => (raw ? buildItemComparison(raw, { renterCosts, requestDurationDays: reqDurationDays, requestResponsibilities: raw[0]?.requestResponsibilities ?? {} }) : null), [raw, renterCosts, reqDurationDays]);
  useEffect(() => {
    if (!comparison) return;
    const all = comparison.columns.map((c) => c.bid.id);
    const pre = preselectRef.current;
    if (pre && pre.size) {
      const inter = all.filter((id) => pre.has(id)); // honor the My Bids selection once
      setSelected(new Set(inter.length ? inter : all));
      preselectRef.current = null;
    } else {
      setSelected(new Set(all));
    }
  }, [comparison]);

  const allCols = useMemo(() => (comparison ? [...comparison.columns, ...comparison.excluded] : []), [comparison]);
  const baseCols = useMemo(() => allCols.filter((c) => selected.has(c.bid.id)), [allCols, selected]);
  const detCols = useMemo(() => sortByPreset(baseCols, preset), [baseCols, preset]);
  const cols = useMemo(() => {
    if (agentLive && rec?.ranking?.length) {
      // String() both sides so a number/string id mismatch can't break the match.
      const rank = new Map(rec.ranking.map((r) => [String(r.bid_id), r.rank] as const));
      // Only trust the agent order when it actually covers the current columns; otherwise fall back to
      // the deterministic preset sort (which always reflects the chosen rank) so the table never freezes.
      const covered = baseCols.length > 0 && baseCols.every((c) => rank.has(String(c.bid.id)));
      if (covered) return [...baseCols].sort((a, b) => rank.get(String(a.bid.id))! - rank.get(String(b.bid.id))!);
    }
    return detCols;
  }, [baseCols, detCols, agentLive, rec]);
  // The pick = the agent's pick when it maps to a visible column, else the top-ranked column. Either way it
  // tracks the current order, so the highlight moves when you re-rank.
  const pickIdRaw = rec?.recommendation.pick_bid_id != null ? String(rec.recommendation.pick_bid_id) : null;
  const pickId = agentLive && pickIdRaw && cols.some((c) => String(c.bid.id) === pickIdRaw)
    ? pickIdRaw
    : cols.length > 1 ? cols[0]?.bid.id ?? null : null;
  const suggestions = rec?.suggestions ?? []; // context-aware what-if chips from Mansour (replace the hardcoded set)
  const awarded = bids?.find((b) => b.status === "ACCEPTED") ?? null;
  const activeItemObj = items.find((i) => i.id === activeItem);
  const durationDays = activeItemObj?.durationDays ?? null;
  const units = activeItemObj?.item?.qty ?? 1;
  const mobByRentee = activeItemObj?.mobByRentee ?? null; // who YOUR request assigned delivery to (true = you, false = supplier)
  // Displayed total = the supplier's STATED costs + 15% VAT + the renter's own entered costs (responsibilities
  // on them + their delivery estimate). Always shown as a running total of what's known — never "not stated".
  const VAT = 0.15;
  // A cost the renter adds counts toward their total unless the supplier already covers it (AC-12).
  // (Matches the chips: you can only add a cost where bidSide !== "supplier".)
  const renterAddBid = (c: BidColumn) => c.costResponsibilities.reduce((s, x) => (x.renterCost && x.bidSide !== "supplier" ? s + x.renterCost : s), 0) + (renterMob[c.bid.id] ?? 0);
  // Mob/demob are PER-UNIT when the supplier handles them (× quantity, like the rate) — not one-time.
  const mobDemobUnit = (c: BidColumn) => (c.mob.stated ? c.mob.value : 0) + (c.demob.stated ? c.demob.value : 0);
  const mobDemobTotal = (c: BidColumn) => mobDemobUnit(c) * units;
  const supplierStated = (c: BidColumn) => (c.rental.stated ? c.rental.value : 0) + mobDemobTotal(c);
  // L1 company documents (real compliance fields) — shown in the column identity. Present → ✓, required-
  // but-missing (LC/SASO when the request requires it) → ✗, otherwise hidden.
  const companyDocChips = (bid: BidColumn["bid"]) => {
    const k = bid.compliance;
    return [
      { lbl: L("CR", "السجل التجاري"), has: k.activityLicense, req: false, hint: "commercial" },
      { lbl: L("VAT", "الرقم الضريبي"), has: k.taxNumber, req: false, hint: "vat" },
      { lbl: L("National address", "العنوان الوطني"), has: k.nationalAddress, req: false, hint: "national" },
      { lbl: L("Local Content", "المحتوى المحلي"), has: k.localContent, req: bid.requiredCerts.includes("LC"), hint: "local" },
      { lbl: L("SASO registration", "تسجيل ساسو"), has: k.saso, req: bid.requiredCerts.includes("SASO"), hint: "saso" },
    ].filter((d) => d.has || d.req);
  };
  // Equipment/operator terms are ACKNOWLEDGED from the request today (not yet supplier-declared) — a
  // seamless prompt to confirm them with that supplier in the deal room (only when a room exists).
  // Open the actual document file for a chip. Real files live in the supplier's deal room (presigned
  // URLs) — fetch them, open the one matching the chip; fall back to the deal-room documents view.
  // (Without a deal room there are no viewable files in the bid payload — see the T6-B/doc-URL backend note.)
  const openDoc = async (c: BidColumn, hint: string) => {
    if (!c.bid.dealRoomId) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const h = norm(hint);
    try {
      const d = await fetchDealRoomDocuments(c.bid.dealRoomId);
      const all = [...d.companyDocuments, ...d.equipmentDocuments];
      const m = all.find((x) => { const t = norm(x.type), l = norm(x.label); return t.includes(h) || l.includes(h) || h.includes(t); });
      if (m?.url) { window.open(m.url, "_blank", "noopener"); return; }
    } catch { /* fall through */ }
    router.push(`/deal-room/${c.bid.dealRoomId}`);
  };
  /** A clickable doc chip — opens the actual file when the bid has a deal room (else static). */
  const docChip = (c: BidColumn, label: string, has: boolean, hint: string) => {
    const style = has ? { background: C.successBg, color: C.success } : { background: C.dangerBg, color: C.danger };
    const inner = <><span className="material-icons-outlined" style={{ fontSize: 11 }}>{has ? "check" : "close"}</span>{label}{c.bid.dealRoomId && has && <span className="material-icons-outlined" style={{ fontSize: 11, opacity: 0.7 }}>open_in_new</span>}</>;
    return c.bid.dealRoomId && has
      ? <button type="button" onClick={() => openDoc(c, hint)} title={L("Open document", "افتح المستند")} className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={style}>{inner}</button>
      : <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={style}>{inner}</span>;
  };
  const verifyLink = (c: BidColumn) => c.bid.dealRoomId ? (
    <button type="button" onClick={() => router.push(`/deal-room/${c.bid.dealRoomId}`)} className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: C.rentee }}>
      {L("verify in deal room", "تحقّق في غرفة الصفقة")}<span className="material-icons-outlined" style={{ fontSize: 12, transform: ar ? "scaleX(-1)" : undefined }}>arrow_forward</span>
    </button>
  ) : null;
  const grandTotal = (c: BidColumn) => Math.round(supplierStated(c) * (1 + VAT)) + renterAddBid(c);
  const hasCost = (c: BidColumn) => supplierStated(c) > 0 || renterAddBid(c) > 0;
  const grandList = cols.filter(hasCost).map(grandTotal);
  const lowestGrand = grandList.length ? Math.min(...grandList) : null;
  const maxGrand = grandList.length ? Math.max(...grandList) : 1;

  // Ask Mansour to rank + recommend whenever the candidate set / preset / free text / costs change.
  const recKey = useMemo(() => baseCols.map((c) => c.bid.id).join(","), [baseCols]);
  const costsKey = useMemo(() => JSON.stringify(renterCosts), [renterCosts]);
  useEffect(() => {
    if (baseCols.length < 1) { setRec(null); setAgentLive(false); return; }
    let active = true;
    const hasRequirements = baseCols.some((c) => [...c.cost, ...c.equipment, ...c.trust].some((r) => r.state !== "grey"));
    setRecLoading(true);
    recommendBids({
      request: { hasRequirements },
      bids: baseCols.map(bidColumnToComputed),
      preference: { preset: presetToAgent(preset), free_text: freeApplied || null },
      previous_ranking: prevRankRef.current,
    })
      .then((r) => {
        if (!active) return;
        if (r.agent && r.result) { setRec(r.result); setAgentLive(true); prevRankRef.current = r.result.ranking; }
        else { setRec(null); setAgentLive(false); }
      })
      .finally(() => active && setRecLoading(false));
    return () => { active = false; };
  }, [recKey, preset, freeApplied, costsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mansour's recommendation — LIVE: recomputes whenever the ranking/pick changes (preset, re-rank,
  // costs). Rendered as the pinned first bubble in the chat, so the agent's advice tracks the user's rank.
  const recoMsg = useMemo<string | null>(() => {
    const pickCol = cols.find((c) => c.bid.id === pickId) ?? cols[0];
    if (!pickCol) return null;
    if (agentLive && rec) {
      const reasons = rec.recommendation.reasons.map((x) => x.text).join(" ");
      const conf = rec.recommendation.confidence != null ? ` · ${Math.round(rec.recommendation.confidence * 100)}% ${L("confidence", "ثقة")}` : "";
      const flags = rec.recommendation.cost_shift_flags.length ? L(` Watch: ${rec.recommendation.cost_shift_flags.join(", ")} lands on you.`, ` انتبه: ${rec.recommendation.cost_shift_flags.join("، ")} عليك.`) : "";
      return L(`I'd go with ${pickCol.bid.supplierName}${conf}. ${reasons}${flags}`, `أنصح بـ ${pickCol.bid.supplierName}${conf}. ${reasons}${flags}`);
    }
    return L(`From the stated data, ${pickCol.bid.supplierName} ranks first. Connect your AI assistant for the full reasoning.`,
             `من البيانات المذكورة، ${pickCol.bid.supplierName} الأول. اربط مساعدك الذكي للتفسير الكامل.`);
  }, [cols, pickId, agentLive, rec]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBid = (id: string) => {
    setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSection = (k: string) => setCollapsed((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function choosePreset(p: Preset, labelEn: string, labelAr: string) {
    setPreset(p);
    setFxEcho(null); setFreeText(""); setFreeApplied("");
    captureBidEvents([{ event_type: "choice", request_id: activeItem, payload: { kind: "preset", value: presetToAgent(p) } }]);
    toast(L(`Re-ranked by ${labelEn} — best match highlighted`, `أُعيد الترتيب حسب ${labelAr} — أُبرز الأنسب`));
  }

  // Free-text echo — read the words into ranking factors, exactly like the prototype.
  const fxFactors = [
    { k: ["price", "cost", "cheap", "budget", "سعر", "تكلفة", "رخيص"], en: "lowest all-in cost", ar: "أقل تكلفة شاملة" },
    { k: ["reliab", "trust", "verified", "ثقة", "موثوق", "سمعة"], en: "trusted, verified suppliers", ar: "مؤجرون موثوقون" },
    { k: ["fuel", "وقود"], en: "fuel included", ar: "الوقود مشمول" },
    { k: ["clos", "near", "distance", "قريب", "مسافة", "الموقع"], en: "closest to your site", ar: "الأقرب لموقعك" },
    { k: ["new", "recent", "year", "model", "حديث", "جديد", "موديل"], en: "newer machines", ar: "معدّات أحدث" },
    { k: ["fast", "quick", "urgent", "arriv", "soon", "سريع", "عاجل", "وصول"], en: "fastest to arrive", ar: "الأسرع وصولاً" },
    { k: ["cert", "safety", "tüv", "tuv", "spsp", "saso", "شهادة", "سلامة"], en: "required certifications", ar: "الشهادات المطلوبة" },
  ];
  function applyFreeText() {
    const v = freeText.trim();
    if (!v) { setFxEcho(null); return; }
    const low = v.toLowerCase();
    const hits = fxFactors.filter((f) => f.k.some((w) => low.includes(w)));
    const labels = hits.map((f) => (ar ? f.ar : f.en));
    setFxEcho(
      labels.length
        ? L(`Got it — I'll rank by ${labels.join(", ")}, then re-sort the table. Saved for next time.`, `تمام — سأرتّب حسب ${labels.join("، ")}، ثم أُعيد ترتيب الجدول. حُفظ للمرة القادمة.`)
        : L(`Got it — I'll factor in “${v}” and re-sort the table.`, `تمام — سآخذ «${v}» بعين الاعتبار وأُعيد الترتيب.`)
    );
    setFreeApplied(v);
    captureBidEvents([{ event_type: "chat_message", request_id: activeItem, payload: { text: v } }]);
    toast(L("Re-ranked the bids", "أُعيد ترتيب العروض"));
  }

  function addCost(key: CostResponsibility["key"], label: string) {
    setCostInput("");
    setCostAsk({ type: "resp", key, label });
  }
  function addMobCost(bidId: string, label: string) {
    setCostInput("");
    setCostAsk({ type: "mob", bidId, label });
  }
  // Undo a renter-entered estimate → back to the supplier-only view.
  function removeCost(key: CostResponsibility["key"]) {
    setRenterCosts((p) => { const n = { ...p }; delete n[key]; return n; });
    toast(L("Removed your estimate", "أُزيل تقديرك"));
  }
  function removeMobCost(bidId: string) {
    setRenterMob((p) => { const n = { ...p }; delete n[bidId]; return n; });
    toast(L("Removed your estimate", "أُزيل تقديرك"));
  }
  function submitCost() {
    if (!costAsk) return;
    const n = parseInt(costInput.replace(/[^0-9]/g, ""), 10);
    if (n) {
      if (costAsk.type === "resp") setRenterCosts((p) => ({ ...p, [costAsk.key]: (p[costAsk.key] ?? 0) + n }));
      else setRenterMob((p) => ({ ...p, [costAsk.bidId]: n }));
      toast(L("Added your estimate — added to the total so you can compare the real cost", "أُضيف تقديرك — يُضاف للإجمالي لمقارنة التكلفة الحقيقية"));
    }
    setCostAsk(null);
  }

  async function onUpload(file: File) {
    setUploadOpen(false);
    toast(L("Reading the quote…", "جارٍ قراءة العرض…"));
    try {
      const data = await fileToBase64(file);
      const r = await parseBid({ attachments: [{ type: file.type || "application/octet-stream", filename: file.name, data }], request_context: { subtype: activeItemObj?.item?.name ?? null } });
      if (!r.agent) { toast(L("Quote upload needs your AI assistant — not connected.", "رفع العرض يحتاج مساعدك الذكي — غير متصل.")); return; }
      if (r.result && r.result.ok) {
        const card = normalizedBidToBidCard(r.result.bid, { duration: durationDays, units });
        // The agent flags a mismatch (wrong type/size, different location/dates) → confirm before adding (AC-26/36).
        if (r.result.match?.needs_confirmation) {
          setConfirmAdd({ card, warnings: r.result.match.warnings ?? [] });
        } else {
          setUploaded((p) => [...p.filter((b) => b.id !== card.id), card]);
          toast(L(`Added ${card.supplierName}'s quote from the file.`, `أُضيف عرض ${card.supplierName} من الملف.`));
        }
      } else {
        toast(L("Couldn't read that file. Nothing was added.", "تعذّرت قراءة الملف. لم يُضف شيء."));
      }
    } catch { toast(L("Couldn't read that file. Nothing was added.", "تعذّرت قراءة الملف.")); }
  }
  function confirmAddBid() {
    if (!confirmAdd) return;
    const card = confirmAdd.card;
    setUploaded((p) => [...p.filter((b) => b.id !== card.id), card]);
    toast(L(`Added ${card.supplierName}'s quote — flagged for review.`, `أُضيف عرض ${card.supplierName} — مع تنبيه للمراجعة.`));
    setConfirmAdd(null);
  }

  async function goDealRoom(bid: BidCard, kind: "award" | "negotiate") {
    if (busy) return;
    captureBidEvents([{
      event_type: kind === "award" ? "award" : "choice",
      request_id: activeItem, bid_id: bid.id, supplier_id: bid.supplierId,
      payload: kind === "award" ? { chosen_bid: bid.id, beaten_bids: baseCols.map((c) => c.bid.id).filter((id) => id !== bid.id) } : { kind: "negotiate" },
    }]);
    toast(kind === "award" ? L(`Opening ${bid.supplierName} deal room…`, `يتم فتح غرفة صفقة ${bid.supplierName}…`) : L("Opening the deal room…", "يتم فتح غرفة الصفقة…"));
    if (bid.dealRoomId) { router.push(`/deal-room/${bid.dealRoomId}`); return; }
    setBusy(true);
    try { const { id } = await startDealRoom(bid.id); if (id) router.push(`/deal-room/${id}`); else setBusy(false); }
    catch { setBusy(false); }
  }

  // The chat uses /bids/ask (LLM narration) — NOT /recommend. It renders data.reply and applies the
  // (possibly re-ranked) ranking/pick so the table re-renders from a chat instruction too.
  async function sendChat(text: string) {
    const v = text.trim();
    if (!v) return;
    setChat((c) => [...c, { role: "user", text: v }]);
    setChatInput("");
    const r = await askBids({
      message: v,
      request: { hasRequirements: true },
      bids: baseCols.map(bidColumnToComputed),
      current_ranking: prevRankRef.current,
    });
    if (r.agent && r.result) {
      const a = r.result;
      setAgentLive(true);
      prevRankRef.current = a.ranking;
      // Keep the prior recommend's reasons/flags for the pinned bubble; update the order + pick + confidence.
      setRec((prev) => prev
        ? { ...prev, ranking: a.ranking, recommendation: { ...prev.recommendation, pick_bid_id: a.pick_bid_id, confidence: a.confidence }, interpretation: a.interpretation, changes: a.changes, suggestions: a.suggestions ?? prev.suggestions }
        : { ranking: a.ranking, recommendation: { pick_bid_id: a.pick_bid_id, confidence: a.confidence, reasons: [], cost_shift_flags: [] }, interpretation: a.interpretation, changes: a.changes, suggestions: a.suggestions });
      setChat((c) => [...c, { role: "mansour", text: a.reply }]);
    } else {
      setChat((c) => [...c, { role: "mansour", text: L("I couldn't reach the assistant just now — the ranking above is from your stated data.", "تعذّر الوصول للمساعد الآن — الترتيب أعلاه من بياناتك المذكورة.") }]);
    }
  }

  // Export the current comparison as a print-ready sheet (Save as PDF from the print dialog).
  function exportPdf() {
    if (!cols.length) { toast(L("Nothing to export yet.", "لا شيء للتصدير بعد.")); return; }
    const w = window.open("", "_blank");
    if (!w) { toast(L("Allow pop-ups to export the PDF.", "اسمح بالنوافذ المنبثقة للتصدير.")); return; }
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
    const itemName = (ar ? activeItemObj?.item?.nameAr : activeItemObj?.item?.name) ?? L("Item", "صنف");
    const when = new Date().toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    const yes = L("Yes", "نعم"), no = L("No", "لا"), sup = L("Supplier", "المؤجّر"), you = L("You", "أنت");
    const m = (x: { value: number; stated: boolean }) => (x.stated ? `${sar} ${nf(x.value)}` : "—");
    const certsOf = (c: BidColumn, pick: CertCode[], held: CertCode[] = c.bid.heldCertCodes) => { const h = held.filter((x) => pick.includes(x)).map(certLabel); return h.length ? esc(h.join(", ")) : "—"; };
    const ownedOf = (c: BidColumn) => { const o = (c.bid.ownershipDocs ?? []).map((x) => (ar ? x.labelAr : x.labelEn)); return o.length ? esc(o.join(", ")) : "—"; };
    const docsOf = (c: BidColumn) => { const d: string[] = []; const k = c.bid.compliance; if (k.localContent) d.push(L("Local Content", "المحتوى المحلي")); if (k.saso) d.push("SASO"); if (k.activityLicense) d.push(L("Activity license", "رخصة النشاط")); if (k.taxNumber) d.push(L("Tax number", "الرقم الضريبي")); if (k.nationalAddress) d.push(L("National address", "العنوان الوطني")); return d.length ? esc(d.join(", ")) : "—"; };
    const rental = (c: BidColumn) => c.bid.price == null ? "—" : c.rental.stated ? `${sar} ${nf(c.bid.price)}/${periodLabel(c.bid.priceUnit)} → ${sar} ${nf(c.rental.value)}` : `${sar} ${nf(c.bid.price)}/${periodLabel(c.bid.priceUnit)}`;
    const resp = (c: BidColumn) => c.costResponsibilities.map((r) => `${esc(ar ? r.labelAr : r.labelEn)}: ${r.bidSide === "supplier" ? sup : r.bidSide === "me" ? you : "—"}`).join("<br>");
    const row = (label: string, fn: (c: BidColumn) => string) => `<tr><th class="lbl">${esc(label)}</th>${cols.map((c) => `<td>${fn(c)}</td>`).join("")}</tr>`;
    const pickName = cols.find((c) => c.bid.id === pickId)?.bid.supplierName;
    const html = `<!doctype html><html dir="${ar ? "rtl" : "ltr"}" lang="${ar ? "ar" : "en"}"><head><meta charset="utf-8"><title>${esc(itemName)} — ${L("Bid comparison", "مقارنة العروض")}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1C3550;margin:26px}h1{font-size:18px;margin:0 0 4px}.meta{color:#6B8FA8;font-size:12px;margin-bottom:12px}.pick{display:inline-block;background:#FFF4E5;color:#8A5A06;border:1px solid #F79009;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:bold;margin-bottom:14px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #D4E0EC;padding:8px 10px;text-align:${ar ? "right" : "left"};vertical-align:top}thead th{background:#1C3550;color:#fff}th.lbl{background:#EFF4F9;width:175px}.star{color:#FFC97A}.foot{margin-top:16px;color:#9BB3C8;font-size:10px}@media print{@page{margin:12mm}}</style></head><body>
<h1>${esc(itemName)} — ${L("Bid comparison", "مقارنة العروض")}</h1>
<div class="meta">${esc(group?.items[0]?.displayId ?? "")} · ${esc(loc?.label ?? "")} · ${esc(when)}${durationDays ? ` · ${durationDays} ${L("days", "يوم")}` : ""}${units > 1 ? ` · ${units} ${L("units", "وحدات")}` : ""}</div>
${pickName ? `<div class="pick">★ ${L("AI pick", "اختيار المساعد")}: ${esc(pickName)}</div>` : ""}
<table><thead><tr><th class="lbl"></th>${cols.map((c) => `<th>${esc(c.bid.supplierName)}${c.bid.id === pickId ? ' <span class="star">★</span>' : ""}</th>`).join("")}</tr></thead><tbody>
${row(L("Total (incl. VAT & your costs)", "الإجمالي (شامل الضريبة وتكاليفك)"), (c) => hasCost(c) ? `${sar} ${nf(grandTotal(c))}${lowestGrand != null ? (grandTotal(c) === lowestGrand ? ` (${L("lowest", "الأقل")})` : ` (+${Math.round(((grandTotal(c) - lowestGrand) / lowestGrand) * 100)}%)`) : ""}` : c.bid.price != null ? `${sar} ${nf(Math.round(c.bid.price * (1 + VAT)))}/${periodLabel(c.bid.priceUnit)} (${L("rate incl. VAT", "السعر شامل الضريبة")})` : "—")}
${row(L("Rental cost", "تكلفة الإيجار"), rental)}
${row(L("Mobilization + demob", "النقل + الإرجاع"), (c) => m({ value: mobDemobTotal(c), stated: c.mob.stated || c.demob.stated }))}
${row(L("Who handles the costs", "من يتحمّل التكاليف"), resp)}
${row(L("Year", "سنة الصنع"), (c) => esc(c.bid.equipment?.year ?? "—"))}
${row(L("Distance to site", "المسافة للموقع"), (c) => c.bid.distanceKm != null ? `${Math.round(c.bid.distanceKm)} ${L("km", "كم")}` : "—")}
${row(L("Equipment certificates & ownership", "شهادات وملكية المعدّة"), (c) => { const parts = [certsOf(c, EQUIP_CERTS, c.bid.equipmentCertCodes ?? []), ownedOf(c)].filter((p) => p !== "—"); return parts.length ? parts.join(", ") : "—"; })}
${row(L("Operator certificate", "شهادة المشغّل"), (c) => esc(c.bid.operatorCertDeclared ?? "—"))}
${row(L("Verified supplier", "مؤجّر موثّق"), (c) => (c.bid.verified ? yes : no))}
${row(L("Company documents", "وثائق الشركة"), docsOf)}
</tbody></table>
<div class="foot">© ${new Date().getFullYear()} Moedatech · ${L("Generated from stated bid data — figures are the suppliers' stated values.", "أُنشئ من بيانات العروض المذكورة.")}</div>
<script>window.onload=function(){window.focus();setTimeout(function(){window.print();},150);};</script></body></html>`;
    w.document.write(html);
    w.document.close();
  }

  if (error) return <Box>{L("Couldn’t load your requests.", "تعذّر تحميل طلباتك.")}</Box>;
  if (!groups) return <Spinner />;
  if (!locations.length) return <Box>{L("No requests to compare yet.", "لا توجد طلبات للمقارنة بعد.")}</Box>;

  /* ── small renderers ── */
  const incChip = (label: string, kind: "y" | "n" | "muted", onAdd?: () => void, icon?: string, value?: number, onRemove?: () => void) => {
    const bg = kind === "y" ? C.successBg : kind === "n" ? C.dangerBg : C.surface3;
    const fg = kind === "y" ? C.success : kind === "n" ? C.danger : C.muted;
    const entered = value != null;
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold" style={{ background: bg, color: fg }}>
        {icon && <span className="material-icons-outlined" style={{ fontSize: 13 }}>{icon}</span>}
        {label}
        {entered && <span style={{ color: C.rentee }}>· {sar} {nf(value!)}</span>}
        {entered && onRemove ? (
          <button onClick={onRemove} title={L("Remove your estimate", "إزالة تقديرك")} className="grid h-4 w-4 place-items-center rounded-full" style={{ background: "#fff", color: C.muted, border: "1px solid rgba(37,99,235,.3)" }}><span className="material-icons-outlined" style={{ fontSize: 11 }}>close</span></button>
        ) : onAdd ? <button onClick={onAdd} className="inline-flex items-center gap-0.5 rounded-full border px-1.5 text-[9.5px] font-extrabold" style={{ color: C.rentee, borderColor: "rgba(37,99,235,.4)", background: "#fff" }}><span className="material-icons-outlined" style={{ fontSize: 11 }}>add</span>{L("cost", "تكلفة")}</button> : null}
      </span>
    );
  };
  // Sub-label for a cert row = the request's actual required certs in that class ("TÜV required").
  const certReqSub = (pick: CertCode[]) => {
    const req = pick.filter((x) => cols.some((c) => c.bid.requiredCerts.includes(x)));
    return req.length ? `${req.map(certLabel).join(" · ")} ${L("required", "مطلوبة")}` : L("none required", "غير مطلوبة");
  };
  const presetDefs: [Preset, string, string, string][] = [
    ["best", "workspace_premium", "Best overall", "الأفضل إجمالاً"],
    ["lowest", "savings", "Lowest cost", "الأقل تكلفة"],
    ["newest", "new_releases", "Newest equipment", "أحدث معدّة"],
    ["trusted", "verified_user", "Most trusted", "الأكثر ثقة"],
  ];
  // Visible agent status: pulses "thinking…" while a /bids/recommend call is in flight, then "live · N%".
  const conf = rec?.recommendation.confidence != null ? Math.round(rec.recommendation.confidence * 100) : null;
  const agentBadge = () => {
    if (recLoading) return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: C.actionDim, color: "#8A5A06" }}><span className="material-icons-outlined animate-spin" style={{ fontSize: 13 }}>autorenew</span>{L("AI thinking…", "الذكاء يفكّر…")}</span>;
    if (agentLive) return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: C.successBg, color: C.success }}><span className="h-2 w-2 rounded-full" style={{ background: C.success }} />{L("AI assistant · live", "المساعد الذكي · متصل")}{conf != null ? ` · ${conf}%` : ""}</span>;
    return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: C.surface3, color: C.muted }}><span className="h-2 w-2 rounded-full" style={{ background: C.muted }} />{L("AI assistant · offline", "المساعد · غير متصل")}</span>;
  };

  return (
    <div className={`space-y-4 transition-[margin] duration-200 ${chatOpen ? "md:me-[412px]" : ""}`} style={{ color: C.navy }}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: C.muted }}>
        <button onClick={() => router.push("/requests")} className="hover:underline">{L("Requests", "الطلبات")}</button>
        <span className="material-icons-outlined" style={{ fontSize: 16, transform: ar ? "scaleX(-1)" : undefined }}>chevron_right</span>
        <b style={{ color: C.navy, fontSize: 18 }}>{L("Compare bids", "مقارنة العروض")}</b>
      </div>

      {/* ── Level 1 — location tabs ── */}
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold" style={{ color: C.muted, letterSpacing: ".4px" }}>
        <span className="material-icons-outlined" style={{ fontSize: 15 }}>location_on</span>{L("Location", "الموقع")}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {locations.map((l) => (
          <button key={l.key} onClick={() => setActiveLoc(l.key)}
            className="inline-flex flex-none items-center gap-2 rounded-full border px-4 py-2.5 text-[12.5px] font-bold transition"
            style={l.key === loc?.key ? { background: C.navy, borderColor: C.navy, color: "#fff" } : { background: "#fff", borderColor: C.border, color: C.navyMid }}>
            {l.label}
            <span className="rounded-full px-2 text-[11px] font-bold" style={l.key === loc?.key ? { background: "rgba(255,255,255,.2)", color: "#fff" } : { background: C.surface3, color: C.navy }}>{l.itemCount} {L("items", "أصناف")}</span>
            {l.bidCount > 0 && <span className="rounded-full px-2 text-[11px] font-bold" style={{ background: C.successBg, color: C.success }}>{l.bidCount} {L("bids", "عروض")}</span>}
          </button>
        ))}
      </div>

      {/* ── request header card ── */}
      {group && (
        <div className="relative overflow-hidden rounded-xl p-4 text-white" style={{ background: `linear-gradient(150deg,${C.navy},${C.navyDeep})` }}>
          <div className="flex gap-3">
            <div className="relative grid h-10 w-10 flex-none place-items-center rounded-lg" style={{ background: "#fff", border: "1px solid rgba(255,255,255,.16)" }}>
              <EquipImg src={activeItemObj?.item?.imageUrl ?? null} categoryId={activeItemObj?.item?.categoryId ?? null} name={(ar ? activeItemObj?.item?.nameAr : activeItemObj?.item?.name) ?? ""} box="" img="h-7 w-7 object-contain" iconSize={22} />
              {units > 1 && <span className="absolute -end-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-extrabold" style={{ background: C.action }}>×{units}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-extrabold leading-tight">
                {ar ? activeItemObj?.item?.nameAr : activeItemObj?.item?.name}{units > 1 ? ` · ×${units}` : ""}
                {items.length > 1 && <span style={{ color: "#FFC97A" }}> + {items.length - 1} {L("more", "غيره")}</span>}
                <span className="ms-1.5 rounded-full px-2 text-[10px] font-bold" style={{ background: "rgba(255,255,255,.14)" }}>{group.totalUnits} {L("total equipment", "إجمالي المعدات")}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,.66)" }}>
                <span className="material-icons-outlined" style={{ fontSize: 13 }}>event</span>
                {(group.items[0]?.displayId ?? group.id)} · {loc?.label} · {group.createdAt ? new Date(group.createdAt).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {items.length > 1 && <Pill icon={null}>{L("Mixed", "مختلط")}</Pill>}
                <Pill icon="campaign">{L("Broadcast", "بثّ")}</Pill>
                <Pill icon="gavel">{group.totalBids} {L("bids", "عروض")}</Pill>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Level 2 — item tabs + actions ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <button key={it.id} onClick={() => setActiveItem(it.id)}
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-bold transition"
              style={it.id === activeItem ? { background: C.action, borderColor: C.action, color: "#fff" } : { background: "#fff", borderColor: C.border, color: C.navyMid, opacity: it.bidCount === 0 ? 0.6 : 1 }}>
              {ar ? it.item?.nameAr : it.item?.name}
              <span className="rounded-full px-1.5 text-[11px] font-bold" style={it.id === activeItem ? { background: "rgba(255,255,255,.25)", color: "#fff" } : { background: C.surface3, color: C.navy }}>{it.bidCount > 0 ? `${it.bidCount} ${L("bids", "عروض")}` : L("no bids", "بلا عروض")}</span>
            </button>
          ))}
        </div>
        <div className="ms-auto flex gap-2">
          <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>
            <span className="material-icons-outlined" style={{ fontSize: 17 }}>upload_file</span>{L("Upload a quote", "رفع عرض سعر")}
          </button>
          <button onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>
            <span className="material-icons-outlined" style={{ fontSize: 17 }}>picture_as_pdf</span>{L("Export PDF", "تصدير PDF")}
          </button>
        </div>
      </div>

      {bidsLoading ? (
        <Spinner />
      ) : !comparison || allCols.length === 0 ? (
        <Box title={L("No bids yet", "لا توجد عروض بعد")}>{L("This item has no bids to compare yet — you can re-broadcast the request.", "لا توجد عروض على هذه المعدة بعد — يمكنك إعادة بثّ الطلب.")}</Box>
      ) : (
        <>
          {/* ── bid selector ── */}
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: C.border, background: "#fff" }}>
            <button onClick={() => setSelectorOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-4 py-3 text-start" style={{ background: C.surface2, borderBottom: selectorOpen ? `1px solid ${C.line}` : "none" }}>
              <span className="material-icons-outlined" style={{ fontSize: 19, color: C.action }}>fact_check</span>
              <b className="text-[13.5px]">{L("Bids in this comparison", "العروض في هذه المقارنة")}</b>
              <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: C.surface3, color: C.muted }}>{selected.size} {L("shown", "معروضة")}</span>
              <span className="material-icons-outlined ms-auto" style={{ color: C.muted, transform: selectorOpen ? "" : "rotate(-90deg)" }}>expand_more</span>
            </button>
            {selectorOpen && (
              <div className="px-4 pb-3 pt-2">
                <div className="mb-1 text-[11px] font-extrabold" style={{ color: C.muted }}>{L("Suppliers — tap to add, or × to remove from the comparison", "المؤجرون — انقر للإضافة، أو × للإزالة من المقارنة")}</div>
                <div className="flex flex-wrap gap-2">
                  {comparison.columns.map((c) => {
                    const on = selected.has(c.bid.id);
                    return (
                      <button key={c.bid.id} onClick={() => toggleBid(c.bid.id)} title={on ? L("Remove from comparison", "إزالة من المقارنة") : L("Add to comparison", "إضافة للمقارنة")} className="inline-flex items-center gap-1.5 rounded-full border ps-3.5 pe-2.5 py-2 text-[13px] font-bold transition"
                        style={on ? { background: C.renteeDim, borderColor: C.rentee, color: C.navy } : { background: "#fff", borderColor: C.border, color: C.muted, borderStyle: "dashed" }}>
                        {!on && <span className="material-icons-outlined" style={{ fontSize: 16, color: C.muted }}>add</span>}
                        {c.bid.supplierName}
                        {c.bid.verified && <span className="material-icons-outlined" style={{ fontSize: 14, color: on ? C.success : C.disabled }}>verified</span>}
                        {on && <span className="material-icons-outlined grid h-4 w-4 place-items-center rounded-full" style={{ fontSize: 13, background: "rgba(37,99,235,.16)", color: C.rentee }}>close</span>}
                      </button>
                    );
                  })}
                  {comparison.excluded.map((c) => (
                    <button key={c.bid.id} onClick={() => goDealRoom(c.bid, "negotiate")} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-bold" style={{ background: C.dangerBg, borderColor: "rgba(217,54,42,.35)", color: C.danger, borderStyle: "dashed" }}>
                      <span className="rounded-full px-2 text-[10px] font-extrabold" style={{ background: "#fff", color: C.danger }}>{L("excluded", "مستبعد")}</span>
                      {c.bid.supplierName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Rank the table by what matters — always visible, inline above the table (AC-20/21) ── */}
          <div className="rounded-xl border px-4 py-3.5" style={{ borderColor: C.border, background: "#fff" }}>
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12.5px] font-extrabold" style={{ color: C.navyMid }}>
              <span className="material-icons-outlined" style={{ fontSize: 17, color: C.action }}>tune</span>{L("Rank the table by what matters to you", "رتّب الجدول حسب ما يهمّك")}
              <span className="ms-auto">{agentBadge()}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {presetDefs.map(([p, ic, en, arl]) => (
                <button key={p} onClick={() => choosePreset(p, en, arl)} className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-bold transition"
                  style={preset === p && !fxEcho ? { background: C.navy, borderColor: C.navy, color: "#fff" } : { background: C.surface2, borderColor: C.border, color: C.navyMid }}>
                  <span className="material-icons-outlined" style={{ fontSize: 16 }}>{ic}</span>{ar ? arl : en}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2.5">
              <div className="flex h-[46px] flex-1 items-center gap-2.5 rounded-lg border px-3.5" style={{ background: C.surface2, borderColor: C.border }}>
                <span className="material-icons-outlined" style={{ fontSize: 19, color: C.action }}>auto_awesome</span>
                <input value={freeText} onChange={(e) => setFreeText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyFreeText(); }}
                  placeholder={L("Tell your assistant what matters — e.g. 'closest machine, fuel must be included'…", "أخبر مساعدك بما يهمّك — مثلاً: 'أقرب معدّة، ويجب أن يكون الوقود مشمولاً'…")}
                  className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" style={{ color: C.navy }} />
              </div>
              <button onClick={applyFreeText} className="inline-flex items-center gap-1.5 rounded-lg px-4 text-[13.5px] font-bold text-white" style={{ background: C.action }}>
                <span className="material-icons-outlined" style={{ fontSize: 18 }}>send</span>{L("Re-rank", "إعادة الترتيب")}
              </button>
            </div>
            {fxEcho && (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]" style={{ background: C.actionDim, borderColor: "rgba(247,144,9,.3)", color: "#8A5A06" }}>
                <span className="material-icons-outlined" style={{ fontSize: 17, color: C.action }}>auto_awesome</span>{fxEcho}
              </div>
            )}
          </div>

          {/* ── Ask-AI floating button → opens the side chat drawer (ranking above stays visible) ── */}
          <button onClick={() => setChatOpen(true)} className="fixed bottom-6 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-[13.5px] font-extrabold text-white"
            style={{ insetInlineEnd: "1.5rem", background: `linear-gradient(135deg,${C.action},#FFA733)`, boxShadow: "0 10px 26px rgba(247,144,9,.4)" }}>
            <span className="material-icons-outlined" style={{ fontSize: 19 }}>auto_awesome</span>{L("Ask AI", "اسأل الذكاء")}
            {suggestions.length > 0 && <span className="grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-black" style={{ background: "#fff", color: C.action }}>{suggestions.length}</span>}
          </button>
          {chatOpen && (
            <>
              <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(28,53,80,.4)" }} onClick={() => setChatOpen(false)} />
              <div className="fixed inset-y-0 z-50 flex w-[400px] max-w-full flex-col bg-white" style={{ insetInlineEnd: 0, boxShadow: "-10px 0 40px rgba(28,53,80,.25)" }}>
                <div className="flex items-start gap-2.5 px-4 py-4 text-white" style={{ background: `linear-gradient(150deg,${C.navy},${C.navyDeep})` }}>
                  <div className="grid h-9 w-9 flex-none place-items-center rounded-lg" style={{ background: `linear-gradient(135deg,${C.action},#FFA733)` }}><span className="material-icons-outlined" style={{ fontSize: 21 }}>auto_awesome</span></div>
                  <div className="flex-1">
                    <b className="text-[15px]">{L("Your AI assistant", "مساعدك الذكي")}</b>
                    <p className="m-0 text-[11.5px]" style={{ color: "rgba(255,255,255,.66)" }}>
                      {recLoading ? L("thinking…", "يفكّر…") : agentLive ? `${L("live", "متصل")}${conf != null ? ` · ${conf}%` : ""}` : L("offline · ranking from your stated data", "غير متصل · يرتّب من بياناتك")}
                    </p>
                  </div>
                  <button onClick={() => setChatOpen(false)} className="grid h-8 w-8 flex-none place-items-center rounded-full" style={{ border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.1)", color: "#fff" }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span></button>
                </div>
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {recoMsg && (
                    <div className="flex max-w-[92%] gap-2.5">
                      <div className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg" style={{ background: `linear-gradient(135deg,${C.action},#FFA733)` }}><span className="material-icons-outlined" style={{ fontSize: 17, color: "#fff" }}>auto_awesome</span></div>
                      <div className="rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed" style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.navy, borderStartStartRadius: 4 }}>
                        <span className="mb-1 flex items-center gap-1.5 text-[12px] font-extrabold">
                          <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-black" style={{ background: `linear-gradient(135deg,${C.gold},#E0A92E)`, color: "#2A1D00" }}>1</span>
                          {(cols.find((c) => c.bid.id === pickId) ?? cols[0])?.bid.supplierName}
                        </span>
                        {recoMsg}
                      </div>
                    </div>
                  )}
                  {chat.length === 0 && !recoMsg && (
                    <p className="text-[13px]" style={{ color: C.muted }}>{L("Ask anything about these bids — or use the suggestions below.", "اسأل أي شيء عن هذه العروض — أو استخدم الاقتراحات أدناه.")}</p>
                  )}
                  {chat.map((m, i) => (
                    <div key={i} className={`flex max-w-[92%] gap-2.5 ${m.role === "user" ? "ms-auto flex-row-reverse" : ""}`}>
                      {m.role === "mansour" && <div className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg" style={{ background: `linear-gradient(135deg,${C.action},#FFA733)` }}><span className="material-icons-outlined" style={{ fontSize: 17, color: "#fff" }}>auto_awesome</span></div>}
                      <div className="rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed" style={m.role === "user" ? { background: C.rentee, color: "#fff", borderStartEndRadius: 4 } : { background: C.surface2, border: `1px solid ${C.border}`, color: C.navy, borderStartStartRadius: 4 }}>{m.text}</div>
                    </div>
                  ))}
                </div>
                {/* What-if quick prompts — always available, plus any dynamic agent suggestions. */}
                {(() => {
                  const whatif = [
                    { label: L("Lowest all-in?", "الأقل إجمالاً؟"), message: "rank by lowest all-in cost", icon: "savings" },
                    { label: L("Newest machine?", "أحدث معدّة؟"), message: "rank by newest machine", icon: "new_releases" },
                    { label: L("Fuel included only?", "الوقود مشمول فقط؟"), message: "only the bids where fuel is included", icon: "local_gas_station" },
                    { label: L("Closest to site?", "الأقرب للموقع؟"), message: "rank by closest distance to site", icon: "place" },
                    { label: L("Most trusted?", "الأكثر ثقة؟"), message: "rank by most trusted supplier", icon: "verified_user" },
                  ];
                  const seen = new Set(whatif.map((w) => w.label));
                  const extra = suggestions.filter((s) => !seen.has(s.label));
                  const chip = (key: string, icon: string, label: string, message: string) => (
                    <button key={key} onClick={() => sendChat(message)} className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-bold" style={{ borderColor: C.border, color: C.rentee, background: "#fff" }}>
                      <span className="material-icons-outlined" style={{ fontSize: 15 }}>{icon}</span>{label}
                    </button>
                  );
                  return (
                    <div className="px-4 pb-3">
                      <div className="mb-1.5 text-[11px] font-extrabold" style={{ color: C.muted, letterSpacing: ".3px" }}>{L("What if…", "ماذا لو…")}</div>
                      <div className="flex flex-wrap gap-2">
                        {whatif.map((s, i) => chip(`w${i}`, s.icon, s.label, s.message))}
                        {extra.map((s, i) => chip(`s${i}`, SUGGEST_ICON[s.icon] ?? "help", s.label, s.message))}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-2.5 border-t px-4 py-3" style={{ borderColor: C.line, background: C.surface2 }}>
                  <div className="flex h-[46px] flex-1 items-center gap-2.5 rounded-full border px-4" style={{ background: "#fff", borderColor: C.border }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18, color: C.action }}>auto_awesome</span>
                    <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(chatInput); }} placeholder={L("Ask your assistant…", "اسأل مساعدك…")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" style={{ color: C.navy }} />
                  </div>
                  <button onClick={() => sendChat(chatInput)} className="grid h-[46px] w-[46px] flex-none place-items-center rounded-full text-white" style={{ background: C.action }}><span className="material-icons-outlined" style={{ fontSize: 20, transform: ar ? "scaleX(-1)" : undefined }}>send</span></button>
                </div>
              </div>
            </>
          )}

          {/* ── how-to-read tip (compact, expandable) ── */}
          <details className="group rounded-lg border" style={{ borderColor: C.border, background: "#fff" }}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-bold" style={{ color: C.navyMid }}>
              <span className="material-icons-outlined" style={{ fontSize: 17, color: C.warning }}>lightbulb</span>
              {L("How to read this comparison", "كيف تقرأ هذه المقارنة")}
              <span className="material-icons-outlined ms-auto transition group-open:rotate-180" style={{ fontSize: 18, color: C.muted }}>expand_more</span>
            </summary>
            <div className="flex flex-col gap-2 border-t px-3.5 py-3 text-[12px]" style={{ borderColor: C.line, color: C.navyMid }}>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 flex-none rounded" style={{ background: C.success }} />{L("Good — matches your request, or a cert that's held", "جيد — يطابق طلبك، أو شهادة متوفّرة")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 flex-none rounded" style={{ background: C.danger }} />{L("Problem — conflicts with your request, or a required cert is missing", "مشكلة — يتعارض مع طلبك، أو شهادة مطلوبة ناقصة")}</span>
              <span className="inline-flex items-center gap-1.5" style={{ color: C.rentee }}><span className="material-icons-outlined flex-none" style={{ fontSize: 15 }}>add</span>{L("For a cost that's on you, add your own estimate — it's added to the total so you get a sense of the real cost", "لتكلفة تقع عليك، أضف تقديرك — يُضاف للإجمالي لتتكوّن لديك صورة عن التكلفة الحقيقية")}</span>
            </div>
          </details>

          {/* ── table caption + live agent status (call #1 fires on every re-rank) ── */}
          <div className="flex flex-wrap items-center gap-2 px-1 text-[12.5px] font-bold" style={{ color: C.navyMid }}>
            <span className="material-icons-outlined" style={{ fontSize: 17, color: C.action }}>auto_awesome</span>
            {agentLive ? L("Ranked by your AI assistant", "مرتّب بواسطة مساعدك الذكي") : L("Ranked from your stated data", "مرتّب من بياناتك المذكورة")}
            {agentBadge()}
          </div>

          {/* ── comparison table ── */}
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: C.border, background: "#fff" }}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 320 + cols.length * 215 }}>
                {/* tint the whole rank-winning column green (cells' own red/green layer on top) */}
                <colgroup>
                  <col style={{ width: 190 }} />
                  {cols.map((c) => <col key={c.bid.id} style={c.bid.id === pickId ? { background: "rgba(29,175,88,0.09)" } : undefined} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className="sticky start-0 z-[3] p-3 text-start align-top text-[12.5px] font-bold" style={{ background: C.surface2, color: C.navyMid, width: 190, minWidth: 190, borderBottom: `1px solid ${C.line}` }}>
                      {durationDays ? L(`${durationDays}-day rental · ${units} unit${units > 1 ? "s" : ""}`, `إيجار ${durationDays} يوم · ${units} وحدة`) : L("Comparison", "المقارنة")}
                    </th>
                    {cols.map((c, idx) => {
                      const isPick = c.bid.id === pickId;
                      const isUpload = c.bid.id.startsWith("upload:");
                      const recog = rec?.ranking.find((r) => r.bid_id === c.bid.id)?.recognition ?? null;
                      return (
                        <th key={c.bid.id} className="p-3 text-start align-top transition-colors" style={{ minWidth: 215, background: isPick ? "linear-gradient(180deg,#E7F7EE,#fff)" : "#fff", borderBottom: `1px solid ${C.line}`, boxShadow: isPick ? `inset 0 4px 0 ${C.success}` : undefined }}>
                          <div className="flex items-start gap-2.5">
                            <div className="relative flex-none">
                              <div className="grid h-9 w-9 place-items-center rounded-lg text-[13px] font-extrabold" style={{ background: C.surface3, color: C.navy }}>{c.bid.supplierName.slice(0, 2).toUpperCase()}</div>
                              {cols.length > 1 && agentLive && <span className="absolute -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] font-black text-white" style={{ background: idx === 0 ? C.success : C.navyMid, insetInlineStart: "-6px" }}>#{idx + 1}</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <b className="flex items-center gap-1 text-[14px] leading-tight" style={{ color: C.navy }}>
                                {isPick && <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-md" style={{ background: `linear-gradient(135deg,${C.action},#FFA733)` }} title={L("AI pick · best match", "اختيار المساعد · الأنسب")}><span className="material-icons-outlined" style={{ fontSize: 12, color: "#fff" }}>auto_awesome</span></span>}
                                <span className="truncate">{c.bid.supplierName}</span>
                                <span className="material-icons-outlined flex-none" style={{ fontSize: 15, color: c.bid.verified ? C.success : C.danger }} title={c.bid.verified ? L("Verified supplier", "مؤجّر موثّق") : L("Not verified", "غير موثّق")}>{c.bid.verified ? "verified" : "gpp_bad"}</span>
                              </b>
                              <span className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-bold" style={{ color: c.bid.viaSharedLink ? C.action : C.muted }}>
                                <span className="material-icons-outlined" style={{ fontSize: 13 }}>{isUpload ? "description" : c.bid.viaSharedLink ? "link" : "smartphone"}</span>
                                {isUpload ? L("From uploaded file", "من ملف مرفوع") : c.bid.viaSharedLink ? L("via shared link", "عبر الرابط") : L("via Moedatech app", "عبر تطبيق معداتك")}
                              </span>
                            </div>
                            {/* remove this bid from the comparison (same as un-ticking it in the selector) */}
                            <button onClick={() => toggleBid(c.bid.id)} title={L("Remove from comparison", "إزالة من المقارنة")} className="grid h-6 w-6 flex-none place-items-center rounded-full border" style={{ borderColor: C.border, color: C.muted, background: "#fff" }}>
                              <span className="material-icons-outlined" style={{ fontSize: 15 }}>close</span>
                            </button>
                          </div>
                          {/* identity: company documents below the name (verified is the tick beside the name) — clickable to open the file */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {companyDocChips(c.bid).map((d) => <span key={d.lbl}>{docChip(c, d.lbl, d.has, d.hint)}</span>)}
                          </div>
                          {recog &&<span className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold" style={{ background: C.renteeDim, color: "#1E4FB8", borderColor: "rgba(37,99,235,.28)" }}><span className="material-icons-outlined" style={{ fontSize: 13, color: C.rentee }}>history</span>{recog}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* 💰 COST */}
                  <SectionRow id="cost" icon="payments" title={L("Cost", "التكلفة")} accent={C.action} accentText="#FFC97A" n={cols.length} collapsed={collapsed.has("cost")} onToggle={() => toggleSection("cost")} />
                  {!collapsed.has("cost") && (<>
                    <tr>
                      <RowHead title={L("Rental cost", "تكلفة الإيجار")} sub={L("rate × days × units", "السعر × الأيام × الوحدات")} />
                      {cols.map((c) => {
                        const realDays = c.bid.duration ?? durationDays; // actual rental length (days); null → defaulted to 1 period
                        const per = periodLabel(c.bid.priceUnit);
                        return (
                          <Td key={c.bid.id} ok={c.bid.price != null}>
                            {c.bid.price == null ? (
                              <span style={{ color: C.muted }}>{L("not stated", "غير محدد")}</span>
                            ) : (<>
                              {/* per-unit rate (basis) → comparable total = rate × duration × units */}
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-bold" style={{ color: C.navyMid }}>{sar} {nf(c.bid.price)}<small style={{ fontSize: 10.5, color: C.muted }}>/{per}{units > 1 ? ` · ${L("unit", "وحدة")}` : ""}</small></span>
                                <span style={{ color: C.action, fontWeight: 800, transform: ar ? "scaleX(-1)" : undefined }}>→</span>
                                <span className="font-mono font-extrabold" style={{ color: C.navy }}>{sar} {nf(c.rental.value)}</span>
                              </span>
                              <Sub>{realDays != null
                                ? L(`× ${realDays} days${units > 1 ? ` × ${units} units` : ""}`, `× ${realDays} يوم${units > 1 ? ` × ${units} وحدة` : ""}`)
                                : L(`× 1 ${per} (assumed)${units > 1 ? ` × ${units} units` : ""}`, `× ${per} واحد (مفترض)${units > 1 ? ` × ${units} وحدة` : ""}`)}</Sub>
                            </>)}
                          </Td>
                        );
                      })}
                    </tr>
                    <tr>
                      <RowHead title={L("Mobilization + demob", "النقل + الإرجاع")} sub={mobByRentee === true ? L("you bear delivery", "النقل عليك") : mobByRentee === false ? L("required from the supplier", "مطلوب من المؤجّر") : L("one-time, whole job", "لمرة واحدة، لكامل العمل")} />
                      {cols.map((c) => {
                        const stated = c.mob.stated || c.demob.stated;
                        const rm = renterMob[c.bid.id];
                        // From YOUR request: who bears delivery. Supplier-required but the bid didn't price it → conflict (red).
                        const onRenter = mobByRentee === true;
                        const onSupplier = mobByRentee === false;
                        const conflict = onSupplier && !stated;
                        const addBtn = (
                          <button onClick={() => addMobCost(c.bid.id, L("Delivery + pickup", "النقل والإرجاع"))} className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9.5px] font-extrabold" style={{ color: C.rentee, borderColor: "rgba(37,99,235,.4)", background: "#fff" }}><span className="material-icons-outlined" style={{ fontSize: 11 }}>add</span>{L("add cost", "أضف تكلفة")}</button>
                        );
                        return (
                          <Td key={c.bid.id} ok={!conflict} fail={conflict}>
                            {stated ? (<>
                              {/* per-unit → × units, mirroring the rental row */}
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-bold" style={{ color: C.navyMid }}>{sar} {nf(mobDemobUnit(c))}{units > 1 ? <small style={{ fontSize: 10.5, color: C.muted }}>/{L("unit", "وحدة")}</small> : null}</span>
                                {units > 1 && <><span style={{ color: C.action, fontWeight: 800, transform: ar ? "scaleX(-1)" : undefined }}>→</span><span className="font-mono font-extrabold" style={{ color: C.navy }}>{sar} {nf(mobDemobTotal(c))}</span></>}
                              </span>
                              <Sub>{`${sar} ${nf(c.mob.value)} ${L("mob", "نقل")} + ${sar} ${nf(c.demob.value)} ${L("demob", "إرجاع")}${units > 1 ? ` · × ${units} ${L("units", "وحدة")}` : ""}`}</Sub>
                            </>) : rm ? (<>
                              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold">{sar} {nf(rm)}
                                <button onClick={() => addMobCost(c.bid.id, L("Delivery + pickup", "النقل والإرجاع"))} className="text-[10px] font-bold underline" style={{ color: C.rentee }}>{L("edit", "تعديل")}</button>
                                <button onClick={() => removeMobCost(c.bid.id)} title={L("Remove your estimate", "إزالة تقديرك")} className="grid h-4 w-4 place-items-center rounded-full" style={{ background: C.surface3, color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 11 }}>close</span></button>
                              </span>
                              <Sub>{L("your estimate · on you", "تقديرك · عليك")}</Sub>
                            </>) : conflict ? (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: C.danger }}>{L("supplier didn't include it", "لم يُدرجه المؤجّر")}{addBtn}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: C.muted }}>{onRenter ? L("on you", "عليك") : L("not stated", "غير محدد")}{addBtn}</span>
                            )}
                          </Td>
                        );
                      })}
                    </tr>
                    <tr>
                      <RowHead title={L("Who handles the costs", "من يتحمّل التكاليف")} sub={L("colours explained above", "الألوان موضّحة أعلاه")} />
                      {cols.map((c) => (
                        <Td key={c.bid.id}>
                          <div className="flex flex-wrap gap-1.5">
                            {RESP_META.map((m) => {
                              const cr = c.costResponsibilities.find((x) => x.key === m.key)!;
                              // Deal-room conflict for the operator FAT costs (fat_food / fat_accommodation_transport):
                              // a disputed term → red, even if the static request-vs-bid compare is grey.
                              const fatKey = m.key === "operator_food" ? "fat_food" : m.key === "operator_transport_accommodation" ? "fat_accommodation_transport" : null;
                              const dealConflict = fatKey ? (c.bid.negotiableTerms ?? []).some((t) => t.key === fatKey && t.state === "conflict") : false;
                              const kind = cr.state === "red" || dealConflict ? "n" : "y";
                              // Add-cost only when YOUR REQUEST puts the cost on you (the rentee); never when it's on the supplier.
                              const canAdd = cr.requestSide === "me";
                              const entered = renterCosts[m.key]; // your estimate for this cost (if any)
                              return <span key={m.key}>{incChip(ar ? m.ar : m.en, kind, canAdd ? () => addCost(m.key, ar ? m.ar : m.en) : undefined, m.icon, entered, entered != null ? () => removeCost(m.key) : undefined)}</span>;
                            })}
                          </div>
                        </Td>
                      ))}
                    </tr>
                    {/* Grand total — the LAST cost row (sum of everything above + VAT + your estimates). */}
                    <tr>
                      <RowHead title={L("Grand total", "الإجمالي")} sub={L("incl. VAT & your costs", "شامل الضريبة وتكاليفك")} />
                      {cols.map((c) => {
                        const total = grandTotal(c);
                        const yourCosts = renterAddBid(c);
                        const partial = !c.rental.stated && c.bid.price != null;
                        const rateInclVat = c.bid.price != null ? Math.round(c.bid.price * (1 + VAT)) : null;
                        const isLow = lowestGrand != null && total === lowestGrand;
                        return (
                          <Td key={c.bid.id} ok={hasCost(c) && isLow} fail={false}>
                            {hasCost(c) ? (<>
                              <span className="font-mono text-[17px] font-extrabold" style={{ color: C.navy }}>{sar} {nf(total)}</span>
                              {cols.length > 1 && lowestGrand != null && <span className="ms-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-extrabold" style={isLow ? { background: C.successBg, color: C.success } : { background: C.warningBg, color: C.warning }}>{isLow ? L("lowest", "الأقل") : `+${Math.round(((total - lowestGrand) / lowestGrand) * 100)}%`}</span>}
                              <div className="mt-1.5 h-[6px] max-w-[160px] overflow-hidden rounded" style={{ background: C.surface3 }}><i className="block h-full rounded" style={{ width: `${Math.round((total / maxGrand) * 100)}%`, background: isLow ? C.success : total === maxGrand ? C.warning : C.navyMid }} /></div>
                              {partial && <Sub>{L("rental not totaled — set a duration", "لم تُحتسب المدة — حدّد مدة")}</Sub>}
                              {yourCosts > 0 && <Sub>{L(`incl. ${sar} ${nf(yourCosts)} of your estimates`, `يشمل ${sar} ${nf(yourCosts)} من تقديراتك`)}</Sub>}
                            </>) : rateInclVat != null ? (<>
                              <span className="font-mono text-[15px] font-bold" style={{ color: C.navy }}>{sar} {nf(rateInclVat)}<small style={{ fontSize: 10.5, color: C.muted }}>/{periodLabel(c.bid.priceUnit)}</small></span>
                              <Sub>{L("rate only · set a duration for the total", "السعر فقط · حدّد مدة للإجمالي")}</Sub>
                            </>) : <span style={{ color: C.muted }}>{L("not stated", "غير محدد")}</span>}
                          </Td>
                        );
                      })}
                    </tr>
                  </>)}

                  {/* 🚜 EQUIPMENT */}
                  <SectionRow id="equip" icon="construction" title={L("Equipment", "المعدّة")} accent={C.supplier} accentText="#7BE0C2" n={cols.length} collapsed={collapsed.has("equip")} onToggle={() => toggleSection("equip")} />
                  {!collapsed.has("equip") && (<>
                    {/* Equipment + operator terms are ACKNOWLEDGED from the request today, not yet supplier-declared.
                        Warning in the label cell; the per-supplier "verify in deal room" link sits under each column. */}
                    <tr>
                      <th className="sticky start-0 z-[2] p-2.5 text-start align-top" style={{ background: C.warningBg, borderTop: `1px solid ${C.line}` }}>
                        <span className="inline-flex items-start gap-1.5 text-[11px] font-bold leading-snug" style={{ color: C.warning }}>
                          <span className="material-icons-outlined" style={{ fontSize: 15 }}>warning_amber</span>
                          {L("Acknowledged by the supplier — verify in the deal room →", "مُقَرّة من المؤجّر — تحقّق في غرفة الصفقة ←")}
                        </span>
                      </th>
                      {cols.map((c) => (
                        <td key={c.bid.id} className="p-2.5 align-top" style={{ background: C.warningBg, borderTop: `1px solid ${C.line}` }}>
                          {c.bid.dealRoomId ? verifyLink(c) : <span className="text-[10px] font-bold" style={{ color: C.muted }}>{L("no deal room yet", "لا توجد غرفة بعد")}</span>}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <RowHead title={L("Year", "سنة الصنع")} sub={(() => { const my = cols[0]?.bid.reqMinYear; return my == null ? undefined : my >= 1990 ? `${L("min year", "أدنى سنة")} ${my}` : `${L("max age", "أقصى عمر")} ${my} ${L("yrs", "سنة")}`; })()} />
                      {cols.map((c) => { const yr = c.equipment.find((r) => r.key === "year"); const isNewest = (c.bid.equipment?.year ?? 0) > 0 && c.bid.equipment?.year === Math.max(...cols.map((x) => x.bid.equipment?.year ?? 0)); return <Td key={c.bid.id} ok={yr?.state !== "conflict"} fail={yr?.state === "conflict"}><span className="text-[13px] font-bold">{c.bid.equipment?.year ?? "—"}</span>{isNewest && cols.length > 1 && <Sub>{L("newest", "الأحدث")}</Sub>}</Td>; })}
                    </tr>
                    <tr>
                      <RowHead title={L("Distance to site", "المسافة للموقع")} />
                      {cols.map((c) => <Td key={c.bid.id} ok><span className="text-[13px] font-bold">{c.bid.distanceKm != null ? `${Math.round(c.bid.distanceKm)} ${L("km", "كم")}` : <span style={{ color: C.muted }}>—</span>}</span></Td>)}
                    </tr>
                    {/* L2 equipment — ONE field: safety certs (required ✓/✗ + held) + proof-of-ownership
                        docs (istimara / customs / sale_contract / saso_registration), combined per column. */}
                    <tr>
                      <RowHead title={L("Equipment certificates & ownership", "شهادات وملكية المعدّة")} sub={`${certReqSub(EQUIP_CERTS)} · ${L("acknowledged — confirm with supplier", "مُقَرّ — أكّده مع المؤجّر")}`} />
                      {cols.map((c) => {
                        const eqCerts = c.bid.equipmentCertCodes ?? [];
                        const owned = c.bid.ownershipDocs ?? [];
                        const required = EQUIP_CERTS.filter((x) => cols.some((cc) => cc.bid.requiredCerts.includes(x)));
                        const has = (x: CertCode) => eqCerts.includes(x);
                        const heldExtra = eqCerts.filter((x) => !required.includes(x));
                        const anyMissing = required.some((x) => !has(x)); // a required cert not held → red
                        const hasAny = required.length > 0 || heldExtra.length > 0 || owned.length > 0;
                        return (
                          <Td key={c.bid.id} ok={hasAny && !anyMissing} fail={anyMissing}>
                            {hasAny ? (
                              <div className="flex flex-wrap gap-1.5">
                                {required.map((x) => <span key={x}>{docChip(c, certLabel(x), has(x), x)}</span>)}
                                {heldExtra.map((x) => <span key={x}>{docChip(c, certLabel(x), true, x)}</span>)}
                                {owned.map((o) => <span key={o.key}>{docChip(c, ar ? o.labelAr : o.labelEn, true, o.key)}</span>)}
                              </div>
                            ) : <span style={{ color: C.disabled, fontWeight: 600 }}>—</span>}
                          </Td>
                        );
                      })}
                    </tr>
                    {/* L3 operator certificate — a DECLARED deal-room term, never a verified pill. Sub shows the
                        rentee's required license level; each cell the supplier's declared position (t3Declarations). */}
                    <tr>
                      <RowHead title={L("Operator certificate", "شهادة المشغّل")} sub={(() => { const r = cols[0]?.bid.operatorCertReq; return r ? `${L("required", "مطلوب")}: ${r}` : L("declared in the deal room", "يُعلن في غرفة الصفقة"); })()} />
                      {cols.map((c) => {
                        const d = c.bid.operatorCertDeclared;
                        return <Td key={c.bid.id} ok={!!d}>{d ? incChip(d, "muted", undefined, "badge") : <span style={{ color: C.disabled, fontWeight: 600 }}>—</span>}</Td>;
                      })}
                    </tr>
                  </>)}

                  {/* Verified supplier + company documents now live in each column's identity header (T1). */}

                  {/* DECIDE — its own band, clearly separated from the equipment section. Award/Negotiate use
                      the SAME colours for every supplier (Award = green solid, Negotiate = navy outline). */}
                  <tr>
                    <th className="sticky start-0 z-[2] p-3.5 text-start align-top text-[12.5px] font-extrabold" style={{ background: C.navy, color: "#fff", borderTop: `3px solid ${C.navy}` }}>
                      <span className="inline-flex items-center gap-1.5"><span className="material-icons-outlined" style={{ fontSize: 16 }}>gavel</span>{L("Decide", "القرار")}</span>
                      <span className="block text-[11px] font-semibold" style={{ color: "rgba(255,255,255,.7)" }}>{L("opens the deal room", "يفتح غرفة الصفقة")}</span>
                    </th>
                    {cols.map((c) => {
                      const isAwardedBid = !!awarded && (awarded.id === c.bid.id || (awarded.supplierId != null && awarded.supplierId === c.bid.supplierId));
                      return (
                        <td key={c.bid.id} className="p-3.5 align-top" style={{ borderTop: `3px solid ${C.navy}`, background: "rgba(28,53,80,0.04)" }}>
                          {awarded ? (
                            <span className="inline-flex rounded-full px-3 py-1.5 text-[11.5px] font-bold" style={isAwardedBid ? { background: C.successBg, color: C.success } : { background: C.surface2, color: C.muted }}>{isAwardedBid ? `${L("Awarded", "تمت الترسية")} ✓` : L("Item awarded", "مُرسى")}</span>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <button onClick={() => goDealRoom(c.bid, "award")} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-extrabold text-white disabled:opacity-60" style={{ background: C.success }}>
                                <span className="material-icons-outlined" style={{ fontSize: 16 }}>gavel</span>{L("Award", "ترسية")}
                              </button>
                              <button onClick={() => goDealRoom(c.bid, "negotiate")} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold disabled:opacity-60" style={{ background: "#fff", border: `1.5px solid ${C.navy}`, color: C.navy }}>
                                <span className="material-icons-outlined" style={{ fontSize: 15 }}>swap_horiz</span>{L("Negotiate", "تفاوض")}
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}

      {/* ── upload modal ── */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[400] grid place-items-center p-6" style={{ background: "rgba(28,53,80,.42)", backdropFilter: "blur(3px)" }} onClick={() => setUploadOpen(false)}>
          <div className="w-[460px] max-w-full overflow-hidden rounded-2xl" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b px-6 py-5" style={{ borderColor: C.line }}>
              <div className="grid h-11 w-11 flex-none place-items-center rounded-lg" style={{ background: C.actionDim, color: C.action }}><span className="material-icons-outlined" style={{ fontSize: 24 }}>upload_file</span></div>
              <div className="flex-1"><h3 className="m-0 text-[18px] font-extrabold">{L("Upload an off-platform quote", "رفع عرض سعر خارجي")}</h3><p className="m-0 text-[12.5px]" style={{ color: C.muted }}>{L("Your AI assistant reads it and adds it to this comparison.", "يقرأه مساعدك الذكي ويضيفه إلى هذه المقارنة.")}</p></div>
              <button onClick={() => setUploadOpen(false)} className="grid h-8 w-8 flex-none place-items-center rounded-full border" style={{ borderColor: C.border, color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span></button>
            </div>
            <div className="px-6 py-5">
              <label className="block cursor-pointer rounded-xl border-2 border-dashed p-7 text-center" style={{ borderColor: C.border, background: C.surface2 }}>
                <span className="material-icons-outlined" style={{ fontSize: 38, color: C.action }}>cloud_upload</span>
                <b className="mt-2 block text-[14px]" style={{ color: C.navy }}>{L("Drop a file or click to browse", "أفلت ملفاً أو انقر للتصفّح")}</b>
                <span className="text-[12px]" style={{ color: C.muted }}>{L("Excel or PDF quote", "عرض سعر Excel أو PDF")}</span>
                <input type="file" accept=".pdf,.xlsx,.xls,.csv,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ""; }} />
              </label>
              <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12px]" style={{ background: C.renteeDim, borderColor: "rgba(37,99,235,.2)", color: C.navyMid }}>
                <span className="material-icons-outlined" style={{ fontSize: 17, color: C.rentee }}>auto_awesome</span>{L("Your assistant normalizes the quote to the same basis as platform bids — same rate units, same all-in, same requirement checks — so it compares like-for-like.", "يوحّد مساعدك عرض السعر على نفس أساس عروض المنصة — نفس الوحدات ونفس الإجمالي ونفس الفحوصات — ليقارن مثلاً بمثل.")}
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t px-6 py-4" style={{ borderColor: C.line }}>
              <button onClick={() => setUploadOpen(false)} className="rounded-lg border px-4 py-2 text-[13px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>{L("Cancel", "إلغاء")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── confirm-before-adding a flagged uploaded quote (match.needs_confirmation) ── */}
      {confirmAdd && (
        <div className="fixed inset-0 z-[420] grid place-items-center p-6" style={{ background: "rgba(28,53,80,.42)", backdropFilter: "blur(3px)" }} onClick={() => setConfirmAdd(null)}>
          <div className="w-[460px] max-w-full overflow-hidden rounded-2xl" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b px-6 py-5" style={{ borderColor: C.line }}>
              <div className="grid h-11 w-11 flex-none place-items-center rounded-lg" style={{ background: C.warningBg, color: C.warning }}><span className="material-icons-outlined" style={{ fontSize: 24 }}>warning_amber</span></div>
              <div className="flex-1"><h3 className="m-0 text-[17px] font-extrabold">{L("This quote may not match", "قد لا يطابق هذا العرض")}</h3><p className="m-0 text-[12.5px]" style={{ color: C.muted }}>{L(`${confirmAdd.card.supplierName} — check these before adding it to the comparison.`, `${confirmAdd.card.supplierName} — راجع هذه قبل إضافته للمقارنة.`)}</p></div>
              <button onClick={() => setConfirmAdd(null)} className="grid h-8 w-8 flex-none place-items-center rounded-full border" style={{ borderColor: C.border, color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span></button>
            </div>
            <div className="px-6 py-5">
              <ul className="flex flex-col gap-2">
                {confirmAdd.warnings.length ? confirmAdd.warnings.map((wn, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px]" style={{ background: C.warningBg, borderColor: "rgba(212,120,10,.3)", color: "#8A5A06" }}>
                    <span className="material-icons-outlined" style={{ fontSize: 16, color: C.warning }}>error_outline</span>{wn}
                  </li>
                )) : (
                  <li className="text-[12.5px]" style={{ color: C.muted }}>{L("The assistant couldn't fully confirm this quote matches your item, location and dates.", "تعذّر على المساعد تأكيد مطابقة العرض للصنف والموقع والتواريخ.")}</li>
                )}
              </ul>
              <p className="mt-3 text-[11.5px]" style={{ color: C.muted }}>{L("Adding it keeps it flagged — it's still shown for review, never auto-excluded.", "ستبقى الإضافة مع تنبيه — يظهر للمراجعة ولا يُستبعد تلقائياً.")}</p>
            </div>
            <div className="flex justify-end gap-2.5 border-t px-6 py-4" style={{ borderColor: C.line }}>
              <button onClick={() => setConfirmAdd(null)} className="rounded-lg border px-4 py-2 text-[13px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>{L("Don't add", "لا تُضِف")}</button>
              <button onClick={confirmAddBid} className="rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: C.action }}>{L("Add anyway", "أضِفه على أي حال")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── add-your-cost popup (replaces the browser prompt) ── */}
      {costAsk && (
        <div className="fixed inset-0 z-[420] grid place-items-center p-6" style={{ background: "rgba(28,53,80,.42)", backdropFilter: "blur(3px)" }} onClick={() => setCostAsk(null)}>
          <div className="w-[420px] max-w-full overflow-hidden rounded-2xl" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b px-6 py-5" style={{ borderColor: C.line }}>
              <div className="grid h-11 w-11 flex-none place-items-center rounded-lg" style={{ background: C.renteeDim, color: C.rentee }}><span className="material-icons-outlined" style={{ fontSize: 24 }}>add_card</span></div>
              <div className="flex-1"><h3 className="m-0 text-[17px] font-extrabold">{L(`Your estimate — ${costAsk.label}`, `تقديرك — ${costAsk.label}`)}</h3><p className="m-0 text-[12.5px]" style={{ color: C.muted }}>{L("Your own estimate — added to the total so you get a sense of the real cost.", "تقديرك أنت — يُضاف للإجمالي لتتكوّن لديك صورة عن التكلفة الحقيقية.")}</p></div>
              <button onClick={() => setCostAsk(null)} className="grid h-8 w-8 flex-none place-items-center rounded-full border" style={{ borderColor: C.border, color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span></button>
            </div>
            <div className="px-6 py-5">
              <div className="flex h-[50px] items-center gap-2.5 rounded-lg border px-4" style={{ background: C.surface2, borderColor: C.border }}>
                <span className="text-[14px] font-extrabold" style={{ color: C.muted }}>{sar}</span>
                <input autoFocus type="number" inputMode="numeric" min={0} value={costInput} onChange={(e) => setCostInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitCost(); }} placeholder="0" className="min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none" style={{ color: C.navy }} />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t px-6 py-4" style={{ borderColor: C.line }}>
              <button onClick={() => setCostAsk(null)} className="rounded-lg border px-4 py-2 text-[13px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>{L("Cancel", "إلغاء")}</button>
              <button onClick={submitCost} className="rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: C.rentee }}>{L("Add to total", "أضِف للإجمالي")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── toast ── */}
      {toastMsg && (
        <div className="fixed inset-x-0 bottom-6 z-[500] mx-auto flex w-max max-w-[90%] items-center gap-2 rounded-lg px-4 py-3 text-[13px] font-bold text-white" style={{ background: C.navy, boxShadow: "0 14px 30px rgba(28,53,80,.35)" }}>
          <span className="material-icons-outlined" style={{ fontSize: 18, color: "#7BE0A5" }}>check_circle</span>{toastMsg}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- bits ---------------------------------- */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = String(reader.result ?? ""); const i = s.indexOf("base64,"); resolve(i >= 0 ? s.slice(i + "base64,".length) : s); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function Box({ title, children }: { title?: string; children: React.ReactNode }) {
  return <div className="rounded-xl border p-8 text-center" style={{ borderColor: C.border, background: "#fff" }}>{title && <div className="text-[14px] font-bold" style={{ color: C.navy }}>{title}</div>}<div className="mt-1 text-[12.5px]" style={{ color: C.muted }}>{children}</div></div>;
}
function Spinner() {
  return <div className="grid place-items-center py-16" style={{ color: C.muted }}><span className="material-icons-outlined animate-spin" style={{ fontSize: 28 }}>progress_activity</span></div>;
}
function Pill({ icon, children }: { icon: string | null; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)" }}>{icon ? <span className="material-icons-outlined" style={{ fontSize: 12 }}>{icon}</span> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#FFC97A" }} />}{children}</span>;
}
function SectionRow({ icon, title, accent, accentText, n, collapsed, onToggle }: { id: string; icon: string; title: string; accent: string; accentText: string; n: number; collapsed: boolean; onToggle: () => void }) {
  return (
    <tr><td colSpan={n + 1} style={{ background: `linear-gradient(180deg,${C.navy},${C.navyDeep})`, borderInlineStart: `4px solid ${accent}`, padding: 0 }}>
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 px-4 py-3 text-start">
        <span className="material-icons-outlined" style={{ fontSize: 18, color: accentText }}>{icon}</span>
        <b className="text-[12.5px] font-extrabold uppercase" style={{ color: accentText, letterSpacing: ".3px" }}>{title}</b>
        <span className="material-icons-outlined ms-auto" style={{ fontSize: 20, color: "rgba(255,255,255,.72)", transform: collapsed ? "rotate(-90deg)" : "" }}>expand_more</span>
      </button>
    </td></tr>
  );
}
function RowHead({ title, sub }: { title: string; sub?: string }) {
  return <td className="sticky start-0 z-[1] p-3.5 align-top text-[12.5px] font-bold" style={{ background: C.surface2, color: C.navyMid, width: 190, minWidth: 190, borderBottom: `1px solid ${C.line}` }}>{title}{sub && <span className="block text-[11px] font-semibold" style={{ color: C.muted }}>{sub}</span>}</td>;
}
function Td({ children, ok, fail }: { children: React.ReactNode; ok?: boolean; fail?: boolean }) {
  return <td className="p-3.5 align-top text-[13px] font-bold" style={{ borderBottom: `1px solid ${C.line}`, color: C.navy, background: ok ? "rgba(29,175,88,.06)" : fail ? "rgba(217,54,42,.07)" : undefined }}>{children}</td>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-[11px] font-semibold" style={{ color: C.muted }}>{children}</span>;
}
