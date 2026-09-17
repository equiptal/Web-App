"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { useSession } from "@/lib/session";
import { listProjects, listTemplates, fetchTemplateTerms } from "@/lib/api/client";
import { namedIcons, iconForName, type NamedIcon } from "@/lib/contract/taxonomy-icons";
import type { TaxonomyNode } from "@/lib/contract/stores";
import { projectTitle } from "@/lib/contract/project";
import type { ProjectSummary } from "@/lib/contract/project";
import type { TemplateOption } from "@/lib/contract/project-apply";
import { pin } from "@/lib/uiPins";

/**
 * The renter's past requests, in a rail beside the intake (owner, 2026-09-16, handing over
 * `prototypes/intake-side-panel-v1.html`).
 *
 * *"can we remove the pills and show a side panel of his requests like his previous chats, grouped
 * by a project - show only equipment names on the request"*, then *"add equipment image or icon with
 * the unit before the name like this 2 [ICON] EXCAVATOR 20 TON"*.
 *
 * ── The behaviour is the OLD one, unchanged ─────────────────────────────────────────────────────
 * 🔴 Owner, 2026-09-16, when the first cut matched a template by NAME: *"what do u mean? the
 * behaviour will not change from existing pills just ui"*. So the rows ARE the templates —
 * `listTemplates`, the same list the chip's «start from» dropdown read — and a press hands
 * `fetchTemplateTerms` the option's own `itemId`. Nothing is matched, so nothing can miss.
 *
 * ⚠️ **The PICTURE is the only part that is looked up, and so the only part that can fail.** A
 * template carries no image and no taxonomy ids — only `ChartItem.label`, the machine run into one
 * string — so the drawing comes from the app taxonomy TREE, matched on that name
 * (`iconForName`). Owner, 2026-09-17: *"use the taxonamy image not this fallback icon"*.
 *
 * 🔴 ~~Matched against his own requests by name.~~ It missed nearly every time, which is why he was
 * seeing the glyph: `itemName` joins the subtype and the size with a middot while the chart runs the
 * category in front of both, so the two strings are never equal. The tree is matched by token
 * containment instead, and it also covers a WORK ORDER, which has no request to borrow a picture
 * from.
 */

/** One row: a machine already requested or ordered at this project. */
export interface RailRow {
  /** The template's own machine id — what `fetchTemplateTerms` is keyed on. */
  itemId: string;
  option: TemplateOption;
  name: string;
  qty: number;
  /** The catalogue's flat DRAWING for this machine, or null when it has none. */
  imageUrl: string | null;
}

const RAIL_MIN = 164;
const RAIL_MAX = 380;
const RAIL_DEFAULT = 208;
const RAIL_KEY = "moedatech.intakeRailWidth";

/**
 * Is this a MACHINE's name, or the placeholder standing where one should be?
 *
 * 🔴 A template's `machine` is `ChartItem.label`, genuinely absent for an off-catalogue line, and the
 * row falls back to the request's REFERENCE so it is still recognisable and pressable. That
 * reference must never be typed into the box: it is the «12 × null» bug of 2026-09-12 in a different
 * costume — a value that is a label at one end and a machine's name by the time it reaches the agent.
 */
const typable = (name: string | null | undefined) => {
  const n = (name ?? "").trim();
  return n.length > 0 && n !== "—" && n !== "-";
};

/**
 * Everything both surfaces need: the rail on the left, and the chip row on the box's floor.
 *
 * ⚠️ ONE hook, called once by `Intake` and handed to both. Two copies of this state would mean two
 * fetches and, worse, two answers to «which machine is chosen» — and they would disagree the first
 * time either was pressed.
 */
