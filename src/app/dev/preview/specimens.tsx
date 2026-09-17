"use client";

/**
 * **The specimens** — one named, self-contained render per surface, on invented data.
 *
 * They exist so a UI change can be SEEN without a session. The renter surfaces this app is mostly
 * made of sit behind auth and behind a backend (`/bids/:id/equipment` needs a bid, a fleet and a
 * deal room), so an agent changing the yard card or the request card had no way to look at the
 * result: every batch ended "not verified visually" and the owner had to go and check.
 *
 * ── Rules for a specimen ────────────────────────────────────────────────────────────────────────
 *  1. **It renders the real component**, imported from `src/components`. A copy of the markup would
 *     be a picture of a different card.
 *  2. **Its data is a literal in this file.** No fetch, no session, no store — the page must draw
 *     the same thing on a laptop with no `.env` as it does in CI.
 *  3. **It fixes only what the component needs.** A specimen that filled in every optional prop
 *     would stop showing what the absent ones look like, which is where the layout bugs live.
 *  4. **It is not a test.** Nothing here asserts; `tests/e2e/ui-shots.spec.ts` photographs these and
 *     the pictures are read by a human (or by an agent reporting a batch).
 *
 * Add one whenever you change a surface that has none — the id is what `?s=` takes, and
 * `docs/ui-change-playbooks.md` names the specimen beside each surface.
 */

import { NoCompanyCard } from "@/components/company/CompanyHub";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import { GuestWall, GuestDashboardPreview, GuestRequestsPreview } from "@/components/common/GuestWall";
import { ProcessingView } from "@/components/screens/Processing";
import { Mansour } from "@/components/Mansour";
import { CompareMatrix } from "@/components/workspace/CompareMatrix";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { RequestCard } from "@/components/map/RequestCard";
import { PriceFooter } from "@/components/map/PriceFooter";
import { EquipmentDetail } from "@/components/map/panel/EquipmentDetail";
import { YardExplainDialog } from "@/components/map/YardExplainDialog";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { draftSubject, requestCardView, type RequestCardCtx } from "@/lib/contract/request-card";
import { composeDocumentRequest, composeShortfallRequest, type RenteeRequestDraft } from "@/lib/contract/rentee-request";
import type { BidCard, TermRow } from "@/lib/contract/bids";
import type { WorkspaceBid } from "@/lib/contract/workspace";
import { DashboardTabs } from "@/components/home/HomeHub";
import type { ReactNode } from "react";

const L = (en: string, ar: string) => (typeof document !== "undefined" && document.documentElement.lang === "ar" ? ar : en);

/** One offered machine. `locationSource` is what `unitAvailability` reads, so it is the knob that
 *  decides whether the yard card is red, amber-clocked or green. */
const machine = (locationSource: string): FleetMachine =>
  mapFleet([
    {
      equipmentId: "eq-1",
      manufacturer: "Caterpillar",
      modelName: "320D",
      year: 2022,
      locationSource,
      distanceKm: 12.4,
      yardName: "Al Sahafah yard",
      photoKeys: [],
      documentKeys: [{ type: "tuv_cert", key: "d0", url: "", verifyStatus: null, expiryDate: null }],
      inBid: true,
    },
  ])[0];

const cardCtx = (over: Partial<RequestCardCtx> = {}): RequestCardCtx => ({
  L,
  machine: () => null,
  reply: () => null,
  ...over,
});

/** Enough of a bid for the price footer: a rate, its unit, and a settled term tally. */
const bid = {
  id: "bid-1",
  supplierName: "Al Ghadeer Company",
  price: { amount: 250, unit: "PER_DAY" },
  priceAmount: 250,
  priceUnit: "PER_DAY",
  numberOfUnits: 1,
  unitsOffered: 1,
  terms: [],
} as unknown as BidCard;

export interface Specimen {
  id: string;
  /** The pin this specimen photographs, so a note quoting a number finds its picture. */
  pin: string;
  label: string;
  /** A dark slab (the price footer) is unreadable on a white page. */
  ground?: "light" | "dark";
  render: () => ReactNode;
}


