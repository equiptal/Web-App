/**
 * What went wrong with a submit, said to the renter in his own language.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 *
 * Owner, 2026-09-12, on meeting «INTERNAL_ERROR · 500» over a request that would not post: *"can we
 * make the error messages clear to the user and user friendly and clearly have the reason, not like
 * this by numbers"*.
 *
 * He is right, and the banner was built that way on purpose (2026-09-03): it printed the backend's
 * own code and status *"because a renter who has to ask us anyway should be able to paste one line
 * and be understood"*. That reasoning holds for SUPPORT and fails for the renter, who is left
 * reading a number that tells him nothing about whether to wait, fix something, or give up.
 *
 * So both, in the right order: a sentence that says what happened and what to do, and the code kept
 * for the person who needs it, out of the way.
 *
 * ── Why this reads the STATUS and not the code ──────────────────────────────────────────────────
 *
 * 🔴 The backend has eighteen `E80xx` codes and this app has verified the meaning of exactly two of
 * them (`E8009`, the request cap, and `E8007`, the tier gate — both already handled by their own
 * screens). Writing eighteen sentences would mean inventing sixteen, and a confident wrong
 * explanation is worse than a vague true one: it sends the renter to fix something that is not
 * broken.
 *
 * The HTTP status is the one thing that is always true and never guessed. A 5xx is ours, a 4xx is
 * the request, and no status at all is the network. Those three answers cover what a renter can
 * actually DO about it, which is the only question a message like this has to answer.
 */

export type SubmitErrorKind = "ours" | "yours" | "auth" | "offline" | "unknown";

export interface SubmitErrorRead {
  /** Which side the fault is on, for the tone and the icon. */
  kind: SubmitErrorKind;
  /** The i18n key under `errors.submit` that names it. */
  key: "ours" | "yours" | "auth" | "offline" | "unknown";
  /**
   * The backend's own sentence, when it IS one.
   *
   * ⚠️ Shown UNDER ours, never instead of it. A backend message is written for whoever reads the
   * logs: it may be a stack frame, a field path, or the word `undefined`. `looksLikeSentence` keeps
   * the ones a person can read and drops the rest, so the banner never degrades into the thing this
   * file exists to remove.
   */
  detail: string | null;
  /** `INTERNAL_ERROR · 500`, for support. Never the headline. */
  reference: string | null;
  /**
   * The fields the backend refused, named the way the renter knows them.
   *
   * ⚠️ Empty unless the answer carried `fieldErrors`, which only a `VALIDATION_ERROR` does. Every
   * other refusal has no field to name, and inventing one would send him to a control that is fine.
   */
  fields: string[];
}

/**
 * The backend's payload keys, in the renter's words.
 *
 * 🔴 **Read off `draftToCreateRequest`, not guessed.** These are exactly the keys this app SENDS,
 * so they are the only ones that can come back refused. A key that is not here is shown as the
 * backend spelled it rather than as a name invented for it: a wrong field name is worse than a raw
 * one, because it sends him to fix the wrong control.
 *
 * ⚠️ `i18n` is not reachable from a contract module, so these are English. They are a fallback
 * under a sentence that is already translated, and a wrong-language field name still points at the
 * right field.
 */
const FIELD_NAMES: Record<string, string> = {
  // Where and when
  projectAddressLabel: "the site address",
  projectLat: "the site location",
  projectLng: "the site location",
  startDate: "the start date",
  endDate: "the end date",
  rentalType: "the rental basis",
  estimatedDurationDays: "how long you need it",
  workingHoursPerDay: "hours per day",
  workingDaysPerWeek: "working days per week",
  // The machines
  equipmentItems: "the equipment",
  categoryId: "the equipment category",
  subtypeId: "the equipment type",
  capacityId: "the equipment size",
  customEquipmentName: "the equipment name",
  numberOfUnits: "how many units",
  operatorIncluded: "whether an operator is needed",
  operatorNationality: "the operator's nationality",
  fuelTypePreference: "the fuel type",
  dieselIncluded: "who pays for fuel",
  mobilizationByRentee: "who delivers it",
  demobilizationByRentee: "who returns it",
  maxEquipmentAge: "the minimum year",
  requiredCerts: "the certificates",
  workType: "the work type",
  // The terms
  paymentTerms: "the payment terms",
  paymentMethod: "the payment method",
  maintenanceResponsibility: "who maintains it",
  breakdownResponseSla: "the breakdown response time",
  budgetCeiling: "your budget ceiling",
  offerDuration: "how long offers stay open",
  projectId: "the project",
};

