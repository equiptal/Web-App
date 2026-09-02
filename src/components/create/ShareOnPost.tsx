"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import {
  bidShareUrl,
  listRenterSuppliers,
  recordRequestShare,
  setBidDeadline,
  updateRenterSupplier,
  type RenterSupplier,
} from "@/lib/api/client";
import { canBeEmailed } from "@/lib/contract/renter-suppliers";
import { bidCardText } from "@/lib/bidCardText";
import { bidCardHtml } from "@/lib/bidCardHtml";
import { useBidCard } from "@/lib/useBidCard";
import { openEmailCompose } from "@/lib/composeEmail";

/**
 * *Share this request* — the card under the summary on **Ready to send**.
 *
 * ── It is a card on the page, not a dialog (owner's prototype, 2026-09-02) ──────────────────────
 *
 * Built first as a modal behind a *Post & share* button, which was wrong twice over: it hid the one
 * thing the screen is for behind a press, and it made *post* and *share* read as two acts a renter
 * chooses between. The prototype has neither. The card is simply there, under the request he is
 * reviewing, and *Send request* is the button that does the whole thing.
 *
 * ── Why the order is the whole feature ──────────────────────────────────────────────────────────
 *
 * The link is minted from the uuid the backend answers with, so it cannot exist before the request
 * does. One press therefore does **post → create → share**, and nothing about what gets created
 * changed to allow it: `submit()` merely returns the ids it always had.
 *
 * ── Why it is mounted above the phase switch ────────────────────────────────────────────────────
 *
 * `SUBMIT_SUCCESS` flips `phase` to `confirmation`, which unmounts *Ready to send* mid-press. So this
 * is rendered by `CreateSurface`, which owns the switch and survives it — the flip happens behind the
 * card and the renter sees one continuous act, ending on this card saying what it shared.
 *
 * ── What each channel can honestly do ───────────────────────────────────────────────────────────
 *
 * **E-mail** opens the renter's own client with every reachable supplier in BCC — under his name,
 * which is the rule, and the one channel that reaches several people in one press. **WhatsApp** opens
 * ONE chat, the first pick with a phone: `wa.me` has no multi-recipient form and no browser API does
 * (owner, 2026-09-02: *"it will open whatsapp to first contact in the list"*).
 */
