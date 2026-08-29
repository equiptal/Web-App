"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import {
  bidShareUrl,
  cancelRequest,
  fetchRequestDetail,
  setBidDeadline,
  setShareLinkLogo,
} from "@/lib/api/client";
import { CERT_LABEL } from "@/lib/contract/bids";
import { publicTaxonomyUrl, statusMeta, type RequestGroup, type RequestListItem, type RequestRecord } from "@/lib/contract/requests";
import { itemDetailRows, requestDetailRows } from "@/lib/contract/request-fields";
import { requestActions, type WorkspaceBid } from "@/lib/contract/workspace";
import { ShareForBidsSheet } from "@/components/requests/ShareForBidsSheet";
import { ConfirmCancelModal, EditRequestModal } from "@/components/requests/RequestEditModals";
import { ACTIONS, btn, cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/** What the share sheet needs about this request's public bid link. */
export interface ShareLinkMeta {
  renterName: string | null;
  bidDeadline: string | null;
  logoUrl: string | null;
}

/**
 * The request details modal — everything about the request itself, opened from the navy context bar
 * above the bids. It replaces the standalone detail pages.
 *
 * It was a side drawer until 2026-08-29, on the reasoning that a request is read ALONGSIDE the bids
 * it explains. The house rule outranks that: one modal shape for everything the app asks or answers,
 * and the scrim dims those bids whichever edge the panel arrives from.
 *
 * **Editing mirrors the mobile app** (`request_detail_page.dart:165-174`, `638-674`), which the web
 * used to contradict by hiding Edit the moment a bid arrived. The rule is `requestActions`; this
 * renders it. What it must never do is let the renter fill the form and be refused at save — the
 * server enforces the cap regardless, so the refusal belongs before the form, not after it.
 *
 * The form itself is the existing `EditRequestModal`, and cancelling is the existing
 * `ConfirmCancelModal`. Neither is rebuilt here: two editing surfaces for one request would drift.
 *
 * Cancelling sits at the foot as a text link, away from the two buttons — it ends the request, and
 * should not be reachable by the same sweep of the hand that shares it.
 */
export function RequestDetailsModal({
  group,
  item,
  bids,
  link,
  onClose,
  onChanged,
  openShare,
}: {
  group: RequestGroup;
  /** The item in focus — the drawer lists every item and marks this one. */
  item: RequestListItem | null;
  bids: WorkspaceBid[];
  link: ShareLinkMeta | null;
  onClose: () => void;
  /** The request changed underneath the page: reload the rail and the bids. */
  onChanged: () => void;
  /** Open straight onto the share sheet — the strip’s «Share» enters the drawer there. */
  openShare?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);

  const [shareOpen, setShareOpen] = useState(!!openShare);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [editing, setEditing] = useState<RequestRecord | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState<string | null>(link?.bidDeadline ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(link?.logoUrl ?? null);
  useEffect(() => {
    setDeadline(link?.bidDeadline ?? null);
    setLogoUrl(link?.logoUrl ?? null);
  }, [link]);

  /**
   * The FULL record for every request in the group, keyed by id.
   *
   * The list payload the workspace runs on is a projection — id, status, dates, bid count, and the
   * machine's name. It carries about a tenth of what a request stores. So the modal fetches the real
   * records on open, and until they land it shows what it already has rather than a spinner: the
   * dates, the site and the machines are all in the list payload and are what a renter opens this
   * for first.
   *
   * ONE FETCH PER ITEM, in parallel. A multi-item submission is a fan-out of single-item requests:
   * the request-level settings are copied across all of them, but the item-level ones — operator,
   * fuel, who delivers — are per machine, and there is no endpoint that returns the set. A group is
   * one submission's worth of machines, so this is a handful of calls, not a page of them.
   */
  const [records, setRecords] = useState<Record<string, RequestRecord>>({});
  const [recordsFailed, setRecordsFailed] = useState(false);
  const ids = group.items.map((it) => it.id).join(",");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const settled = await Promise.allSettled(ids.split(",").filter(Boolean).map((id) => fetchRequestDetail(id)));
      if (!alive) return;
      const next: Record<string, RequestRecord> = {};
      for (const r of settled) if (r.status === "fulfilled") next[r.value.id] = r.value;
      setRecords(next);
      // Only when EVERY one failed. A group where one call fell over still has details to show, and
      // saying "could not load" over a list that is visibly populated is worse than saying nothing.
      setRecordsFailed(settled.length > 0 && settled.every((r) => r.status === "rejected"));
    })();
    return () => {
      alive = false;
    };
  }, [ids]);

  // The modal acts on the item in focus: a group is a fan-out of single-item requests, and each one
  // carries its own status, bid count and edit cap.
  const subject = item ?? group.items[0] ?? null;
  const actions = subject
    ? requestActions(subject)
    : { canEdit: false, editCapUsed: false, editNeedsConfirm: false, canCancel: false };

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const viaApp = bids.filter((b) => b.source === "app").length;
  const offline = bids.filter((b) => b.source === "offline").length;
  const certs = subject?.requiredCerts ?? [];
  /** The request-level parameters. Read off the subject: the group copies them to every item. */
  const subjectRecord = subject ? records[subject.id] ?? null : null;
  const paramRows = subjectRecord ? requestDetailRows(subjectRecord, ar, L) : [];
  const notes = typeof subjectRecord?.additionalNotes === "string" ? subjectRecord.additionalNotes.trim() : "";
  const shareUrl = typeof window !== "undefined" ? bidShareUrl(window.location.origin, group.id, link?.renterName) : "";

  /** Edit opens the same form the detail page used — the record has to be fetched in full first. */
  const openEdit = async () => {
    if (!subject || loadingEdit) return;
    // Already fetched for the detail rows above — opening the form must not go and get it again.
    const held = records[subject.id];
    if (held) {
      setEditing(held);
      return;
    }
    setLoadingEdit(true);
    try {
      setEditing(await fetchRequestDetail(subject.id));
    } catch {
      /* leave the drawer as it was — a failed fetch must not look like a saved edit */
    } finally {
      setLoadingEdit(false);
    }
  };

  const doCancel = async () => {
    if (!subject || busy) return;
    setBusy(true);
    try {
      await cancelRequest(subject.id);
      onChanged();
      onClose();
    } catch {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  return (
    <>
      {/* ── A dialog, like every other dialog (owner, 2026-08-29) ──────────────────────────────────
          ~~A DRAWER rather than a centred dialog, because the request is read ALONGSIDE the bids it
          explains.~~ That reasoning does not survive the house rule: one modal shape for everything,
          and this is the surface a renter reaches most. A panel that slid in from the edge while
          every other answer arrived in the middle was the odd one, and reading it alongside the bids
          was never real — the scrim dims them either way.

          The navy masthead goes with it. Navy is what this app paints a MASTHEAD in — something you
          read — and the standard header is `bg-surface2` with the title, the reference under it, and
          one ×. Share and Edit move to the `footer`, which is where a dialog keeps its actions and
          where they stay put while the body scrolls. */}
      <Dialog
        open
        onClose={onClose}
        size="lg"
        title={group.locationLabel}
        subtitle={group.groupRef ?? subject?.displayId ?? group.id}
        footer={
          <>
            {/* Said out loud rather than left to a hover: a disabled button with no reason reads as
                a bug. It leads the row, so the reason is read before the button it explains. */}
            {actions.editCapUsed && (
              <p className="me-auto text-label font-semibold text-muted">{t.workspace.editCapUsed}</p>
            )}
            {actions.canEdit && (
              <button
                type="button"
                disabled={actions.editCapUsed || loadingEdit}
                onClick={() => (actions.editNeedsConfirm ? setConfirmEdit(true) : void openEdit())}
                className={btn("secondary", "md", { className: "transition" })}
              >
                {t.workspace.editRequest}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className={btn("primary", "md", { className: "transition" })}
            >
              <Icon name="ios_share" size={16} /> {t.workspace.shareRequest}
            </button>
          </>
        }
      >
        <div {...pin("request-details")}>
          {/* ── What the request IS ─────────────────────────────────────────────────────────────
              Its state and its reach. Neither is a field the renter typed, which is why they were
              missing — but "what did I ask for" includes whether it is still open and whether it went
              to the market or to one supplier, and this modal is the only place that answers either.

              Per ITEM, not per group: a fanned-out RFQ where one machine was accepted and the rest
              are still open has no single status, and rolling them into one would say something
              untrue about both. This states the item in focus, which is what the rest of the modal
              is about. */}
          <Section title={L("Request", "الطلب")}>
            <dl className="divide-y divide-border">
              {subject && (
                <Fact label={L("Status", "الحالة")} value={ar ? statusMeta(subject.status).ar : statusMeta(subject.status).en} />
              )}
              <Fact
                label={L("Reach", "نطاق الإرسال")}
                value={
                  (subject?.type ?? group.type) === "DIRECT"
                    ? L("One supplier", "مؤجّر واحد")
                    : L("Open to the market", "مفتوح للسوق")
                }
              />
              <Fact label={L("Reference", "المرجع")} value={group.groupRef ?? subject?.displayId ?? group.id} />
            </dl>
          </Section>

          {/* ── The machines, each with its own terms (owner, 2026-08-29) ────────────────────────
              Every line of the group is listed and the one in focus is marked, as before — but a
              machine's own parameters (operator, fuel, who delivers it, night shift) are per ITEM,
              not per request, so they belong on the machine and nowhere else. They appear as the
              records arrive; until then the row is what it always was. */}
          <Section title={L("Equipment", "المعدات")}>
            <div className="space-y-2">
              {group.items.map((it) => {
                const focused = it.id === subject?.id;
                const img = publicTaxonomyUrl(it.item?.imageUrl ?? null);
                const rec = records[it.id];
                const rows = rec?.equipmentItems?.length ? itemDetailRows(rec.equipmentItems[0], ar, L) : [];
                return (
                  <div
                    key={it.id}
                    className={`rounded-md border ${focused ? "border-brand bg-brand-soft/40" : "border-border bg-surface2"}`}
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <span className="grid h-11 w-14 flex-none place-items-center overflow-hidden rounded-sm bg-surface3">
                        {img ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon name="precision_manufacturing" size={20} className="text-muted" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body font-extrabold text-navy">
                          {it.item ? (ar ? it.item.nameAr || it.item.name : it.item.name) : it.displayId}
                        </div>
                        <div className="text-label font-semibold text-muted">
                          {t.workspace.unitsCount.replace("{n}", String(it.item?.qty ?? 1))}
                        </div>
                      </div>
                    </div>
                    {rows.length > 0 && (
                      /* Inside the machine's own box, on a rule — these are ITS terms, and a list
                         floating below the row would read as the request's. */
                      <dl className="divide-y divide-border border-t border-border px-3">
                        {rows.map(([label, value]) => (
                          <Fact key={label} label={label} value={value} />
                        ))}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* When and where. Duration sits with the dates it is derived from, which is why
              `requestDetailRows` deliberately leaves it out — a field printed twice makes a reader
              wonder which of the two is authoritative. */}
          <Section title={L("Period and site", "المدة والموقع")}>
            <dl className="divide-y divide-border">
              <Fact label={t.workspace.factStarts} value={fmt(subject?.startDate ?? null)} />
              {subject?.endDate && <Fact label={L("Ends", "ينتهي")} value={fmt(subject.endDate)} />}
              <Fact
                label={t.workspace.factDuration}
                value={subject?.durationDays ? t.workspace.daysValue.replace("{n}", String(subject.durationDays)) : "—"}
              />
              <Fact label={t.workspace.factSite} value={group.address ?? group.locationLabel} />
              <Fact label={t.workspace.factRequested} value={fmt(group.createdAt)} />
              {/* Split by source, because "4 bids" hides that two of them were typed in by hand. */}
              <Fact
                label={t.workspace.factBidsIn}
                value={
                  bids.length === 0
                    ? t.workspace.noBidsYet
                    : `${bids.length} · ${t.workspace.bidsSplit.replace("{app}", String(viaApp)).replace("{offline}", String(offline))}`
                }
              />
            </dl>
          </Section>

          {/* ── Everything else the request stores ──────────────────────────────────────────────
              Roughly twenty parameters, and only the ones with a value are drawn — a list padded
              with dashes reads as a broken fetch rather than as a request that simply left them
              unset. The section itself disappears when the request set none of them. */}
          {paramRows.length > 0 && (
            <Section title={L("Terms and preferences", "الشروط والتفضيلات")}>
              <dl className="divide-y divide-border">
                {paramRows.map(([label, value]) => (
                  <Fact key={label} label={label} value={value} />
                ))}
              </dl>
            </Section>
          )}

          {/* Required certificates, as the enum can name them. A requirement outside it is not
              rendered rather than guessed at. */}
          {certs.length > 0 && (
            <Section title={t.workspace.certsRequired}>
              <div className="flex flex-wrap gap-1.5">
                {certs.map((c) => (
                  <span key={c} className="rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-label font-semibold text-navy">
                    {ar ? CERT_LABEL[c].ar : CERT_LABEL[c].en}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* What the renter wrote in their own words, so it is not folded into a row of enums. */}
          {notes && (
            <Section title={L("Notes", "ملاحظات")}>
              <p className="whitespace-pre-line text-body leading-relaxed text-navy">{notes}</p>
            </Section>
          )}

          {/* Said once, quietly, and only when NOTHING loaded — the dates, the site and the machines
              above came from the list payload and are on screen regardless. */}
          {recordsFailed && (
            <p className="mt-4 text-meta text-muted">
              {L("Some details could not be loaded. Close and reopen to try again.",
                 "تعذّر تحميل بعض التفاصيل. أغلق النافذة وأعد فتحها للمحاولة مجددًا.")}
            </p>
          )}
        </div>

        {/* Cancelling ends the request, so it stays down here in the body and away from the two
            buttons in the footer — it must not be reachable by the same sweep of the hand that
            shares. `-mx-5` pulls the rule out to the panel's own edges; inside the body's padding it
            was a short line floating in the middle of nothing. */}
        {actions.canCancel && (
          <div className="-mx-5 mt-4 border-t border-border px-5 pt-3.5">
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="text-meta font-semibold text-danger underline-offset-4 hover:underline"
            >
              {t.workspace.cancelRequest}
            </button>
          </div>
        )}
      </Dialog>

      <ShareForBidsSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
        renterName={link?.renterName}
        deadline={deadline}
        onSaveDeadline={(iso) => {
          setDeadline(iso);
          void setBidDeadline(group.id, iso).catch(() => {});
        }}
        logoUrl={logoUrl}
        onSaveLogo={(url) => {
          setLogoUrl(url);
          void setShareLinkLogo(group.id, url).catch(() => {});
        }}
        ar={ar}
        L={L}
      />

      {/* The one-time-edit warning, in the app's own words. */}
      {confirmEdit && (
        <Confirm
          title={t.workspace.editOnceTitle}
          body={t.workspace.editOnceBody}
          confirmLabel={t.workspace.editOnceContinue}
          onConfirm={() => {
            setConfirmEdit(false);
            void openEdit();
          }}
          onClose={() => setConfirmEdit(false)}
        />
      )}

      {editing && subject && (
        <EditRequestModal
          r={editing}
          ar={ar}
          L={L}
          siblingIds={group.items.filter((i) => i.id !== subject.id).map((i) => i.id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      {confirmCancel && subject && (
        <ConfirmCancelModal
          ar={ar}
          L={L}
          busy={busy}
          scope={{ kind: "single", idLabel: subject.displayId }}
          onClose={() => setConfirmCancel(false)}
          onConfirm={() => void doCancel()}
        />
      )}
    </>
  );
}

/**
 * A titled block of the modal.
 *
 * The body is long now — machines, dates, twenty terms, certificates, notes — and an unbroken
 * column of label/value rows gives a reader no way to skim to the part they came for. The heading is
 * the same small uppercase grey the certificate block already used, so this is the existing style
 * applied consistently rather than a new one.
 *
 * `first:mt-0` so the top block sits against the panel's own padding instead of doubling it.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-label font-extrabold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-label font-extrabold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-end text-body font-semibold text-navy">{value}</dd>
    </div>
  );
}

function Confirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog open onClose={onClose} size="sm" padded={false}>
      <div className="p-5">
        <h3 className="text-subhead font-extrabold text-navy">{title}</h3>
        <p className="mt-1.5 text-body font-semibold leading-relaxed text-navy-mid">{body}</p>
        <div className={cx(ACTIONS, "mt-4")}>
          <button type="button" onClick={onClose} className={btn("secondary", "md")}>
            {t.common.cancel}
          </button>
          <button type="button" onClick={onConfirm} className={btn("primary", "md")}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
