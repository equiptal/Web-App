"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import {
  bidShareUrl,
  listRenterSuppliers,
  recordRequestShare,
  setBidDeadline,
  updateRenterSupplier,
  type RenterSupplier,
} from "@/lib/api/client";
import { canBeEmailed } from "@/lib/contract/renter-suppliers";
import type { BidFormData } from "@/lib/contract/link-bids";
import { bidCardHtml } from "@/lib/bidCardHtml";
import { useBidCard } from "@/lib/useBidCard";
import {
  clearTemplate,
  defaultTemplate,
  isDefaultTemplate,
  loadTemplate,
  renderShareMessage,
  saveTemplate,
  shareMessageParts,
  type ShareMessageParts,
  type ShareTemplate,
} from "@/lib/shareTemplate";
import {
  EMAIL_PROVIDERS,
  loadEmailProvider,
  openEmailCompose,
  saveEmailProvider,
  type EmailProvider,
} from "@/lib/composeEmail";

/**
 * *Share this request* — one panel, wherever a request is shared.
 *
 * ── One panel, two shells (owner, 2026-09-02) ───────────────────────────────────────────────────
 *
 * It sits as a CARD under the review on *Ready to send*, and as a MODAL everywhere else a request
 * can be shared. That is the owner's rule, and it is the right one: on the review the renter is
 * already looking at the request, so hiding who it goes to behind a press would hide the one thing
 * that screen is for. Anywhere else he is doing something else, and a share is an interruption he
 * asked for, which is what a modal is.
 *
 * Three surfaces used to compose their own message, which is how one request came to read three
 * different ways. There is one of them now, so they cannot drift again.
 *
 * ── The order is the whole feature ──────────────────────────────────────────────────────────────
 *
 * The link is minted from the uuid the backend answers with, so it cannot exist before the request
 * does. In `post` mode one press therefore does **post → create → share**, and nothing about what
 * gets created changed to allow it: `onPost` merely returns the ids the submit always had.
 *
 * ── The preview is the message, before the request exists ───────────────────────────────────────
 *
 * It used to be an empty frame with "fills in once the request is posted" under it — a renter asked
 * to approve a message he cannot read, whose only chance to change his mind came after the request
 * was already live. `draftForm` maps the draft in hand into the same payload the posted request
 * answers with, so the SAME model draws both. Only the reference and the link are genuinely
 * missing, and both are minted on create.
 *
 * ── What each channel can honestly do ───────────────────────────────────────────────────────────
 *
 * **Moedatech** is not a choice: every request goes to the marketplace, which is what the locked
 * chip says. **E-mail** opens the renter's own webmail with every reachable supplier in BCC — under
 * his name, and the one channel that reaches several people in one press. **WhatsApp** opens ONE
 * chat, the first pick with a phone: `wa.me` has no multi-recipient form and no browser API does
 * (owner, 2026-09-02: *"it will open whatsapp to first contact in the list"*).
 */
export interface ShareRequestPanelProps {
  /** `post` — the request does not exist yet and Send creates it. `share` — it already does. */
  mode: "post" | "share";
  /** `share` mode: the request being shared. */
  requestUuid?: string | null;
  /** The short code on the subject line, when there is one. */
  requestCode?: string | null;
  /** `post` mode: the draft, so the preview can be read before the link exists. */
  draftForm?: BidFormData | null;
  /** `post` mode: posts and returns the new request's uuid. Null means the post failed. */
  onPost?: () => Promise<string | null>;
  /** Fired once a share has gone out, with how many suppliers it reached. */
  onShared?: (count: number) => void;
  /** Rows to start with ticked — the per-row share action picks one. */
  preselect?: string[];
  /** The renter's own firm, for the From line. */
  renterName?: string | null;
  /**
   * Draw the link row and its expiry.
   *
   * Off where the shell around it already owns them — the bid-link sheet carries its own link and a
   * deadline editor with more in it than a date. Two link rows a few pixels apart is the failure
   * this stops, and two deadline controls that write the same field is worse than that.
   */
  showLink?: boolean;
}