export function ShareOnPost() {
  const t = useT();
  const c = t.intake.postShare;
  const { locale } = useLocale();
  const lang = locale === "ar" ? "ar" : "en";
  const { state, actions } = useRfq();

  const [rows, setRows] = useState<RenterSupplier[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [byEmail, setByEmail] = useState(true);
  const [byWhatsApp, setByWhatsApp] = useState(false);
  const [tab, setTab] = useState<"email" | "whatsapp">("email");
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);
  const [sharedWith, setSharedWith] = useState(0);
  const [copied, setCopied] = useState(false);
  const [addingEmailOn, setAddingEmailOn] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [coach, setCoach] = useState(true);
  const [tooLong, setTooLong] = useState(false);
  /** The renter's own firm, for the From line. Read once, and a failure just leaves it unnamed. */
  const [renterName, setRenterName] = useState<string | null>(null);

  useEffect(() => {
    /* `fetch` itself can be missing — a test renderer, an old embedded browser — and calling it then
       throws INSIDE the effect, where `.catch` never sees it and React takes the whole tree down with
       it. The name is decoration on a From line; nothing here may cost the screen. */
    try {
      void fetch("/api/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((me: { companyName?: string | null } | null) => setRenterName(me?.companyName?.trim() || null))
        .catch(() => setRenterName(null));
    } catch {
      setRenterName(null);
    }
  }, []);

  useEffect(() => {
    if (rows) return;
    listRenterSuppliers()
      .then(setRows)
      .catch(() => setRows([]));
  }, [rows]);

  const shareUrl = useMemo(() => {
    if (!posted) return "";
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return origin ? bidShareUrl(origin, posted, null) : "";
  }, [posted]);

  const card = useBidCard(shareUrl, lang);

  const chosen = (rows ?? []).filter((s) => picked[s.id]);
  const reachable = chosen.filter(canBeEmailed);
  const unreachable = chosen.filter((s) => !canBeEmailed(s));
  const firstWithPhone = chosen.find((s) => s.phone?.trim()) ?? null;

  const body = card
    ? bidCardText(card.model, shareUrl, { note, lang })
    : [note.trim() || null, shareUrl || null].filter(Boolean).join("\n\n");

  const emailHtml =
    card && shareUrl
      ? bidCardHtml(
          {
            title: card.model.cardTitle,
            description: card.model.where ?? "",
            imageUrl: card.imageUrl || `${window.location.origin}/bid/${posted}/og`,
            url: shareUrl,
          },
          card.model,
          lang,
        )
      : null;

  /** Post, then share. The post is never rolled back, so a share that fails leaves a live request. */
  const send = async () => {
    if (posting) return;
    setPosting(true);
    const result = posted ? { requestUuids: [posted] } : await actions.submit();
    const uuid = result?.requestUuids?.[0] ?? null;
    if (!uuid) {
      // `submit` has already put the failure on the store; the review above says what went wrong.
      setPosting(false);
      return;
    }
    setPosted(uuid);
    // Keeps this card mounted once the phase flips to confirmation — see `CreateSurface`.
    actions.setShareOnPost(true);
    // The renter's own deadline for the link, if he set one. Never awaited: a share must not wait on
    // an expiry, and the link works either way.
    if (expiry) void setBidDeadline(uuid, new Date(expiry).toISOString()).catch(() => {});

    const url = bidShareUrl(window.location.origin, uuid, null);
    const message = card ? bidCardText(card.model, url, { note, lang }) : `${note}\n\n${url}`;

    if (byEmail && reachable.length) {
      void recordRequestShare(uuid, reachable.map((s) => s.id), "email");
      /* Outlook on the web, not `mailto:` — a machine with no mail client configured does nothing
         at all when handed a mailto, and the renter watches Send do nothing. See `composeEmail.ts`. */
      const opened = openEmailCompose({
        bcc: reachable.map((s) => s.email as string),
        subject: fmt(c.subject, { code: state.requestId || "" }).trim(),
        body: message,
      });
      // Too long for a URL. The request is posted and the link is on screen; say so rather than
      // opening a window carrying half a message.
      if (!opened) setTooLong(true);
    }
    if (byWhatsApp && firstWithPhone) {
      void recordRequestShare(uuid, [firstWithPhone.id], "whatsapp");
      const phone = (firstWithPhone.phone ?? "").replace(/[^\d]/g, "");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    }
    setSharedWith(reachable.length + (byWhatsApp && firstWithPhone ? 1 : 0));
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

  const previewIsEmail = tab === "email" || !byWhatsApp;
  const label = "text-label font-extrabold uppercase tracking-wide text-muted";

  return (
    <section className="relative mt-6 rounded-lg border border-border bg-surface p-6">
      {/* The coach mark: a pointer at the thing, dismissible, gone for good once dismissed. Not a
          banner — a banner is permanent furniture, and this has one job on a renter's first visit. */}
      {coach && (
        <div className="absolute -top-2.5 start-6 z-10 flex -translate-y-full items-center gap-2 rounded-md bg-navy px-3 py-2 text-label font-extrabold text-surface">
          {c.coach}
          <button type="button" onClick={() => setCoach(false)} aria-label={t.common.close} className="text-surface/60 hover:text-surface">
            <Icon name="close" size={12} />
          </button>
          <span aria-hidden className="absolute -bottom-1 start-5 h-2.5 w-2.5 rotate-45 bg-navy" />
        </div>
      )}

      <h2 className="mb-5 text-subhead font-extrabold text-navy">{c.title}</h2>

      <div className="flex flex-wrap gap-6">
        {/* ── Left: the link, who, and how ──────────────────────────────────────────────────────── */}
        <div className="flex min-w-[380px] flex-1 flex-col gap-5">
          <div className="grid gap-2">
            <span className="flex items-center gap-1.5 text-body font-extrabold text-navy">
              <Icon name="lock" size={14} className="text-muted" />
              {c.linkLabel}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {/* The renter's own deadline on the link — the prototype puts it beside the link, which
                  is where it belongs: it is a property OF the link, not of the request. */}
              <span className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2">
                <Icon name="event" size={14} className="text-muted" />
                <input
                  type="date"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  aria-label={c.expiry}
                  className="w-[112px] bg-transparent text-meta text-navy outline-none"
                />
              </span>
              <span className="min-w-0 flex-1 rounded-md border border-dashed border-border-strong bg-surface2 px-3 py-2">
                <span dir="ltr" className={cx("block truncate font-mono text-meta", posted ? "text-navy" : "text-muted-light")}>
                  {posted ? shareUrl.replace(/^https?:\/\//, "") : c.linkMasked}
                </span>
              </span>
              <button
                type="button"
                disabled={!posted}
                onClick={() => {
                  void navigator.clipboard?.writeText(shareUrl).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className={cx(btn("secondary", "md"), "flex-none")}
              >
                <Icon name={copied ? "check" : "content_copy"} size={14} />
                {copied ? c.copied : c.copy}
              </button>
            </div>
            <p className="text-meta text-muted">{c.linkHint}</p>
          </div>

          <div className="grid gap-2">
            <span className="flex items-center gap-2">
              <span className={label}>{c.recipients}</span>
              <span className="text-meta text-muted">{fmt(c.selected, { n: chosen.length })}</span>
            </span>

            {rows === null ? (
              <span className="text-meta text-muted">{c.loading}</span>
            ) : rows.length === 0 ? (
              <span className="text-meta text-muted">{c.noSuppliers}</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rows.map((s) => {
                  const on = !!picked[s.id];
                  return (
                    <span key={s.id} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => setPicked((p) => ({ ...p, [s.id]: !p[s.id] }))}
                        className={cx(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-meta font-semibold transition",
                          on ? "border-ok bg-ok-soft text-navy" : "border-border bg-surface text-navy-mid hover:border-brand",
                        )}
                      >
                        <span
                          className={cx(
                            "grid h-4 w-4 flex-none place-items-center rounded-full border",
                            on ? "border-ok bg-ok text-surface" : "border-border-strong",
                          )}
                        >
                          {on && <Icon name="check" size={10} />}
                        </span>
                        <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-navy text-label font-extrabold text-surface">
                          {s.name.trim().charAt(0).toUpperCase()}
                        </span>
                        {s.name}
                        {s.verified && <Icon name="verified_user" size={12} className="text-ok" />}
                      </button>
                      {/* Fixed in place: a supplier with no e-mail is skipped, and sending him to
                          another screen to fix it would lose the selection he is building here. */}
                      {on && !canBeEmailed(s) &&
                        (addingEmailOn === s.id ? (
                          <span className="ms-1.5 inline-flex items-center gap-1">
                            <input
                              autoFocus
                              value={emailDraft}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              placeholder="name@company.com"
                              className="h-[26px] w-[150px] rounded-sm border border-border-strong px-2 text-meta text-navy outline-none focus:border-brand"
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
                            className="ms-1.5 text-meta font-semibold text-brand"
                          >
                            {c.addEmail}
                          </button>
                        ))}
                    </span>
                  );
                })}
              </div>
            )}
            {unreachable.length > 0 && !posted && (
              <span className="text-meta text-danger-deep">{fmt(c.skipping, { n: unreachable.length })}</span>
            )}
          </div>

          <div className="grid gap-2">
            <span className={label}>{c.sendVia}</span>
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
              <button
                type="button"
                onClick={() => void send()}
                disabled={posting || !!posted}
                className={cx(btn("primary", "md"), "ms-auto")}
              >
                <Icon name="send" size={15} />
                {posting ? c.posting : c.post}
              </button>
            </div>
            {/* Said plainly: the alternative is a renter who believes four people were messaged. */}
            {byWhatsApp && !posted && (
              <span className="text-meta text-muted">
                {firstWithPhone ? fmt(c.whatsappFirst, { name: firstWithPhone.name }) : c.whatsappNoPhone}
              </span>
            )}
            {tooLong && (
              <span className="flex items-start gap-1.5 text-meta font-semibold text-danger-deep">
                <Icon name="error_outline" size={14} className="mt-px flex-none" />
                {c.tooLong}
              </span>
            )}
            {posted && (
              <span className="flex items-center gap-1.5 text-meta font-extrabold text-ok-deep">
                <Icon name="check_circle" size={15} />
                {sharedWith === 1 ? c.doneOne : fmt(c.done, { n: sharedWith })}
              </span>
            )}
          </div>

          <label className="grid gap-1">
            <span className={label}>{c.yourLine}</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={c.yourLineHint}
              className="rounded-sm border border-border bg-surface p-2.5 text-meta text-navy outline-none focus:border-brand"
            />
          </label>
        </div>

        {/* ── Right: what they receive ──────────────────────────────────────────────────────────── */}
        <div className="flex min-w-[320px] flex-1 flex-col gap-2">
          <span className="flex items-center gap-2">
            <span className={label}>{c.preview}</span>
            {byEmail && byWhatsApp && (
              <span className="ms-auto flex gap-0.5 rounded-sm bg-surface2 p-0.5">
                <Tab on={previewIsEmail} onClick={() => setTab("email")} label={c.email} />
                <Tab on={!previewIsEmail} onClick={() => setTab("whatsapp")} label={c.whatsapp} />
              </span>
            )}
          </span>

          {/* ── The client's own chrome, as the prototype draws it ────────────────────────────
              A message in a plain box is a message you have to imagine arriving. In the frame it
              lands in — a From line and a subject, or a chat bubble with a timestamp — the renter is
              reading what his supplier will read, which is the only question this panel answers.

              ⚠️ The prototype's From says `Moedatech <notifications@moedatech.net>`. It is a mock,
              and it is not what happens: this goes out from the renter's own account (owner,
              2026-09-01), so the From line names HIM. A preview that named us would be rehearsing a
              message nobody sends. */}
          {previewIsEmail ? (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <div className="border-b border-border bg-surface2 px-3 py-2">
                <div className="text-meta font-extrabold text-navy">
                  {fmt(c.subject, { code: state.requestId || "" }).trim()}
                </div>
                <div className="mt-0.5 text-label text-muted">
                  {fmt(c.fromLine, { name: renterName || c.fromYou })}
                </div>
              </div>
              {emailHtml ? (
                /* The card itself, not a picture of it — the same markup the clipboard carries into
                   Gmail, so what he reviews is exactly what is received. */
                <div className="max-h-[320px] overflow-auto p-3" dangerouslySetInnerHTML={{ __html: emailHtml }} />
              ) : (
                <p className="max-h-[320px] overflow-auto whitespace-pre-wrap p-3 text-meta text-navy">{body}</p>
              )}
            </div>
          ) : (
            /* The chat bubble. Tinted and tailed like the real thing, with the ticks the prototype
               has — the point is to be recognisable at a glance, not to be a replica. */
            <div className="rounded-md border border-border bg-surface2 p-3">
              <div className="relative max-w-[92%] rounded-md rounded-ss-none bg-ok-soft px-3 py-2">
                <p className="max-h-[300px] overflow-auto whitespace-pre-wrap text-meta leading-relaxed text-navy">
                  {body}
                </p>
                <span className="mt-1 flex items-center justify-end gap-1 text-label text-muted">
                  {c.previewTime}
                  <Icon name="done_all" size={12} className="text-info" />
                </span>
              </div>
            </div>
          )}
          {!posted && <span className="text-label text-muted">{c.previewPending}</span>}
        </div>
      </div>
    </section>
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
