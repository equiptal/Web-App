"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { fetchBidCompanyDocuments, getRenterSupplier } from "@/lib/api/client";
import type { CompanyDocsPayload, PanelCompanyDocKey } from "@/lib/contract/company-documents";
import {
  bidCount,
  canBeEmailed,
  groupsOf,
  isOnMoedatech,
  supplierTier,
  type SupplierProfile,
} from "@/lib/contract/renter-suppliers";

/**
 * SUP-T31 / T32 — everything that has passed between this renter and one supplier.
 *
 * Opened from the row. It is the whole file on a firm: how far the relationship has gone, what they
 * bid, what papers they hold, what the renter awarded them and what he sent them. The bid LIST is a
 * separate dialog (T33), because that one is a route out to the request and this one is a record.
 *
 * ── The papers are the app's rule, not ours ─────────────────────────────────────────────────────
 *
 * A supplier's company papers are only readable THROUGH A BID: the backend derives the supplier from
 * the bid and re-checks the renter can reach that bid's request. So a supplier who has never bid has
 * no papers to show — and the panel says exactly that, rather than drawing five empty pills, which
 * would read as "they have provided nothing".
 *
 * The eye is drawn from `downloadUrl` and never from the source. A presence-only row states presence
 * with nothing to open, and offering a button that would do nothing is worse than not offering it.
 */
export function SupplierProfileDialog({
  id,
  onClose,
  onOpenBids,
  onInvite,
}: {
  id: string | null;
  onClose: () => void;
  onOpenBids: (id: string) => void;
  /** Absent where there is nothing to invite from — the button is then not drawn. */
  onInvite?: () => void;
}) {
  const t = useT();
  const c = t.suppliers;
  const [p, setP] = useState<SupplierProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    setP(null);
    setFailed(false);
    getRenterSupplier(id).then(setP).catch(() => setFailed(true));
  }, [id]);

  if (!id) return null;
  const off = p?.kind === "own";

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      icon={<Icon name={off ? "person" : "verified_user"} size={18} />}
      title={p?.name ?? "…"}
      subtitle={p?.contactName || c.noContactName}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {/* The prototype puts *Invite to Moedatech* here as well as on the row, and it is right to:
              a renter reading somebody's whole history is exactly where he decides they are worth
              having in the app. Off-platform only — a firm with an account has nothing to join. */}
          {p && onInvite && !isOnMoedatech(p) && (
            <button type="button" onClick={onInvite} className={cx(btn("secondary", "md"), "me-auto")}>
              <Icon name="person_add" size={15} />
              {c.inviteToApp}
            </button>
          )}
          <button type="button" onClick={onClose} className={btn("primary", "md")}>
            {c.close}
          </button>
        </div>
      }
    >
      {failed ? (
        <p className="py-6 text-center text-meta text-muted">{c.profileFailed}</p>
      ) : !p ? (
        <p className="py-6 text-center text-meta text-muted">{c.loading}</p>
      ) : (
        <div className="grid gap-4">
          <Badges p={p} />
          <Grade p={p} />
          <BidsSummary p={p} onOpen={() => onOpenBids(p.id)} />
          <InsideTheApp p={p} />
          <Papers p={p} />
          <Awards p={p} />
          <Sent p={p} />
          <ContactAndGroups p={p} />
          {p.extra && Object.keys(p.extra).length > 0 && <Extra p={p} />}
        </div>
      )}
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-label font-extrabold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

