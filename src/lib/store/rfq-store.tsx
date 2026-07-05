"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { ReactNode } from "react";
import {
  AgentDraft,
  Certificates,
  EquipmentItem,
  OperatorDetails,
  Preferences,
  ProjectDetails,
  RfqDraft,
  Taxonomy,
  TimingHours,
  AdvancedSettings,
  computeSummary,
  defaultPreferences,
  defaultOperatorNeeded,
  newManualItem,
  postableItems,
} from "@/lib/contract";
import { ApiError, ApiErrorKind, fetchTaxonomy, processRfq, submitRequest } from "@/lib/api/client";
import { useSession } from "@/lib/session";

export type Phase = "intake" | "processing" | "wizard" | "confirmation";
export type Step = 1 | 2 | 3 | 4;

/**
 * localStorage key for the persisted RFQ draft (web-app/002 save-on-reload).
 * v2: operator.certificate became multi-select (array). A v1 draft holds a single
 * string there, which crashes `.certificate.map(...)` on render — so bump the key to
 * ignore (not rehydrate) incompatible old drafts and clear the stale v1 entry.
 */
export const DRAFT_STORAGE_KEY = "rfq-draft-v2";
const LEGACY_DRAFT_STORAGE_KEYS = ["rfq-draft-v1"];

/**
 * web-app/002: true when a field's current value still equals what the agent originally filled in
 * (and the agent actually supplied one). Drives the orange "AI" marker; returns false once the
 * renter edits the value (so the mark clears), or when the agent left the field empty.
 */
export function agentMatches(current: unknown, original: unknown): boolean {
  if (original == null || original === "" || (Array.isArray(original) && original.length === 0)) return false;
  return JSON.stringify(current) === JSON.stringify(original);
}

export interface RfqState {
  phase: Phase;
  step: Step;
  taxonomy: Taxonomy;
  draft: RfqDraft | null;
  // intake inputs (preserved across errors — AC-10)
  text: string;
  files: { name: string; type: string; data?: string }[];
  simulateError: boolean;
  // status
  busy: boolean;
  error: ApiErrorKind | null;
  /** The real backend reason behind a submit failure, surfaced in the UI for diagnosis. */
  errorDetail: { detail?: string; backendCode?: string; backendStatus?: number; status?: number } | null;
  requestId: string | null;
  /** Every short code from the fan-out (one per equipment item); requestId is the first. */
  requestIds: string[];
  /** The fan-out request UUIDs (parallel to requestIds) — the bid-link token resolves by UUID. */
  requestUuids: string[];
  multiLocationDismissed: boolean;
  seq: number;
  /** web-app/002: the project + items exactly as the agent first returned them — used to mark
   *  agent-filled values (orange) and clear the mark once the renter edits past them. */
  agentOrigin: { project: ProjectDetails; items: EquipmentItem[] } | null;
  /** True right after a saved draft was rehydrated on entering /create → show the continue/start-over
   *  prompt so the renter chooses to resume or reset (instead of silently dropping into the draft). */
  draftPrompt: boolean;
}

const initialState: RfqState = {
  phase: "intake",
  step: 1,
  taxonomy: [],
  draft: null,
  text: "",
  files: [],
  simulateError: false,
  busy: false,
  error: null,
  errorDetail: null,
  requestId: null,
  requestIds: [],
  requestUuids: [],
  multiLocationDismissed: false,
  seq: 100,
  agentOrigin: null,
  draftPrompt: false,
};