/**
 * The browse directory, on invented rows.
 *
 * ⚠️ **This one bends rule 2, and says so.** `BrowseSurface` takes no data props — it fetches its
 * cities, its taxonomy and its stores itself — so the only way to render it here without a backend
 * is to answer those three calls locally. The stub is installed in THIS component's render body,
 * which runs before the child's effects, and it is scoped to the three paths the surface asks for;
 * anything else falls through to the real `fetch`. Still no network, still the same picture on a
 * laptop with no `.env`, which is what the rule protects.
 *
 * Giving the surface data props instead would be a refactor of a live screen to suit a preview page.
 */
function BrowseSpecimen() {
  // ⚠️ The WHOLE `StoreCard` shape, `categories` and `matched` included — the card reads
  // `categories.length`, so a fixture missing it throws a client-side exception and the specimen
  // renders nothing at all rather than rendering wrong. Learned here, 2026-09-16.
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: `s${i + 1}`,
    supplierId: `u${i + 1}`,
    name: L(`Al Faisal Heavy Equipment ${i + 1}`, `الفيصل للمعدات ${i + 1}`),
    logoUrl: null,
    isVerified: i % 3 === 0,
    activeEquipmentCount: 4 + i,
    city: L(i % 2 ? "Jeddah" : "Riyadh", i % 2 ? "جدة" : "الرياض"),
    categories: [
      { id: "c1", name: "Earthmoving", nameAr: "الحفر" },
      { id: "c2", name: "Lifting", nameAr: "الرفع" },
      { id: "c3", name: "Concrete", nameAr: "الخرسانة" },
    ].slice(0, (i % 3) + 1),
    matched: [],
  }));
  const cats = [
    { id: "c1", name: "Earthmoving", nameAr: "الحفر", children: [] },
    { id: "c2", name: "Lifting", nameAr: "الرفع", children: [] },
    { id: "c3", name: "Access platforms", nameAr: "منصات الوصول", children: [] },
    { id: "c4", name: "Concrete", nameAr: "الخرسانة", children: [] },
    { id: "c5", name: "Compaction", nameAr: "الدمك", children: [] },
    { id: "c6", name: "Power & light", nameAr: "الطاقة", children: [] },
    { id: "c7", name: "Trucks", nameAr: "الشاحنات", children: [] },
  ];
  const cities = [
    { name: "Riyadh", nameAr: "الرياض" },
    { name: "Jeddah", nameAr: "جدة" },
    { name: "Dammam", nameAr: "الدمام" },
  ];
  if (typeof window !== "undefined" && !(window as unknown as { __browseStub?: boolean }).__browseStub) {
    (window as unknown as { __browseStub?: boolean }).__browseStub = true;
    const real = window.fetch.bind(window);
    const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      // ⚠️ The KEYS are the ones each reader actually looks for: the cities route is parsed loosely
      // (any array-valued key), the taxonomy route is read as `.taxonomy`, the directory as `.stores`.
      // Get one wrong and the specimen draws an empty control rather than failing.
      if (url.includes("/api/master-data/cities")) return ok({ cities });
      if (url.includes("/api/stores/taxonomy")) return ok({ taxonomy: cats });
      if (url.includes("/api/stores")) return ok({ stores: rows });
      return real(input as RequestInfo, init);
    }) as typeof window.fetch;
  }
  return <BrowseSurface title={L("Most popular suppliers", "أكثر المورّدين شهرة")} />;
}

/* ══ The comparison table ════════════════════════════════════════════════════════════════════════
   Added 2026-09-16, because this surface has produced FOUR layout faults and not one of them could
   be seen without a signed-in renter holding bids: the phantom vertical scrollbar (twice), the
   terms strip drawing through the equipment rail, and the strip ending short of its own container.
   jsdom lays out nothing, so every one of those was found on a screenshot of production.

   ⚠️ Six bids and nine terms on purpose - that is the shape the faults appear at. A two-bid, two-term
   fixture fits any width and proves nothing. */
const cmTerm = (key: string, en: string, ar: string, value: string, extra?: Partial<TermRow>): TermRow => ({
  key, labelEn: en, labelAr: ar, state: "matched", value, ...extra,
});

