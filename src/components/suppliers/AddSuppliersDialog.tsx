"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { addRenterSuppliersBulk, type NewRenterSupplier } from "@/lib/api/client";
import { SupplierImportPanel } from "./SupplierImportPanel";

/**
 * SUP-T15 — adding the suppliers a renter already works with.
 *
 * ── Typing, or a sheet instead — as the prototype has it ────────────────────────────────────────
 *
 * `prototypes/renter-suppliers-v1.html` (`addRowsPanel`) ends the rows with an *or* rule and one
 * secondary button, **Upload a sheet instead**. Not a tab strip: tabs say "these are two equal
 * things, choose", and they are not — typing is what the dialog opens on because most renters add
 * two or three suppliers, and the sheet is the escape hatch for the one who has forty.
 *
 * *Add from Moedatech* is NOT in here. It has its own button in the header, also from the prototype,
 * because it makes a different kind of row — one linked to an account rather than the renter's own.
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
 * ── No CR number (owner, 2026-09-01) ────────────────────────────────────────────────────────────
 *
 * It was a column here and it should not have been. A renter does not hold his suppliers' commercial
 * registrations, so the field was either left empty — teaching him this screen asks for things he
 * cannot answer — or filled from memory, which is worse: the CR is the strongest key we have for
 * matching an off-platform firm to an account, and a wrong one matches the wrong company. It comes
 * from the supplier, on his own bid, or it does not come at all.
 *
 * ── Registered by default, per row ──────────────────────────────────────────────────────────────
 *
 * Someone typing suppliers in is typing the firms he works with, so the flag is on. But a batch
 * always has an exception — the one being tried out, the one inherited from a previous site — so
 * every row carries its own tick and the one at the bottom only sets them all at once.
 */
type Row = { name: string; contactName: string; email: string; phone: string; vendor: boolean };

const blank = (): Row => ({ name: "", contactName: "", email: "", phone: "", vendor: true });

/** A row is real once it names a firm AND carries a way to reach it. */
const usable = (r: Row) => !!r.name.trim() && !!(r.email.trim() || r.phone.trim());

/** Four columns and the flag — the grid is declared once so the header and the rows cannot drift. */
/**
 * The row, and the header over it, in ONE template.
 *
 * ⚠️ The vendor column was `auto`, and `auto` is measured from the CONTENT — the header cell held
 * the words «Vendor registration», the row cell held a pill, and the two came out different widths.
 * Every column after them then landed somewhere else, so each label sat a few pixels off the box it
 * named and the whole table looked hand-placed (owner, 2026-09-02: *"the labels must be above the
 * box exactly at its start"*). A FIXED column cannot disagree with itself.
 *
 * `items-end` rather than `items-center`, so a header and a 34px field share a baseline.
 */
const GRID =
  "grid grid-cols-[1.4fr_1fr_1.5fr_1.1fr_10rem_28px] items-end gap-x-2.5 gap-y-1.5";

