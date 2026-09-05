"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, SuccessTick } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { useSession } from "@/lib/session";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { draftBidForm } from "@/lib/draftBidForm";
import { ShareRequestPanel } from "@/components/share/ShareRequestPanel";

/**
 * *Share this request* — the card under the summary on **Ready to send**.
 *
 * ── A card on the page, not a dialog (owner's prototype, 2026-09-02) ────────────────────────────
 *
 * Built first as a modal behind a *Post & share* button, which was wrong twice over: it hid the one
 * thing the screen is for behind a press, and it made *post* and *share* read as two acts a renter
 * chooses between. The prototype has neither. The card is simply there, under the request he is
 * reviewing, and one button does the whole thing.
 *
 * ── This file is a SHELL ────────────────────────────────────────────────────────────────────────
 *
 * Everything about the share — who, how, and what they receive — is `ShareRequestPanel`, which the
 * modal renders too. What is left here is what only *Ready to send* has: the coach mark, the frame,
 * the draft to preview, and the submit that mints the link.
 *
 * ── Why it is mounted above the phase switch ────────────────────────────────────────────────────
 *
 * `SUBMIT_SUCCESS` flips `phase` to `confirmation`, which unmounts *Ready to send* mid-press. So
 * this is rendered by `CreateSurface`, which owns the switch and survives it — the flip happens
 * behind the card and the renter sees one continuous act.
 */
