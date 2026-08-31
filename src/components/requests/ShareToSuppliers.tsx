"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { listRenterSuppliers, updateRenterSupplier, type RenterSupplier } from "@/lib/api/client";
import { canBeEmailed, groupsOf, groupsWithCounts } from "@/lib/contract/renter-suppliers";
import { copyBidLink } from "@/lib/bidCardHtml";

/**
 * SUP-T41 — sending a request to the suppliers already on the renter's list.
 *
 * ── It lives on the REQUEST, not on the suppliers screen (owner) ────────────────────────────────
 *
 * A renter shares a request while he is looking at the request. Starting from the supplier list would
 * mean picking a firm and then hunting for the request he meant, which is the question backwards.
 *
 * ── His own mail, not ours ──────────────────────────────────────────────────────────────────────
 *
 * `mailto:` opens the renter's own client with the recipients and the body already filled, so the
 * message arrives FROM HIM: his address, his signature, his sent folder. A supplier who has worked
 * with him for years recognises the sender. Sending it from a Moedatech address would be a colder
 * message with a worse delivery rate, and a reply would land nowhere he looks.
 *
 * ── BCC, and a cap (owner: "yes bcc") ───────────────────────────────────────────────────────────
 *
 * Forty suppliers in the To line tells each of them exactly who else was asked, which is the renter's
 * commercial business and nobody else's. Past 25 addresses most mail clients truncate or refuse a
 * `mailto:` — so the button becomes *Copy the addresses* rather than opening a message that silently
 * lost half its recipients.
 *
 * ── Who cannot be sent to is named BEFORE the send ──────────────────────────────────────────────
 *
 * A supplier with no e-mail is shown with an *Add e-mail* box on the row. Dropping him silently and
 * reporting "sent to 12" when the renter picked 14 is the kind of quiet failure he finds out about a
 * week later, when a bid he was waiting for never came.
 */
