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
import { GuestWall, GuestDashboardPreview, GuestRequestsPreview } from "@/components/common/GuestWall";
import { ProcessingView } from "@/components/screens/Processing";
import { Mansour } from "@/components/Mansour";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { RequestCard } from "@/components/map/RequestCard";
import { PriceFooter } from "@/components/map/PriceFooter";
import { EquipmentDetail } from "@/components/map/panel/EquipmentDetail";
import { YardExplainDialog } from "@/components/map/YardExplainDialog";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { draftSubject, requestCardView, type RequestCardCtx } from "@/lib/contract/request-card";
import { composeDocumentRequest, composeShortfallRequest, type RenteeRequestDraft } from "@/lib/contract/rentee-request";
import type { BidCard } from "@/lib/contract/bids";
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

export const SPECIMENS: Specimen[] = [
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
];

export const specimenById = (id: string | null): Specimen | null =>
  SPECIMENS.find((s) => s.id === id) ?? null;