function Note({ icon, children, tone = "calm" }: { icon: string; children: React.ReactNode; tone?: "calm" | "good" }) {
  return (
    <div
      className={cx(
        "flex items-start gap-2 rounded-md px-3 py-2.5 text-meta",
        tone === "good" ? "bg-ok-soft text-ok-deep" : "bg-surface2 text-muted-dark",
      )}
    >
      <Icon name={icon} size={15} className="flex-none" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function Badges({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cx(
          "inline-flex h-[23px] items-center gap-1.5 rounded-full px-2.5 text-label font-extrabold",
          p.kind === "platform" ? "bg-navy text-surface" : "border border-border-strong bg-surface2 text-muted-dark",
        )}
      >
        {p.kind === "platform" && <Icon name="verified_user" size={13} />}
        {p.kind === "platform" ? c.onMoedatech : c.offPlatform}
      </span>
      {p.store && (
        <span className="inline-flex h-[23px] items-center gap-1.5 rounded-full border border-border-strong bg-surface2 px-2.5 text-label font-extrabold text-muted-dark">
          <Icon name="storefront" size={13} />
          {c.hasStore}
        </span>
      )}
      {p.verified && (
        <span className="inline-flex h-[23px] items-center gap-1.5 rounded-full border border-info/30 bg-info-soft px-2.5 text-label font-extrabold text-info-deep">
          <Icon name="verified" size={13} />
          {c.verifiedByMoedatech}
        </span>
      )}
      {p.vendorRegistered && (
        <span className="inline-flex h-[23px] items-center gap-1.5 rounded-full border border-ok bg-ok-soft px-2.5 text-label font-extrabold text-ok-deep">
          <Icon name="verified" size={13} />
          {c.registeredVendor}
        </span>
      )}
    </div>
  );
}

/** The word, the dots that grade it, and the reason — never a bare label. */
function Grade({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  const { tier, dots, quiet } = supplierTier(p);
  const why =
    tier === "new"
      ? c.whyNew
      : tier === "bidding"
        ? c.whyBidding
        : tier === "working"
          ? c.whyWorking
          : fmt(c.whyCore, { n: p.rollup?.awards ?? 2 });

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface2 px-3 py-2.5">
      <span className="flex flex-none gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            className={cx(
              "block h-[7px] w-[7px] rounded-full border",
              i < dots
                ? quiet
                  ? "border-muted-light bg-muted-light"
                  : tier === "core"
                    ? "border-ok-deep bg-ok-deep"
                    : "border-navy bg-navy"
                : "border-border-strong bg-surface3",
            )}
          />
        ))}
      </span>
      <span>
        <b className="block text-subhead font-extrabold text-navy">
          {c[`tier_${tier}` as "tier_new"]}
          {quiet && <span className="font-semibold text-muted-light"> · {c.quiet}</span>}
        </b>
        <span className="block text-meta text-muted">{why}</span>
      </span>
      {!!p.rollup?.awards && (
        <span className="ms-auto inline-flex h-[23px] flex-none items-center gap-1.5 rounded-full border border-brand-pale bg-brand-soft px-2.5 text-label font-extrabold text-brand-deep">
          <Icon name="workspace_premium" size={13} />
          {fmt(c.awarded, { n: p.rollup.awards })}
        </span>
      )}
    </div>
  );
}

/** Summarised here and read elsewhere — the list is the other dialog's job. */
function BidsSummary({ p, onOpen }: { p: SupplierProfile; onOpen: () => void }) {
  const c = useT().suppliers;
  const n = bidCount(p);
  return (
    <Section label={c.colBids}>
      <div className="flex items-center gap-2 rounded-md bg-surface2 px-3 py-2.5 text-meta text-muted-dark">
        <Icon name="gavel" size={15} className="flex-none" />
        <span className="min-w-0">
          {n === 0 ? (
            c.noBids
          ) : (
            <>
              <b className="font-extrabold text-navy">{n === 1 ? fmt(c.bidOne, { n }) : fmt(c.bidMany, { n })}</b>
              {!!p.rollup?.bidsApp && <> · {fmt(c.onApp, { n: p.rollup.bidsApp })}</>}
              {!!p.rollup?.bidsLink && <> · {fmt(c.viaLink, { n: p.rollup.bidsLink })}</>}
            </>
          )}
        </span>
        {n > 0 && (
          <button type="button" onClick={onOpen} className={cx(btn("secondary", "sm"), "ms-auto flex-none")}>
            {c.openBids}
          </button>
        )}
      </div>
    </Section>
  );
}

