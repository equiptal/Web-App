"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";
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
  const [coach, setCoach] = useState(true);
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
  /** How many suppliers that first send actually reached — 0 when he posted to Moedatech alone. */
  const [reached, setReached] = useState(0);
  const announced = useRef(false);
  /** The request cap has a dialog of its own on the review above; this banner leaves it to it. */
  const isLimit = state.errorDetail?.backendCode === "E8009";
  /** The renter's own firm, for the From line. Read once, and a failure just leaves it unnamed. */
  const [renterName, setRenterName] = useState<string | null>(null);

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

      <ShareRequestPanel
        mode="post"
        requestUuid={state.shareOnPost ? (state.requestUuids[0] ?? null) : null}
        requestCode={state.requestId}
        draftForm={draftForm}
        onPost={post}
        renterName={renterName}
        onShared={(n) => {
          if (announced.current) return;
          announced.current = true;
          setReached(n);
          setPosted(true);
        }}
      />

      {/* ── It is posted, and he has not gone anywhere (owner, 2026-09-03) ────────────────────
          A tick, the code, and one way out. Deliberately NOT a page: he is midway through choosing
          channels, and the supplier list, the wording he wrote and the channel he picked are all
          behind this dialog, exactly where he left them. */}
      <Dialog
        open={posted}
        onClose={() => setPosted(false)}
        size="sm"
        icon={
          <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-ok-soft text-ok-deep">
            <Icon name="check_circle" size={20} />
          </span>
        }
        title={c.postedTitle}
        /* ⚠️ It only claims a share when one HAPPENED (owner, 2026-09-03: *"removed shared with your
           supplier if he didnt share it"*). A renter who posted to Moedatech alone being told his
           suppliers were told is the panel lying about the one thing he pressed. */
        subtitle={reached === 0 ? c.postedLive : reached === 1 ? c.postedLiveOne : fmt(c.postedLiveMany, { n: reached })}
        footer={
          <button type="button" onClick={() => setPosted(false)} className={cx(btn("primary", "md"), "ms-auto")}>
            {c.postedKeepSharing}
          </button>
        }
      >
        {/* The link is already on the card behind this, so the dialog does not offer it again — it
            says the one thing he does not know yet and gets out of the way. */}
        <p className="text-meta text-muted">{c.postedNext}</p>
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