export function ShareOnPost() {
  const t = useT();
  const c = t.intake.postShare;
  const { state, actions } = useRfq();
  const { tier } = useSession();
  const [showAccount, setShowAccount] = useState(false);
  /**
   * ── The tick waits for the channel to be handed off (owner, 2026-09-03) ─────────────────────
   *
   * ~~It opened the moment the request was created.~~ But the post is step one of the press: the
   * compose window or WhatsApp opens a few lines later, in a NEW TAB that takes focus — so the
   * dialog appeared, was immediately covered, and the renter met it on his way back with no idea
   * what it was answering.
   *
   * `onShared` fires after every channel has been opened, so the tick is the first thing he sees
   * when he returns — which is exactly when "it is posted" is the thing he wants to know. With no
   * extra channel there is no tab, and it simply appears.
   *
   * Once only: a second send is another channel, not another request, and the panel already reports
   * that inline.
   */
  const [posted, setPosted] = useState(false);
  /**
   * ── The tick waits until he is LOOKING at us (owner, 2026-09-03) ────────────────────────────
   *
   * *"the send must go to the channel directly before seeing the sucess popup, success shown when
   * he is back on the web."*
   *
   * ~~It opened as soon as the channel had been handed off.~~ That is a few milliseconds before the
   * new tab takes focus, so the dialog was drawn and then buried — and a renter returning from
   * Gmail met a pop-up that had appeared while he was not there.
   *
   * So the announcement is held until this tab is visible again. He goes, he sends, he comes back,
   * and the tick is waiting for him — which is the moment "it is posted" is the thing he wants to
   * know.
   */
  const [waitingToTell, setWaitingToTell] = useState(false);
  /** How many suppliers that first send actually reached — 0 when he posted to Moedatech alone. */
  const [reached, setReached] = useState(0);
  const announced = useRef(false);
  /** The request cap has a dialog of its own on the review above; this banner leaves it to it. */
  const isLimit = state.errorDetail?.backendCode === "E8009";
  /** The renter's own firm, for the From line. Read once, and a failure just leaves it unnamed. */
  const [renterName, setRenterName] = useState<string | null>(null);

  useEffect(() => {
    if (!waitingToTell) return;
    const tell = () => {
      if (document.visibilityState !== "visible") return;
      setWaitingToTell(false);
      setPosted(true);
    };
    /* Both events: a tab switch fires `visibilitychange`, and returning from a window that never hid
       this one (a second monitor, a small pop-up) fires only `focus`. */
    document.addEventListener("visibilitychange", tell);
    window.addEventListener("focus", tell);
    return () => {
      document.removeEventListener("visibilitychange", tell);
      window.removeEventListener("focus", tell);
    };
  }, [waitingToTell]);

  useEffect(() => {
    /* `fetch` itself can be missing — a test renderer, an old embedded browser — and calling it then
       throws INSIDE the effect, where `.catch` never sees it and React takes the whole tree down
       with it. The name is decoration on a From line; nothing here may cost the screen. */
    try {
      void fetch("/api/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((me: { companyName?: string | null } | null) => setRenterName(me?.companyName?.trim() || null))
        .catch(() => setRenterName(null));
    } catch {
      setRenterName(null);
    }
  }, []);

  /**
   * The request he is about to post, in the shape the card reads.
   *
   * This is what makes the preview readable BEFORE the post. It used to be an empty frame: the card
   * came from the bid-form endpoint, that endpoint needs a token, and a token needs a request — so
   * the renter was asked to approve a message he could not see, and his only chance to change it
   * came once the request was already live.
   */
  const draftForm = useMemo(
    () => draftBidForm(state.draft?.project, state.draft?.items, state.taxonomy),
    [state.draft?.project, state.draft?.items, state.taxonomy],
  );

  const post = async (): Promise<string | null> => {
    /**
     * The account gate lives here now, because this is the button that posts.
     *
     * It used to sit on the review screen's own Send, which is gone. Returning null stops the share
     * without opening anything: the renter makes an account, presses Send again, and everything he
     * picked is still on screen because nothing unmounted.
     */
    if (tier === "guest") {
      setShowAccount(true);
      return null;
    }
    const result = await actions.submit();
    const uuid = result?.requestUuids?.[0] ?? null;
    // `submit` has already put the failure on the store; the review above says what went wrong.
    if (!uuid) return null;
    // Keeps this card mounted once the phase flips to confirmation, and keeps the REVIEW on screen
    // behind it rather than the confirmation page — see `CreateSurface`.
    actions.setShareOnPost(true);
    return uuid;
  };

  return (
    <section className="relative mt-6 rounded-lg border border-border bg-surface p-6">
      {/*
        * — The coach mark lived here —
        *
        * «Share with your supplier to bid», a navy tab pinned to the card's top edge, with the card
        * taking `pt-16` to make room for it. Removed (owner, 2026-09-06).
        *
        * ⚠️ It was a hint pointing at a card that already says what it is: the heading, the
        * supplier list and the Send button are all on screen underneath it. It cost sixteen pixels
        * of padding plus its own height, at the top of the one screen where the supplier list and
        * the message preview are both fighting for room.
        */}

      {/* ── A refused post must SAY it was refused ─────────────────────────────────────────────
          The submit already carried everything needed to explain itself — `errorDetail` holds the
          backend's own code, status and message — and nothing on this screen drew any of it. Only
          the request cap (`E8009`) had a home, in a dialog of its own. Every other refusal ended as
          a press that did nothing at all, which is the report: *"why i cant send to suppliers?"*

          It names the backend's own words rather than a house sentence, because a renter who has to
          ask us anyway should be able to paste one line and be understood. `/api/requests` returns
          502 for ANY backend refusal and puts the real status inside the body, so the status here is
          `backendStatus`, never the 502 the browser console shows. */}
      {state.error && !isLimit && (
        <div className="mb-5 flex items-start gap-3 rounded-sm border border-danger/40 bg-danger-soft px-4 py-3">
          <Icon name="error_outline" size={18} className="mt-0.5 flex-none text-danger" />
          <div className="min-w-0 flex-1">
            <b className="block text-body font-semibold text-danger">{t.errors.networkTitle}</b>
            <span className="block text-meta leading-relaxed text-danger">
              {state.errorDetail?.detail || t.errors.networkBody}
            </span>
            {(state.errorDetail?.backendCode || state.errorDetail?.backendStatus) && (
              <span dir="ltr" className="mt-1 block font-mono text-label text-danger/80">
                {[state.errorDetail.backendCode, state.errorDetail.backendStatus].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* The heading goes INTO the panel, at the head of its link row (owner, 2026-09-03). */}
      <ShareRequestPanel
        heading={<h2 className="me-1 flex-none text-subhead font-extrabold text-navy">{c.title}</h2>}
        mode="post"
        requestUuid={state.shareOnPost ? (state.requestUuids[0] ?? null) : null}
        requestCode={state.requestId}
        draftForm={draftForm}
        onPost={post}
        renterName={renterName}
        onShared={(n, channel) => {
          if (announced.current) return;
          announced.current = true;
          setReached(n);
          // Moedatech alone opens no tab, so there is nothing to come back FROM.
          if (channel === "none") setPosted(true);
          else setWaitingToTell(true);
        }}
      />

      {/* ── It is posted, and he has not gone anywhere (owner, 2026-09-03) ────────────────────
          A tick, the code, and one way out. Deliberately NOT a page: he is midway through choosing
          channels, and the supplier list, the wording he wrote and the channel he picked are all
          behind this dialog, exactly where he left them. */}
      {/* ── Centred, with the tick drawn in front of him (owner, 2026-09-03) ──────────────────
          ~~The dialog's own header band: a 20px glyph in a soft green chip, the title beside it, the
          subtitle under, all ranged left.~~ That is the shape of an ordinary dialog, and this is not
          an ordinary moment — it is the one press the whole flow exists for, and the header band
          announced it in the same voice a rename confirmation uses.

          So the header is dropped and the body carries everything, centred under a tick that draws
          itself. `Dialog` floats its close in the corner when there is no title, which is exactly
          the shape the reference has.

          The message is unchanged, and so is the rule under it. */}
      <Dialog open={posted} onClose={() => setPosted(false)} size="sm">
        <div className="flex flex-col items-center px-2 pb-1 pt-4 text-center">
          <SuccessTick />
          <h2 className="mt-5 text-title font-extrabold capitalize text-navy">{c.postedTitle}</h2>
          {/* ⚠️ It only claims a share when one HAPPENED (owner, 2026-09-03: *"removed shared with
              your supplier if he didnt share it"*). A renter who posted to Moedatech alone being
              told his suppliers were told is the panel lying about the one thing he pressed. */}
          <p className="mt-2 text-body leading-relaxed text-muted-dark">
            {reached === 0 ? c.postedLive : reached === 1 ? c.postedLiveOne : fmt(c.postedLiveMany, { n: reached })}
          </p>
          {/* The link is already on the card behind this, so the dialog does not offer it again — it
              says the one thing he does not know yet and gets out of the way. */}
          <p className="mt-3 text-meta text-muted">{c.postedNext}</p>
          {/* Full width and last, as the reference has it: there is one thing to do here, so it
              takes the whole row rather than hiding on a trailing edge. */}
          <button
            type="button"
            onClick={() => setPosted(false)}
            className={cx(btn("primary", "lg", { full: true }), "mt-6")}
          >
            {c.postedKeepSharing}
          </button>
        </div>
      </Dialog>

      <AccountModal
        open={showAccount}
        onClose={() => setShowAccount(false)}
        onCreated={() => setShowAccount(false)}
        title={t.guest.postGateTitle}
        postSubhead={t.guest.postBodyRequest}
      />
    </section>
  );
}
