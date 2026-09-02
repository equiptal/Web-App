"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
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
  const [coach, setCoach] = useState(true);
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
    const result = await actions.submit();
    const uuid = result?.requestUuids?.[0] ?? null;
    // `submit` has already put the failure on the store; the review above says what went wrong.
    if (!uuid) return null;
    // Keeps this card mounted once the phase flips to confirmation — see `CreateSurface`.
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

      <ShareRequestPanel
        mode="post"
        requestUuid={state.shareOnPost ? (state.requestUuids[0] ?? null) : null}
        requestCode={state.requestId}
        draftForm={draftForm}
        onPost={post}
        renterName={renterName}
      />
    </section>
  );
}
