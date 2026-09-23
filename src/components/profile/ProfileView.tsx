"use client";

import { useEffect, useState } from "react";
import { VerifiedMark } from "@/components/VerifiedMark";
import { useRouter } from "next/navigation";
import { useT, useLocale, type Locale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useAuthGate } from "@/components/auth/AuthGate";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";
import { Icon } from "@/components/ui";
import type { RenterProfile, VerificationStatus } from "@/lib/contract/onboarding";
import { updateLanguage } from "@/lib/api/profile-client";
import { Field, FieldGrid, MastheadPill, PageMasthead, Row, RowList, Section } from "@/components/PageSection";
import { CompanyHub } from "@/components/company/CompanyHub";
import { CompanyDetails } from "@/components/company/CompanyDetails";
import { CompanyLogoModal } from "@/components/company/CompanyLogoModal";
import { Dialog } from "@/components/Dialog";
import { VerifyModal } from "@/components/onboarding/VerifyModal";
import { EditProfileForm } from "./EditProfileForm";
import { ChangePhoneModal } from "./ChangePhoneModal";
import { DeleteAccountModal } from "./DeleteAccountModal";
import { openSupportMessenger } from "@/components/support/IntercomWidget";
import { SkeletonFields, SkeletonRows, SkeletonSection } from "@/components/Skeleton";
import { pin } from "@/lib/uiPins";

/* ~~`SUPPORT_URL`, `PRIVACY_URL`, `TERMS_URL` — three pages on the marketing site.~~ All three
   404, and none of them is where the app sends anyone. See the rows in the settings list below. */

/**
 * Profile tab (app parity: profile_page.dart + settings_page.dart) — navy header, tier banner, an
 * editable profile card, company/verification state, and a settings section (language, change phone,
 * legal/support, delete account, logout). All web-only; every action proxies an existing backend
 * endpoint via the /api/me/* BFF routes.
 */
