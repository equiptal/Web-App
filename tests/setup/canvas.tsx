/**
 * Harness for the request-canvas component tests.
 *
 * The canvas sits inside three providers and talks to two endpoints, so the fiddly part of these
 * tests is getting a realistic draft in front of it. `renderCanvas` does that: it stubs the network,
 * seeds the store with an agent-parsed draft, and returns helpers for the questions the tests
 * actually ask — is this control present, does this list match the contract, did that shake.
 *
 * The draft is seeded the way the real flow produces one: `PROCESS_SUCCESS` through the real
 * reducer, so `agentOrigin` is snapshotted and `touchedFields` starts empty exactly as it would in
 * production. Constructing the state object by hand would let provenance and the year/certificate
 * gates pass on a shape the app never actually creates.
 */

import type { ReactElement, ReactNode } from "react";
import { act, render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";


import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { RfqProvider, useRfq } from "@/lib/store/rfq-store";
import {
  computeSummary,
  defaultOperatorDetails,
  defaultPreferences,
  defaultProjectDetails,
  type AgentDraft,
  type EquipmentItem,
  type ProjectDetails,
  type Taxonomy,
} from "@/lib/contract";
import type { Locale } from "@/lib/i18n";
import type { SubtypeAttachmentOption } from "@/lib/contract/app";

/* ------------------------------------ fixtures ------------------------------------ */

/** Three levels, two categories — enough for a cascade and for a crane-only field. */
export const TAXONOMY: Taxonomy = [
  {
    id: "cat-earth",
    name: "Earthmoving",
    nameAr: "أعمال الحفر",
    tag: "Earthmoving",
    subcategories: [
      {
        id: "sub-crawler",
        name: "Crawler excavator",
        nameAr: "حفارة زاحفة",
        measurements: [
          { id: "cap-30", name: "30 ton", nameAr: "٣٠ طن" },
          { id: "cap-40", name: "40 ton", nameAr: "٤٠ طن" },
        ],
      },
      {
        id: "sub-wheel",
        name: "Wheel loader",
        nameAr: "لودر بعجل",
        measurements: [{ id: "cap-3", name: "3 m³", nameAr: "٣ م³" }],
      },
    ],
  },
  {
    id: "cat-lifting",
    name: "Cranes & lifting",
    nameAr: "الرفع والرافعات",
    tag: "Lifting, Cranes & Aerial",
    subcategories: [
      {
        id: "sub-mobile-crane",
        name: "Mobile crane",
        nameAr: "رافعة متنقلة",
        measurements: [{ id: "cap-50t", name: "50 ton", nameAr: "٥٠ طن" }],
      },
    ],
  },
];

export function makeItem(over: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "a0",
    rawLabel: "30 ton digger",
    rawSize: "30 ton",
    ref: { categoryId: "cat-earth", subcategoryId: "sub-crawler", measurementId: "cap-30" },
    verdict: "confident",
    resolved: true,
    removed: false,
    quantity: 1,
    operatorNeeded: "yes",
    operator: defaultOperatorDetails(),
    fuelType: "diesel",
    additionalNotes: "",
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    equipmentYear: null,
    attachmentIds: [],
    customAttachments: [],
    ...over,
  };
}

/** A project with the site confirmed and a basis chosen — the "everything but equipment" baseline. */
export function confirmedProject(over: Partial<ProjectDetails> = {}): ProjectDetails {
  const p = defaultProjectDetails();
  p.location = { label: "King Khalid International Airport", lat: 24.9576, lng: 46.6988, confirmed: true, source: "agent" };
  p.timing = { rentalBasis: "monthly", extendable: true, startDate: "2026-08-12", endDate: "2027-02-08", hoursPerDay: 10 };
  return { ...p, ...over };
}

export function makeAgentDraft(over: Partial<AgentDraft> = {}): AgentDraft {
  const items = over.items ?? [makeItem()];
  return {
    rfqId: "rfq-1",
    project: over.project ?? defaultProjectDetails(),
    items,
    preferences: defaultPreferences(),
    detectedLocations: [],
    summary: computeSummary(items),
    fieldNotes: {},
    ...over,
  };
}

