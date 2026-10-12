"use client";

import type { ReactNode } from "react";

/**
 * **An ask, or its answer, as a chat bubble** (Moedatech-App release #548, alignment 1.1 and 1.3; the
 * app's `_AskBubble`, `_AskUnitBox`, `_AskFileChip` and `_AskStatus` in `rentee_request_card.dart`).
 *
 * One sentence with the time beside it, the machine line, the rows an answer names, then one state at
 * the end. Your own bubble is SOLID in your role colour on the RIGHT; the other side's is white on the
 * LEFT, in both languages (1.12 a). Drawing only: every word and state is the caller's.
 */
export function AskBubble({ mine, icon, tone = "accent", sentence, time, unit, rows, foot, onClick, draft = false, actions }: {
  mine: boolean;
  /** Material icon before the sentence. */
  icon: string;
  /** The icon's colour: the ask's orange, or an answer's green or red. White on your own bubble. */
  tone?: "accent" | "ok" | "bad";
  sentence: string;
  time: string;
  /** The machine line under the sentence. */
  unit?: ReactNode;
  /** One row per thing an answer names. */
  rows?: ReactNode[];
  /** The state at the end: «Awaiting reply», «Replied». */
  foot?: ReactNode;
  /** The renter's bubble opens the machine it is about. */
  onClick?: () => void;
  /** Not sent yet (owner, 2026-10-12, option 2A): the same bubble, outlined and white, with
   *  {@link actions} under it. Sending turns it into the solid bubble in place. */
  draft?: boolean;
  /** A draft's Cancel and Send. */
  actions?: ReactNode;
}) {
  const body = (
    <>
      <div className="ab-r1">
        <span className={`material-icons-outlined ab-ic ${tone}`} aria-hidden="true">{icon}</span>
        <span className="ab-t">{sentence}</span>
        <span className="ab-tm">{time}</span>
      </div>
      {rows && rows.length > 0 && <div className="ab-rows">{rows}</div>}
      {unit}
      {foot && <div className="ab-foot">{foot}</div>}
      {actions && <div className="ab-act">{actions}</div>}
    </>
  );
  const cls = `ab ${mine ? "mine" : "them"}${draft ? " draft" : ""}`;
  // A `div` with a button's role rather than a `<button>`: the bubble holds block content.
  return onClick ? (
    <div
      role="button"
      tabIndex={0}
      className={`${cls} press`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      {body}
    </div>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The machine an ask is about, on one small line: photo, name, type and size, year; a pin when the
 *  bubble opens the machine on the map. */
export function AskUnitBox({ name, rest, photoUrl, pin }: { name: string; rest: string; photoUrl: string | null; pin: boolean }) {
  return (
    <div className="ab-ub">
      <span className="ab-th">
        {photoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={photoUrl} alt="" />
        ) : (
          <span className="material-icons-outlined" aria-hidden="true">precision_manufacturing</span>
        )}
      </span>
      <span className="ab-tt">
        <b>{name}</b>
        {rest ? ` · ${rest}` : ""}
      </span>
      {pin && <span className="material-icons-outlined ab-pin" aria-hidden="true">location_on</span>}
    </div>
  );
}

/** One thing an answer names, as a compact white row: a paper or a machine, a grey second line, and
 *  a download mark at the end. One press opens it. */
export function AskFileChip({ icon = "description", iconTone = "accent", name, subtitle, download = false, onClick }: {
  icon?: string;
  iconTone?: "accent" | "green";
  name: string;
  subtitle?: string | null;
  download?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className={`material-icons-outlined ab-fi ${iconTone}`} aria-hidden="true">{icon}</span>
      <span className="ab-nm">
        {name}
        {subtitle && <span className="ab-sb">{subtitle}</span>}
      </span>
      {download && <span className="material-icons-outlined ab-dl" aria-hidden="true">file_download</span>}
    </>
  );
  return onClick ? (
    <button type="button" className="ab-fc" onClick={onClick}>{inner}</button>
  ) : (
    <div className="ab-fc">{inner}</div>
  );
}

/** The supplier's own words beside his file. */
export function AskNote({ text }: { text: string }) {
  return <div className="ab-note">{text}</div>;
}

/** The bottom row's state: a small icon and a short word. An outcome keeps its colour on your own
 *  solid bubble, on a small white chip; a wait is plain white there. */
export function AskStatus({ icon, label, tone }: { icon: string; label: string; tone: "muted" | "ok" | "warn" | "bad" }) {
  return (
    <span className={`ab-st ${tone}`}>
      <span className="material-icons-outlined" aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
