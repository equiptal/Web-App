"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { removeRenterSupplier, updateRenterSupplier } from "@/lib/api/client";
import { groupsOf, type RenterSupplier } from "@/lib/contract/renter-suppliers";

/**
 * SUP-T22 — editing one supplier, including which groups they are in.
 *
 * ── Moving one supplier between groups belongs here ─────────────────────────────────────────────
 *
 * Not behind a selection. Making a GROUP is bulk work — pick ten firms, name the label — but moving
 * one firm out of it is a fact about that firm, and a renter fixing it is already looking at the row.
 * Sending him to tick a box, choose a group and come back would be three steps for a chip and an ×.
 *
 * ── A platform row does not own its own name ────────────────────────────────────────────────────
 *
 * `name` and `store` are read live from the supplier's Moedatech account, so the field is disabled
 * and says why. Letting a renter type over it would produce a row that disagrees with the account it
 * points at, and the disagreement would only surface the day somebody asked which was right.
 */
export function EditSupplierDialog({
  supplier,
  allGroups,
  onClose,
  onSaved,
}: {
  supplier: RenterSupplier | null;
  allGroups: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = useT();
  const c = t.suppliers;

  const [contactName, setContactName] = useState(supplier?.contactName ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [groups, setGroups] = useState<string[]>(groupsOf(supplier ?? ({} as RenterSupplier)));
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!supplier) return null;
  const platform = supplier.kind === "platform";
  const rest = allGroups.filter((g) => !groups.includes(g));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateRenterSupplier(supplier.id, {
        contactName: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        groups,
      });
      onSaved(c.saved);
      onClose();
    } catch {
      setError(c.saveFailed);
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await removeRenterSupplier(supplier.id);
      onSaved(fmt(c.removed, { name: supplier.name }));
      onClose();
    } catch {
      setError(c.saveFailed);
      setConfirmRemove(false);
    }
  };

  // The confirm takes over the whole dialog rather than stacking a second one on top of it: two
  // scrims deep, a renter cannot tell which Escape he is pressing.
  if (confirmRemove) {
    return (
      <Dialog
        open
        onClose={() => setConfirmRemove(false)}
        icon={<Icon name="delete" size={18} />}
        title={c.removeTitle}
        subtitle={supplier.name}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button type="button" onClick={() => setConfirmRemove(false)} className={btn("ghost", "md")}>
              {t.common.cancel}
            </button>
            <button type="button" onClick={remove} className={btn("danger", "md")}>
              {c.remove}
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-2 rounded-md bg-surface2 px-3 py-2.5 text-meta text-muted-dark">
          <Icon name="info" size={15} className="flex-none" />
          <span>{c.removeBody}</span>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      icon={<Icon name="edit" size={18} />}
      title={c.editTitle}
      subtitle={platform ? c.editPlatformSub : supplier.name}
      footer={
        <div className="flex w-full items-center gap-2">
          <button type="button" onClick={() => setConfirmRemove(true)} className={cx(btn("ghost", "md"), "text-danger")}>
            <Icon name="delete" size={15} />
            {c.remove}
          </button>
          {error && <span className="text-meta font-extrabold text-danger-deep">{error}</span>}
          <span className="ms-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={btn("ghost", "md")}>
              {t.common.cancel}
            </button>
            <button type="button" onClick={save} disabled={saving} className={btn("primary", "md")}>
              {t.common.save}
            </button>
          </span>
        </div>
      }
    >
      <div className="grid gap-3">
        {/* ── Two rows of two, and ONE note under the pair that needs it (owner, 2026-09-06) ───────
            *"Make the company name and contact fields in the same row, then below, the phone and
            email in the same row, and show a note below them both."*

            The four fields are two questions, not four: WHO the firm is (its name and the person
            there), and HOW to reach them (the two addresses a request can be sent to). Pairing them
            that way puts the reachable pair on one line, which is what the note below is about —
            it used to hang off the e-mail alone and said nothing about the phone, though the share
            sheet needs either one. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={c.fName} value={supplier.name} onChange={() => undefined} disabled hint={platform ? c.nameIsTheirs : undefined} />
          <Field label={c.fContact} value={contactName} onChange={setContactName} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={c.fPhone} value={phone} onChange={setPhone} placeholder="+966 5X XXX XXXX" />
          <Field label={c.fEmail} value={email} onChange={setEmail} type="email" />
        </div>
        {/* Under BOTH, because either one is enough to reach them and the renter is choosing which
            channel he will have. */}
        <p className="-mt-1 text-meta text-muted">{c.contactHint}</p>
        {/* ~~CR number.~~ Removed (owner, 2026-09-01): a renter does not hold his suppliers'
            commercial registrations, so the field was either empty or filled from memory — and the CR
            is the strongest key we have for matching an off-platform firm to an account, so a
            remembered one matches the wrong company. It arrives on the supplier's own bid or not at all. */}

        <div className="grid gap-1.5">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.colGroups}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {groups.length === 0 && (
              <span className="inline-flex h-[26px] items-center rounded-full border border-dashed border-border-strong px-2.5 text-label font-semibold text-muted-light">
                {c.noGroup}
              </span>
            )}
            {groups.map((g) => (
              <span
                key={g}
                className="inline-flex h-[26px] items-center gap-1 rounded-full bg-surface3 py-0 pe-1 ps-2.5 text-meta font-extrabold text-navy-mid"
              >
                {g}
                <button
                  type="button"
                  title={c.removeFromGroup}
                  onClick={() => setGroups((list) => list.filter((x) => x !== g))}
                  className="grid h-[18px] w-[18px] place-items-center rounded-full text-muted-dark transition hover:bg-border-strong hover:text-navy"
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
            {rest.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && setGroups((list) => [...list, e.target.value])}
                className="h-[26px] rounded-full border border-dashed border-border-strong bg-transparent px-2 text-meta font-semibold text-muted-dark"
              >
                <option value="">+ {c.addToGroup}</option>
                {rest.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </div>
          <span className="text-meta text-muted">{c.groupsHint}</span>
        </div>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-label font-extrabold uppercase tracking-wide text-muted">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "h-[34px] rounded-md border border-border-strong px-2.5 text-body text-navy outline-none focus:border-brand",
          disabled ? "bg-disabled-bg text-disabled-fg" : "bg-surface",
        )}
      />
      {hint && <span className="text-meta text-muted">{hint}</span>}
    </label>
  );
}
