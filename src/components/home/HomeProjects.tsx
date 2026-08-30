"use client";

/**
 * The renter's sites, on the dashboard (web-app/007).
 *
 * A project is where a renter's job actually lives — the machines standing on it, what each is
 * costing, who supplied them. That belongs above the request list, because a request is one
 * shopping trip and a site is the thing the trips are for.
 *
 * ── It draws nothing when there is nothing ───────────────────────────────────────────────────────
 *
 * No sites, or a guest: no strip, no empty card inviting them to make one. The dashboard already
 * asks a new renter to do something — post a request — and a second ask beside it competes with the
 * first. A renter meets projects when they have one, or from the nav when they go looking.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { listProjects } from "@/lib/api/client";
import { projectTitle, projectEnded, endedLast, type ProjectSummary } from "@/lib/contract/project";

const today = () => new Date().toISOString().slice(0, 10);

/** Four. Enough to see the live jobs; past that the board is the right surface. */
const VISIBLE = 4;

export function HomeProjects() {
  const t = useT();
  const { user } = useSession();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    listProjects()
      .then((rows) => live && setProjects(rows))
      // A failed fetch draws nothing rather than an error. The dashboard is a place a renter
      // glances at; a failure box on it is worse than the absence of a strip they were not
      // looking for.
      .catch(() => live && setProjects([]))
      .finally(() => {});
    return () => {
      live = false;
    };
  }, [user]);

  if (!user || !projects?.length) return null;

  const ordered = endedLast(projects, today());
  const shown = ordered.slice(0, VISIBLE);

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-subhead font-extrabold text-navy">{t.projects.surface.heading}</h2>
        <Link href="/projects" className="text-meta font-semibold text-brand underline underline-offset-2">
          {t.projects.home.viewAll.replace("{n}", String(projects.length))}
        </Link>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((p) => {
          const ended = projectEnded(p, today());
          return (
            <Link
              key={p.id}
              href="/projects"
              className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-3.5 transition hover:border-brand"
            >
              <span className="flex items-center gap-1.5">
                <Icon name="place" size={13} className="flex-none text-brand" />
                <span className="min-w-0 flex-1 truncate text-body font-semibold text-navy">{projectTitle(p)}</span>
                {/* Tagged, never hidden — a date passing is not proof a site is finished. */}
                {ended && <span className="flex-none text-meta text-muted">{t.projects.chips.ended}</span>}
              </span>

              <span className="truncate text-meta text-muted">{p.location.label}</span>

              {/* Requests and work orders are counted separately, never summed: a work order also
                  posted as a request is deliberately two rows. */}
              <span className="mt-1 text-meta text-muted tabular-nums">
                {t.projects.board.railCounts.replace("{r}", String(p.requestCount)).replace("{w}", String(p.workOrderCount))}
              </span>

              {p.unitsAwarded > 0 && (
                <span className="text-meta font-semibold text-navy-mid tabular-nums">
                  {t.projects.home.onSite.replace("{n}", String(p.unitsAwarded))}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
