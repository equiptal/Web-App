"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useAuthGate } from "@/components/auth/AuthGate";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { agentUses, bumpAgentUse, guestLimitReached, GUEST_AGENT_LIMIT } from "@/lib/access/agent-quota";
import { fetchAllMyRequests, fetchBids, fetchRequestSubmissions, startDealRoom, recommendBids, askBids, parseBid, transformBid, captureBidEvents, fetchDealRoomDocuments, fetchBidDocuments, fetchDealRoom } from "@/lib/api/client";
import { submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";
import { groupRequests, type RequestGroup } from "@/lib/contract/requests";
import type { DealRoomDocuments, DealTerm } from "@/lib/contract/deal-room";
import { CERT_LABEL, type BidCard, type CertCode, type TermRow, type TermState } from "@/lib/contract/bids";
import { buildItemComparison, sortByPreset, displayQuote, responsibilityTone, rowWinners, type BidColumn, type Preset, type CostResponsibility, type RatePeriod, type PricesFor } from "@/lib/contract/comparison";
import { bidColumnToComputed, normalizedBidToBidCard, presetToAgent, type RecommendResult, type NormalizedBid } from "@/lib/contract/agent-bids";
import { BID_VERIFY_ENABLED } from "@/lib/flags";
import { bidQuoteToFormDraft, type BidFormDraft, type TransformRequestCtx } from "@/lib/contract/bid-form";
import { BidVerifyModal } from "@/components/compare/BidVerifyModal";
import { EquipImg } from "@/components/requests/EquipImg";

/** Deal-room term state → the comparison's TermRow state. The deal room is the source of truth for a
 *  negotiated bid (the bids-list payload lacks live disputed/pending states). Keys absent from the room
 *  keep their bid-vs-request state. */
const DR_STATE_TO_TERM: Record<string, TermState> = {
  disputed: "conflict",
  pending: "negotiating",
  agreed: "agreed",
  soft_accepted: "agreed",
  fixed: "matched",
};
/** Return an overlaid copy of the bid whose term rows reflect the live deal-room term states/values
 *  (matched by key across contract/equipment/supplier + negotiableTerms). Immutable — never mutates
 *  the source bid. */
// The comparison splits FAT into fat_food + fat_accommodation_transport, but the deal room may carry a
// single combined `fat` term ("Operator FAT"). Alias the combined term onto both split rows — but ONLY
// when it's a POSITIVE resolution. Older bids left a stale default on the retired combined control
// (e.g. `fat = supplier`) that disputes; inheriting that would manufacture a phantom conflict on split
// rows whose real per-item values actually match. So a combined `fat` that's disputed/pending is ignored.
const FAT_SPLIT_KEYS = new Set(["fat_food", "fat_accommodation_transport"]);
const FAT_ALIAS_STATES = new Set(["agreed", "soft_accepted", "fixed"]);

function overlayDealRoomTerms(bid: BidCard, roomTerms: DealTerm[] | undefined): BidCard {
  if (!roomTerms || roomTerms.length === 0) return bid;
  const byKey = new Map(roomTerms.map((t) => [t.key, t]));
  const apply = (row: TermRow): TermRow => {
    const aliasFat = FAT_SPLIT_KEYS.has(row.key) ? byKey.get("fat") : undefined;
    const dt = byKey.get(row.key) ?? (aliasFat && FAT_ALIAS_STATES.has(String(aliasFat.state)) ? aliasFat : undefined);
    if (!dt) return row;
    const st = DR_STATE_TO_TERM[String(dt.state)];
    const value = dt.value == null ? row.value : Array.isArray(dt.value) ? dt.value.map(String).join(", ") : String(dt.value);
    return { ...row, state: st ?? row.state, value };
  };
  return {
    ...bid,
    terms: {
      equipment: bid.terms.equipment.map(apply),
      contract: bid.terms.contract.map(apply),
      supplier: bid.terms.supplier.map(apply),
    },
    negotiableTerms: (bid.negotiableTerms ?? []).map(apply),
  };
}

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
  const t = useT();
  const { status } = useSession();
  const { openAuth } = useAuthGate(); // app-wide sign-in modal (same as the header "Sign in" — no /login page)
  // A signed-out visitor gets the SAME comparison workspace, minus any request/group context: they
  // upload quotes (transformed through the same verify→template flow), compare them in the same matrix,
  // and use the same AI rank/ask — capped at a per-device free trial, then prompted to create an account.
  const anon = status === "anon";
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
  const [linkByRequest, setLinkByRequest] = useState<Record<string, number>>({}); // off-platform link-bid count per request id — folded into selector gating so link-only requests aren't hidden
  const [linkByGroup, setLinkByGroup] = useState<Record<string, number>>({}); // DISTINCT off-platform submissions per group (a submission spanning N items counts once) — for the group total
  const [linkLoaded, setLinkLoaded] = useState(false); // off-platform counts fetched (so default selection can wait for link-only groups)
  const [groupRefById, setGroupRefById] = useState<Record<string, string>>({}); // request-group id → RFQ-NNNNN group code (from any submission), shown on the RFQ tabs
  const [error, setError] = useState(false);
  const [activeLoc, setActiveLoc] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [bids, setBids] = useState<BidCard[] | null>(null);
  const [bidsLoading, setBidsLoading] = useState(false);
  // Live deal-room terms per dealRoomId — the source of truth for negotiated term states, overlaid onto
  // the comparison (the bids-list payload only carries agreed/unread, not disputed/pending).
  const [roomTerms, setRoomTerms] = useState<Record<string, DealTerm[]>>({});
  const [submissions, setSubmissions] = useState<LinkBidSubmission[]>([]); // off-platform shared-link bids for the active item
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<Preset>("best");
  const [period, setPeriod] = useState<RatePeriod>("PER_DAY"); // RATE PERIOD toggle (Day/Week/Month) — display + totals
  const [pricesFor, setPricesFor] = useState<PricesFor>("unit"); // PRICES FOR toggle — default PER UNIT
  // Default the RATE PERIOD to how the bids were actually quoted (the request's rental type) so a monthly
  // bid shows e.g. "SAR 120/month" instead of its per-day conversion "SAR 4/day". Runs once when bids
  // load; the renter can still toggle. (All bids share the request's rental unit.)
  const periodInit = useRef(false);
  useEffect(() => {
    if (periodInit.current || !bids || bids.length === 0) return;
    const u = bids.find((b) => b.priceUnit)?.priceUnit?.toUpperCase();
    if (u === "PER_DAY" || u === "PER_WEEK" || u === "PER_MONTH") setPeriod(u as RatePeriod);
    periodInit.current = true;
  }, [bids]);
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
  const [itemMenuOpen, setItemMenuOpen] = useState(false); // §6 item icon-dropdown (replaces the item pill bar)
  const [chatOpen, setChatOpen] = useState(false); // the AI chat is a side drawer (the re-rank bar stays inline)
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [costAsk, setCostAsk] = useState<{ type: "resp"; key: CostResponsibility["key"]; label: string } | { type: "mob"; bidId: string; label: string } | null>(null);
  const [costInput, setCostInput] = useState("");
  const [estimateOpen, setEstimateOpen] = useState(false); // §6: one multi-field "Estimate your own costs" popup
  const [estDraft, setEstDraft] = useState<Record<string, string>>({});
  const [renterMob, setRenterMob] = useState<Record<string, number>>({}); // renter's own delivery (mob/demob) estimate per bid
  // Request-level delivery/return estimate — mob/demob assignment is the same for every bid, so when
  // it's "on you" the renter estimates it once (in the "Estimate your costs" popup), not per bid.
  const [renterMobEst, setRenterMobEst] = useState<{ delivery?: number; return?: number }>({});
  const [docView, setDocView] = useState<{ label: string; url: string | null; value?: string | null; loading: boolean } | null>(null); // in-app document viewer (url = uploaded file; value = captured form text)
  // Presigned documents (company verification + equipment) per bid, fetched on demand from
  // /api/me/bids/:id/documents — drives the "green if the doc exists" chips and the in-app viewer.
  const [bidDocs, setBidDocs] = useState<Record<string, DealRoomDocuments>>({});
  // A parsed quote the agent flagged (match.needs_confirmation) — added to the comparison only on confirm.
  const [confirmAdd, setConfirmAdd] = useState<{ card: BidCard; warnings: string[]; blocking: boolean } | null>(null);
  const [verify, setVerify] = useState<{ draft: BidFormDraft; extracted: NormalizedBid } | null>(null); // BID_VERIFY_ENABLED: renter-verify screen for an uploaded quote
  const prevRankRef = useRef<RecommendResult["ranking"] | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preselectRef = useRef<Set<string> | null>(null); // bid ids to pre-select from ?bids= (one-shot, from My Bids)
  const [showAccount, setShowAccount] = useState(false); // guest: the create-account gate (opens when the free trial is spent, or on a sign-in-only action)
  const router = useRouter();

  // Guest metering (T10): the interactive AI assistant (custom re-rank + ask) is the metered "analysis".
  // Guest free trial = 3 quote UPLOADS (metered in onUpload). This guard opens the account gate once the
  // allowance is spent, for any guest action (another upload, a custom re-rank, an assistant question).
  // It does NOT itself consume a credit — only a successfully-read upload does — so the counter tracks
  // files uploaded, not clicks. Signed-in users are never limited.
  const guardGuest = (): boolean => {
    if (!anon) return true;
    if (guestLimitReached("compare")) { setShowAccount(true); return false; }
    return true;
  };
  const guestUploadsLeft = anon ? Math.max(0, GUEST_AGENT_LIMIT - agentUses("compare")) : 0;

  function toast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }

  useEffect(() => {
    // Guests have no requests/groups to load — seed an empty bid set so the matrix builds purely from
    // their uploaded quotes (`raw` = [...[], ...uploaded]); skip the authed fetch entirely.
    if (anon) { setBids([]); return; }
    let active = true;
    // Load ALL requests (paged), not just the 20 newest — otherwise bids on the renter's older
    // requests silently drop out of the comparison once the account accumulates newer ones.
    fetchAllMyRequests()
      .then((d) => active && setGroups(groupRequests(d.requests)))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, [anon]);

  // Off-platform (shared-link form) bids don't appear in fetchMyRequests' bidCount. Fetch each
  // broadcast group's submissions and count them per request, so a request that received ONLY form
  // bids still surfaces in the location/item selector (mirrors RequestsList). Best-effort.
  useEffect(() => {
    if (!groups) return;
    let active = true;
    const targets = groups.filter((g) => g.type !== "DIRECT");
    Promise.all(
      targets.map((g) => fetchRequestSubmissions(g.id).then((r) => r.submissions).catch(() => [] as LinkBidSubmission[])),
    ).then((all) => {
      if (!active) return;
      const rmap: Record<string, number> = {};
      const gmap: Record<string, number> = {};
      const gref: Record<string, string> = {};
      all.forEach((subs, i) => {
        // `all` is aligned with `targets`; the group's RFQ code is the groupRef on any of its submissions.
        const g = gref[targets[i].id] ? null : subs.find((s) => s.groupRef)?.groupRef;
        if (g) gref[targets[i].id] = g;
        // Per-item link count (a submission on N items counts on each) — for the item selector.
        for (const sub of subs) for (const it of sub.items) if (it.requestId) rmap[it.requestId] = (rmap[it.requestId] ?? 0) + 1;
        // DISTINCT submissions for the group (a multi-item submission counts once) — for the group total.
        gmap[targets[i].id] = new Set(subs.map((s) => s.id)).size;
      });
      setLinkByRequest(rmap);
      setLinkByGroup(gmap);
      setGroupRefById(gref);
      setLinkLoaded(true);
    });
    return () => { active = false; };
  }, [groups]);

  // Per-item "effective" bid count (app bids + link bids touching that item) — for the item selector.
  const effItemBids = (it: RequestGroup["items"][number]) => it.bidCount + (linkByRequest[it.id] ?? 0);
  // GROUP total = DISTINCT bids (T10): app bids (each on one item) + distinct link submissions (a
  // submission spanning several items counts once), so it matches the fulfilment panel / "View all bids".
  const effGroupBids = (g: RequestGroup) => g.items.reduce((s, it) => s + it.bidCount, 0) + (linkByGroup[g.id] ?? 0);

  const locations = useMemo<LocationNode[]>(() => {
    if (!groups) return [];
    const map = new Map<string, LocationNode>();
    for (const g of groups) {
      // One tab per REQUEST group (key by group id) — not per coarse location label, which merged
      // unrelated requests that share a city and showed their items together. Matches My Bids.
      const key = g.id;
      const place = g.locationLabel || g.city || L("Location", "الموقع");
      const node = map.get(key) ?? { key, label: place, groups: [], itemCount: 0, bidCount: 0 };
      node.groups.push(g);
      node.itemCount += g.items.length;
      node.bidCount += effGroupBids(g);
      map.set(key, node);
    }
    // Only surface locations that actually have bids to compare (fall back to all if none do).
    const all = [...map.values()];
    const withBids = all.filter((n) => n.bidCount > 0);
    // Order the RFQ tabs by date, newest first — so the latest request leads (matches the My Requests
    // / My Bids tab order). createdAt comes from the group; a missing date sorts last.
    const ts = (n: LocationNode) => (n.groups[0]?.createdAt ? new Date(n.groups[0].createdAt as string).getTime() : 0);
    return (withBids.length ? withBids : all).sort((a, b) => ts(b) - ts(a));
  }, [groups, ar, linkByRequest]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const target = (itemId && g?.items.find((i) => i.id === itemId)) || g?.items.find((i) => effItemBids(i) > 0) || g?.items[0];
        if (target) setActiveItem(target.id);
        return;
      }
      // groupId points to a link-only group still filtered out — wait for off-platform counts before
      // falling back, so we don't default to the wrong location and miss it.
      if (!linkLoaded) return;
    }
    setActiveLoc(locations[0].key);
  }, [locations, activeLoc, linkLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const loc = locations.find((l) => l.key === activeLoc) ?? locations[0];
  const group = loc?.groups.find((g) => effGroupBids(g) > 0) ?? loc?.groups[0];
  const items = loc ? loc.groups.flatMap((g) => g.items) : [];

  useEffect(() => {
    if (items.length && !items.some((i) => i.id === activeItem)) {
      const firstWithBids = items.find((i) => effItemBids(i) > 0) ?? items[0];
      setActiveItem(firstWithBids?.id ?? null);
    }
  }, [loc?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (anon) return; // guest: bids stay the uploaded-only set (seeded above); never reset to null / refetched
    if (!activeItem) { setBids(null); return; }
    let active = true;
    setBidsLoading(true);
    setUploaded([]); setRec(null); setAgentLive(false); setFreeText(""); setFreeApplied(""); setFxEcho(null); setChat([]); setConfirmAdd(null); setVerify(null); setRenterMob({}); prevRankRef.current = null;
    fetchBids(activeItem)
      .then((d) => active && setBids(d.bids))
      .catch(() => active && setBids([]))
      .finally(() => active && setBidsLoading(false));
    // Off-platform shared-link submissions for this item (selectable alongside app bids).
    setSubmissions([]);
    fetchRequestSubmissions(activeItem).then((r) => active && setSubmissions(r.submissions)).catch(() => {});
    return () => { active = false; };
  }, [activeItem, anon]);

  // The renter's private cost estimates persist locally ("saved for next time", Q2) — these are the
  // renter's own rough planning numbers for responsibilities that land on them; never sent anywhere.
  useEffect(() => {
    try { const raw = localStorage.getItem("cmp-renter-costs"); if (raw) setRenterCosts(JSON.parse(raw)); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("cmp-renter-costs", JSON.stringify(renterCosts)); } catch {}
  }, [renterCosts]);
  useEffect(() => {
    try { const raw = localStorage.getItem("cmp-renter-mob-est"); if (raw) setRenterMobEst(JSON.parse(raw)); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("cmp-renter-mob-est", JSON.stringify(renterMobEst)); } catch {}
  }, [renterMobEst]);

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

  // Fetch each compared bid's deal room so its LIVE term states (disputed/pending/agreed) drive the
  // comparison — the deal room is the source of truth. Best-effort + parallel; re-runs when `bids`
  // refreshes (incl. the 20s poll), so the matrix tracks live negotiation. A failed fetch just leaves
  // that bid on its bid-vs-request state.
  useEffect(() => {
    const ids = [...new Set((bids ?? []).map((b) => b.dealRoomId).filter((x): x is string => !!x))];
    if (!ids.length) return;
    let active = true;
    Promise.all(ids.map((id) => fetchDealRoom(id).then((r) => [id, r.terms] as const).catch(() => null))).then((pairs) => {
      if (!active) return;
      const next: Record<string, DealTerm[]> = {};
      for (const p of pairs) if (p) next[p[0]] = p[1];
      if (Object.keys(next).length) setRoomTerms((prev) => ({ ...prev, ...next }));
    });
    return () => { active = false; };
  }, [bids]);

  const reqDurationDays = items.find((i) => i.id === activeItem)?.durationDays ?? null;
  // Staging demo: tag the first real bid as off-platform "via shared link" (rest = via Moedatech app).
  const raw = useMemo<BidCard[] | null>(() => {
    if (!bids) return null;
    // App bids + off-platform submissions + any uploaded quotes. A group submission covers all items,
    // so map it to THIS active item's pricing (match the submission item to the active request). The id
    // is per-item (`link-<sub>-<item>`) to match the My Bids card ids the Compare button preselects.
    const linkCards = submissions.flatMap((s) => {
      // Match the submission's item to the active request (a group submission covers several items).
      // Mirror My Bids: fall back to the sole item when the per-item `requestId` link is missing/unset
      // (older submissions, or an item id not in the group map) so a single-item submission still shows
      // instead of being silently dropped — and its card id matches the My Bids → Compare preselection.
      const it = s.items.find((i) => i.requestId === activeItem) ?? (s.items.length === 1 ? s.items[0] : null);
      if (!it) return [];
      return [{ ...submissionToBidCard(s, it), id: `link-${s.id}-${it.requestItemId}` }];
    });
    // Overlay live deal-room term states onto app bids (source of truth) before comparing; off-platform
    // link cards + uploads have no deal room, so they pass through untouched.
    const overlaidBids = bids.map((b) => (b.dealRoomId ? overlayDealRoomTerms(b, roomTerms[b.dealRoomId]) : b));
    return [...overlaidBids, ...linkCards, ...uploaded];
  }, [bids, uploaded, submissions, activeItem, roomTerms]);
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
    // Renter-view order (parity with the bid list): in-app (platform) columns FIRST, off-platform
    // (shared-link / uploaded) after — a STABLE partition, so each group keeps the active ranking (preset
    // or agent). Under the default "Best" preset that leaves off-platform highest-quality-first.
    const isOffPlatform = (c: BidColumn) => !!c.bid.viaSharedLink || !!c.bid.converted || String(c.bid.id).startsWith("link-") || String(c.bid.id).startsWith("upload:");
    const inAppFirst = (list: BidColumn[]) => [...list.filter((c) => !isOffPlatform(c)), ...list.filter(isOffPlatform)];
    // The 4 preset criteria (Best / Lowest / Newest / Most trusted) are ALWAYS a deterministic web sort.
    // The agent order applies ONLY when a free-text query is active (the "Ask AI" box) — a preset never
    // hands the ranking to the agent. (choosePreset clears freeApplied, so a preset click drops to the
    // web sort even if the agent is live.)
    if (freeApplied && agentLive && rec?.ranking?.length) {
      // String() both sides so a number/string id mismatch can't break the match.
      const rank = new Map(rec.ranking.map((r) => [String(r.bid_id), r.rank] as const));
      // Only trust the agent order when it actually covers the current columns; else fall back to the
      // deterministic sort so the table never freezes.
      const covered = baseCols.length > 0 && baseCols.every((c) => rank.has(String(c.bid.id)));
      if (covered) return inAppFirst([...baseCols].sort((a, b) => rank.get(String(a.bid.id))! - rank.get(String(b.bid.id))!));
    }
    return inAppFirst(detCols);
  }, [baseCols, detCols, agentLive, rec, freeApplied]);
  // Fetch each visible bid's documents once (company + equipment, presigned) so the company-doc
  // chips reflect what's actually uploaded and open the real file — no deal room needed. Best-effort:
  // if the endpoint isn't available the chips fall back to the bid-list compliance flags.
  useEffect(() => {
    // Only in-app bids have a real /bids/{id}/documents endpoint. Off-platform shared-link bids
    // (id `link-…`) carry their company docs as inline values, and uploaded quotes (`upload:…`) have
    // no files — so skip both, or the fetch 404s on those synthetic ids.
    const missing = cols
      .map((c) => c.bid.id)
      .filter((id) => id && !id.startsWith("link-") && !id.startsWith("upload:") && !(id in bidDocs));
    if (!missing.length) return;
    let alive = true;
    Promise.all(
      missing.map(async (id) => {
        try { return [id, await fetchBidDocuments(id)] as const; } catch { return [id, { companyDocuments: [], equipmentDocuments: [] }] as const; }
      }),
    ).then((entries) => { if (alive) setBidDocs((p) => ({ ...p, ...Object.fromEntries(entries) })); });
    return () => { alive = false; };
  }, [cols, bidDocs]);
  // The pick = the agent's pick when it maps to a visible column, else the top-ranked column. Either way it
  // tracks the current order, so the highlight moves when you re-rank.
  const pickIdRaw = rec?.recommendation.pick_bid_id != null ? String(rec.recommendation.pick_bid_id) : null;
  const pickId = agentLive && pickIdRaw && cols.some((c) => String(c.bid.id) === pickIdRaw)
    ? pickIdRaw
    : cols.length > 1 ? cols[0]?.bid.id ?? null : null;
  const suggestions = rec?.suggestions ?? []; // context-aware what-if chips from Mansour (replace the hardcoded set)
  // T17 — a request is "decided" when a bid is ACCEPTED in the deal room (→ "Accepted") OR the rentee
  // reported this supplier as the winner in a survey (`wonViaSurvey` → "Awarded"). App parity: the mobile
  // bid card reflects BOTH signals. Case B (awarded in the UI only) is a soft, reversible local mark that
  // does NOT close the request. Precedence: backend accepted/awarded > local.
  const awarded = bids?.find((b) => b.status === "ACCEPTED" || b.wonViaSurvey === true) ?? null;
  const decidedByAccept = awarded != null;
  // Which word to show for the decided winner: a deal-room accept reads "Accepted", a survey win "Awarded".
  const decidedWord = awarded?.status === "ACCEPTED" ? L("Accepted", "مقبول") : L("Awarded", "تمت الترسية");
  // Award = a per-column toggle that PERSISTS (localStorage): "🔨 Award" → "✓ Awarded". Awarding opens a
  // prompt to finalize by accepting the terms with the supplier in the deal room; un-clicking removes it.
  const [awardedIds, setAwardedIds] = useState<Record<string, boolean>>({});
  const [awardPrompt, setAwardPrompt] = useState<BidCard | null>(null);
  useEffect(() => { try { const raw = localStorage.getItem("compare-awarded-ids"); if (raw) setAwardedIds(JSON.parse(raw)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("compare-awarded-ids", JSON.stringify(awardedIds)); } catch {} }, [awardedIds]);
  const toggleAward = (bid: BidCard) => {
    if (anon) { setShowAccount(true); return; } // awarding a supplier needs an account
    const was = !!awardedIds[bid.id];
    // Single-winner lock (app parity): a request/group has ONE winner. Block awarding a DIFFERENT
    // supplier while one is already awarded — whether by a backend accept / survey win (`awarded`) OR a
    // local award (`awardedIds`). Toggling the current winner OFF (to re-decide) is still allowed.
    if (!was) {
      const currentId = awarded?.id ?? Object.keys(awardedIds).find((id) => awardedIds[id]);
      if (currentId && currentId !== bid.id) {
        const wname = bids?.find((b) => b.id === currentId)?.supplierName ?? "";
        toast(L(`Already awarded${wname ? ` to ${wname}` : ""} — remove it first`, `تمت الترسية${wname ? ` إلى ${wname}` : ""} — أزِلها أولاً`));
        return;
      }
    }
    setAwardedIds((m) => { const n = { ...m }; if (was) delete n[bid.id]; else n[bid.id] = true; return n; });
    if (was) toast(L(`Removed award — ${bid.supplierName}`, `أُزيلت الترسية — ${bid.supplierName}`));
    else setAwardPrompt(bid); // just awarded → offer to finalize in the deal room
  };
  // seed once from a backend-accepted bid so a real award shows as ✓ Awarded; then it's a persistent local toggle.
  useEffect(() => { if (awarded?.id) setAwardedIds((m) => (awarded.id in m ? m : { ...m, [awarded.id]: true })); }, [awarded?.id]);
  const activeItemObj = items.find((i) => i.id === activeItem);
  const durationDays = activeItemObj?.durationDays ?? null;
  const units = activeItemObj?.item?.qty ?? 1;
  // itemName() joins subtype + capacity with " · " — split so the card shows the name as title, spec (e.g. "1800 cfm") in the sub.
  const itemFullName = (ar ? activeItemObj?.item?.nameAr : activeItemObj?.item?.name) ?? "";
  const [itemBaseName, ...itemSpecParts] = itemFullName.split(" · ");
  const itemSpec = itemSpecParts.join(" · ");
  const mobByRentee = activeItemObj?.mobByRentee ?? null; // who YOUR request assigned DELIVERY (mobilization) to (true = you, false = supplier)
  const demobByRentee = activeItemObj?.demobByRentee ?? null; // …and RETURN (demobilization) — can differ from delivery
  // The renter's request-level delivery/return estimate that lands on them (only the parts assigned to
  // "you"). Same for every bid, so it's entered once in the "Estimate your costs" popup.
  const mobEstOnYou = (mobByRentee === true ? (renterMobEst.delivery ?? 0) : 0) + (demobByRentee === true ? (renterMobEst.return ?? 0) : 0);
  // Displayed total = the supplier's STATED costs + 15% VAT + the renter's own entered costs (responsibilities
  // on them + their delivery estimate). Always shown as a running total of what's known — never "not stated".
  const VAT = 0.15;
  // A cost the renter adds counts toward their total unless the supplier already covers it (AC-12).
  // (Matches the chips: you can only add a cost where bidSide !== "supplier".)
  const renterAddBid = (c: BidColumn) => c.costResponsibilities.reduce((s, x) => (x.renterCost && x.bidSide !== "supplier" ? s + x.renterCost : s), 0) + (renterMob[c.bid.id] ?? mobEstOnYou);
  // §6 toggles drive the totals: displayQuote re-expresses rate for the chosen RATE PERIOD and scales
  // every figure by PRICES-FOR. unitsOf is PER COLUMN = the units that supplier offered (1 when "Per unit").
  const dq = (c: BidColumn) => displayQuote(c.bid, period, pricesFor, durationDays);
  const unitsOf = (c: BidColumn) => dq(c).units; // = pricesFor === "all" ? (bid.unitsOffered || …) : 1
  // Mob/demob are PER-UNIT when the supplier handles them (× quantity, like the rate) — not one-time.
  const mobDemobUnit = (c: BidColumn) => (c.mob.stated ? c.mob.value : 0) + (c.demob.stated ? c.demob.value : 0);
  const mobDemobTotal = (c: BidColumn) => mobDemobUnit(c) * unitsOf(c);
  const supplierStated = (c: BidColumn) => dq(c).subtotal;
  // Match a presigned doc ({type,label}) to a chip's hint, by fuzzy substring on type or label.
  const norm = (str: string) => str.toLowerCase().replace(/[^a-z]/g, "");
  const docMatches = (hint: string) => {
    const h = norm(hint);
    return (x: { type?: string; label?: string }) => {
      const tn = norm(x.type ?? ""), ln = norm(x.label ?? "");
      return (!!tn && (tn.includes(h) || h.includes(tn))) || (!!ln && (ln.includes(h) || h.includes(ln)));
    };
  };
  // L1 company documents — a chip is GREEN when the supplier actually uploaded that doc (presigned in
  // bidDocs) OR the bid's compliance flag is set; required-but-missing (LC/SASO) → ✗; otherwise hidden.
  // The OR keeps CR/VAT green from the numbers and means a missing /documents endpoint degrades to flags.
  const companyDocChips = (bid: BidColumn["bid"]) => {
    const k = bid.compliance;
    const company = bidDocs[bid.id]?.companyDocuments;
    const hasDoc = (hint: string) => !!company && company.some((x) => x.url && docMatches(hint)(x));
    return [
      { lbl: L("CR", "السجل التجاري"), has: hasDoc("commercial") || k.activityLicense, req: false, hint: "commercial" },
      { lbl: L("VAT", "الرقم الضريبي"), has: hasDoc("vat") || k.taxNumber, req: false, hint: "vat" },
      { lbl: L("National address", "العنوان الوطني"), has: hasDoc("national") || k.nationalAddress, req: false, hint: "national" },
      { lbl: L("Local Content", "المحتوى المحلي"), has: hasDoc("local") || k.localContent, req: bid.requiredCerts.includes("LC"), hint: "local" },
      { lbl: L("SASO registration", "تسجيل ساسو"), has: hasDoc("saso") || k.saso, req: bid.requiredCerts.includes("SASO"), hint: "saso" },
    ].filter((d) => d.has || d.req);
  };
  // Open the actual document file for a chip in the in-app viewer. The bid's documents (company
  // verification + equipment, presigned) come from /api/me/bids/:id/documents — NO deal room needed.
  // Use the cached set if we have it, else fetch on the fly; fall back to the deal-room docs endpoint.
  const openDoc = async (c: BidColumn, hint: string, label: string) => {
    setDocView({ label, url: null, loading: true });
    const pred = docMatches(hint);
    const findUrl = (d?: DealRoomDocuments) =>
      d ? [...d.companyDocuments, ...d.equipmentDocuments].find((x) => x.url && pred(x))?.url ?? null : null;
    let url = findUrl(bidDocs[c.bid.id]);
    // Always (re)fetch when the cached set has no match — the cache may be empty from a transient
    // error (e.g. the endpoint was briefly down) or simply not loaded yet. This self-heals on click.
    if (!url) {
      try {
        const fresh = await fetchBidDocuments(c.bid.id);
        setBidDocs((p) => ({ ...p, [c.bid.id]: fresh }));
        url = findUrl(fresh);
      } catch { /* leave null */ }
    }
    // Fallback: the supplier's deal room (if one exists) also signs these docs.
    if (!url && c.bid.dealRoomId) {
      try {
        const d = await fetchDealRoomDocuments(c.bid.dealRoomId);
        url = [...d.companyDocuments, ...d.equipmentDocuments].find(pred)?.url ?? null;
      } catch { /* leave null */ }
    }
    setDocView({ label, url, loading: false });
  };
  /** A clickable doc chip — opens the actual file in an in-app viewer modal (no redirect). */
  const docChip = (c: BidColumn, label: string, has: boolean, hint: string, big = false) => {
    // small = supplier-header chip (10px); big = cert/ownership row chip (prototype 11.5px/800, pad 5px 10px, r8, bordered).
    const base = has ? { background: C.successBg, color: C.success } : { background: C.dangerBg, color: C.danger };
    const style = big ? { ...base, fontWeight: 800, padding: "5px 10px", borderRadius: 8, border: `1px solid ${has ? "rgba(29,175,88,.3)" : "rgba(217,54,42,.3)"}` } : base;
    const cls = big ? "inline-flex items-center gap-1 text-[11.5px]" : "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold";
    // Off-platform bids captured a VALUE (CR/VAT/national text), not a file — show the value, not a doc.
    const linkVal = c.bid.viaSharedLink ? c.bid.linkDocs?.[hint] : undefined;
    // Viewable only when there's something to open: a captured value (link bid) or a real file (app bid).
    // Off-platform certs are acknowledged Yes/No — no file, no value — so no eye icon / no click.
    const viewable = has && (linkVal != null || !c.bid.viaSharedLink);
    const inner = <><span className="material-icons-outlined" style={{ fontSize: 11 }}>{has ? "check" : "close"}</span>{label}{viewable && <span className="material-icons-outlined" style={{ fontSize: 11, opacity: 0.7 }}>visibility</span>}</>;
    if (!viewable) return <span className={cls} style={style}>{inner}</span>;
    const onClick = linkVal ? () => setDocView({ label, url: null, value: linkVal, loading: false }) : () => openDoc(c, hint, label);
    return <button type="button" onClick={onClick} title={linkVal ? L("View value", "عرض القيمة") : L("View document", "عرض المستند")} className={cls} style={style}>{inner}</button>;
  };
  // Green ✓ / red × cert pill WITHOUT a doc-view eye — for declared certs (e.g. the operator's) that
  // have no file to open. Same visual weight as the big docChip.
  const certPill = (label: string, held: boolean) => (
    <span className="inline-flex items-center gap-1 text-[11.5px]" style={{ background: held ? C.successBg : C.dangerBg, color: held ? C.success : C.danger, fontWeight: 800, padding: "5px 10px", borderRadius: 8, border: `1px solid ${held ? "rgba(29,175,88,.3)" : "rgba(217,54,42,.3)"}` }}>
      <span className="material-icons-outlined" style={{ fontSize: 11 }}>{held ? "check" : "close"}</span>{label}
    </span>
  );
  const grandTotal = (c: BidColumn) => Math.round(supplierStated(c) * (1 + VAT)) + renterAddBid(c);
  const hasCost = (c: BidColumn) => supplierStated(c) > 0 || renterAddBid(c) > 0;
  const grandList = cols.filter(hasCost).map(grandTotal);
  const lowestGrand = grandList.length ? Math.min(...grandList) : null;
  const maxGrand = grandList.length ? Math.max(...grandList) : 1;
  // §6 per-row winners — single leader only (ties unhighlighted), shown as a "✓ BEST" tag on the cell.
  const hasDuration = durationDays != null && durationDays > 0; // request has a start+end → show the duration-based rental row
  const rentalWin = rowWinners(cols.map((c) => (c.bid.price != null ? dq(c).rentalForPeriod : null)), "min");
  // Cheapest by the SUPPLIER-borne mob+demob total (only the parts the supplier bears — parts on the
  // renter are "on you", not priced). One combined winner for the single Mobilization + demob row.
  const supBorneUnit = (c: BidColumn) => (mobByRentee !== true && c.mob.stated ? c.mob.value : 0) + (demobByRentee !== true && c.demob.stated ? c.demob.value : 0);
  const mobWin = rowWinners(cols.map((c) => { const u = supBorneUnit(c); return u > 0 ? u : null; }), "min");
  const distanceWin = rowWinners(cols.map((c) => c.bid.distanceKm ?? null), "min");
  const yearWin = rowWinners(cols.map((c) => c.bid.equipment?.year ?? null), "max");
  // §6 rule: one equipment-cert row per REQUIRED cert (not required → not shown).
  const requiredEquipCerts = EQUIP_CERTS.filter((x) => cols.some((c) => c.bid.requiredCerts.includes(x)));
  // Proof-of-ownership docs (Istimara / customs / sale contract …) — one row per type, styled like
  // the cert rows so they read as required equipment documents (matches the prototype's "Istimara" row).
  const ownershipDocTypes = (() => {
    const seen = new Map<string, { key: string; labelEn: string; labelAr: string }>();
    cols.forEach((c) => (c.bid.ownershipDocs ?? []).forEach((o) => { if (!seen.has(o.key)) seen.set(o.key, o); }));
    return [...seen.values()];
  })();
  const bestTag = <span className="ms-1 inline-flex items-center gap-0.5 rounded-full px-[7px] py-0.5 align-middle text-[9.5px]" style={{ background: C.successBg, color: C.success, fontWeight: 900, letterSpacing: ".03em" }}>✓ {L("BEST", "الأفضل")}</span>;
  // §6 rule: only show cost responsibilities the REQUEST assigned (requestSide set) — not required → not shown.
  const requiredResp = RESP_META.filter((m) => cols.some((c) => c.costResponsibilities.find((x) => x.key === m.key)?.requestSide != null));
  // The responsibilities the request put on the RENTER → the fields of the "Estimate your own costs" popup.
  const youTerms = requiredResp.filter((m) => cols.some((c) => c.costResponsibilities.find((x) => x.key === m.key)?.requestSide === "me"));
  // Delivery/return are estimable in the popup only when the request put them on the renter.
  const showDeliveryEst = mobByRentee === true;
  const showReturnEst = demobByRentee === true;
  const estTotal = youTerms.reduce((s, m) => s + (renterCosts[m.key] ?? 0), 0) + mobEstOnYou;
  const openEstimate = () => {
    const d: Record<string, string> = {};
    for (const m of youTerms) { const v = renterCosts[m.key]; if (v != null) d[m.key] = String(v); }
    if (showDeliveryEst && renterMobEst.delivery != null) d.__delivery = String(renterMobEst.delivery);
    if (showReturnEst && renterMobEst.return != null) d.__return = String(renterMobEst.return);
    setEstDraft(d); setEstimateOpen(true);
  };
  const saveEstimate = () => {
    setRenterCosts((p) => {
      const next = { ...p };
      for (const m of youTerms) { const n = parseInt((estDraft[m.key] ?? "").replace(/[^0-9]/g, ""), 10); if (n > 0) next[m.key] = n; else delete next[m.key]; }
      return next;
    });
    // Delivery/return land on the renter at the request level — save them once, applied to every bid.
    setRenterMobEst(() => {
      const dv = showDeliveryEst ? parseInt((estDraft.__delivery ?? "").replace(/[^0-9]/g, ""), 10) : 0;
      const rv = showReturnEst ? parseInt((estDraft.__return ?? "").replace(/[^0-9]/g, ""), 10) : 0;
      const next: { delivery?: number; return?: number } = {};
      if (dv > 0) next.delivery = dv;
      if (rv > 0) next.return = rv;
      return next;
    });
    setEstimateOpen(false);
  };
  // §6 rule: the operator row appears only when the request requires an operator certificate.
  const operatorRequired = cols.some((c) => !!c.bid.operatorCertReq);
  // "Operator included" is an acknowledge term the request asks when it needs an operator. In-app bids
  // carry it on negotiableTerms; off-platform link bids put it on terms.contract (the column's .cost).
  // Surface it in the Equipment section so a supplier's "No" (conflict) reads as red there, not only in
  // the terms modal.
  const operIncOf = (c: BidColumn) =>
    c.cost.find((r) => r.key === "operator_included") ?? (c.bid.negotiableTerms ?? []).find((r) => r.key === "operator_included");
  const operatorIncludedAsked = cols.some((c) => { const t = operIncOf(c); return !!t && t.state !== "grey"; });

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
    if (!guardGuest()) return; // guest: blocked once the 3-upload trial is spent
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

  // Cost-responsibility estimates are entered together in the §6 "Estimate your own costs" popup
  // (openEstimate/saveEstimate) — not per-term. addMobCost is the separate per-bid delivery estimate.
  function addMobCost(bidId: string, label: string) {
    setCostInput("");
    setCostAsk({ type: "mob", bidId, label });
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
    // Guest free trial: 3 quote uploads, then the account gate. Signed-in renters are never limited.
    if (anon && guestLimitReached("compare")) { setShowAccount(true); return; }
    toast(L("Reading the quote…", "جارٍ قراءة العرض…"));
    try {
      const data = await fileToBase64(file);
      if (BID_VERIFY_ENABLED) {
        // Send the request context so the agent PRE-ANSWERS the terms; omit for a guest / no active request.
        const ctx: TransformRequestCtx | undefined = activeItemObj
          ? {
              subtype: activeItemObj.item?.name ?? null,
              terms: (() => {
                const rt = baseCols[0]?.bid;
                return rt ? {
                  fuelType: rt.requestTerms.fuelType ?? undefined,
                  year: rt.reqMinYear ?? undefined,
                  nationality: rt.requestTerms.operatorNationality ?? undefined,
                  operator: rt.requestTerms.operatorIncluded != null ? rt.requestTerms.operatorIncluded.toUpperCase() === "YES" : undefined,
                } : undefined;
              })(),
            }
          : undefined;
        const t = await transformBid({ attachments: [{ type: file.type || "application/octet-stream", filename: file.name, data }], request: ctx });
        if (!t.agent) { toast(L("Quote upload needs your AI assistant — not connected.", "رفع العرض يحتاج مساعدك الذكي — غير متصل.")); return; }
        if (t.result) {
          if (anon) bumpAgentUse("compare"); // a successfully-read guest upload consumes one trial credit
          // Wrong-equipment (match.blocking) → hard "can't compare" popup, never added (same as the
          // non-verify path). Only non-blocking quotes go to the verify screen. `needs_confirmation`
          // is advisory — the verify screen IS the confirm step, so it flows straight in there.
          if (t.result.match?.blocking) {
            setConfirmAdd({ card: normalizedBidToBidCard(t.result.bid, { duration: durationDays, units }), warnings: t.result.match.warnings ?? [], blocking: true });
            return;
          }
          const draft = bidQuoteToFormDraft(t.result.bid, t.result.term_matches, ctx);
          draft.meta.source_file = file.name;
          setVerify({ draft, extracted: t.result.bid });
        } else {
          toast(L("Couldn't read that file. Nothing was added.", "تعذّرت قراءة الملف. لم يُضف شيء."));
        }
        return;
      }
      const r = await parseBid({ attachments: [{ type: file.type || "application/octet-stream", filename: file.name, data }], request_context: { subtype: activeItemObj?.item?.name ?? null } });
      if (!r.agent) { toast(L("Quote upload needs your AI assistant — not connected.", "رفع العرض يحتاج مساعدك الذكي — غير متصل.")); return; }
      if (r.result && r.result.ok) {
        if (anon) bumpAgentUse("compare"); // a successfully-read guest upload consumes one trial credit
        // Qualify the uploaded quote against the SAME request requirements the in-app / link bids carry
        // (year minimum + required equipment certs), sourced from any reference bid already in the table —
        // so its year/certs read green/red like a real bid instead of neutral. Cost/operator terms stay
        // grey (an uploaded file doesn't answer them). No reference bid → stays neutral.
        const reqRef = allCols.map((c) => c.bid).find((b) => b.reqMinYear != null || (b.requiredCerts?.length ?? 0) > 0);
        const card = normalizedBidToBidCard(r.result.bid, { duration: durationDays, units, reqMinYear: reqRef?.reqMinYear ?? null, requiredCerts: reqRef?.requiredCerts ?? [] });
        const m = r.result.match;
        // Severity model (Mansour): TYPE/SIZE mismatch is BLOCKING (wrong equipment) → popup + do NOT add.
        // Any other mismatch (location advisory) needs confirmation → popup, but STILL comparable (add on
        // confirm). No flag → add silently.
        if (m?.blocking) {
          setConfirmAdd({ card, warnings: m.warnings ?? [], blocking: true });
        } else if (m?.needs_confirmation) {
          setConfirmAdd({ card, warnings: m.warnings ?? [], blocking: false });
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
    if (!confirmAdd || confirmAdd.blocking) return; // a blocking (wrong-equipment) quote is never added
    const card = confirmAdd.card;
    setUploaded((p) => [...p.filter((b) => b.id !== card.id), card]);
    toast(L(`Added ${card.supplierName}'s quote — flagged for review.`, `أُضيف عرض ${card.supplierName} — مع تنبيه للمراجعة.`));
    setConfirmAdd(null);
  }

  async function goDealRoom(bid: BidCard, kind: "award" | "negotiate") {
    if (anon) { setShowAccount(true); return; } // starting a deal / negotiating needs an account
    if (busy) return;
    captureBidEvents([{
      event_type: kind === "award" ? "award" : "choice",
      request_id: activeItem, bid_id: bid.id, supplier_id: bid.supplierId,
      // Award learning needs the FULL bids shown (year/price/certs), not just IDs — Mansour derives the
      // renter's preference axis from the winner vs the field it beat (B3).
      payload: kind === "award"
        ? { chosen_bid: bid.id, beaten_bids: baseCols.map((c) => c.bid.id).filter((id) => id !== bid.id), bids: baseCols.map(bidColumnToComputed) }
        : { kind: "negotiate" },
    }]);
    toast(kind === "award" ? L(`Opening ${bid.supplierName} deal room…`, `يتم فتح غرفة صفقة ${bid.supplierName}…`) : L("Opening the deal room…", "يتم فتح غرفة الصفقة…"));
    if (bid.dealRoomId) { router.push(`/deal-room/${bid.dealRoomId}`); return; }
    setBusy(true);
    const failed = () => { setBusy(false); toast(L("Couldn't open the deal room — try again.", "تعذّر فتح غرفة الصفقة — حاول مجددًا.")); };
    try { const { id } = await startDealRoom(bid.id); if (id) router.push(`/deal-room/${id}`); else failed(); }
    catch { failed(); }
  }

  // The chat uses /bids/ask (LLM narration) — NOT /recommend. It renders data.reply and applies the
  // (possibly re-ranked) ranking/pick so the table re-renders from a chat instruction too.
  async function sendChat(text: string) {
    const v = text.trim();
    if (!v) return;
    if (!guardGuest()) return; // guest: blocked once the 3-upload trial is spent
    setChat((c) => [...c, { role: "user", text: v }]);
    setChatInput("");
    const r = await askBids({
      message: v,
      request: { hasRequirements: !anon },
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
    const when = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
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

  // Signed-out visitors fall through to the SAME workspace below — request-free (no groups/locations),
  // driven purely by their uploaded quotes. The authed-only guards are skipped for them.
  if (error) return <Box>{L("Couldn’t load your requests.", "تعذّر تحميل طلباتك.")}</Box>;
  // Comparison is an account-only feature (product decision): signed-out visitors get a hard "sign in to
  // compare" gate — no guest uploads/free tries. Creating an account flips the session to authed, which
  // re-renders straight into the real workspace below.
  if (anon)
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: C.actionDim, color: C.action }}>
          <span className="material-icons-outlined" style={{ fontSize: 32 }}>balance</span>
        </div>
        <h2 className="mt-5 text-[20px] font-extrabold" style={{ color: C.navy }}>{L("Sign in to compare bids", "سجّل الدخول لمقارنة العروض")}</h2>
        <p className="mt-2 text-[13.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
          {L("Sign in to line up suppliers’ offers side by side and pick the best one.", "سجّل الدخول لعرض عروض المورّدين جنباً إلى جنب واختيار الأفضل.")}
        </p>
        {/* Same sign-in button + path as the rest of the app (header "Sign in") — opens the shared auth modal. */}
        <button type="button" onClick={() => openAuth()} className="mt-6 inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-[13.5px] font-extrabold text-white" style={{ background: C.rentee }}>
          <span className="material-icons-outlined" style={{ fontSize: 18 }}>login</span>{t.shell.signIn}
        </button>
      </div>
    );
  if (!anon && !groups) return <Spinner />;
  if (!anon && !locations.length) return <Box>{L("No requests to compare yet.", "لا توجد طلبات للمقارنة بعد.")}</Box>;

  /* ── small renderers ── */
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
    <div className={`min-w-0 space-y-4 transition-[margin] duration-200 ${chatOpen ? "md:me-[412px]" : ""}`} style={{ color: C.navy }}>
      {/* ── Guest header: no requests/groups — just the upload CTA + free-trial counter ── */}
      {anon && (
        <div className="rounded-2xl border p-5" style={{ borderColor: C.border, background: "#fff" }}>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-xl" style={{ background: C.actionDim, color: C.action }}><span className="material-icons-outlined" style={{ fontSize: 24 }}>compare_arrows</span></span>
            <div className="min-w-0">
              <h2 className="text-[18px] font-extrabold" style={{ color: C.navy }}>{L("Compare supplier quotes", "قارن عروض المؤجّرين")}</h2>
              <p className="mt-0.5 text-[13px]" style={{ color: C.muted }}>{L("Upload the quotes you received — your AI assistant reads each one, normalizes it to the same template, and lines them up so you can compare like-for-like. No account needed.", "ارفع العروض التي استلمتها — يقرأ مساعدك الذكي كل عرض ويوحّده على نفس القالب ويصفّها لتقارن مثلاً بمثل. دون حساب.")}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-105" style={{ background: C.action }}>
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>upload_file</span>{L("Upload a quote", "رفع عرض")}
            </button>
            <span className="text-[12px] font-semibold" style={{ color: C.muted }}>{L(`Free uploads left: ${guestUploadsLeft} · sign in to continue`, `رفعات مجانية متبقية: ${guestUploadsLeft} · سجّل الدخول للمتابعة`)}</span>
          </div>
        </div>
      )}

      {/* ── RFQ tabs (§1: replace location grouping; same pill style as My Requests) ── */}
      {!anon && <div className="text-[11px] font-extrabold" style={{ color: C.muted, letterSpacing: ".4px" }}>{L("REQUESTS FOR QUOTE", "طلبات التسعير")}</div>}
      {!anon && (
      <div className="flex gap-2.5 overflow-x-auto pb-1.5">
        {locations.map((l) => {
          const on = l.key === loc?.key;
          // Show the RFQ GROUP code as the primary — prefer my-requests' groupRef (T19), then the
          // submissions-derived one, then the request displayId.
          const code = l.groups[0]?.groupRef ?? groupRefById[l.groups[0]?.id ?? ""] ?? l.groups[0]?.items[0]?.displayId ?? "RFQ";
          return (
            <button key={l.key} onClick={() => setActiveLoc(l.key)}
              className="flex-none rounded-2xl border px-[15px] py-[11px] text-start transition"
              style={{ minWidth: 180, ...(on ? { background: C.navy, borderColor: C.navy } : { background: "#fff", borderColor: C.border }) }}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-black" style={{ color: on ? "#fff" : C.navy }}>{code}</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={on ? { background: "rgba(255,255,255,.16)", color: "#fff" } : { background: C.surface2, color: C.muted }}>{l.itemCount} {L("items", "عناصر")}</span>
              </span>
              <span className="mt-[3px] block text-[12px] font-semibold" style={{ color: on ? "#C7D4E5" : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 165 }}>{l.label}</span>
            </button>
          );
        })}
      </div>
      )}

      {bidsLoading ? (
        <Spinner />
      ) : !comparison || allCols.length === 0 ? (
        anon ? (
          <Box title={L("No quotes yet", "لا توجد عروض بعد")}>{L("Upload at least two supplier quotes to compare them side-by-side.", "ارفع عرضين على الأقل من المؤجّرين لمقارنتهما جنبًا إلى جنب.")}</Box>
        ) : (
          <Box title={L("No bids yet", "لا توجد عروض بعد")}>{L("This item has no bids to compare yet — you can re-broadcast the request.", "لا توجد عروض على هذه المعدة بعد — يمكنك إعادة بثّ الطلب.")}</Box>
        )
      ) : (
        <>
          {/* T17 — decided banner: once a bid is accepted (deal room / survey‑bidder), the request is
              closed. Losing columns are left as‑is (per decision); only the winner is badged below. */}
          {decidedByAccept && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-[13px] font-extrabold" style={{ background: C.successBg, borderColor: "rgba(29,175,88,.35)", color: "#137C42" }}>
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>check_circle</span>
              {L(`${decidedWord} — ${awarded!.supplierName} · request closed`, `${decidedWord} — ${awarded!.supplierName} · الطلب مُغلق`)}
              {awarded!.dealRoomId && (
                <button onClick={() => router.push(`/deal-room/${awarded!.dealRoomId}`)} className="ms-auto inline-flex items-center gap-1 underline" style={{ color: "#137C42" }}>
                  {L("View deal room", "غرفة الصفقة")}<span className="material-icons-outlined" style={{ fontSize: 14, transform: ar ? "scaleX(-1)" : undefined }}>arrow_forward</span>
                </button>
              )}
            </div>
          )}

          {/* ── item card: icon + name + "N bidding · N in comparison" + item dropdown + supplier chips ── */}
          <div className="rounded-2xl border" style={{ borderColor: C.border, background: "#fff" }}>
            {anon ? (
              // Guest: no request/item context — a plain header with the quote count (no item switcher).
              <div className="flex items-center gap-3 p-4">
                <div className="grid h-14 w-14 flex-none place-items-center rounded-xl" style={{ background: C.navy }}>
                  <span className="material-icons-outlined" style={{ fontSize: 30, color: "#fff" }}>compare_arrows</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-extrabold leading-tight" style={{ color: C.navy }}>{L("Your uploaded quotes", "عروضك المرفوعة")}</div>
                  <div className="mt-0.5 text-[12.5px] font-semibold" style={{ color: C.muted }}>{allCols.length} {L("uploaded", "مرفوع")} · {selected.size} {L("in comparison", "في المقارنة")}</div>
                </div>
              </div>
            ) : (
            <div className="flex items-center gap-3 p-4">
              <div className="grid h-14 w-14 flex-none place-items-center rounded-xl" style={{ background: C.navy }}>
                <EquipImg src={activeItemObj?.item?.imageUrl ?? null} categoryId={activeItemObj?.item?.categoryId ?? null} name={(ar ? activeItemObj?.item?.nameAr : activeItemObj?.item?.name) ?? ""} box="" img="h-8 w-8 object-contain" iconSize={30} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-extrabold leading-tight" style={{ color: C.navy }}>{itemBaseName}{units > 1 ? ` · ×${units}` : ""}</div>
                <div className="mt-0.5 text-[12.5px] font-semibold" style={{ color: C.muted }}>{itemSpec ? `${itemSpec} · ` : ""}{allCols.length} {L("bidding", "عرض")} · {selected.size} {L("in comparison", "في المقارنة")}</div>
              </div>
              {/* item dropdown (icon + name + ▾) */}
              <div className="relative flex-none">
                <button onClick={() => setItemMenuOpen((o) => !o)} title={L("Switch item", "تبديل الصنف")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-bold" style={{ borderColor: C.border, background: "#fff", color: C.navy }}>
                  <EquipImg src={activeItemObj?.item?.imageUrl ?? null} categoryId={activeItemObj?.item?.categoryId ?? null} name={(ar ? activeItemObj?.item?.nameAr : activeItemObj?.item?.name) ?? ""} box="" img="h-5 w-5 object-contain" iconSize={18} />
                  <span className="max-w-[150px] truncate">{ar ? activeItemObj?.item?.nameAr : activeItemObj?.item?.name}</span>
                  <span className="material-icons-outlined" style={{ fontSize: 16, color: C.muted }}>expand_more</span>
                </button>
                {itemMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setItemMenuOpen(false)} />
                    <div className="absolute z-30 mt-1.5 w-[300px] rounded-xl border p-1.5" style={{ insetInlineEnd: 0, background: "#fff", borderColor: C.border, boxShadow: "0 16px 40px rgba(20,40,70,.2)" }}>
                      <div className="px-2.5 py-1.5 text-[10px] font-extrabold" style={{ color: C.muted, letterSpacing: ".06em" }}>{L("VIEWING ITEM", "الصنف المعروض")}</div>
                      {items.map((it) => (
                        <button key={it.id} onClick={() => { setActiveItem(it.id); setItemMenuOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] font-bold" style={{ background: it.id === activeItem ? C.surface2 : "transparent", color: C.navy, opacity: it.bidCount === 0 ? 0.6 : 1 }}>
                          <EquipImg src={it.item?.imageUrl ?? null} categoryId={it.item?.categoryId ?? null} name={(ar ? it.item?.nameAr : it.item?.name) ?? ""} box="" img="h-5 w-5 object-contain" iconSize={18} />
                          <span className="flex-1 truncate">{ar ? it.item?.nameAr : it.item?.name}</span>
                          {(it.item?.qty ?? 1) > 1 && <span className="rounded-full px-1.5 text-[10px] font-extrabold" style={{ background: C.actionDim, color: C.action }}>×{it.item?.qty}</span>}
                          <span className="rounded-full px-2 text-[11px] font-bold" style={{ background: C.surface3, color: C.muted }}>{it.bidCount > 0 ? it.bidCount : 0}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            )}
            <div className="border-t px-4 py-3" style={{ borderColor: C.line }}>
              <div className="mb-2 text-[12px] font-semibold" style={{ color: C.muted }}>{L("Tap a supplier to add or remove it from the comparison columns", "انقر على مؤجّر لإضافته أو إزالته من أعمدة المقارنة")}</div>
              <div className="flex flex-wrap gap-2">
                {comparison.columns.map((c) => {
                  const on = selected.has(c.bid.id);
                  return (
                    <button key={c.bid.id} onClick={() => toggleBid(c.bid.id)} title={on ? L("Remove from comparison", "إزالة من المقارنة") : L("Add to comparison", "إضافة للمقارنة")} className="inline-flex items-center gap-2 rounded-full py-1.5 ps-1.5 pe-3 text-[13px] font-bold transition"
                      style={on ? { background: C.navy, color: "#fff" } : { background: "#fff", color: C.navy, border: `1px solid ${C.border}` }}>
                      <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-black" style={on ? { background: "rgba(255,255,255,.2)", color: "#fff" } : { background: C.navy, color: "#fff" }}>{c.bid.supplierName.slice(0, 1).toUpperCase()}</span>
                      {c.bid.supplierName}
                      {c.bid.verified && <span className="material-icons-outlined" style={{ fontSize: 14, color: on ? "#7BE0A5" : C.success }}>verified</span>}
                      <span className="material-icons-outlined" style={{ fontSize: 15, color: on ? "rgba(255,255,255,.8)" : C.muted }}>{on ? "close" : "add"}</span>
                    </button>
                  );
                })}
                {comparison.excluded.map((c) => (
                  <button key={c.bid.id} onClick={() => goDealRoom(c.bid, "negotiate")} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold" style={{ background: C.dangerBg, borderColor: "rgba(217,54,42,.35)", color: C.danger, borderStyle: "dashed" }}>
                    <span className="rounded-full px-2 text-[10px] font-extrabold" style={{ background: "#fff", color: C.danger }}>{L("excluded", "مستبعد")}</span>
                    {c.bid.supplierName}
                  </button>
                ))}
              </div>
            </div>
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


          {/* ── comparison table ── */}
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: C.border, background: "#fff" }}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 320 + cols.length * 215 }}>
                {/* tint the whole rank-winning column green (cells' own red/green layer on top) */}
                <colgroup>
                  <col style={{ width: 200 }} />
                  {cols.map((c) => <col key={c.bid.id} style={c.bid.id === pickId ? { background: "rgba(29,175,88,0.09)" } : undefined} />)}
                </colgroup>
                <thead>
                  {/* rank band — part of the table (⇅ Rank by · chips · Ask-AI input+Re-rank · AI badge) */}
                  <tr>
                    <td colSpan={cols.length + 1} style={{ background: "#FCFDFE", borderBottom: `1px solid ${C.line}`, padding: "12px 16px" }}>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="inline-flex flex-none items-center gap-1.5 text-[12.5px] font-extrabold" style={{ color: C.navy }}>
                          <span className="material-icons-outlined" style={{ fontSize: 17, color: C.action }}>swap_vert</span>{L("Rank by", "رتّب حسب")}
                        </span>
                        {presetDefs.map(([p, ic, en, arl]) => (
                          <button key={p} onClick={() => choosePreset(p, en, arl)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition"
                            style={preset === p && !fxEcho ? { background: C.navy, color: "#fff" } : { background: C.surface2, color: C.navyMid, border: `1px solid ${C.border}` }}>
                            <span className="material-icons-outlined" style={{ fontSize: 15 }}>{ic}</span>{ar ? arl : en}
                          </button>
                        ))}
                        <div className="flex h-[40px] min-w-[220px] flex-1 items-center gap-2 rounded-full border ps-3.5 pe-1.5" style={{ background: "#fff", borderColor: C.border }}>
                          <span className="material-icons-outlined" style={{ fontSize: 17, color: C.action }}>auto_awesome</span>
                          <input value={freeText} onChange={(e) => setFreeText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyFreeText(); }}
                            placeholder={L("Ask AI — e.g. closest machine, newest with operator…", "اسأل الذكاء — مثلاً أقرب معدّة، الأحدث مع مشغّل…")}
                            className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none" style={{ color: C.navy }} />
                          <button onClick={applyFreeText} className="inline-flex flex-none items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-extrabold text-white" style={{ background: C.action }}>
                            <span className="material-icons-outlined" style={{ fontSize: 15, transform: ar ? "scaleX(-1)" : undefined }}>send</span>{L("Re-rank", "إعادة")}
                          </button>
                        </div>
                        <span className="flex-none">{agentBadge()}</span>
                      </div>
                      {fxEcho && (
                        <div className="mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]" style={{ background: C.actionDim, borderColor: "rgba(247,144,9,.3)", color: "#8A5A06" }}>
                          <span className="material-icons-outlined" style={{ fontSize: 17, color: C.action }}>auto_awesome</span>{fxEcho}
                        </div>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th className="sticky start-0 z-[3] p-3 text-start align-bottom" style={{ background: C.surface2, width: 200, minWidth: 200, borderBottom: `1px solid ${C.line}` }}>
                      <span className="text-[11px] font-black" style={{ color: C.muted, letterSpacing: ".06em" }}>{L("SUPPLIER", "المؤجّر")}</span>
                    </th>
                    {cols.map((c, idx) => {
                      const isPick = c.bid.id === pickId;
                      const isUpload = c.bid.id.startsWith("upload:");
                      const recog = rec?.ranking.find((r) => r.bid_id === c.bid.id)?.recognition ?? null;
                      // prototype: rank pill per column — top of the current order = "Recommended" (green), rest = "Rank #N".
                      const rankWord = idx === 0 ? L("Recommended", "موصى به") : L(`Rank #${idx + 1}`, `المركز #${idx + 1}`);
                      const rankStyle = idx === 0 ? { background: C.successBg, color: C.success } : { background: C.surface3, color: C.muted };
                      return (
                        <th key={c.bid.id} className="p-0 text-start align-top transition-colors" style={{ minWidth: 215, background: isPick ? "linear-gradient(180deg,#E7F7EE,#fff)" : "#fff", borderBottom: `1px solid ${C.line}` }}>
                          <div style={{ height: 4, background: idx === 0 ? C.success : "transparent" }} />
                          <div className="p-3">
                            {/* rank pill + remove */}
                            <div className="mb-2.5 flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={rankStyle}>
                                <span className="material-icons-outlined" style={{ fontSize: 13 }}>emoji_events</span>{rankWord}
                              </span>
                              <button onClick={() => toggleBid(c.bid.id)} title={L("Remove from comparison", "إزالة من المقارنة")} className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full" style={{ background: C.surface2, color: C.muted }}>
                                <span className="material-icons-outlined" style={{ fontSize: 14 }}>close</span>
                              </button>
                            </div>
                            {/* avatar + name + rating/source */}
                            <div className="flex items-center gap-2.5">
                              <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[14px] font-extrabold text-white" style={{ background: C.navy }}>{c.bid.supplierName.slice(0, 1).toUpperCase()}</div>
                              <div className="min-w-0 flex-1">
                                <b className="flex items-center gap-1 text-[14px] leading-tight" style={{ color: C.navy }}>
                                  <span className="truncate">{c.bid.supplierName}</span>
                                  <span className="material-icons-outlined flex-none" style={{ fontSize: 15, color: c.bid.verified ? C.success : C.danger }} title={c.bid.verified ? L("Verified supplier", "مؤجّر موثّق") : L("Not verified", "غير موثّق")}>{c.bid.verified ? "verified" : "gpp_bad"}</span>
                                </b>
                                <div className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-[10.5px] font-bold">
                                  {c.bid.rating != null && <span className="inline-flex items-center gap-0.5" style={{ color: C.action }}><span className="material-icons-outlined" style={{ fontSize: 12 }}>star</span>{c.bid.rating}</span>}
                                  {(() => {
                                    // Source chip — same colours + wording as the bid-card banners (T4):
                                    // orange "Off-platform · via your request link" / blue "Via Moedatech app".
                                    const chip = isUpload
                                      ? { bg: C.surface2, c: C.muted, icon: "description", text: L("Uploaded file", "ملف مرفوع") }
                                      : (c.bid.viaSharedLink || c.bid.converted) // converted = off-platform origin (web-app/006)
                                        ? { bg: "#fff4e5", c: "#d4780a", icon: "link", text: L("Off-platform · via your request link", "خارج المنصة · عبر رابط طلبك") }
                                        : { bg: "#e6f2fb", c: "#1a7ec8", icon: "verified_user", text: L("Via Moedatech app", "عبر تطبيق معداتك") };
                                    return (
                                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: chip.bg, color: chip.c }}>
                                        <span className="material-icons-outlined" style={{ fontSize: 12 }}>{chip.icon}</span>{chip.text}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                            {/* company doc chips */}
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                              {companyDocChips(c.bid).map((d) => <span key={d.lbl}>{docChip(c, d.lbl, d.has, d.hint)}</span>)}
                            </div>
                            {recog && <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold" style={{ background: C.renteeDim, color: "#1E4FB8", borderColor: "rgba(37,99,235,.28)" }}><span className="material-icons-outlined" style={{ fontSize: 13, color: C.rentee }}>history</span>{recog}</span>}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* 💰 COST */}
                  <SectionRow id="cost" icon="payments" title={L("Cost", "التكلفة")} accent={C.action} accentText="#fff" n={cols.length} collapsed={collapsed.has("cost")} onToggle={() => toggleSection("cost")} />
                  {!collapsed.has("cost") && (<>
                    {/* These prices aren't final — the renter negotiates them in the deal room (in-app bids
                        only; a guest has no deal room, so the note is hidden for them). */}
                    {!anon && (
                    <tr>
                      <td colSpan={cols.length + 1} style={{ padding: "8px 14px", background: C.warningBg, borderTop: `1px solid ${C.line}` }}>
                        <span className="inline-flex flex-wrap items-center gap-1.5 text-[11.5px] font-bold" style={{ color: C.warning }}>
                          <span className="material-icons-outlined" style={{ fontSize: 15 }}>forum</span>
                          {L("You can negotiate these prices in the deal room for bids in app.", "يمكنك التفاوض على هذه الأسعار في غرفة الصفقة لعروض التطبيق.")}
                        </span>
                      </td>
                    </tr>
                    )}
                    {/* §6 controls strip — RATE PERIOD (Day/Week/Month) + PRICES FOR (per-unit/all) */}
                    <tr>
                      <td colSpan={cols.length + 1} style={{ padding: "9px 16px", background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                        <div className="flex flex-wrap items-end gap-5">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-extrabold" style={{ color: C.muted, letterSpacing: ".08em" }}>{L("RATE PERIOD", "أساس السعر")}</span>
                            <div className="inline-flex rounded-lg p-0.5" style={{ background: C.surface3 }}>
                              {([["PER_DAY", L("Day", "يوم")], ["PER_WEEK", L("Week", "أسبوع")], ["PER_MONTH", L("Month", "شهر")]] as [RatePeriod, string][]).map(([p, lab]) => (
                                <button key={p} onClick={() => setPeriod(p)} className="rounded-md px-3 py-1 text-[11.5px] font-extrabold transition" style={period === p ? { background: "#fff", color: C.navy, boxShadow: "0 1px 3px rgba(20,40,70,.12)" } : { background: "transparent", color: C.muted }}>{lab}</button>
                              ))}
                            </div>
                          </div>
                          {/* Per-unit vs all-units only matters for a multi-unit request (they're identical at 1 unit). */}
                          {units > 1 && (
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] font-extrabold" style={{ color: C.muted, letterSpacing: ".08em" }}>{L("PRICES FOR", "الأسعار لـ")}</span>
                              <div className="inline-flex rounded-lg p-0.5" style={{ background: C.surface3 }}>
                                {([["unit", L("Per unit", "لكل وحدة")], ["all", L("All units offered", "كل الوحدات المعروضة")]] as [PricesFor, string][]).map(([p, lab]) => (
                                  <button key={p} onClick={() => setPricesFor(p)} className="rounded-md px-3 py-1 text-[11.5px] font-extrabold transition" style={pricesFor === p ? { background: "#fff", color: C.navy, boxShadow: "0 1px 3px rgba(20,40,70,.12)" } : { background: "transparent", color: C.muted }}>{lab}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* §6: Units fulfilled — multi-unit only, FIRST (every price multiplies by the units a bid covers) */}
                    {units > 1 && (
                    <tr>
                      <RowHead title={L("Units fulfilled", "الوحدات المغطاة")} sub={L("price multiplies by this", "السعر يتضاعف بهذا")} />
                      {cols.map((c) => {
                        const off = c.bid.unitsOffered || 1;
                        const pct = Math.min(100, Math.round((off / units) * 100));
                        const bc = pct >= 50 ? C.success : pct > 0 ? C.warning : C.danger;
                        const short = units - off;
                        return (
                          <Td key={c.bid.id} ok={off >= units}>
                            <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-extrabold" style={{ color: bc }}>{off}/{units}</span><span className="text-[10.5px] font-bold" style={{ color: C.muted }}>{L("units", "وحدة")}</span></div>
                            <div className="mt-1 h-[7px] max-w-[160px] overflow-hidden rounded" style={{ background: C.surface3 }}><i className="block h-full rounded" style={{ width: `${pct}%`, background: bc }} /></div>
                            <Sub>{off >= units ? L("covers full request", "يغطي كامل الطلب") : L(`${short} short`, `ناقص ${short}`)}</Sub>
                          </Td>
                        );
                      })}
                    </tr>
                    )}
                    <tr>
                      <RowHead title={L("Rental cost", "تكلفة الإيجار")} sub={`${periodLabel(period)} ${L("rate", "سعر")} × ${L("units", "الوحدات")}`} />
                      {cols.map((c, idx) => {
                        const per = periodLabel(period);
                        return (
                          <Td key={c.bid.id} ok={c.bid.price != null}>
                            {c.bid.price == null ? (
                              <span style={{ color: C.muted }}>{L("not stated", "غير محدد")}</span>
                            ) : (<>
                              {/* per-unit rate → all-units total, e.g. "SAR 100/day → SAR 400/day", breakdown below */}
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-[15px] font-extrabold" style={{ color: C.navy, fontWeight: 900 }}>{sar} {nf(dq(c).ratePerPeriod)}/{per}{unitsOf(c) > 1 ? ` → ${sar} ${nf(dq(c).rentalForPeriod)}/${per}` : ""}</span>
                                {rentalWin.has(idx) && bestTag}
                              </span>
                              {unitsOf(c) > 1 && <Sub>{`(${nf(dq(c).ratePerPeriod)}/${per} × ${unitsOf(c)} ${L("units", "وحدة")})`}</Sub>}
                              {/* Estimated rental for the whole duration — a smaller, coloured sub of the rental cost. */}
                              {hasDuration && dq(c).durationRental != null && (
                                <div className="mt-0.5 text-[11px] font-bold" style={{ color: C.rentee }}>
                                  {L("Est. rental", "الإيجار التقديري")}: {sar} {nf(dq(c).durationRental!)}
                                  <span style={{ fontWeight: 600, opacity: 0.85 }}> · {durationDays} {L("days", "يوم")}{unitsOf(c) > 1 ? ` × ${unitsOf(c)}` : ""}</span>
                                </div>
                              )}
                            </>)}
                          </Td>
                        );
                      })}
                    </tr>
                    {/* ONE "Mobilization + demob" row (original layout): one supplier-borne total headline +
                        a breakdown below. Per part — on the renter → "on you", on the supplier → its price. */}
                    <tr>
                      <RowHead title={L("Mobilization + demob", "النقل + الإرجاع")} sub={L("delivery + return", "التوصيل + الإرجاع")} />
                      {cols.map((c, idx) => {
                        const rm = renterMob[c.bid.id];
                        // The renter's own estimate per on-you part (request-level, from the "Estimate your costs" popup).
                        const deliveryEst = mobByRentee === true ? (renterMobEst.delivery ?? 0) : 0;
                        const returnEst = demobByRentee === true ? (renterMobEst.return ?? 0) : 0;
                        // Breakdown token per part: renter → "on you" (+ their estimate when entered); supplier + priced
                        // → SAR X; supplier + not priced → red "—".
                        const token = (p: { stated: boolean; value: number }, by: boolean | null, est = 0) =>
                          by === true ? <span style={{ color: C.rentee, fontWeight: 700 }}>{L("on you", "عليك")}{est > 0 ? ` · ~${sar} ${nf(est)}` : ""}</span>
                            : p.stated ? <span style={{ color: C.navy, fontWeight: 800 }}>{sar} {nf(p.value)}</span>
                            : <span style={{ color: by === false ? C.danger : C.muted, fontWeight: 700 }}>—</span>;
                        // Headline = the SUPPLIER-borne total (parts not on the renter). Parts on you aren't priced here.
                        const supUnit = supBorneUnit(c);
                        const supTotal = supUnit * unitsOf(c);
                        const conflict = (mobByRentee === false && !c.mob.stated) || (demobByRentee === false && !c.demob.stated);
                        const anyOnRenter = mobByRentee === true || demobByRentee === true;
                        // The "+ estimate" affordance lives ONLY in the Cost terms row (label cell), not
                        // inline per mob/demob part — this row just shows the delivery/return breakdown.
                        const breakdown = (
                          <Sub><span className="inline-flex flex-wrap items-center gap-1">{L("Delivery", "التوصيل")}: {token(c.mob, mobByRentee, deliveryEst)} · {L("Return", "الإرجاع")}: {token(c.demob, demobByRentee, returnEst)}{unitsOf(c) > 1 && supUnit > 0 ? ` · × ${unitsOf(c)} ${L("units", "وحدة")}` : ""}</span></Sub>
                        );
                        return (
                          <Td key={c.bid.id} ok={!conflict} fail={conflict}>
                            {supUnit > 0 ? (<>
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-[15px] font-extrabold" style={{ color: C.navy, fontWeight: 900 }}>{sar} {nf(supUnit)}{unitsOf(c) > 1 ? ` → ${sar} ${nf(supTotal)}` : ""}</span>
                                {c.bid.distanceKm != null && <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: C.surface2, color: C.navyMid }}><span className="material-icons-outlined" style={{ fontSize: 11 }}>place</span>{Math.round(c.bid.distanceKm)} {L("km", "كم")}</span>}
                                {mobWin.has(idx) && bestTag}
                              </span>
                              {breakdown}
                            </>) : rm ? (<>
                              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold">{sar} {nf(rm)}
                                <button onClick={() => addMobCost(c.bid.id, L("Delivery + return", "النقل والإرجاع"))} className="text-[10px] font-bold underline" style={{ color: C.rentee }}>{L("edit", "تعديل")}</button>
                                <button onClick={() => removeMobCost(c.bid.id)} title={L("Remove your estimate", "إزالة تقديرك")} className="grid h-4 w-4 place-items-center rounded-full" style={{ background: C.surface3, color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 11 }}>close</span></button>
                              </span>
                              <Sub>{L("your estimate", "تقديرك")} · {L("Delivery", "التوصيل")}: {token(c.mob, mobByRentee, deliveryEst)} · {L("Return", "الإرجاع")}: {token(c.demob, demobByRentee, returnEst)}</Sub>
                            </>) : conflict ? (
                              <><span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: C.danger }}>{L("supplier didn't include it", "لم يُدرجه المؤجّر")}</span>{breakdown}</>
                            ) : (
                              <><span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: C.muted }}>{anyOnRenter ? (mobEstOnYou > 0 ? `${sar} ${nf(mobEstOnYou)}` : L("on you", "عليك")) : L("not stated", "غير محدد")}</span>{breakdown}</>
                            )}
                          </Td>
                        );
                      })}
                    </tr>
                    {/* Estimated rental now lives as a sub of the Rental cost cell above (not its own row). */}
                    {requiredResp.length > 0 && (
                    <tr>
                      {/* §6: label cell carries ONE "Estimate your costs" popup button (not per-term add) */}
                      <td className="sticky start-0 z-[1] align-top text-[12.5px]" style={{ background: C.surface2, color: C.navy, fontWeight: 900, width: 200, minWidth: 200, padding: "14px 16px" }}>
                        {L("Cost terms", "شروط التكلفة")}
                        <span className="mt-0.5 block text-[10.5px] font-semibold" style={{ color: C.muted }}>{L("who handles what", "من يتحمّل ماذا")}</span>
                        {(youTerms.length > 0 || showDeliveryEst || showReturnEst) && (
                          <button onClick={openEstimate} className="mt-2 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-extrabold" style={{ borderColor: "rgba(37,99,235,.4)", color: C.rentee, background: C.renteeDim, borderStyle: "dashed" }}>
                            🧮 {estTotal > 0 ? L(`Your est. ~${sar} ${nf(estTotal)}`, `تقديرك ~${sar} ${nf(estTotal)}`) : L("Estimate your costs", "قدّر تكاليفك")}
                          </button>
                        )}
                      </td>
                      {cols.map((c) => (
                        <Td key={c.bid.id}>
                          <div className="flex flex-col items-start gap-[5px]">
                            {requiredResp.map((m) => {
                              const cr = c.costResponsibilities.find((x) => x.key === m.key)!;
                              const fatKey = m.key === "operator_food" ? "fat_food" : m.key === "operator_transport_accommodation" ? "fat_accommodation_transport" : null;
                              // Conflict from either an in-app negotiable term OR the responsibility state itself
                              // (shared-link declines surface as cr.state === "red" via linkSide — T9).
                              const dealConflict = cr.state === "red" || (fatKey ? (c.bid.negotiableTerms ?? []).some((t) => t.key === fatKey && t.state === "conflict") : false);
                              // T11 chip: colour = MATCH state (green = matches request incl. "you", red = conflict);
                              // the owner label (you / supplier) is separate, from the actual responsible side.
                              const tone = dealConflict ? "red" : responsibilityTone(cr);
                              const bg = tone === "green" ? C.successBg : tone === "red" ? C.dangerBg : C.surface3;
                              const fg = tone === "green" ? C.success : tone === "red" ? C.danger : C.muted;
                              const bd = tone === "green" ? "rgba(29,175,88,.3)" : tone === "red" ? "rgba(217,54,42,.3)" : C.border;
                              const side = cr.bidSide ?? cr.requestSide;
                              // On a conflict, name BOTH sides — what the request asked ("your choice") vs the
                              // supplier's position — instead of a bare "conflict" (user: show what the conflict is).
                              const sideLabel = (sd: string | null | undefined) => sd === "supplier" ? L("supplier", "المؤجّر") : sd === "me" ? L("you", "أنت") : null;
                              const owner = tone === "red"
                                ? `${L("your choice", "اختيارك")}: ${sideLabel(cr.requestSide) ?? "—"} · ${L("supplier", "المؤجّر")}: ${sideLabel(cr.bidSide) ?? L("declined", "رفض")}`
                                : side === "supplier" ? L("supplier", "المؤجّر") : side === "me" ? L("you", "أنت") : L("—", "—");
                              const entered = renterCosts[m.key];
                              return (
                                <span key={m.key} className="inline-flex items-center gap-1 self-start px-[9px] py-1 text-[11px]" style={{ background: bg, color: fg, fontWeight: 800, borderRadius: 7, border: `1px solid ${bd}` }}>
                                  {tone === "red" && <span className="material-icons-outlined" style={{ fontSize: 13 }}>warning_amber</span>}
                                  {ar ? m.ar : m.en}<span style={{ fontWeight: 700, opacity: 0.8 }}> · {owner}{entered != null ? ` · ~${sar} ${nf(entered)}` : ""}</span>
                                </span>
                              );
                            })}
                          </div>
                        </Td>
                      ))}
                    </tr>
                    )}
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
                              <span className="font-mono text-[19px] font-extrabold" style={{ color: C.navy, fontWeight: 900 }}>{sar} {nf(total)}</span>
                              {cols.length > 1 && lowestGrand != null && <span className="ms-1.5 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-extrabold" style={isLow ? { background: C.successBg, color: C.success } : { background: C.warningBg, color: C.warning }}>{isLow ? L("lowest", "الأقل") : `+${Math.round(((total - lowestGrand) / lowestGrand) * 100)}%`}</span>}
                              <div className="mt-1.5 h-[6px] max-w-[160px] overflow-hidden rounded" style={{ background: C.surface3 }}><i className="block h-full rounded" style={{ width: `${Math.round((total / maxGrand) * 100)}%`, background: isLow ? C.success : total === maxGrand ? C.warning : C.navyMid }} /></div>
                              {partial && <Sub>{L("rental not totaled — set a duration", "لم تُحتسب المدة — حدّد مدة")}</Sub>}
                              {yourCosts > 0 && <Sub>{L(`incl. ${sar} ${nf(yourCosts)} of your estimates`, `يشمل ${sar} ${nf(yourCosts)} من تقديراتك`)}</Sub>}
                            </>) : rateInclVat != null ? (<>
                              <span className="font-mono text-[15px] font-bold" style={{ color: C.navy }}>{sar} {nf(rateInclVat)}<small style={{ fontSize: 10.5, color: C.muted }}>/{periodLabel(c.bid.priceUnit)}</small></span>
                            </>) : <span style={{ color: C.muted }}>{L("not stated", "غير محدد")}</span>}
                          </Td>
                        );
                      })}
                    </tr>
                  </>)}

                  {/* 🚜 EQUIPMENT
                      T14 — three distinct source layers, do NOT conflate:
                        • Company docs (CR / VAT / national address) → company VERIFICATION (companyDocChips, in the Cost/identity header).
                        • Equipment safety cert + Proof of ownership → the EQUIPMENT's documents (equipmentCertCodes / ownershipDocs).
                        • Operator cert + required equipment cert term → negotiable DEAL-ROOM terms (live).
                      Colour rule (T11): green = matches the request · blue = held/shown but not required · red = required-unmet. */}
                  <SectionRow id="equip" icon="construction" title={L("Equipment", "المعدّة")} accent={C.action} accentText="#fff" n={cols.length} collapsed={collapsed.has("equip")} onToggle={() => toggleSection("equip")} />
                  {!collapsed.has("equip") && (<>
                    {/* One merged banner (T8): supplier-acknowledged + (when multi-unit) the per-unit caveat,
                        scoped to in-app bids, with the "verify in deal room" link when a room exists. Hidden
                        for a guest — they have no in-app bids or deal room. */}
                    {!anon && (
                    <tr>
                      <td colSpan={cols.length + 1} style={{ padding: "8px 14px", background: C.warningBg, borderTop: `1px solid ${C.line}` }}>
                        <span className="inline-flex flex-wrap items-center gap-1.5 text-[11.5px] font-bold" style={{ color: C.warning }}>
                          <span className="material-icons-outlined" style={{ fontSize: 15 }}>warning_amber</span>
                          {units > 1
                            ? L(`Supplier-acknowledged, not verified; shown for 1 of ${units} units — verify each in the deal room (in-app bids).`, `مُقَرّة من المؤجّر، غير مُتحقَّق منها؛ معروضة لوحدة من ${units} — تحقّق من كلٍّ منها في غرفة الصفقة (لعروض التطبيق).`)
                            : L("Supplier-acknowledged, not verified — verify in the deal room (in-app bids).", "مُقَرّة من المؤجّر، غير مُتحقَّق منها — تحقّق في غرفة الصفقة (لعروض التطبيق).")}
                          {(() => { const drId = cols.find((c) => c.bid.dealRoomId)?.bid.dealRoomId; return drId ? (
                            <button type="button" onClick={() => router.push(`/deal-room/${drId}`)} className="inline-flex items-center gap-0.5 font-extrabold underline" style={{ color: C.warning }}>
                              {L("verify in deal room", "تحقّق في غرفة الصفقة")}<span className="material-icons-outlined" style={{ fontSize: 13, transform: ar ? "scaleX(-1)" : undefined }}>arrow_forward</span>
                            </button>
                          ) : null; })()}
                        </span>
                      </td>
                    </tr>
                    )}
                    <tr>
                      <RowHead title={L("Year", "سنة الصنع")} sub={(() => { const my = cols[0]?.bid.reqMinYear; return my == null ? undefined : my >= 1990 ? `${L("min year", "أدنى سنة")} ${my}` : `${L("max age", "أقصى عمر")} ${my} ${L("yrs", "سنة")}`; })()} />
                      {cols.map((c, idx) => {
                        const yr = c.equipment.find((r) => r.key === "year");
                        // Off-platform: no equipment record — show the confirmed year requirement (e.g. "≥ 2018").
                        if (c.bid.viaSharedLink) {
                          // Confirmed → green "≥ 2022" (the requirement the supplier met); declined → red "Not met".
                          // (Previously showed "≥ 2022" even on a conflict, so a decline read as a red requirement.)
                          const v = yr ? (yr.state === "conflict" ? L("Not met", "غير مطابق") : c.bid.reqMinYear != null ? `≥ ${c.bid.reqMinYear}` : L("Confirmed", "مؤكّد")) : null;
                          return <Td key={c.bid.id} ok={!!yr && yr.state !== "conflict"} fail={yr?.state === "conflict"}>{v ? <span className="text-[14px]" style={{ fontWeight: 900 }}>{v}</span> : <span style={{ color: C.muted }}>—</span>}</Td>;
                        }
                        return <Td key={c.bid.id} ok={yr?.state !== "conflict"} fail={yr?.state === "conflict"}><span className="text-[14px]" style={{ fontWeight: 900 }}>{c.bid.equipment?.year ?? "—"}</span>{yearWin.has(idx) && <span className="mt-0.5 block text-[11px]" style={{ color: C.success, fontWeight: 800 }}>{L("newest", "الأحدث")}</span>}</Td>;
                      })}
                    </tr>
                    <tr>
                      <RowHead title={L("Distance to site", "المسافة للموقع")} />
                      {cols.map((c, idx) => <Td key={c.bid.id} ok><span className="text-[14px]" style={{ fontWeight: 900 }}>{c.bid.distanceKm != null ? `${Math.round(c.bid.distanceKm)} ${L("km", "كم")}` : <span style={{ color: C.muted }}>—</span>}</span>{distanceWin.has(idx) && <span className="mt-0.5 block text-[11px]" style={{ color: C.success, fontWeight: 800 }}>{L("closest", "الأقرب")}</span>}</Td>)}
                    </tr>
                    {/* L2 equipment — ONE field: safety certs (required ✓/✗ + held) + proof-of-ownership
                        docs (istimara / customs / sale_contract / saso_registration), combined per column. */}
                    {/* §6: ONE "Equipment certificate" row — shows the required equipment cert(s), ✓ green
                        when the supplier holds it, ✗ red when not. Not required → row not shown. */}
                    {requiredEquipCerts.length > 0 && (
                      <tr>
                        <RowHead title={L("Equipment certificate", "شهادة المعدة")} sub={`${L("required", "مطلوب")}: ${requiredEquipCerts.map(certLabel).join(", ")}`} />
                        {cols.map((c) => {
                          const codes = c.bid.equipmentCertCodes ?? [];
                          const allHeld = requiredEquipCerts.every((cert) => codes.includes(cert));
                          const noneHeld = requiredEquipCerts.every((cert) => !codes.includes(cert));
                          // T12: held-but-NOT-required certs (e.g. supplier has SPSP, request wanted TÜV) →
                          // shown as BLUE "extra" chips alongside the required ones (green ✓ / red ✗).
                          const extras = codes.filter((code) => !requiredEquipCerts.includes(code));
                          return (
                            <Td key={c.bid.id} ok={allHeld} fail={noneHeld}>
                              <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                                {requiredEquipCerts.map((cert) => <span key={cert}>{docChip(c, certLabel(cert), codes.includes(cert), cert, true)}</span>)}
                                {extras.map((cert) => (
                                  <span key={cert} className="inline-flex items-center gap-1 text-[11.5px]" title={L("Held — not required", "متوفّرة — غير مطلوبة")} style={{ background: C.renteeDim, color: C.rentee, fontWeight: 800, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(37,99,235,.3)" }}>
                                    <span className="material-icons-outlined" style={{ fontSize: 11 }}>add</span>{certLabel(cert)}
                                  </span>
                                ))}
                              </span>
                            </Td>
                          );
                        })}
                      </tr>
                    )}
                    {/* §6: one row per proof-of-ownership doc (Istimara / customs / sale contract …), styled
                        like the cert rows — ✓ when the supplier carries it, ⚠ otherwise. */}
                    {ownershipDocTypes.map((doc) => (
                      <tr key={doc.key}>
                        {/* General "Proof of ownership" name with the specific doc as the ✓/✗ value. Sub is
                            neutral ("supplier-provided") — these rows are driven by what the supplier
                            uploaded, NOT by a renter requirement, so no "required:" label. */}
                        <RowHead title={L("Proof of ownership", "إثبات الملكية")} sub={L("supplier-provided document", "مستند مقدَّم من المؤجّر")} />
                        {cols.map((c) => {
                          const held = (c.bid.ownershipDocs ?? []).some((o) => o.key === doc.key);
                          const label = ar ? doc.labelAr : doc.labelEn;
                          // Proof of ownership is INFORMATIONAL, never required (T13): show any doc the
                          // equipment carries as a BLUE chip (clickable to view), a neutral "—" when none.
                          // Never green/red, no cell tint. Off-platform bids carry no docs → "—".
                          if (!held) return <Td key={c.bid.id}><span style={{ color: C.muted }}>—</span></Td>;
                          return (
                            <Td key={c.bid.id}>
                              <button type="button" onClick={() => openDoc(c, doc.key, label)} title={L("View document", "عرض المستند")} className="inline-flex items-center gap-1 text-[11.5px]" style={{ background: C.renteeDim, color: C.rentee, fontWeight: 800, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(37,99,235,.3)" }}>
                                <span className="material-icons-outlined" style={{ fontSize: 11 }}>description</span>{label}<span className="material-icons-outlined" style={{ fontSize: 11, opacity: 0.7 }}>visibility</span>
                              </button>
                            </Td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Operator included — acknowledge term. Green ✓ "Included" when the supplier includes an
                        operator, red ✗ "Not included" on a conflict (e.g. link supplier said No to a required
                        operator). Reflects the same truth the terms modal shows, inside the Equipment section. */}
                    {operatorIncludedAsked && (
                    <tr>
                      <RowHead title={L("Operator", "المشغّل")} sub={L("required", "مطلوب")} />
                      {cols.map((c) => {
                        const t = operIncOf(c);
                        if (!t || t.state === "grey") return <Td key={c.bid.id}><span style={{ color: C.muted }}>—</span></Td>;
                        const included = t.state === "matched" || t.state === "agreed";
                        return <Td key={c.bid.id} ok={included} fail={!included}>{certPill(included ? L("Included", "مشمول") : L("Not included", "غير مشمول"), included)}</Td>;
                      })}
                    </tr>
                    )}
                    {/* L3 operator certificate — a DECLARED deal-room term, never a verified pill. Sub shows the
                        rentee's required license level; each cell the supplier's declared position (t3Declarations). */}
                    {operatorRequired && (
                    <tr>
                      <RowHead title={L("Operator certificate", "شهادة المشغّل")} sub={`${L("required", "مطلوب")}${cols[0]?.bid.operatorCertReq ? `: ${cols[0]?.bid.operatorCertReq}` : ""}`} />
                      {cols.map((c) => {
                        const req = c.bid.operatorCertReq;
                        if (!req) return <Td key={c.bid.id}><span style={{ color: C.disabled, fontWeight: 600 }}>—</span></Td>;
                        // Reflect the truth (issue 3): green only when the DECLARED cert actually satisfies the
                        // REQUIRED one (e.g. required SPSP but supplier declared TÜV → red), or the deal room has
                        // AGREED it. A deal-room conflict, or a value mismatch that isn't yet agreed → red.
                        const declared = c.bid.operatorCertDeclared;
                        const term = (c.bid.negotiableTerms ?? []).find((t) => t.key === "operator_certification");
                        const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
                        const declaredOk = !!declared && !/not\s*confirmed|غير|لم/i.test(declared);
                        const satisfiesReq = declaredOk && norm(declared).split(" ").some((tok) => tok.length > 1 && norm(req).includes(tok));
                        const met = term?.state === "agreed" ? true : term?.state === "conflict" ? false : satisfiesReq;
                        // T12 parity with the equipment-cert row: when the supplier DECLARED a real cert that
                        // doesn't satisfy the requirement (e.g. required SPSP, declared TÜV), show it as a BLUE
                        // "extra" chip next to the red required one — so the renter sees what they DO hold.
                        const showExtra = !met && declaredOk && !!declared && !satisfiesReq;
                        return (
                          <Td key={c.bid.id} ok={met} fail={!met}>
                            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                              {certPill(req, met)}
                              {showExtra && (
                                <span className="inline-flex items-center gap-1 text-[11.5px]" title={L("Declared — doesn’t meet the requirement", "مُعلن — لا يفي بالمطلوب")} style={{ background: C.renteeDim, color: C.rentee, fontWeight: 800, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(37,99,235,.3)" }}>
                                  <span className="material-icons-outlined" style={{ fontSize: 11 }}>add</span>{declared}
                                </span>
                              )}
                            </span>
                          </Td>
                        );
                      })}
                    </tr>
                    )}
                  </>)}

                  {/* Verified supplier + company documents now live in each column's identity header (T1). */}

                  {/* Notes — the last data row. Free text per bid: the app / shared-link supplier note, or an
                      uploaded quote's notes + agent-extracted extra terms (folded into `note`). Source-agnostic;
                      shown only when at least one column has a note. */}
                  {cols.some((c) => !!c.bid.note && c.bid.note.trim() !== "") && (
                    <tr>
                      <RowHead title={L("Notes", "ملاحظات")} sub={L("from the quote / bid", "من العرض / العرض المقدَّم")} />
                      {cols.map((c) => (
                        <Td key={c.bid.id}>
                          {c.bid.note && c.bid.note.trim() !== ""
                            ? <span className="block text-[12px] font-semibold leading-snug" style={{ color: C.navy, whiteSpace: "pre-wrap", maxHeight: 150, overflowY: "auto" }}>{c.bid.note}</span>
                            : <span style={{ color: C.muted }}>—</span>}
                        </Td>
                      ))}
                    </tr>
                  )}

                  {/* DECIDE — its own band, clearly separated from the equipment section. Award/Negotiate use
                      the SAME colours for every supplier (Award = green solid, Negotiate = navy outline). */}
                  <tr>
                    <th className="sticky start-0 z-[2] text-start align-top text-[12.5px]" style={{ background: C.surface2, color: C.navy, fontWeight: 900, width: 200, minWidth: 200, padding: "14px 16px", borderTop: `2px solid ${C.border}` }}>
                      <span className="inline-flex items-center gap-1.5"><span className="material-icons-outlined" style={{ fontSize: 16 }}>gavel</span>{L("Decide", "القرار")}</span>
                      <span className="mt-0.5 block text-[10.5px] font-semibold" style={{ color: C.muted }}>{L("opens the deal room", "يفتح غرفة الصفقة")}</span>
                    </th>
                    {cols.map((c) => {
                      const isAwarded = !!awardedIds[c.bid.id];
                      const isAcceptedWinner = decidedByAccept && awarded!.id === c.bid.id; // Case A / C-bidder winner
                      // Can't award another once a winner exists — backend accept/survey (`awarded`) OR a
                      // local award on a different column (single-winner lock).
                      const otherLocalWinner = Object.keys(awardedIds).some((id) => awardedIds[id] && id !== c.bid.id);
                      const blockedByAccept = (decidedByAccept && !isAcceptedWinner) || (!isAwarded && otherLocalWinner);
                      return (
                        <td key={c.bid.id} className="align-top" style={{ padding: "14px 15px", borderTop: `2px solid ${C.border}`, borderInlineStart: `1px solid ${C.line}` }}>
                          <div className="flex flex-col gap-[7px]">
                            {isAcceptedWinner ? (
                              /* Case A / C-bidder: finalized winner — a static "Accepted" badge, not a toggle. */
                              <span className="inline-flex w-full items-center justify-center gap-1.5 text-[12.5px] text-white" style={{ background: "#137C42", padding: 9, borderRadius: 9, fontWeight: 800 }}>
                                <span className="material-icons-outlined" style={{ fontSize: 16 }}>check_circle</span>{decidedWord}
                              </span>
                            ) : (
                              /* Award = in-place toggle: "Award" (green) ⇄ "Awarded" (Case B, soft/reversible). Disabled once the request is decided elsewhere. */
                              <button onClick={() => toggleAward(c.bid)} disabled={blockedByAccept} title={isAwarded && !blockedByAccept ? L("Awarded — finalize in the deal room", "تمت الترسية — أتمِم في غرفة الصفقة") : undefined} className="inline-flex w-full items-center justify-center gap-1.5 text-[12.5px] text-white disabled:opacity-45 disabled:cursor-default" style={{ background: isAwarded ? "#137C42" : C.success, padding: 9, borderRadius: 9, fontWeight: 800 }}>
                                <span className="material-icons-outlined" style={{ fontSize: 16 }}>{isAwarded ? "check_circle" : "gavel"}</span>{isAwarded ? L("Awarded", "تمت الترسية") : L("Award", "ترسية")}
                              </button>
                            )}
                            <button onClick={() => goDealRoom(c.bid, isAcceptedWinner ? "award" : "negotiate")} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 text-[12.5px] disabled:opacity-60" style={{ background: "#fff", color: C.rentee, border: `1px solid rgba(37,99,235,.35)`, padding: 9, borderRadius: 9, fontWeight: 800 }}>
                              <span className="material-icons-outlined" style={{ fontSize: 15 }}>{isAcceptedWinner ? "forum" : "swap_horiz"}</span>{isAcceptedWinner ? L("View deal room", "غرفة الصفقة") : L("Negotiate", "تفاوض")}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* table footer — export the comparison (§6) */}
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span className="flex-1 text-[11.5px] font-semibold" style={{ color: C.muted, minWidth: 140 }}>{L("Export this comparison as a PDF to share or keep.", "صدّر هذه المقارنة كملف PDF للمشاركة أو الحفظ.")}</span>
            <button onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-[10px] border px-3.5 py-[9px] text-[12.5px] font-extrabold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>
              <span className="material-icons-outlined" style={{ fontSize: 17 }}>picture_as_pdf</span>{L("Export PDF", "تصدير PDF")}
            </button>
          </div>

        </>
      )}

      {/* ── award prompt → finalize in the deal room (on-platform) or directly (off-platform link bids) ── */}
      {awardPrompt && (() => {
        // Off-platform / shared-link bids have no account and no deal room — the deal-room redirect can't work.
        const offPlatform = !!awardPrompt.viaSharedLink || String(awardPrompt.id).startsWith("link-") || String(awardPrompt.id).startsWith("upload:");
        return (
        <div className="fixed inset-0 z-[420] grid place-items-center p-6" style={{ background: "rgba(28,53,80,.42)", backdropFilter: "blur(3px)" }} onClick={() => setAwardPrompt(null)}>
          <div className="w-[440px] max-w-full overflow-hidden rounded-2xl" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b px-6 py-5" style={{ borderColor: C.line }}>
              <div className="grid h-11 w-11 flex-none place-items-center rounded-lg" style={{ background: C.successBg, color: C.success }}><span className="material-icons-outlined" style={{ fontSize: 24 }}>check_circle</span></div>
              <div className="flex-1"><h3 className="m-0 text-[17px] font-extrabold">{L(`Awarded to ${awardPrompt.supplierName}`, `تمت الترسية لـ ${awardPrompt.supplierName}`)}</h3><p className="m-0 text-[12.5px]" style={{ color: C.muted }}>{offPlatform ? L("Off-platform supplier — finalize directly", "مؤجّر خارج المنصة — أتمِم مباشرة") : L("Finalize by accepting the terms in the deal room", "أتمِم الترسية بقبول الشروط في غرفة الصفقة")}</p></div>
              <button onClick={() => setAwardPrompt(null)} className="grid h-8 w-8 flex-none place-items-center rounded-full border" style={{ borderColor: C.border, color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span></button>
            </div>
            <div className="px-6 py-5 text-[13px] leading-relaxed" style={{ color: C.navyMid }}>
              {offPlatform
                ? L("You've marked this supplier as your choice. They bid off-platform via your shared link, so there's no deal room — reach out to them directly with the contact details on their submission to finalize.", "لقد اخترت هذا المؤجّر. قدّم عرضه خارج المنصة عبر رابطك المشترك، لذا لا توجد غرفة صفقة — تواصل معه مباشرةً عبر بيانات التواصل في عرضه لإتمام الترسية.")
                : L("You've marked this supplier as your choice. To finalize the award, accept the terms with them in the deal room.", "لقد اخترت هذا المؤجّر. لإتمام الترسية، اقبل الشروط معه في غرفة الصفقة.")}
            </div>
            <div className="flex justify-end gap-2.5 border-t px-6 py-4" style={{ borderColor: C.line }}>
              {offPlatform ? (
                <button onClick={() => setAwardPrompt(null)} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: C.success }}>
                  <span className="material-icons-outlined" style={{ fontSize: 17 }}>check</span>{L("Got it", "تمام")}
                </button>
              ) : (<>
                <button onClick={() => setAwardPrompt(null)} className="rounded-lg border px-4 py-2 text-[13px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>{L("Stay here", "البقاء هنا")}</button>
                <button onClick={() => { const b = awardPrompt; setAwardPrompt(null); goDealRoom(b, "award"); }} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: C.success }}>
                  <span className="material-icons-outlined" style={{ fontSize: 17 }}>meeting_room</span>{L("Accept in deal room", "القبول في غرفة الصفقة")}
                </button>
              </>)}
            </div>
          </div>
        </div>
        );
      })()}

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
      {verify && (
        <BidVerifyModal
          draft={verify.draft}
          extracted={verify.extracted}
          ar={ar}
          L={L}
          onClose={() => setVerify(null)}
          onCommitted={(bid) => {
            const card = normalizedBidToBidCard(bid, { duration: durationDays, units });
            setUploaded((p) => [...p.filter((b) => b.id !== card.id), card]);
            setVerify(null);
            toast(L(`Added ${card.supplierName}'s quote from the file.`, `أُضيف عرض ${card.supplierName} من الملف.`));
          }}
        />
      )}

      {confirmAdd && (
        <div className="fixed inset-0 z-[420] grid place-items-center p-6" style={{ background: "rgba(28,53,80,.42)", backdropFilter: "blur(3px)" }} onClick={() => setConfirmAdd(null)}>
          <div className="w-[460px] max-w-full overflow-hidden rounded-2xl" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b px-6 py-5" style={{ borderColor: C.line }}>
              <div className="grid h-11 w-11 flex-none place-items-center rounded-lg" style={{ background: confirmAdd.blocking ? C.dangerBg : C.warningBg, color: confirmAdd.blocking ? C.danger : C.warning }}><span className="material-icons-outlined" style={{ fontSize: 24 }}>{confirmAdd.blocking ? "block" : "warning_amber"}</span></div>
              <div className="flex-1"><h3 className="m-0 text-[17px] font-extrabold">{confirmAdd.blocking ? L("Wrong equipment — can't compare", "معدة غير مطابقة — يتعذّر المقارنة") : L("This quote may not match", "قد لا يطابق هذا العرض")}</h3><p className="m-0 text-[12.5px]" style={{ color: C.muted }}>{confirmAdd.blocking ? L(`${confirmAdd.card.supplierName} — this quote is for different equipment, so it can't be added to this comparison.`, `${confirmAdd.card.supplierName} — هذا العرض لمعدة مختلفة، فلا يمكن إضافته لهذه المقارنة.`) : L(`${confirmAdd.card.supplierName} — check these before adding it to the comparison.`, `${confirmAdd.card.supplierName} — راجع هذه قبل إضافته للمقارنة.`)}</p></div>
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
              <p className="mt-3 text-[11.5px]" style={{ color: C.muted }}>{confirmAdd.blocking ? L("Upload the quote for the right equipment to compare it here.", "ارفع عرضاً للمعدة الصحيحة لمقارنته هنا.") : L("Adding it keeps it flagged — it's still shown for review, never auto-excluded.", "ستبقى الإضافة مع تنبيه — يظهر للمراجعة ولا يُستبعد تلقائياً.")}</p>
            </div>
            <div className="flex justify-end gap-2.5 border-t px-6 py-4" style={{ borderColor: C.line }}>
              {confirmAdd.blocking ? (
                <button onClick={() => setConfirmAdd(null)} className="rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: C.navy }}>{L("Close", "إغلاق")}</button>
              ) : (
                <>
                  <button onClick={() => setConfirmAdd(null)} className="rounded-lg border px-4 py-2 text-[13px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>{L("Don't add", "لا تُضِف")}</button>
                  <button onClick={confirmAddBid} className="rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: C.action }}>{L("Add anyway", "أضِفه على أي حال")}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── add-your-cost popup (replaces the browser prompt) ── */}
      {costAsk && (
        <div className="fixed inset-0 z-[420] grid place-items-center p-6" style={{ background: "rgba(28,53,80,.42)", backdropFilter: "blur(3px)" }} onClick={() => setCostAsk(null)}>
          <div className="w-[420px] max-w-full overflow-hidden rounded-2xl" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b px-6 py-5" style={{ borderColor: C.line }}>
              <div className="grid h-11 w-11 flex-none place-items-center rounded-lg text-[22px]" style={{ background: C.renteeDim }}>🧮</div>
              <div className="flex-1"><h3 className="m-0 text-[17px] font-extrabold">{L("Estimate your own costs", "قدّر تكاليفك")}</h3><p className="m-0 text-[12.5px]" style={{ color: C.muted }}>{costAsk.label} · {L("a cost you said you'll handle", "تكلفة ستتحمّلها أنت")}</p></div>
              <button onClick={() => setCostAsk(null)} className="grid h-8 w-8 flex-none place-items-center rounded-full border" style={{ borderColor: C.border, color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span></button>
            </div>
            {/* privacy note — these estimates are the renter's own, never shown to the supplier */}
            <div className="flex items-start gap-2.5 px-6 py-3.5" style={{ background: C.warningBg, borderBottom: `1px solid ${C.line}` }}>
              <span className="flex-none text-[15px]">🔒</span>
              <span className="text-[12px] font-bold leading-relaxed" style={{ color: "#9A6A1E" }}>{L("Rough estimates for your own planning only — not real costs, not part of the bid, and never shown to the supplier.", "تقديرات تقريبية لتخطيطك أنت فقط — ليست تكاليف فعلية، وليست جزءًا من العرض، ولا تظهر للمؤجّر أبدًا.")}</span>
            </div>
            <div className="px-6 py-5">
              <label className="mb-1.5 block text-[12.5px] font-extrabold" style={{ color: C.navy }}>{costAsk.label}</label>
              <div className="flex h-[50px] items-center gap-2.5 rounded-lg border px-4" style={{ background: C.surface2, borderColor: C.border }}>
                <span className="text-[14px] font-extrabold" style={{ color: C.muted }}>{sar}</span>
                <input autoFocus type="number" inputMode="numeric" min={0} value={costInput} onChange={(e) => setCostInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitCost(); }} placeholder="0" className="min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none" style={{ color: C.navy }} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: C.line }}>
              <span className="text-[13px] font-extrabold" style={{ color: C.navy }}>{L("Your total est.", "إجمالي تقديرك")} <span style={{ color: C.rentee }}>{sar} {nf(Object.values(renterCosts).reduce((a, b) => a + (b ?? 0), 0) + Object.values(renterMob).reduce((a, b) => a + (b ?? 0), 0))}</span></span>
              <div className="flex gap-2.5">
                <button onClick={() => setCostAsk(null)} className="rounded-lg border px-4 py-2 text-[13px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>{L("Cancel", "إلغاء")}</button>
                <button onClick={submitCost} className="rounded-lg px-5 py-2 text-[13px] font-bold text-white" style={{ background: C.rentee }}>{L("Save estimate", "حفظ التقدير")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* §6 — one private "Estimate your own costs" popup (multi-field, all your terms at once) */}
      {estimateOpen && (
        <div className="fixed inset-0 z-[420] grid place-items-center p-6" style={{ background: "rgba(28,53,80,.42)", backdropFilter: "blur(3px)" }} onClick={() => setEstimateOpen(false)}>
          <div className="flex max-h-[86vh] w-[440px] max-w-full flex-col overflow-hidden rounded-2xl" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b px-6 py-5" style={{ borderColor: C.line }}>
              <div className="grid h-11 w-11 flex-none place-items-center rounded-lg text-[22px]" style={{ background: C.renteeDim }}>🧮</div>
              <div className="flex-1"><h3 className="m-0 text-[17px] font-extrabold">{L("Estimate your own costs", "قدّر تكاليفك")}</h3><p className="m-0 text-[12.5px]" style={{ color: C.muted }}>{(ar ? activeItemObj?.item?.nameAr : activeItemObj?.item?.name) ?? ""} · {L("the items you said you'll handle", "البنود التي ستتحمّلها")}</p></div>
              <button onClick={() => setEstimateOpen(false)} className="grid h-8 w-8 flex-none place-items-center rounded-full border" style={{ borderColor: C.border, color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span></button>
            </div>
            <div className="flex items-start gap-2.5 px-6 py-3.5" style={{ background: C.warningBg, borderBottom: `1px solid ${C.line}` }}>
              <span className="flex-none text-[15px]">🔒</span>
              <span className="text-[12px] font-bold leading-relaxed" style={{ color: "#9A6A1E" }}>{L("Rough estimates for your own planning only — not real costs, not part of the bid, and never shown to the supplier.", "تقديرات تقريبية لتخطيطك أنت فقط — ليست تكاليف فعلية، وليست جزءًا من العرض، ولا تظهر للمؤجّر أبدًا.")}</span>
            </div>
            <div className="flex flex-col gap-3.5 overflow-y-auto px-6 py-5">
              {youTerms.map((m) => (
                <div key={m.key}>
                  <label className="mb-1.5 block text-[12.5px] font-extrabold" style={{ color: C.navy }}>{ar ? m.ar : m.en}</label>
                  <div className="flex h-[48px] items-center gap-2.5 rounded-lg border px-4" style={{ background: C.surface2, borderColor: C.border }}>
                    <span className="text-[13px] font-extrabold" style={{ color: C.muted }}>{sar}</span>
                    <input type="number" inputMode="numeric" min={0} value={estDraft[m.key] ?? ""} onChange={(e) => setEstDraft((p) => ({ ...p, [m.key]: e.target.value }))} placeholder="0" className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none" style={{ color: C.navy }} />
                  </div>
                </div>
              ))}
              {/* Delivery / return that the request put on YOU — estimate them here too (they land on you
                  regardless of which supplier, so they're entered once). */}
              {([["__delivery", L("Delivery (on you)", "التوصيل (عليك)"), showDeliveryEst], ["__return", L("Return (on you)", "الإرجاع (عليك)"), showReturnEst]] as const)
                .filter(([, , show]) => show)
                .map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-[12.5px] font-extrabold" style={{ color: C.navy }}>{label}</label>
                    <div className="flex h-[48px] items-center gap-2.5 rounded-lg border px-4" style={{ background: C.surface2, borderColor: C.border }}>
                      <span className="text-[13px] font-extrabold" style={{ color: C.muted }}>{sar}</span>
                      <input type="number" inputMode="numeric" min={0} value={estDraft[key] ?? ""} onChange={(e) => setEstDraft((p) => ({ ...p, [key]: e.target.value }))} placeholder="0" className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none" style={{ color: C.navy }} />
                    </div>
                  </div>
                ))}
              {youTerms.length === 0 && !showDeliveryEst && !showReturnEst && (
                <p className="m-0 text-[13px] font-semibold" style={{ color: C.muted }}>{L("Nothing on you to estimate — the request put every cost on the supplier.", "لا شيء عليك لتقديره — وضع الطلب كل التكاليف على المؤجّر.")}</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: C.line }}>
              <span className="text-[13px] font-extrabold" style={{ color: C.navy }}>{L("Your total est.", "إجمالي تقديرك")} <span style={{ color: C.rentee }}>{sar} {nf(["__delivery", "__return", ...youTerms.map((m) => m.key)].reduce((s, k) => s + (parseInt((estDraft[k] ?? "").replace(/[^0-9]/g, ""), 10) || 0), 0))}</span></span>
              <div className="flex gap-2.5">
                <button onClick={() => setEstimateOpen(false)} className="rounded-lg border px-4 py-2 text-[13px] font-bold" style={{ borderColor: C.border, color: C.navy, background: "#fff" }}>{L("Cancel", "إلغاء")}</button>
                <button onClick={saveEstimate} className="rounded-lg px-5 py-2 text-[13px] font-bold text-white" style={{ background: C.rentee }}>{L("Save estimate", "حفظ التقدير")}</button>
              </div>
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

      {/* Guest gate — opens when the free trial is spent or on a sign-in-only action (award / deal room). */}
      {anon && <AccountModal open={showAccount} onClose={() => setShowAccount(false)} onCreated={() => setShowAccount(false)} title={t.guest.trialTitle} subtitle={t.guest.trialSub} />}

      {/* In-app document viewer — renders the actual file (presigned S3) in a modal, no redirect. */}
      {docView && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/55 p-3 sm:p-6" onClick={() => setDocView(null)}>
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] bg-white" onClick={(e) => e.stopPropagation()} dir={ar ? "rtl" : "ltr"}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: C.border }}>
              <span className="inline-flex items-center gap-2 text-[14px] font-extrabold" style={{ color: C.navy }}><span className="material-icons-outlined" style={{ fontSize: 18, color: C.navyMid }}>description</span>{docView.label}</span>
              <div className="flex items-center gap-1">
                {/* T3: anything viewable is downloadable — fetch the presigned file as a blob and save it. */}
                {docView.url && <button onClick={() => downloadDocFile(docView.url!, docView.label)} title={L("Download", "تنزيل")} className="grid h-8 w-8 place-items-center rounded-full" style={{ color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>download</span></button>}
                {docView.url && <a href={docView.url} target="_blank" rel="noopener noreferrer" title={L("Open in new tab", "فتح في تبويب جديد")} className="grid h-8 w-8 place-items-center rounded-full" style={{ color: C.muted }}><span className="material-icons-outlined" style={{ fontSize: 18 }}>open_in_new</span></a>}
                <button onClick={() => setDocView(null)} className="grid h-8 w-8 place-items-center rounded-full" style={{ color: C.muted }} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span></button>
              </div>
            </div>
            <div className="grid min-h-[60vh] flex-1 place-items-center" style={{ background: C.surface2 }}>
              {docView.loading ? (
                <span className="material-icons-outlined animate-spin" style={{ fontSize: 30, color: C.muted }}>progress_activity</span>
              ) : docView.value ? (
                <div className="max-w-sm px-6 py-10 text-center">
                  <span className="material-icons-outlined" style={{ fontSize: 34, color: C.navyMid }}>badge</span>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{docView.label}</p>
                  <p className="mt-1 select-text break-words text-[18px] font-extrabold" style={{ color: C.navy }}>{docView.value}</p>
                  <p className="mt-2 text-[12px]" style={{ color: C.muted }}>{L("Captured from the supplier's bid form — no uploaded document.", "مُلتقط من نموذج عرض المؤجّر — لا يوجد مستند مرفوع.")}</p>
                </div>
              ) : docView.url ? (
                <iframe src={docView.url} title={docView.label} className="h-full w-full" style={{ minHeight: "60vh", border: 0 }} />
              ) : (
                <div className="max-w-sm px-6 py-10 text-center">
                  <span className="material-icons-outlined" style={{ fontSize: 36, color: C.muted }}>lock</span>
                  <p className="mt-2 text-[13.5px] font-bold" style={{ color: C.navy }}>{L("Document not available to view", "المستند غير متاح للعرض")}</p>
                  <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>{L("This supplier hasn’t shared this file, or it isn’t viewable yet. Company docs (CR/VAT) open once a deal room is started.", "لم يشارك المؤجّر هذا الملف، أو أنه غير متاح للعرض بعد. تُفتح وثائق الشركة (السجل/الضريبة) بعد بدء غرفة الصفقة.")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- bits ---------------------------------- */
/** Download the doc being viewed (T3). Fetches the presigned URL as a blob so it saves to disk with a
 *  sensible filename; falls back to opening in a new tab if the fetch is blocked (CORS/expired URL). */
async function downloadDocFile(url: string, label: string): Promise<void> {
  const safe = (label || "document").replace(/[^\w.\-]+/g, "_").slice(0, 60);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const ext = blob.type.includes("pdf") ? "pdf" : (blob.type.split("/")[1] || url.split("?")[0].split(".").pop() || "file");
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = /\.[a-z0-9]+$/i.test(safe) ? safe : `${safe}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(obj);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

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
function SectionRow({ icon, title, accent, accentText, n, collapsed, onToggle }: { id: string; icon: string; title: string; accent: string; accentText: string; n: number; collapsed: boolean; onToggle: () => void }) {
  // prototype: solid navy bar, padding 12px 16px, label 12.5px/900 letter-spacing .05em, white. No accent stripe.
  void accent;
  return (
    <tr><td colSpan={n + 1} style={{ background: C.navy, padding: 0 }}>
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 px-4 py-3 text-start" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <span className="material-icons-outlined" style={{ fontSize: 18, color: accentText }}>{icon}</span>
        <b className="text-[12.5px] uppercase" style={{ color: accentText, fontWeight: 900, letterSpacing: ".05em" }}>{title}</b>
        <span className="material-icons-outlined ms-auto" style={{ fontSize: 20, color: "rgba(255,255,255,.72)", transform: collapsed ? "rotate(-90deg)" : "" }}>expand_more</span>
      </button>
    </td></tr>
  );
}
function RowHead({ title, sub }: { title: string; sub?: string }) {
  // prototype: 200px sticky cell, padding 14px 16px; label 12.5px/900 navy; sub 10.5px/600 margin-top 2px.
  return <td className="sticky start-0 z-[1] align-top text-[12.5px]" style={{ background: C.surface2, color: C.navy, fontWeight: 900, width: 200, minWidth: 200, padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>{title}{sub && <span className="mt-0.5 block text-[10.5px] font-semibold" style={{ color: C.muted }}>{sub}</span>}</td>;
}
function Td({ children, ok, fail }: { children: React.ReactNode; ok?: boolean; fail?: boolean }) {
  // prototype: data cell padding 14px 15px, 1px left column separator.
  // A `fail` cell is a SOLID light-red with red text + inset accent so "Not met" reads clearly even
  // inside the green "Recommended" column (T6) — the old 7%-opacity tint was invisible there.
  return (
    <td
      className="align-top text-[13px] font-bold"
      style={{
        padding: "14px 15px",
        borderBottom: `1px solid ${C.line}`,
        borderInlineStart: `1px solid ${C.line}`,
        color: fail ? C.danger : C.navy,
        background: fail ? C.dangerBg : ok ? "rgba(29,175,88,.06)" : undefined,
        boxShadow: fail ? `inset 3px 0 0 ${C.danger}` : undefined,
      }}
    >
      {children}
    </td>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  // prototype: secondary line 11px/600, margin-top 3px.
  return <span className="block text-[11px] font-semibold" style={{ color: C.muted, marginTop: 3 }}>{children}</span>;
}
