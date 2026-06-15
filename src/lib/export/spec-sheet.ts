import {
  RfqDraft,
  Taxonomy,
  resolveRef,
  postableItems,
  type FuelType,
  type Party,
  type OperatorCertificate,
  type OperatorNeeded,
} from "@/lib/contract";

/** One row of the all-items spec sheet (AC-52). Raw values; the UI maps enums to localized labels. */
export interface SpecRow {
  equipment: string;
  category: string;
  size: string;
  qty: number;
  year: string;
  operatorNeeded: OperatorNeeded;
  fuelType: FuelType;
  fuelResp: Party;
  delivery: Party;
  ret: Party;
  certificate: OperatorCertificate[];
  notes: string;
}

/** Build spec rows for every postable item — excludes `Not available` / removed items (AC-52). */
export function buildSpecRows(draft: RfqDraft, taxonomy: Taxonomy): SpecRow[] {
  const year = draft.project.advanced.equipmentYear ?? "any"; // AC-28 project-level, applies to all
  return postableItems(draft.items).map((item) => {
    const { category, subcategory, measurement } = resolveRef(taxonomy, item.ref);
    return {
      equipment: subcategory?.name ?? item.rawLabel ?? "—",
      category: category?.name ?? "—",
      // Prefer the resolved taxonomy size; otherwise show the size the renter actually stated
      // (off-taxonomy / unmatched) so it never silently disappears from the preview.
      size: measurement?.name ?? item.rawSize ?? "—",
      qty: item.quantity, // AC-55 / AC-52 (x2 → 2)
      year,
      operatorNeeded: item.operatorNeeded,
      fuelType: item.fuelType,
      fuelResp: item.fuelResponsibilityOverride ?? draft.project.fuelResponsibility ?? "me",
      delivery: item.deliveryOverride ?? draft.project.deliveryToSite ?? "me",
      ret: item.returnOverride ?? draft.project.returnFromSite ?? "me",
      certificate: item.operator.certificate,
      notes: item.additionalNotes,
    };
  });
}

/** Build a CSV string (Excel-openable). Prepends a BOM so Excel reads UTF-8 (Arabic) correctly. */
export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [headers, ...rows].map((r) => r.map(escape).join(","));
  return "﻿" + lines.join("\r\n");
}

/** Trigger a client-side download of the spec sheet as a .csv (opens in Excel). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
