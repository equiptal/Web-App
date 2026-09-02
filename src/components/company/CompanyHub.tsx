"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VerifiedMark } from "@/components/VerifiedMark";
import { Dialog } from "@/components/Dialog";
import { CompanyDetails } from "@/components/company/CompanyDetails";
import { MastheadPill, PageMasthead, RowList, Section } from "@/components/PageSection";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/config/store-links";
import {
  fetchMyCompany,
  validateInviteCode,
  joinCompany,
  cancelJoinRequest,
  leaveCompany,
  dissolveCompany,
  approveMember,
  removeMember,
  promoteMember,
  demoteMember,
  type CompanyResult,
} from "@/lib/api/company-client";
import type { CompanyMember, MyCompany } from "@/lib/contract/company";
import { btn } from "@/lib/ds";
import { SkeletonFields, SkeletonRows, SkeletonSection } from "@/components/Skeleton";
import { pin } from "@/lib/uiPins";

/**
 * Company hub — the web twin of the app's `company_page.dart`
 * (docs/plans/company-shared-visibility.md T12).
 *
 * Four states, same order and same copy as the app:
 *   1. no company  → join by invite code (with the consent step — joining permanently transfers the
 *                    renter's existing equipment/requests/bids to the firm)
 *   2. pending     → "waiting for the owner to approve"
 *   3. member      → roster, and the way out
 *   4. owner       → additionally: the invite code, pending join requests, and role management
 *
 * Everything mutating confirms first, because none of it is reversible in-product: joining hands over
 * records one-way, leaving forfeits access to records you brought in, and dissolving retires the
 * company's verification.
 */