const cmBid = (
  id: string,
  supplierName: string,
  price: number,
  over: Partial<BidCard> = {},
): WorkspaceBid =>
  ({
    card: {
      id, status: "PENDING", supplierId: null, supplierCompanyId: null, supplierName,
      verified: false, rating: null, distanceKm: null, submittedAt: null, validUntil: null,
      price, mobPrice: 4200, demobPrice: 4200, priceUnit: "PER_MONTH", duration: null,
      numberOfUnits: 1, unitsOffered: 1, openingPrice: null, lastCounterBy: null,
      terms: {
        equipment: [
          cmTerm("year", "Equipment year", "سنة الصنع", "2021", { renteeValue: "2019" }),
          cmTerm("equipment_cert", "Certificate", "الشهادة", "TUV", { renteeValue: "TUV" }),
          cmTerm("fuel", "Fuel type", "نوع الوقود", "Diesel"),
        ],
        contract: [
          cmTerm("operator_included", "Operator", "المشغّل", "Included", { renteeValue: "Included" }),
          cmTerm("payment_terms", "Payment", "الدفع", "net_30", { renteeValue: "net_30" }),
          cmTerm("fat_food", "Operator food", "طعام المشغّل", "supplier", { renteeValue: "supplier" }),
          cmTerm("fat_accommodation", "Operator accommodation and transport", "إقامة ونقل المشغّل", "supplier", { renteeValue: "rentee" }),
          cmTerm("fuel_responsibility", "Fuel", "الوقود", "supplier", { renteeValue: "supplier" }),
          cmTerm("night_shift", "Night shift", "الوردية الليلية", "Available"),
        ],
        supplier: [],
      },
      ...over,
    },
  }) as unknown as WorkspaceBid;

/** His own screenshot: six offers, two of them the same firm twice. */
const cmRows: WorkspaceBid[] = [
  cmBid("b1", "Nesma Heavy Equipment Co.", 28900),
  cmBid("b2", "Nesma Heavy Equipment Co.", 28900),
  cmBid("b3", "Al-Faisal Contracting Est.", 30000),
  cmBid("b4", "Al-Faisal Contracting Est.", 36500, { mobPrice: 0, demobPrice: 3500 }),
  cmBid("b5", "Al Jazira Equipment Rental", 33500),
  cmBid("b6", "Al Jazira Equipment Rental", 33500),
];

