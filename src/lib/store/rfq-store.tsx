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
  SafetyCertificate,
  Taxonomy,
  TimingHours,
  AdvancedSettings,
  computeSummary,
  defaultPreferences,
  defaultOperatorNeeded,
  operatorCertDefault,
  equipmentCertDefault,
  isLiftingCategory,
  newManualItem,
  postableItems,
} from "@/lib/contract";
import { ApiError, ApiErrorKind, fetchTaxonomy, postRfqCorrection, processRfq, submitRequest } from "@/lib/api/client";
import { draftToRfqCorrection } from "@/lib/api/agent-adapters";
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
  /** Server guest-parse cap was hit — Intake opens the account modal in response (signed-out only). */
  guestLimit: boolean;
  /**
   * mobile/016 — the renter picked "Trial Request" on the home pop-up, so this run submits with
   * `isTrial: true`: the backend creates the request but never dispatches it to suppliers, attaches
   * sample bids, and auto-deletes it after 60 min. Set from `/create?mode=trial` and persisted with the
   * draft, so a mid-flow reload can't silently turn a trial into a real (dispatched) request.
   */
  isTrial: boolean;
  /** The trial's 60-min expiry, echoed by the backend on submit (null for a real request). */
  trialExpiresAt: string | null;
}

/** Exported alongside {@link reducer} so tests start from the real initial state. */
export const initialState: RfqState = {
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
  guestLimit: false,
  isTrial: false,
  trialExpiresAt: null,
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
  | { t: "GUEST_LIMIT" }
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
  | { t: "SET_TRIAL"; isTrial: boolean }
  | { t: "SUBMIT_START" }
  | { t: "SUBMIT_SUCCESS"; requestId: string; requestIds: string[]; requestUuids: string[]; trialExpiresAt?: string | null }
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

/**
 * 2026-07 cert rule, seed pass. App parity: `_withGlobalEquipmentDefaults` (create_request_bloc.dart) —
 * EVERY item lands with a certificate, not just the ones whose category the renter picked by hand.
 *
 *  • equipment cert — lifting → Aramco, every other group → TÜV. Seeded only when the item has no
 *    effective cert (no per-item override AND no request-wide default), so an agent-extracted cert or a
 *    renter choice is never overwritten. Skipped while the item has no category to classify.
 *  • operator cert  — SPSP, seeded only when the operator is on and no cert is set yet.
 *
 * Applied to agent-parsed items on PROCESS_SUCCESS and to a rehydrated draft on HYDRATE; the manual
 * paths seed in their own reducers.
 */
function seedCertRule(items: EquipmentItem[], taxonomy: Taxonomy, sharedSafety: readonly SafetyCertificate[]): EquipmentItem[] {
  return items.map((i) => {
    let next = i;
    if (!hasEquipmentCert(i, sharedSafety) && i.ref.categoryId) {
      next = { ...next, safetyCertsOverride: [equipmentCertDefault(isLiftingCategory(i.ref, taxonomy))] };
    }
    if (next.operatorNeeded === "yes" && next.operator.certificate.length === 0) {
      next = { ...next, operator: { ...next.operator, certificate: [operatorCertDefault()] } };
    }
    return next;
  });
}

/**
 * Whether an item already carries an EQUIPMENT cert — its own override, else the request-wide default.
 * The app checks the item's own list (it has no inheritance model); here an item with no override that
 * inherits a request-wide cert counts as covered, so a re-seed can't silently break that inheritance by
 * stamping an override.
 */
function hasEquipmentCert(i: EquipmentItem, sharedSafety: readonly SafetyCertificate[]): boolean {
  if ((i.safetyCertsOtherText ?? "").trim() !== "") return true;
  return (i.safetyCertsOverride ?? sharedSafety).length > 0;
}

/** Exported for unit tests — the wizard's whole edit model lives here, so the cert rule and the
 *  request-wide fan-out are asserted against the real reducer rather than a re-implementation. */
export function reducer(state: RfqState, a: Action): RfqState {
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
      return { ...state, phase: "processing", busy: true, error: null, errorDetail: null, guestLimit: false };
    case "GUEST_LIMIT":
      // Signed-out visitor hit the server parse cap → back to intake with the flag set; Intake opens the
      // account modal (same UX as the client-side localStorage nudge), never an error screen.
      return { ...state, busy: false, phase: "intake", error: null, errorDetail: null, guestLimit: true };
    case "PROCESS_SUCCESS": {
      // Cert rule: give every agent-parsed item its category-based certificate up front. Without this,
      // an item the agent left without `safety_certifications` reached Step 2 (and submit) with no cert
      // at all, while the same item created by hand got Aramco/TÜV from SET_ITEM_CATEGORY.
      const seededItems = seedCertRule(a.draft.items, state.taxonomy, a.draft.project.certificates.safety);
      return {
        ...state,
        busy: false,
        error: null,
        draft: {
          rfqId: a.draft.rfqId ?? null, // A5: anchor for the web_review correction fired at submit
          project: a.draft.project,
          items: seededItems,
          preferences: a.draft.preferences ?? defaultPreferences(), // agent-inferred Step-3 prefs when present
          detectedLocations: a.draft.detectedLocations,
          summary: a.draft.summary,
          justifications: a.draft.justifications ?? [],
          fieldNotes: a.draft.fieldNotes ?? {},
        },
        // Snapshot the agent's values (refs are safe — all edits are immutable copies). The SEEDED
        // items are snapshotted, not the raw ones: the cert seed is our default, not a renter edit, so
        // comparing against the raw items would mark every draft "edited" and fire a spurious
        // web_review correction on every submit.
        agentOrigin: { project: a.draft.project, items: seededItems },
        multiLocationDismissed: false,
      };
    }
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
      // otherwise ignore the request-wide click).
      //
      // App parity (`_onEquipmentDefaultsSet`): the pick also seeds the SPSP operator cert on items that
      // include an operator. The app OVERWRITES that cert; here it is seeded only when the item has none,
      // because the web panel sits beside the item cards (not on an earlier step), so overwriting would
      // wipe an operator cert the renter had just chosen a few rows down.
      return withDraft(state, (d) => ({
        ...d,
        project: { ...d.project, certificates: { ...d.project.certificates, ...a.patch } },
        items:
          a.patch.safety !== undefined
            ? d.items.map((i) => ({
                ...i,
                safetyCertsOverride: null,
                // The request-wide pick replaces each item's whole cert list, so its free-text "Other"
                // goes too — the request-wide box has its own text (`certificates.safetyOther`).
                safetyCertsOtherText: null,
                operator:
                  i.operatorNeeded === "yes" && i.operator.certificate.length === 0
                    ? { ...i.operator, certificate: [operatorCertDefault()] }
                    : i.operator,
              }))
            : d.items,
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
      return withDraft(state, (d) =>
        mapItem(d, a.id, (i) => {
          const next = { ...i, ...a.patch };
          // App parity (`kDefaultOperatorCertCode`): enabling the operator seeds SPSP — for every
          // equipment group, independent of the item's equipment cert — and only when none is set yet.
          // The renter can still change it.
          if (a.patch.operatorNeeded === "yes" && next.operator.certificate.length === 0) {
            return { ...next, operator: { ...next.operator, certificate: [operatorCertDefault()] } };
          }
          return next;
        }),
      );
    case "PATCH_ITEM_OPERATOR":
      return withDraft(state, (d) => mapItem(d, a.id, (i) => ({ ...i, operator: { ...i.operator, ...a.patch } })));
    case "SET_ITEM_CATEGORY":
      // AC-21: changing category clears & re-prompts subcategory + measurement. Also reset fuel to the
      // default (diesel) — the old value (e.g. electric for a suspended platform) no longer fits the new
      // equipment type (an excavator) — and drop the now-stale agent fuel hint for this item.
      return withDraft(state, (d) => {
        const d2 = mapItem(d, a.id, (i) => {
          const categoryChanged = i.ref.categoryId !== a.categoryId;
          const next = {
            ...i,
            ref: { categoryId: a.categoryId, subcategoryId: null, measurementId: null },
            fuelType: "diesel" as const,
            resolved: false,
          };
          // App parity (`_onEquipmentTypePicked`: `categoryChanged || safetyCertifications.isEmpty`):
          // (re)picking the category re-seeds the category-based equipment cert — lifting → Aramco, else
          // TÜV — plus the SPSP operator cert when the operator is on. Fires on an actual category change
          // OR when the line still has no cert at all, so a re-pick of the SAME category still rescues an
          // uncertified line; a renter's own cert survives a no-op re-pick either way. A later
          // request-wide "settings for all" pick still overrides via SET_CERTIFICATES.
          if (categoryChanged || !hasEquipmentCert(i, d.project.certificates.safety)) {
            next.safetyCertsOverride = [equipmentCertDefault(isLiftingCategory(next.ref, state.taxonomy))];
            // The rule replaces the whole cert list, so drop any free-text "Other" cert carried over
            // from the previous equipment. App parity: `_applyCertRule` clears `_otherSafetyController`.
            next.safetyCertsOtherText = null;
            if (next.operatorNeeded === "yes") {
              next.operator = { ...next.operator, certificate: [operatorCertDefault()] };
            }
          }
          return next;
        });
        const noteKey = `line_items[${a.id.slice(1)}].fuel_type_preference`;
        if (d2.fieldNotes && noteKey in d2.fieldNotes) {
          const fieldNotes = { ...d2.fieldNotes };
          delete fieldNotes[noteKey];
          return { ...d2, fieldNotes };
        }
        return d2;
      });
    case "SET_ITEM_SUBCATEGORY":
      // AC-21: changing subcategory clears & re-prompts measurement; reset operator default (AC-24).
      return withDraft(state, (d) =>
        mapItem(d, a.id, (i) => {
          const operatorNeeded = defaultOperatorNeeded(a.subcategoryId);
          const next = {
            ...i,
            ref: { ...i.ref, subcategoryId: a.subcategoryId, measurementId: null },
            operatorNeeded,
            resolved: false,
          };
          // App parity (`_onEquipmentVariantPicked`, which re-seeds when the line has no cert): picking
          // the subcategory rescues a line that still carries no equipment cert. It also refines the
          // lifting test on an UNTAGGED taxonomy, where "Material Handling → Forklifts" only reads as
          // lifting once the subcategory is known. A line that already has a cert is left alone.
          if (!hasEquipmentCert(next, d.project.certificates.safety) && next.ref.categoryId) {
            next.safetyCertsOverride = [equipmentCertDefault(isLiftingCategory(next.ref, state.taxonomy))];
          }
          // Same app-parity seed as the manual operator toggle (PATCH_ITEM): if the subcategory
          // auto-enables the operator and no cert is set, default it to SPSP.
          if (operatorNeeded === "yes" && next.operator.certificate.length === 0) {
            return { ...next, operator: { ...next.operator, certificate: [operatorCertDefault()] } };
          }
          return next;
        }),
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
        // App parity (`_withGlobalEquipmentDefaults`): a fresh line arrives with the operator on, so it
        // already carries the SPSP operator cert. Its EQUIPMENT cert can't be seeded yet — there's no
        // category to classify — and lands on the first category pick (SET_ITEM_CATEGORY).
        const blank = newManualItem(`m${state.seq}`);
        const seeded =
          blank.operatorNeeded === "yes" && blank.operator.certificate.length === 0
            ? { ...blank, operator: { ...blank.operator, certificate: [operatorCertDefault()] } }
            : blank;
        const items = [...d.items, seeded];
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
    case "SET_TRIAL":
      return { ...state, isTrial: a.isTrial };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        busy: false,
        phase: "confirmation",
        requestId: a.requestId,
        requestIds: a.requestIds,
        requestUuids: a.requestUuids,
        trialExpiresAt: a.trialExpiresAt ?? null,
      };
    case "SUBMIT_ERROR":
      return { ...state, busy: false, error: a.kind, errorDetail: a.detail ?? null };
    case "RESET":
      return { ...initialState, taxonomy: state.taxonomy };
    case "HYDRATE": {
      // Restore a saved draft on reload (web-app/002) — keep the freshly-fetched taxonomy, and raise
      // the continue/start-over prompt so the renter decides to resume or reset.
      // Re-run the cert seed: a draft saved before the rule shipped (or one whose items the agent left
      // uncertified) would otherwise resume — and submit — with no certificate at all.
      const restored = { ...state, ...a.saved, taxonomy: state.taxonomy, draftPrompt: true };
      if (!restored.draft) return restored;
      const shared = restored.draft.project.certificates.safety;
      return {
        ...restored,
        draft: { ...restored.draft, items: seedCertRule(restored.draft.items, state.taxonomy, shared) },
        // Seed the snapshot the same way, so the defaults we just filled in aren't mistaken for renter
        // edits at submit (same reasoning as PROCESS_SUCCESS).
        agentOrigin: restored.agentOrigin
          ? { ...restored.agentOrigin, items: seedCertRule(restored.agentOrigin.items, state.taxonomy, shared) }
          : restored.agentOrigin,
      };
    }
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
        if (e instanceof ApiError && e.kind === "guest_limit") { dispatch({ t: "GUEST_LIMIT" }); return; }
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

    /** mobile/016 — enter/leave trial mode for this run (set from `/create?mode=trial`). */
    setTrial: (isTrial: boolean) => dispatch({ t: "SET_TRIAL", isTrial }),

    async submit() {
      const s = getState();
      if (!s.draft) return;
      dispatch({ t: "SUBMIT_START" });
      // A5: did the renter edit the agent's original draft? Compared here (before submit) against the
      // agentOrigin snapshot; the correction is fired AFTER a successful create — fire-and-forget, so it
      // never blocks or fails the request. Only for real-agent drafts (rfqId present).
      const finalItems = postableItems(s.draft.items); // AC-33/34: exclude no-match/removed
      const origin = s.agentOrigin;
      const editedFromDraft =
        !!origin &&
        JSON.stringify([s.draft.project, finalItems]) !== JSON.stringify([origin.project, postableItems(origin.items)]);
      try {
        const { requestId, requestIds, requestUuids, trialExpiresAt } = await submitRequest({
          project: s.draft.project,
          items: finalItems,
          preferences: s.draft.preferences,
          simulateError: s.simulateError,
          // mobile/016 — sent only for a trial run; a real request's payload is unchanged.
          ...(s.isTrial ? { isTrial: true } : {}),
        });
        dispatch({
          t: "SUBMIT_SUCCESS",
          requestId,
          requestIds: requestIds ?? (requestId ? [requestId] : []),
          requestUuids: requestUuids ?? [],
          trialExpiresAt,
        });
        if (s.draft.rfqId && editedFromDraft) {
          const patch = draftToRfqCorrection(
            { project: s.draft.project, items: finalItems, preferences: s.draft.preferences },
            s.taxonomy,
          );
          void postRfqCorrection(s.draft.rfqId, patch);
        }
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
  const { phase, step, draft, text, multiLocationDismissed, seq, agentOrigin, isTrial } = state;
  useEffect(() => {
    try {
      if (draft && (phase === "intake" || phase === "wizard")) {
        window.localStorage.setItem(
          DRAFT_STORAGE_KEY,
          // mobile/016 — `isTrial` rides along so a reload mid-flow resumes as a trial. Without it a
          // rehydrated draft would submit as a REAL (dispatched) request the renter never asked for.
          JSON.stringify({ phase, step, draft, text, multiLocationDismissed, seq, agentOrigin, isTrial, userId: user?.id ?? null }),
        );
      } else if (phase === "confirmation") {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY); // request sent → clear the saved draft
      }
    } catch {
      /* ignore quota/availability errors */
    }
  }, [phase, step, draft, text, multiLocationDismissed, seq, agentOrigin, isTrial, user]);

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