export function CompanyHub() {
  const t = useT();
  const c = t.company;
  const { locale } = useLocale();
  const ar = locale === "ar";
  // Dissolving retires the company verification, so the account drops verified → basic. The BFF
  // re-stamps the session cookie; this pulls the new tier into the live UI (shell badge, tier banner)
  // without waiting for a reload.
  const { refresh: refreshSession } = useSession();

  const [company, setCompany] = useState<MyCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  // Mirrors `busy` synchronously: `busy` isn't readable until the next render, so a fast double-click
  // would slip a second mutation past a state-only guard. These actions aren't reversible.
  const inFlight = useRef(false);

  /**
   * The backend's own message wins — it names which of the eleven company guards tripped, which is
   * far more useful than one generic failure line. `CO1002` is the exception: our own BFF can
   * short-circuit a malformed code without a message, so it gets the app's invalid-code copy.
   */
  const localizedError = (r: Extract<CompanyResult, { ok: false }>) => {
    const fromBackend = (ar ? r.messageAr : r.message) || r.message;
    if (fromBackend) return fromBackend;
    return r.code === "CO1002" ? c.invalidCode : c.loadError;
  };

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    const result = await fetchMyCompany();
    // `undefined` = the read failed; `null` = genuinely no company. Never show the join form for a
    // failed read — the renter could already be in a firm.
    if (result === undefined) setLoadError(true);
    else {
      setLoadError(false);
      setCompany(result);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  };

  /** Run a mutation, then re-read so the roster reflects the new truth (roles, pending list, exit). */
  const run = async (
    action: () => Promise<CompanyResult>,
    successMessage?: string,
    opts: { refreshesTier?: boolean } = {},
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        if (successMessage) flash(successMessage);
        if (opts.refreshesTier) await refreshSession();
        await load({ silent: true });
      } else {
        setError(localizedError(result));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    /* ── The page is the page's width now (owner, 2026-08-30) ────────────────────────────
       ~~`mx-auto max-w-2xl` — 672px centred, so the two account pages were one width (owner,
       2026-08-26).~~ Withdrawn: at 1440 that left roughly two thirds of the row empty on either side
       of a column of half-filled cards, and the reading argument for a narrow measure does not hold
       here — these are FIELDS and rows, not prose. The unification survives; it is just that both
       pages are now the shell's width and both split into two columns at `lg`.

       The shell already caps at 1440 and owns the gutter, so this takes no width of its own. */
    <div {...pin("company-hub")} className="w-full pb-10" dir={ar ? "rtl" : "ltr"}>
      {toast && (
        <p className="mb-4 flex items-center gap-2 rounded-sm border border-ok/30 bg-ok-soft px-3.5 py-2.5 text-body font-semibold text-ok">
          <Icon name="check_circle" size={16} /> {toast}
        </p>
      )}
      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-sm border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-body font-semibold text-danger">
          <Icon name="error" size={16} className="mt-px flex-none" /> {error}
        </p>
      )}

      {loading ? (
        /* The shape the page is about to be: the firm's particulars on one side, its roster on the
           other. ~~A centred ellipsis.~~ It was indistinguishable from a renter with no company,
           which is a real state this page also has — so the first thing it said was sometimes the
           opposite of the truth. */
        <div className="grid gap-5 lg:grid-cols-2">
          <SkeletonSection><SkeletonFields rows={3} /></SkeletonSection>
          <SkeletonSection><SkeletonRows rows={4} /></SkeletonSection>
        </div>
      ) : loadError ? (
        <div className="rounded-sm border border-border bg-surface p-8 text-center">
          <p className="text-body font-semibold text-navy">{c.loadError}</p>
          <button
            onClick={() => void load()}
            className={btn("primary", "md", { className: "mt-4 transition" })}
          >
            <Icon name="refresh" size={16} /> {c.retry}
          </button>
        </div>
      ) : !company ? (
        <div className="flex flex-col gap-4">
          {/* App parity (companyCreateOwn* keys): the two ways to have a company, in the app's
              order — create your own by verifying, ABOVE joining someone else's. */}
          <CreateOwnCompanyCard />
          <JoinForm
            busy={busy}
            onJoin={(code, name) => setConfirm(joinSpec(code, name))}
            onError={setError}
            onAttempt={() => setError(null)}
          />
        </div>
      ) : !company.isActive ? (
        <PendingPanel company={company} busy={busy} onCancel={() => setConfirm(cancelJoinSpec())} />
      ) : (
        <ActiveCompany
          company={company}
          busy={busy}
          onApprove={(m) => void run(() => approveMember(m.userId))}
          onRemove={(m) => void run(() => removeMember(m.userId))}
          onPromote={(m) => setConfirm(promoteSpec(m))}
          onDemote={(m) => setConfirm(demoteSpec(m))}
          onExit={() => setConfirm(exitSpec(company))}
          onCopied={() => flash(c.inviteCodeCopied)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          spec={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { action, successMessage, refreshesTier } = confirm;
            setConfirm(null);
            // A `blocking` spec is guidance with no action (and renders no confirm button).
            if (action) void run(action, successMessage, { refreshesTier });
          }}
        />
      )}
    </div>
  );

  // ── Confirm specs (kept here so they can close over `c` and the actions) ──

  function joinSpec(code: string, companyName: string): ConfirmSpec {
    return {
      // A valid code for a firm with no name set still confirms — fall back to the generic title.
      title: companyName || c.joinTitle,
      body: c.joinConsent,
      confirmLabel: c.joinButton,
      icon: "business",
      action: () => joinCompany(code),
      successMessage: c.joinRequestSent,
    };
  }

  /**
   * Withdrawing a pending request is confirmed but NOT destructive — nothing was ever shared with a
   * pending joiner, so it's styled neutrally, unlike leave/dissolve.
   */
  function cancelJoinSpec(): ConfirmSpec {
    return {
      title: c.cancelJoin,
      body: c.cancelJoinConfirm,
      confirmLabel: c.cancelJoin,
      icon: "undo",
      action: cancelJoinRequest,
      successMessage: c.cancelJoinDone,
    };
  }

  function promoteSpec(m: CompanyMember): ConfirmSpec {
    return {
      title: c.promote,
      body: c.promoteConfirm.replace("{name}", m.name),
      confirmLabel: c.promote,
      icon: "admin_panel_settings",
      action: () => promoteMember(m.userId),
    };
  }

  function demoteSpec(m: CompanyMember): ConfirmSpec {
    return {
      title: c.demote,
      body: c.demoteConfirm.replace("{name}", m.name),
      confirmLabel: c.demote,
      icon: "person",
      action: () => demoteMember(m.userId),
    };
  }

  /**
   * Leaving and dissolving are the same button in the app, resolved by roster size:
   *   - sole active member          → dissolve (the firm closes; records come back to them)
   *   - owner, no other owner       → BLOCKED with guidance (promote first) — no server round-trip
   *   - otherwise                   → leave
   */
  function exitSpec(co: MyCompany): ConfirmSpec {
    const soleMember = co.activeMembers.length <= 1;
    if (!soleMember && co.isOwner && co.activeOwnerCount <= 1) {
      return { title: c.leave, body: c.promoteFirst, icon: "info", blocking: true };
    }
    return soleMember
      ? {
          title: c.dissolve,
          body: c.dissolveConfirm,
          confirmLabel: c.dissolve,
          icon: "logout",
          danger: true,
          action: dissolveCompany,
          // Retires the company verification → the account drops to Basic.
          refreshesTier: true,
        }
      : {
          title: c.leave,
          body: c.leaveConfirm,
          confirmLabel: c.leave,
          icon: "logout",
          danger: true,
          action: leaveCompany,
        };
  }
}