type Action =
  | { t: "SET_TAXONOMY"; taxonomy: Taxonomy }
  | { t: "SET_TEXT"; text: string }
  | { t: "ADD_FILES"; files: { name: string; type: string; data?: string }[] }
  | { t: "REMOVE_FILE"; index: number }
  | { t: "SET_SIMULATE_ERROR"; value: boolean }
  | { t: "PROCESS_START" }
  | { t: "PROCESS_SUCCESS"; draft: AgentDraft }
  | { t: "PROCESS_ERROR"; kind: ApiErrorKind; detail?: RfqState["errorDetail"] }
  | { t: "ENTER_WIZARD" }
  | { t: "RESUME_WIZARD" }
  | { t: "GO_INTAKE" }
  | { t: "RESUME_DRAFT" }
  | { t: "GO_STEP"; step: Step }
  | { t: "PATCH_LOCATION"; patch: Partial<ProjectDetails["location"]> }
  | { t: "CONFIRM_LOCATION" }
  | { t: "RESOLVE_LOCATION_CONFLICT"; source: "text" | "file" }
  | { t: "DISMISS_MULTILOCATION" }
  | { t: "PATCH_TIMING"; patch: Partial<TimingHours> }
  | { t: "PATCH_ADVANCED"; patch: Partial<AdvancedSettings> }
  | { t: "SET_CERTIFICATES"; patch: Partial<Certificates> }
  | { t: "PATCH_REQUESTWIDE"; patch: Partial<Pick<ProjectDetails, "deliveryToSite" | "returnFromSite" | "fuelResponsibility">> }
  | { t: "PATCH_ITEM"; id: string; patch: Partial<EquipmentItem> }
  | { t: "PATCH_ITEM_OPERATOR"; id: string; patch: Partial<OperatorDetails> }
  | { t: "SET_ITEM_CATEGORY"; id: string; categoryId: string }
  | { t: "SET_ITEM_SUBCATEGORY"; id: string; subcategoryId: string }
  | { t: "SET_ITEM_MEASUREMENT"; id: string; measurementId: string }
  | { t: "APPROVE_ITEM"; id: string }
  | { t: "APPROVE_SUGGESTION"; id: string }
  | { t: "ADD_ITEM" }
  | { t: "REMOVE_ITEM"; id: string }
  | { t: "PATCH_PREFERENCES"; patch: DeepPrefPatch }
  | { t: "SUBMIT_START" }
  | { t: "SUBMIT_SUCCESS"; requestId: string; requestIds: string[]; requestUuids: string[] }
  | { t: "SUBMIT_ERROR"; kind: ApiErrorKind; detail?: RfqState["errorDetail"] }
  | { t: "HYDRATE"; saved: Partial<RfqState> }
  | { t: "RESET" };

interface DeepPrefPatch {
  payment?: Partial<Preferences["payment"]>;
  maintenance?: Partial<Preferences["maintenance"]>;
  additionalNotes?: string;
  budgetSar?: number | null;
  supplierFilters?: Partial<Preferences["supplierFilters"]>;
}

/* ------------------------------ reducer helpers ------------------------------ */

function withDraft(state: RfqState, fn: (d: RfqDraft) => RfqDraft): RfqState {
  if (!state.draft) return state;
  return { ...state, draft: fn(state.draft) };
}

function mapItem(d: RfqDraft, id: string, fn: (i: EquipmentItem) => EquipmentItem): RfqDraft {
  const items = d.items.map((i) => (i.id === id ? fn(i) : i));
  return { ...d, items, summary: computeSummary(items) };
}

