"use client";

/**
 * File a request that already exists into this site.
 *
 * ── Why this replaced *Unassigned* ───────────────────────────────────────────────────────────────
 *
 * The board carried a rail entry reading *Unassigned · 23* which opened a list and offered a row
 * menu (owner, 2026-08-31: *"what are these 23 unassigned, it doesn't open anything, remove them"*).
 * It was the wrong shape for the job twice over: it made "filed nowhere" look like a place — a
 * twenty-fourth site sitting beside the real ones — and it put the action on the request when the
 * renter's actual sentence is *"put that request on THIS site"*, said while looking at the site.
 *
 * So it moved onto the site itself. And then the two request buttons became ONE (owner, same day):
 * *New request* beside *Add existing request* asked the renter to know, in advance, whether the thing
 * they wanted already existed. It is the same intention either way — put a request on this site — so
 * the header has one door and the choice is made in here, with the existing ones in front of them and
 * *New request* at the top.
 *
 * ── It never offers a request that is already filed ──────────────────────────────────────────────
 *
 * Only requests with no project at all. Moving one from another site is a different act with
 * different consequences — its awards are scrubbed — and it has its own door, on the row itself.
 */

import { useMemo, useState } from "react";
import { useT, useLocale } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import type { ChartGroup } from "@/lib/contract/award";
import { shortSite } from "@/lib/contract/project";