// ── State 1: no company → create your own, or join by code ───────────────────

/**
 * "Add your own company" — the other route to having one, and the one the app offers first
 * (`companyCreateOwnTitle/Desc/Cta`). A company is only ever minted by the verification form, so
 * this is a link to `/verify`, not an action of its own.
 *
 * Shown unconditionally in the no-company state: a renter who was already verified would have a
 * company (verification creates it), so reaching this state means verifying is still available to
 * them — whether they've never submitted, or submitted and were rejected.
 */
function CreateOwnCompanyCard() {
  const t = useT();
  const c = t.company;
  const router = useRouter();
  return (
    <button
      onClick={() => router.push("/verify")}
      className={btn("secondary", "md", { full: true, className: "flex text-start transition" })}
    >
      <span className="grid h-11 w-11 flex-none place-items-center rounded-sm bg-brand text-brand-fg">
        <Icon name="verified" size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-extrabold text-navy">{c.createOwnTitle}</p>
        <p className="mt-0.5 text-meta leading-relaxed text-muted">{c.createOwnDesc}</p>
      </div>
      <span className="inline-flex flex-none items-center gap-1 rounded-sm bg-brand px-3 py-2 text-meta font-semibold text-brand-fg">
        {c.createOwnCta}
        <Icon name="arrow_forward" size={15} className="rtl:scale-x-[-1]" />
      </span>
    </button>
  );
}

function JoinForm({
  busy,
  onJoin,
  onError,
  onAttempt,
}: {
  busy: boolean;
  /** Called with the code AND the firm's name, once `validate-code` confirmed both. */
  onJoin: (code: string, companyName: string) => void;
  onError: (message: string) => void;
  /** Clears any previous error, so a corrected code doesn't sit under a stale "invalid" line. */
  onAttempt: () => void;
}) {
  const t = useT();
  const c = t.company;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);

  /**
   * Never join straight from the field. Validate first so the confirmation can name the firm the
   * renter is about to hand their records to (app parity — the consent copy is load-bearing).
   */
  const check = async () => {
    const trimmed = code.trim();
    if (!trimmed || checking || busy) return;
    onAttempt();
    setChecking(true);
    const result = await validateInviteCode(trimmed);
    setChecking(false);
    if (!result.ok) {
      onError((ar ? result.messageAr : result.message) || c.invalidCode);
      return;
    }
    onJoin(trimmed, result.companyName ?? "");
  };

  return (
    <div className="rounded-sm border border-border bg-surface p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-sm bg-brand-soft text-brand">
          <Icon name="business_center" size={22} />
        </span>
        <div>
          <h2 className="text-subhead font-extrabold text-navy">{c.joinTitle}</h2>
          <p className="mt-0.5 text-meta leading-relaxed text-muted">{c.noCompany}</p>
        </div>
      </div>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <label htmlFor="invite-code" className="block text-label font-semibold uppercase tracking-wide text-navy-mid">
          {c.enterCode}
        </label>
        <input
          id="invite-code"
          value={code}
          // Invite codes are minted uppercase (MOEDA-XXXXXX); upcasing as they type means a pasted
          // lowercase code still matches, and the field is always LTR even in the Arabic layout.
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          className="mt-1.5 w-full rounded-sm border border-border bg-surface px-3.5 py-2.5 text-body font-semibold tracking-[1px] text-navy outline-none transition focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || checking || !code.trim()}
          className={btn("primary", "lg", { full: true, className: "mt-4 transition" })}
        >
          {checking ? "…" : c.joinButton}
        </button>
      </form>
    </div>
  );
}