export function useRequestRail() {
  const { state, actions } = useRfq();
  const { user } = useSession();

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  /** The catalogue's drawings, by name. Pictures only; nothing branches on it. */
  const [named, setNamed] = useState<NamedIcon[]>([]);
  const [tpls, setTpls] = useState<Map<string, RailRow[]>>(new Map());
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosen = state.project ?? null;

  /* The projects, and the pictures, at once. A failure on either renders the rail away rather than
     an error: he came here to write a request, not to be told a side panel could not load. */
  useEffect(() => {
    if (!user) return;
    let live = true;
    listProjects()
      .then((ps) => {
        if (live) setProjects(ps);
      })
      .catch(() => {
        if (live) setProjects([]);
      });
    /* The APP backend's tree, for its drawings alone — the agents taxonomy the store already holds
       carries a photograph on 1 row of 413, and this one carries the flat icon on 92 of 412. The
       browse filters fetch the same thing, so it is cheap and it works signed out. */
    fetch("/api/stores/taxonomy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { taxonomy: TaxonomyNode[] }) => {
        if (live) setNamed(namedIcons(d.taxonomy ?? []));
      })
      .catch(() => {
        /* No drawings, and every row falls back to its glyph. The rail still works. */
      });
    return () => {
      live = false;
    };
  }, [user]);

  /**
   * One project's machines, fetched the first time they are wanted.
   *
   * ⚠️ Lazily, and cached. `listTemplates` is a `fetchChart` per project, so loading all of them on
   * mount would put one request per project in front of the first screen a renter meets — for a list
   * most of which he will never open.
   */
  const load = useCallback(
    async (projectId: string) => {
      if (tpls.has(projectId) || loading.has(projectId)) return;
      setLoading((s) => new Set(s).add(projectId));
      try {
        const options = await listTemplates(projectId);
        setTpls((m) => {
          const next = new Map(m);
          next.set(
            projectId,
            options.map((o) => {
              const name = o.machine?.trim() || o.ref;
              return {
                itemId: o.itemId,
                option: o,
                name,
                qty: o.quantity,
                /* The catalogue's own drawing for this machine. `null` when the tree has none, and
                   the row draws its glyph — never a photograph, because this tree carries icons. */
                imageUrl: iconForName(named, name),
              };
            }),
          );
          return next;
        });
      } catch {
        // An empty list rather than an error: the project still lists and can still be chosen.
        setTpls((m) => new Map(m).set(projectId, []));
      } finally {
        setLoading((s) => {
          const next = new Set(s);
          next.delete(projectId);
          return next;
        });
      }
    },
    [tpls, loading, named],
  );

  /* The chosen project's machines are what the FLOOR draws, so they are wanted whether or not its
     group was ever opened in the rail. */
  useEffect(() => {
    if (chosen?.id) void load(chosen.id);
  }, [chosen?.id, load]);

  /* Cleared from the floor, so the rail has to hear about it. */
  useEffect(() => {
    if (!chosen) setPicked(null);
  }, [chosen]);

  /** Mansour writes the machine into the box, a character at a time. Lifted from `ProjectChips`. */
  const typeInto = useCallback(
    async (before: string, line: string) => {
      const base = before ? `${before}\n` : "";
      actions.setAgentTyping(true);
      try {
        for (let i = 1; i <= line.length; i++) {
          actions.setText(base + line.slice(0, i));
          // A typewriter is sequential by definition; this await is the point of the loop.
          await new Promise((r) => setTimeout(r, 14));
        }
        actions.markProjectTyped(line);
        // He stays a beat, reading it back: «Grader» is six characters and would otherwise flash.
        await new Promise((r) => setTimeout(r, 900));
      } finally {
        actions.setAgentTyping(false);
      }
    },
    [actions],
  );

  const pressProject = useCallback(
    (p: ProjectSummary) => {
      actions.selectProject(p);
      setPicked(null);
      void load(p.id);
    },
    [actions, load],
  );

  /**
   * A machine press — `ProjectChips.applyTemplate`, moved and not rewritten.
   *
   * The terms apply even when the machine has no NAME (they are keyed on the item, not on what it is
   * called); only the sentence is withheld, because there is nothing to put in it.
   */
  const pressRow = useCallback(
    async (projectId: string, row: RailRow) => {
      if (busy) return;
      setBusy(true);
      setPicked(row.itemId);
      /* ⚠️ The ID, not the project. The rail hands it a full `ProjectSummary`; the FLOOR hands it
         the one already on the draft, which the store keeps in a narrower shape. Only the id is
         needed - selecting is `pressProject`'s job, and the floor only draws once that has run. */
      const full = projects?.find((x) => x.id === projectId);
      if (full && state.project?.id !== projectId) actions.selectProject(full);
      try {
        const terms = await fetchTemplateTerms(projectId, row.option);
        actions.useTemplate(terms, row.option.kind === "work_order" ? row.option.id : null, row.option.when);
        const machine = row.option.machine?.trim() ?? "";
        if (typable(machine)) {
          await typeInto(state.text.trimEnd(), `${row.qty > 1 ? `${row.qty} × ` : ""}${machine}`);
        }
      } catch {
        /* A template is a shortcut; failing to take one leaves him with a chosen project and a
           working request form, which is where he already was. */
      } finally {
        setBusy(false);
      }
    },
    [busy, projects, state.project?.id, state.text, actions, typeInto],
  );

  const toggle = useCallback(
    (projectId: string) => {
      setOpen((s) => {
        const next = new Set(s);
        if (next.has(projectId)) next.delete(projectId);
        else {
          next.add(projectId);
          void load(projectId);
        }
        return next;
      });
    },
    [load],
  );

  const clear = useCallback(() => {
    setPicked(null);
    actions.clearProject();
  }, [actions]);

  const rowsOf = useCallback((projectId: string) => tpls.get(projectId) ?? [], [tpls]);

  return useMemo(
    () => ({
      /** Withheld entirely for a guest, and for a renter with no projects. */
      shown: !!user && !!projects?.length,
      projects: projects ?? [],
      chosen,
      picked,
      busy,
      rowsOf,
      isOpen: (id: string) => open.has(id),
      isLoading: (id: string) => loading.has(id),
      toggle,
      pressProject,
      pressRow,
      clear,
    }),
    [user, projects, chosen, picked, busy, rowsOf, open, loading, toggle, pressProject, pressRow, clear],
  );
}

