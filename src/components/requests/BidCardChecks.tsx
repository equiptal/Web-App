"use client";

/**
 * **BC-2 — the bid card's checks row.**
 *
 * Two halves, one grammar: **ring · label · counts**. Every number here is `bid-card-checks.ts`'s;
 * this file paints and decides nothing, which is what lets a dozen card states be asserted in the
 * node suite without rendering a single card.
 *
 * It replaces the card's separate Equipment and Terms rows. Both of their entry points survive —
 * the equipment half still links to the verification map, the terms half still opens the terms
 * modal — because collapsing the rows was about crowding, not about taking routes away.
 *
 * The ring is a conic gradient rather than an SVG: the arcs are contiguous shares of one circle with
 * no caps, joins or stroke geometry to get wrong, and `checkArcs` already hands over exactly those
 * shares in ring order.
 */

import { checkArcs, type BidCardCheck, type CheckTone } from "@/lib/contract/bid-card-checks";

type LFn = (en: string, ar: string) => string;

const TONE_COLOUR: Record<CheckTone, string> = {
  good: "#1daf58",
  bad: "#d9362a",
  warn: "#d4780a",
  dead: "#c3d2e0",
  none: "#c3d2e0",
};

/** The ring, built from the arcs the model states. A dead or empty half draws one flat track. */
function Ring({ check }: { check: BidCardCheck }) {
  const arcs = checkArcs(check);
  const size = 34;
  const track = check.dead ? TONE_COLOUR.dead : check.allClear ? TONE_COLOUR.good : "#e4ecf3";

  let gradient = `conic-gradient(${track} 0turn 1turn)`;
  if (arcs.length > 0) {
    const stops: string[] = [];
    let at = 0;
    check.parts.forEach((p, i) => {
      const share = arcs[i];
      if (share <= 0) return; // a zero count prints as «●0» but draws no arc
      stops.push(`${TONE_COLOUR[p.tone]} ${at}turn ${at + share}turn`);
      at += share;
    });
    gradient = `conic-gradient(${stops.join(", ")})`;
  }

  return (
    <span style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-block" }}>
      <span style={{ display: "block", width: size, height: size, borderRadius: "50%", background: gradient }} />
      {/* The hole. An inset disc rather than a border, so the arcs stay true shares of the circle. */}
      <span style={{ position: "absolute", inset: 5, borderRadius: "50%", background: "#fff" }} />
      {check.allClear && (
        <span
          className="material-icons-outlined"
          style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 15, color: TONE_COLOUR.good }}
        >
          check
        </span>
      )}
      {/* News rides ON the ring — it is news without a strip of its own. */}
      {check.hasNews && (
        <span style={{ position: "absolute", insetInlineEnd: -1, top: -1, width: 9, height: 9, borderRadius: "50%", background: "#1a7ec8", border: "1.5px solid #fff" }} />
      )}
    </span>
  );
}

/**
 * One half: the ring, what it is about, and the counts under it.
 *
 * `allClear` prints the tick line and NO counts — a half with nothing outstanding saying "0 missing"
 * beside "3 met" is the crowding this row exists to remove. `dead` says "not checked" and counts
 * nothing. `empty` says nothing was asked for, which is a different fact from all-clear.
 */
function Half({ check, title, allClearText, emptyText, L, action }: {
  check: BidCardCheck;
  title: string;
  allClearText: string;
  emptyText: string;
  L: LFn;
  action?: React.ReactNode;
}) {
  const line = check.dead
    ? <span style={{ fontSize: 11, fontWeight: 700, color: "#9AA7B8" }}>{L("Not checked", "لم تُراجع")}</span>
    : check.allClear
      ? <span style={{ fontSize: 11, fontWeight: 800, color: TONE_COLOUR.good }}>✓ {allClearText}</span>
      : check.empty
        ? <span style={{ fontSize: 11, fontWeight: 700, color: "#9AA7B8" }}>{emptyText}</span>
        : (
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            {check.parts.map((p, i) => (
              <span key={`${p.tone}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 800, color: TONE_COLOUR[p.tone] }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: TONE_COLOUR[p.tone] }} />
                <span dir="ltr">{p.count}</span>
              </span>
            ))}
          </span>
        );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
      <Ring check={check} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ marginTop: 2 }}>{line}</div>
      </div>
      {action ? <div style={{ marginInlineStart: "auto", flexShrink: 0 }}>{action}</div> : null}
    </div>
  );
}

export function BidCardChecks({ equipment, terms, L, equipmentAction, termsAction }: {
  equipment: BidCardCheck;
  terms: BidCardCheck;
  L: LFn;
  /** The link into the verification map — the equipment half's one way in. */
  equipmentAction?: React.ReactNode;
  /** The terms modal opener. */
  termsAction?: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: "1px solid #EFF2F6", display: "flex", alignItems: "stretch", gap: 12, padding: "13px 16px" }}>
      <Half
        check={equipment}
        title={L("Equipment", "المعدة")}
        allClearText={L("all on file", "كل المستندات مكتملة")}
        emptyText={L("Nothing required", "لا متطلبات")}
        L={L}
        action={equipmentAction}
      />
      <span style={{ width: 1, background: "#EFF2F6", flexShrink: 0 }} />
      <Half
        check={terms}
        title={L("Terms", "الشروط")}
        allClearText={L("all matched", "الكل مطابق")}
        emptyText={L("None to review", "لا شروط للمراجعة")}
        L={L}
        action={termsAction}
      />
    </div>
  );
}