// ── State 2: pending approval ────────────────────────────────────────────────

function PendingPanel({
  company,
  busy,
  onCancel,
}: {
  company: MyCompany;
  busy: boolean;
  /** Withdraw the request — the only way out of a wrong-but-valid invite code. */
  onCancel: () => void;
}) {
  const t = useT();
  const c = t.company;
  return (
    <div className="rounded-sm border border-border bg-surface px-6 py-10 text-center">
      <span className="mx-auto grid h-[88px] w-[88px] place-items-center rounded-full bg-warn-soft">
        <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-warn/15 text-warn">
          <Icon name="hourglass_top" size={30} />
        </span>
      </span>
      <p className="mt-6 text-title font-extrabold text-navy">{company.name}</p>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1.5 text-meta font-semibold text-warn">
        <Icon name="schedule" size={14} /> {c.pendingBadge}
      </span>
      <p className="mx-auto mt-5 max-w-sm text-body leading-relaxed text-navy">{c.pendingApproval}</p>
      <p className="mx-auto mt-2 max-w-sm text-meta leading-relaxed text-muted">{c.pendingHint}</p>

      {/* Wrong code? Withdraw. Without this the pending row blocks joining anywhere else until an
          owner happens to reject you — the request would otherwise be a one-way door. */}
      <button
        onClick={onCancel}
        disabled={busy}
        className={btn("secondary", "md", { className: "mt-6 transition" })}
      >
        <Icon name="undo" size={16} /> {c.cancelJoin}
      </button>
    </div>
  );
}

// ── States 3 & 4: active member / owner ──────────────────────────────────────

