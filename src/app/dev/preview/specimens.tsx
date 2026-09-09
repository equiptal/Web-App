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
