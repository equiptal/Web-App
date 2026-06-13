"use client";

import { useState, type ReactNode } from "react";
import { useT, fmt } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { useSession } from "@/lib/session";
import { Button, Icon } from "@/components/ui";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { buildSpecRows, toCsv, downloadCsv, type SpecRow } from "@/lib/export/spec-sheet";
import { postableItems } from "@/lib/contract";

export function Step4Preview() {
  const t = useT();
  const { state, actions } = useRfq();
  const { tier } = useSession();
  const [showAccount, setShowAccount] = useState(false);
  const { draft, taxonomy, busy, error } = state;
  if (!draft) return null;

  // Guests run the whole flow; the account gate lands here. Guest → account popup, then auto-post.
  const onSubmit = () => (tier === "guest" ? setShowAccount(true) : actions.submit());

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

  const exportExcel = () => downloadCsv("rfq-spec-sheet.csv", toCsv(headers, rows.map(cell)));

  const p = draft.project;
  const pr = draft.preferences;
  const count = postableItems(draft.items).length;
  const notSent = draft.items.filter((i) => !i.removed && i.verdict === "no-match").length;
  const certs = [...p.certificates.safety.map((c) => t.options.safetyCert[c]), ...p.certificates.other.map((c) => t.options.otherCert[c])].join(", ") || "—";
  const maint = `${t.options.maintenanceResp[pr.maintenance.responsibility]}${pr.maintenance.sla ? ` · ${t.options.maintenanceSla[pr.maintenance.sla]}` : ""}`;
  const payment = [pr.payment.terms && t.options.paymentTerm[pr.payment.terms], pr.payment.method && t.options.paymentMethod[pr.payment.method]].filter(Boolean).join(" · ") || "—";
  const suppliers =
    [pr.supplierFilters.verifiedOnly && t.step3.supplierFilters.verifiedOnly, pr.supplierFilters.bidWindow && t.options.bidWindow[pr.supplierFilters.bidWindow]].filter(Boolean).join(" · ") || "—";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[23px] font-extrabold tracking-tight">{t.preview.title}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">{t.preview.subtitle}</p>
      </div>

      {/* Plain-language notes on what the agent assumed/inferred — renter confirms (④b). */}
      {draft.justifications && draft.justifications.length > 0 && (
        <div className="rounded-xl border border-info/30 bg-info-soft/40 px-[18px] py-3.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-navy-mid">
            <Icon name="lightbulb" size={17} className="text-info" /> {t.preview.whyTitle}
          </div>
          <ul className="space-y-1 text-[13px] text-navy">
            {draft.justifications.map((j, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[2px] flex-none text-info">•</span>
                <span>{j}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Project (AC-41) */}
      <RC icon="place" title={t.preview.projectSummary} onEdit={() => actions.goStep(1)} editLabel={t.preview.edit}>
        <KV
          rows={[
            [t.step1.location.card, <span key="l" className="inline-flex items-center gap-2">{p.location.label ?? "—"}{p.location.confirmed && <span className="inline-flex items-center gap-1 text-xs font-bold text-ok"><span className="h-[7px] w-[7px] rounded-full bg-ok" /> {t.preview.confirmed}</span>}</span>],
            [t.step1.timing.rentalBasis, p.timing.rentalBasis ? t.options.rentalBasis[p.timing.rentalBasis] : "—"],
            [t.step1.timing.hoursPerDay, String(p.timing.hoursPerDay)],
            [t.step1.certificates.card, certs],
          ]}
        />
      </RC>

      {/* Equipment (AC-52) */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-[18px] py-[13px] text-sm font-bold">
          <span className="flex items-center gap-1.5">
            <Icon name="construction" size={18} className="text-navy-mid" /> {t.preview.equipmentSummary} — {count} {t.preview.itemsTable.toLowerCase()}
          </span>
          <span className="flex gap-3">
            <button className="inline-flex items-center gap-1 text-xs font-bold text-info" onClick={exportExcel}>
              <Icon name="grid_on" size={15} /> {t.preview.export}
            </button>
            <button className="inline-flex items-center gap-1 text-xs font-bold text-info" onClick={() => actions.goStep(2)}>
              <Icon name="edit" size={15} /> {t.preview.edit}
            </button>
          </span>
        </div>
        <div className="overflow-x-auto p-3.5">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-start text-[10.5px] uppercase tracking-wide text-muted">
                {headers.map((h) => (
                  <th key={h} className="whitespace-nowrap p-2 text-start font-extrabold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  {cell(r).map((c, j) => (
                    <td key={j} className="whitespace-nowrap p-2">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notSent > 0 && (
          <div className="flex items-start gap-2 border-t border-border bg-surface2 px-[18px] py-2.5 text-[12.5px] text-navy-mid">
            <Icon name="info" size={17} className="flex-none text-muted" /> {fmt(t.preview.notSent, { count: notSent })}
          </div>
        )}
      </div>

      {/* Preferences */}
      <RC icon="tune" title={t.preview.preferencesSummary} onEdit={() => actions.goStep(3)} editLabel={t.preview.edit}>
        <KV
          rows={[
            [t.step3.payment.title, payment],
            [t.step3.maintenance.title, maint],
            [`${t.step1.requestWide.delivery} / ${t.step1.requestWide.return}`, `${p.deliveryToSite ? t.options.party[p.deliveryToSite] : t.preview.perItem} / ${p.returnFromSite ? t.options.party[p.returnFromSite] : t.preview.perItem}`],
            [t.step3.supplierFilters.title, suppliers],
          ]}
        />
      </RC>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{t.errors.networkBody}</p>}

      {/* AC-42/43: send one broadcast covering all items. */}
      <div className="flex justify-end">
        <Button disabled={busy || count === 0} onClick={onSubmit} className="px-6 py-3 text-[14.5px]">
          <Icon name="send" size={18} /> {busy ? `${t.preview.send}…` : t.preview.send}
        </Button>
      </div>

      <AccountModal
        open={showAccount}
        onClose={() => setShowAccount(false)}
        onCreated={() => {
          setShowAccount(false);
          void actions.submit(); // account created (now basic) → post the request
        }}
      />
    </div>
  );
}

function RC({ icon, title, onEdit, editLabel, children }: { icon: string; title: string; onEdit: () => void; editLabel: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-[18px] py-[13px] text-sm font-bold">
        <span className="flex items-center gap-1.5">
          <Icon name={icon} size={18} className="text-navy-mid" /> {title}
        </span>
        <button className="inline-flex items-center gap-1 text-xs font-bold text-info" onClick={onEdit}>
          <Icon name="edit" size={15} /> {editLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 px-[18px] py-3.5 text-[13.5px] sm:grid-cols-[140px_1fr]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="font-semibold text-muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
