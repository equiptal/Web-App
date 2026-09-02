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
  /**
   * The request's short code.
   *
   * No longer on the subject line (owner, 2026-09-03) — kept on the prop because the CARD still
   * carries it, and the modal reads it off whichever request the renter picks.
   */
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
  /**
   * ── ONE extra channel at a time (owner, 2026-09-02) ──────────────────────────────────────────
   *
   * *"if user selected whats and email then click send , it will take him to email or whatsapp?"*
   *
   * ~~Three independent toggles.~~ With two of them on, Send opened two tabs in the same tick and
   * the browser's pop-up blocker swallowed the second — so the renter watched one window appear,
   * assumed both had, and one channel silently never happened. There was no answer to his question
   * because the design had not decided.
   *
   * It is decided now: Moedatech always, plus at most ONE extra per press. Sending to a second
   * channel is a second press, which is honest about what it is — the link already exists by then,
   * so nothing is posted twice and `sent` remembers where it has been.
   */
  const [channel, setChannel] = useState<"none" | "email" | "whatsapp" | "other">("email");
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [provider, setProvider] = useState<EmailProvider>("outlook");
  /** The renter's own wording, kept on this browser so every request after this one carries it. */
  const [template, setTemplate] = useState<ShareTemplate>(() => defaultTemplate("en"));
  const [query, setQuery] = useState("");
  /** Which group the list is cut to. Empty is all of them. */
  const [group, setGroup] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [uuid, setUuid] = useState<string | null>(requestUuid);
  const [sharedWith, setSharedWith] = useState<number | null>(null);
  /** Which channels this request has already gone out on, so a second press is not a mystery. */
  const [sent, setSent] = useState<string[]>([]);
  /**
   * What is waiting on his clipboard, and therefore what the panel tells him to paste.
   *
   * Never both: the clipboard holds one thing, and each provider is missing exactly one.
   */
  const [pasteNeeded, setPasteNeeded] = useState<"addresses" | "card" | null>(null);
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

  const subject = c.subject;

  /**
   * The card the LINK turns into in the supplier's app — the thing WhatsApp draws, and the thing a
   * renter means when he says *"the link preview"*.
   *
   * ⚠️ Drawn BEFORE the post as well (owner, 2026-09-02: *"why in the preview i dont see like the
   * link preview itself"*). It used to need `shareUrl`, which does not exist until the request does,
   * so the one thing a supplier actually sees was missing from the screen where the renter decides
   * whether to send it.
   *
   * Everything on the card except the picture comes from the draft and is already correct. The
   * picture is generated per request by `/bid/<token>/og`, and before there is a token the generic
   * band stands in — the same navy mark the supplier would see if the render ever failed, so the
   * stand-in is a real state of the card rather than an invention.
   */
  const unfurl = card
    ? bidCardHtml(
        {
          title: card.model.cardTitle,
          description: card.model.where ?? "",
          // Deliberately this app's host, not the OS: the emailed card and the unfurled card are
          // served from the same place so they cannot drift apart. Guarded because `window` does
          // not exist during SSR.
          /**
           * The real rendering once there is a token to render for. Empty before that — NOT the
           * generic file: `/og-bid.png` is a navy rectangle with the logo on it and nothing else, so
           * standing it in made the half of the card a supplier sees first the one part of the
           * preview that was untrue. `bidCardHtml` draws the band from the model instead.
           */
          imageUrl:
            card.imageUrl ||
            (typeof window === "undefined" || !uuid ? "" : `${window.location.origin}/bid/${uuid}/og`),
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
  const moedatechOnly = channel === "none";
  const canSend = !busy;

  /**
   * The list, narrowed. Narrowing never changes the ticks — a hidden pick is still a pick, and the
   * count above the list is what says so.
   */
  const visible = (rows ?? []).filter(
    (r) =>
      (!group || (r.groups ?? []).includes(group)) &&
      (!query.trim() || r.name.toLowerCase().includes(query.trim().toLowerCase())),
  );

  /** Every group the renter actually uses, in the order he sees them on My Suppliers. */
  const groups = [...new Set((rows ?? []).flatMap((r) => r.groups ?? []))].sort((a, b) => a.localeCompare(b));

  /**
   * Tick everything the list is currently showing — which is how a GROUP gets sent to.
   *
   * Cut the list to *Site A* and press this, and the whole site is picked. There is no separate
   * "send to a group" control because there does not need to be: the group is a filter, and picking
   * what a filter left is the same act whether it filtered by group or by name.
   */
  const allShownPicked = visible.length > 0 && visible.every((r) => picked[r.id]);
  const toggleAllShown = () =>
    setPicked((prev) => {
      const next = { ...prev };
      for (const r of visible) next[r.id] = !allShownPicked;
      return next;
    });

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

    if (channel === "email") {
      // No pick at all is a legitimate share (owner, 2026-09-02): the renter wants the message in
      // his own compose window to address himself. Nothing is recorded, because nobody was named.
      if (reachable.length) void recordRequestShare(id, reachable.map((x) => x.id), "email");

      /**
       * ── ONE paste, and which one depends on the provider (owner, 2026-09-03) ──────────────────
       *
       * *"he will be so confused once he will paste contacts and once he will paste the template."*
       * He would have been, and worse: **the clipboard holds one thing.** Copying the card on every
       * e-mail send and also offering an addresses button meant the second quietly destroyed the
       * first, and whichever he pasted, the other was gone.
       *
       * They are never both needed. Each provider is missing exactly one thing, and it is a
       * different thing:
       *
       *   - **Outlook** discards `bcc` from a URL, so its window opens with no recipients — and its
       *     composer builds the card itself from the link. He needs the ADDRESSES.
       *   - **Gmail** takes `bcc` properly, so its recipients are already filled in — and its
       *     composer never fetches a link, so no card will ever appear. He needs the CARD.
       *
       * So the clipboard carries the one thing his provider cannot supply, and the panel names it
       * and says where it goes. One paste, never two, and never a choice about which.
       *
       * Not awaited, deliberately: `window.open` must fire inside the click that caused it, and an
       * `await` first hands the pop-up blocker a reason to swallow the compose window.
       */
      if (provider === "outlook") {
        if (reachable.length) {
          void navigator.clipboard?.writeText(reachable.map((x) => x.email).join("; ")).catch(() => {});
          setPasteNeeded("addresses");
        }
      } else if (card) {
        void copyShareMessage(
          url,
          bidCardHtml(
            {
              title: card.model.cardTitle,
              description: card.model.where ?? "",
              imageUrl: card.imageUrl || `${window.location.origin}/bid/${id}/og`,
              url,
            },
            card.model,
            lang,
          ),
        ).catch(() => {});
        setPasteNeeded("card");
      }

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
    if (channel === "whatsapp") {
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
    if (channel === "other") {
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

    // Cumulative, because a second press is a second channel, not a correction of the first.
    setSharedWith((prev) => (prev ?? 0) + reached);
    if (channel !== "none") setSent((prev) => (prev.includes(channel) ? prev : [...prev, channel]));
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
  const previewIsEmail = channel === "email";
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
              <span className="flex flex-wrap items-center gap-2">
                {!!groups.length && (
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    aria-label={c.allGroups}
                    className="h-[30px] flex-none rounded-md border border-border bg-surface px-2 text-meta font-semibold text-navy outline-none"
                  >
                    <option value="">{c.allGroups}</option>
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                )}
                <span className="flex h-[30px] min-w-[140px] flex-1 items-center gap-2 rounded-md border border-border px-2.5">
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
                {/* The whole of whatever is showing. With a group chosen, this IS «send to the
                    group»; with a search typed, it is «everyone called Zahid». One control, because
                    it is one act. */}
                <button
                  type="button"
                  onClick={toggleAllShown}
                  disabled={!visible.length}
                  className="flex-none text-meta font-semibold text-brand disabled:text-muted-light"
                >
                  {allShownPicked ? c.pickNone : fmt(c.pickAll, { n: visible.length })}
                </button>
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
            {channel === "email" && unreachable.length > 0 && sharedWith === null && (
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
                on={channel === "whatsapp"}
                onClick={() => setChannel((v) => (v === "whatsapp" ? "none" : "whatsapp"))}
                icon="chat"
                label={c.whatsapp}
                done={sent.includes("whatsapp")}
              />
              <Channel
                on={channel === "email"}
                onClick={() => setChannel((v) => (v === "email" ? "none" : "email"))}
                icon="mail"
                label={c.email}
                done={sent.includes("email")}
              />
              {/* ── The provider is asked WHERE the channel is (owner, 2026-09-02) ────────────
                  *"when user click email they will ask to share through outlook or gmail instead of
                  having them here."* It was a standing row of its own below, which made it read as
                  a fourth setting rather than as part of the one channel it belongs to. Pressing
                  E-mail reveals it, in the same row, beside the chip it qualifies. */}
              {channel === "email" &&
                EMAIL_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={provider === p}
                    onClick={() => {
                      setProvider(p);
                      saveEmailProvider(p);
                    }}
                    className={cx(
                      "h-[26px] flex-none rounded-sm px-2.5 text-meta font-semibold transition",
                      provider === p ? "bg-navy text-surface" : "text-muted hover:text-navy",
                    )}
                  >
                    {c[p]}
                  </button>
                ))}
              {/* Anywhere else — the device's own sheet, and the clipboard where there is none. */}
              <Channel
                on={channel === "other"}
                onClick={() => setChannel((v) => (v === "other" ? "none" : "other"))}
                icon="ios_share"
                label={c.other}
                done={sent.includes("other")}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSend}
                className={cx(btn("primary", "md"), "ms-auto flex-none")}
              >
                <Icon name="send" size={15} />
                {/* The only send on this screen: the review's own «Send to suppliers» button is
                    gone, because two buttons that both post a request is one too many and neither
                    of them said which suppliers.

                    Once it has ALREADY gone somewhere, the same button is how it goes somewhere
                    else — pick another channel, press again. It reads off `sent`, not off the uuid:
                    a request that exists but has never been shared from here is a first send, and
                    calling that «again» would be a lie. */}
                {busy
                  ? c.posting
                  : sent.length
                    ? c.shareAgain
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

            {/* ── Outlook discards `bcc`, so its recipients ride in `to` ────────────────────────
                Said out loud, because a renter sending to eight competitors has a right to know
                they will see each other — and given a way out that does not depend on Outlook
                honouring a parameter it does not document.

                *Copy addresses* is that way out: paste into Outlook's own Bcc field, clear the To
                line, send. Two actions, and they work in every version of Outlook there has ever
                been, which no URL parameter can promise. */}
            {/* ── Outlook's window opens EMPTY, and the addresses are handed over to paste ──────
                Its deeplink documents `to`, `subject` and `body`. `bcc` is discarded, and the
                renter would rather paste than have eight competitors put in one another's To line
                to work around it (owner, 2026-09-03).

                So this is not a warning about a compromise — it is the step. Stated as one, with the
                addresses one press away, because a compose window that opens with no recipients and
                no explanation is the feature looking broken. */}
            {/* Said plainly: the alternative is a renter who believes four people were messaged. */}
            {channel === "whatsapp" && sharedWith === null && (
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
            {/* What happened, and what may still happen. A renter who has just e-mailed four people
                and now wants the same request on WhatsApp needs to be told that is a press away —
                otherwise the confirmation reads as the end of the road and he goes looking for a
                second Share button that does not exist. */}
            {sharedWith !== null && (
              <span className="grid gap-1 rounded-md bg-ok-soft px-3 py-2">
                <span className="flex items-center gap-1.5 text-meta font-extrabold text-ok-deep">
                  <Icon name="check_circle" size={15} />
                  {sharedWith === 0 ? c.postedOnly : sharedWith === 1 ? c.doneOne : fmt(c.done, { n: sharedWith })}
                </span>
                {/* The clipboard holds ONE thing, so this names that thing and where it goes. It
                    is the only instruction on the screen at this moment, which is the point. */}
                {pasteNeeded && (
                  <span className="flex items-start gap-1.5 rounded-sm bg-surface px-2 py-1.5 text-label font-semibold text-navy">
                    <Icon name="content_paste" size={13} className="mt-px flex-none text-brand" />
                    {pasteNeeded === "addresses" ? c.nowPasteAddresses : c.nowPasteCard}
                  </span>
                )}
                <span className="text-label text-ok-deep">{c.shareAgainHint}</span>
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
                  unfurl={null}
                />
              </div>
            </div>
          ) : (
            /* The chat bubble — recognisable at a glance, not a replica.

               The card sits INSIDE the bubble here, under the message, because that is where WhatsApp
               puts it: one bubble carrying the words and the preview together. In the e-mail frame it
               is a separate block under the body, because that is where a mail client puts it. Same
               card, drawn where each client actually draws it. */
            <div className="max-h-[460px] overflow-auto rounded-md border border-border bg-surface2 p-3">
              <div className="max-w-[94%] rounded-md rounded-ss-none bg-surface px-3 py-2">
                <Message
                  parts={parts}
                  template={template}
                  onChange={patchTemplate}
                  c={c}
                  linkPending={!uuid}
                  unfurl={unfurl}
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
/**
 * ── The preview is per CHANNEL, because the message is (owner, 2026-09-03) ──────────────────────
 *
 * *"just make sure the preview always same as actual in what will be sent in the channel."*
 *
 * One message, two things that can happen to it:
 *
 *   - **E-mail.** A compose URL carries `text/plain` and nothing else, so the details arrive as
 *     WORDS. `unfurl` is null here and the card is not drawn — Gmail builds none, and Outlook's is
 *     the same picture the link would unfurl anywhere. Drawing a card in this frame would promise a
 *     laid-out message that only appears if the renter pastes.
 *   - **WhatsApp.** The same words, and WhatsApp fetches the link and draws the card ITSELF, above
 *     the bubble. So the card belongs in that preview — and the details genuinely do appear twice
 *     there, once as text and once in the card. That repetition is WhatsApp's, not ours: take the
 *     URL out of the message and the card never gets built.
 */
function Message({
  parts,
  template,
  onChange,
  c,
  linkPending,
  unfurl,
}: {
  parts: ShareMessageParts;
  template: ShareTemplate;
  onChange: (field: keyof ShareTemplate, value: string) => void;
  c: ReturnType<typeof useT>["intake"]["postShare"];
  linkPending: boolean;
  /** The card, when there is one. Its absence falls back to the same facts as words. */
  unfurl: string | null;
}) {
  return (
    <div className="grid gap-2.5">
      <Editable value={template.greeting} display={parts.greeting} onChange={(v) => onChange("greeting", v)} label={c.tplGreeting} />
      <Editable value={template.intro} display={parts.intro} onChange={(v) => onChange("intro", v)} label={c.tplIntro} />

      {/* ── ONE details element, and it is WORDS (owner, 2026-09-02, then 2026-09-03) ────────
          *"so request details is duplicated in the card and in the text itslef?"* — and the answer
          was yes, twice over: these facts as a text block, and again as a card underneath.

          There is one now, and it is the text, because the text is what every channel actually
          carries. A compose URL takes `text/plain`; SMS takes text; a supplier with images off
          reads text. The card is not a second copy of this — it is what SOME apps build for
          themselves out of the link, and it is drawn below only in the channel that really builds
          one.

          Not editable: a supplier prices what this says, and a block that disagrees with the
          request it links to is found out at the deal room. */}
      <div title={c.fixedByUs}>
        <p className="whitespace-pre-wrap text-meta leading-relaxed text-navy">{parts.card}</p>
        <span className="mt-1.5 flex items-start gap-1 text-label text-muted">
          <Icon name="lock" size={10} className="mt-0.5 flex-none" />
          {c.cardAsText}
        </span>
      </div>

      <Editable value={template.signoff} display={parts.signoff} onChange={(v) => onChange("signoff", v)} label={c.tplSignoff} />

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

      {/* WhatsApp builds this itself, from the link above, and shows it with the words. Drawn only
          where it really appears — so the preview is the message, per channel, and not a hope. */}
      {unfurl && (
        <div className="grid gap-1">
          <span className="text-label uppercase tracking-wide text-muted">{c.whatsappDraws}</span>
          <div
            className="max-w-[360px] [&_img]:!h-auto [&_img]:!w-full [&_table]:!w-full [&_table]:!max-w-full"
            dangerouslySetInnerHTML={{ __html: unfurl }}
          />
        </div>
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
 *
 * ⚠️ **Raw while he types, RESOLVED the rest of the time.**
 *
 * The template stores `{name}`, which is what he must see to edit it — but a preview that reads
 * *"{name} invites you to bid"* is showing him a message nobody receives, and this panel exists to
 * end exactly that gap between the preview and the send. So `display` (the filled line, and the
 * no-name wording when we cannot name him) is what is drawn until the field takes focus, and the
 * token comes back the moment he clicks in.
 */
function Editable({
  value,
  display,
  onChange,
  label,
}: {
  /** What is stored and edited — with `{name}` in it. */
  value: string;
  /** What is sent — the same line with the name filled in. Shown whenever the field is not focused. */
  display: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [editing, setEditing] = useState(false);
  const shown = editing ? value : display;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [shown]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={shown}
      aria-label={label}
      placeholder={label}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none overflow-hidden rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-meta leading-relaxed text-navy outline-none transition hover:border-dashed hover:border-border-strong focus:border-solid focus:border-brand focus:bg-surface"
    />
  );
}

/**
 * One extra channel.
 *
 * `done` marks one this request has already gone out on, so a renter coming back to send it
 * somewhere else can see at a glance where it has been — which is the whole reason a second press
 * is allowed at all.
 */
function Channel({
  on,
  onClick,
  icon,
  label,
  done,
}: {
  on: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  done?: boolean;
}) {
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
      {done && <Icon name="check" size={13} className="text-ok-deep" />}
    </button>
  );
}

