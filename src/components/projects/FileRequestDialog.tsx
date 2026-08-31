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
 * So it moved into the site's own header, beside the two ways of making something new. Three ways to
 * put something on a site: make a work order, post a request, or bring one that already exists.
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

export function FileRequestDialog({
  open,
  onClose,
  /** Requests with no project, shaped as chart groups by the surface. */
  candidates,
  siteLabel,
  onFile,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  candidates: (ChartGroup & { address?: string | null })[];
  siteLabel: string;
  onFile: (requestId: string) => void;
  busy?: boolean;
}) {
  const t = useT();
  const f = t.projects.file;
  const { locale } = useLocale();
  const [query, setQuery] = useState("");

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
                    onClick={() => onFile(c.id)}
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

        <div className="flex justify-end border-t border-border pt-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.common.close}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
