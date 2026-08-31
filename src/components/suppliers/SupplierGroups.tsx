"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import type { RenterSupplier } from "@/lib/contract/renter-suppliers";

/**
 * SUP-T21 — groups.
 *
 * A group is a flat label on a row, and the only thing it is for is picking who a request goes to.
 * There is no group table and nothing to create in advance: a group comes into being when the first
 * supplier is given it, and stops existing when the last one loses it.
 *
 * ── The menu is a menu, not a <select> ──────────────────────────────────────────────────────────
 *
 * Each row filters by its group, renames it, or deletes it. A `<select>` cannot carry a pen and a bin
 * per option, and the alternative — a separate "manage groups" screen — puts three clicks between a
 * renter and a typo he can see on the page in front of him.
 *
 * ── Deleting a group deletes the GROUP ──────────────────────────────────────────────────────────
 *
 * The word sits next to a list of companies, and a renter has every reason to fear it. So the dialog
 * says the number of suppliers that stay, and the button says what it removes. Nobody should have to
 * find out by trying it.
 */

export function GroupsMenu({
  groups,
  active,
  open,
  onOpen,
  onPick,
  onRename,
  onDelete,
  onCreate,
  total,
}: {
  groups: { name: string; count: number }[];
  active: string;
  open: boolean;
  onOpen: (next: boolean) => void;
  onPick: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onCreate: () => void;
  total: number;
}) {
  const t = useT();
  const c = t.suppliers;

  // No groups yet: one button, and nothing to open. The menu is what a group list looks like once
  // there is a list — offering it while empty is a menu with a single "create" in it.
  if (!groups.length) {
    return (
      <button type="button" onClick={onCreate} className={btn("secondary", "sm")}>
        <Icon name="label" size={14} />
        {c.createGroup}
      </button>
    );
  }

  return (
    <span className="relative">
      {open && <span className="fixed inset-0 z-40" onClick={() => onOpen(false)} aria-hidden="true" />}
      <button type="button" onClick={() => onOpen(!open)} className={btn("secondary", "sm")}>
        <Icon name="label" size={14} />
        {active || c.allGroups}
        <Icon name={open ? "expand_less" : "expand_more"} size={15} />
      </button>

      {open && (
        <span className="absolute end-0 top-[calc(100%+6px)] z-50 min-w-[260px] overflow-hidden rounded-md border border-border-strong bg-surface">
          <Row label={c.allGroups} count={total} current={active === ""} onPick={() => onPick("")} />
          {groups.map((g) => (
            <Row
              key={g.name}
              label={g.name}
              count={g.count}
              current={active === g.name}
              onPick={() => onPick(g.name)}
              onRename={() => onRename(g.name)}
              onDelete={() => onDelete(g.name)}
            />
          ))}
          <button
            type="button"
            onClick={onCreate}
            className="flex w-full items-center gap-2 bg-brand-soft px-2.5 py-2.5 text-start text-meta font-extrabold text-brand-deep transition hover:bg-brand-pale"
          >
            <Icon name="add" size={15} />
            {c.newGroup}
          </button>
        </span>
      )}
    </span>
  );
}

function Row({
  label,
  count,
  current,
  onPick,
  onRename,
  onDelete,
}: {
  label: string;
  count: number;
  current: boolean;
  onPick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  return (
    <span
      className={cx(
        "flex items-center gap-1.5 border-b border-border py-1 pe-1.5 ps-2.5 last:border-b-0",
        current ? "bg-surface2" : "hover:bg-surface2",
      )}
    >
      <button type="button" onClick={onPick} className="min-w-0 flex-1 py-1 text-start text-meta font-extrabold text-navy">
        {label}
        <span className="ms-1.5 font-mono text-muted">{count}</span>
      </button>
      {onRename && (
        <button
          type="button"
          onClick={onRename}
          title={t.suppliers.rename}
          className="grid h-[26px] w-[26px] flex-none place-items-center rounded-sm text-muted transition hover:bg-surface3 hover:text-navy"
        >
          <Icon name="edit" size={13} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title={t.suppliers.deleteGroup}
          className="grid h-[26px] w-[26px] flex-none place-items-center rounded-sm text-muted transition hover:bg-danger-soft hover:text-danger"
        >
          <Icon name="delete" size={13} />
        </button>
      )}
    </span>
  );
}

/** Naming happens AFTER picking: a group with no members does not exist, so there is nothing to name. */
export function NameGroupDialog({
  open,
  members,
  onClose,
  onSave,
}: {
  open: boolean;
  members: RenterSupplier[];
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const t = useT();
  const c = t.suppliers;
  const [name, setName] = useState("");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Icon name="label" size={18} />}
      title={c.nameGroup}
      subtitle={fmt(c.nSelected, { n: members.length })}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={btn("ghost", "md")}>
            {t.common.back}
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim());
              setName("");
            }}
            className={btn("primary", "md")}
          >
            {c.createGroup}
          </button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.groupName}</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={c.groupPlaceholder}
            className="h-[34px] rounded-md border border-border-strong bg-surface px-2.5 text-body text-navy outline-none focus:border-brand"
          />
        </label>
        {/* Who is in it, before it is made — the last chance to notice a wrong tick. */}
        <div className="flex gap-2 rounded-md bg-surface2 px-3 py-2.5 text-meta text-muted-dark">
          <Icon name="group" size={15} className="flex-none" />
          <span>{members.map((m) => m.name).join(", ")}</span>
        </div>
      </div>
    </Dialog>
  );
}

export function RenameGroupDialog({
  open,
  current,
  onClose,
  onSave,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const t = useT();
  const c = t.suppliers;
  const [name, setName] = useState(current);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Icon name="edit" size={18} />}
      title={c.renameGroup}
      subtitle={current}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={btn("ghost", "md")}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            disabled={!name.trim() || name.trim() === current}
            onClick={() => onSave(name.trim())}
            className={btn("primary", "md")}
          >
            {t.common.save}
          </button>
        </div>
      }
    >
      <label className="grid gap-1.5">
        <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.groupName}</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-[34px] rounded-md border border-border-strong bg-surface px-2.5 text-body text-navy outline-none focus:border-brand"
        />
      </label>
    </Dialog>
  );
}

/** The suppliers stay. The dialog says how many, because "delete" beside a list of firms reads worse
 *  than it is. */
export function DeleteGroupDialog({
  open,
  name,
  count,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const c = t.suppliers;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Icon name="delete" size={18} />}
      title={c.deleteGroup}
      subtitle={name}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={btn("ghost", "md")}>
            {t.common.cancel}
          </button>
          <button type="button" onClick={onConfirm} className={btn("danger", "md")}>
            {c.deleteGroup}
          </button>
        </div>
      }
    >
      <div className="flex gap-2 rounded-md bg-surface2 px-3 py-2.5 text-meta text-muted-dark">
        <Icon name="info" size={15} className="flex-none" />
        <span>{count === 1 ? c.deleteGroupBodyOne : fmt(c.deleteGroupBody, { n: count })}</span>
      </div>
    </Dialog>
  );
}
