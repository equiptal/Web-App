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
import { itemDetailRows, requestDetailRows, requestFieldFormatters, type Row } from "@/lib/contract/request-fields";
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
  openCancel,
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
  /** Open straight onto the cancel confirm — the dashboard row's ✕ enters the drawer there, so the
   *  one confirm that exists is the one the renter meets wherever he pressed it. */
  openCancel?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);

  const [shareOpen, setShareOpen] = useState(!!openShare);
  /**
   * **Entered on the share, and therefore the share is all there is** (owner, 2026-08-31: *"why does
   * sharing a request open the details too?"*).
   *
   * The rail's share badge opens this component with `openShare`, which drew the whole request
   * behind the sheet: one press, two stacked modals, and a details screen the renter did not ask
   * for. Held at mount rather than read live, so pressing *Share request* in the FOOTER — a
   * legitimate stacked case, from inside a details screen the renter did open — still layers the
   * sheet over the details it belongs to.
   *
   * Closing the sheet on this path closes everything, for the same reason: revealing a screen nobody
   * asked for is not a way out of one.
   */
  const [shareOnly] = useState(!!openShare);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [editing, setEditing] = useState<RequestRecord | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(!!openCancel);
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
    : { canEdit: false, editCapUsed: false, editNeedsConfirm: false, canCancel: false, canShare: false };

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const viaApp = bids.filter((b) => b.source === "app").length;
  const offline = bids.filter((b) => b.source === "offline").length;
  const certs = subject?.requiredCerts ?? [];
  /** The request-level parameters. Read off the subject: the group copies them to every item. */
  const subjectRecord = subject ? records[subject.id] ?? null : null;
  const allParamRows = subjectRecord ? requestDetailRows(subjectRecord, ar, L) : [];
  /* Two of these rows describe the JOB rather than its terms — how it is rented and how long a day
     runs — and the app prints them under the site, beside «extendable». Split by label because that
     is what `requestDetailRows` returns; it is one list and this is the only place that cares which
     half a row belongs to. */
  /* ── Three groups, the app's own (owner, 2026-09-07, with the app's screens beside it) ───────
     · **The strip under the site** — how it is rented and how a day runs, plus the payment term and
       whether the dates can move. Four cells, as the app draws them: they qualify the JOB.
     · **Project details** — the working week, and nothing else the app puts there.
     · **Preferences** — every remaining term the renter expressed: maintenance, overtime, the
       breakdown response, the budget. The app's own last section, and its own heading. */
  const stripLabels = [L("Rental basis", "أساس الإيجار"), L("Working hours", "ساعات العمل"), L("Payment terms", "شروط الدفع")];
  const projectLabels = [L("Working days / week", "أيام العمل/أسبوع")];
  const siteRows = allParamRows.filter(([label]) => stripLabels.includes(label));
  const projectRows = allParamRows.filter(([label]) => projectLabels.includes(label));
  const preferenceRows = allParamRows.filter(([label]) => !stripLabels.includes(label) && !projectLabels.includes(label));
  /**
   * Extendable, said with the dates and not with the terms (owner, 2026-09-02).
   *
   * It is the one stored flag that qualifies the PERIOD — «these dates, and they can move» — so it
   * belongs under the end date rather than twenty rows below it. `requestDetailRows` no longer
   * returns it, which is why it is read off the record here; `yn` is the same formatter that list
   * uses, so «No» reads the same wherever it appears.
   */
  const extendable = subjectRecord ? requestFieldFormatters(ar, L).yn(subjectRecord.extendable) : null;
  const notes = typeof subjectRecord?.additionalNotes === "string" ? subjectRecord.additionalNotes.trim() : "";
  /** «31/8 – 7/10», the app's own compact period. Both ends, because a start with no end is a
   *  different promise from a fixed window, and the strip is where a reader checks that. */
  const period = (() => {
    const a = subject?.startDate ? fmt(subject.startDate) : null;
    const b = subject?.endDate ? fmt(subject.endDate) : null;
    if (a && b) return `${a} – ${b}`;
    return a ?? b ?? "";
  })();
  /** The urgency the renter chose, made readable — `FAR_FUTURE` is not a word. */
  const urgency = (() => {
    const raw = (subjectRecord as { urgency?: string | null } | null)?.urgency ?? null;
    return raw ? raw.replace(/[_-]+/g, " ").toLowerCase().replace(/\w/g, (c) => c.toUpperCase()) : "";
  })();
  // The Supplier OS host, not this app's origin — so no `typeof window` guard and no SSR-empty value.
  const shareUrl = bidShareUrl(group.id);

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

  /* The share-only path. Rendered before the dialog so the details never mount behind it — see
     `shareOnly`. Every prop is the same one the stacked sheet below receives. */
  if (shareOnly && shareOpen) {
    return (
      <ShareForBidsSheet
        open
        onClose={() => {
          setShareOpen(false);
          onClose();
        }}
        shareUrl={shareUrl}
        renterName={link?.renterName}
        requestCode={group.groupRef ?? subject?.displayId ?? null}
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
    );
  }

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
            {/* ── Cancel, in the footer with the other two (owner, 2026-09-02) ──────────────────
                ~~It sat at the foot of the BODY, behind its own rule, deliberately out of reach of
                «the same sweep of the hand that shares».~~ What that actually produced was a second
                footer: two rules, two rows of actions, and the destructive one ABOVE the pair it was
                being kept away from — so it was the first thing under the request and it scrolled
                with the body while Share and Edit stayed put.

                All three are footer actions, so all three are in the footer. Distance is not what
                keeps it safe: it is a text button in `danger` on the far edge, it says what it ends,
                and it opens a confirm that names the request. */}
            {actions.canCancel && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="me-auto text-body font-semibold text-danger underline-offset-4 transition hover:underline"
              >
                {t.workspace.cancelRequest}
              </button>
            )}
            {/* Said out loud rather than left to a hover: a disabled button with no reason reads as
                a bug. It is read before the button it explains. */}
            {actions.editCapUsed && (
              <p className="text-label font-semibold text-muted">{t.workspace.editCapUsed}</p>
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
            {/* Only while it can still take a bid (owner, 2026-08-31). The link a share hands out is
                an invitation to quote; on a shut request it leads to a form that refuses the
                supplier, so the renter spends a contact and the supplier meets an error. The rail's
                share badge follows the same rule, and gives the tile its ✕ instead. */}
            {actions.canShare && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className={btn("primary", "md", { className: "transition" })}
              >
                <Icon name="ios_share" size={16} /> {t.workspace.shareRequest}
              </button>
            )}
          </>
        }
      >
        <div {...pin("request-details")}>
          {/* ── The header strip, first (owner, 2026-09-07) ──────────────────────────────────────
              *"First thing the header, with period, duration and urgency, and created at."*

              The app's own opening band, four cells on the navy: the four facts that place a request
              in time before any of its terms matter. ~~A «Request» section of label-left rows —
              status, reach, reference, requested-on — above the machines.~~ Status and reach are
              CHIPS beside the title now, where the app puts them, and the reference sits with them:
              a reader checking the code is not reading a field, he is copying an identifier. */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {subject && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-navy px-2.5 py-1 text-label font-semibold text-white">
                <span className="size-1.5 rounded-full bg-ok" />
                {ar ? statusMeta(subject.status).ar : statusMeta(subject.status).en}
              </span>
            )}
            <span className="rounded-full bg-surface2 px-2.5 py-1 text-label font-semibold text-navy-mid">
              {(subject?.type ?? group.type) === "DIRECT" ? L("One supplier", "مؤجّر واحد") : L("Open to the market", "مفتوح للسوق")}
            </span>
            <span className="keep-mono rounded-full border border-border px-2.5 py-1 text-label font-semibold text-muted">
              {group.groupRef ?? subject?.displayId ?? group.id}
            </span>
            {/* How many offers came back, split by source — «4 bids» hides that three of them were
                typed in by hand. It sat in the site section, which was never a fact about the site. */}
            <span className="rounded-full border border-border px-2.5 py-1 text-label font-semibold text-muted">
              {bids.length === 0
                ? t.workspace.noBidsYet
                : `${bids.length} · ${t.workspace.bidsSplit.replace("{app}", String(viaApp)).replace("{offline}", String(offline))}`}
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-md bg-navy sm:grid-cols-4">
            {[
              [t.workspace.factPeriod, period],
              [t.workspace.factDuration, subject?.durationDays ? t.workspace.daysValue.replace("{n}", String(subject.durationDays)) : "—"],
              [t.workspace.factUrgency, urgency],
              [t.workspace.factRequested, fmt(group.createdAt)],
            ].map(([label, value]) => (
              <span key={String(label)} className="flex min-w-0 flex-col gap-0.5 border-e border-white/10 px-3 py-2.5 last:border-e-0">
                <span className="truncate text-label font-semibold uppercase tracking-wide text-white/60">{label}</span>
                <span className="truncate text-body font-extrabold text-white">{value || "—"}</span>
              </span>
            ))}
          </div>

          {/* ── The machines, each with its own terms (owner, 2026-08-29) ────────────────────────
              Every line of the group is listed and the one in focus is marked, as before — but a
              machine's own parameters (operator, fuel, who delivers it, night shift) are per ITEM,
              not per request, so they belong on the machine and nowhere else. They appear as the
              records arrive; until then the row is what it always was. */}
          <Section title={L("Equipment details", "تفاصيل المعدات")}>
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
                      /* ── OPERATOR · LOGISTICS · CERTIFICATES (owner, 2026-09-07) ────────────────
                         The app's own three groups, and the order is the order a renter asks the
                         questions in: who runs it, how it gets there and back, what it must hold.

                         ~~One flat grid of every item row.~~ It printed «Operator», «Delivery to
                         site», «Return from site», «Night shift», «Fuel» and the year as six
                         equal-weight boxes, so nothing said which of them belonged together — and
                         the two transport rows, which are one decision taken twice, sat apart.

                         A group with nothing in it is not drawn, so a machine that stated only its
                         year shows one line rather than three empty headings. */
                      <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <ItemGroup icon="person" title={L("Operator", "المشغّل")} rows={groupOf(rows, OPERATOR_LABELS(L))} />
                          <ItemGroup icon="local_shipping" title={L("Logistics", "النقل")} rows={groupOf(rows, LOGISTICS_LABELS(L))} />
                        </div>
                        <ItemGroup icon="verified_user" title={L("Certificates", "الشهادات")} rows={groupOf(rows, CERT_LABELS(L))} chips />
                        {/* Whatever the machine states that is none of the three — the year, the
                            fuel, its own notes. Kept, because a request that names a 2020 minimum
                            has said something a supplier must meet. */}
                        <ItemGroup icon="tune" title={L("Also asked", "مطلوب أيضًا")} rows={groupOf(rows, null, [...OPERATOR_LABELS(L), ...LOGISTICS_LABELS(L), ...CERT_LABELS(L), L("Units", "العدد")])} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── The site, as the app draws it (owner, 2026-09-07) ────────────────────────────────
              A block that opens the map, the address under it, and the four-cell strip beneath —
              rental basis, payment term, hours a day, extendable. ~~A column of label-left rows
              carrying the dates, the duration, the site and the bid count.~~ The dates and the
              duration moved to the header strip, where the owner asked for them; the bid count is
              not a fact about the site at all and now sits with the machines' own count of offers.

              A SEARCH on the address, not a pin: the my-requests payload carries no coordinates —
              checked against staging — and the stored address is what a person would paste into
              Maps themselves. Inventing a point from a label would put a pin somewhere nobody
              agreed to. Text-only when there is no address, rather than a link that searches for
              nothing. */}
          <Section title={L("Project location", "موقع المشروع")}>
            {(() => {
              const where = group.address ?? group.locationLabel;
              return (
                <div className="overflow-hidden rounded-md border border-border">
                  {where?.trim() ? (
                    <a
                      className="flex items-center gap-3 bg-surface2 px-3.5 py-3 transition hover:bg-surface3"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="grid size-9 flex-none place-items-center rounded-full bg-surface text-brand">
                        <Icon name="place" size={19} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-extrabold text-navy">{where}</span>
                        <span className="block text-label font-semibold text-muted">{L("Open in Maps", "افتح في الخرائط")}</span>
                      </span>
                      <span className="flex-none text-muted">{ar ? "‹" : "›"}</span>
                    </a>
                  ) : (
                    <p className="bg-surface2 px-3.5 py-3 text-body font-semibold text-muted">{L("No site named", "لم يُحدد موقع")}</p>
                  )}

                  {/* The strip: how it is rented, what it pays on, how long a day runs, and whether
                      the dates can move. Four cells because they qualify one another. */}
                  <div className="grid grid-cols-2 divide-x divide-border border-t border-border sm:grid-cols-4 rtl:divide-x-reverse">
                    {[...siteRows, ...(extendable ? [[L("Extendable", "قابل للتمديد"), extendable] as Row] : [])].map(([label, value]) => (
                      <span key={label} className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5 text-center">
                        <span className="truncate text-label font-semibold uppercase tracking-wide text-muted">{label}</span>
                        <span className="truncate text-body font-extrabold text-navy">{value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </Section>

          {/* ── Everything else the request stores ──────────────────────────────────────────────
              Only the ones with a VALUE are drawn — a list padded with dashes reads as a broken
              fetch rather than as a request that simply left them unset, and the section itself
              disappears when the request set none of them.

              As a GRID of boxes, not a divided column (owner, 2026-09-02: *"all the terms and
              fields look so overwhelming, show the ones in the request in a clear way"*). A dozen
              full-width rows of label-left / value-right is a page of scrolling in which every row
              looks like every other, and the eye has to cross the whole panel to join a label to
              its answer. Three to a line, label directly over value, the whole set is one block a
              reader takes in at a glance, and what the request actually states is a third of the
              height it was. */}
          {/* ── «Project details», and it is the app's own section (owner, 2026-09-06) ──────────
              *"Can we show it like this order… in project details we show working days / week,
              preferences."* The app puts the basis and the hours WITH the site — they qualify the
              job's shape, not its terms — and keeps everything else, working days included, under
              one «project details» heading. `requestDetailRows` already states them all; this only
              decides which of the two places each is read in. */}
          {projectRows.length > 0 && (
            <Section title={L("Project details", "تفاصيل المشروع")}>
              <FactGrid rows={projectRows} />
            </Section>
          )}

          {/* ── Preferences, the app's own last section (owner, 2026-09-07) ─────────────────────
              *"Finally a preferences section: maintenance or payment or whatever."*

              Everything the renter expressed that is neither the job's shape nor the working week:
              maintenance, the breakdown response, overtime, the budget, the offer's own duration.
              The section disappears when he stated none of them, because a heading over nothing
              reads as a fetch that failed. */}
          {preferenceRows.length > 0 && (
            <Section title={L("Preferences", "التفضيلات")}>
              <FactGrid rows={preferenceRows} />
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

      </Dialog>

      <ShareForBidsSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
        renterName={link?.renterName}
        requestCode={group.groupRef ?? subject?.displayId ?? null}
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
/* ── Which of a machine's answers belong together (owner, 2026-09-07) ────────────────────────────
   The app groups them as OPERATOR · LOGISTICS · CERTIFICATES, and these are the labels
   `itemDetailRows` returns for each. Matched on the LABEL because that list returns `[label, value]`
   and nothing else — the alternative is a second vocabulary of keys kept in step with it by hand. */
const OPERATOR_LABELS = (L: (en: string, ar: string) => string) => [
  L("Operator", "المشغّل"),
  L("Operator nationality", "جنسية المشغّل"),
  L("Food & accommodation", "الإعاشة والسكن"),
  L("Night shift", "وردية ليلية"),
];
const LOGISTICS_LABELS = (L: (en: string, ar: string) => string) => [
  L("Delivery to site", "التوصيل للموقع"),
  L("Return from site", "الإرجاع من الموقع"),
];
const CERT_LABELS = (L: (en: string, ar: string) => string) => [L("Safety certificates", "شهادات السلامة")];

/** The rows whose label is in `wanted` — or, with `wanted` null, every row NOT in `except`. */
function groupOf(rows: Row[], wanted: string[] | null, except: string[] = []): Row[] {
  return wanted ? rows.filter(([l]) => wanted.includes(l)) : rows.filter(([l]) => !except.includes(l));
}

/**
 * One labelled group inside a machine's box: a heading with its glyph, then the answers.
 *
 * `chips` draws them as pills rather than rows — a certificate is a badge the machine either holds
 * or does not, and the app draws it that way; a responsibility is a sentence with two sides and
 * reads as label-and-value.
 */
function ItemGroup({ icon, title, rows, chips }: { icon: string; title: string; rows: Row[]; chips?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-sm bg-surface p-2.5">
      <span className="mb-1.5 flex items-center gap-1.5 text-label font-semibold uppercase tracking-wide text-muted">
        <Icon name={icon} size={13} /> {title}
      </span>
      {chips ? (
        <span className="flex flex-wrap gap-1.5">
          {rows.flatMap(([, value]) =>
            value.split("·").map((one) => (
              <span key={one} className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok-soft px-2 py-0.5 text-label font-semibold text-ok">
                <Icon name="verified" size={12} /> {one.trim()}
              </span>
            )),
          )}
        </span>
      ) : (
        <dl className="flex flex-col gap-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <dt className="min-w-0 truncate text-label font-semibold text-muted">{label}</dt>
              <dd className="flex-none text-meta font-semibold text-navy">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-label font-extrabold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * A set of answers as boxes, three to a line, label over value.
 *
 * `Fact` is right for the handful of facts a reader came for — status, the dates, the site — where
 * label-left / value-right down a rule reads as a summary. It is wrong for a dozen enum answers:
 * that is a wall (owner, 2026-09-02), and a wall is skipped rather than read.
 *
 * Two to a line on a narrow panel, three from `sm` up. The value is `title`d because a long one
 * («Bank Transfer», an address of a payment term) truncates rather than reflowing the grid.
 */
function FactGrid({ rows, cell = "bg-surface2" }: { rows: Row[]; cell?: string }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className={`min-w-0 rounded-sm border border-border px-2.5 py-1.5 ${cell}`}>
          <div className="truncate text-label font-extrabold uppercase tracking-wide text-muted" title={label}>
            {label}
          </div>
          <div className="mt-0.5 truncate text-body font-semibold text-navy" title={value}>
            {value}
          </div>
        </div>
      ))}
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
