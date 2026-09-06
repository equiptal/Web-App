/* eslint-disable no-restricted-syntax -- see the note below: these colours are deliberately foreign */
import type { ReactNode } from "react";

/**
 * ── Outlook's and Gmail's own chrome, and why the colours are hard-coded ────────────────────────
 *
 * Owner, 2026-09-06: *"use exactly as outlook ui, same colors same icons same background same text
 * etc."*
 *
 * 🔴 **These are FOREIGN colours and they must never reach `ds-colors.ts` or `globals.css`.** They
 * are Microsoft's and Google's, they are here to imitate a window this renter can no longer open,
 * and the moment one of them is promoted to a token it starts appearing on screens that are ours.
 * Local constants, in one place, unreachable from anywhere else in the app.
 *
 * ⚠️ **The chrome follows the CHANNEL he picked.** An Outlook frame around a message going out
 * through Gmail would be a preview of the wrong client — which is the whole failure this exists to
 * avoid. Picking Gmail redraws it in Gmail's.
 *
 * ⚠️ Values from each client's current compose window: Fluent 2 for Outlook Web, Material for
 * Gmail. Approximations of a live UI, not a specification, so treat a mismatch as worth fixing
 * rather than as a contract broken.
 */
export const MAIL_UI = {
  outlook: {
    font: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, system-ui, sans-serif",
    ground: "#ffffff",
    fieldGround: "#ffffff",
    divider: "#e1dfdd",
    label: "#616161",
    text: "#242424",
    subject: "#242424",
    chipGround: "#f0f0f0",
    chipText: "#242424",
    chipBorder: "#e1dfdd",
    accent: "#0f6cbd",
    bodyGround: "#ffffff",
  },
  gmail: {
    font: "'Google Sans', Roboto, Arial, sans-serif",
    ground: "#ffffff",
    fieldGround: "#ffffff",
    divider: "#e0e0e0",
    label: "#5f6368",
    text: "#202124",
    subject: "#202124",
    chipGround: "#f1f3f4",
    chipText: "#202124",
    chipBorder: "#f1f3f4",
    accent: "#1a73e8",
    bodyGround: "#ffffff",
  },
} as const;

export type MailSkin = (typeof MAIL_UI)[keyof typeof MAIL_UI];

/**
 * One row of a compose header: a label, and its value.
 *
 * ⚠️ The label column is fixed so Subject, From, To and Bcc line up down the left edge. That
 * alignment IS what makes a block of text read as a mail header rather than as a paragraph.
 */
export function MailField({ label, skin, children }: { label: string; skin: MailSkin; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-1.5" style={{ borderBottom: `1px solid ${skin.divider}` }}>
      {/* ⚠️ Sentence case, not our uppercase label style. Neither client shouts its field names,
          and the difference is one of the things that makes a header read as foreign or as ours. */}
      <span className="w-[38px] flex-none pt-1 text-[12px]" style={{ color: skin.label }}>
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/**
 * The people on one line, each as their own chip.
 *
 * ⚠️ Chips rather than a comma-joined string, because he is CHECKING a list of people before it
 * leaves and a run-on line is the shape an eye slides off. It is also the only way the count is
 * readable at a glance, which is the question he is actually asking.
 */
/** One person on an addressed line. The name is what a client shows; the address is what it sends. */
export interface MailPerson {
  address: string;
  name?: string | null;
}

/**
 * ⚠️ **The NAME leads, the address is the tooltip** — which is what both clients do, and it is
 * the difference between a header a renter can check and a row of strings he has to decode. He
 * knows «Al Faisal Rentals»; he does not necessarily know `ops@alfaisal.sa` belongs to them.
 *
 * The address stands alone when we have no name for it, because a chip with nothing readable on it
 * is worse than a raw address.
 */
export function MailChips({ people, empty, skin }: { people: MailPerson[]; empty: string | null; skin: MailSkin }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1 py-0.5">
        {people.length === 0 ? (
          <span className="text-[12px]" style={{ color: skin.label }}>{empty}</span>
        ) : (
          people.map((who) => (
            /* ⚠️ A pill with an initial disc, which is what both clients draw. The disc is what
               makes a chip read as a PERSON rather than as a tag. */
            <span
              key={who.address}
              dir={who.name ? undefined : "ltr"}
              title={who.name ? `${who.name} · ${who.address}` : who.address}
              className="inline-flex h-[24px] max-w-full items-center gap-1.5 rounded-full ps-0.5 pe-2.5 text-[12px]"
              style={{ background: skin.chipGround, color: skin.chipText, border: `1px solid ${skin.chipBorder}` }}
            >
              <span
                aria-hidden
                className="grid h-[19px] w-[19px] flex-none place-items-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: skin.accent }}
              >
                {((who.name || who.address).trim()[0] || "?").toUpperCase()}
              </span>
              <span className="truncate">{who.name || who.address}</span>
            </span>
          ))
        )}
    </span>
  );
}
