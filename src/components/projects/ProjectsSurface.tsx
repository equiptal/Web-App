"use client";

/**
 * `/projects` — the list of sites, and the form for making or editing one (W-T10 · W-T11).
 *
 * Phase 1 is deliberately just this. The board with the chart is W-T13; until it lands, a renter can
 * create a site and edit its terms, which is what the intake chips need to be worth anything.
 */

import { useCallback, useEffect, useState, useRef} from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Skeleton } from "@/components/Skeleton";
import { Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { useRouter } from "next/navigation";
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  fetchChart,
  saveAward,
  markRow,
  markAward,
  deleteAward,
  saveWorkOrder,
  deleteWorkOrder,
  fetchTaxonomy,
  fetchAllMyRequests,
  assignToProject,
  listWorkOrders,
  renameRequestRow,
  attachDocument,
  documentUrl,
  SITE_DOCUMENT,
  removeDocument,
  withFreshVersion,
  ProjectVersionConflict,
  ApiError,
  type AwardInput,
} from "@/lib/api/client";
import {
  propagationForRequest,
  siteConflicts,
  type ProjectSummary,
  type SiteConflict,
} from "@/lib/contract/project";
import { ProjectForm, emptyProjectForm, projectToForm, type ProjectFormValue } from "./ProjectForm";
import { ProjectDelete, ProjectCreated, projectIsEmpty } from "./ProjectDelete";
import { ProjectsBoard } from "./ProjectsBoard";
import type { Award, AwardDocument, ChartGroup, ChartItem } from "@/lib/contract/award";
import { RowMenu } from "./RowMenu";
import { AwardDialog, UnawardConfirm } from "./AwardDialog";
import { PeriodConflictDialog } from "./PeriodConflictDialog";
import { WorkOrderForm, workOrderPayload, blankMachine, type WorkOrderDraft } from "./WorkOrderForm";
import { blankTerms } from "./TermsFields";
import { FileRequestDialog } from "./FileRequestDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";
import { DocumentsDialog } from "./DocumentsDialog";
import { ConflictDialog, periodConflicts } from "./ConflictDialog";
import { projectTitle } from "@/lib/contract/project";
import { EMPTY_WHEN } from "@/lib/contract/work-order";
import type { Taxonomy } from "@/lib/contract/taxonomy";

/**
 * The section header, matching *My Requests* exactly (owner, 2026-08-30).
 *
 * A navy plate carrying the section's glyph, the title over its summary, the action on the trailing
 * edge — and NO bordered box, because the page already has enough bordered rectangles and the plate
 * is what the eye finds. Two sections in one column that announce themselves differently read as two
 * pages accidentally stacked.
 *
 * The action is the PRIMARY button, not a quiet one: on an empty dashboard it is the only thing to
 * do here, and a white button beside an orange one elsewhere on the page says this matters less.
 */
function SectionHeader({ count }: { count: number }) {
  const t = useT();
  return (
    /* ~~A «New project» button on the trailing edge.~~ Removed (owner, 2026-08-31): the rail already
       ends with one, and two identical controls for one act — a heading apart — make a renter wonder
       which of them does something else. The rail's is the one that stays, because it sits at the end
       of the list it adds to. */
    <div className="flex items-center gap-3">
      <span className="grid size-[38px] flex-none place-items-center rounded-sm bg-navy text-surface">
        <Icon name="place" size={22} />
      </span>
      <span className="min-w-0">
        <h2 className="text-title font-extrabold text-navy">{t.projects.surface.heading}</h2>
        <span className="mt-0.5 block text-meta text-muted">
          {count > 0 ? t.projects.surface.summary.replace("{n}", String(count)) : t.projects.surface.empty}
        </span>
      </span>
    </div>
  );
}

/**
 * Put each request's own name onto its chart row.
 *
 * `getChart` sends `title: null` for a request — it has no title column to read — so the name comes
 * from the site's `awards.labels`, which the same payload already carries. Applied here rather than
 * in the board, so every consumer of `chart.groups` sees the named row and nothing has to remember
 * to look the name up a second time.
 *
 * A work order's title is left exactly as it arrived: that one is real, stored on the order.
 */
function named(groups: ChartGroup[], project: { awards?: { labels?: Record<string, string> } }): ChartGroup[] {
  const labels = project.awards?.labels ?? {};
  if (!Object.keys(labels).length) return groups;
  return groups.map((g) => (g.kind === "request" && labels[g.id] ? { ...g, title: labels[g.id] } : g));
}

/**
 * Where a request opens.
 *
 * ⚠️ **There is no `/requests/[id]` route** — `src/app/requests` holds one `page.tsx` and nothing
 * else. Two places here pushed `/requests/${id}` and both were dead links: the row menu's *Open the
 * request*, and the conflict dialog's fallback. Neither errored; Next simply served a 404 page,
 * which is why it survived being clicked.
 *
 * The workspace opens one from a query instead — `?g=` names the group and `?details=1` picks the
 * door (`RequestsWorkspace.tsx:205`). Built here once so the next caller cannot get it wrong again.
 */
function requestUrl(id: string, door: "details" | "edit" = "details"): string {
  return `/requests?g=${encodeURIComponent(id)}&${door}=1`;
}

/**
 * The chart as this surface holds it: the site, its groups with our labels already applied, and the
 * site's OWN papers — the ones filed against no single award.
 */
type Chart = { project: ProjectSummary; groups: ChartGroup[]; documents: AwardDocument[] };

