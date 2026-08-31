"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { addRenterSuppliersBulk, type NewRenterSupplier } from "@/lib/api/client";

/**
 * SUP-T15 — adding the suppliers a renter already works with.
 *
 * ── Rows, not a form ────────────────────────────────────────────────────────────────────────────
 *
 * A form would make a renter do four fields, press Save, and start again — and the second time he
 * did that he would go and find a spreadsheet instead. So it is a table, and *Add another* is one
 * click away when he has more.
 *
 * **It opens on ONE row** (owner, 2026-09-01). Three empty rows look like three things that must be
 * filled in, and a renter adding a single supplier reads two of them as work he is being asked to
 * do. One row is the honest floor; the second appears when he asks for it.
 *
 * ── A row counts when it can be used ────────────────────────────────────────────────────────────
 *
 * A name and some way to reach them. A row with only a name is not a supplier, it is a note; a row
 * with neither is the blank one at the bottom that everybody leaves behind. Both are ignored
 * silently, and the button counts what will actually be created so nobody presses Save wondering.
 *
 * ── Registered by default, per row ──────────────────────────────────────────────────────────────
 *
 * Someone typing suppliers in is typing the firms he works with, so the flag is on. But a batch
 * always has an exception — the one being tried out, the one inherited from a previous site — so
 * every row carries its own tick and the one at the bottom only sets them all at once.
 */
type Row = { name: string; contactName: string; email: string; phone: string; crNumber: string; vendor: boolean };

const blank = (): Row => ({ name: "", contactName: "", email: "", phone: "", crNumber: "", vendor: true });

/** A row is real once it names a firm AND carries a way to reach it. */
const usable = (r: Row) => !!r.name.trim() && !!(r.email.trim() || r.phone.trim());

export function AddSuppliersDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const t = useT();
  const c = t.suppliers;
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = rows.filter(usable);
  const patch = (i: number, next: Partial<Row>) => setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

  const close = () => {
    setRows([blank()]);
    setError(null);
    onClose();
  };

  const save = async () => {
    if (!ready.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload: NewRenterSupplier[] = ready.map((r) => ({
        name: r.name.trim(),
        contactName: r.contactName.trim() || null,
        email: r.email.trim() || null,
        phone: r.phone.trim() || null,
        crNumber: r.crNumber.trim() || null,
        vendorRegistered: r.vendor,
      }));
      await addRenterSuppliersBulk(payload);
      onAdded();
      close();
    } catch {
      // Never close on failure: the renter's typing is the only copy of it.
      setError(c.addFailed);
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      icon={<Icon name="person_add" size={18} />}
      title={c.addTitle}
      subtitle={c.addSubtitle}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {error && <span className="me-auto text-meta font-extrabold text-danger-deep">{error}</span>}
          <button type="button" onClick={close} className={btn("ghost", "md")}>
            {t.common.cancel}
          </button>
          <button type="button" onClick={save} disabled={!ready.length || saving} className={btn("primary", "md")}>
            {ready.length === 1 ? c.addOne : ready.length ? fmt(c.addMany, { n: ready.length }) : c.addNone}
          </button>
        </div>
      }
    >
      <div className="grid gap-1.5">
        <div className="grid grid-cols-[1.1fr_.85fr_1.1fr_.85fr_.7fr_auto_28px] items-center gap-1.5">
          {[c.fName, c.fContact, c.fEmail, c.fPhone, c.fCr].map((h, i) => (
            <span key={h} className="text-label font-extrabold uppercase tracking-wide text-muted">
              {h}
              {i === 0 && <span className="text-danger"> *</span>}
            </span>
          ))}
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.colVendor}</span>
          <span />
        </div>

        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1.1fr_.85fr_1.1fr_.85fr_.7fr_auto_28px] items-center gap-1.5">
            <Field value={r.name} onChange={(v) => patch(i, { name: v })} placeholder={c.fName} />
            <Field value={r.contactName} onChange={(v) => patch(i, { contactName: v })} placeholder={c.fContact} />
            <Field value={r.email} onChange={(v) => patch(i, { email: v })} placeholder="name@company.com" type="email" />
            <Field value={r.phone} onChange={(v) => patch(i, { phone: v })} placeholder="+966 5X XXX XXXX" />
            <Field value={r.crNumber} onChange={(v) => patch(i, { crNumber: v })} placeholder={c.fCr} />
            <label
              className={cx(
                "inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-label font-extrabold",
                r.vendor ? "border-ok bg-ok-soft text-ok-deep" : "border-dashed border-border-strong bg-surface text-muted",
              )}
            >
              <input
                type="checkbox"
                checked={r.vendor}
                onChange={(e) => patch(i, { vendor: e.target.checked })}
                className="h-3 w-3 accent-ok"
              />
              {c.registered}
            </label>
            <button
              type="button"
              disabled={rows.length === 1}
              onClick={() => setRows((list) => list.filter((_, n) => n !== i))}
              title={c.removeRow}
              className="grid h-[26px] w-[26px] place-items-center rounded-sm text-muted transition hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setRows((list) => [...list, blank()])}
          className="mt-1 inline-flex h-[30px] w-fit items-center gap-1.5 rounded-md border border-dashed border-border-strong px-3 text-meta font-extrabold text-muted-dark transition hover:border-navy-mid hover:bg-surface2 hover:text-navy"
        >
          <Icon name="add" size={15} />
          {c.addAnother}
        </button>

        <div className="mt-2 flex gap-2 rounded-md bg-surface2 px-3 py-2.5 text-meta text-muted-dark">
          <Icon name="info" size={15} className="flex-none" />
          <span>{c.addHint}</span>
        </div>

        {/* The flag is per row above; this only sets them all at once. */}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ok/40 bg-ok-soft px-3 py-2.5 text-meta text-ok-deep">
          <input
            type="checkbox"
            checked={rows.every((r) => r.vendor)}
            onChange={(e) => setRows((list) => list.map((r) => ({ ...r, vendor: e.target.checked })))}
            className="mt-0.5 h-4 w-4 flex-none accent-ok"
          />
          <span>
            <b className="block font-extrabold">{c.markAll}</b>
            <span className="block text-muted-dark">{c.markAllHint}</span>
          </span>
        </label>
      </div>
    </Dialog>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-[30px] w-full rounded-md border border-border-strong bg-surface px-2.5 text-meta text-navy outline-none focus:border-brand"
    />
  );
}