/* ------------------------------------ render ------------------------------------ */

export interface CanvasHandle {
  /** Everything RTL's `render` returns. */
  view: RenderResult;
  /** The live store, for assertions about what the UI actually wrote. */
  store: () => ReturnType<typeof useRfq>;
  /** Run an interaction and flush React's effects. */
  run: (fn: () => void | Promise<void>) => Promise<void>;
}

let storeRef: ReturnType<typeof useRfq> | null = null;

function StoreProbe() {
  storeRef = useRfq();
  return null;
}

/**
 * Stub the two endpoints the canvas touches. Anything else 404s loudly rather than silently
 * resolving, so a test that starts depending on a new call has to say so.
 */
export function stubFetch(attachments: SubtypeAttachmentOption[] = [], draft?: AgentDraft) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/session")) return jsonResponse({ user: null });
    if (url.includes("/api/taxonomy")) return jsonResponse(TAXONOMY);
    if (url.includes("/api/equipment/attachments/")) return jsonResponse(attachments);
    // The agent is a POST that returns a job id, then a poll. Answering both here keeps
    // `processRfq` itself in the test — no module mock, so its error handling and the store's
    // PROCESS_SUCCESS path are the real ones.
    if (url.includes("/api/agent/process")) return jsonResponse({ jobId: "job-1" });
    if (url.includes("/api/agent/jobs/")) return jsonResponse({ status: "done", draft: draft ?? makeAgentDraft() });
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

/**
 * Mount `ui` with the canvas's providers and an agent-parsed draft already in the store.
 *
 * Reaches the canvas through the real actions — `process()` then `enterWizard()`. Only the agent's
 * HTTP call is mocked; the reducer path, the `agentOrigin` snapshot and persistence are genuine.
 */
export async function renderCanvas(
  ui: ReactElement | ((store: ReturnType<typeof useRfq>) => ReactElement),
  opts: {
    draft?: AgentDraft;
    locale?: Locale;
    attachments?: SubtypeAttachmentOption[];
    /** Applied after the draft lands — e.g. open a panel, or accept the charged days. */
    prepare?: (store: ReturnType<typeof useRfq>) => void;
    text?: string;
  } = {},
): Promise<CanvasHandle> {
  const draft = opts.draft ?? makeAgentDraft();
  stubFetch(opts.attachments, draft);
  storeRef = null;

  // `LocaleProvider` overrides its own `initialLocale` on mount: it restores a persisted choice, and
  // failing that follows `navigator.language` — which is en-US under jsdom. So the locale has to be
  // set the way a returning renter's would be, through storage.
  try {
    window.localStorage.setItem("moedatech.locale", opts.locale ?? "en");
  } catch {
    /* storage unavailable */
  }

  const Body = () => {
    const store = useRfq();
    return typeof ui === "function" ? ui(store) : ui;
  };

  let view!: RenderResult;
  await act(async () => {
    view = render(
      <LocaleProvider initialLocale={opts.locale ?? "en"}>
        <SessionProvider>
          <RfqProvider>
            <StoreProbe />
            <Gate>
              <Body />
            </Gate>
          </RfqProvider>
        </SessionProvider>
      </LocaleProvider>,
    );
  });

  // Seed through the real actions: `process()` runs the genuine PROCESS_SUCCESS path (only the agent
  // HTTP call is mocked), so `agentOrigin` is snapshotted and `touchedFields` starts empty.
  await act(async () => {
    storeRef!.actions.setText(opts.text ?? "1 x 30 ton digger with operator, King Khalid Airport, 6 months from 12 August");
  });
  await act(async () => {
    await storeRef!.actions.process();
  });
  await act(async () => {
    storeRef!.actions.enterWizard();
  });
  if (opts.prepare) {
    await act(async () => {
      opts.prepare!(storeRef!);
    });
  }

  return {
    view,
    store: () => storeRef!,
    run: async (fn) => {
      await act(async () => {
        await fn();
      });
    },
  };
}

/** Children render only once a draft exists, mirroring `CreateSurface`'s own guard. */
function Gate({ children }: { children: ReactNode }) {
  const { state } = useRfq();
  return state.draft ? <>{children}</> : null;
}

