import {
  AgentDraft,
  EquipmentItem,
  defaultOperatorDetails,
  defaultProjectDetails,
  computeSummary,
} from "@/lib/contract";

/**
 * THE [MANSOUR] BOUNDARY — mock only.
 *
 * The real normalization agent parses the renter's text/files and produces this draft. It lives in
 * another repo (out of scope). Here we return a deterministic, rich fixture that exercises every
 * renter-observable agent behavior the web must render:
 *   - confident / needs-validation / no-match verdicts (AC-17/18/30)
 *   - nearest-measurement suggestion (AC-19) + unit conversion (AC-20)
 *   - a text↔file location conflict (AC-47) and multiple detected locations (AC-48)
 *   - agent-extracted per-item quantity (AC-55) and notes (AC-53)
 *   - agent-prefilled per-item fields with confidence (AC-57)
 *
 * Swap this function for a real `fetch` to the agent endpoint with no change to the UI.
 */
export function buildMockDraft(): AgentDraft {
  const project = defaultProjectDetails();
  // Agent extracted a location, but text and an uploaded file disagree (AC-47). Stays unconfirmed (AC-16).
  project.location = {
    label: "Riyadh — King Fahd Rd site",
    confirmed: false,
    source: "agent",
    conflict: { fromText: "Riyadh — King Fahd Rd site", fromFile: "Riyadh — Exit 18 yard" },
  };
  project.timing.hoursPerDay = 8;

  const items: EquipmentItem[] = [
    confident("i1", ["earthmoving", "excavators", "exc-20t"], {
      rawLabel: "20T excavator x2",
      quantity: 2,
      operatorNeeded: "yes",
      notes: "",
      qtyConfidence: "confident",
    }),
    confident("i2", ["power", "generators", "gen-250kva"], {
      rawLabel: "250 kVA silent generator",
      quantity: 1,
      operatorNeeded: "no", // AC-24 default for generators
      notes: "silent", // AC-53 free-text qualifier
      fuelConfidence: "confident",
    }),
    needsValidation("i3", ["cranes-lifting", "mobile-cranes", "mc-50t"], {
      rawLabel: "45 ton crane",
      quantity: 1,
    }),
    // AC-19: "15 m" telehandler isn't a taxonomy size → suggest nearest (14 m).
    needsValidation("i4", ["cranes-lifting", "telehandlers", "th-14m"], {
      rawLabel: "telehandler 15 m",
      quantity: 1,
      suggestion: { measurementId: "th-14m" },
    }),
    // AC-20: 5000 gal water truck → convert to litres, nearest 20,000 L.
    needsValidation("i5", ["haulage", "water-trucks", "wt-20000l"], {
      rawLabel: "water truck 5000 gal",
      quantity: 1,
      suggestion: {
        measurementId: "wt-20000l",
        unitConversion: { fromUnit: "gal", fromValue: 5000, toUnit: "L", toValue: 18927 },
      },
    }),
    noMatch("i6", { rawLabel: "floating crane barge" }),
  ];

  return {
    project,
    items,
    detectedLocations: ["Riyadh — King Fahd Rd site", "Dammam — Industrial City 2"], // AC-48 (>1)
    summary: computeSummary(items),
  };
}

type Triple = [string, string, string];

function base(id: string, rawLabel: string | null, quantity: number): EquipmentItem {
  return {
    id,
    rawLabel,
    rawSize: null,
    ref: { categoryId: null, subcategoryId: null, measurementId: null },
    verdict: "confident",
    resolved: true,
    removed: false,
    quantity,
    operatorNeeded: "yes",
    operator: defaultOperatorDetails(),
    fuelType: "diesel",
    additionalNotes: "",
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
  };
}

function confident(
  id: string,
  ref: Triple,
  opts: { rawLabel: string; quantity: number; operatorNeeded?: "yes" | "no"; notes?: string; qtyConfidence?: "confident" | "needs-validation"; fuelConfidence?: "confident" | "needs-validation" },
): EquipmentItem {
  const item = base(id, opts.rawLabel, opts.quantity);
  item.ref = { categoryId: ref[0], subcategoryId: ref[1], measurementId: ref[2] };
  item.verdict = "confident";
  item.resolved = true;
  if (opts.operatorNeeded) item.operatorNeeded = opts.operatorNeeded;
  if (opts.notes) item.additionalNotes = opts.notes;
  item.fieldConfidence = { quantity: opts.qtyConfidence ?? "confident", fuelType: opts.fuelConfidence ?? "confident" };
  return item;
}

function needsValidation(
  id: string,
  ref: Triple,
  opts: { rawLabel: string; quantity: number; suggestion?: EquipmentItem["suggestion"] },
): EquipmentItem {
  const item = base(id, opts.rawLabel, opts.quantity);
  item.ref = { categoryId: ref[0], subcategoryId: ref[1], measurementId: ref[2] };
  item.verdict = "needs-validation";
  item.resolved = false; // AC-18/19: renter must approve or edit
  if (opts.suggestion) item.suggestion = opts.suggestion;
  return item;
}

function noMatch(id: string, opts: { rawLabel: string }): EquipmentItem {
  const item = base(id, opts.rawLabel, 1);
  item.verdict = "no-match";
  item.resolved = false;
  return item;
}
