"use client";

import { useEffect, useState } from "react";
import { VerifiedMark } from "@/components/VerifiedMark";
import { VendorMark } from "@/components/VendorMark";
import { MoedatechBadge } from "@/components/MoedatechBadge";
import { Dialog } from "@/components/Dialog";
import { useRouter } from "next/navigation";
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
      /* ⚠️ **The badges belong ON the header** (owner, 2026-09-06). As a row of their own under
         it they read as a section, which invited the eye to stop at them; beside the firm's name
         they are what they are — three facts about that firm. */
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>{p?.name ?? "…"}</span>
          {p && <Badges p={p} />}
        </span>
      }
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
          {/* ── The order (owner, 2026-09-06) ────────────────────────────────────────────────
              Contact first, because it is the thing a renter opens this dialog to look up. Then the
              four counts, which are the whole history in one row. Then the documents, then what he
              has sent.

              ⚠️ ~~A grade row, a bids block and an awards list.~~ All three said again what the
              four counts already say: «New, no bid yet» over «0 bids on Moedatech», and a list
              whose length was printed above it. Gone. */}
          <ContactAndGroups p={p} />
          <Stats p={p} onOpenBids={() => onOpenBids(p.id)} />
          <Papers p={p} />
          <Sent p={p} />
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
      {/* One badge for «on Moedatech», shared with the table and the share panel (owner,
          2026-09-03). Off-platform keeps its own quiet chip: it is the ABSENCE of that fact, and a
          shared component for «not the thing» would be a component with two opposite meanings. */}
      {p.kind === "platform" ? (
        <MoedatechBadge size={13} />
      ) : (
        <span className="inline-flex h-[23px] items-center gap-1.5 rounded-full border border-border-strong bg-surface2 px-2.5 text-label font-extrabold text-muted-dark">
          {c.offPlatform}
        </span>
      )}
      {p.store && (
        <span className="inline-flex h-[23px] items-center gap-1.5 rounded-full border border-border-strong bg-surface2 px-2.5 text-label font-extrabold text-muted-dark">
          <Icon name="storefront" size={13} />
          {c.hasStore}
        </span>
      )}
      {p.verified && (
        <span className="inline-flex h-[23px] items-center gap-1.5 rounded-full border border-info/30 bg-info-soft px-2.5 text-label font-extrabold text-info-deep">
          <VerifiedMark size={13} />
          {c.verifiedByMoedatech}
        </span>
      )}
      {p.vendorRegistered && (
        <span className="inline-flex h-[23px] items-center gap-1.5 rounded-full border border-ok bg-ok-soft px-2.5 text-label font-extrabold text-ok-deep">
          {/* ⚠️ This wore `VerifiedMark`, which is MOEDATECH's rosette and says the opposite of what
              this chip means: verified is ours to grant, vendor is the renter's own private label.
              Beside a genuine «verified by Moedatech» chip on the same line, the two read as one
              claim said twice. */}
          <VendorMark size={13} />
          {c.registeredVendor}
        </span>
      )}
    </div>
  );
}

/*
 * — `Grade`, `BidsSummary`, `InsideTheApp` and `Awards` lived here —
 *
 * Four components saying one thing between them. The grade printed «New · no bid yet» directly above
 * a card reading «0 bids on Moedatech»; the bids block printed a total the four counts already
 * carried; the awards list printed rows whose number was on screen a hand's width above it.
 *
 * `Stats` below is what is left: the four counts, each a way IN to the thing it counts.
 */

/**
 * The whole relationship in four numbers, each one a door.
 *
 * ⚠️ **A count with nowhere to go is trivia.** «9 deal rooms» tells a renter something happened
 * and leaves him to find it; the point of the row is that pressing a number takes him to what it
 * counted. Where we cannot open the thing, the card says where it lives rather than pretending.
 */