function reducer(state: RfqState, a: Action): RfqState {
  switch (a.t) {
    case "SET_TAXONOMY":
      return { ...state, taxonomy: a.taxonomy };
    case "SET_TEXT":
      return { ...state, text: a.text };
    case "ADD_FILES":
      return { ...state, files: [...state.files, ...a.files] };
    case "REMOVE_FILE":
      return { ...state, files: state.files.filter((_, i) => i !== a.index) };
    case "SET_SIMULATE_ERROR":
      return { ...state, simulateError: a.value };
    case "PROCESS_START":
      return { ...state, phase: "processing", busy: true, error: null, errorDetail: null };
    case "PROCESS_SUCCESS":
      return {
        ...state,
        busy: false,
        error: null,
        draft: {
          project: a.draft.project,
          items: a.draft.items,
          preferences: a.draft.preferences ?? defaultPreferences(), // agent-inferred Step-3 prefs when present
          detectedLocations: a.draft.detectedLocations,
          summary: a.draft.summary,
          justifications: a.draft.justifications ?? [],
          fieldNotes: a.draft.fieldNotes ?? {},
        },
        // Snapshot the agent's values (refs are safe — all edits are immutable copies).
        agentOrigin: { project: a.draft.project, items: a.draft.items },
        multiLocationDismissed: false,
      };
    case "PROCESS_ERROR":
      return { ...state, busy: false, error: a.kind, errorDetail: a.detail ?? null };
    case "ENTER_WIZARD":
      return { ...state, phase: "wizard", step: 1 };
    case "RESUME_WIZARD":
      // Return to the wizard at the SAME step (e.g. from the "Your request" input step) — no re-parse.
      return { ...state, phase: "wizard", error: null };
    case "GO_INTAKE":
      // Return to intake preserving text/files (AC-10: input preserved). Keeps `step` so the renter
      // can jump back to the wizard where they were ("Your request" step → back to review).
      return { ...state, phase: "intake", error: null };
    case "RESUME_DRAFT":
      // "Continue draft": dismiss the prompt and drop the renter back INTO the review wizard at the
      // step they left (restored by HYDRATE) — never the raw "Your request" input screen, whose
      // primary action is "Re-analyze" and would discard their edits. A rehydrated draft has always
      // already been processed (the prompt only shows when a saved draft exists).
      return { ...state, draftPrompt: false, phase: "wizard", error: null };
    case "GO_STEP":
      return { ...state, step: a.step };
    case "PATCH_LOCATION":
      // AC-16: changing the location (map/search/GPS) invalidates a prior confirmation — require a
      // fresh confirm. The patch can still set `confirmed` explicitly (e.g. the "Change" button).
      return withDraft(state, (d) => ({
        ...d,
        project: { ...d.project, location: { ...d.project.location, ...a.patch, confirmed: a.patch.confirmed ?? false } },
      }));
    case "CONFIRM_LOCATION":
      return withDraft(state, (d) => ({ ...d, project: { ...d.project, location: { ...d.project.location, confirmed: true } } }));
    case "RESOLVE_LOCATION_CONFLICT":
      return withDraft(state, (d) => {
        const loc = d.project.location;
        if (!loc.conflict) return d;
        const chosen = a.source === "text" ? loc.conflict.fromText : loc.conflict.fromFile;
        return {
          ...d,
          project: {
            ...d.project,
            location: { ...loc, label: chosen, confirmed: false, conflict: { ...loc.conflict, resolvedFrom: a.source } },
          },
        };
      });
    case "DISMISS_MULTILOCATION":
      return { ...state, multiLocationDismissed: true };
    case "PATCH_TIMING":
      return withDraft(state, (d) => ({ ...d, project: { ...d.project, timing: { ...d.project.timing, ...a.patch } } }));
    case "PATCH_ADVANCED":
      return withDraft(state, (d) => {
        const advanced = { ...d.project.advanced, ...a.patch };
        let items = d.items;
        // The request-wide minimum equipment year applies to EVERY item so it's reflected on each item's
        // own picker (the renter can still override a single item afterwards via patchItem). AC-28.
        if (a.patch.equipmentYear !== undefined) {
          items = d.items.map((i) => ({ ...i, equipmentYear: a.patch.equipmentYear ?? null }));
        }
        return { ...d, project: { ...d.project, advanced }, items };
      });
    case "SET_CERTIFICATES":
      // AC-50: the request-wide safety certificates are the "settings for all items" value for each
      // item's EQUIPMENT safety cert. Choosing it applies to ALL items — so, exactly like
      // delivery/return/fuel (PATCH_REQUESTWIDE), CLEAR each item's per-item safety override so every
      // item follows the shared setting (items with an override — e.g. from agent extraction — would
      // otherwise ignore the request-wide click). It never fans into the OPERATOR cert (per-item).
      return withDraft(state, (d) => ({
        ...d,
        project: { ...d.project, certificates: { ...d.project.certificates, ...a.patch } },
        items: a.patch.safety !== undefined ? d.items.map((i) => ({ ...i, safetyCertsOverride: null })) : d.items,
      }));
    case "PATCH_REQUESTWIDE":
      // Choosing a request-wide value applies it to ALL items — clear that field's per-item
      // overrides so every item follows the shared setting (AC-25/26).
      return withDraft(state, (d) => ({
        ...d,
        project: { ...d.project, ...a.patch },
        items: d.items.map((i) => ({
          ...i,
          ...(a.patch.deliveryToSite !== undefined ? { deliveryOverride: null } : {}),
          ...(a.patch.returnFromSite !== undefined ? { returnOverride: null } : {}),
          ...(a.patch.fuelResponsibility !== undefined ? { fuelResponsibilityOverride: null } : {}),
        })),
      }));
    case "PATCH_ITEM":
      return withDraft(state, (d) => mapItem(d, a.id, (i) => ({ ...i, ...a.patch })));
    case "PATCH_ITEM_OPERATOR":
      return withDraft(state, (d) => mapItem(d, a.id, (i) => ({ ...i, operator: { ...i.operator, ...a.patch } })));
    case "SET_ITEM_CATEGORY":
      // AC-21: changing category clears & re-prompts subcategory + measurement.
      return withDraft(state, (d) =>
        mapItem(d, a.id, (i) => ({
          ...i,
          ref: { categoryId: a.categoryId, subcategoryId: null, measurementId: null },
          resolved: false,
        })),
      );
    case "SET_ITEM_SUBCATEGORY":
      // AC-21: changing subcategory clears & re-prompts measurement; reset operator default (AC-24).
      return withDraft(state, (d) =>
        mapItem(d, a.id, (i) => ({
          ...i,
          ref: { ...i.ref, subcategoryId: a.subcategoryId, measurementId: null },
          operatorNeeded: defaultOperatorNeeded(a.subcategoryId),
          resolved: false,
        })),
      );
    case "SET_ITEM_MEASUREMENT":
      return withDraft(state, (d) =>
        mapItem(d, a.id, (i) => {
          const ref = { ...i.ref, measurementId: a.measurementId };
          // Don't auto-match: filling a missing size keeps the item where it is (a needs-ok item
          // stays needs-ok until the renter clicks Approve; an already-matched item stays matched).
          return { ...i, ref, resolved: i.resolved };
        }),
      );
    case "APPROVE_ITEM":
      return withDraft(state, (d) => mapItem(d, a.id, (i) => ({ ...i, resolved: true })));
    case "APPROVE_SUGGESTION":
      return withDraft(state, (d) =>
        mapItem(d, a.id, (i) =>
          i.suggestion
            ? { ...i, ref: { ...i.ref, measurementId: i.suggestion.measurementId }, resolved: true }
            : { ...i, resolved: true },
        ),
      );
    case "ADD_ITEM":
      return withDraft({ ...state, seq: state.seq + 1 }, (d) => {
        const items = [...d.items, newManualItem(`m${state.seq}`)];
        return { ...d, items, summary: computeSummary(items) };
      });
    case "REMOVE_ITEM":
      return withDraft(state, (d) => mapItem(d, a.id, (i) => ({ ...i, removed: true })));
    case "PATCH_PREFERENCES":
      return withDraft(state, (d) => {
        const p = d.preferences;
        return {
          ...d,
          preferences: {
            payment: { ...p.payment, ...a.patch.payment },
            maintenance: { ...p.maintenance, ...a.patch.maintenance },
            additionalNotes: a.patch.additionalNotes ?? p.additionalNotes,
            budgetSar: a.patch.budgetSar !== undefined ? a.patch.budgetSar : p.budgetSar,
            supplierFilters: { ...p.supplierFilters, ...a.patch.supplierFilters },
          },
        };
      });
    case "SUBMIT_START":
      return { ...state, busy: true, error: null, errorDetail: null };
    case "SUBMIT_SUCCESS":
      return { ...state, busy: false, phase: "confirmation", requestId: a.requestId, requestIds: a.requestIds, requestUuids: a.requestUuids };
    case "SUBMIT_ERROR":
      return { ...state, busy: false, error: a.kind, errorDetail: a.detail ?? null };
    case "RESET":
      return { ...initialState, taxonomy: state.taxonomy };
    case "HYDRATE":
      // Restore a saved draft on reload (web-app/002) — keep the freshly-fetched taxonomy, and raise
      // the continue/start-over prompt so the renter decides to resume or reset.
      return { ...state, ...a.saved, taxonomy: state.taxonomy, draftPrompt: true };
    default:
      return state;
  }
}

