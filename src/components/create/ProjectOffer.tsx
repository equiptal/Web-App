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
 * ── It does not → show them the split, in their own numbers ──────────────────────────────────────
 *
 * The whole mental model of this feature is one line: **the site is saved, the shopping trip is
 * not.** Explaining that in prose fails; showing it as two labelled lists of the values they just
 * typed does not. This is the one screen where a renter meets that split with their own request in
 * front of them, which is why the lists are exhaustive rather than illustrative.
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
import { listProjects, createProject, assignToProject } from "@/lib/api/client";
import { projectTitle, shortSite, type ProjectSummary } from "@/lib/contract/project";
import type { ProjectDetails, Preferences } from "@/lib/contract/draft";

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

  /* ── The site already exists ── */
  if (existing.length > 0) {
    const site = existing[0];
    return (
      <Panel title={o.alreadyTitle.replace("{site}", projectTitle(site))} sub={o.alreadySub}>
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
          <Choice
            icon="add_location_alt"
            title={o.different}
            sub={o.differentSub}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const made = await createProject({
                  title: null,
                  location: { label: address, lat: project.location.lat ?? null, lng: project.location.lng ?? null },
                  defaults: { timing: { ...project.timing }, paymentTerms: preferences.payment.terms ?? null },
                });
                if (requestId) await assignToProject(requestId, made.id);
              } finally {
                close();
              }
            }}
          />
        </div>
        <NotNow label={o.notNow} onClick={close} />
      </Panel>
    );
  }

  /* ── No site here yet ── */
  const saved: Array<[string, string]> = [
    [o.fieldSite, shortSite(address)],
    [o.fieldDates, [project.timing.startDate, project.timing.endDate].filter(Boolean).join(" → ") || "—"],
    [o.fieldBasis, project.timing.rentalBasis ?? "—"],
    [o.fieldHours, project.timing.hoursPerDay != null ? String(project.timing.hoursPerDay) : "—"],
    [o.fieldPayment, preferences.payment.terms ?? "—"],
  ];
  const stays: Array<[string, string]> = [
    [o.fieldEquipment, o.thisRequestOnly],
    [o.fieldBudget, preferences.budgetSar ? String(preferences.budgetSar) : "—"],
    [o.fieldMethod, preferences.payment.method ?? "—"],
    [o.fieldSuppliers, preferences.supplierFilters.verifiedOnly ? o.verifiedOnly : "—"],
  ];

  return (
    <Panel title={o.createTitle} sub={o.createSub}>
      {/* The split, in their own values. This is the one screen where a renter meets it with their
          own request in front of them, so the lists are exhaustive rather than illustrative. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <List heading={o.savedHeading} tone="keep" rows={saved} />
        <List heading={o.staysHeading} tone="stay" rows={stays} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const made = await createProject({
                title: null,
                location: { label: address, lat: project.location.lat ?? null, lng: project.location.lng ?? null },
                defaults: { timing: { ...project.timing }, paymentTerms: preferences.payment.terms ?? null },
              });
              if (requestId) await assignToProject(requestId, made.id);
            } finally {
              close();
            }
          }}
        >
          <Icon name="add" size={15} /> {o.createAction}
        </Button>
        <NotNow label={o.notNow} onClick={close} />
      </div>
    </Panel>
  );
}

/* ----------------------------- Chrome ----------------------------- */

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div>
        <h3 className="text-subhead font-extrabold text-navy">{title}</h3>
        <p className="mt-0.5 text-body text-muted">{sub}</p>
      </div>
      {children}
    </section>
  );
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

function List({ heading, tone, rows }: { heading: string; tone: "keep" | "stay"; rows: Array<[string, string]> }) {
  return (
    <div className={`flex flex-col gap-1 rounded-sm border p-3 ${tone === "keep" ? "border-brand/40 bg-brand-soft" : "border-border bg-surface2/50"}`}>
      <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{heading}</span>
      {rows.map(([k, v]) => (
        <span key={k} className="flex items-baseline justify-between gap-2 text-meta">
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