export function FileRequestDialog({
  open,
  onClose,
  /** Requests with no project, shaped as chart groups by the surface. */
  candidates,
  siteLabel,
  siteAddress,
  onFile,
  onEditRequest,
  onNew,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  candidates: (ChartGroup & { address?: string | null })[];
  siteLabel: string;
  /** The site's own address — what each request's address is compared against. */
  siteAddress: string | null;
  onFile: (requestId: string) => void;
  /** Take the renter to this request's own edit, so they can change its location instead. */
  onEditRequest: (requestId: string) => void;
  /** Post a new one instead — the intake, with this site already picked. */
  onNew: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const f = t.projects.file;
  const { locale } = useLocale();
  const [query, setQuery] = useState("");

  /** The request the renter picked whose address is somewhere else — held while they answer. */
  const [asking, setAsking] = useState<(ChartGroup & { address?: string | null }) | null>(null);

  /**
   * Is this request's address somewhere else?
   *
   * The move dialog already leads with the sites at a row's own address and says so when none match
   * (AC-54), and the intake raises a stated place that contradicts the site (AC-29). This dialog was
   * the third door and said nothing — so a Riyadh request could be filed under a Qiddiya site with
   * no word about it, which is how the owner found it.
   *
   * Surfaced, never blocked: **filing changes no value on the request** (AC-21), including its
   * address. A machine really can be needed at a yard the site does not name, and refusing that
   * would be inventing a rule the product does not have.
   */
  /**
   * Can this request's own location still be changed?
   *
   * The same rule the propagation step uses, and for the same reason: a live request with no bids is
   * free to edit, one with bids spends its single post-bid edit, and one that has spent it — or has
   * closed — cannot be touched. Answered here so the panel can offer the edit or say why not,
   * rather than sending the renter to a form that will refuse them.
   */
  const editable = (c: { status?: string | null; renteeEditUsed?: boolean | null }) => {
    const live = c.status === "OPEN" || c.status === "ACTIVE";
    return live && !c.renteeEditUsed;
  };

  const here = shortSite(siteAddress).trim().toLowerCase();
  const elsewhere = (c: { address?: string | null }) => {
    const there = shortSite(c.address).trim().toLowerCase();
    return !!here && !!there && here !== there;
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const names = c.items.map((i) => (locale === "ar" ? i.labelAr || i.label : i.label)).join(" ");
      return `${c.ref} ${names} ${c.address ?? ""}`.toLowerCase().includes(q);
    });
  }, [candidates, query, locale]);

  return (
    <Dialog open={open} onClose={onClose} title={f.title} subtitle={f.sub.replace("{site}", siteLabel)}>
      <div className="flex flex-col gap-3">
        {/* At the TOP, and orange (owner, 2026-08-31).
            The two used to be separate buttons on the header, which asked the renter to know in
            advance whether what they wanted already existed. Here the answer is in front of them: if
            it is in the list, press it; if it is not, press this. */}
        <Button onClick={onNew} disabled={busy}>
          <Icon name="add" size={14} /> {t.projects.board.newRequest}
        </Button>

        {candidates.length > 0 && (
          <span className="flex items-center gap-2 text-meta font-semibold uppercase tracking-[.03em] text-muted">
            <span className="h-px flex-1 bg-border" />
            {f.orExisting}
            <span className="h-px flex-1 bg-border" />
          </span>
        )}

        {candidates.length === 0 ? (
          /* Not an error, and not an empty box: every request this renter has is already on a site,
             which is the state the feature is trying to reach. */
          <p className="text-body text-muted">{f.none}</p>
        ) : (
          <>
            {/* A search box only once the list is long enough to need one. */}
            {candidates.length > 6 && (
              <input
                className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none transition focus:border-brand"
                value={query}
                placeholder={f.search}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}

            <ul className="flex max-h-[50vh] flex-col divide-y divide-border overflow-y-auto rounded-sm border border-border">
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy}
                    /* ~~A mismatch is asked about, not blocked.~~ **Blocked** (owner, 2026-08-31:
                       *"red note will show different location, cant be part of this project"*), and
                       the reversal makes the product coherent rather than merely stricter: the
                       intake now refuses to file a request whose location was moved off the site, so
                       a second door that allowed the same thing would have contradicted it.

                       Pressing a mismatched row opens the panel below — which offers changing the
                       REQUEST's location, the one move that makes filing possible — instead of
                       filing it. The matching case files straight away: a question with one sensible
                       answer is a click the renter did not need. */
                    onClick={() => (elsewhere(c) ? setAsking(c) : onFile(c.id))}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition hover:bg-surface2 disabled:pointer-events-none"
                  >
                    <Icon name="campaign" size={14} className="flex-none text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold text-navy">
                        {c.items.map((i) => `${locale === "ar" ? i.labelAr || i.label : i.label} ×${i.quantity}`).join(" · ")}
                      </span>
                      <span className="block truncate text-meta text-muted">
                        {c.ref}
                        {c.address ? ` · ${c.address}` : ""}
                      </span>
                      {/* RED, and on the row rather than in a confirm: the renter is choosing
                          between requests, and the thing they need to know has to be visible while
                          they choose rather than after.

                          ~~Amber, saying filing it here changes nothing about it.~~ Both halves were
                          wrong once filing became impossible: amber is this app's «check this», and
                          the sentence answered a question nobody had while leaving the actual
                          consequence unsaid. */}
                      {elsewhere(c) && (
                        <span className="mt-0.5 flex items-center gap-1 text-meta font-semibold text-danger">
                          <Icon name="error_outline" size={12} className="flex-none" />
                          {f.elsewhere.replace("{site}", shortSite(siteAddress))}
                        </span>
                      )}
                    </span>
                    <Icon name="add" size={14} className="flex-none text-brand" />
                  </button>
                </li>
              ))}
            </ul>

            {shown.length === 0 && <p className="text-meta text-muted">{f.noMatch}</p>}

            {/* Filing changes nothing about the request — said here because it is the question a
                renter has at exactly this moment, and the answer is what makes it safe to press. */}
            <p className="flex items-start gap-2 rounded-sm border border-border bg-surface2/50 px-3 py-2 text-meta text-navy-mid">
              <Icon name="info" size={14} className="mt-px flex-none text-muted" />
              {f.note}
            </p>
          </>
        )}

        {/* Asked here rather than in a second dialog: the renter is mid-choice, and a stacked
            modal would hide the list they were choosing from. */}
        {asking && (
          <div className="flex flex-col gap-2 rounded-sm border border-danger/40 bg-danger-soft p-3">
            <span className="flex items-start gap-2 text-body font-semibold text-danger">
              <Icon name="error_outline" size={15} className="mt-px flex-none" />
              {f.askTitle.replace("{there}", shortSite(asking.address)).replace("{here}", shortSite(siteAddress))}
            </span>
            <p className="text-meta text-navy-mid">{f.askBody}</p>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsking(null)} disabled={busy}>
                {t.common.cancel}
              </Button>

              {/* Offered only while the request can actually take an edit. A request whose one
                  post-bid edit is spent, or that is closed, cannot — and a button that leads to a
                  refusal is worse than none, so it says the reason instead. */}
              {editable(asking) ? (
                <Button variant="secondary" onClick={() => onEditRequest(asking.id)} disabled={busy}>
                  {f.askEdit}
                </Button>
              ) : (
                <span className="text-meta font-semibold text-muted">{f.askNotEditable}</span>
              )}

              {/* ~~«File it here anyway».~~ Gone (owner, 2026-08-31). There is no «anyway»: a site
                  is a place, and a request for Riyadh drawn on the Qiddiya timeline says a machine is
                  going somewhere it is not. The way forward is the button beside this one — move the
                  REQUEST to this place — and if that is not available, the reason is printed there
                  rather than a door that leads nowhere. */}
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-border pt-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.common.close}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
