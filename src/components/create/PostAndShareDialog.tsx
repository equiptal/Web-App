"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import {
  bidShareUrl,
  listRenterSuppliers,
  recordRequestShare,
  updateRenterSupplier,
  type RenterSupplier,
} from "@/lib/api/client";
import { canBeEmailed, groupsOf, groupsWithCounts } from "@/lib/contract/renter-suppliers";
import { bidCardText } from "@/lib/bidCardText";
import { bidCardHtml } from "@/lib/bidCardHtml";
import { useBidCard } from "@/lib/useBidCard";

/**
 * Post the request and share its link, in one press (owner, 2026-09-02).
 *
 * ── Why the order is the whole feature ──────────────────────────────────────────────────────────
 *
 * The link does not exist until the request does: it is minted from the uuid the backend answers
 * with. So a renter could only ever share AFTER posting, from the confirmation screen — which meant
 * choosing recipients was a second visit to a second screen, and the request had already gone out by
 * the time he thought about who should see it.
 *
 * This inverts it without changing a line of what gets created: he picks his suppliers and his
 * channel while still reviewing, and one press does **post → create → share**. Nothing about the
 * request payload, the backend, or `submit()`'s behaviour moved; `submit()` merely returns the ids it
 * always had.
 *
 * ── Why it lives above the phase switch ─────────────────────────────────────────────────────────
 *
 * `SUBMIT_SUCCESS` flips `phase` to `confirmation`, which unmounts *Ready to send* mid-press. A
 * dialog rendered by that screen would vanish between the post and the share. `CreateSurface` owns
 * the switch and survives it, so this is mounted there and the flip happens behind it.
 *
 * ── The link is masked until it is real ─────────────────────────────────────────────────────────
 *
 * Before posting there is no link, and showing a plausible-looking one would be a lie the renter
 * cannot act on. So it reads `moeda.tech/r/••••••` with Copy disabled, and unmasks the moment the
 * uuid lands.
 *
 * ── What each channel can honestly do ───────────────────────────────────────────────────────────
 *
 * **E-mail** opens the renter's own client with every reachable supplier in BCC. It goes out under
 * his name, which is the rule set on 2026-09-01, and it is the one channel that reaches several
 * people in one press.
 *
 * **WhatsApp** opens **one** chat — the first supplier picked who has a phone. `wa.me` has no
 * multi-recipient form and no browser API does, so the button says *first contact* rather than
 * implying a broadcast (owner, 2026-09-02: *"it will open whatsapp to first contact in the list"*).
 *
 * So the wording is *opened*, never *sent*: the last thing this app can observe is the client
 * opening. What it records is the same declared send the share sheet records.
 */
