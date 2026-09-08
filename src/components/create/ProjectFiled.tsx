"use client";

/**
 * After a projectless submit — the site is MADE, and the renter is told (web-app/007, W-T24).
 *
 * ── It no longer asks ────────────────────────────────────────────────────────────────────────────
 *
 * ~~Two offers: *file it under this site* or *make one*.~~ Auto-filed now (owner, 2026-08-31: *"I
 * want it to be auto created, and the user will have a modal on submit to inform him that this
 * request is now part of your project, with an option to view it"*).
 *
 * The offer was a question with one sensible answer. A renter who has just posted a request for a
 * place either has a site there or wants one, and the cost of the question was paid by everyone:
 * a dialog between them and the two controls they actually came for. Doing it and SAYING SO is
 * shorter, and it is reversible — the project is theirs to rename, edit or delete.
 *
 * ── The one rule that survives intact ───────────────────────────────────────────────────────────
 *
 * **A place gets one project.** If a site already exists at this address the request is filed under
 * IT; a second project for one place is how a site's picture splits in two, half the machines on
 * each chart and the renter believing both, and there is no clean way back once requests are filed
 * under each. So the address decides which of the two writes happens, and neither is offered as a
 * choice because there is no choice to make.
 *
 * ── What it shows ───────────────────────────────────────────────────────────────────────────────
 *
 * The project, plainly: its name, its place, its dates, its basis, its payment terms. A pen opens
 * the ordinary project form on it, because the site the renter now owns is the one place a name is
 * worth typing and *the request could not supply one*. And *View it* goes to the board with
 * `?site=<id>`, which selects that project rather than whichever was touched last.
 *
 * ── If the write fails, it says nothing ─────────────────────────────────────────────────────────
 *
 * The request is already posted and safe. A dialog reporting that a convenience did not happen, on
 * the screen that says *your request is live*, trades the good news for a worry the renter can do
 * nothing about. It is retried the ordinary way: from the board, whenever they next open it.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { listProjects, createProject, updateProject, assignToProject } from "@/lib/api/client";
import { leftTheSite, projectTitle, shortSite, type ProjectSummary } from "@/lib/contract/project";
import type { ProjectDetails, Preferences } from "@/lib/contract/draft";
import { ProjectForm, type ProjectFormValue } from "@/components/projects/ProjectForm";

/* ~~A per-device «dismissed» flag.~~ Gone with the offer it belonged to: this dialog reports
   something that already happened, and a report you can permanently silence is a report that stops
   telling a renter their request was filed somewhere. Closing it closes this one. */

