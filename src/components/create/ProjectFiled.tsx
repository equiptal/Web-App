"use client";

/**
 * After a projectless submit — the two offers (web-app/007, W-T24 · spec §11.3).
 *
 * Which one appears is decided by **whether the place they just stated already has a project**, and
 * that decision matters more than either card's wording.
 *
 * ── It already has one → offer to file, never to create ──────────────────────────────────────────
 *
 * A second project for the same place is how a site's picture splits in two: half the machines on
 * one chart, half on another, and the renter believes each. Once that has happened there is no
 * clean way back — the requests under each are real. So when a site exists at the address, creating
 * another is not offered at all; the choice is *add it to this one* or *it is a different site*.
 *
 * ── It does not → show them what the SITE would keep ─────────────────────────────────────────────
 *
 * One list: the values that become the project, in their own numbers. ~~Two lists side by side, the
 * second naming everything that stays with this request — equipment, budget, payment method,
 * supplier filters.~~ Removed by the owner (2026-08-31: *"this must only show the project details
 * not the right section"*), and he is right about what it cost: a column of «—» against four labels
 * read as four things the renter had failed to fill in, on a screen whose whole job is to say *this
 * is what we will remember*. What the project does NOT take needs no inventory — nothing about the
 * request changes either way.
 *
 * ── It is a MODAL, at the moment of submitting ────────────────────────────────────────────────────
 *
 * ~~A panel under the confirmation screen's own actions.~~ It sat below *View request & bids* and
 * *New request*, which are the two controls a renter reaches for the instant the page appears — so
 * the offer was under the thing that navigates away from it. Asked as a dialog, at the one moment it
 * is about, it gets answered.
 *
 * ── «Yes» opens the form; it does not save silently ──────────────────────────────────────────────
 *
 * Pressing *Make the project* used to POST one immediately, with whatever the request happened to
 * carry. It now opens the ordinary project dialog, prefilled from the request and with the values
 * the request could not supply — the title, usually the payment terms — marked as unset (owner,
 * 2026-08-31). Two reasons it is better: the site the renter is about to own is the one place a name
 * is worth typing, and a project quietly created with four of six fields blank is a record they will
 * meet later with no idea why it is thin. Marked, never required: the address is still the only
 * thing Save waits for.
 *
 * ── Declining changes nothing, and is remembered ─────────────────────────────────────────────────
 *
 * The request is already posted. Dismissal is per device and permanent, because an offer that
 * returns after being refused reads as nagging, and this one appears at the moment a renter has
 * just finished something.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { listProjects, createProject, assignToProject } from "@/lib/api/client";
import { projectTitle, shortSite, type ProjectSummary } from "@/lib/contract/project";
import type { ProjectDetails, Preferences } from "@/lib/contract/draft";
import { ProjectForm, type ProjectFormValue } from "@/components/projects/ProjectForm";

const DISMISS_KEY = "moedatech.projectOffer.dismissed";

/** Per device, and permanent. An offer that comes back after a refusal reads as nagging. */
function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}
function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private window, storage blocked — the offer simply reappears next time */
  }
}

