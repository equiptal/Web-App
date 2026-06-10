"use client";

import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Card } from "@/components/ui";
import { buildSpecRows, toCsv, downloadCsv, type SpecRow } from "@/lib/export/spec-sheet";
import { postableItems } from "@/lib/contract";

export function Step4Preview() {
  const t = useT();
  const { state, actions } = useRfq();
  const { draft, taxonomy, busy, error } = state;
  if (!draft) return null;

  const rows = buildSpecRows(draft, taxonomy);
  const tt = t.preview.table;
  const headers = [tt.equipment, tt.category, tt.size, tt.qty, tt.year, tt.operator, tt.fuel, tt.fuelResp, tt.delivery, tt.return, tt.certificate, tt.notes];

  const cell = (r: SpecRow) => [
    r.equipment,
    r.category,
    r.size,
    String(r.qty),
    r.year === "any" ? t.options.equipmentYear.any : r.year,
    t.options.operatorNeeded[r.operatorNeeded],
    t.options.fuelType[r.fuelType],
    t.options.party[r.fuelResp],
    t.options.party[r.delivery],
    t.options.party[r.ret],
    r.certificate ? t.options.safetyCert[r.certificate] : "—",
    r.notes || "—",
  ];

  function exportExcel() {
    const csv = toCsv(headers, rows.map(cell));
    downloadCsv("rfq-spec-sheet.csv", csv); // AC-52: excludes Not available (buildSpecRows uses postableItems)
  }

  const count = postableItems(draft.items).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.preview.title}</h2>
        <Button variant="secondary" onClick={exportExcel}>
          {t.preview.export}
        </Button>
      </div>

      {/* AC-41: project + preferences summary. */}
      <Card title={t.preview.projectSummary}>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Summary label={t.step1.location.card} value={draft.project.location.label ?? "—"} />
          <Summary label={t.step1.timing.rentalBasis} value={draft.project.timing.rentalBasis ? t.options.rentalBasis[draft.project.timing.rentalBasis] : "—"} />
          <Summary label={t.step1.timing.hoursPerDay} value={String(draft.project.timing.hoursPerDay)} />
          <Summary label={t.step1.requestWide.delivery} value={t.options.party[draft.project.deliveryToSite]} />
          <Summary label={t.step1.requestWide.return} value={t.options.party[draft.project.returnFromSite]} />
          <Summary label={t.step1.requestWide.fuelResponsibility} value={t.options.party[draft.project.fuelResponsibility]} />
        </dl>
      </Card>

      {/* AC-52: all items as a table. */}
      <Card title={`${t.preview.itemsTable} (${count})`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted">
                {headers.map((h) => (
                  <th key={h} className="whitespace-nowrap p-2 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  {cell(r).map((c, j) => (
                    <td key={j} className="whitespace-nowrap p-2">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{t.errors.networkBody}</p>}

      {/* AC-42/43: post a single broadcast covering all items. */}
      <div className="flex justify-end">
        <Button disabled={busy || count === 0} onClick={() => actions.submit()}>
          {busy ? `${t.preview.post}…` : t.preview.post}
        </Button>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