export function ShareRequestPanel({
  mode,
  requestUuid = null,
  requestCode = null,
  draftForm = null,
  onPost,
  onShared,
  preselect,
  renterName = null,
  showLink = true,
}: ShareRequestPanelProps) {
  const t = useT();
  const c = t.intake.postShare;
  const { locale } = useLocale();
  const lang = locale === "ar" ? "ar" : "en";

  const [rows, setRows] = useState<RenterSupplier[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((preselect ?? []).map((id) => [id, true])),
  );
  const [byEmail, setByEmail] = useState(true);
  const [byWhatsApp, setByWhatsApp] = useState(false);
  const [provider, setProvider] = useState<EmailProvider>("outlook");
  const [tab, setTab] = useState<"email" | "whatsapp">("email");
  const [note, setNote] = useState("");
  /** The renter's own wording, kept on this browser so every request after this one carries it. */
  const [template, setTemplate] = useState<ShareTemplate>(() => defaultTemplate("en"));
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [uuid, setUuid] = useState<string | null>(requestUuid);
  const [sharedWith, setSharedWith] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [addingEmailOn, setAddingEmailOn] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [tooLong, setTooLong] = useState(false);

  useEffect(() => setUuid(requestUuid), [requestUuid]);
  useEffect(() => setProvider(loadEmailProvider()), []);
  // After mount, and per language: `localStorage` does not exist on the server, and the two
  // languages hold two wordings.
  useEffect(() => setTemplate(loadTemplate(lang)), [lang]);

  useEffect(() => {
    listRenterSuppliers()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const shareUrl = useMemo(() => {
    if (!uuid || typeof window === "undefined") return "";
    return bidShareUrl(window.location.origin, uuid, null);
  }, [uuid]);

  const card = useBidCard(shareUrl, lang, draftForm);

  const chosen = (rows ?? []).filter((s) => picked[s.id]);
  const reachable = chosen.filter(canBeEmailed);
  const unreachable = chosen.filter((s) => !canBeEmailed(s));
  const firstWithPhone = chosen.find((s) => s.phone?.trim()) ?? null;

  /** The same message in its halves, so the preview can show which of them he may edit. */
  const parts = card ? shareMessageParts(card.model, shareUrl, { template, note, renterName, lang }) : null;

  const subject = fmt(c.subject, { code: requestCode ?? "" }).trim();

  /** What the link unfurls into in the supplier's client — the card, not the body. */
  const unfurl =
    card && shareUrl
      ? bidCardHtml(
          {
            title: card.model.cardTitle,
            description: card.model.where ?? "",
            imageUrl: card.imageUrl || `${window.location.origin}/bid/${uuid}/og`,
            url: shareUrl,
          },
          card.model,
          lang,
        )
      : null;

  /**
   * Moedatech alone is a legitimate send (owner, 2026-09-02: *"users must be able to send the
   * request only through moedatech without any other channel"*). So the gate is not "has he picked a
   * channel" — it is "can what he picked actually go".
   */
  const moedatechOnly = !byEmail && !byWhatsApp;
  const canSend =
    !busy &&
    (moedatechOnly ||
      !chosen.length ||
      (byEmail && !!reachable.length) ||
      (byWhatsApp && !!firstWithPhone));

  /** The list, narrowed. Searching never changes the ticks — a hidden pick is still a pick. */
  const visible = (rows ?? []).filter((r) =>
    query.trim() ? r.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setTooLong(false);

    // `post` mode mints the request first; a share that fails afterwards leaves a LIVE request, and
    // that is deliberate — the post is what the renter came here for, and rolling it back to tidy up
    // a failed mail window would throw away the thing that succeeded.
    let id = uuid;
    if (!id && mode === "post" && onPost) id = await onPost();
    if (!id) {
      setBusy(false);
      return;
    }
    setUuid(id);

    // The renter's own deadline for the link. Never awaited: a share must not wait on an expiry, and
    // the link works either way.
    if (expiry) void setBidDeadline(id, new Date(expiry).toISOString()).catch(() => {});

    const url = bidShareUrl(window.location.origin, id, null);
    const message = card
      ? renderShareMessage(card.model, url, { template, note, renterName, lang })
      : `${note}

${url}`;
    let reached = 0;

    if (byEmail) {
      // No pick at all is a legitimate share (owner, 2026-09-02): the renter wants the message in
      // his own compose window to address himself. Nothing is recorded, because nobody was named.
      if (reachable.length) void recordRequestShare(id, reachable.map((x) => x.id), "email");
      const openedIt = openEmailCompose({
        bcc: reachable.map((x) => x.email as string),
        subject,
        body: message,
        provider,
      });
      // Too long for a URL, and a truncated body loses its tail, which is where the link is. The
      // request is posted and the link is on screen; say so rather than sending half a message.
      if (openedIt) reached += reachable.length;
      else setTooLong(true);
    }
    if (byWhatsApp) {
      /**
       * ONE chat. `wa.me` has no multi-recipient form and no browser API does, so the first pick
       * with a phone is the one it opens — said on screen before the press, because the alternative
       * is a renter who believes four people were messaged.
       *
       * With nobody picked it opens WhatsApp's own chooser instead, which is the same share with
       * the recipient left to him.
       */
      if (firstWithPhone) void recordRequestShare(id, [firstWithPhone.id], "whatsapp");
      const phone = (firstWithPhone?.phone ?? "").replace(/\D/g, "");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      if (firstWithPhone) reached += 1;
    }

    setSharedWith(reached);
    onShared?.(reached);
    setBusy(false);
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
      // A linked row still answers 400 (backend SUP-BE-20). Put it back rather than leave the renter
      // believing an address was saved that the next screen will not have.
      setRows((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, email: s.email } : x)));
    }
  };

  const previewIsEmail = tab === "email" || !byWhatsApp;
  const label = "text-label font-extrabold uppercase tracking-wide text-muted";

  return (
    <div className="grid gap-5">
      {/* ── The link ──────────────────────────────────────────────────────────────────────────── */}
      {showLink && (
      <div className="grid gap-2">
        <span className="flex items-center gap-1.5 text-body font-extrabold text-navy">
          <Icon name="lock" size={14} className="text-muted" />
          {c.linkLabel}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {/* The expiry sits beside the link because it is a property OF the link, not of the request. */}
          <span className="flex h-[34px] items-center gap-2 rounded-md border border-border px-2.5">
            <Icon name="event" size={14} className="text-muted" />
            <input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              aria-label={c.expiry}
              className="w-[112px] bg-transparent text-meta text-navy outline-none"
            />
          </span>
          {/* Locked until it exists (owner, 2026-09-02: *"users cant copy or view the link before
              sharing or posting it because it is not created yet"*). Drawn as a padlocked, dashed
              field rather than hidden: the renter needs to know a link is coming and that this is
              where it will be, or Copy looks broken rather than not-yet. */}
          <span
            className={cx(
              "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2",
              uuid ? "border-border bg-surface" : "border-dashed border-border-strong bg-surface2",
            )}
          >
            {!uuid && <Icon name="lock" size={13} className="flex-none text-muted-light" />}
            <span dir="ltr" className={cx("block min-w-0 flex-1 truncate font-mono text-meta", uuid ? "text-navy" : "text-muted-light")}>
              {uuid ? shareUrl.replace(/^https?:\/\//, "") : c.linkMasked}
            </span>
          </span>
          <button
            type="button"
            disabled={!uuid}
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
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left: who, and how ─────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <span className="flex items-center gap-2">
              <span className={label}>{c.recipients}</span>
              <span className="ms-auto text-meta font-semibold text-navy-mid">{fmt(c.selected, { n: chosen.length })}</span>
            </span>

            {/* ── A LIST, not a row of pills (owner, 2026-09-02) ────────────────────────────────
                Pills wrap into a shape that changes every time one is picked, so the renter loses
                his place in his own supplier list. Rows hold still, sort the same way every time,
                and leave room for what a pill cannot carry: the address the message is going to —
                which is the difference between a supplier who is included and one who is skipped. */}
            {/* Search, because a renter with sixty suppliers cannot find one by scrolling — and
                because narrowing the list must never change who is ticked. A pick scrolled out of
                view is still a pick, and the count above says so. */}
            {!!rows?.length && (
              <span className="flex h-[30px] items-center gap-2 rounded-md border border-border px-2.5">
                <Icon name="search" size={14} className="flex-none text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={c.searchSuppliers}
                  aria-label={c.searchSuppliers}
                  className="min-w-0 flex-1 bg-transparent text-meta text-navy outline-none"
                />
                {!!query && (
                  <button type="button" onClick={() => setQuery("")} aria-label={t.common.close} className="flex-none text-muted hover:text-navy">
                    <Icon name="close" size={13} />
                  </button>
                )}
              </span>
            )}

            {rows === null ? (
              <span className="text-meta text-muted">{c.loading}</span>
            ) : rows.length === 0 ? (
              <span className="text-meta text-muted">{c.noSuppliers}</span>
            ) : (
              <div className="max-h-[228px] overflow-auto rounded-md border border-border">
                <ul>
                  {visible.map((s) => {
                    const on = !!picked[s.id];
                    return (
                      <li key={s.id} className="border-b border-border last:border-b-0">
                        <div className={cx("flex items-center gap-2.5 px-3 py-2", on && "bg-ok-soft")}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => setPicked((p) => ({ ...p, [s.id]: !p[s.id] }))}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
                          >
                            <span
                              className={cx(
                                "grid h-[18px] w-[18px] flex-none place-items-center rounded-sm border",
                                on ? "border-ok bg-ok text-surface" : "border-border-strong",
                              )}
                            >
                              {on && <Icon name="check" size={12} />}
                            </span>
                            <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-sm bg-navy text-label font-extrabold text-surface">
                              {s.name.trim().charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <b className="block truncate text-meta font-semibold text-navy">{s.name}</b>
                              <span
                                dir="ltr"
                                className={cx("block truncate text-label", s.email ? "text-muted" : "text-danger-deep")}
                              >
                                {s.email || c.noEmail}
                              </span>
                            </span>
                            {s.verified && <Icon name="verified_user" size={14} className="flex-none text-ok" />}
                          </button>

                          {/* Fixed in place: sending him to another screen to add an address would
                              lose the selection he is building here. */}
                          {!canBeEmailed(s) &&
                            (addingEmailOn === s.id ? (
                              <span className="flex flex-none items-center gap-1.5">
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
                                className="flex-none text-meta font-semibold text-brand"
                              >
                                {c.addEmail}
                              </button>
                            ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!visible.length && <p className="px-3 py-4 text-center text-meta text-muted">{c.noMatches}</p>}
              </div>
            )}
            {byEmail && unreachable.length > 0 && sharedWith === null && (
              <span className="text-meta text-danger-deep">{fmt(c.skipping, { n: unreachable.length })}</span>
            )}
          </div>

          {/* ── SEND VIA ───────────────────────────────────────────────────────────────────────
              Moedatech is first, locked, and ticked — it is not a channel the renter chooses, it is
              where the request goes. Saying so beside the two he DOES choose is what stops him
              believing that unticking both means nobody sees his request. */}
          <div className="grid gap-2">
            <span className={label}>{c.sendVia}</span>
            <div className="flex flex-wrap items-center gap-2">
              <span
                title={c.alwaysHint}
                className="inline-flex h-[34px] flex-none items-center gap-2 rounded-md border border-ok bg-ok-soft px-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/moedatech-logomark.svg" alt="Moedatech" className="h-3.5 w-auto" />
                <Icon name="check" size={13} className="text-ok-deep" />
              </span>
              <span aria-hidden className="h-6 w-px flex-none bg-border" />
              <Channel
                on={byWhatsApp}
                onClick={() => {
                  setByWhatsApp((v) => !v);
                  setTab("whatsapp");
                }}
                icon="chat"
                label={c.whatsapp}
              />
              <Channel
                on={byEmail}
                onClick={() => {
                  setByEmail((v) => !v);
                  setTab("email");
                }}
                icon="mail"
                label={c.email}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSend}
                className={cx(btn("primary", "md"), "ms-auto flex-none")}
              >
                <Icon name="send" size={15} />
                {busy
                  ? c.posting
                  : moedatechOnly
                    ? mode === "post"
                      ? c.postMoedatechOnly
                      : c.sendMoedatechOnly
                    : mode === "post"
                      ? c.post
                      : c.send}
              </button>
            </div>
            {/* With both extras off this is the whole answer, so it is stated as a fact rather than
                left as the absence of two ticks — a renter must never wonder whether pressing Send
                with nothing selected sends nothing at all. */}
            <p
              className={cx(
                "text-meta",
                moedatechOnly ? "flex items-center gap-1.5 font-semibold text-ok-deep" : "text-muted",
              )}
            >
              {moedatechOnly && <Icon name="check_circle" size={14} className="flex-none" />}
              {moedatechOnly ? c.moedatechOnlyHint : c.alwaysHint}
            </p>

            {/* Which webmail. A renter on Gmail handed an Outlook window is in the same position as
                one handed a dead `mailto:` — a compose screen for an account he is not signed into. */}
            {byEmail && (
              <span className="flex items-center gap-2">
                <span className="text-meta text-muted">{c.openIn}</span>
                {EMAIL_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={provider === p}
                    onClick={() => {
                      setProvider(p);
                      saveEmailProvider(p);
                    }}
                    className={cx(
                      "rounded-sm px-2.5 py-1 text-meta font-semibold transition",
                      provider === p ? "bg-navy text-surface" : "text-muted hover:text-navy",
                    )}
                  >
                    {c[p]}
                  </button>
                ))}
              </span>
            )}

            {/* Said plainly: the alternative is a renter who believes four people were messaged. */}
            {byWhatsApp && sharedWith === null && (
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
            {sharedWith !== null && (
              <span className="flex items-center gap-1.5 rounded-md bg-ok-soft px-3 py-2 text-meta font-extrabold text-ok-deep">
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

          {/* ── His wording, kept (owner, 2026-09-02) ──────────────────────────────────────────
              *"users can edit the template in terms of the wording of text sections like hello etc
              not the request card itself this is fixed from us."*

              Three fields, and only three: the greeting, the line that introduces the request, and
              the sign-off. Saved on this browser, so a firm that always opens the same way types it
              once. The card between them is ours, and the panel says so where he can see it —
              because a renter who could edit the card could send one that disagrees with the request
              it links to, and the first anyone would know is a withdrawn bid at the deal room.

              Behind a toggle, not open by default: he is here to send a request, and most days the
              wording he set last month is the wording he wants. */}
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="flex items-center gap-1.5 text-meta font-semibold text-brand"
            >
              <Icon name={editing ? "expand_less" : "edit"} size={14} />
              {c.editWording}
              {!isDefaultTemplate(template, lang) && (
                <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 text-label font-extrabold text-brand-deep">
                  {c.edited}
                </span>
              )}
            </button>

            {editing && (
              <div className="grid gap-2.5 rounded-md border border-border bg-surface2 p-3">
                <p className="text-meta text-muted">{c.editWordingHint}</p>
                {(
                  [
                    ["greeting", c.tplGreeting, 1],
                    ["intro", c.tplIntro, 2],
                    ["signoff", c.tplSignoff, 2],
                  ] as const
                ).map(([field, name, lines]) => (
                  <label key={field} className="grid gap-1">
                    <span className="text-label font-extrabold uppercase tracking-wide text-muted">{name}</span>
                    <textarea
                      rows={lines}
                      value={template[field]}
                      onChange={(e) => {
                        const next = { ...template, [field]: e.target.value };
                        setTemplate(next);
                        saveTemplate(next, lang);
                      }}
                      className="rounded-sm border border-border bg-surface p-2 text-meta text-navy outline-none focus:border-brand"
                    />
                  </label>
                ))}
                <span className="flex items-center gap-3">
                  <span className="flex-1 text-label text-muted">{c.tplNameToken}</span>
                  {!isDefaultTemplate(template, lang) && (
                    <button
                      type="button"
                      onClick={() => {
                        clearTemplate(lang);
                        setTemplate(defaultTemplate(lang));
                      }}
                      className="flex-none text-meta font-semibold text-brand"
                    >
                      {c.tplReset}
                    </button>
                  )}
                </span>
              </div>
            )}
          </div>

        </div>

        {/* ── Right: what they receive ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2">
            <span className={label}>{c.preview}</span>
            {byEmail && byWhatsApp && (
              <span className="ms-auto flex gap-0.5 rounded-sm bg-surface2 p-0.5">
                <Tab on={previewIsEmail} onClick={() => setTab("email")} label={c.email} />
                <Tab on={!previewIsEmail} onClick={() => setTab("whatsapp")} label={c.whatsapp} />
              </span>
            )}
          </span>

          {!card ? (
            <p className="rounded-md border border-dashed border-border bg-surface2 px-3 py-6 text-center text-meta text-muted">
              {c.previewEmpty}
            </p>
          ) : previewIsEmail ? (
            /* ── The client's own chrome, as the prototype draws it ──────────────────────────
               A message in a plain box is a message you have to imagine arriving. In the frame it
               lands in, the renter is reading what his supplier will read.

               ⚠️ The prototype's From says `Moedatech <notifications@moedatech.net>`. It is a mock,
               and it is not what happens: this goes out from the renter's own account (owner,
               2026-09-01), so the From line names HIM.

               ⚠️ The BODY is plain text, because that is what a compose URL can carry — so the
               preview shows plain text. The card underneath is what the supplier's client draws
               from the LINK, which is a separate thing and is labelled as one. Rendering the card
               as the body would promise a rich e-mail nobody sends. */
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <div className="border-b border-border bg-surface2 px-3 py-2">
                <div className="text-meta font-extrabold text-navy">{subject}</div>
                <div className="mt-0.5 text-label text-muted">{fmt(c.fromLine, { name: renterName || c.fromYou })}</div>
              </div>
              <div className="max-h-[220px] overflow-auto p-3">
                <Message parts={parts!} fixedLabel={c.fixedByUs} />
              </div>
              {unfurl && (
                <div className="border-t border-border p-3">
                  <span className="mb-1.5 block text-label uppercase tracking-wide text-muted">{c.unfurl}</span>
                  <div className="max-h-[220px] overflow-auto" dangerouslySetInnerHTML={{ __html: unfurl }} />
                </div>
              )}
            </div>
          ) : (
            /* The chat bubble. Tinted and tailed like the real thing, with the ticks the prototype
               has — recognisable at a glance, not a replica. */
            <div className="rounded-md border border-border bg-surface2 p-3">
              <div className="max-w-[92%] rounded-md rounded-ss-none bg-surface px-3 py-2">
                <div className="max-h-[300px] overflow-auto">
                  <Message parts={parts!} fixedLabel={c.fixedByUs} />
                </div>
                <span className="mt-1 flex items-center justify-end gap-1 text-label text-muted">
                  {c.previewTime}
                  <Icon name="done_all" size={12} className="text-info" />
                </span>
              </div>
            </div>
          )}
          {!uuid && <span className="text-label text-muted">{c.previewNoLink}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * The message, with the seam showing.
 *
 * His greeting, his intro, OUR card, his sign-off, then the link. The card is drawn against a tint
 * with a padlock beside it — not to decorate it, but because the renter is about to be offered an
 * *Edit wording* button and needs to see, before he presses it, which half that button reaches.
 *
 * ⚠️ The link is last and on its own line. WhatsApp finds a URL to unfurl in a `wa.me` prefill only
 * when it ends the message; a sentence after it and no card appears (owner, 2026-09-02).
 */
function Message({ parts, fixedLabel }: { parts: ShareMessageParts; fixedLabel: string }) {
  const text = "whitespace-pre-wrap text-meta leading-relaxed text-navy";
  return (
    <div className="grid gap-2.5">
      {!!parts.greeting && <p className={text}>{parts.greeting}</p>}
      {!!parts.intro && <p className={text}>{parts.intro}</p>}
      <div className="relative rounded-sm border border-border bg-surface2 p-2.5">
        <span className="mb-1 flex items-center gap-1 text-label uppercase tracking-wide text-muted">
          <Icon name="lock" size={11} />
          {fixedLabel}
        </span>
        <p className={text}>{parts.card}</p>
      </div>
      {!!parts.signoff && <p className={text}>{parts.signoff}</p>}
      {!!parts.url && (
        <p dir="ltr" className="break-all font-mono text-meta text-info">
          {parts.url}
        </p>
      )}
    </div>
  );
}

function Channel({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex h-[34px] flex-none items-center gap-1.5 rounded-md border px-3.5 text-meta font-extrabold transition",
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