function Stats({ p, onOpenBids }: { p: SupplierProfile; onOpenBids: () => void }) {
  const c = useT().suppliers;
  const router = useRouter();
  const r = p.rollup;
  const bids = bidCount(p);
  /**
   * ⚠️ **The inbox, filtered to him** (owner, 2026-09-06). ~~«Open them from your inbox», a
   * sentence rather than a door.~~ It needed no backend after all: this payload has a count and no
   * room ids, but the INBOX already carries `supplierId` on every bid, so the rooms are reachable
   * from the other end. I had called this blocked; it was not.
   */
  const supplierKey = p.supplierId != null ? String(p.supplierId) : null;

  const cards: { n: number; label: string; go?: () => void; note?: string }[] = [
    { n: r?.bidsApp ?? 0, label: c.kOnApp, go: bids ? onOpenBids : undefined },
    { n: r?.bidsLink ?? 0, label: c.kViaLink, go: bids ? onOpenBids : undefined },
    /**
     * ⚠️ It cannot open ONE room — this payload has no room ids — and it does not need to. It
     * opens the inbox showing only this supplier, which is the list those rooms live in.
     */
    {
      n: r?.rooms ?? 0,
      label: c.kRooms,
      go: (r?.rooms ?? 0) > 0 && supplierKey ? () => router.push(`/inbox?supplier=${encodeURIComponent(supplierKey)}`) : undefined,
    },
    { n: r?.awards ?? 0, label: c.kAwards },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((card) => {
        const inner = (
          <>
            <b className="block font-mono text-title tabular-nums text-navy">{card.n}</b>
            <span className="mt-0.5 flex items-center gap-1 text-label font-extrabold uppercase tracking-wide text-muted">
              <span className="min-w-0 truncate">{card.label}</span>
              {card.go && <Icon name="chevron_right" size={13} className="flex-none" />}
            </span>
            {card.note && <span className="mt-1 block text-label text-muted-light">{card.note}</span>}
          </>
        );
        return card.go ? (
          <button
            key={card.label}
            type="button"
            onClick={card.go}
            className="rounded-md border border-border bg-surface2 px-3 py-2.5 text-start transition hover:border-border-strong hover:bg-surface3"
          >
            {inner}
          </button>
        ) : (
          <div key={card.label} className="rounded-md border border-border bg-surface2 px-3 py-2.5">
            {inner}
          </div>
        );
      })}
    </div>
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
            ? c.docMissing
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
                /**
                 * ⚠️ **🔴 when it is missing** (owner, 2026-09-06). ~~Dashed and grey.~~ A grey
                 * pill reads as "not applicable"; a renter deciding whether to trust a firm needs
                 * "they have not given us this", which is a different thing and worth a colour.
                 */
                !held
                  ? "border-danger/40 bg-danger-soft text-danger-deep"
                  : soon
                    ? "border-warn/40 bg-warn-soft text-warn-deep"
                    : "border-ok/40 bg-ok-soft text-ok-deep",
              )}
            >
              {label[k]}
              {/**
               * ⚠️ **The eye appears only where there is a file to open.** A held document with no
               * `downloadUrl` is a presence-only row — the supplier said he has it and never
               * uploaded one — and an eye there would open nothing, which is worse than no eye.
               *
               * 🔴 It opens whatever the backend gave us, whether that came from the app or from
               * the public bid form: `fetchBidCompanyDocuments` returns one shape for both, so this
               * does not care which route the paper arrived by.
               */}
              {held && d?.downloadUrl && (
                <a
                  href={d.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.docOpen}
                  aria-label={`${label[k]} — ${c.docOpen}`}
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

/*
 * — `Awards` lived here —
 *
 * It listed every award as a row, directly under a card that printed how many there were. Removed
 * with the grade and the bids block (owner, 2026-09-06): the four counts are the history, and a
 * list whose length is already on screen is the same fact twice.
 */

/**
 * The requests he has shared with this supplier.
 *
 * 🔴 **«Opened» is gone, and it was never knowable.** Every supplier on one request is handed the
 * SAME link, so the public bid page sees a visit and never whose. It printed «not opened yet» on
 * every row forever — including rows a supplier had read an hour earlier — because the backend has
 * never sent the field and `undefined` is falsy (owner, 2026-09-06: *"i think we cant track opened
 * or not so just remove this"*, and he is right).
 *
 * ⚠️ **What it says now is the honest half.** ~~«Requests you shared with them in Outlook»~~ — the
 * payload carries no CHANNEL. The backend records one (`email` · `whatsapp` · `sms` · `copy`) and
 * does not return it here, so naming Outlook would be a guess printed as a fact.
 *
 * ⚠️ And the row shows the reference, not the equipment and the site, for the same reason:
 * `SupplierSend` carries `requestCode` and a date. Naming the machine needs the backend to send it,
 * or a second read of the renter's own requests to match the code against.
 */
function Sent({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  const { locale } = useLocale();
  const shares = p.sends.filter((e) => e.kind === "share");

  if (!shares.length) {
    return (
      <Section label={c.sharedWith}>
        <Note icon="outgoing_mail">{c.sharedNothing}</Note>
      </Section>
    );
  }

  return (
    <Section label={c.sharedWith}>
      <div className="overflow-hidden rounded-md border border-border">
        {shares.map((e, i) => (
          <div key={i} className="flex items-center gap-2.5 border-b border-border px-3 py-2 last:border-b-0">
            <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-surface3 text-navy-mid">
              <Icon name="share" size={13} />
            </span>
            <b className="min-w-0 flex-1 truncate text-body font-semibold text-navy">
              {e.requestCode ?? c.sharedWith}
            </b>
            <span className="flex-none text-meta text-muted">
              {new Date(e.at).toLocaleDateString(locale === "ar" ? "ar" : "en", { day: "numeric", month: "short" })}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * Who to call, and which lists he is on.
 *
 * ⚠️ **One bordered card with labelled rows**, not two loose columns (owner, 2026-09-06). The
 * groups half used to be bare text beside a tinted box, so the two sides of one card were drawn in
 * two different styles and the eye read them as unrelated.
 *
 * It sits directly under the header because it is what a renter opens this dialog to look up.
 */
function ContactAndGroups({ p }: { p: SupplierProfile }) {
  const c = useT().suppliers;
  const groups = groupsOf(p);

  const rows: { icon: string; label: string; value: React.ReactNode }[] = [
    {
      icon: "mail",
      label: c.colContact,
      value: canBeEmailed(p) ? (
        <span dir="ltr" className="truncate">{p.email}</span>
      ) : (
        /* ⚠️ Not a blank: no address is why a request cannot reach him, and it is the one gap a
           renter can close himself. */
        <span className="font-semibold text-warn-deep">{c.noEmailCannotShare}</span>
      ),
    },
    {
      icon: "call",
      label: c.colPhone,
      value: p.phone ? (
        <span dir="ltr" className="font-mono">{p.phone}</span>
      ) : (
        <span className="text-muted-light">{c.noPhone}</span>
      ),
    },
    {
      icon: "sell",
      label: c.colGroups,
      value: groups.length ? (
        <span className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <span key={g} className="inline-flex h-[20px] items-center rounded-full bg-surface3 px-2 text-label text-navy-mid">
              {g}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-muted-light">{c.noGroup}</span>
      ),
    },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-2.5 border-b border-border px-3 py-2 last:border-b-0">
          <Icon name={row.icon} size={14} className="mt-0.5 flex-none text-muted" />
          <span className="w-[64px] flex-none pt-px text-label font-semibold uppercase tracking-wide text-muted">
            {row.label}
          </span>
          <span className="min-w-0 flex-1 text-meta text-navy">{row.value}</span>
        </div>
      ))}
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
