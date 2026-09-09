"use client";

/**
 * After a submit that landed in no project — the site is MADE, and the request is filed under it.
 *
 * ── It no longer asks ────────────────────────────────────────────────────────────────────────────
 *
 * ~~Two offers: *file it under this site* or *make one*.~~ Auto-filed now (owner, 2026-08-31: *"I
 * want it to be auto created, and the user will have a modal on submit to inform him that this
 * request is now part of your project, with an option to view it"*).
 *
 * The offer was a question with one sensible answer. A renter who has just posted a request for a
 * place either has a site there or wants one, and the cost of the question was paid by everyone:
 * a dialog between them and the two controls they actually came for.
 *
 * ── It no longer DRAWS, either (owner, 2026-09-08) ──────────────────────────────────────────────
 *
 * *"But we have now 2 competing modals, one for the post request success and one for the project...
 * I don't know how to show the 2 modals without distracting or overwhelming him."*
 *
 * ~~Its own dialog, queued behind the post tick.~~ Two dialogs for one press, and the second one
 * arrived after the renter believed he had finished. They are two halves of one answer to *what
 * just happened to my request?*, so they are one dialog now: this component still does the write and
 * hands the site up through `onFiled`, and `ShareOnPost` draws it inside the tick.
 *
 * 🔴 **It must stay mounted OUTSIDE the tick.** The filing happens on mount and the tick opens a
 * moment later, when the share has been handed off — so moving the write inside the dialog would
 * mean a renter who closes the tab before reading it ends up with a request filed under nothing,
 * which is the silent bug this component exists to fix. That is why it renders null rather than
 * simply moving.
 *
 * ⚠️ **The pen went with the dialog.** Editing the site's name, dates and terms is the ordinary
 * project form, and it lives on the project's own page, one press away through *View the project*.
 * A form opened over the top of the tick would be a dialog over a dialog.
 *
 * ── The one rule that survives intact ───────────────────────────────────────────────────────────
 *
 * **A place gets one project.** If a site already exists at this address the request is filed under
 * IT; a second project for one place is how a site's picture splits in two, half the machines on
 * each chart and the renter believing both, and there is no clean way back once requests are filed
 * under each. So the address decides which of the two writes happens, and neither is offered as a
 * choice because there is no choice to make.
 *
 * ── If the write fails, it says nothing ─────────────────────────────────────────────────────────
 *
 * The request is already posted and safe. Reporting that a convenience did not happen, on the
 * screen that says *your request is live*, trades the good news for a worry the renter can do
 * nothing about. It is retried the ordinary way: from the board, whenever they next open it.
 */

import { useEffect, useRef } from "react";
import { listProjects, createProject, assignToProject } from "@/lib/api/client";
import { leftTheSite, type ProjectSummary } from "@/lib/contract/project";
import type { ProjectDetails, Preferences } from "@/lib/contract/draft";

export function ProjectFiled({
  requestId,
  project,
  preferences,
  onFiled,
}: {
  /** The request just posted. Without an id there is nothing to file, so nothing happens at all. */
  requestId: string | null;
  project: ProjectDetails;
  preferences: Preferences;
  /**
   * The site the request ended up under, once it is filed.
   *
   * ⚠️ Never called when the write fails. Silence is the report: see the note at the top.
   */
  onFiled?: (site: ProjectSummary) => void;
}) {
  const address = project.location.label ?? "";
  /* The callback is read through a ref so a parent that passes an inline arrow cannot re-run the
     effect and file the request twice. */
  const told = useRef(onFiled);
  told.current = onFiled;

  useEffect(() => {
    if (!address || !requestId) return;
    let live = true;

    /* One place, one project. An existing site at this address takes the request; otherwise a site
       is made from it. Both end at the same `assignToProject`, so the request is filed either way
       and the tick says the same thing about either outcome. */
    (async () => {
      try {
        const all = await listProjects();
        /* ── What counts as «this place» (owner, 2026-09-08) ──────────────────────────────
           *"For project auto creation, why do some requests create one and some not, while in
           different locations?"*

           ~~`shortSite(label)` string equality.~~ That reads only the text BEFORE THE FIRST COMMA,
           and a map pin very often reverse-geocodes to nothing more than «Riyadh, Saudi Arabia» — so
           two sites a hundred kilometres apart collapsed to one «place», the second request was
           filed under the first project, and no new project appeared. Different locations, no
           project: exactly the report.

           `leftTheSite` is this app's own answer to the same question and was already written for
           the draft's «you have moved off the site» warning: COORDINATES first, with a tolerance of
           about 110 m, and the full normalised label only when one side has none. One notion of
           «same place» across the feature, instead of a coarse one here and a careful one there. */
        const here = { label: address, lat: project.location.lat ?? null, lng: project.location.lng ?? null };
        const found =
          all.find(
            (p) => !leftTheSite({ label: p.location.label, lat: p.location.lat, lng: p.location.lng }, here),
          ) ?? null;
        const made =
          found ??
          (await createProject({
            title: null,
            location: here,
            defaults: { timing: siteTiming(project), paymentTerms: preferences.payment.terms ?? null },
          }));
        await assignToProject(requestId, made.id);
        if (live) told.current?.(made);
      } catch {
        // Silent on purpose — see the note at the top. The request is posted; this was the extra.
      }
    })();

    return () => {
      live = false;
    };
    /* The coordinates are in the deps because the match reads them; they come off the same submitted
       draft as `address` and do not change under a posted request. */
  }, [address, requestId, project, preferences.payment.terms]);

  return null;
}

/** The four timing values a PROJECT holds — never the draft's fifth (`hoursPerDay`), which is a
 *  per-hire question. Spreading `project.timing` sent it to the API in silence: the target type omits
 *  the key, but a spread is not an object literal, so nothing checked it. */
function siteTiming(project: ProjectDetails) {
  const { startDate, endDate, rentalBasis, extendable } = project.timing;
  return { startDate, endDate, rentalBasis, extendable };
}
