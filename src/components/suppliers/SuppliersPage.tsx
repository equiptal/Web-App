"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { fmt, useT } from "@/lib/i18n";
import { btn, cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { deleteSupplierGroup, listRenterSuppliers, renameSupplierGroup, updateRenterSupplier } from "@/lib/api/client";
import { AddSuppliersDialog } from "./AddSuppliersDialog";
import { DeleteGroupDialog, GroupsMenu, NameGroupDialog, RenameGroupDialog } from "./SupplierGroups";
import { SupplierProfileDialog } from "./SupplierProfileDialog";
import { SupplierBidsDialog } from "./SupplierBidsDialog";
import { EditSupplierDialog } from "./EditSupplierDialog";
import { InviteSupplierDialog } from "./InviteSupplierDialog";
import { SuggestedBand } from "./SuggestedBand";
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
      if (!needle) return true;
      // Everything a renter might half-remember: the firm, the person, either way of reaching them.
      return [s.name, s.contactName, s.email, s.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, pill, groupFilter]);

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
    } catch {
      setRows((list) => (list ?? []).map((s) => (s.id === row.id ? { ...s, vendorRegistered: !next } : s)));
      setToast(c.vendorFailed);
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
          <p className="mt-0.5 text-meta text-muted">
            <b className="font-extrabold text-navy">{rows?.length ?? 0}</b>{" "}
            {(rows?.length ?? 0) === 1 ? fmt(c.summaryOne, { n: 1 }) : fmt(c.summaryMany, { n: rows?.length ?? 0 })}
            {vendors > 0 && <> · {fmt(c.vendors, { n: vendors })}</>}
          </p>
        </div>
        {/* ~~A second «Import a list» button.~~ Removed (owner, 2026-09-01): two controls for one
            intention made a renter with a file guess which door was his before either had told him
            what it wanted. Uploading is now a tab inside this dialog. */}
        <span className="ms-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAdding(true)} className={btn("tinted", "md")}>
            <Icon name="person_add" size={15} />
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
          <Pill on={pill === "vendor"} onClick={() => setPill("vendor")} label={c.registeredVendors} n={vendors} icon="verified" />
          <span className="ms-auto">
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
                {[c.colSupplier, c.colVendor, c.colContact, c.colGroups, c.colBids, ""].map((h, hi) => (
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

      {/* One dialog: typed rows or an uploaded list, chosen inside it. `msg` is the import's own
          count — typed rows have nothing to count that the list below does not already show. */}
      <AddSuppliersDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(msg) => {
          load();
          setToast(msg ?? c.added);
        }}
      />

      <InviteSupplierDialog supplier={inviting} onClose={() => setInviting(null)} />

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

function Pill({ on, onClick, label, n, icon }: { on: boolean; onClick: () => void; label: string; n: number; icon?: string }) {
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
      {icon && <Icon name={icon} size={13} />}
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
              {/* A fact about the firm, not about this row: it is where their bids arrive. */}
              {onApp && (
                <span className="inline-flex h-[19px] flex-none items-center gap-1 rounded-full bg-navy px-2 text-label font-extrabold text-surface">
                  <Icon name="verified_user" size={12} />
                  {c.onMoedatech}
                </span>
              )}
            </span>
            <span className="block text-meta text-muted">{s.contactName || c.noContactName}</span>
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
          <Icon name={s.vendorRegistered ? "verified" : "add"} size={14} />
          {s.vendorRegistered ? c.registered : c.mark}
        </button>
      </td>

      <td className="px-3 py-2.5 text-meta">
        {canBeEmailed(s) ? (
          <span className="block font-semibold text-navy">{s.email}</span>
        ) : (
          <span className="block text-muted-dark">
            {c.notSet} — <span className="font-extrabold text-info-deep">{c.add}</span>
          </span>
        )}
        <span className="block text-muted" dir="ltr">
          {s.phone || "—"}
        </span>
        {/* Present only when the backend could not turn something into a key — the text survives so
            the renter can correct it, and the key column stays null so no lookup is poisoned. */}
        {hasUnparsed(s) && (
          <span title={c.couldNotReadBody} className="mt-0.5 inline-flex items-center gap-1 text-label font-extrabold text-danger-deep">
            <Icon name="error" size={12} />
            {c.couldNotRead}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <span className={cx("block text-meta", groups.length ? "font-semibold text-muted-dark" : "text-muted-light")}>
          {groups.length ? groups.join(" · ") : c.noGroup}
        </span>
      </td>

      <td className="px-3 py-2.5">
        {bids === 0 ? (
          <>
            <span className="block text-body font-extrabold text-muted-light">{c.noBids}</span>
            <span className="block text-label font-semibold text-muted">{c.nothingShared}</span>
          </>
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
          {/* SUP-T42 — off-platform rows only. A supplier who already has an account has nothing to
              be invited to, and offering it would be us not knowing our own users. */}
          {!onApp && (
            <button
              type="button"
              onClick={onInvite}
              title={c.inviteToApp}
              className="grid h-[30px] w-[30px] place-items-center rounded-sm text-muted transition hover:bg-surface3 hover:text-navy"
            >
              <Icon name="ios_share" size={15} />
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
