"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { ReactNode } from "react";
import {
  AgentDraft,
  Certificates,
  DirectTarget,
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
import {
  ApiError,
  ApiErrorKind,
  fetchTaxonomy,
  postRfqCorrection,
  processRfq,
  processQuick,
  ingestClientMatch,
  submitRequest,
} from "@/lib/api/client";
import { decideTier } from "@/lib/agent/tier";
import { quickResultToDraft, quickItemsToDraft } from "@/lib/agent/quick-draft";
import type { SiteLocation, ProjectDefaults, ProjectSummary } from "@/lib/contract/project";
import type { PaymentTerm } from "@/lib/contract/options";
import { projectTitle, filingFor } from "@/lib/contract/project";
import { applyProjectDefaults, applyMachineTerms, machineTermsOf } from "@/lib/contract/project-apply";
import { blankTerms, type MachineTerms } from "@/lib/contract/work-order";
import { draftToRfqCorrection } from "@/lib/api/agent-adapters";
import { useSession } from "@/lib/session";

export type Phase = "intake" | "processing" | "wizard" | "confirmation";

/**
 * Which canvas panel is open (MREQ-AC-01). Replaces the four-step `Step`: the canvas has no steps,
 * only three accordion panels and a review screen, and `null` means every panel is collapsed.
 */
export type Section = "equipment" | "where" | "when";

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
/**
 * How long the processing screen stays up at minimum.
 *
 * Long enough to register as a step that happened rather than a flicker; short enough that nobody
 * reads it as slow. Tier 0 answers in ~50 ms, so on that path this is almost the whole visible
 * duration — see `holdProcessing`.
 */
const FLOOR_MS = 700;

/**
 * Waits out whatever is LEFT of the processing floor, and nothing more.
 *
 * ⚠️ Tier 0 resolves with no `await` in it — a string match against a taxonomy the browser already
 * holds — so `PROCESS_START` and `PROCESS_SUCCESS` land in the same React batch and the screen never
 * paints. The parse worked; the renter saw a flicker and a filled form, which reads like a form that
 * was always filled (owner, 2026-08-31: *"even if agent is too fast i still want to show the agent
 * processing screen, just for the user to feel there is real agent"*).
 *
 * Not decoration: this product's claim is that something READ what they wrote, and this screen is
 * the only moment that claim is visible.
 *
 * A floor rather than a delay, so a path that already spent longer waits for nothing — Tier 2 takes
 * four seconds and needs no help feeling real. Nobody waits for the sake of waiting.
 */
async function holdProcessing(startedAt: number): Promise<void> {
  const left = FLOOR_MS - (Date.now() - startedAt);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
}

export function agentMatches(current: unknown, original: unknown): boolean {
  if (original == null || original === "" || (Array.isArray(original) && original.length === 0)) return false;
  return JSON.stringify(current) === JSON.stringify(original);
}

export interface RfqState {
  phase: Phase;
  /** The open canvas panel; `null` when all three are collapsed. */
  activeSection: Section | null;
  /** Which equipment item the canvas is showing (0-based index into the live items). */
  itemIndex: number;
  /**
   * MREQ-AC-05 — the renter has read and accepted how many days suppliers will actually price.
   * Gates *When it runs*, and with it the review screen. Deliberately NOT part of the draft: it is
   * an acknowledgement of a figure, and a figure that changes (new dates, new billing basis) has
   * not been acknowledged yet.
   */
  chargedDaysUnderstood: boolean;
  /** MREQ-AC-42 — the read-only Ready-to-send screen is showing instead of the canvas. */
  readyToSend: boolean;
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
  /**
   * The store this request was started from, when it was — it submits as DIRECT to that supplier
   * alone (app parity, Epic 008) instead of broadcasting to everyone who matches.
   *
   * Set from `/create?supplierId=…`, and it rides with the draft so a reload mid-flow cannot quietly
   * turn one supplier's request into a broadcast. A direct run also starts from a CLEAN draft: the
   * mobile flow refuses to restore a stored draft into a direct request for the same reason — a
   * broadcast the renter wrote for the whole market must not be re-addressed to one firm behind his
   * back. The stored draft is left in place, unread, and is still there for his next broadcast.
   */
  direct: DirectTarget | null;

  /* ── PROJ: the site this request is being written for ─────────────────────────────────── */

  /**
   * The site picked on the intake screen, held as a **request-local COPY**, never a reference.
   *
   * A copy because the pills edit it and the project must not move: change *hrs/day* to 12 here and
   * Qiddiya still says 10. It is also what makes the feature safe to reason about — nothing flows
   * back, and nothing flows down again once the copy is taken.
   *
   * Chosen BEFORE the agent runs, applied AFTER it returns. The agent is never sent one of these
   * values and never returns one, so a site's terms cannot come back altered by a model that never
   * saw them.
   */
  project: { id: string; title: string; location: SiteLocation; defaults: ProjectDefaults } | null;
  /**
   * The line a TEMPLATE typed into the intake box, verbatim.
   *
   * Held so the box can colour it: the renter needs to see which words are theirs and which arrived
   * from the site they picked (owner, 2026-08-31). Stored as the STRING rather than as character
   * offsets, which makes it self-healing — the moment the renter edits those words the string stops
   * matching, the colour goes, and the text is simply theirs. Offsets would have to be tracked
   * through every keystroke and would eventually point at somebody else's sentence.
   */
  projectTypedLine: string | null;
  /**
   * Which pills the renter changed on this request. They render as changed, and the fields they
   * cover read `renter` rather than `project` once the draft exists — once someone has answered a
   * question, it stops being the site's answer.
   */
  projectDirty: string[];
  /** Provenance only — the work order a template was copied from (W-T9). Changes no rendering. */
  workOrderGroupId: string | null;
  /**
   * When the current parse started, or null when nothing is running (W-T23).
   *
   * The intake screen keeps the renter in place while a parse is quick and hands over to the
   * processing screen only when it is not. A full-screen takeover for something that finishes in
   * 400 ms is a flash of a page nobody had time to read; a spinner in a corner for eleven seconds
   * is a page that looks broken. The timestamp is what lets one surface decide between them.
   */
  processingSince: number | null;
  /**
   * The machine terms lifted off a template, waiting for the agent to return.
   *
   * Held rather than applied, because at intake there are no draft lines to apply them to. A ONE-TIME
   * copy: the source is never read again, so deleting that work order next month changes nothing
   * about this request.
   */
  templateTerms: MachineTerms | null;
}

/** Exported alongside {@link reducer} so tests start from the real initial state. */
export const initialState: RfqState = {
  phase: "intake",
  activeSection: "equipment",
  itemIndex: 0,
  chargedDaysUnderstood: false,
  readyToSend: false,
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
  direct: null,
  project: null,
  projectDirty: [],
  projectTypedLine: null,
  workOrderGroupId: null,
  templateTerms: null,
  processingSince: null,
};

type Action =
  | { t: "SET_TAXONOMY"; taxonomy: Taxonomy }
  | { t: "SET_TEXT"; text: string }
  | { t: "ADD_FILES"; files: { name: string; type: string; data?: string }[] }
  | { t: "REMOVE_FILE"; index: number }
  | { t: "SET_SIMULATE_ERROR"; value: boolean }
  | { t: "PROCESS_START" }
  | { t: "ESCALATE_PROCESSING" }
  | { t: "PROCESS_SUCCESS"; draft: AgentDraft }
  | { t: "PROCESS_ERROR"; kind: ApiErrorKind; detail?: RfqState["errorDetail"] }
  | { t: "GUEST_LIMIT" }
  | { t: "ENTER_WIZARD" }
  | { t: "RESUME_WIZARD" }
  | { t: "GO_INTAKE" }
  | { t: "RESUME_DRAFT" }
  | { t: "OPEN_SECTION"; section: Section | null }
  | { t: "GO_ITEM"; index: number }
  | { t: "SET_CHARGED_DAYS_UNDERSTOOD"; value: boolean }
  | { t: "SET_READY_TO_SEND"; value: boolean }
  | { t: "TOUCH_FIELD"; key: string }
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
  | { t: "REQUEST_SOURCING"; id: string }
  | { t: "PATCH_PREFERENCES"; patch: DeepPrefPatch }
  | { t: "SET_TRIAL"; isTrial: boolean }
  | { t: "SET_DIRECT"; direct: DirectTarget | null }
  | { t: "SELECT_PROJECT"; project: ProjectSummary }
  | { t: "PROJECT_TYPED"; line: string | null }
  | { t: "CLEAR_PROJECT" }
  | { t: "PATCH_PROJECT_DEFAULTS"; patch: Partial<TimingHours>; keys: string[] }
  | { t: "PATCH_PROJECT_TERMS"; paymentTerms: PaymentTerm | null }
  | { t: "PATCH_PROJECT_SITE"; location: SiteLocation }
  | { t: "SET_WORK_ORDER_SOURCE"; groupId: string | null }
  | { t: "USE_TEMPLATE"; terms: MachineTerms | null; groupId: string | null; when: { startDate: string | null; endDate: string | null } | null }
  /** Change one of the copied terms on THIS request. Marks the fields so the pill shows as changed. */
  | { t: "PATCH_TEMPLATE_TERMS"; patch: Partial<MachineTerms>; keys: string[] }
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
 * The 2026-07 cert-rule seed pass USED to live here — it stamped every item that had no cert with one
 * chosen by category (lifting → Aramco, else TÜV), mirroring `_withGlobalEquipmentDefaults`
 * (create_request_bloc.dart). It is gone, in the app first and now here: picking nothing in step 1 must
 * leave every line blank, for the equipment cert exactly as for the operator cert.
 *
 * Nothing replaces it. A line with no per-item override inherits the request-wide step-1 pick
 * (`safetyCertsOverride ?? project.certificates.safety`, read at submit), so a renter who does choose a
 * cert once in step 1 sees it on every line in step 2 — lifting included, since no category rule
 * intercepts it any more. A renter who chooses nothing sends no cert requirement, which is what they
 * asked for. See the note in options.ts for why a seeded cert is not cosmetic.
 */

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
    /**
     * A parse begins, and the renter STAYS on the intake screen (W-T23).
     *
     * Taking the whole page for something that finishes in 400 ms is a flash of a screen nobody had
     * time to read. `processingSince` is stamped so the surface can hand over to the processing
     * screen if it turns out to be slow after all — see ESCALATE_PROCESSING.
     */
    case "PROCESS_START":
      return {
        ...state,
        busy: true,
        processingSince: Date.now(),
        error: null,
        errorDetail: null,
        guestLimit: false,
      };
    /** It was not quick. Hand over, rather than leaving a spinner in a corner for eleven seconds. */
    case "ESCALATE_PROCESSING":
      return state.busy && state.phase === "intake" ? { ...state, phase: "processing" } : state;
    case "GUEST_LIMIT":
      // Signed-out visitor hit the server parse cap → back to intake with the flag set; Intake opens the
      // account modal (same UX as the client-side localStorage nudge), never an error screen.
      return { ...state, busy: false, phase: "intake", error: null, errorDetail: null, guestLimit: true };
    case "PROCESS_SUCCESS": {
      // No cert seeding. An agent-parsed item keeps whatever `safety_certifications` the RFQ text
      // actually named and nothing more — an item the text said nothing about reaches Step 2 blank,
      // which is now also true of one created by hand.
      const seededItems = a.draft.items;
      // Snapshot the agent's values (refs are safe — all edits are immutable copies). The SEEDED
      // items are snapshotted, not the raw ones: the cert seed is our default, not a renter edit, so
      // comparing against the raw items would mark every draft "edited" and fire a spurious
      // web_review correction on every submit.
      const origin = { project: a.draft.project, items: seededItems };

      const parsed: RfqDraft = {
        rfqId: a.draft.rfqId ?? null, // A5: anchor for the web_review correction fired at submit
        project: a.draft.project,
        items: seededItems,
        preferences: a.draft.preferences ?? defaultPreferences(), // agent-inferred Step-3 prefs when present
        detectedLocations: a.draft.detectedLocations,
        summary: a.draft.summary,
        justifications: a.draft.justifications ?? [],
        fieldNotes: a.draft.fieldNotes ?? {},
        // MREQ-AC-59 — a freshly parsed draft has been touched by nobody. Every value on it came
        // from the agent or from our own seeds, and the canvas says so on each control.
        touchedFields: [],
      };

      /* PROJ — the merge happens HERE: in the browser, after the parse, never before it.
         `applyProjectDefaults` leaves alone every field the agent filled, so a renter who wrote
         "from Oct 1" keeps October even though the site says 1 September. A pill they already
         changed carries into `touchedFields`, so it reads as theirs and not as the site's. */
      const withProject: RfqDraft = state.project
        ? (() => {
            const applied = applyProjectDefaults(parsed, state.project.defaults, state.project.location, origin);
            return {
              ...applied.draft,
              projectId: state.project.id,
              workOrderGroupId: state.workOrderGroupId,
              projectFields: applied.filled,
              touchedFields: state.projectDirty,
            };
          })()
        : parsed;

      /* The template, after the project and under the same rule: a line whose text said "with
         operator" keeps what the agent read. It copies terms only — never the equipment, which
         always comes from what the renter typed. */
      const draft: RfqDraft = state.templateTerms
        ? { ...applyMachineTerms(withProject, state.templateTerms, origin).draft, projectId: withProject.projectId, workOrderGroupId: withProject.workOrderGroupId, projectFields: withProject.projectFields, touchedFields: withProject.touchedFields }
        : withProject;

      return {
        ...state,
        busy: false,
        processingSince: null,
        error: null,
        draft,
        agentOrigin: origin,
        multiLocationDismissed: false,
        // Never escalated — so there is no processing screen to hand off from, and the canvas is
        // where the renter is going. Escalated runs keep today's path: Processing calls enterWizard.
        ...(state.phase === "intake" ? { phase: "wizard" as const, activeSection: "equipment" as const, itemIndex: 0 } : {}),
      };
    }
    /* ── PROJ ───────────────────────────────────────────────────────────────────
       Selecting COPIES the site's values in; it never holds a reference. The pills edit that copy,
       so changing hrs/day here cannot move the project.

       Deselecting drops the copy WHOLE (PROJ-AC-26). There is no half state in which some prefills
       outlive a project the renter has removed - which is the failure a partial reset would
       produce, and the renter would have no way to see it. */
    case "SELECT_PROJECT":
      return {
        ...state,
        project: {
          id: a.project.id,
          title: projectTitle(a.project),
          location: { ...a.project.location },
          defaults: { timing: { ...a.project.defaults.timing }, paymentTerms: a.project.defaults.paymentTerms },
        },
        projectDirty: [],
      };
    case "PROJECT_TYPED":
      return { ...state, projectTypedLine: a.line };
    case "CLEAR_PROJECT":
      // The template goes with the site. It was a thing INSIDE that project, so leaving its terms
      // behind would carry values from a site the renter just removed, with nothing on screen
      // saying where they came from.
      // The typed line goes too: the words stay in the box (the renter may want them) but nothing
      // colours them as the site's any more, because there is no site.
      return { ...state, project: null, projectDirty: [], workOrderGroupId: null, templateTerms: null, projectTypedLine: null };
    /* A pill edit. `keys` are the dotted paths it covers, recorded so the field reads `renter` on
       the canvas afterwards rather than `project` - once someone answers a question it stops being
       the site's answer. */
    case "PATCH_PROJECT_DEFAULTS":
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          defaults: { ...state.project.defaults, timing: { ...state.project.defaults.timing, ...a.patch } },
        },
        projectDirty: [...new Set([...state.projectDirty, ...a.keys])],
      };
    /* The one commercial term, edited from the same strip and under the same rule. Its dirty key is
       the draft path `applyProjectDefaults` fills, not a defaults path, because that is what
       `touchedFields` is compared against on the canvas. */
    case "PATCH_PROJECT_TERMS":
      if (!state.project) return state;
      return {
        ...state,
        project: { ...state.project, defaults: { ...state.project.defaults, paymentTerms: a.paymentTerms } },
        projectDirty: [...new Set([...state.projectDirty, "preferences.payment_terms"])],
      };
    case "PATCH_PROJECT_SITE":
      if (!state.project) return state;
      return {
        ...state,
        project: { ...state.project, location: a.location },
        projectDirty: [...new Set([...state.projectDirty, "location.label"])],
      };
    case "SET_WORK_ORDER_SOURCE":
      return { ...state, workOrderGroupId: a.groupId };
    /* Start from. The terms wait for the agent; the source's OWN period lands on the project copy
       now, so the pills show what this request will actually run to. It is not marked dirty — the
       value still came from inside the site, not from the renter answering a question. */
    case "USE_TEMPLATE": {
      const when = a.when;
      const project =
        state.project && when
          ? {
              ...state.project,
              defaults: {
                ...state.project.defaults,
                timing: {
                  ...state.project.defaults.timing,
                  startDate: when.startDate ?? state.project.defaults.timing.startDate,
                  endDate: when.endDate ?? state.project.defaults.timing.endDate,
                },
              },
            }
          : state.project;
      return { ...state, templateTerms: a.terms, workOrderGroupId: a.groupId, project };
    }

    /**
     * Edit a term the template copied.
     *
     * Changes THIS request and nothing else (PROJ-AC-25). `templateTerms` is what gets applied to
     * every line at submit, so editing it here is editing the answer that will be sent — the machine
     * it was copied from is untouched, and so is the site.
     *
     * The touched keys ride along, because a value the renter changed has to stop reading *from your
     * project* and start reading as theirs.
     */
    case "PATCH_TEMPLATE_TERMS": {
      /**
       * ⚠️ It used to `return state` when there was no template, which meant a renter who picked a
       * SITE and nothing else could not answer delivery, return or fuel at all — the pills took his
       * press and did nothing (owner, 2026-09-01).
       *
       * A blank set is started instead. Those three are required, and a request that cannot state
       * them is a request every supplier has to ask about before he can price it.
       */
      return {
        ...state,
        templateTerms: { ...(state.templateTerms ?? blankTerms()), ...a.patch },
        projectDirty: [...new Set([...state.projectDirty, ...a.keys])],
      };
    }
    case "PROCESS_ERROR":
      // Back to intake with the text intact (AC-10), wherever the failure happened.
      return { ...state, busy: false, processingSince: null, phase: "intake", error: a.kind, errorDetail: a.detail ?? null };
    case "ENTER_WIZARD":
      return { ...state, phase: "wizard", activeSection: "equipment", itemIndex: 0, readyToSend: false };
    case "RESUME_WIZARD":
      // Return to the wizard at the SAME step (e.g. from the "Your request" input step) — no re-parse.
      return { ...state, phase: "wizard", error: null };
    case "GO_INTAKE":
      // Return to intake preserving text/files (AC-10: input preserved). Keeps `activeSection` and
      // `itemIndex` so returning to the canvas lands where the renter left it.
      return { ...state, phase: "intake", error: null };
    case "RESUME_DRAFT":
      // "Continue draft": dismiss the prompt and drop the renter back INTO the review wizard at the
      // step they left (restored by HYDRATE) — never the raw "Your request" input screen, whose
      // primary action is "Re-analyze" and would discard their edits. A rehydrated draft has always
      // already been processed (the prompt only shows when a saved draft exists).
      return { ...state, draftPrompt: false, phase: "wizard", error: null };
    case "OPEN_SECTION":
      return { ...state, activeSection: a.section };
    case "GO_ITEM":
      // The canvas always opens a new item on its equipment panel — the site and schedule are
      // request-wide, so there is nothing item-specific behind the other two.
      return { ...state, itemIndex: Math.max(0, a.index), activeSection: "equipment" };
    case "SET_CHARGED_DAYS_UNDERSTOOD":
      return { ...state, chargedDaysUnderstood: a.value };
    case "SET_READY_TO_SEND":
      return { ...state, readyToSend: a.value, activeSection: a.value ? null : "equipment" };
    case "TOUCH_FIELD":
      // Idempotent: the renter answering the same control twice is still one answer.
      return withDraft(state, (d) =>
        (d.touchedFields ?? []).includes(a.key) ? d : { ...d, touchedFields: [...(d.touchedFields ?? []), a.key] },
      );
    case "PATCH_LOCATION":
      // AC-16: changing the location (map/search/GPS) invalidates a prior confirmation — require a
      // fresh confirm. The patch can still set `confirmed` explicitly (e.g. the "Change" button).
      //
      // It also RECORDS the field as the renter's (owner, 2026-08-31: *"if a user changes the
      // location it no longer shows the 'from your project' label"*). Provenance reads
      // `touchedFields`, so without this the panel went on crediting the site for a pin the renter
      // had just dragged somewhere else — the one case where the label is actively wrong.
      return withDraft(state, (d) => ({
        ...d,
        project: { ...d.project, location: { ...d.project.location, ...a.patch, confirmed: a.patch.confirmed ?? false } },
        touchedFields: (d.touchedFields ?? []).includes("location.label")
          ? d.touchedFields
          : [...(d.touchedFields ?? []), "location.label"],
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
    case "PATCH_TIMING": {
      // MREQ-AC-05 — the charged-day acknowledgement is about a specific number. Changing a date,
      // the billing basis or the hours changes that number, so the previous acceptance no longer
      // refers to anything and the renter is asked again. Silently keeping the tick would let a
      // request go out against a figure nobody ever saw.
      const changesFigure =
        a.patch.startDate !== undefined ||
        a.patch.endDate !== undefined ||
        a.patch.rentalBasis !== undefined ||
        a.patch.hoursPerDay !== undefined;
      const next = withDraft(state, (d) => ({ ...d, project: { ...d.project, timing: { ...d.project.timing, ...a.patch } } }));
      return changesFigure ? { ...next, chargedDaysUnderstood: false } : next;
    }
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
      // This is the EQUIPMENT cert only. The app's `_onEquipmentDefaultsSet` also stamps the SPSP
      // operator cert here (and overwrites the renter's own pick doing it); we no longer seed an
      // operator cert at all, so the operator side is left exactly as the renter left it.
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
      // Turning the operator ON no longer seeds an operator cert — "I need an operator" is not
      // "I require an SPSP-certified operator". The chip row starts empty for the renter to fill.
      return withDraft(state, (d) => mapItem(d, a.id, (i) => ({ ...i, ...a.patch })));
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
          // Picking the category no longer stamps a cert. It used to seed lifting → Aramco / else TÜV
          // (app parity `_onEquipmentTypePicked` → `_applyCertRule`), which is exactly the silent guess
          // that has now been withdrawn: the line stays blank until the renter taps one themselves.
          //
          // A real category change still CLEARS the line's per-item cert, because a cert chosen for an
          // excavator is not an answer about a crane. Clearing drops the line back to inheriting the
          // step-1 "settings for all" pick — so a renter who chose once in step 1 keeps that choice on
          // this line, and one who chose nothing gets nothing. It does not stamp anything. App parity:
          // `_withCertRule` returns `const []` when no global is set, else the global.
          if (categoryChanged) {
            next.safetyCertsOverride = null;
            next.safetyCertsOtherText = null;
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
          // No cert seeding here either. This used to "rescue" an uncertified line by stamping the
          // category default once the subcategory refined the lifting test (`_onEquipmentVariantPicked`)
          // — but an uncertified line no longer needs rescuing; it is the renter's answer. The app's
          // variant handler re-applies only the step-1 global, which an override-less line already
          // inherits here.
          //
          // A subcategory that auto-enables the operator (AC-24) enables the operator and nothing more —
          // no operator cert is seeded alongside it.
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
        // A fresh line arrives with the operator on (AC-24) but with NO certs of either kind: the
        // app's `_withGlobalEquipmentDefaults` stamps SPSP right here, which is why every request built
        // by adding lines came out demanding it. The EQUIPMENT cert lands on the first category pick
        // (SET_ITEM_CATEGORY) — there's no category to classify yet.
        const fresh = newManualItem(`m${state.seq}`);

        /* ── A second machine inherits the FIRST one's terms (owner, 2026-08-31) ─────────────────
         *
         * *"The first item values selected in the request are number 1 priority to be passed to the
         * next item terms — and in case of conflict with the project or the text, priority to what
         * he selected in the request."*
         *
         * ⚠️ It did not happen at all here. The work-order form has done this since it was built
         * (`blankMachine(seed)`), and the REQUEST added a blank line — so a renter who set delivery,
         * fuel, operator and a certificate on machine 1 answered all four again on machine 2, on a
         * screen that had just shown them the answers.
         *
         * Item 1 wins over the project and over the text, and that ordering is the renter's own
         * instruction rather than an accident of when things run: the project and the agent both
         * spoke at parse time, before this line existed, and item 1 is the most recent statement
         * about how THIS request works. Nothing re-applies over it afterwards.
         *
         * The equipment itself is never copied — only the commercial terms. A second machine is a
         * different machine; that is why it is being added. */
        const first = d.items[0];
        const seeded = first
          ? ({ ...fresh, ...machineTermsOf(first), operator: { ...first.operator } } as EquipmentItem)
          : fresh;

        const items = [...d.items, seeded];
        return { ...d, items, summary: computeSummary(items) };
      });
    case "REMOVE_ITEM":
      return withDraft(state, (d) => mapItem(d, a.id, (i) => ({ ...i, removed: true })));
    case "REQUEST_SOURCING":
      // AC-31: hand off to WhatsApp WITHOUT deleting the item — it stays on screen as "we're on it",
      // so coming back from WhatsApp doesn't look like the equipment was silently dropped. It still
      // never posts (no-match is excluded by `postableItems`) and still never blocks Step 2.
      return withDraft(state, (d) => mapItem(d, a.id, (i) => ({ ...i, sourcingRequested: true, removed: false })));
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
    case "SET_DIRECT": {
      // Same target as the draft already carries → nothing to do (a re-render, a Back, a reload).
      if ((state.direct?.supplierId ?? null) === (a.direct?.supplierId ?? null)) return { ...state, direct: a.direct };
      // A different target (or none) → the draft in hand belongs to the other request. Drop it rather
      // than re-address it; localStorage is untouched, so a broadcast draft survives for its own flow.
      return {
        ...state,
        direct: a.direct,
        draft: null,
        agentOrigin: null,
        draftPrompt: false,
        phase: "intake",
        readyToSend: false,
        activeSection: null,
        itemIndex: 0,
      };
    }
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
      //
      // A cert seed used to re-run here, on the reasoning that a draft resuming with no certificate was
      // a gap to fill. It isn't: no certificate is a valid, deliberate answer, and re-stamping one on
      // resume would put a requirement back that the renter had left blank on purpose — the one moment
      // they can't see it happen. The app doesn't seed on draft load either (neither `_withCertRule` nor
      // `_withGlobalEquipmentDefaults` is reachable from `_onDraftLoaded`/`_onStashRestored`).
      return { ...state, ...a.saved, taxonomy: state.taxonomy, draftPrompt: true };
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
    /** Mark (or unmark) the line a template typed, so the box can colour it. */
    markProjectTyped: (line: string | null) => dispatch({ t: "PROJECT_TYPED", line }),
    addFiles: (files: { name: string; type: string; data?: string }[]) => dispatch({ t: "ADD_FILES", files }),
    removeFile: (index: number) => dispatch({ t: "REMOVE_FILE", index }),
    setSimulateError: (value: boolean) => dispatch({ t: "SET_SIMULATE_ERROR", value }),

    /* PROJ — picking a site, and editing its values FOR THIS REQUEST ONLY. Nothing here writes to
       the project: every one of these lands on a copy the intake screen holds. */
    selectProject: (project: ProjectSummary) => dispatch({ t: "SELECT_PROJECT", project }),
    clearProject: () => dispatch({ t: "CLEAR_PROJECT" }),
    patchProjectDefaults: (patch: Partial<TimingHours>, keys: string[]) =>
      dispatch({ t: "PATCH_PROJECT_DEFAULTS", patch, keys }),
    patchProjectTerms: (paymentTerms: PaymentTerm | null) => dispatch({ t: "PATCH_PROJECT_TERMS", paymentTerms }),
    patchProjectSite: (location: SiteLocation) => dispatch({ t: "PATCH_PROJECT_SITE", location }),
    setWorkOrderSource: (groupId: string | null) => dispatch({ t: "SET_WORK_ORDER_SOURCE", groupId }),
    useTemplate: (
      terms: MachineTerms | null,
      groupId: string | null,
      when: { startDate: string | null; endDate: string | null } | null,
    ) => dispatch({ t: "USE_TEMPLATE", terms, groupId, when }),
    patchTerms: (patch: Partial<MachineTerms>, keys: string[] = []) =>
      dispatch({ t: "PATCH_TEMPLATE_TERMS", patch, keys }),

    /**
     * Parse the renter's text.
     *
     * Three paths, chosen by the SHAPE of what they typed — not by whether they have a project. A
     * project does not make a parse cheaper; it makes short text the common case, and short text is
     * what the fast paths are for.
     *
     * Every fast path falls back rather than failing. A renter must never lose their request
     * because an optimisation was unavailable: the worst outcome is the speed we already have.
     */
    async process() {
      const s = getState();
      dispatch({ t: "PROCESS_START" });
      const startedAt = Date.now();

      const decision = decideTier({
        text: s.text,
        hasProject: !!s.project,
        hasFiles: s.files.length > 0,
        taxonomy: s.taxonomy,
      });

      try {
        /* ── Tier 0 — no network at all ──
           The taxonomy is already loaded for the dropdowns, so this is a string match against data
           the browser is holding. It still reaches the corpus (fire-and-forget) or half the traffic
           would stop teaching the learned rules. */
        if (decision.tier === 0 && decision.match?.matched) {
          const draft = quickResultToDraft(decision.match.item, s.taxonomy, s.text);
          ingestClientMatch(s.text, draft.items.map((i) => ({
            input_equipment: i.rawLabel ?? "",
            category_id: i.ref.categoryId,
            subtype_id: i.ref.subcategoryId,
            capacity_id: i.ref.measurementId,
            quantity: i.quantity,
          })));
          await holdProcessing(startedAt);
          dispatch({ t: "PROCESS_SUCCESS", draft });
          return;
        }

        /* ── Tier 1 — one synchronous call, no job row, no poll ── */
        if (decision.tier === 1) {
          const quick = await processQuick({ text: s.text });
          if (!quick.fallback && quick.line_items?.length) {
            await holdProcessing(startedAt);
            dispatch({ t: "PROCESS_SUCCESS", draft: quickItemsToDraft(quick, s.taxonomy, s.text) });
            return;
          }
          // Fell back: straight on to the job path below, with nothing shown to the renter. They
          // asked for a parse, not for a report on which of our paths answered.
        }

        const draft = await processRfq({ text: s.text, files: s.files, simulateError: s.simulateError });
        // Almost always a no-op here: this path has spent seconds already.
        await holdProcessing(startedAt);
        dispatch({ t: "PROCESS_SUCCESS", draft });
      } catch (e) {
        // Floored too: a failure that flashes past is a failure the renter cannot read.
        await holdProcessing(startedAt);
        if (e instanceof ApiError && e.kind === "guest_limit") { dispatch({ t: "GUEST_LIMIT" }); return; }
        const detail =
          e instanceof ApiError
            ? { detail: e.detail, backendCode: e.backendCode, backendStatus: e.backendStatus, status: e.status }
            : null;
        dispatch({ t: "PROCESS_ERROR", kind: e instanceof ApiError ? e.kind : "unknown", detail });
      }
    },
    enterWizard: () => dispatch({ t: "ENTER_WIZARD" }),
    escalateProcessing: () => dispatch({ t: "ESCALATE_PROCESSING" }),
    resumeWizard: () => dispatch({ t: "RESUME_WIZARD" }),
    goIntake: () => dispatch({ t: "GO_INTAKE" }),
    resumeDraft: () => dispatch({ t: "RESUME_DRAFT" }),
    openSection: (section: Section | null) => dispatch({ t: "OPEN_SECTION", section }),
    goItem: (index: number) => dispatch({ t: "GO_ITEM", index }),
    setChargedDaysUnderstood: (value: boolean) => dispatch({ t: "SET_CHARGED_DAYS_UNDERSTOOD", value }),
    setReadyToSend: (value: boolean) => dispatch({ t: "SET_READY_TO_SEND", value }),
    /** MREQ-AC-59 — record that the renter personally answered this control. */
    touchField: (key: string) => dispatch({ t: "TOUCH_FIELD", key }),

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
    requestSourcing: (id: string) => dispatch({ t: "REQUEST_SOURCING", id }),

    patchPreferences: (patch: DeepPrefPatch) => dispatch({ t: "PATCH_PREFERENCES", patch }),

    /** mobile/016 — enter/leave trial mode for this run (set from `/create?mode=trial`). */
    setTrial: (isTrial: boolean) => dispatch({ t: "SET_TRIAL", isTrial }),
    setDirect: (direct: DirectTarget | null) => dispatch({ t: "SET_DIRECT", direct }),

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
        /* ── The filing labels, which were never sent ──────────────────────────────────────────
         *
         * ⚠️ `projectId` and `workOrderGroupId` reach the DRAFT (see the merge above), ride through
         * `draftToCreateRequest`, and are accepted and stored by the backend — and this call never
         * put them in the payload. So **every** request created from a site was filed nowhere. Not
         * only the ones whose location moved: all of them, silently, since the feature shipped.
         *
         * It was invisible from every side. The chart simply did not show a row that had never been
         * filed, the draft carried the id so the confirmation screen said the right thing, and
         * `project-intake.test.ts` asserted the id reaches `draft.projectId` — one step short of the
         * wire, which is exactly where the fault was.
         *
         * Reported as *"i created a request from a project but changed the location, it is silently
         * dropped from the project"* (owner, 2026-08-31). The location was a red herring; the id was
         * never sent with or without one.
         *
         * ── And the location DOES decide, now that the id is sent ──────────────────────────────
         *
         * A site is a place. Every other value a project supplies is a default a request may
         * legitimately differ on, and the chart shows the difference — but a request for Riyadh drawn
         * on the Qiddiya timeline says a machine is going somewhere it is not. So a moved location
         * unfiles it, and the intake says so twice before this point: in the location section and
         * beside the send button. Nothing here is a surprise by the time it runs. */
        const filing = filingFor(s.project, s.draft);

        const { requestId, requestIds, requestUuids, trialExpiresAt } = await submitRequest({
          project: s.draft.project,
          items: finalItems,
          preferences: s.draft.preferences,
          ...filing,
          simulateError: s.simulateError,
          // mobile/016 — sent only for a trial run; a real request's payload is unchanged.
          ...(s.isTrial ? { isTrial: true } : {}),
          // Started from a store → DIRECT to that supplier (app parity). Absent for a broadcast, so a
          // normal request's payload is byte-identical to before.
          ...(s.direct ? { direct: s.direct } : {}),
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
  const { phase, activeSection, itemIndex, draft, text, multiLocationDismissed, seq, agentOrigin, isTrial, direct } = state;
  useEffect(() => {
    try {
      if (draft && (phase === "intake" || phase === "wizard")) {
        window.localStorage.setItem(
          DRAFT_STORAGE_KEY,
          // mobile/016 — `isTrial` rides along so a reload mid-flow resumes as a trial. Without it a
          // rehydrated draft would submit as a REAL (dispatched) request the renter never asked for.
          //
          // `chargedDaysUnderstood` is deliberately NOT persisted: it acknowledges a figure, and the
          // renter should meet that figure again on a fresh visit rather than find it pre-accepted.
          // `touchedFields` rides inside `draft` (MREQ-AC-56/60).
          JSON.stringify({
            phase,
            activeSection,
            itemIndex,
            draft,
            text,
            multiLocationDismissed,
            seq,
            agentOrigin,
            isTrial,
            // The recipient rides with the draft: a reload mid-flow must not turn a request written
            // for one supplier into a broadcast to the whole market.
            direct,
            userId: user?.id ?? null,
          }),
        );
      } else if (phase === "confirmation") {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY); // request sent → clear the saved draft
      }
    } catch {
      /* ignore quota/availability errors */
    }
  }, [phase, activeSection, itemIndex, draft, text, multiLocationDismissed, seq, agentOrigin, isTrial, direct, user]);

  // ---- Browser history ⇄ canvas position (MREQ-AC-06/07).
  //
  // The wizard mapped one history entry per step, so Back walked 4 → 3 → 2 → 1 → intake. The canvas
  // has no steps to walk. Panels are accordions, not pages: opening one is not somewhere the renter
  // navigated TO, and pushing an entry for it would make Back close a panel instead of leaving —
  // which is worse still under the gating, since Back could land on a panel that Forward can't
  // reopen.
  //
  // So the chain is exactly three stops: intake (0) → canvas (1) → ready-to-send (2). ----
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
        dispatch({ t: "SET_READY_TO_SEND", value: target >= 2 });
      } else {
        dispatch({ t: "GO_INTAKE" }); // baseline / no draft → the input screen ("Your request")
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Push an entry only on a genuine forward move. Backward moves arrive via popstate (poppingRef)
  // and must not re-push.
  const readyToSend = state.readyToSend;
  useEffect(() => {
    const ord = phase === "wizard" ? (readyToSend ? 2 : 1) : phase === "intake" ? 0 : -1;
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
  }, [phase, readyToSend]);

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
