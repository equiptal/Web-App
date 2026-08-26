"use client";

/**
 * *Ready to send* (MREQ-AC-42–48).
 *
 * Everything above the Preferences card is read-only: this screen's job is to show the renter what
 * suppliers will receive, and a screen that both shows and edits is one where a stray click changes
 * the request while they are checking it. Edits go back to the canvas, which is where the provenance
 * marks and the gates live.
 *
 * Preferences are the exception, and they belong here rather than on the canvas because they are not
 * about the machine — they are what happens once bids arrive.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { useSession } from "@/lib/session";
import { Button, Icon, Pchips, Seg2, SelChips, TextArea, TextInput } from "@/components/ui";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { buildSpecRows, downloadCsv, toCsv, type SpecRow } from "@/lib/export/spec-sheet";
import {
  BID_WINDOWS,
  MAINTENANCE_RESPONSIBILITIES,
  MAINTENANCE_SLAS,
  PAYMENT_TERMS,
  computeChargedDays,
  postableItems,
  type BidWindow,
  type MaintenanceResponsibility,
  type MaintenanceSla,
  type PaymentTerm,
} from "@/lib/contract";
import { arabicIndicDigits } from "@/lib/contract/bid-map";
import { ACTIONS, btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

export function ReadyToSend() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const router = useRouter();
  const { state, actions } = useRfq();
  const { tier } = useSession();
  const [showAccount, setShowAccount] = useState(false);
  const [showLimit, setShowLimit] = useState(false);

  const { draft, taxonomy, busy, error, errorDetail } = state;
  // Basic-account request cap (backend E8009) — a verify prompt, not inline red text.
  const isLimit = errorDetail?.backendCode === "E8009";
  useEffect(() => {
    if (error && isLimit) setShowLimit(true);
  }, [error, isLimit]);

  if (!draft) return null;

  const num = (n: number) => (ar ? arabicIndicDigits(n) : String(n));
  const project = draft.project;
  const prefs = draft.preferences;
  const items = postableItems(draft.items);
  const charged = computeChargedDays(project.timing);
  const onSubmit = () => (tier === "guest" ? setShowAccount(true) : actions.submit());

  const rows = buildSpecRows(draft, taxonomy);
  const tt = t.preview.table;
  const headers = [
    tt.equipment, tt.category, tt.size, tt.qty, tt.year, tt.operator, tt.operatorCert,
    tt.food, tt.transport, tt.fuel, tt.fuelResp, tt.delivery, tt.return, tt.certificate, tt.notes,
  ];
  const cell = (r: SpecRow) => [
    r.equipment,
    r.category,
    r.size,
    num(r.qty),
    r.year === "any" ? t.options.equipmentYear.any : r.year,
    t.options.operatorNeeded[r.operatorNeeded],
    r.operatorCert.length ? r.operatorCert.map((c) => t.options.safetyCert[c]).join(", ") : "—",
    r.fatFood ? t.options.party[r.fatFood] : "—",
    r.fatTransport ? t.options.party[r.fatTransport] : "—",
    t.options.fuelType[r.fuelType],
    t.options.party[r.fuelResp],
    t.options.party[r.delivery],
    t.options.party[r.ret],
    r.certificate.length
      ? r.certificate.map((c) => (c === "other" && r.certificateOther ? r.certificateOther : t.options.safetyCert[c])).join(", ")
      : "—",
    r.notes || "—",
  ];
  const body = rows.map(cell);
  // Drop columns nothing filled in, so the table shows terms rather than dashes.
  const keepCol = headers.map((_, ci) => body.some((r) => r[ci] && r[ci] !== "—"));

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const backToItem = (index: number) => {
    actions.setReadyToSend(false);
    actions.goItem(index);
  };

  return (
    <div {...pin("ready-to-send")}>
      <h1 className="text-display font-extrabold text-navy">{t.create.ready.title}</h1>
      <p className="mb-3 mt-1 text-meta text-muted">{t.create.ready.subtitle}</p>

      {/* ---------------- Site ---------------- */}
      <SummaryCard title={t.create.ready.where} onEdit={() => backToItem(0)}>
        <p className="text-body text-navy-mid">
          {project.location.label ?? "—"}
          {project.location.lat != null && (
            <span className="ms-2 text-muted">{`${project.location.lat.toFixed(6)}, ${project.location.lng?.toFixed(6)}`}</span>
          )}
        </p>
      </SummaryCard>

      {/* ---------------- Schedule ---------------- */}
      <SummaryCard title={t.create.ready.when} onEdit={() => backToItem(0)}>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Tile label={t.create.ready.billingDuration}>
            {[
              project.timing.rentalBasis ? t.options.rentalBasis[project.timing.rentalBasis] : "—",
              project.timing.startDate && project.timing.endDate
                ? `${fmtDate(project.timing.startDate)} → ${fmtDate(project.timing.endDate)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Tile>
          <Tile label={t.create.ready.hoursOvertime}>
            {`${num(project.timing.hoursPerDay)} ${L("hrs/day", "ساعة/يوم")} · ${t.options.overtime[project.advanced.overtimeRate]}`}
          </Tile>
          <Tile label={t.create.ready.chargedDays}>{charged.known ? num(charged.chargedDays) : "—"}</Tile>
        </div>
      </SummaryCard>

      {/* ---------------- Preferences — the only editable region ---------------- */}
      <SummaryCard title={t.create.ready.preferences}>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label={`${t.create.ready.paymentTerms} ${t.create.ready.optional}`}>
            <Pchips<PaymentTerm>
              value={prefs.payment.terms}
              onChange={(v) => actions.patchPreferences({ payment: { terms: v } })}
              onClear={() => actions.patchPreferences({ payment: { terms: null } })}
              options={PAYMENT_TERMS.map((p) => ({ value: p, label: t.options.paymentTerm[p] }))}
            />
          </Tile>
          <Tile label={t.create.ready.maintenance}>
            <Seg2<MaintenanceResponsibility>
              value={prefs.maintenance.responsibility}
              onChange={(v) => actions.patchPreferences({ maintenance: { responsibility: v } })}
              options={MAINTENANCE_RESPONSIBILITIES.map((m) => ({
                value: m,
                label: (t.options.maintenanceResp as Record<string, string>)[m] ?? m,
              }))}
            />
          </Tile>
          {/* An SLA is only meaningful when the supplier carries maintenance. */}
          {prefs.maintenance.responsibility === "supplier" && (
            <Tile label={`${t.create.ready.maintenanceSla} ${t.create.ready.optional}`}>
              <Pchips<MaintenanceSla>
                value={prefs.maintenance.sla}
                onChange={(v) => actions.patchPreferences({ maintenance: { sla: v } })}
                onClear={() => actions.patchPreferences({ maintenance: { sla: null } })}
                options={MAINTENANCE_SLAS.map((s) => ({ value: s, label: (t.options.maintenanceSla as Record<string, string>)[s] ?? s }))}
              />
            </Tile>
          )}
          <Tile label={`${t.create.ready.budget} ${t.create.ready.optional}`}>
            <TextInput
              inputMode="numeric"
              value={prefs.budgetSar == null ? "" : String(prefs.budgetSar)}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                actions.patchPreferences({ budgetSar: digits ? Number(digits) : null });
              }}
            />
          </Tile>
          <Tile label={`${t.create.ready.bidWindow} ${t.create.ready.optional}`}>
            <Pchips<BidWindow>
              value={prefs.supplierFilters.bidWindow}
              onChange={(v) => actions.patchPreferences({ supplierFilters: { bidWindow: v } })}
              onClear={() => actions.patchPreferences({ supplierFilters: { bidWindow: null } })}
              options={BID_WINDOWS.map((b) => ({ value: b, label: t.options.bidWindow[b] }))}
            />
          </Tile>
          <Tile label={t.create.ready.supplierFilters}>
            <SelChips<string>
              values={[
                prefs.supplierFilters.verifiedOnly ? "verified" : "",
                prefs.supplierFilters.sublettingAllowed ? "subletting" : "",
              ].filter(Boolean)}
              onToggle={(v) =>
                actions.patchPreferences({
                  supplierFilters:
                    v === "verified"
                      ? { verifiedOnly: !prefs.supplierFilters.verifiedOnly }
                      : { sublettingAllowed: !prefs.supplierFilters.sublettingAllowed },
                })
              }
              options={[
                { value: "verified", label: t.create.ready.verifiedOnly },
                { value: "subletting", label: t.create.ready.sublettingAllowed },
              ]}
            />
          </Tile>
          <div className="sm:col-span-2 lg:col-span-3">
            <Tile label={`${t.create.ready.additionalNotes} ${t.create.ready.optional}`}>
              <TextArea
                rows={2}
                value={prefs.additionalNotes}
                placeholder={t.create.ready.notesPlaceholder}
                onChange={(e) => actions.patchPreferences({ additionalNotes: e.target.value })}
              />
            </Tile>
          </div>
        </div>
      </SummaryCard>

      {/* ---------------- The line items ---------------- */}
      <SummaryCard
        title={`${t.create.ready.equipment} — ${num(items.length)}`}
        onEdit={() => backToItem(0)}
        extra={
          <button
            onClick={() => downloadCsv("rfq-spec-sheet.csv", toCsv(headers, body))}
            className="inline-flex items-center gap-1 text-label font-semibold text-info"
          >
            <Icon name="grid_on" size={15} /> {t.preview.export}
          </button>
        }
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-start">
                {headers.map((h, i) =>
                  keepCol[i] ? (
                    <th key={h} className="px-2 pb-2 text-start text-label font-semibold uppercase tracking-[0.05em] text-muted">
                      {h}
                    </th>
                  ) : null,
                )}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={rows[ri].equipment + ri} className="border-b border-border/60 last:border-0">
                  {r.map((c, ci) =>
                    keepCol[ci] ? (
                      <td key={ci} className="px-2 py-2.5 align-top text-navy-mid">
                        {ci === 0 ? (
                          <button className="font-semibold text-info" onClick={() => backToItem(ri)}>
                            {c}
                          </button>
                        ) : (
                          c
                        )}
                      </td>
                    ) : null,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SummaryCard>

      <div className="mb-3.5 flex items-start gap-3 rounded-sm border border-info/25 bg-info-soft px-4 py-3">
        <Icon name="ios_share" size={18} className="mt-0.5 flex-none text-info" />
        <p className="text-body leading-relaxed text-navy">
          <b className="font-semibold">{t.create.ready.inviteTitle}</b>
          <span className="text-navy-mid"> — {t.create.ready.inviteBody}</span>
        </p>
      </div>

      <div className={ACTIONS}>
        <button
          onClick={() => actions.setReadyToSend(false)}
          className={btn("secondary", "lg", { className: "transition" })}
        >
          {t.create.ready.backToEditing}
        </button>
        <Button disabled={busy || items.length === 0} onClick={onSubmit} className="px-6 py-3 text-subhead">
          <Icon name="send" size={18} /> {busy ? `${t.create.ready.send}…` : t.create.ready.send}
        </Button>
      </div>

      <AccountModal
        open={showAccount}
        onClose={() => setShowAccount(false)}
        onCreated={() => {
          setShowAccount(false);
          void actions.submit(); // account created (now basic) → post the request
        }}
        title={t.guest.postGateTitle}
        postSubhead={t.guest.postBodyRequest}
      />

      {showLimit && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
          dir={ar ? "rtl" : "ltr"}
          onClick={(e) => e.target === e.currentTarget && setShowLimit(false)}
        >
          <div className="w-full max-w-[440px] rounded-t-lg bg-surface p-5 sm:rounded-lg">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-warn-soft text-warn">
                <Icon name="verified_user" size={24} />
              </span>
              <div className="flex-1">
                <h3 className="text-title font-extrabold text-navy">{L("Request limit reached", "بلغت الحد الأقصى للطلبات")}</h3>
                <p className="mt-1.5 text-body leading-relaxed text-muted">
                  {L(
                    "Basic accounts can post a limited number of requests. Get verified to post unlimited requests and unlock the full marketplace.",
                    "تستطيع الحسابات الأساسية إرسال عدد محدود من الطلبات. وثّق حسابك لإرسال طلبات غير محدودة والاستفادة من المنصة بالكامل.",
                  )}
                </p>
              </div>
              <button onClick={() => setShowLimit(false)} className="grid h-8 w-8 flex-none place-items-center rounded-full text-muted hover:bg-surface2">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowLimit(false)}
                className={btn("secondary", "md", { className: "transition" })}
              >
                {L("Not now", "ليس الآن")}
              </button>
              <button
                onClick={() => {
                  setShowLimit(false);
                  router.push("/verify");
                }}
                className={btn("primary", "md")}
              >
                <Icon name="verified_user" size={17} /> {L("Get verified", "وثّق حسابك")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  onEdit,
  extra,
  children,
}: {
  title: string;
  onEdit?: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <section className="mb-2.5 rounded-sm border border-border bg-surface px-5 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-body font-extrabold text-navy">
          <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
          {title}
        </span>
        <span className="flex items-center gap-4">
          {extra}
          {onEdit && (
            <button className="inline-flex items-center gap-1 text-label font-semibold text-info" onClick={onEdit}>
              <Icon name="edit" size={15} /> {t.preview.edit}
            </button>
          )}
        </span>
      </div>
      {children}
    </section>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-sm bg-surface2 px-3 py-2.5">
      <div className="mb-1.5 text-label font-semibold uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className="text-body font-semibold text-navy">{children}</div>
    </div>
  );
}
