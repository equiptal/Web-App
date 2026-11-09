"use client";

import { Icon } from "@/components/ui";
import { latinDigits } from "@/lib/contract/labels";
import type { Dictionary } from "@/lib/i18n/en";
import type { Locale } from "@/lib/i18n/config";
import { companyFindings, type CheckNote, type RequiredPaper } from "@/lib/upload-check/progress";
import type { CheckSnapshot } from "@/lib/upload-check/session";

type CheckStrings = Dictionary["verify"]["pile"]["check"];

/**
 * What the upload check says about the pile, under the file list (company doc check CC-12, plan
 * C7): the required papers it did not find, and the warnings (`notes`).
 *
 * 🔴 **Never red, never a gate.** Missing papers and warnings are amber, «checking» is grey; this
 * line has no button and Send never waits for it (R10). No check (off, refused, busy, over the
 * limit, failed), or a check past its time budget with no answer: nothing at all, the page as it
 * was before the check existed.
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

  if (!check.answered) {
    if (check.timedOut) return null;
    return (
      <p className="flex items-center gap-2 text-meta text-muted" role="status">
        <Icon name="hourglass_top" size={16} /> {s.checking}
      </p>
    );
  }

  const found = check.progress ? companyFindings(check.progress) : null;
  if (!found) return null;
  const { missing, allPresent, notes } = found;
  if (!missing.length && !allPresent && !notes.length) return null;

  const name = (p: RequiredPaper) => (p === "cr" ? s.paperCr : p === "vat" ? s.paperVat : s.paperAddress);
  const names = missing.map(name);
  const joined = names.length > 1 ? `${names.slice(0, -1).join(", ")}${s.namesJoin}${names[names.length - 1]}` : names[0];

  return (
    <div className="flex flex-col gap-2" role="status" data-testid="company-check">
      {missing.length > 0 && (
        <div className="rounded-sm border border-warn/30 bg-warn-soft px-3.5 py-3">
          <p className="flex items-start gap-1.5 text-body font-semibold text-navy">
            <Icon name="info" size={18} className="mt-0.5 flex-none text-warn" />
            {(missing.length === 1 ? s.missingOne : s.missingMany).replace("{names}", joined)}
          </p>
          <p className="mt-1 ps-6 text-meta text-muted">
            {missing.length === 1 ? s.missingSubOne : missing.length === 2 ? s.missingSubTwo : s.missingSubMany}
          </p>
        </div>
      )}
      {!missing.length && allPresent && (
        <p className="flex items-center gap-1.5 text-meta font-semibold text-ok">
          <Icon name="check_circle" size={16} /> {s.allFound}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {notes.map((n, i) => (
            <li
              key={`${n.code}-${n.paper ?? "pile"}-${i}`}
              className="flex items-start gap-1.5 rounded-sm border border-warn/30 bg-warn-soft px-3 py-2 text-meta text-navy"
            >
              <Icon name="warning" size={16} className="mt-0.5 flex-none text-warn" />
              <span>{noteText(n, s, locale)}</span>
            </li>
          ))}
        </ul>
      )}
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