/* ------------------------------ context + actions ------------------------------ */

interface RfqContextValue {
  state: RfqState;
  actions: ReturnType<typeof makeActions>;
}

const RfqContext = createContext<RfqContextValue | null>(null);

function makeActions(dispatch: React.Dispatch<Action>, getState: () => RfqState) {
  return {
    setText: (text: string) => dispatch({ t: "SET_TEXT", text }),
    addFiles: (files: { name: string; type: string; data?: string }[]) => dispatch({ t: "ADD_FILES", files }),
    removeFile: (index: number) => dispatch({ t: "REMOVE_FILE", index }),
    setSimulateError: (value: boolean) => dispatch({ t: "SET_SIMULATE_ERROR", value }),

    async process() {
      const s = getState();
      dispatch({ t: "PROCESS_START" });
      try {
        const draft = await processRfq({ text: s.text, files: s.files, simulateError: s.simulateError });
        dispatch({ t: "PROCESS_SUCCESS", draft });
      } catch (e) {
        const detail =
          e instanceof ApiError
            ? { detail: e.detail, backendCode: e.backendCode, backendStatus: e.backendStatus, status: e.status }
            : null;
        dispatch({ t: "PROCESS_ERROR", kind: e instanceof ApiError ? e.kind : "unknown", detail });
      }
    },
    enterWizard: () => dispatch({ t: "ENTER_WIZARD" }),
    resumeWizard: () => dispatch({ t: "RESUME_WIZARD" }),
    goIntake: () => dispatch({ t: "GO_INTAKE" }),
    resumeDraft: () => dispatch({ t: "RESUME_DRAFT" }),
    goStep: (step: Step) => dispatch({ t: "GO_STEP", step }),

    patchLocation: (patch: Partial<ProjectDetails["location"]>) => dispatch({ t: "PATCH_LOCATION", patch }),
    confirmLocation: () => dispatch({ t: "CONFIRM_LOCATION" }),
    resolveLocationConflict: (source: "text" | "file") => dispatch({ t: "RESOLVE_LOCATION_CONFLICT", source }),
    dismissMultiLocation: () => dispatch({ t: "DISMISS_MULTILOCATION" }),
    patchTiming: (patch: Partial<TimingHours>) => dispatch({ t: "PATCH_TIMING", patch }),
    patchAdvanced: (patch: Partial<AdvancedSettings>) => dispatch({ t: "PATCH_ADVANCED", patch }),
    setCertificates: (patch: Partial<Certificates>) => dispatch({ t: "SET_CERTIFICATES", patch }),
    patchRequestWide: (patch: Partial<Pick<ProjectDetails, "deliveryToSite" | "returnFromSite" | "fuelResponsibility">>) =>
      dispatch({ t: "PATCH_REQUESTWIDE", patch }),

    patchItem: (id: string, patch: Partial<EquipmentItem>) => dispatch({ t: "PATCH_ITEM", id, patch }),
    patchItemOperator: (id: string, patch: Partial<OperatorDetails>) => dispatch({ t: "PATCH_ITEM_OPERATOR", id, patch }),
    setItemCategory: (id: string, categoryId: string) => dispatch({ t: "SET_ITEM_CATEGORY", id, categoryId }),
    setItemSubcategory: (id: string, subcategoryId: string) => dispatch({ t: "SET_ITEM_SUBCATEGORY", id, subcategoryId }),
    setItemMeasurement: (id: string, measurementId: string) => dispatch({ t: "SET_ITEM_MEASUREMENT", id, measurementId }),
    approveItem: (id: string) => dispatch({ t: "APPROVE_ITEM", id }),
    approveSuggestion: (id: string) => dispatch({ t: "APPROVE_SUGGESTION", id }),
    addItem: () => dispatch({ t: "ADD_ITEM" }),
    removeItem: (id: string) => dispatch({ t: "REMOVE_ITEM", id }),

    patchPreferences: (patch: DeepPrefPatch) => dispatch({ t: "PATCH_PREFERENCES", patch }),

    async submit() {
      const s = getState();
      if (!s.draft) return;
      dispatch({ t: "SUBMIT_START" });
      try {
        const { requestId, requestIds, requestUuids } = await submitRequest({
          project: s.draft.project,
          items: postableItems(s.draft.items), // AC-33/34: exclude no-match/removed
          preferences: s.draft.preferences,
          simulateError: s.simulateError,
        });
        dispatch({ t: "SUBMIT_SUCCESS", requestId, requestIds: requestIds ?? (requestId ? [requestId] : []), requestUuids: requestUuids ?? [] });
      } catch (e) {
        const detail =
          e instanceof ApiError
            ? { detail: e.detail, backendCode: e.backendCode, backendStatus: e.backendStatus, status: e.status }
            : null;
        dispatch({ t: "SUBMIT_ERROR", kind: e instanceof ApiError ? e.kind : "unknown", detail });
      }
    },
    reset: () => {
      // Start over: drop the saved draft so it can't rehydrate, then reset state to a fresh intake.
      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      dispatch({ t: "RESET" });
    },
  };
}