export const SPECIMENS: Specimen[] = [
  {
    id: "compare-matrix",
    pin: "24",
    label: "Comparison table - six offers, nine terms",
    render: () => (
      <CompareMatrix
        bids={cmRows}
        durationDays={90}
        startDate={"2026-10-12"}
        mobByRentee={false}
        demobByRentee={false}
        submissions={{}}
        benched={new Set()}
        onBench={() => {}}
        ranking={null}
      />
    ),
  },
  {
    id: "yard-card-unconfirmed",
    pin: "52.3",
    label: "Equipment detail — yard card, not confirmed",
    render: () => (
      <div style={{ width: 392 }}>
        <EquipmentDetail machine={machine("listing_yard")} request={{}} ar={false} L={L} onBack={() => {}} onYardPress={() => {}} />
      </div>
    ),
  },
  {
    id: "yard-card-confirmed",
    pin: "52.3",
    label: "Equipment detail — yard card, confirmed",
    render: () => (
      <div style={{ width: 392 }}>
        <EquipmentDetail machine={machine("unit_yard")} request={{}} ar={false} L={L} onBack={() => {}} onYardPress={() => {}} />
      </div>
    ),
  },
  {
    id: "yard-explain",
    pin: "50",
    label: "Yard explainer modal",
    render: () => (
      <YardExplainDialog state={{ machine: machine("listing_yard"), asked: false }} request={{}} onClose={() => {}} onAsk={() => {}} />
    ),
  },
  {
    id: "request-card-company",
    pin: "49",
    label: "Request card — company ask, staged",
    render: () => (
      <div style={{ width: 520 }}>
        <RequestCard
          view={requestCardView(
            draftSubject(composeShortfallRequest()),
            cardCtx({ companyName: "Al Ghadeer Company", typeWord: "Crawler excavator 20 ton" }),
            { draft: true },
          )}
          draft
          cancelLabel="Cancel"
          confirmLabel="Send the request"
        />
      </div>
    ),
  },
  {
    id: "request-card-document",
    pin: "49",
    label: "Request card — document ask, staged",
    render: () => (
      <div style={{ width: 520 }}>
        <RequestCard
          view={requestCardView(
            draftSubject(composeDocumentRequest("eq-1", ["tuv_cert"]) as RenteeRequestDraft),
            cardCtx({ docLabel: () => "TÜV certificate" }),
            { draft: true },
          )}
          draft
          cancelLabel="Cancel"
          confirmLabel="Send the request"
        />
      </div>
    ),
  },
  {
    /* The no-company state of the profile's company block: create your own, or join one. Both
       routes in ONE card (owner, 2026-09-12) — the pair used to be a full-width banner up the page
       and this card down it. */
    id: "company-none",
    pin: "—",
    label: "Company — neither created nor joined",
    render: () => (
      <div style={{ width: 520 }}>
        <NoCompanyCard busy={false} onCreate={() => {}} onJoin={() => {}} onError={() => {}} onAttempt={() => {}} />
      </div>
    ),
  },
  {
    /* The same card with NO create route — what a renter sees where the page cannot offer to make
       him one, and the shape this card had before both routes met in it. */
    id: "company-join-only",
    pin: "—",
    label: "Company — join only",
    render: () => (
      <div style={{ width: 520 }}>
        <NoCompanyCard busy={false} onJoin={() => {}} onError={() => {}} onAttempt={() => {}} />
      </div>
    ),
  },
  {
    /* What a signed-out visitor meets on `/requests`. The point of the picture is the BACKDROP: the
       card in front of it has never been in doubt, and the owner's report on 2026-09-12 was that the
       page behind the glass read as blank. */
    id: "guest-wall-requests",
    pin: "—",
    label: "Guest wall — requests",
    render: () => (
      <div style={{ width: 1100 }} className="px-6 py-4">
        <GuestWall
          title={L("Your requests", "طلباتك")}
          body={L("Every request you send, and the offers that come back.", "كل طلب ترسله، والعروض التي تعود إليك")}
          preview={<GuestRequestsPreview />}
        />
      </div>
    ),
  },
  {
    /* The same wall on the dashboard, whose backdrop was enriched in the same pass and under the
       same rule: furniture, never content. */
    id: "guest-wall-dashboard",
    pin: "—",
    label: "Guest wall — dashboard",
    render: () => (
      <div style={{ width: 1100 }} className="px-6 py-4">
        <GuestWall
          title={L("Your dashboard", "لوحتك")}
          body={L("Your requests, the offers on them, your sites and your suppliers.", "طلباتك والعروض عليها ومواقعك ومورّدوك")}
          preview={<GuestDashboardPreview />}
        />
      </div>
    ),
  },
  {
    /* The agent at work, before it has matched anything: the catalogue is flicked through, a drawing
       every 380ms, with NOTHING named - naming one would claim a match that has not been made. The
       screen lives for a few seconds inside a flow that needs a session, a project and a live agent,
       so it could not be looked at while it was being changed, which is what these exist for. */
    id: "processing-reading",
    pin: "24",
    label: "Processing — reading",
    render: () => (
      <ProcessingView
        imageUrl="https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com/default/equipment-taxonomy/spider-crane.png"
        title={L("Reading your request", "نقرأ طلبك")}
        caption={null}
      />
    ),
  },
  {
    /* The same screen once the answer has landed: the catalogue's own DRAWING of the machine the
       agent matched, and its catalogue name. The URL is a real taxonomy icon off
       `/api/stores/taxonomy`, which is where these come from - see `taxonomy-icons.ts` for why it is
       that tree and not the agents one. */
    id: "processing-matched",
    pin: "24",
    label: "Processing — matched",
    render: () => (
      <ProcessingView
        found
        imageUrl="https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com/default/equipment-taxonomy/scissor-lift.png"
        title={L("Scissor lift 12 m", "منصة مقصية 12 م")}
        caption={L("Matched from our catalogue", "مطابَق من كتالوجنا")}
      />
    ),
  },
  {
    /* The agent himself, at the three sizes this app uses him at and in each of his states. He is
       ANIMATED - the idle gaze, the blink, the sway - so a still picture of this specimen proves
       only that he draws; watching it is what proves he is alive. */
    id: "mansour",
    pin: "—",
    label: "Mansour — the agent",
    render: () => (
      <div className="flex items-end gap-8 p-6">
        <span className="flex flex-col items-center gap-2">
          <Mansour size={56} state="live" />
          <span className="text-label text-muted">56 · live</span>
        </span>
        <span className="flex flex-col items-center gap-2">
          <Mansour size={38} state="waiting" />
          <span className="text-label text-muted">38 · waiting</span>
        </span>
        <span className="flex flex-col items-center gap-2">
          <Mansour size={34} />
          <span className="text-label text-muted">34 · idle</span>
        </span>
        <span className="flex flex-col items-center gap-2">
          <Mansour size={26} state="aiming" />
          <span className="text-label text-muted">26 · aiming</span>
        </span>
      </div>
    ),
  },
  {
    /* Modal 2 - the create-account form, in the shape a PHONE-first new user meets it: e-mail
       required, phone already verified, and the way out named for what it does. The dialog around
       it cannot be dismissed while this is on screen (owner, 2026-09-13), so this control is the
       only exit and has to be findable without competing with the act. */
    id: "onboarding-form",
    pin: "—",
    label: "Create account — modal 2",
    render: () => (
      <div style={{ width: 620 }}>
        <OnboardingForm next="/create" showEmail requireEmail onAbandon={() => {}} onSignIn={() => {}} onDone={() => {}} />
      </div>
    ),
  },
  {
    /* The third state, and the one nothing else covers: an OFF-CATALOGUE line, or a tree that failed
       to load. There is no drawing of a machine the catalogue does not carry, so the agent holds the
       ring rather than an empty grey disc. */
    id: "processing-no-art",
    pin: "24",
    label: "Processing — no drawing",
    render: () => <ProcessingView imageUrl={null} title={L("Reading your request", "نقرأ طلبك")} caption={null} />,
  },
  {
    id: "price-footer",
    pin: "48",
    label: "Price footer",
    ground: "dark",
    render: () => (
      <div className="bidmap" style={{ width: 392 }}>
        <PriceFooter bid={bid} durationDays={30} />
      </div>
    ),
  },
  {
    /* 61 — the heading, the search and the city on ONE row, the thinned category rail under them,
       and the ‹ › pager at the foot of twenty cards (owner, 2026-09-16). */
    id: "browse-directory",
    pin: "61",
    label: "Browse — directory",
    render: () => (
      /* ⚠️ **Fluid, never a fixed width.** The shot lane photographs every specimen at 392 AND 1024,
         and a fixed 1180 overflows the narrower viewport — which under `dir="rtl"` spills to the LEFT
         and the clip comes back with a column of cards sliced off, a picture that looks like a broken
         mirror and is only a broken fixture. This is a full-width page surface; it should fill
         whatever it is given, which is also what it does in the app.

         ⚠️ **`minWidth: 0` is load-bearing.** The preview shell is a flex column, so this wrapper is a
         flex ITEM and `min-width: auto` lets it grow to its own min-content — 791px at a 392 viewport,
         which photographs as an overflowing page that the real `BrowsePage` (ordinary block flow)
         never produces. Measured here, 2026-09-16. */
      <div style={{ width: "100%", minWidth: 0 }}>
        <BrowseSpecimen />
      </div>
    ),
  },
  /**
   * The dashboard's tab row (owner, 2026-09-16). Three states worth looking at in one picture: the
   * open tab, a closed one with a real count, and one whose block has not answered yet and shows a
   * dash rather than a 0.
   */
  {
    id: "dashboard-tabs",
    pin: "10.8",
    label: "Dashboard - requests / suppliers / projects tabs",
    render: () => (
      <div style={{ width: "100%", minWidth: 0 }}>
        <DashboardTabs view="requests" counts={{ requests: 4, suppliers: 42, projects: null }} onPick={() => {}} />
      </div>
    ),
  },
  /**
   * The National Day skin (owner, 2026-09-16).
   *
   * 🔴 **This bends rule 1 and says so.** `AppShell` cannot mount here — it reads the session, the
   * locale, the router AND fires `fetchDealRoomUnread`, which rule 2 forbids outright — so the bar
   * below repeats the header's own classes rather than importing it. What is being photographed is
   * the SKIN, and the skin is three class names and a block of `globals.css`: `nd-bar` (the ground),
   * `nd-decor` (the dot lattice, the palm grove and the gold seam on its `::after`) and `nd-chip`.
   * Those are the real classes against the real stylesheet, which is the whole of what can be wrong.
   * What this picture CANNOT prove is how the decoration sits behind the logo, the tabs and the
   * three 34px controls — that needs the signed-in bar.
   *
   * `data-season` is set on the wrapper, not on `<html>`: the seasonal rules are descendant
   * selectors, so any ancestor carrying the attribute switches them on. That is also how the OFF
   * state is drawn beside the on one — the same markup, one attribute apart.
   */
  {
    id: "national-day",
    pin: "2.4",
    label: "National Day skin - bar, band and role gate, on and off",
    render: () => {
      const bar = (
        <>
          <span className="nd-decor" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/moedatech-logo.svg" alt="Moedatech" className="block h-5 w-auto flex-none brightness-0 invert" />
          <span className="flex-none rounded-full border border-white/25 px-1.5 py-px text-label font-extrabold uppercase tracking-wide text-white/70">
            Beta
          </span>
          <span className="nd-mark" aria-hidden>
            <span className="nd-mark-fig">96</span>
            <span className="nd-mark-rule" />
            <span className="nd-mark-sub">{L("National Day", "اليوم الوطني")}</span>
          </span>
          <span className="ms-auto flex-none text-body font-extrabold">{L("Dashboard", "الرئيسية")}</span>
        </>
      );
      return (
        <div style={{ width: "100%", minWidth: 0 }} className="flex flex-col gap-5">
          <div data-season="nd">
            <div className="nd-bar relative flex h-[52px] items-center gap-3 bg-navy-deep px-4 text-white sm:px-7">{bar}</div>
            {/* The dashboard band, carrying the three pieces it takes in season: the eight-palm
                TREE LINE and the dot lattice on `nd-band`, and the DUNE SWEEP cutting its bottom
                edge into the page's own colour. Its navy is unchanged, which is as much the point of
                the picture as the motifs are. 🔴 The ordinal mark is NOT here any more — it is on the
                bar above, in place of the pill (owner, 2026-09-17). */}
            <div className="nd-dune nd-band relative flex h-[160px] items-center gap-6 bg-navy px-4 text-white sm:px-7">
              <span className="text-body font-extrabold">
                {L("The dashboard band keeps its own colours", "شريط الرئيسية يحتفظ بألوانه")}
              </span>
            </div>

            {/* The role gate's card: the head strip takes the gradient, the dot lattice and the
                INTERLOCKING Najdi band with the kit's PALE chip weight on it; the body takes one
                oversized corner palm. The card's size, type and words do not move. */}
            <div className="mt-5 w-[380px] max-w-full overflow-hidden rounded-lg border border-border bg-surface">
              <p className="nd-crown flex items-center gap-2 border-b border-border bg-surface2 px-4 py-2.5 text-meta font-semibold text-muted-dark [[data-season='nd']_&]:text-white">
                {L("Join Moedatech", "انضم إلى معداتك")}
                <span className="nd-chip is-pale ms-auto flex-none rounded-full px-1.5 py-px text-label font-extrabold tracking-wide">
                  <b className="font-extrabold">96</b>
                  {L("National Day", "اليوم الوطني")}
                </span>
              </p>
              <div className="relative p-4">
                <span aria-hidden="true" className="nd-palm-corner" />
                <h2 className="text-subhead font-extrabold text-navy">{L("Your requests", "طلباتك")}</h2>
                <p className="mt-1 text-body leading-relaxed text-muted">
                  {L("Sign in to read the offers on your requests", "سجّل الدخول لقراءة العروض")}
                </p>
              </div>
            </div>
          </div>
          {/* The same markup with the attribute absent — which is every day but the fortnight. */}
          <div className="nd-bar relative flex h-[52px] items-center gap-3 bg-navy-deep px-4 text-white sm:px-7">{bar}</div>
        </div>
      );
    },
  },
];

export const specimenById = (id: string | null): Specimen | null =>
  SPECIMENS.find((s) => s.id === id) ?? null;
