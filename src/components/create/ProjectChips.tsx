"use client";

/**
 * The chip row — which site is this request for? (web-app/007, W-T7 · spec §11.1)
 *
 * Sits inside the intake card, under the textarea, above the Continue row. Not inside the textarea:
 * that is a native `<textarea>` and holds text only, and keeping it purely what the renter typed is
 * what keeps the agent's input small and its parse fast.
 *
 * ── It renders NOTHING when there is nothing to show ─────────────────────────────────────────────
 *
 * No projects, or a guest: no row, no caption, no empty state, no placeholder. A renter who has
 * never made a project sees today's intake screen unchanged, so nothing about this feature reaches
 * someone who is not using it (PROJ-AC-28). An empty-state teaching them about projects here would
 * be a feature announcement standing between them and the thing they came to do.
 *
 * ── Ended sites are sorted last, tagged, and never hidden ────────────────────────────────────────
 *
 * A date passing is not proof a site is finished. Hide it and a renter who extended the hire
 * verbally loses their chip with no explanation and no way to ask for it back. Recency does the
 * hiding instead: a site you stop using stops being picked, and drops off the six.
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useRfq } from "@/lib/store/rfq-store";
import { listProjects } from "@/lib/api/client";
import { projectTitle, projectEnded, endedLast, type ProjectSummary } from "@/lib/contract/project";
import { Icon } from "@/components/ui";

/** Six, then a way to reach the rest. Enough to cover a renter's live jobs without becoming a list. */
const VISIBLE = 6;

const today = () => new Date().toISOString().slice(0, 10);

export function ProjectChips({ onBrowseAll }: { onBrowseAll?: () => void }) {
  const t = useT();
  const { user } = useSession();
  const { state, actions } = useRfq();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  /* `actions` is rebuilt on every render of the store's provider. Listing it as a dependency would
     re-run the fetch on each of those renders; leaving it out silently would age. Held in a ref, the
     effect always calls the current one and still runs only when the user changes. */
  const act = useRef(actions);
  act.current = actions;

  useEffect(() => {
    // Guests have no sites, and asking on their behalf would 401 on every intake load.
    if (!user) return;
    let live = true;
    listProjects()
      .then((rows) => {
        if (!live) return;
        setProjects(rows);

        /* Arrived from a site's own *New request* button, which passes `?project=<id>`.
         *
         * Read off `window.location` rather than `useSearchParams`, which would oblige every page
         * rendering the intake to carry a Suspense boundary for a convenience. This runs in an
         * effect, so there is no server render to disagree with.
         *
         * An id that matches nothing is ignored in silence: a stale or hand-edited link should drop
         * the renter into an ordinary intake, not an error about a site they never asked for. */
        const wanted = new URLSearchParams(window.location.search).get("project");
        const match = wanted ? rows.find((r) => r.id === wanted) : undefined;
        if (match) act.current.selectProject(match);
      })
      // A failed fetch renders the row away rather than an error. The renter came here to write a
      // request; a site is an optional convenience and must never stand in the way of that.
      .catch(() => live && setProjects([]))
      .finally(() => {});
    return () => {
      live = false;
    };
  }, [user]);

  // Already picked — the pills have taken over the strip.
  if (state.project) return null;
  if (!user || !projects?.length) return null;

  const ordered = endedLast(projects, today());
  const shown = ordered.slice(0, VISIBLE);
  const rest = ordered.length - shown.length;

  return (
    /* Same geometry as the pills that replace it, so picking a site swaps the contents of the strip
       and moves nothing else. It sits UNDER the intake card now (owner, 2026-08-31), so it carries
       the page's own margin rather than the card's inner padding. */
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{t.projects.chips.label}</span>

      {shown.map((p) => {
        const ended = projectEnded(p, today());
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => actions.selectProject(p)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-label font-semibold text-navy transition hover:border-brand hover:text-brand"
          >
            <Icon name="place" size={13} className="flex-none text-muted" />
            {projectTitle(p)}
            {/* Tagged, not hidden — see the note at the top. */}
            {ended && <span className="text-meta font-semibold text-muted">{t.projects.chips.ended}</span>}
          </button>
        );
      })}

      {rest > 0 && (
        <button
          type="button"
          onClick={onBrowseAll}
          className="rounded-full border border-dashed border-border px-3 py-1 text-label font-semibold text-muted transition hover:border-brand hover:text-brand"
        >
          {t.projects.chips.all} ({rest})
        </button>
      )}
    </div>
  );
}