export function AddSuppliersDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (msg?: string) => void }) {
  const t = useT();
  const c = t.suppliers;
  /** One way, and back. `file` is reached from the rows and returns to them on cancel. */
  const [mode, setMode] = useState<"type" | "file">("type");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = rows.filter(usable);
  const patch = (i: number, next: Partial<Row>) => setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

  const close = () => {
    setRows([blank()]);
    setMode("type");
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
        vendorRegistered: r.vendor,
      }));
      /**
       * ⚠️ The result used to be thrown away.
       *
       * `bulk` answers `created`, `merged` and `rejected`, and this called it, ignored all three, and
       * said "added". So a row that MERGED into a supplier already on the list, and a row the backend
       * refused, both looked identical to a row that landed — and the renter, seeing no new line
       * appear, concluded the feature was broken (owner, found in UAT 2026-09-02).
       *
       * Now it says which of the three happened. A merge is a success and reads as one, but it is a
       * different success, and the renter has to be told which he got.
       */
      const result = await addRenterSuppliersBulk(payload);
      const created = result?.created?.length ?? 0;
      const merged = result?.merged?.length ?? 0;
      const rejected = result?.rejected?.length ?? 0;

      // Refusals stay on screen rather than passing in a toast: they are the rows the renter still
      // has to do something about, and each one names which row and why.
      if (rejected > 0 && created + merged === 0) {
        setError(refusalLine(result?.rejected ?? [], c));
        setSaving(false);
        return;
      }
      onAdded(
        merged || rejected
          ? fmt(c.addedMixed, { n: created, merged, rejected })
          : created === 1
            ? fmt(c.addedOne, { n: 1 })
            : fmt(c.addedMany, { n: created }),
      );
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
      size="xxl"
      icon={<Icon name="person_add" size={18} />}
      title={c.addTitle}
      subtitle={c.addSubtitle}
      /* The import panel carries its own actions — its primary button says how many rows will be
         written, which a fixed dialog footer cannot. */
      footer={
        mode === "file" ? undefined : (
          <div className="flex w-full items-center justify-end gap-2">
            {error && <span className="me-auto text-meta font-extrabold text-danger-deep">{error}</span>}
            <button type="button" onClick={close} className={btn("ghost", "md")}>
              {t.common.cancel}
            </button>
            <button type="button" onClick={save} disabled={!ready.length || saving} className={btn("primary", "md")}>
              {ready.length === 1 ? c.addOne : ready.length ? fmt(c.addMany, { n: ready.length }) : c.addNone}
            </button>
          </div>
        )
      }
    >
      <div className="grid gap-3">
        {mode === "file" ? (
          <SupplierImportPanel
            onDone={(msg) => {
              onAdded(msg);
              close();
            }}
            onCancel={() => setMode("type")}
          />
        ) : (
          <div className="grid gap-1.5">
            {/* One header row for the whole table, not a label per row: five labels repeated down
                six rows is a wall of shouting, and the columns do not change meaning as you go. */}
            <div className={GRID}>
              {[c.fName, c.fContact, c.fEmail, c.fPhone, c.colVendor].map((h, i) => (
                <span key={h} className="truncate text-label font-extrabold uppercase tracking-wide text-muted">
                  {h}
                  {i === 0 && <span className="text-danger"> *</span>}
                </span>
              ))}
              <span />
            </div>

            {rows.map((r, i) => (
              <div key={i} className={GRID}>
                <Field value={r.name} onChange={(v) => patch(i, { name: v })} placeholder={c.fName} />
                <Field value={r.contactName} onChange={(v) => patch(i, { contactName: v })} placeholder={c.fContact} />
                <Field value={r.email} onChange={(v) => patch(i, { email: v })} placeholder="name@company.com" type="email" />
                <Field value={r.phone} onChange={(v) => patch(i, { phone: v })} placeholder="+966 5X XXX XXXX" />
                <label
                  className={cx(
                    "inline-flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 text-label font-extrabold",
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
                  className="grid h-[34px] w-[28px] place-items-center rounded-sm text-muted transition hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg"
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

            {/* The prototype's `or` rule and one secondary button — not a tab. Tabs say "two equal
                things, choose"; these are not equal. Typing is what the dialog opens on because most
                renters add two or three, and the sheet is the escape hatch for the one with forty. */}
            <div className="my-1 flex items-center gap-3 text-label font-extrabold uppercase tracking-wide text-muted-light">
              <span className="h-px flex-1 bg-border" />
              {c.or}
              <span className="h-px flex-1 bg-border" />
            </div>
            <button type="button" onClick={() => setMode("file")} className={cx(btn("secondary", "md"), "w-fit")}>
              <Icon name="upload_file" size={15} />
              {c.uploadInstead}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The refusals, as one line a renter can act on.
 *
 * Named by ROW, because the dialog he is looking at is a table of rows — "row 3 has no e-mail and no
 * phone" points at something on his screen, where "MISSING_CONTACT" points at our vocabulary.
 */
function refusalLine(
  rejected: { row: number; reason: string }[],
  c: ReturnType<typeof useT>["suppliers"],
): string {
  const reason = (code: string) =>
    code === "MISSING_CONTACT" ? c.rMissingContact : code === "MISSING_NAME" ? c.rMissingName : code;
  return rejected.map((r) => fmt(c.planRejected, { row: r.row + 1, reason: reason(r.reason) })).join(" · ");
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
