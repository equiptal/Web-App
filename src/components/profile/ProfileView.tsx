"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale, type Locale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useAuthGate } from "@/components/auth/AuthGate";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";
import { Icon } from "@/components/ui";
import type { RenterProfile, VerificationStatus } from "@/lib/contract/onboarding";
import { updateLanguage } from "@/lib/api/profile-client";
import { Field, FieldGrid, MastheadPill, PageMasthead, Row, RowList, Section } from "@/components/PageSection";
import { EditProfileForm } from "./EditProfileForm";
import { ChangePhoneModal } from "./ChangePhoneModal";
import { DeleteAccountModal } from "./DeleteAccountModal";
import { openSupportMessenger } from "@/components/support/IntercomWidget";
import { btn } from "@/lib/ds";
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
            {tier === "verified" && <Icon name="verified" size={13} />}
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

      {/* Tier banner — basic renter → verify (verified shows the company card verified state below). */}
      {!loading && tier === "basic" && verification !== "pending" && verification !== "verified" && (
        <button
          // → /company, matching the sidebar "Get verified" and the "Start verification" card below.
          // This banner renders alongside that card, so pointing them at different destinations would
          // give the same page two verification nudges that disagree.
          onClick={() => router.push("/company")}
          className={btn("secondary", "lg", { full: true, className: "mt-4 flex justify-between text-start transition" })}
        >
          <div>
            <p className="text-body font-semibold text-navy">{t.shell.tierBasic} · {t.home.nudgeBasicTitle}</p>
            <p className="text-meta text-muted">{t.home.nudgeBasicBody}</p>
          </div>
          <Icon name="arrow_forward" size={18} className="flex-none text-brand rtl:scale-x-[-1]" />
        </button>
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
                <Field icon="domain" label={p.companyName} value={profile.companyName || "—"} />
                <Field icon="chat" label={p.whatsapp} value={profile.whatsapp || "—"} ltr />
              </FieldGrid>
            )}
          </Section>
        )}

          {/* ~~The door to the organization page.~~ Removed (owner, 2026-08-30). The firm has its own
            entry in the account menu and its own page; a row here was a third place the same subject
            appeared, and it was the shortest of the three. Nothing became unreachable — the
            «Get verified» nudge above still points at `/company`, and so does the menu. */}

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
            <Section title={p.settings} grow>
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