export function ProfileView() {
  const t = useT();
  const p = t.profile;
  const { locale, setLocale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { user, tier, signOut } = useSession();
  const { openAuth } = useAuthGate();

  const [profile, setProfile] = useState<RenterProfile | null>(null);
  const [verification, setVerification] = useState<VerificationStatus>("none");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  /**
   * The logo dialog. Two doors: `?logo=1`, which the quotation and the deal room link to when
   * there is no mark yet, and the mark itself on the company card, which is the app own control
   * (`CompanyLogoEditor`) and the only one that can CHANGE or REMOVE a logo already on file.
   */
  const [logoOpen, setLogoOpen] = useState(false);
  /**
   * The company's own particulars, over this page.
   *
   * 🔴 **Offered only once something has been SUBMITTED**, which is the app's own rule
   * (`company_profile_card._verificationSection`, on `supplierStatus`): 1 / 2 / 3 open the
   * read-only details, 0 has nothing to show. It reads the same two endpoints the app reads.
   */
  const [detailsOpen, setDetailsOpen] = useState(false);
  /* ~~`firmName`.~~ Swept with the rule it served: the Company row is drawn on every visit now,
     so nothing asks whether a firm exists. Its own note argued that `null` had to mean «not
     looked yet» rather than «no firm», which is still true of anything that asks again. */
  const [langBusy, setLangBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { user?: RenterProfile; verification?: { status?: VerificationStatus } }) => {
        if (!active) return;
        if (d.user) setProfile(d.user);
        if (d.verification?.status) setVerification(d.verification.status);
      })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  /* ── Arriving from the quotation (2026-09-23) ──────────────────────────────────────────────────
     Its two red asks link here: `?verify=1` opens verification, `?logo=1` the logo dialog. The logo
     dialog waits for the profile, since it sends the renter's own names with the key, and falls back
     to verification for an unverified renter, the app's order. Read once, then dropped from the
     address so a reload does not reopen it. */
  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const wantsLogo = q.get("logo") === "1";
    const wantsVerify = q.get("verify") === "1";
    if (!wantsLogo && !wantsVerify) return;
    if (wantsLogo && profile?.tier === "verified") setLogoOpen(true);
    else setVerifyOpen(true);
    q.delete("logo");
    q.delete("verify");
    const rest = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, [loading, profile?.tier]);

  const onSaved = (next: RenterProfile) => {
    setProfile(next);
    setEditing(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  const switchLang = async (l: Locale) => {
    if (l === locale || langBusy) return;
    setLocale(l); // instant UI locale (i18n)
    setLangBusy(true);
    await updateLanguage(l); // best-effort server persist (push-notification language)
    setLangBusy(false);
  };

  const doLogout = async () => {
    await signOut();
    router.replace("/");
  };

  const onReLogin = () => {
    // Phone (identity) changed — cookies were cleared by the BFF; drop client state + re-authenticate.
    // Public web: re-auth via the modal form in place (no /login page). Legacy/prod: the /login gate.
    void signOut();
    if (PUBLIC_WEB_ENABLED) openAuth();
    else router.replace("/login");
  };

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
  /**
   * The first letter of the name, or nothing to show one from.
   *
   * Spread rather than indexed: `"خالد"[0]` is fine but an emoji or a surrogate pair would be cut in
   * half by an index, and a name is the last place to render half a character. Falls back to a mark
   * rather than a letter when there is no name yet — a blank circle reads as a failure to load.
   */
  const initial = [...(fullName || "")][0] ?? null;
  const tierLabel = tier === "verified" ? t.shell.tierVerified : tier === "basic" ? t.shell.tierBasic : t.shell.tierGuest;


  return (
    /* ── One WIDTH with the organization page, and now one SHAPE (owner, 2026-08-26 · 2026-08-30) ──
       The two account pages were different widths, so the field grid they share broke to one column
       at a different viewport on each. That is still fixed — what changed is the width they agree
       on. ~~672px centred.~~ At 1440 that left two thirds of the row empty either side of a stack of
       half-filled cards, and the reading argument for a narrow measure does not hold for fields and
       rows. Both pages are the shell's width now, and both split in two at `lg`.

       Here the split is *who you are* against *how this account behaves*: the profile and the door
       to the firm on one side, the settings and the way out on the other. They are separate errands
       — nobody edits their job title and changes the interface language in the same visit — and side
       by side neither buries the other. */
    <div {...pin("profile-view")} className="w-full pb-10" dir={ar ? "rtl" : "ltr"}>
      {/* ── One masthead shape across the account pages (owner, 2026-08-26) ──────────────────────
          Light, like the organization page's, and for the same reason: a navy slab directly above a
          white card makes the page read as stacked boxes rather than a person with their details
          under them. Round mark rather than square — this one is somebody.

          The mark is the initial, not a generic `account_circle`. A glyph every account shares says
          nothing; the letter says whose page this is, and it is the same letter the roster draws
          beside this person's name on the organization page. */}
      <PageMasthead
        tone="plain"
        iconShape="circle"
        icon={
          initial ? (
            <span className="text-display font-extrabold text-brand">{initial}</span>
          ) : (
            <Icon name="account_circle" size={30} className="text-white/70" />
          )
        }
        title={p.greeting.replace("{name}", fullName ? (ar ? `، ${fullName}` : `, ${fullName}`) : "")}
        subtitle={<span dir="ltr">{user?.phone ?? profile?.phone ?? "—"}</span>}
        badge={
          <MastheadPill tone={tier === "verified" ? "ok" : "neutral"} onLight>
            {tier === "verified" && <VerifiedMark size={13} />}
            {tierLabel}
          </MastheadPill>
        }
      />

      {/* The two columns this page is about to draw — who you are on one side, how the account
          behaves on the other — so nothing moves when they arrive. */}
      {loading && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <SkeletonSection><SkeletonFields rows={3} /></SkeletonSection>
          <SkeletonSection><SkeletonRows rows={5} /></SkeletonSection>
        </div>
      )}
      {loadError && !loading && (
        <p className="mt-6 rounded-sm border border-danger/30 bg-danger-soft px-4 py-3 text-center text-body font-semibold text-danger">
          {p.loadError}
        </p>
      )}

      {/* ── The banner is GONE; the company card asks the question (owner, 2026-09-12) ──────────
          *"why ui is trash here, keep the create as part of the company but show it nice and without
          ui bugs"*.

          🔴 **Three faults, and the first two were real bugs, not taste.**
          (1) A `<button>` with a fake CTA `<span>` inside it, styled as a second button. Two
              affordances for one press: the whole slab was the control and the orange pill only
              looked like one.
          (2) The company topic in TWO places. This slab said *"…or join an existing company with an
              invite code below"* and pointed three hundred pixels down at the card that owns the
              other half, so the reader met one errand twice and had to reconcile them himself.
          (3) A full-width band above a two-column grid, which is the shape the page uses for the
              masthead alone.
          The create route now sits inside the company card, where the join route already lives —
          see `CompanyHub`'s `NoCompanyCard`. This REVERSES the move made earlier the same day
          (*"make one CTA for the verify"*); what that ruling protected survives, because there is
          still exactly one place to press. */}

      {/* ⚠️ The form, over the page he is already on. It was a route until 2026-09-12 — see
          `VerifyModal` for why it stopped being one. */}
      <VerifyModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
      <CompanyLogoModal
        open={logoOpen}
        profile={profile}
        onClose={() => setLogoOpen(false)}
        onSaved={() => {
          // Re-read, so the presigned mark is the one on file from now on.
          fetch("/api/me", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { user?: RenterProfile } | null) => d?.user && setProfile(d.user))
            .catch(() => {});
        }}
      />

      {/* ⚠️ A LAYER, not a card on the page. Stacked under his own details these particulars made
          the profile a filing cabinet, which is the whole of the 2026-09-07 removal and still true;
          what was wrong was that they then had nowhere to be read at all. The app gives them a
          screen of their own, and this is that screen on a page that has no routes left to give. */}
      {detailsOpen && (
        <Dialog
          open
          onClose={() => setDetailsOpen(false)}
          size="lg"
          icon={<Icon name="domain" size={20} className="text-brand-deep" />}
          title={p.companyDetails}
          padded={false}
        >
          <CompanyDetails />
        </Dialog>
      )}


      {/* ── Two columns: who you are, and how the account behaves (owner, 2026-08-30) ─────────
          *"Make one column for profile and redirect to the organisation, and other column for
          settings."*

          They are separate errands — nobody edits their job title and changes the interface language
          in the same visit — and stacked, the settings sat below a card most visits never touch. The
          masthead and the verify nudge stay full width above: one is who the page is about, the
          other is the one thing on it that should not have to be found.

          ~~`items-start` so a short column ends where its content does.~~ Withdrawn the same day:
          *"I want both columns to have same length, same start and same end."* The columns stretch
          to the taller of the two, and one card in each is marked `grow` so it absorbs the
          difference — the field grid on the left, the settings rows on the right, both of which can
          use the height. A column that stopped short left a strip of page under it beside a card
          that ran on, which read as one of the two having failed to load. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col">
        {!loading && profile && (
          <Section
            // The section names the SUBJECT and its action names the act; both read «Edit profile»
            // before, so the heading and the button on the same line said the same thing.
            title={p.profileSection}
            action={
              !editing && (
                /* Amber text, not a bordered button (owner reference, 2026-08-26). A section label is
                   a quiet line and a boxed control beside it outweighed the heading it belonged to —
                   the eye landed on «Edit profile» before «PROFILE». The act stays obvious without a
                   border because it is the only coloured thing on that line. */
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 text-body font-semibold text-brand transition hover:underline"
                >
                  <Icon name="edit" size={15} /> {p.editProfile}
                </button>
              )
            }
          >
            {savedToast && (
              <p className="mx-4 mt-4 flex items-center gap-1.5 rounded-sm border border-ok/30 bg-ok-soft px-3 py-2 text-meta font-semibold text-ok">
                <Icon name="check_circle" size={15} /> {p.saved}
              </p>
            )}
            {/* ── Marked, and paired the way the reference pairs them (owner, 2026-08-26) ─────────
                The same amber tiles the organization page gives a firm's particulars, so a person's
                details and a company's read as one family of fact rather than two designs.

                The order matters because the grid fills in rows: who and where, then what they do
                and how to write to them, then which firm and which number. It used to run
                name · city · job · company · email · whatsapp, which paired a job title with a
                company name and left the two contact fields alone on the last row — a sensible list
                and an odd table. And the name's label was «First name / Last name», a form's
                question rather than a fact's name. */}
            {editing ? (
              <div className="p-4">
                <EditProfileForm profile={profile} onSaved={onSaved} onCancel={() => setEditing(false)} />
              </div>
            ) : (
              <FieldGrid>
                <Field icon="person" label={p.name} value={fullName || "—"} />
                <Field icon="location_on" label={p.city} value={profile.city || "—"} />
                <Field icon="work" label={p.jobTitle} value={profile.jobTitle || "—"} />
                <Field icon="mail" label={p.email} value={profile.email || "—"} ltr />
                {/* ── The company name is ALWAYS here, because it is always a field of this form
                    (owner, 2026-09-22: *"first i must view all fields here, why the company name not
                    shown"*) ───────────────────────────────────────────────────────────────────────
                    ~~Drawn only when there was NO firm (owner, 2026-09-07: *"how yesr test and EQ
                    Rental, 2 names? which one"*).~~ He was right that two names under one word is
                    unreadable, and hiding one was the wrong half to fix: this grid is the read-back
                    of the edit form beside it, so a field the form collects and the grid does not
                    show reads as a field that failed to save.
                    **They are two different facts and they are labelled as two now**: this is the
                    DISPLAY name he types on his profile (the app's own words: *"display/trade
                    company name — saved to the profile, NOT to verification"*), and the firm's
                    block below carries the LEGAL name off the CR. Same split the app keeps. */}
                <Field icon="domain" label={p.companyName} value={profile.companyName || "—"} />
                <Field icon="chat" label={p.whatsapp} value={profile.whatsapp || "—"} ltr />
              </FieldGrid>
            )}
          </Section>
        )}

          {/* ── THE FIRM, under the person (owner, 2026-09-04) ─────────────────────────────────
              *"The my organization will be removed in the nav bar and we will not have it as
              separate page but just part of user profile below his personal info."*

              ~~A row here linking to `/company`, itself removed on 2026-08-30 as a third door to the
              same subject.~~ There is no page to link to now: the whole hub renders here — join by
              code, the papers, the roster, the invite code, the way out — under the renter's own
              details, which is the order of the fact. His account is his, and the firm is something
              his account belongs to.

              It keeps the LEFT column, beside the settings, because that column is «who you are» and
              this is part of that answer. `embedded` drops the page furniture the hub used to bring
              (its own padding, its own `dir`, the firm's masthead) — see `CompanyHub`. */}
          {!loading && (
            <div className="mt-5">
              <CompanyHub
                embedded
                /* The form is a dialog over THIS page, so the page owns it and the card asks for
                   it. Withheld once he is verified or waiting on it: verification creates the
                   company, so offering to create a second one would be a press with nowhere to go. */
                onCreateCompany={
                  verification !== "pending" && verification !== "verified"
                    ? () => setVerifyOpen(true)
                    : undefined
                }
                /* 🔴 **Whatever was submitted can be READ, and that is the app's split.** 1 / 2 / 3
                   open the details; only 0 and 3 offer the form above, because a submission under
                   review must not be sent a second time — *"sending again is what stacks a
                   duplicate for the reviewer"*. A rejected one gets both, as it does in the app. */
                onViewDetails={verification === "none" ? undefined : () => setDetailsOpen(true)}
                /* 🔴 **The mark, and the only way to change or remove one** (owner, 2026-09-23:
                   *"match it"*). The quotation red ask carries `!companyLogoUrl`, so before this the
                   web could SET a logo once and never touch it again. `CompanyHub` withholds the
                   press from a member, the app own owner gate. */
                logoUrl={profile?.companyLogoUrl ?? null}
                onEditLogo={() => setLogoOpen(true)}
              />
            </div>
          )}

        </div>

        <div className="flex min-w-0 flex-col">
        {/* ~~«Rewards & referrals — coming soon».~~ Removed (owner, 2026-08-30). A greyed row for a
            thing that does not exist is a promise with no date on it: it took a card's worth of the
            settings column, could not be pressed, and told the reader nothing they could act on. It
            comes back when there is a rewards page to send them to. */}

        {/* SETTINGS is what the account menu calls this page, so it is a titled section OF it rather
            than a separate destination (owner, 2026-08-26). */}
        {!loading && (
          <>
            {/* ~~`grow`, so the two columns ended level (owner, 2026-08-30).~~ Withdrawn (owner,
                2026-09-07: *"the settings card is too long, fit its height to the content"*). The
                left column grew a great deal when the firm moved onto this page, and matching it
                stretched five rows of settings down a screen of empty card — a box mostly made of
                nothing, which is worse than two columns ending at different heights. */}
            <Section title={p.settings}>
              <RowList>
                <Row icon="language" label={p.language} hint={ar ? p.arabic : p.english} chevron={false}>
                  <span className="flex flex-none overflow-hidden rounded-sm border border-border">
                    <LangBtn active={!ar} disabled={langBusy} onClick={() => switchLang("en")}>EN</LangBtn>
                    <LangBtn active={ar} disabled={langBusy} onClick={() => switchLang("ar")}>عر</LangBtn>
                  </span>
                </Row>
                <Row icon="smartphone" label={p.changePhone} hint={p.changePhoneSub} onClick={() => setShowChangePhone(true)} />
                {/* ── The three that 404'd (owner, 2026-08-30) ───────────────────────────
                    All three pointed at pages on the marketing site that do not exist —
                    `moedatech.net/privacy`, `/terms`, `/contact` — and the app uses none of them. Its
                    two legal routes render `GET /app/content/{key}` in-app, and every one of its
                    support touchpoints goes through Intercom, which this web app has already booted
                    against the same user id. So: the documents open on our own pages, reading the
                    same rows the app reads, and Support raises the messenger. */}
                <Row icon="shield" label={p.privacy} onClick={() => router.push("/legal/privacy-policy")} />
                <Row icon="description" label={p.terms} onClick={() => router.push("/legal/terms-of-use")} />
                <Row icon="support_agent" label={p.support} onClick={openSupportMessenger} />
              </RowList>
            </Section>

            {/* Leaving and deleting, together and last. Sign out sat among the links to privacy and
                support, where it read as another page to visit rather than the end of a session. */}
            <Section title={p.accountSection}>
              <RowList>
                <Row icon="logout" label={p.logout} onClick={doLogout} chevron={false} />
                <Row icon="delete" label={p.deleteAccount} hint={p.deleteAccountSub} danger onClick={() => setShowDelete(true)} chevron={false} />
              </RowList>
            </Section>
          </>
        )}
        </div>
      </div>


      {showChangePhone && <ChangePhoneModal onClose={() => setShowChangePhone(false)} onReLogin={onReLogin} />}
      {showDelete && (
        <DeleteAccountModal
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            void signOut();
            router.replace("/");
          }}
        />
      )}
    </div>
  );
}

function LangBtn({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`px-3 py-1.5 text-meta font-semibold transition disabled:bg-disabled-bg disabled:text-disabled-fg ${active ? "bg-brand text-brand-fg" : "bg-surface text-navy-mid hover:bg-surface2"}`}
    >
      {children}
    </button>
  );
}