function ActiveCompany({
  company,
  busy,
  onApprove,
  onRemove,
  onPromote,
  onDemote,
  onExit,
  onCopied,
}: {
  company: MyCompany;
  busy: boolean;
  onApprove: (m: CompanyMember) => void;
  onRemove: (m: CompanyMember) => void;
  onPromote: (m: CompanyMember) => void;
  onDemote: (m: CompanyMember) => void;
  onExit: () => void;
  onCopied: () => void;
}) {
  const t = useT();
  const c = t.company;
  const card = "rounded-sm border border-border bg-surface";

  /**
   * ── One organization page (owner, 2026-08-26) ─────────────────────────────────────────────────
   * The company's PARTICULARS used to live on `/profile` in a green card, while this page carried
   * the same firm's name, roster and invite code. One subject, two pages, split by nothing but which
   * fetch each happened to make. `CompanyDetails` brings that half over, and the order below is the
   * order a reader wants it in: who we are, what proves it, how to bring someone in, who is already
   * here, and — last and set apart — how to leave.
   */
  /* The team block, held in a variable because the layout below places it in one of two
     shapes: beside the papers on a verified firm, alone on one that is not. Building it twice
     would be two rosters to keep in step. */
  const team = (
    <>
        {/* ── One TEAM card (owner's reference, 2026-08-26) ────────────────────────────────────────
            The invite code, the roster and the way out were three sections with three headings, and a
            reader had to work out that they were all about the same thing: who is in this firm. They
            are one card now — the code to bring someone in, the people already here, and the exit set
            apart at its foot — which is the order the reference draws and the order the acts happen in.
  
            Pending joiners stay OUTSIDE it, above. An approval is a decision waiting on the owner
            rather than a statement about the team, and burying it inside a card of settled facts is
            how a join request goes unanswered for a week. */}
  
        {/* Pending join requests — owners approve or reject. */}
        {company.isOwner && company.pendingMembers.length > 0 && (
          <Section title={c.pendingJoiners} boxed={false}>
            <div className="flex flex-col gap-2.5">
              {company.pendingMembers.map((m) => (
                <div key={m.userId} className={`${card} p-4`}>
                  <p className="text-body font-semibold text-navy">{m.name}</p>
                  {m.phone && (
                    <p className="mt-0.5 text-meta text-muted" dir="ltr">
                      {m.phone}
                    </p>
                  )}
                  <div className="mt-3.5 flex gap-2.5">
                    <button
                      onClick={() => onRemove(m)}
                      disabled={busy}
                      className={btn("secondary", "md", { className: "flex-1 transition" })}
                    >
                      {c.remove}
                    </button>
                    <button
                      onClick={() => onApprove(m)}
                      disabled={busy}
                      className="flex-1 rounded-sm bg-ok px-3 py-2.5 text-body font-semibold text-white transition disabled:bg-disabled-bg disabled:text-disabled-fg"
                    >
                      {c.approve}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
  
        <Section title={c.team} grow>
          {company.isOwner && company.inviteCode && (
            <div className="p-4 pb-0">
              <InviteCodeCard code={company.inviteCode} onCopied={onCopied} />
            </div>
          )}
  
          <div className="px-4 pt-3.5">
            <h3 className="text-label font-semibold uppercase tracking-wide text-muted">{c.members}</h3>
          </div>
          <RowList>
            {company.activeMembers.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                company={company}
                busy={busy}
                onRemove={onRemove}
                onPromote={onPromote}
                onDemote={onDemote}
              />
            ))}
          </RowList>
  
          {/* The way out, at the foot of the team it ends — and stated in red as what it is rather than
              hidden in a neutral button, because leaving or dissolving is the one act on this page that
              cannot be undone from this page. Centred and unboxed: it is the last thing here, not
              another row of the roster. */}
          <div className="border-t border-border px-4 py-3.5 text-center">
            <button
              onClick={onExit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-body font-semibold text-danger transition hover:underline disabled:text-disabled-fg disabled:no-underline"
            >
              <Icon name="logout" size={17} className="rtl:scale-x-[-1]" />
              {company.activeMembers.length <= 1 ? c.dissolve : c.leave}
            </button>
          </div>
        </Section>
    </>
  );

  return (
    <div>
      <PageMasthead
        tone="plain"
        icon={<Icon name="business_center" size={26} className="text-white" />}
        title={company.name}
        subtitle={company.isOwner ? c.roleOwner : c.roleMember}
        badge={
          company.isVerified ? (
            <MastheadPill tone="ok" onLight>
              <VerifiedMark size={13} /> {c.verified}
            </MastheadPill>
          ) : undefined
        }
      />

      {/* ── Two columns, filling the page (owner, 2026-08-30) ───────────────────────────
          The papers on one side, the people on the other: *what proves this firm* and *who is in
          it* are the page's two subjects, and stacking them made a reader scroll past the whole of
          one to reach the other on a screen with room for both.

          ~~`items-start`, so a short column stops where its content stops.~~ Withdrawn (owner,
          2026-08-30): *"I want both columns to have same length, same start and same end."* The
          columns stretch to the taller one now, and one card in each is marked `grow` so it takes
          the difference — the papers on the left, the roster on the right, both of which can use
          the height. A column that stopped short left a strip of page under it beside a card that
          ran on, which read as one of the two having failed to load.

          The split is gated on `isVerified` because that is exactly the condition the left column
          has anything to say under — `CompanyDetails` draws nothing for a firm with no verified
          submission, and a two-column grid with an empty half is worse than the single column it
          replaced. An unverified active company keeps the one column, with the team in it. */}
      {company.isVerified ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col">
            <CompanyDetails grow />
          </div>
          <div className="flex min-w-0 flex-col">{team}</div>
        </div>
      ) : (
        team
      )}
    </div>
  );

}

function InviteCodeCard({ code, onCopied }: { code: string; onCopied: () => void }) {
  const t = useT();
  const c = t.company;

  /**
   * Character-identical to the app's invite text (`_inviteShareText` in
   * company_profile_card.dart): the message, the code, then both store links. The person receiving
   * it is being invited to a MOBILE-first product, so the download links matter more than the web
   * origin — an invitee with no account needs somewhere to go.
   */
  const shareText = `${c.inviteShareMessage}\n\n${code}\n\n${c.inviteDownload}\niOS: ${APP_STORE_URL}\nAndroid: ${PLAY_STORE_URL}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      onCopied();
    } catch {
      /* clipboard blocked (insecure context / denied) — the code is on screen to copy by hand */
    }
  };

  /**
   * Web share sheet where the browser has one (mobile Safari/Chrome), matching the app's native
   * share. Elsewhere `navigator.share` is undefined and the Copy button is the whole story, so the
   * button simply isn't rendered — no dead control.
   */
  const share = async () => {
    try {
      await navigator.share({ text: shareText });
    } catch {
      /* dismissed or unsupported — nothing to report */
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  /** Desktop has no share sheet, so offer copying the full invite text, not just the bare code. */
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      onCopied();
    } catch {
      /* clipboard blocked */
    }
  };

  /**
   * ── Navy, with the code inside a frame of its own (owner's reference, 2026-08-26) ─────────────
   * It was an amber-tinted box with the code as its heading. The reference makes it the darkest thing
   * on the page and puts the code in a bordered well inside that: the code is a thing to be READ OUT
   * or handed over, and a frame around it says "this is the part you copy" in a way a large font
   * alone does not. The two controls move onto the navy beside it, quiet, because they are how you
   * take the code rather than what the panel is about.
   *
   * The caption stays a full sentence under the well. «Share this code so teammates can join» is the
   * only line here that explains what any of it is for.
   */
  return (
    <div className="rounded-sm bg-navy p-4">
      <h3 className="text-label font-semibold uppercase tracking-wide text-white/55">{c.inviteCode}</h3>
      <div className="mt-2 flex items-center gap-3 rounded-sm border border-brand/45 bg-white/[0.04] px-3.5 py-3">
        <p className="min-w-0 flex-1 truncate text-title font-extrabold tracking-[1.5px] text-brand" dir="ltr">
          {code}
        </p>
        <div className="flex flex-none gap-1.5">
          <button
            onClick={() => void (canShare ? share() : copyInvite())}
            aria-label={c.share}
            title={c.share}
            className="grid h-[34px] w-[34px] place-items-center rounded-sm bg-white/10 text-white transition hover:bg-white/20"
          >
            <Icon name={canShare ? "share" : "forward_to_inbox"} size={17} />
          </button>
          <button
            onClick={() => void copy()}
            aria-label={c.inviteCodeCopied}
            title={c.inviteCodeCopied}
            className="grid h-[34px] w-[34px] place-items-center rounded-sm bg-white/10 text-white transition hover:bg-white/20"
          >
            <Icon name="content_copy" size={17} />
          </button>
        </div>
      </div>
      <p className="mt-2.5 text-meta leading-relaxed text-white/60">{c.inviteHint}</p>
    </div>
  );
}

function MemberRow({
  member,
  company,
  busy,
  onRemove,
  onPromote,
  onDemote,
}: {
  member: CompanyMember;
  company: MyCompany;
  busy: boolean;
  onRemove: (m: CompanyMember) => void;
  onPromote: (m: CompanyMember) => void;
  onDemote: (m: CompanyMember) => void;
}) {
  const t = useT();
  const c = t.company;
  const [open, setOpen] = useState(false);
  const isSelf = member.userId === company.myUserId;
  const isOwner = member.role === "owner";
  // Owner powers apply to COLLEAGUES only — never the viewer's own row (app parity), so an owner
  // can't accidentally demote or remove themselves out of the roster from here. Their own exit is
  // the Leave button.
  const canManage = company.isOwner && !isSelf;
  // Never offer demoting the last remaining owner: the server would refuse it (CO1006) anyway.
  const canDemote = isOwner && company.activeOwnerCount > 1;

  return (
    <div className="relative flex items-center gap-3 px-4 py-3.5">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface2 text-navy-mid">
        <Icon name={isOwner ? "admin_panel_settings" : "person"} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-navy">
          {member.name}
          {isSelf && <span className="ms-1.5 text-label font-semibold text-muted">({c.you})</span>}
        </p>
        <p className="text-meta text-muted">{isOwner ? c.roleOwner : c.roleMember}</p>
      </div>

      {canManage && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={busy}
            aria-label={c.members}
            aria-expanded={open}
            className="grid h-8 w-8 flex-none place-items-center rounded-sm text-muted transition hover:bg-surface2 hover:text-navy disabled:bg-disabled-bg disabled:text-disabled-fg"
          >
            <Icon name="more_vert" size={18} />
          </button>
          {open && (
            <>
              {/* Click-away layer — keeps the menu dismissible without a document listener. */}
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
              <div className="absolute end-3 top-12 z-20 w-52 overflow-hidden rounded-sm border border-border bg-surface py-1">
                {!isOwner && (
                  <MenuItem
                    onClick={() => {
                      setOpen(false);
                      onPromote(member);
                    }}
                  >
                    {c.promote}
                  </MenuItem>
                )}
                {canDemote && (
                  <MenuItem
                    onClick={() => {
                      setOpen(false);
                      onDemote(member);
                    }}
                  >
                    {c.demote}
                  </MenuItem>
                )}
                {!isOwner && (
                  <MenuItem
                    danger
                    onClick={() => {
                      setOpen(false);
                      onRemove(member);
                    }}
                  >
                    {c.remove}
                  </MenuItem>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3.5 py-2.5 text-start text-body font-semibold transition hover:bg-surface2 ${danger ? "text-danger" : "text-navy"}`}
    >
      {children}
    </button>
  );
}

// ── Confirmation ─────────────────────────────────────────────────────────────

interface ConfirmSpec {
  title: string;
  body: string;
  icon: string;
  confirmLabel?: string;
  danger?: boolean;
  action?: () => Promise<CompanyResult>;
  successMessage?: string;
  /** Set when the action changes the caller's tier, so the session is re-read on success. */
  refreshesTier?: boolean;
  /** Guidance only (e.g. "promote another owner first") — renders a single Cancel/close button. */
  blocking?: boolean;
}

function ConfirmDialog({
  spec,
  busy,
  onCancel,
  onConfirm,
}: {
  spec: ConfirmSpec;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const c = t.company;
  const { locale } = useLocale();
  return (
    <Dialog open onClose={onCancel} size="md" padded={false}>
      <div dir={locale === "ar" ? "rtl" : "ltr"} className="p-6 text-center">
        <span
          className={`mx-auto grid h-[52px] w-[52px] place-items-center rounded-full ${spec.danger ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"}`}
        >
          <Icon name={spec.icon} size={26} />
        </span>
        <h2 className="mt-4 text-title font-extrabold capitalize text-navy">{spec.title}</h2>
        {/* `whitespace-pre-line` so the dissolve copy keeps its paragraph breaks (app parity). */}
        <p className="mt-3 whitespace-pre-line text-start text-body leading-relaxed text-muted">{spec.body}</p>

        <div className="mt-5 flex flex-col gap-1.5">
          {!spec.blocking && (
            <button
              onClick={onConfirm}
              disabled={busy}
              className={`w-full rounded-sm px-5 py-3 text-body font-semibold transition disabled:bg-disabled-bg disabled:text-disabled-fg ${spec.danger ? "bg-danger text-white" : "bg-brand text-brand-fg"}`}
            >
              {spec.confirmLabel ?? spec.title}
            </button>
          )}
          <button
            onClick={onCancel}
            className="w-full rounded-sm px-5 py-2.5 text-body font-semibold text-muted transition hover:bg-surface2"
          >
            {c.cancel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
