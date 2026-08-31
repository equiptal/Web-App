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
 * ── The row STAYS once a site is picked, and the chosen pill opens what is in it ──────────────────
 *
 * *"I want the dropdown of work order and request of a project to open here in this rounded pill, not
 * in the text area"* (owner, 2026-08-31).
 *
 * ~~The row removed itself the moment a site was chosen, and the site's values — including a navy
 * project pill carrying the template dropdown — appeared inside the intake card instead.~~ The
 * dropdown is a question about the PROJECT («what have I already hired at this site?»), and the
 * project is chosen here. Asking it from inside the box the renter is typing their request into put
 * one control in two conceptual places.
 *
 * So the chosen site stays in this row as a marked pill: press it and its work orders and requests
 * drop down. The card keeps the request's own VALUES (dates, basis, payment) and nothing about the
 * site's identity.
 *
 * The other sites stay listed beside it, quiet, because switching site is one press and this row is
 * the picker.
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
import { listProjects, listTemplates, fetchTemplateTerms } from "@/lib/api/client";
import type { TemplateOption } from "@/lib/contract/project-apply";
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
  /** What is already filed at the chosen site — its work orders and requests, per machine. */
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [picking, setPicking] = useState(false);
  /* Which MACHINE was picked. The store remembers the work order (it needs the group id at submit)
     and not which row inside it, so the select needs its own memory or it would spring back to
     "pick one" the moment the terms landed. */
  const [picked, setPicked] = useState<string | null>(null);

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

  /* What is filed at the CHOSEN site. A site with nothing in it yet has nothing to copy, and that is
     the normal first case — so a failure and an empty list land in the same place: no dropdown at
     all, rather than an error about a convenience the renter never asked for. */
  const chosenId = state.project?.id ?? null;
  useEffect(() => {
    if (!chosenId) {
      setTemplates([]);
      setPicked(null);
      return;
    }
    let live = true;
    listTemplates(chosenId)
      .then((rows) => live && setTemplates(rows))
      .catch(() => live && setTemplates([]));
    return () => {
      live = false;
    };
  }, [chosenId]);

  // Already picked — the pills have taken over the strip.
  if (!user || !projects?.length) return null;

  const chosen = state.project;
  /* The chosen one leads and is not repeated among the rest. Six of the others, which is enough to
     cover a renter's live jobs without becoming a list. */
  const ordered = endedLast(projects, today()).filter((p) => p.id !== chosen?.id);
  const shown = ordered.slice(0, VISIBLE);
  const rest = ordered.length - shown.length;

  /**
   * Copy how this renter HIRES at this site — never what they are hiring.
   *
   * The terms become pills on the request; the MACHINE goes in as TEXT (owner, 2026-08-31), because
   * equipment is not a closed set of answers: the renter may want the same terms on a bigger
   * excavator, and a chip they cannot retype would make them delete it to say so. Appended, never
   * replacing what is already typed.
   */
  async function applyTemplate(itemId: string) {
    const option = templates.find((x) => x.itemId === itemId);
    if (!option || !chosen) return;
    setPicking(true);
    setPicked(itemId);
    try {
      const terms = await fetchTemplateTerms(chosen.id, option);
      actions.useTemplate(terms, option.kind === "work_order" ? option.id : null, option.when);

      const line = `${option.quantity > 1 ? `${option.quantity} × ` : ""}${option.machine}`.trim();
      if (line) {
        const before = state.text.trimEnd();
        actions.setText(before ? `${before}\n${line}` : line);
      }
    } catch {
      // Nothing is applied and nothing is said. A template is a shortcut; failing to take one leaves
      // the renter exactly where they were, which is a working request form.
    } finally {
      setPicking(false);
    }
  }

  return (
    /* Under the intake card, carrying the page's own margin rather than the card's inner padding. */
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{t.projects.chips.label}</span>

      {/* ── The chosen site, and the dropdown of what is filed under it ──────────────────────────
          Marked with the brand, so the row says which of these is answering the request. The native
          `select` covers the whole pill at zero opacity: the press target is the pill, the menu opens
          where the platform puts it, and the × stays above the layer so clearing the site cannot open
          the list by accident. */}
      {chosen && (
        <span className="relative flex items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-3 py-1 text-label font-semibold text-navy">
          <Icon name="place" size={13} className="flex-none text-brand" />
          {chosen.title}
          {templates.length > 0 && (
            <>
              {/* Applied is stated, not implied: a renter who has already copied a machine's terms
                  should not have to open the list to find out. */}
              {state.templateTerms && <span className="font-normal text-muted">· {t.projects.pills.templateApplied}</span>}
              <Icon name="expand_more" size={14} className="-me-0.5 flex-none text-brand" />
              {/* Keyed by MACHINE id, not by the order it sits in — two machines on one order are two
                  entries, and picking either copies its own answers. The machine's name leads,
                  because that is what the renter is looking for; the kind and reference follow it to
                  tell two of the same machine apart. */}
              <select
                aria-label={t.projects.pills.startFrom}
                disabled={picking}
                value={picked ?? ""}
                onChange={(e) => void applyTemplate(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">{t.projects.pills.startFrom}</option>
                {templates.map((tpl) => (
                  <option key={tpl.itemId} value={tpl.itemId}>
                    {`${tpl.machine || tpl.ref} · ${
                      tpl.kind === "work_order" ? t.projects.pills.kindWorkOrder : t.projects.pills.kindRequest
                    } ${tpl.ref}`}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => actions.clearProject()}
            aria-label={t.common.close}
            className="relative z-10 -me-0.5 grid h-4 w-4 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-navy"
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      )}

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