/**
 * Zod's `flatten()`, read defensively.
 *
 * ⚠️ Nothing here assumes a shape. The backend sends `parsed.error.flatten()` today; if that ever
 * becomes `issues[]` or anything else, this returns nothing and the banner falls back to its
 * sentence rather than throwing inside an error screen, which is the one place a crash is least
 * affordable.
 */
function refusedFields(details: unknown): string[] {
  if (!details || typeof details !== "object") return [];
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return [];

  const out: string[] = [];
  for (const key of Object.keys(fieldErrors as Record<string, unknown>)) {
    // `equipmentItems.0.subtypeId` → the leaf is what names the control he can see.
    const leaf = key.split(".").filter((p) => p && !/^\d+$/.test(p)).pop() ?? key;
    const name = FIELD_NAMES[leaf] ?? FIELD_NAMES[key] ?? leaf;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}


/**
 * A backend message worth showing a renter.
 *
 * ⚠️ Deliberately strict. Two words minimum, a letter to start, no braces, no stack arrows, and
 * short enough to be a sentence rather than a dump. Anything else rides in `reference` instead.
 */
function looksLikeSentence(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s || s.length > 180) return null;
  if (!/^[A-Za-z؀-ۿ]/.test(s)) return null;
  if (!s.includes(" ")) return null;
  if (/[{}<>]|\bat \w+\.|https?:\/\//.test(s)) return null;
  // A bare code with a space in it («VALIDATION ERROR») is still a code.
  if (/^[A-Z0-9 _.-]+$/.test(s)) return null;
  return s;
}

export function readSubmitError(
  e:
    | { detail?: string; backendCode?: string; backendStatus?: number; status?: number; details?: unknown }
    | null
    | undefined,
): SubmitErrorRead {
  const status = e?.backendStatus ?? e?.status ?? null;
  const code = e?.backendCode ?? null;
  const reference = [code, status].filter(Boolean).join(" · ") || null;
  const said = looksLikeSentence(e?.detail);
  const fields = refusedFields(e?.details);

  /**
   * ⚠️ **No status is not «unknown», it is OFFLINE.** Our own routes answer 503 `network` when the
   * fetch itself threw, and the client leaves the status off when it never got a reply. Either way
   * the renter's next move is the same and it is not «try again»: it is «check your connection».
   */
  if (status == null) return { kind: "offline", key: "offline", detail: null, reference, fields: [] };

  /**
   * 🔴 **The backend's words are carried only where they NAME something he can fix.**
   *
   * On a 5xx they add nothing: our own sentence already says the request was not sent, and «Failed
   * to create request» underneath it is the same news in the backend's voice. That redundancy is
   * half of what the owner was looking at when he asked for this.
   *
   * On a 4xx it is the opposite. «This project already has a request for that machine» is the only
   * thing on the screen that says WHICH thing was refused, and dropping it would leave him guessing.
   */
  if (status >= 500) return { kind: "ours", key: "ours", detail: null, reference, fields: [] };
  if (status === 401 || status === 403) return { kind: "auth", key: "auth", detail: said, reference, fields: [] };
  if (status >= 400) return { kind: "yours", key: "yours", detail: fields.length ? null : said, reference, fields };

  return { kind: "unknown", key: "unknown", detail: null, reference, fields: [] };
}