export function ShareToSuppliers({
  shareUrl,
  renterName,
  requestCode,
  ar,
  L,
}: {
  shareUrl: string;
  renterName?: string | null;
  /** `EXC-170845`, for the subject line — the thing a supplier quotes back at an operator. */
  requestCode?: string | null;
  ar: boolean;
  L: (en: string, arr: string) => string;
}) {
  const [rows, setRows] = useState<RenterSupplier[] | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [addingEmailOn, setAddingEmailOn] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState<"none" | "message" | "addresses">("none");

  useEffect(() => {
    if (!open || rows) return;
    listRenterSuppliers()
      .then(setRows)
      .catch(() => setRows([]));
  }, [open, rows]);

  const groups = useMemo(() => groupsWithCounts(rows ?? []), [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((s) => {
      if (group && !groupsOf(s).includes(group)) return false;
      if (!needle) return true;
      return [s.name, s.contactName, s.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, group]);

  const chosen = (rows ?? []).filter((s) => picked[s.id]);
  const reachable = chosen.filter(canBeEmailed);
  const unreachable = chosen.filter((s) => !canBeEmailed(s));
  const addresses = reachable.map((s) => s.email as string);
  const tooMany = addresses.length > 25;

  const subject = renterName
    ? L(`${renterName} — invitation to bid${requestCode ? ` (${requestCode})` : ""}`, `${renterName} — دعوة لتقديم عرض${requestCode ? ` (${requestCode})` : ""}`)
    : L("Invitation to bid (RFQ)", "دعوة لتقديم عرض سعر");

  /**
   * The body the supplier reads. The renter's optional line goes ABOVE the link, where a person
   * actually reads it, and his reference beside the request's own so an operator can file it.
   */
  const body = [
    L("Hello,", "مرحبًا،"),
    "",
    renterName
      ? L(`${renterName} has a new equipment request open for bids.`, `لدى ${renterName} طلب معدات جديد مفتوح لتلقّي العروض.`)
      : L("A new equipment request is open for bids.", "طلب معدات جديد مفتوح لتلقّي العروض."),
    reference.trim() ? L(`Our reference: ${reference.trim()}`, `مرجعنا: ${reference.trim()}`) : null,
    note.trim() ? `\n${note.trim()}` : null,
    "",
    shareUrl,
    "",
    L("No account is needed — the link opens the form.", "لا حاجة لحساب — الرابط يفتح النموذج مباشرة."),
  ]
    .filter((l) => l !== null)
    .join("\n");

  const send = () => {
    if (!addresses.length || tooMany) return;
    // Recipients in BCC and nothing in To: forty suppliers in one To line tells each of them who
    // else was asked.
    window.location.href = `mailto:?bcc=${encodeURIComponent(addresses.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const flash = (what: "message" | "addresses") => {
    setCopied(what);
    setTimeout(() => setCopied("none"), 1800);
  };

  const saveEmail = async (s: RenterSupplier) => {
    const email = emailDraft.trim();
    if (!email) return;
    setRows((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, email } : x)));
    setAddingEmailOn(null);
    setEmailDraft("");
    try {
      await updateRenterSupplier(s.id, { email });
    } catch {
      // Put it back rather than leave a row claiming an address that was never saved.
      setRows((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, email: s.email } : x)));
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2.5 text-body font-semibold text-navy transition hover:bg-surface2"
      >
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface2 text-navy-mid">
          <Icon name="groups" size={18} />
        </span>
        {L("Send to my suppliers", "أرسِل إلى مورّديّ")}
        <Icon name="chevron_right" size={16} className="ms-auto text-muted" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-[30px] min-w-[180px] flex-1 items-center gap-2 rounded-sm border border-border bg-surface2 px-2.5">
          <Icon name="search" size={15} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L("Search your suppliers", "ابحث في مورّديك")}
            className="w-full bg-transparent text-meta font-semibold text-navy outline-none placeholder:text-muted"
          />
        </span>
        {/* By group, because a renter who keeps groups keeps them for exactly this moment. */}
        {groups.length > 0 && (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="h-[30px] rounded-sm border border-border bg-surface px-2 text-meta font-semibold text-navy"
          >
            <option value="">{L("All groups", "كل المجموعات")}</option>
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.count})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="max-h-[220px] overflow-auto rounded-sm border border-border">
        {rows === null ? (
          <p className="p-5 text-center text-meta text-muted">{L("Loading…", "جارٍ التحميل…")}</p>
        ) : visible.length === 0 ? (
          <p className="p-5 text-center text-meta text-muted">
            {L("No suppliers here yet.", "لا يوجد مورّدون بعد.")}
          </p>
        ) : (
          <ul>
            {visible.map((s) => (
              <li key={s.id} className="border-b border-border last:border-b-0">
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={!!picked[s.id]}
                    onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.checked }))}
                    className="h-3.5 w-3.5 flex-none accent-brand"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-meta font-semibold text-navy">{s.name}</b>
                    <span className="block truncate text-label text-muted" dir="ltr">
                      {s.email || L("no e-mail", "لا يوجد بريد")}
                    </span>
                  </span>
                  {/* Fixed here, on the row, rather than by sending the renter to another screen and
                      losing the selection he has built. */}
                  {!canBeEmailed(s) &&
                    (addingEmailOn === s.id ? (
                      <span className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          placeholder="name@company.com"
                          className="h-[26px] w-[170px] rounded-sm border border-border-strong bg-surface px-2 text-meta text-navy outline-none focus:border-brand"
                        />
                        <button
                          type="button"
                          onClick={() => void saveEmail(s)}
                          className="text-meta font-semibold text-brand"
                        >
                          {L("Save", "حفظ")}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingEmailOn(s.id);
                          setEmailDraft("");
                        }}
                        className="text-meta font-semibold text-brand transition hover:text-brand-hover"
                      >
                        {L("Add e-mail", "أضِف بريدًا")}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={L("Your reference (optional)", "مرجعك (اختياري)")}
          className="h-[30px] rounded-sm border border-border bg-surface px-2.5 text-meta text-navy outline-none focus:border-brand"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={L("A line to them (optional)", "سطر لهم (اختياري)")}
          className="h-[30px] rounded-sm border border-border bg-surface px-2.5 text-meta text-navy outline-none focus:border-brand"
        />
      </div>

      {/* Named before the send, never dropped in silence. */}
      {unreachable.length > 0 && (
        <p className="flex items-start gap-2 rounded-sm bg-surface2 px-3 py-2 text-meta text-muted-dark">
          <Icon name="info" size={15} className="flex-none" />
          {L(
            `${unreachable.length} of the ones you picked have no e-mail — add one on the row, or they are left out.`,
            `${unreachable.length} ممن اخترتهم بلا بريد — أضِف بريدًا على السطر، وإلا فلن يُرسل إليهم.`,
          )}
        </p>
      )}

      {tooMany && (
        <p className="flex items-start gap-2 rounded-sm bg-surface2 px-3 py-2 text-meta text-muted-dark">
          <Icon name="info" size={15} className="flex-none" />
          {L(
            "Over 25 recipients — most mail clients cut the list. Copy the addresses and paste them into BCC yourself.",
            "أكثر من 25 مستلمًا — معظم برامج البريد تقتطع القائمة. انسخ العناوين والصقها في حقل نسخة مخفية.",
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-meta text-muted">
          {L(`${reachable.length} will be sent to`, `سيُرسل إلى ${reachable.length}`)}
        </span>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              copyBidLink(shareUrl, ar ? "ar" : "en")
                .catch(() => false)
                .then(() => flash("message"));
            }}
            className={btn("ghost", "md")}
          >
            {copied === "message" ? L("Copied", "تم النسخ") : L("Copy the message", "انسخ الرسالة")}
          </button>
          {tooMany ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(addresses.join(", ")).catch(() => {});
                flash("addresses");
              }}
              className={btn("primary", "md")}
            >
              {copied === "addresses" ? L("Copied", "تم النسخ") : L("Copy the addresses", "انسخ العناوين")}
            </button>
          ) : (
            <button type="button" onClick={send} disabled={!addresses.length} className={cx(btn("primary", "md"))}>
              {L(`Send to ${reachable.length}`, `أرسِل إلى ${reachable.length}`)}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
