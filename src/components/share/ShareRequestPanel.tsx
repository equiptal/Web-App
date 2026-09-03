"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import { VendorMark } from "@/components/VendorMark";
import { MoedatechBadge } from "@/components/MoedatechBadge";
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
import { canBeEmailed, isOnMoedatech } from "@/lib/contract/renter-suppliers";
import { AddSuppliersDialog } from "@/components/suppliers/AddSuppliersDialog";
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
  loadEmailProvider,
  openEmailCompose,
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
  /**
   * Fired once a share has gone out. `channel` is `"none"` when the request went to Moedatech alone
   * — the only case where nothing opened in another tab, and therefore the only case where a caller
   * should say so immediately rather than wait for the renter to come back.
   */
  onShared?: (count: number, channel: string) => void;
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
  /**
   * The screen's own heading, drawn at the head of the LINK ROW rather than above it.
   *
   * Owner, 2026-09-03: *"can you make the expiry date, link, copy and preview on one row with Share
   * this request… so they fit in one row and the content below goes up."* The heading had a band of
   * its own over a row of controls that reaches nowhere near the left edge, so the card opened with
   * two half-empty lines before anything a renter could act on.
   *
   * A slot rather than a string, because the shells disagree about what the heading IS: the card on
   * *Ready to send* owns an `<h2>`, and the modal has the dialog's own title bar and passes nothing.
   */
  heading?: ReactNode;
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
  heading,
}: ShareRequestPanelProps) {
  const t = useT();
  const c = t.intake.postShare;
  const { locale } = useLocale();
  const lang = locale === "ar" ? "ar" : "en";

  const [rows, setRows] = useState<RenterSupplier[] | null>(null);
  /**
   * Nobody is ticked by default (owner, 2026-09-03).
   *
   * A pre-ticked list is a decision made for him that he has to notice and undo. `preselect` is the
   * row action — he chose that supplier by pressing his row — and is the only thing that starts on.
   */
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
  const [channel, setChannel] = useState<"none" | "email" | "whatsapp" | "other">("none");
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
  /**
   * ── What actually happened, and it is not "shared" (owner, 2026-09-03) ──────────────────────
   *
   * *"this is tracking what? because i didnt send anything the whatsapp was pending."*
   *
   * ~~`sharedWith` counted a successful `window.open`.~~ Opening a compose window is not sending a
   * message: the renter may read it, edit it, close it, or never come back. We hand the message to
   * his mail app and lose sight of it there — there is no callback, and there cannot be one.
   *
   * So this records the HAND-OFF, and the copy says so. A count of sends we cannot observe is a
   * number that will be wrong for every renter who changes his mind.
   */
  const [handedOff, setHandedOff] = useState<{ channel: string; n: number } | null>(null);
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
  /** *Add my suppliers*, opened from the `+` beside the search — see that control. */
  const [addingSupplier, setAddingSupplier] = useState(false);
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

  /**
   * What the link field shows before there is a link.
   *
   * ⚠️ **The SHAPE of the coming link, not a sentence about it** (owner, 2026-09-03: *"in the link
   * locked placeholder will show part of the name of the link with ***"*).
   *
   * ~~It briefly carried the hint sentence instead, on the reasoning that the sentence explained the
   * dots so the dots did no work.~~ They do different work: the sentence says WHEN, and the mask says
   * WHAT — a renter who has never shared one of these has no picture of the thing he is waiting for,
   * and the host is the half of a URL a person actually reads.
   *
   * ⚠️ Built from `bidShareUrl`, never from `window.location`: the link points at the supplier OS,
   * not at this app. Through the real builder, the placeholder and the finished link differ in
   * exactly one thing — the token.
   */
  const maskedLink = useMemo(() => bidShareUrl("••••" + "*".repeat(10)).replace(/^https?:\/\//, ""), []);

  const card = useBidCard(shareUrl, lang, draftForm);

  /**
   * What a supplier actually opens.
   *
   * The real bid form once the request exists; the static mock in `public/` before that. Not a
   * different idea — `Confirmation` has linked the same pair since this feature shipped.
   */
  const formUrl = useMemo(() => {
    if (shareUrl) return shareUrl;
    return typeof window === "undefined" ? "" : `${window.location.origin}/supplier-bid-v2.html?preview=1`;
  }, [shareUrl]);

  const chosen = (rows ?? []).filter((s) => picked[s.id]);
  const reachable = chosen.filter(canBeEmailed);
  const unreachable = chosen.filter((s) => !canBeEmailed(s));
  const firstWithPhone = chosen.find((s) => s.phone?.trim()) ?? null;
  const noPhone = chosen.filter((s) => !s.phone?.trim());

  /** The same message in its halves, so the preview can show which of them he may edit. */
  const parts = card ? shareMessageParts(card.model, shareUrl, { template, renterName, lang }) : null;

  /**
   * `RFQ for Crawler Excavator 20 ton` (owner, 2026-09-03).
   *
   * ~~"A new equipment request for you".~~ A supplier's inbox holds forty of those; the subject line
   * is the one place he decides whether to open it, so it names the machine. `imageHeadline` is used
   * rather than the card title because it is the short form — first machine, then the count of the
   * rest — and a subject line is cut at about sixty characters.
   */
  const subject = card ? fmt(c.subject, { equipment: card.model.imageHeadline }) : c.subject.replace("{equipment}", "").trim();

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
          /* Falls back to the OS base so the card's domain line names the host a supplier will
             really see, rather than going blank until the request exists. */
          url: shareUrl || bidShareUrl(""),
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
    setHandedOff({ channel, n: reached });
    if (channel !== "none") setSent((prev) => (prev.includes(channel) ? prev : [...prev, channel]));
    onShared?.(reached, channel);
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

  /** Saves whichever contact the chosen channel is missing — an address, or a number. */
  const saveContact = async (s: RenterSupplier) => {
    const value = emailDraft.trim();
    if (!value) return;
    const field = channel === "whatsapp" ? "phone" : "email";
    setRows((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, [field]: value } : x)));
    setAddingEmailOn(null);
    setEmailDraft("");
    try {
      await updateRenterSupplier(s.id, { [field]: value });
    } catch {
      // A linked row still answers 400 (backend SUP-BE-20). Put it back rather than leave the renter
      // believing an address was saved that the next screen will not have.
      setRows((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, [field]: s[field] } : x)));
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
  /** The app's own field-title style (`Tile` in `ReadyToSend`). Extrabold made these shout over
   *  every other label on the review, and a title is not the thing being read. */
  const label = "text-label font-semibold uppercase tracking-[0.05em] text-muted";

  return (
    <div className="grid gap-5">
      {/* ── The link ──────────────────────────────────────────────────────────────────────────── */}
      {showLink && (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* The heading rides this row — see `heading`. */}
          {heading}
          {/* The expiry sits beside the link because it is a property OF the link, not of the
              request — and it is named, because a bare date box beside a URL could be anything. */}
          {showExpiry && (
            <span className="flex h-[34px] items-center gap-2 rounded-md border border-border px-2.5">
              <Icon name="event" size={14} className="flex-none text-muted" />
              <span className="whitespace-nowrap text-label font-semibold uppercase tracking-[0.05em] text-muted">{c.expiry}</span>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                aria-label={c.expiry}
                className="w-[124px] bg-transparent text-meta text-navy outline-none"
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
            {/* The shape of the link that is coming: host, path, a stub, stars. It says WHAT the
                link will be, and the sentence beside it says WHEN it arrives. */}
            <span
              dir={uuid ? "ltr" : undefined}
              className={cx(
                "block min-w-0 truncate text-meta",
                uuid ? "flex-1 font-mono text-navy" : "flex-none font-mono text-muted-light",
              )}
            >
              {uuid ? shareUrl.replace(/^https?:\/\//, "") : maskedLink}
            </span>
            {/* ── The sentence lives IN the field, beside the locked value (owner, 2026-09-03) ───
                *"This must be in the placeholder of the link beside the locked value."*

                ~~A line of its own under the row.~~ It is not a fact about the screen, it is what
                this ONE field is waiting for, which is what a placeholder is; and under the row it
                cost a line that the card needed back above the fold. It disappears the moment the
                link exists, exactly as a placeholder should, because by then the field holds the
                answer instead.

                Hidden below `sm`: on a narrow panel the masked link and a sentence cannot share a
                line, and the value is the half that must stay. */}
            {!uuid && (
              <span className="hidden min-w-0 flex-1 truncate text-meta text-muted-light sm:block">
                {c.linkHint}
              </span>
            )}
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
            {/* One word each (owner, 2026-09-03): «Copy link» and «Preview form» named their object
                twice, since the object is the field they sit beside. */}
            {copied ? c.copied : c.copyShort}
          </button>
          {/* ── See the form a supplier fills in, BEFORE posting ──────────────────────────────
              The real page once there is a token; the static mock in `public/` until then, which is
              the same document the confirmation screen has always linked. A renter deciding whether
              to send something should be able to look at what he is sending, and «post it and find
              out» is not an answer. */}
          <a
            href={formUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(btn("secondary", "md"), "flex-none")}
          >
            <Icon name="visibility" size={14} />
            {c.previewShort}
          </a>
        </div>
      </div>
      )}

      {/* ── The two columns are the same height (owner, 2026-09-03) ────────────────────────────
          *"For the supplier list height, make it the same as the preview column beside it."*

          They were two independent boxes at 300px and 460px, so the left column ended a third of the
          way up the right one and the card had a step in its own middle. `lg:h-[27rem]` on the row
          gives both a height to fill, and each column scrolls inside it: the supplier list and the
          message are both lists nobody reads to the end, so a fixed frame is right for both.

          Only from `lg`. Stacked on a narrow screen there is no «beside», and a fixed height there
          would be an arbitrary crop. */}
      <div className="grid gap-6 lg:h-[27rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ── Left: who, and how ─────────────────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <span className="flex items-center gap-2">
              {/* A glyph on each column heading (owner, 2026-09-03): the two halves of this screen
                  are «who» and «what», and at label size the words alone are two grey lines. */}
              <Icon name="group" size={14} className="flex-none text-muted" />
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
                {/* ── A way to ADD one, where «Select all» used to be (owner, 2026-09-03) ───────
                    *"In the place of Select all we will have just a + icon that will open the add
                    suppliers modal."*

                    The two controls were the wrong way round. Picking is what a renter does to the
                    list he already has, and it belongs beside the count of what he picked, at the
                    foot; adding is what he does when the firm he wants is not in the list at all,
                    and the moment he notices that is while he is searching for it. So the search
                    row now offers the thing the search just failed to find.

                    Icon-only, and titled: the row is a group filter, a search box and this, and a
                    third word there would push the search box narrower than the names in it. */}
                <button
                  type="button"
                  onClick={() => setAddingSupplier(true)}
                  title={t.suppliers.addSupplier}
                  aria-label={t.suppliers.addSupplier}
                  className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md border border-dashed border-border-strong text-muted-dark transition hover:border-brand hover:text-brand"
                >
                  <Icon name="add" size={16} />
                </button>
              </span>
            )}

            {rows === null ? (
              <span className="text-meta text-muted">{c.loading}</span>
            ) : rows.length === 0 ? (
              <span className="text-meta text-muted">{c.noSuppliers}</span>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border lg:max-h-none">
                <ul>
                  {visible.map((s) => {
                    const on = !!picked[s.id];
                    /**
                     * «Add», beside the gap it fills (owner, 2026-09-03).
                     *
                     * ~~At the far right of the row.~~ A whole column away from the words «no
                     * e-mail» it answers, so the eye travelled to the edge and back. Built here and
                     * dropped into the contact line under the name.
                     *
                     * It still belongs to the CHANNEL: offered with nothing chosen, it asked him to
                     * fix a gap for a send he had not decided to make. ⚠️ E-mail and WhatsApp only,
                     * because *More* hands the message to the device's own share sheet, which picks
                     * its own recipient: a contact is not missing there, it is not ours to ask for.
                     */
                    const needsContact =
                      (channel === "email" || channel === "whatsapp") &&
                      !(channel === "whatsapp" ? s.phone?.trim() : canBeEmailed(s));
                    const addContact = !needsContact ? null : addingEmailOn === s.id ? (
                      <span className="flex flex-none items-center gap-1.5">
                        <input
                          autoFocus
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          placeholder={channel === "whatsapp" ? "+9665…" : "name@company.com"}
                          className="h-[24px] w-[150px] rounded-sm border border-border-strong px-2 text-meta text-navy outline-none focus:border-brand"
                        />
                        <button type="button" onClick={() => void saveContact(s)} className="text-meta font-semibold text-brand">
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
                        className="flex-none text-label font-semibold text-brand hover:underline"
                      >
                        {channel === "whatsapp" ? c.addPhone : c.addEmail}
                      </button>
                    );
                    return (
                      <li key={s.id} className="border-b border-border last:border-b-0">
                        {/* ── The pick is the ROW; the contact line carries its own control ──────
                            Owner, 2026-09-03: *"the no e-mail or no phone, I want them small below
                            the supplier name, and in the no e-mail line beside it, Add."*

                            «Add» used to sit at the far right of the row, a whole column away from
                            the gap it fills, so the eye had to travel from «no e-mail» under the
                            name across to the edge and back. It belongs beside the words it answers.

                            That means the contact line cannot be inside the pick control: a
                            `<button>` may not contain another button. So the ROW takes the click,
                            the way the suppliers table's own rows do, and anything interactive
                            inside it keeps its own press. The tick stays a `role="checkbox"` button
                            for the keyboard and for what it announces. */}
                        <div
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest("button, input, a")) return;
                            setPicked((p) => ({ ...p, [s.id]: !p[s.id] }));
                          }}
                          className={cx("flex cursor-pointer items-center gap-3 px-3 py-2", on && "bg-ok-soft")}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            aria-label={s.name}
                            onClick={() => setPicked((p) => ({ ...p, [s.id]: !p[s.id] }))}
                            className="flex flex-none items-center gap-2.5 text-start"
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
                          </button>

                          <span className="min-w-0 flex-1">
                              <b className="block truncate text-meta font-semibold text-navy">{s.name}</b>
                              {/* ── What THIS channel needs from him (owner, 2026-09-03) ──────
                                  The row always showed the e-mail, so picking WhatsApp and finding
                                  half the list unreachable meant reading a column about the wrong
                                  thing. It shows the address for e-mail and the number for
                                  WhatsApp, and names what is missing in red either way. */}
                              {/* With a channel chosen, the row shows what THAT channel needs. With
                                  none, it states both and asks for neither — a renter who has not
                                  said how he is sending has not been asked for anything yet. */}
                              {/* The value and its fix on ONE small line under the name. */}
                              <span className="flex min-w-0 items-center gap-1.5 text-label">
                                {channel === "none" ? (
                                  <span dir="ltr" className="min-w-0 truncate">
                                    <span className={s.email ? "text-muted" : "text-danger-deep"}>{s.email || c.noEmail}</span>
                                    <span className="text-muted-light"> · </span>
                                    <span className={s.phone ? "text-muted" : "text-danger-deep"}>{s.phone || c.noPhone}</span>
                                  </span>
                                ) : (
                                  <span
                                    dir="ltr"
                                    className={cx(
                                      "min-w-0 truncate",
                                      (channel === "whatsapp" ? s.phone : s.email) ? "text-muted" : "text-danger-deep",
                                    )}
                                  >
                                    {channel === "whatsapp" ? s.phone || c.noPhone : s.email || c.noEmail}
                                  </span>
                                )}
                                {addContact}
                              </span>
                            </span>
                            {/* Vendor-registered is the renter's OWN flag on this supplier, and it
                                decides whether an award can go to him — so it belongs on the row he
                                is picking from, not only in the table he set it in. Distinct from
                                the green tick, which is Moedatech saying the FIRM is verified. */}
                            {s.vendorRegistered && (
                              /* ── ONE glyph, and the chip is green (owner, 2026-09-03) ──────────
                                 *"Why are there two icons for vendor here? Just use this green
                                 one."* `workspace_premium` was standing in for this flag before the
                                 artwork existed, and adding the artwork left both on the chip: two
                                 marks for one boolean, in a 18px pill.

                                 Green, like the same chip in the suppliers table and both add
                                 dialogs, so the flag looks the same wherever it is read. It stays
                                 distinct from the green TICK beside it, which is Moedatech saying
                                 the firm is verified, not the renter saying it is his vendor. */
                              <span
                                title={t.suppliers.colVendor}
                                className="inline-flex h-[20px] flex-none items-center gap-1 rounded-full border border-ok bg-ok-soft px-1.5 text-label font-semibold text-ok-deep"
                              >
                                <VendorMark size={12} />
                                {c.vendorShort}
                              </span>
                            )}
                            {/* ── «On Moedatech», beside the vendor chip (owner, 2026-09-03) ────
                                ~~A bare green shield, drawn from `verified`.~~ Two problems with
                                it. A wordless tick cannot say WHICH claim it is making, and the one
                                a renter picking recipients needs is not «we checked their papers»,
                                it is «this firm has an account, so their bid arrives in the app
                                rather than as an e-mail he has to chase». And the same fact was
                                already a labelled navy pill in My Suppliers, so the two screens
                                disagreed about what it looks like. One badge now, from
                                `MoedatechBadge`. */}
                            {isOnMoedatech(s) && <MoedatechBadge />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!visible.length && <p className="px-3 py-4 text-center text-meta text-muted">{c.noMatches}</p>}
              </div>
            )}
            {/* ── The list's own footer: what will be left out, and one press to take them all ──
                Named before the press, per channel: «2 have no phone» is a different sentence from
                «2 have no e-mail», and only one of them is true at a time.

                «Select all» sits here now (owner, 2026-09-03), on the line that reports what the
                picking has come to. It is the whole of whatever is showing, so with a group chosen
                it IS «send to the group» and with a search typed it is «everyone called Zahid»: one
                control, because it is one act. */}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 text-meta text-danger-deep">
                {handedOff === null && channel === "email" && unreachable.length > 0
                  ? fmt(c.skipping, { n: unreachable.length })
                  : handedOff === null && channel === "whatsapp" && noPhone.length > 0
                    ? fmt(c.skippingPhone, { n: noPhone.length })
                    : ""}
              </span>
              <button
                type="button"
                onClick={toggleAllShown}
                disabled={!visible.length}
                className="flex-none text-meta font-semibold text-brand disabled:text-muted-light"
              >
                {allShownPicked ? c.pickNone : fmt(c.pickAll, { n: visible.length })}
              </button>
            </span>
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
        {/* `min-h-0` is load-bearing (owner, 2026-09-03: *"still the supplier column is a different
            length from the preview one"*). The row was given a height and the LEFT column obeyed it,
            because its own boxes carry `min-h-0`; this column did not, so it kept its default
            `min-height: auto`, refused to shrink below its content, and grew past the row — which is
            exactly the mismatch that was supposed to be fixed. Both columns now shrink to the row and
            scroll inside it. */}
        <div className="flex min-h-0 flex-col gap-2">
          <span className="flex items-center gap-2">
            {/* The eye, because this column is the one thing on the screen he only LOOKS at
                (owner, 2026-09-03). */}
            <Icon name="visibility" size={14} className="flex-none text-muted" />
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
              <div className="flex-none border-b border-border bg-surface2 px-3 py-2">
                <div className="text-meta font-extrabold text-navy">{subject}</div>
                <div className="mt-0.5 text-label text-muted">{fmt(c.fromLine, { name: renterName || c.fromYou })}</div>
              </div>
              {/* One scroll region for the whole message. It used to be three, nested — the body,
                  the card under it and the dialog around both — and a renter reading a message he is
                  about to send should not have to work out which of three bars moves what. */}
              {/* Grey ground, so the white card inside reads as a card (owner, 2026-09-03: *"i want
                  it light grey instead of white so it is shown as card with white background"*).
                  On white it had no edge, and a card with no edge is a paragraph. */}
              <div className="min-h-0 flex-1 overflow-auto bg-surface2 p-3">
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
          ) : (
            /* The chat bubble — recognisable at a glance, not a replica.

               The card sits INSIDE the bubble here, under the message, because that is where WhatsApp
               puts it: one bubble carrying the words and the preview together. In the e-mail frame it
               is a separate block under the body, because that is where a mail client puts it. Same
               card, drawn where each client actually draws it. */
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-surface2 p-3">
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

      {/* ── SEND VIA: a row of its own, under BOTH columns (owner, 2026-09-03) ────────────────
          It lived at the foot of the left column, under the supplier list, where it read as one more
          thing about the suppliers — and the button that posts the request sat in the narrower half
          of the screen. It belongs to the whole panel: whom he picked on the left and what they
          receive on the right both end here.

          The pale orange band is not decoration — it is what stops the eye reading Send as a fourth
          control in a column of controls. */}
      {/* ── Thinner (owner, 2026-09-03) ────────────────────────────────────────────────────────
          *"Make the bottom orange row thinner so it appears on the screen before scrolling down."*
          The band is the last thing on the card and the one that has to be reachable without a
          scroll, so its own padding is what it can least afford. The label now rides the row with
          the controls instead of taking a line above them. */}
      <div className="grid gap-2 rounded-md border border-brand/30 bg-brand-soft px-4 py-2.5">

        {/* ── One line, on any screen that has the room (owner, 2026-09-03) ────────────────────
            *"Make sure the modal fits this screen as it is, with no change in the UI like wrapping
            buttons."* Wrapping put «More» and the send button on a second line under the channels,
            which reads as a second group of controls rather than as the end of this one.

            `sm:flex-nowrap`: from the small breakpoint up the row holds its line, and the send
            button keeps `ms-auto` against the right edge. Below that it still wraps, because on a
            phone the alternative is a row scrolled sideways with the send button off screen. */}
        <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
          <span className={cx(label, "flex-none")}>{c.sendVia}</span>
          {/* Moedatech is not a channel he chooses, it is where the request goes, and it is never
              pressable: a control he cannot turn off must not look like one he can.

              ── Same height, and a light green ground (owner, 2026-09-03) ──────────────────────
              ~~42px on a row of 34px chips, on white.~~ Two things were wrong and the note saying so
              had been written without the code following it.

              The eight extra pixels made the row look misaligned rather than making this one
              important: a chip that is nearly the same height as its neighbours reads as a mistake,
              where one that matches exactly reads as belonging. It is `h-[34px]`, the `Channel`
              height, and if that ever moves the two have to move together.

              White took away the one thing that said «this always happens» at a glance. `bg-ok-soft`
              is the app's light green — the same tint every settled state on this surface wears —
              and it is the ground, not the border, that carries the meaning at a glance.

              What it does NOT take is the navy fill a chosen channel gets. Green is Moedatech's and
              navy is «you picked this»; keeping them apart is what lets a renter see, in one look,
              which parts of the row are his decision and which part is simply true. */}
          <span
            title={c.alwaysHint}
            className="inline-flex h-[34px] flex-none items-center gap-2 rounded-md border border-ok/30 bg-ok-soft px-3.5"
          >
            {/* `h-3.5` inside a 34px chip, so the mark keeps the same optical weight it had in the
                taller one rather than filling the smaller box edge to edge. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/moedatech-logo.svg" alt="Moedatech" className="h-3.5 w-auto brightness-0" />
            <Icon name="check_circle" size={15} className="text-ok-deep" />
          </span>

          <span aria-hidden className="h-7 w-px flex-none bg-border-strong" />

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
            className={cx(btn("primary", "lg"), "ms-auto flex-none px-6")}
          >
            <Icon name="send" size={16} />
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

        <p
          className={cx(
            "text-meta",
            moedatechOnly ? "flex items-center gap-1.5 font-semibold text-ok-deep" : "text-navy-mid",
          )}
        >
          {moedatechOnly && <Icon name="check_circle" size={14} className="flex-none" />}
          {moedatechOnly ? c.moedatechOnlyHint : c.alwaysHint}
        </p>

          {/* Said plainly: the alternative is a renter who believes four people were messaged. */}
          {channel === "whatsapp" && handedOff === null && (
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
          {handedOff !== null && (
            <span className="grid gap-1 rounded-md bg-ok-soft px-3 py-2">
              <span className="flex items-center gap-1.5 text-meta font-extrabold text-ok-deep">
                <Icon name="check_circle" size={15} />
                {handedOff?.channel === "none" || !handedOff?.n
                  ? c.postedOnly
                  : handedOff.channel === "whatsapp"
                    ? fmt(c.openedWhatsApp, { name: firstWithPhone?.name ?? "" })
                    : handedOff.channel === "other"
                      ? c.openedOther
                      : fmt(c.openedEmail, { n: handedOff.n })}
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

      {/* ── Adding a supplier without leaving the share (owner, 2026-09-03) ────────────────────
          The `+` beside the search opens the same dialog My Suppliers uses, because a firm added
          here is added to the renter's list, full stop: two ways to type a supplier would drift
          into two different sets of rules about what a supplier needs.

          Stacked over this panel rather than replacing it, and the list reloads on success, so the
          firm he has just typed in is in the list with the picks he had already made still ticked. */}
      <AddSuppliersDialog
        open={addingSupplier}
        onClose={() => setAddingSupplier(false)}
        onAdded={() => {
          setAddingSupplier(false);
          listRenterSuppliers().then(setRows).catch(() => {});
        }}
      />
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
  unfurl: string | null;
}) {
  return (
    <div className="grid gap-3">
      <Editable value={template.greeting} display={parts.greeting} onChange={(v) => onChange("greeting", v)} label={c.tplGreeting} />
      <Editable value={template.intro} display={parts.intro} onChange={(v) => onChange("intro", v)} label={c.tplIntro} />

      {/* ── The CARD is the details, and it carries the link (owner, 2026-09-03) ──────────────────
          *"greetings, {name} invites you to bid on my equipment request, then the card with the
          details and link, then at the end the renter name with thanks — that's it no more no less."*

          ~~The details as a text block, then the card underneath.~~ Two renderings of one thing,
          stacked, which is what he kept reading as duplication — and he was right: nobody designs a
          message that states its own contents twice.

          So this is the template, and the card is the middle of it. Not editable: a supplier prices
          what it says, and a card that disagrees with the request it links to is found out at the
          deal room. */}
      {unfurl ? (
        <div
          className="max-w-[400px] [&_img]:!h-auto [&_img]:!w-full [&_table]:!w-full [&_table]:!max-w-full"
          dangerouslySetInnerHTML={{ __html: unfurl }}
        />
      ) : (
        <p className="whitespace-pre-wrap rounded-sm border border-dashed border-border bg-surface2 p-2.5 text-meta leading-relaxed text-navy">
          {parts.card}
        </p>
      )}

      {linkPending && (
        <p className="flex items-center gap-1.5 font-mono text-label text-muted-light">
          <Icon name="lock" size={11} />
          {c.linkMasked}
        </p>
      )}

      <Editable value={template.signoff} display={parts.signoff} onChange={(v) => onChange("signoff", v)} label={c.tplSignoff} />
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

  /**
   * ── It has to LOOK editable (owner, 2026-09-03) ────────────────────────────────────────────────
   *
   * A borderless field that only reveals itself on hover is invisible on a touch screen and easy to
   * miss on a mouse — the renter read the preview as a picture and never discovered his own lines
   * were his. So it is a box with a pen in it, always, and the pen brightens on focus.
   *
   * It is still not a form: the type is the message's type, the box is faint, and what he reads is
   * what arrives. The pen is the smallest thing that says «this line is yours».
   */
  return (
    <span className="group relative block">
      <textarea
        ref={ref}
        rows={1}
        value={shown}
        aria-label={label}
        placeholder={label}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none overflow-hidden rounded-sm border border-border bg-surface2/60 py-1 pe-7 ps-2 text-meta leading-relaxed text-navy outline-none transition hover:border-border-strong focus:border-brand focus:bg-surface"
      />
      <Icon
        name="edit"
        size={12}
        aria-hidden
        className={cx(
          "pointer-events-none absolute end-2 top-1.5 transition",
          editing ? "text-brand" : "text-muted-light group-hover:text-muted",
        )}
      />
    </span>
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
        /* `font-semibold`, not extrabold (owner, 2026-09-03): three chips in the heaviest weight the
           type scale has read as three warnings. They are choices. */
        "inline-flex h-[34px] flex-none items-center gap-1.5 rounded-md border px-3.5 text-meta font-semibold transition",
        /* Navy when chosen. Green is Moedatech's, and an extra channel wearing it read as a second
           «this always happens» rather than as a choice he made. */
        on ? "border-navy bg-navy text-surface" : "border-border bg-surface text-navy-mid hover:border-navy",
      )}
    >
      <Icon name={icon} size={15} className={on ? "text-surface" : "text-muted"} />
      {label}
      {done && <Icon name="check" size={13} className={on ? "text-surface/80" : "text-ok-deep"} />}
    </button>
  );
}