export function PostAndShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const c = t.intake.postShare;
  const { locale } = useLocale();
  const lang = locale === "ar" ? "ar" : "en";
  const { state, actions } = useRfq();

  const [rows, setRows] = useState<RenterSupplier[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [group, setGroup] = useState("");
  const [byEmail, setByEmail] = useState(true);
  const [byWhatsApp, setByWhatsApp] = useState(false);
  const [tab, setTab] = useState<"email" | "whatsapp">("email");
  const [note, setNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addingEmailOn, setAddingEmailOn] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");

  useEffect(() => {
    if (!open || rows) return;
    listRenterSuppliers()
      .then(setRows)
      .catch(() => setRows([]));
  }, [open, rows]);

  /** The link, once the request exists. Built from the uuid the post answered with. */
  const shareUrl = useMemo(() => {
    if (!posted) return "";
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return origin ? bidShareUrl(origin, posted, null) : "";
  }, [posted]);

  // The card is only fetchable once there is a request to fetch. Before that the preview shows the
  // shape with the values it can already know, and fills in when the link lands.
  const card = useBidCard(shareUrl, lang);

  const groups = useMemo(() => groupsWithCounts(rows ?? []), [rows]);
  const visible = useMemo(
    () => (rows ?? []).filter((s) => !group || groupsOf(s).includes(group)),
    [rows, group],
  );
  const chosen = (rows ?? []).filter((s) => picked[s.id]);
  const reachable = chosen.filter(canBeEmailed);
  const unreachable = chosen.filter((s) => !canBeEmailed(s));
  const firstWithPhone = chosen.find((s) => s.phone?.trim()) ?? null;

  /** The message, from the one model every other surface renders. */
  const body = card
    ? bidCardText(card.model, shareUrl, { note, lang })
    : [note.trim() || null, shareUrl || null].filter(Boolean).join("\n\n");

  const emailHtml = card && shareUrl
    ? bidCardHtml(
        { title: card.model.cardTitle, description: card.model.where ?? "", imageUrl: card.imageUrl || `${typeof window === "undefined" ? "" : window.location.origin}/bid/${posted}/og`, url: shareUrl },
        card.model,
        lang,
      )
    : null;

  /**
   * Post, then share. The two halves are deliberately not one `await` chain the renter can lose:
   * the post is what matters and it is never rolled back, so a share that fails afterwards leaves a
   * posted request and a link he can still copy.
   */
  const postAndShare = async () => {
    if (posting) return;
    setPosting(true);
    const result = posted ? { requestUuids: [posted] } : await actions.submit();
    const uuid = result?.requestUuids?.[0] ?? null;
    if (!uuid) {
      // `submit` has already put the failure on the store; the review screen behind this says what.
      setPosting(false);
      return;
    }
    setPosted(uuid);

    const origin = window.location.origin;
    const url = bidShareUrl(origin, uuid, null);

    if (byEmail && reachable.length) {
      void recordRequestShare(uuid, reachable.map((s) => s.id), "email");
      const subject = fmt(c.subject, { code: state.requestId || "" }).trim();
      window.location.href = `mailto:?bcc=${encodeURIComponent(
        reachable.map((s) => s.email as string).join(","),
      )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        card ? bidCardText(card.model, url, { note, lang }) : `${note}\n\n${url}`,
      )}`;
    }
    if (byWhatsApp && firstWithPhone) {
      void recordRequestShare(uuid, [firstWithPhone.id], "whatsapp");
      const phone = (firstWithPhone.phone ?? "").replace(/[^\d]/g, "");
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(card ? bidCardText(card.model, url, { note, lang }) : url)}`,
        "_blank",
        "noopener",
      );
    }
    setPosting(false);
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
      setRows((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, email: s.email } : x)));
    }
  };

  const showTabs = byEmail && byWhatsApp;
  const previewIsEmail = tab === "email" || !byWhatsApp;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Icon name="ios_share" size={18} />}
      title={c.title}
      subtitle={c.subtitle}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {posted ? (
            <span className="flex items-center gap-1.5 text-meta font-extrabold text-ok-deep">
              <Icon name="check_circle" size={15} />
              {fmt(c.done, { n: reachable.length })}
            </span>
          ) : (
            unreachable.length > 0 && (
              <span className="text-meta text-muted">{fmt(c.skipping, { n: unreachable.length })}</span>
            )
          )}
          <span className="ms-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={btn("ghost", "md")}>
              {posted ? t.common.close : t.common.cancel}
            </button>
            {!posted && (
              <button
                type="button"
                onClick={() => void postAndShare()}
                disabled={posting}
                className={btn("primary", "md")}
              >
                {posting ? c.posting : c.post}
              </button>
            )}
          </span>
        </div>
      }
    >
      <div className="grid gap-4">
        {/* ── The link ─────────────────────────────────────────────────────────────────────────── */}
        <div className="grid gap-1.5">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.linkLabel}</span>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface2 px-3 py-2">
            <Icon name="link" size={15} className="flex-none text-muted" />
            <span
              dir="ltr"
              className={cx("min-w-0 flex-1 truncate font-mono text-meta", posted ? "text-navy" : "text-muted-light")}
            >
              {posted ? shareUrl.replace(/^https?:\/\//, "") : c.linkMasked}
            </span>
            <button
              type="button"
              disabled={!posted}
              onClick={() => {
                void navigator.clipboard?.writeText(shareUrl).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="flex-none text-meta font-extrabold text-brand disabled:bg-disabled-bg disabled:text-disabled-fg"
            >
              {copied ? c.copied : c.copy}
            </button>
          </div>
          <span className="text-label text-muted">{c.linkHint}</span>
        </div>

        {/* ── Who ──────────────────────────────────────────────────────────────────────────────── */}
        <div className="grid gap-1.5">
          <span className="flex items-center gap-2 text-label font-extrabold uppercase tracking-wide text-muted">
            {c.recipients}
            <span className="font-semibold normal-case tracking-normal text-muted">
              {fmt(c.selected, { n: chosen.length })}
            </span>
            {groups.length > 0 && (
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="ms-auto h-[26px] rounded-sm border border-border bg-surface px-2 text-meta font-semibold text-navy"
              >
                <option value="">{c.allGroups}</option>
                {groups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name} ({g.count})
                  </option>
                ))}
              </select>
            )}
          </span>

          <div className="max-h-[190px] overflow-auto rounded-md border border-border">
            {rows === null ? (
              <p className="p-5 text-center text-meta text-muted">{c.loading}</p>
            ) : visible.length === 0 ? (
              <p className="p-5 text-center text-meta text-muted">{c.noSuppliers}</p>
            ) : (
              <ul>
                {visible.map((s) => (
                  <li key={s.id} className="border-b border-border last:border-b-0">
                    <div className={cx("flex items-center gap-2.5 px-2.5 py-2", picked[s.id] && "bg-ok-soft/40")}>
                      <input
                        type="checkbox"
                        checked={!!picked[s.id]}
                        onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.checked }))}
                        className="h-3.5 w-3.5 flex-none accent-ok"
                      />
                      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-navy text-label font-extrabold text-surface">
                        {s.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-meta font-semibold text-navy">{s.name}</b>
                        <span className="block truncate text-label text-muted" dir="ltr">
                          {s.email || c.noEmail}
                        </span>
                      </span>
                      {/* Fixed here rather than on another screen, which would lose the selection. */}
                      {!canBeEmailed(s) &&
                        (addingEmailOn === s.id ? (
                          <span className="flex flex-none items-center gap-1.5">
                            <input
                              autoFocus
                              value={emailDraft}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              placeholder="name@company.com"
                              className="h-[26px] w-[160px] rounded-sm border border-border-strong bg-surface px-2 text-meta text-navy outline-none focus:border-brand"
                            />
                            <button type="button" onClick={() => void saveEmail(s)} className="text-meta font-semibold text-brand">
                              {t.common.save}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingEmailOn(s.id);
                              setEmailDraft("");
                            }}
                            className="flex-none text-meta font-semibold text-brand"
                          >
                            {c.addEmail}
                          </button>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── How ──────────────────────────────────────────────────────────────────────────────── */}
        <div className="grid gap-1.5">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.sendVia}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Channel on={byEmail} onClick={() => setByEmail((v) => !v)} icon="mail" label={c.email} />
            <Channel
              on={byWhatsApp}
              onClick={() => {
                setByWhatsApp((v) => !v);
                setTab("whatsapp");
              }}
              icon="chat"
              label={c.whatsapp}
            />
          </div>
          {/* Said plainly, because the alternative is a renter who believes four people were messaged. */}
          {byWhatsApp && (
            <span className="text-label text-muted">
              {firstWithPhone ? fmt(c.whatsappFirst, { name: firstWithPhone.name }) : c.whatsappNoPhone}
            </span>
          )}
        </div>

        <label className="grid gap-1">
          <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.yourLine}</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={c.yourLineHint}
            className="rounded-sm border border-border bg-surface p-2.5 text-meta text-navy outline-none focus:border-brand"
          />
        </label>

        {/* ── What they get ────────────────────────────────────────────────────────────────────── */}
        <div className="grid gap-1.5">
          <span className="flex items-center gap-2 text-label font-extrabold uppercase tracking-wide text-muted">
            {c.preview}
            {showTabs && (
              <span className="ms-auto flex gap-0.5 rounded-sm bg-surface2 p-0.5">
                <Tab on={previewIsEmail} onClick={() => setTab("email")} label={c.email} />
                <Tab on={!previewIsEmail} onClick={() => setTab("whatsapp")} label={c.whatsapp} />
              </span>
            )}
          </span>

          {previewIsEmail && emailHtml ? (
            /* The card itself, not a picture of it — the same markup the clipboard carries into
               Gmail, so what the renter reviews is what the supplier receives. */
            <div
              className="overflow-auto rounded-md border border-border bg-surface2 p-3"
              dangerouslySetInnerHTML={{ __html: emailHtml }}
            />
          ) : (
            <p className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface2 px-3 py-2.5 text-meta text-navy">
              {body}
            </p>
          )}
          {!posted && <span className="text-label text-muted">{c.previewPending}</span>}
        </div>
      </div>
    </Dialog>
  );
}

function Channel({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-meta font-extrabold transition",
        on ? "border-ok bg-ok-soft text-navy" : "border-border bg-surface text-muted hover:text-navy",
      )}
    >
      <Icon name={icon} size={15} className={on ? "text-ok-deep" : "text-muted"} />
      {label}
    </button>
  );
}

function Tab({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-sm px-2.5 py-1 text-label font-extrabold transition",
        on ? "bg-navy text-surface" : "text-muted hover:text-navy",
      )}
    >
      {label}
    </button>
  );
}