export function ProjectsSurface({ embedded }: { embedded?: boolean } = {}) {
  const t = useT();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  /** `version` rides along on an EDIT: the backend requires the version the form was opened on. */
  const [editing, setEditing] = useState<{
    id: string | null;
    version?: number;
    value: ProjectFormValue;
    /** The chart's rows, kept whole — the conflict check needs each one's own period. */
    groups?: ChartGroup[];
  } | null>(null);

  /** A save held back while the renter answers *keep these dates, or move them?* */
  const [pending, setPending] = useState<{ value: ProjectFormValue; conflicts: SiteConflict[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** Named, because `refreshChart` now hands one back and two functions take one as a parameter. */
  const [chart, setChart] = useState<Chart | null>(null);
  const [version, setVersion] = useState(1);
  const [awarding, setAwarding] = useState<{ group: ChartGroup; item: ChartItem } | null>(null);
  const [unawarding, setUnawarding] = useState<Award | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrderDraft | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>([]);
  /**
   * Requests filed nowhere — what *Add an existing request* can offer.
   *
   * Kept as chart groups because that is the shape the surface already speaks, and because each one
   * carries the address the file dialog shows beside it. They are no longer a place on the board:
   * *Unassigned* was removed at the owner's request (2026-08-31), and the action moved onto the site
   * where a renter is actually standing when they want one.
   */
  const [unassigned, setUnassigned] = useState<(ChartGroup & { address?: string | null })[]>([]);

  /** Which site is being filed into, while the picker is open. */
  const [filingInto, setFilingInto] = useState<{
    projectId: string;
    label: string;
    /** The site's address, so the picker can flag a request that belongs somewhere else. */
    address: string | null;
  } | null>(null);

  /** The chart row being renamed. */
  const [renaming, setRenaming] = useState<ChartGroup | null>(null);
  const [filing, setFiling] = useState<{
    /** The request's id, or the work order's group id. */
    rowId: string;
    kind: "request" | "work_order";
    address: string | null;
    projectId: string | null;
  } | null>(null);
  /** `siteLevel` means the row has no award: the paper files against the SITE, and the dialog says so. */
  const [papers, setPapers] = useState<{ award: Award; isRequest: boolean; siteLevel?: boolean } | null>(null);
  const [conflict, setConflict] = useState<ChartGroup | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [created, setCreated] = useState<ProjectSummary | null>(null);
  const router = useRouter();
  /** The board itself, so a `?site=` link can bring it into view on a long dashboard. */
  const board = useRef<HTMLDivElement>(null);
  const { sessionKey, status } = useSession();

  /**
   * `null` = not answered yet OR not ours to show. `[]` = answered, and this renter has no sites.
   *
   * The two must not collapse into one. A guest gets 401 here, and treating that as "no projects
   * yet" puts a *My projects · New project* row on a signed-out dashboard — a control that cannot
   * work, offered to someone who was never asked (PROJ-AC-28).
   */
  const reload = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      setProjects(status === 401 || status === 403 ? null : []);
    }
  }, []);

  /**
   * Requests filed nowhere.
   *
   * Read from the renter's own request list rather than from a projects endpoint, because "filed
   * nowhere" is a fact about a request and there is no project to ask. They arrive shaped as chart
   * groups so the rail and the board treat them like any other row - Unassigned is a place in the
   * same page, not a second kind of screen.
   */
  const reloadUnassigned = useCallback(async () => {
    try {
      const { requests } = await fetchAllMyRequests();
      setUnassigned(
        requests
          .filter((r) => r.projectId == null)
          .map((r) => ({
            kind: "request" as const,
            id: r.id,
            ref: r.displayId,
            title: null,
            status: r.status,
            bidCount: r.bidCount,
            renteeEditUsed: r.renteeEditUsed,
            // No project means no inherited period, so no bar - which is why Unassigned has no chart.
            when: null,
            items: [
              {
                id: r.id,
                label: r.item?.name ?? r.displayId,
                labelAr: r.item?.nameAr ?? null,
                quantity: r.item?.qty ?? 1,
                awards: [],
              },
            ],
            // Carried so the file dialog can lead with the sites at this row's own address.
            address: r.city ?? null,
          })),
      );
    } catch {
      setUnassigned([]);
    }
  }, []);

  /* Re-read when the ACCOUNT changes, not only on mount (owner, 2026-08-30): this surface sits on the
     dashboard, and signing in through the modal never remounts the page — so the sites stayed the
     guest's empty set until a reload. `sessionKey` is the one signal for that across the dashboard;
     see its note in `lib/session`.

     The taxonomy is not per-account and is deliberately left in here anyway: it is fetched once per
     mount either way, and splitting it into its own effect to save a repeat that only happens on a
     sign-in is a second effect to keep in step for nothing. */
  useEffect(() => {
    if (status === "loading") return;
    void reload();
    // The catalogue is fetched once for the whole surface rather than when the form opens, so a
    // renter adding a machine does not wait on a network round trip before the first dropdown works.
    fetchTaxonomy().then(setTaxonomy).catch(() => setTaxonomy([]));
    void reloadUnassigned();
  }, [reload, reloadUnassigned, sessionKey, status]);

  /* Land on a site rather than an empty right-hand pane. The first is the most recently touched,
     which is almost always the one the renter came back for.

     ── Unless a link names one ─────────────────────────────────────────────────────────────────────
     `?site=<id>` wins. It is how *View it* on the just-filed dialog arrives here (owner,
     2026-08-31): a link that lands on the board and then selects whichever site was touched last is
     a link that shows the renter the wrong project and makes them hunt for the one they pressed.
     The board also scrolls to itself, because on the dashboard it sits well below the fold. */
  useEffect(() => {
    if (selected !== null || !projects || projects.length === 0) return;
    const wanted = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("site") : null;
    const found = wanted ? projects.find((p) => p.id === wanted) : null;
    setSelected((found ?? projects[0]).id);
    if (found) {
      // After paint, so the row it scrolls to exists.
      requestAnimationFrame(() => board.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [projects, selected]);

  useEffect(() => {
    if (!selected) {
      setChart(null);
      return;
    }
    let live = true;
    fetchChart(selected)
      .then((c) => {
        if (!live) return;
        setChart({ project: c.project, groups: named(c.groups, c.project), documents: c.documents });
        // The version travels with the chart, not with the project card: a card can be stale while
        // the chart was fetched a moment ago, and every award write sends this back.
        setVersion(c.version);
      })
      // A chart that will not load leaves the pane empty rather than half-drawn: a renter reading a
      // partial site cannot tell that is what they are looking at.
      .catch(() => live && setChart(null));
    return () => {
      live = false;
    };
  }, [selected]);

  /**
   * Opening the edit form loads what is filed under the site, because the propagation list is part
   * of the form rather than a step after it — the renter decides what the change reaches while they
   * are making it, not once it is already saved.
   */
  async function openEdit(p: ProjectSummary) {
    setEditing({ id: p.id, version: p.version, value: projectToForm(p), groups: [] });
    try {
      const chart = await fetchChart(p.id);
      /* The chart's groups are kept whole, not reduced to propagation rows: the conflict check
         needs each row's own period, which is the one thing a `PropagationRow` throws away. */
      setEditing((cur) => (cur && cur.id === p.id ? { ...cur, groups: chart.groups } : cur));
    } catch {
      // An empty list is the safe failure: the form still saves the project, and nothing propagates
      // silently to rows we could not read.
      setEditing((cur) => (cur && cur.id === p.id ? { ...cur, groups: [] } : cur));
    }
  }

  /**
   * Save, asking first only if something under the site would now disagree with it.
   *
   * The ordinary edit — a typo in the title, a payment term — goes straight through and mentions
   * nothing, because nothing is in question. The dialog exists for the one case where it is: a row
   * carrying its own dates that the site is about to contradict.
   */
  /**
   * Put a request that already exists onto this site.
   *
   * Filing changes nothing about the request — not its status, not a single value it carries — so
   * there is nothing to confirm and nothing to warn about. Both lists are re-read afterwards: the
   * request leaves the unfiled set and appears on the site's chart, and a stale copy of either
   * would show it in two places at once.
   */
  /**
   * Rename a chart row.
   *
   * A work order carries a `title` of its own and the header write reaches every machine in the
   * group, so this is the existing PATCH with one field in it.
   *
   * A request has no title anywhere — `EquipmentRequest` has no such column — so there is nothing to
   * write yet. It is refused here with a plain sentence rather than a silent no-op: a pen that opens
   * a box, takes a name and loses it is worse than a pen that says it cannot.
   */
  /**
   * Open an existing work order for editing, with each machine's own terms read back.
   *
   * ⚠️ **The chart does not carry terms.** `getChart` returns a machine's name, quantity and awards
   * and nothing else, so seeding the form from a chart row gave every machine a BLANK terms block —
   * and since every machine now always sends its terms, saving wrote those blanks over whatever the
   * renter had entered. Thirteen answers per machine, destroyed by opening a form and pressing save.
   *
   * `listWorkOrders` is where they live (the template reader already uses it for exactly this), so
   * they are fetched and matched by machine id.
   *
   * ⚠️ **A failed fetch does not open the form.** Opening it with blanks is how the terms got wiped;
   * refusing to open says so and costs the renter a retry, which is the cheaper of the two.
   */
  async function startEditOrder(group: ChartGroup) {
    if (!selected) return;
    setNotice(null);
    try {
      const orders = await listWorkOrders(selected);
      const stored = orders.find((o) => o.id === group.id);
      if (!stored) throw new Error("group not found");

      const termsOf = (itemId: string) =>
        stored.items.find((it) => it.id === itemId)?.terms ?? blankTerms();

      setWorkOrder({
        groupId: group.id,
        title: group.title ?? "",
        when: {
          ...EMPTY_WHEN,
          startDate: group.when?.startDate ?? null,
          endDate: group.when?.endDate ?? null,
        },
        // Every existing machine carries its id AND its own terms through the form and back out.
        machines: group.items.map((it) => ({
          ...blankMachine(),
          id: it.id,
          offCatalogue: true,
          rawLabel: it.label,
          quantity: it.quantity,
          terms: termsOf(it.id),
          lines: it.awards.length
            ? it.awards.map((aw) => ({
                // Amounts the award does not carry read back empty, not zero.
                mobAmount: aw.mobilizationAmount != null ? String(aw.mobilizationAmount) : "",
                demobAmount: aw.demobilizationAmount != null ? String(aw.demobilizationAmount) : "",
                supplierName: aw.supplierName,
                units: aw.units,
                rateAmount: aw.rateAmount != null ? String(aw.rateAmount) : "",
                rentalBasis: aw.rentalBasis,
              }))
            : blankMachine().lines,
        })),
      });
    } catch {
      setNotice(t.projects.workOrder.termsUnreadable);
    }
  }

  /**
   * The red half of the move dialog.
   *
   * A REQUEST is unfiled: it keeps every value and can be filed again, which is why this is the same
   * call as filing it to nowhere. A WORK ORDER is deleted, because the site is the only place it
   * exists — there is no "unfiled work order" for it to become.
   */
  async function removeRow() {
    if (!filing) return;
    if (filing.kind === "work_order") {
      setFiling(null);
      await removeOrder(filing.rowId);
      return;
    }
    await file(null);
  }

  /**
   * Record that a machine arrived, or left. No award needed, and no order to follow.
   *
   * ⚠️ **Two places a mark can live, and which one is not a preference.** An AWARD's mark is finer
   * and deliberate (PROJ-AC-13): two units from one vendor can arrive while a third from another has
   * not, so when the renter is looking at an awarded row, that row's award is what they mean. A row
   * with nobody awarded has no allocation to speak of, so the mark belongs to the machine.
   *
   * ⚠️ **This replaced an invention.** The first version created an award named *Own fleet* so there
   * would be somewhere to write, which put words in the renter's mouth: it said a supplier had been
   * chosen when none had. The row's own mark says only what happened.
   */
  async function markAnything(
    item: ChartItem,
    award: Award | null,
    which: "mobilizedAt" | "demobilizedAt",
    value: string | null,
  ) {
    if (award) {
      await mark(award.id, which, value);
      return;
    }
    if (!selected) return;

    setSaving(true);
    setNotice(null);
    try {
      await withFreshVersion(selected, version, (v) => markRow(selected, v, item.id, { [which]: value }));
      await refreshChart();
    } catch {
      setNotice(t.projects.chart.markFailed);
    } finally {
      setSaving(false);
    }
  }

  async function rename(group: ChartGroup, title: string | null) {
    setSaving(true);
    setNotice(null);
    try {
      if (group.kind === "request") {
        /* A request has no title column anywhere, so its name lives in the site's own blob, keyed by
           request id — which means the name belongs to the FILING. Unfile the request and the name
           goes with it. Ruled by the owner over a migration on `equipment_requests` for a nickname
           that is only ever read on the board it was typed on. */
        await renameRequestRow(selected ?? "", version, group.id, title);
      } else {
        // A work order has a title of its own, and the header write reaches every machine in it.
        await saveWorkOrder(selected ?? "", version, { groupId: group.id, body: { title } });
      }
      setRenaming(null);
      await refreshChart();
    } catch {
      setNotice(t.projects.rename.failed);
    } finally {
      setSaving(false);
    }
  }

  async function fileExisting(requestId: string, projectId: string) {
    setSaving(true);
    setNotice(null);
    try {
      await assignToProject(requestId, projectId);
      setFilingInto(null);
      await Promise.all([reload(), reloadUnassigned()]);
    } catch {
      setNotice(t.projects.file.failed);
    } finally {
      setSaving(false);
    }
  }

  async function save(value: ProjectFormValue, applyTo: string[]) {
    if (!editing) return;

    // Only on the first pass. Coming back from the dialog, `applyTo` is the renter's answer.
    if (editing.id && applyTo.length === 0 && !pending) {
      const site = { startDate: value.defaults.timing.startDate, endDate: value.defaults.timing.endDate };
      const found = siteConflicts(editing.groups ?? [], site);
      if (found.length > 0) {
        setPending({ value, conflicts: found });
        return;
      }
    }

    setSaving(true);
    setNotice(null);
    try {
      if (editing.id) {
        await updateProject(editing.id, editing.version ?? 1, value, applyTo);
        setPending(null);
        setEditing(null);
        await reload();
      } else {
        // Straight into "what is on this site?" — an empty project does nothing for anybody, and
        // both ways to fill one live somewhere the renter has not been yet.
        const made = await createProject(value);
        setEditing(null);
        setCreated(made);
        await reload();
      }
    } catch (err) {
      // Someone else edited this site while the form was open. Say so plainly rather than
      // overwriting their change with a form that was filled in before it existed.
      if (err instanceof ProjectVersionConflict) {
        setNotice(t.projects.surface.stale);
      } else {
        // The code and status ride along. "That did not save" tells a renter nothing they can act
        // on and tells us nothing we can debug — and this is the first thing a new renter does, so
        // a failure here is the failure most likely to be reported and least likely to be
        // reproducible without it.
        const detail = err instanceof ApiError ? [err.backendCode, err.status].filter(Boolean).join(" · ") : "";
        setNotice(detail ? `${t.projects.surface.saveFailed} (${detail})` : t.projects.surface.saveFailed);
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * Move this row to another site — or, for a request, to no site at all.
   *
   * A request is re-filed; a work order is re-parented, which the backend now allows and which writes
   * every machine in the group. Neither carries its awards: they are keyed inside the OLD site's
   * blob, which belongs to that site. The dialog says so in red before the renter chooses.
   */
  async function file(projectId: string | null) {
    if (!filing) return;
    setSaving(true);
    try {
      if (filing.kind === "work_order") {
        // No destination means nothing to do — a work order cannot be filed nowhere, because the
        // site is the only place it exists. The dialog offers deletion for that.
        if (!projectId) return;
        await saveWorkOrder(projectId, version, { groupId: filing.rowId, body: { projectId } });
      } else {
        await assignToProject(filing.rowId, projectId);
      }
      setFiling(null);
      await Promise.all([reload(), reloadUnassigned(), selected ? refreshChart() : Promise.resolve()]);
      if (projectId) setSelected(projectId);
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  /** Re-read after any award write, so the chart and the version move together. */
  /**
   * Re-reads the chart, and RETURNS what it read.
   *
   * ⚠️ The return value is the point. `setChart` does not change the `chart` variable the calling
   * function closed over, so anything reading state right after `await refreshChart()` reads the
   * chart from BEFORE the write — which is exactly why the open papers dialog kept showing the old
   * list after an attach and only caught up when it was closed and reopened (owner, 2026-08-31:
   * *"when a document is attached must be shown here directly instantly"*). Callers that need the
   * new data in the same tick take it from here rather than from state.
   */
  async function refreshChart(): Promise<Chart | null> {
    if (!selected) return null;
    const c = await fetchChart(selected);
    const next = { project: c.project, groups: named(c.groups, c.project), documents: c.documents };
    setChart(next);
    setVersion(c.version);
    await reload();
    return next;
  }

  async function award(lines: AwardInput[]) {
    if (!awarding || !selected) return;
    const parent =
      awarding.group.kind === "request"
        ? { requestId: awarding.group.id, workOrderItemId: null }
        : { requestId: null, workOrderItemId: awarding.item.id };
    setSaving(true);
    setNotice(null);
    try {
      // Sequential, and each call carries the version the previous one returned. A split is two
      // writes to the same blob; firing them together would make the second one stale by definition.
      let v = version;
      for (const line of lines) {
        const res = await saveAward(selected, v, { ...line, ...parent });
        v = res.version;
      }
      setAwarding(null);
      await refreshChart();
    } catch (err) {
      // NOT retried. Replaying a create after somebody else's write can promise the same units
      // twice, so the renter is told and re-reads instead.
      setNotice(err instanceof ProjectVersionConflict ? t.projects.surface.stale : t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  /** Marks and un-awards land on the same result whatever order they arrive in, so these retry. */
  async function mark(awardId: string, which: "mobilizedAt" | "demobilizedAt", value: string | null) {
    if (!selected) return;
    try {
      await withFreshVersion(selected, version, (v) => markAward(selected, awardId, v, { [which]: value }));
      await refreshChart();
    } catch {
      setNotice(t.projects.surface.saveFailed);
    }
  }

  /**
   * A blank work order for this site, seeded with the site's own period.
   *
   * Seeded rather than empty because that is the whole point of a site holding defaults: a renter
   * who set 1 Sep – 31 Dec once should not retype it per machine. They can still change it here,
   * and the chart marks an order that ends up disagreeing with its site as having *own dates*.
   */
  function startWorkOrder(p: ProjectSummary) {
    setWorkOrder({
      title: "",
      when: {
        ...EMPTY_WHEN,
        rentalBasis: p.defaults.timing.rentalBasis,
        extendable: p.defaults.timing.extendable,
        startDate: p.defaults.timing.startDate,
        endDate: p.defaults.timing.endDate,
      },
      /* The site's basis reaches the supplier line too, which it did not: the line was built on a
         hardcoded "monthly" while its comment claimed the site's. A work order on a weekly site
         opened with every line reading monthly. */
      machines: [blankMachine(undefined, p.defaults.timing.rentalBasis)],
    });
  }

  async function saveOrder(d: WorkOrderDraft) {
    if (!selected) return;
    setSaving(true);
    setNotice(null);
    try {
      // `workOrderPayload` keeps each existing machine's id. Rebuilding the set without them
      // scrubs every award, mark and purchase order under the order.
      await saveWorkOrder(selected, version, workOrderPayload(d, { create: !d.groupId }));
      setWorkOrder(null);
      await refreshChart();
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function removeOrder(groupId: string) {
    setSaving(true);
    try {
      await deleteWorkOrder(groupId);
      await refreshChart();
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function attach(file: File, kind: string) {
    if (!selected || !papers) return;
    setSaving(true);
    try {
      await attachDocument(selected, papers.award.id, version, file, kind);
      // The FRESH chart, not state: see the note on refreshChart. Reading state here is what made
      // the new paper appear only after the dialog was closed and reopened.
      const fresh = await refreshChart();
      setPapers((cur) => (cur ? { ...cur, award: findAward(cur.award.id, fresh) ?? cur.award } : cur));
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function detach(docId: string) {
    if (!selected || !papers) return;
    setSaving(true);
    try {
      await removeDocument(selected, papers.award.id, docId);
      const fresh = await refreshChart();
      setPapers((cur) => (cur ? { ...cur, award: findAward(cur.award.id, fresh) ?? cur.award } : cur));
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  /** The award as the freshly-read chart holds it, so an open dialog is never a stale copy. */
  /**
   * A stand-in award for a row nobody has awarded, so the papers dialog has something to render.
   *
   * It is NEVER written anywhere. Its id is `SITE_DOCUMENT` — the `-` the backend reads as *file this
   * against the site* — so an attach from this row takes the site path and nothing invents a supplier
   * the renter never named. The documents it lists are the site's own papers.
   */
  function siteLevelAward(item: ChartItem): Award {
    return {
      id: SITE_DOCUMENT,
      supplierId: null,
      // The machine's name, because the dialog's subtitle would otherwise read a supplier nobody named.
      supplierName: item.label,
      units: item.quantity,
      mobilizationAmount: null,
      demobilizationAmount: null,
      rentalBasis: "monthly",
      rateAmount: null,
      mobilizedAt: null,
      demobilizedAt: null,
      documents: siteOnlyDocuments(),
      awardedAt: null,
    };
  }

  /**
   * The site's papers that belong to no award.
   *
   * ⚠️ `chart.documents` is **every** document on the site, not only the unattached ones — the
   * backend builds it from `Project.documents`, which is where an award's papers live too (an award
   * holds only their ids). Handing that list to a row nobody has awarded would show the renter
   * purchase orders belonging to other rows, in a dialog whose remove button files against `-`.
   *
   * So subtract what the awards claim. What is left is the framework agreement, the permit, the
   * signed scope: the papers that are about the job rather than about one supplier.
   */
  function siteOnlyDocuments(): AwardDocument[] {
    const claimed = new Set<string>();
    for (const g of chart?.groups ?? []) {
      for (const it of g.items) {
        for (const a of it.awards) {
          for (const doc of a.documents) claimed.add(doc.id);
        }
      }
    }
    return (chart?.documents ?? []).filter((d) => !claimed.has(d.id));
  }

  /**
   * Opens one paper in a new tab, from wherever its name was pressed.
   *
   * The link is fetched per press and used immediately — ten minutes of life, so it is never held on
   * a row or rendered into the page. A failure surfaces as the row notice: the renter's next move is
   * to try again, and a press that does nothing teaches them the paper is gone.
   */
  async function openPaper(docId: string) {
    if (!selected) return;
    try {
      const url = await documentUrl(selected, docId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setNotice(t.projects.docs.openFailed);
    }
  }

  /** `where` defaults to state; pass the value `refreshChart` returned to read what was just written. */
  function findAward(id: string, where?: Chart | null): Award | null {
    for (const g of (where ?? chart)?.groups ?? []) {
      for (const it of g.items) {
        const hit = it.awards.find((x) => x.id === id);
        if (hit) return hit;
      }
    }
    return null;
  }

  async function unaward() {
    if (!selected || !unawarding) return;
    setSaving(true);
    try {
      await withFreshVersion(selected, version, (v) => deleteAward(selected, unawarding.id, v));
      setUnawarding(null);
      await refreshChart();
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Embedded with no sites yet: one quiet row, not the whole board and not nothing.
   *
   * Rendering nothing here was a dead end — the only *New project* control lives inside the board
   * below, so a renter with no sites could never make their first one. An empty block competing
   * with the dashboard's hero was the thing to avoid; a feature nobody can start is worse.
   *
   * So it is a single line with the action on it, and it disappears the moment there is a real site
   * to show instead.
   */
  if (embedded && projects && projects.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <SectionHeader count={0} />

        {/* The board is not rendered on this branch, so the rail's *New project* is not there either
            — this row carries its own copy, in the same dashed brand outline, or a renter with no
            sites could never make their first one. */}
        <button
          type="button"
          onClick={() => setEditing({ id: null, value: emptyProjectForm() })}
          className="flex items-center gap-1.5 self-start rounded-sm border border-dashed border-brand px-3 py-2 text-body font-semibold text-brand transition hover:bg-brand-soft"
        >
          <Icon name="add" size={14} /> {t.projects.surface.newProject}
        </button>

        {/* This branch returns early, so it needs its own copy of the notice. Without one a failed
            save was completely silent — the renter pressed Save and nothing happened, which is
            indistinguishable from a broken button. */}
        {notice && <p className="rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 text-body text-danger">{notice}</p>}

        {/* The form still has to be reachable from here, or the button does nothing. */}
        <Dialog open={!!editing} onClose={() => setEditing(null)} title={t.projects.surface.newProject} size="xl">
          {editing && (
            <ProjectForm
              value={editing.value}
              onChange={(value) => setEditing((cur) => (cur ? { ...cur, value } : cur))}
              onCancel={() => setEditing(null)}
              onSave={(value, applyTo) => void save(value, applyTo)}
              saving={saving}
            />
          )}
        </Dialog>
      </section>
    );
  }

  /* Still loading. ~~Nothing at all, "rather than a flash of an empty state that is about to be
     wrong".~~ The instinct was right and the answer was too blunt: the block simply was not there,
     so the dashboard grew a section under the reader's cursor when it arrived. A skeleton says the
     same thing — this is not an answer yet — while holding the room the answer will need. */
  if (embedded && !projects) {
    return (
      <div className="flex flex-col gap-5 pb-24">
        <div className="flex items-center gap-3">
          <Skeleton className="size-[38px] flex-none rounded-sm" />
          <div className="min-w-0">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="mt-1.5 h-2.5 w-48" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[168px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    /* `pb-24`: the page must not end on the chart's last pixel either — a surface whose final row is
       also the last thing above the viewport edge reads as truncated, and the chat dock floats over
       that corner (owner, 2026-08-31). */
    <div ref={board} className="flex flex-col gap-5 pb-24">
      <SectionHeader count={projects?.length ?? 0} />

      {notice && <p className="rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 text-body text-danger">{notice}</p>}

      {projects && projects.length === 0 && <p className="text-body text-muted">{t.projects.surface.empty}</p>}

      {projects && (
        <ProjectsBoard
          projects={projects}
          selectedId={selected}
          onSelect={setSelected}
          onNewProject={() => setEditing({ id: null, value: emptyProjectForm() })}
          chart={chart}
          /* W-T18 fills this from the requests list; until then the rail entry stays hidden, which
             is exactly what it should do when nothing is filed nowhere. */
          onEditProject={(p) => void openEdit(p)}
          onNewWorkOrder={startWorkOrder}
          onAddRequest={(p) =>
            setFilingInto({ projectId: p.id, label: projectTitle(p), address: p.location.label })
          }
          onRename={setRenaming}
          /* One opener for both places a paper's name appears — the chart row and the papers dialog.
             Two would drift, and «open this document» has one right answer. */
          onOpenDocument={(docId) => void openPaper(docId)}
          onOpenConflict={setConflict}
          rowMenu={(group, itemId, awardId) => {
            const item = group.items.find((i) => i.id === itemId);
            if (!item) return null;
            const a = awardId ? item.awards.find((x) => x.id === awardId) ?? null : null;
            return (
              <RowMenu
                group={group}
                award={a}
                actions={{
                  /* Handed over UNCONDITIONALLY, and `RowMenu` decides which of them to show.
                     
                     These used to be ternaries on the same `a` that is passed as `award`, so two
                     places decided the same question and an entry disappeared whenever they
                     disagreed. That is what hid *Award* and both marks on a row with no award: the
                     menu asked "is there an award?" and the answer it got from `award` did not match
                     the answer baked into the handlers. One decision, in one place, cannot disagree
                     with itself. */
                  onAward: () => setAwarding({ group, item }),
                  onChangeAward: () => setAwarding({ group, item }),
                  /* A mark on a machine nobody supplies is a mark on the renter's OWN fleet.

                     There is nowhere else to put it: a mark lives on an award, and an award needs a
                     supplier name. So the first mark on an unawarded machine records the renter as
                     the supplier of all of it — which is what a work order with no supplier line
                     already means — and then marks that. One press from where they are standing.

                     Only ever on a WORK ORDER. A marketplace request with no award has not been
                     given to anyone yet, and inventing the renter as its supplier would say the
                     opposite of what is true. */
                  /* ALWAYS, for both kinds. A mark is a fact about the machine, and it no longer
                     waits on an award to have somewhere to live. */
                  onMark: (which, value) => void markAnything(item, a, which, value),
                  // Un-awarding is reached through Change the award's own confirm, so the menu
                  // does not offer two doors to the same destructive act.
                  onOpenRequest: group.kind === "request" ? () => router.push(requestUrl(group.id)) : undefined,
                  onEditWorkOrder:
                    group.kind === "work_order" ? () => void startEditOrder(group) : undefined,
                  /* No longer its own entry — deleting a work order IS removing it from the site,
                     and the dialog below says so. Kept undefined so the menu draws one door. */
                  onDeleteWorkOrder: undefined,
                  /* ALWAYS, like the marks (owner, 2026-08-31: *"attach must alwasy also shown like
                     mebo/demo"*). It used to appear only on an awarded row, on the reasoning that a
                     paper needs an award to hang on. The backend never agreed: its attach endpoint
                     has always taken `-` in the award slot to file a paper against the SITE, for
                     exactly the paper that belongs to no single award.

                     So an unawarded row files against the site, and the dialog says so in one line
                     rather than pretending the paper is on the machine. A framework agreement signed
                     before anyone is named is the ordinary case, not an edge one. */
                  onAttachDocument: () =>
                    setPapers({
                      award: a ?? siteLevelAward(item),
                      isRequest: group.kind === "request",
                      siteLevel: !a,
                    }),
                  /* Both kinds now. A request is unfiled and stays; a work order is deleted — the
                     dialog is where that difference is stated, and where the move is offered
                     instead. */
                  onRemoveFromProject: () =>
                    setFiling({
                      rowId: group.id,
                      kind: group.kind,
                      address: chart?.project.location.label ?? null,
                      projectId: selected,
                    }),
                  onFileInProject:
                    group.kind === "request"
                      ? () =>
                          setFiling({
                            rowId: group.id,
                            kind: group.kind,
                            address: (group as ChartGroup & { address?: string | null }).address ?? null,
                            projectId: null,
                          })
                      : undefined,
                  // Remove from the project, the quotation and the deal room arrive with W-T18/W-T19.
                  // Left undefined rather than stubbed: an entry that does nothing when pressed is
                  // worse than one that is not there, because the renter tries it twice.
                }}
              />
            );
          }}
        />
      )}

      <Dialog
        open={!!workOrder}
        onClose={() => setWorkOrder(null)}
        title={workOrder?.groupId ? t.projects.menu.editWorkOrder : t.projects.created.workOrder}
        subtitle={t.projects.created.workOrderSub}
        /* The project dialog's width, and for its reason: this one asks the same four-across period
           question and carries wider supplier rows, and a narrower panel wraps both into what look
           like separate questions. */
        size="xl"
      >
        {workOrder && chart && (
          <WorkOrderForm
            taxonomy={taxonomy}
            draft={workOrder}
            onChange={setWorkOrder}
            projectWhen={{
              startDate: chart.project.defaults.timing.startDate,
              endDate: chart.project.defaults.timing.endDate,
            }}
            onCancel={() => setWorkOrder(null)}
            onSave={(d) => void saveOrder(d)}
            saving={saving}
          />
        )}
      </Dialog>

      {papers && (
        <DocumentsDialog
          open
          onClose={() => setPapers(null)}
          award={papers.award}
          isRequest={papers.isRequest}
          onAttach={(file, kind) => void attach(file, kind)}
          onOpen={(docId) => documentUrl(selected!, docId)}
          onRemove={(id) => void detach(id)}
          siteLevel={papers.siteLevel}
          busy={saving}
        />
      )}

      {conflict && chart && (
        <ConflictDialog
          open
          onClose={() => setConflict(null)}
          rowLabel={conflict.title?.trim() || conflict.ref}
          projectLabel={projectTitle(chart.project)}
          fields={periodConflicts(
            conflict.when,
            { startDate: chart.project.defaults.timing.startDate, endDate: chart.project.defaults.timing.endDate },
            { start: t.projects.form.start, end: t.projects.form.end },
          )}
          /* A work order goes to nobody, so matching the project costs nothing and is never refused.
             A request obeys the same edit rule the drawer's Edit button does. */
          state={
            conflict.kind === "work_order"
              ? "work_order"
              : propagationForRequest({
                  id: conflict.id,
                  ref: conflict.ref,
                  status: conflict.status ?? "OPEN",
                  bidCount: conflict.bidCount ?? 0,
                  renteeEditUsed: conflict.renteeEditUsed ?? false,
                }).state
          }
          onMatch={() => {
            // The edit itself belongs to the work-order form and the request edit modal, which own
            // the validation. This opens the right one rather than writing a second edit path.
            setConflict(null);
            if (conflict.kind === "work_order") setNotice(t.projects.conflict.openTheForm);
            else router.push(requestUrl(conflict.id));
          }}
          busy={saving}
        />
      )}

      {filing && projects && (
        <MoveDialog
          open
          onClose={() => setFiling(null)}
          projects={projects}
          address={filing.address}
          currentProjectId={filing.projectId}
          kind={filing.kind}
          onFile={(id) => void file(id)}
          onRemove={() => void removeRow()}
          busy={saving}
        />
      )}

      {awarding && (
        <AwardDialog
          open
          onClose={() => setAwarding(null)}
          item={awarding.item}
          /* ── The ROW's basis, then the site's (owner, 2026-09-01) ────────────────────────────
             *"The rate must already use the request or the work order rental basis."* It read the
             PROJECT's, which is the site's default and not what this row runs on: a work order set
             to weekly on a monthly site priced its award «per month» and nothing said so. The group
             carries its own `when.rentalBasis` — a request took a copy at submit, a work order was
             given one on its form — so that is what the money is quoted against, and the site is
             only the fallback for a row that states nothing. */
          defaultBasis={
            (awarding.group.when?.rentalBasis as Award["rentalBasis"]) ??
            (chart?.project.defaults.timing.rentalBasis as Award["rentalBasis"]) ??
            "monthly"
          }
          onSave={(lines) => void award(lines)}
          saving={saving}
        />
      )}

      {unawarding && (
        <UnawardConfirm open onClose={() => setUnawarding(null)} award={unawarding} onConfirm={() => void unaward()} busy={saving} />
      )}

      {renaming && (
        <RenameDialog
          open
          group={renaming}
          busy={saving}
          onClose={() => setRenaming(null)}
          onSave={(title) => void rename(renaming, title)}
        />
      )}

      {filingInto && (
        <FileRequestDialog
          open
          onClose={() => setFilingInto(null)}
          candidates={unassigned}
          siteLabel={filingInto.label}
          siteAddress={filingInto.address}
          busy={saving}
          onFile={(requestId) => void fileExisting(requestId, filingInto.projectId)}
          /* Its own edit, where changing a location is already governed by the one-edit
             rule — rather than a second place that decides what may be changed. */
          onEditRequest={(requestId) => router.push(requestUrl(requestId, "edit"))}
          onNew={() => router.push(`/create?project=${encodeURIComponent(filingInto.projectId)}`)}
        />
      )}

      {/* Raised only by `save`, and only when something would now read differently from the site. */}
      {pending && (
        <PeriodConflictDialog
          open
          conflicts={pending.conflicts}
          site={{
            startDate: pending.value.defaults.timing.startDate,
            endDate: pending.value.defaults.timing.endDate,
          }}
          busy={saving}
          onCancel={() => setPending(null)}
          onKeep={() => {
            const v = pending.value;
            setPending(null);
            // `[]` is the answer, not the absence of one — see the guard in `save`.
            void save(v, []);
          }}
          onApply={(ids) => {
            const v = pending.value;
            setPending(null);
            void save(v, ids);
          }}
        />
      )}

      {deleting && (
        <ProjectDelete
          project={deleting}
          open
          onClose={() => setDeleting(null)}
          busy={saving}
          onDelete={async () => {
            setSaving(true);
            try {
              await deleteProject(deleting.id);
              setDeleting(null);
              setEditing(null);
              await reload();
            } catch {
              setNotice(t.projects.surface.saveFailed);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {created && (
        <ProjectCreated
          project={created}
          open
          onClose={() => setCreated(null)}
          onAddWorkOrder={() => {
            setSelected(created.id);
            setCreated(null);
            setWorkOrder({ title: "", when: { ...EMPTY_WHEN }, machines: [blankMachine()] });
          }}
          onPostRequest={() => router.push("/create")}
        />
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t.projects.surface.editTitle : t.projects.surface.newProject}
        /* Wide, so the four *When* fields — start · end · extendable · basis — stand on one row
           instead of wrapping into what looks like a second question. */
        size="xl"
      >
        {editing && (
          <ProjectForm
            value={editing.value}
            onChange={(value) => setEditing((cur) => (cur ? { ...cur, value } : cur))}
            isEdit={!!editing.id}
            {...(() => {
              /* Delete now lives inside the form's footer, so the surface hands it the action and
                 the words. A site with rows still gets the control — it opens the panel that says
                 what is filed, because a refusal a renter cannot open is a wall with no door. */
              if (!editing.id) return {};
              const p = projects?.find((x) => x.id === editing.id);
              const empty = !!p && projectIsEmpty(p);
              return {
                onDelete: () => p && setDeleting(p),
                deletable: empty,
                deleteLabel: empty ? t.projects.del.confirmAction : t.projects.del.busyTitle,
              };
            })()}
            onCancel={() => setEditing(null)}
            onSave={(value, applyTo) => void save(value, applyTo)}
            saving={saving}
          />
        )}

      </Dialog>
    </div>
  );
}
