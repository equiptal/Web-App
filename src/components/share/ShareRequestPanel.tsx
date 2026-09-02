"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { copyShareMessage, shareMessageHtml } from "@/lib/copyShareMessage";
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
  /**
   * Draw the expiry beside the link.
   *
   * Off where the shell owns a richer one — the bid-link sheet's editor takes a date AND a time and
   * can clear it, which a plain date box cannot. Two controls writing the same deadline is worse
   * than either of them alone.
   */
  showExpiry?: boolean;
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
  showExpiry = true,
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
  /** Anywhere else — the device's own share sheet, or the clipboard where there is none. */
  const [byOther, setByOther] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [provider, setProvider] = useState<EmailProvider>("outlook");
  const [tab, setTab] = useState<"email" | "plain">("email");
  /** The renter's own wording, kept on this browser so every request after this one carries it. */
  const [template, setTemplate] = useState<ShareTemplate>(() => defaultTemplate("en"));
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

  // The Supplier OS host, not this app's origin, so there is nothing to read off `window` and the
  // value is already final on the server render.
  const shareUrl = useMemo(() => (uuid ? bidShareUrl(uuid) : ""), [uuid]);

  const card = useBidCard(shareUrl, lang, draftForm);

  const chosen = (rows ?? []).filter((s) => picked[s.id]);
  const reachable = chosen.filter(canBeEmailed);
  const unreachable = chosen.filter((s) => !canBeEmailed(s));
  const firstWithPhone = chosen.find((s) => s.phone?.trim()) ?? null;

  /** The same message in its halves, so the preview can show which of them he may edit. */
  const parts = card ? shareMessageParts(card.model, shareUrl, { template, renterName, lang }) : null;

  const subject = fmt(c.subject, { code: requestCode ?? "" }).trim();

  /** What the link unfurls into in the supplier's client — the card, not the body. */
  const unfurl =
    card && shareUrl
      ? bidCardHtml(
          {
            title: card.model.cardTitle,
            description: card.model.where ?? "",
            // Deliberately this app's host, not the OS: the emailed card and the unfurled card are
            // served from the same place so they cannot drift apart. Guarded because `shareUrl` is
            // now truthy during SSR, where `window` does not exist.
            imageUrl:
              card.imageUrl ||
              (typeof window === "undefined" ? "" : `${window.location.origin}/bid/${uuid}/og`),
            url: shareUrl,
          },
          card.model,
          lang,
        )
      : null;

  /**
   * ⚠️ **Send is never gated on a channel being able to reach someone** (owner, 2026-09-02:
   * *"nothing happen when i click post and share"*).
   *
   * ~~It used to be: `moedatechOnly || !chosen.length || (byEmail && reachable.length) || …`~~ Tick a
   * supplier who has no e-mail with E-mail on, and every clause was false. The button went quietly
   * disabled, so pressing it did nothing at all — and because the post happens on this press, **the
   * request was never created either**. Four of a typical renter's suppliers have no address, so
   * this was not an edge.
   *
   * The model was wrong, not just the expression. Moedatech is always a destination, so posting is
   * always valid; the extra channels do what they can and say what they could not. Nothing about
   * who is picked may stop a request from being created.
   */
  const moedatechOnly = !byEmail && !byWhatsApp && !byOther;
  const canSend = !busy;

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

    const url = bidShareUrl(id);
    // No card means no request worth describing; the link alone is still a valid share.
    const message = card ? renderShareMessage(card.model, url, { template, renterName, lang }) : url;
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
    if (byOther) {
      /**
       * The device's own sheet. `navigator.share` needs a user gesture and HTTPS, and it rejects on
       * a cancel as well as on a failure — so a rejection is never treated as an error, it just
       * falls through to the clipboard, which is what a desktop browser gets anyway.
       */
      const shared = await navigator
        .share?.({ title: subject, text: message })
        .then(() => true)
        .catch(() => false);
      if (!shared) {
        /* Both flavours here, unlike Copy: *More* means "send this somewhere", so a paste into
           Gmail should arrive as the laid-out message with the card, and a paste into a chat as the
           words. Copy means "give me the URL", which is a different question. */
        await copyShareMessage(
          message,
          card
            ? shareMessageHtml(card.model, url, card.imageUrl || `${window.location.origin}/bid/${id}/og`, {
                template,
                renterName,
                lang,
              })
            : message,
        ).catch(() => {});
        setCopiedMessage(true);
        setTimeout(() => setCopiedMessage(false), 2400);
      }
    }

    setSharedWith(reached);
    onShared?.(reached);
    setBusy(false);
  };

  /**
   * One of his own lines changed.
   *
   * Saved on every keystroke rather than behind a Save button: there is no Save on this panel, and
   * a wording he typed and then sent without pressing anything must still be there next month.
   */
  const patchTemplate = (field: keyof ShareTemplate, value: string) => {
    const next = { ...template, [field]: value };
    setTemplate(next);
    saveTemplate(next, lang);
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

  /**
   * Which frame the preview draws.
   *
   * ⚠️ No tabs (owner, 2026-09-02). Pressing WhatsApp and then having to press WhatsApp AGAIN in a
   * tab strip to see it is asking the same question twice; the channel row is already the answer.
   * `tab` is set by the channel buttons and only ever shows a channel that is actually on.
   */
  const previewIsEmail = byEmail && (tab === "email" || (!byWhatsApp && !byOther));
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
          {/* The expiry sits beside the link because it is a property OF the link, not of the
              request — and it is named, because a bare date box beside a URL could be anything. */}
          {showExpiry && (
            <span className="flex h-[34px] items-center gap-2 rounded-md border border-border px-2.5">
              <Icon name="event" size={14} className="flex-none text-muted" />
              <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.expiry}</span>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                aria-label={c.expiry}
                className="w-[112px] bg-transparent text-meta text-navy outline-none"
              />
            </span>
          )}
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
              /**
               * The link, and only the link (owner, 2026-09-02: *"copy link must only copy the
               * linkl not the message"*).
               *
               * ~~It briefly copied the whole message in two flavours.~~ That made the one control
               * a renter reaches for when he needs a URL — a CRM field, a WhatsApp Business
               * template, a purchase order — hand him four paragraphs instead. The template still
               * travels: every app that unfurls a link draws the card from the URL itself, which is
               * what `/bid/[token]/og` is for. Where a renter wants the words as well, that is what
               * *More* does.
               */
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
      </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
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
              <div className="max-h-[300px] overflow-auto rounded-md border border-border">
                <ul>
                  {visible.map((s) => {
                    const on = !!picked[s.id];
                    return (
                      <li key={s.id} className="border-b border-border last:border-b-0">
                        <div className={cx("flex items-center gap-3 px-3 py-2", on && "bg-ok-soft")}>
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
                {/* The wordmark the nav bar carries, so the renter recognises it as us rather than
                    as an icon he has to decode. `brightness-0` forces it to ink on the pale chip;
                    the nav inverts the same file to white on navy. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/moedatech-logo.svg" alt="Moedatech" className="h-3 w-auto brightness-0" />
                <Icon name="check" size={13} className="text-ok-deep" />
              </span>
              <span aria-hidden className="h-6 w-px flex-none bg-border" />
              <Channel
                on={byWhatsApp}
                onClick={() => {
                  setByWhatsApp((v) => !v);
                  setTab("plain");
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
              {/* ── Anywhere else (owner, 2026-09-02) ─────────────────────────────────────────
                  A renter whose supplier is on Telegram, or who wants the message in his own notes,
                  had no way out of the two named channels. This hands the message to the device's
                  own share sheet — every app on the machine, not a list we chose — and copies it
                  where there is no sheet, which is most desktop browsers. */}
              <Channel
                on={byOther}
                onClick={() => {
                  setByOther((v) => !v);
                  setTab("plain");
                }}
                icon="ios_share"
                label={c.other}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSend}
                className={cx(btn("primary", "md"), "ms-auto flex-none")}
              >
                <Icon name="send" size={15} />
                {/* The only send on this screen now: the review's own «Send to suppliers» button is
                    gone, because two buttons that both post a request is one too many and neither
                    of them said which suppliers. */}
                {busy
                  ? c.posting
                  : moedatechOnly
                    ? mode === "post"
                      ? c.postMoedatechOnly
                      : c.sendMoedatechOnly
                    : c.sendToSuppliers}
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
            {copiedMessage && (
              <span className="flex items-center gap-1.5 text-meta font-semibold text-ok-deep">
                <Icon name="check" size={14} />
                {c.messageCopied}
              </span>
            )}
            {/* What actually happened, not a blanket «shared». A send that reached nobody by e-mail
                still POSTED, and saying «shared with 0 suppliers» would read as a failure when the
                request is live on Moedatech and waiting. */}
            {sharedWith !== null && (
              <span className="flex items-center gap-1.5 rounded-md bg-ok-soft px-3 py-2 text-meta font-extrabold text-ok-deep">
                <Icon name="check_circle" size={15} />
                {sharedWith === 0 ? c.postedOnly : sharedWith === 1 ? c.doneOne : fmt(c.done, { n: sharedWith })}
              </span>
            )}
          </div>

        </div>

        {/* ── Right: what they receive, and where he writes it ─────────────────────────────
            The preview IS the editor (owner, 2026-09-02: *"i want the template itself editable and
            will be reflected in what will be sent"*).

            It used to be a read-only panel with a separate *Edit the wording* drawer beneath it and
            a *A line of your own* box beside that — three places to type one message, and the thing
            he was editing was not the thing he was looking at. Now his own lines are fields drawn to
            look exactly like the text they will become, and our card between them is not.

            No tabs: the channel row above already says which one he is sending, and asking again
            here is asking twice. */}
        <div className="flex flex-col gap-2">
          <span className="flex items-baseline gap-2">
            <span className={label}>{c.preview}</span>
            <span className="ms-auto text-label text-muted">{c.editHint}</span>
          </span>

          {!card || !parts ? (
            <p className="rounded-md border border-dashed border-border bg-surface2 px-3 py-6 text-center text-meta text-muted">
              {c.previewEmpty}
            </p>
          ) : previewIsEmail ? (
            /* ⚠️ The prototype's From says `Moedatech <notifications@moedatech.net>`. It is a mock,
               and it is not what happens: this goes out from the renter's own account (owner,
               2026-09-01), so the From line names HIM. */
            <div className="flex max-h-[460px] flex-col overflow-hidden rounded-md border border-border bg-surface">
              <div className="flex-none border-b border-border bg-surface2 px-3 py-2">
                <div className="text-meta font-extrabold text-navy">{subject}</div>
                <div className="mt-0.5 text-label text-muted">{fmt(c.fromLine, { name: renterName || c.fromYou })}</div>
              </div>
              {/* One scroll region for the whole message. It used to be three, nested — the body,
                  the card under it and the dialog around both — and a renter reading a message he is
                  about to send should not have to work out which of three bars moves what. */}
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <Message
                  parts={parts}
                  template={template}
                  onChange={patchTemplate}
                  c={c}
                  linkPending={!uuid}
                />
                {unfurl && (
                  <div className="mt-3 border-t border-border pt-3">
                    <span className="mb-1.5 block text-label uppercase tracking-wide text-muted">{c.unfurl}</span>
                    {/* The card is laid out for e-mail at a fixed 440px; these let it shrink into the
                        column rather than pushing a sideways scrollbar through the panel. */}
                    <div
                      className="[&_img]:!h-auto [&_img]:!w-full [&_table]:!w-full [&_table]:!max-w-full"
                      dangerouslySetInnerHTML={{ __html: unfurl }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* The chat bubble — recognisable at a glance, not a replica. */
            <div className="max-h-[460px] overflow-auto rounded-md border border-border bg-surface2 p-3">
              <div className="max-w-[94%] rounded-md rounded-ss-none bg-surface px-3 py-2">
                <Message
                  parts={parts}
                  template={template}
                  onChange={patchTemplate}
                  c={c}
                  linkPending={!uuid}
                />
              </div>
            </div>
          )}

          {!isDefaultTemplate(template, lang) && (
            <button
              type="button"
              onClick={() => {
                clearTemplate(lang);
                setTemplate(defaultTemplate(lang));
              }}
              className="self-start text-meta font-semibold text-brand"
            >
              {c.tplReset}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The message, with his own lines editable in place.
 *
 * His greeting, his intro, OUR card, his sign-off, then the link. The three of his are fields drawn
 * to look exactly like the text they will become — no boxes, no labels, no separate drawer — so
 * what he is editing and what he is reading are the same object. That was the complaint: the
 * preview and the message were two different things on the screen at once.
 *
 * The card between them is text, never a field. A renter who could edit it could send a card that
 * disagrees with the request it links to, and the first anyone would know is a withdrawn bid at the
 * deal room.
 *
 * ⚠️ The link is last and on its own line. WhatsApp finds a URL to unfurl in a `wa.me` prefill
 * only when it ends the message; a sentence after it and no card appears (owner, 2026-09-02).
 */
function Message({
  parts,
  template,
  onChange,
  c,
  linkPending,
}: {
  parts: ShareMessageParts;
  template: ShareTemplate;
  onChange: (field: keyof ShareTemplate, value: string) => void;
  c: ReturnType<typeof useT>["intake"]["postShare"];
  linkPending: boolean;
}) {
  return (
    <div className="grid gap-2.5">
      <Editable value={template.greeting} onChange={(v) => onChange("greeting", v)} label={c.tplGreeting} />
      <Editable value={template.intro} onChange={(v) => onChange("intro", v)} label={c.tplIntro} />

      {/* Ours. A hairline rail and a padlock rather than a filled box with a heading: the renter is
          reading the message his supplier gets, and a titled panel in the middle of it is chrome
          nobody receives. */}
      <div className="relative ps-3" title={c.fixedByUs}>
        <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 rounded-full bg-border-strong" />
        <span className="mb-0.5 flex items-center gap-1 text-label uppercase tracking-wide text-muted-light">
          <Icon name="lock" size={10} />
          {c.fixedByUs}
        </span>
        <p className="whitespace-pre-wrap text-meta leading-relaxed text-navy">{parts.card}</p>
      </div>

      <Editable value={template.signoff} onChange={(v) => onChange("signoff", v)} label={c.tplSignoff} />

      {parts.url ? (
        <p dir="ltr" className="break-all font-mono text-meta text-info">
          {parts.url}
        </p>
      ) : (
        linkPending && (
          <p className="flex items-center gap-1.5 font-mono text-meta text-muted-light">
            <Icon name="lock" size={11} />
            {c.linkMasked}
          </p>
        )
      )}
    </div>
  );
}

/**
 * One of the renter's own lines: a field that looks like the text it will be.
 *
 * It grows with what he types rather than scrolling inside itself, because a two-line greeting that
 * shows one line is a message he cannot read — which is the whole failing this panel exists to fix.
 * The dashed underline appears on hover and focus only: a page of permanently boxed fields stops
 * looking like a message.
 */
function Editable({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={label}
      placeholder={label}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none overflow-hidden rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-meta leading-relaxed text-navy outline-none transition hover:border-dashed hover:border-border-strong focus:border-solid focus:border-brand focus:bg-surface"
    />
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