export function RfqProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The signed-in renter — used to scope the persisted draft to its owner (the draft lives in
  // device-local storage, which would otherwise leak one account's request into another's session).
  const { status, user } = useSession();
  const hydratedRef = useRef(false);

  const actions = useMemo(() => makeActions(dispatch, () => stateRef.current), []);

  // Restore a saved draft on reload (web-app/002): data + the step the renter was on. Uploaded
  // files can't be re-created by the browser, so they aren't persisted (renter re-attaches if needed).
  // Waits for the session to resolve so we know who owns the draft, and runs only once.
  useEffect(() => {
    if (status === "loading" || hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      // Drop incompatible drafts saved under older keys (different shape → would crash on render).
      for (const k of LEGACY_DRAFT_STORAGE_KEYS) window.localStorage.removeItem(k);
      // Fresh-start handoff (mobile/017 AC-08, `?new=1`): discard any saved draft and start at page 1.
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1") {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        // Strip the flag so a later reload doesn't wipe an in-progress draft.
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<RfqState> & { userId?: number | null };
      // Only rehydrate a draft whose stamped owner is EXACTLY the current renter (a signed-out guest
      // owns `null` and matches `null`). Any mismatch — another account's id, or a legacy/un-owned
      // draft (`userId` absent) saved before this scoping existed — is discarded so a request never
      // leaks across accounts on a shared device. A guest who signs in keeps their draft because the
      // persist effect re-stamps it with the new id the moment the session changes (no reload needed).
      const savedUserId = saved?.userId ?? null;
      const currentUserId = user?.id ?? null;
      if (savedUserId !== currentUserId) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        return;
      }
      if (saved && saved.draft) {
        const { userId: _ownerId, ...rest } = saved;
        void _ownerId;
        dispatch({ t: "HYDRATE", saved: rest });
      }
    } catch {
      /* corrupt/blocked storage → start fresh */
    }
  }, [status, user]);

  // Persist the editable draft + position whenever they change (skip processing/confirmation phases).
  // Stamp the owning user id so a later session can tell whose draft this is.
  const { phase, step, draft, text, multiLocationDismissed, seq, agentOrigin } = state;
  useEffect(() => {
    try {
      if (draft && (phase === "intake" || phase === "wizard")) {
        window.localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({ phase, step, draft, text, multiLocationDismissed, seq, agentOrigin, userId: user?.id ?? null }),
        );
      } else if (phase === "confirmation") {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY); // request sent → clear the saved draft
      }
    } catch {
      /* ignore quota/availability errors */
    }
  }, [phase, step, draft, text, multiLocationDismissed, seq, agentOrigin, user]);

  // ---- Browser history ⇄ wizard position. The browser Back/Forward buttons step through the wizard
  // like the in-app Back/Next: each forward step pushes a history entry; Back/Forward fire popstate,
  // which moves the store to that step. Backward in-app nav (Back button / step chips / "Your request")
  // routes through window.history too (see Wizard), so both stay in sync. ----
  const poppingRef = useRef(false);
  const lastOrdRef = useRef(0);
  useEffect(() => {
    // Baseline entry for the create flow, so the first Back returns here rather than straight off-page.
    try {
      window.history.replaceState({ ...(window.history.state ?? {}), rfqOrd: 0 }, "");
    } catch {
      /* history unavailable */
    }
    const onPop = (e: PopStateEvent) => {
      const target = e.state && typeof (e.state as { rfqOrd?: unknown }).rfqOrd === "number" ? ((e.state as { rfqOrd: number }).rfqOrd) : 0;
      poppingRef.current = true;
      const s = stateRef.current;
      if (target >= 1 && s.draft) {
        dispatch({ t: "RESUME_WIZARD" });
        dispatch({ t: "GO_STEP", step: Math.min(Math.max(target, 1), 4) as Step });
      } else {
        dispatch({ t: "GO_INTAKE" }); // baseline / no draft → the input screen ("Your request")
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Push a history entry whenever the renter moves FORWARD (intake→step, step→next) so each is a
  // Back-stop. Backward moves arrive via popstate (poppingRef) and must not re-push.
  useEffect(() => {
    const ord = phase === "wizard" ? step : phase === "intake" ? 0 : -1;
    if (ord < 0) return; // processing / confirmation aren't part of the back/forward chain
    if (poppingRef.current) {
      poppingRef.current = false;
      lastOrdRef.current = ord;
      return;
    }
    if (ord > lastOrdRef.current) {
      try {
        window.history.pushState({ rfqOrd: ord }, "");
      } catch {
        /* ignore */
      }
    }
    lastOrdRef.current = ord;
  }, [phase, step]);

  // Load the taxonomy once.
  useEffect(() => {
    let active = true;
    fetchTaxonomy()
      .then((tax) => active && dispatch({ t: "SET_TAXONOMY", taxonomy: tax }))
      .catch(() => {
        /* taxonomy stays empty; selects will be empty until reachable */
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<RfqContextValue>(() => ({ state, actions }), [state, actions]);
  return <RfqContext.Provider value={value}>{children}</RfqContext.Provider>;
}

export function useRfq(): RfqContextValue {
  const ctx = useContext(RfqContext);
  if (!ctx) throw new Error("useRfq must be used within <RfqProvider>");
  return ctx;
}
