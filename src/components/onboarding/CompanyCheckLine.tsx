"use client";

import { Icon, MIcon } from "@/components/ui";
import { latinDigits } from "@/lib/contract/labels";
import type { Dictionary } from "@/lib/i18n/en";
import type { Locale } from "@/lib/i18n/config";
import { REQUIRED_PAPERS, type CheckNote, type RequiredPaper } from "@/lib/upload-check/progress";
import type { CheckSnapshot } from "@/lib/upload-check/session";

type CheckStrings = Dictionary["verify"]["pile"]["check"];

type Phase = "preparing" | "checking" | "done";
type CardState = "waiting" | "checking" | "found" | "missing" | "unchecked";

export interface CheckView {
  phase: Phase;
  cards: Record<RequiredPaper, CardState>;
  missing: RequiredPaper[];
  /** Done, but a paper could not be judged (a failed check, past its budget, `not_checked`). */
  unchecked: boolean;
  notes: CheckNote[];
}

/**
 * What the check says, as the app's scan sheet shows it (`submission_scan_sheet.dart`): a phase
 * for the banner and a state per required paper.
 *
 * ⚠️ **Only an ANSWER can say «missing»** (R2): past the time budget, or on a failed check, every
 * paper is «not checked», never missing, and no warning shows (the app does the same).
 */
export function checkView(check: CheckSnapshot): CheckView {
  const all = (state: CardState) =>
    Object.fromEntries(REQUIRED_PAPERS.map((p) => [p, state])) as Record<RequiredPaper, CardState>;
  const p = check.progress;
  if (!check.answered && !check.timedOut) {
    const phase: Phase = check.checkId ? "checking" : "preparing";
    return { phase, cards: all(phase === "checking" ? "checking" : "waiting"), missing: [], unchecked: false, notes: [] };
  }
  if (!check.answered || !p || p.status !== "done") {
    return { phase: "done", cards: all("unchecked"), missing: [], unchecked: true, notes: [] };
  }
  const stateOf = (paper: RequiredPaper) => p.papers.find((x) => x.paper === paper)?.state ?? "not_checked";
  const cards = Object.fromEntries(
    REQUIRED_PAPERS.map((paper) => {
      const s = stateOf(paper);
      return [paper, s === "present" ? "found" : s === "missing" ? "missing" : "unchecked"];
    }),
  ) as Record<RequiredPaper, CardState>;
  // Named in the order the cards show them (the app's), not the contract's.
  const missing = SHOWN.filter((paper) => cards[paper] === "missing");
  const unchecked = REQUIRED_PAPERS.some((paper) => cards[paper] === "unchecked");
  return { phase: "done", cards, missing, unchecked, notes: p.notes };
}

/** The order the cards show: the app's (`ScanLane.company`) and this page's tiles, not the contract's. */
const SHOWN: readonly RequiredPaper[] = ["cr", "address", "vat"];

const EXAMPLE: Record<RequiredPaper, string> = {
  cr: "/check-examples/co-cr.webp",
  vat: "/check-examples/co-vat.webp",
  address: "/check-examples/co-address.webp",
};

/**
 * The upload check on the company pile (company doc check CC-12): a banner with the check's
 * progress, a card per required paper with its own state, and the warnings. The app's scan sheet,
 * on the page instead of in a sheet, since the web has no step between the files and Send.
 *
 * 🔴 **Never red, never a gate.** Missing papers and warnings are amber; nothing here has a button
 * and Send never waits for it (R10). No check (`null`: off, refused, busy, over the limit, failed to
 * start) = nothing at all, the page as it was before the check existed.
 *
 * Unknown note codes and notes on papers this page did not ask for never reach here
 * (`parseProgress` drops them), so a later server adding a code changes nothing on screen.
 */
export function CompanyCheckLine({
  check,
  s,
  locale,
}: {
  check: CheckSnapshot | null;
  s: CheckStrings;
  locale: Locale;
}) {
  if (!check) return null;
  const view = checkView(check);
  return (
    <div className="flex flex-col gap-2" data-testid="company-check">
      <Banner view={view} s={s} />
      {SHOWN.map((paper) => (
        <PaperCard key={paper} paper={paper} state={view.cards[paper]} s={s} />
      ))}
      {view.notes.map((n, i) => {
        const amber = n.code !== "file_seen_elsewhere";
        return (
          <p
            key={`${n.code}-${n.paper ?? "pile"}-${i}`}
            className={`flex items-start gap-1.5 rounded-sm px-3 py-2 text-meta font-semibold text-navy ${
              amber ? "border border-warn/30 bg-warn-soft" : "border border-border bg-surface2"
            }`}
          >
            <Icon
              name={amber ? "warning" : "info"}
              size={16}
              className={`mt-0.5 flex-none ${amber ? "text-warn" : "text-muted"}`}
            />
            <span>{noteText(n, s, locale)}</span>
          </p>
        );
      })}
    </div>
  );
}

function paperName(p: RequiredPaper, s: CheckStrings) {
  return p === "cr" ? s.paperCr : p === "vat" ? s.paperVat : s.paperAddress;
}