export function ProjectFiled({
  requestId,
  project,
  preferences,
  onDone,
  hold = false,
}: {
  /** The request just posted. Without an id there is nothing to file, so nothing happens at all. */
  requestId: string | null;
  project: ProjectDetails;
  preferences: Preferences;
  onDone?: () => void;
  /**
   * Hold the DIALOG while something else has the screen (owner, 2026-09-08: *"then the project modal
   * after them"*).
   *
   * ⚠️ It holds the dialog and **never the write**. The filing is a convenience that happens on
   * mount; queueing that as well would mean a renter who closes the tab before reading the tick ends
   * up with a request filed under nothing, which is the silent bug this component was written to
   * fix in the first place.
   */
  hold?: boolean;
}) {
  const t = useT();
  const o = t.projects.offer;
  const router = useRouter();

  /** `null` while the write is in flight; the site once it is filed; `false` if it could not be. */
  const [site, setSite] = useState<ProjectSummary | null | false>(null);
  const [gone, setGone] = useState(false);
  /** The project form, opened by the pen. */
  const [form, setForm] = useState<ProjectFormValue | null>(null);
  const [busy, setBusy] = useState(false);

  const address = project.location.label ?? "";

  /** The request, as the project form's value — see `siteTiming` for why timing is picked apart. */
  const seed = useCallback(
    (): ProjectFormValue => ({
      title: null,
      location: { label: address, lat: project.location.lat ?? null, lng: project.location.lng ?? null },
      defaults: { timing: siteTiming(project), paymentTerms: preferences.payment.terms ?? null },
    }),
    [address, project, preferences.payment.terms],
  );

  useEffect(() => {
    if (!address || !requestId) return;
    let live = true;

    /* One place, one project. An existing site at this address takes the request; otherwise a site
       is made from it. Both end at the same `assignToProject`, so the request is filed either way
       and the dialog says the same thing about either outcome. */
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
        const made = found ?? (await createProject(seed()));
        await assignToProject(requestId, made.id);
        if (live) setSite(made);
      } catch {
        // Silent on purpose — see the note at the top. The request is posted; this was the extra.
        if (live) setSite(false);
      }
    })();

    return () => {
      live = false;
    };
    /* The coordinates are in the deps because the match now reads them; they come off the same
       submitted draft as `address` and do not change under a mounted dialog. */
  }, [address, requestId, seed, project.location.lat, project.location.lng]);

  // Nothing to say yet, nothing to say at all, or already answered — and nothing while another
  // dialog is being read (`hold`), though the filing above has already happened by then.
  if (gone || hold || site === null || site === false) return null;

  function close() {
    setGone(true);
    onDone?.();
  }

  /* ── The pen: the ordinary project form, on the site that now exists ──
     Saving here EDITS it rather than creating a second one. The form is the same one the board uses,
     so a renter who renames it here and a renter who renames it there are using one control. */
  if (form) {
    return (
      <Dialog open onClose={() => setForm(null)} title={t.projects.surface.editTitle} size="xl">
        <ProjectForm
          value={form}
          onChange={setForm}
          markUnset
          onCancel={() => setForm(null)}
          onSave={async (v) => {
            setBusy(true);
            try {
              await updateProject(site.id, site.version ?? 1, v);
              setSite({ ...site, ...v } as ProjectSummary);
              setForm(null);
            } finally {
              setBusy(false);
            }
          }}
          saving={busy}
        />
      </Dialog>
    );
  }

  /* Exactly what the site now holds, in the renter's own values — the five `createProject` sent, in
     the same order, never a sixth. «Hours per day» was listed here until 2026-08-31 and the project
     has not stored it since 08-30 (`ProjectDefaults.timing` omits it by type): the panel was
     promising to remember a number nobody was keeping. */
  const saved: Array<[string, string]> = [
    [o.fieldName, projectTitle(site)],
    [o.fieldSite, shortSite(site.location.label ?? address)],
    [o.fieldDates, [project.timing.startDate, project.timing.endDate].filter(Boolean).join(" → ") || "—"],
    [o.fieldBasis, project.timing.rentalBasis ?? "—"],
    [o.fieldExtendable, project.timing.extendable ? t.common.yes : t.common.no],
    [o.fieldPayment, preferences.payment.terms ?? "—"],
  ];

  return (
    <Shell title={o.filedTitle.replace("{site}", projectTitle(site))} sub={o.filedSub} onClose={close}>
      {/* The details, with the pen ON the heading of the list they belong to — a renter looking for
          "where do I change this?" looks at the thing that needs changing, not at the dialog's
          footer. */}
      <List
        heading={o.savedHeading}
        rows={saved}
        action={
          <button
            type="button"
            onClick={() => setForm(seed())}
            className="flex items-center gap-1 text-meta font-semibold text-brand"
          >
            <Icon name="edit" size={13} /> {t.common.edit}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            close();
            router.push(`/?site=${encodeURIComponent(site.id)}`);
          }}
        >
          <Icon name="open_in_new" size={15} /> {o.viewAction}
        </Button>
        <NotNow label={t.common.close} onClick={close} />
      </div>
    </Shell>
  );
}

/* ----------------------------- Chrome ----------------------------- */

/**
 * The app's one dialog shell, at `md`.
 *
 * Closing it by any route — the X, Escape, the backdrop — is *Not now*, which is permanent per
 * device. That is deliberate and it is the existing rule: an offer that returns after being refused
 * reads as nagging, and there is no half-answer to give here.
 */
function Shell({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onClose={onClose} title={title} subtitle={sub}>
      <div className="flex flex-col gap-4">{children}</div>
    </Dialog>
  );
}

/** The four timing values a PROJECT holds — never the draft's fifth (`hoursPerDay`), which is a
 *  per-hire question. Spreading `project.timing` sent it to the API in silence: the target type omits
 *  the key, but a spread is not an object literal, so nothing checked it. */
function siteTiming(project: ProjectDetails) {
  const { startDate, endDate, rentalBasis, extendable } = project.timing;
  return { startDate, endDate, rentalBasis, extendable };
}

/* ~~`Choice` — the two big option cards.~~ Gone with the question they answered: the address now
   decides whether the request joins an existing site or makes one, and neither is a choice to put in
   front of a renter who has just posted a request. */

function List({
  heading,
  rows,
  action,
}: {
  heading: string;
  rows: Array<[string, string]>;
  /** A control on the heading row — the pen. On the LIST, because that is what it edits. */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col divide-y divide-brand/20 rounded-sm border border-brand/40 bg-brand-soft px-3.5 py-1">
      <span className="flex items-center justify-between gap-3 py-2 text-label font-semibold uppercase tracking-[.03em] text-muted">
        {heading}
        {action}
      </span>
      {rows.map(([k, v]) => (
        /* A row per value, ruled: the list is the subject of this dialog now rather than half of a
           comparison, so it is read down, and a rule between rows is what keeps the label and its
           value paired when the value is short. */
        <span key={k} className="flex items-baseline justify-between gap-3 py-2 text-body">
          <span className="text-muted">{k}</span>
          <span className="truncate font-semibold text-navy">{v}</span>
        </span>
      ))}
    </div>
  );
}

function NotNow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-meta font-semibold text-muted underline underline-offset-2 hover:text-navy">
      {label}
    </button>
  );
}
