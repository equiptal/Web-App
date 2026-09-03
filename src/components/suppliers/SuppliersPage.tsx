"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { fmt, useT } from "@/lib/i18n";
import { btn, cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { VendorMark } from "@/components/VendorMark";
import { MoedatechBadge } from "@/components/MoedatechBadge";
import { ApiError, deleteSupplierGroup, listRenterSuppliers, renameSupplierGroup, updateRenterSupplier } from "@/lib/api/client";
import { AddSuppliersDialog } from "./AddSuppliersDialog";
import { AddFromMoedatechDialog } from "./AddFromMoedatechDialog";
import { DeleteGroupDialog, GroupsMenu, NameGroupDialog, RenameGroupDialog } from "./SupplierGroups";
import { SupplierProfileDialog } from "./SupplierProfileDialog";
import { SupplierBidsDialog } from "./SupplierBidsDialog";
import { EditSupplierDialog } from "./EditSupplierDialog";
import { InviteSupplierDialog } from "./InviteSupplierDialog";
import { SuggestedBand } from "./SuggestedBand";
import { ShareRequestModal } from "@/components/share/ShareRequestModal";
import {
  activeFilterCount,
  NO_FILTERS,
  passesFilters,
  SupplierFilters,
  type SupplierFilterState,
} from "./SupplierFilters";
import { hasUnseenBid, loadSeen, markSeen } from "@/lib/supplierSeen";
import {
  bidCount,
  canBeEmailed,
  isOnMoedatech,
  groupsOf,
  groupsWithCounts,
  hasUnparsed,
  type RenterSupplier,
} from "@/lib/contract/renter-suppliers";

/**
 * SUP-T13 — the renter's own supplier list.
 *
 * Six columns, and each answers one question a renter actually asks: who are they, is this a firm I
 * have registered, how do I reach them, which group are they in, what have they bid. Everything
 * heavier — the profile, the bid list, the papers — opens from here and is not here.
 *
 * ── One filled badge on the screen ───────────────────────────────────────────────────────────────
 *
 * The prototype went through a version where the source, the flag, the groups and the bids were all
 * pills, and nothing read as important because everything did. So: the flag is a control, the groups
 * are text, the bid counts are text, and the only filled marks left are "On Moedatech" (a fact about
 * the firm) and the NEW badge that has not shipped yet. When it arrives it will be the one thing on
 * the row that moves.
 *
 * ── Nothing here assumes a contact exists ────────────────────────────────────────────────────────
 *
 * Whether a `platform` row carries the supplier's own email and phone is provisional and switched
 * server-side (SUP-BE-20). So the cell renders from what arrived: an address, or *not set · add*.
 * Turning that switch off must cost this screen nothing.
 *
 * ── On the dashboard, not behind a tab (owner, 2026-09-01) ──────────────────────────────────────
 *
 * `embedded` renders this under the projects surface on the renter's home, and the nav tab is gone.
 * A renter asks "who do I send this to" while he is looking at the work that needs sending — not
 * after remembering a tab exists. Standalone `/suppliers` stays for a direct link and for the
 * dialogs to have a page of their own.
 */
export function SuppliersPage({ embedded }: { embedded?: boolean } = {}) {
  const t = useT();
  const c = t.suppliers;

  const [rows, setRows] = useState<RenterSupplier[] | null>(null);
  const [q, setQ] = useState("");
  const [pill, setPill] = useState<"all" | "vendor">("all");
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingFromApp, setAddingFromApp] = useState(false);

  /* Groups. `picking` is the only mode that shows checkboxes — a column of empty boxes on every row
     implies bulk work this screen does not do, so it appears when a group is being made and goes
     when it is done. */
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  /* Two doors, two jobs: the row opens the record, the bid count opens the route out to the request.
     Never both at once — a dialog stacked on a dialog has two ways to close and neither is obvious. */
  const [profileId, setProfileId] = useState<string | null>(null);
  const [bidsId, setBidsId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RenterSupplier | null>(null);
  const [inviting, setInviting] = useState<RenterSupplier | null>(null);
  /* The finer cuts, behind one button — the everyday split stays on the two pills beside it. */
  const [filters, setFilters] = useState<SupplierFilterState>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Whom a share is being composed for. Empty means «whoever is picked in the dialog». */
  const [sharingWith, setSharingWith] = useState<RenterSupplier[] | null>(null);
  /* When THIS person last opened each row. Local by design — see `supplierSeen.ts`. */
  const [seen, setSeen] = useState<Record<string, string>>({});

  useEffect(() => {
    setSeen(loadSeen());
  }, []);

  const load = useCallback(() => {
    listRenterSuppliers().then(setRows);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const vendors = useMemo(() => (rows ?? []).filter((s) => s.vendorRegistered).length, [rows]);
  const groups = useMemo(() => groupsWithCounts(rows ?? []), [rows]);
  const pickedRows = useMemo(() => (rows ?? []).filter((s) => picked[s.id]), [rows, picked]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((s) => {
      if (pill === "vendor" && !s.vendorRegistered) return false;
      if (groupFilter && !groupsOf(s).includes(groupFilter)) return false;
      if (!passesFilters(s, filters)) return false;
      if (!needle) return true;
      // Everything a renter might half-remember: the firm, the person, either way of reaching them.
      return [s.name, s.contactName, s.email, s.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, pill, groupFilter, filters]);

  /**
   * The flag flips on click and the request follows.
   *
   * It is the renter's own label on his own row — nothing else on the screen depends on it, and a
   * spinner on a checkbox teaches him to wait for something that has no reason to take time. On
   * failure it goes back and says so, because a flag that silently did not save is worse than one
   * that refused.
   */
  const toggleVendor = async (row: RenterSupplier) => {
    const next = !row.vendorRegistered;
    setRows((list) => (list ?? []).map((s) => (s.id === row.id ? { ...s, vendorRegistered: next } : s)));
    setToast(fmt(next ? c.vendorOn : c.vendorOff, { name: row.name }));
    try {
      await updateRenterSupplier(row.id, { vendorRegistered: next });
    } catch (err) {
      setRows((list) => (list ?? []).map((s) => (s.id === row.id ? { ...s, vendorRegistered: !next } : s)));
      /**
       * Say WHY, when the backend said why.
       *
       * `MISSING_CONTACT` is the one a renter actually meets: a supplier must keep an e-mail or a
       * phone, and **every row linked from the directory has neither** — the account's own details are
       * not returned yet (SUP-BE-20). So the rule refuses an edit to a row whose contact the backend
       * is itself withholding, and the renter reads a flat "that did not save" against a flag that has
       * nothing to do with it (found in UAT, 2026-09-02).
       *
       * Until that ticket lands, the honest answer is the one that tells him what to do: add a way to
       * reach them, then the flag will save.
       */
      const code = err instanceof ApiError ? err.backendCode : undefined;
      setToast(code === "MISSING_CONTACT" ? fmt(c.vendorNeedsContact, { name: row.name }) : c.vendorFailed);
    }
  };

  /** Assigning a group is a write per row: a label lives on the supplier, not in a table of its own. */
  const saveGroup = async (name: string) => {
    const members = pickedRows;
    try {
      await Promise.all(
        members.map((s) => updateRenterSupplier(s.id, { groups: [...new Set([...groupsOf(s), name])] })),
      );
      setToast(fmt(c.groupCreated, { name, n: members.length }));
    } catch {
      setToast(c.groupFailed);
    }
    setNaming(false);
    setPicking(false);
    setPicked({});
    load();
  };

  const doRename = async (from: string, to: string) => {
    setRenaming(null);
    try {
      await renameSupplierGroup(from, to);
      if (groupFilter === from) setGroupFilter(to);
      setToast(fmt(c.groupRenamed, { name: to }));
    } catch {
      setToast(c.groupFailed);
    }
    load();
  };

  const doDelete = async (name: string) => {
    setDeleting(null);
    try {
      await deleteSupplierGroup(name);
      if (groupFilter === name) setGroupFilter("");
      setToast(c.groupDeleted);
    } catch {
      setToast(c.groupFailed);
    }
    load();
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <div className={embedded ? "flex flex-col gap-3 pb-24" : "mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 xl:px-8"}>
      <header className={cx("flex flex-wrap items-center gap-3", !embedded && "mb-3")}>
        <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-sm bg-navy text-surface">
          <Icon name="groups" size={22} />
        </span>
        <div className="min-w-0">
          {/* One heading level down inside the dashboard — the page already has an h1 above it. */}
          {embedded ? (
            <h2 className="text-title font-extrabold tracking-tight text-navy">{c.title}</h2>
          ) : (
            <h1 className="text-title font-extrabold tracking-tight text-navy">{c.title}</h1>
          )}
          {/* The count is INSIDE the sentence, not beside it (owner, 2026-09-02: *"the 3 is
              duplicated"*). `summaryMany` is «{n} suppliers» and already carries the figure, so the
              bold number in front of it printed «3 3 suppliers». */}
          <p className="mt-0.5 text-meta text-muted">
            {(rows?.length ?? 0) === 1 ? fmt(c.summaryOne, { n: 1 }) : fmt(c.summaryMany, { n: rows?.length ?? 0 })}
            {vendors > 0 && <> · {fmt(c.vendors, { n: vendors })}</>}
          </p>
        </div>
        {/* Two buttons, as the prototype has them. **Both say ADD; only the source differs, which is
            the whole difference between them** — one makes a row linked to a Moedatech account, the
            other a row that is the renter's own. The directory leads because its rows are the linked
            ones.

            ~~A third «Import a list» button.~~ Uploading a sheet is not a third source, it is another
            way to type the same rows, so it lives inside *Add my own suppliers* — under an `or` rule,
            exactly where the prototype puts it. */}
        {/* ── Two doors, equally weighted (owner, 2026-09-03) ────────────────────────────────────
            *"Make both buttons orange, call it add my suppliers, and use representative icons for
            both."*

            ~~One primary and one tinted.~~ The tinted one read as the lesser option, and it is not:
            a renter with forty firms of his own uses it far more than the directory. They are two
            SOURCES for one act, so they carry one weight and are told apart by their icons and their
            words rather than by their loudness.

            `storefront` for Moedatech, because that is what he is picking from, a directory of firms
            that already have an account here. `contacts` for his own, because that is what his list
            is, and it distinguishes «people I already have» from «a firm I am looking up». */}
        <span className="ms-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAddingFromApp(true)} className={btn("primary", "md")}>
            <Icon name="storefront" size={15} />
            {c.addFromApp}
          </button>
          <button type="button" onClick={() => setAdding(true)} className={btn("primary", "md")}>
            <Icon name="contacts" size={15} />
            {c.addSupplier}
          </button>
        </span>
      </header>

      <SuggestedBand
        onAdded={(m) => {
          setToast(m);
          load();
        }}
      />

      <div {...pin("suppliers-list")} className="rounded-md border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <span className="flex h-[30px] min-w-[250px] items-center gap-2 rounded-md border border-border bg-surface2 px-2.5">
            <Icon name="search" size={15} className="text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={c.search}
              className="w-full bg-transparent text-meta font-semibold text-navy outline-none placeholder:text-muted"
            />
          </span>
          <Pill on={pill === "all"} onClick={() => setPill("all")} label={c.all} n={rows?.length ?? 0} />
          <Pill on={pill === "vendor"} onClick={() => setPill("vendor")} label={c.registeredVendors} n={vendors} mark />

          <span className="ms-auto flex items-center gap-2">
            {/* ── Share a request, from HERE as well as from the request ──────────────────────────
                Both doors exist in the prototype on purpose, and its own note says why: *"pick the
                suppliers first, or pick the request first. Both write the same record, so either way
                it lands under «What you sent them» and on the request itself."*

                A renter on this screen is thinking about people; a renter on a request is thinking
                about a job. Making him navigate to the other one first is making him translate.

                It sits WITH the groups menu and the filters (owner, 2026-09-02). Everything on the
                trailing side acts on the list in front of him: narrow it, group it, send it a
                request. The search box and the two count pills on the leading side describe what he
                is looking at. Alone in the middle, this was the one control belonging to neither. */}
            <button
              type="button"
              onClick={() => setSharingWith([])}
              disabled={!rows?.length}
              className={cx(btn("secondary", "sm"), "flex-none")}
            >
              <Icon name="share" size={14} />
              {c.shareARequest}
            </button>

            <GroupsMenu
              groups={groups}
              active={groupFilter}
              open={menuOpen}
              total={rows?.length ?? 0}
              onOpen={setMenuOpen}
              onPick={(g) => {
                setGroupFilter(g);
                setMenuOpen(false);
              }}
              onRename={(g) => {
                setMenuOpen(false);
                setRenaming(g);
              }}
              onDelete={(g) => {
                setMenuOpen(false);
                setDeleting(g);
              }}
              onCreate={() => {
                setMenuOpen(false);
                setPicked({});
                setPicking(true);
              }}
            />

            {/* One button for everything finer, carrying a count so a renter can see the list is
                narrowed without opening it — which is the failure a hidden filter causes. */}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={cx(btn("secondary", "sm"), "flex-none")}
            >
              <Icon name="tune" size={14} />
              {c.filters}
              {activeFilterCount(filters, groupFilter) > 0 && (
                <span className="ms-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-label font-extrabold text-brand-fg">
                  {activeFilterCount(filters, groupFilter)}
                </span>
              )}
            </button>
          </span>
        </div>

        {/* Only while a group is being made. Pick, then name — a group with no members does not exist. */}
        {picking && (
          <div className="flex flex-wrap items-center gap-2.5 bg-navy px-3 py-2.5 text-meta font-extrabold text-surface">
            <Icon name="label" size={15} />
            <span>{pickedRows.length ? fmt(c.nSelectedFor, { n: pickedRows.length }) : c.pickMembers}</span>
            <span className="ms-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPicking(false);
                  setPicked({});
                }}
                className="text-surface/75 transition hover:text-surface"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={!pickedRows.length}
                onClick={() => setNaming(true)}
                className={btn("primary", "sm")}
              >
                {c.nameGroup}
              </button>
            </span>
          </div>
        )}

        {rows === null ? (
          <p className="p-8 text-center text-meta text-muted">{c.loading}</p>
        ) : visible.length === 0 ? (
          <Empty filtered={rows.length > 0} c={c} />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {picking && (
                  <th className="w-[34px] border-b border-border bg-surface2 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={c.pickMembers}
                      checked={visible.length > 0 && visible.every((s) => picked[s.id])}
                      onChange={(e) =>
                        setPicked((p) => {
                          const next = { ...p };
                          visible.forEach((s) => (e.target.checked ? (next[s.id] = true) : delete next[s.id]));
                          return next;
                        })
                      }
                      className="h-3.5 w-3.5 accent-brand"
                    />
                  </th>
                )}
                {[c.colSupplier, c.colVendor, c.colPhone, c.colEmail, c.colGroups, c.colBids, ""].map((h, hi) => (
                  <th
                    key={h || hi}
                    className="border-b border-border bg-surface2 px-3 py-2 text-start text-label font-extrabold uppercase tracking-wide text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <Row
                  key={s.id}
                  s={s}
                  c={c}
                  onToggle={() => toggleVendor(s)}
                  picking={picking}
                  picked={!!picked[s.id]}
                  onPick={(on) =>
                    setPicked((p) => {
                      const next = { ...p };
                      if (on) next[s.id] = true;
                      else delete next[s.id];
                      return next;
                    })
                  }
                  onOpen={() => {
                    setProfileId(s.id);
                    setSeen(markSeen(s.id));
                  }}
                  onOpenBids={() => {
                    setBidsId(s.id);
                    setSeen(markSeen(s.id));
                  }}
                  seenAt={seen[s.id]}
                  onEdit={() => setEditing(s)}
                  onInvite={() => setInviting(s)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddFromMoedatechDialog
        open={addingFromApp}
        onClose={() => setAddingFromApp(false)}
        onDone={(msg) => {
          setAddingFromApp(false);
          setToast(msg);
          load();
        }}
      />

      {/* Typed rows, or an uploaded sheet reached from inside them. `msg` is the import's own count —
          typed rows have nothing to count that the list below does not already show. */}
      <AddSuppliersDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(msg) => {
          load();
          setToast(msg ?? c.added);
        }}
      />

      <InviteSupplierDialog supplier={inviting} onClose={() => setInviting(null)} />

      <SupplierFilters
        open={filtersOpen}
        rows={rows ?? []}
        value={filters}
        onChange={setFilters}
        onClearGroup={() => setGroupFilter("")}
        onClose={() => setFiltersOpen(false)}
      />

      {/* The same panel the review screen carries, in the shell this screen needs (owner,
          2026-09-02: *"on any share option for a request it will open for them modal in the same
          style"*). Nothing about the share lives here, so this door cannot drift from that one. */}
      <ShareRequestModal
        open={sharingWith !== null}
        preselect={(sharingWith ?? []).map((s) => s.id)}
        onClose={() => setSharingWith(null)}
        onShared={(n) => {
          setToast(n === 1 ? c.sharedOne : fmt(c.sharedMany, { n }));
          load();
        }}
      />

      <EditSupplierDialog
        key={editing?.id ?? "none"}
        supplier={editing}
        allGroups={groups.map((g) => g.name)}
        onClose={() => setEditing(null)}
        onSaved={(m) => {
          setToast(m);
          load();
        }}
      />

      <SupplierProfileDialog
        id={profileId}
        onClose={() => setProfileId(null)}
        onInvite={() => {
          const row = (rows ?? []).find((x) => x.id === profileId);
          setProfileId(null);
          if (row) setInviting(row);
        }}
        onOpenBids={(x) => {
          setProfileId(null);
          setBidsId(x);
        }}
      />
      <SupplierBidsDialog
        id={bidsId}
        onClose={() => setBidsId(null)}
        onProfile={(x) => {
          setBidsId(null);
          setProfileId(x);
        }}
      />

      <NameGroupDialog open={naming} members={pickedRows} onClose={() => setNaming(false)} onSave={saveGroup} />
      {renaming !== null && (
        <RenameGroupDialog
          open
          current={renaming}
          onClose={() => setRenaming(null)}
          onSave={(to) => doRename(renaming, to)}
        />
      )}
      {deleting !== null && (
        <DeleteGroupDialog
          open
          name={deleting}
          count={groups.find((g) => g.name === deleting)?.count ?? 0}
          onClose={() => setDeleting(null)}
          onConfirm={() => doDelete(deleting)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-md bg-navy-deep px-4 py-2.5 text-meta font-semibold text-surface"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Pill({
  on,
  onClick,
  label,
  n,
  icon,
  mark,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  n: number;
  icon?: string;
  /** The vendor artwork instead of a Material glyph — see `VendorMark`. */
  mark?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-meta font-semibold transition",
        on ? "border-navy bg-navy text-surface" : "border-border bg-surface text-muted-dark hover:border-navy-mid hover:text-navy",
      )}
    >
      {mark ? <VendorMark size={13} className={on ? "invert" : undefined} /> : icon ? <Icon name={icon} size={13} /> : null}
      {label}
      <span className="font-mono tabular-nums opacity-75">{n}</span>
    </button>
  );
}

function Row({
  s,
  c,
  onToggle,
  picking,
  picked,
  onPick,
  onOpen,
  onOpenBids,
  onEdit,
  onInvite,
  seenAt,
}: {
  s: RenterSupplier;
  c: ReturnType<typeof useT>["suppliers"];
  onToggle: () => void;
  picking: boolean;
  picked: boolean;
  onPick: (on: boolean) => void;
  onOpen: () => void;
  onOpenBids: () => void;
  onEdit: () => void;
  onInvite: () => void;
  /** ISO of this reader's last look at the row, or undefined if he never has. */
  seenAt?: string;
}) {
  /* ⚠️ The badge is `onMoedatech`, never `kind`. A hand-typed row matched to an account by phone or
     e-mail is `kind: "own"` and still on Moedatech — the fields stay the renter's, the badge tells
     the truth about the firm (backend delivery note §3.1). */
  const onApp = isOnMoedatech(s);
  const groups = groupsOf(s);
  const bids = bidCount(s);
  const roll = s.rollup;

  /** The counts that produced the number, in the same order every time. */
  const detail: string[] = [];
  if (roll?.bidsApp) detail.push(fmt(c.onApp, { n: roll.bidsApp }));
  if (roll?.bidsLink) detail.push(fmt(c.viaLink, { n: roll.bidsLink }));

  return (
    <tr
      onClick={(e) => {
        // Anything interactive keeps its own click: the vendor toggle, the checkbox, the bid count.
        if ((e.target as HTMLElement).closest("button, input, a, select")) return;
        onOpen();
      }}
      className={cx(
        "cursor-pointer border-b border-border last:border-b-0",
        picked ? "bg-brand-soft" : "hover:bg-surface2",
      )}
    >
      {picking && (
        <td className="px-3 py-2.5">
          <input
            type="checkbox"
            aria-label={s.name}
            checked={picked}
            onChange={(e) => onPick(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand"
          />
        </td>
      )}
      <td className="px-3 py-2.5">
        <span className="flex items-center gap-2.5">
          <span
            className={cx(
              "grid h-[30px] w-[30px] flex-none place-items-center rounded-sm text-meta font-extrabold",
              onApp ? "bg-navy text-surface" : "bg-surface3 text-navy-mid",
            )}
          >
            {initials(s.name)}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-body font-extrabold text-navy">
              {s.name}
              {/* A fact about the firm, not about this row: it is where their bids arrive. The
                  markup moved to `MoedatechBadge` so the share panel and the profile say it the
                  same way (owner, 2026-09-03). */}
              {onApp && <MoedatechBadge />}
            </span>
            {/* A dash, not «No contact name» (owner, 2026-09-03) — see the note on the phone cell. */}
            <span className="block text-meta text-muted">{s.contactName || EMPTY}</span>
          </span>
        </span>
      </td>

      <td className="px-3 py-2.5">
        <button
          type="button"
          aria-pressed={s.vendorRegistered}
          title={s.vendorRegistered ? c.unmarkTitle : c.markTitle}
          onClick={onToggle}
          className={cx(
            "inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-label font-extrabold transition",
            s.vendorRegistered
              ? "border-ok bg-ok-soft text-ok-deep"
              : "border-dashed border-border-strong bg-surface text-muted hover:border-navy-mid hover:text-navy",
          )}
        >
          {/* One mark for this flag everywhere (owner, 2026-09-03) — see `VendorMark`. The `add`
              plus is kept for the UNSET state, because there the chip is an invitation to set it,
              and the mark itself would say the row already is one. */}
          {s.vendorRegistered ? <VendorMark size={14} /> : <Icon name="add" size={14} />}
          {s.vendorRegistered ? c.registered : c.mark}
        </button>
      </td>

      {/* ── Phone and e-mail, a column each (owner, 2026-09-02) ──────────────────────────────────
          They shared one cell, stacked, so «which of the two is missing» took reading rather than
          scanning — and the two are not interchangeable: the e-mail is what a request is shared to,
          the phone is what WhatsApp and matching run on. A renter looking down the list for whoever
          he cannot e-mail was reading a paragraph per row.

          ── A dash where there is nothing, and no sentence about it (owner, 2026-09-03) ──────────
          *"For any missing info show the dash only, no need to explain in text, with the option to
          add for contacts only."*

          ~~«No e-mail — add», «No phone — add», «no group», «No bids yet / nothing shared with them
          yet».~~ Every empty cell explained itself, so a list of ten suppliers carried thirty short
          sentences saying nothing had happened — and they were louder than the values that HAD
          arrived, because there were more of them. A dash says «nothing here» in one character, and
          a reader scanning for a gap finds it faster than a reader reading.

          The two CONTACT columns keep a way to fix it, because they are the only cells whose
          emptiness stops something: a supplier with no e-mail is skipped by *Send to my suppliers*.
          «add» is a real button now rather than a styled span, and it opens the same edit form the
          pen does. Groups and bids get the dash alone: neither is a thing the renter fills in here. */}
      <td className="px-3 py-2.5 text-meta">
        {s.phone ? (
          <span className="block font-semibold text-navy" dir="ltr">
            {s.phone}
          </span>
        ) : (
          <MissingContact onAdd={onEdit} label={c.add} />
        )}
        <Unusable s={s} kind="phone" c={c} />
      </td>

      <td className="px-3 py-2.5 text-meta">
        {canBeEmailed(s) ? (
          <span className="block font-semibold text-navy" dir="ltr">
            {s.email}
          </span>
        ) : (
          <MissingContact onAdd={onEdit} label={c.add} />
        )}
        <Unusable s={s} kind="email" c={c} />
      </td>

      <td className="px-3 py-2.5">
        <span className={cx("block text-meta", groups.length ? "font-semibold text-muted-dark" : "text-muted-light")}>
          {groups.length ? groups.join(" · ") : EMPTY}
        </span>
      </td>

      <td className="px-3 py-2.5">
        {bids === 0 ? (
          <span className="block text-body font-extrabold text-muted-light">{EMPTY}</span>
        ) : (
          <button type="button" onClick={onOpenBids} className="block text-start">
            <span className="flex items-center gap-1.5">
              <span className="text-body font-extrabold text-navy underline decoration-border-strong underline-offset-2 hover:decoration-navy">
                {bids === 1 ? fmt(c.bidOne, { n: 1 }) : fmt(c.bidMany, { n: bids })}
              </span>
              {/* SUP-T34 — the ONE filled badge on the screen, and the only thing that moves. That is
                  the point of it: everything else here is text, so a renter's eye is caught by the
                  row that changed rather than by five things competing.

                  It says TODAY, not UNREAD. The backend counts a 24-hour window, not a per-user seen
                  stamp (SUP-BE-13), so the title says so — a badge claiming "unread" that a renter
                  cannot clear by reading is a badge he learns to ignore.

                  `motion-safe:` and nothing else: a renter who has asked his system for less motion
                  gets the badge without the pulse, which is the whole of what he asked for. */}
              {(roll?.newBids ?? 0) > 0 && (
                <span
                  title={fmt(c.newBidsTitle, { n: roll?.newBids ?? 0 })}
                  className="inline-flex h-[18px] items-center rounded-full bg-brand px-2 text-label font-extrabold uppercase tracking-wide text-brand-fg motion-safe:animate-pulse"
                >
                  {c.newBadge}
                </span>
              )}
              {/* The badge and the dot answer different questions, so both can be true at once. The
                  badge is the last 24 hours and is the same for everyone in the firm; the dot is
                  since THIS reader last opened the row, kept locally because the backend has no
                  per-user seen state and deliberately none (delivery note §3.2). It goes the moment
                  he opens the row, while the badge stays until tomorrow. */}
              {hasUnseenBid(roll?.lastBidAt, seenAt) && (
                <span title={c.unseenBid} className="h-[7px] w-[7px] flex-none rounded-full bg-info" />
              )}
            </span>
            <span className="block text-label font-semibold text-muted">
              {[...detail, roll?.awards ? fmt(c.awarded, { n: roll.awards }) : null].filter(Boolean).join(" · ")}
            </span>
          </button>
        )}
      </td>

      <td className="px-3 py-2.5">
        <span className="flex items-center justify-end">
          {/* ~~Share a request with this one row (the prototype's `shareOne`).~~ Removed (owner,
              2026-09-02: *"remove the share icon, keep only the invite here"*).

              Three glyphs deep, the column stopped reading as actions and started reading as
              decoration — and two of the three sent something: one shared a REQUEST, one invited the
              firm to Moedatech. Sharing is not this page's job. It belongs to a request, it is
              reached from the request, and the toolbar above still shares with whoever is ticked
              when a renter really is working from this list. What is left on the row is what only
              this row can do: invite the firm, and edit its details. */}

          {/* SUP-T42 — off-platform rows only. A supplier who already has an account has nothing to
              be invited to, and offering it would be us not knowing our own users. */}
          {!onApp && (
            <button
              type="button"
              onClick={onInvite}
              title={c.inviteToApp}
              className="grid h-[30px] w-[30px] place-items-center rounded-sm text-muted transition hover:bg-surface3 hover:text-navy"
            >
              {/* ── One icon for «invite», everywhere (owner, 2026-09-02) ──────────────────────
                  ~~`ios_share`.~~ A share arrow says *send this somewhere*, which is what the
                  REQUEST's share sheet does; this asks a firm to join Moedatech. Two different acts
                  wearing one glyph, on a page where the renter also shares requests.

                  `person_add` is what the profile dialog already used for the same act, so this is
                  the row catching up with it rather than a new idea. */}
              <Icon name="person_add" size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            title={c.edit}
            className="grid h-[30px] w-[30px] place-items-center rounded-sm text-muted transition hover:bg-surface3 hover:text-navy"
          >
            <Icon name="edit" size={15} />
          </button>
        </span>
      </td>
    </tr>
  );
}

/** The renter's word for a field the backend named in `unparsed`. */
function fieldWord(field: string, c: ReturnType<typeof useT>["suppliers"]): string {
  const f = field.toLowerCase();
  return f.includes("phone") || f.includes("mobile") ? c.colPhone : f.includes("mail") ? c.colEmail : field;
}

/** What an empty cell says: one character, and the same one everywhere. */
const EMPTY = "—";

/**
 * An empty CONTACT cell: the dash, and the way to fill it.
 *
 * Only phone and e-mail get this. Their emptiness has a consequence the renter can act on — a
 * supplier with no e-mail is skipped when a request is sent to «my suppliers» — while an empty
 * group or bid count is simply a fact about the firm, and offering to «add» a bid would be nonsense.
 */
function MissingContact({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-light">
      {EMPTY}
      <button
        type="button"
        onClick={onAdd}
        className="font-extrabold text-info-deep transition hover:underline"
      >
        {label}
      </button>
    </span>
  );
}

/** Which column an unreadable value belongs under. `null` for a key that is neither. */
function unusableKind(field: string): "phone" | "email" | null {
  const f = field.toLowerCase();
  if (f.includes("phone") || f.includes("mobile")) return "phone";
  if (f.includes("mail")) return "email";
  return null;
}

/**
 * **What the sheet said, when it was not a phone or an address** — under the column it is about.
 *
 * The backend keeps the raw text under `unparsed` and leaves the real column null, so no lookup is
 * poisoned by it: a supplier whose phone reads «call the office» must not match another firm.
 *
 * ⚠️ It used to say only "we could not read that", which tells a renter nothing he can act on:
 * not which field, and not what the offending value was (owner asked what it meant, 2026-09-02). It
 * names both now, so the fix is obvious from the row.
 *
 * ── Why this is a component and not a loop in one cell (owner, 2026-09-02) ──────────────────────
 * *"Why is the e-mail note shown on the phone field?"* Because the loop over `unparsed` sat in the
 * phone cell and printed EVERY key it found — which was right while the two shared one cell, and
 * wrong the moment they became a column each. A row with a good phone and a bad e-mail read as
 * «+966551110005 / E-mail was not usable», with the actual e-mail column saying only «No e-mail».
 *
 * Each cell now asks for its own kind. A key that is neither a phone nor an address is dropped
 * rather than shown in an arbitrary column: it is a backend field this table has no place for, and
 * guessing a home for it is how this bug happened in the first place.
 */
function Unusable({
  s,
  kind,
  c,
}: {
  s: RenterSupplier;
  kind: "phone" | "email";
  c: ReturnType<typeof useT>["suppliers"];
}) {
  if (!hasUnparsed(s)) return null;
  const mine = Object.entries(s.unparsed ?? {}).filter(([field]) => unusableKind(field) === kind);
  if (!mine.length) return null;
  return (
    <>
      {mine.map(([field, raw]) => (
        <span
          key={field}
          title={c.couldNotReadBody}
          className="mt-0.5 flex items-start gap-1 text-label font-semibold text-danger-deep"
        >
          <Icon name="error" size={12} className="mt-px flex-none" />
          <span>{fmt(c.couldNotReadField, { field: fieldWord(field, c), value: raw })}</span>
        </span>
      ))}
    </>
  );
}

function Empty({ filtered, c }: { filtered: boolean; c: ReturnType<typeof useT>["suppliers"] }) {
  return (
    <div className="p-9 text-center text-muted">
      <Icon name={filtered ? "search_off" : "groups"} size={32} className="mb-1.5 block w-full text-muted-light" />
      <b className="mb-1 block text-subhead text-navy">{filtered ? c.noMatchTitle : c.emptyTitle}</b>
      <span className="text-meta">{filtered ? c.noMatchBody : c.emptyBody}</span>
    </div>
  );
}

/** Two letters off the Latin part of a name. Arabic-only names fall back to a question mark. */
function initials(name: string): string {
  const w = name.replace(/[^A-Za-z ]/g, "").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w[1]?.[0] ?? "")).toUpperCase();
}