function Banner({ view, s }: { view: CheckView; s: CheckStrings }) {
  const { phase, missing, unchecked } = view;
  const names = missing.map((p) => paperName(p, s));
  const joined = names.length > 1 ? `${names.slice(0, -1).join(", ")}${s.namesJoin}${names[names.length - 1]}` : names[0];

  const [tone, icon, title, sub] =
    phase === "preparing"
      ? (["info", null, s.preparing, s.preparingSub] as const)
      : phase === "checking"
        ? (["info", null, s.checking, s.checkingSub] as const)
        : missing.length > 0
          ? ([
              "warn",
              "error_outline",
              (missing.length === 1 ? s.missingOne : s.missingMany).replace("{names}", joined),
              missing.length === 1 ? s.missingSubOne : missing.length === 2 ? s.missingSubTwo : s.missingSubMany,
            ] as const)
          : unchecked
            ? (["muted", "info", s.unchecked, s.reviewSub] as const)
            : (["ok", "check_circle", s.allFound, s.reviewSub] as const);

  const box = {
    info: "border-info/25 bg-info-soft",
    warn: "border-warn/30 bg-warn-soft",
    ok: "border-ok/30 bg-ok-soft",
    muted: "border-border bg-surface2",
  }[tone];
  // Icons take the base colour; TEXT takes the deep one (`--warn` is fill-only, `--ok` is too light
  // on its own soft fill for 13px text).
  const fg = { info: "text-info", warn: "text-warn", ok: "text-ok", muted: "text-muted" }[tone];
  const ink = { info: "text-navy", warn: "text-warn-deep", ok: "text-ok-deep", muted: "text-navy" }[tone];
  const bar = { info: "bg-info", warn: "bg-warn", ok: "bg-ok", muted: "bg-muted" }[tone];
  const width = phase === "preparing" ? "w-1/3" : phase === "checking" ? "w-2/3" : "w-full";
  const steps = [
    { label: s.stepPrepare, on: true },
    { label: s.stepCheck, on: phase !== "preparing" && !(phase === "done" && unchecked && !missing.length) },
    { label: s.stepReady, on: phase === "done" },
  ];

  return (
    <div className={`rounded-sm border px-3.5 py-3 ${box}`} role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        {/* ⚠️ The spinner is a Material SYMBOL: `Icon` draws Material Icons Outlined, which has no
            `progress_activity`, so it printed the word itself, full width. */}
        {icon ? (
          <Icon name={icon} size={20} className={`mt-0.5 flex-none ${fg}`} />
        ) : (
          <MIcon name="progress_activity" size={20} className={`mt-0.5 flex-none motion-safe:animate-spin ${fg}`} />
        )}
        <div className="min-w-0">
          <p className={`text-body font-semibold ${ink}`}>{title}</p>
          <p className="mt-0.5 text-meta text-muted">{sub}</p>
        </div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-navy/10">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${bar} ${width} ${
            phase === "done" ? "" : "motion-safe:animate-pulse"
          }`}
        />
      </div>
      <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {steps.map((st, i) => (
          <li key={st.label} className={`text-label ${st.on ? "font-semibold text-navy" : "text-muted-light"}`}>
            {latinDigits(String(i + 1))} {st.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function PaperCard({ paper, state, s }: { paper: RequiredPaper; state: CardState; s: CheckStrings }) {
  const hint = paper === "cr" ? s.hintCr : paper === "vat" ? s.hintVat : s.hintAddress;
  const [icon, text, fg] = {
    waiting: [null, s.cardWaiting, "text-muted"],
    checking: ["progress_activity", s.cardChecking, "text-info"],
    found: ["check_circle", s.cardFound, "text-ok-deep"],
    missing: ["error_outline", s.cardMissing, "text-warn-deep"],
    unchecked: ["help_outline", s.cardUnchecked, "text-muted"],
  }[state] as [string | null, string, string];
  // The example picture says what the paper looks like; grey until the check finds it (the app's).
  const grey = { found: 0, missing: 1, checking: 0.4, waiting: 0.6, unchecked: 0.6 }[state];

  return (
    <div
      className={`flex items-start gap-3 rounded-sm border px-3 py-2.5 ${
        state === "missing" ? "border-warn/30 bg-warn-soft" : state === "found" ? "border-ok/30 bg-surface" : "border-border bg-surface"
      }`}
      data-paper={paper}
      data-state={state}
    >
      <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-sm border border-border bg-surface2">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 10 KB static example, no resizing to gain */}
        <img
          src={EXAMPLE[paper]}
          alt=""
          className={`h-full w-full object-contain transition ${state === "missing" ? "opacity-55" : ""}`}
          style={{ filter: `grayscale(${grey})` }}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-navy">{paperName(paper, s)}</p>
        <p className="text-meta text-muted">{hint}</p>
        <p className={`mt-1.5 flex items-center gap-1 text-meta font-semibold ${fg}`}>
          {icon === "progress_activity" ? (
            <MIcon name={icon} size={14} className="flex-none motion-safe:animate-spin" />
          ) : (
            icon && <Icon name={icon} size={14} className="flex-none" />
          )}
          {text}
        </p>
      </div>
    </div>
  );
}

/** A note in words. The paper and the date are the only things a note carries (contract §7). */
export function noteText(n: CheckNote, s: CheckStrings, locale: Locale): string {
  const paper = n.paper === "cr" ? s.inlineCr : n.paper === "vat" ? s.inlineVat : n.paper === "address" ? s.inlineAddress : "";
  switch (n.code) {
    case "expired":
      return s.noteExpired.replace("{paper}", paper).replace("{date}", formatDay(n.date ?? "", locale));
    case "unclear_number":
      return s.noteUnclearNumber.replace("{paper}", paper);
    case "name_mismatch":
      return s.noteNameMismatch;
    case "cr_on_platform":
      return s.noteCrOnPlatform;
    case "file_seen_elsewhere":
      return s.noteFileSeenElsewhere;
  }
}

/** `YYYY-MM-DD` in the renter's language, Gregorian, Latin digits (the app-wide rule). */
function formatDay(day: string, locale: Locale): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return latinDigits(
    d.toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
}
