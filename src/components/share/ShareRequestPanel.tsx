"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { VendorMark } from "@/components/VendorMark";
import { MoedatechBadge } from "@/components/MoedatechBadge";
import { btn, cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import {
  bidShareUrl,
  listRenterSuppliers,
  mailConnectStatus,
  mailConnectUrl,
  mailDisconnect,
  setBidDeadline,
  shareRequestEmail,
  updateRenterSupplier,
  type MailConnectStatus,
  type RenterSupplier,
  type ShareEmailPreview,
  type ShareEmailResult,
} from "@/lib/api/client";
import { canBeEmailed, groupsWithCounts, isOnMoedatech } from "@/lib/contract/renter-suppliers";
import { GroupsMenu } from "@/components/suppliers/SupplierGroups";
import { AddSuppliersDialog } from "@/components/suppliers/AddSuppliersDialog";
import { MAIL_UI, MailField, MailChips, type MailPerson } from "@/components/share/mail-chrome";
import type { BidFormData } from "@/lib/contract/link-bids";
import { bidCardHtml } from "@/lib/bidCardHtml";
import { copyShareMessage, shareMessageHtml } from "@/lib/copyShareMessage";
import { useBidCard } from "@/lib/useBidCard";
import {
  cardBlock,
  channelKey,
  defaultTemplate,
  defaultTemplateSet,
  fillEquipment,
  isDefaultTemplate,
  loadTemplates,
  renderShareMessage,
  saveTemplates,
  shareMessageParts,
  type ShareMessageParts,
  type ShareTemplate,
  type ShareTemplateSet,
} from "@/lib/shareTemplate";
import {
  loadEmailProvider,
  openEmailCompose,
  saveEmailProvider,
  type Compose,
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
  /**
   * A channel has been handed off.
   *
   * ── `handedOff` is the load-bearing part (owner, 2026-09-08) ─────────────────────────
   * *"When I sent a request through Outlook and Moedatech it must show sent successfully with the
   * post confirmation in the same modal, immediately."*
   *
   * It did not, and the reason is that a CONNECTED Outlook opens nothing at all: the message leaves
   * from the server through Graph, the renter never leaves the page — and the caller was holding its
   * confirmation back until the tab regained focus, which for that path never happens. So the
   * outcome now says whether the browser actually went anywhere, and `mail` carries what the server
   * did, so the confirmation can state the send rather than only the post.
   */
  onShared?: (
    count: number,
    channel: string,
    outcome?: {
      /** True when a tab, a pop-up or the device's own sheet took over. False when we sent it. */
      handedOff: boolean;
      /** Present only for a server-side send: what left, from where, and whether a copy was filed. */
      mail?: { from: string; recipients: number; inSentFolder: boolean };
    },
  ) => void;
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
  const uiLang = locale === "ar" ? "ar" : "en";
  /**
   * ── The MESSAGE's language, which is not the app's (owner, 2026-09-03) ────────────────────────
   *
   * *"i want one language in the same template, user has toggle on the preview to use arabic or
   * english but they are separate."*
   *
   * A renter reading Moedatech in English writes to a supplier who reads Arabic, and the reverse is
   * just as common. Tying the message to the interface made that a choice between working in a
   * language he does not want and writing in one his supplier cannot read.
   *
   * ⚠️ **One language for the WHOLE message.** Not a mix: the greeting, the card, the picture and
   * the sign-off all take this value. The bug that started this was exactly a mix — an English
   * message carrying an Arabic card image, because the picture's language was decided somewhere
   * else and nobody was passing this down.
   *
   * It starts as the interface's language, because that is the best guess anyone has, and it
   * follows the interface when THAT changes — switching the whole app is a statement about
   * language, and a stale toggle underneath it would be a second, quieter answer to the same
   * question.
   */
  const [lang, setLang] = useState<"en" | "ar">(uiLang);
  useEffect(() => setLang(uiLang), [uiLang]);

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
  /**
   * One wording per channel (owner, 2026-09-05: *"different template per channel"*).
   *
   * ⚠️ An e-mail and a WhatsApp message are read in different frames and at different lengths. A
   * renter who writes a proper letter for one and two lines for the other was, until now, choosing
   * which of the two to write badly.
   */
  const [templates, setTemplates] = useState<ShareTemplateSet>(() => defaultTemplateSet("en"));
  const [query, setQuery] = useState("");
  /** Which group the list is cut to. Empty is all of them. */
  const [group, setGroup] = useState("");
  const [groupMenu, setGroupMenu] = useState(false);
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
  const [copied, setCopied] = useState(false);
  const [addingEmailOn, setAddingEmailOn] = useState<string | null>(null);
  /** *Add my suppliers*, opened from the `+` beside the search — see that control. */
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [tooLong, setTooLong] = useState(false);
  /**
   * What the mail API said about the last e-mail press (SUP-BE-23). Null until he presses.
   *
   * ⚠️ Component state, never remembered across mounts. The answer is "is this domain verified
   * RIGHT NOW", and the whole point of showing the records is that IT is about to change it — a
   * cached «not verified» would keep opening a compose window for a renter whose records went live
   * an hour ago.
   */
  /** ⚠️ Never a preview: that has its own state, because it is a success and a different shape. */
  const [mailer, setMailer] = useState<Exclude<ShareEmailResult, ShareEmailPreview> | null>(null);
  /**
   * The compose window's arguments, kept so the renter can open it again himself.
   *
   * ⚠️ `window.open` needs a live user gesture, and this one fires AFTER an `await` on the mail
   * API. Chrome and Firefox still allow it; Safari can refuse — and `noopener` makes `window.open`
   * return null by spec, so a refusal cannot be detected. So the button is always offered on the
   * fallback path rather than only when something looks wrong: a share he can finish with one press
   * beats a share that silently did not open.
   */
  const [reopen, setReopen] = useState<Compose | null>(null);
  const [copiedPart, setCopiedPart] = useState<"subject" | "body" | null>(null);
  /*
   * — `myEmail`, the address off his Moedatech profile, lived here —
   *
   * 🔴 It filled the From and To lines, and it is not the sender on any remaining path: Outlook
   * sends from the mailbox that CONSENTED, Gmail from whatever account he is signed into. So it
   * printed `yarafarouq555@gmail.com` above a footer that said the message would leave from
   * `yara@moedatech.net` (owner, 2026-09-07). Gone with the guess it supported.
   */
  /** The last step, and the only one with a way out. */
  const [confirming, setConfirming] = useState(false);
  /**
   * Whether THIS press is the one that minted the request.
   *
   * ⚠️ Only true in `post` mode, and only until it is announced. In `share` mode the request
   * already existed, so there is nothing to tell him about.
   */
  const postedHere = useRef(false);
  /**
   * The addresses Outlook's compose window did not receive.
   *
   * ⚠️ Empty unless a send actually fell back to that window. Outlook's deeplink discards
   * `bcc` without a word, so its window opens addressed to nobody; every other route, including a
   * server-side send, carries the recipients itself and needs no paste at all.
   */
  const [pasteAddresses, setPasteAddresses] = useState<string[]>([]);
  const [addrCopied, setAddrCopied] = useState(false);
  /**
   * Whether this renter has connected their own Outlook (SUP-BE-23, the Graph path).
   *
   * ⚠️ **`configured` and `connected` are two different facts.** A stage with no Azure app
   * registration answers `configured: false`, and offering a Connect button there would send the
   * renter to a dead end. So the offer is drawn on `configured && !connected`, never on
   * `!connected` alone.
   */
  const [connect, setConnect] = useState<MailConnectStatus | null>(null);
  /**
   * He pressed «Don't send by Outlook» in the confirmation.
   *
   * 🔴 **This once, and the connection is untouched** (owner, 2026-09-11, choosing it over a
   * permanent disconnect: *"option 1"*). A small link inside a send dialog that signed him out of
   * his mail account would only show itself on the NEXT request, when the e-mail had quietly stopped
   * being offered. Disconnecting for good is still one press away, on the «Sending from …» line
   * where it has always been, and that one says what it does.
   *
   * ⚠️ Cleared every time the dialog opens, so it can never carry into a request he did not press
   * it on.
   */
  const [skipEmail, setSkipEmail] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectNote, setConnectNote] = useState<"connected" | "denied" | "failed" | null>(null);
  /** The popup poll, held so an unmount mid-consent does not leave a timer running. */
  const connectTimer = useRef<number | null>(null);
  /**
   * How long the send waits for a consent the renter has not finished.
   *
   * MARK Long enough for a real sign-in — a password, a second factor, an account chooser on a
   * tenant he has to pick from — and short enough that a renter who walked away is not left with a
   * button that says «Posting…» over a request that is already live. Two minutes.
   */
  const CONNECT_WAIT_MS = 120_000;

  useEffect(() => setUuid(requestUuid), [requestUuid]);
  useEffect(() => setProvider(loadEmailProvider()), []);
  // After mount, and per language: `localStorage` does not exist on the server, and the two
  // languages hold two wordings.
  useEffect(() => setTemplates(loadTemplates(lang)), [lang]);


  useEffect(() => {
    listRenterSuppliers()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  // Asked once, on mount: it decides whether an offer is drawn at all, and it never throws.

  useEffect(() => {
    void mailConnectStatus().then(setConnect);
    return () => {
      if (connectTimer.current !== null) window.clearInterval(connectTimer.current);
    };
  }, []);

  /**
   * Coming back from Microsoft.
   *
   * The backend appends one word to the URL it was given: `connected`, `denied`, `unavailable` or
   * `error`. This is the REDIRECT path, taken when the pop-up was blocked; the pop-up path resolves
   * in `startConnect` instead. Both end in the same place, which is why the word is read here rather
   * than only in one of them.
   *
   * ⚠️ The parameter is stripped straight away. Left in place, a reload would re-announce a
   * consent that happened once, and a link the renter copied out of the bar would carry it to
   * somebody else.
   */
  useEffect(() => {
    const u = new URL(window.location.href);
    const v = u.searchParams.get("mailConnect");
    if (!v) return;
    setConnectNote(v === "connected" ? "connected" : v === "denied" ? "denied" : "failed");
    u.searchParams.delete("mailConnect");
    window.history.replaceState(null, "", u.toString());
    if (v === "connected") void mailConnectStatus().then(setConnect);
  }, []);

  /**
   * Send him to Microsoft, and notice when he comes back.
   *
   * A pop-up rather than a redirect, because a redirect takes the whole panel with it: his picks,
   * his wording and, in `post` mode, a draft that has not been posted yet. When the browser refuses
   * the pop-up we redirect instead and pick the answer up from the URL above, which is the lesser
   * loss of the two.
   *
   * ⚠️ **`window.closed` is the only signal available.** The consent page is Microsoft's and
   * the landing page is the backend's, so there is nothing of ours inside the pop-up to talk to us.
   * So the status is re-read on close and IT decides the outcome: a renter who closed the window
   * without deciding looks exactly like one who refused, and both mean "not connected".
   */
  /**
   * 🔴 **The window must be opened INSIDE the click, and it cannot be, so it is opened EMPTY and
   * aimed afterwards.**
   *
   * A browser allows `window.open` only while it still counts the click as live. From the Send
   * button there are two awaits before we know where to send him — posting the request, then asking
   * the backend for the consent URL — and by then the activation is spent: Chrome blocks it silently
   * and the renter gets *"Outlook could not be connected"* instead of an account chooser (owner,
   * 2026-09-06, with a screenshot of exactly that).
   *
   * ~~So `send` opened a BLANK pop-up in the same tick as the press and handed it here.~~ That whole
   * dance retires with the press it served (owner, 2026-09-10): connecting is its own button now, so
   * the activation is still live here and the consent URL is opened directly.
   */
  const startConnect = async (): Promise<boolean> => {
    if (connecting) return false;
    setConnecting(true);
    setConnectNote(null);
    /**
     * 🔴 **A tiny page of ours, not the panel's own URL.**
     *
     * ~~`window.location.href`.~~ After consent the 520×700 pop-up loaded the WHOLE application —
     * nav, sidebar, review screen — squeezed into it (owner, 2026-09-06). It worked, in that the
     * panel noticed the window close, and it showed the renter a second broken copy of the product
     * and left him to work out he should shut it.
     *
     * ⚠️ Same origin, deliberately: the backend checks `returnTo` against a host allow-list, and
     * the page closes itself by script, which a cross-origin document cannot be trusted to do.
     */
    /* 🔴 `await` inside `send`: a throw here rejects the whole send, and `busy` never clears. A
       refusal is an answer, not an exception. */
    const url = await mailConnectUrl(`${window.location.origin}/mail-connected`).catch(() => null);
    if (!url) {
      setConnecting(false);
      setConnectNote("failed");
      return false;
    }
    /* ⚠️ ONE `await` stands before this, and every engine still counts the press through a single
       fetch. It was the POST plus this call, from inside Send, that spent the activation. */
    const win = window.open(url, "moeda-mail-connect", "width=520,height=700");
    /**
     * 🔴 **Blocked: leave the button, do NOT redirect.**
     *
     * ~~It used to take the whole tab to Microsoft.~~ The draft, the picks and the wording live in
     * memory that a navigation throws away, and in `post` mode the request has not been created yet,
     * so a redirect from this screen costs him everything he has typed. The button reports the
     * failure and stays where it is.
     */
    if (!win) {
      setConnecting(false);
      setConnectNote("failed");
      return false;
    }
    /**
     * ⚠️ **Nothing inside the pop-up can talk to us.** The consent page is Microsoft's and the
     * landing page is the backend's, so this watches from the outside: the window closing, and the
     * connection status itself.
     *
     * 🔴 **~~`window.closed` was the only signal, and it hung the whole send~~** (owner,
     * 2026-09-08: *"what if the user clicks Outlook and Send and didn't complete his connection with
     * Outlook? It is showing like nothing happened, even the modal confirming the post didn't
     * appear"*).
     *
     * A renter who ABANDONS the consent — leaves the window open on the account chooser and comes
     * back to this tab, or lets it sit on a login that never finishes — never closes it. The
     * interval polled forever, `await startConnect(...)` never returned, and everything after it
     * never ran: no e-mail, no compose window, no «your request is posted» tick, and the Send button
     * stuck on «Posting…». And the request was already live by then, so the one screen that could
     * have told him said nothing at all.
     *
     * Three ways out now, and every one of them settles:
     *
     *  · **the window closes** — the status decides, as before;
     *  · **the status says connected** — the callback has landed, so the consent is done whether or
     *    not the little window has got round to closing itself. We close it and carry on;
     *  · **the deadline passes** — he walked away. Answer «not connected», which sends him down the
     *    compose-window path with everything on screen intact.
     *
     * ⚠️ The window is NOT closed on the deadline. He may still be typing a password into it, and
     * shutting it under him would be worse than the wait. It closes itself when consent lands
     * (`/mail-connected`), and until then it is his.
     */
    const deadline = Date.now() + CONNECT_WAIT_MS;
    return new Promise<boolean>((resolve) => {
      if (connectTimer.current !== null) window.clearInterval(connectTimer.current);
      /** Settle once, whichever of the three arrives first. */
      const done = (connected: boolean, note: "connected" | "denied" | null) => {
        if (connectTimer.current !== null) window.clearInterval(connectTimer.current);
        connectTimer.current = null;
        setConnecting(false);
        if (note) setConnectNote(note);
        resolve(connected);
      };
      /* ⚠️ Guards the status read: the poll runs every 700 ms and the call takes longer than
         that, so without it a slow answer would stack requests. */
      let asking = false;
      connectTimer.current = window.setInterval(() => {
        if (win.closed) {
          void mailConnectStatus()
            .then((st) => {
              setConnect(st);
              done(st.connected, st.connected ? "connected" : "denied");
            })
            /* He closed it and we cannot tell what happened. «Not connected» is the answer that
               keeps him moving; the compose window opens and the message still goes. */
            .catch(() => done(false, "denied"));
          return;
        }
        if (Date.now() > deadline) {
          /* ⚠️ No note. «Denied» would be a claim about a decision he has not made — the window is
             still open in front of him — and the panel's own status line already says the send fell
             back to a compose window. */
          done(false, null);
          return;
        }
        if (asking) return;
        asking = true;
        void mailConnectStatus()
          .then((st) => {
            if (connectTimer.current === null) return;
            if (!st.connected) return;
            setConnect(st);
            /* Consent landed. The window closes itself a moment later; close it now so the renter
               is not left with a stray pop-up over the panel he is coming back to. */
            try {
              win.close();
            } catch {
              /* a browser may refuse; the page closes itself anyway */
            }
            done(true, "connected");
          })
          .catch(() => {})
          .finally(() => {
            asking = false;
          });
      }, 700);
    });
  };

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

  /*
   * — `formUrl` lived here —
   *
   * It fed «Preview form», which opened the real bid form in a new tab and a static mock in
   * `public/` before the request existed. Both are gone (owner, 2026-09-05 and 2026-09-06): the
   * mock had stopped tracking the real form, and once the control was locked until the post it was
   * a disabled button on the row a renter reads for his LINK.
   */

  /** Which of the three he is editing and sending. Moedatech-only reads the e-mail wording. */
  /**
   * ⚠️ **A confirmation is only good for the list it was drawn from.** Tick another supplier, or
   * change a word, and the dialog closes, so he can never confirm one envelope and send another.
   */
  const pickedKey = JSON.stringify([Object.keys(picked).filter((k) => picked[k]).sort(), templates, lang, channel, provider]);
  useEffect(() => {
    setConfirming(false);
  }, [pickedKey]);

  const tplKey = channelKey(channel);
  const template = templates[tplKey];

  const chosen = (rows ?? []).filter((s) => picked[s.id]);
  const reachable = chosen.filter(canBeEmailed);
  const unreachable = chosen.filter((s) => !canBeEmailed(s));
  const firstWithPhone = chosen.find((s) => s.phone?.trim()) ?? null;

  /**
   * The suppliers the send will drop, named.
   *
   * ⚠️ The server answers with row IDS, and the names live here — it holds no opinion about what
   * the renter calls his suppliers, and should not. Before a preview exists this falls back to the
   * rows we can see have no address, which is the same set for the ordinary case.
   */
  /**
   * ⚠️ Server first, ours second, and the SHAPE never changes between them. Before the first press
   * this is what we know: him in To, the ticked rows in Bcc. After it, it is what the backend says
   * it will actually send — a list only it can derive, because a row with no address of its own
   * falls back to its linked account's. The panel must not rearrange itself under him when the real
   * answer arrives.
   */
  /**
   * ⚠️ **Addresses come from the server; the NAMES live here.** The backend holds no opinion about
   * what this renter calls his suppliers, and should not — but a header showing `ops@alfaisal.sa`
   * asks him to decode it, while «Al Faisal Rentals» is the thing he actually recognises. So the
   * list is the server's and the labels are ours, matched on the address.
   */
  /**
   * The address this message will really leave from.
   *
   * 🔴 **The CONNECTED mailbox wins over the profile's address**, and reading the profile's was
   * wrong: the From line showed `yarafarouq555@gmail.com` on a message about to go out through
   * `yara@moedatech.net`, which the panel's own footer named two inches below it (owner,
   * 2026-09-07). Graph sends as the mailbox that consented, whatever the account is called here.
   *
   * ⚠️ One source, and it is the mailbox that CONSENTED. Nothing else on this screen knows which
   * account will send.
   */
  const sendingFrom = connect?.connected && provider === "outlook" ? connect.accountEmail : null;

  /**
   * Whether pressing Send will put a message on the wire, asked once and read everywhere.
   *
   * 🔴 **Outlook sends only when it is CONNECTED** (owner, 2026-09-10). Picking the Outlook chip is
   * a statement of intent; the connection is what makes it a destination. Before this, an
   * unconnected Outlook fell through to a compose window nobody asked for, which is the surprise
   * this whole change is about.
   *
   * ⚠️ Gmail is not «connected» and never will be: its compose URL carries `bcc`, so its own
   * window IS the send, and it needs no account of ours. It is a destination whenever it is picked.
   */
  /**
   * The confirmation names what is about to happen, in its title and on its button.
   *
   * RED Three readings, and each one is a different promise (owner, 2026-09-10). Posting AND
   * e-mailing; posting alone, because Outlook is not connected or he asked us to skip it; or
   * e-mailing alone, because the request is already live and he is reaching a second supplier.
   *
   * MARK Read from `emailWillGo`, never from the CHIP. Picking Outlook is a statement of intent and
   * the connection is what makes it a destination, so a title read off the chip would promise a mail
   * that is not going to leave.
   */
  const emailWillGo =
    channel === "email" && (provider === "gmail" || (!!connect?.connected && !skipEmail));

  const confirmTitle = uuid ? c.confirmSendTitle : emailWillGo ? c.confirmBothTitle : c.confirmPostTitle;
  const confirmSub = emailWillGo || uuid ? c.confirmSubBoth : c.confirmSubPost;
  const confirmAction = uuid ? c.confirmDoSend : emailWillGo ? c.confirmDoBoth : c.confirmDoPost;

  /**
   * 🔴 **No guess when we do not know which mailbox sends** (owner, 2026-09-07: *"if gmail or still
   * no connected email just show 'your e-mail' without specific address"*).
   *
   * ~~It fell back to the address on his Moedatech profile.~~ That is not the sender on either
   * remaining path: **Gmail** sends from whatever account he happens to be signed into, and an
   * **unconnected Outlook** sends from whatever he picks in the window. Printing his profile address
   * as the From line states a fact we do not have, on the one screen whose whole job is showing what
   * really goes out.
   *
   * ⚠️ And what is not SHOWN is not SENT: the compose window's `to` follows the same value, so a
   * renter is never told one thing while the URL carries another.
   */

  const nameFor = (address: string): string | null => {
    /**
     * 🔴 **His own address is checked FIRST, and it has to be.** A renter who has added himself to
     * his own supplier list — which he has, as `gg` — matched that row instead, so the To line read
     * «G gg» on a message addressed to him. The sender is never a supplier, whatever else the list
     * happens to say.
     */
    const same = (a: string | null | undefined) => !!a && a.trim().toLowerCase() === address.trim().toLowerCase();
    if (same(sendingFrom)) return renterName;
    return (rows ?? []).find((r) => same(r.email))?.name ?? null;
  };
  const asPeople = (list: string[]): MailPerson[] => list.map((address) => ({ address, name: nameFor(address) }));

  /**
   * 🔴 **Drawn from the picks, not from a server dry run** (2026-09-07). The dry run needed a
   * request that EXISTS, and the confirmation now stands in front of the post, so there is nothing
   * to ask the server about yet. What he confirms is the list he ticked, which is his own.
   *
   * The cost, stated plainly: a supplier row whose address comes from its linked Moedatech account
   * is shown by NAME here rather than by the address the server resolves for it. He is confirming
   * WHO, and the who is right.
   */
  const envelopeTo = asPeople(sendingFrom ? [sendingFrom] : []);
  const envelopeBcc = asPeople(reachable.map((x) => x.email as string));
  const skippedNames = unreachable.map((x) => x.name);

  const noPhone = chosen.filter((s) => !s.phone?.trim());

  /** The same message in its halves, so the preview can show which of them he may edit. */
  const parts = card ? shareMessageParts(card.model, shareUrl, { template, renterName, lang }) : null;

  /**
   * The terms, the deadline and the no-account line, exactly as `shareMessageHtml` emits them.
   *
   * ⚠️ **The preview was missing this, so it was not showing what gets sent** (owner,
   * 2026-09-05: *"make sure the preview now is same as the one will be sent in the outlook
   * really"*). The e-mail body is greeting, intro, card, THESE POINTS, sign-off, link; the preview
   * drew greeting, intro, card, sign-off. A renter approved a message whose entire middle he had
   * never seen.
   *
   * `omitHead` for the same reason it is omitted there: the card directly above already names the
   * machine and the site, and repeating them is the duplication this template was rebuilt to end.
   *
   * ⚠️ Only drawn when the CARD renders as artwork. Without it `parts.card` is shown as text
   * and already carries the head and these points together, which is what the plain-text flavour
   * sends. Adding this there would print the points twice.
   */
  const detail = card ? cardBlock(card.model, lang, { omitHead: true }) : "";

  /**
   * ⚠️ **Two controls, because they go in two different boxes** (owner, 2026-09-07: *"i want the
   * copy message... one on the title as copy title and one on the body as copy body"*).
   *
   * A renter pasting into a mail client he has open puts the subject in one field and the message
   * in another. One button that copied both left him pasting the whole thing into the subject line
   * and then deleting most of it.
   *
   * ⚠️ **Neither is «Copy link»** (owner, 2026-09-02: *"copy link must only copy the link not the
   * message"*). Copy link answers *give me the URL*; these answer *give me what you were going to
   * send*. Folding them together is what made Copy ambiguous the first time.
   *
   * ⚠️ The body is locked until the request is posted, the same rule as the link itself: the
   * message ends with a URL that does not exist yet. The SUBJECT is not, because it names the
   * machine and is true before anything is published.
   */
  const copySubject = async () => {
    await navigator.clipboard?.writeText(subject).catch(() => {});
    setCopiedPart("subject");
    setTimeout(() => setCopiedPart(null), 2400);
  };

  const copyBody = async () => {
    if (!uuid || !card) return;
    const url = bidShareUrl(uuid);
    /* ⚠️ Both flavours, as before: the receiving app chooses. Gmail and Outlook keep the HTML and
       draw the card; a chat takes the words. */
    await copyShareMessage(
      renderShareMessage(card.model, url, { template, renterName, lang }),
      shareMessageHtml(card.model, url, card.imageUrl || `${window.location.origin}/bid/${uuid}/og?lang=${lang}`, {
        template,
        renterName,
        lang,
      }),
    ).catch(() => {});
    setCopiedPart("body");
    setTimeout(() => setCopiedPart(null), 2400);
  };

  /**
   * `RFQ for Crawler Excavator 20 ton` (owner, 2026-09-03).
   *
   * ~~"A new equipment request for you".~~ A supplier's inbox holds forty of those; the subject line
   * is the one place he decides whether to open it, so it names the machine. `imageHeadline` is used
   * rather than the card title because it is the short form — first machine, then the count of the
   * rest — and a subject line is cut at about sixty characters.
   */
  /**
   * The subject line, and it is the renter's now.
   *
   * ⚠️ ~~Built from the message language's own `t.subject` on every render.~~ Ours, so he could
   * read it and not change it (owner, 2026-09-05: *"make the template title editable"*). It lives in
   * the template beside his other wording, carries `{equipment}` so the machine still changes per
   * request while his phrasing stays, and is saved per language like the rest.
   */
  const subject = parts?.title ?? fillEquipment(template.title, card?.model.imageHeadline ?? null);

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
  /**
   * 🔴 **Every machine here is off-catalogue, so the marketplace can reach nobody** (owner,
   * 2026-09-08: *"for requests that have undefined taxonomy we will remove Moedatech from the
   * confirmation, from the icons list in the share and from the confirmation question, and will
   * tell the opposite since we will not have it available and no supplier"*).
   *
   * The rule this panel has been built on since 2026-09-02, *Moedatech is always a destination*, is
   * true of every request except this one. A machine the catalogue cannot place is broadcast to
   * nobody, so the locked chip, the button and the confirmation were all naming a marketplace that
   * would never see it.
   *
   * ⚠️ Read off the CARD, so it is the same answer before and after the post: `draftForm` fills
   * the model in `post` mode and the bid-form endpoint fills it in `share` mode. Until the card
   * loads it is false, which is the ordinary case.
   */
  const offCatalogue = card?.model.offCatalogue === true;
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

  /** Every group the renter actually uses, with its size — the same shape, from the same helper,
   *  that My Suppliers hands its own menu, so the two lists can never disagree about a name. */
  const groups = groupsWithCounts(rows ?? []);

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

  /**
   * `override` exists for *More*, which sends on its own press: `setChannel` has not landed yet at
   * that moment, so the channel is passed in rather than read out of state a render too early.
   */
  const send = async (override?: "none" | "email" | "whatsapp" | "other", confirmed = false) => {
    const ch = override ?? channel;
    if (busy) return;

    /**
     * 🔴 **Nothing happens until he confirms, INCLUDING the post** (owner, 2026-09-07: *"i want the
     * send confirmation of outlook to be with the post on moedatech not only the send, so it will
     * not automatically send to moedatech"*).
     *
     * ~~The request was minted first and the dialog asked only about the e-mail.~~ So a renter who
     * pressed Send to read the confirmation had already published his request, and Cancel could only
     * call off the half that had not happened yet. The dialog now stands in front of both.
     *
     * ⚠️ It returns without opening a pop-up. The Confirm press is its own gesture, so the blank
     * consent window can be opened there — which is the only moment a browser allows it.
     */
    if (ch === "email" && !confirmed) {
      /* ⚠️ Cleared on every open, so «don't send by Outlook» can never carry into a request he
         did not press it on. */
      setSkipEmail(false);
      setConfirming(true);
      return;
    }

    /*
     * — The blank consent pop-up lived here —
     *
     * 🔴 **Connecting Outlook is its OWN act** (owner, 2026-09-10: *"users are confused when their
     * request is sent with the Outlook at same click, so i want to separate the connect as a
     * separate action from the create, so the create is done to Outlook once it is connected"*).
     *
     * ~~One press did three things: post the request, open Microsoft's consent, then send through
     * whatever came back.~~ A renter pressing Send met an account chooser he had not asked for, over
     * a request that was already live, and could not tell which of the three had happened when it
     * closed. Connecting is a button of its own now; `send` does the post and the mail, and nothing
     * else.
     *
     * This also retires the pop-up-blocker dance the window existed for: `startConnect` is only ever
     * reached from a real press, so the activation is live and it opens the consent URL directly.
     */
    setBusy(true);
    setTooLong(false);
    /* Did the browser LEAVE? A compose tab, a WhatsApp window or the device's share sheet all take
       focus, and the confirmation waits for the renter to come back. A Graph send takes nothing, so
       there is nothing to wait for — see `onShared`. */
    let handedOff = false;
    /** What the server sent, when it was the server that sent it. */
    let mail: { from: string; recipients: number; inSentFolder: boolean } | undefined;

    // `post` mode mints the request first; a share that fails afterwards leaves a LIVE request, and
    // that is deliberate — the post is what the renter came here for, and rolling it back to tidy up
    // a failed mail window would throw away the thing that succeeded.
    let id = uuid;
    if (!id && mode === "post" && onPost) {
      id = await onPost();
      if (id) postedHere.current = true;
    }
    if (!id) {
      // Nothing was posted, so there is nothing to send. The review above says what went wrong.
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

    /*
     * — `recordRequestShare` was called from three places here —
     *
     * 🔴 **Nothing on this screen records a share any more** (owner, 2026-09-06: *"i will only
     * track the accurate actions we are really sure about"*).
     *
     * Every one of those calls fired when a WINDOW OPENED, not when a message left: the Gmail
     * composer, the Outlook fallback, the WhatsApp chat. A renter who opened Outlook, thought
     * better of it and closed the tab still got a row in his file saying he had shared the request
     * with four suppliers. The record over-reported, silently, and there was no way to tell a real
     * send from an abandoned one.
     *
     * ⚠️ **The only send we can prove is the one WE make.** `share-email` derives the recipients
     * on the backend, puts the message on the wire and stamps the row with the mail server's own
     * message id. That row is written server-side and needs nothing from here.
     *
     * ⚠️ The consequence, stated plainly: while nobody has connected a mailbox and no domain is
     * verified, NOTHING is recorded at all, and «Requests you shared with them» stays empty. That
     * is the honest reading of what we know, and it fills in the day a real send happens.
     */
    if (ch === "email") {
      /**
       * ── Nothing touches the clipboard here any more (owner, 2026-09-05) ───────────────────────
       *
       * *"there is a copy of the link and copy of the email, different ones."*
       *
       * ⚠️ **The clipboard holds ONE thing, and this branch used to take it without asking.**
       * Pressing Send with e-mail silently overwrote whatever the renter had just copied: for
       * Outlook with the supplier addresses, for Gmail with the card. So *Copy message*, pressed a
       * second earlier, was gone by the time he pasted, and nothing on screen said why. Two more
       * writers were added on top of two visible buttons, and the last one to fire won.
       *
       * ~~The card copy for Gmail.~~ Gone outright: *Copy message* copies the card and the whole
       * message around it, on a press, which is strictly more than this did.
       *
       * ~~The address copy for Outlook.~~ Now a BUTTON, drawn beside the preview only when the send
       * has actually fallen back to a compose window, which is the only situation where Outlook's
       * missing Bcc is the renter's problem. A press, so it cannot overwrite anything he did not
       * ask it to.
       *
       * The rule this leaves: **nothing writes the clipboard without a press**, so what is on it is
       * always the thing he last pressed.
       */

      /**
       * ── We send it ourselves when we may, and only then (SUP-BE-23) ───────────────────────────
       *
       * The compose window exists because a query string is characters with no MIME type: that one
       * fact is why Gmail can never build a card from the body, and why Outlook discards `bcc`. Both
       * are cured by something server-side putting the message on the wire, which is this call.
       *
       * ⚠️ **Awaited in full, never raced against a timeout.** A race that gave up early would open
       * the compose window while the send was still in flight — and if it then succeeded, every
       * supplier gets the same RFQ twice, from the same renter, minutes apart. One answer, then one
       * action.
       *
       * ⚠️ **The recording is on the OTHER side of this branch now.** When we send it, the backend
       * writes the row itself and stamps it with the SES message id — a fact it can prove. Calling
       * `recordRequestShare` as well would file a second row saying the renter DECLARED the same
       * send from his own client, which is a different claim and not a true one.
       */
      /**
       * -- One press: post, connect, then Outlook (owner, 2026-09-05) ---------------------------
       *
       * *"when user select suppliers and was selecting email and click post it must open for him
       * the connector and choose his account then open the outlook for him and see who is bcc then
       * click send so he send it by him self."*
       *
       * ~~The connector was a button he had to find AFTER a send had already failed.~~ Two presses
       * and a paragraph to explain the first one. The request is posted by the time we get here, so
       * the consent is not a detour: it is the next step of the thing he pressed.
       *
       * ⚠️ Only when there is something to connect TO. A stage with no app registration answers
       * `configured: false`, and a renter already connected has nothing to do.
       */
      /**
       * 🔴 **GMAIL NEVER TOUCHES THE SERVER PATH.**
       *
       * ~~Both providers went through `share-email`.~~ That endpoint sends through whatever the
       * renter CONNECTED, which is a Microsoft mailbox — so pressing Gmail asked him to connect
       * Outlook and then sent his message out through Outlook (owner, 2026-09-06: *"when i click
       * gmail it is using outlook and ask to send again, gmail is different"*).
       *
       * Gmail's compose URL carries `bcc` properly, so his own Gmail window opens with the
       * suppliers already in it and he presses Send there. That is the whole reason the two are
       * separate buttons, and it needs no connection, no consent and no confirm step.
       */
      if (provider === "gmail") {
        const opened = openCompose(id, message);
        if (opened) {
          reached += reachable.length;
          handedOff = true;
        }
      } else if (chosen.length > 0 && reachable.length === 0) {
        /**
         * 🔴 **Nobody picked has an e-mail address, so there is nothing to send and nothing to
         * connect for.**
         *
         * ~~It fell through to the branch below and posted `renterSupplierIds: []`.~~ The endpoint's
         * schema demands at least one id, so an empty list is a **400** — not a `sent: false` the
         * fallback was written for. The branch read that as a failed send and answered by opening a
         * compose window addressed to nobody, so the renter watched Outlook open and no mail leave.
         *
         * Confirmed against a real renter on 2026-09-09: the identical share worked the moment ONE
         * supplier had an address added, because the array stopped being empty.
         *
         * ⚠️ **Stopping here is the honest outcome, not a silent skip.** The request is already
         * posted, and «N have no e-mail» is on screen above the button before the press and stays
         * there. Asking him to connect Outlook, or opening a compose window, would both be work in
         * service of a send that cannot happen.
         *
         * 🔴 **`chosen.length > 0` is load-bearing and was missing in the first cut.** Ticking
         * NOBODY is a different case with an opposite answer: the compose window must open so the
         * renter addresses it himself (owner, 2026-09-02: *"users can share with this template in
         * whatsapp or email without choosing from their suppliers fine"*). Guarding on
         * `reachable.length === 0` alone swallowed that too, and the test written for it caught it.
         *
         */
        setConfirming(false);
      } else if (!emailWillGo) {
        /**
         * 🔴 **Moedatech only, and nothing else happens** (owner, 2026-09-10). Two ways to land
         * here, and they read the same to the renter because the confirmation said so before the
         * press: **Outlook is not connected**, or he pressed «Don\'t send by Outlook» in the
         * confirmation.
         *
         * ~~It called the endpoint anyway, was refused, and opened his Outlook compose window.~~
         * That window was the surprise the owner reported: he asked for a request to be posted and
         * a mail client took the screen. The request is posted, the link is on the card behind this,
         * and the confirmation promised exactly that.
         *
         * ⚠️ **The manual way out is STAGED, not taken.** «Open your e-mail» and «Copy addresses»
         * appear under the button afterwards, so a renter who wants to write to his suppliers by
         * hand still can. Nothing opens unless he presses it, which is the whole difference between
         * an offer and the ambush this change removes.
         */
        stageCompose(message);
        setConfirming(false);
      } else {
      const body = {
        subject,
        html: card
          ? shareMessageHtml(card.model, url, card.imageUrl || `${window.location.origin}/bid/${id}/og?lang=${lang}`, {
              template,
              renterName,
              lang,
            })
          : message,
        text: message,
      };

      /**
       * ⚠️ **No dry run any more.** It existed to draw the envelope the server would use, and the
       * server can only derive that from a request that EXISTS — which stopped being true when the
       * confirmation moved in front of the post. What he confirms now is the list he ticked, which
       * is his own and needs no round trip.
       *
       * The cost, stated: a linked supplier row whose address comes from its Moedatech account is
       * shown by NAME rather than by the address the server will resolve. He is confirming who, and
       * the who is right.
       */
      const outcome = await shareRequestEmail(id, reachable.map((x) => x.id), body);
      setConfirming(false);
      /* ⚠️ A PREVIEW cannot come back on this call — we never ask for one — but the type still
         admits it, so it is refused here rather than assumed away. */
      setMailer(outcome.sent === false && outcome.reason === "PREVIEW" ? null : outcome);

      /**
       * 🔴 **A dropped token leaves the panel believing it is still connected** (found while
       * rewriting the tests, 2026-09-12). `connect` is read once on mount; when Microsoft revokes
       * consent the backend answers `RECONNECT_REQUIRED` and forgets the token, and this screen went
       * on saying «Sending from bandar@zahid.sa» over a refusal, with no Reconnect offer anywhere,
       * because that offer is drawn on `!connect.connected`.
       *
       * ⚠️ Re-read, never guessed: the status endpoint is the one thing that knows, and writing
       * `connected: false` from here would be this panel inventing a fact about an account.
       */
      if (outcome.sent === false && outcome.reason === "RECONNECT_REQUIRED") {
        await mailConnectStatus().then(setConnect).catch(() => {});
      }

      if (outcome.sent) {
        reached += outcome.recipients;
        // Nothing opened and nothing to come back from: this is the path the owner's report is about.
        mail = { from: outcome.from, recipients: outcome.recipients, inSentFolder: outcome.inSentFolder };
        /*
         * — the draft tab opened here —
         *
         * Gone with `Mail.ReadWrite`. He has already seen every recipient, in the confirm panel
         * above, before this ran.
         */
      } else {
        /**
         * 🔴 **`To` is the renter himself. Never a supplier.**
         *
         * This is how a blind broadcast is addressed in practice, and it is what Gmail's and
         * Microsoft's own guidance says to do: from him, to him, blind-copied to the others. The
         * header is complete, he keeps his own copy without a separate trick, and **reply-all is
         * safe** — a blind-copied recipient's client sees only `To` and `Cc`, so a reply-all reaches
         * the renter and no supplier can reach the others even by accident.
         *
         * ⚠️ Empty when we could not read his address, which is exactly today's behaviour. A
         * missing `To` is worse than a filled one and better than a wrong one.
         */
        /**
         * 🔴 **It is OFFERED, not opened** (owner, 2026-09-10). The confirmation named one route
         * and the server could not take it, so a compose window opening by itself now would be the
         * same surprise in a different place. `stageCompose` fills the «Open your Outlook instead»
         * button that already sits under the status line, and the renter decides.
         *
         * ⚠️ Nothing is counted as reached and nothing is handed off: no message left, and the
         * tick must not say one did.
         */
        stageCompose(message);
      }
      }
    }
    if (ch === "whatsapp") {
      /**
       * ONE chat. `wa.me` has no multi-recipient form and no browser API does, so the first pick
       * with a phone is the one it opens — said on screen before the press, because the alternative
       * is a renter who believes four people were messaged.
       *
       * With nobody picked it opens WhatsApp's own chooser instead, which is the same share with
       * the recipient left to him.
       */

      const phone = (firstWithPhone?.phone ?? "").replace(/\D/g, "");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      handedOff = true;
      if (firstWithPhone) reached += 1;
    }
    if (ch === "other") {
      /**
       * The device's own sheet. `navigator.share` needs a user gesture and HTTPS, and it rejects on
       * a cancel as well as on a failure — so a rejection is never treated as an error, it just
       * falls through to the clipboard, which is what a desktop browser gets anyway.
       */
      /**
       * 🔴 **`url` is passed SEPARATELY, and that is what makes the sheet look like a share sheet.**
       *
       * ~~The link rode inside `text` and nothing else was given.~~ Windows and Android draw the
       * link tile, the QR button and the copy-link button from the `url` FIELD; with only `text`
       * they fall back to a bare list of apps with no preview of what is being sent (owner,
       * 2026-09-05, with the sheet he wants in a screenshot).
       *
       * ⚠️ The URL is then trimmed off the end of `text`, or every target that concatenates the
       * two shows it twice.
       */
      const body = message.endsWith(url) ? message.slice(0, -url.length).trimEnd() : message;
      const shared = await navigator
        .share?.({ title: subject, text: body, url })
        .then(() => true)
        .catch(() => false);
      if (shared) handedOff = true;
      if (!shared) {
        /* Both flavours here, unlike Copy: *More* means "send this somewhere", so a paste into
           Gmail should arrive as the laid-out message with the card, and a paste into a chat as the
           words. Copy means "give me the URL", which is a different question. */
        await copyShareMessage(
          message,
          card
            ? shareMessageHtml(card.model, url, card.imageUrl || `${window.location.origin}/bid/${id}/og?lang=${lang}`, {
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
    setHandedOff({ channel: ch, n: reached });
    if (ch !== "none") setSent((prev) => (prev.includes(ch) ? prev : [...prev, ch]));
    postedHere.current = false;
    onShared?.(reached, ch, { handedOff, mail });
    setBusy(false);
  };

  /**
   * Open his own webmail with the message in it.
   *
   * ⚠️ One place, because two callers reach it for opposite reasons: **Gmail** uses it as the
   * normal route, since its compose URL carries `bcc`; **Outlook** falls back to it when the server
   * could not send. Written twice they would drift, and the second copy is the one nobody tests.
   */
  /**
   * Everything a compose window needs, put where the «Open it instead» button can reach it.
   *
   * 🔴 Split out of `openCompose` on 2026-09-10, because a failed server send must OFFER the window
   * rather than take the screen with it. Staging fills the button; opening is a press.
   */
  const stageCompose = (message: string): Compose => {
    const args: Compose = {
      /* ⚠️ The connected mailbox where there is one: it is the address the message leaves from,
         so it is the address a copy should come back to. */
      to: sendingFrom ? [sendingFrom] : [],
      bcc: reachable.map((x) => x.email as string),
      subject,
      body: message,
      provider,
    };
    setReopen(args);
    /* ⚠️ The paste is Outlook's problem alone: its deeplink discards `bcc` without a word, and
       Gmail's carries it. */
    setPasteAddresses(provider === "outlook" ? reachable.map((x) => x.email as string) : []);
    return args;
  };

  const openCompose = (id: string, message: string): boolean => {
    const opened = openEmailCompose(stageCompose(message));
    if (!opened) setTooLong(true);
    return opened;
  };

  /**
   * He backed out of the e-mail.
   *
   * 🔴 **The request is already POSTED by this point, and saying nothing made Cancel a lie.** The
   * post happens before the preview, deliberately — the recipient list is derived from a request
   * that has to exist — so pressing Cancel left a live request on Moedatech and a renter who
   * believed he had called the whole thing off. The green "your request is posted" pop-up only ever
   * fired through `onShared`, and the preview branch returns before it.
   *
   * ⚠️ Announced as the MOEDATECH-ONLY case, because that is exactly what happened: it is live,
   * nothing was e-mailed. `ShareOnPost` already draws the right dialog for that, and its own
   * `announced` guard stops a second press repeating it.
   */
  /**
   * He backed out.
   *
   * ⚠️ **Nothing to announce any more, because nothing happened.** When the post came FIRST this
   * had to raise the «your request is posted» pop-up, or Cancel left a live request and a renter
   * who believed he had called it off. The dialog now stands in front of the post, so Cancel is
   * simply a cancel.
   */
  const cancelSend = () => setConfirming(false);

  /**
   * One of his own lines changed.
   *
   * Saved on every keystroke rather than behind a Save button: there is no Save on this panel, and
   * a wording he typed and then sent without pressing anything must still be there next month.
   */
  const patchTemplate = (field: keyof ShareTemplate, value: string) => {
    const next: ShareTemplateSet = { ...templates, [tplKey]: { ...template, [field]: value } };
    setTemplates(next);
    /**
     * Written on every keystroke, and there is no Save button because there is nothing to press.
     *
     * ⚠️ **This browser only.** Not his account: that was built and withdrawn on 2026-09-05
     * (owner: *"for now keep it browser"*), and the whole design is kept in
     * `docs/implementation-plans/renter-suppliers/share-template-on-account.md`. So his wording
     * survives closing the tab and months away, and it does not reach his phone.
     */
    saveTemplates(next, lang);
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
  /**
   * ⚠️ **The chrome follows the CHANNEL he picked.** An Outlook frame around a message going out
   * through Gmail is a preview of the wrong client, which is the one failure this window exists to
   * avoid — he can no longer open the real one.
   */
  const skin = MAIL_UI[provider];
  /** The app's own field-title style (`Tile` in `ReadyToSend`). Extrabold made these shout over
   *  every other label on the review, and a title is not the thing being read. */
  const label = "text-label font-semibold uppercase tracking-[0.05em] text-muted";

  return (
    /* ── `minmax(0,1fr)`, not the implicit `auto` (2026-09-07) ──────────────────────────────────
       A grid column is `auto` by default, which means MAX-CONTENT: one nowrap row inside — a supplier's
       e-mail, the link, «Send to my suppliers · 0 selected» — pushed this column to 566px inside a
       340px card, and the whole document went 902px wide on a 372px phone. Every `truncate` in here
       was inert for the same reason: text cannot be truncated to fit a parent that grows to fit it.
       Stating the column fixes both, and changes nothing at desktop width. */
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {/* ── The link ──────────────────────────────────────────────────────────────────────────── */}
      {showLink && (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
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
                // Both variants shrink. `flex-none` on the masked one meant the stub host stuck 48px
                // out of a phone-width card, the one element still overflowing after the grid fix.
                uuid ? "flex-1 font-mono text-navy" : "flex-1 font-mono text-muted-light",
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
            title={c.copy}
            aria-label={c.copy}
            className={cx(btn("secondary", "md", { icon: true }), "flex-none")}
          >
            {/* ⚠️ **A glyph, with no word** (owner, 2026-09-05). It sits against the link field and
                copies the link: the field IS the label, and «Copy» beside it named the object twice
                while taking room from the URL, which is the half a person actually reads. */}
            <Icon name={copied ? "check" : "content_copy"} size={15} />
          </button>
          {/*
            * — «Preview form» lived here —
            *
            * It opened the real bid form in a new tab, and a static mock in `public/` before the
            * request existed. Removed (owner, 2026-09-05): the mock had stopped tracking the real
            * form, and once it was locked until the post it was a disabled button on the row a
            * renter reads for his LINK. The preview that matters is the one on this screen.
            */}
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
      {/* The base column is stated for the same reason as the panel's own: below `lg` this is ONE
          implicit column, and an implicit column is max-content. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:h-[34rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ── Left: who, and how ─────────────────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {/* `min-w-0` + `truncate`: the heading and the count are two nowrap runs, and on a phone
                they were 566px of one line rather than a heading and a count. */}
            <span className="flex min-w-0 items-center gap-2">
              {/* A glyph on each column heading (owner, 2026-09-03): the two halves of this screen
                  are «who» and «what», and at label size the words alone are two grey lines. */}
              <Icon name="group" size={14} className="flex-none text-muted" />
              <span className={cx(label, "truncate")}>{c.recipients}</span>
              <span className="ms-auto flex-none text-meta font-semibold text-navy-mid">{fmt(c.selected, { n: chosen.length })}</span>
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
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                {/* My Suppliers' own group menu, not a second control for the same job (owner,
                    2026-09-03). It arrives without `onRename` / `onDelete` / `onCreate`: here the
                    menu narrows the list, and administering the groups stays on the screen that
                    owns them. */}
                <GroupsMenu
                  groups={groups}
                  active={group}
                  open={groupMenu}
                  total={rows?.length ?? 0}
                  align="start"
                  onOpen={setGroupMenu}
                  onPick={(g) => {
                    setGroup(g);
                    setGroupMenu(false);
                  }}
                />
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
              /* ── An empty list is a dead end without this (owner, 2026-09-08) ──────────────────
                 The «add» control lives in the SEARCH row, and that row is drawn only when there is
                 something to search — so the renter with no suppliers read «No suppliers on your
                 list yet» beside a "0 selected" count and had nothing to press. The one screen where
                 he is choosing recipients is exactly where he notices the list is empty, so the same
                 dialog My Suppliers uses is offered right here.

                 Sharing still works without it: the link, WhatsApp and «More» never needed a list,
                 and the sentence says what the list is FOR rather than what is missing. */
              <span className="flex flex-col items-start gap-2.5 rounded-md border border-dashed border-border-strong px-3.5 py-4">
                <span className="text-meta text-muted">{c.noSuppliersYet}</span>
                <button type="button" onClick={() => setAddingSupplier(true)} className={btn("secondary", "sm")}>
                  <Icon name="add" size={15} /> {t.suppliers.addSupplier}
                </button>
              </span>
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
            {/* On the heading's OWN line (owner, 2026-09-06). It was a second line under it, and a
                sentence of grey 11px prose across the top of the preview pushed the message itself
                down and read as a paragraph rather than as a note about the heading. It truncates
                rather than wrapping: the column is narrow, and a hint that grows the header is the
                thing this move is undoing. */}
            <span className="min-w-0 flex-1 truncate text-label text-muted" title={c.editHint}>
              {c.editHint}
            </span>
            <span className="ms-auto" />

            {/* ⚠️ **The one paste Outlook genuinely cannot do without**, and only when it is
                real: its deeplink discards `bcc`, so the window opened addressed to nobody. Drawn
                only after a fallback actually happened, because a server-side send carries the
                recipients on the message and has nothing to paste. */}
            {pasteAddresses.length > 0 && (
              <button
                type="button"
                title={c.copyAddressesHint}
                className={cx(btn("secondary", "sm"), "flex-none")}
                onClick={() => {
                  void navigator.clipboard?.writeText(pasteAddresses.join("; ")).catch(() => {});
                  setAddrCopied(true);
                  setTimeout(() => setAddrCopied(false), 2400);
                }}
              >
                <Icon name={addrCopied ? "check" : "contact_mail"} size={14} />
                {addrCopied ? c.copyAddressesDone : c.copyAddresses}
              </button>
            )}
          </span>


          {!card || !parts ? (
            <p className="rounded-md border border-dashed border-border bg-surface2 px-3 py-6 text-center text-meta text-muted">
              {c.previewEmpty}
            </p>
          ) : previewIsEmail ? (
            /* ⚠️ The prototype's From says `Moedatech <notifications@moedatech.net>`. It is a mock,
               and it is not what happens: this goes out from the renter's own account (owner,
               2026-09-01), so the From line names HIM. */
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md"
              style={{ background: skin.ground, border: `1px solid ${skin.divider}`, fontFamily: skin.font }}
            >
              {/* ⚠️ Ours, and deliberately OUTSIDE the client's chrome: the language and Copy are
                  controls for the preview, not fields of the message. Kept on our own surface so the
                  imitation below starts cleanly at the To line. */}
              <div className="flex flex-none items-center border-b border-border bg-surface2 px-3 py-1.5">
                <PreviewTools lang={lang} setLang={setLang} />
              </div>

              {/* ── The client's own compose header (owner, 2026-09-06) ──────────────────────────
                  *"use exactly as outlook ui, same colors same icons same background same text."*

                  🔴 **He can no longer open the real window.** The draft in his own mailbox needed
                  `Mail.ReadWrite`, and real tenants refuse it, so this frame is the only sight he
                  gets of the message before it leaves. Field order, label casing, chip shape and
                  divider weight are all copied from the live composer, because those are what make
                  a header read as a mail client rather than as a form.

                  ⚠️ Fields in the composer's order: To, Bcc, then Subject. Ours put Subject first,
                  which no client does. */}
              {/* ── The card scrolls as ONE (owner, 2026-09-06: *"make the scroll over the whole
                  preview card without freezing the top fields"*) ────────────────────────────────
                  Only the BODY used to scroll, so To / Bcc / Subject stood frozen over it and the
                  message read through a letterbox — on a short column the renter was moving two
                  lines of mail inside a card that was mostly envelope. The scroller is this wrapper
                  now: the fields, the status line and the body move together, exactly as they do in
                  a real client. Our own toolbar above stays put, because it is a control for the
                  preview rather than part of the message. */}
              <div className="min-h-0 flex-1 overflow-auto">
              <div className="flex-none" style={{ background: skin.fieldGround }}>
                {/* ⚠️ **From, and it leads** (owner, 2026-09-06: *"make it look like email bcc,
                    from, title etc"*). ~~Dropped when the header was rebuilt.~~ It is the field that
                    answers the question a supplier asks first, and the one this whole feature is
                    built to control: the message goes out as HIM. */}
                <MailField label={c.envFrom} skin={skin}>
                  <span className="block truncate py-1 text-meta" style={{ color: skin.text }}>
                    {renterName ? <b className="font-semibold">{renterName}</b> : null}
                    {renterName ? " · " : null}
                    <span dir="ltr" style={{ color: skin.label }}>{sendingFrom || c.envYourMail}</span>
                  </span>
                </MailField>

                <MailField label={c.envTo} skin={skin}>
                  {/* ⚠️ **Never blank.** Until we know his address there is still something true
                      to say — it goes to him — and a labelled row with nothing after it reads as
                      broken rather than as pending. */}
                  {/* ⚠️ A named chip only where the address is known. Otherwise the row still says
                      where it goes — to him — without inventing which of his mailboxes. */}
                  <MailChips people={envelopeTo} empty={c.envYourMail} skin={skin} />
                </MailField>
                <MailField label={c.envBcc} skin={skin}>
                  <MailChips people={envelopeBcc} empty={c.envNoRecipients} skin={skin} />
                </MailField>
                <MailField
                  label={c.envSubject}
                  skin={skin}
                  action={
                    <CopyBit
                      label={copiedPart === "subject" ? c.copied : c.copyTitleBtn}
                      done={copiedPart === "subject"}
                      onClick={() => void copySubject()}
                      disabled={!card}
                    />
                  }
                >
                  {/* ⚠️ Still his to type in. A composer's subject IS an input, so it needs no
                      separate treatment to look editable — but it keeps our pen, because nothing
                      else on this screen says which parts are his. */}
                  <Editable
                    value={template.title}
                    display={subject}
                    onChange={(v) => patchTemplate("title", v)}
                    label={c.tplTitle}
                    className="text-body font-semibold"
                    style={{ color: skin.subject }}
                  />
                </MailField>
              </div>

              {/* ⚠️ The one thing a composer does NOT say, under the fields rather than inside
                  one: it is a warning about the list, not a recipient in it.

                  ~~The «a copy is in your Sent folder» line stood here too.~~ It read off the
                  server's dry run, and there is no dry run any more, so it would have been a
                  promise made before the send it describes. It is still made afterwards, by the
                  status line under the button, which knows what actually happened. */}
              {skippedNames.length > 0 && (
                <div
                  className="flex-none px-3 py-1.5"
                  style={{ borderBottom: `1px solid ${skin.divider}` }}
                >
                  <span className="flex items-start gap-1.5 text-label font-semibold text-warn-deep">
                    <Icon name="error_outline" size={13} className="mt-px flex-none" />
                    {fmt(c.envSkipped, { names: skippedNames.join(", ") })}
                  </span>
                </div>
              )}

              {/* ⚠️ The body sits on the client's OWN ground, white in both, rather than on our
                  grey. A composer does not tint the area you type in, and the card inside carries
                  its own border. */}
              <div
                // Not a scroller of its own any more — the wrapper above carries the whole card.
                className="p-3"
                style={{ background: skin.bodyGround, color: skin.text }}
              >
                {/* ⚠️ On the body, because that is the field it fills. */}
                <div className="mb-2 flex justify-end">
                  <CopyBit
                    label={copiedPart === "body" ? c.copied : c.copyBodyBtn}
                    done={copiedPart === "body"}
                    onClick={() => void copyBody()}
                    disabled={!uuid || !card}
                  />
                </div>
                <Message
                  parts={parts}
                  detail={detail}
                  linkUrl={uuid ? shareUrl : null}
                  template={template}
                  onChange={patchTemplate}
                  c={c}
                  linkPending={!uuid}
                  unfurl={unfurl}
                />
              </div>
              </div>
            </div>
          ) : (
            /* The chat bubble — recognisable at a glance, not a replica.

               The card sits INSIDE the bubble here, under the message, because that is where WhatsApp
               puts it: one bubble carrying the words and the preview together. In the e-mail frame it
               is a separate block under the body, because that is where a mail client puts it. Same
               card, drawn where each client actually draws it. */
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-surface2 p-3">
              {/* ⚠️ No subject on a chat, so the one copy here is the body. */}
              <div className="mb-2 flex items-center gap-1.5">
                <CopyBit
                  label={copiedPart === "body" ? c.copied : c.copyBodyBtn}
                  done={copiedPart === "body"}
                  onClick={() => void copyBody()}
                  disabled={!uuid || !card}
                />
                <PreviewTools lang={lang} setLang={setLang} />
              </div>
              <div className="max-w-[94%] rounded-md rounded-ss-none bg-surface px-3 py-2">
                <Message
                  parts={parts}
                  detail={detail}
                  linkUrl={uuid ? shareUrl : null}
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
                /* ⚠️ THIS channel's wording, not all three. He pressed reset while reading one
                   message; taking the other two with it would be a button that undoes work he is
                   not looking at. */
                const next: ShareTemplateSet = { ...templates, [tplKey]: defaultTemplate(lang) };
                setTemplates(next);
                saveTemplates(next, lang);
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
          {/* ⚠️ **Not drawn at all on an off-catalogue request** (owner, 2026-09-08). The chip
              is a statement of fact, «this always happens», and on this one request it is not a
              fact. A locked green mark naming a marketplace that cannot see the machine is the
              worst of the three surfaces, because it cannot be pressed and so cannot be argued
              with. */}
          {!offCatalogue && (
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
          )}

          {!offCatalogue && <span aria-hidden className="h-7 w-px flex-none bg-border-strong" />}

          <Channel
            on={channel === "whatsapp"}
            onClick={() => setChannel((v) => (v === "whatsapp" ? "none" : "whatsapp"))}
            icon="chat"
            label={c.whatsapp}
            done={sent.includes("whatsapp")}
          />
          {/* ⚠️ **Two buttons, because they are two different sends** (owner, 2026-09-05: *"can u
              add option for gmail so it is gmail or outlook instead of general email"*).

              ~~One «E-mail» button and a hidden provider.~~ It was removed on 2026-09-03 when both
              behaved identically badly, and they no longer do:

                - **Gmail** carries `bcc` in its compose URL, so the window opens with his suppliers
                  in the Bcc line where he can READ them, today, with no connection and no backend.
                - **Outlook** discards `bcc` without a word, which is why it has the connector: a
                  draft in his own mailbox is the only way that half ever shows him a recipient.

              Handing a Gmail renter an Outlook window was the gap this closes, and it is the same
              gap that has been open since the picker was taken out.

              ⚠️ Both set `channel: "email"` and differ only in `provider`, so the wording, the
              template and the recipient rules stay one thing. A mail client is a transport, not a
              different message. */}
          <Channel
            on={channel === "email" && provider === "outlook"}
            onClick={() => {
              setProvider("outlook");
              saveEmailProvider("outlook");
              setChannel((v) => (v === "email" && provider === "outlook" ? "none" : "email"));
            }}
            icon="mail"
            label={c.outlook}
            done={sent.includes("email") && provider === "outlook"}
          />
          <Channel
            on={channel === "email" && provider === "gmail"}
            onClick={() => {
              setProvider("gmail");
              saveEmailProvider("gmail");
              setChannel((v) => (v === "email" && provider === "gmail" ? "none" : "email"));
            }}
            icon="alternate_email"
            label={c.gmail}
            done={sent.includes("email")}
          />
          {/**
            * ── «More» exists only once there is a LINK (owner, 2026-09-03) ────────────────────
            *
            * *"clciking more posting the request? it mustn do so."*
            *
            * WhatsApp and E-mail are TICKS: pressing one chooses where the message will go, and
            * nothing happens until Send. *More* is not a tick — it hands the message to the
            * operating system on its own press, because a chooser behind a chooser is not a
            * chooser. That single press was therefore also posting the request, so a renter
            * opening *More* to see what was on offer published his request by looking.
            *
            * Hiding it before the post is not a guard bolted on — it is the honest shape. *More*
            * gives the OS a URL, and before the post there IS no URL: the link is minted by
            * `onPost`. So the control appears the moment it has something to hand over, and from
            * then on one press means one share and nothing else.
            */}
          {uuid && (
            <Channel
              on={channel === "other"}
              onClick={() => {
                setChannel("other");
                void send("other");
              }}
              icon="ios_share"
              label={c.other}
              done={sent.includes("other")}
            />
          )}

          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend || (offCatalogue && moedatechOnly && mode !== "post")}
            className={cx(btn("primary", "lg"), "ms-auto flex-none px-6")}
          >
            <Icon name="send" size={16} />
            {busy
              ? c.posting
              : sent.length
                ? c.shareAgain
                : moedatechOnly
                  ? /* ⚠️ «Post to Moedatech» is the one promise this request cannot keep. In
                       `post` mode the press still does something real, it creates the request and
                       mints the link, so the button is named for that. In `share` mode the request
                       already exists and no channel is picked, so the press has nothing left to do
                       and the button says which decision is missing. */
                    offCatalogue
                    ? mode === "post"
                      ? c.offCataloguePost
                      : c.offCataloguePick
                    : mode === "post"
                      ? c.postMoedatechOnly
                      : c.sendMoedatechOnly
                  : c.sendToSuppliers}
          </button>
        </div>

        {/* ⚠️ **Only when Moedatech is the ONLY channel** (owner, 2026-09-06: *"Every request goes
            to Moedatech. You can share it via other channels too. remove this"*).

            ~~A line under the row on every state.~~ On any state but one it restated the row
            directly above it: the Moedatech chip is already locked on and the other buttons are
            already there, so the sentence was the picture in words, costing a line the supplier
            list and the preview both wanted.

            The Moedatech-only case keeps its line, because that one is NOT visible in the row: two
            unticked buttons look identical to a renter who has not realised Send still does
            something. */}
        {/* ⚠️ On an off-catalogue request this line is drawn whatever the channel, because it is
            not a note about the channel row: it is the reason the link matters. */}
        {offCatalogue ? (
          <p className="flex items-start gap-1.5 text-meta font-semibold text-warn-deep">
            <Icon name="error_outline" size={14} className="mt-px flex-none" />
            {c.offCatalogueLine}
          </p>
        ) : moedatechOnly ? (
          <p className="flex items-center gap-1.5 text-meta font-semibold text-ok-deep">
            <Icon name="check_circle" size={14} className="flex-none" />
            {c.moedatechOnlyHint}
          </p>
        ) : null}

          {/* Said plainly: the alternative is a renter who believes four people were messaged.
              Nothing is said when NONE of them has a number (owner, 2026-09-03): the panel already
              marks those rows «no phone», and repeating it under the buttons was a note about the
              list, printed away from the list. */}
          {channel === "whatsapp" && handedOff === null && firstWithPhone && (
            <span className="text-meta text-muted">{fmt(c.whatsappFirst, { name: firstWithPhone.name })}</span>
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

          {/* ── What the mail API did, and only when it did something (SUP-BE-23) ───────────────
              The renter has just pressed Send and NO compose window opened — because we sent it
              ourselves. That is the one outcome on this panel he cannot see for himself, so it is
              the one outcome that is stated. Every other press still says nothing. */}
          {mailer?.sent && (
            <span className="flex items-start gap-1.5 text-meta font-semibold text-ok-deep">
              <Icon name="check_circle" size={14} className="mt-px flex-none" />
              <span>
                {fmt(mailer.recipients === 1 ? c.mailSentOne : c.mailSent, {
                  from: mailer.from,
                  n: mailer.recipients,
                })}
                {/* A supplier he picked who has no address is not in that count, and a count that
                    quietly omits him is how a renter comes to believe eight people were written to. */}
                {mailer.skipped > 0 && ` ${fmt(c.mailSkipped, { n: mailer.skipped })}`}
                {/* ⚠️ One line, not two (owner, 2026-09-06). It was a block of its own under the
                    sentence, which read as a second piece of news about the same send.

                    Only on the Graph path, where the message really did pass through his own
                    mailbox. On the SES path we send AS him without touching it, so there is no copy
                    in his Sent folder and saying otherwise would send him looking for one. */}
                {mailer.inSentFolder && ` ${c.mailInSent}`}
              </span>
            </span>
          )}

          {/* ── Connect Outlook, as an act of its own (SUP-BE-23, the Graph path) ─────────────
              🔴 **Offered the moment Outlook is picked, and no longer inside Send** (owner,
              2026-09-10: *"i want to separate the connect as a separate action from the create, so
              the create is done to Outlook once it is connected"*).

              This REVERSES the placement of 2026-09-05, and the reason it was moved is the reason
              it comes back. It was taken out of «the moment he ticked E-mail» because it *"put a
              paragraph about Microsoft consent in front of a renter who had not asked to send
              anything yet"* — and what replaced it was worse: the consent moved INSIDE Send, so
              pressing one button posted his request and opened an account chooser he had not asked
              for. The half of that ruling that still holds is the paragraph, so this is a line and a
              button, drawn only for the channel it belongs to.

              ⚠️ **`configured`, not `connectPath`.** The old condition read a field off a REFUSED
              send, which is the only thing it could read before the press; the status endpoint
              answers the same question before it, and a stage with no app registration still answers
              `configured: false` and draws nothing. */}
          {channel === "email" && provider === "outlook" && connect?.configured && !connect.connected && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface2 px-3 py-2.5">
              {/* ⚠️ Outlook's own mark, not a chain link (owner, 2026-09-12). The renter is being
                  asked to connect ONE named thing, and the logo says which before the sentence
                  does. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/outlook-logo.webp" alt="Outlook" className="h-4 w-4 flex-none object-contain" />
              <span className="min-w-0 flex-1 text-meta text-navy-mid">{c.mailConnectWhy}</span>
              <button
                type="button"
                onClick={() => void startConnect()}
                disabled={connecting}
                className={cx(btn("secondary", "sm"), "flex-none")}
              >
                <Icon name={connecting ? "hourglass_top" : "link"} size={15} />
                {connecting
                  ? c.mailConnecting
                  : mailer?.sent === false && (mailer.reason === "RECONNECT_REQUIRED" || mailer.reason === "SEND_REJECTED")
                    ? c.mailReconnect
                    : c.mailConnect}
              </button>
            </div>
          )}

          {/* Connected, said once and quietly: it changes what Send does, so it belongs on screen,
              but it is a settled fact rather than news. */}
          {/* ⚠️ Hidden once it HAS sent (owner, 2026-09-06: *"there are 2 similar lines"*).
              «Sending from bandar@…» beneath «Sent from bandar@… to 1 supplier» is the same fact in
              the present tense, under the past one. It is a standing note about the connection, so
              it belongs on the screen he is about to send from, not on the report of a send. */}
          {connect?.connected && connect.accountEmail && channel === "email" && !mailer?.sent && (
            <span className="flex items-center gap-2 text-meta text-muted">
              <Icon name="check_circle" size={14} className="flex-none text-ok-deep" />
              {fmt(c.mailConnected, { email: connect.accountEmail })}
              <button
                type="button"
                className={cx(btn("link"), "text-meta")}
                onClick={() => void mailDisconnect().then(() => mailConnectStatus().then(setConnect))}
              >
                {c.mailDisconnect}
              </button>
            </span>
          )}

          {/* ⚠️ «denied» is not necessarily a refusal. Many Microsoft tenants block consent for
              outside apps, and there is no way to tell that apart in advance, so the wording names
              both rather than telling a renter he declined something he never saw. */}
          {connectNote && (
            <span
              className={cx(
                "text-meta",
                connectNote === "connected" ? "font-semibold text-ok-deep" : "text-muted-dark",
              )}
            >
              {connectNote === "connected"
                ? c.mailConnectedNow
                : connectNote === "denied"
                  ? c.mailConnectDenied
                  : c.mailConnectFailed}
            </span>
          )}

          {/*
            * — The mail-domain setup panel lived here —
            *
            * A «Your IT adds these records to {domain} once» table, its three DKIM rows, a Copy
            * button, and two lines above it. Plus «your address is a personal one, so Moedatech
            * cannot send on its behalf».
            *
            * 🔴 **Removed** (owner, 2026-09-12: *"we will not communicate with the IT of company,
            * so remove this scenario, it will be from the Outlook connection"*). It served the SES
            * path, where our own server sends as the renter's domain once somebody with access to
            * that domain's DNS has proved we may. Nobody was ever going to do that: a renter cannot
            * do it himself, and the panel was asking him to go and find the person who runs his
            * company's website.
            *
            * ⚠️ **The backend can still ANSWER those reasons**, and nothing here breaks if it
            * does: `DOMAIN_NOT_VERIFIED`, `PERSONAL_DOMAIN` and `NO_SENDER_ADDRESS` now read as
            * ordinary refusals, and the panel says the send did not go and offers the connection.
            * They are also unreachable in practice now, because the web only calls that endpoint
            * with a connected mailbox, and `shareEmail.ts` reaches all three only on the SES branch.
            */}

          {/* ── Open his own mail client, as a PRESS ───────────────────────────────────────────
              🔴 It was ~~opened automatically~~ whenever the server could not send, and the
              renter had not asked for it (owner, 2026-09-10). Nothing opens by itself now, so this
              is the only way a compose window is ever reached, and reaching it is his decision.

              ⚠️ Gated on `reopen`, not on a refusal: the Moedatech-only path stages it without
              calling the endpoint at all, so there is no `mailer` to read. `!mailer?.sent` keeps it
              off the screen after a send that really went out. */}
          {reopen && !mailer?.sent && (
            <button type="button" onClick={() => openEmailCompose(reopen)} className={cx(btn("link"), "text-meta")}>
              {c.mailOpenInstead}
            </button>
          )}

          {/* What actually happened, not a blanket «shared». A send that reached nobody by e-mail
              still POSTED, and saying «shared with 0 suppliers» would read as a failure when the
              request is live on Moedatech and waiting. */}
          {/* ── The panel says nothing after the press (owner, 2026-09-03) ────────────────────
              ~~«Your e-mail opened with 1 suppliers» — «Your suppliers are on the clipboard, press
              Ctrl+V» — «Pick another channel above and press again».~~ Three lines of narration
              stacked under a button, describing a window the renter is already looking at, and one
              of them counting a send we cannot observe. *"remove this it isnt even working."*

              The pop-up on return says the request is posted, which is the one fact he does not
              already have. Everything else was us explaining ourselves. */}
      </div>

      {/* ── Adding a supplier without leaving the share (owner, 2026-09-03) ────────────────────
          The `+` beside the search opens the same dialog My Suppliers uses, because a firm added
          here is added to the renter's list, full stop: two ways to type a supplier would drift
          into two different sets of rules about what a supplier needs.

          Stacked over this panel rather than replacing it, and the list reloads on success, so the
          firm he has just typed in is in the list with the picks he had already made still ticked. */}
      {/* ── The last step, and it stands in front of BOTH halves ──────────────────────────────
          Owner, 2026-09-07: *"the confirmation must be clear and big so user can really confirm
          that his requests will be sent to these suppliers through outlook and on moedatech"*.

          🔴 **Nothing has happened when this opens.** The request is not posted and no mail has
          left, so Cancel really does call the whole thing off — which is what a Cancel button
          promises and what the old one could not keep.

          ⚠️ It says one of two things, and the difference is real: the FIRST press publishes the
          request as well as e-mailing it, a later one only e-mails, because it is already live. A
          renter sharing with a second supplier must not be asked to approve a post that happened
          yesterday. */}
      {/* ── The last step, and it names every destination it is about to reach ───────────────
          Owner, 2026-09-07: *"the confirmation must be clear and big so user can really confirm
          that his requests will be sent to these suppliers through outlook and on moedatech"*, and
          2026-09-10: *"make the confirmation modals clear and dominant, as users must see"*.

          🔴 **Nothing has happened when this opens.** The request is not posted and no mail has
          left, so Cancel really does call the whole thing off.

          🔴 **It states the DESTINATIONS, not a sentence about them** (2026-09-10). ~~Two lines of
          prose, one of which guessed: «It is e-mailed from your own account» was printed before we
          knew whether he would ever connect.~~ Each place the request is about to reach is its own
          block now, with its own mark and its own detail, and a block is drawn only when that place
          is really going to receive it. What he approves and what happens are the same list.

          ⚠️ The title and the button follow the same reading: both halves, the post alone, or the
          mail alone when the request is already live. */}
      <Dialog
        open={confirming}
        onClose={cancelSend}
        size="xl"
        title={confirmTitle}
        subtitle={confirmSub}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button type="button" onClick={cancelSend} className={btn("secondary", "lg")}>
              {c.confirmNo}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                /* ⚠️ Sent from THIS press, so a channel that opens a window of its own still has a
                   live user activation to open it with. */
                void send(undefined, true);
              }}
              className={cx(btn("primary", "lg"), "px-6")}
            >
              <Icon name="send" size={16} />
              {confirmAction}
            </button>
          </div>
        }
      >
        <div className="grid gap-3">
          {/* ── Moedatech ──────────────────────────────────────────────────────────────────────
              ⚠️ **Replaced, never dropped, on an off-catalogue request** (owner, 2026-09-08: *"will
              tell the opposite"*). Saying nothing would leave a renter approving a send with no idea
              that the e-mail in front of him is the only copy anyone will ever see. */}
          {offCatalogue ? (
            <Destination
              icon="error_outline"
              tone="warn"
              title={c.destNoMarket}
              detail={c.offCatalogueLine}
            />
          ) : (
            <Destination
              icon="public"
              logo={{ src: "/moedatech-logo.svg", alt: "Moedatech", className: "h-4 w-auto brightness-0" }}
              tone={uuid ? "done" : "on"}
              title={c.destMoedatech}
              detail={uuid ? c.confirmPostedAlready : c.confirmPostLine}
            />
          )}

          {/* ── The mail, drawn only when one is actually going to leave ───────────────────────
              🔴 **This is the change the owner asked for** (2026-09-10: *"if they didn't connect
              the Outlook the confirmation will be on Moedatech only"*). An unconnected Outlook is
              not a destination: nothing is sent through it and nothing opens. The block below says
              so plainly and offers the one press that changes it. */}
          {channel === "email" && emailWillGo && (
            <Destination
              icon={provider === "gmail" ? "alternate_email" : "mail"}
              logo={
                provider === "outlook"
                  ? { src: "/outlook-logo.webp", alt: "Outlook", className: "h-5 w-5 object-contain" }
                  : undefined
              }
              tone="on"
              title={provider === "gmail" ? c.destGmail : c.destOutlook}
              detail={
                provider === "gmail"
                  ? c.destGmailBody
                  : fmt(reachable.length === 1 ? c.destOutlookBodyOne : c.destOutlookBody, {
                      from: sendingFrom ?? "",
                      n: reachable.length,
                    })
              }
            >
              {/* The addresses, because an address is the thing that leaves and a name is not. */}
              {reachable.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {reachable.map((x) => (
                    <span
                      key={x.id}
                      title={x.name}
                      className="inline-flex h-[26px] max-w-full items-center rounded-full border border-border bg-surface px-3 text-meta text-navy"
                    >
                      <span className="truncate">{x.email}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* ⚠️ **This once, and the connection is untouched** (owner, 2026-09-11). A renter
                  who wants this one request on Moedatech alone says so here; disconnecting for good
                  is the link on the «Sending from …» line, which says what it does. */}
              {provider === "outlook" && (
                <button
                  type="button"
                  onClick={() => setSkipEmail(true)}
                  className={cx(btn("link"), "mt-2 text-meta")}
                >
                  {c.destSkipOutlook}
                </button>
              )}
            </Destination>
          )}

          {/* Outlook is picked and cannot send: say which press changes that, and say it HERE,
              where he is asking the question. */}
          {channel === "email" && provider === "outlook" && !emailWillGo && (
            <Destination
              icon="link_off"
              logo={{ src: "/outlook-logo.webp", alt: "Outlook", className: "h-5 w-5 object-contain" }}
              tone="off"
              title={skipEmail ? c.destOutlookSkipped : c.destOutlookOff}
              detail={skipEmail ? c.destOutlookSkippedBody : c.destOutlookOffBody}
            >
              {skipEmail ? (
                <button
                  type="button"
                  onClick={() => setSkipEmail(false)}
                  className={cx(btn("link"), "mt-2 text-meta")}
                >
                  {c.destSendItAfterAll}
                </button>
              ) : connect?.configured ? (
                <button
                  type="button"
                  onClick={() => void startConnect()}
                  disabled={connecting}
                  className={cx(btn("secondary", "sm"), "mt-2")}
                >
                  <Icon name={connecting ? "hourglass_top" : "link"} size={15} />
                  {connecting ? c.mailConnecting : c.mailConnect}
                </button>
              ) : null}
            </Destination>
          )}

          {/* ⚠️ The ones being left out, named. It is the last moment he can add an address. */}
          {emailWillGo && skippedNames.length > 0 && (
            <span className="flex items-start gap-2 text-meta font-semibold text-warn-deep">
              <Icon name="error_outline" size={15} className="mt-px flex-none" />
              {fmt(c.envSkipped, { names: skippedNames.join(", ") })}
            </span>
          )}
        </div>
      </Dialog>

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
 * One place the request is about to reach, drawn as a block rather than a line.
 *
 * RED **A destination a renter can COUNT** (owner, 2026-09-10: *"make the confirmation modals clear
 * and dominant, as users must see"*). ~~Two sentences with a glyph in front of each.~~ A sentence is
 * read once and skimmed the second time; blocks are counted, and counting is the act this dialog
 * exists for: he is answering *where does this go?*, and the answer is one block or two.
 *
 * MARK `off` is drawn in the same frame, deliberately. A place that is NOT receiving the request is
 * still an answer to his question, and hiding it is how a renter comes back asking why no e-mail
 * arrived.
 */
function Destination({
  icon,
  logo,
  tone,
  title,
  detail,
  children,
}: {
  icon: string;
  /**
   * The real mark of the place this block names (owner, 2026-09-12).
   *
   * ⚠️ A glyph says «mail»; a logo says WHICH mail. This dialog is the last screen before a
   * request leaves for other firms, and the renter is checking WHERE it goes, so the two
   * destinations wear the marks he already knows rather than two house icons that differ only in
   * their shape.
   *
   * Falls back to `icon` when absent, which is what the off-catalogue block still uses: there is no
   * logo for «nowhere».
   */
  logo?: { src: string; alt: string; className: string };
  tone: "on" | "off" | "done" | "warn";
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  const skin =
    tone === "on"
      ? { box: "border-brand/40 bg-brand-soft", mark: "text-brand" }
      : tone === "done"
        ? { box: "border-ok/40 bg-ok-soft", mark: "text-ok-deep" }
        : tone === "warn"
          ? { box: "border-warn/40 bg-warn-soft", mark: "text-warn-deep" }
          : { box: "border-border bg-surface2", mark: "text-muted" };

  return (
    <div className={cx("flex items-start gap-3 rounded-md border p-3.5", skin.box)}>
      {logo ? (
        /* ⚠️ Each mark carries its OWN sizing, because a wordmark and a square badge cannot share
           one box: Moedatech's is a wide lockup drawn to a height, Outlook's is a square drawn to
           both. `brightness-0` on the lockup is the same treatment the locked Moedatech chip in the
           channel row already uses on a soft tint, so the two agree. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo.src}
          alt={logo.alt}
          className={cx("mt-px flex-none", logo.className, tone === "off" && "opacity-45 grayscale")}
        />
      ) : (
        <Icon name={icon} size={20} className={cx("mt-px flex-none", skin.mark)} />
      )}
      <span className="min-w-0 flex-1">
        <b className="block text-body font-extrabold text-navy">{title}</b>
        <span className="mt-0.5 block text-meta leading-relaxed text-muted-dark">{detail}</span>
        {children}
      </span>
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
  detail,
  linkUrl,
  template,
  onChange,
  c,
  linkPending,
  unfurl,
}: {
  parts: ShareMessageParts;
  /** The points under the card, as `shareMessageHtml` emits them. Empty before there is a card. */
  detail: string;
  /** The link as its own line, once it exists. Null while the request is still a draft. */
  linkUrl: string | null;
  template: ShareTemplate;
  onChange: (field: keyof ShareTemplate, value: string) => void;
  c: ReturnType<typeof useT>["intake"]["postShare"];
  linkPending: boolean;
  unfurl: string | null;
}) {
  return (
    <div className="grid gap-3">
      {/* ⚠️ **One box, not two** (owner, 2026-09-05: *"no need to seperate the edit per hello
          or per you are invited etc, keep them one text box above the card"*). The greeting and the
          line that introduces the request are read as one paragraph, so editing them as two fields
          meant placing the cursor twice to change one thought, with a blank line between them the
          renter could not remove. */}
      <Editable value={template.above} display={parts.above} onChange={(v) => onChange("above", v)} label={c.tplAbove} />

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

      {/* ⚠️ **The points, under the card, because that is where the e-mail puts them.** Without
          them the preview ended at the card and the renter never saw the terms, the deadline or the
          no-account line he was about to send. Only on the artwork path: the text fallback above is
          `parts.card`, which already carries the head and these points as one block. */}
      {unfurl && detail && (
        <p className="whitespace-pre-wrap text-meta leading-relaxed text-navy">{detail}</p>
      )}

      {/* The other box: the sign-off and anything else he wants under the request. */}
      <Editable value={template.below} display={parts.below} onChange={(v) => onChange("below", v)} label={c.tplBelow} />

      {/* ⚠️ **The link is a LINE of its own, after the sign-off, and it was missing entirely.**
          `shareMessageHtml` ends with it deliberately: a client that strips the card still leaves a
          way in. Before the post there is no link, so the mask stands in its place, which is the
          same position it will occupy. */}
      {linkPending ? (
        <p className="flex items-center gap-1.5 font-mono text-label text-muted-light">
          <Icon name="lock" size={11} />
          {c.linkMasked}
        </p>
      ) : (
        linkUrl && (
          <p dir="ltr" className="break-all font-mono text-meta text-info">
            {linkUrl}
          </p>
        )
      )}
    </div>
  );
}


/*
 * — `initialsOf` lived here —
 *
 * It drew the sender's avatar. Gone with it: an avatar belongs to a message being READ, and this is
 * a message being written.
 */

/**
 * Which language the message is written in.
 *
 * ⚠️ **The copy buttons left this strip** (owner, 2026-09-07). They now sit ON the two things they
 * copy: the subject beside the Subject field, the body beside the body. A renter pasting into a mail
 * client he already has open fills two fields, and one button that copied both left him pasting
 * everything into the subject line and deleting most of it.
 *
 * ⚠️ Each language names itself in itself. «العربية» is legible to the renter who wants it
 * whatever the interface happens to be set to.
 */
function PreviewTools({ lang, setLang }: { lang: "en" | "ar"; setLang: (v: "en" | "ar") => void }) {
  return (
    <span className="ms-auto flex flex-none items-center rounded-sm border border-border bg-surface p-0.5">
      {(["en", "ar"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setLang(v)}
          aria-pressed={lang === v}
          className={cx(
            "rounded-sm px-1.5 py-0.5 text-label transition-colors",
            lang === v ? "bg-brand text-brand-fg" : "text-navy-mid hover:text-navy",
          )}
        >
          {v === "en" ? "English" : "العربية"}
        </button>
      ))}
    </span>
  );
}

/** One small copy control, drawn on the thing it copies. */
function CopyBit({ label, done, onClick, disabled }: { label: string; done: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex h-[22px] flex-none items-center gap-1 rounded-sm border border-border bg-surface px-2 text-label transition-colors",
        disabled ? "text-muted-light" : "text-navy-mid hover:text-navy",
      )}
    >
      <Icon name={done ? "check" : "content_copy"} size={12} />
      {label}
    </button>
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
  className,
  style,
}: {
  /** What is stored and edited — with `{name}` in it. */
  value: string;
  /** What is sent — the same line with the name filled in. Shown whenever the field is not focused. */
  display: string;
  onChange: (v: string) => void;
  label: string;
  /** Extra type classes, so the subject can carry the weight a subject line has. */
  className?: string;
  /** ⚠️ For the imitated composers only: their own text colour, which is not one of our tokens. */
  style?: React.CSSProperties;
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
        style={style}
        className={cx(
          "w-full resize-none overflow-hidden rounded-sm border border-border bg-surface2/60 py-1 pe-7 ps-2 leading-relaxed outline-none transition hover:border-border-strong focus:border-brand focus:bg-surface",
          className ?? "text-meta text-navy",
        )}
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