export type RequestRail = ReturnType<typeof useRequestRail>;

/* ── The rail ──────────────────────────────────────────────────────────────────────────────────── */

export function RequestsRail({ rail }: { rail: RequestRail }) {
  const t = useT();
  const [width, setWidth] = useState<number>(RAIL_DEFAULT);
  /**
   * The panel on a phone, the way Claude and ChatGPT draw theirs (owner, 2026-09-16: *"make it like
   * claude or gpt it opend the pannel through --- in mobile"*).
   *
   * 🔴 This REPLACES a bare `hidden lg:flex`, and it closes a hole the first cut left open: with the
   * rail hidden below `lg` and the chip strip deleted, a phone renter had no way to pick a project at
   * all. Behind a toggle he has both.
   */
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    try {
      const saved = parseFloat(window.localStorage.getItem(RAIL_KEY) || "");
      if (Number.isFinite(saved)) setWidth(Math.max(RAIL_MIN, Math.min(RAIL_MAX, saved)));
    } catch {
      /* a private window: the default stands */
    }
  }, []);

  // Escape closes the sheet. A layer over the page with no way out is a trap.
  useEffect(() => {
    if (!sheet) return;
    const away = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(false);
    };
    window.addEventListener("keydown", away);
    return () => window.removeEventListener("keydown", away);
  }, [sheet]);

  const drag = useRef<{ x: number; w: number } | null>(null);
  const clamp = (px: number) => Math.max(RAIL_MIN, Math.min(RAIL_MAX, Math.round(px)));

  if (!rail.shown) return null;

  const list = (
    <>
      <div className="flex items-baseline gap-1.5 px-3 pb-1.5 pt-3.5">
        {/* A quiet CAPTION, not a title: it names the list for a first-time reader and then gets out
            of the way, which is the whole argument of a rail like this one. */}
        <span className="min-w-0 flex-1 truncate text-label font-semibold tracking-[.02em] text-muted">
          {t.intake.rail.title}
        </span>
        <span className="flex-none text-label text-muted-light">{rail.projects.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-4">
        {rail.projects.map((p) => {
          const open = rail.isOpen(p.id) || rail.chosen?.id === p.id;
          const rows = rail.rowsOf(p.id);
          const on = rail.chosen?.id === p.id && !rail.picked;
          return (
            <div key={p.id} className="mb-0.5">
              <button
                {...pin("intake-rail-group")}
                type="button"
                onClick={() => rail.pressProject(p)}
                className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-start transition ${
                  on ? "bg-brand-soft" : "hover:bg-surface2"
                }`}
              >
                {/* The chevron collapses; the head itself SELECTS. Two jobs on one row, and the
                    smaller target is the one that only changes what is visible. */}
                <span
                  role="presentation"
                  onClick={(e) => {
                    e.stopPropagation();
                    rail.toggle(p.id);
                  }}
                  className="flex-none text-muted-light"
                >
                  <Icon
                    name="expand_more"
                    size={15}
                    className={`transition-transform ${open ? "" : "-rotate-90 rtl:rotate-90"}`}
                  />
                </span>
                <span className={`min-w-0 flex-1 truncate text-meta font-semibold ${on ? "text-brand-deep" : "text-navy"}`}>
                  {projectTitle(p)}
                </span>
                {rows.length > 0 && (
                  <span className="flex-none text-label font-semibold text-muted-light">{rows.length}</span>
                )}
              </button>

              {open && (
                <div className="pb-1.5 pt-0.5">
                  {rail.isLoading(p.id) && <p className="px-6 py-1 text-label text-muted-light">{t.browse.loading}</p>}
                  {rows.map((row) => (
                    <RailRowButton
                      key={row.itemId}
                      row={row}
                      on={rail.picked === row.itemId}
                      busy={rail.busy}
                      onPress={() => {
                        void rail.pressRow(p.id, row);
                        setSheet(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {/* ── The phone toggle ─────────────────────────────────────────────────────────────────────
          A 26px control, the floor's own height. It exists only below `lg`, where the rail is not
          standing beside the column. */}
      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-label={t.intake.rail.title}
        title={t.intake.rail.title}
        className="mb-3 grid h-[26px] w-[26px] place-items-center rounded-full text-navy-mid transition hover:bg-surface2 hover:text-brand lg:hidden"
      >
        <Icon name="menu" size={18} />
      </button>

      {/* The rail proper: a column beside the box from `lg` up, a sheet over the page below it. */}
      <aside
        {...pin("intake-rail")}
        style={sheet ? undefined : { width }}
        className={`relative flex-none flex-col border-e border-border bg-surface ${
          sheet ? "fixed inset-y-0 start-0 z-50 flex w-[280px] max-w-[85vw]" : "hidden lg:flex"
        }`}
      >
        {sheet && (
          <button
            type="button"
            onClick={() => setSheet(false)}
            aria-label={t.common.close}
            className="absolute end-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-navy lg:hidden"
          >
            <Icon name="close" size={15} />
          </button>
        )}
        {list}

        {!sheet && (
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label={t.intake.rail.resize}
            title={t.intake.rail.resize}
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, w: width };
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              /* ⚠️ **The delta's sign flips in Arabic.** The grip is on the rail's TRAILING edge,
                 which is the LEFT one under `dir="rtl"`, so dragging towards the page widens in one
                 direction and narrows in the other. Reading the direction off the document rather
                 than off the pointer is what keeps one gesture meaning one thing. */
              const rtl = document.documentElement.dir === "rtl";
              const moved = e.clientX - drag.current.x;
              setWidth(clamp(drag.current.w + (rtl ? -moved : moved)));
            }}
            onPointerUp={() => {
              if (!drag.current) return;
              drag.current = null;
              try {
                window.localStorage.setItem(RAIL_KEY, String(width));
              } catch {
                /* a private window: the size holds for this visit and no longer */
              }
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(e) => {
              const rtl = document.documentElement.dir === "rtl";
              // 16px a tap, so a few of them cross the range rather than forty.
              if (e.key === "ArrowRight") setWidth((w) => clamp(w + (rtl ? -16 : 16)));
              else if (e.key === "ArrowLeft") setWidth((w) => clamp(w + (rtl ? 16 : -16)));
              else if (e.key === "Home") setWidth(RAIL_DEFAULT);
              else return;
              e.preventDefault();
            }}
            className="group absolute inset-y-0 -end-[3px] z-[2] w-[7px] cursor-col-resize touch-none border-0 bg-transparent p-0"
          >
            {/* 7px of hit area over a 1px line: the line is what the eye aims at, and 1px is not a
                target. */}
            <span className="absolute inset-y-0 end-[3px] w-px bg-transparent transition-colors group-hover:bg-brand group-focus-visible:bg-brand" />
          </button>
        )}
      </aside>

      {/* The scrim belongs to the sheet and never to the column. */}
      {sheet && (
        <div role="presentation" onClick={() => setSheet(false)} className="fixed inset-0 z-40 bg-black/25 lg:hidden" />
      )}
    </>
  );
}

function RailRowButton({ row, on, busy, onPress }: { row: RailRow; on: boolean; busy: boolean; onPress: () => void }) {
  return (
    <button
      {...pin("intake-rail-row")}
      type="button"
      disabled={busy}
      onClick={onPress}
      className={`flex w-full items-center gap-2 rounded-md py-1 pe-1.5 ps-6 text-start transition disabled:cursor-not-allowed ${
        on ? "bg-brand-soft" : "hover:bg-surface2"
      }`}
    >
      {/* ⚠️ The COUNT leads, then the picture, then the name (owner, 2026-09-16: *"add equipment
          image or icon with the unit before the name like this 2 [ICON] EXCAVATOR 20 TON"*, then
          *"put the unit 2 x icon . equipment name"*). Drawn only above one: «1 ×» on every row of a
          list where one is the ordinary case is noise with a multiplication sign in front of it. */}
      {row.qty > 1 && (
        <span className="flex-none text-label font-semibold tabular-nums text-navy">{row.qty} ×</span>
      )}
      <MachineArt url={row.imageUrl} />
      <span className={`min-w-0 flex-1 truncate text-label ${on ? "font-semibold text-brand-deep" : "text-muted"}`}>
        {row.name}
      </span>
    </button>
  );
}

/* ── The floor: the chosen project, then its machines ─────────────────────────────────────────── */

/**
 * Owner, 2026-09-16: *"the row of project chips on the floor - but i want it on a project selection
 * to appear"*.
 *
 * Nothing until a project is picked; from then on the project's own chip with its ✕, and a chip per
 * machine filed under it, so he can move between them without going back to the rail. The skins are
 * `ProjectChips`'s own, so the row reads as the object he has been pressing for a fortnight.
 */
export function ProjectFloorChips({ rail }: { rail: RequestRail }) {
  const t = useT();
  const project = rail.chosen;
  if (!project) return null;
  const rows = rail.rowsOf(project.id);
  const one = rows.find((r) => r.itemId === rail.picked) ?? null;

  const clear = (
    <button
      type="button"
      onClick={rail.clear}
      aria-label={t.common.close}
      className="grid h-4 w-4 flex-none place-items-center rounded-full text-muted transition hover:bg-surface hover:text-navy"
    >
      <Icon name="close" size={11} />
    </button>
  );

  /* ── A machine is chosen: ONE pill, and nothing else on the row ────────────────────────────────
     Owner, 2026-09-17: *"clicking on a request in the project will show one single pill show the
     project-request equipment"*. The chips are how he CHOOSES; the pill is what he has chosen, and
     leaving the rest of them beside it would make the row say the question and the answer at once.
     The way back to the others is the rail, or the ✕. */
  if (one) {
    return (
      <div {...pin("intake-pick-pill")} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-brand bg-brand-soft py-1 pe-1.5 ps-3 text-label font-semibold text-navy">
          <Icon name="place" size={13} className="flex-none text-brand" />
          <span className="min-w-0 truncate">
            {projectTitle(project)}
            <span className="px-1 font-normal text-muted-light">·</span>
            {one.qty > 1 ? `${one.qty} × ` : ""}
            {one.name}
          </span>
          {clear}
        </span>
      </div>
    );
  }

  /* ── Only a project so far: its chip, then the machines filed under it ─────────────────────────
     Owner, 2026-09-16: *"the row of project chips on the floor - but i want it on a project
     selection to appear"*. The skins are `ProjectChips`s own, so the row reads as the object he has
     been pressing for a fortnight. */
  return (
    <div {...pin("intake-pick-pill")} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <span className="flex min-w-0 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-brand bg-brand-soft py-1 pe-1.5 ps-3 text-label font-semibold text-navy">
        <Icon name="place" size={13} className="flex-none text-brand" />
        <span className="min-w-0 truncate">{projectTitle(project)}</span>
        {clear}
      </span>

      {rows.map((row) => (
        <button
          key={row.itemId}
          type="button"
          disabled={rail.busy}
          onClick={() => void rail.pressRow(project.id, row)}
          /* Outlined, never filled: the filled skin is what the CHOSEN thing wears, and once one of
             these is chosen this row is replaced by its pill anyway. */
          className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-brand/45 bg-surface px-3 py-1 text-label font-semibold text-brand-deep transition hover:border-brand hover:bg-brand-soft disabled:cursor-not-allowed"
        >
          {row.qty > 1 && <span className="tabular-nums">{row.qty} ×</span>}
          <MachineArt url={row.imageUrl} />
          <span className="max-w-[160px] truncate">{row.name}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The machine's picture, at 18px.
 *
 * ⚠️ **One kind of asset, so one fit.** This is the app taxonomy's flat DRAWING, which carries its
 * own transparent margin — so it is `object-contain` scaled to the tile, never `object-cover`:
 * cropping a drawing enlarges the margin rather than the machine. 1.34 is the request rail's own
 * number, and it is arithmetic: `contain` draws a 1.34:1 picture 18 × 13.4 in an 18px box.
 * ~~`isPhoto`.~~ It came from `my-requests`, which this no longer reads.
 *
 * ⚠️ `onError` is load-bearing, not defensive: the taxonomy's objects are not public-read on
 * staging, so a well-formed URL answers 403 and an `<img>` absorbs that as «no artwork» — drawing a
 * broken-image glyph, which is worse than the icon it replaces.
 */
function MachineArt({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <Icon name="precision_manufacturing" size={14} className="flex-none text-muted-light" />;
  }
  return (
    <span className="grid h-[18px] w-[18px] flex-none place-items-center overflow-hidden rounded-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className="h-full w-full scale-[1.34] object-contain"
      />
    </span>
  );
}
