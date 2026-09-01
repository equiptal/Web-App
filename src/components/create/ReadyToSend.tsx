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
import { Dialog } from "@/components/Dialog";
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
import { Dropdown } from "@/components/Dropdown";
import { shortSite } from "@/lib/contract/project";
import { leftTheSite, projectTitle } from "@/lib/contract/project";

export function ReadyToSend() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const router = useRouter();
  const { state, actions } = useRfq();
  /* The same question the location panel asks, from the same helper — two answers to "is this still
     the site's place?" would eventually disagree, and this one is the last word before sending. */
  const unfiled = state.project && state.draft
    ? leftTheSite(state.project.location, state.draft.project.location)
    : false;
  const { tier } = useSession();
  const [showAccount, setShowAccount] = useState(false);
  const [showLimit, setShowLimit] = useState(false);
  /** Everything the strip summarises, in the sections it came from. */
  const [details, setDetails] = useState(false);

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

  /* ── The whole request, on one line, beside the title (owner, 2026-09-02) ────────────────────
   *
   * *"All the summary shown as simple card containing main info, on the same side of the title of
   * the page on the right. I want this page for another content, so compact the summary in one
   * summarized card that can view more and open all of these in a modal."*
   *
   * Four stacked cards owned the whole page to restate values the renter had just finished setting.
   * They were a receipt, and a receipt is read once and scrolled past, so the page was spending its
   * best space on the least new information. One line says the same thing at a glance and hands the
   * page back.
   *
   * Nothing is hidden: everything those cards held is a press away, in the same sections with the
   * same pens and the same export. What changed is which of the two is the default.
   */
  const first = rows[0];
  const place = project.location.label ?? null;
  const mapHref =
    project.location.lat != null && project.location.lng != null
      ? `https://www.google.com/maps?q=${project.location.lat},${project.location.lng}`
      : place
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
        : null;

  /* What is TRUE of the first machine, and only what is true: an operator it does not need, a year
     nobody set and a certificate nobody asked for are three facts about nothing. `termsSummary` on
     the chart makes the same choice for the same reason. */
  const machineNote = first
    ? [
        first.operatorNeeded === "yes" ? t.create.ready.stripOperator : null,
        first.year && first.year !== "any" ? first.year : null,
        first.certificate.length
          ? first.certificate.map((c) => (c === "other" && first.certificateOther ? first.certificateOther : t.options.safetyCert[c])).join(", ")
          : null,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <div {...pin("ready-to-send")}>
      {/* The title and the summary share one row: the summary is what the page is ABOUT, so it sits
          at the top of it rather than under it. It wraps below the title on a narrow screen, where
          two things cannot share a line without one of them being unreadable. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-display font-extrabold text-navy">{t.create.ready.title}</h1>
          <p className="mt-1 text-meta text-muted">{t.create.ready.subtitle}</p>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-border bg-surface px-4 py-2.5">
        {/* A green dot for «this is ready», the same mark the panels use on the canvas. */}
        <span aria-hidden className="size-2 flex-none rounded-full bg-ok" />

        {mapHref && place && (
          <StripFact icon="place">
            {/* The real link (owner, 2026-09-02). An address a renter cannot press is an address
                they retype into another tab to check. */}
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate underline decoration-border underline-offset-2 hover:text-brand"
            >
              {shortSite(place)}
            </a>
          </StripFact>
        )}

        {project.timing.startDate && project.timing.endDate && (
          <StripFact icon="calendar_month">
            {fmtDate(project.timing.startDate)} → {fmtDate(project.timing.endDate)}
            {charged.known && <span className="text-muted"> · {num(charged.chargedDays)} {t.create.ready.stripDays}</span>}
          </StripFact>
        )}

        {/* Payment is SET here, not just shown (owner, 2026-09-02). It is the one term a renter
            commonly answers at this moment, and sending them into a modal to press one chip is the
            kind of trip this redesign exists to remove. */}
        <StripFact icon="star_outline">
          <Dropdown
            tone="pill"
            label={t.create.ready.paymentTerms}
            placeholder={t.create.ready.stripNoPayment}
            value={prefs.payment.terms}
            onChange={(v) => actions.patchPreferences({ payment: { terms: (v || null) as PaymentTerm } })}
            options={PAYMENT_TERMS.map((o) => ({ value: o, label: t.options.paymentTerm[o] }))}
          />
          {prefs.supplierFilters.verifiedOnly && (
            <span className="text-muted">· {t.create.ready.stripVerified}</span>
          )}
        </StripFact>

        {first && (
          <StripFact icon="inventory_2">
            <span className="truncate">
              {first.equipment}
              {first.size ? ` ${first.size}` : ""} ×{num(first.qty)}
            </span>
            {machineNote && <span className="truncate text-muted">· {machineNote}</span>}
            {items.length > 1 && (
              <span className="flex-none font-semibold text-brand">+{num(items.length - 1)}</span>
            )}
          </StripFact>
        )}

        <button
          type="button"
          onClick={() => setDetails(true)}
          className={btn("secondary", "sm", { className: "ms-auto flex-none" })}
        >
          {t.create.ready.viewAll}
        </button>
      </div>

      <Dialog open={details} onClose={() => setDetails(false)} title={t.create.ready.detailsTitle} size="xl">
        <div className="flex flex-col">

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

        </div>
      </Dialog>

      <div className="mb-3.5 flex items-start gap-3 rounded-sm border border-info/25 bg-info-soft px-4 py-3">
        <Icon name="ios_share" size={18} className="mt-0.5 flex-none text-info" />
        <p className="text-body leading-relaxed text-navy">
          <b className="font-semibold">{t.create.ready.inviteTitle}</b>
          <span className="text-navy-mid"> — {t.create.ready.inviteBody}</span>
        </p>
      </div>

      {/* ── What this send will NOT do (owner, 2026-08-31) ────────────────────────────────────────
          *"changing location will not be able to be part of the selected project beside the confirm
          button so user know it is not included"*.

          Beside the button rather than up in the summary table, because this is the last moment the
          renter can change their mind and the summary is a thing they have already read past. Red,
          not amber: amber is this app's «check this», and there is nothing to check — the request
          will not be filed, and the only two answers are to accept that or go back and move the pin.

          It says the site's name. *"Not part of the project"* invites the question «which one?» from
          a renter who has three. */}
      {unfiled && (
        <div className="mb-3.5 flex items-start gap-3 rounded-sm border border-danger/40 bg-danger-soft px-4 py-3">
          <Icon name="error_outline" size={18} className="mt-0.5 flex-none text-danger" />
          <p className="text-body leading-relaxed text-danger">
            <b className="font-semibold">{t.create.wherePanel.unfiledShort}</b>
            <span> — {t.create.wherePanel.unfiledNote.replace("{project}", projectTitle(state.project!))}</span>
          </p>
        </div>
      )}

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
        <Dialog
          open
          onClose={() => setShowLimit(false)}
          size="sm"
          icon={
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-warn-soft text-warn">
              <Icon name="verified_user" size={19} />
            </span>
          }
          title={L("Request limit reached", "بلغت الحد الأقصى للطلبات")}
          footer={
            <>
              <button onClick={() => setShowLimit(false)} className={btn("secondary", "md", { className: "transition" })}>
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
            </>
          }
        >
          <p className="text-body leading-relaxed text-muted">
            {L(
              "Basic accounts can post a limited number of requests. Get verified to post unlimited requests and unlock the rest of the marketplace.",
              "تستطيع الحسابات الأساسية إرسال عدد محدود من الطلبات. وثّق حسابك لإرسال طلبات بلا حدود.",
            )}
          </p>
        </Dialog>
      )}
    </div>
  );
}

/**
 * One fact on the summary strip: an icon, its value, and a rule before the next one.
 *
 * The rule is a border rather than a «·» so the row reads as separate facts at a glance instead of
 * one long sentence, and it is dropped on the first child because a rule with nothing before it is
 * a stray mark on the left edge.
 */
function StripFact({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 border-border ps-4 text-body text-navy first-of-type:ps-0 sm:border-s sm:first-of-type:border-s-0">
      <Icon name={icon} size={14} className="flex-none text-muted" />
      {children}
    </span>
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
