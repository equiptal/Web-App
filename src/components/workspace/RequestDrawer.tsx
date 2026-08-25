"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { DialogDrawer } from "@/components/Dialog";
import { CloseIcon } from "@/components/HeaderIcons";
import {
  bidShareUrl,
  cancelRequest,
  fetchRequestDetail,
  setBidDeadline,
  setShareLinkLogo,
} from "@/lib/api/client";
import { CERT_LABEL } from "@/lib/contract/bids";
import { publicTaxonomyUrl, type RequestGroup, type RequestListItem, type RequestRecord } from "@/lib/contract/requests";
import { requestActions, type WorkspaceBid } from "@/lib/contract/workspace";
import { ShareForBidsSheet } from "@/components/requests/ShareForBidsSheet";
import { ConfirmCancelModal, EditRequestModal } from "@/components/requests/RequestEditModals";

/** What the share sheet needs about this request's public bid link. */
export interface ShareLinkMeta {
  renterName: string | null;
  bidDeadline: string | null;
  logoUrl: string | null;
}

/**
 * The request drawer — everything about the request itself, opened from the dark strip's site name
 * or its REQ id. It replaces the standalone detail pages.
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
export function RequestDrawer({
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

  // The drawer acts on the item in focus: a group is a fan-out of single-item requests, and each one
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
  const shareUrl = typeof window !== "undefined" ? bidShareUrl(window.location.origin, group.id, link?.renterName) : "";

  /** Edit opens the same form the detail page used — the record has to be fetched in full first. */
  const openEdit = async () => {
    if (!subject || loadingEdit) return;
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
      {/* A DRAWER rather than a centred dialog, and the content decides that: the request is read
          ALONGSIDE the bids it explains, not answered and dismissed. `DialogDrawer` gives it the same
          scrim, the same close and the same type as every other dialog; only the geometry differs.

          It keeps its navy masthead through `header`, because that masthead is not chrome here — it
          carries Share and Edit, which are what the drawer is for. */}
      <DialogDrawer
        open
        onClose={onClose}
        header={
        <div className="flex-none bg-navy px-5 pb-5 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-white/55">
                {group.groupRef ?? subject?.displayId ?? group.id}
              </div>
              <h2 className="mt-0.5 truncate text-[20px] font-extrabold tracking-[-.3px]">{group.locationLabel}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2 text-[13px] font-extrabold text-white transition hover:brightness-105"
            >
              <Icon name="ios_share" size={16} /> {t.workspace.shareRequest}
            </button>
            {actions.canEdit && (
              <button
                type="button"
                disabled={actions.editCapUsed || loadingEdit}
                onClick={() => (actions.editNeedsConfirm ? setConfirmEdit(true) : void openEdit())}
                className="rounded-[10px] border border-white/30 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {t.workspace.editRequest}
              </button>
            )}
          </div>
          {/* Said out loud rather than left to a hover: a disabled button with no reason reads as a bug. */}
          {actions.editCapUsed && <p className="mt-2 text-[11.5px] font-semibold text-white/60">{t.workspace.editCapUsed}</p>}
        </div>
        }
      >
        <div>
          {/* The items. On a group every line is listed; the one in focus is marked. */}
          <div className="space-y-2">
            {group.items.map((it) => {
              const focused = it.id === subject?.id;
              const img = publicTaxonomyUrl(it.item?.imageUrl ?? null);
              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 ${
                    focused ? "border-brand bg-brand-soft/40" : "border-border bg-surface2"
                  }`}
                >
                  <span className="grid h-11 w-14 flex-none place-items-center overflow-hidden rounded-[8px] bg-surface3">
                    {img ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="precision_manufacturing" size={20} className="text-muted" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-extrabold text-navy">
                      {it.item ? (ar ? it.item.nameAr || it.item.name : it.item.name) : it.displayId}
                    </div>
                    <div className="text-[11.5px] font-semibold text-muted">
                      {t.workspace.unitsCount.replace("{n}", String(it.item?.qty ?? 1))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <dl className="mt-4 divide-y divide-border">
            <Fact label={t.workspace.factStarts} value={fmt(subject?.startDate ?? null)} />
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

          {/* Required certificates, as the enum can name them. A requirement outside it is not
              rendered rather than guessed at. */}
          {certs.length > 0 && (
            <div className="mt-4">
              <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">{t.workspace.certsRequired}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {certs.map((c) => (
                  <span key={c} className="rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-[11.5px] font-bold text-navy">
                    {ar ? CERT_LABEL[c].ar : CERT_LABEL[c].en}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {actions.canCancel && (
          <div className="border-t border-border px-5 py-3.5">
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="text-[12.5px] font-bold text-danger underline-offset-4 hover:underline"
            >
              {t.workspace.cancelRequest}
            </button>
          </div>
        )}
      </DialogDrawer>

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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-end text-[13px] font-bold text-navy">{value}</dd>
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
    <>
      <div className="fixed inset-0 z-[60] bg-navy/50" onClick={onClose} />
      <div role="alertdialog" aria-modal="true" className="fixed inset-x-4 top-1/2 z-[61] mx-auto max-w-[380px] -translate-y-1/2 rounded-[16px] bg-surface p-5 shadow-2xl">
        <h3 className="text-[16px] font-extrabold text-navy">{title}</h3>
        <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-navy-mid">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-border px-4 py-2 text-[13px] font-bold text-navy-mid">
            {t.common.cancel}
          </button>
          <button type="button" onClick={onConfirm} className="rounded-[10px] bg-navy px-4 py-2 text-[13px] font-extrabold text-white">
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
