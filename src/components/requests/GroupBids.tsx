"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { fetchBids, fetchRequestSubmissions, startDealRoom } from "@/lib/api/client";
import { BidCardChecks } from "@/components/requests/BidCardChecks";
import { equipmentCheckOf, termsCheck } from "@/lib/contract/bid-card-checks";
import { bidCounterDelta, ctaShowsCounterDelta } from "@/lib/contract/bid-counter-delta";
import { unitCountNotes, distinctMachinesOffered } from "@/lib/contract/unit-count-notes";
import { computeBidReadiness } from "@/lib/contract/bid-readiness";
import { BidTermsModal } from "@/components/requests/BidTermsModal";
import { mayOpenEquipmentSurface } from "@/lib/contract/bid-equipment-access";
import { SharedLinkBidCard } from "@/components/requests/SharedLinkBidCard";
import { SharedBidSubmissionModal } from "@/components/requests/SharedBidSubmissionModal";
import { SharedBidNegotiateRoom } from "@/components/requests/SharedBidNegotiateRoom";
import { NEGOTIATE_ENABLED } from "@/lib/config/flags";
import { QuotationVerifyGate } from "@/components/requests/QuotationVerifyGate";
import { useSession } from "@/lib/session";
import { bidSuppliers, bidSupplierKey, bucketBidTerms, type BidCard } from "@/lib/contract/bids";
import { submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";
import { qualityFromSubmissionItem, type BidQuality } from "@/lib/contract/bid-quality";
import { computeBidQuote } from "@/lib/contract/comparison";
import { divisorNote, headlineAmount } from "@/lib/pricing/rental";
import { shortRef, type RequestGroup } from "@/lib/contract/requests";
import { EquipImg } from "@/components/requests/EquipImg";
import { quotationDownloadName } from "@/lib/compare/quotation-token";
import { renderQuotationSection, wrapQuotationPage } from "@/lib/quotation/render";
import { buildBidQuotationDoc, quotationSupplierInitials, quotationSupplierKey } from "@/lib/quotation/bid-quotation";

/** A group bid = a request's bid tagged with which item (request) it belongs to. */
type GroupBid = BidCard & { requestId: string; itemLabel: string; itemLabelAr: string; categoryId: string | null; itemImage: string | null; quality?: BidQuality | null };

/** The three quality dimensions the shared-link quality score is built from — each a filter option. */
type QualityPart = "terms" | "equipment" | "company";
const PART_META: { key: QualityPart; icon: string; en: string; ar: string }[] = [
  { key: "terms", icon: "rule", en: "Matched the terms", ar: "طابق الشروط" },
  { key: "equipment", icon: "photo_library", en: "Uploaded equipment docs", ar: "أرفق مستندات المعدة" },
  { key: "company", icon: "business", en: "Filled company details", ar: "أكمل بيانات الشركة" },
];
// A bid "meets" a dimension: matched every required term / uploaded ≥1 equipment doc / filled ≥1 company detail.
const partMeets = (q: BidQuality | null | undefined, p: QualityPart): boolean =>
  !q ? false : p === "terms" ? q.parts.terms >= 0.999 : p === "equipment" ? q.parts.equipment > 0 : q.parts.company > 0;

const SPILL: Record<string, { cls: string; dot: boolean; en: string; ar: string }> = {
  PENDING: { cls: "sp-pending", dot: true, en: "New", ar: "جديد" },
  OPEN_FOR_NEGOTIATION: { cls: "sp-open", dot: false, en: "Negotiating", ar: "تحت التفاوض" },
  COUNTER_OFFERED: { cls: "sp-counter", dot: true, en: "Counter-offer", ar: "عرض مُقابل" },
  ACCEPTED: { cls: "sp-accepted", dot: false, en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "sp-expired", dot: false, en: "Expired", ar: "منتهٍ" },
  WITHDRAWN: { cls: "sp-withdrawn", dot: false, en: "Withdrawn", ar: "مسحوب" },
};
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

function pillLabel(status: string, L: (en: string, ar: string) => string): string {
  switch (status) {
    case "OPEN_FOR_NEGOTIATION": return L("Open chat", "فتح المحادثة");
    case "COUNTER_OFFERED": return L("Review counter-offer", "مراجعة العرض المُقابل");
    case "ACCEPTED": return L("View deal", "عرض الصفقة");
    case "EXPIRED": return L("Expired", "منتهٍ");
    case "WITHDRAWN": return L("Withdrawn", "مسحوب");
    default: return L("Start negotiation on this bid", "بدء التفاوض على هذا العرض");
  }
}

/** Offer-state suffix for the deal-room CTA (uiState) — new / updated offer / whose move it is. */
function offerSuffix(uiState: string | null, L: (en: string, ar: string) => string): string | null {
  switch (uiState) {
    case "new": return L("New offer", "عرض جديد");
    case "fresh": return L("Updated offer", "عرض مُحدّث");
    case "your-turn": return L("Your turn", "دورك");
    default: return null;
  }
}

// The formal quotation template (styles, amount-in-words, section renderer) now lives in the shared
// `@/lib/quotation/render` module so this bid-card download and the deal-room confirmed quotation use
// ONE identical template.

/**
 * One transport leg, in the app's own priority (`price_expanded_breakdown.dart` §7).
 *
 * A supplier can say four different things about delivery, and the card used to show three of them
 * identically — as no row at all. That let "he delivers free" and "he never answered" read alike, and
 * free delivery is worth real money when two bids are side by side.
 *
 *   1. `Excluded`   — he says it is not his job
 *   2. `Bundled`    — folded into the rental price. **Not reachable yet**: the web's `BidCard` carries
 *                     no `mobBundled`/`demobBundled`, so the branch is written and waits for the field
 *                     rather than being guessed at from a zero
 *   3. `Not quoted` — he never answered. A price the bid does not carry, NOT a zero
 *   4. the amount   — including a real `0`, which is a quoted price and says so
 *
 * Returns a one-row array, or none where the leg has no place on this card at all.
 */
function legRow(
  label: string,
  amount: number,
  excluded: boolean | null | undefined,
  quoted: number | null | undefined,
  leadTime: string | null,
  L: (en: string, ar: string) => string,
): [string, number | string, string | null][] {
  if (excluded) return [[label, L("Excluded", "مستبعد"), null]];
  // `null` is silence; `0` is a price. Reading them alike is the whole defect this replaces.
  if (quoted == null) return [[label, L("Not quoted", "لم يُحدد"), null]];
  return [[label, amount, leadTime]];
}

/**
 * Grouped My Bids (web-app/multi-item-requests, Phase 2). Fetches bids for every request in the
 * group, merges them, and shows a supplier Level-2 filter + equipment-focused bid cards across the
 * whole submission, plus select-for-quotation. `getBidList` is per-request, so we fan the fetch out.
 */
export function GroupBids({ group, initialItemId }: { group: RequestGroup; initialItemId?: string | null }) {
  const { locale } = useLocale();
  const t = useT();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();

  const [bids, setBids] = useState<GroupBid[] | null>(null);
  const [error, setError] = useState(false);
  // ── RMAP · freshness ───────────────────────────────────────────────────────────────────────────
  // The `[list │ map]` toggle and its hardcoded `mapBidId` are gone with V1: the verification surface
  // is its own route, `/bids/[bidId]/equipment`, entered by opening ONE bid. This screen keeps the
  // refetch freshness path, which that route reuses, and nothing about the map.
  // Re-entrancy is a REF, not state: nothing on this screen renders a "refreshing" affordance since
  // the map panel that hosted one moved to its own route, and a state nobody reads is a state that
  // silently re-renders the whole bid grid on every focus event.
  const bidsRef = useRef<GroupBid[] | null>(null); // current list, for the arrival diff without re-running the fetch
  const lastFetchRef = useRef(0);
  const refreshingRef = useRef(false);
  const [supplierKey, setSupplierKey] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<string>(initialItemId ?? "all"); // scope bids to one request item
  const [itemMenuOpen, setItemMenuOpen] = useState(false);
  // Price breakdown open/collapsed PER CARD (a Set of bid ids), so expanding one bid's price doesn't
  // close another's — each card toggles independently. `perUnitIds` holds the per-card "Per unit" toggle.
  const [openPrices, setOpenPrices] = useState<Set<string>>(new Set());
  // Default to PER UNIT — track the cards switched to "all units" instead (empty = per-unit default).
  const [allUnitsIds, setAllUnitsIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false); // prototype: pick bids to compare/export  const [termsBid, setTermsBid] = useState<GroupBid | null>(null);  const [langPick, setLangPick] = useState(false); // quotation language chooser (Arabic | English)
  // Bids captured the instant "Download quotations" is clicked. The language/verify modals aren't part
  // of the selection UI, so opening one trips the click-outside handler and CLEARS `selected` before the
  // download fires — which then fell back to exporting EVERY supplier. Snapshotting here keeps the PDF
  // scoped to exactly what was selected, regardless of that clearing.
  const [dlOnly, setDlOnly] = useState<GroupBid[] | null>(null);
  const [renterName, setRenterName] = useState("");
  const [companyName, setCompanyName] = useState("");
  // Renter company identity for the quotation Rentee block (app parity) — from /api/me.
  const [renterId, setRenterId] = useState<{ phone: string | null; email: string | null; crNumber: string | null; vatNumber: string | null; nationalAddress: string | null }>({ phone: null, email: null, crNumber: null, vatNumber: null, nationalAddress: null });
  const { tier } = useSession();
  const verified = tier === "verified";
  const [quoteGate, setQuoteGate] = useState(false); // unverified → confirm before issuing the quotation
  // web-app/006 demo (staging only) — relabel real bids as off-platform "via shared link".
  const [submissions, setSubmissions] = useState<LinkBidSubmission[]>([]); // real off-platform submissions (all group items)
  const [groupRef, setGroupRef] = useState<string | null>(null); // RFQ-NNNNN group short code (agents bid-submissions) — stamped on the quotation
  const [submissionBid, setSubmissionBid] = useState<GroupBid | null>(null);
  const [negotiateBid, setNegotiateBid] = useState<GroupBid | null>(null); // web-app/006 — deal-room-style negotiate view
  // Bid filter (source + refine), matching the bids-by-supplier prototype.
  const [filterOpen, setFilterOpen] = useState(false);
  const [fSource, setFSource] = useState<"all" | "link" | "platform" | "file">("all");
  const [fVerified, setFVerified] = useState(false);
  const [fKm, setFKm] = useState(false);
  // Quality sub-filter (shared-link bids only) — filter by the three quality dimensions the score is
  // built from: matched terms · uploaded equipment docs · filled company details. Multi-select (AND).
  const [fqParts, setFqParts] = useState<Set<QualityPart>>(new Set());
  const toggleQPart = (p: QualityPart) => setFqParts((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { firstName?: string; lastName?: string; companyName?: string | null; phone?: string | null; email?: string | null; crNumber?: string | null; vatNumber?: string | null; nationalAddress?: string | null } } | null) => {
        if (active && d?.user) {
          setRenterName([d.user.firstName, d.user.lastName].filter(Boolean).join(" "));
          setCompanyName(d.user.companyName ?? "");
          setRenterId({ phone: d.user.phone ?? null, email: d.user.email ?? null, crNumber: d.user.crNumber ?? null, vatNumber: d.user.vatNumber ?? null, nationalAddress: d.user.nationalAddress ?? null });
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // One fetch of every item's bids, merged and tagged with the item they belong to. Extracted so the
  // mount load and the §7.5.1 refetch triggers run the SAME request — a second implementation is how
  // the list and the map end up disagreeing about what has arrived.
  const fetchGroupBids = useCallback(
    () =>
      Promise.all(
        group.items.map((it) =>
          fetchBids(it.id)
            .then((d) =>
              d.bids.map((b): GroupBid => ({
                ...b,
                requestId: it.id,
                itemLabel: it.item?.name ?? it.displayId,
                itemLabelAr: it.item?.nameAr ?? it.displayId,
                categoryId: it.item?.categoryId ?? null,
                itemImage: it.item?.imageUrl ?? null,
              })),
            )
            .catch(() => [] as GroupBid[]),
        ),
      ).then((lists) => lists.flat()),
    [group.items],
  );

  useEffect(() => {
    let active = true;
    setBids(null);
    setError(false);
    setSupplierKey("all");
    setSelected(new Set());
    fetchGroupBids()
      .then((list) => {
        if (!active) return;
        lastFetchRef.current = Date.now();
        setBids(list);
      })
      .catch(() => active && setError(true));
    // Off-platform shared-link submissions are stored once per GROUP (a single bid covers all items),
    // so fetch them once by the group id — not per item (which would duplicate them). Best-effort.
    setSubmissions([]);
    fetchRequestSubmissions(group.id).then((r) => { if (active) { setSubmissions(r.submissions); setGroupRef(r.groupRef); } }).catch(() => {});
    return () => {
      active = false;
    };
  }, [group.id, group.items, fetchGroupBids]);

  // Scope to the item the renter tapped "View Bids" on (or "all" when entering via "View all bids").
  useEffect(() => { setSelectedItem(initialItemId ?? "all"); }, [initialItemId, group.id]);

  /* ── RMAP §7.5.1 · freshness ─────────────────────────────────────────────────────────────────────
     There is NO push (§7.5 withdrawn), so refetch is the entire mechanism, not a fallback: on mount,
     on window focus, after the renter sends, plus a manual affordance (AC-190, AC-229). "Arrival"
     means *the refetch returned a bid that was not there before* — nothing here claims recency, and no
     copy on the surface implies instant updating (AC-230).

     A 15s staleness window keeps a burst of focus events (alt-tab, devtools, a modal closing) from
     firing a fan-out of one request per item; the manual button forces past it. */
  const STALE_MS = 15_000;

  useEffect(() => { bidsRef.current = bids; }, [bids]);

  const refreshBids = useCallback(
    async (force: boolean) => {
      if (refreshingRef.current) return;
      if (!force && Date.now() - lastFetchRef.current < STALE_MS) return;
      refreshingRef.current = true;
      try {
        const next = await fetchGroupBids();
        lastFetchRef.current = Date.now();
        const known = new Set((bidsRef.current ?? []).map((b) => b.id));
        const arrived = next.filter((b) => !known.has(b.id)).map((b) => b.id);
        // Replace the list wholesale: the sort is applied to the NEW array on render, so an arriving
        // bid lands in price order instead of appending to the bottom of a cheapest-first list (AC-170).
        setBids(next);
        // The «وصل الآن» marker belonged to v2's offers list, which the v3 rescope deleted — this
        // surface shows one bid, so there is no list for an arrival to appear in. The detection is
        // kept (it costs nothing and V-tickets may want it) but nothing consumes it today.
        void arrived;
      } catch {
        // Keep what we have — a failed refresh must never empty a list the renter is reading.
      } finally {
        refreshingRef.current = false;
      }
    },
    [fetchGroupBids],
  );

  // Returning from the verification surface (or from anywhere else) refetches, under the same
  // staleness guard. It is no longer confined to a view mode, because there is no view mode.
  useEffect(() => {
    const onFocus = () => { void refreshBids(false); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshBids]);

  // B4: while comparing, a click anywhere outside the selection UI (toolbar / cards / action bar, all
  // tagged data-select-ui) exits selection — replaces the old Cancel button.
  useEffect(() => {
    if (!selectMode) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el && el.closest("[data-select-ui]")) return;
      setSelectMode(false);
      setSelected(new Set());
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selectMode]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // An off-platform submission is stored once per GROUP but covers several items. Show ONE card per
  // item (parity with on-platform bids) — scoped to that item's terms + price + total, matched to its
  // request so we can show the real equipment icon/image. Memoized so goCompare can include them too.
  const subCards: GroupBid[] = useMemo(
    () =>
      submissions.flatMap((s) =>
        s.items.map((it): GroupBid => {
          const gi = group.items.find((g) => g.id === it.requestId);
          return {
            ...submissionToBidCard(s, it),
            id: `link-${s.id}-${it.requestItemId}`, // unique per item-card (no key/selection collisions)
            requestId: it.requestId ?? s.requestId,
            itemLabel: gi?.item?.name ?? it.label ?? L("Equipment", "المعدة"),
            itemLabelAr: gi?.item?.nameAr ?? it.label ?? "المعدة",
            categoryId: gi?.item?.categoryId ?? null,
            itemImage: gi?.item?.imageUrl ?? null,
            quality: qualityFromSubmissionItem(s, it), // per-ITEM score (this item's terms/docs + company)
          };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submissions, group.items, ar],
  );

  // web-app/007 — open the comparison workspace pre-selected to the chosen bids (and their item).
  function goCompare() {
    const chosen = [...(bids ?? []), ...subCards].filter((b) => selected.has(b.id));
    if (chosen.length < 1) return;
    const params = new URLSearchParams({ group: group.id });
    const itemId = chosen[0]?.requestId;
    if (itemId) params.set("item", itemId);
    params.set("bids", chosen.map((b) => b.id).join(","));
    router.push(`/compare?${params.toString()}`);
  }

  async function startNegotiation(b: GroupBid) {
    if (busyId) return;
    if (b.dealRoomId) {
      router.push(`/deal-room/${b.dealRoomId}`);
      return;
    }
    setBusyId(b.id);
    try {
      // App parity: opening the deal room is pre-acceptance — don't accept the bid here.
      const { id } = await startDealRoom(b.id);
      if (id) router.push(`/deal-room/${id}`);
      else setBusyId(null);
    } catch {
      setBusyId(null);
    }
  }

  function downloadQuotation(langIsAr: boolean, only?: GroupBid[]) {
    // Include off-platform (shared-link) bids alongside on-platform ones so a selected supplier
    // submission can be exported as a quotation just like an app bid. `only` lets a single card (e.g.
    // the submission viewer's Download) export just that bid through the SAME app-parity template.
    // Default to ALL bids in the group when nothing is explicitly selected. Clicking "Download
    // quotations" with no selection used to silently no-op (empty `chosen` → early return), which read
    // as a dead button. `only` still exports a single card (submission viewer).
    const all = [...(bids ?? []), ...subCards];
    const chosen = only ?? (selected.size ? all.filter((b) => selected.has(b.id)) : all);
    if (!chosen.length) return;
    const itemMap = new Map(group.items.map((it) => [it.id, it]));
    // Request codes this quotation covers — stamped in the filename so Compare scopes to them.
    const coveredCodes = [...new Set(chosen.map((b) => itemMap.get(b.requestId)?.displayId).filter(Boolean) as string[])];

    // One quotation per supplier: group the selected bids by supplier, then list ALL of that
    // supplier's chosen equipment as line items under a single quotation (with this request's terms).
    // Multiple suppliers → multiple quotation sections in the same file.
    const bySupplier = new Map<string, GroupBid[]>();
    for (const b of chosen) {
      const key = quotationSupplierKey(b); // shared with the single-request download, so both cut the same documents
      const list = bySupplier.get(key);
      if (list) list.push(b);
      else bySupplier.set(key, [b]);
    }
    const reqCode = String(groupRef ?? group.items[0]?.displayId ?? shortRef(group.id)).replace(/[^A-Za-z0-9-]/g, "");

    // Render one supplier's quotation in a single language; bilingual output stacks both per supplier.
    //
    // Every renter-side quotation is now assembled by `buildBidQuotationDoc` — the ~270 lines that used
    // to live here, lifted out unchanged so the single-request bid view can reach them instead of
    // maintaining a second, thinner HTML builder of its own. This surface's only job is the mapping:
    // which bids, which request line each was quoted against, and who the two parties are.
    const renderSection = (supBids: GroupBid[], si: number, isAr: boolean) => {
      const sup = supBids[0];
      const qnum = `Q-${reqCode}-${quotationSupplierInitials(sup.supplierName)}${si + 1}`;
      const doc = buildBidQuotationDoc({
        lang: isAr ? "ar" : "en",
        quotationNumber: qnum,
        // The RFQ group code when the group has one; otherwise the builder falls back to the request
        // codes this document covers.
        reference: groupRef,
        entries: supBids.map((b) => {
          const ri = itemMap.get(b.requestId);
          const code = ri?.displayId ?? shortRef(b.requestId);
          return {
            bid: b,
            // The label follows the renter's CURRENT UI locale, not the exported document's language —
            // long-standing behaviour of this surface, and the taxonomy names live here, not in the
            // builder.
            itemLabel: (ar ? b.itemLabelAr : b.itemLabel) || code,
            requestCode: code,
            startDate: ri?.startDate ?? null,
            endDate: ri?.endDate ?? null,
            durationDays: ri?.durationDays ?? null,
            rentalType: ri?.rentalType ?? null,
            mobByRentee: ri?.mobByRentee ?? null,
            demobByRentee: ri?.demobByRentee ?? null,
          };
        }),
        // App parity (_RenteeBlock _partyHeader): the company name is primary when the renter HAS a
        // company (gated on company presence, not verification), with the person demoted to a subtitle.
        rentee: {
          companyName,
          personName: renterName,
          crNumber: renterId.crNumber,
          vatNumber: renterId.vatNumber,
          nationalAddress: renterId.nationalAddress,
          phone: renterId.phone,
          email: renterId.email,
          verified,
        },
      });
      return renderQuotationSection(doc);
    };

    // Single language (the renter picks Arabic or English) — one page per supplier, no 2-in-1.
    const sections = [...bySupplier.values()]
      .map((supBids, si) => renderSection(supBids, si, langIsAr))
      .join("");

    // Human-readable name: group short code (RFQ-NNNNN) when present, else the single request id
    // (REQ-NNNNN); covered item codes are stamped for re-upload scoping.
    const dlPrimary = groupRef ?? coveredCodes[0] ?? group.items[0]?.displayId ?? "quotation";
    const dlName = quotationDownloadName(dlPrimary, coveredCodes);
    const html = wrapQuotationPage(sections, { lang: langIsAr ? "ar" : "en", title: dlName });
    // Robust open: a popup-blocked `window.open` returns null and used to silently fail (dead click).
    // Fall back to downloading the self-printing HTML file so the quotation is never a no-op.
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      return;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dlName.replace(/[^\w.-]+/g, "_")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  if (error) return <div className="rempty">{L("Couldn’t load the bids.", "تعذّر تحميل العروض.")}</div>;
  if (!bids) return <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 26 }}>progress_activity</span></div>;
  const allBids = [...bids, ...subCards];
  if (allBids.length === 0) return <div className="rempty">{L("No bids yet for this request.", "لا توجد عروض بعد لهذا الطلب.")}</div>;

  const suppliers = bidSuppliers(allBids);
  // Bid source: off-platform shared-link vs on-platform (no uploaded-file source on this surface yet).
  const sourceOf = (b: GroupBid): "link" | "platform" | "file" => (b.viaSharedLink ? "link" : "platform");
  const srcCount = (s: "all" | "link" | "platform" | "file") => (s === "all" ? allBids.length : allBids.filter((b) => sourceOf(b) === s).length);
  // Count of link bids that meet a given quality dimension (drives the sub-filter option counts).
  const qPartCount = (p: QualityPart) => allBids.filter((b) => sourceOf(b) === "link" && (selectedItem === "all" || b.requestId === selectedItem) && partMeets(b.quality, p)).length;
  // The quality sub-filter only applies to link bids and only when the source filter is "link".
  const qualityActive = fSource === "link" && fqParts.size > 0;
  // Verified/distance only apply to on-platform bids (off-platform link bids carry no verification/distance).
  const refineActive = fSource === "platform";
  // Renter bid-list order: in-app (platform) bids FIRST, then off-platform (shared-link) — and within the
  // off-platform group, HIGHEST-QUALITY first (in-app bids have no shared-link quality score, so they keep
  // a stable requestId order). requestId is the tiebreak everywhere so the list stays deterministic.
  const orderForView = (list: GroupBid[]): GroupBid[] =>
    [...list].sort((a, b) => {
      const ra = sourceOf(a) === "platform" ? 0 : 1;
      const rb = sourceOf(b) === "platform" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      if (ra === 1) {
        const q = (b.quality?.score ?? -1) - (a.quality?.score ?? -1); // off-platform: highest quality first
        if (q !== 0) return q;
      }
      return a.requestId.localeCompare(b.requestId);
    });
  // Must use the SAME key `bidSuppliers` built the chips from (company → member → name, AC-70), or a
  // chip counts bids its own filter then drops.
  const base = supplierKey === "all" ? orderForView(allBids) : orderForView(allBids.filter((b) => bidSupplierKey(b) === supplierKey));
  const shown = base.filter(
    (b) =>
      (selectedItem === "all" || b.requestId === selectedItem) &&
      (fSource === "all" || sourceOf(b) === fSource) &&
      (!qualityActive || [...fqParts].every((p) => partMeets(b.quality, p))) &&
      (!(refineActive && fVerified) || b.verified) &&
      (!(refineActive && fKm) || (b.distanceKm != null && b.distanceKm <= 50)),
  );
  const fActive = (fSource !== "all" ? 1 : 0) + (qualityActive ? fqParts.size : 0) + (refineActive && fVerified ? 1 : 0) + (refineActive && fKm ? 1 : 0);
  const selectedCount = allBids.filter((b) => selected.has(b.id)).length;
  // Item picker: one entry per request line + its bid count (off-platform included via allBids).
  const itemList = group.items.map((it) => ({
    id: it.id,
    name: (ar ? it.item?.nameAr : it.item?.name) || it.displayId,
    img: it.item?.imageUrl ?? null,
    categoryId: it.item?.categoryId ?? null,
    qty: it.item?.qty ?? 1,
    count: allBids.filter((b) => b.requestId === it.id).length,
  }));
  const selItem = itemList.find((i) => i.id === selectedItem) ?? null;
  const shownSuppliers = new Set(shown.map(bidSupplierKey)).size;
  // Card width scales with how many bids there are: 1–2 grow to fill the row (no empty side margin);
  // 3+ take a fixed width so the third card peeks at the edge, hinting the horizontal scroll.
  const cardFlex = shown.length <= 2 ? "1 1 0" : "0 0 calc(44% - 8px)";
  // Toolbar chip styles (prototype bids-by-supplier).
  const supChip = (on: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0, padding: "10px 14px", borderRadius: 22, cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit", background: on ? "#1c3550" : "#fff", color: on ? "#fff" : "#1c3550", border: `1px solid ${on ? "#1c3550" : "#d4e0ec"}` });
  const chipCount = (on: boolean): CSSProperties => ({ fontSize: 11, fontWeight: 800, background: on ? "rgba(255,255,255,.18)" : "#eff4f9", color: on ? "#fff" : "#6b8fa8", padding: "1px 7px", borderRadius: 20 });
  const itemMenuRow = (on: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "start", padding: "9px 11px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit", background: on ? "#eff4f9" : "transparent", color: "#1c3550" });
  const menuCount: CSSProperties = { fontSize: 11, fontWeight: 800, color: "#6b8fa8", background: "#F0F4F9", padding: "1px 8px", borderRadius: 20 };

  return (
    <div>
      {/* toolbar — supplier tabs | item picker | filter icon (prototype bids-by-supplier) */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        {/* supplier tabs */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          <button onClick={() => setSupplierKey("all")} style={supChip(supplierKey === "all")}>
            {L("All suppliers", "كل المؤجّرين")}<span style={chipCount(supplierKey === "all")}>{allBids.length}</span>
          </button>
          {suppliers.map((s) => {
            const on = supplierKey === s.key;
            return (
              <button key={s.key} onClick={() => setSupplierKey(s.key)} style={supChip(on)}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: on ? "rgba(255,255,255,.2)" : "#1c3550", color: "#fff", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.name.charAt(0).toUpperCase()}</span>
                {s.name}
                {s.verified && <span className="material-icons-outlined" style={{ fontSize: 14, color: on ? "#7CE5A6" : "#1daf58" }}>verified</span>}
                <span style={chipCount(on)}>{s.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ width: 1, height: 34, background: "#D7DEE8", flexShrink: 0 }} />
        {/* item picker */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => { setItemMenuOpen((o) => !o); setFilterOpen(false); }} title={L("Filter by item", "تصفية حسب البند")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 11, border: "1.5px solid #1c3550", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, padding: 1 }}>
              {selItem
                ? <EquipImg src={selItem.img} categoryId={selItem.categoryId} name={selItem.name} box="" img="h-[26px] w-[26px] object-contain" iconSize={24} />
                : <span className="material-icons-outlined" style={{ fontSize: 20, color: "#1c3550" }}>apps</span>}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(255,255,255,.16)", color: "#FBBF6B", padding: "1px 7px", borderRadius: 20 }}>{selItem ? selItem.count : allBids.length}</span>
            <span className="material-icons-outlined" style={{ fontSize: 16, color: "#9DAFC6" }}>expand_more</span>
          </button>
          {itemMenuOpen && (
            <>
              <div onClick={() => setItemMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
              <div style={{ position: "absolute", zIndex: 30, top: "100%", insetInlineEnd: 0, marginTop: 6, background: "#fff", border: "1px solid #d4e0ec", borderRadius: 13, boxShadow: "0 16px 40px rgba(20,40,70,.20)", padding: 6, minWidth: 280, maxHeight: 360, overflowY: "auto" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", color: "#6b8fa8", padding: "6px 9px 7px" }}>{L("VIEWING ITEM", "البند المعروض")}</div>
                <button onClick={() => { setSelectedItem("all"); setItemMenuOpen(false); }} style={itemMenuRow(selectedItem === "all")}>
                  <span className="material-icons-outlined" style={{ fontSize: 18 }}>apps</span>
                  <span style={{ flex: 1 }}>{L("All items", "كل البنود")}</span>
                  <span style={menuCount}>{allBids.length}</span>
                </button>
                {itemList.map((m) => (
                  <button key={m.id} onClick={() => { setSelectedItem(m.id); setItemMenuOpen(false); }} style={itemMenuRow(selectedItem === m.id)}>
                    <EquipImg src={m.img} categoryId={m.categoryId} name={m.name} box="" img="h-4 w-4 object-contain" iconSize={18} />
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                    {m.qty > 1 && <span style={{ fontSize: 10, fontWeight: 800, color: "#d4780a", background: "#fff3e0", padding: "1px 6px", borderRadius: 20 }}>×{m.qty}</span>}
                    <span style={menuCount}>{m.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {/* filter icon */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => { setFilterOpen((o) => !o); setItemMenuOpen(false); }} title={L("Filter bids", "تصفية العروض")} style={{ position: "relative", width: 42, height: 42, borderRadius: 11, border: `1.5px solid ${fActive ? "#f79009" : "#d4e0ec"}`, background: fActive ? "#fff4e5" : "#fff", color: fActive ? "#f79009" : "#1c3550", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>filter_list</span>
            {fActive > 0 && <span style={{ position: "absolute", top: -6, insetInlineEnd: -6, fontSize: 10, fontWeight: 900, background: "#f79009", color: "#fff", minWidth: 17, height: 17, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{fActive}</span>}
          </button>
          {filterOpen && (
            <>
              <div className="filter-backdrop" onClick={() => setFilterOpen(false)} />
              <div className="filter-pop" style={{ insetInlineStart: "auto", insetInlineEnd: 0 }}>
                <div className="fp-h">{L("Bid source", "مصدر العرض")}</div>
                {([
                  ["all", L("All sources", "كل المصادر"), null, ""],
                  ["link", L("Off your request link", "من رابط طلبك"), "link", "var(--action)"],
                  ["platform", L("On platform", "على المنصة"), "verified", "var(--success)"],
                ] as const).map(([key, label, icon, color]) => (
                  <div key={key} className={`fp-opt${fSource === key ? " on" : ""}`} onClick={() => setFSource(key)}>
                    <span className="radio" />
                    {icon && <span className="material-icons-outlined fp-ic" style={{ color }}>{icon}</span>}
                    {label}
                    <span className="fp-n">{srcCount(key)}</span>
                  </div>
                ))}
                {/* Quality sub-filter — shared-link bids only; filter by the three quality dimensions. */}
                {fSource === "link" && (
                  <>
                    <div className="fp-div" />
                    <div className="fp-h">{L("Bid quality — show bids that…", "جودة العرض — أظهر العروض التي…")}</div>
                    {PART_META.map((p) => (
                      <div key={p.key} className={`fp-opt fp-check${fqParts.has(p.key) ? " on" : ""}`} onClick={() => toggleQPart(p.key)}>
                        <span className="box"><span className="material-icons-outlined">check</span></span>
                        <span className="material-icons-outlined fp-ic" style={{ color: "var(--action)" }}>{p.icon}</span>{L(p.en, p.ar)}
                        <span className="fp-n">{qPartCount(p.key)}</span>
                      </div>
                    ))}
                  </>
                )}
                {/* Refine (Verified · distance) — on-platform bids only; off-platform link bids carry no
                    verification/distance, so these don't apply to them. */}
                {fSource === "platform" && (
                  <>
                    <div className="fp-div" />
                    <div className="fp-h">{L("Refine", "تنقية")}</div>
                    <div className={`fp-opt fp-check${fVerified ? " on" : ""}`} onClick={() => setFVerified((v) => !v)}>
                      <span className="box"><span className="material-icons-outlined">check</span></span>
                      <span className="material-icons-outlined fp-ic" style={{ color: "var(--success)" }}>verified_user</span>{L("Verified suppliers only", "المؤجّرون الموثّقون فقط")}
                    </div>
                    <div className={`fp-opt fp-check${fKm ? " on" : ""}`} onClick={() => setFKm((v) => !v)}>
                      <span className="box"><span className="material-icons-outlined">check</span></span>
                      <span className="material-icons-outlined fp-ic" style={{ color: "var(--navy-mid)" }}>place</span>{L("Within 50 km of site", "ضمن ٥٠ كم من الموقع")}
                    </div>
                  </>
                )}
                <div className="fp-foot">
                  <button className="clr" onClick={() => { setFSource("all"); setFqParts(new Set()); setFVerified(false); setFKm(false); }}>{L("Clear all", "مسح الكل")}</button>
                  <button className="done" onClick={() => setFilterOpen(false)}>{L("Done", "تم")}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div data-select-ui style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 14px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2a4f72" }}>
          {selectMode
            ? L("Tap bids to compare or export · click away to cancel", "اضغط على العروض للمقارنة أو التصدير · انقر خارجًا للإلغاء")
            : `${shown.length} ${L("bids from", "عروض من")} ${shownSuppliers} ${L("suppliers", "مؤجّرين")}${selItem ? ` · ${selItem.name}` : ""}`}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* B4: clicking outside exits selection (see the mousedown effect) — no Cancel button. */}
          <button
            onClick={() => setSelectMode((m) => !m)}
            title={L("Pick bids to compare or export", "اختر عروضًا للمقارنة أو التصدير")}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 11, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: selectMode ? "#1c3550" : "#fff", color: selectMode ? "#fff" : "#1c3550", border: `1px solid ${selectMode ? "#1c3550" : "#d4e0ec"}` }}
          >
            <span className="material-icons-outlined" style={{ fontSize: 17 }}>compare_arrows</span>
            {selectMode ? L("Selecting", "جارٍ التحديد") : L("Compare / Export", "مقارنة / تصدير")}
          </button>
        </div>
      </div>

      {shown.length === 0 && (
        <div className="rempty" style={{ textAlign: "center", padding: "44px 20px" }}>
          <span className="material-icons-outlined" style={{ fontSize: 36, color: "#9AA7B8" }}>filter_alt_off</span>
          <div style={{ marginTop: 10, fontSize: 14.5, fontWeight: 800, color: "#1c3550" }}>{L("No bids match these filters", "لا توجد عروض مطابقة لعوامل التصفية")}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: "#6b8fa8" }}>{L("Adjust or clear the source / quality filters to see more.", "عدّل أو امسح عوامل تصفية المصدر / الجودة لعرض المزيد.")}</div>
          {fActive > 0 && <button onClick={() => { setFSource("all"); setFqParts(new Set()); setFVerified(false); setFKm(false); }} style={{ marginTop: 14, borderRadius: 10, border: "1px solid #d4e0ec", background: "#fff", color: "#1c3550", fontWeight: 800, fontSize: 13, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit" }}>{L("Clear filters", "مسح عوامل التصفية")}</button>}
        </div>
      )}
      <div className="bids-snap" data-select-ui>
      {shown.map((b) => {
        if (b.viaSharedLink) {
          // An off-platform bid carries no duration of its own (`link-bids.ts` sets `duration: null`), so
          // the period it's priced over comes from the request it was quoted against — the same pair the
          // on-platform branch below feeds `computeBidQuote`.
          const gi = group.items.find((it) => it.id === b.requestId);
          return (
            <SharedLinkBidCard
              key={b.id}
              bid={b}
              ar={ar}
              L={L}
              startDate={gi?.startDate ?? null}
              durationDays={gi?.durationDays ?? null}
              isSel={selected.has(b.id)}
              selectMode={selectMode}
              cardFlex={cardFlex}
              onToggleSelect={() => toggleSelect(b.id)}
              onViewSubmission={() => setSubmissionBid(b)}
              onNegotiate={NEGOTIATE_ENABLED ? () => setNegotiateBid(b) : undefined}
              itemLabel={ar ? b.itemLabelAr : b.itemLabel}
              itemImage={b.itemImage}
              categoryId={b.categoryId}
              quality={b.quality}
            />
          );
        }
        // A survey-reported winner (wonViaSurvey) that isn't ACCEPTED still reads as a decided "Awarded"
        // bid — app parity (the mobile card reflects both). ACCEPTED keeps its own "Accepted" pill.
        const wonSurvey = b.wonViaSurvey === true && b.status !== "ACCEPTED";
        const sp = wonSurvey ? { cls: "sp-accepted", dot: false, en: "Awarded", ar: "تمت الترسية" } : (SPILL[b.status] ?? SPILL.PENDING);
        const sc = wonSurvey ? { bg: "#e7f7ee", c: "#1daf58", dot: false } : ({
          PENDING: { bg: "#e6f2fb", c: "#1a7ec8", dot: true },
          OPEN_FOR_NEGOTIATION: { bg: "#fff3e0", c: "#d4780a", dot: true },
          COUNTER_OFFERED: { bg: "#fff3e0", c: "#d4780a", dot: true },
          ACCEPTED: { bg: "#e7f7ee", c: "#1daf58", dot: false },
          EXPIRED: { bg: "#eff4f9", c: "#6b8fa8", dot: false },
          WITHDRAWN: { bg: "#eff4f9", c: "#6b8fa8", dot: false },
        } as Record<string, { bg: string; c: string; dot: boolean }>)[b.status] ?? { bg: "#e6f2fb", c: "#1a7ec8", dot: true };
        const disabled = b.status === "EXPIRED" || b.status === "WITHDRAWN" || b.expired;
        const offered = b.unitsOffered || 1; // units this supplier is offering
        const needed = b.numberOfUnits || offered; // units the request asked for
        const cover = needed ? Math.min(100, Math.round((offered / needed) * 100)) : 0;
        const priceOpen = openPrices.has(b.id);
        const perUnit = !allUnitsIds.has(b.id); // default per-unit; a card is "all units" only if toggled
        const isSel = selected.has(b.id);
        // Card price — canonical quote: rate ÷ period-days × duration (weekly ÷7, monthly ÷26),
        // mob/demob × units, VAT 15%. The "all units" count is the LIVE deal-room count (agreedUnits →
        // currentRentalUnits → offered → requested), mirroring computeBidQuote so the group card matches
        // RequestBids + the deal room; the offered band above stays on unitsOffered. Per-unit toggle → 1.
        const liveUnits =
          (b.agreedUnits != null && b.agreedUnits > 0) ? b.agreedUnits
          : (b.currentRentalUnits != null && b.currentRentalUnits > 0) ? b.currentRentalUnits
          : (b.unitsOffered && b.unitsOffered > 0) ? b.unitsOffered
          : (b.numberOfUnits || 1);
        const u = priceOpen && perUnit ? 1 : liveUnits;
        const gi = group.items.find((it) => it.id === b.requestId);
        // startDate is what lets the rental drop its Fridays — without it the shared maths falls back
        // to the raw rate rather than a Friday-blind proration.
        const cq = computeBidQuote(b, { units: u, fallbackDays: gi?.durationDays ?? null, startDate: gi?.startDate ?? null });
        const grand = Math.round(cq.total);
        /* ── The headline is the RATE on a weekly or monthly bid (app parity, 2026-08-18) ──────────
           `headlineShowsRawRate`: a weekly or monthly bid headlines what the supplier quoted, so two
           of them compare on the same basis; the prorated total moves into the breakdown's rental
           row. A daily bid headlines its total, because there the rate and the basis are the same
           number and a rate headline would say nothing new.

           ~~The headline was the prorated total for every unit.~~ It was honest — the caption spelled
           out `rate/period · 26 working days/month × N billable days` — but it made two monthly bids
           compare on totals whose durations the renter had to read before the figures meant anything. */
        const headline = Math.round(headlineAmount(b.priceUnit, b.price ?? 0, cq.perUnit.rental));
        /* The rental TYPE, not a total — the headline now carries the rate, so "…total" would name the
           wrong number. Multi-unit suffixes "per unit", exactly as the app's `priceRateLabelPerUnit`
           does, because every figure on this card is per unit until the overall line at the foot. */
        const rentalTypeLabel = ((): string => {
          switch ((b.priceUnit ?? "PER_DAY").toUpperCase()) {
            case "PER_WEEK": return L("Weekly rental", "الإيجار الأسبوعي");
            case "PER_MONTH": return L("Monthly rental", "الإيجار الشهري");
            case "PER_JOB": return L("Job price", "سعر المهمة");
            default: return L("Daily rental", "الإيجار اليومي");
          }
        })();
        const headlineLabel = liveUnits > 1 ? L(`${rentalTypeLabel} per unit`, `${rentalTypeLabel} للوحدة`) : rentalTypeLabel;
        // The basis under the headline — «٢٦ يوم عمل/شهر». Weekly and monthly only; a daily rate has none.
        const headlineBasis = divisorNote(b.priceUnit, L);
        /* The rental ROW explains the headline, so it is dropped when there is nothing left to explain:
           an exact period on a single-unit bid means the headline already IS the total (app §8). */
        const showRentalRow = !(cq.rentalExact && liveUnits <= 1);
        const rentalRowLabel = cq.billableDays > 0
          ? L(`Rental · ${cq.billableDays} days`, `الإيجار · ${cq.billableDays} يومًا`)
          : L("Rental", "الإيجار");
        const isAccepted = (b.status ?? "").toUpperCase() === "ACCEPTED" || wonSurvey; // decided → accepted/awarded styling
        // B1: the card tally uses the SAME bucketing as the Terms modal (bucketBidTerms) so the card's
        // "Conflict N · Matched N" always equals what the modal lists when opened.
        const termCounts = bucketBidTerms(b.terms, b.negotiableTerms).counts;
        // EXPIRED / WITHDRAWN only. An ACCEPTED bid is decided, not dead: its checks still describe
        // what was agreed, and greying them would hide the record of the deal the renter took.
        const bidIsDead = ["EXPIRED", "WITHDRAWN"].includes((b.status ?? "").toUpperCase());
        // The renter reads every card, so `viewerRole` is always "rentee" here. `hasOpenAsk` is
        // false for the same reason the app passes false: his asks live in the deal room, not on
        // this card, so nothing competes with the delta for the button.
        // What the counts owe the reader. `liveUnits` is the PRICED count — the same one the money
        // below is built on — and `unitsOffered` is what the bid claims; the machines behind it are
        // counted distinctly, never as the padded entry list, because the padding repeats a machine.
        const countNotes = unitCountNotes({
          priced: liveUnits,
          offered: offered,
          machinesNamed: distinctMachinesOffered(b.offeredUnitsDetail),
        });
        const counterDelta = bidCounterDelta({
          originalPrice: b.openingPrice,
          currentPrice: b.price,
          lastCounterBy: b.lastCounterBy,
          viewerRole: "rentee",
          status: b.status,
        });
        const rowSep = { borderTop: "1px solid #EFF2F6" } as const;
        const iconBox = { width: 40, height: 40, borderRadius: 11, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const;
        const blueLink = { background: "none", border: "none", color: "#1a7ec8", fontWeight: 800, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" } as const;
        // Top banner = the bid's SOURCE only (2 values, app parity): on-platform bids are always
        // "Via Moedatech app" in BLUE; off-platform shared-link bids carry the ORANGE banner on their
        // own card (SharedLinkBidCard). The negotiation STATUS lives in the right badge + the CTA suffix.
        const banner = { icon: "verified_user", text: L("Via Moedatech app", "عبر تطبيق معداتك"), bg: "#e6f2fb", c: "#1a7ec8", bd: "#cfe6f7" };
        return (
          <div
            key={b.id}
            onClick={selectMode ? () => toggleSelect(b.id) : undefined}
            style={{ flex: cardFlex, minWidth: 0, scrollSnapAlign: "start", alignSelf: "flex-start", display: "flex", flexDirection: "column", position: "relative", background: isSel ? "#fff8f0" : "#fff", border: `1px solid ${isSel ? "#f79009" : "#d4e0ec"}`, borderRadius: 18, overflow: "hidden", boxShadow: isSel ? "inset 0 0 0 2px #f79009" : "0 1px 2px rgba(20,40,70,.04)", cursor: selectMode ? "pointer" : "default" }}
          >
            <div style={{ height: 4, background: banner.c }} />
            {banner && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: banner.bg, borderBottom: `1px solid ${banner.bd}`, fontSize: 11.5, fontWeight: 800, color: banner.c }}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>{banner.icon}</span>{banner.text}
              </div>
            )}
            {selectMode && (
              <div style={{ position: "absolute", top: 12, insetInlineEnd: 12, width: 26, height: 26, borderRadius: "50%", background: isSel ? "#f79009" : "#fff", border: `2px solid ${isSel ? "#f79009" : "#d4e0ec"}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(20,40,70,.18)", zIndex: 5, pointerEvents: "none" }}>
                {isSel && <span className="material-icons-outlined" style={{ fontSize: 16 }}>check</span>}
              </div>
            )}

            {/* header */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "16px 16px 12px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <EquipImg src={b.itemImage} categoryId={b.categoryId} name={ar ? b.itemLabelAr : b.itemLabel} box="" img="h-10 w-10 object-contain" iconSize={36} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                  <span style={{ flex: "0 1 auto", minWidth: 0, fontSize: 13.5, fontWeight: 900, color: "#1c3550", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }} title={ar ? b.itemLabelAr : b.itemLabel}>{ar ? b.itemLabelAr : b.itemLabel}</span>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#d4780a", background: "#fff3e0", padding: "1px 8px", borderRadius: 20 }}>×{offered}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#1c3550", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(b.supplierName || "S").charAt(0).toUpperCase()}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550" }}>{b.supplierName}</span>
                  {b.verified && <span className="material-icons-outlined" style={{ fontSize: 16, color: "#1daf58" }}>verified</span>}
                  {/* ── The certificate pills are gone here too (owner, 2026-08-19) ────────────────
                      Same ruling as the per-request card: *"all these details are in the equipment
                      details."* They stated `requiredCerts` against the SUPPLIER's `heldCertCodes`,
                      and the certificate that decides anything is the one the MACHINE carries — which
                      the equipment list and each machine's detail panel state, read against the
                      request. Removing it from one card and not the other would have left the same
                      offer making a claim on `/requests` that it does not make one screen deeper. */}
                </div>
              </div>
              {!selectMode && (
                <span style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, padding: "5px 11px", borderRadius: 20, background: sc.bg, color: sc.c, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {sc.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.c }} />}{ar ? sp.ar : sp.en}
                </span>
              )}
            </div>

            {/* fulfillment band */}
            <div style={{ margin: "0 16px 14px", padding: "10px 14px", borderRadius: 12, background: "#fff4e5", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1c3550", whiteSpace: "nowrap" }}>{L(`Covers ${offered} of ${needed} units`, `يغطّي ${offered} من ${needed} وحدات`)}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 6, background: "rgba(247,144,9,.18)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 6, background: "#f79009", width: `${cover}%` }} />
              </div>
              <span style={{ fontSize: 12, color: "#6b8fa8", fontWeight: 700, whiteSpace: "nowrap" }}>{[b.rating != null ? `★ ${b.rating.toFixed(1)}` : "", b.distanceKm != null ? `${Math.round(b.distanceKm)} km` : ""].filter(Boolean).join(" · ")}</span>
            </div>

            {/* ── What the counts owe the reader (app parity: `unit_count_notes.dart`) ────────────
                A bid carries three counts and only one of them prices anything. The band above states
                the OFFER; these two lines state the two ways the priced count can disagree with it —
                and the machines actually behind it. Silent when they agree, which is most bids. */}
            {!countNotes.isEmpty && (
              <div style={{ margin: "-6px 16px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                {countNotes.hasPricedNote && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#6b8fa8" }}>
                    {countNotes.relation === "below"
                      ? L(`Priced on ${countNotes.priced} of the ${countNotes.offered} offered`, `مسعّر على ${countNotes.priced} من ${countNotes.offered} معروضة`)
                      : L(`Countered at ${countNotes.priced} — ${countNotes.priced - countNotes.offered} above the ${countNotes.offered} offered`, `عرض مضاد على ${countNotes.priced} — ${countNotes.priced - countNotes.offered} فوق ${countNotes.offered} المعروضة`)}
                  </span>
                )}
                {countNotes.hasClaimedNote && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#d4780a" }}>
                    {L(`${countNotes.claimedUnits} of the priced units have no registered machine`, `${countNotes.claimedUnits} من الوحدات المسعّرة بلا معدّة مسجّلة`)}
                  </span>
                )}
              </div>
            )}

            {/* ── BC-2 · the checks row (app parity) ────────────────────────────────────────────────
                ~~An Equipment row and a Terms row.~~ Two rows, each an icon, a word and a link, and
                between them one line of tallies — «Conflict 2 · Pending 3 · Matched 0» — that a
                renter had to read word by word to learn whether the offer needed him. The app
                collapsed the same four sections into one row of two rings; this follows it.

                Both entry points survive: the equipment half still links to the verification map,
                the terms half still opens the terms modal. The collapse was about crowding, not
                about taking routes away.

                Every number is `bid-card-checks.ts`. `hasNews` is deliberately not passed — the
                app plumbs it and does not pass it either, and inventing a web-only reading of "the
                supplier answered" would put a dot on this card that the phone never shows. */}
            <BidCardChecks
              L={L}
              equipment={equipmentCheckOf(computeBidReadiness(b)?.units ?? [], { dead: bidIsDead })}
              terms={termsCheck({ matched: termCounts.matched, conflict: termCounts.conflict, pending: termCounts.pending, dead: bidIsDead })}
              equipmentAction={
                !selectMode && mayOpenEquipmentSurface(b) ? (
                  <Link href={`/bids/${encodeURIComponent(b.id)}/equipment`} style={{ ...blueLink, textDecoration: "none" }}>
                    {t.bidMap.verifyEntry} ›
                  </Link>
                ) : null
              }
              termsAction={!selectMode ? <button onClick={() => setTermsBid(b)} style={blueLink}>{L("View", "عرض")} ›</button> : null}
            />

            {/* Price row — headline is the PER-UNIT rental total (mobile parity); rate shown in the caption */}
            <div style={{ ...rowSep, padding: "13px 16px", ...(isAccepted ? { background: "#e7f7ee" } : {}) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ ...iconBox, background: "#fff4e5" }}><span className="material-icons-outlined" style={{ fontSize: 20, color: "#f79009" }}>payments</span></div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{headlineLabel}</span>
                  {headlineBasis && <div style={{ fontSize: 11, fontWeight: 600, color: "#6b8fa8", marginTop: 1 }}>{headlineBasis}</div>}
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 17, fontWeight: 900, color: "#f79009" }}>{nf(headline)} {L("SAR", "ر.س")}</span>
                {isAccepted && <span className="material-icons-outlined" style={{ fontSize: 18, color: "#1daf58" }} title={L("Accepted", "مقبول")}>check_circle</span>}
                {!selectMode && (
                  <button onClick={() => { setOpenPrices((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; }); setAllUnitsIds((s) => { const n = new Set(s); n.delete(b.id); return n; }); }} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #d4e0ec", background: "#F7FAFC", color: "#6b8fa8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>{priceOpen ? "expand_less" : "expand_more"}</span>
                  </button>
                )}
              </div>
              {priceOpen && !selectMode && (
                <div style={{ marginTop: 12 }}>
                  {/* ~~A per-unit / all-units toggle.~~ Gone (app parity, 2026-08-18): every row here is
                      PER UNIT and a multi-unit offer states the all-units figure once, in the total box
                      below. The toggle made the renter switch bases to see both, and a figure whose
                      basis depends on a control he last touched a minute ago is a figure he has to
                      check before he can trust it. */}
                  {([
                    ...(showRentalRow ? [[rentalRowLabel, cq.perUnit.rental, null]] as [string, number, string | null][] : []),
                    ...legRow(L("Delivery to site", "النقل إلى الموقع"), cq.perUnit.mob, b.mobExcluded, b.mobPrice, b.mobLeadTime, L),
                    ...legRow(L("Return from site", "الإرجاع من الموقع"), cq.perUnit.demob, b.demobExcluded, b.demobPrice, b.demobLeadTime, L),
                    [L("Subtotal before VAT", "المجموع قبل الضريبة"), cq.perUnit.subtotal, null],
                    [L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"), cq.perUnit.vat, null],
                  ] as [string, number | string, string | null][]).map(([lab, val, note], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #F2F5F8" }}>
                      <span style={{ fontSize: 13.5, color: "#2a4f72", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>{lab}{note ? <span style={{ fontSize: 11, color: "#6b8fa8", background: "#eff4f9", padding: "1px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>{note}</span> : null}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: typeof val === "string" ? "#6b8fa8" : "#1c3550", fontVariantNumeric: "tabular-nums" }}>{typeof val === "string" ? val : nf(val)}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "#FAFCFE", border: "1.5px solid #1c3550" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Grand total", "الإجمالي الكلي")}</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: "#1c3550" }}>{nf(cq.perUnit.total)} <span style={{ color: "#f79009" }}>{L("SAR", "ر.س")}</span></span>
                    </div>
                    {/* Multi-unit only, in the SAME box: the true all-units figure. Not the per-unit
                        total times the count — each leg carries its own unit count, and an excluded
                        leg contributes nothing however much price is stored against it. */}
                    {liveUnits > 1 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #E4EDF5" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#f79009" }}>{L("Overall total", "الإجمالي الكلي للوحدات")} <span style={{ color: "#6b8fa8", fontWeight: 700 }}>· {liveUnits}</span></span>
                        <span style={{ fontSize: 16, fontWeight: 900, color: "#f79009" }}>{nf(grand)} {L("SAR", "ر.س")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* supplier note */}
            {b.note && (
              <div style={{ ...rowSep, display: "flex", gap: 8, padding: "12px 16px", alignItems: "flex-start" }}>
                <span style={{ fontSize: 15 }}>💬</span>
                <span style={{ fontSize: 13, color: "#6b8fa8", fontWeight: 600, lineHeight: 1.5 }}>{b.note}</span>
              </div>
            )}

            {/* CTA */}
            {!selectMode && (
              <div style={{ marginTop: "auto", padding: "12px 16px 16px" }}>
                <button disabled={disabled || busyId === b.id} onClick={() => startNegotiation(b)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px", borderRadius: 14, border: "none", background: disabled ? "#9AA7B8" : "#1c3550", color: "#fff", fontWeight: 800, fontSize: 15, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: busyId === b.id ? 0.7 : 1 }}>
                  <span className="material-icons-outlined" style={{ fontSize: 18 }}>{b.status === "ACCEPTED" ? "receipt_long" : "forum"}</span>
                  {/* ── The CTA names the MOVE once a number has moved (app parity) ──────────────
                      With nothing moved the button names the lifecycle step, as it always has. Once
                      someone has countered it names the counter instead — whose it was, and from
                      what to what — because that is the fact a renter is deciding on, and it was
                      previously reachable only by opening the room.

                      `ctaShowsCounterDelta` is asked rather than `delta != null` being tested here:
                      the precedence between a price move and an open ask is a rule, and it lives in
                      the model where the app keeps it. */}
                  {ctaShowsCounterDelta({ hasOpenAsk: false, delta: counterDelta }) && counterDelta ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span>{counterDelta.side === "mine" ? L("Your counter", "عرضك") : L("Their counter", "عرضهم")}</span>
                      <span dir="ltr" style={{ textDecoration: "line-through", opacity: 0.6, fontWeight: 700 }}>{nf(counterDelta.from)}</span>
                      <span aria-hidden="true">→</span>
                      <span dir="ltr">{nf(counterDelta.to)}</span>
                    </span>
                  ) : (
                    <>{pillLabel(b.status, L)}{offerSuffix(b.uiState, L) ? ` · ${offerSuffix(b.uiState, L)}` : ""}</>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })}
      </div>

      {selectMode && selectedCount > 0 && (
        <div className="qbar" data-select-ui>
          <span className="qn">{selectedCount} {L("selected", "محدّد")}</span>
          {selectedCount < shown.length && <span className="qclear" onClick={() => setSelected(new Set(shown.map((b) => b.id)))}>{L("Select all", "تحديد الكل")}</span>}
          <span className="qclear" onClick={() => setSelected(new Set())}>{L("Clear", "مسح")}</span>
          {/* web-app/007 — Compare the selected bids side by side (works with a single bid too). */}
          <button
            className="qdl"
            disabled={selectedCount < 1}
            style={{ background: "var(--navy)", opacity: selectedCount < 1 ? 0.5 : 1 }}
            title={L("Compare side by side", "قارن جنبًا إلى جنب")}
            onClick={goCompare}
          >
            <span className="material-icons-outlined">compare_arrows</span> {L("Compare", "قارن")}
          </button>
          <button
            className="qdl"
            onClick={() => {
              // Snapshot the selected bids NOW (before a modal can clear the selection) so the quotation
              // covers only these suppliers — not the whole group.
              setDlOnly([...(bids ?? []), ...subCards].filter((b) => selected.has(b.id)));
              if (verified) setLangPick(true);
              else setQuoteGate(true);
            }}
          >
            <span className="material-icons-outlined">download</span> {L("Download quotations", "تنزيل عروض الأسعار")}
          </button>
        </div>
      )}

      {/* Quotation language chooser — one PDF in the chosen language (no 2-in-1). */}
      {langPick && (
        <div className="tm-overlay" dir={ar ? "rtl" : "ltr"} onClick={() => setLangPick(false)}>
          <div className="tm-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="tm-head">
              <h3>{L("Quotation language", "لغة عرض السعر")}</h3>
              <button type="button" onClick={() => setLangPick(false)} aria-label={L("Close", "إغلاق")}>
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
            <div className="tm-body">
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
                {L("Choose the language for the generated PDF.", "اختر لغة ملف عرض السعر.")}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => { setLangPick(false); downloadQuotation(false, dlOnly ?? undefined); }}>
                  English
                </button>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => { setLangPick(false); downloadQuotation(true, dlOnly ?? undefined); }}>
                  العربية
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terms modal (prototype "Terms — <supplier>") — per-class term status + Negotiate terms */}
      {termsBid && (
        <BidTermsModal
          supplier={termsBid.supplierName}
          terms={termsBid.terms}
          negotiable={termsBid.negotiableTerms}
          ar={ar}
          L={L}
          busy={busyId === termsBid.id}
          onNegotiate={() => { const b = termsBid; setTermsBid(null); startNegotiation(b); }}
          onClose={() => setTermsBid(null)}
        />
      )}


      {/* Issue-quotation gate for an unverified renter (company name vs personal name). */}
      {quoteGate && (
        <QuotationVerifyGate
          ar={ar}
          L={L}
          onClose={() => setQuoteGate(false)}
          onVerify={() => { setQuoteGate(false); router.push("/verify"); }}
          onContinue={() => { setQuoteGate(false); setLangPick(true); }}
        />
      )}

      {/* web-app/006 — read-only viewer of an off-platform shared-link submission (real answers) */}
      {submissionBid && (
        <SharedBidSubmissionModal
          bid={submissionBid}
          submission={submissions.find((s) => s.id === submissionBid.submissionKey) ?? null}
          focusItemId={submissionBid.requestItemId}
          ar={ar}
          L={L}
          onClose={() => setSubmissionBid(null)}
          onDownloadQuotation={() => downloadQuotation(ar, [submissionBid])}
          onNegotiate={NEGOTIATE_ENABLED ? () => { const b = submissionBid; setSubmissionBid(null); setNegotiateBid(b); } : undefined}
        />
      )}

      {/* web-app/006 — deal-room-style negotiate relay for an off-platform shared-link bid */}
      {NEGOTIATE_ENABLED && negotiateBid && (
        <SharedBidNegotiateRoom
          bid={negotiateBid}
          submission={submissions.find((s) => s.id === negotiateBid.submissionKey) ?? null}
          itemLabel={ar ? negotiateBid.itemLabelAr : negotiateBid.itemLabel}
          ar={ar}
          L={L}
          onClose={() => setNegotiateBid(null)}
          onViewSubmission={() => { const b = negotiateBid; setNegotiateBid(null); setSubmissionBid(b); }}
        />
      )}
    </div>
  );
}
