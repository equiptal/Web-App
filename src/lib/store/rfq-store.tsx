"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { ReactNode } from "react";
import {
  AgentDraft,
  Certificates,
  EquipmentItem,
  OperatorDetails,
  OPERATOR_CERTIFICATES,
  type OperatorCertificate,
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

export type Phase = "intake" | "processing" | "wizard" | "confirmation";
export type Step = 1 | 2 | 3 | 4;

/** localStorage key for the persisted RFQ draft (web-app/002 save-on-reload). */
const DRAFT_STORAGE_KEY = "rfq-draft-v1";

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
  requestId: string | null;
  /** Every short code from the fan-out (one per equipment item); requestId is the first. */
  requestIds: string[];
  multiLocationDismissed: boolean;
  seq: number;
  /** web-app/002: the project + items exactly as the agent first returned them — used to mark
   *  agent-filled values (orange) and clear the mark once the renter edits past them. */
  agentOrigin: { project: ProjectDetails; items: EquipmentItem[] } | null;
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
  requestId: null,
  requestIds: [],
  multiLocationDismissed: false,
  seq: 100,
  agentOrigin: null,
};

type Action =
  | { t: "SET_TAXONOMY"; taxonomy: Taxonomy }
  | { t: "SET_TEXT"; text: string }
  | { t: "ADD_FILES"; files: { name: string; type: string; data?: string }[] }
  | { t: "REMOVE_FILE"; index: number }
  | { t: "SET_SIMULATE_ERROR"; value: boolean }
  | { t: "PROCESS_START" }
  | { t: "PROCESS_SUCCESS"; draft: AgentDraft }
  | { t: "PROCESS_ERROR"; kind: ApiErrorKind }
  | { t: "ENTER_WIZARD" }
  | { t: "GO_INTAKE" }
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
  | { t: "SUBMIT_SUCCESS"; requestId: string; requestIds: string[] }
  | { t: "SUBMIT_ERROR"; kind: ApiErrorKind }
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
      return { ...state, phase: "processing", busy: true, error: null };
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
      return { ...state, busy: false, error: a.kind };
    case "ENTER_WIZARD":
      return { ...state, phase: "wizard", step: 1 };
    case "GO_INTAKE":
      // Return to intake preserving text/files (AC-10: input preserved).
      return { ...state, phase: "intake", error: null };
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
      return withDraft(state, (d) => ({ ...d, project: { ...d.project, advanced: { ...d.project.advanced, ...a.patch } } }));
    case "SET_CERTIFICATES":
      return withDraft(state, (d) => {
        const certificates = { ...d.project.certificates, ...a.patch };
        let items = d.items;
        // AC-50: the project Safety certificates apply to every item's operator — EXCEPT items the
        // agent already set certs on from the RFQ (those keep theirs). Multi-select, so fan the whole
        // list (restricted to the operator-selectable certs — the free-text "other" stays project-level).
        if (a.patch.safety) {
          const certs = a.patch.safety.filter((c) => (OPERATOR_CERTIFICATES as string[]).includes(c)) as OperatorCertificate[];
          items = d.items.map((i) => (i.operator.certByAgent ? i : { ...i, operator: { ...i.operator, certificate: certs } }));
        }
        return { ...d, project: { ...d.project, certificates }, items };
      });
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
      return { ...state, busy: true, error: null };
    case "SUBMIT_SUCCESS":
      return { ...state, busy: false, phase: "confirmation", requestId: a.requestId, requestIds: a.requestIds };
    case "SUBMIT_ERROR":
      return { ...state, busy: false, error: a.kind };
    case "RESET":
      return { ...initialState, taxonomy: state.taxonomy };
    case "HYDRATE":
      // Restore a saved draft on reload (web-app/002) — keep the freshly-fetched taxonomy.
      return { ...state, ...a.saved, taxonomy: state.taxonomy };
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
        dispatch({ t: "PROCESS_ERROR", kind: e instanceof ApiError ? e.kind : "unknown" });
      }
    },
    enterWizard: () => dispatch({ t: "ENTER_WIZARD" }),
    goIntake: () => dispatch({ t: "GO_INTAKE" }),
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
        const { requestId, requestIds } = await submitRequest({
          project: s.draft.project,
          items: postableItems(s.draft.items), // AC-33/34: exclude no-match/removed
          preferences: s.draft.preferences,
          simulateError: s.simulateError,
        });
        dispatch({ t: "SUBMIT_SUCCESS", requestId, requestIds: requestIds ?? (requestId ? [requestId] : []) });
      } catch (e) {
        dispatch({ t: "SUBMIT_ERROR", kind: e instanceof ApiError ? e.kind : "unknown" });
      }
    },
    reset: () => dispatch({ t: "RESET" }),
  };
}

export function RfqProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const actions = useMemo(() => makeActions(dispatch, () => stateRef.current), []);

  // Restore a saved draft on reload (web-app/002): data + the step the renter was on. Uploaded
  // files can't be re-created by the browser, so they aren't persisted (renter re-attaches if needed).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<RfqState>;
      if (saved && saved.draft) dispatch({ t: "HYDRATE", saved });
    } catch {
      /* corrupt/blocked storage → start fresh */
    }
  }, []);

  // Persist the editable draft + position whenever they change (skip processing/confirmation phases).
  const { phase, step, draft, text, multiLocationDismissed, seq, agentOrigin } = state;
  useEffect(() => {
    try {
      if (draft && (phase === "intake" || phase === "wizard")) {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ phase, step, draft, text, multiLocationDismissed, seq, agentOrigin }));
      } else if (phase === "confirmation") {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY); // request sent → clear the saved draft
      }
    } catch {
      /* ignore quota/availability errors */
    }
  }, [phase, step, draft, text, multiLocationDismissed, seq, agentOrigin]);

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
