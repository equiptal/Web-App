"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchAllMyRequests } from "@/lib/api/client";
import type { RequestListItem } from "@/lib/contract/requests";
import { ShareRequestPanel } from "./ShareRequestPanel";

/**
 * *Share this request*, as a modal — the same panel the review screen carries inline.
 *
 * ── Why the same panel and not a second design (owner, 2026-09-02) ──────────────────────────────
 *
 * *"on any share option for a request it will open for them modal in the same style."* There were
 * three share surfaces, each with its own picker, its own channel row and its own message, which is
 * how one request came to read three different ways. This is a shell — a heading, a way out, and
 * the panel. Nothing about the share lives here, so nothing here can drift from the review.
 *
 * ── Picking the request ─────────────────────────────────────────────────────────────────────────
 *
 * Opened FROM a request (its header, its row), the request is known and the picker never appears.
 * Opened from the supplier list, the renter is thinking about people and has not named a job yet, so
 * the one question this shell adds is *which request*. Only requests that HAVE a link are listed:
 * offering one that cannot be shared and failing on the press is a worse answer than not offering it.
 */
export function ShareRequestModal({
  open,
  onClose,
  requestUuid = null,
  requestCode = null,
  preselect,
  renterName = null,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  /** The request being shared. Null asks the renter which one. */
  requestUuid?: string | null;
  requestCode?: string | null;
  /** Supplier ids to start ticked — the per-row share action picks one. */
  preselect?: string[];
  renterName?: string | null;
  onShared?: (count: number) => void;
}) {
  const t = useT();
  const c = t.intake.postShare;

  const [requests, setRequests] = useState<RequestListItem[] | null>(null);
  const [chosen, setChosen] = useState<string>("");

  useEffect(() => {
    if (!open || requestUuid || requests) return;
    fetchAllMyRequests()
      .then(({ requests: r }) => setRequests(r.filter((x) => !!(x.requestGroupId || x.id))))
      .catch(() => setRequests([]));
  }, [open, requestUuid, requests]);

  useEffect(() => {
    if (!chosen && requests?.length) setChosen(requests[0].requestGroupId || requests[0].id);
  }, [requests, chosen]);

  const picked = requestUuid ?? (chosen || null);
  const code = requestUuid
    ? requestCode
    : (requests?.find((r) => (r.requestGroupId || r.id) === chosen)?.displayId ?? null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Icon name="share" size={18} />}
      title={c.title}
      subtitle={c.modalSubtitle}
    >
      <div className="grid gap-5">
        {!requestUuid && (
          <label className="grid gap-1">
            <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.whichRequest}</span>
            {requests === null ? (
              <span className="text-meta text-muted">{c.loading}</span>
            ) : requests.length === 0 ? (
              <span className="text-meta text-muted">{c.noRequests}</span>
            ) : (
              <select
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
                className="h-[34px] rounded-md border border-border-strong bg-surface px-2.5 text-meta font-semibold text-navy"
              >
                {requests.map((r) => (
                  <option key={r.id} value={r.requestGroupId || r.id}>
                    {[r.displayId, r.city].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        {/* Remounted per request: the panel holds the picks, the note and the sent state, and none of
            those belong to the request the renter has just switched away from. */}
        <ShareRequestPanel
          key={picked ?? "none"}
          mode="share"
          requestUuid={picked}
          requestCode={code}
          preselect={preselect}
          renterName={renterName}
          onShared={onShared}
        />
      </div>
    </Dialog>
  );
}
