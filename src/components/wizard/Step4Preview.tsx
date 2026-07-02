"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT, fmt, useLocale } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { useSession } from "@/lib/session";
import { Button, Icon } from "@/components/ui";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { buildSpecRows, toCsv, downloadCsv, type SpecRow } from "@/lib/export/spec-sheet";
import { postableItems, resolveRef, taxName } from "@/lib/contract";

export function Step4Preview() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const router = useRouter();
  const { state, actions } = useRfq();
  const { tier } = useSession();
  const [showAccount, setShowAccount] = useState(false);
  const { draft, taxonomy, busy, error, errorDetail } = state;
  // Basic-account request cap (backend E8009 / 403) — surfaced as a verify popup, not inline red text.
  const isLimit = errorDetail?.backendCode === "E8009";
  const [showLimit, setShowLimit] = useState(false);
  useEffect(() => { if (error && isLimit) setShowLimit(true); }, [error, isLimit]);
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
    r.certificate.length ? r.certificate.map((c) => t.options.safetyCert[c]).join(", ") : "—",
    r.notes || "—",
  ];

  const exportExcel = () => downloadCsv("rfq-spec-sheet.csv", toCsv(headers, rows.map(cell)));
  // Drop columns that are empty for every item so the table only shows terms that carry a value.
  const bodyCells = rows.map(cell);
  const isEmptyCell = (v: string) => v == null || v === "" || v === "—";
  const keepCol = headers.map((_, ci) => bodyCells.some((r) => !isEmptyCell(r[ci])));
  const shownHeaders = headers.filter((_, ci) => keepCol[ci]);

  const p = draft.project;
  const pr = draft.preferences;
  const count = postableItems(draft.items).length;
  const notSent = draft.items.filter((i) => !i.removed && i.verdict === "no-match").length;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const certs = [...p.certificates.safety.map((c) => t.options.safetyCert[c]), ...p.certificates.other.map((c) => t.options.otherCert[c])].join(", ");
  const mResp = (t.options.maintenanceResp as Record<string, string>)[pr.maintenance.responsibility] ?? pr.maintenance.responsibility;
  const suppliers =
    [pr.supplierFilters.verifiedOnly && t.step3.supplierFilters.verifiedOnly, pr.supplierFilters.bidWindow && t.options.bidWindow[pr.supplierFilters.bidWindow]].filter(Boolean).join(" · ");

  // Every request term, with the same titles used across the wizard. Empty/unset terms are dropped
  // entirely (no "—" rows). `keep` builds the tuple only when the value is present.
  type KVRow = [ReactNode, ReactNode];
  const keep = (...rows: (KVRow | false | null | undefined)[]): KVRow[] => rows.filter((r): r is KVRow => Array.isArray(r));
  const projectRows = keep(
    p.location.label ? [t.step1.location.card, <span key="l" className="inline-flex items-center gap-2">{p.location.label}{p.location.confirmed && <span className="inline-flex items-center gap-1 text-xs font-bold text-ok"><span className="h-[7px] w-[7px] rounded-full bg-ok" /> {t.preview.confirmed}</span>}</span>] as KVRow : null,
    p.timing.rentalBasis ? [t.step1.timing.rentalBasis, `${t.options.rentalBasis[p.timing.rentalBasis]}${p.timing.extendable ? ` · ${t.step1.timing.extendable}` : ""}`] as KVRow : null,
    p.timing.startDate ? [t.step1.timing.startDate, fmtDate(p.timing.startDate)] as KVRow : null,
    p.timing.endDate ? [t.step1.timing.endDate, fmtDate(p.timing.endDate)] as KVRow : null,
    p.timing.hoursPerDay != null ? [t.step1.timing.hoursPerDay, String(p.timing.hoursPerDay)] as KVRow : null,
    p.advanced.workingDaysPerWeek != null ? [t.step1.advanced.workingDays, String(p.advanced.workingDaysPerWeek)] as KVRow : null,
    (p.advanced.overtimeRate && p.advanced.overtimeRate !== "without") ? [t.step1.advanced.overtime, t.options.overtime[p.advanced.overtimeRate]] as KVRow : null,
    (p.advanced.equipmentYear && p.advanced.equipmentYear !== "any") ? [t.step1.advanced.equipmentYear, p.advanced.equipmentYear] as KVRow : null,
    certs ? [t.step1.certificates.card, certs] as KVRow : null,
  );
  const prefRows = keep(
    pr.payment.terms ? [t.step3.payment.terms, t.options.paymentTerm[pr.payment.terms]] as KVRow : null,
    pr.payment.method ? [t.step3.payment.method, t.options.paymentMethod[pr.payment.method]] as KVRow : null,
    pr.maintenance.responsibility ? [t.step3.maintenance.responsibility, mResp] as KVRow : null,
    pr.maintenance.sla ? [t.step3.maintenance.sla, t.options.maintenanceSla[pr.maintenance.sla]] as KVRow : null,
    (p.deliveryToSite || p.returnFromSite) ? [`${t.step1.requestWide.delivery} / ${t.step1.requestWide.return}`, `${p.deliveryToSite ? t.options.party[p.deliveryToSite] : t.preview.perItem} / ${p.returnFromSite ? t.options.party[p.returnFromSite] : t.preview.perItem}`] as KVRow : null,
    p.fuelResponsibility ? [t.step1.requestWide.fuelResponsibility, t.options.party[p.fuelResponsibility]] as KVRow : null,
    pr.budgetSar != null ? [t.step3.budget.label, `${new Intl.NumberFormat(ar ? "ar-EG" : "en-US").format(pr.budgetSar)} ${L("SAR", "ر.س")}`] as KVRow : null,
    pr.additionalNotes ? [t.step3.additionalNotes, pr.additionalNotes] as KVRow : null,
    suppliers ? [t.step3.supplierFilters.title, suppliers] as KVRow : null,
  );

  // Operator details — shown only for the items that actually require an operator, so the renter can
  // confirm nationality / certificate / night shift / F.A.T before submit (otherwise buried in the
  // per-item settings).
  const operatorItems = postableItems(draft.items)
    .filter((i) => i.operatorNeeded === "yes")
    .map((i) => {
      const { category, subcategory, measurement } = resolveRef(taxonomy, i.ref);
      const node = subcategory ?? category ?? null;
      const name = [node ? taxName(node, locale) : i.rawLabel, measurement ? taxName(measurement, locale) : i.rawSize].filter(Boolean).join(" · ") || "—";
      const opCert = i.operator.certificate;
      const rows = keep(
        i.operator.nightShift ? [t.step2.perItem.nightShift, L("Yes", "نعم")] as KVRow : null,
        i.operator.nationality
          ? [t.step2.perItem.nationality, i.operator.nationality === "restricted" ? (i.operator.nationalityCustom?.trim() || t.step2.perItem.nationalityRestricted) : t.step2.perItem.nationalityAny] as KVRow
          : null,
        opCert.length ? [t.step2.perItem.certificate, opCert.map((c) => t.options.safetyCert[c]).join(", ")] as KVRow : null,
        i.operator.fatFood ? [t.step2.perItem.fatFood, t.options.party[i.operator.fatFood]] as KVRow : null,
        i.operator.fatAccommodationTransport ? [t.step2.perItem.fatTransport, t.options.party[i.operator.fatAccommodationTransport]] as KVRow : null,
      );
      return { id: i.id, name, rows };
    })
    .filter((o) => o.rows.length > 0);

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
            {draft.justifications.map((j, i) => {
              // Justifications may be plain strings or {field, note} objects depending on the agent build.
              const text = typeof j === "string" ? j : ((j as { note?: string; text?: string })?.note ?? (j as { text?: string })?.text ?? "");
              const field = typeof j === "string" ? "" : ((j as { field?: string })?.field ?? "");
              if (!text) return null;
              return (
                <li key={i} className="flex gap-2">
                  <span className="mt-[2px] flex-none text-info">•</span>
                  <span>{field ? <b className="font-semibold">{field}: </b> : null}{text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Project (AC-41) */}
      <RC icon="place" title={t.preview.projectSummary} onEdit={() => actions.goStep(1)} editLabel={t.preview.edit}>
        <KV rows={projectRows} />
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
                {shownHeaders.map((h) => (
                  <th key={h} className="whitespace-nowrap p-2 text-start font-extrabold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyCells.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  {r.filter((_, ci) => keepCol[ci]).map((c, j) => (
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

      {/* Operator details (AC-24) — only for items that need an operator; confirm before submit. */}
      {operatorItems.length > 0 && (
        <RC icon="person" title={L("Operator details", "تفاصيل المشغّل")} onEdit={() => actions.goStep(2)} editLabel={t.preview.edit}>
          <div className="divide-y divide-border">
            {operatorItems.map((o) => (
              <div key={o.id} className="px-[18px] py-3">
                <div className="mb-1.5 text-[13px] font-bold text-navy">{o.name}</div>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-[140px_1fr]">
                  {o.rows.map(([k, v], i) => (
                    <div key={i} className="contents">
                      <dt className="font-semibold text-muted">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </RC>
      )}

      {/* Preferences */}
      <RC icon="tune" title={t.preview.preferencesSummary} onEdit={() => actions.goStep(3)} editLabel={t.preview.edit}>
        <KV rows={prefRows} />
      </RC>

      {error && !isLimit && (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <p>{t.errors.networkBody}</p>
          {(errorDetail?.detail || errorDetail?.backendCode || errorDetail?.backendStatus) && (
            <p className="mt-1 break-words font-mono text-xs opacity-80">
              {errorDetail.detail}
              {errorDetail.backendCode ? ` · ${errorDetail.backendCode}` : ""}
              {errorDetail.backendStatus ? ` · backend ${errorDetail.backendStatus}` : ""}
            </p>
          )}
        </div>
      )}

      {/* web-app/006 — nudge: a shareable bid link comes after submit (encourages sending). */}
      <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info-soft/40 px-[18px] py-3">
        <Icon name="ios_share" size={18} className="mt-0.5 flex-none text-info" />
        <div className="text-[13px] leading-relaxed text-navy">
          <b className="font-bold">{t.preview.shareTeaserTitle}</b>
          <span className="text-navy-mid"> — {t.preview.shareTeaserBody}</span>
        </div>
      </div>

      {/* AC-42/43: send one broadcast covering all items. Rental basis is required to submit. */}
      <div className="flex flex-col items-end gap-1.5">
        {!draft.project.timing.rentalBasis && <span className="text-xs font-bold text-warn">{t.gate.chooseRentalBasis}</span>}
        <Button disabled={busy || count === 0 || !draft.project.timing.rentalBasis} onClick={onSubmit} className="px-6 py-3 text-[14.5px]">
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

      {/* Basic-account request cap (backend E8009) — verify popup instead of an inline error. */}
      {showLimit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center" dir={ar ? "rtl" : "ltr"} onClick={(e) => e.target === e.currentTarget && setShowLimit(false)}>
          <div className="w-full max-w-[440px] rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-warn-soft text-warn">
                <Icon name="verified_user" size={24} />
              </span>
              <div className="flex-1">
                <h3 className="text-[17px] font-extrabold text-navy">{L("Request limit reached", "بلغت الحد الأقصى للطلبات")}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                  {L(
                    "Basic accounts can post a limited number of requests. Get verified to post unlimited requests and unlock the full marketplace.",
                    "تستطيع الحسابات الأساسية إرسال عدد محدود من الطلبات. وثّق حسابك لإرسال طلبات غير محدودة والاستفادة من المنصة بالكامل.",
                  )}
                </p>
              </div>
              <button onClick={() => setShowLimit(false)} className="grid h-8 w-8 flex-none place-items-center rounded-full text-muted hover:bg-surface2"><Icon name="close" size={18} /></button>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button onClick={() => setShowLimit(false)} className="rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13.5px] font-bold text-navy-mid transition hover:bg-surface2">
                {L("Not now", "ليس الآن")}
              </button>
              <button onClick={() => { setShowLimit(false); router.push("/verify"); }} className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-brand px-5 py-2.5 text-[13.5px] font-bold text-white">
                <Icon name="verified_user" size={17} /> {L("Get verified", "وثّق حسابك")}
              </button>
            </div>
          </div>
        </div>
      )}
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