export function ProjectOffer({
  requestId,
  project,
  preferences,
  onDone,
}: {
  /** The request just posted, so *add it to this site* can file it in one click. */
  requestId: string | null;
  project: ProjectDetails;
  preferences: Preferences;
  onDone?: () => void;
}) {
  const t = useT();
  const o = t.projects.offer;

  const [existing, setExisting] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(() => dismissed());
  /** The second stage: the project dialog, prefilled. Null while the offer itself is on screen. */
  const [form, setForm] = useState<ProjectFormValue | null>(null);

  const address = project.location.label ?? "";

  useEffect(() => {
    if (gone || !address) return;
    listProjects()
      .then((all) => {
        const here = shortSite(address).toLowerCase();
        setExisting(all.filter((p) => shortSite(p.location.label).toLowerCase() === here));
      })
      .catch(() => setExisting([]));
  }, [gone, address]);

  if (gone || !address || existing === null) return null;

  function close() {
    dismiss();
    setGone(true);
    onDone?.();
  }

  /** The request, as the project form's value. The four timing fields a project holds, and no
   *  fifth — see {@link siteTiming}. The title is deliberately blank: it is the one thing the
   *  request cannot answer, and the form marks it. */
  function seed(): ProjectFormValue {
    return {
      title: null,
      location: { label: address, lat: project.location.lat ?? null, lng: project.location.lng ?? null },
      defaults: { timing: siteTiming(project), paymentTerms: preferences.payment.terms ?? null },
    };
  }

  /** The one write both create paths end at: make the site, then file this request under it. */
  async function save(value: ProjectFormValue) {
    setBusy(true);
    try {
      const made = await createProject(value);
      if (requestId) await assignToProject(requestId, made.id);
    } finally {
      close();
    }
  }

  /* ── The second stage ──
     The ordinary project dialog at its ordinary width, with `markUnset` so the renter sees which
     values the request could not supply. Cancelling here is *Not now*: they have already answered
     the offer, and bouncing them back to it would be the same question twice. */
  if (form) {
    return (
      <Dialog open onClose={close} title={t.projects.surface.newProject} size="xl">
        <ProjectForm
          value={form}
          onChange={setForm}
          markUnset
          onCancel={close}
          onSave={(v) => void save(v)}
          saving={busy}
        />
      </Dialog>
    );
  }

  /* ── The site already exists ── */
  if (existing.length > 0) {
    const site = existing[0];
    return (
      <Shell title={o.alreadyTitle.replace("{site}", projectTitle(site))} sub={o.alreadySub} onClose={close}>
        <div className="grid gap-2 sm:grid-cols-2">
          {/* Two EQUAL cards. Making "add it" the primary would push a renter into merging two
              genuinely different sites that happen to share a street name. */}
          <Choice
            icon="playlist_add"
            title={o.addTo.replace("{site}", projectTitle(site))}
            sub={o.addToSub}
            disabled={busy || !requestId}
            onClick={async () => {
              if (!requestId) return;
              setBusy(true);
              try {
                await assignToProject(requestId, site.id);
              } finally {
                close();
              }
            }}
          />
          {/* A second site at one address is the case that most needs a NAME — two projects called
              «Riyadh» are the split this whole panel exists to prevent — so this opens the form
              rather than posting. */}
          <Choice
            icon="add_location_alt"
            title={o.different}
            sub={o.differentSub}
            disabled={busy}
            onClick={() => setForm(seed())}
          />
        </div>
        <NotNow label={o.notNow} onClick={close} />
      </Shell>
    );
  }

  /* ── No site here yet ── */
  /* Exactly the five values `createProject` below is about to send, in the same order — never a
     sixth. «Hours per day» was listed here until 2026-08-31 and the project has not held it since
     08-30 (`ProjectDefaults.timing` omits it by type): the panel was promising to remember a number
     nobody was storing. `extendable` took the row, because that one is saved. */
  const saved: Array<[string, string]> = [
    [o.fieldSite, shortSite(address)],
    [o.fieldDates, [project.timing.startDate, project.timing.endDate].filter(Boolean).join(" → ") || "—"],
    [o.fieldBasis, project.timing.rentalBasis ?? "—"],
    [o.fieldExtendable, project.timing.extendable ? t.common.yes : t.common.no],
    [o.fieldPayment, preferences.payment.terms ?? "—"],
  ];

  return (
    <Shell title={o.createTitle} sub={o.createSub} onClose={close}>
      {/* What the SITE keeps, in the renter's own values — one list, full width. */}
      <List heading={o.savedHeading} rows={saved} />

      <div className="flex flex-wrap items-center gap-2">
        {/* Opens the form — it does not post. See the note at the top on why. */}
        <Button disabled={busy} onClick={() => setForm(seed())}>
          <Icon name="add" size={15} /> {o.createAction}
        </Button>
        <NotNow label={o.notNow} onClick={close} />
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

function Choice({
  icon,
  title,
  sub,
  onClick,
  disabled,
}: {
  icon: string;
  title: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-start gap-2.5 rounded-sm border border-border bg-surface px-3.5 py-3 text-start transition hover:border-brand disabled:border-border disabled:bg-disabled-bg disabled:text-disabled-fg"
    >
      <Icon name={icon} size={17} className="mt-0.5 flex-none text-brand" />
      <span className="min-w-0">
        <span className="block text-body font-semibold text-navy">{title}</span>
        <span className="block text-meta text-muted">{sub}</span>
      </span>
    </button>
  );
}

/** One tone, because there is one list now: the amber the whole product uses for "this is kept". */
function List({ heading, rows }: { heading: string; rows: Array<[string, string]> }) {
  return (
    <div className="flex flex-col divide-y divide-brand/20 rounded-sm border border-brand/40 bg-brand-soft px-3.5 py-1">
      <span className="py-2 text-label font-semibold uppercase tracking-[.03em] text-muted">{heading}</span>
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