function InsideTheApp({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  const r = p.rollup;
  // No account and nothing to show: say why, rather than four zeros that read as a bad relationship.
  if (p.kind === "own" && !r?.rooms && !r?.awards) {
    return (
      <Section label={c.insideApp}>
        <Note icon="info">{c.noAccountBody}</Note>
      </Section>
    );
  }
  const cells: [number, string][] = [
    [r?.bidsApp ?? 0, c.kOnApp],
    [r?.bidsLink ?? 0, c.kViaLink],
    [r?.rooms ?? 0, c.kRooms],
    [r?.awards ?? 0, c.kAwards],
  ];
  return (
    <Section label={c.insideApp}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map(([n, label]) => (
          <div key={label} className="rounded-md border border-border bg-surface2 px-3 py-2.5">
            <b className="block font-mono text-title tabular-nums text-navy">{n}</b>
            <span className="block text-label font-extrabold uppercase tracking-wide text-muted">{label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Five papers, read through a bid. Green when held, faint when not, amber inside 60 days of expiry. */
const DOC_ORDER: PanelCompanyDocKey[] = ["cr", "vat", "national_address", "local_content", "saso"];

function Papers({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  const { locale } = useLocale();
  const [docs, setDocs] = useState<CompanyDocsPayload | null>(null);
  const [tried, setTried] = useState(false);

  // The most recent bid this renter can still reach is the one that carries the papers.
  const bidId = p.bids[0]?.bidId ?? null;

  useEffect(() => {
    if (!bidId) return;
    fetchBidCompanyDocuments(bidId)
      .then(setDocs)
      .catch(() => undefined)
      .finally(() => setTried(true));
  }, [bidId]);

  if (!bidId) {
    return (
      <Section label={c.papers}>
        <Note icon="lock">{c.papersNeedBid}</Note>
      </Section>
    );
  }
  if (!tried) {
    return (
      <Section label={c.papers}>
        <p className="text-meta text-muted">{c.loading}</p>
      </Section>
    );
  }
  if (!docs) {
    return (
      <Section label={c.papers}>
        <Note icon="lock">{c.papersNoAccess}</Note>
      </Section>
    );
  }

  const label: Record<PanelCompanyDocKey, string> = {
    cr: c.docCr,
    vat: c.docVat,
    national_address: c.docAddress,
    local_content: c.docLocalContent,
    saso: c.docSaso,
  };

  return (
    <Section label={c.papers}>
      <div className="flex flex-wrap gap-1.5">
        {DOC_ORDER.map((k) => {
          const d = docs.docs[k];
          const held = !!d?.present;
          const soon =
            held && d?.expiryDate ? new Date(d.expiryDate).getTime() - Date.now() < 60 * 86_400_000 : false;
          const title = !held
            ? c.docNotProvided
            : d?.renewsAnnually
              ? c.docRenews
              : d?.expiryDate
                ? fmt(c.docValidUntil, { date: new Date(d.expiryDate).toLocaleDateString(locale === "ar" ? "ar" : "en") })
                : c.docNoExpiry;
          return (
            <span
              key={k}
              title={`${label[k]} — ${title}`}
              className={cx(
                "inline-flex h-[28px] items-center gap-1.5 rounded-full border px-3 text-meta font-extrabold",
                !held
                  ? "border-dashed border-border-strong text-muted-light"
                  : soon
                    ? "border-warn/40 bg-warn-soft text-warn-deep"
                    : "border-ok/40 bg-ok-soft text-ok-deep",
              )}
            >
              {label[k]}
              {/* Only where there is a file to open. A presence-only row has nothing behind it. */}
              {held && d?.downloadUrl && (
                <a
                  href={d.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.viewDoc}
                  className="-me-1 grid h-5 w-5 place-items-center rounded-full transition hover:bg-ok/15"
                >
                  <Icon name="visibility" size={14} />
                </a>
              )}
            </span>
          );
        })}
      </div>
    </Section>
  );
}

function Awards({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  if (!p.awards.length) {
    return (
      <Section label={c.awardedToThem}>
        <Note icon="info">{c.noAwards}</Note>
      </Section>
    );
  }
  return (
    <Section label={c.awardedToThem}>
      <div className="overflow-hidden rounded-md border border-border">
        {p.awards.map((a, i) => (
          <div key={i} className="flex items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand-soft text-brand-deep">
              <Icon name="workspace_premium" size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-body font-extrabold text-navy">
                {a.equipment} ×{a.units}
              </b>
              <span className="block text-meta text-muted">
                {[a.projectTitle, a.start && a.end ? `${a.start} → ${a.end}` : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            {a.price !== null && <span className="flex-none font-mono text-meta font-semibold text-navy">{a.price}</span>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Sent({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  if (!p.sends.length) {
    return (
      <Section label={c.whatYouSent}>
        <Note icon="outgoing_mail">{c.nothingSent}</Note>
      </Section>
    );
  }
  return (
    <Section label={c.whatYouSent}>
      <div>
        {p.sends.map((e, i) => (
          <div key={i} className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0">
            <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-surface3 text-navy-mid">
              <Icon name={e.kind === "share" ? "share" : "person_add"} size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-body font-semibold text-navy">
                {e.kind === "share" ? `${c.requestShared}${e.requestCode ?? ""}` : c.invitationSent}
              </b>
              <span className="block text-meta text-muted">
                {e.kind === "share"
                  ? e.opened
                    ? c.theyOpened
                    : c.notOpened
                  : e.joined
                    ? c.theyJoined
                    : c.notJoined}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ContactAndGroups({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  const groups = groupsOf(p);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Section label={c.colContact}>
        <Note icon="contact_mail">
          {canBeEmailed(p) ? (
            p.email
          ) : (
            <b className="font-extrabold">{c.noEmailCannotShare}</b>
          )}
          <br />
          <span className="font-mono" dir="ltr">
            {p.phone || "—"}
          </span>
        </Note>
      </Section>
      <Section label={c.colGroups}>
        <span className={cx("text-meta", groups.length ? "font-semibold text-muted-dark" : "text-muted-light")}>
          {groups.length ? groups.join(" · ") : c.noGroup}
        </span>
      </Section>
    </div>
  );
}

function Extra({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  return (
    <Section label={c.fromYourSheet}>
      <div className="grid gap-1">
        {Object.entries(p.extra ?? {}).map(([k, v]) => (
          <span key={k} className="flex gap-2 border-b border-dashed border-border py-1 text-meta last:border-b-0">
            <span className="w-[150px] flex-none font-semibold text-muted">{k}</span>
            <span className="text-navy">{v}</span>
          </span>
        ))}
      </div>
    </Section>
  );
}
